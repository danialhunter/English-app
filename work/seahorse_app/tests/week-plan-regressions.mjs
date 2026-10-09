import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
process.env.TZ = "Asia/Shanghai";
const context = vm.createContext({window:{},Date,console});
for(const file of ["curriculum.js","model.js"]) vm.runInContext(fs.readFileSync(new URL(`../web/${file}`,import.meta.url),"utf8"),context);
const model=context.window.TrackerModel, json=value=>JSON.parse(JSON.stringify(value));
const fresh=()=>model.migrate({schemaVersion:3,classes:[{id:"a",name:"Synthetic class",startWeek:"2026-09-14"}],students:[{id:"kid",classId:"a",englishName:"Synthetic child",chineseName:"",startUnit:0,startWeek:"2026-09-14"},{id:"other",classId:"a",englishName:"Other child",chineseName:"",startUnit:0,startWeek:"2026-09-14"}],records:{},selectedClassId:"a",selectedStudentId:"kid",selectedWeekStart:"2026-09-14"});
function finish(state,week="2026-09-14",date="2026-09-14T02:00:00.000Z") {
  const r=model.getRecord(state,state.students[0],week,true);r.itemStates.fill("known");r.practiceFinished=true;r.practicedAt=date;
  assert.equal(model.complete(state,state.students[0],week),true);return r;
}
const cases=[]; const test=(name,run)=>cases.push({name,run});

test("three early lessons credit their own scheduled weeks without skipping the pending practice",()=>{
  const state=fresh(), child=state.students[0];for(let i=0;i<3;i++)finish(state);
  const before=json(state.records);
  for(const [week,index,done] of [["2026-09-21",1,true],["2026-09-28",2,true],["2026-10-05",3,false]]) {
    const plan=model.weekPlan(state,child,week), record=model.getRecord(state,child,week), summary=model.weekStatus(record,state,child,week);
    assert.equal(plan.unitIndex,index);assert.equal(plan.completed,done);assert.equal(plan.completedEarly,done);
    assert.equal(plan.nextPracticeIndex,3);assert.equal(record.unitIndex,3);
    assert.equal(summary.mastered,done);assert.equal(summary.practiced,done);
    if(done){assert.equal(summary.known,6);assert.equal(plan.sourceWeekStart,"2026-09-14");assert.equal(plan.completedAt,"2026-09-14T02:00:00.000Z");}
  }
  assert.deepEqual(json(state.records),before);
  assert.equal(model.weekPlan(state,state.students[1],"2026-09-21").completed,false);
});

test("working on the next practice does not replace that week's completed calendar plan",()=>{
  const state=fresh(), child=state.students[0];for(let i=0;i<3;i++)finish(state);
  const r=model.getRecord(state,child,"2026-09-21",true);r.notes="Continue the next practice";r.itemStates[0]="learning";
  assert.equal(r.unitIndex,3);assert.equal(r.plannedUnitIndex,1);
  const restored=model.migrate(json(state)), restoredChild=restored.students[0];
  assert.equal(model.weekPlan(restored,restoredChild,"2026-09-21").unitIndex,1);
  assert.equal(model.weekPlan(restored,restoredChild,"2026-09-21").completed,true);
  assert.equal(model.getRecord(restored,restoredChild,"2026-09-28").unitIndex,3);
});

test("an intentional repeat needs a new assessment despite earlier mastery",()=>{
  const state=fresh(), child=state.students[0];
  const r=model.getRecord(state,child,"2026-09-14",true);r.itemStates.fill("known");r.practiceFinished=true;r.practicedAt="2026-09-14T02:00:00.000Z";r.nextAction="repeat";r.nextActionExplicit=true;
  const plan=model.weekPlan(state,child,"2026-09-21");
  assert.equal(plan.unitIndex,0);assert.equal(plan.explicitRepeat,true);assert.equal(plan.completed,false);assert.equal(plan.nextPracticeIndex,0);
  assert.equal(model.getRecord(state,child,"2026-09-21").unitIndex,0);
  assert.equal(model.weekPlan(state,child,"2026-09-28").unitIndex,1);
});

