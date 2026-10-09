import AppKit
import Foundation
import UniformTypeIdentifiers
import WebKit

private enum BridgeMessage: String, CaseIterable {
    case saveData
    case exportBackup
    case exportCSV
    case exportFile
    case openBackups
    case openGuide
    case appReady
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!

    private let fileManager = FileManager.default
    private let storageFolderName = "Seahorse English Tracker"
    private let storageFileName = "data.json"
    private lazy var storage: TrackerStorage? = storageDirectoryURL.map {
        TrackerStorage(directory: $0, version: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "2.5.0")
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        if ProcessInfo.processInfo.environment["SEAHORSE_TEST_DATA_DIRECTORY"] == nil,
           let bundleIdentifier = Bundle.main.bundleIdentifier,
           NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier).contains(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            NSApp.activate(ignoringOtherApps: true)
            let alert = NSAlert()
            alert.messageText = "Quit the other tracker before opening this version"
            alert.informativeText = "Another version of the English tracker is open. Quit it, then reopen EtonHouse English Tracker so both apps do not change the same class records."
            alert.addButton(withTitle: "OK")
            alert.runModal()
            NSApp.terminate(nil)
            return
        }
        installMainMenu()
        createWindowAndWebView()
        loadBundledApp()
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        guard webView != nil else { return }
        for message in BridgeMessage.allCases {
            webView.configuration.userContentController.removeScriptMessageHandler(forName: message.rawValue)
        }
    }

    private func createWindowAndWebView() {
        let contentController = WKUserContentController()
        for message in BridgeMessage.allCases {
            contentController.add(self, name: message.rawValue)
        }

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController
        configuration.websiteDataStore = ProcessInfo.processInfo.environment["SEAHORSE_TEST_DATA_DIRECTORY"] == nil ? .default() : .nonPersistent()

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1240, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "EtonHouse English Tracker"
        if ProcessInfo.processInfo.environment["SEAHORSE_TEST_DATA_DIRECTORY"] != nil {
            window.title = "EtonHouse English Tracker — Isolated test"
        }
        window.minSize = NSSize(width: 840, height: 620)
        window.setFrameAutosaveName(ProcessInfo.processInfo.environment["SEAHORSE_TEST_DATA_DIRECTORY"] == nil ? "SeahorseEnglishTrackerMainWindow" : "EtonHouseEnglishTrackerIsolatedTestWindow")
        window.center()
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
    }

    private func loadBundledApp() {
        guard
            let resourceURL = Bundle.main.resourceURL,
            let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web")
        else {
            showFatalPage("The bundled web/index.html file is missing.")
            return
        }

        let webFolder = resourceURL.appendingPathComponent("web", isDirectory: true)
        NSLog("Loading tracker UI from %@", indexURL.path)
        webView.loadFileURL(indexURL, allowingReadAccessTo: webFolder)
    }

    private func showFatalPage(_ message: String) {
        let safeMessage = message
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        webView.loadHTMLString(
            "<main style='font:16px -apple-system;padding:32px'><h1>Unable to start</h1><p>\(safeMessage)</p></main>",
            baseURL: nil
        )
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let bridgeMessage = BridgeMessage(rawValue: message.name) else {
            return
        }
        NSLog("Received web bridge message: %@", message.name)

        switch bridgeMessage {
        case .saveData:
            saveData(from: message.body)
        case .exportBackup:
            exportBackup(from: message.body)
        case .exportCSV:
            exportCSV(from: message.body)
        case .exportFile:
            exportFile(from: message.body)
        case .openBackups:
            openBackupsFolder()
        case .openGuide:
            if let guideURL = Bundle.main.url(forResource: "teacher-guide", withExtension: "pdf", subdirectory: "web/assets") {
                if !NSWorkspace.shared.open(guideURL) { report(BridgeError.guideUnavailable, operation: "open the teaching guide") }
            } else { report(BridgeError.guideUnavailable, operation: "open the teaching guide") }
        case .appReady:
            sendPersistedDataToJavaScript()
        }
    }

    private var storageDirectoryURL: URL? {
        if let isolatedDirectory = ProcessInfo.processInfo.environment["SEAHORSE_TEST_DATA_DIRECTORY"], isolatedDirectory.hasPrefix("/") {
            return URL(fileURLWithPath: isolatedDirectory, isDirectory: true)
        }
        return fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent(storageFolderName, isDirectory: true)
    }

    private var storageFileURL: URL? {
        storageDirectoryURL?.appendingPathComponent(storageFileName, isDirectory: false)
    }

    private func saveData(from body: Any) {
        do {
            let data = try jsonData(from: body)
            guard let storage else {
                throw BridgeError.storageLocationUnavailable
            }
            try storage.save(data, restoring: dictionary(from: body)?["restore"] as? Bool == true)
            notifySaveResult(ok: true)
        } catch {
            notifySaveResult(ok: false, message: error.localizedDescription)
            report(error, operation: "save")
        }
    }

    private func sendPersistedDataToJavaScript() {
        let metadata = storage?.load() ?? ["ok": false, "found": true, "base64": "", "error": "The Application Support storage folder is unavailable."]
        guard let jsonData = try? JSONSerialization.data(withJSONObject: metadata), let metadataJSON = String(data: jsonData, encoding: .utf8) else { return }
        let script = """
        (() => {
          const metadata = \(metadataJSON);
          const {base64, found} = metadata;
          if (typeof window.onNativeDataLoaded === "function") {
            window.onNativeDataLoaded(base64, found, metadata);
          } else if (window.SeahorseNative && typeof window.SeahorseNative.onDataLoaded === "function") {
            window.SeahorseNative.onDataLoaded(base64, found, metadata);
          } else {
            window.dispatchEvent(new CustomEvent("seahorse-native-data-loaded", { detail: metadata }));
          }
        })();
        """
        webView.evaluateJavaScript(script) { _, error in
            if let error {
                NSLog("Unable to return saved app data to JavaScript: %@", error.localizedDescription)
            }
        }
    }

    private func notifySaveResult(ok: Bool, message: String = "") {
        let detail: [String: Any] = ["ok": ok, "error": message]
        notifyJavaScript(event: "seahorse-native-save-result", detail: detail)
        notifyJavaScript(event: "seahorse:save-result", detail: detail)
        if let text = try? javaScriptLiteral(message) {
            webView.evaluateJavaScript("window.onNativeSaveResult?.(\(ok ? "true" : "false"), \(text));")
        }
    }

    private func exportFile(from body: Any) {
        do {
            if let payload = dictionary(from: body), payload["asset"] as? String == "Student names template.xlsx" {
                guard let assetURL = Bundle.main.url(forResource: "Student names template", withExtension: "xlsx", subdirectory: "web/assets") else {
                    throw BridgeError.invalidFilePayload
                }
                let data = try Data(contentsOf: assetURL)
                presentSavePanel(data: data, defaultName: "Student names template.xlsx", contentType: UTType(filenameExtension: "xlsx") ?? .data, operation: "file", title: "Save Excel template")
                return
            }
            let export = try XLSXExport(payload: body)
            presentSavePanel(data: export.data, defaultName: export.filename, contentType: UTType(filenameExtension: "xlsx") ?? .data, operation: "file", title: "Save Excel report")
        } catch {
            report(error, operation: "file")
        }
    }

    @objc private func openBackupsFolder() {
        guard let storage else { return }
        do {
            try fileManager.createDirectory(at: storage.backups, withIntermediateDirectories: true)
            NSWorkspace.shared.open(storage.backups)
        } catch { report(error, operation: "open backups") }
    }

    private func exportBackup(from body: Any?) {
        do {
            let data: Data
            let requestedFileName: String?

            if let body, !isNullish(body) {
                data = try jsonData(from: body)
                requestedFileName = dictionary(from: body)?["filename"] as? String
            } else if let fileURL = storageFileURL, fileManager.fileExists(atPath: fileURL.path) {
                data = try Data(contentsOf: fileURL)
                requestedFileName = nil
            } else {
                throw BridgeError.noDataToExport
            }

            let defaultName = requestedFileName.flatMap(sanitizedFileName)
                ?? "EtonHouse-English-Tracker-backup-\(dateStamp()).json"
            presentSavePanel(
                data: data,
                defaultName: ensureExtension(defaultName, extension: "json"),
                contentType: .json,
                operation: "backup"
            )
        } catch {
            report(error, operation: "backup")
        }
    }

    private func exportCSV(from body: Any) {
        do {
            let csv: String
            let requestedFileName: String?

            if let dictionary = dictionary(from: body), let value = dictionary["csv"] as? String {
                csv = value
                requestedFileName = dictionary["filename"] as? String
            } else if let value = body as? String {
                csv = value
                requestedFileName = nil
            } else {
                throw BridgeError.invalidCSVPayload
            }

            guard let data = csv.data(using: .utf8) else {
                throw BridgeError.invalidCSVPayload
            }
            let defaultName = requestedFileName.flatMap(sanitizedFileName)
                ?? "EtonHouse-English-Tracker-\(dateStamp()).csv"
            presentSavePanel(
                data: data,
                defaultName: ensureExtension(defaultName, extension: "csv"),
                contentType: .commaSeparatedText,
                operation: "csv"
            )
        } catch {
            report(error, operation: "csv")
        }
    }

    private func jsonData(from body: Any) throws -> Data {
        if let dictionary = dictionary(from: body), let json = dictionary["json"] as? String {
            return try validatedJSONData(json)
        }
        if let json = body as? String {
            return try validatedJSONData(json)
        }
        guard JSONSerialization.isValidJSONObject(body) else {
            throw BridgeError.invalidJSONPayload
        }
        return try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
    }

    private func validatedJSONData(_ json: String) throws -> Data {
        guard let data = json.data(using: .utf8) else {
            throw BridgeError.invalidJSONPayload
        }
        _ = try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
        return data
    }

    private func presentSavePanel(
        data: Data,
        defaultName: String,
        contentType: UTType,
        operation: String,
        title: String? = nil
    ) {
        let panel = NSSavePanel()
        panel.title = title ?? (operation == "csv" ? "Export CSV" : "Export Backup")
        panel.nameFieldStringValue = defaultName
        panel.allowedContentTypes = [contentType]
        panel.allowsOtherFileTypes = false
        panel.canCreateDirectories = true

        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            guard response == .OK, let destination = panel.url else {
                self.notifyJavaScript(event: "seahorse-native-export-result", detail: ["ok": false, "canceled": true, "operation": operation])
                return
            }
            do {
                if operation == "file" && destination.pathExtension.lowercased() != "xlsx" { throw XLSXExportError.invalidFilename }
                try data.write(to: destination, options: [.atomic])
                self.notifyJavaScript(
                    event: "seahorse-native-export-result",
                    detail: ["ok": true, "operation": operation, "filename": destination.lastPathComponent]
                )
            } catch {
                self.report(error, operation: operation)
            }
        }
    }

    private func report(_ error: Error, operation: String) {
        NSLog("Native %@ operation failed: %@", operation, error.localizedDescription)
        notifyJavaScript(
            event: "seahorse-native-error",
            detail: ["operation": operation, "message": error.localizedDescription]
        )

        let alert = NSAlert()
        alert.alertStyle = .warning
        let action = operation == "save" ? "save progress" : operation.hasPrefix("open") ? operation : "export data"
        alert.messageText = "Unable to \(action)"
        alert.informativeText = error.localizedDescription
        alert.addButton(withTitle: "OK")
        if window?.attachedSheet == nil {
            alert.beginSheetModal(for: window)
        }
    }

    private func notifyJavaScript(event: String, detail: [String: Any]) {
        guard
            let eventLiteral = try? javaScriptLiteral(event),
            let detailData = try? JSONSerialization.data(withJSONObject: detail, options: [.sortedKeys]),
            let detailJSON = String(data: detailData, encoding: .utf8)
        else { return }

        webView.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent(\(eventLiteral), { detail: \(detailJSON) }));"
        )
    }

    private func javaScriptLiteral(_ value: String) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: [value])
        guard var json = String(data: data, encoding: .utf8) else {
            throw BridgeError.invalidJSONPayload
        }
        json.removeFirst()
        json.removeLast()
        return json
    }

    private func dictionary(from body: Any) -> [String: Any]? {
        body as? [String: Any]
    }

    private func isNullish(_ value: Any) -> Bool {
        value is NSNull || (value as? String)?.isEmpty == true
    }

    private func sanitizedFileName(_ value: String) -> String? {
        let candidate = value
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return candidate.isEmpty ? nil : candidate
    }

    private func ensureExtension(_ fileName: String, extension requiredExtension: String) -> String {
        fileName.lowercased().hasSuffix(".\(requiredExtension)")
            ? fileName
            : "\(fileName).\(requiredExtension)"
    }

    private func dateStamp() -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    private func installMainMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        let appName = "EtonHouse English Tracker"
        appMenu.addItem(
            withTitle: "About \(appName)",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
            keyEquivalent: ""
        )
        appMenu.addItem(.separator())
        let backupItem = NSMenuItem(
            title: "Export Backup…",
            action: #selector(exportBackupFromMenu(_:)),
            keyEquivalent: "b"
        )
        backupItem.target = self
        appMenu.addItem(backupItem)
        let backupsItem = NSMenuItem(title: "Open Automatic Backups", action: #selector(openBackupsFolder), keyEquivalent: "")
        backupsItem.target = self
        appMenu.addItem(backupsItem)
        appMenu.addItem(.separator())
        appMenu.addItem(
            withTitle: "Quit \(appName)",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        appMenuItem.submenu = appMenu

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu

        NSApp.mainMenu = mainMenu
    }

    @objc private func exportBackupFromMenu(_ sender: Any?) {
        webView.evaluateJavaScript("document.getElementById('exportBackupButton')?.click();")
    }

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.title = "Choose class list or backup"
        panel.prompt = "Choose File"
        panel.allowedContentTypes = [.json, .commaSeparatedText, UTType(filenameExtension: "xlsx") ?? .data]
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "EtonHouse English Tracker"
        alert.informativeText = message
        alert.addButton(withTitle: "Continue")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "EtonHouse English Tracker"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    // Keep navigation inside the bundled app. Explicit http(s) links open in the default browser.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard
            navigationAction.navigationType == .linkActivated,
            let url = navigationAction.request.url,
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https"
        else {
            decisionHandler(.allow)
            return
        }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }
}

@main
private enum SeahorseEnglishTrackerMain {
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.run()
        _fixLifetime(delegate)
    }
}

private enum BridgeError: LocalizedError {
    case invalidJSONPayload
    case invalidCSVPayload
    case invalidFilePayload
    case guideUnavailable
    case storageLocationUnavailable
    case noDataToExport

    var errorDescription: String? {
        switch self {
        case .invalidJSONPayload:
            return "The web app sent data that is not valid JSON. Existing progress was not changed."
        case .invalidCSVPayload:
            return "The web app did not provide valid CSV text."
        case .invalidFilePayload:
            return "The app did not provide a valid file to export."
        case .guideUnavailable:
            return "The teaching guide could not be opened. Check that a PDF viewer is installed."
        case .storageLocationUnavailable:
            return "The Application Support storage folder is unavailable."
        case .noDataToExport:
            return "There is no saved tracker data to export yet."
        }
    }
}
