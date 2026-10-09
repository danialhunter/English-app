import fs from 'node:fs';
import vm from 'node:vm';

export const clock='2026-09-20T04:00:00.000Z';
export const storageKey='seahorse-english-tracker-v1';
export const clone=value=>JSON.parse(JSON.stringify(value));
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return Date.parse(clock);}}
export function modules(examSource) {
  const context=vm.createContext({window:{},Date:FixedDate,console});
  for(const file of ['curriculum.js','monthly-exams.js','model.js'])vm.runInContext(file==='monthly-exams.js'&&examSource ? examSource : fs.readFileSync(new URL(`../web/${file}`,import.meta.url),'utf8'),context);
  return {M:context.window.TrackerModel,E:context.window.MonthlyExams};
}
export function savedHistory(count=25) {
  const {M,E}=modules();
  const state=M.migrate({schemaVersion:3,classes:[{id:'perf',name:'Synthetic history class',startWeek:'2026-09-07'}],students:Array.from({length:count},(_,i)=>({id:`child-${i}`,classId:'perf',englishName:`Synthetic child ${i+1}`,chineseName:'',active:true,rosterNumber:i+1,startWeek:'2026-09-07',startUnit:0})),records:{},monthlyExams:{rounds:{}},selectedClassId:'perf',selectedStudentId:'child-0',selectedWeekStart:'2026-09-14'});
  E.configure(state,'perf',{startPeriod:'2026-09-01',periodKind:'calendar',passPercent:80,classPassPercent:80,requireIndividualPass:true});
  for(const child of state.students)for(const [index,week] of ['2026-09-07','2026-09-14','2026-09-21','2026-09-28','2026-10-05','2026-10-12','2026-10-19'].entries()) {
    const record=M.getRecord(state,child,week,true);
    Object.assign(record,{notes:`Synthetic practice ${index}`,itemStates:['known','learning','known','known','learning','known'],practiceFinished:index===0,practicedAt:index===0?clock:null});
    if(index===0)record.completedLessons=[{...clone(record),itemStates:Array(6).fill('known')}];
  }
  for(const start of ['2026-09-01','2026-10-01']) {
    const preview=E.previewRound(state,'perf',start),{frozen,period,label,...round}=preview;
    round.startedAt=clock;round.legacyPreparation=true;
    for(const member of round.cohort) {
      // Older backups omitted the explicit-repeat field on frozen assignments.
      member.lessons.forEach(lesson=>delete lesson.requiresOwnWeek);
      const sample=E.previewAssessment(preview,member.studentId).itemIndexes;
      const draft={id:`${start}-${member.studentId}-draft`,startedAt:clock,updatedAt:clock,notes:'Synthetic saved answers',scoringRule:'overall-majority-v1',passPercent:80,itemIndexes:sample,itemStates:member.items.map((_,i)=>i===sample[0]?'known':'unassessed')};
      const history=Array.from({length:2},(_,i)=>({...clone(draft),id:`${start}-${member.studentId}-history-${i}`,completedAt:clock,itemStates:member.items.map((_,index)=>sample.includes(index)?'learning':'unassessed')}));
      round.attempts[member.studentId]={draft,history};
    }
    state.monthlyExams.rounds[round.id]=round;
  }
  return clone(M.migrate(state));
}
