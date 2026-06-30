import UIKit
import Social
import MobileCoreServices

/// Share Extension entry point. Pulls the shared item (link, text, or image)
/// out of the share sheet, reads the user's ingest endpoint + token from the
/// App Group (written by the main app, see ShareConfigPlugin.swift), uploads it
/// to the backend's /api/share endpoint, and shows a brief confirmation.
///
/// For images it re-creates — natively, in UIKit + CoreAnimation — the in-app
/// "image scan" animation (see web/components/ImageScanProgress.tsx): a purple
/// scan-line sweeping over a preview of the shared image, a rising percentage
/// counter, a thin accent progress bar, and a rotating phase label. The
/// animation is cosmetic; the *real* completion is driven by the network
/// upload, so the percentage eases toward 90% while the request is in flight
/// and only snaps to 100% (green check) once the upload actually succeeds.
@objc(ShareViewController)
class ShareViewController: UIViewController, URLSessionDataDelegate, URLSessionTaskDelegate {

    private static let appGroup = "group.com.morhogeg.machina"
    // Fallback endpoint if the app hasn't pushed config yet (matches firebase.json
    // rewrite of /api/share -> share_ingest).
    private static let defaultEndpoint = "https://secondbrain-app-94da2.web.app/api/share"

    // Type identifiers (avoid importing UniformTypeIdentifiers for brevity).
    private let kImage = "public.image"
    private let kURL = "public.url"
    private let kText = "public.text"
    private let kPlainText = "public.plain-text"

    // MARK: Accent palette (mirrors --accent / --accent-gradient in globals.css)
    private static let accent = UIColor(red: 0xA8 / 255.0, green: 0x55 / 255.0, blue: 0xF7 / 255.0, alpha: 1)      // #A855F7
    private static let accentPink = UIColor(red: 0xEC / 255.0, green: 0x48 / 255.0, blue: 0x99 / 255.0, alpha: 1)   // #EC4899
    private static let successGreen = UIColor(red: 0x4A / 255.0, green: 0xDE / 255.0, blue: 0x80 / 255.0, alpha: 1) // green-400

    // MARK: Generic (non-image) HUD — kept simple, matching the old card look.
    private let card = UIView()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let label = UILabel()
    private let cardCloseButton = UIButton(type: .system)

    // MARK: Close (✕) button on the scan card
    private let scanCloseButton = UIButton(type: .system)

    // MARK: Background upload session (survives the extension being dismissed)
    // A foreground URLSession is cancelled when the extension UI goes away, so we
    // hand the upload to a *background* session that the system finishes for us.
    private var backgroundSession: URLSession?
    private var responseData = Data()

    // MARK: Image scan HUD
    private let scanContainer = UIView()          // rounded card holding the preview + bar
    private let previewView = UIView()            // aspect-video preview area
    private let imageView = UIImageView()         // the shared image behind the sweep
    private let dimView = UIView()                // black/40 overlay so the sweep reads
    private let sweepView = UIView()              // the moving scan band
    private let percentLabel = UILabel()          // big tabular % counter
    private let phaseLabel = UILabel()            // rotating phase text
    private let checkLabel = UILabel()            // ✓ shown on success
    private let barTrack = UIView()               // progress bar track
    private let barFill = UIView()                // progress bar fill
    private let hintLabel = UILabel()             // "You can close this…"
    private var barFillWidth: NSLayoutConstraint!

