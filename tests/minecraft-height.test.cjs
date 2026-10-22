const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module');
const filename=require.resolve('../src/minecraft-model.js');

function probe(baseline=false){
  let source=fs.readFileSync(filename,'utf8');
  if(baseline){source=source.replace('for(const heightLimit of [initialHeight,...[16,32,48].filter(h=>h>initialHeight)])','for(const heightLimit of [initialHeight])');}
  source=source.replace("progress(35,'正在铺设逐位红石线路与支撑…');",`
    world.cells.clear();reserved.clear();arrivals.clear();portHeads.clear();leverClearance.clear();
    for(let z=-60;z<=60;z++)for(let y=0;y<=8;y++)world.put({kind:'support',x:0,y,z});
    const a=world.put({kind:'dust',x:-12,y:1,z:0,net:'probe'}),b=world.put({kind:'dust',x:12,y:1,z:0,net:'probe'});
    const points=routeSingle(a,b,'probe');return {points,world};
  `);
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=module.paths;mod._compile(source,filename);
  return mod.exports.build({version:1,definitions:{},nodes:[],wires:[]},()=>{},{basis:'or-not'});
}

test('small circuit retries above an eight-block barrier instead of leaving the connection empty',()=>{
  assert.equal(probe(true).points,null,'old height limit must reproduce the failed connection');
  const {points,world}=probe();assert.ok(points,'higher retry finds a path');
  assert.ok(Math.max(...points.map(p=>p.y))>8);
  assert.deepEqual(points[0],{x:-12,y:1,z:0});assert.deepEqual(points.at(-1),{x:12,y:1,z:0});
  for(let i=1;i<points.length;i++){
    assert.equal(Math.abs(points[i].x-points[i-1].x)+Math.abs(points[i].z-points[i-1].z),1);
    assert.ok(Math.abs(points[i].y-points[i-1].y)<=1);
    assert.ok(!world.at(points[i])||world.at(points[i]).kind==='dust','never pass through the wall');
  }
});
