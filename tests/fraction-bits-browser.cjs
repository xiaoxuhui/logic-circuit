const assert=require('node:assert/strict'),path=require('node:path');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{
 if(!server.listening)await new Promise(r=>server.once('listening',r));const browser=await pw.chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  const source={version:1,definitions:{},nodes:[{id:'i',type:'input',bits:4,value:3,x:0,y:0},{id:'o',type:'output',bits:4,x:400,y:0},{id:'h',type:'hub',bits:4,x:0,y:200},{id:'s',type:'splitter',bits:4,x:400,y:200}],wires:[{id:'w',a:{node:'i',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}]};
  await page.locator('#file-input').setInputFiles({name:'per-component.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await page.waitForFunction(()=>LogicApp.getState().nodes[0].id==='i');
  assert.equal(await page.locator('#fraction-bits').count(),0);
  const labels=()=>page.locator('#node-layer .decimal-summary').allTextContents();
  async function select(id){await page.locator('[data-node="'+id+'"] .body').click({position:{x:65,y:15}});}
  async function property(id,value){await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Enter');}
  await select('i');assert.equal(await page.locator('#prop-integer-bits').inputValue(),'4');assert.equal(await page.locator('#prop-fraction-bits').inputValue(),'0');
  await property('prop-integer-bits',2);await property('prop-fraction-bits',2);assert.deepEqual(await labels(),['0.75','3']);
  await select('o');await property('prop-integer-bits',2);await property('prop-fraction-bits',2);assert.deepEqual(await labels(),['0.75','0.75']);
  await property('prop-integer-bits',0);assert.equal(await page.locator('#prop-integer-bits').inputValue(),'2');
  for(const id of ['h','s']){await select(id);await page.locator('#bus-dialog').waitFor({state:'visible'});await page.locator('#bus-count').fill('2');await page.locator('#bus-fraction-count').fill('2');await page.locator('#bus-confirm').click();}
  const result=await page.evaluate(()=>LogicApp.getState());for(const n of result.nodes){assert.equal(n.bits,4);assert.equal(n.fractionBits,2);}assert.deepEqual(result.wires,source.wires);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('logic-workshop-v1')||'{}').nodes?.every(n=>n.fractionBits===2));await page.reload();assert.deepEqual(await labels(),['0.75','0.75']);assert.equal(await page.locator('#fraction-bits').count(),0);
  await page.locator('[data-node="i"] .body').click({button:'right',position:{x:65,y:15}});assert.equal(await page.locator('#component-integer-bits').inputValue(),'2');assert.equal(await page.locator('#component-fraction-bits').inputValue(),'2');
  await property('component-fraction-bits',0);assert.deepEqual(await labels(),['3','0.75']);
  assert.deepEqual(errors,[]);console.log('PASS browser: global field removed, per-IO precision, integer minimum, hub/splitter integer+fraction dialog, right-click fields, wires preserved and save/reload');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
