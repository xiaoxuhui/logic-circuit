const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
const n=(id,type,extra={})=>({id,type,x:0,y:0,...extra}),w=(id,a,b,port=0)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}});
function referenceStep(s){const memory=s.delayState||{},next={};function sample(local,overrides={},scope='root',depth=0){const sim=C.simulate(local,overrides,depth,{memory,scope,useTruthTables:false});for(const node of local.nodes){const ins=C.ports(node,s.definitions).filter(p=>p.dir==='in').map(p=>sim.portValues[C.key(p)]);if(node.type==='delay')next[scope+'/'+node.id]=C.packBits(ins[0]);else if(node.type==='custom'){const d=s.definitions[node.def];sample({nodes:d.nodes,wires:d.wires,definitions:s.definitions},Object.fromEntries(d.inputs.map((p,i)=>[p.id,ins[i]])),scope+'/'+node.id,depth+1);}}}sample(s);return next;}
function definition(bits=1){return C.makeDefinition({nodes:[n('i','input',{bits}),n('d','delay',{bits}),n('e','delay',{bits}),n('o','output',{bits})],wires:[w('a','i','d'),w('b','d','e'),w('c','e','o')],definitions:{}},'级联');}
function root(defs){return {version:1,definitions:defs,nodes:[n('i','input',{value:1}),n('a','custom',{def:'g'}),n('b','custom',{def:'g'}),n('o','output')],wires:[w('a','i','a'),w('b','a','b'),w('c','b','o')]};}
test('all small input/state rows equal original evaluation and simultaneous sampling',()=>{
  const s=root({g:definition()});
  for(let value=0;value<32;value++){s.nodes[0].value=value&1;s.delayState=Object.fromEntries(['a/d','a/e','b/d','b/e'].map((p,i)=>['root/'+p,(value>>(i+1))&1]));const before=C.clone(s),sim=C.simulate(s),ref=C.simulate(s,{},0,{memory:s.delayState,scope:'root',useTruthTables:false});assert.deepEqual(sim.outputs,ref.outputs);assert.deepEqual(sim.wires,ref.wires);assert.deepEqual(C.step(s),referenceStep(s));assert.deepEqual(s,before);}
  assert.equal(C.definitionInfo('g',s.definitions).stateBits,2);
});
test('nested feedback through delays, forcing and reset keep independent instance state',()=>{
  const g=C.makeDefinition({nodes:[n('d','delay'),n('n','nand'),n('o','output')],wires:[w('a','d','n'),w('b','d','n',1),w('c','n','d'),w('q','d','o')],definitions:{}},'反相反馈'),defs={g};defs.h=C.makeDefinition({nodes:[n('child','custom',{def:'g'}),n('o','output')],wires:[w('q','child','o')],definitions:defs},'嵌套');
  const s={version:1,definitions:defs,nodes:[n('a','custom',{def:'h'}),n('b','custom',{def:'h'}),n('o','output')],wires:[w('q','a','o')],delayState:{'root/a/child/d':1,'root/b/child/d':0}};
  for(let i=0;i<8;i++){assert.deepEqual(C.step(s),referenceStep(s));s.delayState=C.step(s);assert.notEqual(s.delayState['root/a/child/d'],s.delayState['root/b/child/d']);}
  s.wireOverrides={q:[1]};assert.deepEqual(C.step(s),referenceStep(s));s.delayState={};assert.deepEqual(C.step(s),referenceStep(s));assert.equal(C.simulate(s).definitionModes.h,'状态真值表');
});
test('256-bit state stays exact; editing invalidates output and next-state rows',()=>{
  const s=root({g:definition(256)});s.nodes[0].bits=s.nodes[3].bits=256;s.nodes[0].value='1'.repeat(256);s.delayState={'root/a/d':'10'.repeat(128),'root/a/e':'01'.repeat(128)};assert.deepEqual(C.step(s),referenceStep(s));assert.deepEqual(C.simulate(s).outputs,C.simulate(s,{},0,{memory:s.delayState,scope:'root',useTruthTables:false}).outputs);
  C.step(s);s.definitions.g.wires=s.definitions.g.wires.filter(w=>w.id!=='b');const changed=C.step(s);assert.deepEqual(changed,referenceStep(s));assert.equal(changed['root/a/e'],0);
});
test('30000 NANDs and 2000 registers use sparse shared transition rows',()=>{
  const g=C.makeDefinition({nodes:[n('d','delay'),...Array.from({length:15},(_,i)=>n('n'+i,'nand'))],wires:[...Array.from({length:15},(_,i)=>[w('a'+i,i?'n'+(i-1):'d','n'+i),w('b'+i,i?'n'+(i-1):'d','n'+i,1)]).flat(),w('clock','n14','d')],definitions:{}},'单元'),defs={g};defs.h=C.makeDefinition({nodes:Array.from({length:100},(_,i)=>n('g'+i,'custom',{def:'g'})),wires:[],definitions:defs},'分组');defs.big=C.makeDefinition({nodes:Array.from({length:20},(_,i)=>n('h'+i,'custom',{def:'h'})),wires:[],definitions:defs},'大门');
  const s={version:1,nodes:[n('big','custom',{def:'big'})],wires:[],definitions:defs},run=C.createSimulator();assert.equal(C.definitionInfo('big',defs).stateBits,2000);assert.equal(C.definitionInfo('big',defs).cachedRows,0);run(s);assert.ok(run.stats.nodeEvaluations<200,'must not expand 30000 NANDs');assert.ok(run.stats.tableHits>0);assert.equal(C.definitionInfo('big',defs).cachedRows,1);
  s.delayState=Object.fromEntries(Array.from({length:20},(_,h)=>Array.from({length:100},(_,g)=>['root/big/h'+h+'/g'+g+'/d',1])).flat());run(s);assert.ok(run.stats.nodeEvaluations<200);assert.equal(C.definitionInfo('big',defs).cachedRows,2);s.definitions=C.clone(s.definitions);assert.equal(C.definitionInfo('big',s.definitions).cachedRows,2);s.delayState={};run(s);assert.equal(run.stats.nodeEvaluations,1);assert.ok(run.stats.tableHits>0);const next=C.step(s);assert.equal(Object.keys(next).length,2000);assert.ok(Object.values(next).every(v=>v===1));
});
test('wide state rows keep cache memory bounded without changing transitions',()=>{
  const defs={g:C.makeDefinition({nodes:Array.from({length:40},(_,i)=>n('d'+i,'delay',{bits:256})),wires:[],definitions:{}},'宽状态')},s={nodes:[n('g','custom',{def:'g'})],wires:[],definitions:defs};
  for(let value=0;value<220;value++){s.delayState={'root/g/d0':value};C.simulate(s);}
  const info=C.definitionInfo('g',defs);assert.ok(info.cachedRows>0&&info.cachedRows<220);assert.ok(info.cachedBytes<=4*1024*1024);assert.ok(Object.values(C.step(s)).every(value=>value===0));
});
test('reusing a cloned library keeps rows while later edits cannot mutate old table sources',()=>{
  const s=root({g:definition()}),saved=C.clone(s.definitions);C.step(s);const rows=C.definitionInfo('g',s.definitions).cachedRows;
  s.definitions=C.clone(s.definitions);assert.equal(C.definitionInfo('g',s.definitions).cachedRows,rows);
  s.definitions.g.wires=[];assert.deepEqual(C.step(s),referenceStep(s));
  s.definitions=saved;s.delayState={'root/a/d':1,'root/a/e':1};assert.deepEqual(C.step(s),referenceStep(s));assert.equal(C.step(s)['root/a/d'],1);
});
