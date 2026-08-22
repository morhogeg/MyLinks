import UIKit
import ImageIO

/// The ONE progress curve, shared by convention with the web app. Progress is a
/// deterministic function of elapsed wall-clock time since the capture started,
/// so the Share Extension HUD and the in-app loaders (which anchor to the same
/// start timestamp — see `writePendingShareHint` / the placeholder's
/// `processingStartedAt`) compute the identical percentage at the same moment.
/// Switching from the share sheet to the app never restarts the loader.
///
///     progress(t) = ceiling − (ceiling − start) · e^(−t / tau)
///
/// TWIN: keep these constants + formula identical to web/lib/shareProgress.ts
/// (START_PCT, CEILING, TAU_MS). Change one, change the other, or the two
/// screens drift.
enum ShareProgressCurve {
    static let start: Double = 6      // START_PCT
    static let ceiling: Double = 92   // CEILING
    static let tauMs: Double = 10_000 // TAU_MS

    /// Progress (percent, start…ceiling) for `elapsedMs` since capture start.
    static func progress(forElapsedMs elapsedMs: Double) -> Double {
        let t = max(0, elapsedMs)
        let p = ceiling - (ceiling - start) * exp(-t / tauMs)
        return min(ceiling, max(start, p))
    }
}

/// The **Lumen** design tokens, ported from `web/app/globals.css` (`:root` — the
/// dark theme this HUD always renders in).
///
/// Machina's identity moved OFF hue: `--accent` is no longer a colour, it is the
/// neutral EMPHASIS token — porcelain on a graphite ground — and affordance
/// comes from contrast, never from a purple. Nothing in this file may reach for
/// a hue again. Keep these values in step with globals.css.
enum Lumen {
    // Emphasis (porcelain). --accent is the fill; --accent-2/-3 are the discrete
    // stops of --accent-gradient (linear-gradient(135deg, #FFFFFF, #CBD2E0)).
    static let accent = UIColor(red: 0xE9 / 255.0, green: 0xE9 / 255.0, blue: 0xF2 / 255.0, alpha: 1)   // --accent   #E9E9F2
    static let accent2 = UIColor(red: 0xCB / 255.0, green: 0xD2 / 255.0, blue: 0xE0 / 255.0, alpha: 1)  // --accent-2 #CBD2E0
    static let accent3 = UIColor(red: 0xF2 / 255.0, green: 0xF5 / 255.0, blue: 0xFA / 255.0, alpha: 1)  // --accent-3 #F2F5FA
    /// --accent-ring: rgba(174, 184, 206, 0.34) — the identity glow.
    static let accentRing = UIColor(red: 174 / 255.0, green: 184 / 255.0, blue: 206 / 255.0, alpha: 0.34)

    // Graphite surfaces.
    static let ground = UIColor(red: 0x05 / 255.0, green: 0x05 / 255.0, blue: 0x05 / 255.0, alpha: 1) // --background #050505
    static let card = UIColor(red: 0x12 / 255.0, green: 0x12 / 255.0, blue: 0x12 / 255.0, alpha: 1)   // --card       #121212

    // Ink.
    static let text = UIColor(red: 0xE5 / 255.0, green: 0xE5 / 255.0, blue: 0xE5 / 255.0, alpha: 1)          // --text
    static let textSecondary = UIColor(red: 0xA0 / 255.0, green: 0xA0 / 255.0, blue: 0xA0 / 255.0, alpha: 1) // --text-secondary
    static let textMuted = UIColor(red: 0x66 / 255.0, green: 0x66 / 255.0, blue: 0x66 / 255.0, alpha: 1)     // --text-muted

    // Materials — the dark values of the theme-aware fill/hairline tokens.
    static let fillSubtle = UIColor(white: 1, alpha: 0.05)   // --fill-subtle
    static let fillStrong = UIColor(white: 1, alpha: 0.10)   // --fill-strong
    static let borderSubtle = UIColor(white: 1, alpha: 0.05) // --border
    static let borderStrong = UIColor(white: 1, alpha: 0.10) // --border-strong

    // Motion.
    /// --ease-modal: the one decisive, no-overshoot settle curve.
    static let easeModal = CAMediaTimingFunction(controlPoints: 0.32, 0.72, 0, 1)
    /// --ease-spring: the pop, with its deliberate overshoot.
    static let easeSpring = CAMediaTimingFunction(controlPoints: 0.34, 1.56, 0.64, 1)
}