test("manual first-week planning anchors the calendar without shifting it for extra completions",()=>{
  const state=fresh(), child=state.students[0], r=model.getRecord(state,child,"2026-09-14",true);
  r.unitIndex=5;r.lesson=model.snapshot(5);r.plannedUnitIndex=5;r.manuallyAssigned=true;
  finish(state);finish(state);
  const plan=model.weekPlan(state,child,"2026-09-21");
  assert.equal(plan.unitIndex,6);assert.equal(plan.completed,true);assert.equal(plan.nextPracticeIndex,7);
  assert.equal(model.weekPlan(state,child,"2026-09-28").unitIndex,7);
});

test("known-only or practised-only records never earn scheduled completion credit",()=>{
  for(const mode of ["known","practised"]) {
    const state=fresh(), child=state.students[0];finish(state);
    const r=model.getRecord(state,child,"2026-09-14",true);
    if(mode==="known")r.itemStates.fill("known");else{r.practiceFinished=true;r.practicedAt="2026-09-14T02:00:00.000Z";}
    assert.equal(model.weekPlan(state,child,"2026-09-21").completed,false);
  }
});

test("future-week completion is dated using the actual local practice day",()=>{
  const early=fresh();finish(early,"2026-09-21","2026-09-14T02:00:00.000Z");
  const earlyPlan=model.weekPlan(early,early.students[0],"2026-09-21");assert.equal(earlyPlan.unitIndex,1);assert.equal(earlyPlan.completedEarly,true);assert.equal(earlyPlan.sourceWeekStart,"2026-09-21");
  const monday=fresh();finish(monday,"2026-09-21","2026-09-20T17:00:00.000Z");
  const mondayPlan=model.weekPlan(monday,monday.students[0],"2026-09-21");assert.equal(mondayPlan.completed,true);assert.equal(mondayPlan.completedEarly,false,"Sunday UTC is already Monday in Shanghai");
});

test("a later practice date cannot award historical completion credit",()=>{
  const state=fresh(), child=state.students[0], r=model.getRecord(state,child,"2026-09-28",true);
  r.unitIndex=1;r.lesson=model.snapshot(1);r.plannedUnitIndex=1;r.manuallyAssigned=true;
  finish(state,"2026-09-28","2026-09-28T02:00:00.000Z");
  assert.equal(model.weekPlan(state,child,"2026-09-21").completed,false);
});

test("legacy completed snapshots credit future weeks without migration writes",()=>{
  const state=fresh(), child=state.students[0];finish(state);finish(state);
  Object.values(state.records).forEach(record=>{delete record.plannedUnitIndex;record.completedLessons.forEach(item=>delete item.plannedUnitIndex);});
  const original=json(state.records), migrated=model.migrate(json(state));
  assert.equal(model.weekPlan(migrated,migrated.students[0],"2026-09-21").completed,true);
  assert.deepEqual(json(migrated.records),original);
});

test("different taught wording cannot be mistaken for completion of a scheduled lesson",()=>{
  const state=fresh(),child=state.students[0];finish(state);
  const r=model.getRecord(state,child,"2026-09-14",true);r.lesson.sentence="Different historical sentence";finish(state);
  assert.equal(model.weekPlan(state,child,"2026-09-21").completed,false);
});

test("completion exports an independent exact source session including notes and extras",()=>{
  const state=fresh(),child=state.students[0];finish(state);
  const r=model.getRecord(state,child,"2026-09-14",true);r.notes="Early assessment source";
  r.additionalPractice=[{entryId:"sample",title:"Synthetic",text:"Sample",category:"grammar",sourcePages:[24],state:"known",practiceFinished:true}];finish(state);
  const completion=model.weekPlan(state,child,"2026-09-21").completion;
  assert.equal(completion.sessionIndex,1);assert.equal(completion.session.notes,"Early assessment source");assert.equal(completion.session.additionalPractice.length,1);
  completion.session.notes="Read-only consumer's copy";
  assert.equal(state.records["kid::2026-09-14"].completedLessons[1].notes,"Early assessment source");
});

