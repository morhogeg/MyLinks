import Foundation
import Capacitor
import PhotosUI
import UniformTypeIdentifiers
import ImageIO

/// The system photo picker with a hard selection cap. The WebView's
/// `<input type="file" multiple>` opens the same picker but with NO limit (HTML
/// has no way to ask for one), so a user could tick 8 photos and the app then
/// silently kept 5. PHPickerViewController's `selectionLimit` makes iOS itself
/// stop at the cap ("Select up to N", the rest grey out), the way Messages and
/// other apps behave. PHPicker runs out of process: no photo-library permission
/// prompt and no usage string needed.
///
/// Each pick is downsampled (ImageIO thumbnail path, never the full bitmap) and
/// written to a temp JPEG; JS reads the files through `convertFileSrc` instead of
/// pulling five base64 blobs across the bridge.
///
/// JS side: registerPlugin('PhotoPicker').pick({ limit }) (see
/// web/lib/photoPicker.ts). Resolves `{ files: [{ path, name }], failed }` in the
/// order the user tapped; a cancel resolves `{ files: [], failed: 0 }`.
@objc(PhotoPickerPlugin)
public class PhotoPickerPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
    public let identifier = "PhotoPickerPlugin"
    public let jsName = "PhotoPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise)
    ]

    /// Mirrors MAX_CARD_IMAGES in functions/main.py: a caller can never ask
    /// for more than one card holds.
    private static let maxLimit = 5
    /// Longest edge of each written JPEG. Above lib/image.ts's 1600px so the
    /// web-side compression still has real pixels to work from.
    private static let maxPixel: CGFloat = 2048

    private var pendingCall: CAPPluginCall?

    private static var pickDir: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("machina-picks", isDirectory: true)
    }

    @objc func pick(_ call: CAPPluginCall) {
        let limit = min(max(call.getInt("limit") ?? Self.maxLimit, 0), Self.maxLimit)
        guard limit > 0 else {
            call.resolve(["files": [], "failed": 0])
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let presenter = self.bridge?.viewController else {
                call.reject("No view controller to present the picker from")
                return
            }
            // One picker at a time: a second tap while one is open is dropped.
            guard self.pendingCall == nil else {
                call.reject("A photo picker is already open")
                return
            }
            // Last pick's files were read into Blobs by JS long ago.
            try? FileManager.default.removeItem(at: Self.pickDir)

            var config = PHPickerConfiguration()
            config.filter = .images
            config.selectionLimit = limit
            // Numbered badges in tap order: the order the card will read them.
            config.selection = .ordered
            // No transcoding round-trip: ImageIO reads HEIC directly.
            config.preferredAssetRepresentationMode = .current

            let picker = PHPickerViewController(configuration: config)
            picker.delegate = self
            picker.presentationController?.delegate = self
            self.pendingCall = call
            presenter.present(picker, animated: true)
        }
    }

    // MARK: PHPickerViewControllerDelegate

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pendingCall else { return }
        pendingCall = nil
        // The picker enforces the cap; this is only a backstop.
        let chosen = Array(results.prefix(Self.maxLimit))
        guard !chosen.isEmpty else {
            call.resolve(["files": [], "failed": 0])
            return
        }
        try? FileManager.default.createDirectory(at: Self.pickDir, withIntermediateDirectories: true)

        var paths = [String?](repeating: nil, count: chosen.count)
        let group = DispatchGroup()
        for (index, result) in chosen.enumerated() {
            group.enter()
            Self.writeJPEG(from: result.itemProvider) { url in
                // Each slot is written by exactly one callback; the group's
                // notify reads them all after the last one lands.
                DispatchQueue.main.async {
                    paths[index] = url?.path
                    group.leave()
                }
            }
        }
        group.notify(queue: .main) {
            let files: [[String: String]] = paths.compactMap { $0 }.map { path in
                ["path": path, "name": (path as NSString).lastPathComponent]
            }
            call.resolve(["files": files, "failed": chosen.count - files.count])
        }
    }

    // MARK: UIAdaptivePresentationControllerDelegate

    /// Swipe-down dismiss: resolve as a cancel so the JS promise never hangs.
    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        call.resolve(["files": [], "failed": 0])
    }

    // MARK: Loading

    /// Downsample one picked item to a temp JPEG. The file URL the provider
    /// hands over is only valid inside its callback, so the thumbnail is made
    /// there; the data path is the fallback for providers without a file.
    private static func writeJPEG(from provider: NSItemProvider, completion: @escaping (URL?) -> Void) {
        let type = UTType.image.identifier
        guard provider.hasItemConformingToTypeIdentifier(type) else {
            completion(nil)
            return
        }
        provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
            if let url = url,
               let src = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
               let jpeg = thumbnailJPEG(from: src) {
                completion(save(jpeg))
                return
            }
            provider.loadDataRepresentation(forTypeIdentifier: type) { data, _ in
                guard let data = data,
                      let src = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
                      let jpeg = thumbnailJPEG(from: src) else {
                    completion(nil)
                    return
                }
                completion(save(jpeg))
            }
        }
    }

    /// Same thumbnail recipe as ShareViewController.thumbnailJPEG: decode
    /// straight to the target size, EXIF orientation applied.
    private static func thumbnailJPEG(from src: CGImageSource) -> Data? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        guard let thumb = CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: thumb).jpegData(compressionQuality: 0.85)
    }

    private static func save(_ jpeg: Data) -> URL? {
        let url = pickDir.appendingPathComponent("\(UUID().uuidString).jpg")
        return (try? jpeg.write(to: url, options: .atomic)) != nil ? url : nil
    }
}
