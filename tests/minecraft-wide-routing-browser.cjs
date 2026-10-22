const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{
  if(!server.listening)await new Promise(r=>server.once('listening',r));
  const browser=await pw.chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.locator('#file-input').setInputFiles({name:'independent-eight-bit-adder.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(require('./minecraft-wide-adder-fixture.cjs')()))});
    await page.waitForFunction(()=>LogicApp.getState().nodes.some(n=>n.id==='f7'));
    const before=await page.evaluate(()=>LogicApp.getState());
    await page.locator('#minecraft-open').click();await page.locator('#minecraft-basis').selectOption('nand');
    for(const basis of ['nand','or-not']){
      if(basis==='or-not')await page.locator('#minecraft-basis').selectOption(basis);
      await page.waitForFunction(b=>!LogicMinecraftView.getStatus().loading&&LogicMinecraftView.getStatus().basis===b,basis,{timeout:120000});
      const status=await page.evaluate(()=>LogicMinecraftView.getStatus());
      assert.equal(status.unrouted,0);
      assert.equal(status.levers.length,17);
      assert.equal(status.lamps.length,9);
      assert.equal(status.lamps.filter(l=>l.on).length,0);
      assert.doesNotMatch(await page.locator('#minecraft-signals').textContent(),/未布通/);
      assert.equal(await page.locator('#minecraft-stage canvas').count(),1);
      fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
      await page.screenshot({path:path.join(__dirname,'artifacts/minecraft-wide-routing-'+basis+'.png')});
    }
    await page.locator('#minecraft-close').click();
    assert.deepEqual(await page.evaluate(()=>LogicApp.getState()),before);
    assert.deepEqual(errors,[]);
    console.log('PASS independent eight-bit adder: both physical bases have 17 levers, 9 lamps and no unrouted connections; source unchanged');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
