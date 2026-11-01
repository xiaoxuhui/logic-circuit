const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core'),D=require('../src/domino-model');
const node=(id,type,x=0,y=0,extra={})=>({id,type,x,y,...extra}),wire=(id,a,b,port=0)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}});
const nand=()=>({version:1,definitions:{},nodes:[node('a','input'),node('b','input',0,160),node('g','nand',250),node('o','output',500)],wires:[wire('a','a','g'),wire('b','b','g',1),wire('q','g','o')]});
test('rounded routes use smoothly changing tangents and contact-sized gaps through corners',()=>{
  const path=D.curvedPath([{x:0,y:0},{x:140,y:0},{x:140,y:140},{x:280,y:140}]);assert.ok(path.some(p=>p.x<140&&p.y>0&&p.y<34),'a real curved arc replaces the sharp elbow');
  assert.deepEqual({x:path[0].x,y:path[0].y},{x:0,y:0});assert.deepEqual({x:path.at(-1).x,y:path.at(-1).y},{x:280,y:140});
  for(let i=1;i<path.length;i++){assert.ok(Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y)<=14.001);const delta=Math.atan2(Math.sin(path[i].angle-path[i-1].angle),Math.cos(path[i].angle-path[i-1].angle));assert.ok(Math.abs(delta)<Math.PI/4,'adjacent bones turn progressively');}
  const board=D.build(D.demo());assert.ok(board.bones.some(b=>Math.abs(Math.sin(b.angle*2))>.2),'generated circuits include diagonally oriented bones around arcs');
});
test('clocked domino NAND: four rows; side front removes actual bridge before trigger; source unchanged',()=>{
  for(let row=0;row<4;row++){const source=nand();source.nodes[0].value=row&1;source.nodes[1].value=row>>1;const before=JSON.stringify(source),board=D.build(source),sim=new D.Simulator(board);assert.equal(sim.status().outputs[0].value,null);assert.ok(board.bones.some(b=>b.kind==='bridge'));
    const r=sim.run();assert.equal(r.outputs[0].value,Number(row!==3));assert.equal(board.bones.filter((b,i)=>b.kind==='bridge'&&sim.states[i]===2).length,(row&1)+(row>>1));assert.equal(JSON.stringify(source),before);
    const output=board.outputs[0].pin;assert.equal(sim.states[output],row===3?0:1);sim.reset();assert.equal(sim.toppled,0);assert.equal(sim.states.filter(Boolean).length,0);assert.equal(sim.run().outputs[0].value,Number(row!==3));
  }
});
test('full adder computes all eight rows from toppling events, without core simulation',()=>{
  const old=C.simulate;C.simulate=()=>{throw Error('electronic simulation must not calculate domino results');};try{for(let row=0;row<8;row++){const source=D.demo();source.nodes.slice(0,3).forEach((n,i)=>n.value=row>>i&1);const r=new D.Simulator(D.build(source)).run(),sum=(row&1)+(row>>1&1)+(row>>2&1);assert.deepEqual(r.outputs.map(p=>p.value),[sum&1,sum>>1]);}}finally{C.simulate=old;}
});
test('nested definitions preserve instance multiplicity, bus bits and wired OR',()=>{
  const inner=nand(),def=C.makeDefinition(inner,'NAND'),source={version:1,definitions:{gate:def},nodes:[node('a','input'),node('b','input',0,160),node('x','custom',220,0,{def:'gate'}),node('y','custom',440,0,{def:'gate'}),node('o','output',660)],wires:[wire('a','a','x'),wire('b','b','x',1),wire('x','x','y'),wire('xx','x','y',1),wire('o','y','o')]};
  for(let row=0;row<4;row++){source.nodes[0].value=row&1;source.nodes[1].value=row>>1;const board=D.build(source);assert.equal(board.gateCount,2);assert.equal(new D.Simulator(board).run().outputs[0].value,Number(row===3));}
  const bus={version:1,definitions:{},nodes:[node('a','input',0,0,{bits:4,value:5}),node('b','input',0,160,{bits:2,value:3}),node('o','output',500,0,{bits:8})],wires:[wire('a','a','o'),wire('b','b','o')]};const sim=new D.Simulator(D.build(bus));assert.deepEqual(sim.run().outputs.slice().sort((a,b)=>a.bit-b.bit).map(p=>p.value),[1,1,1,0,0,0,0,0]);
});
test('delay feedback samples simultaneously only after a completed round; rearming preserves memory',()=>{
  const source={version:1,definitions:{},nodes:[node('d','delay'),node('g','nand',250),node('o','output',500)],wires:[wire('a','d','g'),wire('b','d','g',1),wire('q','g','d'),wire('o','d','o')],delayState:{'root/d':1}},before=JSON.stringify(source),sim=new D.Simulator(D.build(source));assert.throws(()=>sim.nextCycle(),/先完成/);
  for(let cycle=0;cycle<6;cycle++){const r=sim.run();assert.equal(r.outputs[0].value,1-cycle%2);assert.equal(r.delays[0].next,cycle%2);sim.reset();assert.equal(sim.run().outputs[0].value,1-cycle%2);sim.nextCycle();}assert.equal(JSON.stringify(source),before);
});
test('unconnected inputs default low; forced values and reset/invalid inputs are handled independently',()=>{
  const s=nand();s.wires=[];const sim=new D.Simulator(D.build(s));assert.equal(sim.run().outputs[0].value,0);assert.throws(()=>sim.setInput('root/a:0',9),/0或1/);sim.setInput('root/a:0',1);assert.equal(sim.tick,0);
  const f=nand();f.nodes[0].value=1;f.nodes[1].value=1;f.wireOverrides={a:[0]};assert.equal(new D.Simulator(D.build(f)).run().outputs[0].value,1);
});
test('combinational feedback is rejected instead of inventing a computed result',()=>{
  const s=nand();s.wires=[wire('loop','g','g'),wire('q','g','o')];assert.throws(()=>D.build(s),/反馈环/);assert.equal(new D.Simulator(D.build({version:1,nodes:[],wires:[],definitions:{}})).run().outputs.length,0);
});
test('every intended link can physically touch; removing contact stops propagation rather than jumping a gap',()=>{
  const board=D.build(D.demo());for(const a of board.bones)for(const id of a.next)assert.ok(D.hits(a,board.bones[id])||D.hits(a,board.bones[id],-1),'next domino is within a forward or reverse falling footprint');
  const source=nand();source.nodes[0].value=1;source.nodes[1].value=1;const b=D.build(source);assert.equal(new D.Simulator(b).run().outputs[0].value,0);
  const bridge=b.bones.findIndex(p=>p.kind==='bridge');assert.ok(b.bones.some(p=>p.kind==='knock'&&p.contacts[0].some(([id,dir])=>id===bridge&&dir===-1)),'data physically pushes the bridge in reverse');
  const s=nand();s.nodes[0].value=0;s.nodes[1].value=1;const normal=D.build(s);assert.equal(new D.Simulator(normal).run().outputs[0].value,1);
  for(const p of normal.bones)if(p.kind==='bridge')p.x+=10000;D.contacts(normal.bones);assert.equal(new D.Simulator(normal).run().outputs[0].value,0,'a missing bridge cannot be crossed via an abstract edge');
});
test('separate domino paths do not cross between connected endpoints',()=>{
  const b=D.build(D.demo()),edges=[];for(let i=0;i<b.bones.length;i++)for(const j of b.bones[i].next)edges.push({i,j,a:b.bones[i],b:b.bones[j]});const cells=new Map(),checked=new Set();
  for(let k=0;k<edges.length;k++){const e=edges[k];for(let y=Math.floor(Math.min(e.a.y,e.b.y)/32);y<=Math.floor(Math.max(e.a.y,e.b.y)/32);y++)for(let x=Math.floor(Math.min(e.a.x,e.b.x)/32);x<=Math.floor(Math.max(e.a.x,e.b.x)/32);x++){
    const key=x+','+y,list=cells.get(key)||[];for(const n of list){if(checked.has(n+':'+k))continue;checked.add(n+':'+k);const f=edges[n];if(e.i===f.i||e.i===f.j||e.j===f.i||e.j===f.j)continue;const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,ex=f.b.x-f.a.x,ey=f.b.y-f.a.y,cross=dx*ey-dy*ex;if(Math.abs(cross)<1e-8)continue;const ax=f.a.x-e.a.x,ay=f.a.y-e.a.y,t=(ax*ey-ay*ex)/cross,u=(ax*dy-ay*dx)/cross;assert.ok(!(t>1e-6&&t<1-1e-6&&u>1e-6&&u<1-1e-6),'unrelated paths cannot cross');}list.push(k);cells.set(key,list);
  }}
});
test('a shared falling front physically forks to two branches and replaces duplicated gate layouts',()=>{
  const b=D.build(D.demo());assert.ok(b.sharedBranches>0);assert.ok(b.bones.length<D.buildTree(D.demo()).bones.length);assert.ok(b.bones.some(p=>p.next.length>1&&p.contacts[0].length>1),'one falling domino reaches both branch starts');
  for(let row=0;row<8;row++){const sim=new D.Simulator(b);sim.inputs.forEach((p,i)=>p.value=row>>i&1);sim.reset();const r=sim.run(),sum=(row&1)+(row>>1&1)+(row>>2&1);assert.deepEqual(r.outputs.map(p=>p.value),[sum&1,sum>>1]);}
});
test('native OR and crossing XOR are computed by contact, with simultaneous opposing impulses resolved independently of queue order',()=>{
  for(const type of ['or','xor'])for(let row=0;row<4;row++)for(const reverse of [false,true]){
    const board=D.buildGate(type),sim=new D.Simulator(board);sim.inputs.forEach((p,i)=>p.value=row>>i&1);sim.reset();if(reverse)sim.pending.get(1)?.reverse();const r=sim.run();assert.equal(r.outputs[0].value,type==='or'?Number(row!==0):Number(row===1||row===2));
    if(type==='xor'&&row===3){const bridge=board.bones.findIndex(b=>b.kind==='bridge');assert.equal(sim.states[bridge],0,'opposing simultaneous input fronts cancel at the shared tile');}
  }
  assert.throws(()=>D.buildGate('unknown'),/未知/);
});
test('three physical XORs swap independent signals from exactly one A and one B origin, including 11',()=>{
  const b=D.buildGate('cross');assert.equal(b.gateCount,3);assert.deepEqual(b.inputs.map(p=>p.pins.length),[1,1]);assert.equal(b.sharedBranches,3);
  for(let row=0;row<4;row++){const sim=new D.Simulator(b);sim.inputs.forEach((p,i)=>p.value=row>>i&1);sim.reset();assert.deepEqual(sim.run().outputs.map(p=>p.value),[row>>1&1,row&1]);}
});
test('A, B and carry routing has three single origins and a physical carry fork, preserving all eight rows',()=>{
  const b=D.buildGate('routing');assert.deepEqual(b.inputs.map(p=>p.pins.length),[1,1,1]);assert.equal(b.inputs[2].label,'进位 C_in');
  for(const p of b.bones)for(const i of p.next)assert.ok(D.hits(p,b.bones[i])||D.hits(p,b.bones[i],-1),'every connected route can touch the next tile');
  for(let row=0;row<8;row++){const s=new D.Simulator(b);s.inputs.forEach((p,i)=>p.value=row>>i&1);s.reset();assert.deepEqual(s.run().outputs.map(p=>p.value),[row>>1&1,row&1,row>>2&1,row>>2&1]);}
});
test('the actual full-adder converter uses three physical origins, fewer tiles and exact min/max input statistics',()=>{
  const source=D.demo(),before=JSON.stringify(source),b=D.build(source);assert.equal(b.singleOrigin,true);assert.deepEqual(b.inputs.map(p=>p.pins.length),[1,1,1]);assert.equal(b.bones.filter(p=>p.kind==='input').length,3);assert.ok(b.bones.length<D.buildTree(source).bones.length);
  const stats=D.analyzeInputs(b);assert.equal(stats.minSteps,886);assert.equal(stats.maxSteps,1263);assert.deepEqual(stats.minInputs,[[0,0,0]]);assert.deepEqual(stats.maxInputs,[[1,1,0],[1,1,1]]);
  for(const [patterns,steps] of [[stats.minInputs,stats.minSteps],[stats.maxInputs,stats.maxSteps]])for(const values of patterns){const s=new D.Simulator(b);s.inputs.forEach((p,i)=>p.value=values[i]);s.reset();assert.equal(s.run().tick,steps);}assert.equal(JSON.stringify(source),before);
});
test('packaged and bus full adders are recognized by function, preserving names, bits, port order and original state',()=>{
  const def=C.makeDefinition(D.demo(),'Full adder'),source={version:1,definitions:{fa:def},nodes:[node('cin','input',0,320,{label:'进位',value:1}),node('a','input',0,0,{label:'A'}),node('b','input',0,160,{label:'B'}),node('fa','custom',300,0,{def:'fa'}),node('carry','output',600,160,{label:'Carry'}),node('sum','output',600,0,{label:'Sum'})],wires:[wire('a','a','fa'),wire('b','b','fa',1),wire('c','cin','fa',2),wire('s','fa','sum'),{id:'carry',a:{node:'fa',dir:'out',port:1},b:{node:'carry',dir:'in',port:0}}]},before=JSON.stringify(source),board=D.build(source);assert.equal(board.singleOrigin,true);assert.deepEqual(board.inputs.map(p=>p.label),['A','B','进位']);assert.deepEqual(board.outputs.map(p=>p.label),['Carry','Sum']);for(let row=0;row<8;row++){const s=new D.Simulator(board);s.inputs.forEach((p,i)=>p.value=row>>i&1);s.reset();const total=(row&1)+(row>>1&1)+(row>>2&1);assert.deepEqual(s.run().outputs.map(p=>p.value),[total>>1,total&1]);}assert.equal(JSON.stringify(source),before);
  const bus={version:1,definitions:{fa:def},nodes:[node('abc','input',0,0,{bits:3,value:5}),node('split','splitter',200,0,{bits:3}),node('fa','custom',400,0,{def:'fa'}),node('hub','hub',600,0,{bits:2}),node('out','output',800,0,{bits:2})],wires:[wire('abc','abc','split'),...Array.from({length:3},(_,port)=>({id:'i'+port,a:{node:'split',dir:'out',port},b:{node:'fa',dir:'in',port}})),...Array.from({length:2},(_,port)=>({id:'o'+port,a:{node:'fa',dir:'out',port},b:{node:'hub',dir:'in',port}})),wire('q','hub','out')]};const b=D.build(bus);assert.equal(b.singleOrigin,true);assert.deepEqual(b.inputs.map(p=>p.pins.length),[1,1,1]);const s=new D.Simulator(b);assert.deepEqual(s.run().outputs.map(p=>p.value),[1,0]);
});
test('full-adder recognition checks all input rows instead of trusting a name or the current output',()=>{
  const source=D.demo();source.name='Full adder';source.wires[0].a.node='b';assert.notEqual(D.build(source).gateTitle,'全加器');
});
test('step analysis leaves a non-adder board unchanged and rejects an unbounded input search',()=>{
  const b=D.buildGate('or'),before=JSON.stringify(b),r=D.analyzeInputs(b);assert.equal(r.minSteps,1);assert.deepEqual(r.minInputs,[[0,0]]);assert.ok(r.maxSteps>r.minSteps);assert.equal(JSON.stringify(b),before);assert.throws(()=>D.analyzeInputs({inputs:Array(13).fill({}),bones:[],delays:[]}),/12位/);
});

