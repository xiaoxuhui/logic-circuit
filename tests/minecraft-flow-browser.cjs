const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{
  if(!server.listening)await new Promise(r=>server.once('listening',r));
  const browser=await pw.chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#file-input').setInputFiles({name:'independent-junction-feedback.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(require('./minecraft-junction-fixture.cjs')()))});
    await page.waitForFunction(()=>LogicApp.getState().nodes.some(n=>n.id==='hold'));
    const before=await page.evaluate(()=>LogicApp.getState());
    await page.locator('#minecraft-open').click();
    for(const basis of ['or-not']){
      if(basis==='or-not')await page.locator('#minecraft-basis').selectOption(basis);
      await page.waitForFunction(b=>!LogicMinecraftView.getStatus().loading&&LogicMinecraftView.getStatus().basis===b,basis,{timeout:120000});
      const status=await page.evaluate(()=>LogicMinecraftView.getStatus());
      assert.equal(status.unrouted,0);assert.ok(status.flowArrowCount>0);assert.ok(status.flowSegmentCount>status.flowArrowCount);assert.match(await page.locator('.minecraft-legend').textContent(),/连续流向/);await page.locator('#minecraft-home').click();await page.evaluate(()=>new Promise(requestAnimationFrame));
      assert.equal(status.levers.length,2);
      assert.equal(status.lamps.length,1);
      assert.equal(status.lamps.filter(l=>l.on).length,0);
      assert.doesNotMatch(await page.locator('#minecraft-signals').textContent(),/未布通/);
      assert.equal(await page.locator('#minecraft-stage canvas').count(),1);
      fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
      await page.screenshot({path:path.join(__dirname,'artifacts/minecraft-flow-'+basis+'.png')});assert.equal((await page.evaluate(()=>LogicMinecraftView.getStatus())).flowHeadPixels,22);await page.locator('#minecraft-overview').click();await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal((await page.evaluate(()=>LogicMinecraftView.getStatus())).flowHeadPixels,22);await page.screenshot({path:path.join(__dirname,'artifacts/minecraft-flow-overview.png')});
    }
    await page.locator('#minecraft-close').click();
    assert.deepEqual(await page.evaluate(()=>LogicApp.getState()),before);
    assert.deepEqual(errors,[]);
    console.log('PASS flow arrows: visible legend, nonzero instanced arrows, intact routing, unchanged source');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
