const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {_electron}=require(process.env.SEATRACKER_PLAYWRIGHT || "playwright");
const {createMonthlyFixture}=require("./monthly-fixture.cjs");
const {checkFamilyWorkbook}=require("./family-workbook-check.cjs");

// Only native Save dialogs are replaced. No visible windows or real class data.
(async()=>{
  const wrapper=path.resolve(__dirname,"..");
  const logoPath=path.resolve(__dirname,"../../seahorse_app/web/assets/etonhouse-logo.png");
  const {directory}=await createMonthlyFixture({childCount:25,practiceHistory:true,className:"海".repeat(70)});
  let instance;
  try {
    instance=await _electron.launch({executablePath:require("electron"),args:[wrapper],env:{...process.env,SEAHORSE_TEST_DATA_DIRECTORY:directory,SEAHORSE_TEST_HIDE_WINDOW:"1"}});
    assert.equal(await instance.evaluate(({app})=>app.getPath("userData")),directory);
    assert.equal(await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
    const page=await instance.firstWindow(),errors=[];
    page.setDefaultTimeout(15000);page.on("pageerror",error=>errors.push(error.message));
    await page.locator("#studentName").waitFor({state:"visible"});
    const expectSaved=async()=>{
      await page.waitForFunction(()=>{const message=document.getElementById("reportMessage");return message.textContent==="Excel progress report saved." || message.classList.contains("is-error");},null,{timeout:120000});
      assert.equal(await page.locator("#reportMessage").innerText(),"Excel progress report saved.");
    };
    const close=id=>page.locator(`[data-close-dialog="${id}"]`).first().click();
    const saveDialog=result=>instance.evaluate(({dialog},result)=>{
      globalThis.__familySaveOptions=[];
      dialog.showSaveDialog=async (_window,options)=>{globalThis.__familySaveOptions.push(options);return result;};
    },result);
    const backup=async name=>{
      const output=path.join(directory,name);
      await saveDialog({canceled:false,filePath:output});
      await page.locator("#dataButton").click();await page.locator("#exportBackupButton").click();
      for(let attempt=0;attempt<100;attempt++) {try {const parsed=JSON.parse(await fs.readFile(output,"utf8"));await close("dataDialog");return parsed.data;}catch(error){if(error.code!=="ENOENT")throw error;await new Promise(resolve=>setTimeout(resolve,50));}}
      throw new Error("Native full backup was not saved");
    };
    const before=await backup("Synthetic before family report.json");
    await page.locator("#dataButton").click();await page.locator("#progressReportButton").click();
    await page.locator("#reportScope").selectOption("class");
    await page.locator("#reportStartDate").fill("2026-09-01");await page.locator("#reportStartDate").dispatchEvent("change");
    await page.locator('[data-report-months="3"]').click();
    assert.equal(await page.locator("#reportEndDate").inputValue(),"2026-11-30");
    const classPath=path.join(directory,"Synthetic 25 children family report.xlsx");
    await saveDialog({canceled:false,filePath:classPath});await page.locator("#downloadProgressReportButton").click();
    await expectSaved();
    assert.equal(await page.locator("#downloadProgressReportButton").isDisabled(),false);
    assert.equal(await instance.evaluate(()=>globalThis.__familySaveOptions[0].title),"Save Excel report");
    assert.ok(Buffer.byteLength(await instance.evaluate(()=>globalThis.__familySaveOptions[0].defaultPath),"utf8")<=240,"Long multilingual class names must fit the native filename limit");
    const names=Array.from({length:25},(_,index)=>`Synthetic Exam Child ${index+1}`);
    const classResult=checkFamilyWorkbook(classPath,{children:names,logoPath,forbidden:["Internal synthetic teacher note","Synthetic passed note","exam-class","exam-0"]});
    assert.ok(classResult.bytes<=20000000,"Class report must fit native save size limit");
    await page.locator("#reportScope").selectOption("student");await page.locator("#reportStudentSelect").selectOption("exam-0");
    await page.locator('[data-report-months="2"]').click();
    assert.equal(await page.locator("#reportEndDate").inputValue(),"2026-10-31");
    const childPath=path.join(directory,"Synthetic individual family report.xlsx");
    await saveDialog({canceled:false,filePath:childPath});await page.locator("#downloadProgressReportButton").click();
    await expectSaved();
    const childResult=checkFamilyWorkbook(childPath,{children:names.slice(0,1),logoPath,forbidden:[...names.slice(1),"Internal synthetic teacher note","Synthetic passed note","exam-class","exam-0"]});
    const childBytes=await fs.readFile(childPath);
    await saveDialog({canceled:true});await page.locator("#downloadProgressReportButton").click();
    await page.waitForFunction(()=>document.getElementById("reportMessage").textContent.includes("cancelled"),null,{timeout:120000});
    assert.equal(await page.locator("#downloadProgressReportButton").isDisabled(),false);
    assert.ok((await fs.readFile(childPath)).equals(childBytes),"Cancelled export must not overwrite a saved workbook");
    await close("progressReportDialog");
    const after=await backup("Synthetic after family report.json");
    assert.deepEqual(after.records,before.records,"Reporting must not modify assessment history");
    assert.deepEqual(after.monthlyExams,before.monthlyExams,"Reporting must not modify exam results");
    assert.deepEqual(after.students,before.students,"Reporting must not modify the roster");
    assert.deepEqual(errors,[]);
    await instance.close();instance=null;
    console.log(`Hidden Electron family report passed:25 visible child sheets,25 native two-series line charts, official logo, no internal notes/IDs, class workbook ${classResult.bytes} bytes; private child workbook ${childResult.bytes} bytes; actual native Save and Cancel, original progress unchanged.`);
  } finally {
    if(instance)await instance.close();
    if(process.env.ETON_KEEP_SYNTHETIC_SMOKE)console.log(`Synthetic test files: ${directory}`);
    else await fs.rm(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
