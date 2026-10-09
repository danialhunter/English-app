const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { _electron } = require(process.env.SEATRACKER_PLAYWRIGHT || "playwright");
const {createMonthlyFixture} = require("./monthly-fixture.cjs");

// All class activity is synthetic. Only the operating-system Save dialog is mocked.
(async () => {
  const wrapper = path.resolve(__dirname,"..");
  const {directory,original,state:fixture} = await createMonthlyFixture();
  const roundId = "exam-class::2026-09-01";
  const draftNote = "Synthetic unfinished exam note survives restart.";
  const finalNote = "Synthetic child needs another practice session.";
  const errors = [];
  let instance, page;
  const launch = async () => {
    instance = await _electron.launch({executablePath:require("electron"),args:[wrapper],env:{...process.env,SEAHORSE_TEST_DATA_DIRECTORY:directory,SEAHORSE_TEST_HIDE_WINDOW:"1"}});
    assert.equal(await instance.evaluate(({app})=>app.getPath("userData")),directory);
    assert.equal(await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false,"Synthetic workflow must not open a desktop window");
    page = await instance.firstWindow();
    page.setDefaultTimeout(12000);
    page.on("pageerror",error=>errors.push(error.message));
    await page.locator("#studentName").waitFor({state:"visible"});
    assert.match(await page.locator("#studentName").innerText(),/^Synthetic Exam Child /);
  };
  const closeDialog = id=>page.locator(`[data-close-dialog="${id}"]`).first().click();
  const saveDialog = result=>instance.evaluate(({dialog},result)=>{
    globalThis.__monthlySaveCalls=[];
    dialog.showSaveDialog=async (_window,options)=>{globalThis.__monthlySaveCalls.push(options);return result;};
  },result);
  const openExam = async () => {
    await page.locator("#monthlyExamsButton").click();
    await page.locator("#examPeriodSelect").selectOption("2026-09-01");
    await page.locator('[data-exam-child="exam-4"]').click();
  };
  const backup = async name => {
    const output=path.join(directory,name);
    await saveDialog({canceled:false,filePath:output});
    await page.locator("#dataButton").click();
    await page.locator("#exportBackupButton").click();
    await page.waitForFunction(()=>document.getElementById("dataMessage").textContent.includes("ready"));
    for(let attempt=0;attempt<40;attempt++) {try {const parsed=JSON.parse(await fs.readFile(output,"utf8"));await closeDialog("dataDialog");return parsed;}catch(error){if(error.code!=="ENOENT")throw error;await new Promise(resolve=>setTimeout(resolve,50));}}
    throw new Error("Native full backup did not finish saving.");
  };
  try {
    await launch();
    assert.equal(await page.locator("#monthlyGateNotice").isVisible(),true,"Four passes cannot bypass the fifth compulsory exam");
    assert.equal(await page.locator("#completeKnownButton").isDisabled(),true);
    await openExam();
    assert.match(await page.locator("#examClassStatus").innerText(),/4\/5.*tested/s);
    await page.locator("#startExamButton").click();
    if(await page.locator("#examConfirmDialog").isVisible())await page.locator("#examConfirmAction").click();
    const examItemCount=await page.locator("#examItems .exam-item").count();
    const frozenItems=fixture.monthlyExams.rounds[roundId].cohort.find(member=>member.studentId==="exam-4").items;
    assert.ok(examItemCount<=frozenItems.length,"The selected sample belongs to the saved frozen content pool");
    assert.ok(examItemCount>=2,"Assessment contains both meaningful sample items and an incomplete draft state");
    const firstKnown=page.locator('[data-exam-mark="known"]').first();
    const firstKnownIndex=Number(await firstKnown.getAttribute("data-exam-item"));
    await firstKnown.click();
    assert.equal(await firstKnown.evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(234, 245, 239)","Native exam selection must show green");
    assert.equal(await firstKnown.evaluate(el=>getComputedStyle(el,"::before").visibility),"visible","Native exam selection must show its checkmark");
    await page.locator("#examTeacherNote").fill(draftNote);
    assert.equal(await page.locator("#finishExamButton").isDisabled(),true);
    await closeDialog("monthlyExamsDialog");
    const draftBackup=await backup("Synthetic draft backup.json");
    assert.equal(draftBackup.format,"EtonHouse English Tracker Backup");
    assert.equal(draftBackup.data.schemaVersion,fixture.schemaVersion,"Backup retains the current model schema");
    const draft=draftBackup.data.monthlyExams.rounds[roundId].attempts["exam-4"].draft;
    assert.equal(draft.notes,draftNote);assert.equal(draft.itemStates[firstKnownIndex],"known");
    assert.equal(examItemCount,(draft.itemIndexes || draft.itemStates.map((_,index)=>index)).length,"UI item count matches the persisted sample");
    assert.deepEqual(draftBackup.data.records,fixture.records,"Exam actions must not change practice history");
    await instance.close();instance=null;
    await launch();await openExam();
    assert.equal(await page.locator("#examTeacherNote").inputValue(),draftNote);
    assert.equal(await page.locator(`[data-exam-item="${firstKnownIndex}"][data-exam-mark="known"]`).getAttribute("aria-pressed"),"true");
    assert.equal(await page.locator(`[data-exam-item="${firstKnownIndex}"][data-exam-mark="known"]`).evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(234, 245, 239)","Selected colour survives native save/restart");
    for(let index=0;index<examItemCount;index++) await page.locator('[data-exam-mark="learning"]').nth(index).click();
    assert.equal(await page.locator('[data-exam-mark="learning"]').first().evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(255, 246, 222)","Needs practice selection must show amber");
    await page.locator("#examTeacherNote").fill(finalNote);
    await page.locator("#finishExamButton").click();
    await page.locator("#examConfirmAction").click();
    assert.match(await page.locator("#examClassStatus").innerText(),/Class requirement met/);
    assert.equal(await page.locator("#examTeacherNote").isDisabled(),true);
    await closeDialog("monthlyExamsDialog");
    assert.equal(await page.locator("#monthlyGateNotice").isVisible(),false,"Passed child may advance after all exams complete and 80% pass");
    await page.locator('.student-row[data-student-id="exam-4"]').click();
    assert.equal(await page.locator("#monthlyGateNotice").isVisible(),true);
    assert.match(await page.locator("#monthlyGateMessage").innerText(),/needs to pass/);
    const completedBackup=await backup("Synthetic completed backup.json");
    const completedRound=completedBackup.data.monthlyExams.rounds[roundId];
    const failed=completedRound.attempts["exam-4"];
    assert.equal(failed.draft,null);assert.equal(failed.history.length,1);
    assert.equal(failed.history[0].notes,finalNote);
    const failedAttempt=failed.history[0];
    assert.ok((failedAttempt.itemIndexes || failedAttempt.itemStates.map((_,index)=>index)).every(index=>failedAttempt.itemStates[index]==="learning"));
    for(let index=0;index<4;index++) assert.deepEqual(completedRound.attempts[`exam-${index}`],fixture.monthlyExams.rounds[roundId].attempts[`exam-${index}`]);
    assert.deepEqual(completedBackup.data.records,fixture.records);
    await instance.close();instance=null;
    await launch();
    assert.equal(await page.locator("#monthlyGateNotice").isVisible(),true,"Failed child's hold survives restart");
    await page.locator('.student-row[data-student-id="exam-0"]').click();
    assert.equal(await page.locator("#monthlyGateNotice").isVisible(),false);
    const restartedBackup=await backup("Synthetic completed results after restart.json");
    assert.deepEqual(restartedBackup.data.monthlyExams,completedBackup.data.monthlyExams,"Completed exam results remain unchanged after restart");
    assert.deepEqual(restartedBackup.data.records,completedBackup.data.records);
    await instance.close();instance=null;
    assert.equal(await fs.readFile(path.join(directory,"Backups",`before-version-${require("../package.json").version}.json`),"utf8"),original);
    assert.deepEqual(errors,[]);
    console.log(`Hidden Electron monthly workflow passed on macOS: compulsory fifth exam, ${examItemCount}-item frozen draft restart, completed results retained, class pass plus individual hold, restart and full backups. Parent-workbook delivery is covered separately by electron-family-smoke.cjs.`);
  } finally {
    if(instance) await instance.close();
    if(process.env.ETON_KEEP_SYNTHETIC_SMOKE) console.log(`Synthetic test files: ${directory}`);
    else await fs.rm(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
