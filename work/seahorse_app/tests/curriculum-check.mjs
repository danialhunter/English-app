import assert from "node:assert/strict";

globalThis.window = {};
await import("../web/curriculum.js");

const curriculum = window.CURRICULUM;
const meta = window.CURRICULUM_META;
assert.equal(curriculum.length, 216);
assert.equal(meta.totalUnits, 216);
assert.equal(meta.totalVocabulary, 1072);
assert.equal(meta.totalSentenceStructures, 140);
assert.deepEqual(meta.levels.map((level) => level.id), ["pre-nursery", "nursery", "kindergarten-1", "kindergarten-2"]);
assert.deepEqual(meta.levels.map((level) => level.ageBand), ["2-3", "3-4", "4-5", "5-6"]);

let newVocabularySlots = 0;
let newSentenceSlots = 0;
for (const [index, unit] of curriculum.entries()) {
  assert.equal(unit.globalWeek, index + 1, `${unit.id} has the wrong global order`);
  assert.equal(unit.words.length, 5, `${unit.id} must have exactly five vocabulary entries`);
  assert.ok(unit.words.every((word) => typeof word === "string" && word.trim()), `${unit.id} has a blank vocabulary entry`);
  assert.ok(typeof unit.sentence === "string" && unit.sentence.trim(), `${unit.id} has no sentence structure`);
  assert.ok(unit.levelWeek > 0);
  assert.ok(unit.topic);
  newVocabularySlots += 5 - unit.reviewWordPositions.length;
  if (!unit.sentenceIsReview) newSentenceSlots += 1;
}

assert.equal(newVocabularySlots, meta.totalVocabulary, "Every source vocabulary entry must appear once before review fillers");
assert.equal(newSentenceSlots, meta.totalSentenceStructures, "Every source sentence structure must appear once before reviews");

for (const level of meta.levels) {
  const units = curriculum.filter((unit) => unit.levelId === level.id);
  assert.equal(units.length, level.unitCount);
  assert.deepEqual(units.map((unit) => unit.levelWeek), Array.from({ length: level.unitCount }, (_, index) => index + 1));
}

assert.deepEqual(curriculum[0].words, ["hello", "school", "kindergarten", "classroom", "good morning"]);
assert.equal(curriculum[0].sentence, "What is your name? - My name is ___.");
assert.equal(curriculum.at(-1).levelId, "kindergarten-2");
assert.deepEqual(curriculum.at(-1).words.slice(0, 3), ["fence", "shed", "lawn rake"]);
assert.deepEqual(curriculum.at(-1).reviewWordPositions, [3, 4]);

console.log("Curriculum checks passed");
