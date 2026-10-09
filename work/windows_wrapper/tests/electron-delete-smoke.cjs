const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { _electron } = require(process.env.SEATRACKER_PLAYWRIGHT || "playwright");

// Only synthetic data in a newly created directory is ever passed to the app.
(async () => {
  const wrapper = path.resolve(__dirname, "..");
  const version = require("../package.json").version;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "etonhouse-delete-smoke-"));
  const scope = {window: {}};
  vm.runInNewContext(await fs.readFile(path.join(wrapper, "web", "curriculum.js"), "utf8"), scope);
  const weeks = ["2026-08-31", "2026-09-07", "2026-09-14"];
  const records = JSON.parse(JSON.stringify(Object.fromEntries(weeks.map((week, index) => {
    const id = `delete-test-child::${week}`;
    return [id, {id, studentId:"delete-test-child", weekStart:week, unitIndex:index,
      lesson:{...scope.window.CURRICULUM[index], curriculumId:scope.window.CURRICULUM[index].id},
      practiceFinished:true, itemStates:["known","learning","known","unassessed","known","learning"],
      notes:`Keep recorded week ${index + 1}`, nextAction:"advance",
      additionalPractice:[{entryId:`preserved-extra-${index}`,title:"Synthetic extra practice",text:"I can jump.",category:"Grammar",sourcePages:[18],state:"learning",practiceFinished:true}],
      removedExtraPracticeIds:[`removed-extra-${index}`]}];
  }))));
  const fixture = {schemaVersion:3,appVersion:"2.1.0",
    classes:[{id:"delete-test-class",name:"Native deletion test",startWeek:weeks[0],startUnit:0}],
    students:[{id:"delete-test-child",englishName:"Deletion Test Child",chineseName:"",classId:"delete-test-class",rosterNumber:1,startWeek:weeks[0],startUnit:0}],
    records,selectedClassId:"delete-test-class",selectedStudentId:"delete-test-child",selectedWeekStart:weeks[2]};
  const original = JSON.stringify(fixture);
  await fs.writeFile(path.join(directory,"data.json"),original);
  const readState = async () => JSON.parse(await fs.readFile(path.join(directory,"data.json"),"utf8"));
  const launch = () => _electron.launch({executablePath:require("electron"),args:[wrapper],env:{...process.env,SEAHORSE_TEST_DATA_DIRECTORY:directory,SEAHORSE_TEST_HIDE_WINDOW:"1"}});
  let instance;
  try {
    instance = await launch();
    assert.equal(await instance.evaluate(({app}) => app.getPath("userData")),directory);
    let page = await instance.firstWindow();
    await page.locator("#studentName").waitFor({state:"visible"});
    assert.equal(await page.locator("#studentName").innerText(),"Deletion Test Child");
    await page.locator("#editStudentButton").click();
    page.once("dialog",dialog => {
      assert.match(dialog.message(),/3 saved weekly records/);
      dialog.dismiss();
    });
    await page.locator("#deleteStudentButton").click();
    assert.equal(await page.locator(".student-row").count(),1,"Cancel keeps the child visible");
    page.once("dialog",dialog => dialog.accept());
    await page.locator("#deleteStudentButton").click();
    await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 0);
    await instance.close(); instance = null;
    let saved = await readState();
    assert.equal(saved.students.length,1,"Delete keeps the child identity for recovery");
    assert.equal(saved.students[0].active,false);
    assert.ok(Number.isFinite(Date.parse(saved.students[0].deletedAt)));
    assert.deepEqual(saved.records,records,"Deleting a child must preserve every original record byte-for-byte in value");
    assert.equal(await fs.readFile(path.join(directory,"Backups",`before-version-${version}.json`),"utf8"),original);

    instance = await launch();
    page = await instance.firstWindow();
    await page.locator("#manageClassesButton").waitFor({state:"visible"});
    assert.equal(await page.locator(".student-row").count(),0,"Deleted child stays hidden after app restart");
    await page.locator("#manageClassesButton").click();
    assert.match(await page.locator("#recentlyDeletedButton").innerText(),/1/);
    await page.locator("#recentlyDeletedButton").click();
    assert.match(await page.locator("#deletedStudentsList").innerText(),/3 saved weekly records/);
    await page.locator('[data-restore-student="delete-test-child"]').click();
    await page.locator('[data-close-dialog="deletedStudentsDialog"]').first().click();
    assert.equal(await page.locator(".student-row").count(),1);
    assert.equal(await page.locator("#studentName").innerText(),"Deletion Test Child");
    assert.equal(await page.locator("#teacherNotes").inputValue(),"Keep recorded week 3");
    await instance.close(); instance = null;
    saved = await readState();
    assert.equal(saved.students[0].active,true);
    assert.equal(saved.students[0].deletedAt,undefined);
    assert.deepEqual(saved.records,records,"Restoring a child preserves all three weekly records, marks, notes and extra practice");

    instance = await launch();
    page = await instance.firstWindow();
    await page.locator("#studentName").waitFor({state:"visible"});
    assert.equal(await page.locator("#studentName").innerText(),"Deletion Test Child");
    assert.equal(await page.locator("#teacherNotes").inputValue(),"Keep recorded week 3");
    await instance.close(); instance = null;
    assert.deepEqual((await readState()).records,records);
    console.log("Electron recoverable-deletion smoke passed on macOS: cancel, delete, exit/relaunch, restore, second restart, all three records unchanged, immutable pre-upgrade snapshot.");
  } finally {
    if (instance) await instance.close();
    await fs.rm(directory,{recursive:true,force:true});
  }
})().catch(error => {console.error(error);process.exitCode=1;});
