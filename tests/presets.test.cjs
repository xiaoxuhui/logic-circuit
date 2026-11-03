const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../src/presets'),C=require('../src/core');
test('every built-in save is a valid independent circuit and passes its complete truth table',()=>{
  assert.deepEqual(P.list.map(p=>p.id),['nand','not','and','or','xor','adder','oscillator','counter4','pulse','calculator8','register8','ram256']);
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
  assert.ok(state.nodes.every(n=>['input','output','nand','delay'].includes(n.type)&&n.pulse===undefined));assert.ok(state.definitions.preset_pulse);
  assert.deepEqual(C.simulate(state).outputs.o,[0]);
  for(const value of [1,0,1,0]){input.value=value;assert.deepEqual(C.simulate(state).outputs.o,[1]);assert.deepEqual(C.simulate(state).outputs.o,[1]);state.delayState=C.step(state);assert.equal(input.value,value);assert.deepEqual(C.simulate(state).outputs.o,[0]);state.delayState=C.step(state);assert.deepEqual(C.simulate(state).outputs.o,[0]);}
  assert.deepEqual(P.load('pulse').delayState,{'root/q':0});
  const definition=C.makeDefinition(state,'短期输入'),outer={version:1,definitions:{pulse:definition},nodes:[{id:'a',type:'input',value:1,x:0,y:0},{id:'gate',type:'custom',def:'pulse',x:300,y:0},{id:'o',type:'output',x:600,y:0}],wires:[{id:'in',a:{node:'a',dir:'out',port:0},b:{node:'gate',dir:'in',port:0}},{id:'out',a:{node:'gate',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}]};assert.deepEqual(C.simulate(outer).outputs.o,[1]);outer.delayState=C.step(outer);assert.deepEqual(C.simulate(outer).outputs.o,[0]);
});

test('default saves carry independent editable custom gates, including hierarchical calculator and memory',()=>{
  for(const preset of P.list){const state=C.validate(P.load(preset.id));assert.ok(state.definitions.preset_xor);assert.ok(state.definitions.preset_adder);assert.ok(state.definitions.preset_pulse);state.definitions.preset_xor.name='changed';assert.equal(P.load(preset.id).definitions.preset_xor.name,'异或门');assert.ok(Buffer.byteLength(JSON.stringify(state))<2*1024*1024);}
  const memory=P.load('ram256');assert.ok(memory.definitions.preset_ram8.nodes.some(n=>n.type==='custom'&&n.def==='preset_ram7'));assert.deepEqual(C.countComponents(memory),{nand:14050,delay:256,hub:511,splitter:1149});assert.equal(C.definitionInfo('preset_ram8',memory.definitions).stateBits,2048);
});

test('eight-bit calculator adds and subtracts with wrapping and carry/borrow output',()=>{
  const state=P.load('calculator8'),sim=C.createSimulator(),input=id=>state.nodes.find(n=>n.id===id);
  for(let a=0;a<256;a++)for(const subtract of [0,1]){const b=a*73%256;input('a').value=a;input('b').value=b;input('subtract').value=subtract;const result=sim(state);assert.deepEqual(result.issues,[]);assert.equal(Number(C.decimal(result.outputs.result)),(subtract?a-b:a+b)&255);assert.deepEqual(result.outputs.carry,[subtract?Number(a<b):Number(a+b>=256)]);}
  for(const [a,b,subtract] of [[0,0,1],[1,1,1],[255,1,0],[0,1,1],[255,255,0],[255,255,1],[128,127,0]]){input('a').value=a;input('b').value=b;input('subtract').value=subtract;const result=sim(state);assert.equal(Number(C.decimal(result.outputs.result)),(subtract?a-b:a+b)&255);assert.deepEqual(result.outputs.carry,[subtract?Number(a<b):Number(a+b>=256)]);}
});

test('eight-bit register writes on steps only, holds when disabled, and clears through delay reset',()=>{
  const state=P.load('register8'),data=state.nodes.find(n=>n.id==='data'),write=state.nodes.find(n=>n.id==='write'),read=()=>Number(C.decimal(C.simulate(state).outputs.o));
  let expected=0;for(let value=0;value<256;value++){data.value=value;write.value=1;assert.equal(read(),expected);state.delayState=C.step(state);expected=value;assert.equal(read(),expected);}write.value=0;data.value=23;state.delayState=C.step(state);assert.equal(read(),255);state.delayState=C.resetDelays(state,'all');assert.equal(read(),0);
});

test('256 by 8 memory independently writes and reads every address without altering other words',()=>{
  const state=C.validate(P.load('ram256')),input=id=>state.nodes.find(n=>n.id===id),model=Array(256).fill(0),read=()=>Number(C.decimal(C.simulate(state).outputs.o));
  for(let address=0;address<256;address++){input('address').value=address;input('data').value=(address*73+19)&255;input('write').value=1;assert.equal(read(),0);state.delayState=C.step(state);model[address]=input('data').value;assert.equal(read(),model[address]);}
  assert.equal(Object.keys(state.delayState).length,256);input('write').value=0;input('data').value=255;state.delayState=C.step(state);
  for(let address=0;address<256;address++){input('address').value=address;assert.equal(read(),model[address]);}
  for(const address of [0,127,255]){input('address').value=address;input('data').value=255-model[address];input('write').value=1;state.delayState=C.step(state);model[address]=input('data').value;}
  input('write').value=0;for(let address=0;address<256;address++){input('address').value=address;assert.equal(read(),model[address]);}
  state.delayState=C.resetDelays(state,'all');for(let address=0;address<256;address++){input('address').value=address;assert.equal(read(),0);}
});
