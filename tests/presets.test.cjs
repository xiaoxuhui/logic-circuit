const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../src/presets'),C=require('../src/core');
test('every built-in save is a valid independent circuit and passes its complete truth table',()=>{
  assert.deepEqual(P.list.map(p=>p.id),['nand','not','and','or','xor','adder']);
  for(const p of P.list){const state=C.validate(P.load(p.id)),inputs=state.nodes.filter(n=>n.type==='input');for(let row=0;row<2**inputs.length;row++){inputs.forEach((n,i)=>n.value=row>>i&1);const a=row&1,b=row>>1&1,total=a+b+(row>>2&1),result=C.simulate(state);const expected=p.id==='nand'?[Number(!(a&&b))]:p.id==='not'?[1-a]:p.id==='and'?[a&b]:p.id==='or'?[a|b]:p.id==='xor'?[a^b]:[total&1,total>>1];assert.deepEqual(state.nodes.filter(n=>n.type==='output').map(n=>result.outputs[n.id][0]),expected,p.id+' row '+row);assert.deepEqual(result.issues,[]);}state.nodes[0].label='changed';assert.equal(P.load(p.id).nodes[0].label,'A');}
  assert.throws(()=>P.load('missing'),/默认存档/);
});
