import SafariServices
import os.log

/// Required principal class of a Safari web extension bundle. Safari routes
/// `browser.runtime.sendNativeMessage` calls here. The shared /extension code
/// does not use native messaging today, so this answers every message with an
/// empty reply instead of the converter template's debug echo (which wrote
/// message contents to the system log).
final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        os_log(.debug, "Machina: native message received and ignored")
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: [String: Any]()]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
