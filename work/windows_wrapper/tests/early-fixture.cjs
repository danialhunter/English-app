const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");

async function createEarlyFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),"etonhouse-early-test-"));
  const scope = {window:{}};
  const curriculumFile = path.resolve(__dirname,"../../seahorse_app/web/curriculum.js");
  vm.runInNewContext(await fs.readFile(curriculumFile,"utf8"),scope);
  const historical = {
    id:"history-test-child::2026-09-07",studentId:"history-test-child",weekStart:"2026-09-07",unitIndex:0,
    lesson:{...scope.window.CURRICULUM[0],curriculumId:scope.window.CURRICULUM[0].id},
    practiceFinished:true,itemStates:["known","learning","known","unassessed","known","learning"],
    notes:"Unrelated history must remain intact",nextAction:"advance"
  };
  const state = {
    schemaVersion:3,appVersion:"2.1.1",
    classes:[{id:"early-test-class",name:"Synthetic Early Completion",startWeek:"2026-09-14",startUnit:0}],
    students:[
      {id:"early-test-child",englishName:"Synthetic Early Child",chineseName:"",classId:"early-test-class",rosterNumber:1,startWeek:"2026-09-14",startUnit:0},
      {id:"history-test-child",englishName:"Synthetic History Child",chineseName:"",classId:"early-test-class",rosterNumber:2,startWeek:"2026-09-07",startUnit:0}
    ],
    records:{[historical.id]:historical},selectedClassId:"early-test-class",selectedStudentId:"early-test-child",selectedWeekStart:"2026-09-14"
  };
  const original = JSON.stringify(state);
  await fs.writeFile(path.join(directory,"data.json"),original,{flag:"wx",mode:0o600});
  return {directory,original,state:JSON.parse(original),historical:JSON.parse(JSON.stringify(historical))};
}

module.exports = {createEarlyFixture};
if (require.main === module) createEarlyFixture().then(({directory})=>console.log(directory)).catch(error=>{console.error(error);process.exitCode=1;});
