const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{if(!server.listening)await new Promise(r=>server.once('listening',r));const browser=await pw.chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#file-input').setInputFiles({name:'independent-direct-adder.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(require('./minecraft-adder-fixture.cjs')()))});
  await page.waitForFunction(()=>LogicApp.getState().nodes.some(n=>n.id==='sum'));const before=await page.evaluate(()=>LogicApp.getState());
  await page.locator('#minecraft-open').click();await page.locator('#minecraft-basis').selectOption('nand');
  for(const basis of ['nand','or-not']){
    if(basis==='or-not')await page.locator('#minecraft-basis').selectOption(basis);
    await page.waitForFunction(b=>!LogicMinecraftView.getStatus().loading&&LogicMinecraftView.getStatus().basis===b,basis);
    await page.locator('#minecraft-home').click();await page.evaluate(()=>new Promise(requestAnimationFrame));
    const lever=await page.evaluate(()=>LogicMinecraftView.getStatus().levers.find(l=>l.id==='b'));
    await page.mouse.click(lever.screen.x,lever.screen.y,{button:'right'});
    await page.waitForFunction(()=>LogicMinecraftView.getStatus().pending>0);
    await page.locator('#minecraft-direct').click();
    await page.waitForFunction(()=>!LogicMinecraftView.getStatus().directSettling&&LogicMinecraftView.getStatus().pending===0&&LogicMinecraftView.getStatus().lamps.find(l=>l.id==='sum').on);
    assert.equal(await page.locator('#minecraft-running').getAttribute('aria-pressed'),'false');
    await page.locator('#minecraft-direct-running').click();
    await page.waitForFunction(()=>LogicMinecraftView.getStatus().directRunning);
    const continuous=await page.evaluate(()=>LogicMinecraftView.getStatus());assert.equal(continuous.directFrameMs,30);assert.ok(continuous.instances>0);
    assert.match(await page.locator('#minecraft-signals').textContent(),/0\.03秒\/帧/);
    await page.mouse.click(lever.screen.x,lever.screen.y,{button:'right'});
    await page.waitForFunction(()=>!LogicMinecraftView.getStatus().directSettling&&LogicMinecraftView.getStatus().pending===0&&!LogicMinecraftView.getStatus().lamps.find(l=>l.id==='sum').on);
    assert.equal(await page.evaluate(()=>LogicMinecraftView.getStatus().instances),continuous.instances,'visible components must stay in place');
    assert.match(await page.locator('#minecraft-signals').textContent(),/持续直接运行/);
    await page.locator('#minecraft-running').click();await page.waitForFunction(()=>!LogicMinecraftView.getStatus().directRunning);
    assert.equal(await page.locator('#minecraft-direct-running').getAttribute('aria-pressed'),'false');
    await page.locator('#minecraft-running').click();
    fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});await page.screenshot({path:path.join(__dirname,'artifacts/minecraft-direct-'+basis+'.png')});
  }
  await page.locator('#minecraft-close').click();assert.deepEqual(await page.evaluate(()=>LogicApp.getState()),before);
  const oscillator={version:1,definitions:{},nodes:[{id:'g',type:'nand',x:0,y:0},{id:'o',type:'output',x:200,y:0}],wires:[0,1].map(port=>({id:'f'+port,a:{node:'g',dir:'out',port:0},b:{node:'g',dir:'in',port}})).concat([{id:'o',a:{node:'g',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}])};
  await page.locator('#file-input').setInputFiles({name:'independent-feedback.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oscillator))});
  await page.waitForFunction(()=>LogicApp.getState().nodes.length===2);const feedbackBefore=await page.evaluate(()=>LogicApp.getState());
  await page.locator('#minecraft-open').click();await page.waitForFunction(()=>!LogicMinecraftView.getStatus().loading);
  await page.locator('#minecraft-direct-running').click();await page.waitForFunction(()=>LogicMinecraftView.getStatus().directRunning);
  for(const expected of [true,false,true])await page.waitForFunction(expected=>LogicMinecraftView.getStatus().lamps[0].on===expected,expected);
  assert.equal(await page.locator('#minecraft-direct-running').getAttribute('aria-pressed'),'true');
  assert.doesNotMatch(await page.locator('#minecraft-message').textContent(),/已停止/);
  await page.locator('#minecraft-direct-running').click();await page.waitForFunction(()=>!LogicMinecraftView.getStatus().directRunning);
  const paused=await page.evaluate(()=>LogicMinecraftView.getStatus().lamps[0].on);await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>LogicMinecraftView.getStatus().lamps[0].on),paused);
  await page.screenshot({path:path.join(__dirname,'artifacts/minecraft-direct-feedback.png')});
  await page.locator('#minecraft-close').click();assert.deepEqual(await page.evaluate(()=>LogicApp.getState()),feedbackBefore);assert.deepEqual(errors,[]);
  console.log('PASS direct buttons: physical outputs in both bases, continuous feedback advances without input, live output updates, explicit stop and unchanged saves');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
