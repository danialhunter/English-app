const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");

async function createMonthlyFixture({draft = false,childCount = 5,practiceHistory = false,passed = 4,selectedWeek = "2026-10-05",className = "Synthetic Exam Class"} = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "etonhouse-monthly-test-"));
  const scope = vm.createContext({window:{}, Date, console});
  const source = path.resolve(__dirname,"../../seahorse_app/web");
  for (const file of ["curriculum.js","monthly-exams.js","model.js"]) vm.runInContext(await fs.readFile(path.join(source,file),"utf8"),scope);
  const model = scope.window.TrackerModel, exams = scope.window.MonthlyExams;
  const state = model.migrate({schemaVersion:3,
    classes:[{id:"exam-class",name:className,startWeek:"2026-09-07",startUnit:0}],
    students:Array.from({length:childCount},(_,index)=>({id:`exam-${index}`,englishName:`Synthetic Exam Child ${index+1}`,chineseName:"",classId:"exam-class",group:className,rosterNumber:index+1,startWeek:"2026-09-07",startUnit:0,active:true})),
    records:{},selectedClassId:"exam-class",selectedStudentId:"exam-0",selectedWeekStart:selectedWeek
  });
  exams.configure(state,"exam-class",{startPeriod:"2026-09-01",periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true});
  for(const child of state.students) for(const week of ["2026-09-07","2026-09-14","2026-09-21","2026-09-28"]) {
    const record=model.getRecord(state,child,week,true);
    record.itemStates.fill("learning");record.practiceFinished=true;
    record.practicedAt="2026-09-14T04:00:00.000Z";
  }
  if(practiceHistory) for(const child of state.students) {
    const record=model.getRecord(state,child,"2026-09-07",true);
    record.itemStates=["known","known","learning","unassessed","known","known"];
    record.practiceFinished=true;
    record.practicedAt="2026-09-07T04:00:00.000Z";
    record.notes=`Internal synthetic teacher note for ${child.id}`;
  }
  for (let index=0;index<passed;index++) {
    const child = `exam-${index}`, round = "exam-class::2026-09-01";
    const draft = exams.startAttempt(state,"exam-class","2026-09-01",child);
    (draft.itemIndexes || draft.itemStates.map((_,item)=>item)).forEach(item=>exams.setMark(state,round,child,item,"known"));
    exams.saveNote(state,round,child,`Synthetic passed note ${index+1}`);
    exams.finishAttempt(state,round,child);
  }
  if (draft) {
    state.selectedStudentId = "exam-4";
    const pending=exams.startAttempt(state,"exam-class","2026-09-01","exam-4");
    exams.setMark(state,"exam-class::2026-09-01","exam-4",pending.itemIndexes?.[0] ?? 0,"known");
    exams.saveNote(state,"exam-class::2026-09-01","exam-4","Synthetic unfinished exam note survives restart.");
  }
  const original = JSON.stringify(state);
  await fs.writeFile(path.join(directory,"data.json"),original,{flag:"wx",mode:0o600});
  return {directory,original,state:JSON.parse(original)};
}

module.exports = {createMonthlyFixture};
if (require.main === module) createMonthlyFixture({draft:process.argv.includes("--draft")}).then(({directory})=>console.log(directory)).catch(error=>{console.error(error);process.exitCode=1;});
