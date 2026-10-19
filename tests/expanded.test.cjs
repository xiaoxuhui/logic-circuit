const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js'),E=require('../src/expanded.js');
const n=(id,type,x,y,extra={})=>({id,type,x,y,...extra}),p=(node,port=0,dir='out')=>({node,port,dir});
const base=()=>({version:1,nodes:[n('a','input',0,0),n('b','input',0,160),n('g','nand',250,0),n('o','output',500,0)],wires:[{id:'a',a:p('a'),b:p('g',0,'in')},{id:'b',a:p('b'),b:p('g',1,'in')},{id:'q',a:p('g'),b:p('o',0,'in')}],definitions:{}});
const nested=()=>{const s=base();s.definitions.g=C.makeDefinition(s,'自定义 A');s.nodes[2]={...s.nodes[2],type:'custom',def:'g'};s.definitions.h=C.makeDefinition(s,'嵌套 B');s.nodes[2].def='h';return s;};

test('expanded leaf ports keep all four directions and wires leave along the outward normal',()=>{
  const definitions={pass:C.makeDefinition({nodes:[n('i','input',0,0),n('o','output',400,0)],wires:[{id:'w',a:p('i'),b:p('o',0,'in')}]},'直通')};
  for(const rotation of [0,90,180,270])for(const type of ['input','output','nand','delay','hub','splitter','custom'])for(const compact of [false,true]){
    const node=n('target',type,0,0,{rotation,bits:4,...(type==='custom'?{def:'pass'}:{})}),ports=C.ports(node,definitions),s={version:1,nodes:[node],definitions,wires:ports.map((port,i)=>({id:'w'+i,a:{node:'target',dir:port.dir,port:port.port},b:{x:900,y:400+i*30},via:[]}))},before=C.clone(s),view=E.build(s,{direct:true,compact}),layout=view.layouts.at(-1),box=layout.boxes[0];
    assert.deepEqual({w:box.w,h:box.h},C.size(node,definitions));assert.ok(view.svg.includes('transform="'+C.rotationTransform(node,definitions)+'"'));
    for(const port of ports){const route=layout.routes.find(r=>r.ports.some(p=>p.dir===port.dir&&p.port===port.port)),start={x:box.x+port.x,y:box.y+port.y},path=route.paths.find(ps=>ps[0].x===start.x&&ps[0].y===start.y),next=path.find(q=>q.x!==start.x||q.y!==start.y),sign=port.dir==='out'?1:-1,angle=rotation*Math.PI/180,dx=Math.round(Math.cos(angle))*sign,dy=Math.round(Math.sin(angle))*sign;
      assert.ok((next.x-start.x)*dx+(next.y-start.y)*dy>0,type+' '+rotation+' '+port.dir);
      assert.ok((next.x-start.x)*dy-(next.y-start.y)*dx===0);
    }
    assert.deepEqual(s,before);
  }
});

