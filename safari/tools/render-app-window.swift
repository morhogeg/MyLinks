// Renders the containing app's real window content (safari/App/ContentView.swift,
// the same file the app compiles) to PNG, light and dark, without a screen
// capture (so no Screen Recording permission is needed). Run from the repo root:
//
//   xcrun swiftc -parse-as-library -target arm64-apple-macos14.0 -framework SafariServices \
//     safari/tools/render-app-window.swift safari/App/ContentView.swift \
//     safari/App/ExtensionStatus.swift -o /tmp/render-app-window
//   /tmp/render-app-window \
//     safari/App/Assets.xcassets/AppIcon.appiconset/icon_512x512@2x.png \
//     safari/store/screenshots
//
// What it shows: the first-run state (Safari does not know this unregistered
// copy, so the pill reads "Not turned on in Safari yet"). What it cannot show:
// the accent color of the primary button, which AppKit only paints in an
// active window; offscreen it renders grey. Not an App Store screenshot by
// itself (wrong size, no Safari); see safari/store/LISTING.md.
import AppKit
import SwiftUI

// Stand-in for the app target's Links (MachinaSafariApp.swift holds @main,
// which can't be linked into this tool). Same URLs; opening is a no-op.
enum Links {
    static let web = URL(string: "https://mymachina.app")!
    static let support = URL(string: "https://mymachina.app")!
    static let privacy = URL(string: "https://mymachina.app/privacy")!
    static let email = URL(string: "mailto:support@mymachina.app")!
    static func open(_ url: URL) {}
}

@main
@MainActor
enum RenderAppWindow {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let args = CommandLine.arguments
        guard args.count == 3 else {
            print("usage: render-app-window <app icon png> <output dir>")
            exit(2)
        }
        app.applicationIconImage = NSImage(contentsOfFile: args[1])
        render("app-window-light", dark: false, outDir: args[2])
        render("app-window-dark", dark: true, outDir: args[2])
    }

    static func render(_ name: String, dark: Bool, outDir: String) {
        let appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        NSApp.appearance = appearance
        let root = ContentView()
            .background(Color(nsColor: .windowBackgroundColor))
            .environment(\.colorScheme, dark ? .dark : .light)
        let host = NSHostingView(rootView: root)
        host.frame = NSRect(origin: .zero, size: host.fittingSize)
        let window = NSWindow(contentRect: host.frame, styleMask: [.titled, .fullSizeContentView],
                              backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true
        window.appearance = appearance
        window.contentView = host
        // Let the async Safari state query land before drawing.
        RunLoop.main.run(until: Date().addingTimeInterval(1.5))
        host.frame = NSRect(origin: .zero, size: host.fittingSize)
        host.layoutSubtreeIfNeeded()
        let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds)!
        host.cacheDisplay(in: host.bounds, to: rep)
        let url = URL(fileURLWithPath: "\(outDir)/\(name).png")
        try! rep.representation(using: .png, properties: [:])!.write(to: url)
        print("wrote \(url.path) (\(rep.pixelsWide)x\(rep.pixelsHigh))")
    }
}
