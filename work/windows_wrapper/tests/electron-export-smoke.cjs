const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { _electron } = require(process.env.SEATRACKER_PLAYWRIGHT || "playwright");
const {XLSX_MIME} = require("../xlsx-export");

// The native Save dialog is replaced only inside this isolated test process.
(async () => {
  const wrapper = path.resolve(__dirname,"..");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),"etonhouse-export-smoke-"));
  const workbook = await fs.readFile(path.resolve(__dirname,"../../seahorse_app/web/assets/Student names template.xlsx"));
  const output = path.join(directory,"Synthetic monthly report.xlsx");
  const payload = {filename:"Synthetic monthly report.xlsx",base64:workbook.toString("base64"),mimeType:XLSX_MIME};
  let instance;
  try {
    instance = await _electron.launch({executablePath:require("electron"),args:[wrapper],env:{...process.env,SEAHORSE_TEST_DATA_DIRECTORY:directory,SEAHORSE_TEST_HIDE_WINDOW:"1"}});
    assert.equal(await instance.evaluate(({app})=>app.getPath("userData")),directory);
    const page = await instance.firstWindow();
    await page.locator("#manageClassesButton").waitFor({state:"visible"});
    await page.evaluate(()=>{
      window.__exportTestResults=[]; window.__exportTestErrors=[];
      window.SeahorseDesktop.onExportResult(detail=>window.__exportTestResults.push(detail));
      window.SeahorseDesktop.onError(detail=>window.__exportTestErrors.push(detail));
    });
    const setDialog = result=>instance.evaluate(({dialog},result)=>{
      globalThis.__exportDialogResult=result;
      globalThis.__exportDialogCalls=0;
      dialog.showSaveDialog=async (_window,options)=>{
        globalThis.__exportDialogCalls++;
        globalThis.__exportDialogOptions=options;
        return globalThis.__exportDialogResult;
      };
    },result);
    const send = value=>page.evaluate(value=>window.webkit.messageHandlers.exportFile.postMessage(value),value);
    await setDialog({canceled:false,filePath:output});
    assert.equal((await send(payload)).ok,true);
    await page.waitForFunction(()=>window.__exportTestResults.length===1);
    assert.ok((await fs.readFile(output)).equals(workbook),"Saved workbook bytes must match exactly");
    const options = await instance.evaluate(()=>globalThis.__exportDialogOptions);
    assert.equal(options.title,"Save Excel report");
    assert.equal(options.defaultPath,payload.filename);
    assert.deepEqual(options.filters[0].extensions,["xlsx"]);
    assert.deepEqual(await page.evaluate(()=>window.__exportTestResults[0]),{ok:true,operation:"exportFile",filename:payload.filename});

    await setDialog({canceled:true});
    assert.deepEqual(await send(payload),{ok:false,canceled:true,operation:"exportFile"});
    await page.waitForFunction(()=>window.__exportTestResults.length===2);
    assert.equal(await page.evaluate(()=>window.__exportTestResults.filter(result=>result.ok).length),1,"Cancel must not emit saved success");
    assert.deepEqual(await page.evaluate(()=>window.__exportTestResults[1]),{ok:false,canceled:true,operation:"exportFile"});
    assert.ok((await fs.readFile(output)).equals(workbook),"Cancel must leave existing files unchanged");

    await setDialog({canceled:false,filePath:path.join(directory,"should-not-exist.xlsx")});
    assert.equal((await send({...payload,filename:"../escape.xlsx"})).ok,false);
    assert.equal(await instance.evaluate(()=>globalThis.__exportDialogCalls),0,"Reject unsafe names before opening the dialog");
    assert.equal((await send({...payload,base64:"invalid data"})).ok,false);
    assert.equal(await instance.evaluate(()=>globalThis.__exportDialogCalls),0,"Reject bad bytes before opening the dialog");
    const wrongExtension = path.join(directory,"should-not-exist.txt");
    await setDialog({canceled:false,filePath:wrongExtension});
    assert.equal((await send(payload)).ok,false);
    await assert.rejects(fs.access(wrongExtension));
    assert.equal(await page.evaluate(()=>window.__exportTestResults.filter(result=>result.ok).length),1);

    const templateOutput = path.join(directory,"Saved template.xlsx");
    await setDialog({canceled:false,filePath:templateOutput});
    assert.equal((await send({asset:"Student names template.xlsx"})).ok,true);
    assert.equal(await instance.evaluate(()=>globalThis.__exportDialogOptions.title),"Save Excel template");
    assert.ok((await fs.readFile(templateOutput)).equals(workbook));
    assert.equal((await fs.readdir(directory)).filter(name=>name.endsWith(".tmp")).length,0,"No abandoned export temporary files");
    await instance.close(); instance=null;
    console.log("Electron XLSX export bridge passed on macOS: report bytes and title, atomic save, truthful success/cancel events, safe filenames, invalid data rejection, extension enforcement and legacy template export.");
  } finally {
    if(instance) await instance.close();
    await fs.rm(directory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