test('fully expanded nested NAND and delay retain their saved input and output orientation',()=>{
  const s=base();s.nodes.find(n=>n.id==='g').rotation=270;s.nodes.push(n('delay','delay',250,200,{rotation:90}));s.wires.push({id:'delay',a:p('g'),b:p('delay',0,'in')});s.definitions.inner=C.makeDefinition(s,'内部');s.nodes=[n('a','input',0,0),n('b','input',0,200),n('gate','custom',300,0,{def:'inner'}),n('o','output',700,0)];s.wires=[{id:'a',a:p('a'),b:p('gate',0,'in')},{id:'b',a:p('b'),b:p('gate',1,'in')},{id:'q',a:p('gate'),b:p('o',0,'in')}];
  const view=E.build(s),layout=view.layouts.find(l=>l.scope==='root/gate');for(const id of ['g','delay']){const node=s.definitions.inner.nodes.find(n=>n.id===id),box=layout.boxes.find(b=>b.id===id);assert.deepEqual({w:box.w,h:box.h},C.size(node,s.definitions));}
});
test('layer limits expand exactly the requested custom levels without changing signals or source',()=>{
  const s=nested();s.definitions.j=C.makeDefinition(s,'第三层');s.nodes[2].def='j';s.nodes[0].value=1;s.nodes[1].value=1;
  const before=C.clone(s);E.clearCache();
  for(const [limit,def] of [[1,'h'],[2,'g'],[3,null],[undefined,null],[2,'g'],[1,'h']]){
    const view=E.build(s,{maxLayers:limit}),custom=view.leaves.filter(n=>n.type==='custom');
    assert.equal(view.frames.length,limit===undefined?3:Math.min(limit,3));
    assert.deepEqual(custom.map(n=>n.def),def?[def]:[]);
    assert.deepEqual(view.leaves.find(n=>n.type==='output').output,[0]);
    if(def)assert.deepEqual(custom[0].inputs,[[1],[1]]);
    assert.deepEqual(s,before);
  }
});
test('same definition at different depths gets the correct remaining expansion budget',()=>{
  const s=nested();s.nodes.push(n('sibling','custom',250,300,{def:'g'}));s.wires.push({id:'sib',a:p('a'),b:p('sibling',0,'in')});
  E.clearCache();for(const limit of [1,2,1,2]){const view=E.build(s,{maxLayers:limit,compact:true});assert.equal(view.leaves.filter(n=>n.type==='custom').length,limit===1?1:0);assert.equal(view.leaves.filter(n=>n.type==='nand').length,limit===1?1:2);assert.ok(!view.svg.includes('NaN'));}
});
test('layer validation rejects invalid values while default and direct expansion stay compatible',()=>{
  for(const maxLayers of [0,-1,1.5,NaN,'2',C.MAX_DEPTH+1])assert.throws(()=>E.build(nested(),{maxLayers}),/展开层数/);
  assert.equal(E.build(nested(),{direct:true}).frames.length,0);
  assert.equal(E.build(nested()).frames.length,2);
});
test('recursive expansion reveals only primitive leaves and preserves source',()=>{const s=nested(),before=C.clone(s),r=E.build(s);assert.equal(r.frames.length,2);assert.equal(r.leaves.filter(n=>n.type==='nand').length,1);assert.ok(r.leaves.every(n=>n.type!=='custom'));assert.deepEqual(s,before);assert.ok(r.w>0&&r.h>0);});
test('expanded NAND receives actual boundary values for every truth table row',()=>{for(let a=0;a<2;a++)for(let b=0;b<2;b++){const s=nested();s.nodes[0].value=a;s.nodes[1].value=b;const r=E.build(s),gate=r.leaves.find(n=>n.type==='nand');assert.deepEqual(gate.inputs,[[a],[b]]);assert.deepEqual(gate.values,[[1-(a&b)]]);assert.deepEqual(r.leaves.find(n=>n.type==='output').output,[1-(a&b)]);}});
test('deleted but still used definition remains expandable',()=>{const s=C.deleteDefinition(nested(),'g'),r=E.build(s);assert.equal(s.definitions.g.hidden,true);assert.equal(r.leaves.filter(n=>n.type==='nand').length,1);});
test('expanded bus boundary preserves bit width and numeric signal',()=>{const s={version:1,nodes:[n('a','input',0,0,{bits:4,value:10}),n('o','output',300,0,{bits:4})],wires:[{id:'w',a:p('a'),b:p('o',0,'in')}],definitions:{}};s.definitions.g=C.makeDefinition(s,'四位通路');s.nodes=[n('i','input',0,0,{bits:4,value:9}),n('g','custom',250,0,{def:'g'}),n('out','output',500,0,{bits:4})];s.wires=[{id:'i',a:p('i'),b:p('g',0,'in')},{id:'o',a:p('g'),b:p('out',0,'in')}];const r=E.build(s);assert.deepEqual(r.leaves.find(n=>n.type==='output').output,[1,0,0,1]);assert.ok(r.svg.includes('1001'));});
test('labels are escaped and free wires remain visible',()=>{const s=nested();s.definitions.h.name='<script>门</script>';s.wires.push({id:'free',a:{x:10,y:400},b:{x:150,y:400}});const r=E.build(s);assert.ok(r.svg.includes('&lt;script&gt;'));assert.ok(!r.svg.includes('<script>'));assert.ok(!r.svg.includes('undefined'));assert.ok(!r.svg.includes('NaN'));});


