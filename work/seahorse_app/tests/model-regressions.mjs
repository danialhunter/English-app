import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window: {}, Date, console });
for (const file of ["curriculum.js", "model.js"]) vm.runInContext(fs.readFileSync(new URL(`../web/${file}`, import.meta.url), "utf8"), context);
const model = context.window.TrackerModel;
const json = value => JSON.parse(JSON.stringify(value));
const seed = () => ({
  schemaVersion: 2, selectedWeekStart: "2026-09-07", selectedStudentId: "test-a", selectedClassId: "class-a",
  classes: [{id: "class-a", name: "Test class A", startWeek: "2026-08-31"}, {id: "class-b", name: "Test class B", startWeek: "2026-09-07"}],
  students: [
    {id: "test-a", englishName: "Test A", chineseName: "", classId: "class-a", startWeek: "2026-08-31", startUnit: 0},
    {id: "test-b", englishName: "Test B", chineseName: "", classId: "class-a", startWeek: "2026-08-31", startUnit: 0},
    {id: "test-c", englishName: "Test C", chineseName: "", classId: "class-b", startWeek: "2026-09-07", startUnit: 0}
  ], records: {}
});
const fullyKnown = (state, week = "2026-09-07", child = state.students[0]) => {
  const record = model.getRecord(state, child, week, true);
  record.itemStates.fill("known"); record.practiceFinished = true;
  record.practicedAt = "2026-09-07T05:00:00.000Z";
  return record;
};
const cases = [];
const test = (name, run) => cases.push({name, run});

test("September 7/14/21/28 automatically receive consecutive lessons for every child", () => {
  const state = model.migrate(seed());
  for (const [index, week] of ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"].entries()) {
    for (const child of state.students.slice(0, 2)) assert.equal(model.getRecord(state, child, week).unitIndex, index + 1);
  }
  assert.deepEqual(json(state.records), {}, "Browsing must not create teaching records");
});

test("preview order does not change any future lesson assignment", () => {
  const state = model.migrate(seed()), child = state.students[0];
  for (const week of ["2027-01-04", "2026-09-14", "2026-08-24", "2026-09-28", "2026-09-07"]) model.getRecord(state, child, week);
  assert.equal(model.getRecord(state, child, "2026-09-28").unitIndex, 4);
  assert.deepEqual(json(state.records), {});
});

test("individual early completion preserves two lessons and opens the third in the same week", () => {
  const state = model.migrate(seed()), child = state.students[0];
  const first = fullyKnown(state); first.notes = "First synthetic assessment";
  assert.equal(model.complete(state, child, "2026-09-07"), true);
  assert.equal(model.complete(state, child, "2026-09-07"), false, "Unassessed next lesson cannot be completed twice");
  const second = fullyKnown(state); second.notes = "Second synthetic assessment";
  assert.equal(model.complete(state, child, "2026-09-07"), true);
  const current = model.getRecord(state, child, "2026-09-07");
  assert.equal(current.unitIndex, 3);
  assert.equal(current.completedLessons.length, 2);
  assert.deepEqual(json(current.completedLessons.map(r => r.notes)), ["First synthetic assessment", "Second synthetic assessment"]);
  assert.equal(model.weekStatus(current).completed, 2);
  assert.equal(model.weekStatus(current).practiced, true);
  assert.equal(model.weekStatus(current).mastered, true);
  assert.equal(model.deriveUnitIndex(state, child, "2026-09-14"), 3, "Unstarted automatically opened practice should be carried to next week");
  assert.equal(model.deriveUnitIndex(state, state.students[1], "2026-09-14"), 2, "Another child should remain on their own lesson");
});

test("practice without all vocabulary AND sentence known does not advance", () => {
  const state = model.migrate(seed()), child = state.students[0];
  const record = fullyKnown(state); record.itemStates[5] = "learning";
  assert.equal(model.complete(state, child, "2026-09-07"), false);
  assert.equal(record.unitIndex, 1);
  assert.equal(model.status(record).mastered, false);
  assert.equal(model.weekStatus(record).needsReview, true);
});

