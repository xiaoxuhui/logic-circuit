const assert=require('node:assert/strict'),path=require('node:path');let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{if(!server.listening)await new Promise(r=>server.once('listening',r));const browser=await pw.chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const fill=CanvasRenderingContext2D.prototype.fillText;window.drawnLabels=[];CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.drawnLabels.push(String(text));return fill.call(this,text,...args);};});
  await page.goto('http://127.0.0.1:'+server.address().port);const source=require('./minecraft-adder-fixture.cjs')();
  await page.locator('#file-input').setInputFiles({name:'independent-nested-adder.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await page.waitForFunction(()=>LogicApp.getState().nodes.length===10);
  const before=await page.evaluate(()=>LogicApp.getState()),view=()=>page.evaluate(()=>LogicMinecraftView.getStatus());
  await page.locator('#minecraft-open').click();await page.waitForFunction(()=>LogicMinecraftView.getStatus().active&&!LogicMinecraftView.getStatus().loading);assert.equal((await view()).basis,'nand');assert.equal((await view()).unrouted,0);
  await page.locator('#minecraft-basis').selectOption('or-not');await page.waitForFunction(()=>LogicMinecraftView.getStatus().basis==='or-not'&&!LogicMinecraftView.getStatus().loading);
  assert.equal((await view()).unrouted,0);assert.equal((await view()).optimization.renderedNands,0);assert.equal((await view()).nestedGates.filter(g=>g.name==='XOR').length,3);
  assert.match(await page.locator('#minecraft-summary').textContent(),/或门＋非门.*或门.*非门/);assert.match(await page.locator('#minecraft-hierarchy-list').textContent(),/XOR/);assert.match(await page.locator('#minecraft-hierarchy-list').textContent(),/AND/);assert.equal(await page.locator('#minecraft-running').getAttribute('aria-pressed'),'false');
  await page.locator('#minecraft-home').click();await page.evaluate(()=>new Promise(requestAnimationFrame));
  for(const mask of [0,1,3,2,6,7,5,4]){for(const [bit,id] of ['a','b','c'].entries()){const lever=(await view()).levers.find(l=>l.id===id),value=!!(mask>>bit&1);if(lever.on!==value){await page.mouse.click(lever.screen.x,lever.screen.y,{button:'right'});await page.waitForFunction(({id,value})=>LogicMinecraftView.getStatus().levers.find(l=>l.id===id).on===value,{id,value});}}
    const tick=(await view()).tick;await page.locator('#minecraft-step').click();await page.evaluate(()=>{for(let i=0;i<399;i++)document.getElementById('minecraft-step').click();});await page.waitForFunction(t=>LogicMinecraftView.getStatus().tick===t+400,tick);
    const sum=(mask&1)+(mask>>1&1)+(mask>>2&1);for(const l of (await view()).lamps)assert.equal(l.on,l.id==='sum'?!!(sum&1):sum>=2,'browser row '+mask+' '+l.id);
  }
  await page.locator('#minecraft-overview').click();await page.screenshot({path:path.resolve('tests/artifacts/minecraft-or-not-mode.png')});
  const drawn=await page.evaluate(()=>window.drawnLabels);assert.ok(drawn.includes('非门 NOT'));assert.ok(drawn.includes('或门 OR'));assert.ok(!drawn.some(s=>s.includes('bundefined')));
  await page.setViewportSize({width:430,height:850});assert.equal(await page.locator('#minecraft-basis').isVisible(),true);assert.equal(await page.locator('#minecraft-close').isVisible(),true);await page.screenshot({path:path.resolve('tests/artifacts/minecraft-or-not-mobile.png')});
  await page.locator('#minecraft-basis').selectOption('nand');await page.waitForFunction(()=>LogicMinecraftView.getStatus().basis==='nand'&&!LogicMinecraftView.getStatus().loading);assert.equal((await view()).unrouted,0);assert.equal(await page.locator('#minecraft-hierarchy').isVisible(),true);
  await page.setViewportSize({width:1500,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.locator('#minecraft-close').click();assert.deepEqual(await page.evaluate(()=>LogicApp.getState()),before);assert.deepEqual(errors,[]);
  console.log('PASS basis mode: NAND/OR-NOT switch, nested XOR/AND labels and scopes, eight physical adder rows, pause, mobile controls and unchanged original save');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
