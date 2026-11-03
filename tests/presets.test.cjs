const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../src/presets'),C=require('../src/core');
test('every built-in save is a valid independent circuit and passes its complete truth table',()=>{
  assert.deepEqual(P.list.map(p=>p.id),['nand','not','and','or','xor','adder','oscillator','counter4','pulse']);
  for(const p of P.list.slice(0,6)){const state=C.validate(P.load(p.id)),inputs=state.nodes.filter(n=>n.type==='input');for(let row=0;row<2**inputs.length;row++){inputs.forEach((n,i)=>n.value=row>>i&1);const a=row&1,b=row>>1&1,total=a+b+(row>>2&1),result=C.simulate(state);const expected=p.id==='nand'?[Number(!(a&&b))]:p.id==='not'?[1-a]:p.id==='and'?[a&b]:p.id==='or'?[a|b]:p.id==='xor'?[a^b]:[total&1,total>>1];assert.deepEqual(state.nodes.filter(n=>n.type==='output').map(n=>result.outputs[n.id][0]),expected,p.id+' row '+row);assert.deepEqual(result.issues,[]);}state.nodes[0].label='changed';assert.equal(P.load(p.id).nodes[0].label,'A');}
  assert.throws(()=>P.load('missing'),/默认存档/);
});
test('sequential defaults contain NANDs and delay memory, with synchronous oscillation and 4-bit counting',()=>{
  const oscillator=C.validate(P.load('oscillator'));for(let tick=0;tick<12;tick++){assert.deepEqual(C.simulate(oscillator).outputs.o,[tick%2]);oscillator.delayState=C.step(oscillator);}
  const counter=C.validate(P.load('counter4'));assert.equal(counter.nodes.filter(n=>n.type==='nand').length,22);assert.equal(counter.nodes.filter(n=>n.type==='delay').length,4);
  const value=()=>Number(C.decimal(C.simulate(counter).outputs.count));for(let tick=0;tick<34;tick++){assert.equal(value(),tick%16);assert.deepEqual(C.simulate(counter).issues,[]);counter.delayState=C.step(counter);}counter.nodes.find(n=>n.id==='enable').value=0;const held=value();for(let tick=0;tick<5;tick++){counter.delayState=C.step(counter);assert.equal(value(),held);}counter.nodes.find(n=>n.id==='enable').value=1;counter.delayState=C.step(counter);assert.equal(value(),(held+1)%16);counter.delayState=C.resetDelays(counter,'all');assert.equal(value(),0);assert.deepEqual(P.load('counter4').delayState,{'root/q0':0,'root/q1':0,'root/q2':0,'root/q3':0});
});

test('short input default is an XOR of the input and its delayed value using only NAND and delay logic',()=>{
  const state=C.validate(P.load('pulse')),input=state.nodes.find(n=>n.type==='input');
  assert.equal(state.nodes.filter(n=>n.type==='nand').length,4);assert.equal(state.nodes.filter(n=>n.type==='delay').length,1);
  assert.ok(state.nodes.every(n=>['input','output','nand','delay'].includes(n.type)&&n.pulse===undefined));assert.deepEqual(state.definitions,{});
  assert.deepEqual(C.simulate(state).outputs.o,[0]);
  for(const value of [1,0,1,0]){input.value=value;assert.deepEqual(C.simulate(state).outputs.o,[1]);assert.deepEqual(C.simulate(state).outputs.o,[1]);state.delayState=C.step(state);assert.equal(input.value,value);assert.deepEqual(C.simulate(state).outputs.o,[0]);state.delayState=C.step(state);assert.deepEqual(C.simulate(state).outputs.o,[0]);}
  assert.deepEqual(P.load('pulse').delayState,{'root/q':0});
  const definition=C.makeDefinition(state,'短期输入'),outer={version:1,definitions:{pulse:definition},nodes:[{id:'a',type:'input',value:1,x:0,y:0},{id:'gate',type:'custom',def:'pulse',x:300,y:0},{id:'o',type:'output',x:600,y:0}],wires:[{id:'in',a:{node:'a',dir:'out',port:0},b:{node:'gate',dir:'in',port:0}},{id:'out',a:{node:'gate',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}]};assert.deepEqual(C.simulate(outer).outputs.o,[1]);outer.delayState=C.step(outer);assert.deepEqual(C.simulate(outer).outputs.o,[0]);
});
