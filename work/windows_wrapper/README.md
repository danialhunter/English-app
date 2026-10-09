# EtonHouse English Tracker Windows wrapper

Version 2.5.0 wraps the offline class tracker in Electron and creates a real NSIS installer for 64-bit Windows 10/11. It uses the same lessons, class importer and progress model as the Mac app. Display names are EtonHouse English Tracker, with the exact supplied school logo; package name and application ID intentionally keep their legacy identifiers so existing progress and upgrade detection are retained. No classroom names or recorded progress are included in the installer.

## What it saves
- The original Electron userData folder is preserved (normally `%APPDATA%\seahorse-english-tracker\data.json`). An existing file in the previously documented `%APPDATA%\Seahorse English Tracker\data.json` location is also detected and reused.
- Installation and uninstallation leave user data in place (`deleteAppDataOnUninstall: false`). Reinstall with the same Windows user account to reopen progress.
- The immutable `Backups/before-version-2.5.0.json` snapshot is made before web migration; daily backups, the previous save, and before-restore backups also stay in `Backups`. Writes are atomic, ordered and flushed before the app exits. Invalid state cannot overwrite records. Unreadable state recovers from the newest valid backup, or blocks saving until a valid full backup is explicitly restored.
- Backup/CSV export opens native Save dialogs
- All progress logic is still handled by the same web app code under `seahorse_app/web`.

## Build and run on Windows

1. Open Command Prompt or PowerShell in `work/windows_wrapper`
2. Install dependencies:
   - `npm ci`
3. Build a Windows installer:
   - `npm run dist:win`
   - If you are on Windows and prefer one step, run `build-windows.bat`.
4. The installer appears under:
   - `...\outputs\windows-build\EtonHouse-English-Tracker-Windows-Setup-2.5.0.exe`

The installer is unsigned because a Windows publisher certificate is not available. Windows may display its unknown-publisher/SmartScreen prompt. Do not claim the package is signed or that it has been tested on Windows unless an actual Windows host is used.

`npm test` verifies upgrade/reinstall preservation, save ordering, backup recovery and blocked writes using temporary synthetic records. Set `SEAHORSE_TEST_DATA_DIRECTORY` to an absolute temporary folder when testing the Electron UI on any platform; existing personal data must never be used for UI test mutations.

The web model now uses schema 7. The native store writes valid state unchanged, including reviews and correction history. The released 2.4.2 model rejects schema 7 without altering it; update every computer that restores a new backup and do not downgrade.

## Run in development mode

```bash
npm install
npm start
```

`prepare-web.js` copies the current `../seahorse_app/web` (including `model.js`, importer, vendor and template assets) before every build. The build scripts work from any current directory. The installer is cross-built on macOS with Electron Builder; the production Electron binary packaged into it targets Windows x64.

The preload exposes the existing `window.webkit.messageHandlers` bridge plus `window.SeahorseDesktop.onDataLoaded`, `onSaveResult`, `onExportResult` and `onError` callback subscriptions. Register these before sending `appReady`; subscriptions safely cross Electron context isolation. Loaded data includes `{ ok, found, base64, error?, recovered?, backupPath? }`. `saveData` accepts either state JSON or `{json,restore:true}` for explicit recovery, and acknowledges success only after the atomic disk write. Template export supports `{asset:"Student names template.xlsx"}` and `{base64,filename,mime}`.

`openGuide` opens the bundled `teacher-guide.pdf` in the system viewer. A copy is placed in the system temporary folder because PDF viewers cannot read Electron archives directly. Backup export accepts both legacy Seahorse and current EtonHouse envelope labels, preserving all metadata bytes.
