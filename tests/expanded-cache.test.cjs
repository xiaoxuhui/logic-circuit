const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js'),E=require('../src/expanded.js');
const n=(id,type,x=0,y=0,extra={})=>({id,type,x,y,...extra}),w=(id,a,b,port=0)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}});
function fixture(){
  const defs={g:C.makeDefinition({nodes:[n('i','input'),n('d','delay',180),n('n','nand',360),n('o','output',540)],wires:[w('id','i','d'),w('dn','d','n'),w('dn2','d','n',1),w('no','n','o')],definitions:{}},'带状态的非门')};
  defs.h=C.makeDefinition({nodes:[n('i','input'),n('child','custom',240,0,{def:'g'}),n('o','output',480)],wires:[w('in','i','child'),w('out','child','o')],definitions:defs},'父门');
  return {version:1,definitions:defs,nodes:[n('i','input'),n('a','custom',240,0,{def:'h'}),n('b','custom',240,220,{def:'h'}),n('o','output',600)],wires:[w('ia','i','a'),w('ib','i','b'),w('ao','a','o')],delayState:{'root/a/child/d':1,'root/b/child/d':1}};
}
test('first state builds on demand, identical siblings share templates and paths remain distinct',()=>{
  E.clearCache();const s=fixture(),before=C.clone(s),view=E.build(s);assert.ok(E.getCacheStats().hits>=1);assert.equal(E.getCacheStats().circuitsBuilt,3);
  assert.deepEqual(view.leaves.filter(n=>n.type==='delay').map(n=>n.scope).sort(),['root/a/child','root/b/child']);
  const ids=[...view.svg.matchAll(/data-expanded-net="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);assert.deepEqual(s,before);
  const again=E.build(C.clone(s));assert.deepEqual(again,view);assert.equal(E.getCacheStats().hits,1);assert.equal(E.getCacheStats().circuitsBuilt,0);
  again.leaves[0].id='corrupted';again.layouts[0].routes[0].paths[0][0].x=-999;assert.deepEqual(E.build(s),view);
});
test('input and delay changes compute only new states; returning to an old state reuses display',()=>{
  E.clearCache();const s=fixture(),original=E.build(s);s.delayState['root/a/child/d']=0;let changed=E.build(s);assert.deepEqual(changed.leaves.find(n=>n.type==='output'&&n.scope==='root').output,[1]);assert.ok(E.getCacheStats().hits>=1);
  s.nodes[0].value=1;E.build(s);assert.ok(E.getCacheStats().circuitsBuilt>0);s.nodes[0].value=0;s.delayState['root/a/child/d']=1;assert.deepEqual(E.build(s),original);assert.equal(E.getCacheStats().circuitsBuilt,0);
});
test('nested edits, wire forces and display options invalidate the affected cached state',()=>{
  E.clearCache();const s=fixture(),original=E.build(s);s.scopedWireOverrides={'root/a/child':{no:[1]}};let view=E.build(s);assert.deepEqual(view.leaves.find(n=>n.type==='output'&&n.scope==='root').output,[1]);assert.deepEqual(view.leaves.find(n=>n.type==='nand'&&n.scope==='root/b/child').values,[[0]]);
  delete s.scopedWireOverrides;assert.deepEqual(E.build(s),original);assert.equal(E.getCacheStats().circuitsBuilt,0);
  s.definitions.g.nodes.find(n=>n.id==='n').label='修改后的门';assert.match(E.build(s).svg,/修改后的门/);assert.ok(E.getCacheStats().circuitsBuilt>0);
  const editable=E.build(s),readonly=E.build(s,{readOnly:true});assert.match(editable.svg,/data-bit-toggle/);assert.ok(!readonly.svg.includes('data-bit-toggle'));
  E.build(s,{direct:true});assert.ok(E.getCacheStats().circuitsBuilt>0);s.displayFormat='hex';E.build(s);assert.ok(E.getCacheStats().circuitsBuilt>0);
});
test('focused instances share relative templates but retain separate captured memory',()=>{
  E.clearCache();const s=fixture(),a=E.focus(s,'a'),b=E.focus(s,'b');assert.equal(E.getCacheStats().circuitsBuilt,0);assert.deepEqual(a.svg,b.svg);assert.deepEqual(a.source.delayState,{'root/child/d':1});b.source.delayState['root/child/d']=0;assert.equal(a.source.delayState['root/child/d'],1);s.delayState['root/b/child/d']=0;assert.notEqual(E.focus(s,'b').svg,a.svg);
});
test('display cache is bounded and evicts rather than precomputing possible input states',()=>{
  E.clearCache();const s={nodes:[n('i','input',0,0,{bits:8}),n('o','output',260,0,{bits:8})],wires:[w('out','i','o')],definitions:{}};let first;
  for(let i=0;i<160;i++){s.nodes[0].value=i;const v=E.build(s);if(!i)first=v;const stats=E.getCacheStats();assert.ok(stats.entries<=stats.maxEntries);assert.ok(stats.bytes<=stats.maxBytes);assert.ok(stats.structureBytes<=stats.maxBytes);}
  assert.ok(E.getCacheStats().evictions>0);s.nodes[0].value=0;assert.deepEqual(E.build(s),first);assert.equal(E.getCacheStats().circuitsBuilt,1);
});
test('thirty thousand NANDs expand completely using cached subtrees without the old node cutoff',()=>{
  E.clearCache();const source=require('./large-expansion-fixture.cjs')(),before=C.clone(source),view=E.build(source);assert.equal(C.countComponents(source).nand,30000);assert.equal(view.leaves.filter(n=>n.type==='nand').length,30000);assert.ok(view.count>30000);assert.ok(E.getCacheStats().hits>=99);assert.ok(E.getCacheStats().bytes<=E.getCacheStats().maxBytes);assert.deepEqual(source,before);assert.ok(!view.svg.includes('undefined'));
});
test('shared scenes draw only visible instances and remap wire hit testing to their real scope',()=>{
  E.clearCache();const s=fixture(),view=E.build(s,{compact:true});assert.equal(view.leaves.filter(n=>n.type==='nand').length,2);assert.ok(view.symbols.length<view.layouts.length);assert.ok(view.svg.length<100000);
  const whole=E.viewportSvg(view,{x:0,y:0,w:view.w,h:view.h},1);assert.ok(!whole.includes('<use '));assert.ok(whole.includes('data-expanded-scope="root/a/child"'));assert.ok(whole.includes('data-expanded-scope="root/b/child"'));
  const origins=new Map([['root',{x:0,y:0}]]);for(const layout of [...view.layouts].reverse()){const parent=origins.get(layout.scope);for(const child of layout.children)origins.set(child.scope,{x:parent.x+child.x,y:parent.y+child.y});}
  const local=view.layouts.find(l=>l.scope==='root/a/child'),route=local.routes.find(r=>r.wire==='no'),segment=route.paths.find(p=>p.length>1),a=segment[0],b=segment[1],origin=origins.get(local.scope),point={x:origin.x+(a.x+b.x)/2,y:origin.y+(a.y+b.y)/2};assert.deepEqual(E.hitTest(view,point,1),{scope:'root/a/child',id:'no'});
  const blank=E.viewportSvg(view,{x:-100000,y:-100000,w:10,h:10},1);assert.ok(!blank.includes('data-expanded-scope="root/a/child"'));
  const tiny=E.viewportSvg(view,{x:0,y:0,w:view.w,h:view.h},.00001);assert.ok(tiny.length<whole.length);
});
