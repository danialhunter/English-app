const fs = require("node:fs");
const path = require("node:path");
const source = path.resolve(__dirname, "../seahorse_app");
const destination = path.join(__dirname, "web");
// Only generated wrapper assets are replaced; user progress lives in AppData, outside this folder.
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(path.join(source, "web"), destination, { recursive: true });
fs.copyFileSync(path.join(source, "Quick Start.txt"), path.join(__dirname, "Quick Start.txt"));
console.log("Copied current application and public class template.");
