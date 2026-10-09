const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const {_electron}=require(process.env.SEATRACKER_PLAYWRIGHT || "playwright");
const {createMonthlyFixture}=require("./monthly-fixture.cjs");

(async()=>{
  const wrapper=path.resolve(__dirname,"..");
  const {directory}=await createMonthlyFixture({passed:0,selectedWeek:"2026-09-07"});
  let instance,page;
  const launch=async()=>{
    instance=await _electron.launch({executablePath:require("electron"),args:[wrapper],env:{...process.env,SEAHORSE_TEST_DATA_DIRECTORY:directory,SEAHORSE_TEST_HIDE_WINDOW:"1"}});
    assert.equal(await instance.evaluate(({app})=>app.getPath("userData")),directory);
    assert.equal(await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
    page=await instance.firstWindow();page.setDefaultTimeout(12000);
    await page.locator("#studentName").waitFor({state:"visible"});
  };
  const close=id=>page.locator(`[data-close-dialog="${id}"]`).first().click();
  try {
    await launch();
    for(let lesson=0;lesson<4;lesson++) {
      const before=await page.locator("#curriculumWeekLabel").innerText();
      await page.locator("#completeKnownButton").click();
      assert.equal(await page.locator("#curriculumWeekLabel").innerText(),before,"Mark all as known must not finish or advance");
      await page.locator("#practiceButton").click();
    }
    await page.locator("#examRequiredDialog").waitFor({state:"visible"});
    assert.equal(await page.locator("#examRequiredAction").getAttribute("data-period"),"2026-09-01");
    assert.equal(await page.locator("#monthlyExamsButton").evaluate(el=>el.classList.contains("is-exam-required")),true);
    await page.locator("#examRequiredAction").click();
    assert.equal(await page.locator("#monthlyExamsDialog").isVisible(),true);
    assert.equal(await page.locator("#examPeriodSelect").inputValue(),"2026-09-01");
    await close("monthlyExamsDialog");
    await page.locator("#weekDateInput").fill("2026-10-05");await page.locator("#weekDateInput").dispatchEvent("change");
    await page.locator("#examRequiredDialog").waitFor({state:"visible"});
    assert.equal(await page.locator("#weekDateInput").inputValue(),"2026-09-07","Blocked forward navigation must retain the selected teaching week");
    await close("examRequiredDialog");
    assert.equal(await page.locator("#completeKnownButton").isDisabled(),true);
    assert.match(await page.locator("#curriculumWeekLabel").innerText(),/4$/,"Checkpoint keeps the completed boundary lesson visible");
    assert.equal(await page.locator('#vocabularyItems [data-state]:not([disabled]), #sentenceItem [data-state]:not([disabled])').count(),0,"Held lesson knowledge controls must not alter the completed checkpoint");
    const output=path.join(directory,"Synthetic checkpoint backup.json");
    await instance.evaluate(({dialog},output)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:output});},output);
    await page.locator("#dataButton").click();await page.locator("#exportBackupButton").click();
    let backup;
    for(let attempt=0;attempt<100;attempt++){try{backup=JSON.parse(await fs.readFile(output,"utf8"));break;}catch(error){if(error.code!=="ENOENT")throw error;await new Promise(resolve=>setTimeout(resolve,50));}}
    assert.ok(backup,"Native backup saves the completed practice before restart");
    const records=backup.data.records,current=records["exam-0::2026-09-07"];
    const completed=[...(current.completedLessons || []),current].filter(lesson=>lesson.practiceFinished && lesson.itemStates.every(mark=>mark==="known"));
    assert.equal(completed.length,4,"Three earlier lessons plus the held completed boundary lesson remain saved");
    assert.equal(current.unitIndex,3);
    assert.equal(current.awaitingMonthlyExam,true);
    await instance.close();instance=null;
    await launch();
    assert.equal(await page.locator("#examRequiredDialog").isVisible(),false,"Reopening does not unexpectedly open a modal");
    assert.equal(await page.locator("#monthlyExamsButton").evaluate(el=>el.classList.contains("is-exam-required")),true);
    assert.equal(await page.locator("#completeKnownButton").isDisabled(),true);
    await page.locator("#monthlyExamsButton").click();
    assert.equal(await page.locator("#examPeriodSelect").inputValue(),"2026-09-01","Persistent exam button targets the actual due period");
    for(let child=0;child<5;child++) {
      await page.locator(`[data-exam-child="exam-${child}"]`).click();
      await page.locator("#startExamButton").click();
      if(child===0) {
        await page.locator("#examConfirmDialog").waitFor({state:"visible"});
        await page.locator("#examConfirmAction").click();
      } else {
        assert.equal(await page.locator("#examConfirmDialog").isVisible(),false,"An already-frozen round starts the next child's exam without reconfirming its assignments");
      }
      const marks=page.locator('#examItems [data-exam-mark="known"]'),count=await marks.count();
      assert.ok(count>0 && count<24,"New monthly exam is a shorter selected sample");
      for(let item=0;item<count;item++)await marks.nth(item).click();
      await page.locator("#finishExamButton").click();
      await page.locator("#examConfirmAction").click();
      assert.match(await page.locator("#examChildResult").innerText(),/Passed/);
    }
    await close("monthlyExamsDialog");
    assert.match(await page.locator("#curriculumWeekLabel").innerText(),/5$/,"After exams pass, next practice opens automatically for the held child");
    assert.equal(await page.locator("#completeKnownButton").isDisabled(),false);
    const resumedOutput=path.join(directory,"Synthetic resumed after exams.json");
    await instance.evaluate(({dialog},output)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:output});},resumedOutput);
    await page.locator("#dataButton").click();await page.locator("#exportBackupButton").click();
    let resumed;
    for(let attempt=0;attempt<100;attempt++){try{resumed=JSON.parse(await fs.readFile(resumedOutput,"utf8"));break;}catch(error){if(error.code!=="ENOENT")throw error;await new Promise(resolve=>setTimeout(resolve,50));}}
    assert.ok(resumed);
    const resumedRecord=resumed.data.records["exam-0::2026-09-07"];
    assert.equal(resumedRecord.unitIndex,4);assert.equal(resumedRecord.completedLessons.length,4);
    const evidence=record=>({unitIndex:record.unitIndex,lesson:record.lesson,itemStates:record.itemStates,practiceFinished:record.practiceFinished,notes:record.notes,practicedAt:record.practicedAt});
    assert.deepEqual(resumedRecord.completedLessons.map(evidence),completed.map(evidence),"Exam release must retain all four original practice snapshots");
    await instance.close();instance=null;
    console.log("Hidden Electron checkpoint passed: explicit Finished opens exam alert at the boundary;completed boundary lesson held with controls locked;forward jump refused;four practice snapshots survive restart;the initial round freeze and all five exam completions use in-app confirmation;passing exams autoopens nextpractice without losing history.");
  } finally {
    if(instance)await instance.close();
    if(process.env.ETON_KEEP_SYNTHETIC_SMOKE)console.log(`Synthetic test files: ${directory}`);
    else await fs.rm(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
