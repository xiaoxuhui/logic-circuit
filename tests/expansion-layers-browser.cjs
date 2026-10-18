const assert=require('node:assert/strict'),path=require('node:path'),C=require('../src/core.js');let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{if(!server.listening)await new Promise(r=>server.once('listening',r));const browser=await pw.chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
  const n=(id,type,x,extra={})=>({id,type,x,y:0,...extra}),w=(id,a,b,port=0)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}});
  const source={version:1,nodes:[n('i','input',0,{value:0}),n('gate','nand',240),n('o','output',480)],wires:[w('in','i','gate'),w('in2','i','gate',1),w('out','gate','o')],definitions:{}};
  for(const id of ['a','b','c']){source.definitions[id]=C.makeDefinition(source,id);source.nodes[1]={...source.nodes[1],type:'custom',def:id};source.wires=source.wires.filter(w=>w.id!=='in2');}
  await page.locator('#file-input').setInputFiles({name:'layers.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await page.waitForFunction(()=>LogicApp.getState().definitions.c);
  const original=await page.evaluate(()=>LogicApp.getState());
  for(const viewport of [{width:1500,height:1000},{width:390,height:844}]){
    await page.setViewportSize(viewport);const top=await page.locator('#expand').boundingBox(),bottom=await page.locator('#expand-layers').boundingBox();assert.ok(bottom.y>=top.y+top.height);assert.ok(bottom.x+bottom.width<=viewport.width);
  }
  await page.setViewportSize({width:1500,height:1000});await page.locator('#expand-layers').click();await page.locator('#layers-count').fill('0');await page.locator('#layers-form button[type=submit]').click();assert.ok(await page.locator('#layers-dialog').evaluate(el=>el.open));assert.ok(await page.locator('#layers-error').textContent());
  for(const [depth,remaining] of [[1,'b'],[2,'a']]){
    if(depth===2)await page.locator('#expand-layers').click();await page.locator('#layers-count').fill(String(depth));await page.locator('#layers-form button[type=submit]').click();
    assert.equal(await page.evaluate(()=>LogicApp.getView().maxLayers),depth);assert.equal(await page.locator('.expanded-frame').count(),depth);assert.equal(await page.locator('[data-expanded-type=custom]').count(),1);assert.ok((await page.locator('#expand-layers').textContent()).includes('当前 '+depth+' 层'));
    const back=await page.locator('#back-to-circuit').boundingBox(),layers=await page.locator('#expand-layers').boundingBox();assert.ok(back.y>=layers.y+layers.height);
    await page.locator('#selection-panel [data-bit-toggle=i]').click();await page.locator('#next-step').click();await page.selectOption('#number-format','hex');assert.equal(await page.evaluate(()=>LogicApp.getView().maxLayers),depth);assert.equal(await page.locator('.expanded-frame').count(),depth);assert.deepEqual(await page.evaluate(()=>LogicApp.getSimulation().outputs.o),[depth===1?0:1]);
    assert.ok((await page.locator('#node-layer').innerHTML()).includes(remaining));
  }
  await page.locator('#expand').click();assert.equal(await page.evaluate(()=>LogicApp.getView().expanded),false);await page.locator('#expand').click();assert.equal(await page.evaluate(()=>LogicApp.getView().maxLayers),null);assert.equal(await page.locator('.expanded-frame').count(),3);assert.equal(await page.locator('[data-expanded-type=custom]').count(),0);await page.locator('#back-to-circuit').click();
  const after=await page.evaluate(()=>LogicApp.getState());assert.deepEqual(after.definitions,original.definitions);assert.deepEqual(after.nodes,original.nodes);assert.deepEqual(after.wires,original.wires);assert.deepEqual(errors,[]);
  const large=require('./large-expansion-fixture.cjs')();await page.locator('#file-input').setInputFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(large))});await page.waitForFunction(()=>LogicApp.getState().definitions.row);
  for(const [depth,count] of [[1,1002],[2,30002]]){
    await page.locator('#expand-layers').click();await page.locator('#layers-count').fill(String(depth));await page.locator('#layers-form button[type=submit]').click();
    await page.waitForFunction(count=>!LogicApp.getView().pending&&LogicApp.getView().leafCount===count,count,{timeout:60000});assert.equal(await page.evaluate(()=>LogicApp.getView().maxLayers),depth);assert.equal(await page.evaluate(()=>LogicApp.getView().compact),true);
    await page.locator('#next-step').click();await page.waitForFunction(()=>!LogicApp.getView().pending);assert.equal(await page.evaluate(()=>LogicApp.getView().maxLayers),depth);assert.equal(await page.evaluate(()=>LogicApp.getView().leafCount),count);
  }
  await page.locator('#back-to-circuit').click();assert.deepEqual((await page.evaluate(()=>LogicApp.getState())).definitions,large.definitions);assert.deepEqual(errors,[]);
  console.log('PASS layer expansion browser: 1/2/all, input/step/format refresh, validation, collapse, desktop/mobile layout, source preserved');
  console.log('PASS large layer expansion browser: worker preserves 1/2 layer limits and 1002/30002 visible leaves after stepping');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
