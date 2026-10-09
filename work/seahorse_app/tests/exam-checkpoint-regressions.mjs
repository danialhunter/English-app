import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const context=vm.createContext({window:{},Date,console});
for(const file of ["curriculum.js","monthly-exams.js","model.js"])vm.runInContext(fs.readFileSync(new URL(`../web/${file}`,import.meta.url),"utf8"),context);
const M=context.window.TrackerModel,E=context.window.MonthlyExams;
const seed=()=>{
  const s=M.migrate({schemaVersion:3,classes:[{id:"c",name:"Synthetic checkpoint class",startWeek:"2026-09-07"}],students:[{id:"a",classId:"c",englishName:"Synthetic child",chineseName:"",startWeek:"2026-09-07",startUnit:0,active:true}],records:{}});
  E.configure(s,"c",{startPeriod:"2026-09-01",periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true});return s;
};
const finish=(s,week)=>{const r=M.getRecord(s,s.students[0],week,true);r.itemStates.fill("known");r.practiceFinished=true;r.practicedAt="2026-09-14T04:00:00Z";return M.complete(s,s.students[0],week);};
const readyPractice=(s,start="2026-09-01")=>{
  for(const lesson of E.previewRound(s,"c",start).cohort[0].lessons){const r=M.getRecord(s,s.students[0],lesson.weekStart,true);r.itemStates.fill("learning");r.practiceFinished=true;r.practicedAt="2026-09-14T04:00:00Z";}
  assert.equal(E.readiness(s,"c",start,s.students[0].id).ready,true);
};
const tests=[];const test=(name,run)=>tests.push({name,run});
test("an explicit repeat cannot let the next calendar month's lesson bypass its exam",()=>{
  const s=seed(),child=s.students[0],r=M.getRecord(s,child,"2026-09-07",true);
  r.itemStates.fill("known");r.practiceFinished=true;r.nextAction="repeat";r.nextActionExplicit=true;
  assert.equal(M.scheduledPlan(s,child,"2026-09-28").unitIndex,2);
  assert.equal(M.scheduledPlan(s,child,"2026-10-05").unitIndex,3);
  assert.equal(finish(s,"2026-09-28"),true);
  const held=M.getRecord(s,child,"2026-09-28");assert.equal(held.unitIndex,2);assert.equal(held.awaitingMonthlyExam,true);
  assert.equal(E.access(s,child,"2026-09-28",3).allowed,false);
});
test("normal same-month weeks remain open while next-month weeks and unit jumps stay locked",()=>{
  const s=seed(),child=s.students[0];assert.equal(finish(s,"2026-09-07"),true);
  assert.equal(E.access(s,child,"2026-09-14",1).allowed,true);
  assert.equal(E.access(s,child,"2026-10-05",4).allowed,false);
  assert.equal(E.access(s,child,"2026-09-07",4).allowed,false);
});
test("class checkpoint remembers early month completion while an earlier week is viewed",()=>{
  const s=seed(),child=s.students[0];for(let i=0;i<4;i++)finish(s,"2026-09-07");
  s.students.push({...child,id:"b",englishName:"Other synthetic child"});
  const before=JSON.stringify(s),result=E.classCheckpoint(s,"c",{week:"2026-08-31",today:"2026-09-14"});
  assert.equal(result.required,true);assert.equal(result.periodStart,"2026-09-01");assert.equal(result.studentId,child.id);
  assert.equal(result.trigger,"blocked-practice");assert.equal(JSON.stringify(s),before);
});
test("unstarted teaching and knowledge without practice do not create a completed-period alert",()=>{
  const s=seed(),child=s.students[0];assert.equal(E.checkpoint(s,child,{week:"2026-09-07",today:"2026-09-14"}).required,false);
  for(const week of ["2026-09-07","2026-09-14","2026-09-21","2026-09-28"])M.getRecord(s,child,week,true).itemStates.fill("known");
  assert.equal(E.classCheckpoint(s,"c",{week:"2026-09-07",today:"2026-09-14"}).required,false);
});
test("finished monthly practice creates a checkpoint even before opening the next practice",()=>{
  const s=seed(),child=s.students[0];
  for(const week of ["2026-09-07","2026-09-14","2026-09-21","2026-09-28"]){const r=M.getRecord(s,child,week,true);r.itemStates.fill("known");r.practiceFinished=true;r.practicedAt="2026-09-14T04:00:00Z";}
  const result=E.checkpoint(s,child,{week:"2026-08-31",today:"2026-09-14"});assert.equal(result.required,true);assert.equal(result.trigger,"completed-period");
});
test("unfinished exams demand attention, and passing the required exam clears the alert",()=>{
  const s=seed(),child=s.students[0];readyPractice(s);const draft=E.startAttempt(s,"c","2026-09-01",child.id);
  assert.equal(E.checkpoint(s,child,{week:"2026-08-31",today:"2026-09-14"}).trigger,"unfinished-exam");
  draft.itemIndexes.forEach(i=>E.setMark(s,"c::2026-09-01",child.id,i,"known"));E.finishAttempt(s,"c::2026-09-01",child.id);
  assert.equal(E.classCheckpoint(s,"c",{week:"2026-08-31",today:"2026-09-14"}).required,false);
  assert.equal(E.access(s,child,"2026-10-05",4).allowed,true);
});
test("four-week teaching periods enforce the repeated-plan checkpoint too",()=>{
  const s=seed(),child=s.students[0];E.configure(s,"c",{...s.classes[0].monthlyPolicy,periodKind:"fourWeeks",startPeriod:"2026-09-07"});
  const r=M.getRecord(s,child,"2026-09-07",true);r.itemStates.fill("known");r.practiceFinished=true;r.nextAction="repeat";r.nextActionExplicit=true;
  finish(s,"2026-09-28");const next=M.getRecord(s,child,"2026-09-28");
  assert.equal(next.unitIndex,2);assert.equal(next.awaitingMonthlyExam,true);assert.equal(E.access(s,child,"2026-09-28",3).allowed,false);
  assert.equal(E.checkpoint(s,child,{week:"2026-09-07",today:"2026-09-14"}).periodStart,"2026-09-07");
});
test("a whole repeated month can start its exam after the earlier exam has passed",()=>{
  const s=seed(),child=s.students[0];readyPractice(s);const draft=E.startAttempt(s,"c","2026-09-01",child.id);
  draft.itemIndexes.forEach(i=>E.setMark(s,"c::2026-09-01",child.id,i,"known"));E.finishAttempt(s,"c::2026-09-01",child.id);
  for(const week of ["2026-10-05","2026-10-12","2026-10-19","2026-10-26"]){const r=M.getRecord(s,child,week,true);r.unitIndex=0;r.plannedUnitIndex=0;r.lesson=M.snapshot(0);r.manuallyAssigned=true;r.nextAction="repeat";r.nextActionExplicit=true;}
  readyPractice(s,"2026-10-01");
  assert.equal(E.startAttempt(s,"c","2026-10-01",child.id).itemStates.length,24);
});
test("a held last-month lesson demands its exam even when earlier practice has not been recorded",()=>{
  const s=seed(),child=s.students[0];finish(s,"2026-09-28");
  assert.equal(M.getRecord(s,child,"2026-09-28").awaitingMonthlyExam,true);
  const before=JSON.stringify(s),due=E.checkpoint(s,child,{week:"2026-09-07",today:"2026-09-14"});
  assert.equal(due.required,true);assert.equal(due.periodStart,"2026-09-01");assert.equal(due.trigger,"blocked-practice");assert.equal(JSON.stringify(s),before);
});
test("a held completion skips legacy early-finished lessons when locating the required exam",()=>{
  const s=seed(),child=s.students[0];
  // This later September lesson was already taught early. The first two
  // September weeks remain unrecorded, so a whole-month fallback cannot help.
  const legacy=M.getRecord(s,child,"2026-09-28",true);legacy.itemStates.fill("known");legacy.practiceFinished=true;legacy.practicedAt="2026-09-14T04:00:00Z";
  finish(s,"2026-09-21");
  const held=M.getRecord(s,child,"2026-09-21");assert.equal(held.unitIndex,2);assert.equal(held.awaitingMonthlyExam,true);
  assert.equal(E.access(s,child,"2026-09-21",3).allowed,true);assert.equal(E.access(s,child,"2026-09-21",4).allowed,false);
  const before=JSON.stringify(s),due=E.checkpoint(s,child,{week:"2026-09-07",today:"2026-09-14"});
  assert.equal(due.required,true);assert.equal(due.periodStart,"2026-09-01");assert.equal(due.unitIndex,4);assert.equal(due.trigger,"blocked-practice");assert.equal(JSON.stringify(s),before);
});
let passed=0;for(const {name,run} of tests){try{run();console.log(`PASS ${name}`);passed++;}catch(error){console.error(`FAIL ${name}\n${error.stack}`);}}
console.log(`${passed}/${tests.length} exam checkpoint checks passed. Synthetic data only.`);if(passed!==tests.length)process.exitCode=1;
