const {test}=require('node:test'),assert=require('node:assert/strict'),W=require('../src/wireworld-model'),K=require('../src/wireworld-compile'),D=require('../src/domino-model'),C=require('../src/core');
const n=(id,type,x=0,y=0,extra={})=>({id,type,x,y,...extra}),wire=(id,a,b,port=0)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}}),nand=()=>({version:1,definitions:{},nodes:[n('a','input'),n('b','input',0,160),n('g','nand',250),n('o','output',500)],wires:[wire('a','a','g'),wire('b','b','g',1),wire('o','g','o')]}),sorted=pattern=>pattern.cells.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
function run(board,values={}){const world=new W.World(K.activate(board,values)),outputs=board.outputs.map(()=>null),registers=board.registers.map(()=>null);while(world.generation<=board.maxReady+16){for(const [ports,result] of [[board.outputs,outputs],[board.registers,registers]])ports.forEach((p,i)=>{if(world.generation>=p.ready&&world.generation%16===p.phase)result[i]=Number(world.get(p.x,p.y)===W.HEAD);});world.step(false);}return {world,outputs,registers};}
test('four requested colours and synchronous Moore-neighbour rules, including diagonal heads',()=>{
  assert.deepEqual(W.COLORS,['#000000','#f59e0b','#2684ff','#ffffff']);const neighbours=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  for(let count=0;count<=8;count++){const world=new W.World({cells:[[0,0,W.WIRE],...neighbours.slice(0,count).map(([x,y])=>[x,y,W.HEAD])]});world.step();assert.equal(world.get(0,0),count===1||count===2?W.HEAD:W.WIRE);}
  const world=new W.World({cells:[[0,0,W.HEAD],[1,0,W.TAIL]]});world.step();assert.equal(world.get(0,0),W.TAIL);assert.equal(world.get(1,0),W.WIRE,'a tail does not immediately become another head');assert.equal(world.get(0,1),W.EMPTY);world.step();assert.equal(world.get(0,0),W.WIRE);
});
test('sparse evolution matches an independent full-grid reference through mixed states',()=>{
  let random=7;const next=()=>((random=Math.imul(random,1664525)+1013904223)>>>0)/2**32,cells=[];for(let y=-5;y<=5;y++)for(let x=-5;x<=5;x++)if(next()<.65)cells.push([x,y,1+Math.floor(next()*3)]);const world=new W.World({cells});let reference=new Map(cells.map(([x,y,state])=>[x+','+y,state]));
  for(let generation=0;generation<60;generation++){const updated=new Map();for(const [id,state] of reference){const [x,y]=id.split(',').map(Number);let heads=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&reference.get((x+dx)+','+(y+dy))===W.HEAD)heads++;updated.set(id,state===W.HEAD?W.TAIL:state===W.TAIL?W.WIRE:heads===1||heads===2?W.HEAD:W.WIRE);}reference=updated;world.step();assert.deepEqual([...world.cells].sort(),[...reference].sort());assert.equal(world.heads.size,[...reference.values()].filter(s=>s===W.HEAD).length);}
});
test('signal, physical fork and bevelled closed loop evolve from the same rules',()=>{
  const signal=new W.World(W.sample('signal'));for(let i=0;i<20;i++)signal.step();assert.equal(signal.get(-2,0),W.HEAD);assert.equal(signal.heads.size,1);
  const branch=new W.World(W.sample('branch'));for(let i=0;i<20;i++)branch.step();assert.equal(branch.heads.size,2);assert.equal(branch.get(8,-8),W.HEAD);assert.equal(branch.get(8,8),W.HEAD);
  const loop=new W.World(W.sample('loop'));for(let i=0;i<500;i++){loop.step();assert.equal(loop.heads.size,1);assert.equal(loop.tails.size,1);}assert.equal(loop.cells.size,48);
});
test('edits and imports validate atomically, preserve negative coordinates and bound long strokes',()=>{
  const world=new W.World({cells:[[-1000000,-1000000,W.WIRE]]}),before=world.snapshot();assert.throws(()=>world.edit([[1,1,W.HEAD],[2,2,9]]));assert.deepEqual(world.snapshot(),before);assert.throws(()=>new W.World({cells:[[0,0,1],[0,0,2]]}));assert.throws(()=>new W.World({nodes:[],wires:[]}));assert.throws(()=>W.line(0,0,10000000,0));assert.deepEqual(W.line(-2,-2,2,2),[[-2,-2],[-1,-1],[0,0],[1,1],[2,2]]);world.edit([[-1000000,-1000000,W.EMPTY]]);assert.equal(world.cells.size,0);
});
test('controller reset remembers the edited starting field and invalid loads do not replace it',()=>{
  let last;const controller=W.createController(data=>{last=data;});try{const pattern=W.sample('signal');controller.handle({type:'load',pattern});controller.handle({type:'edit',cells:[[0,3,W.HEAD],[1,3,W.TAIL]]});const expected=new W.World({...pattern,cells:[...pattern.cells,[0,3,W.HEAD],[1,3,W.TAIL]]});controller.handle({type:'step'});controller.handle({type:'reset'});assert.deepEqual(sorted(last.pattern),sorted(expected.snapshot()));controller.handle({type:'load',pattern:{nodes:[]}});assert.ok(last.error);}finally{controller.destroy();}
});
test('converted NAND truth rows and full-adder rows are computed by cells, never the electronic simulator',()=>{
  const saved=C.simulate;C.simulate=()=>{throw Error('No electronic result may drive Wireworld');};try{const source=nand(),before=JSON.stringify(source),board=K.build(source);for(let row=0;row<4;row++)assert.deepEqual(run(board,Object.fromEntries(board.inputs.map((p,i)=>[p.id,row>>i&1]))).outputs,[Number(row!==3)]);assert.equal(JSON.stringify(source),before);
    const adder=K.build(D.demo());for(let row=0;row<8;row++){const total=(row&1)+(row>>1&1)+(row>>2&1);assert.deepEqual(run(adder,Object.fromEntries(adder.inputs.map((p,i)=>[p.id,row>>i&1]))).outputs,[total&1,total>>1]);}
  }finally{C.simulate=saved;}
});
test('nested custom gates, mismatched bus widths and wired OR preserve bit values',()=>{
  const def=C.makeDefinition(nand(),'NAND'),source={version:1,definitions:{g:def},nodes:[n('a','input'),n('b','input',0,160),n('x','custom',220,0,{def:'g'}),n('y','custom',440,0,{def:'g'}),n('o','output',660)],wires:[wire('a','a','x'),wire('b','b','x',1),wire('x','x','y'),wire('xx','x','y',1),wire('o','y','o')]},board=K.build(source);for(let row=0;row<4;row++)assert.deepEqual(run(board,Object.fromEntries(board.inputs.map((p,i)=>[p.id,row>>i&1]))).outputs,[Number(row===3)]);
  const bus={version:1,definitions:{},nodes:[n('a','input',0,0,{bits:4,value:5}),n('b','input',0,160,{bits:2,value:3}),n('o','output',500,0,{bits:8})],wires:[wire('a','a','o'),wire('b','b','o')]};assert.deepEqual(run(K.build(bus)).outputs,[0,0,0,0,0,1,1,1]);
});
test('delay feedback uses a continuous physical loop without replacing the field',()=>{
  for(const value of [0,1]){const source={version:1,definitions:{},nodes:[n('d','delay'),n('o','output',250)],wires:[wire('loop','d','d'),wire('out','d','o')],delayState:{'root/d':value}},before=JSON.stringify(source),board=K.build(source);assert.equal(board.feedbacks.length,1);assert.ok(board.feedbacks[0].length>0);let status,replacements=0,error;const control=W.createController(data=>{if(data.status)status=data.status;if(data.pattern)replacements++;if(data.error)error=data.error;},K);try{control.handle({type:'convert',state:source});for(let i=0;i<=board.maxReady+64;i++)control.handle({type:'step'});assert.equal(error,undefined);assert.equal(replacements,1);assert.equal(status.cycle,1);assert.equal(status.physicalFeedback,true);assert.deepEqual(status.outputs.map(p=>p.value),[value]);assert.deepEqual(status.registers.map(p=>p.value),[value]);assert.equal(JSON.stringify(source),before);}finally{control.destroy();}}
});
test('conversion rejects an undelayed circuit feedback without replacing a valid field',()=>{
  const source=nand();source.wires=[wire('loop','g','g'),wire('q','g','o')];assert.throws(()=>K.build(source),/反馈回路需要延迟线/);let last;const controller=W.createController(data=>{last=data;},K);try{controller.handle({type:'load',pattern:W.sample('loop')});controller.handle({type:'convert',state:source});assert.match(last.error,/反馈回路需要延迟线/);controller.handle({type:'reset'});assert.equal(last.pattern.cells.length,48);}finally{controller.destroy();}
});

