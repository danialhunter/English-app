# EtonHouse English Tracker macOS wrapper

AppKit/WKWebView shell for an offline classroom app. EtonHouse version 2.5.0 supports Apple Silicon and Intel Macs running macOS 13 or newer. The full supplied school logo appears in the app icon unchanged on a white tile. Branding changes only display names: the app deliberately retains the original bundle ID `local.seahorse.english-tracker` and saves tracker JSON at the unchanged path:

`~/Library/Application Support/Seahorse English Tracker/data.json`

## Build

```sh
./build.sh
open "build/EtonHouse English Tracker.app"
```

The build is ad-hoc signed, not Apple notarized. On another Mac, the user may need to allow the app through System Settings → Privacy & Security after the first attempt to open it. A Developer ID certificate and notarization are needed for a warning-free public download.

Installing or replacing the app under the same computer user account does not delete progress. Quit the previous tracker before opening EtonHouse; startup refuses to run alongside another app with the same storage identity. Before sending existing data to the web model for migration, version 2.5.0 creates the immutable `Backups/before-version-2.5.0.json` beside `data.json`. Changed saves retain a daily snapshot and the previous successful save. Restore additionally keeps a uniquely named copy of the outgoing data. If the primary is unreadable, the app tries the newest valid backup; without one, it blocks saves so an empty class cannot overwrite records. Automatic backups stay on the same computer. Moving to another computer or user account requires exporting and restoring a full JSON backup; the installer and Excel family reports do not transfer progress.

Version 2.5.0 uses web state schema 7. The native store validates only the top-level state shape and writes the complete JSON unchanged, including saved exam answers, scoring provenance, independent review observations and correction history. The web model owns migration and semantic validation. The released 2.4.2 app refuses schema 7 instead of discarding newer fields. Update every computer that restores a new backup and do not downgrade. Never delete or rename the Application Support folder during an upgrade.

Run storage tests with `zsh test-storage.sh`. For isolated native UI tests only, launch the executable with `SEAHORSE_TEST_DATA_DIRECTORY` set to an absolute temporary directory. This also disables persistent WebKit browser storage and labels the window “Isolated test”. Never use the actual Application Support folder for test fixtures.

## Web bridge contract

The bundled app must send messages from its main frame using `window.webkit.messageHandlers.<name>.postMessage(payload)`.

- `saveData`: accepts a class-state JSON string, object, or `{ json: "..." }`. State must contain a students array and records object. Valid state is written atomically. An explicit full restore uses `{ json, restore: true }` to recover from a blocked load.
- `appReady`: payload is ignored. Calls `window.onNativeDataLoaded(base64, found, metadata)`, or `window.SeahorseNative.onDataLoaded` if needed, or the fallback `seahorse-native-data-loaded` event. Only one path runs to avoid duplicate hydration. Metadata includes `ok`, optional `error`, optional `recovered`, and optional `backupPath`. A failed load must not be treated as a new installation.
- `exportBackup`: accepts the same payloads as `saveData`. A null payload exports the last persisted JSON. Optional `{ json, filename }` supplies a filename.
- `exportCSV`: accepts CSV text or `{ csv, filename }` and presents the macOS save panel.
- `exportFile`: accepts `{ asset: "Student names template.xlsx" }` for the single allowed bundled asset, or `{ base64, filename, mimeType }` (`mime` is also accepted) for an XLSX workbook up to 20,000,000 decoded bytes. It requires canonical base64, a ZIP workbook signature, and a safe `.xlsx` filename without a path. Cancellation is reported separately from a successful file save.
- `openBackups`: opens the automatic backup folder.
- `openGuide`: opens only the bundled `web/assets/teacher-guide.pdf` in the system PDF viewer; no arbitrary file path is accepted.

Save completion calls `onNativeSaveResult(ok, message)` and emits both `seahorse-native-save-result` and `seahorse:save-result` with `{ ok, error }`, only after the disk write. Other result events are `seahorse-native-export-result` and `seahorse-native-error`.

Replace the files under `web/` with the production static web build, retaining `index.html`, then rerun `build.sh`.
