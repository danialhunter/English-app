const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { TrackerStorage, validateBackup } = require("../storage");
const state = (lesson) => JSON.stringify({ schemaVersion: 1, students: [{ id: "sample-child" }], records: { week: { lesson } } });

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "seahorse-storage-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new TrackerStorage(directory, "2.0.0");
}

test("full exported backup accepts the app envelope and keeps portable metadata bytes", () => {
  const envelope = JSON.stringify({format:"Seahorse English Tracker Backup",exportedAt:"2026-09-14T00:00:00Z",curriculumVersion:"2.0",data:JSON.parse(state(1))});
  assert.equal(validateBackup(envelope), envelope);
  const brandedEnvelope = envelope.replace("Seahorse English Tracker Backup", "EtonHouse English Tracker Backup");
  assert.equal(validateBackup(brandedEnvelope), brandedEnvelope);
  assert.equal(validateBackup(state(1)), state(1));
  assert.throws(() => validateBackup(JSON.stringify({format:"Seahorse English Tracker Backup",data:{}})));
});

test("upgrade preserves original bytes and writes a separate immutable pre-upgrade backup", async (t) => {
  const store = await fixture(t);
  await fs.writeFile(store.file, state("old record"));
  const loaded = await store.load();
  assert.equal(loaded.ok, true);
  assert.equal(await fs.readFile(loaded.backupPath, "utf8"), state("old record"));
  await store.save(state("new record"));
  const reinstalled = new TrackerStorage(store.directory, "2.0.0");
  assert.equal(Buffer.from((await reinstalled.load()).base64, "base64").toString(), state("new record"));
  assert.equal(await fs.readFile(loaded.backupPath, "utf8"), state("old record"));
});

test("queued saves keep the newest click; invalid data cannot replace records", async (t) => {
  const store = await fixture(t);
  await store.load();
  await Promise.all([store.save(state(1)), store.save(state(2)), store.save(state(3))]);
  assert.equal(await fs.readFile(store.file, "utf8"), state(3));
  await assert.rejects(store.save("{}"));
  assert.equal(await fs.readFile(store.file, "utf8"), state(3));
  assert.equal(await fs.readFile(path.join(store.backups, "previous-save.json"), "utf8"), state(2));
});

test("corruption recovers from a valid backup and preserves unreadable original on next save", async (t) => {
  const store = await fixture(t);
  await store.load();
  await store.save(state(1));
  await store.save(state(2));
  await fs.writeFile(store.file, "truncated{");
  const reinstalled = new TrackerStorage(store.directory, "2.0.0");
  const loaded = await reinstalled.load();
  assert.equal(loaded.recovered, true);
  assert.equal(Buffer.from(loaded.base64, "base64").toString(), state(1));
  await reinstalled.save(state(3));
  const unreadable = (await fs.readdir(store.backups)).find((name) => name.startsWith("unreadable-"));
  assert.equal(await fs.readFile(path.join(store.backups, unreadable), "utf8"), "truncated{");
});

test("unrecoverable read errors block writes instead of replacing progress with an empty roster", async (t) => {
  const store = await fixture(t);
  await fs.writeFile(store.file, "broken{");
  assert.equal((await store.load()).ok, false);
  await assert.rejects(store.save(state("empty")));
  assert.equal(await fs.readFile(store.file, "utf8"), "broken{");
});

test("recoverable deletion survives restart and restore without changing saved weekly records", async (t) => {
  const store = await fixture(t);
  const original = JSON.parse(state("saved lesson"));
  original.schemaVersion = 3;
  original.records.week.notes = "Keep this teacher note";
  original.records.week.additionalPractice = [{entryId:"synthetic-extra",state:"known"}];
  await fs.writeFile(store.file, JSON.stringify(original));
  await store.load();
  const deleted = structuredClone(original);
  deleted.students[0].active = false;
  deleted.students[0].deletedAt = "2026-09-14T00:00:00Z";
  await store.save(JSON.stringify(deleted));
  const restarted = new TrackerStorage(store.directory, "2.1.1");
  const recovered = JSON.parse(Buffer.from((await restarted.load()).base64,"base64").toString());
  assert.deepEqual(recovered, deleted);
  recovered.students[0].active = true;
  delete recovered.students[0].deletedAt;
  await restarted.save(JSON.stringify(recovered));
  const restored = JSON.parse(await fs.readFile(store.file,"utf8"));
  assert.deepEqual(restored.records, original.records);
  assert.equal(restored.students[0].id, original.students[0].id);
  assert.equal(restored.students[0].active,true);
});

