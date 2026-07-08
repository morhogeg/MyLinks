import UIKit
import Social
import MobileCoreServices
import ImageIO
import UserNotifications

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

    // MARK: Link scan HUD (mirrors web/components/LinkScanProgress.tsx)
    // A faux page preview — favicon + host + skeleton lines — shown behind the
    // dim + sweep when the user shares a link/text instead of an image, so links
    // get the same polished "reading…" treatment images already get.
    private let linkPreview = UIView()            // faux page container
    private let faviconView = UIImageView()       // site favicon (or globe fallback)
    private let hostLabel = UILabel()             // the link's host
    private let linkGlyph = UIImageView()         // link icon above the % counter
    private var faviconTask: URLSessionDataTask?

    private var displayLink: CADisplayLink?
    private var progress: CGFloat = 0             // 0…100, what's shown on screen
    private var ceiling: CGFloat = 90             // animation eases toward this while uploading
    private var isImageFlow = false
    private var isLinkFlow = false
    private var finished = false
    private var resultShown = false

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

    /// Throttled: keep the App-Group hand-off flag in step with the HUD so that
    /// whenever the user next opens Machina from the Home Screen, the in-app banner
    /// resumes at this exact %.
    private var lastHintPct = -1
    private func syncProgressHint() {
        let pct = Int(progress.rounded())
        guard pct != lastHintPct else { return }
        lastHintPct = pct
        writePendingShareHint()
    }

    /// Stamp a short-lived "a capture was just shared" flag in the shared App
    /// Group. `ShareConfigPlugin.consumePendingShare` reads + clears it on the app
    /// side to seed the optimistic banner.
    private func writePendingShareHint() {
        guard let defaults = UserDefaults(suiteName: Self.appGroup) else { return }
        defaults.set(Date().timeIntervalSince1970, forKey: "pendingShareAt")
        defaults.set(isImageFlow ? "image" : "link", forKey: "pendingShareKind")
        // Hand off the EXACT percentage the HUD is showing right now, so the
        // in-app banner picks up from the same value instead of restarting near
        // zero — the user sees one continuous progress across the two screens.
        defaults.set(Double(progress), forKey: "pendingShareProgress")
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

        // Link icon, shown above the % counter in link mode (mirrors the web
        // link loader). Hidden in image mode.
        linkGlyph.image = UIImage(systemName: "link",
                                  withConfiguration: UIImage.SymbolConfiguration(pointSize: 22, weight: .semibold))
        linkGlyph.tintColor = Self.accent
        linkGlyph.contentMode = .center
        linkGlyph.isHidden = true
        linkGlyph.translatesAutoresizingMaskIntoConstraints = false
        previewView.addSubview(linkGlyph)

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

            linkGlyph.centerXAnchor.constraint(equalTo: percentLabel.centerXAnchor),
            linkGlyph.bottomAnchor.constraint(equalTo: percentLabel.topAnchor, constant: -2),

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
            // The hint is now the bottom-most element (the "Open Machina" button was
            // removed — iOS won't let an extension launch the app), so it pins the card.
            hintLabel.bottomAnchor.constraint(equalTo: scanContainer.bottomAnchor, constant: -16),

            scanCloseButton.topAnchor.constraint(equalTo: scanContainer.topAnchor, constant: 8),
            scanCloseButton.trailingAnchor.constraint(equalTo: scanContainer.trailingAnchor, constant: -8),
            scanCloseButton.widthAnchor.constraint(equalToConstant: 30),
            scanCloseButton.heightAnchor.constraint(equalToConstant: 30),
        ])

        setupLinkPreview()
    }

    /// Builds the faux-page preview (favicon + host + skeleton lines) that sits
    /// behind the dim + sweep in link mode. Mirrors the skeleton page in
    /// web/components/LinkScanProgress.tsx.
    private func setupLinkPreview() {
        linkPreview.backgroundColor = UIColor(white: 0.10, alpha: 1)
        linkPreview.isHidden = true
        linkPreview.translatesAutoresizingMaskIntoConstraints = false
        // Behind the dim overlay so the scan line and status still read clearly.
        previewView.insertSubview(linkPreview, aboveSubview: imageView)

        faviconView.contentMode = .scaleAspectFit
        faviconView.layer.cornerRadius = 4
        faviconView.clipsToBounds = true
        faviconView.tintColor = UIColor(white: 1, alpha: 0.6)
        faviconView.translatesAutoresizingMaskIntoConstraints = false
        linkPreview.addSubview(faviconView)

        hostLabel.font = .systemFont(ofSize: 12, weight: .medium)
        hostLabel.textColor = UIColor(white: 1, alpha: 0.75)
        hostLabel.lineBreakMode = .byTruncatingTail
        hostLabel.translatesAutoresizingMaskIntoConstraints = false
        linkPreview.addSubview(hostLabel)

        // Skeleton: a title line, then body lines of decreasing width.
        let title = skeletonLine(alpha: 0.10)
        let b1 = skeletonLine(alpha: 0.06)
        let b2 = skeletonLine(alpha: 0.06)
        let b3 = skeletonLine(alpha: 0.06)
        [title, b1, b2, b3].forEach { linkPreview.addSubview($0) }

        NSLayoutConstraint.activate([
            linkPreview.topAnchor.constraint(equalTo: previewView.topAnchor),
            linkPreview.leadingAnchor.constraint(equalTo: previewView.leadingAnchor),
            linkPreview.trailingAnchor.constraint(equalTo: previewView.trailingAnchor),
            linkPreview.bottomAnchor.constraint(equalTo: previewView.bottomAnchor),

            faviconView.topAnchor.constraint(equalTo: linkPreview.topAnchor, constant: 14),
            faviconView.leadingAnchor.constraint(equalTo: linkPreview.leadingAnchor, constant: 14),
            faviconView.widthAnchor.constraint(equalToConstant: 18),
            faviconView.heightAnchor.constraint(equalToConstant: 18),

            hostLabel.centerYAnchor.constraint(equalTo: faviconView.centerYAnchor),
            hostLabel.leadingAnchor.constraint(equalTo: faviconView.trailingAnchor, constant: 8),
            hostLabel.trailingAnchor.constraint(lessThanOrEqualTo: linkPreview.trailingAnchor, constant: -14),

            title.topAnchor.constraint(equalTo: faviconView.bottomAnchor, constant: 12),
            title.leadingAnchor.constraint(equalTo: linkPreview.leadingAnchor, constant: 14),
            title.heightAnchor.constraint(equalToConstant: 9),
            title.widthAnchor.constraint(equalTo: linkPreview.widthAnchor, multiplier: 0.62),

            b1.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 10),
            b1.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            b1.heightAnchor.constraint(equalToConstant: 6),
            b1.widthAnchor.constraint(equalTo: linkPreview.widthAnchor, multiplier: 0.82),

            b2.topAnchor.constraint(equalTo: b1.bottomAnchor, constant: 7),
            b2.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            b2.heightAnchor.constraint(equalToConstant: 6),
            b2.widthAnchor.constraint(equalTo: linkPreview.widthAnchor, multiplier: 0.70),

            b3.topAnchor.constraint(equalTo: b2.bottomAnchor, constant: 7),
            b3.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            b3.heightAnchor.constraint(equalToConstant: 6),
            b3.widthAnchor.constraint(equalTo: linkPreview.widthAnchor, multiplier: 0.50),
        ])
    }

    private func skeletonLine(alpha: CGFloat) -> UIView {
        let v = UIView()
        v.backgroundColor = UIColor(white: 1, alpha: alpha)
        v.layer.cornerRadius = 3
        v.translatesAutoresizingMaskIntoConstraints = false
        return v
    }

    /// Gradient (transparent -> accent -> transparent) for the sweep band, plus a
    /// bright glowing line along its bottom edge — mirrors the web sweep.
    private let sweepGradient = CAGradientLayer()
    private let sweepLine = CALayer()
    private var sweepConfigured = false

    private func layoutSweepGradient() {
        guard isImageFlow || isLinkFlow else { return }
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

    /// Phase label from progress — mirrors phaseFor() in the matching web loader
    /// (LinkScanProgress.tsx for links, ImageScanProgress.tsx for images).
    private func phase(for p: CGFloat) -> String {
        if p >= 100 { return "Done!" }
        if isLinkFlow {
            if p >= 92 { return "Organizing & tagging…" }
            if p >= 72 { return "Writing the summary…" }
            if p >= 50 { return "Understanding the content…" }
            if p >= 25 { return "Reading the page…" }
            return "Fetching the link…"
        }
        if p >= 95 { return "Finishing up…" }
        if p >= 80 { return "Organizing & tagging…" }
        if p >= 60 { return "Understanding content…" }
        if p >= 45 { return "Reading text…" }
        if p >= 20 { return "Scanning image…" }
        return "Uploading…"
    }

    /// Reveal the scan HUD and start the cosmetic progress animation. The caller
    /// sets isImageFlow / isLinkFlow (and the matching preview) before calling.
    private func beginScanAnimation() {
        card.isHidden = true
        scanContainer.isHidden = false
        // Seed the hand-off flag immediately so opening Machina even a beat later
        // resumes from the start rather than a blank banner.
        writePendingShareHint()
        displayLink = CADisplayLink(target: self, selector: #selector(tick))
        displayLink?.add(to: .main, forMode: .common)
    }

    @objc private func tick() {
        guard progress < ceiling else { return }
        // Ease toward the ceiling: fast early, slowing as it approaches.
        let step = max((ceiling - progress) * 0.018, 0.05)
        progress = min(progress + step, ceiling)
        renderProgress(progress, done: false)
        syncProgressHint()
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
            linkGlyph.alpha = 0
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

    /// Present the outcome of the save.
    ///
    /// - success == true  → the server acknowledged (2xx). Only here do we ever
    ///   show the green check.
    /// - neutral == true  → we genuinely don't know the outcome yet (the watchdog
    ///   fired, or the request timed out while the background upload keeps going).
    ///   We must NOT claim success OR a hard failure — show a calm "still saving"
    ///   terminal state and leave the ✕ as the escape hatch (no auto-dismiss).
    /// - otherwise         → a real, terminal failure (auth/HTTP/parse error).
    private func showResult(_ message: String, success: Bool, neutral: Bool = false) {
        DispatchQueue.main.async {
            // Idempotency guard: a real network response and the watchdog can both
            // call this. Whichever lands first owns the UI; later calls are dropped
            // so we never flip a shown error into a (false) success or vice-versa.
            guard !self.resultShown else { return }
            self.resultShown = true

            if self.isImageFlow || self.isLinkFlow {
                if success {
                    // Snap the scan to 100% with the green check, then finish.
                    self.completeScanSuccess { self.finish() }
                } else {
                    // Stop the cosmetic scan and surface the message on the card.
                    self.displayLink?.invalidate()
                    self.displayLink = nil
                    self.sweepView.isHidden = true
                    self.percentLabel.alpha = 0
                    self.checkLabel.alpha = 0
                    self.linkGlyph.alpha = 0
                    self.phaseLabel.text = message
                    self.phaseLabel.textColor = .white
                    if neutral {
                        // Neutral terminal state: the save may still be finishing on
                        // the background session. Keep the card up with the ✕ close
                        // affordance instead of auto-dismissing, and never a check.
                        self.hintLabel.text = "The save is still finishing — you can close this."
                    } else {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { self.finish() }
                    }
                }
                return
            }

            // Generic (non-image) HUD path.
            self.card.isHidden = false
            self.label.text = message
            if neutral {
                // Keep a subtle spinner going to signal the background upload is
                // still in flight; the ✕ dismisses. No auto-finish, no false check.
                self.spinner.startAnimating()
                self.spinner.isHidden = false
            } else {
                self.spinner.stopAnimating()
                self.spinner.isHidden = true
                DispatchQueue.main.asyncAfter(deadline: .now() + (success ? 0.9 : 1.6)) {
                    self.finish()
                }
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
                        // Downsample before base64 to stay under the ~120MB
                        // extension memory cap (48MP HEIC → jetsam otherwise).
                        // Fall back to the original bytes if downsampling fails.
                        let small = self?.downsampledJPEG(from: data)
                        let outData = small ?? data
                        let outMime = small != nil ? "image/jpeg" : Self.mime(for: url)
                        if let img = UIImage(data: outData) {
                            DispatchQueue.main.async { self?.presentScan(with: img) }
                        }
                        self?.upload(payload: ["image": outData.base64EncodedString(),
                                               "mimeType": outMime])
                    } else {
                        DispatchQueue.main.async { self?.presentLinkScan(urlString: url.absoluteString) }
                        self?.upload(payload: ["url": url.absoluteString])
                    }
                } else if let s = item as? String {
                    DispatchQueue.main.async { self?.presentLinkScan(urlString: s) }
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
                    DispatchQueue.main.async { self?.presentLinkScan(urlString: s) }
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
        guard !isImageFlow, !isLinkFlow else { return }
        isImageFlow = true
        if let image = image { imageView.image = image }
        beginScanAnimation()
        view.setNeedsLayout()
        view.layoutIfNeeded()
        layoutSweepGradient()
    }

    /// Show the native scan animation for a shared link/text: a faux page preview
    /// (favicon + host + skeleton) behind the sweep, mirroring LinkScanProgress.tsx.
    private func presentLinkScan(urlString: String?) {
        guard !isImageFlow, !isLinkFlow else { return }
        isLinkFlow = true
        let host = urlString.flatMap { Self.host(from: $0) }
        hostLabel.text = host ?? "Saving link…"
        setGlobeFavicon()
        imageView.isHidden = true
        linkPreview.isHidden = false
        dimView.backgroundColor = UIColor.black.withAlphaComponent(0.50)
        linkGlyph.isHidden = false
        beginScanAnimation()
        view.setNeedsLayout()
        view.layoutIfNeeded()
        layoutSweepGradient()
        if let host = host { loadFavicon(host: host) }
    }

    /// Load the site favicon for the host (best-effort, cosmetic). Fetches the
    /// site's OWN /favicon.ico directly rather than proxying through Google's
    /// s2/favicons service — the latter would leak every shared link's hostname
    /// to a third party, contradicting the extension's privacy manifest ("no
    /// third-party data collection"). Falls back to a globe glyph on any failure.
    private func loadFavicon(host: String) {
        guard let url = URL(string: "https://\(host)/favicon.ico") else {
            setGlobeFavicon(); return
        }
        var req = URLRequest(url: url)
        req.timeoutInterval = 6
        faviconTask = URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
            guard let self = self else { return }
            DispatchQueue.main.async {
                if let data = data, let img = UIImage(data: data), img.size.width > 1 {
                    self.faviconView.image = img
                } else {
                    self.setGlobeFavicon()
                }
            }
        }
        faviconTask?.resume()
    }

    private func setGlobeFavicon() {
        faviconView.image = UIImage(systemName: "globe")
        faviconView.tintColor = UIColor(white: 1, alpha: 0.6)
    }

    /// The display host for a shared link or a URL embedded in shared text,
    /// stripped of a leading "www." — mirrors hostOf() in LinkScanProgress.tsx.
    private static func host(from urlString: String) -> String? {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        // Pull the first URL out of free text (e.g. "look at this https://x.com/…").
        if let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) {
            let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
            if let match = detector.firstMatch(in: trimmed, options: [], range: range),
               let host = match.url?.host {
                return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
            }
        }
        let normalized = trimmed.lowercased().hasPrefix("http") ? trimmed : "https://\(trimmed)"
        guard let host = URL(string: normalized)?.host else { return nil }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
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

    /// Downsample image bytes to a bounded pixel size and JPEG-encode, WITHOUT
    /// ever allocating the full-resolution bitmap. `UIImage(data:)` on a 48MP
    /// HEIC decodes a ~200MB ARGB bitmap; base64-ing that into an in-memory JSON
    /// body blows past the ~120MB extension memory cap → jetsam. ImageIO's
    /// thumbnail path decodes straight to the target size instead. Returns nil if
    /// the bytes aren't a decodable image (callers fall back to the original).
    private func downsampledJPEG(from data: Data, maxPixel: CGFloat = 2048, quality: CGFloat = 0.8) -> Data? {
        let srcOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let src = CGImageSourceCreateWithData(data as CFData, srcOptions) else { return nil }
        let thumbOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        guard let cgThumb = CGImageSourceCreateThumbnailAtIndex(src, 0, thumbOptions as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgThumb).jpegData(compressionQuality: quality)
    }

    private func uploadImage(from item: NSSecureCoding?) {
        var data: Data?
        var mime = "image/jpeg"
        var preview: UIImage?

        if let img = item as? UIImage {
            preview = img
            // Downsample via the encoded bytes when possible; fall back to a
            // direct JPEG encode of the (already in-memory) UIImage.
            if let raw = img.jpegData(compressionQuality: 1.0),
               let small = downsampledJPEG(from: raw) {
                data = small
            } else {
                data = img.jpegData(compressionQuality: 0.8)
            }
        } else if let raw = item as? Data {
            // Downsample straight from the source bytes (no full-res bitmap).
            if let small = downsampledJPEG(from: raw) {
                data = small
                preview = UIImage(data: small)
            } else {
                data = raw
                preview = UIImage(data: raw)
            }
        } else if let url = item as? URL, let raw = try? Data(contentsOf: url) {
            if let small = downsampledJPEG(from: raw) {
                data = small
                preview = UIImage(data: small)
            } else {
                data = raw
                preview = UIImage(data: raw)
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
            showResult("Open the Machina app and sign in first", success: false)
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
        // Client request timeout sits UNDER the watchdog (below) so a slow save
        // resolves to the neutral "still saving" state (see didCompleteWithError)
        // rather than racing the watchdog — never a false success, never a false
        // hard failure.
        req.timeoutInterval = 22
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
        // container identifier lets the daemon resume the transfer for our app group,
        // so the save completes even after the user taps ✕ to dismiss the HUD.
        let config = URLSessionConfiguration.background(
            withIdentifier: "group.com.morhogeg.machina.share-upload.\(UUID().uuidString)")
        config.sharedContainerIdentifier = Self.appGroup
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        backgroundSession = session

        // Watchdog: never hang the share sheet open indefinitely, and never lie.
        // Fires ~4s after the 22s request timeout, so a real 2xx/ack almost always
        // lands first and owns the UI via the resultShown guard. If nothing has
        // resolved by now we genuinely don't know the outcome — the background
        // upload is still in flight — so we show a NEUTRAL terminal state (never a
        // green check) with the ✕ escape hatch, not a false "Saved ✓".
        DispatchQueue.main.asyncAfter(deadline: .now() + 26) { [weak self] in
            self?.showResult("Still saving — open Machina to confirm", success: false, neutral: true)
        }

        let task = session.uploadTask(with: req, fromFile: tmpURL)
        task.resume()
    }

    // MARK: - URLSession delegate (background upload completion)

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        responseData.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            // A client-side timeout does NOT mean the save failed — the background
            // session keeps the upload alive and it may still succeed. Report the
            // neutral "still saving" state so a slow-but-successful save is never
            // shown as a false failure. Other errors are genuine and terminal.
            if (error as NSError).code == NSURLErrorTimedOut {
                showResult("Still saving — open Machina to confirm", success: false, neutral: true)
            } else {
                showResult("Network error — try again", success: false)
            }
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
