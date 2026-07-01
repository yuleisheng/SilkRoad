import AppKit
import Foundation
import SwiftUI
import Translation

struct TranslationUICommand: Decodable {
    let id: String
    let text: String
    let targetLanguage: String?
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
    @Published var targetLocaleIdentifier = Locale.current.identifier
    @Published var targetLocaleLanguage: Locale.Language?
    var activeRequestId: String?
}

@available(macOS 26.0, *)
struct TranslationUIHostView: View {
    @ObservedObject var state: TranslationUIState
    let onReplacement: (String) -> Void

    var body: some View {
        Color.clear
            .frame(width: 2, height: 2)
            .environment(\.locale, Locale(identifier: state.targetLocaleIdentifier))
            .translationTask(source: nil, target: state.targetLocaleLanguage) { session in
                try? await session.prepareTranslation()
            }
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
        let targetLocaleIdentifier = normalizeLocaleIdentifier(command.targetLanguage)
        state.targetLocaleIdentifier = targetLocaleIdentifier
        state.targetLocaleLanguage = Locale.Language(identifier: targetLocaleIdentifier)
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

    private func normalizeLocaleIdentifier(_ targetLanguage: String?) -> String {
        guard let targetLanguage else {
            return Locale.current.identifier
        }

        let trimmed = targetLanguage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return Locale.current.identifier
        }

        let normalized = trimmed
            .replacingOccurrences(of: "_", with: "-")
            .lowercased()

        if normalized.contains("简") || normalized.contains("simplified") {
            return "zh-Hans"
        }

        if normalized.contains("繁") || normalized.contains("traditional") {
            return "zh-Hant"
        }

        switch normalized {
        case "中文", "汉语", "漢語", "chinese", "zh", "zh-cn", "zh-hans", "zh-hans-cn":
            return "zh-Hans"
        case "zh-tw", "zh-hk", "zh-mo", "zh-hant", "zh-hant-tw":
            return "zh-Hant"
        case "english", "英语", "英語", "en":
            return "en"
        case "japanese", "日语", "日語", "日本語", "ja":
            return "ja"
        case "korean", "韩语", "韓語", "한국어", "ko":
            return "ko"
        case "french", "法语", "法語", "français", "fr":
            return "fr"
        case "german", "德语", "德語", "deutsch", "de":
            return "de"
        case "spanish", "西班牙语", "西班牙語", "español", "es":
            return "es"
        case "italian", "意大利语", "義大利語", "italiano", "it":
            return "it"
        case "portuguese", "葡萄牙语", "葡萄牙語", "português", "pt":
            return "pt"
        case "russian", "俄语", "俄語", "русский", "ru":
            return "ru"
        default:
            return trimmed.replacingOccurrences(of: "_", with: "-")
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
