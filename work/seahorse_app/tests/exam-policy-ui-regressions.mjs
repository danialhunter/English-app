import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const playwright=require(process.env.SEATRACKER_PLAYWRIGHT || "playwright");
const root=fileURLToPath(new URL("../web/",import.meta.url)),output=fileURLToPath(new URL("../test-output/exam-policy-v3/",import.meta.url));
await fs.mkdir(output,{recursive:true});
const clock="2026-09-20T04:00:00.000Z";
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return Date.parse(clock);}}
const scope=vm.createContext({window:{},Date:FixedDate,console});
for(const file of ["curriculum.js","monthly-exams.js","model.js"])vm.runInContext(await fs.readFile(path.join(root,file),"utf8"),scope);
const M=scope.window.TrackerModel,E=scope.window.MonthlyExams,clone=value=>JSON.parse(JSON.stringify(value));
function seed(ready=false){
 const s=M.migrate({schemaVersion:3,classes:[{id:"class",name:"Synthetic policy class",startWeek:"2026-09-07",startUnit:0}],students:Array.from({length:5},(_,i)=>({id:`child-${i}`,classId:"class",englishName:`Synthetic ${i+1}`,chineseName:"",startWeek:"2026-09-07",startUnit:0,active:true})),records:{},selectedClassId:"class",selectedStudentId:"child-0",selectedWeekStart:"2026-09-07"});
 E.configure(s,"class",{startPeriod:"2026-09-01",periodKind:"calendar",passPercent:80,classPassPercent:80,requireIndividualPass:true});
 if(ready)for(const child of s.students)for(const week of ["2026-09-07","2026-09-14","2026-09-21","2026-09-28"]){const r=M.getRecord(s,child,week,true);r.itemStates.fill("learning");r.practiceFinished=true;r.practicedAt=clock;}
 return s;
}
function finish(s,id){const draft=E.startAttempt(s,"class","2026-09-01",id);for(const index of draft.itemIndexes)E.setMark(s,"class::2026-09-01",id,index,"known");E.finishAttempt(s,"class::2026-09-01",id);}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,"http://localhost"),target=path.resolve(root,`.${url.pathname==="/"?"/index.html":decodeURIComponent(url.pathname)}`);if(!target.startsWith(root)){res.writeHead(403).end();return;}res.setHeader("Content-Type",{".js":"text/javascript",".html":"text/html",".css":"text/css",".png":"image/png"}[path.extname(target)]||"application/octet-stream");res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await playwright.chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const tests=[],test=(name,run,fixture=()=>seed())=>tests.push({name,run,fixture});
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem("seahorse-english-tracker-v1")));
const open=page=>page.locator("#monthlyExamsButton").click();
async function confirm(page){if(await page.locator("#examConfirmDialog").isVisible())await page.locator("#examConfirmAction").click();}
test("missing Finished practice disables exam start and offers a direct practice route",async page=>{
 await open(page);assert.equal(await page.locator("#startExamButton").isDisabled(),true);
 assert.match(await page.locator("#examReadinessStatus").innerText(),/0\/4/);
 await page.locator("#examPracticeButton").click();assert.equal(await page.locator("#monthlyExamsDialog").isVisible(),false);
 assert.equal((await saved(page)).selectedWeekStart,"2026-09-07");
 for(let i=0;i<6;i++)await page.locator(`[data-item-index="${i}"][data-state="learning"]`).click();
 await page.locator("#practiceButton").click();await open(page);
 assert.match(await page.locator("#examReadinessStatus").innerText(),/1\/4/);assert.equal(await page.locator("#startExamButton").isDisabled(),true);
});
test("new 13 of 14 result passes with two independently known sentences",async page=>{
 await open(page);assert.equal(await page.locator("#startExamButton").isDisabled(),false);
 await page.locator("#startExamButton").click();await confirm(page);
 assert.match(await page.locator("#examMarkProgress").innerText(),/12\/14.*6\/11.*2\/3/);
 const s=await saved(page),round=s.monthlyExams.rounds["class::2026-09-01"],draft=round.attempts["child-0"].draft;
 const missing=draft.itemIndexes.find(index=>round.cohort[0].items[index].kind==="sentence");
 for(const index of draft.itemIndexes)await page.locator(`[data-exam-item="${index}"][data-exam-mark="${index===missing?"learning":"known"}"]`).click();
 assert.equal(await page.locator("#finishExamButton").isDisabled(),false);await page.locator("#finishExamButton").click();await confirm(page);
 assert.match(await page.locator("#examChildResult").innerText(),/Passed.*13\/14/);
},()=>seed(true));
test("confirmed absence releases qualified classmates and returning child never relocks them",async page=>{
 await open(page);await page.locator('[data-exam-child="child-4"]').click();
 assert.doesNotMatch(await page.locator("#examClassStatus").innerText(),/Class requirement met/);
 await page.locator("#examAbsenceButton").click();await confirm(page);
 assert.match(await page.locator("#examChildList").innerText(),/Absent/);
 assert.match(await page.locator("#examClassStatus").innerText(),/Class requirement met/);
 assert.equal(await page.locator("#startExamButton").isDisabled(),true);
 const released=(await saved(page)).monthlyExams.rounds["class::2026-09-01"].unlock;assert.ok(released);
 await page.reload({waitUntil:"networkidle"});await open(page);await page.locator('[data-exam-child="child-4"]').click();
 await page.locator("#examAbsenceButton").click();await confirm(page);
 assert.match(await page.locator("#examClassStatus").innerText(),/Class requirement met/);
 assert.deepEqual((await saved(page)).monthlyExams.rounds["class::2026-09-01"].unlock,released);
},()=>{const s=seed(true);for(let i=0;i<4;i++)finish(s,`child-${i}`);return s;});
test("legacy unfinished marks survive migration and cannot finish without missing practice",async page=>{
 await open(page);assert.match(await page.locator("#examMarkProgress").innerText(),/12\/14/);
 assert.equal(await page.locator("#finishExamButton").isDisabled(),true);
 assert.match(await page.locator("#examReadinessStatus").innerText(),/0\/4/);
 assert.equal(await page.locator('[data-exam-mark="known"][aria-pressed="true"]').count(),14);
 await page.locator("#examPracticeButton").click();
 const s=await saved(page),draft=s.monthlyExams.rounds["class::2026-09-01"].attempts["child-0"].draft;
 assert.equal(s.schemaVersion,6);assert.equal(draft.scoringRule,"overall-majority-v1");assert.equal(draft.notes,"Keep this draft note");assert.equal(draft.itemStates.filter(mark=>mark==="known").length,14);
},()=>{const s=seed(true),d=E.startAttempt(s,"class","2026-09-01","child-0");for(const i of d.itemIndexes)E.setMark(s,"class::2026-09-01","child-0",i,"known");E.saveNote(s,"class::2026-09-01","child-0","Keep this draft note");s.records={};s.schemaVersion=5;const draft=s.monthlyExams.rounds["class::2026-09-01"].attempts["child-0"].draft;delete draft.scoringRule;delete draft.passPercent;return s;});
test("new exam status and selected feedback fit small windows",async page=>{
 await open(page);await page.locator("#startExamButton").click();await confirm(page);
 await page.locator('[data-exam-mark="known"]').first().click();await page.locator('[data-exam-mark="learning"]').nth(1).click();
 for(const [width,height] of [[900,700],[840,620]]){await page.setViewportSize({width,height});assert.ok(await page.locator("#monthlyExamsDialog").evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:path.join(output,`policy-${width}x${height}.png`)});}
},()=>seed(true));
let failed=0;try{for(const t of tests.filter(t=>!process.env.ETON_POLICY_UI_FILTER||t.name.includes(process.env.ETON_POLICY_UI_FILTER))){const context=await browser.newContext({viewport:{width:1100,height:800}}),page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));try{const fixture=clone(t.fixture());await page.addInitScript(({fixture,clock})=>{const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return new NativeDate(clock).getTime();}};if(!localStorage.getItem("seahorse-english-tracker-v1"))localStorage.setItem("seahorse-english-tracker-v1",JSON.stringify(fixture));},{fixture,clock});await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:"networkidle"});await t.run(page);assert.deepEqual(errors,[]);console.log(`PASS ${t.name}`);}catch(error){failed++;console.error(`FAIL ${t.name}: ${error.stack}`);}finally{await context.close();}}}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
if(failed)process.exitCode=1;
