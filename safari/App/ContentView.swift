import SwiftUI

/// The whole app: what Machina for Safari does, whether it is on, and the
/// three steps to start saving. System colors and materials only, so light
/// and dark mode both come for free. No em dashes in any string a user reads
/// (house rule, same as the app and the extension).
struct ContentView: View {
    @StateObject private var status = ExtensionStatus()

    var body: some View {
        VStack(spacing: 0) {
            header
                .padding(.top, 20)
                .padding(.bottom, 20)

            StatusPill(state: status.state)
                .padding(.bottom, 22)

            VStack(alignment: .leading, spacing: 14) {
                Step(number: 1,
                     title: "Turn on Machina in Safari",
                     detail: "In Safari Settings, open Extensions and tick Machina.")
                Step(number: 2,
                     title: "Connect your library",
                     detail: "Click the Machina button in Safari’s toolbar. In the tab that opens, paste your token from Machina: Settings, then Browser extension.")
                Step(number: 3,
                     title: "Save with one click",
                     detail: "Click the Machina button on any page, or right-click a link or selected text. If Safari asks, allow Machina on that website.")
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .padding(.horizontal, 28)

            VStack(spacing: 10) {
                Button {
                    status.openSafariSettings()
                } label: {
                    Text(status.state == .on ? "Open Safari Settings" : "Turn On in Safari Settings")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .keyboardShortcut(.defaultAction)

                Button("Get your token at mymachina.app") { Links.open(Links.web) }
                    .buttonStyle(.link)
            }
            .padding(.horizontal, 28)
            .padding(.top, 22)

            HStack(spacing: 14) {
                Button("Privacy Policy") { Links.open(Links.privacy) }
                Text("·").foregroundStyle(.tertiary)
                Button("Help") { Links.open(Links.support) }
            }
            .buttonStyle(.link)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .padding(.top, 22)
            .padding(.bottom, 18)
        }
        // Fixed width, height from the content: nothing can clip if a string
        // grows (or a user runs a larger text size).
        .frame(width: 460)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var header: some View {
        VStack(spacing: 10) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .interpolation(.high)
                .frame(width: 92, height: 92)
                .accessibilityHidden(true)
            Text("Machina for Safari")
                .font(.system(size: 22, weight: .semibold))
            Text("Save any page, link, or selection to your Machina library in one click.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 44)
        }
    }
}

private struct StatusPill: View {
    let state: ExtensionStatus.State

    var body: some View {
        HStack(spacing: 7) {
            if state == .checking {
                ProgressView().controlSize(.small)
            } else {
                Circle()
                    .fill(state == .on ? Color.green : Color.secondary.opacity(0.6))
                    .frame(width: 8, height: 8)
            }
            Text(text)
                .font(.callout.weight(.medium))
                .foregroundStyle(state == .on ? .primary : .secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
        .background(.quaternary.opacity(0.6), in: Capsule())
        .accessibilityElement(children: .combine)
        .animation(.easeOut(duration: 0.2), value: state)
    }

    private var text: String {
        switch state {
        case .checking: return "Checking Safari"
        case .on: return "Machina is on in Safari"
        case .off: return "Machina is off in Safari"
        case .unknown: return "Not turned on in Safari yet"
        }
    }
}

private struct Step: View {
    let number: Int
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("\(number)")
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .frame(width: 22, height: 22)
                .background(.quaternary, in: Circle())
                .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.body.weight(.semibold))
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    ContentView()
}
