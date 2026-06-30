import UIKit
import Social
import MobileCoreServices

/// Share Extension entry point. Pulls the shared item (link, text, or image)
/// out of the share sheet, reads the user's ingest endpoint + token from the
/// App Group (written by the main app, see ShareConfigPlugin.swift), uploads it
/// to the backend's /api/share endpoint, and shows a brief confirmation.
@objc(ShareViewController)
class ShareViewController: UIViewController {

    private static let appGroup = "group.com.morhogeg.machina"
    // Fallback endpoint if the app hasn't pushed config yet (matches firebase.json
    // rewrite of /api/share -> share_ingest).
    private static let defaultEndpoint = "https://secondbrain-app-94da2.web.app/api/share"

    // Type identifiers (avoid importing UniformTypeIdentifiers for brevity).
    private let kImage = "public.image"
    private let kURL = "public.url"
    private let kText = "public.text"
    private let kPlainText = "public.plain-text"

    private let card = UIView()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let label = UILabel()
    private var finished = false

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        handleShare()
    }

    // MARK: - UI

    private func setupUI() {
        view.backgroundColor = UIColor.black.withAlphaComponent(0.25)

        card.backgroundColor = UIColor.secondarySystemBackground
        card.layer.cornerRadius = 16
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)

        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()
        card.addSubview(spinner)

        label.text = "Saving to Machina…"
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.textColor = .label
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(label)

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.widthAnchor.constraint(equalToConstant: 240),

            spinner.topAnchor.constraint(equalTo: card.topAnchor, constant: 28),
            spinner.centerXAnchor.constraint(equalTo: card.centerXAnchor),

            label.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 16),
            label.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            label.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            label.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24),
        ])
    }

    private func showResult(_ message: String, success: Bool) {
        DispatchQueue.main.async {
            self.spinner.stopAnimating()
            self.spinner.isHidden = true
            self.label.text = message
            DispatchQueue.main.asyncAfter(deadline: .now() + (success ? 0.9 : 1.6)) {
                self.finish()
            }
        }
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    // MARK: - Extraction

    private func handleShare() {
        guard let provider = firstProvider() else {
            showResult("Nothing to save", success: false)
            return
        }

        if provider.hasItemConformingToTypeIdentifier(kImage) {
            provider.loadItem(forTypeIdentifier: kImage, options: nil) { [weak self] item, _ in
                self?.uploadImage(from: item)
            }
        } else if provider.hasItemConformingToTypeIdentifier(kURL) {
            provider.loadItem(forTypeIdentifier: kURL, options: nil) { [weak self] item, _ in
                if let url = item as? URL {
                    // A file:// URL is usually a shared file (e.g. an image) — try image.
                    if url.isFileURL, let data = try? Data(contentsOf: url) {
                        self?.upload(payload: ["image": data.base64EncodedString(),
                                               "mimeType": Self.mime(for: url)])
                    } else {
                        self?.upload(payload: ["url": url.absoluteString])
                    }
                } else if let s = item as? String {
                    self?.upload(payload: ["url": s])
                } else {
                    self?.showResult("Couldn't read the link", success: false)
                }
            }
        } else if provider.hasItemConformingToTypeIdentifier(kText)
                    || provider.hasItemConformingToTypeIdentifier(kPlainText) {
            let id = provider.hasItemConformingToTypeIdentifier(kPlainText) ? kPlainText : kText
            provider.loadItem(forTypeIdentifier: id, options: nil) { [weak self] item, _ in
                if let s = item as? String {
                    self?.upload(payload: ["text": s])
                } else {
                    self?.showResult("Couldn't read the text", success: false)
                }
            }
        } else {
            showResult("Unsupported content", success: false)
        }
    }

    /// First attachment across all input items that we can handle.
    private func firstProvider() -> NSItemProvider? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
        let wanted = [kImage, kURL, kText, kPlainText]
        // Prefer an image attachment, then url, then text.
        for type in wanted {
            for item in items {
                for provider in item.attachments ?? [] where provider.hasItemConformingToTypeIdentifier(type) {
                    return provider
                }
            }
        }
        return nil
    }

    private func uploadImage(from item: NSSecureCoding?) {
        var data: Data?
        var mime = "image/jpeg"

        if let img = item as? UIImage {
            data = img.jpegData(compressionQuality: 0.8)
        } else if let raw = item as? Data {
            // Re-encode through UIImage to normalise + shrink large screenshots.
            if let img = UIImage(data: raw), let jpeg = img.jpegData(compressionQuality: 0.8) {
                data = jpeg
            } else {
                data = raw
            }
        } else if let url = item as? URL, let raw = try? Data(contentsOf: url) {
            if let img = UIImage(data: raw), let jpeg = img.jpegData(compressionQuality: 0.8) {
                data = jpeg
            } else {
                data = raw
                mime = Self.mime(for: url)
            }
        }

        guard let imageData = data else {
            showResult("Couldn't read the image", success: false)
            return
        }
        upload(payload: ["image": imageData.base64EncodedString(), "mimeType": mime])
    }

    // MARK: - Networking

    private func upload(payload: [String: String]) {
        let defaults = UserDefaults(suiteName: Self.appGroup)
        let token = defaults?.string(forKey: "ingestToken")
        let endpoint = defaults?.string(forKey: "shareEndpoint") ?? Self.defaultEndpoint

        guard let token = token, !token.isEmpty else {
            showResult("Open Machina and sign in first", success: false)
            return
        }
        guard let url = URL(string: endpoint) else {
            showResult("Bad endpoint", success: false)
            return
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(token, forHTTPHeaderField: "X-Ingest-Token")
        req.timeoutInterval = 25
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)

        // Watchdog: never hang the share sheet open indefinitely.
        DispatchQueue.main.asyncAfter(deadline: .now() + 26) { [weak self] in
            self?.showResult("Saved to Machina", success: true)
        }

        URLSession.shared.dataTask(with: req) { [weak self] _, response, error in
            guard let self = self else { return }
            if error != nil {
                self.showResult("Network error — try again", success: false)
                return
            }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (200...299).contains(code) {
                self.showResult("Saved to Machina ✓", success: true)
            } else if code == 403 || code == 401 {
                self.showResult("Auth failed — reopen Machina", success: false)
            } else {
                self.showResult("Couldn't save (\(code))", success: false)
            }
        }.resume()
    }

    private static func mime(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "heic": return "image/heic"
        case "webp": return "image/webp"
        default: return "image/jpeg"
        }
    }
}
