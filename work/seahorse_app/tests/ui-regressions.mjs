import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwright = require(process.env.SEATRACKER_PLAYWRIGHT || "playwright");
const webRoot = path.resolve(fileURLToPath(new URL("../web/", import.meta.url)));
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(webRoot, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!target.startsWith(`${webRoot}${path.sep}`)) { response.writeHead(403); response.end(); return; }
    response.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png":"image/png", ".pdf":"application/pdf", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })[path.extname(target)] || "application/octet-stream");
    response.end(await fs.readFile(target));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {}) });
const cases = [];
const test = (name, run, options = {}) => cases.push({ name, run, options });
const legacySeed = () => ({
  schemaVersion: 1, selectedWeekStart: "2026-09-07", selectedStudentId: "test-1", rosterTarget: 40,
  students: Array.from({ length: 40 }, (_, index) => ({ id: `test-${index + 1}`, englishName: `Test child ${index + 1}`, chineseName: "", group: "Test class", rosterNumber: index + 1, startUnit: 0, active: true })), records: {}
});
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("seahorse-english-tracker-v1")));
const recordedSeed = () => {
  const saved = legacySeed();
  for (const [index, week] of ["2026-08-31", "2026-09-07", "2026-09-14"].entries()) {
    const id = `test-1::${week}`;
    saved.records[id] = {
      id, studentId: "test-1", weekStart: week, unitIndex: index,
      lesson: { curriculumId: `original-${index}`, levelId: "pre-nursery", levelName: "Pre-Nursery", ageBand: "2-3", levelWeek: index + 1, globalWeek: index + 1, topic: "Original saved topic", words: Array.from({length:5}, (_, i) => `Originally taught ${index}-${i}`), sentence: `Original saved sentence ${index}`, reviewWordPositions: [], sourcePages: [3] },
      itemStates: ["known", "learning", "known", "unassessed", "known", "learning"], notes: `Original saved note ${index}`,
      practiceFinished: true, practicedAt: `${week}T05:00:00.000Z`, nextAction: "repeat", manuallyAssigned: false,
      createdAt: `${week}T05:00:00.000Z`, updatedAt: `${week}T05:30:00.000Z`
    };
  }
  return saved;
};

const deletionSeed = () => {
  const saved = recordedSeed();
  saved.schemaVersion = 3; saved.selectedClassId = "class-a";
  saved.classes = [{id:"class-a",name:"Test class",startWeek:"2026-08-31"},{id:"class-b",name:"Other test class",startWeek:"2026-08-31"}];
  saved.students = saved.students.slice(0,3).map((child,index)=>({...child,classId:index===2 ? "class-b" : "class-a",group:index===2 ? "Other test class" : "Test class",startWeek:"2026-08-31",studentCode:`roster-${index+1}`}));
  const record = saved.records["test-1::2026-09-07"];
  record.additionalPractice = [{entryId:"synthetic-phonics",title:"Saved phonics assessment",text:"A synthetic sound activity",category:"phonics",sourcePages:[27],state:"learning",practiceFinished:true}];
  const completed = JSON.parse(JSON.stringify(record));
  completed.notes = "Previously completed same-week lesson";
  completed.itemStates.fill("known"); completed.completedAt = "2026-09-07T05:20:00.000Z";
  record.completedLessons = [completed];
  const other = JSON.parse(JSON.stringify(saved.records["test-1::2026-09-14"]));
  other.id = "test-3::2026-09-14"; other.studentId = "test-3"; other.notes = "Another class must stay unchanged";
  saved.records[other.id] = other;
  return saved;
};
const onlyChildSeed = () => {
  const saved = deletionSeed(); saved.students = saved.students.filter(child=>child.id!=="test-2"); return saved;
};
async function deleteSelectedChild(page, accept=true) {
  await page.locator("#editStudentButton").click();
  let message = "";
  page.once("dialog",async dialog=>{message=dialog.message(); if(accept) await dialog.accept(); else await dialog.dismiss();});
  await page.locator("#deleteStudentButton").click();
  return message;
}
async function openRecentlyDeleted(page) {
  await page.locator("#manageClassesButton").click();
  await page.locator("#recentlyDeletedButton").click();
  await page.locator("#deletedStudentsDialog").waitFor({state:"visible"});
}
async function checkRecoveryLayout(page,selector,filename) {
  await page.setViewportSize({width:900,height:700});
  await page.screenshot({path:fileURLToPath(new URL(`../test-output/${filename}`,import.meta.url))});
  await page.setViewportSize({width:840,height:620});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Recovery UI must fit a small laptop width");
  assert.ok(await page.locator(selector).evaluate(element=>{
    const rect=element.getBoundingClientRect();
    return rect.left>=0 && rect.right<=innerWidth+1 && element.scrollWidth<=element.clientWidth+1;
  }),`${selector} must not overflow horizontally at 840×620`);
  await page.setViewportSize({width:1240,height:820});
}

const earlyCompletionSeed = () => ({
  schemaVersion:3, selectedWeekStart:"2026-09-14", selectedStudentId:"test-1", selectedClassId:"early-class", rosterTarget:2,
  classes:[{id:"early-class",name:"Early practice class",startWeek:"2026-09-14",startUnit:0},{id:"other-class",name:"Other practice class",startWeek:"2026-09-14",startUnit:0}],
  students:[
    {id:"test-1",classId:"early-class",group:"Early practice class",englishName:"Test child 1",chineseName:"",rosterNumber:1,startUnit:0,startWeek:"2026-09-14",active:true},
    {id:"test-2",classId:"early-class",group:"Early practice class",englishName:"Test child 2",chineseName:"",rosterNumber:2,startUnit:0,startWeek:"2026-09-14",active:true},
    {id:"test-3",classId:"other-class",group:"Other practice class",englishName:"Test child 3",chineseName:"",rosterNumber:1,startUnit:0,startWeek:"2026-09-14",active:true}
  ], records:{}
});
const earlyOptions = {seed:earlyCompletionSeed, now:"2026-09-14T04:00:00.000Z"};
async function chooseWeek(page,week) {
  await page.locator("#weekDateInput").fill(week);
  await page.locator("#weekDateInput").dispatchEvent("change");
}
async function finishKnownLessons(page,count) {
  for(let index=0;index<count;index++) {
    await page.locator("#completeKnownButton").click();
    await page.locator("#practiceButton").click();
  }
}
async function saveFullBackup(page) {
  await page.locator("#dataButton").click();
  const downloading=page.waitForEvent("download");
  await page.locator("#exportBackupButton").click();
  const backupPath=await (await downloading).path();
  await page.locator('[data-close-dialog="dataDialog"]').click();
  return backupPath;
}
async function restoreFullBackup(page,backupPath) {
  await page.locator("#dataButton").click();
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#importBackupInput").setInputFiles(backupPath);
  await page.waitForFunction(()=>document.getElementById("dataMessage").textContent.includes("restored successfully"));
  await page.locator('[data-close-dialog="dataDialog"]').click();
}

