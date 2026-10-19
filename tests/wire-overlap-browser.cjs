const assert=require('node:assert/strict'),path=require('node:path'),C=require('../src/core.js');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{
  if(!server.listening)await new Promise(r=>server.once('listening',r));const browser=await pw.chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
    const get=()=>page.evaluate(()=>LogicApp.getState());
    async function load(s){await page.locator('#file-input').setInputFiles({name:'overlap.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await page.waitForFunction(()=>document.getElementById('file-input').value==='');}
    const xy=async(id,dir)=>page.evaluate(({id,dir})=>{const s=LogicApp.getState(),r=document.getElementById('canvas').getBoundingClientRect(),p=typeof id==='string'?LogicCore.ports(s.nodes.find(n=>n.id===id),s.definitions).find(p=>p.dir===dir):id;return {x:r.x+s.camera.x+p.x*s.camera.scale,y:r.y+s.camera.y+p.y*s.camera.scale};},{id,dir});
    const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});};
    const valid=s=>{for(const w of s.wires){assert.equal(C.wireOverlaps(w,s),false,'overlap '+w.id+' '+JSON.stringify(s.wires));assert.equal(C.wireHitsGate(w,s),false,'gate collision '+w.id);}};
    const fan={version:1,nodes:[{id:'i',type:'input',x:0,y:200,value:1},...Array.from({length:8},(_,i)=>({id:'o'+i,type:'output',x:600,y:i*96}))],wires:[],definitions:{}};
    await load(fan);
    for(let i=0;i<8;i++){await drag(await xy('i','out'),await xy('o'+i,'in'));await page.mouse.up();const s=await get();assert.equal(s.wires.length,i+1);valid(s);assert.deepEqual(await page.evaluate(id=>LogicApp.getSimulation().outputs[id],'o'+i),[1]);}
    const wired=await get();await page.keyboard.press('Control+z');assert.equal((await get()).wires.length,7);await page.keyboard.press('Control+Shift+z');assert.deepEqual((await get()).wires,wired.wires);
    console.log('PASS overlap: eight drawn fanouts share points only, avoid gates, signals and undo/redo');

    await load(require('./fixtures/narrow-lane.cjs')());
    const narrowBefore=await get();await drag(await xy('s','out'),await xy('t','in'));
    const narrowPreview=await page.locator('.draft').getAttribute('d');assert.ok(narrowPreview);await page.mouse.up();
    const narrowAfter=await get(),narrowWire=narrowAfter.wires.at(-1);assert.equal(narrowAfter.wires.length,narrowBefore.wires.length+1);
    assert.equal(C.wireOverlaps(narrowWire,narrowAfter),false);assert.equal(C.wireHitsGate(narrowWire,narrowAfter),false);
    assert.equal(await page.locator('[data-wire="'+narrowWire.id+'"] .wire-line').getAttribute('d'),narrowPreview);
    assert.deepEqual(narrowAfter.nodes,narrowBefore.nodes);await page.keyboard.press('Control+z');assert.deepEqual((await get()).wires,narrowBefore.wires);
    console.log('PASS overlap: narrow port corridors use zero overlap, preview and saved path agree, undo preserved');

    const blocked={version:1,nodes:[{id:'block',type:'nand',x:60,y:60}],definitions:{},wires:[{id:'h',a:{x:-100,y:0},b:{x:100,y:0}},{id:'v',a:{x:0,y:-100},b:{x:0,y:100}}]};
    await load(blocked);const before=await get();await drag(await xy({x:0,y:0}),await xy({x:200,y:200}));const preview=await page.locator('.draft').getAttribute('d');assert.ok(preview);await page.mouse.up();let added=(await get()).wires.at(-1);assert.equal((await get()).wires.length,before.wires.length+1);assert.ok(C.wireOverlaps(added,await get()),JSON.stringify({added,state:await get()}));assert.equal(await page.locator('[data-wire="'+added.id+'"] .wire-line').getAttribute('d'),preview);await page.keyboard.press('Control+z');assert.deepEqual((await get()).wires,before.wires);await page.keyboard.press('Control+Shift+z');assert.deepEqual((await get()).wires.at(-1),added);
    console.log('PASS overlap: least-overlap fallback preview matches saved wire, undo/redo preserved');
    await load({version:1,definitions:{},wires:[],nodes:[{id:'block',type:'nand',x:0,y:0}]});const noPath=await get();await drag(await xy({x:-100,y:200}),await xy({x:76,y:40}));assert.equal(await page.locator('.draft').count(),0);await page.mouse.up();assert.deepEqual((await get()).wires,noPath.wires);assert.deepEqual((await get()).nodes,noPath.nodes);assert.match(await page.locator('#toast').textContent(),/避开逻辑门/);
    console.log('PASS overlap: soft overlap still never permits a gate-body endpoint');

    const legacy=C.clone(fan);legacy.wires=legacy.nodes.slice(1).map((n,i)=>({id:'old'+i,a:{node:'i',dir:'out',port:0},b:{node:n.id,dir:'in',port:0},autoRoute:true}));
    assert.ok(legacy.wires.some(w=>C.wireOverlaps(w,legacy)));await load(legacy);await page.waitForTimeout(300);await page.reload();let s=await get();valid(s);assert.deepEqual(s.nodes,legacy.nodes);assert.deepEqual(Object.values(await page.evaluate(()=>LogicApp.getSimulation().outputs)),Array.from({length:8},()=>[1]));
    const repaired=C.clone(s.wires);await page.waitForTimeout(300);await page.reload();assert.deepEqual((await get()).wires,repaired);
    console.log('PASS overlap: legacy overlap repaired once, nodes/endpoints/signals preserved');

    const through={version:1,definitions:{},nodes:[{id:'i',type:'input',x:0,y:0,value:1},{id:'o',type:'output',x:1000,y:0},...Array.from({length:3},(_,i)=>({id:'block'+i,type:'nand',x:240+i*240,y:0}))],wires:[{id:'through',a:{node:'i',dir:'out',port:0},b:{node:'o',dir:'in',port:0},autoRoute:true}]};
    assert.equal(C.wireHitsGate(through.wires[0],through),true);const definition=C.makeDefinition(through,'穿过三门'),root={version:1,nodes:[],wires:[],definitions:{g:definition}};
    await load(root);await page.locator('[data-custom=g]').click({button:'right'});const updated=(await get()).definitions.g,local={...updated,definitions:{g:updated}};valid(local);assert.deepEqual(updated.nodes,definition.nodes);assert.equal(updated.wires.length,1);assert.deepEqual(C.simulate(local).outputs.o,[1]);
    await page.locator('#back-to-circuit').click();assert.deepEqual((await get()).definitions.g.wires,updated.wires);await page.keyboard.press('Control+z');assert.deepEqual((await get()).definitions.g.wires,definition.wires);
    assert.deepEqual(errors,[]);console.log('PASS overlap: saved line crossing three gates repaired on edit, signal and root undo preserved, no page errors');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
