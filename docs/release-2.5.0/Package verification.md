# Release 2.5.0 package verification

Built and verified on macOS on 9 October 2026. This release implements the simplified teacher workflow, individual monthly progression, separate review records and two-chart parent reports. Test records were fictional; the live teacher data folder was not accessed.

## Downloadable packages

- **Mac:** `EtonHouse-English-Tracker-Mac-2.5.0.dmg` and the alternative `.app.zip`. Application version 2.5.0, build 250; universal Apple Silicon + Intel executable, minimum macOS 13.
- **Windows:** `EtonHouse-English-Tracker-Windows-Setup-2.5.0.exe`. NSIS installer with the verified Windows x64 Electron payload. The installer bootstrap executable is 32-bit; the installed application is 64-bit.
- The Excel names template, Quick Start, release notes, teaching-guide coverage and testing notes accompany the installers. `App screen.png` uses a fictional QA class and is not an installation seed.

## Package integrity and privacy

- All **19 public web files** in the Mac application, downloadable Mac ZIP and Windows ASAR match final production source byte for byte, including the new review model.
- The DMG checksum is valid. Its read-only mounted app matches the verified build recursively, including the signature; its Quick Start and names template match source.
- The actual downloadable Windows installer was extracted. Its embedded `app-64.7z` contains an ASAR and x64 executable that match the verified unpacked build byte for byte.
- The full teaching PDF matches the supplied original exactly. The Excel names template is unchanged. Release notes and Quick Start match source.
- The seed is schema 7/version 2.5.0 with no children or practice records. Package contents pass the public-file allowlist: no `data.json`, backup directories or private fixtures ship inside either application.
- Original Mac bundle ID, Windows app ID, package name and data-directory identities remain unchanged. Windows retains `deleteAppDataOnUninstall: false`.
- Previous release folders and installers were retained; no historical release was overwritten.

## Isolated storage and runtime verification

- **Mac native storage:** upgrade/reinstall preservation, immutable version-specific safety copies, recovery, blocked invalid saves, explicit restore, recoverable deletion, saved exam answers and schema 7 review/goal/correction fields passed. An isolated new installation has no inherited records.
- **Mac native XLSX bridge:** workbook transport, safe names, base64 validation, ZIP signature and exact 20 MB boundary passed.
- **Windows-wrapper tests on macOS:** all **17 tests passed**, including schema 7 byte preservation through save/reinstall/restore and refusal by the released 2.4.2 model without altering newer data.
- **Hidden Electron smoke on macOS:** an old synthetic record loads and migrates, notes save to disk, relaunch retains records, `before-version-2.5.0.json` preserves original bytes, marks wait for explicit Finished, completed history survives advancement, and a separate fresh install is empty.
- **Final native Mac WebKit historical-data test:** 25 synthetic children with saved practice/exams; child switch **17 ms**, Knows it **14 ms**, Needs practice **13 ms**, next week **13 ms**, last unlocked week **14 ms**, blocked next month **6 ms**. All were below the local 350 ms regression threshold. Marks and locks were correct; saved exam history remained unchanged. These are local measurements, not a guarantee for every computer.
- Production model, workflow, source-PDF and report checks are described in `Testing notes.md` and `work/seahorse_app/tests/AUDIT-2.5.0.md`.

## Upgrade safety

Quit the previous app and export a full JSON backup before updating. Replacing the application under the same computer user account keeps records in the existing external data directory. On first loading existing data, 2.5.0 makes the immutable `Backups/before-version-2.5.0.json` before web migration. Reinstalling does not overwrite that safety copy. Automatic copies on the same disk do not replace a separate backup. Moving computers requires restoring a full JSON backup; the installer and parent reports do not transfer records. Update all computers that restore a schema 7 backup and do not downgrade.

## Signing and platform limitations

The Mac app passes ad-hoc signature verification, but it is not Developer ID signed or Apple-notarized; Gatekeeper assessment rejects the unidentified build until the user allows it. The Windows installer is unsigned and may show SmartScreen or unknown-publisher warnings. Do not disable system-wide security protections.

Windows was cross-built on macOS and has **not been installed on a real Windows computer** here. Electron-on-macOS checks verify its shared application and bridge but do not substitute for a Windows-host installation test. A teacher pilot remains necessary to assess real classroom usability and educational usefulness.

## SHA-256

```text
16f4b2bedbcae19bdce3eb40c4afe1b7d3f1e6731f90f3e4add29dc7b47d5cc6  EtonHouse-English-Tracker-Mac-2.5.0.dmg
6107f25fa987d28383d6d74f13a4fd4d027300779e36f037cec21970c98c5a4c  EtonHouse-English-Tracker-Mac-2.5.0.app.zip
5b9afa65465015ef77e356aafb3ee3c8539f4718b5073d76cba14e676f1a30f0  EtonHouse-English-Tracker-Windows-Setup-2.5.0.exe
```
