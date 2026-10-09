import assert from "node:assert/strict";
import { createHarness } from "./app-harness.mjs";

const cases = [];
const test = (name, run) => cases.push({ name, run });

test("Excel exports preserve ordinary text and escape formula-leading characters", () => {
  const h = createHarness();
  assert.equal(h.api.csvCell("test note"), '"test note"');
  assert.equal(h.api.csvCell("root note"), '"root note"');
  for (const value of ["=1", "+1", "-1", "@SUM(1)", "\t=1", "\r=1"]) assert.equal(h.api.csvCell(value), `"'${value}"`);
});

test("a failed native save keeps current edits and permits a successful retry", () => {
  const h = createHarness();
  const writes = [];
  h.window.webkit = {messageHandlers: {saveData: {postMessage(value) {writes.push(value);}}}};
  h.api.updateItemState(0, "known");
  h.window.onNativeSaveResult(false, "Synthetic disk failure");
  assert.equal(h.node("storageAlert").classList.contains("is-hidden"), false);
  assert.match(h.node("saveStatus").textContent, /Not saved/);
  h.api.updateItemState(1, "known");
  assert.equal(writes.length, 2, "A previous save failure must not disable subsequent saves");
  const latest = JSON.parse(writes.at(-1));
  assert.deepEqual(latest.records["test-a::2026-09-07"].itemStates.slice(0, 2), ["known", "known"]);
  h.window.onNativeSaveResult(true);
  assert.equal(h.node("storageAlert").classList.contains("is-hidden"), true);
  assert.match(h.node("saveStatus").textContent, /Saved on this computer/);
});

test("failed native loading blocks edits from overwriting unreadable saved progress", () => {
  const h = createHarness();
  const writes = [];
  h.window.webkit = {messageHandlers: {saveData: {postMessage(value) {writes.push(value);}}}};
  h.window.onNativeDataLoaded(null, false, {ok: false, error: "Synthetic unreadable data"});
  const before = h.json(h.api.getState().records);
  h.api.updateItemState(0, "known");
  h.api.togglePractice();
  assert.deepEqual(h.json(h.api.getState().records), before);
  assert.equal(writes.length, 0);
  assert.equal(h.node("storageAlert").classList.contains("is-hidden"), false);
});

test("rapid child navigation saves the note against its original child", () => {
  const h = createHarness();
  h.node("teacherNotes").value = "Synthetic teacher note for the first child";
  h.node("teacherNotes").listeners.get("input")({ target: h.node("teacherNotes") });
  h.api.selectStudent("test-b");
  h.flushTimers();
  const state = h.api.getState();
  assert.equal(state.records["test-a::2026-09-07"].notes, "Synthetic teacher note for the first child");
  assert.equal(state.records["test-b::2026-09-07"]?.notes || "", "");
});

test("a rejected damaged backup leaves the current roster and progress intact", async () => {
  const h = createHarness();
  h.api.updateItemState(0, "known");
  const before = h.json(h.api.getState());
  const damaged = h.seed();
  damaged.students[0].englishName = "Damaged restore candidate";
  damaged.records = { broken: null };
  await h.api.importBackup({ text: async () => JSON.stringify({ format: "Seahorse English Tracker Backup", data: damaged }) });
  assert.deepEqual(h.json(h.api.getState()), before);
});

test("children starting together receive the same calendar lesson even if opened later", () => {
  const h = createHarness();
  h.api.setWeek("2026-09-28");
  const [first, second] = h.api.getState().students;
  assert.equal(h.api.deriveUnitIndex(first, "2026-09-28"), h.api.deriveUnitIndex(second, "2026-09-28"));
});

test("finishing a fully known lesson opens next practice in the same week", () => {
  const h = createHarness();
  for (let index = 0; index < 6; index++) h.api.updateItemState(index, "known");
  h.api.togglePractice();
  const state = h.api.getState();
  assert.equal(state.selectedWeekStart, "2026-09-07");
  const current = h.api.getRecord(state.students[0], "2026-09-07", false);
  assert.equal(current.unitIndex, 1, "The next lesson should open without manually changing the lesson");
  assert.ok(Array.isArray(current.completedLessons) && current.completedLessons.some((lesson) => lesson.unitIndex === 0 && lesson.practiceFinished), "The finished lesson must remain in history");
});

test("knowledge edits never complete a previously finished practice without another Finished click", () => {
  const h = createHarness();
  h.api.togglePractice();
  for (let index = 0; index < 6; index++) h.api.updateItemState(index, "known");
  const state = h.api.getState(), child = state.students[0];
  const record = h.api.getRecord(child, "2026-09-07", false);
  assert.equal(record.unitIndex, 0);
  assert.equal(record.practiceFinished, false);
  assert.equal(record.completedLessons?.length || 0, 0);
  h.api.togglePractice();
  assert.equal(h.api.getRecord(child, "2026-09-07", false).unitIndex, 1);
});

test("mark all as known saves knowledge only until the teacher presses Finished", () => {
  const h = createHarness();
  h.node("completeKnownButton").click();
  const child = h.api.getState().students[0];
  const record = h.api.getRecord(child, "2026-09-07", false);
  assert.equal(record.unitIndex, 0);
  assert.equal(record.practiceFinished, false);
  assert.equal(record.itemStates.every(mark => mark === "known"), true);
  h.api.togglePractice();
  assert.equal(h.api.getRecord(child, "2026-09-07", false).unitIndex, 1);
});

test("upgrading preserves previously recorded lesson snapshots, notes and assessments", () => {
  const h = createHarness();
  h.api.getRecord(h.api.getState().students[0], "2026-09-07", true);
  const saved = h.json(h.api.getState());
  const record = saved.records["test-a::2026-09-07"];
  record.lesson.words = ["saved-one", "saved-two", "saved-three", "saved-four", "saved-five"];
  record.lesson.sentence = "The sentence originally taught.";
  record.itemStates = ["known", "learning", "unassessed", "known", "known", "learning"];
  record.notes = "Synthetic saved progress";
  record.practiceFinished = true;
  record.practicedAt = "2026-09-08T04:00:00.000Z";
  const expected = h.json(record);
  h.api.hydrateState(saved);
  const actual = h.api.getState().records[record.id];
  for (const field of ["lesson", "itemStates", "notes", "practiceFinished", "practicedAt", "unitIndex"]) assert.deepEqual(h.json(actual[field]), expected[field], field);
});

let failures = 0;
for (const { name, run } of cases) {
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}\n${error.message}`); }
}
console.log(`${cases.length - failures}/${cases.length} app regression checks passed. Synthetic in-memory data only.`);
process.exitCode = failures ? 1 : 0;
