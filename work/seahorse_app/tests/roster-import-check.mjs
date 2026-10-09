import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
globalThis.window = { XLSX: require("../web/vendor/xlsx.full.min.js") };
await import("../web/curriculum.js");
await import("../web/roster-import.js");
const { read } = window.RosterImport;
const file = (name, content) => new File([content], name);
const csv = content => file("names.csv", content);
const reject = (content, pattern) => assert.rejects(read(csv(content)), pattern);

assert.deepEqual(await read(csv("English name,Chinese name,Student ID,Starting age\nAlex,小明,001,2-3\nBea,,002,3-4\n,小华,003,4–5\nDee,,004,5-6\n")), {
  rows: [
    { englishName: "Alex", chineseName: "小明", studentCode: "001", startUnit: 0 },
    { englishName: "Bea", chineseName: "", studentCode: "002", startUnit: 42 },
    { englishName: "", chineseName: "小华", studentCode: "003", startUnit: 97 },
    { englishName: "Dee", chineseName: "", studentCode: "004", startUnit: 163 },
  ], warnings: []
});
assert.deepEqual((await read(csv('\uFEFF英文名,中文名,学号\r\n"Alex, Jr.",小明,001\r\n,,\r\n"Annie ""Bee""",,002'))).rows.map(row => row.englishName), ["Alex, Jr.", 'Annie "Bee"']);
assert.deepEqual((await read(csv("Name\nAlex\n\n"))).rows[0], { englishName: "Alex", chineseName: "", studentCode: "" });
assert.equal((await read(csv("Name,Notes\nAlex,not imported"))).warnings.length, 1);
assert.equal((await read(file("names.csv", Buffer.from("\uFEFFChinese name\n小华", "utf16le")))).rows[0].chineseName, "小华");
await reject("English name,Student ID\nAlex,X1\nBea,X1", /Row 3: Student ID.*repeats row 2/);
await reject("English name,Chinese name\nAlex,小明\nalex,小明", /Row 3:.*repeats row 2/);
assert.equal((await read(csv("English name,Chinese name,Student ID\nAlex,小明,A001\nAlex,小明,A002\nAlex,小明,A003"))).rows.length, 3);
await reject("English name,Student ID\nAlex,A001\nAlex,", /Row 3:.*give both a different Student ID/);
await reject("English name,Student ID\nAlex,\nAlex,A002", /Row 3:.*give both a different Student ID/);
await reject("English name,Student ID\nAlex,A001\nAlex,A001", /Row 3: Student ID.*repeats row 2/);
await reject("English name,Student ID\n,X1", /Row 2: enter an English name/);
await reject("English name,Starting age\nAlex,7-8", /Row 2: Starting age must be/);
await reject("English name,Starting age\nAlex,March 2", /format the cell as Text/);
await reject("English name,Name\nAlex,Alex", /Row 1:.*repeats a name-list column/);
await reject("School,Favorite color\nSchool,Blue", /Row 1: add an/);
await reject("English name\n", /No children's names were found/);
await reject('English name\n"Alex', /Row 2: a quoted value is not closed/);
await reject('English name\n"Alex"stray', /Row 2: unexpected text/);
await reject("English name\n=HYPERLINK(123)", /Row 2: use plain text/);
await reject(`English name\n${Array.from({ length: 501 }, (_, index) => `Child ${index + 1}`).join("\n")}`, /up to 500 children/);
await assert.rejects(read(file("names.xls", "anything")), /older .xls/);
await assert.rejects(read(file("names.csv", new Uint8Array(5 * 1024 * 1024 + 1))), /larger than 5 MB/);
await assert.rejects(read(file("names.csv", Uint8Array.from([0xff, 0xfe, 0xff]))), /encoding could not be read/);
await assert.rejects(read(file("names.xlsx", "not an xlsx")), /not an Excel/);

const blankTemplate = await fs.readFile(new URL("../web/assets/Student names template.xlsx", import.meta.url));
await assert.rejects(read(file("Student names template.xlsx", blankTemplate)), /No children's names were found/);
// Generate the Excel fixture in memory: no classroom roster or external file is needed.
const fixtureBook = window.XLSX.utils.book_new();
window.XLSX.utils.book_append_sheet(fixtureBook, window.XLSX.utils.aoa_to_sheet([
  ["English name", "Chinese name", "Student ID", "Starting age"],
  ["Alex", "小明", "C001", "2-3"],
  ["Bea", "", "C002", "3-4"],
  ["", "小华", "C003", "4-5"],
  ["Dee", "", "C004", "5-6"]
]), "Students");
const fixture = window.XLSX.write(fixtureBook, { type: "buffer", bookType: "xlsx" });
const imported = await read(file("names.xlsx", fixture));
assert.equal(imported.rows.length, 4);
assert.deepEqual(imported.rows.map(row => row.startUnit), [0, 42, 97, 163]);
assert.equal(imported.rows[0].studentCode, "C001");
assert.equal(imported.rows[2].chineseName, "小华");
assert.deepEqual(imported.warnings, []);
const book = window.XLSX.read(blankTemplate, { type: "buffer" });
assert.deepEqual(book.SheetNames, ["Students", "Instructions"]);
assert.equal(book.Sheets.Students.A1.v, "English name");
assert.equal(book.Sheets.Students.A2?.v ?? "", "");
console.log("Roster import checks passed: Excel/CSV, all age bands, Chinese, blank template, duplicates, validation, file limits.");