test("finishing next week's lesson early credits its week and keeps the next practice separate", async page=>{
  await finishKnownLessons(page,2);
  const completed=await state(page), source=completed.records["test-1::2026-09-14"];
  assert.equal(source.completedLessons.length,2);
  assert.equal(source.unitIndex,2,"Completing known material still opens the next practice immediately");
  const scheduled=source.completedLessons[1].lesson;
  await chooseWeek(page,"2026-09-21");
  assert.equal(await page.locator("#weekCompletionNotice").isVisible(),true);
  assert.match(await page.locator("#weekCompletionNotice").innerText(),/Completed/i);
  assert.match(await page.locator("#weekCompletionNotice").innerText(),/14 Sept(?:ember)?/);
  assert.equal(await page.locator("#weekCompletionNotice details").count(),0);
  assert.match(await page.locator("#nextPracticeLabel").innerText(),/Next practice/i);
  assert.equal(await page.locator("#practicedCount").innerText(),"1");
  assert.equal(await page.locator("#masteredCount").innerText(),"1");
  assert.equal(await page.locator("#needsReviewCount").innerText(),"0");
  assert.match(await page.locator('.student-row[data-student-id="test-1"] .practice-badge').innerText(),/Completed early/i);
  assert.deepEqual((await state(page)).records,completed.records,"Previewing credited weeks must not create or alter a saved practice record");
  await page.setViewportSize({width:900,height:700});
  await page.locator("#lessonPane").evaluate(element=>{element.scrollTop=0;});
  await page.screenshot({path:fileURLToPath(new URL("../test-output/completed-early-week-900x700.png",import.meta.url))});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"The completed-plan notice must fit a laptop window");
  await page.locator("#completionSourceButton").click();
  assert.equal(await page.locator("#historyDialog").isVisible(),true);
  assert.match(await page.locator("#historyTitle").innerText(),/Test child 1/);
  const history=await page.locator("#historyList").innerText();
  for(const item of [...scheduled.words,scheduled.sentence]) assert.ok(history.includes(item),`The completed record retains its original item: ${item}`);
},earlyOptions);

test("release check: weekly CSV includes the exact early-completion source and correct session labels",async page=>{
  await finishKnownLessons(page,1);
  await page.locator("#teacherNotes").fill('Finished ahead: "confident"\nKeep this exact source note.');
  await finishKnownLessons(page,1);
  const completed=await state(page), original=completed.records["test-1::2026-09-14"].completedLessons[1];
  await chooseWeek(page,"2026-09-21");
  await page.locator("#dataButton").click();
  const downloading=page.waitForEvent("download");
  await page.locator("#exportCsvButton").click();
  const csv=await fs.readFile(await (await downloading).path(),"utf8");
  const rows=await page.evaluate(text=>{
    const workbook=window.XLSX.read(text,{type:"string",raw:true});
    return window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{defval:""});
  },csv);
  const childRows=rows.filter(row=>row["English name"]==="Test child 1");
  assert.equal(childRows.length,2,"A credited week exports the completed source and a separate next practice");
  const credit=childRows.find(row=>row["Entry type"]==="Scheduled lesson completed early");
  assert.ok(credit,"The credited weekly lesson needs its own export row");
  assert.equal(credit.Session,"Scheduled completion");
  assert.equal(credit["Teaching week"],"2026-09-21");
  assert.equal(credit["Recorded week"],"2026-09-14");
  assert.match(credit["Actual practice date"],/14 Sept(?:ember)? 2026/);
  assert.equal(credit.Vocabulary,original.lesson.words.join(" | "));
  assert.equal(credit.Sentence,original.lesson.sentence);
  assert.equal(credit["Teacher note"],original.notes,"Quoted, multiline source notes must survive Excel export");
  assert.equal(String(credit["Curriculum week"]),String(original.lesson.levelWeek));
  assert.equal(credit["Practice finished"],"Yes");
  assert.equal(credit.Known,"6/6");
  assert.equal(credit["Knows all"],"Yes");
  assert.equal(credit["Scheduled lesson completed"],"Yes");
  assert.equal(credit["Completed early"],"Yes");
  const next=childRows.find(row=>row["Entry type"]==="Next practice (week already complete)");
  assert.ok(next); assert.equal(String(next.Session),"1");
  assert.equal(next["Practice finished"],"No"); assert.equal(next.Known,"0/6");
  assert.deepEqual((await state(page)).records,completed.records);
},earlyOptions);