test("three legacy weeks preserve every recorded snapshot, assessment, note and timestamp", () => {
  const legacy = seed(); delete legacy.classes; delete legacy.selectedClassId; legacy.schemaVersion = 1;
  legacy.students.forEach(child => { delete child.classId; delete child.startWeek; child.group = "Legacy test class"; });
  const child = legacy.students[0]; child.startWeek = "2026-08-31";
  for (const [index, week] of ["2026-08-31", "2026-09-07", "2026-09-14"].entries()) {
    const r = model.getRecord(legacy, child, week, true);
    r.notes = `Synthetic archived note ${index}`;
    r.itemStates = ["known", "learning", "unassessed", "known", "known", "known"];
    r.practiceFinished = true; r.practicedAt = `${week}T05:00:00.000Z`;
    r.lesson.words = Array.from({length: 5}, (_, item) => `Original word ${index}-${item}`);
    r.lesson.sentence = `Original sentence ${index}`;
    r.nextAction = "repeat";
  }
  delete child.startWeek;
  const original = json(legacy.records);
  const upgraded = model.migrate(legacy);
  assert.deepEqual(json(upgraded.records), original);
  for (const week of ["2026-08-31", "2026-09-07", "2026-09-14"]) assert.deepEqual(json(model.getRecord(upgraded, upgraded.students[0], week)), original[`test-a::${week}`]);
  assert.deepEqual(json(legacy.records), original, "Migration cannot mutate its input");
});

test("full backup round trip retains completed same-week history and all classes", () => {
  const state = model.migrate(seed());
  fullyKnown(state); model.complete(state, state.students[0], "2026-09-07");
  fullyKnown(state, "2026-09-07", state.students[2]);
  const restored = model.migrate(json(state));
  assert.deepEqual(json(restored), json(state));
});

test("malformed backup rejection is atomic", () => {
  const state = model.migrate(seed()); fullyKnown(state);
  const before = json(state);
  const candidate = json(state); candidate.records.bad = null;
  assert.throws(() => model.migrate(candidate));
  assert.deepEqual(json(state), before);
});

test("missing classes, duplicate student IDs and cross-child history are rejected", () => {
  const brokenClass = seed(); brokenClass.students[0].classId = "missing";
  assert.throws(() => model.migrate(brokenClass));
  const duplicate = seed(); duplicate.students[1].id = duplicate.students[0].id;
  assert.throws(() => model.migrate(duplicate));
  const cross = model.migrate(seed()); const record = fullyKnown(cross);
  const archived = json(record); archived.studentId = "test-b"; record.completedLessons = [archived];
  assert.throws(() => model.migrate(cross));
});

test("the final curriculum lesson completes without generating duplicate final lessons", () => {
  const state = seed(); state.students[0].startUnit = context.window.CURRICULUM.length - 1;
  const r = fullyKnown(state);
  assert.equal(model.complete(state, state.students[0], "2026-09-07"), true);
  assert.equal(r.curriculumFinished, true);
  assert.equal(model.complete(state, state.students[0], "2026-09-07"), false);
  assert.equal(r.completedLessons?.length || 0, 0);
});

test("an explicit repeat applies to the next teaching week, then progression resumes", () => {
  const state = model.migrate(seed()), child = state.students[0];
  const record = model.getRecord(state, child, "2026-09-07", true);
  record.nextAction = "repeat"; record.nextActionExplicit = true;
  assert.equal(model.deriveUnitIndex(state, child, "2026-09-14"), 1);
  assert.equal(model.deriveUnitIndex(state, child, "2026-09-21"), 2);
});

test("fractional starting lesson data is rejected or normalized to a usable whole lesson", () => {
  const broken = seed(); broken.students[0].startUnit = 1.5;
  let state;
  try { state = model.migrate(broken); } catch { return; }
  assert.ok(Number.isInteger(state.students[0].startUnit));
  assert.ok(model.getRecord(state, state.students[0], "2026-09-07").lesson.words.length === 5);
});

const extra = (entryId, known = false) => ({entryId, title: "Synthetic phonics", text: "Say the sound", category:"phonics", sourcePages:[27], state:known ? "known" : "learning", practiceFinished:known});

