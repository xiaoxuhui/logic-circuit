const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),C=require('../src/core.js');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{
  if(!server.listening)await new Promise(r=>server.once('listening',r));
  const browser=await pw.chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    const source=require('./minecraft-junction-fixture.cjs')(),before=C.clone(source);
    await page.locator('#file-input').setInputFiles({name:'independent-rename.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
    await page.waitForFunction(()=>LogicApp.getState().nodes.some(n=>n.id==='hold'));
    const old=source.definitions.and.name;await page.locator('[data-custom="and"]').click({button:'right'});
    const name=page.locator('#gate-definition-name');assert.equal(await name.inputValue(),old);
    await name.fill('新的与门');await name.press('Enter');
    assert.equal(await page.evaluate(()=>LogicApp.getState().definitions.and.name),'新的与门');
    assert.match(await page.locator('[data-custom="and"]').textContent(),/新的与门/);
    await page.keyboard.press('Control+z');assert.equal(await name.inputValue(),old);
    await page.keyboard.press('Control+Shift+z');assert.equal(await name.inputValue(),'新的与门');
    await name.fill('   ');await name.press('Enter');assert.equal(await name.inputValue(),'新的与门');
    await page.locator('#gate-mode-view').click();assert.equal(await name.isDisabled(),true);
    await page.locator('#gate-mode-edit').click();assert.equal(await name.isDisabled(),false);
    await page.locator('#back-to-circuit').click();
    for(const id of ['set','hold'])assert.equal(await page.locator('[data-node="'+id+'"] .node-title').textContent(),'新的与门');
    let after=await page.evaluate(()=>LogicApp.getState());before.definitions.and.name='新的与门';assert.deepEqual(after.nodes,before.nodes);assert.deepEqual(after.wires,before.wires);assert.deepEqual(after.definitions,before.definitions);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('logic-workshop-v1')||'{}').definitions?.and?.name==='新的与门');
    await page.reload();assert.equal(await page.evaluate(()=>LogicApp.getState().definitions.and.name),'新的与门');
    await page.locator('[data-custom="and"]').click({button:'right'});fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});await page.screenshot({path:path.join(__dirname,'artifacts/gate-rename.png')});
    assert.deepEqual(errors,[]);console.log('PASS gate rename: definition, repeated instances, undo/redo, validation, readonly mode, unchanged topology and persistence');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
