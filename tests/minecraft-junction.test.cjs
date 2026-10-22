const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/minecraft-model.js'),fixture=require('./minecraft-junction-fixture.cjs');
test('generated OR junction reserves both branch approaches in OR/NOT feedback',()=>{
  const basis='or-not';
  const source=fixture(),before=JSON.stringify(source),m=M.build(source,()=>{},{basis});
  assert.deepEqual(m.unrouted,[]);assert.deepEqual(m.world.validate(),[]);
  assert.ok([...m.world.cells.values()].some(b=>b.owner?.endsWith('/junction')));
  for(const b of m.world.cells.values())if(b.kind==='dust')for(const q of m.world.dustNeighbors(b))assert.equal(q.net,b.net,'cross-net dust');
  const sim=m.simulation;
  for(const [a,b,expected] of [[1,1,1],[0,0,1],[1,0,0],[0,1,0]]){
    for(const [id,value] of [['a',a],['b',b]]){const l=m.levers.find(l=>l.id===id);if(m.world.cells.get(l.key).on!==!!value)sim.toggle(l.key);}
    for(let tick=0;tick<250;tick++)sim.step();
    assert.equal(Number(m.world.cells.get(m.lamps[0].key).on),expected,'set or hold output');
  }
  assert.equal(JSON.stringify(source),before);
});
