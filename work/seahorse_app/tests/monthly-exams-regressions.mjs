import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

process.env.TZ="Asia/Shanghai";
const context=vm.createContext({window:{},Date,console});
for(const file of ["curriculum.js","monthly-exams.js","model.js"]) vm.runInContext(fs.readFileSync(new URL(`../web/${file}`,import.meta.url),"utf8"),context);
const M=context.window.TrackerModel, E=context.window.MonthlyExams;
const clone=value=>JSON.parse(JSON.stringify(value));
const seed=(count=25)=>({schemaVersion:3,classes:[{id:"class-a",name:"Synthetic A",startWeek:"2026-08-31"},{id:"class-b",name:"Synthetic B",startWeek:"2026-08-31"}],students:Array.from({length:count},(_,i)=>({id:`child-${i}`,classId:"class-a",englishName:`Synthetic ${i}`,chineseName:"",active:true,startWeek:"2026-08-31",startUnit:0})),records:{},selectedClassId:"class-a",selectedStudentId:"child-0",selectedWeekStart:"2027-03-01"});
const finishMonthlyPractice=(s,child,start="2026-09-01")=>{
  const assigned=E.previewRound(s,child.classId,start).cohort.find(member=>member.studentId===child.id)?.lessons || [];
  for(const lesson of assigned){
    const r=M.getRecord(s,child,lesson.weekStart,true);
    if(r.practiceFinished && r.unitIndex===lesson.unitIndex)continue;
    r.unitIndex=lesson.unitIndex;r.lesson=clone(lesson.lesson);r.itemStates.fill("learning");r.practiceFinished=true;r.practicedAt="2026-09-14T04:00:00.000Z";
  }
  assert.equal(E.readiness(s,child.classId,start,child.id).ready,true,"Fixture must provide actual Finished records, not waive readiness");
};
const state=(count=25)=>{
  const s=M.migrate(seed(count));
  for(const group of s.classes) E.configure(s,group.id,{startPeriod:"2026-09-01",periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true});
  for(const child of s.students)finishMonthlyPractice(s,child);
  return s;
};
const attempt=(s,id,known,start="2026-09-01")=>{
  const draft=E.startAttempt(s,"class-a",start,id), round=`class-a::${start}`;
  const selected=draft.itemIndexes || draft.itemStates.map((_,i)=>i);
  selected.forEach((itemIndex,i)=>E.setMark(s,round,id,itemIndex,i<known?"known":"learning"));
  return E.finishAttempt(s,round,id);
};
const fillPractice=(s,child=s.students[0],week="2026-09-28")=>{
  const r=M.getRecord(s,child,week,true);r.itemStates.fill("known");r.practiceFinished=true;r.practicedAt="2026-09-14T04:00:00.000Z";r.notes="Original practice";return r;
};
const tests=[]; const test=(name,run)=>tests.push({name,run});
test("new exams assess a spread majority of words and sentences, not the full checklist",()=>{
  const s=state(1),before=JSON.stringify(s.records),draft=E.startAttempt(s,"class-a","2026-09-01","child-0");
  const selected=draft.itemIndexes || draft.itemStates.map((_,index)=>index);
  assert.equal(selected.length,14);
  const preview=E.previewAssessment(E.previewRound(s,"class-a","2026-09-01"),"child-0");
  assert.equal(preview.vocabularyTotal,11);assert.equal(preview.sentenceTotal,3);assert.equal(preview.poolTotal,24);
  assert.equal(new Set(preview.items.filter(item=>item.kind==="vocabulary").map(item=>item.weekStart)).size,4);
  assert.equal(JSON.stringify(s.records),before);
});
test("the next exam period becomes available after an individual pass",()=>{
  const s=state(1);assert.deepEqual(clone(E.availablePeriods(s,"class-a").map(period=>period.start)),["2026-09-01"]);
  attempt(s,"child-0",24);
  assert.deepEqual(clone(E.availablePeriods(s,"class-a").map(period=>period.start)),["2026-09-01","2026-10-01"]);
  assert.deepEqual(clone(E.availablePeriods(s,"class-b")),[]);
});
test("legacy migration enables actual current month without rewriting records",()=>{
  const input=seed(1); fillPractice(input); const before=clone(input.records), migrated=M.migrate(input);
  const today=new Date(), expected=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-01`;
  assert.equal(migrated.classes[0].monthlyPolicy.startPeriod,expected);
  assert.equal(migrated.schemaVersion,6);assert.equal(migrated.appVersion,"2.4.2");
  assert.deepEqual(clone(migrated.records),before);assert.deepEqual(clone(input.records),before);
  assert.deepEqual(clone(migrated.monthlyExams),{rounds:{}});
});
test("calendar and four-week periods handle boundaries and leap years",()=>{
  const s=state(1), group=s.classes[0];
  assert.equal(E.periodFor(group,"2028-02-10").end,"2028-02-29");
  assert.equal(E.periodFor(group,"2026-08-31").start,"2026-08-01");
  E.configure(s,group.id,{startPeriod:"2026-08-31",periodKind:"fourWeeks",passPercent:80,classPassPercent:80,requireIndividualPass:true});
  assert.equal(E.periodFor(group,"2026-09-27").end,"2026-09-27");
  assert.equal(E.periodFor(group,"2026-09-28").start,"2026-09-28");
  assert.equal(E.periods(group,"2026-08-31","2026-10-26").length,3);
});
test("previews are pure and contain every scheduled word and sentence",()=>{
  const s=state(2), before=JSON.stringify(s);const round=E.previewRound(s,"class-a","2026-09-01");
  E.roundStatus(s,"class-a","2026-09-01");E.studentResult(s,"class-a","2026-09-01","child-0");
  assert.equal(round.frozen,false);assert.equal(round.cohort.length,2);
  assert.deepEqual(clone(round.cohort[0].lessons.map(l=>l.weekStart)),["2026-09-07","2026-09-14","2026-09-21","2026-09-28"]);
  assert.equal(round.cohort[0].items.length,24);assert.equal(round.cohort[0].items.filter(i=>i.kind==="sentence").length,4);
  assert.equal(JSON.stringify(s),before);
});
test("fully mastered practice does not prefill or complete any exam",()=>{
  const s=state(1);for(const record of Object.values(s.records))record.itemStates.fill("known");const draft=E.startAttempt(s,"class-a","2026-09-01","child-0");
  assert.ok(draft.itemStates.every(mark=>mark==="unassessed"));
  const result=E.studentResult(s,"class-a","2026-09-01","child-0");
  assert.equal(result.completed,false);assert.equal(result.known,null);assert.equal(result.scorePercent,null);
});
test("draft autosaves, resumes and cannot finish with an unassessed item",()=>{
  const s=state(1), first=E.startAttempt(s,"class-a","2026-09-01","child-0"), id="class-a::2026-09-01";
  const itemIndex=first.itemIndexes[0];
  E.setMark(s,id,"child-0",itemIndex,"known");E.saveNote(s,id,"child-0","Synthetic exam note");
  assert.throws(()=>E.finishAttempt(s,id,"child-0"),/every vocabulary/);
  const restored=M.migrate(clone(s)), resumed=E.startAttempt(restored,"class-a","2026-09-01","child-0");
  assert.equal(resumed.id,first.id);assert.equal(resumed.itemStates[itemIndex],"known");assert.equal(resumed.notes,"Synthetic exam note");
  assert.equal(E.roundStatus(restored,"class-a","2026-09-01").completed,0);
});
test("individual scores use exact threshold, not rounded display percentage",()=>{
  const s=state(2), failed=attempt(s,"child-0",11), passed=attempt(s,"child-1",12);
  assert.equal(failed.requiredKnown,12);assert.equal(failed.passed,false);assert.equal(passed.passed,true);
  assert.equal(E.resultForAttempt({completedAt:new Date().toISOString(),itemStates:Array(79).fill("known").concat("learning")},80,99).passed,false);
});
test("class coverage remains informational while individual passes advance",()=>{
  const s=state();for(let i=0;i<20;i++) attempt(s,`child-${i}`,24);
  const summary=E.roundStatus(s,"class-a","2026-09-01");
  assert.equal(summary.requiredPasses,20);assert.equal(summary.classPassed,true);assert.equal(summary.allCompleted,false);assert.equal(summary.unlocked,false);
  assert.equal(E.access(s,s.students[0],"2026-10-05",5).allowed,true);
  assert.equal(E.access(s,s.students[24],"2026-10-05",5).allowed,false);
});
test("19 of 25 passing leaves the class benchmark unmet, but passing children advance",()=>{
  const s=state();for(let i=0;i<25;i++) attempt(s,`child-${i}`,i<19?24:0);
  const summary=E.roundStatus(s,"class-a","2026-09-01");
  assert.equal(summary.allCompleted,true);assert.equal(summary.passed,19);assert.equal(summary.unlocked,false);
  assert.equal(E.access(s,s.students[0],"2026-10-05",5).allowed,true);
  assert.equal(E.access(s,s.students[24],"2026-10-05",5).allowed,false);
});
test("20 of 25 completed passes unlock class but failed individuals stay in review",()=>{
  const s=state();for(let i=0;i<25;i++) attempt(s,`child-${i}`,i<20?24:0);
  assert.equal(E.roundStatus(s,"class-a","2026-09-01").unlocked,true);
  assert.equal(E.access(s,s.students[0],"2026-10-05",5).allowed,true);
  assert.equal(E.access(s,s.students[24],"2026-10-05",5).allowed,false);
});
test("ceil class threshold is used for non-25 rosters",()=>{
  const s=state(6);for(let i=0;i<6;i++) attempt(s,`child-${i}`,i<4?24:0);
  const summary=E.roundStatus(s,"class-a","2026-09-01");assert.equal(summary.requiredPasses,5);assert.equal(summary.unlocked,false);
});
test("retaking starts blank and preserves the first immutable completed attempt",()=>{
  const s=state(1);attempt(s,"child-0",0);const id="class-a::2026-09-01", first=JSON.stringify(s.monthlyExams.rounds[id].attempts["child-0"].history[0]);
  const draft=E.startAttempt(s,"class-a","2026-09-01","child-0");assert.ok(draft.itemStates.every(mark=>mark==="unassessed"));
  attempt(s,"child-0",24);assert.equal(JSON.stringify(s.monthlyExams.rounds[id].attempts["child-0"].history[0]),first);
  assert.equal(E.studentResult(s,"class-a","2026-09-01","child-0").attemptCount,2);
  assert.throws(()=>E.startAttempt(s,"class-a","2026-09-01","child-0"),/already passed/);
});
test("withdrawal changes outstanding denominator while preserving the child's completed exam",()=>{
  const s=state(5);for(let i=0;i<5;i++) attempt(s,`child-${i}`,i<3?24:0);
  const history=JSON.stringify(s.monthlyExams.rounds["class-a::2026-09-01"].attempts["child-4"]);
  M.deleteStudent(s,"child-4");const summary=E.roundStatus(s,"class-a","2026-09-01");
  assert.equal(summary.eligible,4);assert.equal(summary.requiredPasses,4);assert.equal(summary.unlocked,false);
  assert.equal(summary.children.find(child=>child.studentId==="child-4").withdrawn,true);
  attempt(s,"child-3",24);assert.equal(E.roundStatus(s,"class-a","2026-09-01").unlocked,true);
  assert.equal(JSON.stringify(s.monthlyExams.rounds["class-a::2026-09-01"].attempts["child-4"]),history);
});
test("late additions have catch-up exams but join the class calculation next period",()=>{
  const s=state(1);attempt(s,"child-0",24);
  s.students.push({id:"late",classId:"class-a",englishName:"Late child",chineseName:"",startWeek:"2026-09-21",joinedAt:"2026-09-21T04:00:00Z",startUnit:0,active:true});
  assert.equal(E.roundStatus(s,"class-a","2026-09-01").eligible,1);
  assert.equal(E.studentResult(s,"class-a","2026-09-01","late").eligible,true);
  assert.equal(E.studentResult(s,"class-a","2026-09-01","late").countsForClass,false);
  assert.throws(()=>E.startAttempt(s,"class-a","2026-09-01","late"),/Finish .*practice/);
  assert.equal(E.previewRound(s,"class-a","2026-10-01").cohort.length,2);
  assert.equal(E.previewRound(s,"class-a","2026-10-01").cohort.find(child=>child.studentId==="late").countsForClass,true);
  assert.equal(E.access(s,s.students[1],"2026-10-05",2).allowed,false);
  finishMonthlyPractice(s,s.students[1]);attempt(s,"late",24);
  assert.equal(E.access(s,s.students[1],"2026-10-05",2).allowed,true);
});
test("configuration is locked by the first explicit start but not preview",()=>{
  const s=state(1);E.previewRound(s,"class-a","2026-09-01");
  E.configure(s,"class-a",{...s.classes[0].monthlyPolicy,passPercent:90});
  assert.equal(s.classes[0].monthlyPolicy.passPercent,80,"Current policy keeps the agreed pass threshold fixed");
  E.configure(s,"class-a",{...s.classes[0].monthlyPolicy,periodKind:"fourWeeks",startPeriod:"2026-09-07"});
  E.configure(s,"class-a",{...s.classes[0].monthlyPolicy,periodKind:"calendar",startPeriod:"2026-09-01"});
  E.startAttempt(s,"class-a","2026-09-01","child-0");
  assert.throws(()=>E.configure(s,"class-a",{...s.classes[0].monthlyPolicy,periodKind:"fourWeeks",startPeriod:"2026-09-07"}),/locked/);
  assert.throws(()=>E.configure(s,"class-a",{...s.classes[0].monthlyPolicy,startPeriod:"2026-10-01"}),/locked/);
});
test("future-week, same-week acceleration and manual lesson jumps share the gate",()=>{
  const s=state(1), child=s.students[0];
  assert.equal(E.access(s,child,"2026-09-28",4).allowed,true);
  assert.equal(E.access(s,child,"2026-10-05",5).allowed,false);
  assert.equal(E.access(s,child,"2026-09-14",5).allowed,false);
  assert.equal(E.access(s,child,"2026-09-14",50).allowed,false);
  assert.throws(()=>E.startAttempt(s,"class-a","2026-10-01",child.id),/needs to pass/);
});
test("legacy advanced lesson snapshots do not make the month's exam require itself",()=>{
  const s=state(1), child=s.students[0],record=M.getRecord(s,child,"2026-09-07",true);
  record.unitIndex=50;record.plannedUnitIndex=50;record.lesson=M.snapshot(50);record.manuallyAssigned=true;record.notes="Legacy manually selected lesson";
  const before=JSON.stringify(s.records),draft=E.startAttempt(s,"class-a","2026-09-01",child.id);
  assert.equal(draft.itemStates.length,24);assert.equal(JSON.stringify(s.records),before);
  assert.equal(E.previewRound(s,"class-a","2026-09-01").cohort[0].lessons[0].unitIndex,50);
  assert.equal(E.access(s,child,"2026-09-07",50).allowed,false,"New advanced practice is still gated independently");
});
test("completion holds the finished current-month lesson instead of opening next-month content",()=>{
  const s=state(1), child=s.students[0], original=clone(fillPractice(s));
  assert.equal(M.complete(s,child,"2026-09-28"),true);
  const r=M.getRecord(s,child,"2026-09-28");assert.equal(r.unitIndex,4);assert.equal(r.notes,original.notes);assert.equal(r.awaitingMonthlyExam,true);
  assert.equal(E.access(s,child,"2026-09-28",5).allowed,false);
  const before=JSON.stringify(s.records);M.complete(s,child,"2026-09-28");assert.equal(JSON.stringify(s.records),before);
});
test("unlocking permits the previously locked next practice without history changes",()=>{
  const s=state(1), child=s.students[0];fillPractice(s);M.complete(s,child,"2026-09-28");
  const before=JSON.stringify(s.records);attempt(s,child.id,24);
  assert.equal(E.access(s,child,"2026-09-28",5).allowed,true);assert.equal(JSON.stringify(s.records),before);
  const held=clone(M.getRecord(s,child,"2026-09-28"));assert.equal(M.complete(s,child,"2026-09-28"),true);
  const resumed=M.getRecord(s,child,"2026-09-28");assert.equal(resumed.unitIndex,5);assert.equal(resumed.completedLessons.length,1);assert.equal(resumed.completedLessons[0].practicedAt,held.practicedAt);assert.equal(resumed.completedLessons[0].completedAt,held.completedAt);
});
test("empty class cannot pass vacuously and another class is unaffected",()=>{
  const s=state(1);attempt(s,"child-0",24);
  assert.equal(E.roundStatus(s,"class-b","2026-09-01").unlocked,false);
  assert.equal(E.roundStatus(s,"class-b","2026-09-01").eligible,0);
});
test("periods before the first enrollment do not permanently block a new class",()=>{
  const s=state(1);s.students[0].startWeek="2026-10-05";
  assert.equal(E.roundStatus(s,"class-a","2026-09-01").unlocked,false);
  assert.equal(E.access(s,s.students[0],"2026-10-05",0).allowed,true);
  assert.equal(E.access(s,s.students[0],"2026-11-02",4).allowed,false);
});
test("schema4 evidence survives exactly while completed and unfinished rules are pinned",()=>{
  const s=state(2);fillPractice(s);attempt(s,"child-0",0);E.startAttempt(s,"class-a","2026-09-01","child-0");
  delete s.monthlyExams.rounds["class-a::2026-09-01"].attempts["child-0"].draft.itemIndexes;
  E.saveNote(s,"class-a::2026-09-01","child-0","Retest draft note");attempt(s,"child-1",24);
  const round=s.monthlyExams.rounds["class-a::2026-09-01"];
  for(const [childId,bundle] of Object.entries(round.attempts))for(const completed of bundle.history){delete completed.itemIndexes;delete completed.scoringRule;delete completed.passPercent;completed.itemStates.fill(childId==="child-1"?"known":"learning");}
  delete round.attempts["child-0"].draft.scoringRule;delete round.attempts["child-0"].draft.passPercent;
  s.schemaVersion=4;s.appVersion="2.3.0";
  const source=JSON.stringify(s),restored=M.migrate(clone(s));
  assert.equal(restored.schemaVersion,6);assert.equal(restored.appVersion,"2.4.2");
  const upgradedRound=restored.monthlyExams.rounds["class-a::2026-09-01"];
  for(const [childId,bundle] of Object.entries(round.attempts)){
    const after=upgradedRound.attempts[childId];
    bundle.history.forEach((old,index)=>{const completed=clone(after.history[index]);assert.equal(completed.scoringRule,"legacy-full-v1");assert.equal(completed.passPercent,80);delete completed.scoringRule;delete completed.passPercent;assert.deepEqual(completed,clone(old));});
    if(bundle.draft){const draft=clone(after.draft);assert.equal(draft.scoringRule,"legacy-full-v1");assert.equal(draft.passPercent,80);delete draft.scoringRule;delete draft.passPercent;assert.deepEqual(draft,clone(bundle.draft));}
  }
  assert.equal(E.studentResult(restored,"class-a","2026-09-01","child-0").passed,false);assert.equal(E.studentResult(restored,"class-a","2026-09-01","child-1").passed,true);
  assert.deepEqual(clone(restored.records),clone(s.records));assert.equal(JSON.stringify(s),source);
  assert.deepEqual(clone(M.migrate(clone(restored))),clone(restored));
});
test("malformed backups reject atomically instead of trusting forged pass flags",()=>{
  const s=state(2);attempt(s,"child-0",0);const good=clone(s), id="class-a::2026-09-01";
  for(const [index,mutate] of [
    bad=>delete bad.monthlyExams,
    bad=>bad.monthlyExams.rounds[id].cohort.push(clone(bad.monthlyExams.rounds[id].cohort[0])),
    bad=>bad.monthlyExams.rounds[id].cohort[0].studentId="missing-child",
    bad=>bad.monthlyExams.rounds[id].cohort[0].items[0].text="Altered item",
    bad=>{const saved=bad.monthlyExams.rounds[id].attempts["child-0"].history[0];saved.itemStates[saved.itemIndexes[0]]="unassessed";},
    bad=>bad.monthlyExams.rounds[id].attempts["child-0"].history[0].completedAt="invalid",
    bad=>bad.monthlyExams.rounds[id].attempts["child-0"].history[0].passPercent=1,
    bad=>bad.monthlyExams.rounds[id].attempts["missing-child"]={draft:null,history:[]},
    bad=>bad.monthlyExams.rounds[id].attempts["child-0"].history[0].itemStates.pop()
  ].entries()) { const bad=clone(good);mutate(bad);const unchanged=JSON.stringify(bad);assert.throws(()=>M.migrate(bad),`Malformed backup mutation ${index} must reject`);assert.equal(JSON.stringify(bad),unchanged); }
  const legacyMismatch=clone(good);legacyMismatch.monthlyExams.rounds[id].attempts["child-0"].history[0].scoringRule="legacy-sampled-v1";legacyMismatch.monthlyExams.rounds[id].policySnapshot.passPercent=1;
  const legacyBefore=JSON.stringify(legacyMismatch);assert.throws(()=>M.migrate(legacyMismatch));assert.equal(JSON.stringify(legacyMismatch),legacyBefore,"Legacy outcome thresholds cannot be silently altered either");
  good.monthlyExams.rounds[id].attempts["child-0"].history[0].passed=true;
  assert.equal(E.studentResult(M.migrate(good),"class-a","2026-09-01","child-0").passed,false);
});
test("sampled finish assesses selected items only and preserves the skipped pool as unassessed",()=>{
  const s=state(1),draft=E.startAttempt(s,"class-a","2026-09-01","child-0"),id="class-a::2026-09-01";
  const skipped=draft.itemStates.map((_,i)=>i).find(i=>!draft.itemIndexes.includes(i));
  assert.throws(()=>E.setMark(s,id,"child-0",skipped,"known"),/not selected/);
  draft.itemIndexes.forEach(index=>E.setMark(s,id,"child-0",index,"known"));
  const result=E.finishAttempt(s,id,"child-0");
  assert.equal(result.passed,true);assert.equal(result.total,14);assert.equal(result.poolTotal,24);assert.equal(result.known,14);
  assert.equal(result.latestAttempt.itemStates.filter(mark=>mark==="unassessed").length,10);
  assert.deepEqual(clone(M.migrate(clone(s)).monthlyExams),clone(s.monthlyExams));
});
test("strong vocabulary cannot hide a failed sentence assessment",()=>{
  const s=state(1),draft=E.startAttempt(s,"class-a","2026-09-01","child-0"),id="class-a::2026-09-01";
  const preview=E.previewAssessment(E.previewRound(s,"class-a","2026-09-01"),"child-0"),sentences=preview.items.filter(item=>item.kind==="sentence");
  const missed=sentences.slice(0,2).map(item=>item.itemIndex);
  draft.itemIndexes.forEach(index=>E.setMark(s,id,"child-0",index,missed.includes(index)?"learning":"known"));
  const result=E.finishAttempt(s,id,"child-0");
  assert.equal(result.known,12);assert.ok(result.scorePercent>80);assert.equal(result.vocabulary.passed,true);assert.equal(result.sentence.known,1);assert.equal(result.sentence.requiredKnown,2);assert.equal(result.passed,false);
  assert.equal(E.access(s,s.students[0],"2026-10-05",5).allowed,false);
  assert.equal(E.resultForAttempt(result.latestAttempt,24,80).passed,false,"Three-argument report readers preserve the applicable scoring rule");
});
test("category-specific exact minima pass while untested items are never counted",()=>{
  const s=state(1),draft=E.startAttempt(s,"class-a","2026-09-01","child-0"),id="class-a::2026-09-01",preview=E.previewAssessment(E.previewRound(s,"class-a","2026-09-01"),"child-0");
  const needsPractice=preview.items.filter(item=>item.kind==="vocabulary").slice(0,2).map(item=>item.itemIndex);
  draft.itemIndexes.forEach(index=>E.setMark(s,id,"child-0",index,needsPractice.includes(index)?"learning":"known"));
  const result=E.finishAttempt(s,id,"child-0");
  assert.equal(result.vocabulary.known,9);assert.equal(result.vocabulary.total,11);assert.equal(result.sentence.known,3);assert.equal(result.requiredKnown,12);assert.equal(result.passed,true);
});
test("new retests use the same stable sample and never replace completed results",()=>{
  const s=state(1),id="class-a::2026-09-01",draft=E.startAttempt(s,"class-a","2026-09-01","child-0");
  draft.itemIndexes.forEach(index=>E.setMark(s,id,"child-0",index,"learning"));E.finishAttempt(s,id,"child-0");
  const before=JSON.stringify(s.monthlyExams.rounds[id].attempts["child-0"].history),restored=M.migrate(clone(s)),retry=E.startAttempt(restored,"class-a","2026-09-01","child-0");
  assert.deepEqual(clone(retry.itemIndexes),clone(draft.itemIndexes));assert.ok(retry.itemStates.every(mark=>mark==="unassessed"));assert.equal(JSON.stringify(restored.monthlyExams.rounds[id].attempts["child-0"].history),before);
});
test("pre-update full-length draft keeps its answers, dates and original scoring on resume",()=>{
  const s=state(1),id="class-a::2026-09-01";E.startAttempt(s,"class-a","2026-09-01","child-0");
  s.schemaVersion=4;s.appVersion="2.3.0";
  const legacy=s.monthlyExams.rounds[id].attempts["child-0"].draft;delete legacy.itemIndexes;delete legacy.scoringRule;delete legacy.passPercent;legacy.itemStates[0]="known";legacy.notes="Existing full exam draft";
  const before=clone(legacy),source=JSON.stringify(s),restored=M.migrate(clone(s)),resumed=E.startAttempt(restored,"class-a","2026-09-01","child-0");
  assert.equal(resumed.itemIndexes,undefined);assert.equal(resumed.scoringRule,"legacy-full-v1");assert.equal(resumed.passPercent,80);
  const evidence=clone(resumed);delete evidence.scoringRule;delete evidence.passPercent;assert.deepEqual(evidence,before);assert.equal(JSON.stringify(s),source);
  const assessment=E.previewAssessment(E.previewRound(restored,"class-a","2026-09-01"),"child-0");assert.equal(assessment.total,24);assert.equal(assessment.mode,"legacy-full");
  assert.throws(()=>E.finishAttempt(restored,id,"child-0"),/every vocabulary/);
});
test("malformed sampled indices or marks cannot survive backup validation",()=>{
  const s=state(1),id="class-a::2026-09-01";E.startAttempt(s,"class-a","2026-09-01","child-0");
  for(const mutate of [
    draft=>draft.itemIndexes.push(draft.itemIndexes[0]),
    draft=>draft.itemIndexes.pop(),
    draft=>draft.itemIndexes[0]=999,
    draft=>draft.itemStates[draft.itemStates.map((_,i)=>i).find(i=>!draft.itemIndexes.includes(i))]="known"
  ]){const bad=clone(s);mutate(bad.monthlyExams.rounds[id].attempts["child-0"].draft);const before=JSON.stringify(bad);assert.throws(()=>M.migrate(bad));assert.equal(JSON.stringify(bad),before);}
});
test("available periods skip pre-enrollment empty months without inventing future choices",()=>{
  const s=state(1);s.students[0].startWeek="2026-12-07";const before=JSON.stringify(s);
  assert.deepEqual(clone(E.availablePeriods(s,"class-a").map(period=>period.start)),["2026-12-01"]);assert.equal(JSON.stringify(s),before);
});
test("deleted children keep frozen exam history available without growing the month list",()=>{
  const s=state(1);attempt(s,"child-0",24);M.deleteStudent(s,"child-0");
  const choices=E.availablePeriods(s,"class-a");assert.equal(choices.length,1);assert.equal(choices[0].start,"2026-09-01");assert.equal(choices[0].frozen,true);assert.equal(choices[0].historyOnly,false);
});
test("withdrawn frozen cohorts retain completed history and later drafts without new class requirements",()=>{
  const s=state(1);attempt(s,"child-0",24);finishMonthlyPractice(s,s.students[0],"2026-10-01");E.startAttempt(s,"class-a","2026-10-01","child-0");
  const history=JSON.stringify(s.monthlyExams.rounds["class-a::2026-09-01"].attempts),drafts=JSON.stringify(s.monthlyExams.rounds["class-a::2026-10-01"].attempts);
  M.deleteStudent(s,"child-0");
  const before=JSON.stringify(s),choices=E.availablePeriods(s,"class-a");
  assert.deepEqual(clone(choices.map(period=>period.start)),["2026-09-01","2026-10-01"]);
  assert.equal(JSON.stringify(s),before);
  assert.equal(E.roundStatus(s,"class-a","2026-10-01").eligible,0);
  assert.equal(E.roundStatus(s,"class-a","2026-10-01").children[0].withdrawn,true);
  assert.equal(JSON.stringify(s.monthlyExams.rounds["class-a::2026-09-01"].attempts),history);
  assert.equal(JSON.stringify(s.monthlyExams.rounds["class-a::2026-10-01"].attempts),drafts);
  const resumed=E.startAttempt(s,"class-a","2026-10-01","child-0");
  assert.equal(resumed.id,JSON.parse(drafts)["child-0"].draft.id,"Withdrawal does not erase a saved draft");
  resumed.itemIndexes.forEach(index=>E.setMark(s,"class-a::2026-10-01","child-0",index,"known"));
  assert.equal(E.finishAttempt(s,"class-a::2026-10-01","child-0").passed,true,"The retained current draft can still be assessed explicitly");
  assert.equal(E.roundStatus(s,"class-a","2026-10-01").eligible,0,"A saved result does not put the withdrawn child back into class counts");
});
// Release QA can point this at the unmodified scripts extracted from an older
// installer. The check executes the real old reader; it does not simulate one.
if(process.env.ETON_LEGACY_WEB_DIR)test("the actual old reader rejects schema6 drafts without changing its source or the backup",()=>{
  const paths=["curriculum.js","monthly-exams.js","model.js"].map(file=>`${process.env.ETON_LEGACY_WEB_DIR}/${file}`);
  const source=paths.map(path=>fs.readFileSync(path,"utf8")),oldContext=vm.createContext({window:{},Date,console});
  source.forEach(script=>vm.runInContext(script,oldContext));
  const s=state(1);E.startAttempt(s,"class-a","2026-09-01","child-0");
  const before=JSON.stringify(s);assert.equal(s.schemaVersion,6);
  assert.throws(()=>oldContext.window.TrackerModel.migrate(s),/newer version/);
  assert.equal(JSON.stringify(s),before);assert.deepEqual(paths.map(path=>fs.readFileSync(path,"utf8")),source);
});
let passed=0;
for(const {name,run} of tests) {try {run();console.log(`PASS ${name}`);passed++;}catch(error){console.error(`FAIL ${name}`);console.error(error.stack);}}
console.log(`${passed}/${tests.length} monthly exam checks passed. Synthetic data only.`);
if(passed!==tests.length) process.exitCode=1;