test('automatic conversion recognizes crossed current wires and nested three-XOR swaps with one physical source per input',()=>{
  const source=K.crossoverSource();delete source.wireworldExample;const board=K.build(source);assert.equal(board.crossovers,1);assert.deepEqual(board.inputs.map(p=>p.seeds.length),[1,1]);assert.equal(board.modules.filter(p=>p.type==='xor'&&p.native).length,3);assert.equal(board.modules.filter(p=>p.type==='nand').length,0);assert.ok(board.basePattern.cells.length<500);
  const crossed={version:1,definitions:{},nodes:[n('a','input',0,0,{label:'A'}),n('b','input',0,160,{label:'B'}),n('oa','output',500,160,{label:'A出口'}),n('ob','output',500,0,{label:'B出口'})],wires:[wire('a','a','oa'),wire('b','b','ob')]},direct=K.build(crossed);assert.equal(direct.crossovers,1);assert.deepEqual(direct.inputs.map(p=>p.seeds.length),[1,1]);assert.deepEqual(direct.outputs.map(p=>p.label),['B出口','A出口']);
  const definition=C.makeDefinition(source,'自制交换器'),nested={version:1,definitions:{swap:definition},nodes:[n('a','input'),n('b','input',0,160),n('swap','custom',250,0,{def:'swap'}),n('top','output',500),n('bottom','output',500,160)],wires:[wire('a','a','swap'),wire('b','b','swap',1),wire('t','swap','top'),{id:'bq',a:{node:'swap',dir:'out',port:1},b:{node:'bottom',dir:'in',port:0}}]};assert.equal(K.build(nested).crossovers,1);
  const old=C.simulate;C.simulate=()=>{throw Error('Crossing must run actual Wireworld cells');};try{for(let row=0;row<4;row++)assert.deepEqual(run(board,Object.fromEntries(board.inputs.map((p,i)=>[p.id,row>>i&1]))).outputs,[row>>1&1,row&1]);}finally{C.simulate=old;}
});

