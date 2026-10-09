import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { functionalGroups, companions, sightWordLists } from "./guide-supplement.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const appDir = path.join(root, "work/seahorse_app");
const pdfPath = process.argv[2] || path.join(appDir, "web/assets/teacher-guide.pdf");
const python = process.env.ETON_PYTHON || "python3";
const [pdfBytes, vocabulary, sentences, sourceVocabulary, curriculumJS] = await Promise.all([
  fs.readFile(pdfPath),
  fs.readFile(path.join(root, "work/manual_curriculum_source/vocabulary.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(root, "work/manual_curriculum_source/sentences.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(root, "work/vocab_extract/vocabulary.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(appDir, "web/curriculum.js"), "utf8")
]);
const extracted = spawnSync(python, ["-c", "import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps([p.extract_text(extraction_mode='layout', layout_mode_space_vertically=False) for p in r.pages],ensure_ascii=False))", pdfPath], { encoding:"utf8", maxBuffer:4*1024*1024 });
if (extracted.status !== 0) throw new Error(extracted.stderr || "PDF extraction failed");
const sourcePages = JSON.parse(extracted.stdout);
if (sourcePages.length !== 44) throw new Error("The supplied source must have 44 pages; review the source before rebuilding.");
const sourceAuditResult = spawnSync(python,[path.join(appDir,"scripts/audit-guide-source.py"),pdfPath],{encoding:"utf8",maxBuffer:1024*1024});
if (sourceAuditResult.status !== 0) throw new Error(sourceAuditResult.stdout || sourceAuditResult.stderr || "Guide source audit failed");
const sourceAudit = JSON.parse(sourceAuditResult.stdout);
const context = { window:{} };
vm.runInNewContext(curriculumJS, context);
const { CURRICULUM: curriculum, CURRICULUM_META: curriculumMeta } = context.window;
const categories = [
  {id:"vocabulary",name:"Vocabulary"}, {id:"sentences",name:"Sentence structures"},
  {id:"listening",name:"Listening & speaking"}, {id:"grammar",name:"Grammar"},
  {id:"phonics",name:"Phonics"}, {id:"reading",name:"Reading & sight words"},
  {id:"writing",name:"Writing"}, {id:"songs",name:"Songs & rhymes"}, {id:"teaching",name:"Teaching guidance"}
];
const levels = vocabulary.levels.map(({id,name,ageBand}) => ({id,name,ageBand}));
const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const entries = [];
function add(levelId, category, title, pages, text, items = [], extra = {}) {
  const level = levels.find((item) => item.id === levelId);
  const id = `${levelId}-${category}-${slug(title)}`;
  if (entries.some((entry) => entry.id === id)) throw new Error(`Duplicate entry: ${id}`);
  entries.push({id,levelId,levelName:level.name,ageBand:level.ageBand,category,title,text,items,sourcePages:pages,...extra});
}
for (const level of vocabulary.levels) {
  for (const topic of level.topics) {
    for (let offset = 0; offset < topic.items.length; offset += 5) {
      const items = topic.items.slice(offset, offset+5);
      const title = `${topic.name} · set ${Math.floor(offset/5)+1}`;
      const unitIds = curriculum.filter((unit) => unit.levelId === level.id && items.some((word) => unit.words.includes(word))).map((unit) => unit.id);
      add(level.id,"vocabulary",title,topic.sourcePages,items.join(" · "),items,{sourceKind:"topic-vocabulary",topic:topic.name,unitIds});
    }
  }
}
for (const level of sentences.levels) {
  level.sentences.forEach((sentence,index) => {
    const adaptation = sentences.adaptationsForClassroomUse.find((item) => sentence.text.includes(item.used));
    add(level.id,"sentences",sentence.text,[sentence.sourcePage],sentence.text,[sentence.text],{
      sourceKind:"weekly-sentence",sentenceKind:sentence.kind,
      unitIds:curriculum.filter((unit) => unit.levelId === level.id && unit.sentence === sentence.text).map((unit) => unit.id),
      ...(adaptation ? {sourceOriginal:adaptation.printed,adaptationNote:"The guide's printed example is corrected for classroom use; the original remains in the PDF."} : {})
    });
  });
}
// Each spoken phrase can be selected independently. Normalised punctuation and
// named placeholders make the source examples practical without changing meaning.
for (const [levelId,group,pages,guidance,phrases] of functionalGroups) {
  for (const [index,phrase] of phrases.entries()) {
    add(levelId,"listening",`${group} · ${index+1}: ${phrase}`,pages,phrase,[phrase],{sourceKind:"functional-language",topic:group,guidance});
  }
}
for (const [levelId,category,title,pages,text,items] of companions) {
  add(levelId,category,title,pages,text,items,{sourceKind:"teacher-companion",isSummary:true});
}
for (const list of sightWordLists) {
  const words = list.words.split(",").map((word) => word.trim());
  if (words.length !== list.expectedCount) throw new Error(`${list.title}: ${words.length} entries, expected ${list.expectedCount}`);
  for (let offset = 0; offset < words.length; offset += 5) {
    const items = words.slice(offset,offset+5);
    const pace = list.levelId === "kindergarten-1" ? "The guide suggests two or three new high-frequency words each week; choose a suitable subset of this set." : "The guide suggests three to five new high-frequency words each week, according to difficulty.";
    add(list.levelId,"reading",`${list.title} · set ${Math.floor(offset/5)+1}`,list.sourcePages,items.join(" · "),items,{sourceKind:"sight-words",topic:list.title,guidance:pace});
  }
}
for (const level of levels) {
  const pages = level.id === "pre-nursery" ? [2,5,8] : level.id === "nursery" ? [14,16,18] : level.id === "kindergarten-1" ? [23,26] : [32,35];
  add(level.id,"teaching","Observe, scaffold and teach through play",pages,"Set achievable individual goals from observation and documentation. Introduce language through meaningful play, familiar routines, stories and songs; development happens over time. Revisit material naturally and adapt the pace to the child.",[],{sourceKind:"teacher-companion",isSummary:true});
}

function pageInfo(pageNumber) {
  if (pageNumber === 1) return {levelId:null,title:"Cover (image only)",categories:["teaching"]};
  const levelId = pageNumber <= 13 ? "pre-nursery" : pageNumber <= 22 ? "nursery" : pageNumber <= 31 ? "kindergarten-1" : "kindergarten-2";
  const level = levels.find((item) => item.id === levelId);
  const literacy = (pageNumber>=5 && pageNumber<=7) || (pageNumber>=16 && pageNumber<=17) || (pageNumber>=26 && pageNumber<=28) || (pageNumber>=35 && pageNumber<=37);
  const readingTips = [8,18].includes(pageNumber);
  const songs = (pageNumber>=9 && pageNumber<=13) || (pageNumber>=19 && pageNumber<=22) || (pageNumber>=29 && pageNumber<=31) || (pageNumber>=38 && pageNumber<=44);
  const pageCategories = songs ? ["songs"] : readingTips ? ["reading","songs","teaching"] : literacy ? ["phonics","reading","writing"] : ["vocabulary","grammar","sentences","listening","teaching"];
  if ([5,16,26,35].includes(pageNumber)) pageCategories.push("grammar","listening");
  return {levelId,title:`${level.name} · ${songs ? "Songs and routines" : readingTips ? "Sharing books and rhymes" : literacy ? "Literacy" : "Communication and language"}`,categories:[...new Set(pageCategories)]};
}
const pages = sourcePages.map((text,index) => ({pageNumber:index+1,...pageInfo(index+1),text:text.trim()}));
const countsByCategory = Object.fromEntries(categories.map(({id}) => [id,entries.filter((entry) => entry.category === id).length]));
const vocabularyByLevel = Object.fromEntries(vocabulary.levels.map((level) => [level.id,level.topics.reduce((sum,topic) => sum+topic.items.length,0)]));
const meta = {
  version:"etonhouse-guide-library-2026-09-v1",sourceTitle:"A Teacher's Guide to English Teaching",sourceFile:"assets/teacher-guide.pdf",sourcePageCount:44,
  sourceSha256:createHash("sha256").update(pdfBytes).digest("hex"),
  totalEntries:entries.length,categoryCounts:countsByCategory,
  weeklyUnits:curriculum.length,weeklyVocabularyEntries:curriculumMeta.totalVocabulary,weeklySentenceStructures:curriculumMeta.totalSentenceStructures,
  expandedVocabularyEntries:Object.values(vocabularyByLevel).reduce((sum,count) => sum+count,0),vocabularyByLevel,
  sightWordEntries:sightWordLists.reduce((sum,list) => sum+list.expectedCount,0),
  functionalSentenceEntries:functionalGroups.reduce((sum,group) => sum+group[4].length,0),
  vocabularyCountingNote:"The weekly plan has 1,072 source vocabulary entries. Its grouped alternatives and examples expand to 1,096 vocabulary terms in the library. Counts retain repeats across topics/ages; they are not counts of distinct English words.",
  coverageNote:"All 44 original PDF pages are included. Weekly vocabulary and grammar-column sentences are retained; functional language, grammar guidance, phonics, sight words, reading, writing, songs and teaching guidance are now available in the library and original guide. Companion activities are practical summaries, not additional verbatim source requirements.",
  adaptationsForClassroomUse:sentences.adaptationsForClassroomUse,
  phonicsNotationNote:"Repeated oo and th represent the two printed sound positions. The source notation c k is retained. No phonics sounds are silently removed as duplicates."
};
const audit = {
  meta,
  sourceAudit,
  stableWeeklyCurriculumSha256:createHash("sha256").update(JSON.stringify(curriculum)).digest("hex"),
  sourceVocabularyByLevel:Object.fromEntries(sourceVocabulary.levels.map((level) => [level.id,level.topics.reduce((sum,topic) => sum+topic.items.length,0)])),
  countReconciliation:[
    {levelId:"pre-nursery",weekly:210,expanded:214,reason:"pets (dog, cat, bird, rabbit) is one printed entry and five individual terms."},
    {levelId:"nursery",weekly:271,expanded:287,reason:"good afternoon/evening/night adds two terms; fourteen opposite adjective pairs add fourteen. Other slash synonyms remain grouped."},
    {levelId:"kindergarten-1",weekly:328,expanded:330,reason:"train/bus/taxi station is expanded into three station names."},
    {levelId:"kindergarten-2",weekly:263,expanded:265,reason:"taxi/bus driver and refrigerator/fridge each expand into two terms."}
  ],
  preservedCorrections:["rolling pi → rolling pin (vocabulary transcription)",...sentences.adaptationsForClassroomUse.map((item) => `${item.printed} → ${item.used} (page ${item.sourcePage})`)],
  addedCoverage:[`${meta.functionalSentenceEntries} functional listening/speaking examples indexed individually (including short PN phrases)`,"220 source sight-word list entries, split into sets of no more than five","Age-specific grammar, all seven phonics groups and alternatives, reading/writing guidance and teaching companions","Complete original PDF and fresh text extraction for all 44 pages, including songs/routines and image-only cover"],
  limitation:"The guide points to external phonics and reading programmes; their separate books, workbooks, audio and online resources are not part of the supplied PDF and are not bundled. No additional curriculum or external teaching requirements were invented.",
  sourceReview:"Original PDF metadata and all pages freshly extracted. Detailed language/literacy sections compared with saved extraction and structured sources. Phonics and all five sight-word lists visually checked on physical pages 27, 28, 36 and 37. Original page references retained."
};
await fs.mkdir(path.join(appDir,"web/assets"),{recursive:true});
const bundledPdfPath=path.join(appDir,"web/assets/teacher-guide.pdf");
if(path.resolve(pdfPath)!==path.resolve(bundledPdfPath)) await fs.copyFile(pdfPath,bundledPdfPath);
await fs.writeFile(path.join(appDir,"web/guide-library.js"),`// Generated from the supplied EtonHouse teaching guide; see scripts/generate-guide-library.mjs.\nwindow.GUIDE_LIBRARY = ${JSON.stringify({meta,levels,categories,entries,pages},null,2)};\n`);
await fs.writeFile(path.join(appDir,"guide-audit.json"),JSON.stringify(audit,null,2)+"\n");
console.log(JSON.stringify(meta,null,2));
