import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

process.env.TZ="Asia/Shanghai";
const context=vm.createContext({window:{},Date,console});
for(const file of ["curriculum.js","monthly-exams.js","model.js"]) vm.runInContext(fs.readFileSync(new URL(`../web/${file}`,import.meta.url),"utf8"),context);
const M=context.window.TrackerModel,E=context.window.MonthlyExams;
const copy=value=>JSON.parse(JSON.stringify(value));
const state=(count=1)=>({schemaVersion:6,appVersion:"2.4.0",classes:[{id:"class-a",name:"Synthetic",startWeek:"2026-08-31",monthlyPolicy:{startPeriod:"2026-09-01",periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true}}],students:Array.from({length:count},(_,i)=>({id:`child-${i}`,classId:"class-a",englishName:`Synthetic ${i}`,chineseName:"",active:true,startWeek:"2026-08-31",startUnit:0})),records:{},monthlyExams:{rounds:{}},selectedClassId:"class-a",selectedStudentId:"child-0",selectedWeekStart:"2026-09-07"});
const finishPractice=(s,id="child-0",start="2026-09-01")=>{
  const member=E.previewRound(s,"class-a",start).cohort.find(item=>item.studentId===id);
  for(const assigned of member.lessons) {
    const r=M.getRecord(s,s.students.find(item=>item.id===id),assigned.weekStart,true);
    r.unitIndex=assigned.unitIndex;r.plannedUnitIndex=assigned.unitIndex;r.lesson=copy(assigned.lesson);
    r.practiceFinished=true;r.practicedAt="2026-09-14T04:00:00.000Z";r.itemStates.fill("learning");
  }
};
const finishExam=(s,id="child-0",pass=true,start="2026-09-01")=>{
  finishPractice(s,id,start);
  const draft=E.startAttempt(s,"class-a",start,id),round=`class-a::${start}`;
  for(const index of draft.itemIndexes || draft.itemStates.map((_,i)=>i))E.setMark(s,round,id,index,pass?"known":"learning");
  return E.finishAttempt(s,round,id);
};
const tests=[];const test=(name,run)=>tests.push({name,run});

test("new scoring accepts 12 of 14 with a majority in both categories, not vocabulary alone",()=>{
  const items=Array.from({length:14},(_,i)=>({kind:i<11?"vocabulary":"sentence"}));
  const attempt={completedAt:"2026-09-20T04:00:00.000Z",scoringRule:"overall-majority-v1",passPercent:80,itemIndexes:Array.from({length:14},(_,i)=>i),itemStates:Array(10).fill("known").concat("learning","known","known","learning")};
  assert.equal(E.resultForAttempt(attempt,14,80,items).passed,true);
  attempt.itemStates=Array(11).fill("known").concat("known","learning","learning");
  assert.equal(E.resultForAttempt(attempt,14,80,items).passed,false);
});

test("upgrade keeps a historical failure and its later draft with original draft scoring",()=>{
  const s=state();finishPractice(s);const draft=E.startAttempt(s,"class-a","2026-09-01","child-0"),round=s.monthlyExams.rounds["class-a::2026-09-01"],member=round.cohort[0];
  const sentence=draft.itemIndexes.find(index=>member.items[index].kind==="sentence");
  const completed={...copy(draft),id:"old-completed",startedAt:"2026-09-01T04:00:00.000Z",updatedAt:"2026-09-02T04:00:00.000Z",completedAt:"2026-09-02T04:00:00.000Z",notes:"Original result"};
  delete completed.scoringRule;delete completed.passPercent;
  completed.itemStates=completed.itemStates.map((_,index)=>draft.itemIndexes.includes(index)?index===sentence?"learning":"known":"unassessed");
  const savedDraft={...copy(draft),id:"old-draft",startedAt:"2026-09-03T04:00:00.000Z",updatedAt:"2026-09-03T04:00:00.000Z",notes:"Keep this note"};
  delete savedDraft.scoringRule;delete savedDraft.passPercent;savedDraft.itemStates[draft.itemIndexes[0]]="known";
  round.startedAt=completed.startedAt;round.attempts["child-0"]={history:[completed],draft:savedDraft};
  const oldHistory=copy(completed),oldDraft=copy(savedDraft);
  E.upgrade(s,5);E.normalize(s);
  assert.equal(E.studentResult(s,"class-a","2026-09-01","child-0").passed,false);
  const upgraded=round.attempts["child-0"];
  assert.equal(upgraded.history[0].scoringRule,"legacy-sampled-v1");assert.equal(upgraded.draft.scoringRule,"legacy-sampled-v1");
  for(const [old,current] of [[oldHistory,upgraded.history[0]],[oldDraft,upgraded.draft]])for(const field of ["id","itemStates","itemIndexes","notes","startedAt","updatedAt","completedAt"])assert.deepEqual(copy(current[field] ?? null),copy(old[field] ?? null));
  const again=JSON.stringify(s);E.upgrade(s,6);E.normalize(s);assert.equal(JSON.stringify(s),again);
});