test("extra practice survives backup and completed history; only unfinished extras carry forward", () => {
  const state = model.migrate(seed()), child = state.students[0];
  const record = fullyKnown(state);
  record.additionalPractice = [extra("pending"), extra("finished", true)];
  model.complete(state, child, "2026-09-07");
  const next = model.getRecord(state, child, "2026-09-07");
  assert.equal(next.completedLessons[0].additionalPractice.length, 2);
  assert.deepEqual(json(next.additionalPractice.map(i => i.entryId)), ["pending"]);
  next.additionalPractice[0].state = "known";
  assert.equal(next.completedLessons[0].additionalPractice[0].state, "learning", "Archive must be an independent snapshot");
  assert.deepEqual(json(model.migrate(json(state))), json(state));
  assert.equal(model.deriveUnitIndex(state, child, "2026-09-14"), next.unitIndex, "Extra marks must not skip the unstarted core lesson");
});

test("unfinished extras carry into a new week without mutating saved records during preview", () => {
  const state = model.migrate(seed()), child = state.students[0];
  const prior = model.getRecord(state, child, "2026-09-07", true);
  prior.additionalPractice = [extra("pending"), extra("finished", true)];
  const before = json(state.records);
  const preview = model.getRecord(state, child, "2026-09-14");
  assert.deepEqual(json(preview.additionalPractice.map(i => i.entryId)), ["pending"]);
  assert.deepEqual(json(state.records), before);
  assert.equal(preview.unitIndex, 2);
  assert.equal(model.getRecord(state, state.students[1], "2026-09-14").additionalPractice, undefined);
  const saved = model.getRecord(state, child, "2026-09-14", true);
  saved.additionalPractice[0].state = "known";
  assert.equal(prior.additionalPractice[0].state, "learning");
});

test("invalid extra-practice backups are rejected without changing source records", () => {
  const state = model.migrate(seed()), r = fullyKnown(state);
  r.additionalPractice = [extra("pending")];
  const before = json(state);
  for (const mutate of [item => {item.state = "maybe";}, item => {item.sourcePages = [99];}, item => {item.practiceFinished = "yes";}]) {
    const bad = json(state); mutate(bad.records[r.id].additionalPractice[0]);
    assert.throws(() => model.migrate(bad));
  }
  const duplicate = json(state); duplicate.records[r.id].additionalPractice.push(extra("pending"));
  assert.throws(() => model.migrate(duplicate));
  assert.deepEqual(json(state), before);
});

test("backdated extras reach new weeks even when an intervening lesson was recorded", () => {
  const state = model.migrate(seed()), child = state.students[0];
  const later = model.getRecord(state,child,"2026-09-14",true);
  later.itemStates[0] = "learning"; later.additionalPractice = [extra("later-extra")];
  const earlier = model.getRecord(state,child,"2026-09-07",true);
  earlier.additionalPractice = [extra("backdated-extra")];
  const before = json(state.records);
  assert.deepEqual(json(model.getRecord(state,child,"2026-09-21").additionalPractice.map(i=>i.entryId)), ["backdated-extra","later-extra"]);
  assert.deepEqual(json(state.records),before,"Recorded intervening weeks must not be rewritten");
});

test("removed extras never reappear but their earlier assessments stay in history", () => {
  const state = model.migrate(seed()), child = state.students[0];
  const earlier = fullyKnown(state); earlier.additionalPractice = [extra("remove-me"),extra("keep-me")];
  model.complete(state,child,"2026-09-07");
  const current = model.getRecord(state,child,"2026-09-07",true);
  current.additionalPractice = [extra("keep-me")]; current.removedExtraPracticeIds = ["remove-me"];
  const restored = model.migrate(json(state));
  assert.deepEqual(json(model.getRecord(restored,restored.students[0],"2026-09-14").additionalPractice.map(i=>i.entryId)),["keep-me"]);
  assert.equal(current.completedLessons[0].additionalPractice.length,2);
});

test("completed extra snapshots prevent older unfinished marks from resurfacing", () => {
  const state = model.migrate(seed()), child = state.students[0];
  const earlier = model.getRecord(state,child,"2026-09-07",true); earlier.additionalPractice = [extra("finished-later")];
  const later = fullyKnown(state,"2026-09-14"); later.additionalPractice = [extra("finished-later",true)];
  model.complete(state,child,"2026-09-14");
  assert.equal(model.getRecord(state,child,"2026-09-21").additionalPractice,undefined);
});