test("a completed final lesson has no fake next practice",()=>{
  const state=fresh(),child=state.students[0];child.startUnit=context.window.CURRICULUM.length-1;finish(state);
  const plan=model.weekPlan(state,child,"2026-09-21");assert.equal(plan.completed,true);assert.equal(plan.curriculumFinished,true);assert.equal(plan.nextPracticeIndex,null);
});

test("closing an earlier gap skips a lesson already completed in another selected week",()=>{
  const state=fresh(),child=state.students[0];
  finish(state,"2026-09-21");
  const futureSnapshot=json(state.records["kid::2026-09-21"]);
  const earlier=model.getRecord(state,child,"2026-09-14",true);
  earlier.notes="Gap lesson completed after the later lesson";
  earlier.additionalPractice=[{entryId:"carry-gap",title:"Pending extra",text:"Continue this",category:"grammar",sourcePages:[24],state:"learning",practiceFinished:false}];
  finish(state);
  const next=model.getRecord(state,child,"2026-09-14");
  assert.equal(next.unitIndex,2,"Lesson 1 is already completed; the next unfinished lesson is 2");
  assert.equal(next.plannedUnitIndex,0);
  assert.equal(next.completedLessons.length,1);
  assert.equal(next.completedLessons[0].unitIndex,0);
  assert.equal(next.completedLessons[0].notes,"Gap lesson completed after the later lesson");
  assert.equal(next.additionalPractice[0].entryId,"carry-gap");
  assert.deepEqual(json(state.records["kid::2026-09-21"]),futureSnapshot);
  assert.deepEqual(json(model.migrate(json(state)).records),json(state.records));
});

test("closing the last remaining gap marks its actual record done without a blank final record",()=>{
  const state=fresh(),child=state.students[0],last=context.window.CURRICULUM.length-1;
  child.startUnit=last-2;
  finish(state,"2026-09-28");
  const finalSnapshot=json(state.records["kid::2026-09-28"]);
  finish(state);
  const remaining=model.getRecord(state,child,"2026-09-14",true);
  assert.equal(remaining.unitIndex,last-1);
  remaining.notes="The last unfinished gap";
  remaining.additionalPractice=[{entryId:"final-extra",title:"Saved extra",text:"Still available",category:"reading",sourcePages:[36],state:"learning",practiceFinished:false}];
  finish(state);
  const actual=state.records["kid::2026-09-14"];
  assert.equal(actual.unitIndex,last-1,"Keep the lesson actually completed; do not create an unassessed last lesson");
  assert.equal(actual.curriculumFinished,true);
  assert.equal(actual.practiceFinished,true);
  assert.ok(actual.itemStates.every(item=>item==="known"));
  assert.equal(actual.notes,"The last unfinished gap");
  assert.equal(actual.additionalPractice.length,1);
  assert.equal(actual.completedLessons.length,1);
  assert.equal(actual.completedLessons[0].unitIndex,last-2);
  assert.equal(actual.plannedUnitIndex,last-2);
  assert.deepEqual(json(state.records["kid::2026-09-28"]),finalSnapshot);
  assert.equal(model.weekPlan(state,child,"2026-09-14").nextPracticeIndex,null);
  assert.equal(model.complete(state,child,"2026-09-14"),false);
});

let failures=0;for(const {name,run} of cases){try{run();console.log(`PASS ${name}`);}catch(error){failures++;console.error(`FAIL ${name}\n${error.message}`);}}
console.log(`${cases.length-failures}/${cases.length} scheduled-week checks passed. Synthetic data only.`);process.exitCode=failures?1:0;