test('physical feedback runs to stable returned values without a round reset',async()=>{
  const source={version:1,definitions:{},nodes:[n('i','input',0,0,{value:1}),n('d','delay',250),n('o','output',500)],wires:[wire('i','i','d'),wire('o','d','o')]};let status,error,replacements=0;const control=W.createController(data=>{if(data.status)status=data.status;if(data.pattern)replacements++;if(data.error)error=data.error;},K);
  try{control.handle({type:'convert',state:source});const board=K.build(source);for(let g=0;g<board.maxReady+board.feedbacks[0].length*2;g++)control.handle({type:'step'});control.handle({type:'run',value:true,speed:120});let limit=Date.now()+2000;while(status.running&&Date.now()<limit)await new Promise(r=>setTimeout(r,10));assert.equal(error,undefined);assert.equal(status.running,false);assert.equal(status.cycle,1);assert.equal(replacements,1);assert.deepEqual(status.outputs.map(p=>p.value),[1]);assert.deepEqual(status.registers.map(p=>p.value),[1]);assert.equal(status.inputs.find(p=>p.type==='delay').value,1);}finally{control.destroy();}
});

test('an ordinary custom XOR converts to one compact native XOR without NAND clock gadgets',()=>{
  const source=require('../src/presets').load('xor'),board=K.build(source);assert.equal(board.modules.filter(p=>p.type==='xor'&&p.native).length,1);assert.equal(board.modules.filter(p=>p.type==='nand').length,0);assert.ok(board.basePattern.cells.length<6000);assert.ok(board.inputs.every(p=>p.seeds.length===1));for(let row=0;row<4;row++)assert.deepEqual(run(board,Object.fromEntries(board.inputs.map((p,i)=>[p.id,row>>i&1]))).outputs,[(row&1)^(row>>1&1)]);
});


test('unified origins are ordered vertically, constant one is last, forks reuse sources and output order is retained',()=>{
  const source=D.demo(),before=JSON.stringify(source),board=K.build(source),origins=board.inputs.filter(p=>p.type!=='delay');assert.equal(origins.at(-1).type,'constant');assert.ok(origins.every(p=>p.seeds.length===1));assert.ok(origins.every((p,i)=>!i||p.seeds[0].head[1]>origins[i-1].seeds[0].head[1]));assert.ok(board.outputs.every((p,i)=>!i||p.y>board.outputs[i-1].y));assert.ok(board.inputRouting.crossovers>0);assert.equal(JSON.stringify(source),before);
  const constant=origins.at(-1),pattern=K.activate(board,{[constant.id]:0});assert.equal(new W.World(pattern).get(...constant.seeds[0].head),W.HEAD);
});


test('Golly RLE preserves sparse coordinates, current generation and all three mapped WireWorld states',()=>{
  const original={version:1,kind:'wireworld',generation:37,cells:[[-5,-9,W.WIRE],[-4,-9,W.WIRE],[-1,-9,W.HEAD],[-5,-7,W.TAIL],[1000000,1000000,W.HEAD]]},before=JSON.stringify(original),text=W.toRLE(original);assert.match(text,/rule = WireWorld/);assert.match(text,/#CXRLE Pos=-5,-9 Gen=37/);assert.match(text,/2C2[.]A/);assert.ok(text.length<300);assert.equal(JSON.stringify(original),before);
  const [ox,oy]=text.match(/Pos=(-?\d+),(-?\d+)/).slice(1).map(Number),body=text.split('\n').filter(l=>l&&!l.startsWith('#')&&!l.startsWith('x')).join(''),decoded=[];let x=ox,y=oy;const map={A:W.HEAD,B:W.TAIL,C:W.WIRE};for(const [,digits,symbol] of body.matchAll(/(\d*)([.ABC$!])/g)){const count=Number(digits)||1;if(symbol==='!')break;if(symbol==='$'){y+=count;x=ox;}else if(symbol==='.')x+=count;else for(let i=0;i<count;i++)decoded.push([x++,y,map[symbol]]);}assert.deepEqual(decoded,original.cells);assert.ok(text.split('\n').filter(l=>l&&!l.startsWith('#')&&!l.startsWith('x')).every(l=>l.length<=70));assert.match(W.toRLE({cells:[]}),/x = 0, y = 0, rule = WireWorld\n!/);
});