test("every assigned practice must be explicitly finished, but knowledge mastery is not required",()=>{
  const s=state();
  assert.throws(()=>E.startAttempt(s,"class-a","2026-09-01","child-0"),/Finish.*practice/);
  const initial=E.readiness(s,"class-a","2026-09-01","child-0");assert.equal(initial.ready,false);assert.equal(initial.total,4);assert.equal(initial.finished,0);
  finishPractice(s);assert.equal(E.readiness(s,"class-a","2026-09-01","child-0").ready,true);
  const draft=E.startAttempt(s,"class-a","2026-09-01","child-0"),id="class-a::2026-09-01";
  draft.itemIndexes.forEach(index=>E.setMark(s,id,"child-0",index,"known"));
  s.records["child-0::2026-09-07"].practiceFinished=false;
  const before=copy(s.monthlyExams);
  assert.throws(()=>E.finishAttempt(s,id,"child-0"),/Finish.*practice/);
  assert.deepEqual(copy(s.monthlyExams),before);
  s.records["child-0::2026-09-07"].practiceFinished=true;
  assert.equal(E.finishAttempt(s,id,"child-0").passed,true);
});

test("five confirmed absences permit 20 tested and 16 passes, without unlocking absent or failed children",()=>{
  const s=state(25);
  for(let i=20;i<25;i++)E.setAbsence(s,"class-a","2026-09-01",`child-${i}`,true);
  for(let i=0;i<20;i++)finishExam(s,`child-${i}`,i<16);
  const summary=E.roundStatus(s,"class-a","2026-09-01");
  assert.equal(summary.eligible,25);assert.equal(summary.absent,5);assert.equal(summary.requiredCoverage,20);assert.equal(summary.coverageCompleted,20);
  assert.equal(summary.requiredPasses,16);assert.equal(summary.countedPassed,16);assert.equal(summary.unlocked,true);assert.ok(summary.unlockedAt);
  assert.equal(E.access(s,s.students[0],"2026-10-05",5).allowed,true);
  assert.equal(E.access(s,s.students[19],"2026-10-05",5).allowed,false);
  assert.equal(E.access(s,s.students[24],"2026-10-05",5).allowed,false);
  E.setAbsence(s,"class-a","2026-09-01","child-24",false);
  const returned=E.roundStatus(s,"class-a","2026-09-01");
  assert.equal(returned.currentlyQualified,false);assert.equal(returned.unlocked,true);
  assert.equal(E.access(s,s.students[0],"2026-10-05",5).allowed,true);
  assert.equal(E.access(s,s.students[24],"2026-10-05",5).allowed,false);
});

test("newcomers take a partial catch-up exam without changing the current class denominator",()=>{
  const s=state(5);finishExam(s,"child-0");
  const newcomer={id:"newcomer",classId:"class-a",englishName:"New child",chineseName:"",active:true,startWeek:"2026-09-21",startUnit:0,joinedAt:"2026-09-21T04:00:00.000Z"};s.students.push(newcomer);
  const preview=E.previewRound(s,"class-a","2026-09-01"),member=preview.cohort.find(child=>child.studentId==="newcomer");
  assert.ok(member);assert.equal(member.countsForClass,false);assert.deepEqual(copy(member.lessons.map(item=>item.weekStart)),["2026-09-21","2026-09-28"]);
  assert.equal(E.roundStatus(s,"class-a","2026-09-01").eligible,5);
  for(let i=1;i<5;i++)finishExam(s,`child-${i}`);
  assert.equal(E.access(s,newcomer,"2026-10-05",2).allowed,false);
  assert.equal(finishExam(s,"newcomer").passed,true);
  assert.equal(E.access(s,newcomer,"2026-10-05",2).allowed,true);
  assert.equal(E.roundStatus(s,"class-a","2026-09-01").eligible,5);
  assert.equal(E.previewRound(s,"class-a","2026-10-01").cohort.find(child=>child.studentId==="newcomer").countsForClass,true);
});

