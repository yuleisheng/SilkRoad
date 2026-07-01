import AppKit
import Foundation
import SwiftUI
import Translation

struct TranslationUICommand: Decodable {
    let id: String
    let text: String
    let anchorRect: ScreenRect?
}

struct ScreenRect: Decodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct TranslationUIResponse: Encodable {
    let id: String
    let ok: Bool
    let providerId: String
    let presentation: String?
    let replacement: String?
    let error: String?
}

@available(macOS 26.0, *)
final class TranslationUIState: ObservableObject {
    @Published var isPresented = false
    @Published var text = ""
    var activeRequestId: String?
}

@available(macOS 26.0, *)
struct TranslationUIHostView: View {
    @ObservedObject var state: TranslationUIState
    let onReplacement: (String) -> Void

    var body: some View {
        Color.clear
            .frame(width: 2, height: 2)
            .translationPresentation(
                isPresented: $state.isPresented,
                text: state.text,
                attachmentAnchor: .point(.center),
                arrowEdge: .bottom,
                replacementAction: onReplacement
            )
    }
}

private var appDelegateRetainer: SilkRoadTranslationUIAppDelegate?

@main
struct SilkRoadTranslationUIApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = SilkRoadTranslationUIAppDelegate()
        appDelegateRetainer = delegate
        app.delegate = delegate
        app.run()
    }
}

final class SilkRoadTranslationUIAppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var state: AnyObject?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        configureWindow()
        startInputLoop()
    }

    private func configureWindow() {
        guard #available(macOS 26.0, *) else {
            return
        }

        let state = TranslationUIState()
        self.state = state

        let hostingController = NSHostingController(
            rootView: TranslationUIHostView(state: state) { [weak self] replacement in
                self?.sendReplacement(replacement)
            }
        )

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 2, height: 2),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.contentViewController = hostingController
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.ignoresMouseEvents = true
        window = panel
    }

    private func startInputLoop() {
        DispatchQueue.global(qos: .userInitiated).async {
            while let line = readLine() {
                guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    continue
                }

                do {
                    let data = Data(line.utf8)
                    let command = try JSONDecoder().decode(TranslationUICommand.self, from: data)
                    DispatchQueue.main.async {
                        self.present(command)
                    }
                } catch {
                    self.writeResponse(
                        TranslationUIResponse(
                            id: "unknown",
                            ok: false,
                            providerId: "apple-system",
                            presentation: nil,
                            replacement: nil,
                            error: error.localizedDescription
                        )
                    )
                }
            }

            DispatchQueue.main.async {
                NSApp.terminate(nil)
            }
        }
    }

    private func present(_ command: TranslationUICommand) {
        guard #available(macOS 26.0, *) else {
            writeResponse(
                TranslationUIResponse(
                    id: command.id,
                    ok: false,
                    providerId: "apple-system",
                    presentation: nil,
                    replacement: nil,
                    error: "Apple Translation UI requires macOS 26 or later."
                )
            )
            return
        }

        guard let state = state as? TranslationUIState, let window else {
            writeResponse(
                TranslationUIResponse(
                    id: command.id,
                    ok: false,
                    providerId: "apple-system",
                    presentation: nil,
                    replacement: nil,
                    error: "Apple Translation UI helper is not ready."
                )
            )
            return
        }

        state.activeRequestId = command.id
        state.text = command.text
        state.isPresented = false

        window.setFrame(anchorFrame(from: command.anchorRect), display: true)
        window.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            state.isPresented = true
        }

        writeResponse(
            TranslationUIResponse(
                id: command.id,
                ok: true,
                providerId: "apple-system",
                presentation: "system-ui",
                replacement: nil,
                error: nil
            )
        )
    }

    private func sendReplacement(_ replacement: String) {
        guard #available(macOS 26.0, *),
              let state = state as? TranslationUIState,
              let requestId = state.activeRequestId
        else {
            return
        }

        writeResponse(
            TranslationUIResponse(
                id: requestId,
                ok: true,
                providerId: "apple-system",
                presentation: "system-ui",
                replacement: replacement,
                error: nil
            )
        )
    }

    private func anchorFrame(from rect: ScreenRect?) -> NSRect {
        let size = NSSize(width: 2, height: 2)
        guard let rect else {
            let mouseLocation = NSEvent.mouseLocation
            return NSRect(
                x: mouseLocation.x,
                y: mouseLocation.y,
                width: size.width,
                height: size.height
            )
        }

        let screen = screenContaining(rect) ?? NSScreen.main
        let screenMaxY = screen?.frame.maxY ?? 0
        let anchorX = rect.x + rect.width / 2
        let anchorY = screenMaxY - rect.y

        return NSRect(
            x: anchorX,
            y: anchorY,
            width: size.width,
            height: size.height
        )
    }

    private func screenContaining(_ rect: ScreenRect) -> NSScreen? {
        NSScreen.screens.first { screen in
            let topLeftRect = NSRect(
                x: rect.x,
                y: screen.frame.maxY - rect.y - rect.height,
                width: rect.width,
                height: rect.height
            )
            return screen.frame.intersects(topLeftRect)
        }
    }

    private func writeResponse(_ response: TranslationUIResponse) {
        do {
            let data = try JSONEncoder().encode(response)
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
        } catch {
            FileHandle.standardError.write(Data(error.localizedDescription.utf8))
            FileHandle.standardError.write(Data("\n".utf8))
        }
    }
}
