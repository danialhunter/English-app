import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const playwright=require(process.env.SEATRACKER_PLAYWRIGHT || "playwright");
const webRoot=fileURLToPath(new URL("../web/",import.meta.url)), output=fileURLToPath(new URL("../test-output/",import.meta.url));
await fs.mkdir(output,{recursive:true});
const server=http.createServer(async(request,response)=>{
  try{const pathname=decodeURIComponent(new URL(request.url,"http://localhost").pathname),target=path.resolve(webRoot,`.${pathname==="/"?"/index.html":pathname}`);
    if(!target.startsWith(webRoot)){response.writeHead(403);response.end();return;}
    response.setHeader("Content-Type",{".js":"text/javascript",".html":"text/html",".css":"text/css",".png":"image/png"}[path.extname(target)] || "application/octet-stream");response.end(await fs.readFile(target));
  }catch{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const baseURL=`http://127.0.0.1:${server.address().port}`;
const browser=await playwright.chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const fixedTime="2026-09-14T04:00:00.000Z";
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[fixedTime]));}static now(){return Date.parse(fixedTime);}}
const sandbox=vm.createContext({window:{},Date:FixedDate,console});
for(const file of ["curriculum.js","monthly-exams.js","model.js"]) vm.runInContext(await fs.readFile(path.join(webRoot,file),"utf8"),sandbox);
const M=sandbox.window.TrackerModel,E=sandbox.window.MonthlyExams;
const clone=value=>JSON.parse(JSON.stringify(value));
function finishAssignedPractice(state,id) {
  const child=state.students.find(student=>student.id===id);
  for(const assigned of E.readiness(state,"exam-class","2026-09-01",id).missing){const record=M.getRecord(state,child,assigned.weekStart,true);Object.assign(record,{unitIndex:assigned.unitIndex,lesson:clone(assigned.lesson),itemStates:Array(6).fill("learning"),practiceFinished:true,practicedAt:fixedTime});}
  assert.equal(E.readiness(state,"exam-class","2026-09-01",id).ready,true);
}
function seed({passed=0,failedLast=false,ready=false}={}) {
  const s=M.migrate({schemaVersion:3,classes:[{id:"exam-class",name:"Synthetic Seahorse",startWeek:"2026-09-07",startUnit:0}],students:Array.from({length:5},(_,i)=>({id:`exam-${i}`,englishName:`Exam child ${i+1}`,chineseName:"",classId:"exam-class",group:"Synthetic Seahorse",rosterNumber:i+1,startWeek:"2026-09-07",startUnit:0,active:true})),records:{},selectedClassId:"exam-class",selectedStudentId:"exam-0",selectedWeekStart:"2026-09-07"});
  E.configure(s,"exam-class",{startPeriod:"2026-09-01",periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true});
  if(ready || passed || failedLast)s.students.forEach(child=>finishAssignedPractice(s,child.id));
  for(let i=0;i<passed;i++) finishSynthetic(s,`exam-${i}`,24);
  if(failedLast) finishSynthetic(s,"exam-4",0);
  return clone(s);
}
function finishSynthetic(s,id,known) {
  const draft=E.startAttempt(s,"exam-class","2026-09-01",id), round="exam-class::2026-09-01";
  (draft.itemIndexes || draft.itemStates.map((_,i)=>i)).forEach(i=>E.setMark(s,round,id,i,i<known?"known":"learning"));
  E.saveNote(s,round,id,`Synthetic original ${id}`);E.finishAttempt(s,round,id);
}
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem("seahorse-english-tracker-v1")));
async function week(page,date){await page.locator("#weekDateInput").fill(date);await page.locator("#weekDateInput").dispatchEvent("change");}
async function close(page,id){await page.locator(`[data-close-dialog="${id}"]`).first().click();}
async function openExam(page){await page.locator("#monthlyExamsButton").click();await page.locator("#examPeriodSelect").selectOption("2026-09-01");}
async function startExam(page){await page.locator("#startExamButton").click();if(await page.locator("#examConfirmDialog").isVisible())await page.locator("#examConfirmAction").click();}
async function assessAll(page,mark){const indices=await page.locator('#examItems [data-exam-mark="known"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.examItem));for(const i of indices)await page.locator(`[data-exam-item="${i}"][data-exam-mark="${mark}"]`).click();}
async function finishExam(page){await page.locator("#finishExamButton").click();await page.locator("#examConfirmAction").click();}
async function layout(page,selector,name){
  for(const [width,height] of [[900,700],[840,620]]) {
    await page.setViewportSize({width,height});
    if(selector)assert.ok(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;}),`${name} must not overflow horizontally at ${width}×${height}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Page must fit at ${width}×${height}`);
    await page.screenshot({path:path.join(output,`${name}-${width}x${height}.png`)});
  }
  await page.setViewportSize({width:1240,height:820});
}
const tests=[];const test=(name,run,fixture=()=>seed())=>tests.push({name,run,fixture});
test("four explicit same-week completions hold the completed month without losing lessons",async page=>{
  for(let i=0;i<4;i++){await page.locator("#completeKnownButton").click();await page.locator("#practiceButton").click();}
  assert.equal(await page.locator("#examRequiredDialog").isVisible(),true);
  assert.equal(await page.locator("#examRequiredAction").getAttribute("data-period"),"2026-09-01");
  await close(page,"examRequiredDialog");
  const s=await saved(page),r=s.records["exam-0::2026-09-07"];
  assert.equal(r.completedLessons.length,3);assert.equal(r.unitIndex,3);assert.equal(r.itemStates.every(mark=>mark==="known"),true);assert.equal(r.practiceFinished,true);assert.equal(r.awaitingMonthlyExam,true);
  assert.equal(await page.locator("#monthlyGateNotice").isVisible(),true);
  assert.equal(await page.locator("#completeKnownButton").isDisabled(),true);assert.equal(await page.locator("#teacherNotes").isDisabled(),true);
  await page.locator("#lessonPane").evaluate(el=>el.scrollTop=0);await layout(page,"#lessonPane","monthly-class-gate");
});
test("lesson-picker and calendar jumps stop at an exam alert without changing the teaching week",async page=>{
  await page.locator("#changeCurriculumButton").click();await page.locator("#lessonPickerSelect").selectOption("4");
  await page.locator("#confirmLessonChangeButton").click();
  assert.equal(await page.locator("#lessonPickerDialog").isVisible(),true);
  assert.equal(await page.locator("#examRequiredDialog").isVisible(),true);
  assert.match(await page.locator("#toast").innerText(),/exam|completed/i);
  await close(page,"examRequiredDialog");
  await close(page,"lessonPickerDialog");
  // Opening the picker may create an allowed blank current-week placeholder;
  // persist it before comparing the strictly read-only future-week preview.
  await week(page,"2026-09-07");const before=(await saved(page)).records;
  await week(page,"2026-10-05");assert.equal(await page.locator("#examRequiredDialog").isVisible(),true);
  assert.equal((await saved(page)).selectedWeekStart,"2026-09-07");
  assert.equal(await page.locator("#weekDateInput").inputValue(),"2026-09-07");
  assert.deepEqual((await saved(page)).records,before);
});
test("exam draft autosaves, survives reload, and requires only the selected14 assessments",async page=>{
  await openExam(page);await startExam(page);
  assert.equal(await page.locator("#examItems .exam-item").count(),14);
  const indices=await page.locator('#examItems [data-exam-mark="known"]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.examItem)));
  await page.locator(`[data-exam-item="${indices[0]}"][data-exam-mark="known"]`).click();
  await page.locator("#examTeacherNote").fill("Synthetic draft note kept over reload.");
  assert.equal(await page.locator("#finishExamButton").isDisabled(),true);
  const draft=(await saved(page)).monthlyExams.rounds["exam-class::2026-09-01"].attempts["exam-0"].draft;
  assert.equal(draft.itemStates[indices[0]],"known");assert.equal(draft.notes,"Synthetic draft note kept over reload.");
  await page.reload({waitUntil:"networkidle"});await openExam(page);
  assert.equal(await page.locator("#examTeacherNote").inputValue(),draft.notes);
  assert.equal(await page.locator(`[data-exam-item="${indices[0]}"][data-exam-mark="known"]`).getAttribute("aria-pressed"),"true");
  await layout(page,"#monthlyExamsDialog","monthly-exam-draft");
  for(const i of indices.slice(1,-1))await page.locator(`[data-exam-item="${i}"][data-exam-mark="known"]`).click();
  assert.equal(await page.locator("#finishExamButton").isDisabled(),true);
  await page.locator(`[data-exam-item="${indices.at(-1)}"][data-exam-mark="known"]`).click();assert.equal(await page.locator("#finishExamButton").isDisabled(),false);
  await finishExam(page);assert.match(await page.locator("#examChildResult").innerText(),/Passed.*14\/14/);
  assert.equal(await page.locator("#examTeacherNote").isDisabled(),true);
},()=>seed({ready:true}));
test("first exam start locks rules while all child marks still require assessment",async page=>{
  await openExam(page);await page.locator("#examPolicyButton").click();assert.equal(await page.locator("#examPassPercent").isDisabled(),true);assert.equal(await page.locator("#examIndividualRule").isDisabled(),true);assert.equal(await page.locator("#examPeriodKind").isDisabled(),false);assert.equal(await page.locator("#saveExamPolicyButton").isDisabled(),false);await close(page,"examPolicyDialog");
  await startExam(page);await page.locator("#examPolicyButton").click();
  for(const selector of ["#examPassPercent","#examPeriodKind","#examIndividualRule","#saveExamPolicyButton"])assert.equal(await page.locator(selector).isDisabled(),true);
  assert.match(await page.locator("#examPolicyIntro").innerText(),/fixed/);
},()=>seed({ready:true}));
test("four-week policy starts on a Monday and survives reload before first exam",async page=>{
  await openExam(page);await page.locator("#examPolicyButton").click();
  await page.locator("#examPeriodKind").selectOption("fourWeeks");assert.equal(await page.locator("#examPassPercent").inputValue(),"80");assert.equal(await page.locator("#examPassPercent").isDisabled(),true);
  await page.locator("#saveExamPolicyButton").click();
  const policy=(await saved(page)).classes[0].monthlyPolicy;
  assert.equal(policy.periodKind,"fourWeeks");assert.equal(policy.startPeriod,"2026-09-07");assert.equal(policy.passPercent,80);assert.equal(policy.requireIndividualPass,true);
  assert.match(await page.locator("#examPeriodSelect").innerText(),/2026-09-07.*2026-10-04/);
  await page.reload({waitUntil:"networkidle"});assert.deepEqual((await saved(page)).classes[0].monthlyPolicy,policy);
});
test("new classes enable exams from their own first teaching month, not the existing class month",async page=>{
  const old=(await saved(page)).classes[0];
  await page.locator("#manageClassesButton").click();await page.locator("#classNameInput").fill("New synthetic October class");
  await page.locator("#classStartInput").fill("2026-10-13");await page.locator('#classForm button[type="submit"]').click();
  const s=await saved(page),group=s.classes.find(item=>item.id!==old.id);
  assert.equal(group.startWeek,"2026-10-12");assert.equal(group.monthlyPolicy.startPeriod,"2026-10-01");assert.equal(group.monthlyPolicy.classPassPercent,80);
  assert.deepEqual(s.classes.find(item=>item.id===old.id),old);
  await close(page,"classesDialog");await page.locator("#addStudentButton").click();await page.locator("#englishNameInput").fill("New October child");await page.locator("#saveStudentButton").click();
  assert.equal(await page.locator("#monthlyGateNotice").isVisible(),false);
  await page.locator("#monthlyExamsButton").click();assert.equal(await page.locator("#examPeriodSelect").inputValue(),"2026-10-01");
  await page.locator("#examPolicyButton").click();await page.locator("#examPeriodKind").selectOption("fourWeeks");await page.locator("#saveExamPolicyButton").click();
  assert.equal((await saved(page)).classes.find(item=>item.id===group.id).monthlyPolicy.startPeriod,"2026-10-12");
  assert.match(await page.locator("#examPeriodSelect").innerText(),/2026-10-12.*2026-11-08/);
  await page.reload({waitUntil:"networkidle"});assert.equal((await saved(page)).classes.find(item=>item.id===group.id).monthlyPolicy.startPeriod,"2026-10-12");
});
test("four passes still wait for the fifth exam, then only passing children unlock",async page=>{
  await week(page,"2026-10-05");assert.equal(await page.locator("#examRequiredDialog").isVisible(),true);await close(page,"examRequiredDialog");
  await openExam(page);const waitingStatus=await page.locator("#examClassStatus").innerText();
  assert.match(waitingStatus,/4\/5 children tested/);assert.match(waitingStatus,/all 5 non-absent children finished/);assert.match(waitingStatus,/Next month stays locked/);
  await page.locator('[data-exam-child="exam-4"]').click();await startExam(page);await assessAll(page,"learning");await finishExam(page);
  assert.match(await page.locator("#examClassStatus").innerText(),/Class requirement met/);await close(page,"monthlyExamsDialog");
  assert.equal(await page.locator("#monthlyGateNotice").isVisible(),false);
  await week(page,"2026-10-05");assert.equal((await saved(page)).selectedWeekStart,"2026-10-05");
  await page.locator('.student-row[data-student-id="exam-4"]').click();assert.equal(await page.locator("#monthlyGateNotice").isVisible(),true);
  assert.match(await page.locator("#monthlyGateMessage").innerText(),/needs to pass/);
},()=>seed({passed:4}));
test("failed-child retest is blank, preserves original attempt and unlocks that child's next practice",async page=>{
  await page.locator('.student-row[data-student-id="exam-4"]').click();await week(page,"2026-10-05");assert.equal(await page.locator("#examRequiredDialog").isVisible(),true);await close(page,"examRequiredDialog");
  const first=(await saved(page)).monthlyExams.rounds["exam-class::2026-09-01"].attempts["exam-4"].history[0];
  await openExam(page);await startExam(page);
  assert.equal(await page.locator('#examItems button[aria-pressed="true"]').count(),0);
  assert.equal(await page.locator("#examTeacherNote").inputValue(),"");await assessAll(page,"known");await finishExam(page);
  const attempts=(await saved(page)).monthlyExams.rounds["exam-class::2026-09-01"].attempts["exam-4"];
  assert.equal(attempts.history.length,2);assert.deepEqual(attempts.history[0],first);assert.equal(attempts.draft,null);
  await close(page,"monthlyExamsDialog");assert.equal(await page.locator("#monthlyGateNotice").isVisible(),false);assert.equal(await page.locator("#completeKnownButton").isDisabled(),false);
},()=>seed({passed:4,failedLast:true}));
test("next-week arrow gives a direct exam alert and keeps the current week and records",async page=>{
  const before=await saved(page);
  assert.equal(await page.locator("#nextWeekButton").getAttribute("aria-haspopup"),"dialog");
  await page.locator("#nextWeekButton").click();
  assert.equal(await page.locator("#examRequiredDialog").isVisible(),true);
  assert.equal(await page.locator("#examRequiredAction").getAttribute("data-period"),"2026-09-01");
  const after=await saved(page);assert.equal(after.selectedWeekStart,"2026-09-28");assert.deepEqual(after.records,before.records);
  await layout(page,"#examRequiredDialog","exam-required-alert");
  await page.locator("#examRequiredAction").click();
  assert.equal(await page.locator("#examRequiredDialog").isVisible(),false);
  assert.equal(await page.locator("#monthlyExamsDialog").isVisible(),true);
  assert.equal(await page.locator("#examPeriodSelect").inputValue(),"2026-09-01");
},()=>{const s=seed();s.selectedWeekStart="2026-09-28";return s;});
test("exam attention is brief and motion-sensitive while the required badge persists",async page=>{
  const button=page.locator("#monthlyExamsButton");
  assert.match(await button.innerText(),/Exam required/);
  const motion=await button.evaluate(el=>({name:getComputedStyle(el).animationName,duration:getComputedStyle(el).animationDuration,count:getComputedStyle(el).animationIterationCount}));
  assert.equal(motion.name,"exam-attention");assert.equal(motion.duration,"1.6s");assert.equal(motion.count,"3");
  await page.emulateMedia({reducedMotion:"reduce"});
  assert.equal(await button.evaluate(el=>getComputedStyle(el).animationName),"none");
  await page.locator("#nextWeekButton").click();
  assert.equal(await page.locator("#examRequiredAction").evaluate(el=>getComputedStyle(el).animationName),"none");
  await close(page,"examRequiredDialog");assert.match(await button.innerText(),/Exam required/);
},()=>{const s=seed({passed:4});s.selectedWeekStart="2026-09-28";return s;});
test("a repeated lesson still alerts and locks when its adjusted month reaches the exam",async page=>{
  assert.match(await page.locator("#curriculumWeekLabel").innerText(),/3/);
  await page.locator("#completeKnownButton").click();
  await page.locator("#practiceButton").click();
  assert.equal(await page.locator("#examRequiredDialog").isVisible(),true);
  assert.equal(await page.locator("#examRequiredAction").getAttribute("data-period"),"2026-09-01");
  await close(page,"examRequiredDialog");
  assert.equal(await page.locator("#completeKnownButton").isDisabled(),true);
  assert.equal((await saved(page)).records["exam-0::2026-09-28"].awaitingMonthlyExam,true);
},()=>{const s=seed(),r=M.getRecord(s,s.students[0],"2026-09-07",true);r.itemStates.fill("known");r.practiceFinished=true;r.nextAction="repeat";r.nextActionExplicit=true;s.selectedWeekStart="2026-09-28";return clone(s);});
test("required class checkpoint remains visible on earlier weeks and clears after qualification",async page=>{
  assert.match(await page.locator("#monthlyExamBadge").innerText(),/Exam required/);
  await page.locator("#previousWeekButton").click();
  assert.equal((await saved(page)).selectedWeekStart,"2026-08-31");
  assert.match(await page.locator("#monthlyExamBadge").innerText(),/Exam required/);
  await page.locator("#monthlyExamsButton").click();
  assert.equal(await page.locator("#examPeriodSelect").inputValue(),"2026-09-01");
  await page.locator('[data-exam-child="exam-4"]').click();await startExam(page);await assessAll(page,"known");await finishExam(page);await close(page,"monthlyExamsDialog");
  assert.doesNotMatch(await page.locator("#monthlyExamBadge").innerText(),/Exam required/);
  assert.equal(await page.locator("#monthlyExamsButton").evaluate(el=>el.classList.contains("exam-attention")),false);
},()=>seed({passed:4}));
test("a withdrawn cohort's historical exam remains accessible without starting exams for withdrawn children",async page=>{
  assert.equal(await page.locator("#monthlyExamsButton").isDisabled(),false);
  await page.locator("#monthlyExamsButton").click();
  assert.equal(await page.locator("#examChildList [data-exam-child]").count(),5);
  await page.locator('[data-exam-child="exam-4"]').click();
  assert.equal(await page.locator("#startExamButton").isDisabled(),true);assert.equal(await page.locator("#finishExamButton").isDisabled(),true);assert.equal(await page.locator("[data-exam-item]:not(:disabled)").count(),0);
},()=>{const s=seed({passed:4});s.students.forEach(child=>{child.active=false;child.deletedAt="2026-09-14T04:00:00.000Z";});return s;});
test("a full backup restores pending exam drafts, notes and completed results together",async page=>{
  await openExam(page);await page.locator('[data-exam-child="exam-4"]').click();await startExam(page);
  await page.locator('#examItems [data-exam-mark="known"]').first().click();await page.locator("#examTeacherNote").fill("Draft inside full backup");
  await close(page,"monthlyExamsDialog");const before=await saved(page);
  await page.locator("#dataButton").click();const downloadPromise=page.waitForEvent("download");await page.locator("#exportBackupButton").click();const backup=await(await downloadPromise).path();await close(page,"dataDialog");
  await openExam(page);await page.locator('[data-exam-child="exam-4"]').click();await page.locator("#examTeacherNote").fill("Changed after backup");await close(page,"monthlyExamsDialog");
  await page.locator("#dataButton").click();page.once("dialog",dialog=>dialog.accept());await page.locator("#importBackupInput").setInputFiles(backup);
  await page.waitForFunction(()=>document.getElementById("dataMessage").textContent.includes("restored successfully"));
  const after=await saved(page);assert.deepEqual(after.monthlyExams,before.monthlyExams);assert.deepEqual(after.records,before.records);assert.deepEqual(after.classes,before.classes);
},()=>seed({passed:4}));
test("multi-month report dialog fits smaller laptops and exports a workbook",async page=>{
  await page.locator("#dataButton").click();await page.locator("#progressReportButton").click();assert.equal(await page.locator("#progressReportDialog").isVisible(),true);
  await page.locator("#reportStartDate").fill("2026-09-01");await page.locator("#reportStartDate").dispatchEvent("change");
  await page.locator("#reportEndDate").fill("2026-11-30");await page.locator("#reportEndDate").dispatchEvent("change");
  await layout(page,"#progressReportDialog","monthly-report-dialog");
  const downloading=page.waitForEvent("download");await page.locator("#downloadProgressReportButton").click();const download=await downloading;
  assert.match(download.suggestedFilename(),/\.xlsx$/);assert.ok((await fs.stat(await download.path())).size>500);
},()=>seed({passed:4,failedLast:true}));
let failures=0;
const selectedTests=tests.filter(item=>!process.env.ETON_MONTHLY_UI_FILTER || item.name.includes(process.env.ETON_MONTHLY_UI_FILTER));
try{
  for(const {name,run,fixture} of selectedTests) {
    const context=await browser.newContext({viewport:{width:1240,height:820},timezoneId:"Asia/Shanghai",acceptDownloads:true}),page=await context.newPage(),errors=[];
    await page.clock.setFixedTime(new Date(fixedTime));page.setDefaultTimeout(6000);page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(data=>{if(!localStorage.getItem("seahorse-english-tracker-v1"))localStorage.setItem("seahorse-english-tracker-v1",JSON.stringify(data));},fixture());
    try{await page.goto(baseURL,{waitUntil:"networkidle"});await run(page);assert.deepEqual(errors,[],"No browser exceptions");console.log(`PASS ${name}`);}
    catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);await page.screenshot({path:path.join(output,`monthly-failure-${failures}.png`)});}
    finally{await context.close();}
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log(`${selectedTests.length-failures}/${selectedTests.length} monthly browser checks passed. Synthetic isolated data only.`);
process.exitCode=failures?1:0;
