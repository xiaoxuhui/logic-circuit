const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const M=require('../src/minecraft-model.js');
const fixture=require('./minecraft-wide-adder-fixture.cjs');

for(const basis of ['nand','or-not'])test('dense eight-bit ripple adder connects isolated powered routes in '+basis,()=>{
  const source=fixture(),before=C.clone(source),m=M.build(source,()=>{},{basis});
  assert.equal(m.optimization.sourceNands,248);
  assert.deepEqual(m.unrouted,[]);
  assert.deepEqual(m.warnings,[],'every long route must have usable repeater landings');
  assert.deepEqual(m.world.validate(),[]);
  assert.ok(m.maxWireHeight>8,'dense routes can leave the old fixed-height search box');
  for(const b of m.world.cells.values()){
    if(b.kind==='dust')for(const q of m.world.dustNeighbors(b))assert.equal(q.net,b.net,'cross-net dust connection');
    if(b.owner===null)for(const l of m.levers)assert.ok(Math.max(Math.abs(b.x-l.x+.5),Math.abs(b.z-l.z+.5))>=2,'route crowds a lever');
  }
  for(const [a,b,cin] of [[0,0,0],[1,1,0],[255,1,0],[170,85,1],[128,64,1],[255,255,1]]){
    for(const lever of m.levers){
      const value=lever.id==='a'?a:lever.id==='b'?b:cin;
      if(m.world.cells.get(lever.key).on!==!!(value>>lever.bit&1))m.simulation.toggle(lever.key);
    }
    let ticks=0;
    do{m.simulation.step();ticks++;}while(m.simulation.pending.size&&ticks<2000);
    assert.equal(m.simulation.pending.size,0,'redstone must settle');
    let sum=0,carry=0;
    for(const lamp of m.lamps)if(m.world.cells.get(lamp.key).on){if(lamp.id==='sum')sum|=1<<lamp.bit;else carry=1;}
    assert.equal(sum+carry*256,a+b+cin,`${basis}: ${a}+${b}+${cin}`);
  }
  assert.deepEqual(source,before,'conversion must not change the save');
});