test("deleting a child keeps every weekly record, completed lesson and extra assessment", () => {
  const state = model.migrate(seed()), child = state.students[0];
  for (const week of ["2026-08-31","2026-09-07","2026-09-14"]) {
    const record = fullyKnown(state,week,child);
    record.notes = `Saved synthetic note ${week}`;
    record.additionalPractice = [extra(`phonics-${week}`)];
  }
  model.complete(state,child,"2026-09-07");
  const before = json(state), originalId = child.id;
  assert.equal(model.deleteStudent(state,child.id),true);
  assert.equal(state.students.length,before.students.length);
  assert.equal(child.id,originalId);
  assert.equal(child.active,false);
  assert.equal(new Date(child.deletedAt).toISOString(),child.deletedAt);
  assert.equal(state.selectedStudentId,"test-b");
  assert.deepEqual(json(state.records),before.records,"Deleting a roster entry must not erase its history or extras");
  assert.deepEqual(json(state.students.slice(1)),before.students.slice(1));
  assert.deepEqual(json(state.classes),before.classes);
  const deleted = json(state);
  assert.equal(model.deleteStudent(state,child.id),false);
  assert.equal(model.deleteStudent(state,"missing-child"),false);
  assert.deepEqual(json(state),deleted,"Repeated or missing deletion must be a no-op");
});

test("restore after a full backup round trip keeps the original child identity and history", () => {
  const state = model.migrate(seed()), child = state.students[0];
  const record = fullyKnown(state); record.additionalPractice = [extra("saved-extra",true)];
  model.complete(state,child,"2026-09-07");
  const original = json(state);
  assert.equal(model.deleteStudent(state,child.id),true);
  const restored = model.migrate(json(state));
  assert.equal(restored.students[0].active,false);
  assert.ok(restored.students[0].deletedAt);
  assert.equal(model.restoreStudent(restored,child.id),true);
  assert.deepEqual(json(restored.students[0]),{...original.students[0],active:true});
  assert.deepEqual(json(restored.records),original.records);
  assert.equal(restored.students.length,original.students.length);
  assert.equal(new Set(restored.students.map(item=>item.id)).size,restored.students.length);
  const before = json(restored);
  assert.equal(model.restoreStudent(restored,child.id),false);
  assert.equal(model.restoreStudent(restored,"missing-child"),false);
  assert.deepEqual(json(restored),before);
});

test("deleting the last child in the selected class never selects another class", () => {
  const state = model.migrate(seed());
  const otherClassChild = json(state.students[2]);
  assert.equal(model.deleteStudent(state,"test-b"),true);
  assert.equal(state.selectedStudentId,"test-a","Deleting an unselected child must keep the current child");
  assert.equal(model.deleteStudent(state,"test-a"),true);
  assert.equal(state.selectedStudentId,null);
  assert.equal(state.selectedClassId,"class-a");
  assert.deepEqual(json(state.students[2]),otherClassChild);
  assert.equal(model.restoreStudent(state,"test-a"),true);
  assert.equal(state.students.filter(item=>item.classId==="class-a" && item.active!==false).length,1);
});

test("invalid deletion recovery metadata is rejected without mutating the input", () => {
  const state = model.migrate(seed());
  for (const mutate of [child=>{child.active=false;child.deletedAt="invalid-date";},child=>{child.active=true;child.deletedAt="2026-09-14T05:00:00.000Z";}]) {
    const candidate = json(state); mutate(candidate.students[0]);
    const before = json(candidate);
    assert.throws(()=>model.migrate(candidate));
    assert.deepEqual(json(candidate),before);
  }
});

let failures = 0;
for (const {name, run} of cases) {
  try { await run(); console.log(`PASS ${name}`); }
  catch(error) { failures++; console.error(`FAIL ${name}\n${error.message}`); }
}
console.log(`${cases.length - failures}/${cases.length} model regression checks passed. Synthetic data only.`);
process.exitCode = failures ? 1 : 0;
