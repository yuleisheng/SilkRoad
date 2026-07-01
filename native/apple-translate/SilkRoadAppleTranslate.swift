import Foundation
import NaturalLanguage
import Translation

struct TranslationInput: Decodable {
    let text: String
    let targetLanguage: String?
}

struct TranslationOutput: Encodable {
    let text: String
    let providerId: String
}

struct TranslationFailure: Encodable {
    let error: String
}

@main
struct SilkRoadAppleTranslate {
    static func main() async {
        do {
            let input = try readInput()
            let trimmed = input.text.trimmingCharacters(in: .whitespacesAndNewlines)

            guard !trimmed.isEmpty else {
                try writeOutput(TranslationOutput(text: "", providerId: "apple-system"))
                return
            }

            let target = targetLanguage(from: input.targetLanguage)
            let source = detectedLanguage(for: trimmed, target: target)

            if isSameLanguage(source, target) {
                try writeOutput(TranslationOutput(text: trimmed, providerId: "apple-system"))
                return
            }

            if #available(macOS 26.0, *) {
                let session = TranslationSession(installedSource: source, target: target)
                let response = try await session.translate(trimmed)
                try writeOutput(TranslationOutput(text: response.targetText, providerId: "apple-system"))
            } else {
                throw RuntimeError("Apple Translation requires macOS 26 or later.")
            }
        } catch {
            writeFailure(error)
            exit(1)
        }
    }

    static func readInput() throws -> TranslationInput {
        let data = FileHandle.standardInput.readDataToEndOfFile()
        return try JSONDecoder().decode(TranslationInput.self, from: data)
    }

    static func writeOutput<T: Encodable>(_ output: T) throws {
        let data = try JSONEncoder().encode(output)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }

    static func writeFailure(_ error: Error) {
        let failure = TranslationFailure(error: error.localizedDescription)
        if let data = try? JSONEncoder().encode(failure) {
            FileHandle.standardError.write(data)
            FileHandle.standardError.write(Data("\n".utf8))
        } else {
            FileHandle.standardError.write(Data(error.localizedDescription.utf8))
            FileHandle.standardError.write(Data("\n".utf8))
        }
    }

    static func targetLanguage(from label: String?) -> Locale.Language {
        let normalized = (label ?? "简体中文").lowercased()

        if normalized.contains("简体") || normalized.contains("zh-hans") || normalized.contains("zh-cn") {
            return Locale.Language(identifier: "zh-Hans")
        }
        if normalized.contains("繁體") || normalized.contains("繁体") || normalized.contains("zh-hant") || normalized.contains("zh-tw") {
            return Locale.Language(identifier: "zh-Hant")
        }
        if normalized.contains("english") || normalized == "en" {
            return Locale.Language(identifier: "en")
        }
        if normalized.contains("日本") || normalized == "ja" {
            return Locale.Language(identifier: "ja")
        }
        if normalized.contains("한국") || normalized.contains("korean") || normalized == "ko" {
            return Locale.Language(identifier: "ko")
        }
        if normalized.contains("français") || normalized.contains("french") || normalized == "fr" {
            return Locale.Language(identifier: "fr")
        }
        if normalized.contains("deutsch") || normalized.contains("german") || normalized == "de" {
            return Locale.Language(identifier: "de")
        }
        if normalized.contains("spanish") || normalized.contains("español") || normalized == "es" {
            return Locale.Language(identifier: "es")
        }

        return Locale.Language(identifier: normalized)
    }

    static func detectedLanguage(for text: String, target: Locale.Language) -> Locale.Language {
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(text)

        guard let language = recognizer.dominantLanguage else {
            return Locale.Language(identifier: "en")
        }

        if language == .simplifiedChinese {
            return Locale.Language(identifier: "zh-Hans")
        }
        if language == .traditionalChinese {
            return Locale.Language(identifier: "zh-Hant")
        }

        return Locale.Language(identifier: language.rawValue)
    }

    static func isSameLanguage(_ lhs: Locale.Language, _ rhs: Locale.Language) -> Bool {
        lhs.minimalIdentifier == rhs.minimalIdentifier
    }
}

struct RuntimeError: LocalizedError {
    let message: String

    init(_ message: String) {
        self.message = message
    }

    var errorDescription: String? {
        message
    }
}
