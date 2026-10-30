const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module');
const M=require('../src/minecraft-model.js'),fixture=require('./minecraft-lever-exit-fixture.cjs');
test('old input packing reproduces two stranded lever exits',()=>{
  const file=require.resolve('../src/minecraft-model.js'),old=fs.readFileSync(file,'utf8').replace("type==='input'?{x:p.x+dir.x*2,z:p.z+dir.z*2}:","type==='input'?{x:p.x+dir.x,z:p.z+dir.z}:");
  const mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;mod._compile(old,file);
  assert.equal(mod.exports.build(fixture(87288,67968),()=>{},{basis:'or-not'}).unrouted.length,2);
});
for(const basis of ['or-not','nand'])for(const offset of [[0,0],[87288,67968]])test('compact diagonal levers can leave and rise in '+basis+' at '+offset,()=>{
  const source=fixture(...offset),before=JSON.stringify(source),m=M.build(source,()=>{},{basis});
  assert.deepEqual(m.unrouted,[]);assert.deepEqual(m.warnings,[]);assert.deepEqual(m.world.validate(),[]);
  for(const b of m.world.cells.values())if(b.kind==='dust')for(const q of m.world.dustNeighbors(b))assert.equal(q.net,b.net);
  for(let mask=0;mask<8;mask++){
    for(const [bit,id] of ['a','b','c'].entries()){const l=m.levers.find(l=>l.id===id);if(m.world.cells.get(l.key).on!==!!(mask>>bit&1))m.simulation.toggle(l.key);}
    for(let tick=0;tick<300;tick++)m.simulation.step();
    assert.equal(Number(m.world.cells.get(m.lamps[0].key).on),Number(!(mask&1)&&!!(mask&2)&&!(mask&4)),basis+' row '+mask);
  }
  assert.equal(JSON.stringify(source),before);
});
