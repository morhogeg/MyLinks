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

    /// What shows before the page's first paint and behind overscroll. The
    /// capacitor.config `backgroundColor` is a single fixed color (dark), which
    /// flashed dark on a light-mode phone; this is the adaptive LaunchBackground
    /// asset (the app's light/dark `--background` tokens), so the launch screen,
    /// the web view and the first paint all match the phone's appearance.
    override func viewDidLoad() {
        super.viewDidLoad()
        guard let launch = UIColor(named: "LaunchBackground") else { return }
        view.backgroundColor = launch
        webView?.backgroundColor = launch
        webView?.scrollView.backgroundColor = launch
    }
}