test("a frozen legacy advanced assignment can be prepared without bypassing prior exams or losing draft marks",()=>{
  const s=state(),child=s.students[0];
  const record=M.getRecord(s,child,"2026-09-07",true);record.unitIndex=50;record.plannedUnitIndex=50;record.lesson=M.snapshot(50);record.manuallyAssigned=true;record.notes="Legacy assigned lesson";
  const preview=E.previewRound(s,"class-a","2026-09-01"),{frozen,period,label,...saved}=preview;
  saved.startedAt="2026-09-01T04:00:00.000Z";
  const member=saved.cohort[0],assessment=E.previewAssessment(preview,child.id);
  saved.attempts[child.id]={history:[],draft:{id:"legacy-draft",startedAt:saved.startedAt,updatedAt:saved.startedAt,notes:"Saved exam",itemIndexes:assessment.itemIndexes,itemStates:Array(member.items.length).fill("unassessed")}};
  saved.attempts[child.id].draft.itemStates[assessment.itemIndexes[0]]="known";s.monthlyExams.rounds[saved.id]=saved;E.upgrade(s,5);
  assert.equal(E.access(s,child,"2026-09-07",50).allowed,true);
  assert.equal(E.access(s,child,"2026-09-07",70).allowed,false);
  assert.throws(()=>E.finishAttempt(s,saved.id,child.id),/Finish.*practice/);
  assert.equal(s.monthlyExams.rounds[saved.id].attempts[child.id].draft.itemStates[assessment.itemIndexes[0]],"known");
  s.classes[0].monthlyPolicy.startPeriod="2026-08-01";
  assert.equal(E.access(s,child,"2026-09-07",50).allowed,false);
});

test("upgrade preserves old configured pass outcomes and earned unlocks while fixing new exams at 80 percent",()=>{
  const s=state();s.classes[0].monthlyPolicy.passPercent=50;s.classes[0].monthlyPolicy.requireIndividualPass=false;
  const {frozen,period,label,...round}=E.previewRound(s,"class-a","2026-09-01");round.startedAt="2026-09-01T04:00:00.000Z";
  round.attempts["child-0"]={draft:null,history:[{id:"historic-full",startedAt:round.startedAt,updatedAt:"2026-09-02T04:00:00.000Z",completedAt:"2026-09-02T04:00:00.000Z",notes:"Original pass",itemStates:Array(12).fill("known").concat(Array(12).fill("learning"))}]};
  s.monthlyExams.rounds[round.id]=round;E.upgrade(s,5);
  assert.equal(s.classes[0].monthlyPolicy.passPercent,80);assert.equal(s.classes[0].monthlyPolicy.requireIndividualPass,true);
  assert.equal(round.attempts["child-0"].history[0].passPercent,50);
  assert.equal(E.studentResult(s,"class-a","2026-09-01","child-0").passed,true);
  assert.ok(E.roundStatus(s,"class-a","2026-09-01").unlockedAt);
  assert.doesNotThrow(()=>E.normalize(s));
});

test("backup validation rejects forged unlock evidence, invalid absence membership and scoring versions",()=>{
  const s=state(2);finishExam(s,"child-0");finishExam(s,"child-1");assert.doesNotThrow(()=>E.normalize(copy(s)));
  for(const mutate of [
    round=>round.unlock.passedIds=[],
    round=>round.unlock.at="not-a-date",
    round=>round.absences.unknown={absent:true,updatedAt:"2026-09-01T04:00:00.000Z"},
    round=>round.cohort[0].countsForClass="yes",
    round=>round.attempts["child-0"].history[0].scoringRule="invented",
    round=>round.attempts["child-0"].history[0].passPercent=1
  ]) {const bad=copy(s);mutate(bad.monthlyExams.rounds["class-a::2026-09-01"]);assert.throws(()=>E.normalize(bad));}
});

