const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {execFileSync}=require("node:child_process");

const root=path.resolve(__dirname,"../../..");
const oldArchive=path.join(root,"outputs/release-2.3.2/EtonHouse-English-Tracker-Mac-2.3.2.app.zip");

test("the released 2.3.2 model refuses schema 6 before changing saved exam evidence",{skip:!fs.existsSync(oldArchive)},()=>{
  const scope=vm.createContext({window:{},Date});
  for(const filename of ["curriculum.js","monthly-exams.js","model.js"]) {
    const code=execFileSync("/usr/bin/unzip",["-p",oldArchive,`EtonHouse English Tracker.app/Contents/Resources/web/${filename}`],{encoding:"utf8",maxBuffer:10_000_000});
    vm.runInContext(code,scope,{filename:`released-2.3.2/${filename}`});
  }
  const candidate={schemaVersion:6,students:[{id:"synthetic-child",englishName:"Synthetic child",chineseName:""}],records:{},monthlyExams:{rounds:{synthetic:{attempts:{"synthetic-child":{draft:{scoringRule:"overall-majority-v1",passPercent:80,itemIndexes:[0,2],itemStates:["known","unassessed","learning"],notes:"Preserve this draft",startedAt:"2026-09-20T01:00:00Z"},history:[]}}}}}};
  const before=JSON.stringify(candidate);
  assert.throws(()=>scope.window.TrackerModel.migrate(candidate),/needs a newer version/);
  assert.equal(JSON.stringify(candidate),before,"Old app refusal must not reinterpret or remove new exam fields");
});

test("version 2.5.0 retains the original install and data identities",()=>{
  const packageJSON=require("../package.json");
  assert.equal(packageJSON.name,"seahorse-english-tracker");
  assert.equal(packageJSON.version,"2.5.0");
  assert.equal(packageJSON.build.appId,"com.seahorse.englishtracker");
  assert.equal(packageJSON.productName,undefined);
  assert.equal(packageJSON.build.nsis.deleteAppDataOnUninstall,false);
  const macMetadata=fs.readFileSync(path.join(root,"work/mac_wrapper/Info.plist"),"utf8");
  assert.match(macMetadata,/<string>local\.seahorse\.english-tracker<\/string>/);
  assert.match(macMetadata,/<key>CFBundleVersion<\/key>\s*<string>250<\/string>/);
  assert.match(fs.readFileSync(path.join(root,"work/mac_wrapper/Sources/main.swift"),"utf8"),/storageFolderName = "Seahorse English Tracker"/);
});

const previousArchive=path.join(root,"outputs/release-2.4.2/EtonHouse-English-Tracker-Mac-2.4.2.app.zip");
test("the released 2.4.2 model refuses schema 7 without changing saved reviews and exam evidence",{skip:!fs.existsSync(previousArchive)},()=>{
  const scope=vm.createContext({window:{},Date});
  for(const filename of ["curriculum.js","monthly-exams.js","model.js"]) {
    const code=execFileSync("/usr/bin/unzip",["-p",previousArchive,`EtonHouse English Tracker.app/Contents/Resources/web/${filename}`],{encoding:"utf8",maxBuffer:10_000_000});
    vm.runInContext(code,scope,{filename:`released-2.4.2/${filename}`});
  }
  const candidate={schemaVersion:7,students:[{id:"synthetic-child",englishName:"Synthetic child",chineseName:""}],records:{},learningReview:{observations:[{studentId:"synthetic-child",state:"learning",reviewedAt:"2026-10-09T01:00:00Z"}]},monthlyExams:{rounds:{synthetic:{attempts:{"synthetic-child":{draft:{scoringRule:"legacy-sampled-v1",passPercent:80,itemIndexes:[0,2],itemStates:["known","unassessed","learning"],notes:"Preserve this draft",startedAt:"2026-09-20T01:00:00Z"},history:[]}}}}}};
  const before=JSON.stringify(candidate);
  assert.throws(()=>scope.window.TrackerModel.migrate(candidate),/needs a newer version/);
  assert.equal(JSON.stringify(candidate),before,"Older version must not remove review or correction fields");
});
