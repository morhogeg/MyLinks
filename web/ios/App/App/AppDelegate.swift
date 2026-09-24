import UIKit
import UserNotifications
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    /// Standard-UserDefaults key stamped on the first launch of every install.
    private static let installMarkerKey = "machina.installMarker.v1"

    /// A Keychain item OUTLIVES the app: deleting Machina leaves the shared
    /// ingest token (KeychainStore) on the device, so after a reinstall the
    /// Share Extension would keep saving into the PREVIOUS account's library
    /// before anyone has signed in. Drop it the first time a fresh install
    /// becomes active.
    ///
    /// How a fresh install is told apart from an update, without ever wiping a
    /// live token:
    /// - Standard UserDefaults are deleted with the app and kept across
    ///   updates, so a missing marker means "fresh install OR the first launch
    ///   of the build that introduced this marker".
    /// - The App Group container is ALSO deleted when the last app using the
    ///   group is uninstalled, and ShareConfigPlugin.save writes `shareEndpoint`
    ///   there in the same call that stores the token. So an existing user
    ///   updating to this build still has `shareEndpoint` → token kept. After a
    ///   delete + reinstall the group is empty → the token is an orphan → drop.
    /// - If the App Group can't be opened we can't tell, so we do nothing and
    ///   leave the marker unset to decide again next launch.
    /// - Runs from applicationDidBecomeActive, NOT didFinishLaunching: a
    ///   background launch (a silent push) or iOS prewarming can run
    ///   didFinishLaunching before the first unlock, when UserDefaults read as
    ///   EMPTY — which would look exactly like a fresh install and wipe a live
    ///   token. Becoming active means the user is in the app, device unlocked;
    ///   the isProtectedDataAvailable guard is belt and braces.
    /// A signed-in user loses nothing either way: the WebView re-syncs the
    /// token (syncShareConfigToNative) on every launch after sign-in.
    private func dropOrphanedIngestTokenOnFreshInstall(_ application: UIApplication) {
        guard application.isProtectedDataAvailable else { return }
        let standard = UserDefaults.standard
        guard !standard.bool(forKey: AppDelegate.installMarkerKey) else { return }
        guard let group = UserDefaults(suiteName: ShareConfigPlugin.appGroup) else { return }
        let endpoint = group.string(forKey: "shareEndpoint") ?? ""
        if endpoint.isEmpty {
            KeychainStore.delete(account: KeychainStore.ingestTokenAccount)
        }
        standard.set(true, forKey: AppDelegate.installMarkerKey)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Pushes arrive with badge = 1 (functions/push_service.py) and nothing
        // else ever resets it, so the icon kept a stale "1" forever. Opening
        // the app is the "seen" moment. setBadgeCount is iOS 16+, which the
        // 16.4 deployment target guarantees.
        UNUserNotificationCenter.current().setBadgeCount(0) { _ in }

        dropOrphanedIngestTokenOnFreshInstall(application)
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // ── Push notifications (APNs → @capacitor-firebase/messaging) ──
    // The plugin listens for these Capacitor notifications to bridge the APNs
    // device token to FCM. Firebase itself is configured exactly once by the
    // capacitor-firebase plugins on load — do NOT add FirebaseApp.configure()
    // here (a second configure crashes at launch).

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
