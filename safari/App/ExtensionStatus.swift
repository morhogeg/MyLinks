import AppKit
import SafariServices

/// Whether the Machina extension is turned on in Safari, re-read every time
/// the app comes to the front (the user flips the switch in Safari Settings,
/// then comes back here).
@MainActor
final class ExtensionStatus: ObservableObject {
    enum State: Equatable {
        case checking
        case on
        case off
        /// Safari couldn't answer: usually the extension isn't registered yet
        /// (first launch, or a build Safari hasn't picked up). Treated like
        /// "off" in the UI, with softer copy.
        case unknown
    }

    @Published private(set) var state: State = .checking

    /// The extension's bundle id is always the app's plus ".extension"
    /// (both come from safari/Config/Base.xcconfig), so nothing is hardcoded.
    static let extensionIdentifier = (Bundle.main.bundleIdentifier ?? "com.morhogeg.machina.safari") + ".extension"

    private var observer: NSObjectProtocol?

    init() {
        observer = NotificationCenter.default.addObserver(
            forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        refresh()
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    func refresh() {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: Self.extensionIdentifier) { state, error in
            let next: State
            if let state, error == nil {
                next = state.isEnabled ? .on : .off
            } else {
                next = .unknown
            }
            Task { @MainActor [weak self] in self?.state = next }
        }
    }

    /// Opens Safari Settings on the Extensions pane with Machina selected.
    /// The app stays open so it can show the new state when the user returns.
    func openSafariSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: Self.extensionIdentifier) { error in
            guard error != nil else { return }
            // Fallback: Safari isn't running or doesn't know the extension yet.
            // Opening Safari is the next best thing; the user can open
            // Settings > Extensions from there.
            Task { @MainActor in
                if let safari = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari") {
                    NSWorkspace.shared.openApplication(at: safari, configuration: .init())
                }
            }
        }
    }
}
