import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const previousZip=fileURLToPath(new URL("../../../outputs/release-2.3.2/EtonHouse-English-Tracker-Mac-2.3.2.app.zip",import.meta.url));
const previous=vm.createContext({window:{},Date,console}),current=vm.createContext({window:{},Date,console});
for(const file of ["curriculum.js","monthly-exams.js","model.js"]){
 vm.runInContext(execFileSync("/usr/bin/unzip",["-p",previousZip,`EtonHouse English Tracker.app/Contents/Resources/web/${file}`],{encoding:"utf8",maxBuffer:20_000_000}),previous);
 vm.runInContext(fs.readFileSync(new URL(`../web/${file}`,import.meta.url),"utf8"),current);
}
const Old=previous.window,New=current.window,copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){const state=Old.TrackerModel.migrate({schemaVersion:3,classes:[{id:"upgrade",name:"Synthetic upgrade class",startWeek:"2026-09-07"}],students:[{id:"child",classId:"upgrade",englishName:"Synthetic child",chineseName:"",startWeek:"2026-09-07",startUnit:0,active:true}],records:{},selectedClassId:"upgrade",selectedStudentId:"child",selectedWeekStart:"2026-09-07"});Old.MonthlyExams.configure(state,"upgrade",{startPeriod:"2026-09-01",periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true});return state;}
function assertOriginalFields(old,value){for(const [key,item] of Object.entries(old))assert.deepEqual(copy(value[key]),copy(item),`Original ${key} unchanged`);}
const tests=[],test=(name,run)=>tests.push({name,run});
test("real released app's 13/14 failure and subsequent draft retain their original scoring",()=>{
 const s=fixture(),draft=Old.MonthlyExams.startAttempt(s,"upgrade","2026-09-01","child"),id="upgrade::2026-09-01",round=s.monthlyExams.rounds[id];
 const sentence=draft.itemIndexes.find(i=>round.cohort[0].items[i].kind==="sentence");
 for(const i of draft.itemIndexes)Old.MonthlyExams.setMark(s,id,"child",i,i===sentence?"learning":"known");
 assert.equal(Old.MonthlyExams.finishAttempt(s,id,"child").passed,false);
 const retry=Old.MonthlyExams.startAttempt(s,"upgrade","2026-09-01","child");
 Old.MonthlyExams.setMark(s,id,"child",retry.itemIndexes[0],"known");Old.MonthlyExams.saveNote(s,id,"child","Original unfinished note");
 const before=JSON.stringify(s),original=copy(s.monthlyExams.rounds[id].attempts.child),upgraded=New.TrackerModel.migrate(s);
 assert.equal(JSON.stringify(s),before);assert.equal(upgraded.schemaVersion,6);assert.equal(New.MonthlyExams.studentResult(upgraded,"upgrade","2026-09-01","child").passed,false);
 const updated=upgraded.monthlyExams.rounds[id].attempts.child;
 assertOriginalFields(original.history[0],updated.history[0]);assertOriginalFields(original.draft,updated.draft);
 assert.equal(updated.history[0].scoringRule,"legacy-sampled-v1");assert.equal(updated.draft.scoringRule,"legacy-sampled-v1");
 assert.equal(New.MonthlyExams.readiness(upgraded,"upgrade","2026-09-01","child").ready,false);
 assert.throws(()=>New.MonthlyExams.finishAttempt(upgraded,id,"child"),/practice/);
 assert.deepEqual(copy(New.TrackerModel.migrate(copy(upgraded))),copy(upgraded));
});
test("legacy overall-only pass remains passed even without a sentence majority",()=>{
 const s=fixture(),id="upgrade::2026-09-01";Old.MonthlyExams.startAttempt(s,"upgrade","2026-09-01","child");
 const round=s.monthlyExams.rounds[id],draft=round.attempts.child.draft;delete draft.itemIndexes;
 round.cohort[0].items.forEach((item,i)=>Old.MonthlyExams.setMark(s,id,"child",i,item.kind==="vocabulary"?"known":"learning"));
 assert.equal(Old.MonthlyExams.finishAttempt(s,id,"child").passed,true);
 const original=copy(round.attempts.child.history[0]),upgraded=New.TrackerModel.migrate(s);
 assert.equal(New.MonthlyExams.studentResult(upgraded,"upgrade","2026-09-01","child").passed,true);
 assertOriginalFields(original,upgraded.monthlyExams.rounds[id].attempts.child.history[0]);
 assert.ok(upgraded.monthlyExams.rounds[id].unlock);
});
test("old configurable thresholds stay attached to finished results while new settings become80",()=>{
 const s=fixture(),id="upgrade::2026-09-01";Old.MonthlyExams.configure(s,"upgrade",{...s.classes[0].monthlyPolicy,passPercent:100,requireIndividualPass:false});
 const draft=Old.MonthlyExams.startAttempt(s,"upgrade","2026-09-01","child");
 for(const i of draft.itemIndexes)Old.MonthlyExams.setMark(s,id,"child",i,i===draft.itemIndexes[0]?"learning":"known");
 Old.MonthlyExams.finishAttempt(s,id,"child");const upgraded=New.TrackerModel.migrate(s);
 assert.equal(upgraded.classes[0].monthlyPolicy.passPercent,80);assert.equal(upgraded.classes[0].monthlyPolicy.requireIndividualPass,true);
 assert.equal(upgraded.monthlyExams.rounds[id].attempts.child.history[0].passPercent,100);
 assert.equal(New.MonthlyExams.studentResult(upgraded,"upgrade","2026-09-01","child").passed,false);
});
test("the actual previous app rejects upgraded records without changing them",()=>{
 const upgraded=New.TrackerModel.migrate(fixture()),before=JSON.stringify(upgraded);
 assert.throws(()=>Old.TrackerModel.migrate(upgraded),/newer version/);assert.equal(JSON.stringify(upgraded),before);
});
let failed=0;for(const t of tests){try{t.run();console.log(`PASS ${t.name}`);}catch(error){failed++;console.error(`FAIL ${t.name}: ${error.stack}`);}}
console.log(`${tests.length-failed}/${tests.length} actual-release upgrade checks passed. Synthetic data only.`);if(failed)process.exitCode=1;