test("release check: final curriculum completion stays completed in future weeks with actions disabled",async page=>{
  // This boundary check starts the child at the final lesson. Jumping from the
  // first lesson to future months in the picker is intentionally exam-gated.
  const starting=await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem("seahorse-english-tracker-v1"));
    saved.students.find(child=>child.id==="test-1").startUnit=window.CURRICULUM.length-1;
    return saved;
  });
  await page.evaluate(saved=>localStorage.setItem("seahorse-english-tracker-v1",JSON.stringify(saved)),starting);
  await page.reload({waitUntil:"networkidle"});
  const sentence=await page.locator("#sentenceItem .learning-item-text").innerText();
  await finishKnownLessons(page,1);
  const completed=await state(page);
  assert.equal(completed.records["test-1::2026-09-14"].curriculumFinished,true);
  await chooseWeek(page,"2026-09-21");
  assert.equal(await page.locator("#weekCompletionNotice").isVisible(),true);
  assert.equal(await page.locator("#practiceButton").isDisabled(),true);
  assert.equal(await page.locator("#completeKnownButton").isDisabled(),true);
  assert.equal(await page.locator('[data-item-index][data-state]:not(:disabled)').count(),0);
  assert.equal(await page.locator('[data-state="known"].is-active').count(),6);
  assert.match(await page.locator("#nextPracticeLabel").innerText(),/Curriculum completed/i);
  assert.match(await page.locator("#practiceTitle").innerText(),/Curriculum completed/i);
  assert.equal(await page.locator("#nextPracticeHint").isHidden(),true);
  assert.equal(await page.locator("#masteryStrand").getAttribute("aria-label"),"6 of 6 known");
  assert.equal(await page.locator("#sentenceItem .learning-item-text").innerText(),sentence);
  assert.equal(await page.locator("#practicedCount").innerText(),"1");
  assert.equal((await state(page)).records["test-1::2026-09-21"],undefined);
  assert.deepEqual((await state(page)).records,completed.records);
},earlyOptions);

test("early completion is included in filters and next-child selection without crediting other children or classes",async page=>{
  await finishKnownLessons(page,2);
  await chooseWeek(page,"2026-09-21");
  await page.locator('[data-filter="not-practiced"]').click();
  assert.equal(await page.locator('.student-row[data-student-id="test-1"]').count(),0);
  assert.equal(await page.locator('.student-row[data-student-id="test-2"]').count(),1);
  await page.locator('[data-filter="mastered"]').click();
  assert.equal(await page.locator('.student-row[data-student-id="test-1"]').count(),1);
  assert.equal(await page.locator('.student-row[data-student-id="test-2"]').count(),0);
  await page.locator('[data-filter="all"]').click();
  await page.locator('.student-row[data-student-id="test-2"]').click();
  assert.equal(await page.locator("#weekCompletionNotice").isHidden(),true);
  await page.locator("#nextUnpracticedButton").click();
  assert.equal((await state(page)).selectedStudentId,"test-2","The queue must skip the child who already completed this week's lesson");
  await page.locator("#classSelect").selectOption("other-class");
  assert.equal(await page.locator("#practicedCount").innerText(),"0");
  assert.equal(await page.locator("#masteredCount").innerText(),"0");
  assert.equal(await page.locator("#weekCompletionNotice").isHidden(),true);
  assert.equal((await state(page)).records["test-3::2026-09-21"],undefined);
},earlyOptions);

test("several lessons completed ahead credit only their own planned future weeks",async page=>{
  await finishKnownLessons(page,3);
  const completed=await state(page);
  // The last completed September lesson stays visible at the monthly boundary.
  // Browsing its already-completed September weeks remains safe and read-only.
  assert.equal(await page.locator("#examRequiredDialog").isVisible(),true);
  await page.locator('[data-close-dialog="examRequiredDialog"]').first().click();
  await chooseWeek(page,"2026-09-21");
  assert.equal((await state(page)).selectedWeekStart,"2026-09-21");
  assert.equal(await page.locator("#weekCompletionNotice").isVisible(),true);
  assert.deepEqual((await state(page)).records,completed.records);
  // Completed legacy exam results remain valid even when not all historical
  // practice was recorded. New-exam readiness is covered in the policy suite.
  // Migrating these explicit synthetic results must not rewrite teaching records.
  await page.evaluate(()=>{
    const saved=JSON.parse(localStorage.getItem("seahorse-english-tracker-v1")),exams=window.MonthlyExams;
    const period="2026-09-01",preview=exams.previewRound(saved,saved.selectedClassId,period);
    const {frozen,label,period:periodDetails,...round}=preview;
    const timestamp=new Date().toISOString();round.startedAt=timestamp;
    for(const child of preview.cohort){
      round.attempts[child.studentId]={draft:null,history:[{id:`legacy-${child.studentId}`,startedAt:timestamp,updatedAt:timestamp,completedAt:timestamp,itemStates:Array(child.items.length).fill("known"),notes:"Synthetic completed legacy exam"}]};
    }
    saved.monthlyExams.rounds[round.id]=round;saved.schemaVersion=5;
    localStorage.setItem("seahorse-english-tracker-v1",JSON.stringify(window.TrackerModel.migrate(saved)));
  });
  await page.reload({waitUntil:"networkidle"});
  assert.deepEqual((await state(page)).records,completed.records);
  for(const [week,index] of [["2026-09-21",1],["2026-09-28",2]]) {
    await chooseWeek(page,week);
    assert.equal(await page.locator("#weekCompletionNotice").isVisible(),true);
    const source=completed.records["test-1::2026-09-14"],expected=[...(source.completedLessons || []),source][index].lesson;
    await page.locator("#completionSourceButton").click();
    const details=await page.locator("#historyList").innerText();
    for(const word of expected.words) assert.ok(details.includes(word));
    assert.ok(details.includes(expected.sentence));
    await page.locator('[data-close-dialog="historyDialog"]').click();
    assert.equal(await page.locator("#practicedCount").innerText(),"1");
  }
  await chooseWeek(page,"2026-10-05");
  assert.equal(await page.locator("#weekCompletionNotice").isHidden(),true);
  assert.equal(await page.locator("#practicedCount").innerText(),"0");
  assert.equal(await page.locator("#masteredCount").innerText(),"0");
  assert.deepEqual((await state(page)).records,completed.records);
},earlyOptions);

test("undo removes future completion credit and restoring its backup recovers the original completed records",async page=>{
  await finishKnownLessons(page,2);
  const completed=await state(page), backupPath=await saveFullBackup(page);
  await page.locator("#undoCompletionButton").click();
  await chooseWeek(page,"2026-09-21");
  assert.equal(await page.locator("#weekCompletionNotice").isHidden(),true);
  assert.equal(await page.locator("#practicedCount").innerText(),"0");
  await page.reload({waitUntil:"networkidle"});
  assert.equal(await page.locator("#weekCompletionNotice").isHidden(),true);
  await restoreFullBackup(page,backupPath);
  await chooseWeek(page,"2026-09-21");
  assert.equal(await page.locator("#weekCompletionNotice").isVisible(),true);
  assert.equal(await page.locator("#masteredCount").innerText(),"1");
  assert.deepEqual((await state(page)).records,completed.records);
  await page.reload({waitUntil:"networkidle"});
  assert.equal(await page.locator("#weekCompletionNotice").isVisible(),true);
  assert.deepEqual((await state(page)).records,completed.records);
},earlyOptions);

