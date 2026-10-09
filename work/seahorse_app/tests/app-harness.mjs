import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

// A private, entirely in-memory browser. This never opens the installed app or
// reads/writes a teacher's data. Names and progress below are synthetic fixtures.
export function createHarness({ saved, sourcePath = new URL("../web/app.js", import.meta.url) } = {}) {
  const nodes = new Map();
  const timers = new Map();
  const storage = new Map();
  let timerId = 0;
  function node(id) {
    if (!nodes.has(id)) {
      const listeners = new Map();
      const classes = new Set();
      const attributes = new Map();
      nodes.set(id, {
        id, value: "", textContent: "", innerHTML: "", dataset: {}, style: {}, listeners,
        classList: { add: (...values) => values.forEach((value) => classes.add(value)), remove: (...values) => values.forEach((value) => classes.delete(value)), toggle(value, force) { if (force ?? !classes.has(value)) classes.add(value); else classes.delete(value); }, contains: (value) => classes.has(value) },
        addEventListener(type, callback) { listeners.set(type, callback); },
        querySelector: (selector) => node(`${id} ${selector}`),
        querySelectorAll: () => [], closest: (selector) => node(selector),
        setAttribute(name,value) { attributes.set(name,String(value)); },
        getAttribute(name) { return attributes.get(name) ?? null; },
        removeAttribute(name) { attributes.delete(name); },
        focus() { document.activeElement = this; },
        showModal() { this.open = true; }, close() { this.open = false; },
        scrollTo() {}, click() { this.listeners.get("click")?.({ target: this }); }
      });
    }
    return nodes.get(id);
  }
  const document = {
    activeElement: null,
    getElementById: node,
    querySelector: node,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: node
  };
  const seed = () => ({
    schemaVersion: 1, selectedWeekStart: "2026-09-07", selectedStudentId: "test-a",
    students: [
      { id: "test-a", rosterNumber: 1, englishName: "Test A", chineseName: "", group: "Test class", startUnit: 0, active: true },
      { id: "test-b", rosterNumber: 2, englishName: "Test B", chineseName: "", group: "Test class", startUnit: 0, active: true }
    ], records: {}
  });
  const window = { createSeedState: seed, confirm: () => true, addEventListener() {} };
  const sandbox = {
    window, document, console: { error() {}, warn() {}, log() {} },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    Date, Intl, TextDecoder, TextEncoder, Uint8Array, atob, btoa, Blob, URL, crypto: webcrypto
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL("../web/curriculum.js", import.meta.url), "utf8"), context);
  const modelPath = new URL("../web/model.js", import.meta.url);
  if (fs.existsSync(modelPath)) vm.runInContext(fs.readFileSync(modelPath, "utf8"), context);
  const exports = ["initializeRefs", "bindEvents", "hydrateState", "getRecord", "deriveUnitIndex", "renderAll", "selectStudent", "updateItemState", "togglePractice", "importBackup", "exportBackup", "statusForRecord", "saveNotes", "setNextAction", "confirmLessonChange", "csvCell"];
  let source = fs.readFileSync(sourcePath, "utf8");
  source = source.replace(/\}\)\(\);\s*$/, `window.__audit = { ${exports.join(", ")}, getState: () => state, setWeek: week => { state.selectedWeekStart = week; }, refs };\n})();`);
  vm.runInContext(source, context);
  const api = window.__audit;
  if (!api) throw new Error("The app closure changed; update the test exposure seam.");
  api.initializeRefs();
  api.bindEvents();
  api.hydrateState(saved || seed());
  return {
    api, window, document, node, storage, seed,
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); },
    json(value) { return JSON.parse(JSON.stringify(value)); }
  };
}