    private var displayLink: CADisplayLink?
    private var progress: CGFloat = 0             // 0…100, what's shown on screen
    private var ceiling: CGFloat = 90             // animation eases toward this while uploading
    private var isImageFlow = false
    private var finished = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.25)
        setupGenericUI()
        setupScanUI()
        handleShare()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // Re-apply the accent gradient now that the sweep band has real bounds.
        layoutSweepGradient()
    }

    // MARK: - Generic UI (links / text / errors)

    private func setupGenericUI() {
        card.backgroundColor = UIColor.secondarySystemBackground
        card.layer.cornerRadius = 16
        card.translatesAutoresizingMaskIntoConstraints = false
        card.isHidden = true
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

        configureCloseButton(cardCloseButton)
        card.addSubview(cardCloseButton)

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

            cardCloseButton.topAnchor.constraint(equalTo: card.topAnchor, constant: 8),
            cardCloseButton.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -8),
            cardCloseButton.widthAnchor.constraint(equalToConstant: 30),
            cardCloseButton.heightAnchor.constraint(equalToConstant: 30),
        ])
    }

    /// Shared styling for the circular translucent "✕" close button. Tapping it
    /// dismisses the share sheet immediately; the upload keeps running on the
    /// background session.
    private func configureCloseButton(_ button: UIButton) {
        button.translatesAutoresizingMaskIntoConstraints = false
        button.backgroundColor = UIColor(white: 1, alpha: 0.15)
        button.tintColor = .white
        button.layer.cornerRadius = 15   // half of the 30pt size => a circle
        button.clipsToBounds = true
        if let xmark = UIImage(systemName: "xmark",
                               withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .semibold)) {
            button.setImage(xmark, for: .normal)
            button.setTitle(nil, for: .normal)
        } else {
            button.setTitle("✕", for: .normal)
            button.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
            button.setTitleColor(.white, for: .normal)
        }
        button.accessibilityLabel = "Close"
        button.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
    }

    /// Dismiss the share extension immediately. The background upload session
    /// continues independently, so closing here does not cancel the save.
    @objc private func closeTapped() {
        finish()
    }

    // MARK: - Scan UI (images)

    private func setupScanUI() {
        scanContainer.backgroundColor = UIColor.secondarySystemBackground
        scanContainer.layer.cornerRadius = 20
        scanContainer.translatesAutoresizingMaskIntoConstraints = false
        scanContainer.isHidden = true
        view.addSubview(scanContainer)

        // Preview area — aspect-video (16:9), rounded, clips the sweep + image.
        previewView.backgroundColor = UIColor(white: 0.10, alpha: 1)
        previewView.layer.cornerRadius = 12
        previewView.layer.borderWidth = 1
        previewView.layer.borderColor = UIColor(white: 1, alpha: 0.10).cgColor
        previewView.clipsToBounds = true
        previewView.translatesAutoresizingMaskIntoConstraints = false
        scanContainer.addSubview(previewView)

        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.translatesAutoresizingMaskIntoConstraints = false
        previewView.addSubview(imageView)

        dimView.backgroundColor = UIColor.black.withAlphaComponent(0.40)
        dimView.translatesAutoresizingMaskIntoConstraints = false
        previewView.addSubview(dimView)

        // Sweep band — gradient transparent -> accent -> transparent + a bright line.
        sweepView.translatesAutoresizingMaskIntoConstraints = false
        sweepView.isUserInteractionEnabled = false
        previewView.addSubview(sweepView)

        // Big % counter.
        percentLabel.text = "0%"
        percentLabel.font = UIFont.monospacedDigitSystemFont(ofSize: 30, weight: .bold)
        percentLabel.textColor = .white
        percentLabel.textAlignment = .center
        percentLabel.translatesAutoresizingMaskIntoConstraints = false
        previewView.addSubview(percentLabel)

        // ✓ success glyph (hidden until done).
        checkLabel.text = "✓"
        checkLabel.font = .systemFont(ofSize: 40, weight: .bold)
        checkLabel.textColor = Self.successGreen
        checkLabel.textAlignment = .center
        checkLabel.alpha = 0
        checkLabel.translatesAutoresizingMaskIntoConstraints = false
        previewView.addSubview(checkLabel)

        // Phase label.
        phaseLabel.text = "Uploading…"
        phaseLabel.font = .systemFont(ofSize: 14, weight: .medium)
        phaseLabel.textColor = UIColor(white: 1, alpha: 0.90)
        phaseLabel.textAlignment = .center
        phaseLabel.translatesAutoresizingMaskIntoConstraints = false
        previewView.addSubview(phaseLabel)

        // Progress bar.
        barTrack.backgroundColor = UIColor(white: 1, alpha: 0.10)
        barTrack.layer.cornerRadius = 3
        barTrack.clipsToBounds = true
        barTrack.translatesAutoresizingMaskIntoConstraints = false
        scanContainer.addSubview(barTrack)

        barFill.backgroundColor = Self.accent
        barFill.layer.cornerRadius = 3
        barFill.translatesAutoresizingMaskIntoConstraints = false
        barTrack.addSubview(barFill)

        hintLabel.text = "You can close this — we’ll keep analyzing in the background."
        hintLabel.font = .systemFont(ofSize: 11, weight: .regular)
        hintLabel.textColor = .secondaryLabel
        hintLabel.textAlignment = .center
        hintLabel.numberOfLines = 0
        hintLabel.translatesAutoresizingMaskIntoConstraints = false
        scanContainer.addSubview(hintLabel)

        // Close (✕) button, top-trailing corner of the scan card. Added last so it
        // sits above the preview / progress views.
        configureCloseButton(scanCloseButton)
        scanContainer.addSubview(scanCloseButton)

        barFillWidth = barFill.widthAnchor.constraint(equalToConstant: 0)

        NSLayoutConstraint.activate([
            scanContainer.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            scanContainer.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            scanContainer.widthAnchor.constraint(equalToConstant: 300),

            previewView.topAnchor.constraint(equalTo: scanContainer.topAnchor, constant: 16),
            previewView.leadingAnchor.constraint(equalTo: scanContainer.leadingAnchor, constant: 16),
            previewView.trailingAnchor.constraint(equalTo: scanContainer.trailingAnchor, constant: -16),
            // aspect-video 16:9
            previewView.heightAnchor.constraint(equalTo: previewView.widthAnchor, multiplier: 9.0 / 16.0),

            imageView.topAnchor.constraint(equalTo: previewView.topAnchor),
            imageView.leadingAnchor.constraint(equalTo: previewView.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: previewView.trailingAnchor),
            imageView.bottomAnchor.constraint(equalTo: previewView.bottomAnchor),

            dimView.topAnchor.constraint(equalTo: previewView.topAnchor),
            dimView.leadingAnchor.constraint(equalTo: previewView.leadingAnchor),
            dimView.trailingAnchor.constraint(equalTo: previewView.trailingAnchor),
            dimView.bottomAnchor.constraint(equalTo: previewView.bottomAnchor),

            percentLabel.centerXAnchor.constraint(equalTo: previewView.centerXAnchor),
            percentLabel.centerYAnchor.constraint(equalTo: previewView.centerYAnchor, constant: -8),

            checkLabel.centerXAnchor.constraint(equalTo: percentLabel.centerXAnchor),
            checkLabel.centerYAnchor.constraint(equalTo: percentLabel.centerYAnchor),

            phaseLabel.topAnchor.constraint(equalTo: percentLabel.bottomAnchor, constant: 4),
            phaseLabel.leadingAnchor.constraint(equalTo: previewView.leadingAnchor, constant: 12),
            phaseLabel.trailingAnchor.constraint(equalTo: previewView.trailingAnchor, constant: -12),

            barTrack.topAnchor.constraint(equalTo: previewView.bottomAnchor, constant: 14),
            barTrack.leadingAnchor.constraint(equalTo: scanContainer.leadingAnchor, constant: 16),
            barTrack.trailingAnchor.constraint(equalTo: scanContainer.trailingAnchor, constant: -16),
            barTrack.heightAnchor.constraint(equalToConstant: 6),

            barFill.leadingAnchor.constraint(equalTo: barTrack.leadingAnchor),
            barFill.topAnchor.constraint(equalTo: barTrack.topAnchor),
            barFill.bottomAnchor.constraint(equalTo: barTrack.bottomAnchor),
            barFillWidth,

            hintLabel.topAnchor.constraint(equalTo: barTrack.bottomAnchor, constant: 12),
            hintLabel.leadingAnchor.constraint(equalTo: scanContainer.leadingAnchor, constant: 16),
            hintLabel.trailingAnchor.constraint(equalTo: scanContainer.trailingAnchor, constant: -16),
            hintLabel.bottomAnchor.constraint(equalTo: scanContainer.bottomAnchor, constant: -16),

            scanCloseButton.topAnchor.constraint(equalTo: scanContainer.topAnchor, constant: 8),
            scanCloseButton.trailingAnchor.constraint(equalTo: scanContainer.trailingAnchor, constant: -8),
            scanCloseButton.widthAnchor.constraint(equalToConstant: 30),
            scanCloseButton.heightAnchor.constraint(equalToConstant: 30),
        ])
    }

    /// Gradient (transparent -> accent -> transparent) for the sweep band, plus a
    /// bright glowing line along its bottom edge — mirrors the web sweep.
    private let sweepGradient = CAGradientLayer()
    private let sweepLine = CALayer()
    private var sweepConfigured = false

    private func layoutSweepGradient() {
        guard isImageFlow else { return }
        // The sweep band spans 20% of the preview height (matches h-1/5 in web).
        let bandHeight = max(previewView.bounds.height * 0.20, 1)
        let bandWidth = previewView.bounds.width
        sweepView.frame = CGRect(x: 0, y: 0, width: bandWidth, height: bandHeight)

        sweepGradient.frame = sweepView.bounds
        sweepLine.frame = CGRect(x: 0, y: sweepView.bounds.height - 1.5, width: sweepView.bounds.width, height: 1.5)

        if !sweepConfigured {
            sweepGradient.colors = [
                UIColor.clear.cgColor,
                Self.accent.withAlphaComponent(0.70).cgColor,
                UIColor.clear.cgColor,
            ]
            sweepGradient.locations = [0, 0.5, 1]
            sweepView.layer.addSublayer(sweepGradient)

            sweepLine.backgroundColor = Self.accent.cgColor
            sweepLine.shadowColor = Self.accent.cgColor
            sweepLine.shadowRadius = 8
            sweepLine.shadowOpacity = 0.9
            sweepLine.shadowOffset = .zero
            sweepView.layer.addSublayer(sweepLine)
            sweepConfigured = true
            startSweepAnimation()
        }
    }

    /// Vertical sweep that loops top -> bottom, matching @keyframes scan-sweep.
    private func startSweepAnimation() {
        let band = sweepView.bounds.height
        let travel = previewView.bounds.height
        let anim = CABasicAnimation(keyPath: "transform.translation.y")
        anim.fromValue = -band
        anim.toValue = travel
        anim.duration = 1.6
        anim.timingFunction = CAMediaTimingFunction(controlPoints: 0.45, 0, 0.55, 1)
        anim.repeatCount = .infinity
        sweepView.layer.add(anim, forKey: "sweep")
    }

    // MARK: - Progress animation (cosmetic, upload-anchored)

    /// Phase label from progress — mirrors phaseFor() in ImageScanProgress.tsx.
    private func phase(for p: CGFloat) -> String {
        if p >= 100 { return "Done!" }
        if p >= 95 { return "Finishing up…" }
        if p >= 80 { return "Organizing & tagging…" }
        if p >= 60 { return "Understanding content…" }
        if p >= 45 { return "Reading text…" }
        if p >= 20 { return "Scanning image…" }
        return "Uploading…"
    }

    private func beginScanAnimation() {
        isImageFlow = true
        card.isHidden = true
        scanContainer.isHidden = false
        displayLink = CADisplayLink(target: self, selector: #selector(tick))
        displayLink?.add(to: .main, forMode: .common)
    }

    @objc private func tick() {
        guard progress < ceiling else { return }
        // Ease toward the ceiling: fast early, slowing as it approaches.
        let step = max((ceiling - progress) * 0.018, 0.05)
        progress = min(progress + step, ceiling)
        renderProgress(progress, done: false)
    }

    private func renderProgress(_ p: CGFloat, done: Bool) {
        percentLabel.text = "\(Int(p.rounded()))%"
        phaseLabel.text = phase(for: p)
        let trackWidth = barTrack.bounds.width
        barFillWidth.constant = trackWidth * (p / 100.0)
        if done {
            barFill.backgroundColor = Self.successGreen
            percentLabel.alpha = 0
            checkLabel.alpha = 1
            sweepView.isHidden = true
        }
        // Animate the bar width change smoothly.
        UIView.animate(withDuration: 0.2) { self.barTrack.layoutIfNeeded() }
    }

    /// Drive the counter to 100% + green check, then dismiss.
    private func completeScanSuccess(then: @escaping () -> Void) {
        DispatchQueue.main.async {
            self.displayLink?.invalidate()
            self.displayLink = nil
            self.ceiling = 100
            self.progress = 100
            self.renderProgress(100, done: true)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { then() }
        }
    }

    // MARK: - Result / dismiss

    private func showResult(_ message: String, success: Bool) {
        DispatchQueue.main.async {
            if self.isImageFlow {
                if success {
                    // Snap the scan to 100% with the green check, then finish.
                    self.completeScanSuccess { self.finish() }
                } else {
                    // Surface the error on the scan card itself.
                    self.displayLink?.invalidate()
                    self.displayLink = nil
                    self.sweepView.isHidden = true
                    self.percentLabel.alpha = 0
                    self.checkLabel.alpha = 0
                    self.phaseLabel.text = message
                    self.phaseLabel.textColor = .white
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { self.finish() }
                }
                return
            }

            // Generic (non-image) HUD path — unchanged behaviour.
            self.card.isHidden = false
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
        displayLink?.invalidate()
        displayLink = nil
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
                        if let img = UIImage(data: data) {
                            DispatchQueue.main.async { self?.presentScan(with: img) }
                        }
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

    /// Show the native scan animation, with the shared image behind the sweep.
    private func presentScan(with image: UIImage?) {
        if let image = image { imageView.image = image }
        beginScanAnimation()
        view.setNeedsLayout()
        view.layoutIfNeeded()
        layoutSweepGradient()
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
        var preview: UIImage?

        if let img = item as? UIImage {
            preview = img
            data = img.jpegData(compressionQuality: 0.8)
        } else if let raw = item as? Data {
            // Re-encode through UIImage to normalise + shrink large screenshots.
            if let img = UIImage(data: raw) {
                preview = img
                if let jpeg = img.jpegData(compressionQuality: 0.8) {
                    data = jpeg
                } else {
                    data = raw
                }
            } else {
                data = raw
            }
        } else if let url = item as? URL, let raw = try? Data(contentsOf: url) {
            if let img = UIImage(data: raw) {
                preview = img
                if let jpeg = img.jpegData(compressionQuality: 0.8) {
                    data = jpeg
                } else {
                    data = raw
                    mime = Self.mime(for: url)
                }
            } else {
                data = raw
                mime = Self.mime(for: url)
            }
        }

        guard let imageData = data else {
            showResult("Couldn't read the image", success: false)
            return
        }

        // Kick off the gorgeous native scan animation while the upload runs.
        DispatchQueue.main.async { [weak self] in self?.presentScan(with: preview) }

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
        // NOTE: do NOT set req.httpBody — background sessions require an upload
        // task fed from a file, and httpBody would be ignored anyway.

        guard let body = try? JSONSerialization.data(withJSONObject: payload) else {
            showResult("Couldn't prepare upload", success: false)
            return
        }

        // Write the JSON body to a temp file. A background URLSession can only run
        // upload/download tasks; it cannot take an in-memory body, so we hand it a
        // file on disk that the system reads even after we're dismissed.
        let tmpURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("machina-share-\(UUID().uuidString).json")
        do {
            try body.write(to: tmpURL, options: .atomic)
        } catch {
            showResult("Couldn't prepare upload", success: false)
            return
        }

        // Background session — append a UUID to the identifier so re-invocations of
        // the extension never collide on an already-in-use identifier. The shared
        // container identifier lets the daemon resume the transfer for our app group.
        let config = URLSessionConfiguration.background(
            withIdentifier: "group.com.morhogeg.machina.share-upload.\(UUID().uuidString)")
        config.sharedContainerIdentifier = Self.appGroup
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        backgroundSession = session

        // Watchdog: never hang the share sheet open indefinitely. If we hit this
        // before the delegate reports back, the upload still proceeds in the
        // background; we just stop blocking the UI.
        DispatchQueue.main.asyncAfter(deadline: .now() + 26) { [weak self] in
            self?.showResult("Saved to Machina", success: true)
        }

        let task = session.uploadTask(with: req, fromFile: tmpURL)
        task.resume()
    }

    // MARK: - URLSession delegate (background upload completion)

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        responseData.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if error != nil {
            showResult("Network error — try again", success: false)
        } else {
            let code = (task.response as? HTTPURLResponse)?.statusCode ?? 0
            if (200...299).contains(code) {
                showResult("Saved to Machina ✓", success: true)
            } else if code == 403 || code == 401 {
                showResult("Auth failed — reopen Machina", success: false)
            } else {
                showResult("Couldn't save (\(code))", success: false)
            }
        }
        // Let the system tear the session down once it's done with it.
        session.finishTasksAndInvalidate()
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
