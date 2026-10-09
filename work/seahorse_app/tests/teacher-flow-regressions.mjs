import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),{chromium}=require("playwright");
const webRoot=fileURLToPath(new URL("../web/",import.meta.url)),output=fileURLToPath(new URL("../test-output/teacher-flow/",import.meta.url));await fs.mkdir(output,{recursive:true});
const clock="2026-09-14T04:00:00.000Z",storageKey="seahorse-english-tracker-v1";
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return Date.parse(clock);}}
const sandbox=vm.createContext({window:{},Date:FixedDate,console});for(const file of ["curriculum.js","monthly-exams.js","model.js"])vm.runInContext(await fs.readFile(path.join(webRoot,file),"utf8"),sandbox);
const M=sandbox.window.TrackerModel,E=sandbox.window.MonthlyExams,clone=value=>JSON.parse(JSON.stringify(value));
function finishAssignedPractice(state,id) {
  const child=state.students.find(student=>student.id===id);
  for(const assigned of E.readiness(state,"flow","2026-09-01",id).missing){const record=M.getRecord(state,child,assigned.weekStart,true);Object.assign(record,{unitIndex:assigned.unitIndex,lesson:clone(assigned.lesson),itemStates:Array(6).fill("learning"),practiceFinished:true,practicedAt:clock});}
  assert.equal(E.readiness(state,"flow","2026-09-01",id).ready,true);
}
function seed({finished=false,future=false,early=0,ready=false}={}) {
  const state=M.migrate({schemaVersion:3,classes:[{id:"flow",name:"Synthetic teacher flow",startWeek:"2026-09-07",startUnit:0}],students:[{id:"child",classId:"flow",englishName:"Synthetic child",chineseName:"",startWeek:"2026-09-07",startUnit:0,active:true}],records:{},selectedClassId:"flow",selectedStudentId:"child",selectedWeekStart:future?"2026-10-05":"2026-09-07"});
  E.configure(state,"flow",{startPeriod:"2026-09-01",periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true});
  if(finished){const record=M.getRecord(state,state.students[0],"2026-09-07",true);record.itemStates=["known","known","known","known","known","learning"];record.practiceFinished=true;record.practicedAt=clock;}
  for(let index=0;index<early;index++){const record=M.getRecord(state,state.students[0],"2026-09-07",true);record.itemStates.fill("known");record.practiceFinished=true;record.practicedAt=clock;M.complete(state,state.students[0],"2026-09-07");}
  if(ready)state.students.forEach(child=>finishAssignedPractice(state,child.id));
  return clone(state);
}
const server=http.createServer(async(req,res)=>{try{const target=path.resolve(webRoot,`.${new URL(req.url,"http://localhost").pathname.replace(/^\/$/,"/index.html")}`);if(!target.startsWith(webRoot)){res.writeHead(403).end();return;}res.setHeader("Content-Type",{".js":"text/javascript",".html":"text/html",".css":"text/css",".png":"image/png"}[path.extname(target)]||"application/octet-stream");res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})}),base=`http://127.0.0.1:${server.address().port}`;
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
const record=async page=>(await saved(page)).records["child::2026-09-07"];
const close=async(page,id)=>page.locator(`[data-close-dialog="${id}"]`).first().click();
const markAll=async page=>{for(let index=0;index<6;index++)await page.locator(`[data-item-index="${index}"][data-state="known"]`).click();};
const finish=async page=>page.locator("#practiceButton").click();
async function confirmExam(page) { if(await page.locator("#examConfirmDialog").isVisible())await page.locator("#examConfirmAction").click(); }
const tests=[],test=(name,run,fixture=()=>seed())=>tests.push({name,run,fixture});
test("an existing exam does not interrupt Finished for earlier allowed lessons",async page=>{
  const before=(await saved(page)).monthlyExams;
  for(let lesson=0;lesson<3;lesson++){
    await markAll(page);await finish(page);
    assert.equal((await record(page)).unitIndex,lesson+1,"Finishing must open the next allowed lesson");
    const state=await saved(page);assert.equal(E.access(state,state.students[0],state.selectedWeekStart,(await record(page)).unitIndex).allowed,true,"The next lesson is not exam-blocked");
    assert.equal(await page.locator("#examRequiredDialog").isVisible(),false,"An existing exam must not pop up while next practice is still allowed");
  }
  assert.deepEqual((await saved(page)).monthlyExams,before,"Earlier practice must preserve the saved exam");
  await markAll(page);await finish(page);
  assert.equal((await record(page)).unitIndex,3,"The completed boundary lesson must stay held");
  assert.equal((await record(page)).awaitingMonthlyExam,true);
  assert.equal(await page.locator("#examRequiredDialog").isVisible(),true,"Finishing the actual boundary still opens the exam alert, even when done early");
  assert.equal(await page.locator("#examRequiredAction").getAttribute("data-period"),"2026-09-01");
  assert.deepEqual((await saved(page)).monthlyExams,before);
},()=>{const state=seed();const {frozen,period,label,...round}=E.previewRound(state,"flow","2026-09-01");round.startedAt=clock;state.monthlyExams.rounds[round.id]=round;return state;});
test("earlier Finished stays quiet even when a different recorded week is held for an exam",async page=>{
  const original=await saved(page);
  await markAll(page);await finish(page);
  assert.equal((await record(page)).unitIndex,1);
  assert.equal(await page.locator("#examRequiredDialog").isVisible(),false,"An older held completion must not interrupt today's allowed lesson");
  assert.equal(await page.locator("#monthlyExamsButton").evaluate(button=>button.classList.contains("is-exam-required")),true,"The pending exam reminder must remain visible");
  assert.deepEqual((await saved(page)).records["child::2026-09-28"],original.records["child::2026-09-28"]);
},()=>{const state=seed(),r=M.getRecord(state,state.students[0],"2026-09-28",true);r.itemStates.fill("known");r.practiceFinished=true;r.practicedAt=clock;M.complete(state,state.students[0],"2026-09-28");return state;});
test("exam marks visibly change colour and retain their selected indicator after reopening",async page=>{
  await page.locator("#monthlyExamsButton").click();await page.locator("#startExamButton").click();await confirmExam(page);
  const index=await page.locator('#examItems [data-exam-mark="known"]').first().getAttribute("data-exam-item");
  const known=page.locator(`[data-exam-item="${index}"][data-exam-mark="known"]`),learning=page.locator(`[data-exam-item="${index}"][data-exam-mark="learning"]`);
  const feedback=button=>button.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,indicator:getComputedStyle(el,"::before").content,selected:el.getAttribute("aria-pressed")}));
  await known.click();await page.mouse.move(1,1);
  let shown=await feedback(known);
  assert.equal(shown.selected,"true");assert.equal(shown.background,"rgb(33, 117, 83)","Selected Knows it must be visibly green, not an unchanged grey button");assert.equal(shown.color,"rgb(255, 255, 255)");assert.ok(shown.indicator.includes("✓"),"Selection must have a non-colour checkmark too");
  assert.equal((await feedback(learning)).selected,"false");
  await learning.click();await page.mouse.move(1,1);shown=await feedback(learning);
  assert.equal(shown.background,"rgb(255, 246, 222)","Selected Needs practice must be visibly amber");assert.equal(shown.color,"rgb(128, 86, 0)");assert.ok(shown.indicator.includes("✓"));assert.equal((await feedback(known)).selected,"false");
  assert.match(await page.locator("#examMarkProgress").innerText(),/1\/14 checked.*0 known/);
  await page.reload({waitUntil:"networkidle"});await page.locator("#monthlyExamsButton").click();
  assert.equal((await feedback(learning)).background,"rgb(255, 246, 222)");assert.equal((await feedback(learning)).selected,"true");
  const second=page.locator('#examItems [data-exam-mark="known"]').nth(1);await second.click();await page.mouse.move(1,1);
  assert.equal((await feedback(second)).background,"rgb(33, 117, 83)");
  for(const [width,height]of [[900,700],[840,620]]){await page.setViewportSize({width,height});await learning.scrollIntoViewIfNeeded();assert.ok(await page.locator("#examItems .state-switch").evaluateAll(nodes=>nodes.every(el=>el.scrollWidth<=el.clientWidth+1)),"Selection feedback must not overflow its buttons");await page.screenshot({path:path.join(output,`exam-selected-colours-${width}x${height}.png`)});}
},()=>seed({ready:true}));
test("all six Knows it marks stay on the same lesson until the explicit Finished button",async page=>{
  await markAll(page);let current=await record(page);assert.equal(current.unitIndex,0);assert.equal(current.practiceFinished,false);assert.equal((current.completedLessons||[]).length,0);assert.deepEqual(current.itemStates,Array(6).fill("known"));
  await finish(page);current=await record(page);assert.equal(current.unitIndex,1);assert.equal(current.completedLessons.length,1);assert.equal(current.completedLessons[0].practiceFinished,true);
});
test("changing a previous finished lesson's last mark does not silently archive it",async page=>{
  await page.locator('[data-item-index="5"][data-state="known"]').click();const current=await record(page);assert.equal(current.unitIndex,0,"The last knowledge mark must not open lesson 2");assert.equal((current.completedLessons||[]).length,0);assert.equal(current.practiceFinished,false,"A changed assessment needs a new explicit Finished action");assert.equal(current.practicedAt,null);
},()=>seed({finished:true}));
test("the all-known shortcut changes marks only and never finishes the lesson",async page=>{
  await page.locator("#completeKnownButton").click();const current=await record(page);assert.equal(current.unitIndex,0);assert.equal(current.practiceFinished,false);assert.equal((current.completedLessons||[]).length,0);assert.deepEqual(current.itemStates,Array(6).fill("known"));assert.doesNotMatch(await page.locator("#completeKnownButton").innerText(),/complete.*next/i);
});
test("editing knowledge after Finished and reloading cannot restore a stale auto-completion trigger",async page=>{
  await page.locator('[data-item-index="0"][data-state="learning"]').click();await page.reload({waitUntil:"networkidle"});await page.locator('[data-item-index="0"][data-state="known"]').click();await page.locator('[data-item-index="5"][data-state="known"]').click();assert.equal((await record(page)).unitIndex,0);assert.equal((await record(page)).practiceFinished,false);
},()=>seed({finished:true}));
test("finishing early stops at the unlocked month's final lesson and keeps October inaccessible",async page=>{
  for(let count=0;count<4;count++){await markAll(page);await finish(page);}
  const current=await record(page);assert.ok(current.unitIndex<=3,"A September-only class must not advance its current lesson into October");
  assert.equal(await page.locator("#monthlyGateNotice").isVisible(),true);assert.equal(await page.locator('[data-item-index][data-state]:not(:disabled)').count(),0);
  if(await page.locator("#examRequiredDialog").isVisible())await close(page,"examRequiredDialog");const before=(await saved(page)).records;
  for(const week of ["2026-09-14","2026-09-21","2026-09-28"]){await page.locator("#weekDateInput").fill(week);await page.locator("#weekDateInput").dispatchEvent("change");const state=await saved(page),plan=M.scheduledPlan(state,state.students[0],week);assert.equal(state.selectedWeekStart,week);assert.match(await page.locator("#weekCompletionNotice").innerText(),/Completed/);assert.deepEqual(await page.locator("#vocabularyItems .learning-item-text").evaluateAll(items=>items.map(item=>item.firstChild.textContent)),clone(plan.lesson.words));assert.equal(await page.locator("#sentenceItem .learning-item-text").evaluate(item=>item.firstChild.textContent),plan.lesson.sentence);assert.deepEqual(state.records,before);}
  await page.locator("#weekDateInput").fill("2026-10-05");await page.locator("#weekDateInput").dispatchEvent("change");assert.equal(await page.locator("#examRequiredDialog").isVisible(),true);assert.equal((await saved(page)).selectedWeekStart,"2026-09-28");assert.deepEqual((await saved(page)).records,before);
});
test("completed-early status is a compact confirmation with a record link, not another lesson panel",async page=>{
  await page.locator("#weekDateInput").fill("2026-09-14");await page.locator("#weekDateInput").dispatchEvent("change");const notice=page.locator("#weekCompletionNotice");assert.equal(await notice.isVisible(),true);assert.match(await notice.innerText(),/Completed/i);assert.equal(await notice.locator("details").count(),0);assert.equal(await page.locator("#completionSourceButton").isVisible(),true);assert.ok(await notice.evaluate(el=>el.getBoundingClientRect().height)<=100,"Completed status should stay under 100px at 900×700");await page.screenshot({path:path.join(output,"completed-compact.png")});
},()=>seed({early:2}));
test("every exam entry opens the same due month without enabled inaccessible future months",async page=>{
  await page.locator("#monthlyExamsButton").click();assert.equal(await page.locator("#examPeriodSelect").inputValue(),"2026-09-01");
  assert.equal(await page.locator('#examPeriodSelect option:not(:disabled)').evaluateAll(options=>options.filter(option=>option.value>"2026-09-01").length),0,"Locked future months must not be selectable");await close(page,"monthlyExamsDialog");
  await page.locator("#openRequiredExamButton").click();assert.equal(await page.locator("#examPeriodSelect").inputValue(),"2026-09-01");await close(page,"monthlyExamsDialog");
  await page.locator("#nextWeekButton").click();assert.equal(await page.locator("#examRequiredDialog").isVisible(),true);await page.locator("#examRequiredAction").click();assert.equal(await page.locator("#examPeriodSelect").inputValue(),"2026-09-01");
},()=>seed({future:true}));
test("a short exam samples a majority of words and sentence structures and can be finished",async page=>{
  await page.locator("#monthlyExamsButton").click();await page.locator("#startExamButton").click();await confirmExam(page);
  const state=await saved(page),round=state.monthlyExams.rounds["flow::2026-09-01"],draft=round.attempts.child.draft,indexes=draft.itemIndexes;assert.ok(Array.isArray(indexes),"New exam attempts must store their sampled positions");
  const member=round.cohort[0],wordPool=member.items.filter(item=>item.kind==="vocabulary").length,sentencePool=member.items.filter(item=>item.kind==="sentence").length,words=indexes.filter(index=>member.items[index].kind==="vocabulary"),sentences=indexes.filter(index=>member.items[index].kind==="sentence");
  assert.equal(words.length,Math.floor(wordPool/2)+1);assert.equal(sentences.length,Math.floor(sentencePool/2)+1);assert.ok(indexes.length<member.items.length);assert.equal(await page.locator("#examItems .exam-item").count(),indexes.length);
  await page.screenshot({path:path.join(output,"sampled-exam-900x700.png")});await page.setViewportSize({width:840,height:620});await page.locator("#examItems .exam-item").last().scrollIntoViewIfNeeded();const toolbar=await page.locator("#finishExamButton").boundingBox(),header=await page.locator("#monthlyExamsDialog > .modal-header").boundingBox();assert.ok(toolbar && toolbar.y>=0 && toolbar.y+toolbar.height<=620,"Finish exam stays on screen while scrolling the checklist");if(header && header.y>=0)assert.ok(toolbar.y>=header.y+header.height-1,"Sticky Finish controls must not cover the visible dialog heading or Close button");assert.ok(await page.locator('#monthlyExamsDialog > .modal-header [data-close-dialog]').evaluate(element=>{const box=element.getBoundingClientRect();return box.y<0 || document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest("button")===element;}),"The visible Close button is not covered by the exam toolbar");assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,"sampled-exam-840x620.png")});
  for(const index of indexes.slice(0,-1))await page.locator(`[data-exam-item="${index}"][data-exam-mark="known"]`).click();assert.equal(await page.locator("#finishExamButton").isDisabled(),true);await page.locator(`[data-exam-item="${indexes.at(-1)}"][data-exam-mark="known"]`).click();assert.equal(await page.locator("#finishExamButton").isDisabled(),false);
  await page.locator("#finishExamButton").click();assert.equal(await page.locator("#examConfirmDialog").isVisible(),true);await confirmExam(page);const after=await saved(page),history=after.monthlyExams.rounds["flow::2026-09-01"].attempts.child.history;assert.equal(history.length,1);assert.equal(history[0].itemStates.filter(mark=>mark==="known").length,indexes.length);assert.equal(history[0].itemStates.filter(mark=>mark==="unassessed").length,member.items.length-indexes.length);assert.match(await page.locator("#examChildResult").innerText(),/Passed/);
},()=>seed({future:true,ready:true}));
test("canceling exam start or finish leaves saved attempts and completed results intact",async page=>{
  await page.locator("#monthlyExamsButton").click();const before=(await saved(page)).monthlyExams;
  await page.locator("#startExamButton").click();assert.equal(await page.locator("#examConfirmDialog").isVisible(),true);await close(page,"examConfirmDialog");assert.deepEqual((await saved(page)).monthlyExams,before);
  await page.locator("#startExamButton").click();await confirmExam(page);const draft=(await saved(page)).monthlyExams.rounds["flow::2026-09-01"].attempts.child.draft;
  for(const index of draft.itemIndexes)await page.locator(`[data-exam-item="${index}"][data-exam-mark="known"]`).click();const marked=(await saved(page)).monthlyExams;
  await page.locator("#finishExamButton").click();await close(page,"examConfirmDialog");assert.deepEqual((await saved(page)).monthlyExams,marked);assert.equal(await page.locator("#finishExamButton").isEnabled(),true);
  await page.locator("#finishExamButton").click();await confirmExam(page);assert.equal((await saved(page)).monthlyExams.rounds["flow::2026-09-01"].attempts.child.history.length,1);
},()=>seed({future:true,ready:true}));
test("strong vocabulary cannot hide a failed sentence-structure majority check",async page=>{
  await page.locator("#monthlyExamsButton").click();await page.locator("#startExamButton").click();await confirmExam(page);
  const round=(await saved(page)).monthlyExams.rounds["flow::2026-09-01"],draft=round.attempts.child.draft,member=round.cohort[0],sentences=draft.itemIndexes.filter(index=>member.items[index].kind==="sentence");
  for(const index of draft.itemIndexes)await page.locator(`[data-exam-item="${index}"][data-exam-mark="${sentences.includes(index) && index!==sentences[0]?"learning":"known"}"]`).click();
  await page.locator("#finishExamButton").click();await confirmExam(page);assert.match(await page.locator("#examChildResult").innerText(),/Needs (review|practice)/i);
  const after=await saved(page),result=E.studentResult(after,"flow","2026-09-01","child");assert.ok(result.scorePercent>80,"Overall score alone would pass, so the sentence requirement matters");assert.equal(result.vocabulary.passed,true);assert.equal(result.sentence.passed,false);assert.equal(result.passed,false);assert.equal(E.access(after,after.students[0],"2026-10-05",4).allowed,false);
  await page.screenshot({path:path.join(output,"sampled-exam-category-review.png")});
},()=>seed({future:true,ready:true}));
test("the held lesson opens after this child passes without waiting for classmates",async page=>{
  const original=await record(page);assert.equal(original.unitIndex,3);assert.equal(original.practiceFinished,true);await page.locator("#monthlyExamsButton").click();
  for(const [position,id]of ["child","peer-1","peer-2","peer-3","peer-4"].entries()){
    await page.locator(`[data-exam-child="${id}"]`).click();await page.locator("#startExamButton").click();await confirmExam(page);const draft=(await saved(page)).monthlyExams.rounds["flow::2026-09-01"].attempts[id].draft;
    for(const index of draft.itemIndexes)await page.locator(`[data-exam-item="${index}"][data-exam-mark="${position===4?"learning":"known"}"]`).click();
    await page.locator("#finishExamButton").click();await confirmExam(page);
    assert.equal((await record(page)).unitIndex,4);assert.equal((await record(page)).practiceFinished,false);
  }
  const after=await saved(page),current=await record(page),summary=E.roundStatus(after,"flow","2026-09-01");assert.equal(summary.completed,5);assert.equal(summary.passed,4);assert.equal(summary.unlocked,true);assert.equal(current.unitIndex,4);assert.equal(current.practiceFinished,false);assert.equal(current.completedLessons.length,4);const archived=current.completedLessons.at(-1);assert.equal(archived.practicedAt,original.practicedAt);assert.deepEqual(archived.lesson,original.lesson);assert.deepEqual(archived.itemStates,original.itemStates);assert.equal(archived.notes,original.notes);
},()=>{const state=seed({early:4});for(let index=1;index<=4;index++){state.students.push({...clone(state.students[0]),id:`peer-${index}`,englishName:`Synthetic peer ${index}`});finishAssignedPractice(state,`peer-${index}`);}state.records["child::2026-09-07"].practicedAt="2026-09-10T03:00:00.000Z";return state;});
test("a frozen future exam remains readable but its old draft cannot bypass the due month",async page=>{
  const before=(await saved(page)).monthlyExams;await page.locator("#monthlyExamsButton").click();assert.equal(await page.locator("#examPeriodSelect").inputValue(),"2026-09-01");await page.locator("#examPeriodSelect").selectOption("2026-10-01");
  assert.equal(await page.locator("#startExamButton").isDisabled(),true);assert.equal(await page.locator("#finishExamButton").isDisabled(),true);assert.equal(await page.locator("#examTeacherNote").isDisabled(),true);assert.equal(await page.locator("[data-exam-item]:not(:disabled)").count(),0);assert.equal(await page.locator("#examTeacherNote").inputValue(),"Original future draft note");assert.deepEqual((await saved(page)).monthlyExams,before);
},()=>{const state=seed(),round=clone(E.previewRound(state,"flow","2026-10-01")),indexes=clone(E.previewAssessment(round,"child").itemIndexes);round.startedAt=clock;round.attempts.child={history:[],draft:{id:"old-future-draft",startedAt:clock,updatedAt:clock,itemIndexes:indexes,itemStates:Array(round.cohort[0].items.length).fill("unassessed"),notes:"Original future draft note"}};state.monthlyExams.rounds[round.id]=round;state.schemaVersion=5;return clone(M.migrate(state));});
test("restoring a qualified held child resumes next practice without changing the saved practice date",async page=>{
  const original=await record(page);assert.equal(original.unitIndex,3);assert.equal((await saved(page)).students[0].active,false);await page.locator("#toolsButton").click();await page.locator("#manageClassesButton").click();await page.locator("#recentlyDeletedButton").click();await page.locator('[data-restore-student="child"]').click();
  const restored=await saved(page),current=await record(page);assert.equal(restored.students[0].active,true);assert.equal(restored.students.length,1);assert.equal(current.unitIndex,4);assert.equal(current.completedLessons.at(-1).practicedAt,original.practicedAt);assert.deepEqual(current.completedLessons.at(-1).lesson,original.lesson);assert.deepEqual(current.completedLessons.at(-1).itemStates,original.itemStates);assert.equal(current.practiceFinished,false);
},()=>{const state=seed({early:4});state.records["child::2026-09-07"].practicedAt="2026-09-10T03:00:00.000Z";const draft=E.startAttempt(state,"flow","2026-09-01","child");for(const index of draft.itemIndexes)E.setMark(state,"flow::2026-09-01","child",index,"known");E.finishAttempt(state,"flow::2026-09-01","child");M.deleteStudent(state,"child");return clone(state);});
test("completed practice uses one compact surface with both record and undo actions",async page=>{
  await markAll(page);await finish(page);
  assert.equal(await page.locator("#weekCompletionNotice #completionNotice").count(),1);
  assert.equal(await page.locator("#weekCompletionNotice #undoCompletionButton").isVisible(),true);
  assert.equal(await page.locator("#weekCompletionNotice #completionSourceButton").isVisible(),true);
  assert.ok(await page.locator("#weekCompletionNotice").evaluate(el=>el.getBoundingClientRect().height)<=100);
  assert.equal(await page.locator("#sentenceItem .learning-item-number").getAttribute("aria-hidden"),"true");
});
test("restoring a backup replaces the visible review queue even for the same child",async page=>{
  await page.locator("#reviewNavButton").click();assert.equal(await page.locator("#reviewItems .review-item").count(),3);
  const replacement=seed({finished:true});replacement.records["child::2026-09-07"].practicedAt="2026-09-07T04:00:00.000Z";replacement.records["child::2026-09-07"].lesson.words=Array.from({length:5},(_,i)=>`Restored word ${i}`);
  await page.locator("#toolsButton").click();await page.locator("#dataButton").click();page.once("dialog",dialog=>dialog.accept());
  await page.locator("#importBackupInput").setInputFiles({name:"synthetic-restore.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(replacement))});
  await page.waitForFunction(()=>document.getElementById("dataMessage").textContent.includes("Backup restored successfully"));await close(page,"dataDialog");
  assert.match(await page.locator("#reviewItems").innerText(),/Restored word/);
  const restored=(await saved(page)).records;await page.locator('[data-review-mark="known"]').first().click();assert.deepEqual((await saved(page)).records,restored);
},()=>{const state=seed({finished:true});state.records["child::2026-09-07"].practicedAt="2026-09-07T04:00:00.000Z";return state;});
test("Completed filter and class count wait for explicit Finished, not Knows all",async page=>{
  await page.locator("#completeKnownButton").click();assert.equal(await page.locator("#masteredCount").textContent(),"0");assert.equal(await page.locator(".practice-badge.is-finished").count(),0);
  await page.locator('[data-filter="mastered"]').click();assert.equal(await page.locator("#studentList .student-row").count(),0);
  await finish(page);assert.equal(await page.locator("#studentList .student-row").count(),1);assert.equal(await page.locator("#masteredCount").textContent(),"1");assert.equal(await page.locator(".practice-badge.is-finished").count(),1);
});
test("review timing is configurable in Tools and invalid days never change saved settings",async page=>{
  await page.locator("#toolsButton").click();assert.equal(await page.locator("#reviewFirstDays").isVisible(),false);await page.locator("#reviewTimingDetails summary").click();
  assert.equal(await page.locator("#reviewFirstDays").inputValue(),"7");assert.equal(await page.locator("#reviewRepeatDays").inputValue(),"28");
  const original=await saved(page);await page.locator("#reviewFirstDays").fill("0");await page.locator("#saveReviewTimingButton").click();assert.deepEqual(await saved(page),original);assert.equal(await page.locator("#reviewFirstDays").evaluate(input=>input.validity.rangeUnderflow),true);
  await page.locator("#reviewFirstDays").fill("14");await page.locator("#reviewRepeatDays").fill("21");await page.locator("#saveReviewTimingButton").click();assert.deepEqual((await saved(page)).learningReview.settings,{firstDays:14,repeatDays:21,limit:3});assert.match(await page.locator("#reviewTimingMessage").innerText(),/saved/);
  await close(page,"toolsDialog");await page.locator("#toolsButton").click();assert.equal(await page.locator("#reviewFirstDays").inputValue(),"14");
});
test("simplified navigation keeps daily controls direct and occasional tools separate",async page=>{
  assert.equal(await page.locator("#completeKnownButton").isVisible(),true);
  assert.equal(await page.locator("#practiceButton").isVisible(),true);
  assert.equal(await page.locator("#teacherNotes").isVisible(),false);
  assert.equal(await page.locator("#manageClassesButton").isVisible(),false);
  await page.locator("#reviewNavButton").click();assert.equal(await page.locator("#reviewView").isVisible(),true);assert.equal(await page.locator("#practiceView").isVisible(),false);
  await page.locator("#practiceNavButton").click();assert.equal(await page.locator("#practiceView").isVisible(),true);
  await page.locator("#reportNavButton").click();assert.equal(await page.locator("#progressReportDialog").isVisible(),true);await close(page,"progressReportDialog");
  await page.locator("#toolsButton").click();await page.locator("#dataButton").click();assert.equal(await page.locator("#toolsDialog").isVisible(),false);assert.equal(await page.locator("#dataDialog").isVisible(),true);
});
test("later review marks preserve the original saved learning",async page=>{
  const original=(await saved(page)).records;
  await page.locator("#reviewNavButton").click();assert.equal(await page.locator("#reviewItems .review-item").count(),3);
  await page.locator('[data-review-mark="learning"]').first().click();assert.equal(await page.locator('[data-review-mark="learning"]').first().getAttribute("aria-pressed"),"true");
  const changed=await saved(page);assert.deepEqual(changed.records,original);assert.equal(Object.values(changed.learningReview.children.child.targets).flatMap(item=>item.checks).length,1);
  await page.locator('[data-postpone-review]').nth(1).click();assert.match(await page.locator('[data-postpone-review]').nth(1).innerText(),/Saved for next week/);
},()=>{const state=seed({finished:true});state.records["child::2026-09-07"].practicedAt="2026-09-07T04:00:00.000Z";return state;});
test("a future goal is editable through Tools without changing saved work",async page=>{
  const original=(await saved(page)).records;
  await page.locator("#toolsButton").click();await page.locator("#futureGoalButton").click();
  await page.locator("#futureGoalExpectation").fill("Point to the named object");await page.locator('#futureGoalForm button[type="submit"]').click();
  assert.equal(await page.locator("#futureGoalDialog").isVisible(),false);const state=await saved(page);assert.equal(state.learningReview.goals.at(-1).expectation,"Point to the named object");assert.deepEqual(state.records,original);
  await page.locator("#historyButton").click();assert.match(await page.locator("#historyList").innerText(),/Future goal changes/);
},()=>seed({finished:true}));
test("a paused exam resumes with the same questions and answers",async page=>{
  await page.locator("#monthlyExamsButton").click();await page.locator("#startExamButton").click();await confirmExam(page);
  await page.locator('[data-exam-mark="known"]').first().click();const draft=clone((await saved(page)).monthlyExams.rounds["flow::2026-09-01"].attempts.child.draft);
  await page.locator("#pauseExamButton").click();assert.equal(await page.locator("#monthlyExamsDialog").isVisible(),false);await page.locator("#monthlyExamsButton").click();
  assert.deepEqual((await saved(page)).monthlyExams.rounds["flow::2026-09-01"].attempts.child.draft,draft);assert.equal(await page.locator('[data-exam-mark="known"]').first().getAttribute("aria-pressed"),"true");
},()=>seed({ready:true}));
const selected=tests.filter(test=>!process.env.ETON_TEACHER_FLOW_FILTER||test.name.includes(process.env.ETON_TEACHER_FLOW_FILTER));let failures=0;
try{for(const {name,run,fixture}of selected){const context=await browser.newContext({viewport:{width:900,height:700},timezoneId:"Asia/Shanghai",acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(4000);page.on("pageerror",error=>errors.push(error.message));await page.clock.setFixedTime(new Date(clock));await page.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:storageKey,state:fixture()});try{await page.goto(base,{waitUntil:"networkidle"});await run(page);assert.deepEqual(errors,[]);console.log(`PASS ${name}`);}catch(error){failures++;console.error(`FAIL ${name}\n${error.stack}`);await page.screenshot({path:path.join(output,`failure-${failures}.png`)});}finally{await context.close();}}}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log(`${selected.length-failures}/${selected.length} teacher-flow checks passed. Synthetic isolated data only.`);process.exitCode=failures?1:0;