test("schema 4 exam rounds survive atomic saves, restart, safety backup and explicit restore unchanged", async (t) => {
  const store = await fixture(t);
  const original = {...JSON.parse(state("original lesson")),schemaVersion:4,examRounds:{sample:[
    {id:"synthetic-round-1",month:"2026-09",attempts:[{date:"2026-09-30",marks:["known","learning"],notes:"Keep exam notes"}],passed:false}
  ]}};
  await fs.writeFile(store.file,JSON.stringify(original));
  const loaded = await store.load();
  const updated = structuredClone(original);
  updated.examRounds.sample[0].attempts.push({date:"2026-10-02",marks:["known","known"],notes:"Retest"});
  updated.examRounds.sample[0].passed = true;
  await store.save(JSON.stringify(updated));
  const restarted = new TrackerStorage(store.directory,"2.2.0");
  assert.deepEqual(JSON.parse(Buffer.from((await restarted.load()).base64,"base64").toString()),updated);
  assert.deepEqual(JSON.parse(await fs.readFile(loaded.backupPath,"utf8")),original);
  assert.deepEqual(updated.records,original.records);
  await restarted.save(JSON.stringify(original),{restoring:true});
  const beforeRestore = (await fs.readdir(store.backups)).find(name=>name.startsWith("before-restore-"));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(store.backups,beforeRestore),"utf8")),updated);
  assert.deepEqual(JSON.parse(await fs.readFile(store.file,"utf8")),original);
});

test("sample indices and unselected marks survive native save, restart and backup restore", async (t) => {
  const store=await fixture(t);
  const draft={itemIndexes:[0,2],itemStates:["known","unassessed","learning"],notes:"Synthetic selected sample"};
  const original={...JSON.parse(state("preserved practice")),schemaVersion:5,monthlyExams:{rounds:{"sample-class::2026-09-01":{attempts:{"sample-child":{draft,history:[]}}}}}};
  await fs.writeFile(store.file,JSON.stringify(original));
  await store.load();
  const updated=structuredClone(original);
  const attempt=updated.monthlyExams.rounds["sample-class::2026-09-01"].attempts["sample-child"];
  attempt.history.push({...attempt.draft,completedAt:"2026-09-14T04:00:00Z"});attempt.draft=null;
  await store.save(JSON.stringify(updated));
  const restarted=new TrackerStorage(store.directory,"2.3.1");
  assert.deepEqual(JSON.parse(Buffer.from((await restarted.load()).base64,"base64")),updated);
  await restarted.save(JSON.stringify(original),{restoring:true});
  assert.deepEqual(JSON.parse(await fs.readFile(store.file,"utf8")),original);
  assert.deepEqual(original.records,updated.records);
});

test("schema 6 scoring provenance preserves legacy evidence through upgrade, reinstall and restore",async(t)=>{
  const store=await fixture(t);
  const history={itemIndexes:[0,2],itemStates:["known","unassessed","learning"],notes:"Original completed exam",startedAt:"2026-09-01T01:00:00Z",completedAt:"2026-09-01T01:10:00Z"};
  const draft={itemIndexes:[0,2],itemStates:["learning","unassessed","unassessed"],notes:"Unfinished original answers",startedAt:"2026-09-14T01:00:00Z"};
  const original={...JSON.parse(state("preserved teacher practice")),schemaVersion:5,appVersion:"2.3.2",monthlyExams:{rounds:{"synthetic-class::2026-09-01":{attempts:{"sample-child":{draft,history:[history]}}}}}};
  const originalJSON=JSON.stringify(original);
  await fs.writeFile(store.file,originalJSON);
  const upgraded=new TrackerStorage(store.directory,"2.4.0"),loaded=await upgraded.load();
  assert.equal(loaded.ok,true);
  const migrated=structuredClone(original);
  migrated.schemaVersion=6;migrated.appVersion="2.4.0";
  const attempts=migrated.monthlyExams.rounds["synthetic-class::2026-09-01"].attempts["sample-child"];
  Object.assign(attempts.draft,{scoringRule:"overall-majority-v1",passPercent:80});
  Object.assign(attempts.history[0],{scoringRule:"legacy-sampled-v1",passPercent:80});
  // This store is intentionally policy-opaque: preserve every field from the
  // validated web payload, including metadata that did not exist before 2.4.
  const policyRound=migrated.monthlyExams.rounds["synthetic-class::2026-09-01"];
  policyRound.absences={"sample-absent":{absent:true,updatedAt:"2026-09-20T02:00:00Z"}};
  policyRound.unlock={at:"2026-09-20T02:10:00Z",cohortIds:["sample-child","sample-absent"],countedIds:["sample-child"],absentIds:["sample-absent"],completedIds:["sample-child"],passedIds:["sample-child"]};
  policyRound.cohort=[{studentId:"sample-child",countsForClass:true},{studentId:"sample-newcomer",countsForClass:false}];
  migrated.students.push({id:"sample-newcomer",joinedAt:"2026-09-20T03:00:00Z"});
  migrated.records.preparation={examPreparation:{periodStart:"2026-09-01",weekStart:"2026-09-28",unitIndex:50}};
  const migratedJSON=JSON.stringify(migrated);
  await upgraded.save(migratedJSON);
  const reinstalled=new TrackerStorage(store.directory,"2.4.0");
  assert.equal(Buffer.from((await reinstalled.load()).base64,"base64").toString(),migratedJSON);
  assert.equal(await fs.readFile(loaded.backupPath,"utf8"),originalJSON,"Reinstallation must not overwrite the pre-upgrade copy");
  assert.deepEqual(migrated.records.week,original.records.week);
  for(const key of ["itemIndexes","itemStates","notes","startedAt","completedAt"]) assert.deepEqual(attempts.history[0][key],history[key]);
  for(const key of ["itemIndexes","itemStates","notes","startedAt"]) assert.deepEqual(attempts.draft[key],draft[key]);
  const envelope=JSON.stringify({format:"EtonHouse English Tracker Backup",data:migrated});
  assert.equal(validateBackup(envelope),envelope,"Full backup preserves the schema 6 envelope bytes");
  await reinstalled.save(originalJSON,{restoring:true});
  const savedBeforeRestore=(await fs.readdir(store.backups)).filter(name=>name.startsWith("before-restore-"));
  assert.equal(savedBeforeRestore.length,1);
  assert.equal(await fs.readFile(path.join(store.backups,savedBeforeRestore[0]),"utf8"),migratedJSON);
  assert.equal(await fs.readFile(store.file,"utf8"),originalJSON);
});