test("restoring an older backup removes completion credit that is absent from that backup",async page=>{
  const backupPath=await saveFullBackup(page);
  await finishKnownLessons(page,2);
  await chooseWeek(page,"2026-09-21");
  assert.equal(await page.locator("#weekCompletionNotice").isVisible(),true);
  await restoreFullBackup(page,backupPath);
  await chooseWeek(page,"2026-09-21");
  assert.equal(await page.locator("#weekCompletionNotice").isHidden(),true);
  assert.equal(await page.locator("#practicedCount").innerText(),"0");
  assert.deepEqual((await state(page)).records,{});
},earlyOptions);

test("completing a directly selected future week shows its actual early completion date",async page=>{
  await chooseWeek(page,"2026-09-21");
  const sentence=await page.locator("#sentenceItem .learning-item-text").innerText();
  await finishKnownLessons(page,1);
  const record=(await state(page)).records["test-1::2026-09-21"];
  assert.equal(record.completedLessons[0].practicedAt.slice(0,10),"2026-09-14");
  assert.equal(await page.locator("#weekCompletionNotice").isVisible(),true);
  assert.match(await page.locator("#weekCompletionNotice").innerText(),/Completed/i);
  assert.match(await page.locator("#weekCompletionNotice").innerText(),/14 Sept(?:ember)?/);
  assert.match(await page.locator('.student-row[data-student-id="test-1"] .practice-badge').innerText(),/Completed early/i);
  await page.locator("#completionSourceButton").click();
  assert.ok((await page.locator("#historyList").innerText()).includes(sentence));
},earlyOptions);

test("an explicitly repeated completed lesson still needs a new practice in its repeated week",async page=>{
  await chooseWeek(page,"2026-09-21");
  assert.equal(await page.locator("#weekCompletionNotice").isHidden(),true);
  assert.equal(await page.locator("#practicedCount").innerText(),"0");
  assert.equal(await page.locator("#masteredCount").innerText(),"0");
  assert.ok(!/Completed early/i.test(await page.locator('.student-row[data-student-id="test-1"] .practice-badge').innerText()));
  assert.match(await page.locator("#nextPracticeLabel").innerText(),/This week.s lesson/i);
},{...earlyOptions,seed:()=>{
  const saved=earlyCompletionSeed();
  saved.records["test-1::2026-09-14"]={id:"test-1::2026-09-14",studentId:"test-1",weekStart:"2026-09-14",unitIndex:0,
    lesson:{curriculumId:"pre-nursery-001",levelId:"pre-nursery",levelName:"Pre-Nursery",ageBand:"2-3",levelWeek:1,globalWeek:1,topic:"School life",words:["hello","school","kindergarten","classroom","good morning"],sentence:"What is your name? - My name is ___.",reviewWordPositions:[],sourcePages:[3]},
    itemStates:Array(6).fill("known"),practiceFinished:true,practicedAt:"2026-09-14T04:00:00.000Z",notes:"Teacher deliberately requested another practice next week.",nextAction:"repeat",nextActionExplicit:true,manuallyAssigned:false,
    createdAt:"2026-09-14T04:00:00.000Z",updatedAt:"2026-09-14T04:00:00.000Z"};
  return saved;
}});

test("fresh installation starts with no private class roster", async (page) => {
  assert.equal(await page.locator(".student-row").count(), 0);
}, { fresh: true });

test("cancel child dialog does not add a child", async (page) => {
  const before = await page.locator(".student-row").count();
  await page.locator("#addStudentButton").click();
  await page.locator("#englishNameInput").fill("Cancelled test child");
  await page.locator("#studentDialog").getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.locator(".student-row").count(), before);
});

test("a Chinese-only name can be added", async (page) => {
  const before = await page.locator(".student-row").count();
  await page.locator("#addStudentButton").click();
  await page.locator("#chineseNameInput").fill("测试学生");
  await page.locator("#saveStudentButton").click();
  assert.equal(await page.locator(".student-row").count(), before + 1);
});

test("roster and lesson can both scroll at laptop size", async (page) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  for (const selector of ["#studentList", "#lessonPane"]) {
    const result = await page.locator(selector).evaluate((element) => { const overflow = element.scrollHeight > element.clientHeight; element.scrollTop = element.scrollHeight; return { overflow, scrollTop: element.scrollTop }; });
    assert.ok(result.overflow && result.scrollTop > 0, `${selector} must be scrollable`);
  }
});

test("dashboard fits normal and smaller laptop windows", async (page) => {
  const output = new URL("../test-output/", import.meta.url);
  await fs.mkdir(output, {recursive: true});
  for (const [width, height] of [[1240, 820], [900, 700]]) {
    await page.setViewportSize({width, height});
    await page.locator("#lessonPane").evaluate(element => {element.scrollTop = 0;});
    await page.locator(".sidebar").evaluate(element => {element.scrollTop = 0;});
    await page.screenshot({path: fileURLToPath(new URL(`dashboard-v2-${width}x${height}.png`, output))});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No hidden horizontal overflow");
    for (const [container, children] of [[".class-summary", ".summary-numbers span"], ["#filterRow", "button"]]) {
      const unclipped = await page.locator(container).evaluate((parent, selector) => {
        const bounds = parent.getBoundingClientRect();
        return [...parent.querySelectorAll(selector)].every(child => { const rect = child.getBoundingClientRect(); return rect.top >= bounds.top && rect.bottom <= bounds.bottom + 1; });
      }, children);
      assert.ok(unclipped, `${container} labels/buttons must not be vertically clipped at ${width}×${height}`);
    }
  }
});

