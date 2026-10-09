import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "../../..");
const vocabularyPath = process.argv[2] || path.join(projectDir, "work/vocab_extract/vocabulary.json");
const sentencesPath = process.argv[3] || path.join(projectDir, "work/manual_curriculum_source/sentences.json");
const outputPath = process.argv[4] || path.join(projectDir, "work/seahorse_app/web/curriculum.js");
const auditPath = process.argv[5] || path.join(projectDir, "work/seahorse_app/curriculum-audit.json");

const [vocabularySource, sentenceSource] = await Promise.all([
  fs.readFile(vocabularyPath, "utf8").then(JSON.parse),
  fs.readFile(sentencesPath, "utf8").then(JSON.parse)
]);

const levelOrder = ["pre-nursery", "nursery", "kindergarten-1", "kindergarten-2"];
const levelDefaults = {
  "pre-nursery": { name: "Pre-Nursery", ageBand: "2-3" },
  nursery: { name: "Nursery", ageBand: "3-4" },
  "kindergarten-1": { name: "Kindergarten 1", ageBand: "4-5" },
  "kindergarten-2": { name: "Kindergarten 2", ageBand: "5-6" }
};

function normalizedId(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("pre") && text.includes("nursery")) return "pre-nursery";
  if (text === "nursery" || (text.includes("nursery") && !text.includes("pre"))) return "nursery";
  if (text.includes("kindergarten") && (text.includes("1") || text.includes("k1"))) return "kindergarten-1";
  if (text.includes("kindergarten") && (text.includes("2") || text.includes("k2"))) return "kindergarten-2";
  if (text === "k1") return "kindergarten-1";
  if (text === "k2") return "kindergarten-2";
  return text.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function levelsFrom(source) {
  if (Array.isArray(source.levels)) return source.levels;
  if (Array.isArray(source)) return source;
  return Object.entries(source).map(([id, value]) => ({ id, ...(value || {}) }));
}

function cleanAgeBand(value) {
  return String(value || "").replace(/\s*(years?|yrs?)\.?\s*$/i, "").trim();
}

function normalizeVocabularyLevel(rawLevel) {
  const id = normalizedId(rawLevel.id || rawLevel.name || rawLevel.level);
  const defaults = levelDefaults[id] || {};
  const rawTopics = rawLevel.topics || rawLevel.categories || [];
  const topics = (Array.isArray(rawTopics) ? rawTopics : Object.entries(rawTopics).map(([name, items]) => ({ name, items })))
    .map((topic) => ({
      name: String(topic.name || topic.topic || topic.category || "Vocabulary").trim(),
      sourcePages: (topic.sourcePages || (topic.sourcePage ? [topic.sourcePage] : [])).map(Number).filter(Boolean),
      items: (topic.items || topic.words || topic.vocabulary || [])
        .map((item) => typeof item === "string" ? item : item.text || item.word || item.term)
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    }))
    .filter((topic) => topic.items.length);
  return {
    id,
    name: rawLevel.name || defaults.name || id,
    ageBand: cleanAgeBand(rawLevel.ageBand || rawLevel.age || defaults.ageBand || ""),
    topics
  };
}

function normalizeSentenceLevel(rawLevel) {
  const id = normalizedId(rawLevel.id || rawLevel.name || rawLevel.level);
  const defaults = levelDefaults[id] || {};
  const rawSentences = rawLevel.sentences || rawLevel.structures || rawLevel.items || [];
  const sentences = rawSentences.map((item) => {
    if (typeof item === "string") return { text: item, kind: "Sentence structure", sourcePage: null };
    const text = item.text || item.sentence || item.example || item.pattern;
    return {
      text: String(text || "").trim(),
      kind: String(item.kind || item.section || item.type || "Sentence structure").trim(),
      sourcePage: Number(item.sourcePage || item.page) || null
    };
  }).filter((item) => item.text);
  return {
    id,
    name: rawLevel.name || defaults.name || id,
    ageBand: cleanAgeBand(rawLevel.ageBand || rawLevel.age || defaults.ageBand || ""),
    sentences
  };
}

const vocabularyLevels = new Map(levelsFrom(vocabularySource).map(normalizeVocabularyLevel).map((level) => [level.id, level]));
const sentenceLevels = new Map(levelsFrom(sentenceSource).map(normalizeSentenceLevel).map((level) => [level.id, level]));

const units = [];
const levels = [];
const audits = [];
let globalWeek = 1;
let totalVocabulary = 0;
let totalSentenceStructures = 0;
let totalReviewWordSlots = 0;
let totalRepeatedSentenceSlots = 0;

