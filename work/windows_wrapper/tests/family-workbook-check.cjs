const assert = require("node:assert/strict");
const fs = require("node:fs");
const {execFileSync} = require("node:child_process");

// Read the saved XLSX container only. This does not create or rewrite workbooks.
function checkFamilyWorkbook(file,{children,expectedCharts=children.length,logoPath,forbidden=[]}) {
  const entries=execFileSync("/usr/bin/unzip",["-Z1",file],{encoding:"utf8"}).trim().split("\n");
  const read=entry=>execFileSync("/usr/bin/unzip",["-p",file,entry.replace(/[\[\]*?]/g,"\\$&")],{maxBuffer:25_000_000});
  const workbook=read("xl/workbook.xml").toString("utf8");
  const sheets=workbook.match(/<sheet\b[^>]*\/?\s*>/g)||[];
  assert.equal(sheets.length,children.length,"One parent-facing worksheet per selected child");
  assert.ok(sheets.every(sheet=>!(/state=["'](?:hidden|veryHidden)["']/).test(sheet)),"No hidden peer or audit worksheets");
  const charts=entries.filter(entry=>/^xl\/charts\/[^/]+\.xml$/.test(entry));
  assert.equal(charts.length,expectedCharts,"Assessed children have native charts; unassessed children have no invented zero chart");
  for(const chartPath of charts) {
    const chart=read(chartPath).toString("utf8");
    assert.match(chart,/<(?:\w+:)?lineChart\b/);
    assert.equal((chart.match(/<(?:\w+:)?ser\b/g)||[]).length,2,"Chart includes vocabulary and sentence series");
    assert.ok(chart.includes("Words demonstrated"));assert.ok(chart.includes("Sentence structures demonstrated"));
    assert.ok(chart.includes("C90024"));assert.ok(chart.includes("5A8570"));
    assert.ok((chart.match(/<(?:\w+:)?f>/g)||[]).length>=4,"Editable charts retain sheet-bound data formulas");
    const number=Number(chartPath.match(/chart(\d+)\.xml$/)?.[1]);
    const encodedSheetName=sheets[number-1]?.match(/\bname="([^"]+)"/)?.[1];
    assert.ok(encodedSheetName && chart.includes(encodedSheetName),"Each saved chart refers to its own child's worksheet");
    assert.match(chart,/<(?:\w+:)?plotVisOnly\b[^>]*val="0"/,"Hidden same-sheet data remains available to the native chart");
    assert.match(chart,/<(?:\w+:)?dispBlanksAs\b[^>]*val="gap"/,"Missing assessments remain gaps instead of invented zeroes");
  }
  const images=entries.filter(entry=>/^xl\/media\/[^/]+\.(?:png|jpg|jpeg)$/.test(entry));
  assert.ok(images.length>0,"Official school logo is embedded");
  if(logoPath) {
    const logo=fs.readFileSync(logoPath);
    assert.ok(images.some(entry=>read(entry).equals(logo)),"Embedded logo retains supplied image bytes");
  }
  const text=entries.filter(entry=>entry.endsWith(".xml")).map(entry=>read(entry).toString("utf8")).join("\n");
  for(const name of children) assert.ok(text.includes(name),"Selected child is named in report");
  for(const value of forbidden) assert.ok(!text.includes(value),"Parent report must not expose classmates, internal IDs, or assessment notes");
  return {sheets:sheets.length,charts:charts.length,images:images.length,bytes:fs.statSync(file).size};
}

module.exports = {checkFamilyWorkbook};
