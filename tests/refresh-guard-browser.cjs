const assert=require('node:assert/strict'),path=require('node:path');let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{if(!server.listening)await new Promise(r=>server.once('listening',r));const browser=await pw.chromium.launch({headless:true});try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port,key='logic-workshop-v1',backup='logic-workshop-refresh-backups-v1';
  await page.goto(url);await page.locator('#file-input').setInputFiles({name:'guard.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,nodes:[{id:'i',type:'input',x:0,y:0,value:0}],wires:[],definitions:{}}))});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('logic-workshop-v1')||'{}').nodes?.[0]?.id==='i');
  await page.evaluate(()=>{window.storageFault='all';const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(window.storageFault==='all'||window.storageFault==='primary'&&k==='logic-workshop-v1')throw new DOMException('Injected storage failure','QuotaExceededError');return original.call(this,k,v);};});
  await page.locator('[data-toggle=i]').click();await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),true);
  const dialogWait=page.waitForEvent('dialog');await page.evaluate(()=>setTimeout(()=>location.reload(),0));const dialog=await dialogWait;assert.equal(dialog.type(),'beforeunload');await dialog.dismiss();
  assert.equal(await page.evaluate(()=>LogicApp.getState().nodes[0].value),1);assert.match(await page.locator('#save-status').textContent(),/失败|无法|不可用/);
  await page.evaluate(()=>window.storageFault=null);await page.reload();assert.equal(await page.evaluate(()=>LogicApp.getState().nodes[0].value),1);
  console.log('PASS refresh guard: all storage writes fail, real reload can be cancelled, retry saves current input');

  await page.evaluate(()=>{const clone=LogicCore.clone;LogicCore.clone=()=>{throw Error('Injected snapshot failure');};const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);window.snapshotBlocked=e.defaultPrevented;LogicCore.clone=clone;});assert.equal(await page.evaluate(()=>window.snapshotBlocked),true);
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='logic-workshop-v1')throw new DOMException('Injected primary failure','QuotaExceededError');return original.call(this,k,v);};});
  await page.locator('[data-toggle=i]').click();await page.reload();assert.equal(await page.evaluate(()=>LogicApp.getState().nodes[0].value),0);
  assert.ok(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).some(item=>JSON.parse(item.text).nodes[0]?.value===0),backup));
  console.log('PASS refresh guard: snapshot failure requests cancellation; backup-only checkpoint automatically recovers latest state');

  const context=await browser.newContext();await context.addInitScript(({key})=>{const source=JSON.stringify({version:1,nodes:[{id:'saved',type:'input',x:0,y:0,value:1}],wires:[],definitions:{}});localStorage.setItem(key,source);const get=Storage.prototype.getItem;window.readOriginal=()=>get.call(localStorage,key);Storage.prototype.getItem=function(k){if(k===key)throw new DOMException('Injected read failure','SecurityError');return get.call(this,k);};},{key});
  const unreadable=await context.newPage();unreadable.on('pageerror',e=>errors.push(e.message));await unreadable.goto(url);const original=await unreadable.evaluate(()=>window.readOriginal());await unreadable.waitForTimeout(300);
  assert.equal(await unreadable.evaluate(()=>window.readOriginal()),original);await unreadable.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await unreadable.evaluate(()=>window.readOriginal()),original);
  assert.equal(await unreadable.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),true);
  assert.deepEqual(errors,[]);console.log('PASS refresh guard: initial storage read failure never overwrites source on auto-save or pagehide, no page errors');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