test("2.5.0 preserves schema 7 review, goal and exam-correction history through reinstall and restore",async(t)=>{
  const initial=await fixture(t);
  const oldJSON=JSON.stringify({...JSON.parse(state("Existing teacher note")),schemaVersion:6,appVersion:"2.4.2"});
  await fs.writeFile(initial.file,oldJSON);
  const upgraded=new TrackerStorage(initial.directory,"2.5.0");
  const loaded=await upgraded.load();
  assert.equal(path.basename(loaded.backupPath),"before-version-2.5.0.json");
  const targetId=JSON.stringify([0,0,"book"]);
  const attempt={id:"synthetic-attempt",itemIndexes:[0,2],itemStates:["known","unassessed","known"],scoringRule:"overall-majority-v1",passPercent:80,startedAt:"2026-09-28T01:00:00Z",completedAt:"2026-09-28T01:10:00Z",notes:"Original preserved exam"};
  const migrated={...JSON.parse(oldJSON),schemaVersion:7,appVersion:"2.5.0",learningReview:{settings:{firstDays:7,repeatDays:28,limit:3},children:{"sample-child":{targets:{[targetId]:{id:targetId,text:"book",kind:"vocabulary",expectation:"Point to or name it independently",sourceWeekStart:"2026-09-07",sourceUnitIndex:0,sourceItemIndex:0,sourceDate:"2026-09-07",sourceMark:"known",dueDate:"2026-10-16",lastMark:"learning",checks:[{date:"2026-10-09",mark:"learning"}],postponements:[]}}}},goals:[{id:"synthetic-goal",studentId:"sample-child",week:"2026-10-12",unitIndex:5,targetIndex:0,expectation:"Name it independently",previous:"Point to or name it independently",at:"2026-10-09T01:00:00Z"}]},monthlyExams:{rounds:{synthetic:{attempts:{"sample-child":{draft:null,history:[attempt],corrections:[{id:"synthetic-correction",attemptId:attempt.id,at:"2026-10-09T02:00:00Z",reason:"Wrong child selected for the original marks"}]}}}}}};
  const migratedJSON=JSON.stringify(migrated);
  await upgraded.save(migratedJSON);
  const reinstalled=new TrackerStorage(initial.directory,"2.5.0");
  assert.equal(Buffer.from((await reinstalled.load()).base64,"base64").toString(),migratedJSON);
  assert.equal(await fs.readFile(loaded.backupPath,"utf8"),oldJSON,"Reinstall keeps the original 2.4.2 safety copy immutable");
  assert.equal(validateBackup(JSON.stringify({format:"EtonHouse English Tracker Backup",data:migrated})),JSON.stringify({format:"EtonHouse English Tracker Backup",data:migrated}));
  await reinstalled.save(oldJSON,{restoring:true});
  const beforeRestore=(await fs.readdir(initial.backups)).find(name=>name.startsWith("before-restore-"));
  assert.equal(await fs.readFile(path.join(initial.backups,beforeRestore),"utf8"),migratedJSON);
  assert.equal(await fs.readFile(initial.file,"utf8"),oldJSON);
  const fresh=new TrackerStorage(path.join(initial.directory,"fresh-install"),"2.5.0");
  assert.deepEqual(await fresh.load(),{ok:true,found:false,base64:""},"A separate new installation has no inherited teacher records");
});
