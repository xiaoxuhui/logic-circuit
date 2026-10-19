const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
const state=rotation=>({version:1,nodes:[{id:'a',type:'input',x:0,y:0,value:1},{id:'block',type:'nand',x:280,y:-20,rotation},{id:'o',type:'output',x:600,y:0}],wires:[],definitions:{}});
test('close facing ports connect straight at every rotation without overshooting',()=>{
  for(const gap of [1,4,8,12,20,24,36])for(const rotation of [0,90,180,270]){const s={nodes:[{id:'a',type:'input',x:0,y:0},{id:'b',type:'output',x:152+gap,y:0}],wires:[],definitions:{}};
    for(let i=0;i<rotation/90;i++)for(const n of s.nodes){const z=C.size(n,{});[n.x,n.y]=[-n.y-z.h,n.x];n.rotation=((n.rotation||0)+90)%360;}
    const a={node:'a',dir:'out',port:0},b={node:'b',dir:'in',port:0},before=C.clone(s),route=C.route(a,b,s);assert.equal(route.length,2);assert.ok(Math.abs(C.distance(route[0],route[1])-gap)<1e-7);assert.equal(C.wireHitsGate({a,b,via:route.slice(1,-1)},s),false);assert.deepEqual(s,before);
  }
});
test('near diagonal free endpoints use one bend and the Manhattan minimum length',()=>{for(const [dx,dy] of [[1,2],[4,8],[12,16],[24,12],[-8,12],[12,-8]]){const route=C.route({x:0,y:0},{x:dx,y:dy},{nodes:[],wires:[],definitions:{}});assert.equal(route.length,3);assert.equal(route.slice(1).reduce((sum,p,i)=>sum+C.distance(route[i],p),0),Math.abs(dx)+Math.abs(dy));}});
test('close offset port connectors stay in their short terminal corridor',()=>{for(const gap of [8,12,20,24,36])for(const dy of [-12,-8,8,12]){const s={nodes:[{id:'a',type:'input',x:0,y:0},{id:'b',type:'output',x:152+gap,y:dy}],wires:[],definitions:{}},a={node:'a',dir:'out',port:0},b={node:'b',dir:'in',port:0},route=C.route(a,b,s);assert.ok(route);assert.equal(route.length,4);assert.equal(route.slice(1).reduce((sum,p,i)=>sum+C.distance(route[i],p),0),gap+Math.abs(dy));assert.equal(C.wireHitsGate({a,b,via:route.slice(1,-1)},s),false);}});
test('obstacle bypass follows its one-cell boundary at every rotation',()=>{for(const rotation of [0,90,180,270]){const s=state(rotation),a={node:'a',dir:'out',port:0},b={node:'o',dir:'in',port:0},route=C.route(a,b,s),node=s.nodes[1],box={x:node.x-24,y:node.y-24,w:C.size(node,{}).w+48,h:C.size(node,{}).h+48};assert.ok(route);let boundary=false;for(let i=1;i<route.length;i++){const p=route[i-1],q=route[i];const crosses=p.x===q.x?p.x>box.x&&p.x<box.x+box.w&&Math.max(p.y,q.y)>box.y&&Math.min(p.y,q.y)<box.y+box.h:p.y>box.y&&p.y<box.y+box.h&&Math.max(p.x,q.x)>box.x&&Math.min(p.x,q.x)<box.x+box.w;assert.equal(crosses,false);if(p.x===q.x&&(p.x===box.x||p.x===box.x+box.w)||p.y===q.y&&(p.y===box.y||p.y===box.y+box.h))boundary=true;}assert.equal(boundary,true);}});
const sharesLength=(p,q,r,t)=>{const u={x:q.x-p.x,y:q.y-p.y},v={x:t.x-r.x,y:t.y-r.y},len=Math.hypot(u.x,u.y);if(!len||!Math.hypot(v.x,v.y)||Math.abs(u.x*v.y-u.y*v.x)>1e-8||Math.abs((r.x-p.x)*u.y-(r.y-p.y)*u.x)>1e-8)return false;const dot=z=>((z.x-p.x)*u.x+(z.y-p.y)*u.y)/len;return Math.min(len,Math.max(dot(r),dot(t)))-Math.max(0,Math.min(dot(r),dot(t)))>1e-8;};
function noOverlap(route,s){for(const w of s.wires){const old=C.points(w,s);for(let i=1;i<route.length;i++)for(let j=1;j<old.length;j++)assert.ok(!sharesLength(route[i-1],route[i],old[j-1],old[j]),'positive-length overlap with '+w.id);}}
test('narrow port corridors choose an available zero-overlap route before fallback',()=>{
  const s=require('./fixtures/narrow-lane.cjs')(),a={node:'s',dir:'out',port:0},b={node:'t',dir:'in',port:0},before=C.clone(s);
  const witness=[{x:244,y:40},{x:244,y:60},{x:256,y:60},{x:256,y:-100},{x:988,y:-100},{x:988,y:328},{x:1000,y:328}];
  noOverlap(witness,s);assert.equal(C.wireHitsGate({a,b,via:witness.slice(1,-1)},s),false);
  const route=C.route(a,b,s);assert.ok(route);noOverlap(route,s);assert.equal(C.wireHitsGate({a,b,via:route.slice(1,-1)},s),false);assert.deepEqual(s,before);
});
for(const gap of [12,20])for(const rotation of [0,90,180,270])test('narrow exits at spacing '+gap+' and rotation '+rotation,()=>{
  const s=require('./fixtures/narrow-lane.cjs')(gap),turn=p=>({x:-p.y,y:p.x});
  for(let i=0;i<rotation/90;i++){
    for(const n of s.nodes){const z=C.size(n,s.definitions),p=turn({x:n.x,y:n.y+z.h});n.x=p.x;n.y=p.y;n.rotation=((n.rotation||0)+90)%360;}
    for(const w of s.wires){if(!w.a.node)w.a=turn(w.a);if(!w.b.node)w.b=turn(w.b);if(w.via)w.via=w.via.map(turn);}
  }
  const a={node:'s',dir:'out',port:0},b={node:'t',dir:'in',port:0},route=C.route(a,b,s);assert.ok(route);noOverlap(route,s);
  assert.equal(C.wireHitsGate({a,b,via:route.slice(1,-1)},s),false);assert.deepEqual(route[0],{x:C.anchor(a,s).x,y:C.anchor(a,s).y});assert.deepEqual(route.at(-1),{x:C.anchor(b,s).x,y:C.anchor(b,s).y});
});
test('an occupied four-way junction chooses a safe least-overlap fallback',()=>{
  const s={nodes:[],definitions:{},wires:[{id:'h',a:{x:-100,y:0},b:{x:100,y:0}},{id:'v',a:{x:0,y:-100},b:{x:0,y:100}}]},before=C.clone(s);
  assert.ok(C.route({x:0,y:0},{x:200,y:200},s));assert.deepEqual(s,before);
});
function repeated(route,s){let last=new Set(),count=0,length=0;for(let i=1;i<route.length;i++){const p=route[i-1],q=route[i],len=C.distance(p,q);if(!len)continue;const hit=new Set();for(const w of s.wires){const ps=C.points(w,s);for(let j=1;j<ps.length;j++)if(sharesLength(p,q,ps[j-1],ps[j])){hit.add(w.id);const dot=r=>((r.x-p.x)*(q.x-p.x)+(r.y-p.y)*(q.y-p.y))/len;length+=Math.min(len,Math.max(dot(ps[j-1]),dot(ps[j])))-Math.max(0,Math.min(dot(ps[j-1]),dot(ps[j])));}}for(const id of hit)if(!last.has(id))count++;last=hit;}return {count,length};}
test('fallback prefers one longer overlap over three shorter overlaps',()=>{
  const s={nodes:[],definitions:{},wires:[...Array.from({length:3},(_,i)=>({id:'h'+i,a:{x:-100,y:0},b:{x:2,y:0}})),{id:'v',a:{x:0,y:-100},b:{x:0,y:100}}]},route=C.route({x:0,y:0},{x:200,y:200},s);assert.ok(route);assert.equal(repeated(route,s).count,1);assert.equal(route[1].x,0);assert.ok(route[1].y>0);
});
test('equal overlap counts prefer shorter overlapping length and do not count grid splits twice',()=>{
  const s={nodes:[],definitions:{},wires:[{id:'h',a:{x:-100,y:0},b:{x:2,y:0}},{id:'v',a:{x:0,y:-100},b:{x:0,y:100}}]},route=C.route({x:0,y:0},{x:200,y:200},s);assert.ok(route);assert.deepEqual(repeated(route,s),{count:1,length:2});
});
test('overlap fallback cannot escape through a gate body',()=>{
  const s={nodes:[{id:'block',type:'nand',x:-40,y:-40}],definitions:{},wires:[{id:'h',a:{x:-100,y:0},b:{x:100,y:0}},{id:'v',a:{x:0,y:-100},b:{x:0,y:100}}]};assert.equal(C.route({x:0,y:0},{x:200,y:200},s),null);
});
test('crowded port fanout uses distinct exits without overlap or mutation',()=>{
  const s={version:1,nodes:[{id:'i',type:'input',x:0,y:0,value:1},...Array.from({length:5},(_,i)=>({id:'o'+i,type:'output',x:600,y:i*120}))],definitions:{},wires:[]},a={node:'i',dir:'out',port:0};let accepted=0,refused=0;
  for(let i=0;i<5;i++){const b={node:'o'+i,dir:'in',port:0},before=C.clone(s),route=C.route(a,b,s);assert.deepEqual(s,before);if(!route){refused++;continue;}noOverlap(route,s);s.wires.push({id:'w'+i,a,b,via:route.slice(1,-1),autoRoute:true});accepted++;assert.deepEqual(C.simulate(s).outputs['o'+i],[1]);}
  assert.equal(accepted,5);assert.equal(refused,0);
  const branch={x:200,y:40},b={node:'o4',dir:'in',port:0},route=C.route(branch,b,s);assert.ok(route);noOverlap(route,s);s.wires.push({id:'branch',a:branch,b,via:route.slice(1,-1)});assert.deepEqual(C.simulate(s).outputs.o4,[1]);
});
for(const rotation of [0,90,180,270])test('sixteen fanout instances remain distinct at rotation '+rotation,()=>{
  const s={version:1,nodes:[{id:'i',type:'input',x:0,y:0,rotation,value:1},...Array.from({length:16},(_,i)=>({id:'o'+i,type:'output',x:600,y:i*96-600}))],definitions:{},wires:[]},a={node:'i',dir:'out',port:0};
  for(let i=0;i<16;i++){const b={node:'o'+i,dir:'in',port:0},route=C.route(a,b,s);assert.ok(route,'fanout '+i);noOverlap(route,s);s.wires.push({id:'w'+i,a,b,via:route.slice(1,-1),autoRoute:true});assert.equal(C.wireOverlaps(s.wires.at(-1),s),false);assert.equal(C.wireHitsGate(s.wires.at(-1),s),false);}
  assert.deepEqual(Object.values(C.simulate(s).outputs),Array.from({length:16},()=>[1]));C.validate(s);
});
test('collinear diagonal runs are avoided while a diagonal point crossing is legal',()=>{
  const s={nodes:[],definitions:{},wires:[{id:'d',a:{x:0,y:0},b:{x:100,y:100},via:[{x:50,y:50}]}]},route=C.route({x:10,y:10},{x:90,y:90},s);assert.ok(route);noOverlap(route,s);
  const crossing=C.route({x:0,y:50},{x:100,y:50},s);assert.deepEqual(crossing,[{x:0,y:50},{x:100,y:50}]);
});
for(const rotation of [0,90,180,270])test('routes around gate at '+rotation+' degrees without changing endpoints',()=>{const s=state(rotation),before=C.clone(s),a={node:'a',dir:'out',port:0},b={node:'o',dir:'in',port:0},ps=C.route(a,b,s),box={...s.nodes[1],...C.size(s.nodes[1],{})};assert.deepEqual(ps[0],{x:152,y:40});assert.deepEqual(ps.at(-1),{x:600,y:40});for(let i=1;i<ps.length;i++){const p=ps[i-1],q=ps[i];assert.ok(p.x===q.x||p.y===q.y);const cross=p.x===q.x?p.x>box.x&&p.x<box.x+box.w&&Math.max(p.y,q.y)>box.y&&Math.min(p.y,q.y)<box.y+box.h:p.y>box.y&&p.y<box.y+box.h&&Math.max(p.x,q.x)>box.x&&Math.min(p.x,q.x)<box.x+box.w;assert.equal(cross,false);}s.wires=[{id:'w',a,b,via:ps.slice(1,-1),autoRoute:true}];assert.deepEqual(C.simulate(s).outputs.o,[1]);C.validate(s);s.wires=[];assert.deepEqual(s,before);});

