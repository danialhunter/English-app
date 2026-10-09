const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const {execFileSync} = require("node:child_process");
const asar = require("@electron/asar");

const root = path.resolve(__dirname,"../../..");
const version = require("../package.json").version;
const source = path.join(root,"work/seahorse_app/web");
const mac = path.join(root,"work/mac_wrapper/build/EtonHouse English Tracker.app/Contents");
const archive = path.join(root,"outputs/windows-build/win-unpacked/resources/app.asar");
const release = path.join(root,`outputs/release-${version}`);
const macZip = path.join(release,`EtonHouse-English-Tracker-Mac-${version}.app.zip`);
const zipEntry = relative => execFileSync("/usr/bin/unzip",["-p",macZip,`EtonHouse English Tracker.app/Contents/${relative}`.replace(/[\[\]*?]/g,"\\$&")],{maxBuffer:50_000_000});
function files(directory,prefix="") {
  return fs.readdirSync(path.join(directory,prefix),{withFileTypes:true}).flatMap(entry => {
    const relative = path.posix.join(prefix,entry.name);
    return entry.isDirectory() ? files(directory,relative) : [relative];
  }).sort();
}
const sourceFiles = files(source);
assert.deepEqual(files(path.join(mac,"Resources/web")),sourceFiles,"No stale or private files may remain in the Mac web bundle");
for (const relative of sourceFiles) {
  const expected = fs.readFileSync(path.join(source,relative));
  assert.ok(expected.equals(fs.readFileSync(path.join(mac,"Resources/web",relative))),`Mac web file matches: ${relative}`);
  assert.ok(expected.equals(zipEntry(`Resources/web/${relative}`)),`Mac downloadable archive matches: ${relative}`);
  assert.ok(expected.equals(asar.extractFile(archive,`web/${relative}`)),`Windows web file matches: ${relative}`);
}
const bundle = JSON.parse(execFileSync("plutil",["-convert","json","-o","-",path.join(mac,"Info.plist")],{encoding:"utf8"}));
assert.ok(fs.readFileSync(path.join(mac,"Info.plist")).equals(zipEntry("Info.plist")),"Mac downloadable metadata matches the verified bundle");
assert.equal(bundle.CFBundleIdentifier,"local.seahorse.english-tracker");
assert.equal(bundle.CFBundleShortVersionString,version);
assert.equal(bundle.CFBundleDisplayName,"EtonHouse English Tracker");
const packed = JSON.parse(asar.extractFile(archive,"package.json").toString());
assert.equal(packed.name,"seahorse-english-tracker","Keep legacy Electron data-directory identity");
assert.equal(packed.version,version);
assert.equal(packed.productName,undefined,"A top-level productName could change the legacy data directory");
const sourcePackage = require("../package.json");
assert.equal(sourcePackage.build.appId,"com.seahorse.englishtracker");
assert.equal(sourcePackage.build.nsis.deleteAppDataOnUninstall,false);
for (const filename of ["main.js","preload.js","storage.js","xlsx-export.js"]) {
  assert.ok(fs.readFileSync(path.join(root,"work/windows_wrapper",filename)).equals(asar.extractFile(archive,filename)),`Native bridge/storage source matches: ${filename}`);
}
const allowedRootFiles = new Set(["main.js","preload.js","storage.js","xlsx-export.js","package.json","Quick Start.txt","web"]);
for (const filename of asar.listPackage(archive)) {
  const normalized = filename.replace(/^\//,"");
  assert.ok(allowedRootFiles.has(normalized) || normalized.startsWith("web/"),`Unexpected packaged file: ${normalized}`);
  assert.ok(!/(?:^|\/)(?:data\.json|Backups|private-backup[^/]*)$/i.test(normalized),"No private progress in the installer");
}
const scope = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(source,"seed.js"),"utf8"),scope);
assert.equal(scope.window.createSeedState().appVersion,version,"Seed and native application versions must match");
assert.equal(scope.window.createSeedState().schemaVersion,7,"Release must declare the review/correction-compatible schema");
assert.equal(scope.window.createSeedState().students.length,0);
assert.equal(Object.keys(scope.window.createSeedState().records).length,0);
assert.ok(sourceFiles.includes("learning-review.js"),"Review model must ship in both desktop apps");
assert.match(fs.readFileSync(path.join(source,"index.html"),"utf8"),/learning-review\.js/,"Review model must be loaded by the packaged application");
const guideBytes=fs.readFileSync(path.join(source,"assets/teacher-guide.pdf"));
assert.equal(crypto.createHash("sha256").update(guideBytes).digest("hex"),"ace90cfd6cf301b6bdd803905d3b6a7506328010e7a823015eab4b38cf5d62cf","Bundled PDF must match the audited original SHA-256");
if(process.env.ETON_ORIGINAL_PDF) assert.ok(guideBytes.equals(fs.readFileSync(process.env.ETON_ORIGINAL_PDF)),"Bundled PDF must exactly match the provided original");
assert.ok(fs.readFileSync(path.join(source,"assets/Student names template.xlsx")).equals(fs.readFileSync(path.join(release,"Student names template.xlsx"))));
assert.ok(fs.readFileSync(path.join(root,"work/seahorse_app/Quick Start.txt")).equals(fs.readFileSync(path.join(release,"Quick Start.txt"))));
assert.ok(fs.readFileSync(path.join(root,"work/seahorse_app/Quick Start.txt")).equals(asar.extractFile(archive,"Quick Start.txt")),"Windows packaged guide must match final source");
assert.ok(fs.readFileSync(path.join(root,`work/seahorse_app/What's new in ${version}.md`)).equals(fs.readFileSync(path.join(release,`What's new in ${version}.md`))),"Release notes must match final source");
console.log(`Release ${version}: all ${sourceFiles.length} public web files match final source in both packages; blank seeds, original PDF, template, guide, legacy identities and package allowlist verified.`);
for (const name of [`EtonHouse-English-Tracker-Mac-${version}.dmg`,`EtonHouse-English-Tracker-Mac-${version}.app.zip`,`EtonHouse-English-Tracker-Windows-Setup-${version}.exe`]) {
  const file = path.join(release,name);
  console.log(`${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}  ${file}`);
}
