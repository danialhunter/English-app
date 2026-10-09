import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
process.env.TZ="Asia/Shanghai";
const require=createRequire(import.meta.url), XLSX=require("../web/vendor/xlsx.full.min.js");
const context=vm.createContext({window:{XLSX},Date,console,TextEncoder,TextDecoder,Uint8Array});
for(const file of ["curriculum.js","monthly-exams.js","model.js","progress-report.js"]) vm.runInContext(fs.readFileSync(new URL(`../web/${file}`,import.meta.url),"utf8"),context);
const api=context.window.ProgressReport, model=context.window.TrackerModel, clone=value=>JSON.parse(JSON.stringify(value));
const stamp=day=>`${day}T02:00:00.000Z`;
const options={scope:"class",classId:"a",startDate:"2026-09-01",endDate:"2026-11-30",generatedAt:stamp("2026-12-01")};
const lesson={levelName:"2–3 years",levelWeek:1,topic:"Greetings",words:["hello","goodbye","friend","teacher","school"],sentence:"Hello, my name is ___."};
function session({unit=0,words=lesson.words,sentence=lesson.sentence,marks=Array(6).fill("known"),date="2026-09-14",finished=true,note="",extra=[]}={}) {
  return {unitIndex:unit,lesson:{...clone(lesson),words:clone(words),sentence,levelWeek:unit+1},itemStates:marks.slice(),practiceFinished:finished,...(date ? {practicedAt:stamp(date)} : {}),notes:note,additionalPractice:extra};
}
function fresh() {
  return {schemaVersion:4,classes:[{id:"a",name:"Synthetic EtonHouse class"},{id:"b",name:"PRIVATE OTHER CLASS"}],students:[
    {id:"ava",classId:"a",englishName:"Synthetic Ava",chineseName:"示例甲",studentCode:"A001",active:true,startWeek:"2026-09-07",startUnit:0},
    {id:"ben",classId:"a",englishName:"PRIVATE PEER BEN",chineseName:"示例乙",studentCode:"PRIVATE-B002",active:true,startWeek:"2026-09-07",startUnit:0},
    {id:"gone",classId:"a",englishName:"PRIVATE DELETED CHILD",chineseName:"",studentCode:"PRIVATE-D004",active:false,startWeek:"2026-09-07",startUnit:0},
    {id:"other",classId:"b",englishName:"PRIVATE OTHER CHILD",chineseName:"",studentCode:"PRIVATE-C003",active:true,startWeek:"2026-09-07",startUnit:0}
  ],records:{},monthlyExams:{rounds:{}}};
}
function addRecord(state,id,week,current,completed=[]) {const key=`${id}::${week}`;state.records[key]={...current,id:key,studentId:id,weekStart:week,completedLessons:completed};return state.records[key];}
function attempt(id,date,known,total=6,{draft=false,note=""}={}) {return {id,startedAt:stamp(date),updatedAt:stamp(date),...(draft ? {} : {completedAt:stamp(date)}),itemStates:Array.from({length:total},(_,i)=>i<known ? "known" : draft ? "unassessed" : "learning"),notes:note};}
function addRound(state,start="2026-09-01",end="2026-09-30",attempts={}) {
  const id=`a::${start}`,items=[...lesson.words.map((text,i)=>({id:`word-${i}`,kind:"vocabulary",text,weekStart:"2026-09-07",unitIndex:0,wordIndex:i})),{id:"sentence",kind:"sentence",text:lesson.sentence,weekStart:"2026-09-07",unitIndex:0,wordIndex:null}];
  return state.monthlyExams.rounds[id]={id,classId:"a",periodStart:start,periodEnd:end,startedAt:stamp(start),policySnapshot:{startPeriod:start,periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true},cohort:state.students.filter(child=>child.classId==="a").map(child=>({studentId:child.id,name:child.englishName,englishName:child.englishName,chineseName:child.chineseName,lessons:[{weekStart:"2026-09-07",unitIndex:0,lesson:clone(lesson)}],items:clone(items)})),attempts};
}
function sample() {
  const state=fresh();
  addRecord(state,"ava","2026-08-31",session({date:"2026-08-31",marks:Array(6).fill("learning")}));
  addRecord(state,"ava","2026-09-07",session({date:"2026-09-07",note:"Comfortable greeting a familiar adult. Two words still need prompting.",marks:["known","known","learning","known","learning","learning"]}));
  addRecord(state,"ava","2026-09-14",session({unit:2,finished:false,date:null,marks:Array(6).fill("unassessed")}),[session({date:"2026-09-14",note:"Greeting and sentence now independent."}),session({unit:1,date:"2026-09-14",words:["red","blue","green","yellow","pink"],sentence:"It is red.",note:"Completed next week's lesson early."})]);
  addRecord(state,"ava","2026-10-05",session({date:"2026-10-05",marks:["known","known","known","known","learning","known"],note:"Revisited greetings after the holiday."}));
  addRecord(state,"ben","2026-09-07",session({date:null,marks:Array(6).fill("learning"),note:"PRIVATE PEER NOTE"}));
  addRecord(state,"gone","2026-09-07",session({note:"PRIVATE DELETED NOTE"}));
  addRecord(state,"other","2026-09-07",session({note:"PRIVATE OTHER NOTE"}));
  addRound(state,"2026-09-01","2026-09-30",{
    ava:{history:[attempt("ava-first","2026-09-25",4,6,{note:"Sentence needed a prompt."}),attempt("ava-retest","2026-09-29",6,6,{note:"Independent on retest."})],draft:null},
    ben:{history:[],draft:attempt("PRIVATE-PEER-DRAFT","2026-09-29",2,6,{draft:true,note:"PRIVATE EXAM NOTE"})}
  });
  addRound(state,"2026-10-01","2026-10-31",{ava:{history:[],draft:attempt("ava-oct-draft","2026-10-28",1,6,{draft:true,note:"Paused; remaining items not assessed."})}});
  return state;
}
function scoringFixture({rule="overall-majority-v1",wordsKnown=10,sentencesKnown=2,passPercent=80,roundPercent=80,full=false,draft=false}={}) {
  const state=fresh(),items=[...Array.from({length:20},(_,index)=>({id:`word-${index}`,kind:"vocabulary",text:`Word ${index+1}`,weekStart:"2026-09-07",unitIndex:0})),...Array.from({length:4},(_,index)=>({id:`sentence-${index}`,kind:"sentence",text:`Sentence ${index+1}`,weekStart:"2026-09-07",unitIndex:0}))];
  const indexes=full ? items.map((_,index)=>index) : [...Array.from({length:11},(_,index)=>index),20,21,22];
  const saved=attempt("versioned-score","2026-09-29",0,items.length,{draft});saved.itemStates.fill("unassessed");let word=0,sentence=0;
  for(const index of indexes)saved.itemStates[index]=items[index].kind==="vocabulary" ? word++<wordsKnown?"known":"learning" : sentence++<sentencesKnown?"known":"learning";
  if(!full)saved.itemIndexes=indexes;if(rule)saved.scoringRule=rule;if(passPercent!==null)saved.passPercent=passPercent;
  const round=addRound(state,"2026-09-01","2026-09-30",{ava:{history:draft?[]:[saved],draft:draft?saved:null}});round.policySnapshot.passPercent=roundPercent;round.cohort.forEach(member=>member.items=clone(items));
  return {state,round,saved};
}
const checks=[];const test=(name,run)=>checks.push({name,run});
test("three-month reports include every child-month and blank gaps",()=>{
  const report=api.build(sample(),options);assert.equal(report.months.length,3);assert.equal(report.individualProgress.length,6);assert.equal(report.students.length,2);
  const missing=report.individualProgress.find(row=>row.studentId==="ava" && row.month==="2026-11");assert.equal(missing.wordsKnown,null);assert.equal(missing.examLatestScore,null);assert.equal(missing.practicesFinished,0);assert.match(missing.assessmentStatus,/Not assessed/);
});
test("inclusive custom ranges use actual local dates and show recorded-week provenance",()=>{
  const state=fresh();addRecord(state,"ava","2026-09-28",session({date:"2026-10-01"}));
  const row=api.build(state,{...options,startDate:"2026-10-01",endDate:"2026-10-01"}).practiceDetail[0];assert.equal(row.activityDate,"2026-10-01");assert.equal(row.recordedWeek,"2026-09-28");assert.equal(row.actualPracticeDate,"2026-10-01");assert.match(row.dateBasis,/Actual/);
  assert.equal(api.build(state,{...options,endDate:"2026-09-30"}).practiceDetail.length,0);
});
test("Shanghai next-day practice uses local date rather than UTC date",()=>{
  const state=fresh(),current=session();current.practicedAt="2026-09-30T17:00:00.000Z";addRecord(state,"ava","2026-09-28",current);
  assert.equal(api.build(state,options).practiceDetail[0].activityDate,"2026-10-01");
});
test("legacy undated records retain explicit fallback labels",()=>{
  const state=fresh();addRecord(state,"ava","2026-09-07",session({date:null}));const report=api.build(state,options),row=report.practiceDetail[0];
  assert.equal(row.activityDate,"2026-09-07");assert.equal(row.actualPracticeDate,null);assert.match(row.dateBasis,/actual date unavailable/);assert.equal(report.individualProgress[0].fallbackDates,1);
});
test("multiple early completions count source sessions once, never calendar credits",()=>{
  const report=api.build(sample(),options),september=report.individualProgress.find(row=>row.studentId==="ava" && row.month==="2026-09");
  assert.equal(september.practicesFinished,3);assert.equal(september.lessonsMastered,2);assert.equal(report.practiceDetail.filter(row=>row.recordedWeek==="2026-09-14").length,2);assert.equal(september.wordsAssessed,10);assert.equal(september.wordsKnown,10);assert.equal(september.sentencesKnown,2);
});
test("repeated words are deduplicated using latest observed knowledge",()=>{
  const state=fresh();addRecord(state,"ava","2026-09-07",session());addRecord(state,"ava","2026-09-14",session({words:[" HELLO ","goodbye","friend","teacher","school"],marks:["learning","known","known","known","known","learning"]}));
  const row=api.build(state,options).individualProgress[0];assert.equal(row.wordsAssessed,5);assert.equal(row.wordsKnown,4);assert.equal(row.wordsNeedPractice,1);assert.equal(row.sentencesKnown,0);
});
test("newly known requires an earlier recorded needs-practice observation",()=>{
  const state=fresh();addRecord(state,"ava","2026-09-07",session());assert.equal(api.build(state,options).individualProgress[0].wordsBecameKnown,0);
  addRecord(state,"ava","2026-08-31",session({date:"2026-08-31",marks:Array(6).fill("learning")}));const row=api.build(state,options).individualProgress[0];assert.equal(row.wordsBecameKnown,5);assert.equal(row.sentencesBecameKnown,1);
});
test("real assessed zero differs from unassessed and sentence-only results",()=>{
  const state=fresh();addRecord(state,"ava","2026-09-07",session({marks:["unassessed","unassessed","unassessed","unassessed","unassessed","learning"]}));
  const report=api.build(state,options);assert.equal(report.individualProgress[0].wordsKnown,null);assert.equal(report.individualProgress[0].sentencesKnown,0);assert.equal(report.classProgress[0].childWordsKnown,null);assert.equal(report.classProgress[0].childSentencesKnown,0);
});
test("untouched auto-opened next lessons are not a saved practice",()=>{
  const state=fresh();addRecord(state,"ava","2026-09-07",session({finished:false,date:null,marks:Array(6).fill("unassessed")}));assert.equal(api.build(state,options).practiceDetail.length,0);
});
test("teacher notes and extra-practice observations remain available without invented core scores",()=>{
  const state=fresh();addRecord(state,"ava","2026-09-07",session({finished:false,date:null,marks:Array(6).fill("unassessed"),note:"Observed listening only",extra:[{title:"Listening",text:"Follow one instruction",state:"known",practiceFinished:true}]}));
  const report=api.build(state,options);assert.equal(report.practiceDetail.length,1);assert.equal(report.practiceDetail[0].extra.length,1);assert.equal(report.individualProgress[0].wordsKnown,null);assert.match(report.individualProgress[0].notes,/listening/);
});
test("individual scope has no peer, deleted child, or other-class data anywhere",()=>{
  const report=api.build(sample(),{...options,scope:"student",studentId:"ava"});assert.equal(report.students.length,1);assert.equal(report.sheets.length,5);assert.equal(report.classProgress.length,0);assert.equal(report.sheets.some(sheet=>sheet.name==="Class progress"),false);assert.equal(JSON.stringify(report).includes("PRIVATE"),false);
});
test("active-roster practice excludes removed children but frozen exams retain them",()=>{
  const report=api.build(sample(),options);assert.equal(report.students.length,2);assert.equal(report.practiceDetail.some(row=>["gone","other"].includes(row.studentId)),false);assert.equal(report.monthlyExams.some(row=>row.studentId==="gone"),true);assert.equal(report.monthlyExams.some(row=>row.studentId==="other"),false);
  const sheet=report.sheets.find(item=>item.name==="Monthly exams");assert.match(sheet.rows.find(row=>row[0]==="PRIVATE DELETED CHILD")[sheet.headers.indexOf("Current roster status")],/Removed/);
});
test("reports neither mutate records nor invent completion-credit records",()=>{
  const state=sample(),before=JSON.stringify(state);api.build(state,options);assert.equal(JSON.stringify(state),before);
});
test("exam summaries retain first and latest scores, retest count, and notes",()=>{
  const report=api.build(sample(),options),row=report.monthlyExams.find(row=>row.studentId==="ava" && row.periodMonth==="2026-09");assert.equal(row.firstScore,4/6);assert.equal(row.latestScore,1);assert.equal(row.completedAttempts,2);assert.equal(row.retests,1);assert.equal(row.status,"Passed");assert.equal(row.latestNotes,"Independent on retest.");
  const attempts=report.examAttempts.filter(row=>row.studentId==="ava" && row.periodStart==="2026-09-01");assert.deepEqual(clone(attempts.map(row=>row.attemptType)),["First attempt","Retest"]);assert.match(attempts[0].items,/Hello, my name is ___\.: Needs practice/);
});
test("sampled exams use the checked-item denominator without crediting the unasked pool",()=>{
  const state=fresh(),checked=attempt("sampled","2026-09-29",0);checked.itemIndexes=[0,1,2,5];checked.itemStates=["known","known","known","unassessed","unassessed","known"];
  addRound(state,"2026-09-01","2026-09-30",{ava:{history:[checked],draft:null}});
  const report=api.build(state,options),summary=report.monthlyExams.find(row=>row.studentId==="ava"),detail=report.examAttempts[0];
  assert.equal(summary.totalItems,4);assert.equal(summary.latestScore,1);assert.equal(summary.status,"Passed");assert.equal(detail.totalItems,4);assert.equal(detail.assessed,4);assert.equal(detail.known,4);assert.equal(detail.itemDetails.filter(item=>item.assessment==="Not sampled").length,2);
});
test("a sampled exam can fail sentence requirements despite a passing overall score",()=>{
  const state=fresh(),checked=attempt("sampled-category","2026-09-29",0,12);checked.itemIndexes=[0,1,2,3,4,5,6,11];checked.itemStates=Array(12).fill("unassessed");checked.itemIndexes.forEach(index=>checked.itemStates[index]=index===11?"learning":"known");
  const round=addRound(state,"2026-09-01","2026-09-30",{ava:{history:[checked],draft:null}});round.cohort.forEach(member=>member.items.push(...clone(member.items)));
  const row=api.build(state,options).monthlyExams.find(row=>row.studentId==="ava");assert.equal(row.latestScore,7/8);assert.equal(row.status,"Needs practice");
});
test("a legacy full exam keeps its original overall pass rule",()=>{
  const state=fresh();addRound(state,"2026-09-01","2026-09-30",{ava:{history:[attempt("legacy","2026-09-29",5)],draft:null}});
  const row=api.build(state,options).monthlyExams.find(row=>row.studentId==="ava");assert.equal(row.totalItems,6);assert.equal(row.latestScore,5/6);assert.equal(row.status,"Passed");
});
test("new-rule exams pass with 10 words and 2 sentences without using the legacy category threshold",()=>{
  const {state}=scoringFixture(),row=api.build(state,options).monthlyExams.find(row=>row.studentId==="ava");assert.equal(row.latestScore,12/14);assert.equal(row.status,"Passed");assert.equal(row.passThreshold,0.8);
});
test("new-rule exams still require both an overall 80 percent and strict category majorities",()=>{
  for(const [wordsKnown,sentencesKnown,passed]of [[11,1,false],[8,3,false],[9,3,true],[10,2,true]]){const {state}=scoringFixture({wordsKnown,sentencesKnown});assert.equal(api.build(state,options).monthlyExams.find(row=>row.studentId==="ava").status,passed?"Passed":"Needs practice",`${wordsKnown} words and ${sentencesKnown} sentences`);}
});
test("completed sampled results retain their saved legacy rule and threshold",()=>{
  const old=scoringFixture({rule:"legacy-sampled-v1"}),oldRow=api.build(old.state,options).monthlyExams.find(row=>row.studentId==="ava");assert.equal(oldRow.status,"Needs practice");assert.equal(oldRow.latestScore,12/14);
  const savedThreshold=scoringFixture({rule:"legacy-sampled-v1",wordsKnown:6,sentencesKnown:2,passPercent:50,roundPercent:80}),row=api.build(savedThreshold.state,options).monthlyExams.find(row=>row.studentId==="ava");assert.equal(row.status,"Passed");assert.equal(row.passThreshold,0.5);
});
test("completed full-checklist results keep overall scoring even when a category is not a strict majority",()=>{
  const {state}=scoringFixture({rule:"legacy-full-v1",full:true,wordsKnown:18,sentencesKnown:2});const row=api.build(state,options).monthlyExams.find(row=>row.studentId==="ava");assert.equal(row.latestScore,20/24);assert.equal(row.status,"Passed");
});
test("a new-rule resumed full checklist uses the new category safeguard",()=>{
  const {state}=scoringFixture({full:true,wordsKnown:18,sentencesKnown:2});assert.equal(api.build(state,options).monthlyExams.find(row=>row.studentId==="ava").status,"Needs practice");
});
test("a legacy failed attempt followed by a new-rule retest does not rewrite the historical result",()=>{
  const {state,round,saved}=scoringFixture({rule:"legacy-sampled-v1"});saved.completedAt=stamp("2026-09-25");const retest={...clone(saved),id:"new-rule-retest",scoringRule:"overall-majority-v1",completedAt:stamp("2026-09-29")};round.attempts.ava.history.push(retest);const before=JSON.stringify(state);
  const historical=api.build(state,{...options,endDate:"2026-09-26"}).monthlyExams.find(row=>row.studentId==="ava"),latest=api.build(state,options).monthlyExams.find(row=>row.studentId==="ava");assert.equal(historical.status,"Needs practice");assert.equal(latest.status,"Passed");assert.equal(latest.retests,1);assert.equal(latest.firstScore,12/14);assert.equal(JSON.stringify(state),before);
});
test("a migrated new-rule draft stays unscored and exposes its own threshold rather than the older round's",()=>{
  const {state}=scoringFixture({draft:true,roundPercent:50}),report=api.build(state,options),row=report.monthlyExams.find(row=>row.studentId==="ava");assert.equal(row.status,"In progress");assert.equal(row.latestScore,null);assert.equal(row.passThreshold,0.8);assert.equal(report.examAttempts[0].score,null);
});
test("draft exam scores stay blank while observed marks remain explicit",()=>{
  const report=api.build(sample(),options),draft=report.examAttempts.find(row=>row.attemptId==="ava-oct-draft");assert.equal(draft.score,null);assert.equal(draft.completed,false);assert.equal(draft.known,1);assert.equal(draft.assessed,1);assert.equal(report.monthlyExams.find(row=>row.studentId==="ava" && row.periodMonth==="2026-10").status,"In progress");
});
test("historical reports exclude future attempts and do not reveal future draft status",()=>{
  const state=sample(),report=api.build(state,{...options,endDate:"2026-09-26"});const row=report.monthlyExams.find(row=>row.studentId==="ava");assert.equal(row.latestScore,4/6);assert.equal(row.retests,0);assert.equal(row.status,"Needs practice");assert.equal(report.examAttempts.length,1);assert.equal(report.monthlyExams.find(row=>row.studentId==="ben").status,"Not assessed");
});
test("corrected exam passes are excluded from current summaries and retained as original audit evidence",()=>{
  const {state,round,saved}=scoringFixture(),correction={id:"correction",attemptId:saved.id,at:stamp("2026-09-30"),reason:"Wrong child selected"};round.attempts.ava.corrections=[correction];const before=JSON.stringify(state);
  const report=api.build(state,options),summary=report.monthlyExams.find(row=>row.studentId==="ava"),row=report.examAttempts.find(row=>row.attemptId===saved.id);
  assert.equal(summary.status,"Corrected — reassessment required");assert.equal(summary.latestScore,null);assert.equal(summary.firstScore,null);assert.equal(summary.originalLatestScore,12/14);
  assert.equal(report.individualProgress[0].examLatestScore,null);assert.match(report.individualProgress[0].examStatus,/reassessment/);assert.equal(report.classProgress[0].examAverage,null);assert.equal(report.classProgress[0].examChildrenCompleted,0);
  assert.equal(row.status,"Corrected");assert.equal(row.score,null);assert.equal(row.originalScore,12/14);assert.equal(row.correctionDate,"2026-09-30");assert.equal(row.correctionReason,"Wrong child selected");assert.match(row.attemptType,/corrected/);assert.equal(row.known,12);
  const original=api.build(state,{...options,endDate:"2026-09-29"}).monthlyExams.find(item=>item.studentId==="ava");assert.equal(original.status,"Passed");assert.equal(original.latestScore,12/14);assert.equal(original.correctionReason,"");assert.equal(JSON.stringify(state),before);
  const book=XLSX.read(api.exportDetailedXlsx(state,options).bytes,{type:"array",cellDates:true}),attempts=book.Sheets["Exam attempts"];
  assert.equal(attempts.O7,undefined);assert.equal(attempts.S7.v,"Corrected");assert.equal(attempts.T7.v,12/14);assert.equal(attempts.U7.t,"d");assert.equal(attempts.V7.v,correction.reason);
});
test("fresh reassessment restores a valid score without erasing the corrected attempt",()=>{
  const {state,round,saved}=scoringFixture();round.attempts.ava.corrections=[{id:"correction",attemptId:saved.id,at:stamp("2026-09-30"),reason:"Recording mistake"}];
  round.attempts.ava.history.push({...clone(saved),id:"reassessment",startedAt:stamp("2026-10-01"),updatedAt:stamp("2026-10-01"),completedAt:stamp("2026-10-01")});
  const report=api.build(state,options),summary=report.monthlyExams.find(row=>row.studentId==="ava");assert.equal(summary.status,"Passed");assert.equal(summary.latestScore,12/14);assert.equal(summary.firstScore,null);assert.equal(summary.completedAttempts,2);assert.equal(summary.correctionDate,null);
  assert.equal(report.examAttempts.filter(row=>row.status==="Corrected").length,1);assert.equal(report.classProgress[0].examAverage,12/14);
});
test("a corrected later four-week exam is not hidden by an earlier valid pass",()=>{
  const state=fresh();addRound(state,"2026-09-01","2026-09-28",{ava:{history:[attempt("first","2026-09-25",6)],draft:null}});
  addRound(state,"2026-09-29","2026-10-26",{ava:{history:[attempt("second","2026-09-29",6)],draft:null,corrections:[{id:"correction",attemptId:"second",at:stamp("2026-09-30"),reason:"Mistaken result"}]}});
  const report=api.build(state,options);assert.match(report.individualProgress[0].examStatus,/reassessment/);assert.equal(report.individualProgress[0].examLatestScore,null);assert.equal(report.classProgress[0].examAverage,null);
});
test("assessment-period membership and actual attempt-date range are separate",()=>{
  const report=api.build(sample(),{...options,startDate:"2026-09-28",endDate:"2026-09-30"});const first=report.examAttempts.find(row=>row.attemptId==="ava-first");assert.equal(first.attemptDate,"2026-09-25");assert.equal(first.withinReportRange,false);assert.equal(first.periodStart,"2026-09-01");assert.equal(report.examAttempts.find(row=>row.attemptId==="ava-retest").withinReportRange,true);
});
test("multiple four-week periods never hide the latest completed result behind a draft",()=>{
  const state=fresh();addRound(state,"2026-09-01","2026-09-28",{ava:{history:[attempt("first","2026-09-25",6)],draft:null}});addRound(state,"2026-09-29","2026-10-26",{ava:{history:[],draft:attempt("nextdraft","2026-09-30",1,6,{draft:true})}});
  const row=api.build(state,options).individualProgress[0];assert.equal(row.examLatestScore,1);assert.equal(row.examPeriod,"2026-09-01 to 2026-09-28");assert.equal(row.examPeriods.split("\n").length,2);
});
test("class exam averages use completed results and disclose coverage",()=>{
  const row=api.build(sample(),options).classProgress[0];assert.equal(row.examAverage,1);assert.equal(row.examChildrenCompleted,1);assert.equal(row.examCoverage,1/3);assert.equal(row.children,2);assert.equal(row.examCohortSize,3);
});
test("four-week exams overlapping a month remain visible when their start month is outside the report",()=>{
  const state=fresh();addRound(state,"2026-09-28","2026-10-25",{ava:{history:[attempt("fourweeks","2026-10-20",6)],draft:null}});
  const report=api.build(state,{...options,startDate:"2026-10-01",endDate:"2026-10-31"});assert.equal(report.individualProgress[0].examLatestScore,1);assert.equal(report.individualProgress[0].examPeriod,"2026-09-28 to 2026-10-25");assert.equal(report.classProgress[0].examAverage,1);assert.equal(report.classProgress[0].examCohortSize,3);
});
test("later weekly edits are transparently flagged rather than presented as immutable historical marks",()=>{
  const state=fresh(),record=addRecord(state,"ava","2026-09-07",session());record.updatedAt=stamp("2026-12-01");const report=api.build(state,options);assert.equal(report.practiceDetail[0].editedAfterReportEnd,true);assert.equal(report.practiceDetail[0].lastSavedEdit,"2026-12-01");assert.match(report.meta.method,/not a full edit timeline/);assert.match(report.sheets.find(sheet=>sheet.name==="Practice detail").rows[0].at(-1),/latest saved marks/);
});
test("invalid scopes, dates, class membership and empty classes are rejected",()=>{
  const state=fresh();for(const overrides of [{scope:"all"},{startDate:"2026-02-30"},{startDate:"2027-01-01"},{scope:"student",studentId:"other"},{classId:"missing"}]) assert.throws(()=>api.build(state,{...options,...overrides}));state.students.forEach(child=>child.active=false);assert.throws(()=>api.build(state,options),/no active/);
});
test("two-month custom boundary includes only relevant months",()=>{
  const report=api.build(sample(),{...options,startDate:"2026-09-14",endDate:"2026-10-13"});assert.equal(report.months.length,2);assert.equal(report.months[0].startDate,"2026-09-14");assert.equal(report.months[1].endDate,"2026-10-13");
});
test("the genuine XLSX round-trips typed dates, numbers, blank gaps and percentages",()=>{
  const result=api.exportDetailedXlsx(sample(),options);assert.equal(result.bytes[0],0x50);assert.equal(result.bytes[1],0x4b);assert.match(result.fileName,/\.xlsx$/);assert.match(result.mimeType,/spreadsheetml/);assert.ok(result.bytes.length<20*1024*1024);
  const book=XLSX.read(result.bytes,{type:"array",cellDates:true,cellStyles:true}),sheet=book.Sheets["Individual progress"];
  assert.equal(book.SheetNames.length,6);assert.equal(sheet.D7.t,"d");assert.equal(sheet.E7.v,3);assert.equal(sheet.P7.v,1);assert.equal(sheet.P7.z,"0.0%");assert.equal(sheet.H9,undefined);assert.equal(sheet["!autofilter"].ref,"A6:T12");assert.match(book.Props.Comments,/not a standardized growth/);
});
test("Excel presentation keeps titles, brand headers, wrapping and frozen panes",()=>{
  const result=api.exportDetailedXlsx(sample(),options),zip=XLSX.CFB.read(result.bytes,{type:"array"}),decode=name=>new TextDecoder().decode(XLSX.CFB.find(zip,`/${name}`).content),styles=decode("xl/styles.xml"),sheet=decode("xl/worksheets/sheet1.xml");
  assert.match(styles,/FFC40018/);assert.match(styles,/name val="Arial"/);assert.match(styles,/wrapText="1"/);assert.match(sheet,/ySplit="6"/);assert.match(sheet,/showGridLines="0"/);assert.match(sheet,/mergeCell ref="A2:H2"/);assert.ok(sheet.indexOf("<mergeCells")>sheet.indexOf("<autoFilter"));
});
test("individual XLSX remains private and formula-like names are literal strings",()=>{
  const state=sample();state.students[0].englishName='=HYPERLINK("https://example.invalid","Synthetic child")';const result=api.exportDetailedXlsx(state,{...options,scope:"student",studentId:"ava"}),book=XLSX.read(result.bytes,{type:"array"});
  assert.equal(book.SheetNames.length,5);assert.equal(book.Sheets["Class progress"],undefined);assert.equal(book.Sheets["Individual progress"].A7.t,"s");assert.equal(book.Sheets["Individual progress"].A7.f,undefined);assert.equal(JSON.stringify(book).includes("PRIVATE"),false);
});
test("exam item marks have one compact detail row per frozen item and attempt",()=>{
  const report=api.build(sample(),{...options,scope:"student",studentId:"ava"}),detail=report.sheets.find(sheet=>sheet.name==="Exam item detail");assert.equal(detail.rows.length,18);assert.equal(detail.rows[0][12],"hello");assert.equal(detail.rows[5][13],"Needs practice");assert.equal(detail.rows[11][13],"Knows it");assert.equal(report.sheets.find(sheet=>sheet.name==="Exam attempts").headers.includes("Item assessments"),false);
});
let passed=0;for(const {name,run} of checks) {try {await run();passed++;console.log(`PASS ${name}`);} catch(error) {console.error(`FAIL ${name}`);throw error;}}
console.log(`${passed} progress-report checks passed.`);
if(process.argv.includes("--artifact-qa")) {
  const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../test-output/progress-report-qa");fs.mkdirSync(output,{recursive:true});
  const result=api.exportDetailedXlsx(sample(),options),workbookPath=path.join(output,"EtonHouse Synthetic Progress.xlsx");fs.writeFileSync(workbookPath,result.bytes);
  const {FileBlob,SpreadsheetFile}=await import("@oai/artifact-tool"),book=await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
  book.recalculate();
  assert.deepEqual(book.worksheets.getItem("Individual progress").getRange("E7:H7").values,[[3,2,10,10]]);
  assert.equal(book.worksheets.getItem("Monthly exams").getRange("I7").values[0][0],1);
  for(const sheet of result.report.sheets) {
    const allValues=book.worksheets.getItem(sheet.name).getRange(`A1:${XLSX.utils.encode_col(sheet.headers.length-1)}${sheet.rows.length+6}`).values;
    assert.equal(allValues.flat().some(value=>typeof value==="string" && /^#(REF!|VALUE!|DIV\/0!|NAME\?|N\/A|NUM!|SPILL!|CALC!|NULL!)$/.test(value)),false,`${sheet.name} has no spreadsheet errors`);
    const range=`A1:H${Math.min(sheet.rows.length+6,13)}`;
    const image=await book.render({sheetName:sheet.name,range,scale:1.5,format:"png"});fs.writeFileSync(path.join(output,`${sheet.name.replaceAll(" ","-")}.png`),new Uint8Array(await image.arrayBuffer()));
    const detailRange=`I6:${XLSX.utils.encode_col(sheet.headers.length-1)}${Math.min(sheet.rows.length+6,13)}`;
    const detailImage=await book.render({sheetName:sheet.name,range:detailRange,scale:1,format:"png"});fs.writeFileSync(path.join(output,`${sheet.name.replaceAll(" ","-")}-detail.png`),new Uint8Array(await detailImage.arrayBuffer()));
  }
  console.log(JSON.stringify(await book.inspect({kind:"sheet",include:"id,name"}),null,2));
  console.log(`Synthetic workbook and all-sheet previews: ${output}`);
}
