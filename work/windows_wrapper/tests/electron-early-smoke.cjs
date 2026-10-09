const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { _electron } = require(process.env.SEATRACKER_PLAYWRIGHT || "playwright");
const {createEarlyFixture} = require("./early-fixture.cjs");

(async () => {
  const wrapper = path.resolve(__dirname,"..");
  const version = require("../package.json").version;
  const {directory,original,historical} = await createEarlyFixture();
  const launch = () => _electron.launch({executablePath:require("electron"),args:[wrapper],env:{...process.env,SEAHORSE_TEST_DATA_DIRECTORY:directory,SEAHORSE_TEST_HIDE_WINDOW:"1"}});
  const read = async () => JSON.parse(await fs.readFile(path.join(directory,"data.json"),"utf8"));
  const currentKey = "early-test-child::2026-09-14";
  const futureKey = "early-test-child::2026-09-21";
  let instance;
  async function checkEarlyWeek(page) {
    await page.locator("#weekCompletionNotice").waitFor({state:"visible"});
    assert.equal(await page.locator("#weekCompletionTitle").innerText(),"Completed");
    assert.match(await page.locator("#weekCompletionDate").innerText(),/Early/);
    assert.match(await page.locator("#weekCompletionDate").innerText(),/14/);
    assert.match(await page.locator("#weekCompletionDate").innerText(),/Sep/);
    assert.match(await page.locator("#nextPracticeLabel").innerText(),/^next practice$/i);
    assert.match(await page.locator("#nextPracticeHint").innerText(),/unlocked teaching month/i);
    assert.match(await page.locator("#curriculumWeekLabel").innerText(),/3$/);
    assert.equal(await page.locator("#practicedCount").innerText(),"1");
    assert.equal(await page.locator("#masteredCount").innerText(),"1");
    assert.match(await page.locator('.student-row[data-student-id="early-test-child"]').innerText(),/completed early/i);
  }
  try {
    instance = await launch();
    assert.equal(await instance.evaluate(({app}) => app.getPath("userData")),directory);
    let page = await instance.firstWindow();
    await page.locator("#studentName").waitFor({state:"visible"});
    assert.equal(await page.locator("#studentName").innerText(),"Synthetic Early Child");
    await page.locator("#teacherNotes").fill("First lesson completed ahead test");
    await page.locator("#completeKnownButton").click();
    assert.match(await page.locator("#curriculumWeekLabel").innerText(),/1$/);
    await page.locator("#practiceButton").click();
    assert.match(await page.locator("#curriculumWeekLabel").innerText(),/2$/);
    await page.locator("#teacherNotes").fill("Second lesson completed before its assigned week");
    await page.locator("#completeKnownButton").click();
    assert.match(await page.locator("#curriculumWeekLabel").innerText(),/2$/);
    await page.locator("#practiceButton").click();
    assert.match(await page.locator("#curriculumWeekLabel").innerText(),/3$/);
    await page.locator("#nextWeekButton").click();
    assert.equal(await page.locator("#weekDateInput").inputValue(),"2026-09-21");
    await checkEarlyWeek(page);
    await instance.close(); instance = null;
    const saved = await read();
    assert.deepEqual(saved.records[historical.id],historical,"Unrelated historical record must remain unchanged");
    const completed = saved.records[currentKey].completedLessons;
    assert.equal(completed.length,2);
    assert.equal(completed[0].notes,"First lesson completed ahead test");
    assert.equal(completed[1].notes,"Second lesson completed before its assigned week");
    assert.equal(saved.records[currentKey].unitIndex,2);
    assert.equal(saved.records[futureKey]?.practiceFinished || false,false,"Viewing future credit must not invent a new practice session");
    assert.equal(saved.records[futureKey]?.completedLessons?.length || 0,0);
    assert.equal(await fs.readFile(path.join(directory,"Backups",`before-version-${version}.json`),"utf8"),original);

    instance = await launch();
    page = await instance.firstWindow();
    await page.locator("#studentName").waitFor({state:"visible"});
    await checkEarlyWeek(page);
    await page.locator("#completionSourceButton").click();
    const completedText = await page.locator("#historyList").innerText();
    for (const word of completed[1].lesson.words) assert.ok(completedText.includes(word),`Completed snapshot includes ${word}`);
    assert.ok(completedText.includes(completed[1].lesson.sentence));
    await page.locator('[data-close-dialog="historyDialog"]').first().click();
    await page.locator('#vocabularyItems [data-state="learning"]').first().click();
    await checkEarlyWeek(page);
    await instance.close(); instance = null;
    const afterOptionalPractice = await read();
    assert.deepEqual(afterOptionalPractice.records[currentKey].completedLessons,completed,"Practising ahead must not rewrite completed earlier lessons");
    assert.deepEqual(afterOptionalPractice.records[historical.id],historical);
    assert.equal(afterOptionalPractice.records[futureKey].unitIndex,2);
    assert.equal(afterOptionalPractice.records[futureKey].itemStates[0],"learning");
    console.log("Hidden Electron early-completion smoke passed: two lessons require explicit Finished;21Sep shows concise completion/early date;History retains words/sentence;restart retains credit;optional same-month practice preserves original history and backups.");
  } finally {
    if (instance) await instance.close();
    await fs.rm(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
