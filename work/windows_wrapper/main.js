const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require("electron");
const { join, basename, extname } = require("node:path");
const { pathToFileURL } = require("node:url");
const { existsSync, mkdirSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { TrackerStorage, validateBackup } = require("./storage");
const { parseXlsxExport } = require("./xlsx-export");

const CHANNEL = "seahorse-native";
let mainWindow;
let storage;
let quitting = false;
const indexPath = join(__dirname, "web", "index.html");
const indexURL = pathToFileURL(indexPath).href;
// Display branding must never determine where an existing class is stored.
const legacyDirectory = app.getPath("userData");
const selectedUserDirectory = process.env.SEAHORSE_TEST_DATA_DIRECTORY || legacyDirectory;
const hiddenTestWindow = Boolean(process.env.SEAHORSE_TEST_DATA_DIRECTORY) && process.env.SEAHORSE_TEST_HIDE_WINDOW === "1";
try {
  mkdirSync(selectedUserDirectory, { recursive: true });
  app.setPath("userData", selectedUserDirectory);
  app.setPath("sessionData", selectedUserDirectory);
} catch (error) {
  dialog.showErrorBox("Unable to open your class folder", "Existing records have not been changed. " + error.message);
  app.exit(1);
}
app.setName("EtonHouse English Tracker");

function normalizeSavePayload(payload) {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload.json === "string") return payload.json;
  if (payload && typeof payload.csv === "string") return payload.csv;
  if (payload && typeof payload === "object") return JSON.stringify(payload);
  throw new Error("No file contents were provided.");
}

function filename(value, extension) {
  const clean = String(value || "EtonHouse-English-Tracker").trim().replace(/[\\/:*?"<>|]/g, "-");
  return clean.toLowerCase().endsWith(`.${extension}`) ? clean : `${clean}.${extension}`;
}

function notify(name, detail) {
  if (mainWindow && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send(`${CHANNEL}-${name}`, detail);
}

async function openBackups() {
  await mkdir(storage.backups, { recursive: true });
  const error = await shell.openPath(storage.backups);
  if (error) throw new Error(error);
}

function buildWindow() {
  mainWindow = new BrowserWindow({
    show: !hiddenTestWindow,
    width: 1240, height: 820, minWidth: 840, minHeight: 620,
    title: "EtonHouse English Tracker", backgroundColor: "#f5f6f8",
    webPreferences: { preload: join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    storage.queue.then(() => { quitting = true; app.quit(); }).catch((error) => {
      dialog.showErrorBox("Progress could not be saved", "Save a full backup before closing the app. " + error.message);
    });
  });
  mainWindow.loadFile(indexPath);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.split("#")[0] !== indexURL) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [
      { label: "Save full backup…", accelerator: "CmdOrCtrl+B", click: () => mainWindow.webContents.executeJavaScript("document.getElementById('exportBackupButton')?.click()") },
      { label: "Open automatic backups", click: () => openBackups().catch((error) => dialog.showErrorBox("Unable to open backups", error.message)) },
      { type: "separator" }, { role: "quit" }
    ] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] }
  ]));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.focus(); });
  app.whenReady().then(() => {
    if (hiddenTestWindow) app.dock?.hide();
    // Keep the original Electron userData folder. Older documentation used the display name;
    // if that folder already has records, reopen it instead of creating an empty class.
    const testDirectory = process.env.SEAHORSE_TEST_DATA_DIRECTORY;
    if (testDirectory) app.setPath("userData", testDirectory);
    const originalDirectory = app.getPath("userData");
    const documentedDirectory = join(app.getPath("appData"), "Seahorse English Tracker");
    const selectedDirectory = !testDirectory && !existsSync(join(originalDirectory, "data.json")) && existsSync(join(documentedDirectory, "data.json"))
      ? documentedDirectory : originalDirectory;
    storage = new TrackerStorage(selectedDirectory, app.getVersion());
    ipcMain.handle(`${CHANNEL}-message`, async (event, name, payload) => {
      if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error("Unsupported sender.");
      try {
        if (name === "appReady") {
          notify("data-loaded", await storage.load());
        } else if (name === "saveData") {
          await storage.save(normalizeSavePayload(payload), { restoring: payload?.restore === true });
          notify("save-result", { ok: true });
        } else if (name === "openBackups") {
          await openBackups();
        } else if (name === "openGuide") {
          // External PDF viewers cannot read inside an Electron ASAR archive.
          const guideDirectory = join(app.getPath("temp"), "EtonHouse English Tracker");
          const guidePath = join(guideDirectory, "Teacher's Guide to English Teaching.pdf");
          await mkdir(guideDirectory, { recursive: true });
          await writeFile(guidePath, await readFile(join(__dirname, "web", "assets", "teacher-guide.pdf")));
          const error = await shell.openPath(guidePath);
          if (error) throw new Error(error);
        } else if (["exportBackup", "exportCSV", "exportFile"].includes(name)) {
          let content, extension, defaultName;
          let templateExport = false;
          if (name === "exportFile") {
            if (payload?.asset === "Student names template.xlsx") {
              content = await readFile(join(__dirname, "web", "assets", "Student names template.xlsx"));
              defaultName = "Student names template.xlsx";
              templateExport = true;
            } else {
              const report = parseXlsxExport(payload);
              content = report.data;
              defaultName = report.filename;
            }
            extension = "xlsx";
          } else {
            content = normalizeSavePayload(payload);
            extension = name === "exportBackup" ? "json" : "csv";
            if (extension === "json") validateBackup(content);
            defaultName = filename(payload?.filename || `EtonHouse-English-Tracker-${extension === "json" ? "backup" : "weekly-summary"}`, extension);
          }
          const result = await dialog.showSaveDialog(mainWindow, {
            title: name === "exportFile" ? templateExport ? "Save Excel template" : "Save Excel report" : name === "exportBackup" ? "Save full backup" : "Save weekly summary",
            defaultPath: defaultName, filters: [{ name: extension.toUpperCase() + " file", extensions: [extension] }]
          });
          if (result.canceled || !result.filePath) {
            const canceled = { ok: false, canceled: true, operation: name };
            notify("export-result", canceled);
            return canceled;
          }
          if (name === "exportFile" && extname(result.filePath).toLowerCase() !== ".xlsx") throw new Error("Choose an Excel report filename ending in .xlsx.");
          await storage.atomicWrite(result.filePath, content);
          const exported = { ok: true, operation: name, filename: basename(result.filePath) };
          notify("export-result", exported);
          return exported;
        } else throw new Error("Unknown tracker operation.");
        return { ok: true };
      } catch (error) {
        if (name === "appReady") notify("data-loaded", { ok: false, found: true, base64: "", error: error.message });
        if (name === "saveData") notify("save-result", { ok: false, error: error.message });
        notify("error", { operation: name, message: error.message || "Tracker operation failed." });
        return { ok: false, error: error.message };
      }
    });
    buildWindow();
  });
  app.on("before-quit", (event) => {
    if (quitting || !storage) return;
    event.preventDefault();
    storage.queue.then(() => { quitting = true; app.quit(); }).catch((error) => {
      dialog.showErrorBox("Progress could not be saved", "Keep the app open and save a full backup before quitting. " + error.message);
    });
  });
  app.on("window-all-closed", () => app.quit());
}
