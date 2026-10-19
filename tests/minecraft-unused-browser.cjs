const assert=require('node:assert/strict'),path=require('node:path');let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{
  if(!server.listening)await new Promise(r=>server.once('listening',r));
  const browser=await pw.chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
    const source=require('./minecraft-unused-fixture.cjs')();
    await page.locator('#file-input').setInputFiles({name:'unused-components.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
    await page.waitForFunction(()=>LogicApp.getState().nodes.length===6);
    const before=await page.evaluate(()=>LogicApp.getState()),view=()=>page.evaluate(()=>LogicMinecraftView.getStatus());
    await page.locator('#minecraft-open').click();await page.waitForFunction(()=>LogicMinecraftView.getStatus().active&&!LogicMinecraftView.getStatus().loading);
    assert.equal((await view()).components,3);assert.equal((await view()).unrouted,0);assert.deepEqual((await view()).levers.map(l=>l.id),['a']);
    await page.locator('#minecraft-home').click();
    for(const value of [false,true,false]){
      const lever=(await view()).levers[0];if(lever.on!==value){await page.mouse.click(lever.screen.x,lever.screen.y,{button:'right'});await page.waitForFunction(v=>LogicMinecraftView.getStatus().levers[0].on===v,value);}
      const tick=(await view()).tick;for(let i=0;i<40;i++)await page.locator('#minecraft-step').click();await page.waitForFunction(t=>LogicMinecraftView.getStatus().tick===t+40,tick);
      assert.equal((await view()).lamps[0].on,!value);
    }
    await page.locator('#minecraft-overview').click();await page.screenshot({path:path.resolve('tests/artifacts/minecraft-unused-components.png')});
    await page.locator('#minecraft-close').click();assert.deepEqual(await page.evaluate(()=>LogicApp.getState()),before);
    source.nodes=source.nodes.filter(n=>n.type!=='output');source.wires=source.wires.filter(w=>w.b.node!=='o');
    await page.locator('#file-input').setInputFiles({name:'no-outputs.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
    await page.waitForFunction(()=>LogicApp.getState().nodes.length===5);await page.locator('#minecraft-open').click();
    await page.waitForFunction(()=>LogicMinecraftView.getStatus().active&&!LogicMinecraftView.getStatus().loading);
    assert.equal((await view()).components,0);assert.equal((await view()).instances,0);assert.deepEqual(errors,[]);
    console.log('PASS unused components: private custom sinks, delays, exclusive lever omitted; shared input and output work; source unchanged; no-output scene empty');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
