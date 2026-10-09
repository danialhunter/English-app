const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { _electron } = require(process.env.SEATRACKER_PLAYWRIGHT || "playwright");

(async () => {
  const wrapper = path.resolve(__dirname, "..");
  const version = require("../package.json").version;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "seahorse-electron-smoke-"));
  const scope = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(wrapper, "web", "curriculum.js"), "utf8"), scope);
  vm.runInNewContext(await fs.readFile(path.join(wrapper, "web", "seed.js"), "utf8"), scope);
  const expectedSchema = scope.window.createSeedState().schemaVersion;
  const lesson = { ...scope.window.CURRICULUM[0], curriculumId: scope.window.CURRICULUM[0].id };
  const record = { id: "test-child::2026-09-14", studentId: "test-child", weekStart: "2026-09-14", unitIndex: 0, lesson,
    practiceFinished: false, itemStates: Array(6).fill("unassessed"), notes: "Original native note", nextAction: "advance" };
  const additionalPractice = [
    {entryId:"native-extra-known",title:"Completed extra practice",text:"I can jump.",category:"Grammar",sourcePages:[18],state:"known",practiceFinished:true},
    {entryId:"native-extra-review",title:"Extra practice to review",text:"Can you jump?",category:"Grammar",sourcePages:[18],state:"learning",practiceFinished:true}
  ];
  record.additionalPractice = additionalPractice;
  record.removedExtraPracticeIds = ["native-removed-extra"];
  const fixture = { schemaVersion: 1, students: [{ id: "test-child", rosterNumber: 1, englishName: "Native Test Child", chineseName: "", group: "Native test", startUnit: 0 }],
    records: { [record.id]: record }, selectedStudentId: "test-child", selectedWeekStart: "2026-09-14" };
  const original = JSON.stringify(fixture);
  await fs.writeFile(path.join(directory, "data.json"), original);
  let instance;
  try {
    const launch = (dataDirectory = directory) => _electron.launch({ executablePath: require("electron"), args: [wrapper], env: { ...process.env, SEAHORSE_TEST_DATA_DIRECTORY: dataDirectory, SEAHORSE_TEST_HIDE_WINDOW:"1" } });
    instance = await launch();
    assert.equal(await instance.evaluate(({app}) => app.getName()), "EtonHouse English Tracker");
    assert.equal(await instance.evaluate(({app}) => app.getPath("userData")), directory, "Renaming the display app must not change the selected storage path");
    let page = await instance.firstWindow();
    await page.locator("#studentName").waitFor({ state: "visible" });
    assert.equal(await page.locator("#studentName").innerText(), "Native Test Child");
    assert.equal(await page.locator("#teacherNotes").inputValue(), "Original native note");
    await page.locator(".optional-practice > summary").click();
    await page.locator("#teacherNotes").fill("Saved native note after upgrade");
    await page.waitForFunction(() => document.getElementById("saveStatus").textContent.startsWith("Saved"));
    await instance.close(); instance = null;
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, "data.json"), "utf8")).records[record.id].notes, "Saved native note after upgrade");
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, "data.json"), "utf8")).records[record.id].additionalPractice, additionalPractice, "Extra practice survives the branded upgrade and note save");
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, "data.json"), "utf8")).records[record.id].removedExtraPracticeIds, ["native-removed-extra"], "Removed-extra choices survive native saves");
    assert.equal(await fs.readFile(path.join(directory, "Backups", `before-version-${version}.json`), "utf8"), original);
    instance = await launch();
    page = await instance.firstWindow();
    await page.locator("#studentName").waitFor({ state: "visible" });
    assert.equal(await page.locator("#teacherNotes").inputValue(), "Saved native note after upgrade");
    const first = await page.locator("#curriculumWeekLabel").innerText();
    for (let index = 0; index < 6; index++) await page.locator('[data-state="known"]').nth(index).click();
    assert.equal(await page.locator("#curriculumWeekLabel").innerText(),first,"Knowing all six must wait for explicit Finished");
    await page.locator("#practiceButton").click();
    assert.notEqual(await page.locator("#curriculumWeekLabel").innerText(), first);
    await instance.close(); instance = null;
    const final = JSON.parse(await fs.readFile(path.join(directory, "data.json"), "utf8"));
    assert.equal(final.records[record.id].completedLessons.length, 1);
    assert.equal(final.records[record.id].completedLessons[0].notes, "Saved native note after upgrade");
    assert.equal(final.records[record.id].unitIndex, 1);
    assert.equal(final.schemaVersion, expectedSchema);
    assert.deepEqual(final.records[record.id].completedLessons[0].additionalPractice, additionalPractice, "Completed history retains all extra-practice marks");
    assert.deepEqual(final.records[record.id].additionalPractice, [additionalPractice[1]], "Only unfinished extra practice moves to the next lesson");
    instance = await launch(path.join(directory, "fresh-user"));
    page = await instance.firstWindow();
    await page.locator("#emptyState").waitFor({state:"visible"});
    assert.equal(await page.locator(".student-row").count(), 0, "A new installation starts without private names");
    await instance.close(); instance = null;
    console.log("Electron smoke passed on macOS: isolated native load, disk save, exit/relaunch persistence, pre-upgrade backup and completed-lesson advance.");
  } finally {
    if (instance) await instance.close();
    await fs.rm(directory, {recursive:true,force:true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
