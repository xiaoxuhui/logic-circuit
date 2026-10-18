const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../src/expanded.js');
const box=(id,x,y,w,h)=>({id,x,y,w,h}),layout=(scope,boxes,children=[])=>({scope,boxes,children}),view=(...layouts)=>({layouts});
const old=view(layout('root',[box('a',0,0,100,100),box('b',300,0,100,100)])),next=view(layout('root',[box('a',10,20,400,300),box('b',610,20,500,300)]));
test('center on a gate maps to the same gate top left after expansion',()=>{assert.deepEqual(E.resolveAnchor(next,E.captureAnchor(old,{x:50,y:50})),{x:10,y:20});});
test('horizontal gap retains its fractional position between adjacent gate edges',()=>{assert.deepEqual(E.resolveAnchor(next,E.captureAnchor(old,{x:200,y:50})),{x:510,y:170});assert.deepEqual(E.resolveAnchor(next,E.captureAnchor(old,{x:150,y:25})),{x:460,y:95});});
test('gap anchors prefer nearby gates over an edge on a distant row',()=>{const a=view(layout('root',[...old.layouts[0].boxes,box('far',0,1000,199,100)])),b=view(layout('root',[...next.layouts[0].boxes,box('far',0,2000,9000,100)]));assert.deepEqual(E.resolveAnchor(b,E.captureAnchor(a,{x:200,y:50})),{x:510,y:170});});
test('vertical gap and distance outside a row follow nearby gates',()=>{const a=view(layout('root',[box('a',0,0,100,100),box('b',0,300,100,100)])),b=view(layout('root',[box('a',50,20,400,300),box('b',50,520,400,500)]));assert.deepEqual(E.resolveAnchor(b,E.captureAnchor(a,{x:50,y:200})),{x:250,y:420});assert.deepEqual(E.resolveAnchor(b,E.captureAnchor(a,{x:-30,y:50})),{x:20,y:170});});
test('nested instance anchors use local coordinates and fall back when reducing depth',()=>{
  const a=view(layout('root/g',[box('n',10,20,100,100)]),layout('root',[box('g',0,0,1000,1000)],[{scope:'root/g',x:30,y:60,w:900,h:900}]));
  const b=view(layout('root/g',[box('n',80,90,300,300)]),layout('root',[box('g',20,40,2000,2000)],[{scope:'root/g',x:50,y:100,w:1900,h:1900}]));
  const anchor=E.captureAnchor(a,{x:90,y:130});assert.equal(anchor.levels.at(-1).gate,'n');assert.deepEqual(E.resolveAnchor(b,anchor),{x:130,y:190});
  assert.deepEqual(E.resolveAnchor(view(layout('root',[box('g',200,300,100,100)])),anchor),{x:200,y:300});
});
test('empty scenes preserve the previous world point and missing scopes do not recurse forever',()=>{const empty=view(layout('root',[])),p={x:10,y:20};assert.deepEqual(E.resolveAnchor(empty,E.captureAnchor(empty,p)),p);assert.deepEqual(E.resolveAnchor(empty,{point:p,levels:[{scope:'other/removed',gate:'a'}]}),p);});
