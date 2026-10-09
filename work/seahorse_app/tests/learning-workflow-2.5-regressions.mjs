import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
process.env.TZ="Asia/Shanghai";
const context=vm.createContext({window:{},Date,console});
for(const file of ["curriculum.js","monthly-exams.js","model.js","learning-review.js"])vm.runInContext(fs.readFileSync(new URL(`../web/${file}`,import.meta.url),"utf8"),context);
const M=context.window.TrackerModel,E=context.window.MonthlyExams,R=context.window.LearningReview;
const copy=value=>JSON.parse(JSON.stringify(value));
const seed=(count=2)=>({schemaVersion:6,appVersion:"2.4.2",classes:[{id:"a",name:"Synthetic",startWeek:"2026-09-07",monthlyPolicy:{startPeriod:"2026-09-01",periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true}}],students:Array.from({length:count},(_,i)=>({id:`child-${i}`,classId:"a",englishName:`Synthetic ${i}`,chineseName:"",active:true,startWeek:"2026-09-07",startUnit:0})),records:{},monthlyExams:{rounds:{}},selectedClassId:"a",selectedStudentId:"child-0",selectedWeekStart:"2026-09-07"});
const state=(count)=>M.migrate(seed(count));
function practice(s,child=s.students[0],period="2026-09-01") {
  for(const assigned of E.previewRound(s,"a",period).cohort.find(member=>member.studentId===child.id).lessons) {
    const r=M.getRecord(s,child,assigned.weekStart,true);r.unitIndex=assigned.unitIndex;r.lesson=copy(assigned.lesson);r.itemStates.fill("learning");r.practiceFinished=true;r.practicedAt=`${assigned.weekStart}T04:00:00.000Z`;
  }
}
function pass(s,child=s.students[0],period="2026-09-01") {
  practice(s,child,period);const d=E.startAttempt(s,"a",period,child.id),id=`a::${period}`;
  for(const index of d.itemIndexes || d.itemStates.map((_,i)=>i))E.setMark(s,id,child.id,index,"known");
  return E.finishAttempt(s,id,child.id);
}
const tests=[];const test=(name,run)=>tests.push({name,run});
test("schema7 migration preserves all historical records, names and completed attempts",()=>{
  const old=seed();pass(old);const before=copy(old),next=M.migrate(old);
  assert.equal(next.schemaVersion,7);assert.equal(next.appVersion,"2.5.0");
  assert.deepEqual(copy(next.records),before.records);assert.deepEqual(copy(next.monthlyExams),before.monthlyExams);assert.deepEqual(copy(old),before);
  assert.deepEqual(copy(M.migrate(next)),copy(next));
});
test("individual pass immediately advances without any classmate completion",()=>{
  const s=state(25);pass(s);assert.equal(E.roundStatus(s,"a","2026-09-01").completed,1);
  assert.equal(E.access(s,s.students[0],"2026-10-05",4).allowed,true);
  assert.equal(E.access(s,s.students[1],"2026-10-05",4).allowed,false);
  assert.deepEqual(copy(E.availablePeriods(s,"a","child-0").map(item=>item.start)),["2026-09-01","2026-10-01"]);
  assert.deepEqual(copy(E.availablePeriods(s,"a","child-1").map(item=>item.start)),["2026-09-01"]);
});
test("old sampled draft keeps answers, notes, dates, selected items and original scoring",()=>{
  const s=seed(1);practice(s);const draft=E.startAttempt(s,"a","2026-09-01","child-0");
  const original=s.monthlyExams.rounds["a::2026-09-01"].attempts["child-0"].draft;
  original.notes="Keep original note";original.itemStates[draft.itemIndexes[0]]="known";delete original.scoringRule;delete original.passPercent;s.schemaVersion=5;
  const before=copy(original),migrated=M.migrate(s),resumed=E.startAttempt(migrated,"a","2026-09-01","child-0");
  assert.equal(resumed.scoringRule,"legacy-sampled-v1");
  for(const field of Object.keys(before))assert.deepEqual(copy(resumed[field]),before[field]);
  const round=E.previewRound(migrated,"a","2026-09-01"),sentenceIndex=draft.itemIndexes.find(i=>round.cohort[0].items[i].kind==="sentence");
  for(const index of draft.itemIndexes)E.setMark(migrated,round.id,"child-0",index,index===sentenceIndex?"learning":"known");
  const result=E.finishAttempt(migrated,round.id,"child-0");assert.equal(result.passed,false,"Original sampled rule requires all three sampled sentences at 80%");
});
test("old full-checklist draft remains full and is not reduced or regraded",()=>{
  const s=seed(1);practice(s);E.startAttempt(s,"a","2026-09-01","child-0");
  const draft=s.monthlyExams.rounds["a::2026-09-01"].attempts["child-0"].draft;
  delete draft.itemIndexes;delete draft.scoringRule;delete draft.passPercent;draft.itemStates[0]="known";s.schemaVersion=4;
  const restored=M.migrate(s),resumed=E.startAttempt(restored,"a","2026-09-01","child-0");
  assert.equal(resumed.scoringRule,"legacy-full-v1");assert.equal(resumed.itemIndexes,undefined);assert.equal(resumed.itemStates[0],"known");
  assert.throws(()=>E.finishAttempt(restored,"a::2026-09-01","child-0"),/Assess every/);
});
test("marking known does not finish; early work stays in its month",()=>{
  const s=state(1),child=s.students[0],r=M.getRecord(s,child,"2026-09-07",true);r.itemStates.fill("known");
  assert.equal(M.complete(s,child,r.weekStart),false);assert.equal(R.capture(s,child,r).length,0);
  for(let count=0;count<4;count++){const current=M.getRecord(s,child,r.weekStart,true);current.itemStates.fill("known");current.practiceFinished=true;current.practicedAt="2026-09-07T04:00:00.000Z";R.capture(s,child,current);assert.equal(M.complete(s,child,r.weekStart),true);}
  assert.equal(M.getRecord(s,child,r.weekStart).unitIndex,3);assert.equal(M.getRecord(s,child,r.weekStart).awaitingMonthlyExam,true);
});
test("later review is separate, max3, postponable, and never erases achievement or exam pass",()=>{
  const s=state(1),child=s.students[0];pass(s);const record=s.records["child-0::2026-09-07"];record.itemStates.fill("known");R.capture(s,child,record);
  const before=JSON.stringify({records:s.records,exams:s.monthlyExams});
  const due=R.due(s,child,{today:"2026-09-14"});assert.equal(due.length,3);
  R.mark(s,child.id,due[0].id,"learning",{today:"2026-09-14"});
  assert.equal(R.due(s,child,{today:"2026-09-14"}).some(item=>item.id===due[0].id),false);
  R.postpone(s,child.id,due[1].id,{today:"2026-09-14",days:7});
  assert.equal(R.due(s,child,{today:"2026-09-14"}).some(item=>item.id===due[1].id),false);
  assert.equal(JSON.stringify({records:s.records,exams:s.monthlyExams}),before);assert.equal(E.access(s,child,"2026-10-05",4).allowed,true);
  assert.equal(M.migrate(s).schemaVersion,7);
});
test("later review reports deduplicate targets and exclude missing observations",()=>{
  const s=state(1),child=s.students[0],r=M.getRecord(s,child,"2026-09-07",true);r.itemStates[0]="known";r.practiceFinished=true;r.practicedAt="2026-09-07T04:00:00.000Z";
  R.capture(s,child,r);const id=R.due(s,child,{today:"2026-09-14"})[0].id;
  assert.equal(R.reportSummary(s,child.id,"2026-09-01","2026-09-30").checked,0);
  R.mark(s,child.id,id,"learning",{today:"2026-09-14"});R.mark(s,child.id,id,"known",{today:"2026-09-21"});
  const summary=R.reportSummary(s,child.id,"2026-09-01","2026-09-30");assert.equal(summary.checked,1);assert.equal(summary.known,1);assert.equal(summary.observations.length,2);assert.equal(summary.needsPractice.length,0);
});
test("brief review includes learned and difficult targets without scanning lesson history",()=>{
  const s=state(1),child=s.students[0],record=M.getRecord(s,child,"2026-09-07",true);record.itemStates=["learning","learning","learning","learning","learning","known"];record.practiceFinished=true;record.practicedAt="2026-09-07T04:00:00.000Z";R.capture(s,child,record);
  const records=s.records;Object.defineProperty(s,"records",{get(){throw new Error("Review selection must use its per-child index, not history");},configurable:true});
  const due=R.due(s,child,{today:"2026-09-14"});assert.equal(due.length,3);assert.ok(due.some(item=>item.lastMark==="known"));assert.ok(due.some(item=>item.lastMark==="learning"));
  Object.defineProperty(s,"records",{value:records,writable:true,configurable:true});
});
test("prospective expectations persist in early practice and frozen exam snapshots",()=>{
  const s=state(1),child=s.students[0];R.setGoal(s,child,{week:"2026-09-14",unitIndex:1,targetIndex:0,expectation:"Point to the correct object independently"});
  const r=M.getRecord(s,child,"2026-09-07",true);r.itemStates.fill("known");r.practiceFinished=true;r.practicedAt="2026-09-07T04:00:00.000Z";M.complete(s,child,r.weekStart);
  assert.equal(M.getRecord(s,child,r.weekStart).lesson.expectations[0],"Point to the correct object independently");
  const planned=E.previewRound(s,"a","2026-09-01").cohort[0].items.find(item=>item.unitIndex===1 && item.wordIndex===0);assert.equal(planned.expectation,"Point to the correct object independently");
  assert.equal(R.goalHistory(s,child.id).length,1);assert.equal(M.migrate(s).learningReview.goals.length,1);
  assert.throws(()=>R.setGoal(s,child,{week:"2026-09-07",unitIndex:0,targetIndex:0,expectation:"Change past"}),/later/);
  practice(s);E.startAttempt(s,"a","2026-09-01",child.id);
  assert.throws(()=>R.setGoal(s,child,{week:"2026-09-21",unitIndex:2,targetIndex:0,expectation:"Change frozen"}),/saved work|started exam/);
});
test("correction preserves original pass and later practice, requires reason and reassessment",()=>{
  const s=state(1),child=s.students[0],passed=pass(s),id="a::2026-09-01",original=copy(s.monthlyExams.rounds[id].attempts[child.id].history);
  const future=M.getRecord(s,child,"2026-10-05",true);future.itemStates[0]="known";future.notes="Keep later work";const records=copy(s.records);
  assert.throws(()=>E.correctAttempt(s,id,child.id,passed.latestAttempt.id," "),/reason/);
  const corrected=E.correctAttempt(s,id,child.id,passed.latestAttempt.id,"Wrong child was selected");assert.equal(corrected.corrected,true);assert.equal(corrected.passed,false);
  assert.deepEqual(copy(s.monthlyExams.rounds[id].attempts[child.id].history),original);assert.deepEqual(copy(s.records),records);assert.equal(E.access(s,child,"2026-10-05",4).allowed,false);
  const restored=M.migrate(s);assert.equal(E.studentResult(restored,"a","2026-09-01",child.id).passed,false);
  const draft=E.startAttempt(restored,"a","2026-09-01",child.id);draft.itemIndexes.forEach(index=>E.setMark(restored,id,child.id,index,"known"));
  assert.equal(E.finishAttempt(restored,id,child.id).passed,true);assert.equal(M.migrate(restored).monthlyExams.rounds[id].attempts[child.id].history.length,2);
  assert.equal(E.access(restored,child,"2026-10-05",4).allowed,true);
});
test("malformed review, goal and correction imports are rejected atomically",()=>{
  const s=state(1);pass(s);const result=E.studentResult(s,"a","2026-09-01","child-0");E.correctAttempt(s,"a::2026-09-01","child-0",result.latestAttempt.id,"Synthetic correction");
  const bad=copy(s);bad.monthlyExams.rounds["a::2026-09-01"].attempts["child-0"].corrections[0].reason="";const before=JSON.stringify(bad);assert.throws(()=>M.migrate(bad),/correction/);assert.equal(JSON.stringify(bad),before);
  const malformed=copy(s);malformed.learningReview.settings.firstDays=-1;assert.throws(()=>M.migrate(malformed),/timing/);
  const missing=copy(s);delete missing.learningReview;assert.throws(()=>M.migrate(missing),/review and goal history/);
  assert.throws(()=>M.migrate({...s,schemaVersion:8}),/newer/);
});
let passed=0;
for(const {name,run} of tests){try{run();passed++;console.log(`PASS ${name}`);}catch(error){console.error(`FAIL ${name}\n${error.stack}`);}}
console.log(`${passed}/${tests.length} learning workflow checks passed. Synthetic data only.`);if(passed!==tests.length)process.exitCode=1;