test("switching child returns lesson scroll to its heading", async (page) => {
  await page.locator("#lessonPane").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.locator("#nextStudentButton").click();
  await page.waitForTimeout(400);
  assert.ok(await page.locator("#lessonPane").evaluate((element) => element.scrollTop < 50));
});

test("rapid child navigation preserves the typed note", async (page) => {
  await page.locator("#teacherNotes").fill("Synthetic note that belongs to child one");
  await page.locator('.student-row[data-student-id="test-2"]').click();
  await page.waitForTimeout(400);
  const saved = await state(page);
  assert.equal(saved.records["test-1::2026-09-07"].notes, "Synthetic note that belongs to child one");
  assert.equal(saved.records["test-2::2026-09-07"]?.notes || "", "");
});

test("previewing future dates does not create practice records and assigns stable lessons", async (page) => {
  const before = (await state(page))?.records || {};
  await page.locator("#weekDateInput").fill("2026-09-28");
  await page.locator("#weekDateInput").dispatchEvent("change");
  const first = await page.locator("#curriculumWeekLabel").innerText();
  await page.locator('.student-row[data-student-id="test-2"]').click();
  assert.equal(await page.locator("#curriculumWeekLabel").innerText(), first);
  assert.deepEqual((await state(page)).records, before);
});

test("mastered completion opens another same-week lesson and keeps completed history", async (page) => {
  const firstLesson = await page.locator("#curriculumWeekLabel").innerText();
  const known = page.locator('[data-state="known"]');
  for (let index = 0; index < 6; index++) await known.nth(index).click();
  await page.locator("#practiceButton").click();
  assert.notEqual(await page.locator("#curriculumWeekLabel").innerText(), firstLesson);
  const saved = await state(page);
  const record = saved.records["test-1::2026-09-07"];
  assert.equal(saved.selectedWeekStart, "2026-09-07");
  assert.equal(record.completedLessons.length, 1);
  assert.equal(record.completedLessons[0].practiceFinished, true);
  assert.ok(record.completedLessons[0].itemStates.every((value) => value === "known"));
  assert.equal(record.unitIndex, 1);
  assert.equal(await page.locator("#practicedCount").innerText(), "1");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal((await state(page)).records[record.id].completedLessons.length, 1);
});

test("three previously recorded weeks survive migration, browsing and reload unchanged", async (page) => {
  const expected = recordedSeed().records;
  await page.locator('.student-row[data-student-id="test-2"]').click();
  await page.locator('.student-row[data-student-id="test-1"]').click();
  await page.locator("#weekDateInput").fill("2026-09-28");
  await page.locator("#weekDateInput").dispatchEvent("change");
  await page.reload({ waitUntil: "networkidle" });
  assert.deepEqual((await state(page)).records, expected);
  await page.locator("#historyButton").click();
  for (let index = 0; index < 3; index++) assert.ok((await page.locator("#historyList").innerText()).includes(`Original saved note ${index}`));
}, { seed: recordedSeed });

test("explicit known completion can be undone without losing previous weekly history", async (page) => {
  await finishKnownLessons(page,1);
  let saved = await state(page);
  assert.equal(saved.records["test-1::2026-09-07"].unitIndex, 1);
  assert.equal(saved.records["test-1::2026-09-07"].completedLessons.length, 1);
  await page.locator("#undoCompletionButton").click();
  saved = await state(page);
  assert.equal(saved.records["test-1::2026-09-07"].unitIndex, 0);
  assert.equal(saved.records["test-1::2026-09-07"].completedLessons?.length || 0, 0);
  assert.equal(saved.records["test-1::2026-09-07"].practiceFinished, false);
});

test("next unpracticed child skips completed children in the current class", async (page) => {
  await finishKnownLessons(page,1);
  await page.locator("#nextUnpracticedButton").click();
  assert.equal((await state(page)).selectedStudentId, "test-2");
});

test("Excel upload to a new class preserves another class and its three weeks of progress", async (page) => {
  const original = recordedSeed().records;
  await page.locator("#manageClassesButton").click();
  await page.locator("#classNameInput").fill("New synthetic class");
  await page.locator("#classStartInput").fill("2026-09-07");
  await page.locator('#classForm button[type="submit"]').click();
  await page.locator("#importRosterInput").setInputFiles(fileURLToPath(new URL("../../roster_import/import-fixture.xlsx", import.meta.url)));
  await page.waitForFunction(() => !document.getElementById("confirmImportButton").disabled);
  assert.equal(await page.locator(".import-preview-row").count(), 4);
  await page.locator("#confirmImportButton").click();
  assert.equal(await page.locator(".student-row").count(), 4);
  const saved = await state(page);
  assert.equal(saved.students.length, 44);
  assert.equal(saved.classes.length, 2);
  assert.deepEqual(saved.records, original);
  const originalClass = saved.classes.find(group => group.name === "Test class");
  await page.locator("#classSelect").selectOption(originalClass.id);
  assert.equal(await page.locator(".student-row").count(), 40);
  assert.deepEqual((await state(page)).records, original);
}, { seed: recordedSeed });

