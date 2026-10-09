import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {savedHistory,clock,storageKey} from './saved-history-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fileURLToPath(new URL('../web/',import.meta.url));
const server=http.createServer(async(req,res)=>{
  try {
    const target=path.resolve(root,`.${new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html')}`);
    if(!target.startsWith(root)){res.writeHead(403).end();return;}
    res.setHeader('Content-Type',{'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'}[path.extname(target)]||'application/octet-stream');
    let body=await fs.readFile(target);
    if(path.basename(target)==='model.js')body=body.toString()+`;window.__scheduleCalls=0;const originalScheduledPlan=window.TrackerModel.scheduledPlan;window.TrackerModel.scheduledPlan=(...args)=>{window.__scheduleCalls++;return originalScheduledPlan(...args);};`;
    res.end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
const context=await browser.newContext(),page=await context.newPage(),errors=[],samples=[];
page.on('pageerror',error=>errors.push(error.message));
const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
async function click(label,selector) {
  const result=await page.evaluate(selector=>{
    const button=document.querySelector(selector);if(!button||button.disabled)throw new Error('Expected an enabled test control');
    window.__scheduleCalls=0;const start=performance.now();button.click();
    return {handlerMs:performance.now()-start,scheduleCalls:window.__scheduleCalls};
  },selector);
  samples.push({label,...result});
}
try {
  await page.clock.setFixedTime(new Date(clock));
  await page.addInitScript(({key,state})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(state));},{key:storageKey,state:savedHistory()});
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'load'});
  const before=await saved();
  await click('switch child','#studentList [data-student-id="child-1"]');
  let current=await saved();assert.equal(current.selectedStudentId,'child-1');assert.deepEqual(current.records,before.records);assert.deepEqual(current.monthlyExams,before.monthlyExams);
  await click('Knows it','[data-item-index="1"][data-state="known"]');
  current=await saved();assert.equal(current.records['child-1::2026-09-14'].itemStates[1],'known');assert.equal(current.records['child-1::2026-09-14'].practiceFinished,false);
  await click('Needs practice','[data-item-index="1"][data-state="learning"]');
  current=await saved();assert.equal(current.records['child-1::2026-09-14'].itemStates[1],'learning');assert.equal(current.records['child-1::2026-09-14'].practiceFinished,false);
  await click('next week','#nextWeekButton');assert.equal((await saved()).selectedWeekStart,'2026-09-21');
  await click('last unlocked week','#nextWeekButton');assert.equal((await saved()).selectedWeekStart,'2026-09-28');
  await click('locked next month','#nextWeekButton');assert.equal((await saved()).selectedWeekStart,'2026-09-28');assert.equal(await page.locator('#examRequiredDialog').isVisible(),true);
  current=await saved();assert.deepEqual(current.monthlyExams,before.monthlyExams,'Reading and practice marks must preserve all saved exam answers');
  for(const [key,value]of Object.entries(before.records))if(key!=='child-1::2026-09-14')assert.deepEqual(current.records[key],value);
  await page.reload({waitUntil:'load'});assert.deepEqual((await saved()).records,current.records);assert.deepEqual((await saved()).monthlyExams,current.monthlyExams);
  assert.deepEqual(errors,[]);console.log(JSON.stringify(samples,null,2));
  for(const sample of samples){assert.ok(sample.scheduleCalls<2000,`${sample.label}: ${sample.scheduleCalls} repeated schedule calculations`);assert.ok(sample.handlerMs<350,`${sample.label}: blocked for ${sample.handlerMs.toFixed(1)}ms`);}
  console.log('PASS saved-history UI response, marks, exam locks, and reload preservation (synthetic data only).');
}finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
