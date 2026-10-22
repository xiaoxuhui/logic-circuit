const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{if(!server.listening)await new Promise(r=>server.once('listening',r));const browser=await pw.chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  const source={version:1,definitions:{},nodes:[{id:'i',type:'input',x:0,y:0,bits:8},{id:'d',type:'delay',x:300,y:0,bits:8},{id:'o',type:'output',x:600,y:0,bits:8}],wires:[{id:'i',a:{node:'i',dir:'out',port:0},b:{node:'d',dir:'in',port:0}},{id:'o',a:{node:'d',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}]};
  await page.locator('#file-input').setInputFiles({name:'independent-materials.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await page.waitForFunction(()=>LogicApp.getState().nodes.some(n=>n.id==='d'));
  const before=await page.evaluate(()=>LogicApp.getState());await page.locator('#minecraft-open').click();await page.waitForFunction(()=>!LogicMinecraftView.getStatus().loading);
  const counts=await page.evaluate(()=>LogicMinecraftView.getStatus().materialCounts);assert.equal(counts.lever,8);assert.equal(counts.lamp,8);assert.equal(counts.torch,0);
  for(const [kind,value] of Object.entries(counts))if(kind!=='slab')assert.match(await page.locator('[data-material="'+kind+'"]').textContent(),new RegExp(value.toLocaleString()+'$'));
  assert.equal(await page.locator('#minecraft-materials span').count(),6);const initial=await page.locator('#minecraft-materials').textContent();
  await page.locator('#minecraft-direct-running').click();await page.waitForFunction(()=>LogicMinecraftView.getStatus().directRunning);assert.equal(await page.locator('#minecraft-materials').textContent(),initial);
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});await page.screenshot({path:path.join(__dirname,'artifacts/minecraft-materials-desktop.png')});
  await page.setViewportSize({width:390,height:900});await page.evaluate(()=>new Promise(requestAnimationFrame));
  assert.equal(await page.locator('#minecraft-materials').isVisible(),true);const info=await page.locator('.minecraft-info').boundingBox(),legend=await page.locator('.minecraft-legend').boundingBox();assert.ok(info.y+info.height<=legend.y||info.x+info.width<=legend.x,'materials and legend must not overlap on mobile');
  await page.screenshot({path:path.join(__dirname,'artifacts/minecraft-materials-mobile.png')});await page.setViewportSize({width:1500,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.locator('#minecraft-close').click();assert.deepEqual(await page.evaluate(()=>LogicApp.getState()),before);assert.deepEqual(errors,[]);
  console.log('PASS six real material counts, preserved while bypassing delays, desktop/mobile visibility and unchanged save');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