test('permits a point crossing but avoids sharing an existing horizontal or vertical segment',()=>{const s={nodes:[],definitions:{},wires:[{id:'old',a:{x:0,y:40},b:{x:500,y:40}}]};const crossing=C.route({x:250,y:0},{x:250,y:80},s);assert.deepEqual(crossing,[{x:250,y:0},{x:250,y:80}]);const routed=C.route({x:100,y:40},{x:400,y:40},s);assert.ok(routed.some(p=>p.y!==40));for(let i=1;i<routed.length;i++)assert.ok(!(routed[i-1].y===40&&routed[i].y===40&&Math.min(routed[i-1].x,routed[i].x)<500&&Math.max(routed[i-1].x,routed[i].x)>0));});
test('fanout from the same port shares only its junction point',()=>{const s={nodes:[{id:'a',type:'input',x:0,y:0,value:1},{id:'n',type:'nand',x:300,y:0}],definitions:{},wires:[]},a={node:'a',dir:'out',port:0},b={node:'n',dir:'in',port:0},c={node:'n',dir:'in',port:1},first=C.route(a,b,s);s.wires.push({id:'w',a,b,via:first.slice(1,-1)});const second=C.route(a,c,s);for(let i=1;i<first.length;i++)for(let j=1;j<second.length;j++){const p=first[i-1],q=first[i],r=second[j-1],t=second[j];const vertical=p.x===q.x&&r.x===t.x&&p.x===r.x&&Math.min(Math.max(p.y,q.y),Math.max(r.y,t.y))>Math.max(Math.min(p.y,q.y),Math.min(r.y,t.y));const horizontal=p.y===q.y&&r.y===t.y&&p.y===r.y&&Math.min(Math.max(p.x,q.x),Math.max(r.x,t.x))>Math.max(Math.min(p.x,q.x),Math.min(r.x,t.x));assert.ok(!vertical&&!horizontal);}s.wires.push({id:'w2',a,b:c,via:second.slice(1,-1)});assert.deepEqual(C.simulate(s).values.n,[[0]]);});
