import Foundation
import Capacitor
import WebKit

/// Bridges the share-ingest endpoint + token from the WebView (where the
/// Firebase session lives) to the Share Extension — which runs in its own
/// process and can't see the WebView — so it can authenticate uploads.
///
/// The TOKEN goes into the shared Keychain (KeychainStore: this-device-only,
/// not in backups); only the endpoint stays in the App Group's UserDefaults.
/// Any legacy copy of the token in the App Group is removed on the next save
/// or clear, and the Share Extension migrates one it finds on read.
///
/// JS side: registerPlugin('ShareConfig').save({ endpoint, token })  (see
/// web/lib/shareConfig.ts).
@objc(ShareConfigPlugin)
public class ShareConfigPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareConfigPlugin"
    public let jsName = "ShareConfig"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearWebsiteData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingPaywall", returnType: CAPPluginReturnPromise)
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

        // The endpoint is where the token gets POSTed. Only the app's own
        // hosts, over https, ever qualify.
        guard ShareEndpointPolicy.isAllowed(endpoint) else {
            call.reject("endpoint is not an allowed Machina host")
            return
        }

        guard let defaults = UserDefaults(suiteName: ShareConfigPlugin.appGroup) else {
            call.reject("App Group \(ShareConfigPlugin.appGroup) is not configured")
            return
        }

        guard KeychainStore.set(token, account: KeychainStore.ingestTokenAccount) else {
            call.reject("Could not store the token in the Keychain")
            return
        }
        defaults.set(endpoint, forKey: "shareEndpoint")
        // Purge the pre-Keychain copy so the App Group plist stops carrying it.
        defaults.removeObject(forKey: "ingestToken")
        call.resolve()
    }

    /// Remove the ingest token + endpoint from the App Group. Called on sign-out
    /// (web/lib/auth.ts signOutUser): the token is a long-lived credential for
    /// the signed-out account's library, and without this it survived sign-out,
    /// so the share sheet on a shared or handed-down device kept posting into
    /// that library until another account signed in and overwrote it.
    @objc func clear(_ call: CAPPluginCall) {
        KeychainStore.delete(account: KeychainStore.ingestTokenAccount)
        guard let defaults = UserDefaults(suiteName: ShareConfigPlugin.appGroup) else {
            call.resolve()
            return
        }
        defaults.removeObject(forKey: "ingestToken")
        defaults.removeObject(forKey: "shareEndpoint")
        // The "a capture is in flight" hint too, so the next account never
        // sees the departed one's Analyzing banner.
        // Same for a quota-wall paywall hint: it belongs to the departed account.
        for key in ["pendingShareAt", "pendingShareKind", "pendingShareProgress", "pendingShareStartedAt",
                    "pendingPaywallKind", "pendingPaywallAt"] {
            defaults.removeObject(forKey: key)
        }
        call.resolve()
    }

    /// Drop the WKWebView's HTTP caches (memory + disk). Sign-out purges
    /// Firestore's IndexedDB mirror and localStorage from JS, but the images
    /// the feed rendered (screenshots, post thumbnails at tokenized public
    /// URLs) sit in the WebView's own cache, outside anything JS can reach.
    /// Best-effort; never fails the sign-out.
    @objc func clearWebsiteData(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let types: Set<String> = [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
            WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: .distantPast) {
                call.resolve()
            }
        }
    }

    /// Read (and clear) the "a capture was just shared" hint the Share Extension
    /// writes continuously as it scans (syncProgressHint/writePendingShareHint),
    /// stamping the latest progress % into the App Group. Lets the app flash the
    /// in-app "Analyzing…" banner immediately on open, resuming from that %, before
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
        // The absolute capture-start wall clock (epoch ms) the extension anchored
        // its ramp to (0 if an older build didn't write it). The in-app loader
        // prefers this over its own mount time, so progress carries across
        // continuously via the shared curve (see web/lib/shareProgress.ts).
        let startedAt = defaults.double(forKey: "pendingShareStartedAt")
        defaults.removeObject(forKey: "pendingShareAt")
        defaults.removeObject(forKey: "pendingShareKind")
        defaults.removeObject(forKey: "pendingShareProgress")
        defaults.removeObject(forKey: "pendingShareStartedAt")
        call.resolve([
            "pending": true,
            "kind": kind,
            "ageMs": ageMs,
            "progress": progress,
            "startedAt": startedAt,
        ])
    }

    /// Read (and clear) the "the share sheet hit the free plan's monthly quota"
    /// hint ShareViewController.showQuotaResult leaves in the App Group. The
    /// extension cannot open the app itself, so the app opens the paywall the
    /// next time it comes to the foreground. Cleared on read so it fires once.
    ///
    /// Resolves `{ pending: Bool, kind: String, ageMs: Double }`.
    @objc func consumePendingPaywall(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: ShareConfigPlugin.appGroup) else {
            call.resolve(["pending": false])
            return
        }
        let at = defaults.double(forKey: "pendingPaywallAt")
        let kind = defaults.string(forKey: "pendingPaywallKind") ?? "saves"
        defaults.removeObject(forKey: "pendingPaywallAt")
        defaults.removeObject(forKey: "pendingPaywallKind")
        guard at > 0 else {
            call.resolve(["pending": false])
            return
        }
        let ageMs = max(0, (Date().timeIntervalSince1970 - at) * 1000.0)
        call.resolve(["pending": true, "kind": kind, "ageMs": ageMs])
    }
}
