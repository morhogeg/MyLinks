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
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)
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
}
