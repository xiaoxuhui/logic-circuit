const assert=require('node:assert/strict'),path=require('node:path'),fixture=require('./constant-name-fixture.cjs');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{
 if(!server.listening)await new Promise(r=>server.once('listening',r));const browser=await pw.chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1700,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#file-input').setInputFiles({name:'constant-name.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture()))});await page.waitForFunction(()=>LogicApp.getState().nodes[0].id==='i');
  assert.equal(await page.locator('[data-add="constant"]').textContent().then(s=>s.includes('常数')),true);
  await page.locator('[data-custom="g"]').click({button:'right'});await page.locator('#gate-mode-wire').click();assert.equal(await page.locator('#gate-mode-wire').getAttribute('aria-pressed'),'true');
  const p=await page.locator('[data-wire="selected"] .wire-hit').evaluate(el=>{const p=el.getPointAtLength(el.getTotalLength()/2),m=el.getScreenCTM();return {x:p.x*m.a+p.y*m.c+m.e,y:p.x*m.b+p.y*m.d+m.f};});
  await page.mouse.click(p.x,p.y,{button:'right'});assert.equal(await page.evaluate(()=>LogicApp.getState().definitions.g.nameWire),'selected');assert.equal(await page.locator('[data-wire="selected"] .bus-label').textContent(),'自定义导线');
  await page.locator('#gate-mode-edit').click();await page.locator('[data-node="k"] .body').click({position:{x:60,y:15}});assert.equal(await page.locator('#prop-integer-bits').inputValue(),'2');assert.equal(await page.locator('#prop-fraction-bits').inputValue(),'2');assert.equal(await page.locator('#constant-value').inputValue(),'1.25');
  await page.locator('#constant-value').fill('1.75');await page.locator('#constant-value-form button').click();
  await page.locator('#back-to-circuit').click();assert.equal(await page.locator('[data-node="g"] .node-title').textContent(),'功能_3');assert.equal((await page.evaluate(()=>LogicApp.getState().definitions.g.inputs)).length,1);
  await page.locator('[data-bit-toggle="i"][data-bit="2"]').click();assert.equal(await page.locator('[data-node="g"] .node-title').textContent(),'功能_7');
  assert.deepEqual(await page.evaluate(()=>LogicApp.getSimulation().values.g[1]),[1,1,1,0]);
  // Left-enter the instance; constants can be changed from the internal right-click panel.
  await page.locator('[data-node="g"] .body').click({position:{x:70,y:15}});await page.locator('[data-expanded-node="k"] rect').first().click({button:'right',position:{x:60,y:15}});
  assert.equal(await page.locator('#constant-value').inputValue(),'1.75');await page.locator('#constant-value').fill('2.5');await page.locator('#constant-value-form button').click();await page.locator('#exit-gate').click();
  assert.equal(await page.locator('[data-node="g"] .node-title').textContent(),'功能_7');assert.equal(await page.evaluate(()=>LogicApp.getState().definitions.g.nodes.find(n=>n.id==='k').value),10);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('logic-workshop-v1')||'{}').definitions?.g?.nodes.find(n=>n.id==='k').value===10);await page.reload();
  assert.equal(await page.locator('[data-node="g"] .node-title').textContent(),'功能_7');assert.equal(await page.evaluate(()=>LogicApp.getState().definitions.g.inputs.length),1);assert.deepEqual(errors,[]);
  console.log('PASS browser: constant palette, own integer/fraction/value, excluded public input, selected internal wire drives gate name, runtime changes, instance editing and save/reload');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
