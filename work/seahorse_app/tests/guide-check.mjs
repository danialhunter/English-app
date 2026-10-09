import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { functionalGroups, sightWordLists } from "../scripts/guide-supplement.mjs";

globalThis.window = {};
await import("../web/curriculum.js");
await import("../web/guide-library.js");
const { GUIDE_LIBRARY: library, CURRICULUM: curriculum } = window;
const {entries,pages,meta} = library;
const source = JSON.parse(await fs.readFile(new URL("../../manual_curriculum_source/vocabulary.json",import.meta.url)));
assert.equal(createHash("sha256").update(JSON.stringify(curriculum)).digest("hex"),"185cc909ab7ceff12a4855762818d3ca9d6f472b513324d303ccd1ca3efd3409","Existing saved lessons must retain their exact IDs, indexes and contents");
assert.equal(entries.length,meta.totalEntries);
assert.equal(new Set(entries.map((entry) => entry.id)).size,entries.length);
assert.deepEqual(pages.map((page) => page.pageNumber),Array.from({length:44},(_,index) => index+1));
assert.ok(pages.slice(1).every((page) => page.text.length > 100),"Every non-cover source page must have searchable text");
assert.equal(createHash("sha256").update(await fs.readFile(new URL("../web/assets/teacher-guide.pdf",import.meta.url))).digest("hex"),meta.sourceSha256,"The complete original PDF must be bundled byte for byte");
for (const entry of entries) {
  assert.ok(library.levels.some((level) => level.id === entry.levelId));
  assert.ok(library.categories.some((category) => category.id === entry.category));
  assert.ok(entry.title && entry.text);
  assert.ok(entry.sourcePages.length && entry.sourcePages.every((page) => page>=1 && page<=44));
  assert.ok(entry.items.every((item) => typeof item === "string" && item.trim()));
  if (entry.sourceKind === "sight-words" || entry.sourceKind === "topic-vocabulary") assert.ok(entry.items.length<=5);
}
for (const level of source.levels) {
  const actual = entries.filter((entry) => entry.levelId === level.id && entry.sourceKind === "topic-vocabulary").flatMap((entry) => entry.items);
  assert.deepEqual(actual,level.topics.flatMap((topic) => topic.items),`${level.name}: preserve each individual source term and topic-level repetition`);
  assert.equal(actual.length,meta.vocabularyByLevel[level.id]);
}
assert.equal(meta.expandedVocabularyEntries,1096);
assert.equal(meta.weeklyVocabularyEntries,1072);
assert.equal(entries.filter((entry) => entry.sourceKind === "weekly-sentence").length,140);
for (const unit of curriculum) assert.ok(entries.some((entry) => entry.sourceKind === "weekly-sentence" && entry.levelId === unit.levelId && entry.items[0] === unit.sentence));
for (const [levelId,group,, ,phrases] of functionalGroups) {
  const actual = entries.filter((entry) => entry.levelId === levelId && entry.sourceKind === "functional-language" && entry.topic === group).flatMap((entry) => entry.items);
  assert.deepEqual(actual,phrases,`${group}: each source phrase needs an individually selectable practice entry`);
}
assert.equal(meta.functionalSentenceEntries,152);
const leftColumn = (page) => page === 28 ? pages[page-1].text : pages[page-1].text.split("\n").map((line) => line.slice(0,66)).join("\n");
const printedSightWords = `${leftColumn(28)}\n${leftColumn(36)}\n${leftColumn(37)}`;
const boundaries = ["Pre-primer\\(40\\)","Primer\\(52\\)","1st\\s+Grade\\(41\\)","2nd\\s+Grade\\(46\\)","3rd\\s+Grade\\(41\\)"];
for (const [index,list] of sightWordLists.entries()) {
  const segment = printedSightWords.split(new RegExp(`${boundaries[index]}:`))[1];
  assert.ok(segment,`Find ${list.title} in fresh source extraction`);
  const end = index === sightWordLists.length-1 ? segment : segment.split(index===1 ? /accordance/ : /;/)[0];
  const actualSourceWords = end.trim().replace(/;$/," ").split(",").map((word) => word.trim().replace(/\s+/g," "));
  const indexed = entries.filter((entry) => entry.sourceKind === "sight-words" && entry.topic === list.title).flatMap((entry) => entry.items);
  assert.deepEqual(indexed,actualSourceWords,`${list.title}: library must match the printed list, including every word and its source order`);
  assert.equal(indexed.length,list.expectedCount);
}
assert.equal(entries.filter((entry) => entry.sourceKind === "sight-words").flatMap((entry) => entry.items).length,220);
for (let number=1;number<=7;number++) assert.ok(entries.some((entry) => entry.title===`Phonics group ${number}`));
assert.deepEqual(entries.find((entry) => entry.title==="Phonics group 5").items,["z","w","ng","v","oo","oo"]);
assert.deepEqual(entries.find((entry) => entry.title==="Phonics group 6").items,["y","x","ch","sh","th","th"]);
for (const correction of meta.adaptationsForClassroomUse) {
  assert.ok(entries.some((entry) => entry.sourceOriginal===correction.printed && entry.text.includes(correction.used)),`${correction.printed}: preserve original and corrected teaching version`);
}
console.log(`Guide checks passed: ${entries.length} selectable entries, 1,096 topic terms, 220 sight words, 152 functional phrases, all 44 original pages; existing 216 lessons unchanged.`);
