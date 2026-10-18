const assert=require('node:assert/strict'),path=require('node:path');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{
  if(!server.listening)await new Promise(r=>server.once('listening',r));
  const browser=await pw.chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    const circuit={version:1,definitions:{},nodes:[{id:'i',type:'input',x:0,y:0,value:1},{id:'block',type:'nand',x:280,y:-20},{id:'o',type:'output',x:600,y:0}],wires:[]};
    const get=()=>page.evaluate(()=>LogicApp.getState());
    async function reset(){
      await page.locator('#file-input').setInputFiles({name:'wire-pan.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(circuit))});
      await page.waitForFunction(()=>document.getElementById('file-input').value===''&&LogicApp.getState().nodes[0].id==='i'&&LogicApp.getState().wires.length===0);
    }
    const xy=async(id,dir)=>page.evaluate(({id,dir})=>{
      const s=LogicApp.getState(),r=document.getElementById('canvas').getBoundingClientRect();
      const p=typeof id==='string'?LogicCore.ports(s.nodes.find(n=>n.id===id),s.definitions).find(p=>p.dir===dir):id;
      return {x:r.x+s.camera.x+p.x*s.camera.scale,y:r.y+s.camera.y+p.y*s.camera.scale};
    },{id,dir});
    async function connectAfterPan(zoom=false){
      await reset();if(zoom)await page.locator('#zoom-in').click();
      const before=await get(),a=await xy('i','out'),mid={x:a.x+60,y:a.y+100};
      await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(mid.x,mid.y,{steps:4});
      await page.mouse.down({button:'right'});await page.mouse.move(mid.x+96,mid.y+48,{steps:6});
      let after=await get();assert.equal(after.camera.x,before.camera.x+96);assert.equal(after.camera.y,before.camera.y+48);
      assert.deepEqual(after.nodes,before.nodes);assert.equal(after.wires.length,0);assert.equal(await page.locator('.draft').count(),1);
      await page.mouse.up({button:'right'});assert.equal(await page.locator('.draft').count(),1);assert.equal((await get()).wires.length,0);
      const end=await xy('o','in');await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();
      after=await get();assert.equal(after.wires.length,1);assert.deepEqual(after.wires[0].a,{node:'i',dir:'out',port:0});assert.deepEqual(after.wires[0].b,{node:'o',dir:'in',port:0});
      assert.deepEqual(await page.evaluate(()=>LogicApp.getSimulation().outputs.o),[1]);assert.equal(await page.locator('.draft').count(),0);
      await page.keyboard.press('Control+z');assert.equal((await get()).wires.length,0);
      await page.keyboard.press('Control+Shift+z');assert.equal((await get()).wires.length,1);
    }
    await connectAfterPan();await connectAfterPan(true);
    console.log('PASS wire pan: right release continues wire, zoomed endpoint/signal, one undo/redo');

    await reset();let a=await xy('i','out'),end=await xy('o','in');
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});
    await page.mouse.down({button:'right'});await page.mouse.move(end.x+48,end.y+24,{steps:4});
    await page.mouse.up();assert.equal((await get()).wires.length,1);assert.deepEqual(await page.evaluate(()=>LogicApp.getSimulation().outputs.o),[1]);
    const leftReleased=await get();await page.mouse.move(end.x+84,end.y+48,{steps:4});await page.mouse.up({button:'right'});
    assert.equal((await get()).camera.x,leftReleased.camera.x+36);assert.equal((await get()).wires.length,1);
    console.log('PASS wire pan: left release commits once, remaining right button continues panning');

    await reset();const blank=await xy({x:180,y:200});await page.mouse.move(blank.x,blank.y);await page.mouse.down({button:'right'});
    await page.mouse.move(blank.x+24,blank.y+12,{steps:3});await page.mouse.down();const rightFirst=await get();
    await page.mouse.move(blank.x+72,blank.y+36,{steps:4});assert.equal((await get()).camera.x,rightFirst.camera.x+48);
    await page.mouse.up({button:'right'});end=await xy('o','in');await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();
    assert.equal((await get()).wires.length,1);assert.deepEqual((await get()).wires[0].b,{node:'o',dir:'in',port:0});
    assert.deepEqual((await get()).nodes,circuit.nodes);
    console.log('PASS wire pan: right-first blank pan can start a wire without deleting gates');

    for(const cancel of ['escape','pointercancel']){
      await reset();a=await xy('i','out');await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+60,a.y+80,{steps:3});
      await page.mouse.down({button:'right'});await page.mouse.move(a.x+100,a.y+100,{steps:3});
      if(cancel==='escape')await page.keyboard.press('Escape');else await page.locator('#canvas').dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse'});
      await page.mouse.up({button:'right'});await page.mouse.up();
      assert.equal((await get()).wires.length,0);assert.equal(await page.locator('.draft').count(),0);assert.equal(await page.locator('#canvas.dragging').count(),0);
      assert.equal(await page.locator('#canvas').evaluate(el=>el.hasPointerCapture(1)),false);
    }
    assert.deepEqual(errors,[]);console.log('PASS wire pan: Esc and pointercancel clear draft/capture, no browser errors');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
