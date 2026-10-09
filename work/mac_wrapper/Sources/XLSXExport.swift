import Foundation

struct XLSXExport {
    static let mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    static let maximumBytes = 20_000_000
    static let maximumBase64Length = 4 * ((maximumBytes + 2) / 3)
    let filename: String
    let data: Data

    init(payload: Any) throws {
        guard let payload = payload as? [String: Any], payload["asset"] == nil,
              let filename = payload["filename"] as? String, !filename.isEmpty,
              filename == filename.trimmingCharacters(in: .whitespacesAndNewlines),
              filename.utf8.count <= 240, !filename.hasPrefix("."),
              filename.rangeOfCharacter(from: CharacterSet(charactersIn: "\\/:*?\"<>|")) == nil,
              !filename.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }),
              filename.range(of: "^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\.|$)", options: [.regularExpression, .caseInsensitive]) == nil,
              filename.lowercased().hasSuffix(".xlsx") else {
            throw XLSXExportError.invalidFilename
        }
        for key in ["mimeType", "mime"] {
            if let value = payload[key], value as? String != Self.mimeType { throw XLSXExportError.invalidMimeType }
        }
        guard let base64 = payload["base64"] as? String, !base64.isEmpty,
              base64.utf8.count <= Self.maximumBase64Length,
              let data = Data(base64Encoded: base64), !data.isEmpty,
              data.count <= Self.maximumBytes, data.base64EncodedString() == base64,
              data.starts(with: [0x50, 0x4b, 0x03, 0x04]) else {
            throw XLSXExportError.invalidData
        }
        self.filename = filename
        self.data = data
    }
}

enum XLSXExportError: LocalizedError {
    case invalidFilename, invalidMimeType, invalidData
    var errorDescription: String? {
        switch self {
        case .invalidFilename: return "Use an Excel report filename ending in .xlsx, without folders or special path characters."
        case .invalidMimeType: return "The report must use the Excel workbook file type."
        case .invalidData: return "The Excel report is invalid or larger than 20 MB."
        }
    }
}
