const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function validateState(json) {
  const value = JSON.parse(json);
  if (!value || !Array.isArray(value.students) || !value.records || typeof value.records !== "object" || Array.isArray(value.records)) {
    throw new Error("The saved file is not a valid class backup. Existing records have been kept.");
  }
  return json;
}

function validateBackup(json) {
  const value = JSON.parse(json);
  validateState(["Seahorse English Tracker Backup", "EtonHouse English Tracker Backup"].includes(value?.format) ? JSON.stringify(value.data) : json);
  return json;
}

class TrackerStorage {
  constructor(directory, version) {
    this.directory = directory;
    this.file = path.join(directory, "data.json");
    this.backups = path.join(directory, "Backups");
    this.version = version.replace(/[^a-zA-Z0-9.-]/g, "-");
    this.ready = false;
    this.queue = Promise.resolve();
  }

  async atomicWrite(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.open(temporary, "wx", 0o600);
      await handle.writeFile(data, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporary, file);
    } finally {
      if (handle) await handle.close();
      await fs.unlink(temporary).catch(() => {});
    }
  }

  async snapshotOnce(name, json) {
    await fs.mkdir(this.backups, { recursive: true });
    const destination = path.join(this.backups, name);
    try { await fs.access(destination); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.atomicWrite(destination, json);
    }
    return destination;
  }

  async load() {
    let originalError;
    let validPrimary;
    try {
      validPrimary = validateState(await fs.readFile(this.file, "utf8"));
    } catch (error) { originalError = error; }
    if (validPrimary !== undefined) {
      try {
        const backupPath = await this.snapshotOnce(`before-version-${this.version}.json`, validPrimary);
        this.ready = true;
        return { ok: true, found: true, base64: Buffer.from(validPrimary).toString("base64"), backupPath };
      } catch (error) {
        this.ready = false;
        return { ok: false, found: true, base64: "", error: "The safety backup could not be created. Existing progress is unchanged. " + error.message };
      }
    }

    // A missing/corrupt primary must not silently open an empty class over existing backups.
    let names = [];
    try {
      names = (await fs.readdir(this.backups)).filter((name) => name.endsWith(".json") && !name.startsWith("unreadable-"));
    } catch (error) {
      if (error.code !== "ENOENT") originalError = error;
    }
    const candidates = await Promise.all(names.map(async (name) => ({
      file: path.join(this.backups, name),
      modified: (await fs.stat(path.join(this.backups, name))).mtimeMs
    })));
    candidates.sort((a, b) => b.modified - a.modified);
    for (const candidate of candidates) {
      try {
        const json = validateState(await fs.readFile(candidate.file, "utf8"));
        this.ready = true;
        return { ok: true, found: true, base64: Buffer.from(json).toString("base64"), recovered: true, backupPath: candidate.file };
      } catch { /* Try the next independent backup. */ }
    }
    if (originalError.code === "ENOENT" && candidates.length === 0) {
      this.ready = true;
      return { ok: true, found: false, base64: "" };
    }
    this.ready = false;
    return { ok: false, found: true, base64: "", error: "Saved progress could not be opened safely. Your existing files have been kept. Open the Backups folder or restore a full backup. " + originalError.message };
  }

  save(json, { restoring = false } = {}) {
    const operation = this.queue.catch(() => {}).then(async () => {
      if (!this.ready && !restoring) throw new Error("Progress is protected because it has not loaded safely. Restore a valid backup before saving.");
      validateState(json);
      let previous;
      try { previous = await fs.readFile(this.file, "utf8"); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (previous !== undefined && previous !== json) {
        try { validateState(previous); }
        catch {
          await this.snapshotOnce(`unreadable-${Date.now()}.json`, previous);
          previous = undefined;
        }
      }
      if (previous !== undefined && previous !== json) {
        await this.snapshotOnce(`daily-${new Date().toISOString().slice(0, 10)}.json`, previous);
        if (restoring) await this.snapshotOnce(`before-restore-${crypto.randomUUID()}.json`, previous);
        await this.atomicWrite(path.join(this.backups, "previous-save.json"), previous);
      }
      await this.atomicWrite(this.file, json);
      this.ready = true;
    });
    this.queue = operation;
    return operation;
  }
}

module.exports = { TrackerStorage, validateState, validateBackup };
