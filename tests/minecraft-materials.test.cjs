const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../src/minecraft-model.js');
const source=()=>({version:1,definitions:{},nodes:[{id:'i',type:'input',x:0,y:0,bits:8,value:5},{id:'d',type:'delay',x:300,y:0,bits:8},{id:'o',type:'output',x:600,y:0,bits:8}],wires:[{id:'i',a:{node:'i',dir:'out',port:0},b:{node:'d',dir:'in',port:0}},{id:'o',a:{node:'d',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}]});
test('materials count placed world cells, excluding decorative repeater torches and duplicate lever parts',()=>{
  const m=M.build(source()),actual={support:0,slab:0,dust:0,torch:0,repeater:0,lever:0,lamp:0};
  for(const b of m.world.cells.values())actual[b.kind]++;
  assert.deepEqual(m.materialCounts,actual);assert.equal(Object.values(actual).reduce((a,b)=>a+b,0),m.world.cells.size);
  assert.equal(actual.lever,8);assert.equal(actual.lamp,8);assert.equal(actual.torch,0);assert.ok(actual.repeater>=8);assert.ok(actual.support>0);assert.ok(actual.dust>0);
  assert.ok(m.batches.some(b=>b.kind==='torch'),'repeaters have decorative torch meshes that must not count as placed torches');
  const before={...m.materialCounts},size=m.world.cells.size;m.simulation.setContinuous(true);m.simulation.toggle(m.levers[0].key);assert.deepEqual(m.materialCounts,before);assert.equal(m.world.cells.size,size);
});
test('empty Minecraft circuit reports zero for every material',()=>{
  const m=M.build({version:1,definitions:{},nodes:[],wires:[]});assert.deepEqual(m.materialCounts,{support:0,slab:0,dust:0,torch:0,repeater:0,lever:0,lamp:0});
});
