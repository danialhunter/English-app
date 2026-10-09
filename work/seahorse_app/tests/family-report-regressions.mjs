import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
process.env.TZ="Asia/Shanghai";
const require=createRequire(import.meta.url),XLSX=require("../web/vendor/xlsx.full.min.js"),context=vm.createContext({window:{XLSX},Date,console,TextEncoder,TextDecoder,Uint8Array});
for(const file of ["monthly-exams.js","learning-review.js","family-report-template.js","progress-report.js"])vm.runInContext(fs.readFileSync(new URL(`../web/${file}`,import.meta.url),"utf8"),context);
const api=context.window.ProgressReport,copy=value=>JSON.parse(JSON.stringify(value)),date=day=>`${day}T02:00:00.000Z`;
const opts={scope:"student",classId:"a",studentId:"ava",startDate:"2026-09-01",endDate:"2026-11-30",generatedAt:date("2026-12-01")};
const fresh=()=>({classes:[{id:"a",name:"Seahorse class"},{id:"b",name:"PRIVATE OTHER CLASS"}],students:[{id:"ava",classId:"a",englishName:"Ava",chineseName:"艾娃",studentCode:"PRIVATE-AVA-ID",active:true},{id:"ben",classId:"a",englishName:"PRIVATE PEER BEN",chineseName:"PRIVATE-PEER-CHINESE",studentCode:"PRIVATE-BEN-ID",active:true},{id:"other",classId:"b",englishName:"PRIVATE OTHER CHILD",chineseName:"",active:true}],records:{},monthlyExams:{rounds:{}}});
function add(state,week,words=["hello","friend","teacher","school","goodbye"],sentence="Hello, my name is ___.",{id="ava",marks=Array(6).fill("known"),actual=week,edited=null,finished=true,completed=[]}={}) {
  const key=`${id}::${week}`;return state.records[key]={studentId:id,weekStart:week,unitIndex:Object.keys(state.records).length,lesson:{words,sentence,levelName:"2–3 years",levelWeek:1,topic:"PRIVATE TEACHER TOPIC"},itemStates:marks,practiceFinished:finished,practicedAt:actual ? date(actual) : null,...(edited ? {updatedAt:date(edited)} : {}),notes:"PRIVATE INTERNAL TEACHER NOTE",additionalPractice:[],completedLessons:completed};
}
function exam(state,day,{marks=Array(6).fill("known"),words=["apple","banana","orange","grape","pear"],sentence="I like apples.",draft=false}={}) {
  const items=[...words.map(text=>({kind:"vocabulary",text})),{kind:"sentence",text:sentence}],attempt={id:"PRIVATE-ATTEMPT-ID",startedAt:date(day),updatedAt:date(day),...(draft?{}:{completedAt:date(day)}),itemStates:marks,notes:"PRIVATE EXAM NOTE"};
  state.monthlyExams.rounds[day]={id:day,classId:"a",periodStart:day.slice(0,7)+"-01",periodEnd:day.slice(0,7)+"-30",policySnapshot:{passPercent:80},cohort:[{studentId:"ava",name:"Ava",items}],attempts:{ava:{history:draft?[]:[attempt],draft:draft?attempt:null}}};
}
function sample() {
  const state=fresh();
  add(state,"2026-09-07",undefined,undefined,{marks:["known","known","learning","known","learning","known"]});
  add(state,"2026-09-14");
  add(state,"2026-09-28",["red","blue","green","yellow","pink"],"It is red.");
  add(state,"2026-10-05",["mummy","daddy","sister","brother","baby"],"This is my family.");
  exam(state,"2026-10-15");
  add(state,"2026-10-26",["head","eyes","nose","mouth","ears"],"These are my eyes.");
  add(state,"2026-11-02",["cat","dog","bird","fish","rabbit"],"I see a cat.");
  add(state,"2026-11-09",["run","jump","walk","sit","stand"],"I can jump.");
  add(state,"2026-11-23",["big","small","happy","sad","sleepy"],"I feel happy.");
  add(state,"2026-11-30",undefined,undefined,{marks:["learning","known","known","known","known","known"]});
  add(state,"2026-09-07",["PRIVATE PEER WORD","one","two","three","four"],"PRIVATE PEER SENTENCE",{id:"ben"});
  add(state,"2026-09-07",["PRIVATE OTHER WORD","one","two","three","four"],"PRIVATE OTHER SENTENCE",{id:"other"});
  return state;
}
const unpack=bytes=>XLSX.CFB.read(bytes,{type:"array"}),xml=(zip,name)=>new TextDecoder().decode(XLSX.CFB.find(zip,`/${name}`).content),tests=[];const test=(name,run)=>tests.push({name,run});
test("the default family export has one visible personal sheet, no teacher table tabs",()=>{
  const result=api.exportXlsx(sample(),opts),book=XLSX.read(result.bytes,{type:"array"});assert.equal(book.SheetNames.length,1);assert.equal(book.SheetNames[0],"Ava");assert.equal(book.Workbook.Sheets[0].Hidden,0);assert.equal(JSON.stringify(book).includes("PRIVATE"),false);assert.match(book.Sheets.Ava.B7.v,/艾娃/);assert.match(JSON.stringify(book),/What I’ve learned/);
});
test("class export is one independent child report per active child",()=>{
  const state=sample(),result=api.exportXlsx(state,{...opts,scope:"class"}),book=XLSX.read(result.bytes,{type:"array"});assert.equal(book.SheetNames.length,2);assert.equal(result.report.children.length,2);assert.equal(book.SheetNames.includes("PRIVATE OTHER CHILD"),false);assert.equal(JSON.stringify(book.Sheets.Ava).includes("PRIVATE PEER"),false);
});
test("cumulative demonstration counts deduplicate repeated words and exam/practice evidence",()=>{
  const state=fresh();add(state,"2026-09-07");add(state,"2026-09-14");exam(state,"2026-09-20",{words:["HELLO","friend","teacher","school","goodbye"],sentence:"Hello, my name is ___."});const child=api.buildFamily(state,opts).children[0];assert.equal(child.demonstratedWords,5);assert.equal(child.demonstratedSentences,1);assert.equal(child.words.length,5);assert.equal(child.sentences.length,1);
});
test("first plotted observation is recorded evidence, not an invented zero baseline",()=>{
  const state=fresh();add(state,"2026-09-14");const child=api.buildFamily(state,opts).children[0];assert.equal(child.points[0].date,"2026-09-14");assert.equal(child.points[0].words,5);assert.equal(child.points[0].sentences,1);
});
test("unassessed weeks stay blank, while genuinely assessed zero is numeric zero",()=>{
  const state=fresh();add(state,"2026-09-07",undefined,undefined,{marks:Array(6).fill("learning")});add(state,"2026-09-21");const child=api.buildFamily(state,opts).children[0];assert.equal(child.points[0].words,0);assert.equal(child.points[1].words,null);assert.equal(child.points[2].words,5);const book=XLSX.read(api.exportXlsx(state,opts).bytes,{type:"array"});assert.equal(book.Sheets.Ava.AD2.v,0);assert.equal(book.Sheets.Ava.AD3,undefined);assert.equal(book.Sheets.Ava.AE3,undefined);
});
test("unassessed sentence knowledge is not turned into a zero line",()=>{
  const state=fresh();add(state,"2026-09-07",undefined,undefined,{marks:["known","known","known","known","known","unassessed"]});const child=api.buildFamily(state,opts).children[0];assert.equal(child.points[0].words,5);assert.equal(child.points[0].sentences,null);
});
test("re-failed words stay historical demonstrations but move out of the current learned list",()=>{
  const state=fresh();add(state,"2026-09-07");add(state,"2026-09-14",undefined,undefined,{marks:["learning","known","known","known","known","known"]});const child=api.buildFamily(state,opts).children[0];assert.equal(child.demonstratedWords,5);assert.equal(child.words.some(item=>item.text==="hello"),false);assert.equal(child.practisingWords[0].text,"hello");assert.equal(child.practisingWords[0].demonstratedEarlier,true);
});
test("same-instant conflicting practice and exam marks choose needs-practice conservatively",()=>{
  const state=fresh();add(state,"2026-09-07");exam(state,"2026-09-07",{words:["hello","friend","teacher","school","goodbye"],sentence:"Hello, my name is ___.",marks:["learning","known","known","known","known","known"]});const child=api.buildFamily(state,opts).children[0];assert.equal(child.words.some(item=>item.text==="hello"),false);assert.equal(child.practisingWords[0].text,"hello");
});
test("draft exams do not create demonstrations",()=>{
  const state=fresh();exam(state,"2026-09-14",{draft:true});assert.equal(api.buildFamily(state,opts).children[0].hasAssessments,false);
});
test("a sampled exam contributes only asked words and sentences to the family learning story",()=>{
  const state=fresh();exam(state,"2026-09-14",{marks:["known","known","known","unassessed","unassessed","known"]});state.monthlyExams.rounds["2026-09-14"].attempts.ava.history[0].itemIndexes=[0,1,2,5];
  const child=api.buildFamily(state,opts).children[0];assert.equal(child.demonstratedWords,3);assert.equal(child.demonstratedSentences,1);assert.deepEqual(copy(child.words.map(item=>item.text)).sort(),["apple","banana","orange"]);assert.equal(child.practisingWords.length,0);
});
test("sample indexes are authoritative even if an unasked raw position contains a stale mark",()=>{
  const state=fresh();exam(state,"2026-09-14");state.monthlyExams.rounds["2026-09-14"].attempts.ava.history[0].itemIndexes=[0,1,2,5];const child=api.buildFamily(state,opts).children[0];assert.equal(child.demonstratedWords,3);assert.equal(child.words.some(item=>item.text==="grape"),false);
});
test("versioned exam pass rules do not invent or remove parent learning evidence",()=>{
  const state=fresh();exam(state,"2026-09-14",{marks:["known","known","learning","unassessed","unassessed","known"]});const saved=state.monthlyExams.rounds["2026-09-14"].attempts.ava.history[0];saved.itemIndexes=[0,1,2,5];saved.scoringRule="legacy-sampled-v1";saved.passPercent=50;
  const before=copy(api.buildFamily(state,opts).children[0]);saved.scoringRule="overall-majority-v1";saved.passPercent=80;const original=JSON.stringify(state),after=copy(api.buildFamily(state,opts).children[0]);assert.deepEqual(after,before);assert.equal(after.demonstratedWords,2);assert.equal(after.demonstratedSentences,1);assert.equal(after.practisingWords[0].text,"orange");assert.equal(JSON.stringify(state),original);
});
test("completed exams are dated by actual attempt, not their teaching month",()=>{
  const state=fresh();exam(state,"2026-10-05");state.monthlyExams.rounds["2026-10-05"].periodStart="2026-09-01";state.monthlyExams.rounds["2026-10-05"].periodEnd="2026-09-30";const child=api.buildFamily(state,{...opts,startDate:"2026-10-01",endDate:"2026-10-31"}).children[0];assert.equal(child.demonstratedWords,5);assert.equal(child.points[0].date,"2026-10-05");
});
test("later saved edits are not backdated into an earlier report",()=>{
  const state=fresh();add(state,"2026-09-07",undefined,undefined,{edited:"2026-10-02"});assert.equal(api.buildFamily(state,{...opts,endDate:"2026-09-30"}).children[0].hasAssessments,false);const child=api.buildFamily(state,opts).children[0];assert.equal(child.usesEditDates,true);assert.equal(child.words[0].firstDemonstratedDate,"2026-10-02");
});
test("undated legacy marks have a modest recorded-week disclosure",()=>{
  const state=fresh();add(state,"2026-09-07",undefined,undefined,{actual:null});const result=api.exportXlsx(state,opts);assert.equal(result.report.children[0].usesWeekFallback,true);const book=XLSX.read(result.bytes,{type:"array"});assert.match(JSON.stringify(book),/recorded week/);
});
test("early-completion archived source lessons are included exactly once",()=>{
  const state=fresh(),first=add(state,"2026-09-07"),saved=copy(first);delete saved.completedLessons;first.itemStates=Array(6).fill("unassessed");first.practiceFinished=false;first.lesson.words=["red","blue","green","yellow","pink"];first.completedLessons=[saved];const child=api.buildFamily(state,opts).children[0];assert.equal(child.demonstratedWords,5);assert.equal(child.demonstratedSentences,1);
});
test("two native line charts separate words and sentences with same-sheet formula bindings",()=>{
  const result=api.exportXlsx(sample(),opts),zip=unpack(result.bytes),chart=xml(zip,"xl/charts/chart1.xml"),sentences=xml(zip,"xl/charts/chart2.xml"),sheet=xml(zip,"xl/worksheets/sheet1.xml");assert.match(chart,/<c:lineChart>/);assert.match(chart,/Words learned/);assert.match(sentences,/Sentence structures learned/);assert.match(chart,/C90024/);assert.match(sentences,/C90024/);assert.match(chart,/!\$AD\$2:\$AD\$/);assert.match(sentences,/!\$AE\$2:\$AE\$/);assert.match(chart,/!\$AA\$2:\$AA\$/);assert.match(sheet,/IF\(ISNUMBER\(AB2\),SUM\(\$AB\$2:AB2\)/);assert.match(sheet,/hidden="true"|hidden="1"/);assert.match(chart,/<c:plotVisOnly val="0"/);assert.match(chart,/<c:dispBlanksAs val="gap"/);assert.equal((chart.match(/<c:ser>/g)||[]).length,1);assert.equal((sentences.match(/<c:ser>/g)||[]).length,1);
});
test("single-assessment charts have two visible markers rather than an invisible one-point line",()=>{
  const state=fresh();add(state,"2026-09-07");const result=api.exportXlsx(state,{...opts,endDate:"2026-09-07"}),zip=unpack(result.bytes);for(const path of ["xl/charts/chart1.xml","xl/charts/chart2.xml"]) {const chart=xml(zip,path);assert.equal((chart.match(/symbol val="circle"/g)||[]).length,1);assert.equal((chart.match(/<c:ptCount val="1"/g)||[]).length,2);}assert.match(JSON.stringify(XLSX.read(result.bytes,{type:"array"})),/One recorded observation/);
});
test("native chart upper bounds remain automatic when source values are edited",()=>{
  const chart=xml(unpack(api.exportXlsx(sample(),opts).bytes),"xl/charts/chart1.xml");assert.equal(/<c:max\b/.test(chart),false);assert.match(chart,/<c:min val="0"/);
});
test("empty reports state the missing observations and contain no fabricated chart",()=>{
  const result=api.exportXlsx(fresh(),opts),zip=unpack(result.bytes),book=XLSX.read(result.bytes,{type:"array"});assert.match(JSON.stringify(book),/No assessments recorded/);assert.equal(zip.FullPaths.some(name=>/\/charts\//.test(name)),false);assert.equal((xml(zip,"xl/drawings/drawing1.xml").match(/<xdr:pic>/g)||[]).length,1);
});
test("logo pixels are unchanged and relationship/print settings survive the generated package",()=>{
  const result=api.exportXlsx(sample(),opts),zip=unpack(result.bytes),sheet=xml(zip,"xl/worksheets/sheet1.xml");assert.deepEqual(Buffer.from(XLSX.CFB.find(zip,"/xl/media/etonhouse.png").content),fs.readFileSync(new URL("../web/assets/etonhouse-logo.png",import.meta.url)));assert.match(xml(zip,"xl/drawings/_rels/drawing1.xml.rels"),/\/xl\/media\/etonhouse.png/);assert.match(sheet,/fitToHeight="0"/);assert.ok(sheet.indexOf("<sheetPr>")<sheet.indexOf("<sheetViews>"));assert.ok(sheet.indexOf("<pageSetup")<sheet.indexOf("<drawing"));
});
test("duplicate and Chinese/emoji names produce unique valid sheets and safe byte-length filenames",()=>{
  const state=sample();state.students[0].englishName="历史😀/".repeat(18);state.students[0].chineseName="王".repeat(70);state.students[1].englishName=state.students[0].englishName;state.classes[0].name="海".repeat(70)+"\u007f";
  const result=api.exportXlsx(state,{...opts,scope:"class"}),book=XLSX.read(result.bytes,{type:"array"});assert.equal(new Set(book.SheetNames).size,2);book.SheetNames.forEach(name=>{assert.ok(name.length<=31);assert.equal(/[\[\]:*?\/\\]/.test(name),false);assert.equal(/[\ud800-\udbff]$/.test(name),false);});assert.ok(new TextEncoder().encode(result.fileName).length<=240);assert.equal(result.fileName.includes("\u007f"),false);
});
test("long learned lists retain every item with natural print continuation",()=>{
  const state=fresh();for(let index=0;index<40;index++){const day=new Date(Date.UTC(2026,8,1+index*2)).toISOString().slice(0,10);add(state,day,Array.from({length:5},(_,j)=>`Vocabulary ${index*5+j+1}`),`Sentence structure ${index+1}`);}
  const result=api.exportXlsx(state,opts),book=XLSX.read(result.bytes,{type:"array"}),values=Object.values(book.Sheets.Ava).filter(cell=>cell && typeof cell==="object" && "v"in cell).map(cell=>cell.v);assert.equal(result.report.children[0].words.length,200);for(let i=1;i<=200;i++)assert.ok(values.includes(`Vocabulary ${i}`));for(let i=1;i<=40;i++)assert.ok(values.includes(`Sentence structure ${i}`));assert.ok(Number(book.Workbook.Names[0].Ref.match(/\$(\d+)$/)[1])>100);
});
test("chart singleton elements remain unique if the template already contains them",()=>{
  const template=context.window.EtonFamilyReportTemplate,original=template.base64,zip=XLSX.CFB.read(original,{type:"base64"}),entry=XLSX.CFB.find(zip,"/xl/drawings/charts/chart1.xml");let chart=new TextDecoder().decode(entry.content);chart=chart.replace(/<c:marker>[\s\S]*?<\/c:marker>/g,"").replace("</c:valAx>",'<c:majorUnit val="99"/></c:valAx>').replace("</c:catAx>",'<c:tickLblSkip val="99"/></c:catAx>').replace("</c:chart>",'<c:dispBlanksAs val="zero"/></c:chart>');entry.content=new TextEncoder().encode(chart);template.base64=Buffer.from(XLSX.CFB.write(zip,{fileType:"zip"})).toString("base64");
  try {const output=xml(unpack(api.exportXlsx(sample(),opts).bytes),"xl/charts/chart1.xml");assert.equal((output.match(/<c:majorUnit/g)||[]).length,1);assert.equal((output.match(/<c:dispBlanksAs/g)||[]).length,1);assert.equal((output.match(/<c:tickLblSkip/g)||[]).length,1);assert.equal((output.match(/symbol val="circle"/g)||[]).length,1);}finally{template.base64=original;}
});
test("report generation is pure and source records/notes are unchanged",()=>{const state=sample(),before=JSON.stringify(state);api.exportXlsx(state,opts);assert.equal(JSON.stringify(state),before);});
test("later review is separate from learned counts and feeds a specific next step",()=>{
  const state=fresh();add(state,"2026-09-07");state.learningReview={children:{ava:{targets:{hello:{id:"hello",text:"hello",kind:"vocabulary",expectation:"Name it",sourceMark:"known",checks:[{date:"2026-10-01",mark:"known"},{date:"2026-10-09",mark:"learning"}]}}}}};
  const child=api.buildFamily(state,opts).children[0];assert.equal(child.demonstratedWords,5);assert.equal(child.words.length,5);assert.equal(child.review.checked,1);assert.equal(child.review.known,0);assert.match(child.nextStep,/hello/);const text=JSON.stringify(XLSX.read(api.exportXlsx(state,opts).bytes,{type:"array"}));assert.match(text,/Later review/);assert.match(text,/0 of 1 targets known/);
});
test("a correction excludes mistaken exam evidence only from reports after the correction",()=>{
  const state=fresh();exam(state,"2026-09-14");state.monthlyExams.rounds["2026-09-14"].attempts.ava.corrections=[{attemptId:"PRIVATE-ATTEMPT-ID",at:date("2026-10-09"),reason:"Entered for the wrong child"}];
  assert.equal(api.buildFamily(state,{...opts,endDate:"2026-09-30"}).children[0].demonstratedWords,5);assert.equal(api.buildFamily(state,opts).children[0].demonstratedWords,0);assert.equal(state.monthlyExams.rounds["2026-09-14"].attempts.ava.history.length,1);
});
let passed=0;for(const {name,run}of tests){try{await run();passed++;console.log(`PASS ${name}`);}catch(error){console.error(`FAIL ${name}`);throw error;}}console.log(`${passed} family-report checks passed.`);
if(process.argv.includes("--sampled-qa")) {
  const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../test-output/family-report-qa"),state=fresh();fs.mkdirSync(output,{recursive:true});
  exam(state,"2026-09-14",{marks:["known","known","known","unassessed","unassessed","known"]});state.monthlyExams.rounds["2026-09-14"].attempts.ava.history[0].itemIndexes=[0,1,2,5];
  const result=api.exportXlsx(state,{...opts,endDate:"2026-09-14"}),filePath=path.join(output,"sampled-2.3.1.xlsx");fs.writeFileSync(filePath,result.bytes);
  const {FileBlob,SpreadsheetFile}=await import("@oai/artifact-tool"),book=await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));book.recalculate();const sheet=book.worksheets.getItemAt(0);
  assert.equal(book.worksheets.items.length,1);assert.equal(sheet.charts.items.length,2);assert.equal(sheet.images.items.length,1);assert.equal(sheet.getRange("AD2").values[0][0],3);assert.equal(sheet.getRange("AE2").values[0][0],1);assert.match(sheet.charts.items[0].series.items[0].formula,/\$AD\$2/);
  const values=sheet.getRange("B1:K50").values.flat();assert.equal(values.includes("grape"),false);assert.equal(values.includes("pear"),false);assert.ok(values.includes("apple"));
  const image=await book.render({sheetName:sheet.name,range:"A1:L44",scale:1.3,format:"png"});fs.writeFileSync(path.join(output,"sampled-2.3.1.png"),new Uint8Array(await image.arrayBuffer()));
  console.log(`Sampled exam family report validated and rendered: ${filePath}`);
}
if(process.argv.includes("--artifact-qa")) {
  const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../test-output/family-report-qa");fs.mkdirSync(output,{recursive:true});
  const {FileBlob,SpreadsheetFile}=await import("@oai/artifact-tool");
  for(const [kind,state,options] of [["family",sample(),opts],["empty",fresh(),opts],["single",(()=>{const state=fresh();add(state,"2026-09-07");return state;})(),{...opts,endDate:"2026-09-07"}]]) {
    const result=api.exportXlsx(state,options),filePath=path.join(output,`${kind}.xlsx`);fs.writeFileSync(filePath,result.bytes);
    const book=await SpreadsheetFile.importXlsx(await FileBlob.load(filePath));book.recalculate();const sheet=book.worksheets.getItemAt(0),last=Number(XLSX.read(result.bytes,{type:"array"}).Workbook.Names[0].Ref.match(/\$(\d+)$/)[1]);
    const image=await book.render({sheetName:sheet.name,range:`A1:L${Math.min(last,95)}`,scale:1.3,format:"png"});fs.writeFileSync(path.join(output,`${kind}.png`),new Uint8Array(await image.arrayBuffer()));
    console.log((await book.inspect({kind:"drawing",sheetId:sheet.name,maxChars:2000})).ndjson);
    assert.equal(sheet.charts.items.length,result.report.children[0].hasAssessments?2:0);
    if(kind==="family") {
      const chart=sheet.charts.items[0];assert.match(chart.series.items[0].formula,/\$AD\$2:/);assert.match(sheet.charts.items[1].series.items[0].formula,/\$AE\$2:/);assert.equal(sheet.getRange("AD2").values[0][0],3);assert.equal(sheet.getRange("AE2").values[0][0],1);
      sheet.getRange("AB2").values=[[4]];book.recalculate();assert.equal(sheet.getRange("AD2").values[0][0],4);assert.equal(sheet.getRange("AD3").values[0][0],6);assert.ok(sheet.getRange("AD4").values[0][0]===null || sheet.getRange("AD4").values[0][0]==="");const changed=await book.render({sheetName:sheet.name,range:"B11:K26",scale:1.3,format:"png"});fs.writeFileSync(path.join(output,"edited-chart.png"),new Uint8Array(await changed.arrayBuffer()));sheet.getRange("AB2").values=[[3]];book.recalculate();
    }
    const saved=await SpreadsheetFile.exportXlsx(book),savedPath=path.join(output,`${kind}-roundtrip.xlsx`);await saved.save(savedPath);const reloaded=await SpreadsheetFile.importXlsx(await FileBlob.load(savedPath));reloaded.recalculate();assert.equal(reloaded.worksheets.getItemAt(0).charts.items.length,sheet.charts.items.length);assert.equal(reloaded.worksheets.getItemAt(0).images.items.length,1);
    const zip=unpack(new Uint8Array(fs.readFileSync(savedPath)));assert.equal(zip.FullPaths.filter(name=>/\/charts\/chart\d+\.xml$/.test(name)).length,sheet.charts.items.length);
  }
  console.log(`Family report workbook and previews: ${output}`);
}
