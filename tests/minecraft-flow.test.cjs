const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/minecraft-model.js'),R=require('../src/minecraft-redstone.js');
test('flow arrows follow both forks, bends, upward and downward paths without changing cells',()=>{
  const world=new R.World(),p=(x,y,z)=>({x,y,z}),stem=[p(0,1,0),p(1,1,0),p(2,1,0)],up=[...stem,p(2,1,1),p(2,2,2),p(2,2,3)],down=[...stem,p(3,1,0),p(4,1,0)];
  for(const q of [...up,...down])if(!world.at(q))world.put({kind:'dust',...q,net:'a',power:0});
  const before=JSON.stringify([...world.cells]);
  const arrows=M.flowArrows(world,[{points:up},{points:down}]);
  for(const to of ['2,1,1','3,1,0'])assert.ok(arrows.some(a=>a.from==='2,1,0'&&a.to===to),'each fork has an outgoing arrow');
  assert.ok(arrows.some(a=>a.from==='2,1,1'&&a.to==='2,2,2'),'uphill edge points to its destination');
  assert.ok(arrows.every(a=>a.net==='a'));
  const reversed=M.flowArrows(world,[{points:up.slice().reverse()}]);
  assert.ok(reversed.some(a=>a.from==='2,2,2'&&a.to==='2,1,1'),'downhill direction is preserved');
  assert.equal(JSON.stringify([...world.cells]),before);
});
test('unpowered physical inputs seed internal wire arrows and keep them pointing toward output',()=>{
  const world=new R.World([{kind:'lever',x:0,y:1,z:0,net:'a',on:false},{kind:'dust',x:1,y:1,z:0,net:'a'},{kind:'dust',x:2,y:1,z:0,net:'a'},{kind:'lamp',x:3,y:1,z:0,net:'a',on:false}]);
  const arrows=M.flowArrows(world);
  assert.ok(arrows.some(a=>a.from==='0,1,0'&&a.to==='1,1,0'));
  assert.ok(arrows.some(a=>a.from==='2,1,0'&&a.to==='3,1,0'));
  assert.ok(arrows.every(a=>a.dx===1&&a.dz===0));
});
test('flow marks are decorative instances, never placed materials or signal changes',()=>{
  const source=require('./minecraft-junction-fixture.cjs')(),before=JSON.stringify(source),m=M.build(source,()=>{},{basis:'or-not'});
  assert.ok(m.flowArrowCount>0);const count=m.batches.filter(b=>b.kind==='flowArrow').reduce((n,b)=>n+b.data.length/M.STRIDE,0);assert.equal(count,m.flowArrowCount*3);
  assert.equal(m.materialCounts.flowArrow,undefined);assert.equal([...m.world.cells.values()].filter(b=>b.kind==='flowArrow').length,0);
  assert.equal(Object.values(m.materialCounts).reduce((a,b)=>a+b,0),m.world.cells.size);
  assert.deepEqual(m.unrouted,[]);assert.equal(JSON.stringify(source),before);
});
