const { contextBridge, ipcRenderer } = require("electron");
const handlers = {};
for (const name of ["saveData", "exportBackup", "exportCSV", "exportFile", "openBackups", "openGuide", "appReady"]) {
  handlers[name] = { postMessage: (payload) => ipcRenderer.invoke("seahorse-native-message", name, payload) };
}
contextBridge.exposeInMainWorld("webkit", { messageHandlers: handlers });

// Callbacks registered through this API cross Electron's isolated renderer boundary safely.
// Accessing window.onNativeDataLoaded directly in preload cannot see the web app's window.
contextBridge.exposeInMainWorld("SeahorseDesktop", {
  onDataLoaded(callback) { ipcRenderer.on("seahorse-native-data-loaded", (_event, detail) => callback(detail)); },
  onSaveResult(callback) { ipcRenderer.on("seahorse-native-save-result", (_event, detail) => callback(detail)); },
  onExportResult(callback) { ipcRenderer.on("seahorse-native-export-result", (_event, detail) => callback(detail)); },
  onError(callback) { ipcRenderer.on("seahorse-native-error", (_event, detail) => callback(detail)); }
});

for (const name of ["data-loaded", "save-result", "export-result", "error"]) {
  ipcRenderer.on(`seahorse-native-${name}`, (_event, detail) => {
    window.dispatchEvent(new CustomEvent(`seahorse-native-${name}`, { detail }));
    if (name === "save-result") window.dispatchEvent(new CustomEvent("seahorse:save-result", { detail }));
  });
}
