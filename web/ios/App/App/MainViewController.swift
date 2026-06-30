import UIKit
import Capacitor

/// Bridge view controller whose only job is to register app-embedded custom
/// plugins. Capacitor 8 with SPM does NOT auto-discover plugins compiled into
/// the app target (only plugins shipped as Swift packages), so ShareConfigPlugin
/// must be registered explicitly here — otherwise `registerPlugin('ShareConfig')`
/// on the JS side resolves to a no-op and the share token never reaches the App
/// Group (the Share Extension then shows "Open Machina and sign in first").
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ShareConfigPlugin())
    }
}
