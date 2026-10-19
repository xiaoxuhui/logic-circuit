const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../src/minecraft-model.js');
test('the observed nested XOR keeps every input reachable and all four physical rows correct',()=>{
  const source=require('./minecraft-xor-fixture.cjs')(),before=JSON.stringify(source),m=M.build(source);
  assert.equal(m.components.length,12);assert.equal(m.optimization.removedNands,6);assert.deepEqual(m.unrouted,[]);
  assert.ok(m.maxWireHeight>=3);assert.deepEqual(m.world.validate(),[]);
  assert.equal(m.world.at({x:12,y:1,z:8}),undefined,'unused physical output component is omitted after the signal branches earlier');
  assert.equal(m.world.at({x:12,y:0,z:8}),undefined,'its unused support is omitted too');
  for(const b of m.world.cells.values())if(b.kind==='dust')for(const q of m.world.dustNeighbors(b))assert.equal(q.net,b.net);
  for(const mask of [0,1,3,2,0]){for(const [bit,id] of ['a','b'].entries()){const lever=m.levers.find(l=>l.id===id);if(m.world.cells.get(lever.key).on!==!!(mask>>bit&1))m.simulation.toggle(lever.key);}for(let i=0;i<80;i++)m.simulation.step();assert.equal(m.world.cells.get(m.lamps[0].key).on,mask===1||mask===2,'physical XOR '+mask);}
  assert.equal(JSON.stringify(source),before);
});