test('ordinary custom gates use single input origins, physical forks and synchronized three-XOR crossings',()=>{
  const inner={version:1,definitions:{},nodes:['a','b','c'].map((id,i)=>node(id,'input',0,i*160)),wires:[]};
  ['ab','ac','bc'].forEach((id,i)=>{inner.nodes.push(node(id,'nand',200,i*160),node('o'+id,'output',400,i*160));inner.wires.push(wire(id+'a',id[0],id),wire(id+'b',id[1],id,1),wire(id+'o',id,'o'+id));});
  const def=C.makeDefinition(inner,'three pairs'),source={version:1,definitions:{pairs:def},nodes:[...['a','b','c'].map((id,i)=>node(id,'input',0,i*160)),node('gate','custom',250,0,{def:'pairs'}),...['ab','ac','bc'].map((id,i)=>node('o'+id,'output',500,i*160))],wires:[...['a','b','c'].map((id,i)=>wire('i'+i,id,'gate',i)),...['ab','ac','bc'].map((id,i)=>({id:'o'+i,a:{node:'gate',dir:'out',port:i},b:{node:'o'+id,dir:'in',port:0}}))]},before=JSON.stringify(source);
  const old=C.simulate;let board;C.simulate=()=>{throw Error('custom domino routing must use physical propagation');};try{board=D.build(source);}finally{C.simulate=old;}
  assert.deepEqual(board.inputs.map(p=>p.pins.length),[1,1,1]);assert.equal(board.bones.filter(p=>p.kind==='input').length,3);assert.ok(board.crossovers>0);assert.equal(board.sharedBranches,3,'each twice-used input needs exactly one distribution fork');assert.ok(board.bones.some(p=>p.next.length>1&&p.contacts[0].length>1));
  for(const p of board.bones)for(const id of p.next)assert.ok(D.hits(p,board.bones[id])||D.hits(p,board.bones[id],-1));
  for(let row=0;row<8;row++){const sim=new D.Simulator(board);sim.inputs.forEach((p,i)=>p.value=row>>i&1);sim.reset();const expected=['ab','ac','bc'].map(id=>Number(!((row>>'abc'.indexOf(id[0])&1)&&(row>>'abc'.indexOf(id[1])&1))));assert.deepEqual(sim.run().outputs.map(p=>p.value),expected);}
  assert.equal(JSON.stringify(source),before);
});