test("reimporting an existing roster never duplicates children or changes their records", async (page) => {
  const original = (await state(page)).records;
  await page.locator("#manageClassesButton").click();
  const csv = "English name,Chinese name,Student ID,Starting age\nTest child 1,,,2-3\nTest child 2,,,2-3\n";
  await page.locator("#importRosterInput").setInputFiles({ name: "synthetic-repeat.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.waitForFunction(() => document.getElementById("classMessage").textContent.includes("existing children skipped"));
  assert.equal(await page.locator("#confirmImportButton").isDisabled(), true);
  assert.equal((await state(page)).students.length, 40);
  assert.deepEqual((await state(page)).records, original);
}, { seed: recordedSeed });

test("children sharing a name remain distinct through import and reimport by Student ID", async (page) => {
  const original = (await state(page)).records;
  const rows = ["English name,Chinese name,Student ID,Starting age", "Shared test name,,shared-1,2-3", "Shared test name,,shared-2,2-3"];
  for (const [index, csv] of [rows.join("\n"), [...rows, "Shared test name,,shared-3,2-3"].join("\n")].entries()) {
    await page.locator("#manageClassesButton").click();
    await page.locator("#importRosterInput").setInputFiles({name: "synthetic-shared-names.csv", mimeType: "text/csv", buffer: Buffer.from(csv)});
    await page.waitForFunction(() => !document.getElementById("confirmImportButton").disabled);
    assert.equal(await page.locator(".import-preview-row").count(), index === 0 ? 2 : 1);
    await page.locator("#confirmImportButton").click();
  }
  const saved = await state(page);
  const sameName = saved.students.filter(child => child.englishName === "Shared test name");
  assert.equal(sameName.length, 3);
  assert.equal(new Set(sameName.map(child => child.studentCode)).size, 3);
  assert.equal(new Set(sameName.map(child => child.id)).size, 3);
  assert.deepEqual(saved.records, original);
}, { seed: recordedSeed });

test("damaged backup import preserves all existing saved progress", async (page) => {
  const before = await state(page);
  await page.locator("#dataButton").click();
  const broken = {...before, records: {broken: null}};
  await page.locator("#importBackupInput").setInputFiles({name: "damaged-synthetic.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({format: "Seahorse English Tracker Backup", data: broken}))});
  await page.waitForFunction(() => document.getElementById("dataMessage").textContent.includes("Current data was not changed"));
  assert.deepEqual(await state(page), before);
}, { seed: recordedSeed });

test("history and Excel export include completed lessons plus the newly opened practice", async (page) => {
  await page.locator("#teacherNotes").fill("test note attached to completed practice");
  await finishKnownLessons(page,1);
  await page.locator("#historyButton").click();
  assert.equal(await page.locator(".history-session").count(), 2);
  assert.ok((await page.locator("#historyList").innerText()).includes("test note attached to completed practice"));
  await page.locator('[data-close-dialog="historyDialog"]').click();
  await page.locator("#dataButton").click();
  const downloading = page.waitForEvent("download");
  await page.locator("#exportCsvButton").click();
  const download = await downloading;
  const csv = await fs.readFile(await download.path(), "utf8");
  assert.ok(csv.includes('"test note attached to completed practice"'));
  assert.equal(csv.trim().split(/\r?\n/).length, 42, "Header + 40 children + one extra completed lesson");
  assert.ok(csv.includes('"6/6"'));
});

test("full backup restores completed history and keeps a safety copy of current data", async (page) => {
  await finishKnownLessons(page,1);
  const saved = await state(page);
  await page.locator("#dataButton").click();
  const downloading = page.waitForEvent("download");
  await page.locator("#exportBackupButton").click();
  const download = await downloading;
  const backupPath = await download.path();
  await page.locator('[data-close-dialog="dataDialog"]').click();
  await page.locator("#teacherNotes").fill("State just before backup restore");
  const beforeRestore = await state(page);
  await page.locator("#dataButton").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#importBackupInput").setInputFiles(backupPath);
  await page.waitForFunction(() => document.getElementById("dataMessage").textContent.includes("restored successfully"));
  const restored = await state(page);
  for (const field of ["students", "classes", "records"]) assert.deepEqual(restored[field], saved[field]);
  const safetyCopy = await page.evaluate(() => JSON.parse(localStorage.getItem("seahorse-english-tracker-v1-before-restore")));
  assert.deepEqual(safetyCopy.records, beforeRestore.records);
});

test("corrupt saved data is protected from replacement during startup", async (page) => {
  assert.equal(await page.evaluate(() => localStorage.getItem("seahorse-english-tracker-v1")), "{truncated saved progress");
  assert.equal(await page.locator("#storageAlert").isVisible(), true);
  await page.locator("#nextWeekButton").click();
  assert.equal(await page.evaluate(() => localStorage.getItem("seahorse-english-tracker-v1")), "{truncated saved progress");
}, { corrupt: true });

test("EtonHouse branding and the complete searchable guide work offline", async (page) => {
  assert.ok((await page.title()).includes("EtonHouse"));
  await page.locator("#guideLibraryButton").click();
  await page.locator("#guideLevelSelect").selectOption("all");
  assert.ok((await page.locator("#guideSummary").innerText()).includes("647 teaching resources"));
  await page.locator("#guideCategorySelect").selectOption("source");
  assert.ok((await page.locator("#guideSummary").innerText()).includes("44 pages"));
  await page.locator("#guideCategorySelect").selectOption("phonics");
  await page.locator("#guideSearch").fill("phonics");
  assert.ok(await page.locator(".guide-result").count() > 0);
  assert.ok((await page.locator("#guideResults").innerText()).includes("Guide p."));
  await page.screenshot({path:fileURLToPath(new URL("../test-output/etonhouse-teaching-library.png", import.meta.url))});
  const pdf = await page.request.get(`${baseURL}/assets/teacher-guide.pdf`);
  assert.equal(pdf.status(), 200); assert.ok((await pdf.body()).subarray(0,4).toString() === "%PDF");
});

test("extra guide practice saves per child, survives reload and appears in history", async (page) => {
  await page.locator("#guideLibraryButton").click();
  await page.locator("#guideCategorySelect").selectOption("listening");
  const add = page.locator("[data-use-guide]").first();
  const entryId = await add.getAttribute("data-use-guide");
  await add.click();
  assert.ok(await add.isDisabled());
  await page.locator('#guideDialog [data-close-dialog]').click();
  await page.locator('[data-extra-field="state"]').selectOption("known");
  await page.locator('[data-extra-field="practiceFinished"]').check();
  await page.reload({waitUntil:"networkidle"});
  let saved = await state(page), record = saved.records["test-1::2026-09-07"];
  assert.equal(record.additionalPractice[0].entryId, entryId);
  assert.equal(record.additionalPractice[0].state, "known");
  assert.equal(record.additionalPractice[0].practiceFinished, true);
  await page.locator('.student-row[data-student-id="test-2"]').click();
  assert.equal(await page.locator(".extra-practice").count(), 0);
  await page.locator('.student-row[data-student-id="test-1"]').click();
  await finishKnownLessons(page,1);
  saved = await state(page); record = saved.records["test-1::2026-09-07"];
  assert.equal(record.completedLessons[0].additionalPractice[0].state, "known");
  assert.equal(record.additionalPractice.length, 0);
  await page.locator("#historyButton").click();
  assert.ok((await page.locator(".extra-practice-history").innerText()).includes("Knows it"));
});

test("unfinished extra practice carries without blocking completion undo", async (page) => {
  await page.locator("#guideLibraryButton").click();
  await page.locator("#guideCategorySelect").selectOption("grammar");
  await page.locator("[data-use-guide]").first().click();
  await page.locator('#guideDialog [data-close-dialog]').click();
  await page.locator('[data-extra-field="state"]').selectOption("learning");
  await finishKnownLessons(page,1);
  assert.equal((await state(page)).records["test-1::2026-09-07"].additionalPractice.length, 1);
  await page.locator("#undoCompletionButton").click();
  assert.equal((await state(page)).records["test-1::2026-09-07"].unitIndex, 0);
  assert.equal((await state(page)).records["test-1::2026-09-07"].additionalPractice.length, 1);
  await page.locator("#nextWeekButton").click();
  assert.equal(await page.locator(".extra-practice").count(), 1);
  assert.equal((await state(page)).records["test-1::2026-09-14"], undefined, "Preview must not create a saved week");
});

test("an extra does not lock an untouched main lesson and accidental extras can be removed", async (page) => {
  await page.locator("#guideLibraryButton").click();
  await page.locator("[data-use-guide]").first().click();
  await page.locator('#guideDialog [data-close-dialog]').click();
  await page.locator("#changeCurriculumButton").click();
  await page.locator("#lessonPickerSelect").selectOption("2");
  await page.locator("#confirmLessonChangeButton").click();
  let record = (await state(page)).records["test-1::2026-09-07"];
  assert.equal(record.unitIndex,2); assert.equal(record.additionalPractice.length,1);
  await page.locator("#grammarCompanion").evaluate(element => {element.open=true;});
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("[data-remove-extra]").click();
  record = (await state(page)).records["test-1::2026-09-07"];
  assert.equal(record.additionalPractice.length,0); assert.equal(record.removedExtraPracticeIds.length,1);
  await page.locator("#nextWeekButton").click();
  assert.equal(await page.locator(".extra-practice").count(),0);
}, {now:"2026-09-14T04:00:00.000Z"});

test("delete is only offered for an existing child and cancelling preserves everything", async page=>{
  await page.locator("#addStudentButton").click();
  assert.equal(await page.locator("#deleteStudentButton").isHidden(),true);
  await page.locator('#studentDialog [data-close-dialog="studentDialog"]').first().click();
  const before = await state(page);
  const message = await deleteSelectedChild(page,false);
  assert.ok(message.includes("Test child 1"));
  assert.ok(message.includes("Test class"));
  assert.ok(/\b3\b/.test(message),"Confirmation must describe the three saved teaching weeks");
  assert.deepEqual(await state(page),before);
  assert.equal(await page.locator('.student-row[data-student-id="test-1"]').count(),1);
  await checkRecoveryLayout(page,"#studentDialog","delete-child-dialog-900x700.png");
}, {seed:deletionSeed});

test("delete preserves a pending note, assessments and other classes, then selects the next classmate", async page=>{
  await page.locator("#teacherNotes").fill("Pending note immediately before deletion");
  const before = await state(page);
  const message = await deleteSelectedChild(page);
  assert.ok(message.includes("Test child 1") && message.includes("Test class"));
  const saved = await state(page), child=saved.students.find(item=>item.id==="test-1");
  assert.equal(child.active,false); assert.ok(child.deletedAt);
  assert.equal(saved.students.length,before.students.length);
  assert.equal(saved.selectedStudentId,"test-2");
  assert.equal(saved.selectedClassId,"class-a");
  assert.equal(await page.locator('.student-row[data-student-id="test-1"]').count(),0);
  assert.equal(await page.locator(".student-row").count(),1);
  assert.equal(saved.records["test-1::2026-09-07"].notes,"Pending note immediately before deletion");
  assert.deepEqual(saved.records,before.records);
  assert.deepEqual(saved.students.filter(item=>item.id!=="test-1"),before.students.filter(item=>item.id!=="test-1"));
  await page.reload({waitUntil:"networkidle"});
  assert.equal((await state(page)).students.find(item=>item.id==="test-1").active,false);
  assert.deepEqual((await state(page)).records,before.records);
}, {seed:deletionSeed});

test("recently deleted restores the same child ID with all recorded weeks and extra practice", async page=>{
  const before = await state(page);
  await deleteSelectedChild(page);
  await page.reload({waitUntil:"networkidle"});
  await openRecentlyDeleted(page);
  const row=page.locator('[data-deleted-student-id="test-1"]');
  assert.equal(await row.count(),1);
  assert.ok((await row.innerText()).includes("Test child 1"));
  await checkRecoveryLayout(page,"#deletedStudentsDialog","recently-deleted-dialog-900x700.png");
  await page.locator('[data-restore-student="test-1"]').click();
  let saved = await state(page);
  const restored=saved.students.find(item=>item.id==="test-1");
  assert.equal(restored.active,true); assert.equal(restored.deletedAt,undefined);
  assert.equal(saved.students.length,before.students.length);
  assert.deepEqual(saved.records,before.records);
  if(await page.locator("#deletedStudentsDialog").isVisible()) await page.locator('[data-close-dialog="deletedStudentsDialog"]').first().click();
  if(await page.locator("#classesDialog").isVisible()) await page.locator('[data-close-dialog="classesDialog"]').first().click();
  await page.locator('.student-row[data-student-id="test-1"]').click();
  await page.locator("#historyButton").click();
  assert.ok((await page.locator("#historyList").innerText()).includes("Previously completed same-week lesson"));
  assert.ok((await page.locator("#historyList").innerText()).includes("Saved phonics assessment"));
  await page.reload({waitUntil:"networkidle"});
  saved = await state(page);
  assert.equal(saved.students.find(item=>item.id==="test-1").active,true);
  assert.deepEqual(saved.records,before.records);
}, {seed:deletionSeed});

test("deleting the last child shows an empty class with a working recovery route", async page=>{
  const before = await state(page);
  await deleteSelectedChild(page);
  assert.equal(await page.locator(".student-row").count(),0);
  assert.equal(await page.locator("#emptyState").isVisible(),true);
  assert.equal((await state(page)).selectedStudentId,null);
  assert.equal((await state(page)).selectedClassId,"class-a");
  await openRecentlyDeleted(page);
  await page.locator('[data-restore-student="test-1"]').click();
  if(await page.locator("#deletedStudentsDialog").isVisible()) await page.locator('[data-close-dialog="deletedStudentsDialog"]').first().click();
  if(await page.locator("#classesDialog").isVisible()) await page.locator('[data-close-dialog="classesDialog"]').first().click();
  assert.equal(await page.locator(".student-row").count(),1);
  assert.equal(await page.locator("#emptyState").isHidden(),true);
  assert.deepEqual((await state(page)).records,before.records);
  await page.locator("#classSelect").selectOption("class-b");
  assert.equal(await page.locator('.student-row[data-student-id="test-3"]').count(),1);
}, {seed:onlyChildSeed});

test("full backup preserves deleted-child recovery and restoring it does not duplicate children", async page=>{
  await deleteSelectedChild(page);
  const deleted=await state(page);
  await page.locator("#dataButton").click();
  const downloading=page.waitForEvent("download");
  await page.locator("#exportBackupButton").click();
  const download=await downloading, backupPath=await download.path();
  const backup=JSON.parse(await fs.readFile(backupPath,"utf8"));
  assert.equal(backup.data.students.find(item=>item.id==="test-1").active,false);
  assert.deepEqual(backup.data.records,deleted.records);
  await page.locator('[data-close-dialog="dataDialog"]').click();
  await openRecentlyDeleted(page);
  await page.locator('[data-restore-student="test-1"]').click();
  if(await page.locator("#deletedStudentsDialog").isVisible()) await page.locator('[data-close-dialog="deletedStudentsDialog"]').first().click();
  if(await page.locator("#classesDialog").isVisible()) await page.locator('[data-close-dialog="classesDialog"]').first().click();
  await page.locator("#dataButton").click();
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#importBackupInput").setInputFiles(backupPath);
  await page.waitForFunction(()=>document.getElementById("dataMessage").textContent.includes("restored successfully"));
  const restored=await state(page);
  assert.equal(restored.students.find(item=>item.id==="test-1").active,false);
  assert.ok(restored.students.find(item=>item.id==="test-1").deletedAt);
  assert.equal(new Set(restored.students.map(item=>item.id)).size,deleted.students.length);
  assert.deepEqual(restored.records,deleted.records);
  await page.locator('[data-close-dialog="dataDialog"]').click();
  await openRecentlyDeleted(page);
  assert.equal(await page.locator('[data-restore-student="test-1"]').count(),1);
}, {seed:deletionSeed});

test("roster reimport explains a deleted match without resurrecting or duplicating the child", async page=>{
  await deleteSelectedChild(page);
  const before=await state(page);
  await page.locator("#manageClassesButton").click();
  for(const row of ["Test child 1,,roster-1,2-3","Test child 1,,,2-3"]) {
    await page.locator("#importRosterInput").setInputFiles({name:"synthetic-deleted.csv",mimeType:"text/csv",buffer:Buffer.from(`English name,Chinese name,Student ID,Starting age\n${row}\n`)});
    await page.waitForFunction(()=>/deleted/i.test(document.getElementById("classMessage").textContent));
    assert.equal(await page.locator("#confirmImportButton").isDisabled(),true);
    assert.equal(await page.locator(".import-preview-row").count(),0);
    assert.deepEqual((await state(page)).students,before.students);
    assert.deepEqual((await state(page)).records,before.records);
  }
}, {seed:deletionSeed});

test("a deleted child's Student ID cannot be imported under another name", async page=>{
  await deleteSelectedChild(page);
  const before=await state(page);
  await page.locator("#manageClassesButton").click();
  await page.locator("#importRosterInput").setInputFiles({name:"synthetic-deleted-id-collision.csv",mimeType:"text/csv",buffer:Buffer.from("English name,Chinese name,Student ID,Starting age\nDifferent child,,roster-1,2-3\n")});
  await page.waitForFunction(()=>/deleted|already belongs/i.test(document.getElementById("classMessage").textContent));
  assert.equal(await page.locator("#confirmImportButton").isDisabled(),true);
  assert.deepEqual((await state(page)).students,before.students);
  assert.deepEqual((await state(page)).records,before.records);
}, {seed:deletionSeed});

let failures = 0;
const selectedCases=cases.filter(({name})=>!process.env.ETON_UI_FILTER || name.includes(process.env.ETON_UI_FILTER));
try {
  assert.ok(selectedCases.length,"The requested browser regression filter must match at least one test");
  for (const { name, run, options } of selectedCases) {
    const context = await browser.newContext({ viewport: { width: 1240, height: 820 }, acceptDownloads: true, ...(options.now ? {timezoneId:"Asia/Shanghai"} : {}) });
    const page = await context.newPage();
    if(options.now) await page.clock.setFixedTime(new Date(options.now));
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (options.corrupt) await page.addInitScript(() => { localStorage.setItem("seahorse-english-tracker-v1", "{truncated saved progress"); });
    else if (!options.fresh) await page.addInitScript((data) => { if (!localStorage.getItem("seahorse-english-tracker-v1")) localStorage.setItem("seahorse-english-tracker-v1", JSON.stringify(data)); }, (options.seed || legacySeed)());
    try {
      await page.goto(baseURL, { waitUntil: "networkidle" });
      await run(page);
      assert.deepEqual(errors, [], "No browser exceptions");
      console.log(`PASS ${name}`);
    } catch (error) { failures++; console.error(`FAIL ${name}\n${error.message}`); }
    finally { await context.close(); }
  }
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
console.log(`${selectedCases.length - failures}/${selectedCases.length} browser regression checks passed. Synthetic isolated data only.`);
process.exitCode = failures ? 1 : 0;
