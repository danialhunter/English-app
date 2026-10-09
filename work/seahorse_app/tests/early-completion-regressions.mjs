import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({window:{},Date,console});
for (const file of ["curriculum.js","model.js"]) vm.runInContext(fs.readFileSync(new URL(`../web/${file}`,import.meta.url),"utf8"),context);
const model = context.window.TrackerModel;
const state = model.migrate({schemaVersion:3,classes:[{id:"sample-class",name:"Sample class",startWeek:"2026-09-14"}],students:[{id:"sample-child",classId:"sample-class",englishName:"Sample child",chineseName:"",startUnit:0,startWeek:"2026-09-14"}],records:{},selectedWeekStart:"2026-09-14",selectedStudentId:"sample-child",selectedClassId:"sample-class"});
const child = state.students[0];
for (let index=0;index<2;index++) {
  const record=model.getRecord(state,child,"2026-09-14",true);
  record.itemStates.fill("known"); record.practiceFinished=true; record.practicedAt="2026-09-14T02:00:00.000Z";
  assert.equal(model.complete(state,child,"2026-09-14"),true);
}
const before=JSON.stringify(state.records);
const upcoming=model.getRecord(state,child,"2026-09-21");
const status=model.weekStatus(upcoming,state,child,"2026-09-21");
assert.equal(status.practiced,true,"September 21 must show completed when its lesson was finished early on September 14");
assert.equal(status.mastered,true,"All five words and the sentence already known must remain visible in that week's status");
assert.ok(status.completed>=1,"The scheduled week needs a completed-lesson indicator");
assert.equal(JSON.stringify(state.records),before,"Viewing completion credit must not rewrite actual practice records");
console.log("PASS early completion is visible in its scheduled future week without rewriting practice history.");
