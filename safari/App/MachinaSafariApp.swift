import SwiftUI

/// The containing app for the Machina Safari extension.
///
/// Safari web extensions must ship inside a Mac app; this one exists to explain
/// the one thing a user has to do (turn the extension on in Safari Settings)
/// and to show whether they have. All capture happens in the extension itself,
/// which runs the shared code from /extension.
@main
struct MachinaSafariApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Window("Machina for Safari", id: "main") {
            ContentView()
        }
        .windowResizability(.contentSize)
        .windowStyle(.hiddenTitleBar)
        .commands {
            // Single-window app: no File > New Window.
            CommandGroup(replacing: .newItem) {}
            CommandGroup(replacing: .help) {
                Button("Machina Help") { Links.open(Links.support) }
                Button("Contact Support") { Links.open(Links.email) }
                Divider()
                Button("Privacy Policy") { Links.open(Links.privacy) }
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

enum Links {
    static let web = URL(string: "https://mymachina.app")!
    static let support = URL(string: "https://mymachina.app")!
    static let privacy = URL(string: "https://mymachina.app/privacy")!
    static let email = URL(string: "mailto:support@mymachina.app")!

    static func open(_ url: URL) { NSWorkspace.shared.open(url) }
}
