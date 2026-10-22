const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const C=require('../src/core.js'),E=require('../src/expanded.js'),R=require('../src/minecraft-redstone.js');
function worker(source,basis='nand'){
  const messages=[],scheduled=new Map();let timer,clock=0,serial=0;
  const context={LogicCore:C,LogicExpanded:E,LogicRedstone:R,importScripts(){},performance:{now:()=>clock},setInterval(fn){timer=fn;},setTimeout(fn,delay){const id=++serial;scheduled.set(id,{fn,at:clock+delay});return id;},clearTimeout(id){scheduled.delete(id);},postMessage(data){messages.push(data);}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/minecraft-model.js'),'utf8'),context);
  const post=data=>context.onmessage({data});post({state:source,basis});
  const model=messages.find(m=>m.model)?.model;assert.ok(model,JSON.stringify(messages));
  const lamps=new Map(model.lamps.map(l=>[l.renders[0].key+'/'+l.renders[0].index,l.on]));let read=0;
  return {post,model,get last(){return messages.at(-1);},pulse(){const next=[...scheduled].sort((a,b)=>a[1].at-b[1].at)[0];if(next){scheduled.delete(next[0]);clock=next[1].at;next[1].fn();}else timer();},at(ms){while([...scheduled.values()].some(t=>t.at<=ms))this.pulse();clock=ms;},flush(){for(let i=0;(this.last.settling||this.last.directRunning&&this.last.pending)&&i<200;i++)this.pulse();assert.equal(this.last.settling,false);assert.equal(this.last.pending,0);},get outputs(){for(;read<messages.length;read++)for(const u of messages[read].updates||[])if(lamps.has(u.key+'/'+u.index))lamps.set(u.key+'/'+u.index,u.on);return [...lamps.values()].map(Number);}};
}
for(const delay of [1,2,3,4])test('direct event resolution ignores repeater setting '+delay+' without advancing game time',()=>{
  const blocks=[{kind:'lever',x:0,y:1,z:0,on:true},{kind:'dust',x:1,y:1,z:0},{kind:'repeater',x:2,y:1,z:0,facing:0,delay,on:false},{kind:'dust',x:3,y:1,z:0},{kind:'lamp',x:4,y:1,z:0,on:false}],world=new R.World();
  for(const b of blocks){world.put({kind:'support',x:b.x,y:0,z:b.z});world.put(b);}
  const sim=new R.Simulator(world);assert.equal(blocks[2].on,false);assert.ok(sim.resolvePending());assert.equal(blocks[2].on,true);assert.equal(blocks[4].on,true);assert.equal(sim.tick,0);
  sim.toggle(blocks[0]);while(sim.pending.size)sim.resolvePending();assert.equal(blocks[4].on,false);assert.equal(sim.tick,0);
});
for(const basis of ['nand','or-not'])test('one-shot and continuous direct calculation use physical adder outputs in '+basis,()=>{
  const w=worker(require('./minecraft-adder-fixture.cjs')(),basis),levers=['a','b','c'].map(id=>w.model.levers.find(l=>l.id===id));
  w.post({type:'direct-running',value:true});w.flush();
  for(const mask of [1,3,2,6,7,5,4,0]){
    for(const [bit,l] of levers.entries())if(l.on!==!!(mask>>bit&1)){w.post({type:'toggle',key:l.key});l.on=!l.on;}
    w.flush();const sum=(mask&1)+(mask>>1&1)+(mask>>2&1);
    assert.deepEqual(w.outputs,[sum&1,Number(sum>=2)]);assert.equal(w.last.tick,0);assert.equal(w.last.pending,0);assert.equal(w.last.directRunning,true);
  }
  w.post({type:'direct-running',value:false});w.post({type:'toggle',key:levers[1].key});assert.deepEqual(w.outputs,[0,0]);assert.ok(w.last.pending>0);
  w.post({type:'direct'});w.flush();assert.deepEqual(w.outputs,[1,0]);assert.equal(w.last.directRunning,false);
  w.post({type:'direct-running',value:true});w.post({type:'step'});assert.equal(w.last.directRunning,false);assert.equal(w.last.tick,1);
  w.post({type:'direct-running',value:true});w.post({type:'running',value:true});assert.equal(w.last.directRunning,false);
});
test('direct mode bypasses an explicit delay channel and continuous mode recomputes both edges',()=>{
  const n=(id,type,x,extra={})=>({id,type,x,y:0,...extra}),link=(id,a,b)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port:0}}),w=worker({version:1,definitions:{},nodes:[n('i','input',0),n('d','delay',200,{redstoneDelay:4}),n('o','output',400)],wires:[link('i','i','d'),link('o','d','o')]});
  w.post({type:'direct-running',value:true});
  for(const expected of [1,0,1]){w.post({type:'toggle',key:w.model.levers[0].key});w.flush();assert.deepEqual(w.outputs,[expected]);assert.equal(w.last.tick,0);}
});
test('continuous feedback keeps progressing without input; only one-shot calculation stops on oscillation',()=>{
  const w=worker({version:1,definitions:{},nodes:[{id:'g',type:'nand',x:0,y:0},{id:'o',type:'output',x:200,y:0}],wires:[0,1].map(port=>({id:'f'+port,a:{node:'g',dir:'out',port:0},b:{node:'g',dir:'in',port}})).concat([{id:'o',a:{node:'g',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}])});
  w.post({type:'direct-running',value:true});const values=new Set([w.outputs[0]]);
  for(let i=0;i<12;i++){w.pulse();values.add(w.outputs[0]);assert.equal(w.last.directRunning,true);assert.ok(w.last.pending>0);assert.equal(w.last.settleWarning,'');}
  assert.equal(values.size,2,'the live output must keep changing without lever operations');
  w.post({type:'direct-running',value:false});const paused=w.outputs[0];for(let i=0;i<4;i++)w.pulse();assert.equal(w.outputs[0],paused);
  w.post({type:'direct'});assert.match(w.last.settleWarning,/反馈振荡/);assert.equal(w.last.directRunning,false);assert.ok(w.last.pending>0);
  w.post({type:'step'});assert.equal(w.last.tick,1);
});
test('continuous torch event is applied at 30ms, never by the ordinary clock or an immediate batch',()=>{
  const source={version:1,definitions:{},nodes:[{id:'a',type:'input',x:0,y:0,value:1},{id:'b',type:'input',x:0,y:120},{id:'g',type:'nand',x:200,y:0},{id:'o',type:'output',x:400,y:0}],wires:[['a','a','g',0],['b','b','g',1],['o','g','o',0]].map(([id,a,b,port])=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}}))};
  const w=worker(source);w.post({type:'direct-running',value:true});w.post({type:'toggle',key:w.model.levers.find(l=>l.id==='b').key});
  assert.deepEqual(w.outputs,[1]);w.at(29);assert.deepEqual(w.outputs,[1]);w.at(30);assert.deepEqual(w.outputs,[0]);assert.equal(w.last.directRunning,true);
  w.post({type:'direct-running',value:false});w.post({type:'toggle',key:w.model.levers.find(l=>l.id==='b').key});w.at(200);assert.deepEqual(w.outputs,[0],'turning off must cancel the frame timer');
});
test('transparent backend propagates a hundred repeaters immediately and preserves every visible block and setting',()=>{
  const blocks=[{kind:'lever',x:0,y:1,z:0,on:true},{kind:'dust',x:1,y:1,z:0}];
  for(let i=0;i<100;i++)blocks.push({kind:'repeater',x:2+i*2,y:1,z:0,on:false,facing:0,delay:i%4+1,role:'delay'},{kind:'dust',x:3+i*2,y:1,z:0});
  blocks.push({kind:'lamp',x:202,y:1,z:0,on:false});const world=new R.World();for(const b of blocks){world.put({kind:'support',x:b.x,y:0,z:0});world.put(b);}
  const before=[...world.cells].map(([k,b])=>[k,b.kind,b.delay]),sim=new R.Simulator(world);sim.setContinuous(true);
  assert.equal(blocks.at(-1).on,true);assert.equal(sim.pending.size,0);assert.equal(sim.tick,0);assert.ok(sim.repeaters.every(r=>r.on));assert.deepEqual([...world.cells].map(([k,b])=>[k,b.kind,b.delay]),before);
  sim.toggle(blocks[0]);assert.equal(blocks.at(-1).on,false);assert.ok(sim.repeaters.every(r=>!r.on));sim.setContinuous(false);sim.toggle(blocks[0]);assert.equal(blocks.at(-1).on,false);assert.ok(sim.pending.size>0);
});
test('two layers of torches update in two separate continuous frames',()=>{
  const blocks=[{kind:'lever',x:0,y:1,z:0,on:false},{kind:'dust',x:1,y:1,z:0},{kind:'support',x:2,y:1,z:0},{kind:'torch',x:3,y:1,z:0,on:true,attached:{x:2,y:1,z:0}},{kind:'dust',x:4,y:1,z:0},{kind:'dust',x:5,y:1,z:0},{kind:'support',x:6,y:1,z:0},{kind:'torch',x:7,y:1,z:0,on:false,attached:{x:6,y:1,z:0}},{kind:'dust',x:8,y:1,z:0},{kind:'lamp',x:9,y:1,z:0,on:false}],world=new R.World();
  for(const b of blocks){if(['lever','dust','lamp'].includes(b.kind))world.put({kind:'support',x:b.x,y:0,z:0});world.put(b);}
  const sim=new R.Simulator(world);sim.setContinuous(true);sim.toggle(blocks[0]);assert.equal(blocks[3].on,true);assert.equal(blocks[7].on,false);
  sim.resolvePending();assert.equal(blocks[3].on,false);assert.equal(blocks[7].on,false);assert.equal(blocks.at(-1).on,false);
  sim.resolvePending();assert.equal(blocks[7].on,true);assert.equal(blocks.at(-1).on,true);assert.equal(R.DIRECT_FRAME_MS,30);
});
