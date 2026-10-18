const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js'),E=require('../src/expanded.js');
const node=(id,type,x=0,extra={})=>({id,type,x,y:0,...extra});
const wire=(id,a,b,port=0)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}});
const circuit=(nodes,wires,definitions={})=>({version:1,nodes,wires,definitions});
const gate=bits=>C.makeDefinition(circuit([node('i','input',0,{bits}),node('d','delay',240,{bits}),node('o','output',480,{bits})],[wire('a','i','d'),wire('b','d','o')]),'寄存门');
test('focused original layout removes a large positive origin without moving nodes relative to each other',()=>{
  const g=gate(1);g.nodes.forEach(n=>{n.x+=5000;n.y+=3000;});const s=circuit([node('a','custom',0,{def:'g'})],[],{g}),before=C.clone(s),view=E.focus(s,'a'),boxes=view.layouts[0].boxes;
  assert.equal(Math.min(...boxes.map(n=>n.x)),32);assert.equal(Math.min(...boxes.map(n=>n.y)),32);assert.equal(boxes.find(n=>n.id==='d').x-boxes.find(n=>n.id==='i').x,240);assert.ok(view.w<1000);assert.ok(view.h<500);assert.deepEqual(s,before);
});
test('focused gate captures actual upstream input for each instance without changing source',()=>{
  const s=circuit([node('i','input',0,{value:1}),node('n','nand',240),node('a','custom',480,{def:'g'}),node('b','custom',720,{def:'g'})],[wire('in1','i','n'),wire('in2','i','n',1),wire('direct','i','a'),wire('invert','n','b')],{g:gate(1)}),before=C.clone(s);
  assert.deepEqual(E.focus(s,'a').leaves.find(n=>n.id==='i').values,[[1]]);
  assert.deepEqual(E.focus(s,'b').leaves.find(n=>n.id==='i').values,[[0]]);
  assert.equal(E.focus(s,'a').leaves.length,3);assert.deepEqual(s,before);
  assert.ok(!E.focus(s,'a').svg.includes('data-bit-toggle'));assert.throws(()=>E.focus(s,'n'));
});
test('focused wide gate honors forced input and maps only its nested delay memory',()=>{
  const definitions={g:gate(16)};definitions.h=C.makeDefinition(circuit([node('i','input',0,{bits:16}),node('sub','custom',240,{def:'g'}),node('o','output',480,{bits:16})],[wire('a','i','sub'),wire('b','sub','o')],definitions),'父门');
  definitions.h.nodes.find(n=>n.id==='sub').y=120;definitions.h.nodes.find(n=>n.id==='sub').rotation=90;
  const s=circuit([node('i','input',0,{bits:16,value:65535}),node('a','custom',240,{def:'h'}),node('b','custom',480,{def:'h'})],[wire('x','i','a')],definitions);
  s.delayState={'root/a/sub/d':513,'root/b/sub/d':65535};s.wireOverrides={x:C.bitArray(21845,16)};
  const before=C.clone(s),view=E.focus(s,'a');
  assert.equal(C.decimal(view.leaves.find(n=>n.id==='i'&&n.scope==='root').values[0]),'21845');
  assert.equal(view.leaves.some(n=>n.type==='delay'),false);
  assert.equal(C.decimal(view.leaves.find(n=>n.type==='custom').values[0]),'513');
  assert.equal(C.decimal(view.leaves.find(n=>n.id==='o'&&n.scope==='root').output),'513');
  assert.deepEqual(E.focus(s,'b').leaves.find(n=>n.id==='i'&&n.scope==='root').values,[Array(16).fill(0)]);
  assert.deepEqual(s,before);
  const boxes=view.layouts[0].boxes;assert.equal(view.layouts.length,1);assert.equal(view.frames.length,0);
  assert.equal(boxes.find(n=>n.id==='sub').x-boxes.find(n=>n.id==='i').x,240);
  assert.equal(boxes.find(n=>n.id==='sub').y-boxes.find(n=>n.id==='i').y,120);
  const inputBox=boxes.find(n=>n.id==='i'),offset={x:inputBox.x,y:inputBox.y};
  assert.deepEqual(view.layouts[0].routes.find(r=>r.ports.some(p=>p.node==='i')).paths,[C.points(definitions.h.wires[0],{...definitions.h,definitions}).map(p=>({x:p.x+offset.x,y:p.y+offset.y}))]);
});
