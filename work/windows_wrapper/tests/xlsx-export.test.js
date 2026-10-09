const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {parseXlsxExport, XLSX_MIME, MAX_XLSX_BYTES, MAX_BASE64_LENGTH} = require("../xlsx-export");
const workbook = fs.readFileSync(path.resolve(__dirname,"../../seahorse_app/web/assets/Student names template.xlsx"));
const payload = () => ({filename:"EtonHouse 2-month report.xlsx",base64:workbook.toString("base64"),mimeType:XLSX_MIME});

test("XLSX report accepts canonical workbook bytes and either supported MIME key", () => {
  const parsed = parseXlsxExport(payload());
  assert.ok(parsed.data.equals(workbook));
  assert.equal(parsed.filename,payload().filename);
  assert.equal(parseXlsxExport({...payload(),mimeType:undefined,mime:XLSX_MIME}).mimeType,XLSX_MIME);
  assert.equal(parseXlsxExport({...payload(),filename:"海马月度报告.XLSX"}).filename,"海马月度报告.XLSX");
});

test("XLSX report rejects paths, reserved device names, hidden names and wrong extensions", () => {
  for (const filename of ["../report.xlsx","folder/report.xlsx","C:\\report.xlsx","report.xlsx.exe","CON.xlsx","aux.xlsx","LPT1.xlsx",".hidden.xlsx"," report.xlsx","report.xlsx ","report?.xlsx","report\u0000.xlsx","a".repeat(240)+".xlsx"]) {
    assert.throws(()=>parseXlsxExport({...payload(),filename}),/filename/);
  }
});

test("XLSX report rejects malformed, noncanonical, oversized and non-workbook binary payloads", () => {
  for (const base64 of ["", "not base64", "UEsDBA", "UEsDBB==", "UEsDBA==\n", "UEsDBA==garbage", Buffer.from("not an xlsx").toString("base64"), "A".repeat(MAX_BASE64_LENGTH+4)]) {
    assert.throws(()=>parseXlsxExport({...payload(),base64}),/invalid|larger/);
  }
  assert.throws(()=>parseXlsxExport({...payload(),mimeType:"application/octet-stream"}),/file type/);
  assert.throws(()=>parseXlsxExport({...payload(),asset:"other.xlsx"}),/valid Excel/);
  assert.throws(()=>parseXlsxExport(null),/valid Excel/);
});

test("binary transport accepts exactly 20 MB and rejects one extra decoded byte", () => {
  // This unit checks byte transport, not the workbook author's OOXML structure.
  const bytes = Buffer.alloc(MAX_XLSX_BYTES,0x61);
  Buffer.from([0x50,0x4b,0x03,0x04]).copy(bytes);
  const exported = parseXlsxExport({...payload(),base64:bytes.toString("base64")});
  assert.ok(exported.data.equals(bytes),"Every opaque chart/image byte must survive base64 decoding");
  const oversized = Buffer.concat([bytes,Buffer.from([0x62])]);
  assert.equal(oversized.toString("base64").length,MAX_BASE64_LENGTH,"Decoded-size guard must also catch equal encoded lengths");
  assert.throws(()=>parseXlsxExport({...payload(),base64:oversized.toString("base64")}),/larger/);
});