/// Share Extension entry point. Pulls the shared item (link, text, or image)
/// out of the share sheet, reads the user's ingest endpoint + token from the
/// App Group (written by the main app, see ShareConfigPlugin.swift), uploads it
/// to the backend's /api/share endpoint, and shows a brief confirmation.
///
/// For images it re-creates — natively, in UIKit + CoreAnimation — the in-app
/// "image scan" animation (see web/components/ImageScanProgress.tsx): a
/// porcelain scan-line sweeping over a preview of the shared image, a rising
/// percentage counter, a thin accent progress bar, and a rotating phase label.
/// The animation is cosmetic; the *real* completion is driven by the network
/// upload, so the percentage eases toward 90% while the request is in flight
/// and only resolves to the "saved, still analyzing" frame once the upload
/// actually succeeds.
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

    // MARK: Palette — see `Lumen` above. Every colour in this HUD is a token.
    // There is deliberately NO success-green: the app's own capture surfaces
    // (AnalyzingBanner's CheckCircle2, LinkScanProgress's Check) resolve in
    // `text-accent` — porcelain — so "done" here is porcelain too.

    // MARK: Generic (non-image) HUD — kept simple, matching the app card look.
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
    // The temp JSON body handed to the background upload task. Kept so we can
    // delete it once the transfer completes (didCompleteWithError); the file must
    // survive until then because the background daemon reads it after we dismiss.
    private var uploadTempURL: URL?

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
    /// The status cluster's vertical anchor (the % counter; mark and phase hang
    /// off it). Image mode centers it slightly high (-8); link mode pushes it
    /// down (+12) so the Citation mark clears the favicon+host header row.
    private var statusCenterY: NSLayoutConstraint!

    // MARK: Link scan HUD (mirrors web/components/LinkScanProgress.tsx)
    // A faux page preview — favicon + host + skeleton lines — shown behind the
    // dim + sweep when the user shares a link/text instead of an image, so links
    // get the same polished "reading…" treatment images already get.
    private let linkPreview = UIView()            // faux page container
    private let faviconView = UIImageView()       // site favicon (or globe fallback)
    private let hostLabel = UILabel()             // the link's host
    private let citationMark = CitationMarkView() // the brand mark, working, above the % counter
    private var faviconTask: URLSessionDataTask?

    private var displayLink: CADisplayLink?
    private var progress: CGFloat = 0             // 0…100, what's shown on screen
    private var ceiling: CGFloat = CGFloat(ShareProgressCurve.ceiling) // eases toward this while uploading
    // Capture-start wall clock — the shared anchor the whole progress ramp is a
    // pure function of, and the value handed to the app so its in-app loader
    // resumes from the same point instead of restarting. Set when the scan HUD
    // first appears (beginScanAnimation).
    private var captureStartedAt: Date?
    private var isImageFlow = false
    private var isLinkFlow = false
    /// Shared TEXT with no URL in it. It rides the SAME HUD as a link (the
    /// linkPreview skeleton, the same ramp) but never claims to fetch or read a
    /// page, because there is neither — see `phase(for:)` and `presentTextScan`.
    private var isTextFlow = false
    private var finished = false
    private var resultShown = false

    override func viewDidLoad() {
        super.viewDidLoad()
        // The HUD is a fixed graphite surface (Lumen tokens, no dynamic system
        // colours), so pin the trait style — otherwise system-drawn bits (SF
        // Symbols, the activity indicator) would flip with the host app's theme
        // while our hand-mixed greys would not.
        overrideUserInterfaceStyle = .dark
        // Scrim: the graphite card needs a darker ground under it than the old
        // 0.25 to sit on, especially over a light host app.
        view.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        sweepStaleShareTempFiles()
        setupGenericUI()
        setupScanUI()
        handleShare()
    }

    /// Best-effort sweep of orphaned upload bodies. Each share writes a
    /// `machina-share-<UUID>.json` temp file that's normally deleted once the
    /// background upload completes (didCompleteWithError); if the extension was
    /// killed before that, the file lingers. Delete any older than ~1 day so they
    /// don't accumulate. Non-fatal — any failure is ignored.
    private func sweepStaleShareTempFiles() {
        let fm = FileManager.default
        let tmpDir = fm.temporaryDirectory
        let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
        guard let entries = try? fm.contentsOfDirectory(
            at: tmpDir,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else { return }
        for url in entries where url.lastPathComponent.hasPrefix("machina-share-")
            && url.pathExtension == "json" {
            let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?
                .contentModificationDate
            if let modified = modified, modified < cutoff {
                try? fm.removeItem(at: url)
            }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // Re-apply the accent gradient now that the sweep band has real bounds.
        layoutSweepGradient()
        // Elevation (--shadow-card): on a near-black ground the depth comes from
        // the hairline + a wide soft drop. An explicit shadowPath keeps it off
        // the per-frame offscreen-render path. Static — never animated.
        for surface in [card, scanContainer] where !surface.bounds.isEmpty {
            surface.layer.shadowPath = UIBezierPath(
                roundedRect: surface.bounds,
                cornerRadius: surface.layer.cornerRadius
            ).cgPath
        }
    }

    // MARK: - Generic UI (links / text / errors)

    private func setupGenericUI() {
        card.backgroundColor = Lumen.card
        card.layer.cornerRadius = 16
        card.layer.borderWidth = 1
        card.layer.borderColor = Lumen.borderSubtle.cgColor
        applyCardElevation(to: card)
        card.translatesAutoresizingMaskIntoConstraints = false
        card.isHidden = true
        view.addSubview(card)

        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.color = Lumen.accent2
        spinner.startAnimating()
        card.addSubview(spinner)

        label.text = "Saving to Machina…"
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.textColor = Lumen.text
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

    /// The app's `--shadow-card` elevation, approximated natively: on the
    /// near-black ground a dark shadow alone is invisible, so the card also
    /// carries a hairline (set by the caller). Static — the shadowPath is
    /// refreshed in viewDidLayoutSubviews.
    private func applyCardElevation(to surface: UIView) {
        surface.layer.shadowColor = UIColor.black.cgColor
        surface.layer.shadowOpacity = 0.55
        surface.layer.shadowRadius = 20
        surface.layer.shadowOffset = CGSize(width: 0, height: 8)
    }

    /// Shared styling for the circular translucent "✕" close button. Tapping it
    /// dismisses the share sheet immediately; the upload keeps running on the
    /// background session.
    private func configureCloseButton(_ button: UIButton) {
        button.translatesAutoresizingMaskIntoConstraints = false
        // A quiet material button, not a hue: --fill-strong under a hairline.
        button.backgroundColor = Lumen.fillStrong
        button.tintColor = Lumen.text
        button.layer.cornerRadius = 15   // half of the 30pt size => a circle
        button.layer.borderWidth = 1
        button.layer.borderColor = Lumen.borderStrong.cgColor
        button.clipsToBounds = true
        if let xmark = UIImage(systemName: "xmark",
                               withConfiguration: UIImage.SymbolConfiguration(pointSize: 12, weight: .semibold)) {
            button.setImage(xmark, for: .normal)
            button.setTitle(nil, for: .normal)
        } else {
            button.setTitle("✕", for: .normal)
            button.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
            button.setTitleColor(Lumen.text, for: .normal)
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
        defaults.set(isImageFlow ? "image" : isTextFlow ? "text" : "link", forKey: "pendingShareKind")
        // Hand off the EXACT percentage the HUD is showing right now, so an older
        // app build that can't read the start time still resumes near this value.
        defaults.set(Double(progress), forKey: "pendingShareProgress")
        // The continuity anchor: the absolute capture-start wall clock (epoch ms).
        // The in-app loader ramps `progressFor(now - startedAt)` off this exact
        // value using the SAME curve (ShareProgressCurve / lib/shareProgress.ts),
        // so the two screens show one continuous progress — never a restart.
        if let start = captureStartedAt {
            defaults.set(start.timeIntervalSince1970 * 1000.0, forKey: "pendingShareStartedAt")
        }
    }

    /// Remove the hand-off flag entirely — used when NO card will follow (the
    /// server deduped this URL against an existing card), so the app never
    /// floats a progress banner for a card that will never arrive.
    private func clearPendingShareHint() {
        guard let defaults = UserDefaults(suiteName: Self.appGroup) else { return }
        defaults.removeObject(forKey: "pendingShareAt")
        defaults.removeObject(forKey: "pendingShareKind")
        defaults.removeObject(forKey: "pendingShareProgress")
        defaults.removeObject(forKey: "pendingShareStartedAt")
    }

    // MARK: - Scan UI (images)

    private func setupScanUI() {
        // The card is the app's own surface: --card on --background, a
        // --border-subtle hairline, --shadow-card elevation.
        scanContainer.backgroundColor = Lumen.card
        scanContainer.layer.cornerRadius = 20
        scanContainer.layer.borderWidth = 1
        scanContainer.layer.borderColor = Lumen.borderSubtle.cgColor
        applyCardElevation(to: scanContainer)
        scanContainer.translatesAutoresizingMaskIntoConstraints = false
        scanContainer.isHidden = true
        view.addSubview(scanContainer)

        // Preview area — aspect-video (16:9), rounded, clips the sweep + image.
        // An inset well: --background sunk into the --card face.
        previewView.backgroundColor = Lumen.ground
        previewView.layer.cornerRadius = 12
        previewView.layer.borderWidth = 1
        previewView.layer.borderColor = Lumen.borderStrong.cgColor
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

        // Big % counter. 26pt (not 30) so the mark + % + phase cluster fits the
        // 16:9 preview with air above and below.
        percentLabel.text = "0%"
        percentLabel.font = UIFont.monospacedDigitSystemFont(ofSize: 26, weight: .bold)
        percentLabel.textColor = Lumen.accent3
        percentLabel.textAlignment = .center
        percentLabel.translatesAutoresizingMaskIntoConstraints = false
        previewView.addSubview(percentLabel)

        // ✓ resolved glyph (hidden until done). Porcelain, never green — the
        // app's own capture surfaces resolve in `text-accent`.
        checkLabel.text = "✓"
        checkLabel.font = .systemFont(ofSize: 40, weight: .bold)
        checkLabel.textColor = Lumen.accent
        checkLabel.textAlignment = .center
        checkLabel.alpha = 0
        checkLabel.translatesAutoresizingMaskIntoConstraints = false
        previewView.addSubview(checkLabel)

        // The brand mark, working — the Citation mark above the % counter, the
        // same glyph the in-app scan surfaces ride (LinkScanProgress /
        // ImageScanProgress / AnalyzingBanner). Every save wears it, photos
        // included: sharing a picture used to be the one flow with no mark at
        // all, which read as a different app's loader. Hidden until a flow
        // starts; both presentScan and presentLinkScan reveal it.
        citationMark.isHidden = true
        citationMark.translatesAutoresizingMaskIntoConstraints = false
        previewView.addSubview(citationMark)

        // Phase label.
        phaseLabel.text = "Uploading…"
        phaseLabel.font = .systemFont(ofSize: 14, weight: .medium)
        phaseLabel.textColor = Lumen.text
        phaseLabel.textAlignment = .center
        phaseLabel.translatesAutoresizingMaskIntoConstraints = false
        previewView.addSubview(phaseLabel)

        // Progress bar — --fill-strong track, porcelain fill (bg-accent, the
        // same pairing as AnalyzingBanner's bar).
        barTrack.backgroundColor = Lumen.fillStrong
        barTrack.layer.cornerRadius = 3
        barTrack.clipsToBounds = true
        barTrack.translatesAutoresizingMaskIntoConstraints = false
        scanContainer.addSubview(barTrack)

        barFill.backgroundColor = Lumen.accent
        barFill.layer.cornerRadius = 3
        barFill.translatesAutoresizingMaskIntoConstraints = false
        barTrack.addSubview(barFill)

        hintLabel.text = "You can close this — we’ll keep analyzing in the background."
        hintLabel.font = .systemFont(ofSize: 11, weight: .regular)
        hintLabel.textColor = Lumen.textMuted
        hintLabel.textAlignment = .center
        hintLabel.numberOfLines = 0
        hintLabel.translatesAutoresizingMaskIntoConstraints = false
        scanContainer.addSubview(hintLabel)

        // Close (✕) button, top-trailing corner of the scan card. Added last so it
        // sits above the preview / progress views.
        configureCloseButton(scanCloseButton)
        scanContainer.addSubview(scanCloseButton)

        barFillWidth = barFill.widthAnchor.constraint(equalToConstant: 0)
        statusCenterY = percentLabel.centerYAnchor.constraint(equalTo: previewView.centerYAnchor, constant: -8)

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
            statusCenterY,

            checkLabel.centerXAnchor.constraint(equalTo: percentLabel.centerXAnchor),
            checkLabel.centerYAnchor.constraint(equalTo: percentLabel.centerYAnchor),

            citationMark.centerXAnchor.constraint(equalTo: percentLabel.centerXAnchor),
            citationMark.bottomAnchor.constraint(equalTo: percentLabel.topAnchor, constant: -6),
            citationMark.widthAnchor.constraint(equalToConstant: 28),
            // The tight viewBox is 448×416, so the slot keeps the ink's aspect
            // instead of letterboxing it.
            citationMark.heightAnchor.constraint(equalTo: citationMark.widthAnchor,
                                                 multiplier: 1 / CitationMarkView.aspect),

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
        linkPreview.backgroundColor = Lumen.ground
        linkPreview.isHidden = true
        linkPreview.translatesAutoresizingMaskIntoConstraints = false
        // Behind the dim overlay so the scan line and status still read clearly.
        previewView.insertSubview(linkPreview, aboveSubview: imageView)

        faviconView.contentMode = .scaleAspectFit
        faviconView.layer.cornerRadius = 4
        faviconView.clipsToBounds = true
        faviconView.tintColor = Lumen.textSecondary
        faviconView.translatesAutoresizingMaskIntoConstraints = false
        linkPreview.addSubview(faviconView)

        hostLabel.font = .systemFont(ofSize: 12, weight: .medium)
        hostLabel.textColor = Lumen.textSecondary
        hostLabel.lineBreakMode = .byTruncatingTail
        hostLabel.translatesAutoresizingMaskIntoConstraints = false
        linkPreview.addSubview(hostLabel)

        // Skeleton: a title line (--fill-strong), then body lines (--fill-subtle).
        let title = skeletonLine(Lumen.fillStrong)
        let b1 = skeletonLine(Lumen.fillSubtle)
        let b2 = skeletonLine(Lumen.fillSubtle)
        let b3 = skeletonLine(Lumen.fillSubtle)
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

    private func skeletonLine(_ fill: UIColor) -> UIView {
        let v = UIView()
        v.backgroundColor = fill
        v.layer.cornerRadius = 3
        v.translatesAutoresizingMaskIntoConstraints = false
        return v
    }

    /// Gradient (transparent -> porcelain -> transparent) for the sweep band,
    /// plus a bright leading line along its bottom edge — mirrors the web sweep,
    /// repainted in --accent-gradient's stops instead of the retired purple.
    private let sweepGradient = CAGradientLayer()
    private let sweepLine = CALayer()
    private var sweepConfigured = false

    private func layoutSweepGradient() {
        guard isImageFlow || isLinkFlow || isTextFlow else { return }
        // The sweep band spans 20% of the preview height (matches h-1/5 in web).
        let bandHeight = max(previewView.bounds.height * 0.20, 1)
        let bandWidth = previewView.bounds.width
        sweepView.frame = CGRect(x: 0, y: 0, width: bandWidth, height: bandHeight)

        sweepGradient.frame = sweepView.bounds
        sweepLine.frame = CGRect(x: 0, y: sweepView.bounds.height - 1.5, width: sweepView.bounds.width, height: 1.5)

        // The band's glow is a static rect, so pin its shadowPath — an unset
        // path makes CoreAnimation re-derive the shadow from the layer contents
        // on every pass, and this layer is under a running animation.
        sweepLine.shadowPath = CGPath(rect: sweepLine.bounds, transform: nil)

        if !sweepConfigured {
            // Porcelain, not purple: --accent-2 through the band, --accent-3 on
            // the leading edge (the two discrete stops of --accent-gradient).
            // Lower alpha than the old hue — at full strength a near-white band
            // blows out the dimmed preview underneath.
            sweepGradient.colors = [
                UIColor.clear.cgColor,
                Lumen.accent2.withAlphaComponent(0.34).cgColor,
                UIColor.clear.cgColor,
            ]
            sweepGradient.locations = [0, 0.5, 1]
            sweepView.layer.addSublayer(sweepGradient)

            sweepLine.backgroundColor = Lumen.accent3.cgColor
            // --accent-ring is the identity's glow; the line carries it softly.
            sweepLine.shadowColor = Lumen.accentRing.cgColor
            sweepLine.shadowRadius = 9
            sweepLine.shadowOpacity = 1
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

    /// Phase label from progress. For links this MUST match the shared web phase
    /// source (web/lib/scanPhases.ts → LINK_SCAN_STEPS, used by LinkScanProgress
    /// and AnalyzingBanner) so the share sheet and the in-app loader never say
    /// different things at the same %. Images mirror ImageScanProgress.tsx.
    private func phase(for p: CGFloat) -> String {
        if p >= 100 { return "Done!" }
        // Shared text: the same beats at the same thresholds, with copy that
        // doesn't claim to fetch anything. TWIN: web/lib/scanPhases.ts
        // TEXT_SCAN_STEPS — change one, change the other.
        if isTextFlow {
            if p >= 92 { return "Organizing & tagging…" }
            if p >= 72 { return "Searching connections…" }
            if p >= 50 { return "Writing a summary…" }
            if p >= 25 { return "Reading your text…" }
            return "Saving your text…"
        }
        if isLinkFlow {
            if p >= 92 { return "Organizing & tagging…" }
            if p >= 72 { return "Searching connections…" }
            if p >= 50 { return "Writing the summary…" }
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
    /// sets isImageFlow / isLinkFlow / isTextFlow (and the matching preview)
    /// before calling.
    private func beginScanAnimation() {
        card.isHidden = true
        scanContainer.isHidden = false
        // Anchor the shared clock the ramp is a pure function of, THEN seed the
        // hand-off flag immediately so opening Machina even a beat later resumes
        // from the same point rather than a blank banner.
        if captureStartedAt == nil { captureStartedAt = Date() }
        writePendingShareHint()
        displayLink = CADisplayLink(target: self, selector: #selector(tick))
        displayLink?.add(to: .main, forMode: .common)
    }

    @objc private func tick() {
        guard let start = captureStartedAt else { return }
        // Progress is a deterministic function of elapsed wall-clock time via the
        // shared curve — the SAME value the in-app loader computes for the same
        // moment. Monotonic by construction (the curve only rises), and we never
        // render below what we've already shown as a belt-and-braces guard.
        let elapsedMs = Date().timeIntervalSince(start) * 1000.0
        let next = CGFloat(ShareProgressCurve.progress(forElapsedMs: elapsedMs))
        if next > progress { progress = next }
        renderProgress(progress, done: false)
        syncProgressHint()
    }

    private func renderProgress(_ p: CGFloat, done: Bool) {
        percentLabel.text = "\(Int(p.rounded()))%"
        phaseLabel.text = phase(for: p)
        let trackWidth = barTrack.bounds.width
        barFillWidth.constant = trackWidth * (p / 100.0)
        if done {
            // No colour change on the bar — "done" is porcelain like everything
            // else; the ✓ and the full track carry the resolution.
            percentLabel.alpha = 0
            checkLabel.alpha = 1
            sweepView.isHidden = true
            citationMark.settle()
        }
        // Animate the bar width change smoothly.
        UIView.animate(withDuration: 0.2) { self.barTrack.layoutIfNeeded() }
    }

    /// Terminal frame of the extension after a 2xx ack. The ack means the capture
    /// is SAVED, not that analysis is done: /api/share only queues the item and the
    /// backend keeps working ~15–20s more, so the in-app banner resumes from this
    /// exact %. The visual grammar must therefore read "saved, still analyzing",
    /// never "everything finished":
    ///   - the ✓ attaches to the SAVE ("Saved ✓ · Making your card"), not a
    ///     full-screen glyph, and the same line names the work still running;
    ///   - the % counter stays on the live curve value, so the frame reads mid-flight;
    ///   - the bar KEEPS its live curve width in the accent colour — never full.
    /// Auto-dismiss timing is unchanged: the host share sheet is never held open for
    /// analysis.
    ///
    /// The mark SETTLES rather than vanishing: the work it was reporting on has
    /// resolved, so it holds the locked frame under a steady light — the same
    /// "at rest, not gone" grammar as the app's own resolved beat.
    private func completeScanSuccess(then: @escaping () -> Void) {
        DispatchQueue.main.async {
            self.displayLink?.invalidate()
            self.displayLink = nil
            self.sweepView.isHidden = true
            self.citationMark.settle()
            // Keep the live % visible (the ✓ rides the copy, not the counter) and
            // leave the bar at its accent curve width — do NOT fill it.
            self.percentLabel.alpha = 1
            self.checkLabel.alpha = 0
            self.phaseLabel.text = "Saved ✓ · Making your card"
            self.hintLabel.text = "Safe to close. The card finishes on its own in Machina."
            // Hand the app EXACTLY this % (the hint carries progress + start
            // clock) so its loader continues the ramp instead of restarting.
            self.writePendingShareHint()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.1) { then() }
        }
    }

    /// 2xx but the server deduped: this URL is already a card in the library and
    /// no new card will appear. Say so honestly — a plain "Saved ✓" promises a
    /// new card — and clear the hand-off hint so the app shows no phantom loader.
    private func showDuplicateResult() {
        DispatchQueue.main.async {
            guard !self.resultShown else { return }
            self.resultShown = true
            self.displayLink?.invalidate()
            self.displayLink = nil
            self.clearPendingShareHint()
            if self.isImageFlow || self.isLinkFlow || self.isTextFlow {
                self.sweepView.isHidden = true
                self.citationMark.settle()
                self.percentLabel.alpha = 0
                self.checkLabel.alpha = 1
                // The bar completes; it stays porcelain (no green) — resolution
                // is carried by the full track + the ✓, not by a hue.
                self.barFillWidth.constant = self.barTrack.bounds.width
                self.phaseLabel.text = "Already in your library"
                self.hintLabel.text = "This one is saved in Machina — no new card was added."
                UIView.animate(withDuration: 0.2) { self.barTrack.layoutIfNeeded() }
            } else {
                self.card.isHidden = false
                self.label.text = "Already in your library"
                self.spinner.stopAnimating()
                self.spinner.isHidden = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { self.finish() }
        }
    }

    // MARK: - Result / dismiss

    /// Present the outcome of the save.
    ///
    /// - success == true  → the server acknowledged (2xx). Only here do we ever
    ///   show the ✓.
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

            if self.isImageFlow || self.isLinkFlow || self.isTextFlow {
                if success {
                    // Save acknowledged — show the honest "saved, still analyzing"
                    // frame (bar stays mid-flight), then finish.
                    self.completeScanSuccess { self.finish() }
                } else {
                    // Stop the cosmetic scan and surface the message on the card.
                    self.displayLink?.invalidate()
                    self.displayLink = nil
                    self.sweepView.isHidden = true
                    self.percentLabel.alpha = 0
                    self.checkLabel.alpha = 0
                    // Nothing resolved — the mark stops and steps away rather
                    // than settling (settling would read as "done").
                    self.citationMark.stop()
                    self.citationMark.alpha = 0
                    self.phaseLabel.text = message
                    self.phaseLabel.textColor = Lumen.text
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
                    DispatchQueue.main.async { self?.presentSharedString(s) }
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
                    DispatchQueue.main.async { self?.presentSharedString(s) }
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
        guard !isImageFlow, !isLinkFlow, !isTextFlow else { return }
        isImageFlow = true
        if let image = image { imageView.image = image }
        citationMark.isHidden = false
        beginScanAnimation()
        view.setNeedsLayout()
        view.layoutIfNeeded()
        layoutSweepGradient()
        // Started AFTER layout, same reason as the link flow: the arrival
        // animation measures the slot's real bounds.
        citationMark.start()
    }

    /// Does this shared string carry a link the backend will actually go fetch?
    ///
    /// MUST mirror `_extract_url` in functions/main.py — a bare `https?://` match,
    /// NOT NSDataDetector (which also matches "example.com" and would send the
    /// HUD down the link story for something the backend saves as text). This one
    /// predicate decides which flow the user watches, so the words on screen and
    /// the card that lands can never tell different stories.
    private static func containsHttpUrl(_ s: String) -> Bool {
        s.range(of: "https?://[^\\s]+", options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Route a shared string to the flow that matches what will really happen to
    /// it: a link is fetched and read, plain text is already in hand.
    private func presentSharedString(_ s: String) {
        if Self.containsHttpUrl(s) { presentLinkScan(urlString: s) } else { presentTextScan(s) }
    }

    /// Show the scan animation for shared TEXT — a paragraph with no link in it.
    ///
    /// Same HUD as the link flow (skeleton, sweep, mark, ramp), two honest
    /// differences: the header reads "Saving text" beside a quote glyph instead of
    /// a favicon and a hostname there is no host for, and the second line shows
    /// the text's own opening words, so the user can see WHICH paragraph is being
    /// saved. No favicon fetch — there is no site to fetch one from.
    private func presentTextScan(_ text: String) {
        guard !isImageFlow, !isLinkFlow, !isTextFlow else { return }
        isTextFlow = true
        let firstLine = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: "\n")
            .first
            .map(String.init) ?? ""
        hostLabel.text = firstLine.isEmpty
            ? "Saving text…"
            : (firstLine.count > 48 ? String(firstLine.prefix(48)) + "…" : firstLine)
        faviconView.image = UIImage(systemName: "text.quote")
        faviconView.tintColor = Lumen.textSecondary
        imageView.isHidden = true
        linkPreview.isHidden = false
        dimView.backgroundColor = UIColor.black.withAlphaComponent(0.50)
        citationMark.isHidden = false
        // Same drop as the link flow — the status cluster clears the header row.
        statusCenterY.constant = 12
        beginScanAnimation()
        view.setNeedsLayout()
        view.layoutIfNeeded()
        layoutSweepGradient()
        citationMark.start()
    }

    /// Show the native scan animation for a shared link/text: a faux page preview
    /// (favicon + host + skeleton) behind the sweep, mirroring LinkScanProgress.tsx.
    private func presentLinkScan(urlString: String?) {
        guard !isImageFlow, !isLinkFlow, !isTextFlow else { return }
        isLinkFlow = true
        let host = urlString.flatMap { Self.host(from: $0) }
        hostLabel.text = host ?? "Saving link…"
        setGlobeFavicon()
        imageView.isHidden = true
        linkPreview.isHidden = false
        dimView.backgroundColor = UIColor.black.withAlphaComponent(0.50)
        citationMark.isHidden = false
        // Drop the status cluster below the favicon+host header (see statusCenterY).
        statusCenterY.constant = 12
        beginScanAnimation()
        view.setNeedsLayout()
        view.layoutIfNeeded()
        layoutSweepGradient()
        // Started AFTER layout: the arrival's bracket travel is a fraction of
        // the slot's width, so it needs real bounds. (start() also self-defers
        // to the next layout pass if it is ever called too early.)
        citationMark.start()
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
        faviconView.tintColor = Lumen.textSecondary
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
        uploadTempURL = tmpURL

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
                // The server acks duplicates with 200 + {"duplicate": true} and
                // creates NO new card — that must not read as a fresh save.
                let body = (try? JSONSerialization.jsonObject(with: responseData)) as? [String: Any]
                if (body?["duplicate"] as? Bool) == true {
                    showDuplicateResult()
                } else {
                    showResult("Saved ✓ · Making your card", success: true)
                }
            } else if code == 403 || code == 401 {
                showResult("Auth failed — reopen Machina", success: false)
            } else {
                showResult("Couldn't save (\(code))", success: false)
            }
        }
        // The background daemon has read the body file by the time didComplete
        // fires, so it's safe to delete now (best-effort — a leftover is swept at
        // the next launch anyway).
        if let tmp = uploadTempURL {
            try? FileManager.default.removeItem(at: tmp)
            uploadTempURL = nil
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

/// **The Citation mark, natively** — Machina's brand glyph as the share sheet's
/// working indicator. Replaces the retired Thinking Orb (`OrbitsOrbView`), which
/// was a port of a mark the app no longer uses, recoloured to a hue the identity
/// no longer has.
///
/// ── Geometry ────────────────────────────────────────────────────────────────
/// Ported unit-for-unit from `design/icon-concepts/cit_lumen.svg`, which is the
/// same ink as `bracketPaths(0)` + the resting point in
/// `web/components/ui/CitationMark.tsx` (verified point-for-point, not eyeballed):
///
///     viewBox   288 292 448 416        the TIGHT resting-ink box, as the app
///                                      uses at ≤20px — the ink must fill the
///                                      slot, not float in the full artboard
///     bracket   TOP 300 · BOT 700 · ARM 100 · W 58 · LX 296 · RX 728
///     point     c (512, 500) · r 52    (R_HI, the locked radius)
///
/// The point's centre IS the viewBox centre, which is what lets the strike be a
/// plain `transform.scale` on the point layer: the layer's anchor point already
/// sits exactly on the point.
///
/// The mark uses the tight box, not the roomy `roam` one, because here only the
/// ARRIVAL moves the brackets — there is no clamp/sweep loop swinging them past
/// rest — and a `CAShapeLayer` is not clipped by its own bounds, so the sliding
/// brackets simply travel outside the slot and settle into it.
///
/// ── Motion ──────────────────────────────────────────────────────────────────
/// The arrival choreography from SOURCE_OF_TRUTH §9 (IDENTITY ROUND 13), with
/// the timings ported 1:1 from the `.animate-boot-*` rules in globals.css:
///
///     0.14s  the brackets slide in and settle   0.55s   --ease-modal
///     0.55s  the glow blooms                    0.70s   ease-out
///     0.60s  the point STRIKES (a spring pop)   0.36s   --ease-spring
///     1.60s  then a slow breath, while waiting  4.20s   ease-in-out, forever
///
/// ROUND 14's lesson is structural here, not a detail: **nothing carrying a glow
/// is ever animated.** The ink RESTS after the strike and the waiting motion
/// lives in a sibling radial-gradient layer BEHIND the mark, animating opacity
/// only. A glow that re-rasterises every frame visibly shakes on device.
///
/// `settle()` is the resolved beat ("saved"): the breath stops and the mark
/// holds its locked frame under a steady, quieter light.
///
/// Reduced motion collapses the whole sequence to that settled frame.
final class CitationMarkView: UIView {

    // MARK: Geometry — cit_lumen.svg. Do NOT re-derive these.
    private static let vbX: CGFloat = 288, vbY: CGFloat = 292
    private static let vbW: CGFloat = 448, vbH: CGFloat = 416
    private static let top: CGFloat = 300, bot: CGFloat = 700
    private static let arm: CGFloat = 100, thick: CGFloat = 58
    private static let lx: CGFloat = 296, rx: CGFloat = 728
    private static let cx: CGFloat = 512, cy: CGFloat = 500
    private static let pointR: CGFloat = 52          // R_HI — the locked point

    /// Aspect (w/h) of the tight viewBox, so callers can size a slot that fits
    /// the ink exactly instead of letterboxing it.
    static let aspect: CGFloat = CitationMarkView.vbW / CitationMarkView.vbH

    // MARK: Beats — globals.css `.animate-boot-*`, in seconds.
    private static let bktDelay: CFTimeInterval = 0.14, bktDur: CFTimeInterval = 0.55
    private static let glowDelay: CFTimeInterval = 0.55, glowDur: CFTimeInterval = 0.70
    private static let strikeDelay: CFTimeInterval = 0.60, strikeDur: CFTimeInterval = 0.36
    private static let breatheDelay: CFTimeInterval = 1.60
    /// Half a breath: 2.1s out, 2.1s back = the boot halo's 4.2s cycle.
    private static let breatheHalf: CFTimeInterval = 2.10
    private static let settleDur: CFTimeInterval = 0.32

    /// Bracket travel as a fraction of the slot width — the boot's 92px against
    /// its 117px mark, kept proportional so the gesture reads the same at 32pt.
    private static let bktTravel: CGFloat = 92.0 / 117.0

    /// Halo opacity: lit at the top of a breath, dim at the bottom, steady once
    /// resolved. The boot halo breathes fully to 0; at this size a full
    /// extinction reads as a blink, so the trough keeps a resting glow.
    private static let haloLit: Float = 1.0
    private static let haloDim: Float = 0.34
    private static let haloSettled: Float = 0.50

    // MARK: Layers. The halo is a SIBLING behind the ink — see round 14.
    private let halo = CAGradientLayer()
    private let bracketL = CAShapeLayer()
    private let bracketR = CAShapeLayer()
    private let point = CAShapeLayer()

    private var started = false
    private var settled = false
    /// `start()` needs real bounds for the bracket travel; if it is called
    /// before layout we defer to the next pass rather than animating from 0.
    private var startPending = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        buildLayers()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        buildLayers()
    }

    private func buildLayers() {
        backgroundColor = .clear
        isOpaque = false
        isUserInteractionEnabled = false

        // The waiting light: --accent-ring falling off to nothing, matching the
        // boot's `radial-gradient(closest-side, rgba(174,184,206,.20), … 72%)`.
        halo.type = .radial
        halo.startPoint = CGPoint(x: 0.5, y: 0.5)
        halo.endPoint = CGPoint(x: 1, y: 1)
        halo.colors = [
            Lumen.accentRing.withAlphaComponent(0.22).cgColor,
            Lumen.accentRing.withAlphaComponent(0.10).cgColor,
            Lumen.accentRing.withAlphaComponent(0).cgColor,
        ]
        halo.locations = [0, 0.45, 1]
        halo.opacity = 0
        layer.addSublayer(halo)

        // The ink. `--accent` is the emphasis token, so the mark is porcelain —
        // the native equivalent of the web mark's `currentColor` on a dark card.
        for shape in inkLayers {
            shape.fillColor = Lumen.accent.cgColor
            shape.fillRule = .nonZero
            shape.opacity = 1
            layer.addSublayer(shape)
        }
    }

    private var inkLayers: [CAShapeLayer] { [bracketL, bracketR, point] }

    // MARK: - Layout

    override func layoutSubviews() {
        super.layoutSubviews()
        let box = bounds
        guard box.width > 0, box.height > 0 else { return }

        // Manually-added sublayers default to contentsScale 1 — without this the
        // vector ink rasterises at 1x and reads soft on every retina device.
        let scale = traitCollection.displayScale > 0 ? traitCollection.displayScale : 2
        halo.contentsScale = scale

        // Fit the tight viewBox into the slot, centred (the slot's aspect
        // matches, so in practice this is a pure scale).
        let s = min(box.width / Self.vbW, box.height / Self.vbH)
        let tx = (box.width - Self.vbW * s) / 2 - Self.vbX * s
        let ty = (box.height - Self.vbH * s) / 2 - Self.vbY * s
        let fit = CGAffineTransform(scaleX: s, y: s)
            .concatenating(CGAffineTransform(translationX: tx, y: ty))

        // These layers are not view-backed, so `path`/`frame` would each pick up
        // CoreAnimation's implicit 0.25s action — a re-layout would morph the ink
        // instead of just re-drawing it. Geometry is set, never animated.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for shape in inkLayers {
            shape.contentsScale = scale
            // Full-slot bounds so `transform.scale` on the point pivots on the
            // slot's centre — which is exactly the point's centre (512, 500).
            shape.frame = box
        }
        bracketL.path = Self.bracketPath(left: true, fit: fit)
        bracketR.path = Self.bracketPath(left: false, fit: fit)
        point.path = Self.pointPath(fit: fit)

        // The boot's `-inset-[45%]`: light spilling well past the ink.
        halo.frame = box.insetBy(dx: -box.width * 0.45, dy: -box.height * 0.45)
        CATransaction.commit()

        if startPending {
            startPending = false
            start()
        }
    }

    /// One bracket, in slot coordinates. Point-for-point the path in
    /// cit_lumen.svg / `bracketPaths(0)` — the resting mark, spread 0.
    private static func bracketPath(left: Bool, fit: CGAffineTransform) -> CGPath {
        let dir: CGFloat = left ? 1 : -1
        let x0 = left ? lx : rx
        let pts = [
            CGPoint(x: x0, y: top),
            CGPoint(x: x0 + dir * arm, y: top),
            CGPoint(x: x0 + dir * arm, y: top + thick),
            CGPoint(x: x0 + dir * thick, y: top + thick),
            CGPoint(x: x0 + dir * thick, y: bot - thick),
            CGPoint(x: x0 + dir * arm, y: bot - thick),
            CGPoint(x: x0 + dir * arm, y: bot),
            CGPoint(x: x0, y: bot),
        ]
        let path = CGMutablePath()
        path.addLines(between: pts, transform: fit)
        path.closeSubpath()
        return path
    }

    /// The point, at its locked radius.
    private static func pointPath(fit: CGAffineTransform) -> CGPath {
        var fit = fit
        let box = CGRect(x: cx - pointR, y: cy - pointR, width: pointR * 2, height: pointR * 2)
        return CGPath(ellipseIn: box, transform: &fit)
    }

    // MARK: - Motion

    /// Play the arrival, then hold the working breath. Idempotent, and safe to
    /// call before layout (it defers itself to the next layout pass).
    func start() {
        guard !started, !settled else { return }
        guard bounds.width > 0 else { startPending = true; return }
        started = true

        // Reduced motion: no arrival, no breath — the settled frame, at once.
        guard !UIAccessibility.isReduceMotionEnabled else {
            applySettledFrame()
            return
        }

        let now = CACurrentMediaTime()
        let travel = bounds.width * Self.bktTravel

        // 1 — the brackets slide in and settle, on --ease-modal.
        slideIn(bracketL, from: -travel, at: now)
        slideIn(bracketR, from: travel, at: now)

        // 2 — the glow blooms, just before the point lands.
        halo.opacity = Self.haloLit
        let bloom = CABasicAnimation(keyPath: "opacity")
        bloom.fromValue = 0
        bloom.toValue = Self.haloLit
        bloom.duration = Self.glowDur
        bloom.beginTime = now + Self.glowDelay
        bloom.timingFunction = CAMediaTimingFunction(name: .easeOut)
        bloom.fillMode = .backwards        // stays dark through the delay
        halo.add(bloom, forKey: "bloom")

        // 3 — the point STRIKES: the spring's overshoot IS the gesture, so the
        // scale carries --ease-spring. The opacity rides a plain ease-out over
        // half the beat instead: a >1 control point on alpha only clamps.
        let strike = CABasicAnimation(keyPath: "transform.scale")
        strike.fromValue = 0
        strike.toValue = 1
        strike.duration = Self.strikeDur
        strike.beginTime = now + Self.strikeDelay
        strike.timingFunction = Lumen.easeSpring
        strike.fillMode = .backwards
        point.add(strike, forKey: "strike")

        let lit = CABasicAnimation(keyPath: "opacity")
        lit.fromValue = 0
        lit.toValue = 1
        lit.duration = Self.strikeDur * 0.5
        lit.beginTime = now + Self.strikeDelay
        lit.timingFunction = CAMediaTimingFunction(name: .easeOut)
        lit.fillMode = .backwards
        point.add(lit, forKey: "lit")

        // 4 — and then the wait: a slow breath of LIGHT, forever. Only the halo
        // moves; the ink is at rest (round 14). This begins after the bloom has
        // finished and been removed, so the two never composite against each
        // other — `bloom` fills backwards only, `breathe` not at all.
        let breathe = CABasicAnimation(keyPath: "opacity")
        breathe.fromValue = Self.haloLit
        breathe.toValue = Self.haloDim
        breathe.duration = Self.breatheHalf
        breathe.beginTime = now + Self.breatheDelay
        breathe.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        breathe.autoreverses = true
        breathe.repeatCount = .infinity
        halo.add(breathe, forKey: "breathe")
    }

    private func slideIn(_ shape: CAShapeLayer, from dx: CGFloat, at now: CFTimeInterval) {
        let slide = CABasicAnimation(keyPath: "transform.translation.x")
        slide.fromValue = dx
        slide.toValue = 0
        slide.duration = Self.bktDur
        slide.beginTime = now + Self.bktDelay
        slide.timingFunction = Lumen.easeModal
        slide.fillMode = .backwards
        shape.add(slide, forKey: "slide")

        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 0
        fade.toValue = 1
        fade.duration = Self.bktDur
        fade.beginTime = now + Self.bktDelay
        fade.timingFunction = Lumen.easeModal
        fade.fillMode = .backwards
        shape.add(fade, forKey: "fade")
    }

    /// The resolved beat — "saved". The work this mark was reporting on has
    /// finished, so the breath stops and the mark holds its locked frame under a
    /// steady, quieter light. Nothing in this state ever moves again.
    func settle() {
        guard !settled else { return }
        settled = true
        started = true
        startPending = false

        // Read the live value BEFORE removing the animation, so a settle landing
        // mid-bloom or mid-breath eases from where the light actually is.
        let from = halo.presentation()?.opacity ?? halo.opacity
        halo.removeAnimation(forKey: "bloom")
        halo.removeAnimation(forKey: "breathe")
        halo.opacity = Self.haloSettled

        guard !UIAccessibility.isReduceMotionEnabled else { return }
        let ease = CABasicAnimation(keyPath: "opacity")
        ease.fromValue = from
        ease.toValue = Self.haloSettled
        ease.duration = Self.settleDur
        ease.timingFunction = Lumen.easeModal
        halo.add(ease, forKey: "settle")
    }

    /// Park everything. Used when the mark is being taken off screen (an error
    /// frame), where settling would wrongly read as "done".
    func stop() {
        halo.removeAllAnimations()
        for shape in inkLayers { shape.removeAllAnimations() }
    }

    /// The frame the whole choreography resolves to: brackets home, the point at
    /// its locked radius, a steady light. Reduced motion starts here and stays.
    private func applySettledFrame() {
        stop()
        for shape in inkLayers { shape.opacity = 1 }
        halo.opacity = Self.haloSettled
    }
}
