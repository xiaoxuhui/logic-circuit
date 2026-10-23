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
  assert.ok(m.flowArrowCount>0);assert.ok(m.flowSegmentCount>=m.flowArrowCount);const count=m.batches.filter(b=>b.kind==='flowArrow').reduce((n,b)=>n+b.data.length/M.STRIDE,0);assert.ok(count>=m.flowSegmentCount+m.flowArrowCount*2);
  assert.equal(m.materialCounts.flowArrow,undefined);assert.equal([...m.world.cells.values()].filter(b=>b.kind==='flowArrow').length,0);
  assert.equal(Object.values(m.materialCounts).reduce((a,b)=>a+b,0),m.world.cells.size);
  assert.deepEqual(m.unrouted,[]);assert.equal(JSON.stringify(source),before);
});

test('every edge of a long route remains connected, including unsampled arrowheads',()=>{
  const world=new R.World(),points=Array.from({length:41},(_,x)=>({x,y:1,z:0}));
  for(const p of points)world.put({...p,kind:'dust',net:'a'});
  const edges=M.flowArrows(world,[{points}]);assert.equal(edges.length,40);
  assert.ok(edges.some(e=>!e.head),'head sampling never removes the continuous shaft');
  for(let i=0;i<40;i++)assert.ok(edges.some(e=>e.from===i+',1,0'&&e.to===(i+1)+',1,0'));
  for(const dy of [-1,0,1]){
    const parts=M.flowSegments({x:0,y:2,z:0,dx:1,dy,dz:0});
    assert.equal(parts.length,dy?3:1);
    if(dy){const [first,rise,last]=parts;assert.ok(first.x+first.w/2>=rise.x);assert.ok(last.x-last.w/2<=rise.x);assert.ok(Math.abs(rise.y-first.y)<=rise.h/2+first.h/2);assert.ok(Math.abs(rise.y-last.y)<=rise.h/2+last.h/2);}
    else assert.ok(parts[0].w>=1,'whole grid edge is covered');
  }
});

test('equal-distance merging sources retain the connecting guide without an arbitrary direction head',()=>{
  const world=new R.World([{kind:'lever',x:0,y:1,z:0,net:'a'},{kind:'lever',x:5,y:1,z:0,net:'a'},...Array.from({length:4},(_,i)=>({kind:'dust',x:i+1,y:1,z:0,net:'a'}))]);
  const middle=M.flowArrows(world).find(e=>new Set([e.from,e.to]).has('2,1,0')&&new Set([e.from,e.to]).has('3,1,0'));
  assert.ok(middle,'the two source wavefronts must have a continuous joining segment');assert.equal(middle.head,false);
});
