import Foundation

/// Documents stay outside the application bundle; replacing the app never replaces this folder.
final class TrackerStorage {
    let directory: URL
    let file: URL
    let backups: URL
    private let version: String
    private let fileManager = FileManager.default
    private(set) var ready = false

    init(directory: URL, version: String) {
        self.directory = directory
        self.file = directory.appendingPathComponent("data.json")
        self.backups = directory.appendingPathComponent("Backups", isDirectory: true)
        self.version = version.replacingOccurrences(of: "/", with: "-")
    }

    static func validate(_ data: Data) throws {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["students"] is [Any], object["records"] is [String: Any] else {
            throw StorageError.invalidState
        }
    }

    private func write(_ data: Data, to destination: URL) throws {
        try fileManager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: destination, options: [.atomic])
        try fileManager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: destination.path)
    }

    @discardableResult
    private func snapshotOnce(_ name: String, data: Data) throws -> URL {
        let destination = backups.appendingPathComponent(name)
        if !fileManager.fileExists(atPath: destination.path) { try write(data, to: destination) }
        return destination
    }

    func load() -> [String: Any] {
        var originalError: Error?
        var primaryMissing = false
        var validPrimary: Data?
        do {
            let data = try Data(contentsOf: file)
            try Self.validate(data)
            validPrimary = data
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            primaryMissing = true
        } catch { originalError = error }
        if let data = validPrimary {
            do {
                let backup = try snapshotOnce("before-version-\(version).json", data: data)
                ready = true
                return ["ok": true, "found": true, "base64": data.base64EncodedString(), "backupPath": backup.path]
            } catch {
                ready = false
                return ["ok": false, "found": true, "base64": "", "error": "The safety backup could not be created. Existing progress is unchanged. \(error.localizedDescription)"]
            }
        }
        let candidates: [URL]
        do {
            candidates = try fileManager.contentsOfDirectory(at: backups, includingPropertiesForKeys: [.contentModificationDateKey])
                .filter { $0.pathExtension == "json" && !$0.lastPathComponent.hasPrefix("unreadable-") }
                .sorted {
                    let left = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                    let right = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                    return left > right
                }
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            candidates = []
        } catch {
            candidates = []
            originalError = originalError ?? error
        }
        for candidate in candidates {
            if let data = try? Data(contentsOf: candidate), (try? Self.validate(data)) != nil {
                ready = true
                return ["ok": true, "found": true, "base64": data.base64EncodedString(), "recovered": true, "backupPath": candidate.path]
            }
        }
        if primaryMissing && originalError == nil && candidates.isEmpty {
            ready = true
            return ["ok": true, "found": false, "base64": ""]
        }
        ready = false
        return ["ok": false, "found": true, "base64": "", "error": "Saved progress could not be opened safely. Your existing files have been kept. Open the Backups folder or restore a full backup. \(originalError?.localizedDescription ?? "No readable backup was found.")"]
    }

    func save(_ data: Data, restoring: Bool = false) throws {
        guard ready || restoring else { throw StorageError.loadNotReady }
        try Self.validate(data)
        if fileManager.fileExists(atPath: file.path) {
            let previous = try Data(contentsOf: file)
            if previous != data {
                if (try? Self.validate(previous)) != nil {
                    let date = ISO8601DateFormatter().string(from: Date()).prefix(10)
                    try snapshotOnce("daily-\(date).json", data: previous)
                    if restoring { try snapshotOnce("before-restore-\(UUID().uuidString).json", data: previous) }
                    try write(previous, to: backups.appendingPathComponent("previous-save.json"))
                } else {
                    try snapshotOnce("unreadable-\(UUID().uuidString).json", data: previous)
                }
            }
        }
        try write(data, to: file)
        ready = true
    }
}

private enum StorageError: LocalizedError {
    case invalidState
    case loadNotReady
    var errorDescription: String? {
        switch self {
        case .invalidState: return "The saved file is not a valid class backup. Existing records have been kept."
        case .loadNotReady: return "Progress is protected because it has not loaded safely. Restore a valid backup before saving."
        }
    }
}