for (const levelId of levelOrder) {
  const vocabularyLevel = vocabularyLevels.get(levelId);
  const sentenceLevel = sentenceLevels.get(levelId);
  if (!vocabularyLevel) throw new Error(`Missing vocabulary level: ${levelId}`);
  if (!sentenceLevel || !sentenceLevel.sentences.length) throw new Error(`Missing sentence structures for level: ${levelId}`);

  const defaults = levelDefaults[levelId];
  const words = vocabularyLevel.topics.flatMap((topic) => topic.items.map((text) => ({ text, topic: topic.name, sourcePages: topic.sourcePages })));
  const sentences = sentenceLevel.sentences;
  if (!words.length) throw new Error(`No vocabulary items for level: ${levelId}`);

  totalVocabulary += words.length;
  totalSentenceStructures += sentences.length;
  const vocabularyWeekCount = Math.ceil(words.length / 5);
  const unitCount = Math.max(vocabularyWeekCount, sentences.length);
  const firstUnitIndex = units.length;
  const finalTopicWordIndexes = words
    .map((word, index) => ({ topic: word.topic, index }))
    .filter((entry) => entry.topic === words.at(-1).topic)
    .map((entry) => entry.index);
  const seenSourceWordIndexes = new Set();
  const seenSourceSentenceIndexes = new Set();

  for (let localIndex = 0; localIndex < unitCount; localIndex += 1) {
    const weekWords = [];
    for (let wordOffset = 0; wordOffset < 5; wordOffset += 1) {
      const linearIndex = localIndex * 5 + wordOffset;
      const reviewOffset = Math.max(0, linearIndex - words.length);
      const sourceIndex = linearIndex < words.length
        ? linearIndex
        : localIndex < vocabularyWeekCount
          ? finalTopicWordIndexes[reviewOffset % finalTopicWordIndexes.length]
          : linearIndex % words.length;
      const sourceWord = words[sourceIndex];
      const isReview = linearIndex >= words.length;
      if (isReview) totalReviewWordSlots += 1;
      else seenSourceWordIndexes.add(sourceIndex);
      weekWords.push({ ...sourceWord, isReview });
    }
    const sentenceIndex = localIndex % sentences.length;
    const sentence = sentences[sentenceIndex];
    const sentenceIsReview = localIndex >= sentences.length;
    if (sentenceIsReview) totalRepeatedSentenceSlots += 1;
    else seenSourceSentenceIndexes.add(sentenceIndex);

    const topicNames = [...new Set(weekWords.map((word) => word.topic))];
    const sourcePages = [...new Set([
      ...weekWords.flatMap((word) => word.sourcePages || []),
      ...(sentence.sourcePage ? [sentence.sourcePage] : [])
    ])].sort((a, b) => a - b);
    const levelWeek = localIndex + 1;
    units.push({
      id: `${levelId}-${String(levelWeek).padStart(3, "0")}`,
      levelId,
      levelName: vocabularyLevel.name || sentenceLevel.name || defaults.name,
      ageBand: vocabularyLevel.ageBand || sentenceLevel.ageBand || defaults.ageBand,
      levelWeek,
      globalWeek,
      topic: topicNames.join(" / "),
      words: weekWords.map((word) => word.text),
      reviewWordPositions: weekWords.map((word, index) => word.isReview ? index : null).filter((index) => index !== null),
      sentence: sentence.text,
      sentenceKind: sentence.kind,
      sentenceIsReview,
      sourcePages
    });
    globalWeek += 1;
  }

  const audit = {
    id: levelId,
    name: vocabularyLevel.name || sentenceLevel.name || defaults.name,
    ageBand: vocabularyLevel.ageBand || sentenceLevel.ageBand || defaults.ageBand,
    vocabularyCount: words.length,
    sentenceStructureCount: sentences.length,
    unitCount,
    sourceVocabularyCovered: seenSourceWordIndexes.size,
    sourceSentencesCovered: seenSourceSentenceIndexes.size,
    reviewWordSlots: Math.max(0, unitCount * 5 - words.length),
    repeatedSentenceSlots: Math.max(0, unitCount - sentences.length),
    firstUnitIndex
  };
  if (audit.sourceVocabularyCovered !== words.length) throw new Error(`Vocabulary coverage failed for ${levelId}`);
  if (audit.sourceSentencesCovered !== sentences.length) throw new Error(`Sentence coverage failed for ${levelId}`);
  audits.push(audit);
  levels.push({ id: levelId, name: audit.name, ageBand: audit.ageBand, firstUnitIndex, unitCount });
}

for (const unit of units) {
  if (unit.words.length !== 5) throw new Error(`Unit ${unit.id} does not contain five vocabulary entries`);
  if (!unit.sentence) throw new Error(`Unit ${unit.id} does not contain a sentence`);
}

const meta = {
  version: "teacher-guide-2024-v1",
  generatedAt: new Date().toISOString(),
  sourceTitle: "A Teacher's Guide to English Teaching",
  totalVocabulary,
  totalSentenceStructures,
  totalUnits: units.length,
  totalReviewWordSlots,
  totalRepeatedSentenceSlots,
  levels
};

const javascript = `// Generated from the supplied teacher guide. Source order is preserved.\nwindow.CURRICULUM_META = ${JSON.stringify(meta, null, 2)};\n\nwindow.CURRICULUM = ${JSON.stringify(units, null, 2)};\n`;
await fs.writeFile(outputPath, javascript, "utf8");
await fs.writeFile(auditPath, JSON.stringify({
  meta,
  levels: audits,
  sentenceAdaptationsForClassroomUse: sentenceSource.adaptationsForClassroomUse || []
}, null, 2), "utf8");
console.log(JSON.stringify({ outputPath, auditPath, meta, levels: audits }, null, 2));