test('expanded siblings never overlap and wire paths never cross component interiors or share another net segment',()=>{const s=nested();s.nodes.push(n('second','custom',250,10,{def:'g'}));s.wires.push({id:'fan',a:p('a'),b:p('second',0,'in')});const view=E.build(s);for(const layout of view.layouts){const boxes=layout.boxes;for(let i=0;i<boxes.length;i++)for(let j=0;j<i;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'overlap '+layout.scope);}const segments=[];for(const route of layout.routes)for(const path of route.paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];assert.ok(a.x===b.x||a.y===b.y);for(const box of boxes){const crosses=a.x===b.x?a.x>box.x&&a.x<box.x+box.w&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.h:a.y>box.y&&a.y<box.y+box.h&&Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.w;assert.equal(crosses,false,'wire through '+box.id+' in '+layout.scope);}for(const other of segments){if(other.id===route.id)continue;const c=other.a,d=other.b,sameVertical=a.x===b.x&&c.x===d.x&&a.x===c.x&&Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))>Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)),sameHorizontal=a.y===b.y&&c.y===d.y&&a.y===c.y&&Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))>Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x));assert.ok(!sameVertical&&!sameHorizontal,'different nets share a segment');}segments.push({id:route.id,a,b});}}});
test('expanded boundary order follows saved port order even when input positions change',()=>{const s=nested(),d=s.definitions.g;d.inputs.reverse();d.nodes.find(n=>n.id==='a').y=500;d.nodes.find(n=>n.id==='b').y=0;const before=C.clone(s),r=E.build(s),layout=r.layouts.find(l=>l.scope==='root/g/g');assert.ok(layout.boxes.find(n=>n.id===d.inputs[0].id).y<layout.boxes.find(n=>n.id===d.inputs[1].id).y);assert.ok(r.svg.includes('IN1 · '+d.inputs[0].label));assert.deepEqual(s,before);});
test('expanded network descriptions distinguish separate NAND inputs and rotated source stays unchanged',()=>{const s=base();s.nodes[0].label='A';s.nodes[1].label='B';s.nodes[2].rotation=90;s.nodes[0].value=1;s.nodes[1].value=0;const before=C.clone(s),r=E.build(s);assert.equal(r.layouts.at(-1).routes.length,3);assert.ok(r.svg.includes('A 输出1'));assert.ok(r.svg.includes('B 输出1'));assert.deepEqual(r.leaves.find(n=>n.type==='nand').inputs,[[1],[0]]);assert.deepEqual(s,before);});


test('old packaged idle NAND is hidden internally while real gates, boundary IO and source remain',()=>{const s=nested();s.definitions.g.nodes.push(n('idle','nand',0,0));s.nodes.push(n('topIdle','nand',-200,0));const before=C.clone(s),r=E.build(s);assert.equal(r.leaves.filter(n=>n.type==='nand').length,2);assert.ok(!r.leaves.some(n=>n.id==='idle'));assert.ok(r.leaves.some(n=>n.id==='topIdle'));assert.ok(r.svg.includes('IN1'));assert.deepEqual(s,before);});
test('internal gate connected by a free endpoint still appears in expansion',()=>{const s=nested(),d=s.definitions.g;d.nodes.push(n('extra','nand',800,400));const port=C.ports(d.nodes.at(-1),{}).find(p=>p.dir==='in');d.wires.push({id:'loose',a:{x:port.x,y:port.y},b:{x:700,y:port.y}});const r=E.build(s);assert.ok(r.leaves.some(n=>n.id==='extra'));});


test('top-level input and output groups retain exact pairwise offsets and rotations',()=>{const s=base();s.nodes[0]={...s.nodes[0],x:-320,y:110,rotation:90};s.nodes[1]={...s.nodes[1],x:-90,y:350,rotation:270};s.nodes.push(n('c','input',-220,640,{bits:4,value:9,rotation:180}),n('o2','output',880,420,{rotation:90}));s.nodes.find(n=>n.id==='o').y=-130;s.wires.push({id:'q2',a:p('g'),b:p('o2',0,'in')});const before=C.clone(s),r=E.build(s),boxes=r.layouts.find(l=>l.scope==='root').boxes;for(const type of ['input','output']){const nodes=s.nodes.filter(n=>n.type===type);for(const a of nodes)for(const b of nodes){const x=boxes.find(n=>n.id===a.id),y=boxes.find(n=>n.id===b.id);assert.equal(x.x-y.x,a.x-b.x);assert.equal(x.y-y.y,a.y-b.y);assert.deepEqual({w:x.w,h:x.h},C.size(a,{}));}}assert.deepEqual(s,before);});
test('nested IO groups preserve original geometry independently of saved port index order',()=>{const s=nested(),d=s.definitions.g;d.nodes.find(n=>n.id==='a').x=-100;d.nodes.find(n=>n.id==='a').y=300;d.nodes.find(n=>n.id==='b').x=80;d.nodes.find(n=>n.id==='b').y=10;d.inputs.reverse();const before=C.clone(s),r=E.build(s),boxes=r.layouts.find(l=>l.scope==='root/g/g').boxes,a=boxes.find(n=>n.id==='a'),b=boxes.find(n=>n.id==='b');assert.equal(a.x-b.x,-180);assert.equal(a.y-b.y,290);assert.ok(r.svg.includes('IN1 · '+d.inputs[0].label));assert.deepEqual(s,before);});
test('live expanded inputs expose only original source bit controls and can mark a debug target',()=>{const s=nested(),before=C.clone(s),r=E.build(s,{debugNode:'g'});assert.equal((r.svg.match(/data-bit-toggle=/g)||[]).length,2);assert.ok(r.svg.includes('class="debug-target"'));assert.ok(r.svg.includes('data-bit-toggle="a"'));assert.ok(r.svg.includes('data-bit-toggle="b"'));assert.deepEqual(s,before);});