test("a passed catch-up child can reach next month's exam when all original members withdrew",()=>{
  const s=state();finishExam(s);M.deleteStudent(s,"child-0");
  for(let i=0;i<2;i++)s.students.push({id:`new-${i}`,classId:"class-a",englishName:`New ${i}`,chineseName:"",active:true,startWeek:"2026-09-21",startUnit:0,joinedAt:"2026-09-21T04:00:00.000Z"});
  // No earlier earned unlock is needed to make the now-empty class denominator vacuous.
  delete s.monthlyExams.rounds["class-a::2026-09-01"].unlock;
  finishExam(s,"new-0");finishExam(s,"new-1",false);E.refresh(s);
  assert.equal(E.roundStatus(s,"class-a","2026-09-01").eligible,0);
  assert.deepEqual(copy(E.availablePeriods(s,"class-a").map(period=>period.start)),["2026-09-01","2026-10-01"]);
  assert.equal(E.access(s,s.students.find(child=>child.id==="new-0"),"2026-10-05",2).allowed,true);
  assert.equal(E.access(s,s.students.find(child=>child.id==="new-1"),"2026-10-05",2).allowed,false);
});

test("six absences cannot manufacture the minimum class assessment coverage",()=>{
  const s=state(25);for(let i=19;i<25;i++)E.setAbsence(s,"class-a","2026-09-01",`child-${i}`,true);
  for(let i=0;i<19;i++)finishExam(s,`child-${i}`);
  const summary=E.roundStatus(s,"class-a","2026-09-01");
  assert.equal(summary.allCompleted,true);assert.equal(summary.classPassed,true);assert.equal(summary.coverageCompleted,19);assert.equal(summary.requiredCoverage,20);assert.equal(summary.coverageMet,false);assert.equal(summary.unlocked,false);
});

test("withdrawal removes outstanding requirements without removing saved history",()=>{
  const s=state(5);for(let i=0;i<4;i++)finishExam(s,`child-${i}`,i<3);
  const evidence=copy(s.monthlyExams.rounds["class-a::2026-09-01"].attempts["child-3"]);
  M.deleteStudent(s,"child-4");E.refresh(s);assert.equal(E.roundStatus(s,"class-a","2026-09-01").unlocked,false);
  M.deleteStudent(s,"child-3");E.refresh(s);
  const summary=E.roundStatus(s,"class-a","2026-09-01");assert.equal(summary.eligible,3);assert.equal(summary.unlocked,true);
  assert.deepEqual(copy(s.monthlyExams.rounds["class-a::2026-09-01"].attempts["child-3"]),evidence);
  assert.equal(summary.children.find(child=>child.studentId==="child-3").withdrawn,true);
  assert.doesNotThrow(()=>E.normalize(copy(s)));
});

test("readiness credits early practice but never uses one session for two explicit assignments",()=>{
  const s=state(),child=s.students[0];finishPractice(s);
  const sessions=Object.values(s.records).map(copy),first=sessions[0],current=sessions.at(-1);
  for(const session of sessions){session.id=first.id;session.weekStart=first.weekStart;session.plannedUnitIndex=first.plannedUnitIndex;}
  current.completedLessons=sessions.slice(0,-1);s.records={[first.id]:current};
  assert.equal(E.readiness(s,"class-a","2026-09-01",child.id).finished,4);
  const repeated=state(),r=M.getRecord(repeated,repeated.students[0],"2026-09-07",true);
  r.practiceFinished=true;r.practicedAt="2026-09-07T04:00:00.000Z";r.nextAction="repeat";r.nextActionExplicit=true;
  const ready=E.readiness(repeated,"class-a","2026-09-01","child-0");assert.equal(ready.finished,1);assert.ok(ready.missing.some(item=>item.weekStart==="2026-09-14"));
});

