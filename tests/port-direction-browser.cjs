const assert=require('node:assert/strict'),path=require('node:path'),C=require('../src/core.js');let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{if(!server.listening)await new Promise(r=>server.once('listening',r));const browser=await pw.chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 const n=(id,type,x,rotation)=>({id,type,x,y:0,rotation}),p=(node,dir='out',port=0)=>({node,dir,port});
 async function load(s){await page.locator('#file-input').setInputFiles({name:'direction.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await page.waitForFunction(()=>document.getElementById('file-input').value==='');await page.locator('#fit').click();}
 for(const rotation of [0,90,180,270]){
  const s={version:1,definitions:{},nodes:[{...n('i','input',0,rotation),value:1},n('target','nand',400,rotation),n('o','output',800,rotation)],wires:[{id:'a',a:p('i'),b:p('target','in')},{id:'b',a:p('i'),b:p('target','in',1)},{id:'q',a:p('target'),b:p('o','in')}]};
  s.definitions.inner=C.makeDefinition(s,'内部朝向');s.nodes.push({...n('inner','custom',1200,rotation),def:'inner'});
  await load(s);await page.locator('[data-node=target] .body').click({button:'right'});await page.locator('#replace-gate').selectOption('delay');await page.locator('#apply-replacement').click();const after=await page.evaluate(()=>LogicApp.getState());assert.equal(after.nodes.find(n=>n.id==='target').rotation,rotation);
  for(const node of after.nodes)assert.equal(await page.locator('[data-node='+node.id+'] > g').getAttribute('transform'),C.rotationTransform(node,after.definitions));
  await page.locator('#close-delay-inspector').click();await page.locator('#expand').click();await page.waitForSelector('[data-expanded-node=target]');
  for(const node of after.nodes.filter(n=>n.type!=='custom'))assert.equal(await page.locator('[data-expanded-node='+node.id+'] > g').getAttribute('transform'),C.rotationTransform(node,{}));
  await page.locator('#expand').click();assert.equal((await page.evaluate(()=>LogicApp.getState())).nodes.find(n=>n.id==='target').rotation,rotation);
  await page.locator('[data-node=inner]').click();for(const node of s.definitions.inner.nodes)assert.equal(await page.locator('[data-expanded-node='+node.id+'] > g').getAttribute('transform'),C.rotationTransform(node,s.definitions));await page.locator('#exit-gate').click();
  await page.keyboard.press('Control+z');assert.equal((await page.evaluate(()=>LogicApp.getState())).nodes.find(n=>n.id==='target').type,'nand');
 }
 assert.deepEqual(errors,[]);console.log('PASS port direction: four rotations retain input/output orientation through replacement, full expansion, collapse and undo; no page errors');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
