import Foundation
import Capacitor

/// Bridges the share-ingest endpoint + token from the WebView (where the
/// Firebase session lives) into the App Group's shared UserDefaults, so the
/// Share Extension — which runs in its own process and can't see the WebView —
/// can authenticate uploads to the backend.
///
/// JS side: registerPlugin('ShareConfig').save({ endpoint, token })  (see
/// web/lib/shareConfig.ts).
@objc(ShareConfigPlugin)
public class ShareConfigPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareConfigPlugin"
    public let jsName = "ShareConfig"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingShare", returnType: CAPPluginReturnPromise)
    ]

    /// Must match the App Group enabled on BOTH the app and the extension,
    /// and the suite name read by ShareViewController.
    static let appGroup = "group.com.morhogeg.machina"

    @objc func save(_ call: CAPPluginCall) {
        guard let endpoint = call.getString("endpoint"),
              let token = call.getString("token"),
              !endpoint.isEmpty, !token.isEmpty else {
            call.reject("endpoint and token are required")
            return
        }

        guard let defaults = UserDefaults(suiteName: ShareConfigPlugin.appGroup) else {
            call.reject("App Group \(ShareConfigPlugin.appGroup) is not configured")
            return
        }

        defaults.set(endpoint, forKey: "shareEndpoint")
        defaults.set(token, forKey: "ingestToken")
        call.resolve()
    }

    /// Read (and clear) the "a capture was just shared" hint the Share Extension
    /// writes when the user taps "Open Machina" on the share progress HUD. Lets
    /// the app flash the in-app "Analyzing…" banner immediately on open, before
    /// the server's `processing` card streams into the feed. Cleared on read so
    /// it fires exactly once.
    ///
    /// Resolves `{ pending: Bool, kind: String, ageMs: Double }`.
    @objc func consumePendingShare(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: ShareConfigPlugin.appGroup) else {
            call.resolve(["pending": false])
            return
        }
        let at = defaults.double(forKey: "pendingShareAt")
        guard at > 0 else {
            call.resolve(["pending": false])
            return
        }
        let kind = defaults.string(forKey: "pendingShareKind") ?? "link"
        let ageMs = max(0, (Date().timeIntervalSince1970 - at) * 1000.0)
        // The % the share HUD was showing at hand-off (0 if an older extension
        // build didn't write it), so the in-app banner can resume from there.
        let progress = defaults.double(forKey: "pendingShareProgress")
        defaults.removeObject(forKey: "pendingShareAt")
        defaults.removeObject(forKey: "pendingShareKind")
        defaults.removeObject(forKey: "pendingShareProgress")
        call.resolve(["pending": true, "kind": kind, "ageMs": ageMs, "progress": progress])
    }
}