test("retests keep the complete same sample and preserve the previous completed attempt",()=>{
  const s=state();finishExam(s,"child-0",false);const old=copy(s.monthlyExams.rounds["class-a::2026-09-01"].attempts["child-0"].history[0]);
  const retry=E.startAttempt(s,"class-a","2026-09-01","child-0");
  assert.deepEqual(copy(retry.itemIndexes),old.itemIndexes);assert.ok(retry.itemStates.every(mark=>mark==="unassessed"));assert.equal(retry.itemIndexes.length,14);
  assert.deepEqual(copy(s.monthlyExams.rounds["class-a::2026-09-01"].attempts["child-0"].history[0]),old);
});

test("status, readiness and available-month previews are pure and never freeze a roster",()=>{
  const s=state(2),before=JSON.stringify(s);
  E.previewRound(s,"class-a","2026-09-01");E.roundStatus(s,"class-a","2026-09-01");E.readiness(s,"class-a","2026-09-01","child-0");E.availablePeriods(s,"class-a");E.refresh(s);
  assert.equal(JSON.stringify(s),before);
});

test("frozen legacy practice remains reachable after the live lesson plan is changed back",()=>{
  const s=state(),child=s.students[0],record=M.getRecord(s,child,"2026-09-07",true);
  record.unitIndex=50;record.plannedUnitIndex=50;record.lesson=M.snapshot(50);record.manuallyAssigned=true;record.notes="Original advanced plan";
  const {frozen,period,label,...round}=E.previewRound(s,"class-a","2026-09-01");round.startedAt="2026-09-01T04:00:00.000Z";s.monthlyExams.rounds[round.id]=round;
  record.unitIndex=0;record.plannedUnitIndex=0;record.lesson=M.snapshot(0);record.notes="Changed plan evidence";record.itemStates[0]="known";
  const changed=copy(record);E.upgrade(s,5);
  assert.equal(E.access(s,child,"2026-09-07",50).allowed,true);
  assert.equal(E.access(s,child,"2026-09-07",70).allowed,false);
  const first=M.prepareExamPractice(s,"class-a","2026-09-01",child.id);
  assert.equal(first.unitIndex,50);assert.deepEqual(copy(s.records[record.id].completedLessons[0]),changed);
  const earlier=copy(s);earlier.classes[0].monthlyPolicy.startPeriod="2026-08-01";
  assert.equal(E.access(earlier,earlier.students[0],"2026-09-07",50).allowed,false);
  for(let i=0;i<4;i++) {
    const prepared=M.prepareExamPractice(s,"class-a","2026-09-01",child.id);
    s.records[`${child.id}::${prepared.weekStart}`].practiceFinished=true;
  }
  assert.equal(E.readiness(s,"class-a","2026-09-01",child.id).ready,true);
});

test("a September newcomer counts in an already-started October round without changing saved classmates",()=>{
  const s=state(2);for(let i=0;i<2;i++)finishExam(s,`child-${i}`);
  finishPractice(s,"child-0","2026-10-01");E.startAttempt(s,"class-a","2026-10-01","child-0");
  const saved=copy(s.monthlyExams.rounds["class-a::2026-10-01"]),newcomer={id:"late-september",classId:"class-a",englishName:"Late September",chineseName:"",active:true,startWeek:"2026-09-14",startUnit:0,joinedAt:"2026-09-20T04:00:00.000Z"};
  s.students.push(newcomer);
  assert.equal(E.previewRound(s,"class-a","2026-09-01").cohort.find(child=>child.studentId===newcomer.id).countsForClass,false);
  assert.equal(E.previewRound(s,"class-a","2026-10-01").cohort.find(child=>child.studentId===newcomer.id).countsForClass,true);
  assert.equal(E.roundStatus(s,"class-a","2026-10-01").eligible,3);
  assert.deepEqual(copy(s.monthlyExams.rounds["class-a::2026-10-01"]),saved);
  assert.equal(E.roundStatus(s,"class-a","2026-09-01").unlocked,true);
});

let passed=0;
for(const {name,run} of tests) {try {run();console.log(`PASS ${name}`);passed++;}catch(error){console.error(`FAIL ${name}`);console.error(error.stack);}}
console.log(`${passed}/${tests.length} exam policy v3 checks passed. Synthetic data only.`);
if(passed!==tests.length)process.exitCode=1;
