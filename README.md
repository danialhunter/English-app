# EtonHouse English Tracker

An offline desktop app for individual early-years English practice. Version **2.5.0** includes the complete teaching library, weekly lessons, monthly exams, later review and Excel parent reports. **No class, children's names or saved assessment records are included.**

## Install the app

Download the installers from [Release 2.5.0](https://github.com/danialhunter/English-app/releases/tag/v2.5.0):

- [Mac — Intel and Apple Silicon](https://github.com/danialhunter/English-app/releases/download/v2.5.0/EtonHouse-English-Tracker-Mac-2.5.0.dmg), macOS 13 or later.
- [Windows — 64-bit](https://github.com/danialhunter/English-app/releases/download/v2.5.0/EtonHouse-English-Tracker-Windows-Setup-2.5.0.exe), Windows 10 or later.
- [Blank Excel names template](work/seahorse_app/web/assets/Student%20names%20template.xlsx).

The installers are ready to use; teachers do not need Node.js, Python or the source code. Open **Tools → Classes & import names** to create your class, then use the Excel template or **+** to add children. The library is available immediately, even with no class created.

Before updating an existing app, export a full JSON backup, quit the old app, then replace it under the same computer user account. Existing records remain in the original external data folder. A new computer starts empty; moving records requires restoring a full backup. There is no automatic synchronization. Never upload your class backup to this public repository.

The Mac app is ad-hoc signed, not Apple-notarized. Windows is unsigned and was cross-built on macOS, not installed on a real Windows computer during this release's testing. Security warnings may appear; do not disable system-wide protections. See the [Quick Start](work/seahorse_app/Quick%20Start.txt) and [verification report](docs/release-2.5.0/Package%20verification.md).

## Included teaching content and functions

- **216 weekly lessons**, from age 2–3 through age 5–6: five vocabulary targets and one sentence target per lesson.
- The **complete original 44-page teaching PDF**, available offline.
- A searchable library with **647 entries**, **1,096 topic vocabulary terms**, **220 sight words** and **152 functional phrases**, plus grammar, phonics, reading, writing, songs and teaching guidance.
- One mark per target: Needs practice or Knows it. The teacher must press **Finished**; marking everything known alone never completes a lesson.
- Scheduled-week history, same-month early completion and individual monthly exam checkpoints.
- Separate review, pause/resume exams, audited corrections and future goal adjustments.
- Classes, Excel/CSV name import, recoverable child removal, full backup/restore and private one-child Excel reports with separate word and sentence progress graphs.

The generated curriculum, library, report template, spreadsheet runtime, logos and PDF are committed in `work/seahorse_app/web`. They do not depend on a teacher's class or an external server. See [teaching-guide coverage](work/seahorse_app/Teaching%20guide%20coverage.md).

![Application screen — fictional test data only](docs/release-2.5.0/App%20screen.png)

## Source layout

```text
work/seahorse_app/web/          Shared app and complete offline teaching resources
work/seahorse_app/tests/        Synthetic regression tests
work/seahorse_app/scripts/      Optional curriculum/library generation tools
work/manual_curriculum_source/ Curated vocabulary and sentence source data
work/vocab_extract/             Extracted vocabulary source data
work/mac_wrapper/              Native Swift/WebKit app, storage and export bridge
work/windows_wrapper/          Electron app, storage and export bridge
docs/release-2.5.0/             Release verification and testing notes
```

Keep this layout: the build scripts copy the shared app into each wrapper. Generated wrapper copies, dependencies, build outputs, old private backups and temporary test files are intentionally excluded from Git. Installers belong in GitHub Releases, not source history.

## Build from source

Use a current Node.js LTS release (22 or later) for development. Normal desktop builds use the committed curriculum and report template; no regeneration step is required.

### Mac

On macOS with Xcode Command Line Tools:

```sh
zsh work/seahorse_app/package.sh
```

This creates a universal app, DMG and ZIP under `outputs/release-2.5.0/`. It uses an ad-hoc signature; it does not notarize or replace your installed application.

### Windows

```sh
cd work/windows_wrapper
npm ci
npm run dist:win
```

The Setup EXE is written under `outputs/windows-build/`. The command refreshes all shared web/library resources before packaging. For development, `npm start` runs the Electron app. Native development runs use the normal local app data location unless an explicit isolated test directory is configured; do not experiment on a teacher's live records.

### Browser preview

From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory work/seahorse_app/web
```

Visit `http://127.0.0.1:8000`. This is a local development preview; its browser storage is separate from installed app records.

## Verification

From the repository root:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Core tests use synthetic fixtures and the bundled spreadsheet runtime. Browser tests use Playwright's Chromium, or a browser executable supplied through `CHROME_PATH`. Native storage checks are described in the wrapper READMEs. Historical-release migration tests and full package verification need the relevant old archives or built installer outputs; they are separate from the default test command.

Optional library regeneration requires Python with `pypdf`; use `ETON_PYTHON` to select an interpreter. The optional report-template authoring script uses `@oai/artifact-tool` in a compatible Codex environment. That authoring tool is **not required** to run, build or export reports from this app—the generated template is already included.

## Privacy and rights

The production seed has empty classes, children, records and exam rounds. Examples in tests and the screenshot are fictional. Personal backups and teacher records must stay outside the repository; `.gitignore` adds safeguards but is not a substitute for checking files before publishing.

The supplied EtonHouse marks, teaching PDF and curriculum retain their respective owners' rights. This repository does not grant a new license to those materials. Third-party software notices are retained in `web/vendor`.

