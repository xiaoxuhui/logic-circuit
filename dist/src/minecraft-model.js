(function(root,factory){
  if(typeof importScripts==='function'&&!root.LogicCore)importScripts('./core.js','./expanded.js','./minecraft-redstone.js');
  const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.LogicCore,typeof module==='object'&&module.exports?require('./expanded.js'):root.LogicExpanded,typeof module==='object'&&module.exports?require('./minecraft-redstone.js'):root.LogicRedstone);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicMinecraft=api;
  if(typeof importScripts==='function'){
    let current,sim,running=false;
    const send=(force=false)=>{if(!sim)return;const updates=api.updates(sim.drain());if(updates.length||force)root.postMessage({updates,tick:sim.tick});};
    root.onmessage=e=>{try{const data=e.data;if(data.type==='toggle'){if(sim?.toggle(data.key))send();return;}if(data.type==='step'){sim?.step().forEach(b=>sim.changes.add(b));send(true);return;}if(data.type==='running'){running=data.value;return;}
      current=api.build(data.state,(progress,message)=>root.postMessage({progress,message}),{basis:data.basis});sim=current.simulation;sim.drain();const {world,simulation,...model}=current;root.postMessage({model},model.batches.map(b=>b.data.buffer));
    }catch(error){root.postMessage({error:error.message||'转换失败'});}};
    setInterval(()=>{if(sim&&running&&sim.pending.size){sim.step().forEach(b=>sim.changes.add(b));send();}},api.GAME_TICK_MS);
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(C,E,R){
  'use strict';
  const STRIDE=11;
  const BLOCKS=Object.freeze({support:{name:'白色混凝土',color:0xc7d1cc},slab:{name:'上半砖',color:0x9aa9a0},dust:{name:'红石粉',color:0x9f2922},torch:{name:'红石火把',color:0xcf6140},repeater:{name:'红石中继器',color:0xc5bab0},leverBase:{name:'拉杆底座',color:0x858e88},leverHandle:{name:'拉杆',color:0xb2a17b},lamp:{name:'红石灯',color:0xb27836},torchStem:{name:'火把木柄',color:0x947546},repeaterTrack:{name:'中继器方向线',color:0x802d26},repeaterGroove:{name:'中继器档位',color:0x85847b}});
  const rgb=hex=>[(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255];
  function advanceCamera(camera,keys,seconds,speed=12){const has=key=>keys.has?keys.has(key):keys.includes(key),forward=Number(has('KeyW'))-Number(has('KeyS')),right=Number(has('KeyD'))-Number(has('KeyA')),up=Number(has('Space'))-Number(has('ShiftLeft')||has('ShiftRight')),distance=Math.min(.05,Math.max(0,seconds))*speed/Math.max(1,Math.hypot(forward,right,up)),sin=Math.sin(camera.yaw),cos=Math.cos(camera.yaw);return {...camera,x:camera.x+(cos*right-sin*forward)*distance,y:camera.y+up*distance,z:camera.z+(-sin*right-cos*forward)*distance};}
  function look(camera,dx,dy){return {...camera,yaw:camera.yaw-dx*.0025,pitch:Math.max(-Math.PI/2+.02,Math.min(Math.PI/2-.02,camera.pitch-dy*.0025))};}
  function rayBoxDistance(origin,direction,minX,minY,minZ,maxX,maxY,maxZ,limit=Infinity){
    let near=0,far=limit;const lows=[minX,minY,minZ],highs=[maxX,maxY,maxZ];let i=0;
    for(const axis of ['x','y','z']){const value=origin[axis],delta=direction[axis],low=lows[i],high=highs[i++];if(Math.abs(delta)<1e-12){if(value<low||value>high)return Infinity;continue;}let a=(low-value)/delta,b=(high-value)/delta;if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(far<near)return Infinity;}return near;
  }
  function pickLever(origin,direction,levers,batches=[]){
    if(!['x','y','z'].every(k=>Number.isFinite(origin[k])&&Number.isFinite(direction[k]))||!Math.hypot(direction.x,direction.y,direction.z))return null;
    let selected=null,distance=Infinity;for(const item of levers){const x=item.x-.5,y=item.y-.5,z=item.z-.5,hit=rayBoxDistance(origin,direction,x,y,z,x+1,y+1,z+1,distance);if(hit<distance){selected=item;distance=hit;}}if(!selected)return null;
    const limit=distance+1e-8;for(const batch of batches){if(!['support','lamp','slab'].includes(batch.kind))continue;const bucket=/:(-?\d+):(-?\d+)/.exec(batch.key||'');if(bucket){const x=Number(bucket[1])*192,z=Number(bucket[2])*192;if(rayBoxDistance(origin,direction,x,-Infinity,z,x+192,Infinity,z+192,limit)===Infinity)continue;}
      const a=batch.data;for(let i=0;i<a.length;i+=STRIDE){const x=a[i],y=a[i+1],z=a[i+2],w=a[i+3]/2,h=a[i+4]/2,d=a[i+5]/2;if(rayBoxDistance(origin,direction,x-w,y-h,z-d,x+w,y+h,z+d,limit)!==Infinity)return null;}
    }return selected;
  }
  function bridgePaths(points,world,net){
    if(points.length<2||points.some(p=>p.y!==points[0].y))return [];const crosses=[];for(let i=0;i<points.length;i++){const b=world.at(points[i]);if(b&&['dust','repeater'].includes(b.kind)&&b.net!==net)crosses.push(i);}if(!crosses.length)return [];
    const paths=[];for(let height=2;height<=Math.min(7,8-points[0].y);height++){const lifts=new Uint8Array(points.length);for(const c of crosses)for(let i=Math.max(0,c-height);i<=Math.min(points.length-1,c+height);i++)lifts[i]=Math.max(lifts[i],Math.min(height,height+1-Math.abs(i-c)));if(lifts[0]||lifts.at(-1))continue;paths.push(points.map((p,i)=>({...p,y:p.y+lifts[i]})));}return paths;
  }
  function pruneWireLoops(world){
    const cells=[...world.cells.values()].filter(b=>b.kind==='dust'),ids=new Map(cells.map((b,i)=>[b,i])),around=[...R.directions,{x:0,y:1,z:0},{x:0,y:-1,z:0}];
    const raw=cells.map(b=>world.dustNeighbors(b).filter(q=>q.net===b.net).map(q=>ids.get(q))),links=raw.map((list,i)=>list.filter(j=>raw[j].includes(i)));
    const mutable=cells.map(b=>!b.owner||b.outputTail),devices=cells.map(b=>around.some(d=>['torch','repeater','lever','lamp'].includes(world.at(R.add(b,d))?.kind)));
    const asymmetric=links.map((list,i)=>list.length!==raw[i].length);for(let i=0;i<devices.length;i++)devices[i]||=asymmetric[i];
    const removed=new Set(),initialDegree=links.map(list=>list.length),leaves=cells.flatMap((b,i)=>mutable[i]&&!devices[i]&&initialDegree[i]<=1?[i]:[]);
    for(let i=0;i<leaves.length;i++){const id=leaves[i];if(removed.has(id)||!mutable[id]||devices[id]||initialDegree[id]>1)continue;removed.add(id);for(const next of links[id])if(!removed.has(next)&&--initialDegree[next]<=1)leaves.push(next);}
    for(let i=0;i<links.length;i++)links[i]=removed.has(i)?[]:links[i].filter(id=>!removed.has(id));
    const anchors=new Set(cells.flatMap((b,i)=>!mutable[i]||devices[i]||links[i].length!==2||asymmetric[i]?[i]:[])),visited=new Set(),corridors=[],parents=cells.map((_,i)=>i);
    const find=i=>{let root=i;while(parents[root]!==root)root=parents[root];while(parents[i]!==i){const next=parents[i];parents[i]=root;i=next;}return root;};
    const join=(a,b)=>{a=find(a);b=find(b);if(a===b)return false;parents[b]=a;return true;};
    const edge=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
    // Anchor a pure ring too; otherwise it has no junction from which to walk.
    const reached=new Set();for(let i=0;i<cells.length;i++)if(!reached.has(i)){const queue=[i];reached.add(i);let anchored=false;for(let k=0;k<queue.length;k++){const id=queue[k];anchored||=anchors.has(id);for(const next of links[id])if(!reached.has(next)){reached.add(next);queue.push(next);}}if(!anchored)anchors.add(i);}
    for(const a of anchors)for(const first of links[a]){
      if(visited.has(edge(a,first)))continue;let previous=a,current=first;const inside=[];visited.add(edge(a,first));
      while(!anchors.has(current)){inside.push(current);const next=links[current].find(i=>i!==previous);visited.add(edge(current,next));previous=current;current=next;}
      if(!inside.length)join(a,current);else corridors.push({a,b:current,inside});
    }
    corridors.sort((a,b)=>a.inside.length-b.inside.length||a.a-b.a||a.b-b.b);
    for(const c of corridors)if(!join(c.a,c.b))for(const id of c.inside)removed.add(id);
    // Removing a redundant corridor can leave a short spur beside its junction.
    const degree=links.map(list=>list.filter(id=>!removed.has(id)).length),queue=cells.flatMap((b,i)=>mutable[i]&&!devices[i]&&degree[i]<=1?[i]:[]);
    for(let i=0;i<queue.length;i++){const id=queue[i];if(removed.has(id)||!mutable[id]||devices[id]||degree[id]>1)continue;removed.add(id);for(const next of links[id])if(!removed.has(next)&&--degree[next]<=1)queue.push(next);}
    for(const id of removed){const b=cells[id];world.cells.delete(R.key(b));const below=R.add(b,{x:0,y:-1,z:0}),base=world.at(below),under=world.at(R.add(below,{x:0,y:-1,z:0}));
      const attached=around.some(d=>{const q=world.at(R.add(below,d));return q?.kind==='torch'&&R.key(q.attached||R.add(q,{x:0,y:-1,z:0}))===R.key(below);});
      if(base?.kind==='support'&&!attached&&!['dust','repeater','torch','lever','lamp'].includes(under?.kind))world.cells.delete(R.key(below));
    }
    return removed.size;
  }
  // Port-bit aliases eliminate hubs, splitters and hierarchy boundaries, never a bus-valued block.
  function compile(source,options={}){
    const state=C.validate(source),parent=new Map(),records=[],primitives=[],forced=[],groups=[],barrierPorts=new Set(),orDefinitions=new Map(),netCache=new Map(),context=C.createSimulationContext(state);
    // Classify the definition, not its name or this instance's current input row.
    function isOr(id){if(orDefinitions.has(id))return orDefinitions.get(id);const d=state.definitions[id];let result=false;if(d.inputs.length===2&&d.outputs.length===1&&[...d.inputs,...d.outputs].every(p=>p.width===1)){const info=C.definitionInfo(id,state.definitions);if(info.method==='truth-table'&&!info.stateBits)result=[0,1,2,3].every(row=>{const input=Object.fromEntries(d.inputs.map((p,i)=>[p.id,[row>>i&1]])),sim=C.simulate({...d,definitions:state.definitions},input,1,context);return sim.outputs[d.outputs[0].id]?.[0]===Number(row!==0);});}orDefinitions.set(id,result);return result;}
    const find=k=>{if(!parent.has(k))parent.set(k,k);let p=k;while(parent.get(p)!==p)p=parent.get(p);while(k!==p){const next=parent.get(k);parent.set(k,p);k=next;}return p;};
    const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(a,b);};
    const port=(scope,id,dir,index,bit)=>find(scope+'/'+id+':'+dir+':'+index+':'+bit);
    function visit(local,scope,overrides={},cacheKey='root',depth=0){
      const sim=C.simulate({...local,definitions:state.definitions},overrides,depth,{...context,memory:state.delayState||{},scope,scopedOverrides:state.scopedWireOverrides||{}});
      let net=netCache.get(cacheKey);if(!net){net=C.nets({...local,definitions:state.definitions});netCache.set(cacheKey,net);}
      for(const g of net.groups.values())for(let bit=0;bit<g.width;bit++){let first;for(const p of g.ports.values())if(bit<p.width){const k=port(scope,p.node,p.dir,p.port,bit);if(first===undefined)first=k;else union(first,k);}}
      const force=scope==='root'?{...(state.wireOverrides||{}),...(state.scopedWireOverrides?.root||{})}:state.scopedWireOverrides?.[scope]||{};
      const handled=new Set();for(const [id,bits] of Object.entries(force)){const g=net.groups.get(net.wireNet.get(id));if(!g||handled.has(g.id))continue;handled.add(g.id);for(let bit=0;bit<g.width;bit++){const p=[...g.ports.values()].find(p=>p.width>bit);if(p)forced.push({token:port(scope,p.node,p.dir,p.port,bit),on:!!bits[bit],id,scope,bit});}}
      for(const node of local.nodes){const spec=C.spec(node,state.definitions),token=(dir,p,b)=>port(scope,node.id,dir,p,b);
        if(node.type==='hub'||node.type==='splitter'){for(let bit=0;bit<(node.bits||1);bit++)union(token(node.type==='hub'?'out':'in',0,bit),token(node.type==='hub'?'in':'out',bit,0));continue;}
        if(node.type==='custom'){const def=state.definitions[node.def],child=scope+'/'+node.id,input=Object.fromEntries(def.inputs.map((p,i)=>[p.id,sim.portValues[C.key({node:node.id,dir:'in',port:i})]]));if(isOr(node.def))def.outputs.forEach((p,i)=>{for(let bit=0;bit<p.width;bit++)barrierPorts.add(token('out',i,bit));});if(options.hierarchy)groups.push({scope:child,parent:scope,name:def.name||node.label||node.def});visit(def,child,input,node.def,depth+1);for(const [dir,ports] of [['in',def.inputs],['out',def.outputs]])ports.forEach((p,i)=>{for(let bit=0;bit<p.width;bit++)union(token(dir,i,bit),port(child,p.id,dir==='in'?'out':'in',0,bit));});continue;}
        if(scope!=='root'&&['input','output'].includes(node.type))continue;
        const signal=node.type==='output'?sim.outputs[node.id]:sim.values[node.id]?.[0]||[0],record={id:node.id,scope,type:node.type,label:node.label||({input:'输入',output:'输出',nand:'与非门',delay:'延迟线'})[node.type],bits:node.bits||1,signal:signal.slice(),source:{x:node.x,y:node.y,rotation:node.rotation||0,label:node.label}};records.push(record);
        const count=node.type==='nand'?1:node.bits||1;for(let bit=0;bit<count;bit++)primitives.push({record,node,bit,inputs:spec.inputs.map((_,p)=>token('in',p,bit)),output:spec.outputs.length?token('out',0,bit):null,on:!!signal[bit],inputBits:spec.inputs.map((_,p)=>sim.portValues[C.key({node:node.id,dir:'in',port:p})]?.[bit]||0)});
      }
    }
    visit(state,'root');for(const p of primitives){p.inputs=p.inputs.map(find);if(p.output)p.output=find(p.output);}for(const p of forced)p.token=find(p.token);
    // Trace physical dependencies from observable outputs, including delay feedback.
    // Private sinks and the inputs used only by them do not need Minecraft blocks.
    const producers=new Map(),needed=new Set(),seenNets=new Set(),queue=primitives.filter(p=>p.node.type==='output');
    for(const p of primitives)if(p.output){if(!producers.has(p.output))producers.set(p.output,[]);producers.get(p.output).push(p);}
    for(let i=0;i<queue.length;i++){const p=queue[i];if(needed.has(p))continue;needed.add(p);for(const token of p.inputs){if(seenNets.has(token))continue;seenNets.add(token);for(const driver of producers.get(token)||[])queue.push(driver);}}
    const retained=primitives.filter(p=>needed.has(p)),retainedRecords=new Set(retained.map(p=>p.record)),sourceNands=primitives.filter(p=>p.node.type==='nand').length;
    const barriers=new Set([...barrierPorts].map(find));for(const [token,list] of producers)if(list.length>1)barriers.add(token);
    return simplify({state,records:records.filter(r=>retainedRecords.has(r)),primitives:retained,forced:forced.filter(p=>seenNets.has(p.token)),sourceNands,groups,barriers});
  }
  // Simplify only the conversion copy. Registers and combinational feedback stay physical.
  function simplify(graph){
    const all=graph.primitives,nands=all.filter(p=>p.node.type==='nand'),active=new Set(nands),drivers=new Map(),originalUses=new Map(),aliases=new Map(),forced=new Set(graph.forced.map(p=>p.token));
    for(const p of all){if(p.output){if(!drivers.has(p.output))drivers.set(p.output,[]);drivers.get(p.output).push(p);}for(const token of p.inputs)originalUses.set(token,(originalUses.get(token)||0)+1);}
    const resolve=token=>{let root=token;while(aliases.has(root))root=aliases.get(root);while(aliases.has(token)){const next=aliases.get(token);aliases.set(token,root);token=next;}return root;};
    const pending=new Map(),dependents=new Map(),ready=[],expressions=new Map(),inverses=new Map(),merged=new Map();
    for(const p of nands){const deps=new Set(p.inputs.flatMap(token=>forced.has(token)?[]:(drivers.get(token)||[]).filter(d=>d.node.type==='nand')));pending.set(p,deps.size);if(!deps.size)ready.push(p);for(const dep of deps){if(!dependents.has(dep))dependents.set(dep,[]);dependents.get(dep).push(p);}}
    for(let i=0;i<ready.length;i++){const p=ready[i],inputs=p.inputs.map(resolve),signature=JSON.stringify(inputs.slice().sort());p.inputs=inputs;
      // Identical drivers may still deduplicate; never alias across the junction.
      if(!forced.has(p.output)&&(!graph.barriers.has(p.output)||drivers.get(p.output).length>1)){
        if(drivers.get(p.output).length===1){let replacement;if(inputs[0]===inputs[1]&&inverses.has(inputs[0]))replacement=resolve(inverses.get(inputs[0]));else if(expressions.has(signature))replacement=resolve(expressions.get(signature));
          if(replacement!==undefined&&replacement!==p.output){aliases.set(p.output,replacement);active.delete(p);}else{expressions.set(signature,p.output);if(inputs[0]===inputs[1])inverses.set(p.output,inputs[0]);}
        }else{if(!merged.has(p.output))merged.set(p.output,new Set());const seen=merged.get(p.output);if(seen.has(signature))active.delete(p);else seen.add(signature);}
      }
      for(const next of dependents.get(p)||[]){pending.set(next,pending.get(next)-1);if(!pending.get(next))ready.push(next);}
    }
    const kept=all.filter(p=>p.node.type!=='nand'||active.has(p)),uses=new Map(),liveDrivers=new Map();
    for(const p of kept){p.inputs=p.inputs.map(resolve);if(p.output)p.output=resolve(p.output);for(const token of p.inputs)uses.set(token,(uses.get(token)||0)+1);if(p.node.type==='nand'){if(!liveDrivers.has(p.output))liveDrivers.set(p.output,[]);liveDrivers.get(p.output).push(p);}}
    // Reclaim only gates orphaned by a rewrite, retaining originally unconnected components.
    const removable=p=>active.has(p)&&!forced.has(p.output)&&!graph.barriers.has(p.output)&&!uses.get(p.output)&&originalUses.get(p.output)>0,unused=[...active].filter(removable);
    for(let i=0;i<unused.length;i++){const p=unused[i];if(!removable(p))continue;active.delete(p);for(const token of p.inputs){uses.set(token,(uses.get(token)||0)-1);for(const parent of liveDrivers.get(token)||[])if(removable(parent))unused.push(parent);}}
    // A NAND input torch inverts again: bypass a preceding NOT on that branch.
    const actualDrivers=new Map();for(const p of kept)if(p.output&&(p.node.type!=='nand'||active.has(p))){if(!actualDrivers.has(p.output))actualDrivers.set(p.output,[]);actualDrivers.get(p.output).push(p);}
    const acyclic=new Set(ready);let cancelledPairs=0;
    for(const p of ready)if(active.has(p)&&!forced.has(p.output)&&p.inputs[0]!==p.inputs[1])for(let i=0;i<2;i++){
      const list=actualDrivers.get(p.inputs[i]),q=list?.length===1?list[0]:null;
      if(!q||!acyclic.has(q)||!active.has(q)||q.inputs[0]!==q.inputs[1]||q.forwardInputs?.some(Boolean)||forced.has(q.output)||graph.barriers.has(q.output))continue;
      (p.forwardInputs||(p.forwardInputs=[false,false]))[i]=true;p.inputs[i]=q.inputs[0];p.inputBits[i]=q.inputBits[0];cancelledPairs++;
    }
    uses.clear();for(const p of kept)if(p.node.type!=='nand'||active.has(p))for(const token of p.inputs)uses.set(token,(uses.get(token)||0)+1);
    const orphaned=[...active].filter(removable);for(let i=0;i<orphaned.length;i++){const p=orphaned[i];if(!removable(p))continue;active.delete(p);for(const token of p.inputs){uses.set(token,(uses.get(token)||0)-1);for(const parent of liveDrivers.get(token)||[])if(removable(parent))orphaned.push(parent);}}
    graph.primitives=kept.filter(p=>p.node.type!=='nand'||active.has(p));for(const p of graph.forced)p.token=resolve(p.token);
    const remaining=new Set(graph.primitives.map(p=>p.record));for(const record of graph.records)if(record.type==='nand'&&!remaining.has(record))record.optimized=true;
    graph.layoutNands=ready.filter(p=>active.has(p)).map(p=>p.record);
    graph.optimization={sourceNands:graph.sourceNands,renderedNands:active.size,removedNands:graph.sourceNands-active.size,cancelledPairs};return graph;
  }
  function orNotGraph(graph){
    const nands=graph.primitives.filter(p=>p.node.type==='nand'),byRecord=new Map(nands.map(p=>[p.record,p])),planned=new Set(graph.layoutNands),ordered=[...graph.layoutNands.map(r=>byRecord.get(r)),...nands.filter(p=>!planned.has(p.record))],generated=[];
    const occupied=new Set(graph.primitives.flatMap(p=>[p.output,...p.inputs]));let serial=0;
    const fresh=()=>{let token;do{token='__or-not__/'+serial++;}while(occupied.has(token));occupied.add(token);return token;};
    const make=(p,type,inputs,inputBits,output,on)=>{const id=p.record.id+':'+type+':'+serial++,record={...p.record,id,type,label:type==='not'?'非门 NOT':'或门 OR',bits:1,signal:[Number(on)],optimized:false},node={...p.node,id,type};const next={...p,record,node,inputs,inputBits,output,on,forwardInputs:type==='or'?[true,true]:undefined};generated.push(next);return next;};
    for(const p of ordered){const tied=p.inputs[0]===p.inputs[1]&&!!p.forwardInputs?.[0]===!!p.forwardInputs?.[1];
      if(tied&&!p.forwardInputs?.[0]){make(p,'not',[p.inputs[0]],[p.inputBits[0]],p.output,p.on);continue;}
      const inputs=[],bits=[];for(let i=0;i<2;i++){if(p.forwardInputs?.[i]){inputs.push(p.inputs[i]);bits.push(p.inputBits[i]);}else{const net=fresh(),on=!p.inputBits[i];make(p,'not',[p.inputs[i]],[p.inputBits[i]],net,on);inputs.push(net);bits.push(Number(on));}}
      make(p,'or',inputs,bits,p.output,p.on);
    }
    graph.primitives=[...graph.primitives.filter(p=>p.node.type!=='nand'),...generated];graph.records=[...graph.records.filter(r=>r.type!=='nand'),...generated.map(p=>p.record)];graph.layoutNands=generated.map(p=>p.record);
    graph.optimization={...graph.optimization,renderedNands:0,orGates:generated.filter(p=>p.node.type==='or').length,notGates:generated.filter(p=>p.node.type==='not').length};return graph;
  }
  function build(source,progress=()=>{},options={}){
    progress(5,'正在逐位展开端口连接…');const basis=options.basis==='or-not'?'or-not':'nand',graph=basis==='or-not'?orNotGraph(compile(source,{hierarchy:true})):compile(source),world=new R.World(),terminals=new Map(),warnings=[],unrouted=[],reserved=new Map(),levers=[],lamps=[];
    const forced=new Map(graph.forced.map(p=>[p.token,p])),netSignal=new Map();let serial=0,currentOwner=null,maxReservedZ=0;
    function put(kind,x,y,z,extra={}){return world.put({kind,x,y,z,owner:currentOwner,...extra});}
    function support(x,y,z){const p={x,y,z},old=world.at(p);if(!old)put('support',x,y,z);else if(!R.supports(old))throw Error('支撑与元件重叠：'+R.key(p));}
    function dust(x,y,z,net,on=false){support(x,y-1,z);const old=world.at({x,y,z});if(old){if(old.kind!=='dust'||old.net!==net)throw Error('线路重叠：'+R.key(old));return old;}return put('dust',x,y,z,{net,power:on?15:0});}
    function device(kind,x,y,z,net,on,extra={}){if(kind!=='torch')support(x,y-1,z);return put(kind,x,y,z,{net,on,...extra});}
    function terminal(net,p,source=false){if(source&&forced.has(net))return;const group=terminals.get(net)||{sources:[],targets:[]};if(!terminals.has(net))terminals.set(net,group);group[source?'sources':'targets'].push(p);}
    const fanout=new Map();for(const p of graph.primitives)for(const net of new Set(p.inputs))fanout.set(net,(fanout.get(net)||0)+1);
    const columns=basis==='or-not'?16:64,pitch=basis==='or-not'||[...fanout.values()].some(n=>n>2)?16:12,internalRecords=[...new Set([...graph.primitives.filter(p=>p.node.type==='delay').map(p=>p.record),...graph.layoutNands,...graph.records.filter(record=>!record.optimized&&!['input','output'].includes(record.type))])],firstGate=graph.primitives.find(p=>p.record===internalRecords[0]),recordSlots=new Map(internalRecords.map((record,i)=>[record,i])),maxBits=graph.records.reduce((max,record)=>Math.max(max,record.bits),1),bandHeight=Math.max(basis==='or-not'?12:7,maxBits*3+4);
    function reserve(x,z,complex,reversed=false){let minX=complex==='delay'?0:-1,maxX=complex==='nand'?6:complex==='delay'?1:11;if(reversed)[minX,maxX]=[10-maxX,10-minX];const rect={minX:x+minX,maxX:x+maxX,minZ:z+(complex==='nand'?2:complex&&complex!=='delay'?-1:3),maxZ:z+(complex==='nand'?6:complex&&complex!=='delay'?9:5)};maxReservedZ=Math.max(maxReservedZ,rect.maxZ);for(let bx=Math.floor(rect.minX/16);bx<=Math.floor(rect.maxX/16);bx++)for(let bz=Math.floor(rect.minZ/16);bz<=Math.floor(rect.maxZ/16);bz++){const k=bx+','+bz;if(!reserved.has(k))reserved.set(k,[]);reserved.get(k).push(rect);}}
    function tile(p){if(!recordSlots.has(p.record))recordSlots.set(p.record,graph.records.length+serial++);const i=recordSlots.get(p.record),band=Math.floor(i/columns),col=band%2?columns-1-i%columns:i%columns,x=4+col*pitch,z=4+band*bandHeight+(maxBits-1-p.bit)*3;reserve(x,z,p.node.type==='delay'?'delay':'nand',!!(band%2));return {x,z,reversed:!!(band%2)};}
    const lastIndex=internalRecords.length-1,lastBand=lastIndex<0?0:Math.floor(lastIndex/columns),lastCol=lastBand%2?columns-1-lastIndex%columns:lastIndex%columns,lastX=internalRecords.length?4+lastCol*pitch:0,engineWidth=internalRecords.length?4+(Math.min(internalRecords.length,columns)-1)*pitch+(internalRecords.some(r=>r.type!=='delay')?8:2):0,boundaryPlans=new Map(),interfaceRotations=new Set(graph.records.filter(record=>['input','output'].includes(record.type)).map(record=>record.source.rotation)),interfaceFacing=interfaceRotations.size===1?[...interfaceRotations][0]/90:0,engineDepth=internalRecords.length?12+lastBand*bandHeight+(maxBits-1)*3:0;
    for(const type of ['input','output']){
      const records=graph.records.filter(record=>record.type===type&&record.scope==='root'),ordered=records.slice().sort((a,b)=>a.source.y-b.source.y||a.source.x-b.source.x||a.id.localeCompare(b.id));if(!records.length)continue;
      const arrange=scale=>{const plans=new Map(),boxes=[];for(const record of records){const dir=R.directions[record.source.rotation/90],lane={x:-dir.z,z:dir.x},anchor={x:Math.round(record.source.x*scale),z:Math.round(record.source.y*scale)},points=[];for(let bit=0;bit<record.bits;bit++){const rank=maxBits-1-bit,p={x:anchor.x+lane.x*rank*3,z:anchor.z+lane.z*rank*3},q=type==='input'?{x:p.x+dir.x,z:p.z+dir.z}:{x:p.x-dir.x*2,z:p.z-dir.z*2};plans.set(record.id+':'+bit,{...p,dir,lane,label:record.source.label||(type==='input'?'输入 ':'输出 ')+(ordered.indexOf(record)+1)});points.push(p,q);}boxes.push({record,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))});}
        return {plans,boxes,overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.minX<=b.maxX+1&&a.maxX>=b.minX-1&&a.minZ<=b.maxZ+1&&a.maxZ>=b.minZ-1))};};
      const compact=type==='input'&&records.length>1,span=Math.max(1,Math.max(...records.map(r=>r.source.x))-Math.min(...records.map(r=>r.source.x)),Math.max(...records.map(r=>r.source.y))-Math.min(...records.map(r=>r.source.y)));
      let scale=compact?Math.min(1/8,2/span):1/8,lower=0,layout=arrange(scale);
      for(let attempt=0;layout.overlap;attempt++){if(attempt===48)throw Error('原图中的'+(type==='input'?'输入':'输出')+'位置重叠，请先分开后转换');lower=scale;scale*=2;layout=arrange(scale);}
      if(compact){for(let attempt=0;attempt<18;attempt++){const trial=(lower+scale)/2,next=arrange(trial);if(next.overlap)lower=trial;else{scale=trial;layout=next;}}}
      const {plans,boxes}=layout,minX=Math.min(...boxes.map(b=>b.minX)),maxX=Math.max(...boxes.map(b=>b.maxX)),minZ=Math.min(...records.map(record=>Math.round(record.source.y*scale))),baseX=Math.min(...records.map(record=>Math.round(record.source.x*scale))),offsetX=interfaceFacing===1||interfaceFacing===3?4-baseX:interfaceFacing===2?(type==='input'?Math.max(4,engineWidth+(pitch>=16?6:2))-minX:1-maxX):type==='input'?1-maxX-(internalRecords.length?(pitch>=16?2:1):0):lastBand%2?lastX-2-maxX:Math.max(4,engineWidth+(pitch>=16?6:2))-minX,entryZ=type==='input'&&interfaceFacing===0&&internalRecords[0]&&internalRecords[0].type!=='delay'?(firstGate.node.type==='not'||firstGate.inputs[0]===firstGate.inputs[1]&&!!firstGate.forwardInputs?.[0]===!!firstGate.forwardInputs?.[1]?8:7):8,offsetZ=interfaceFacing===1?(type==='input'?1-Math.max(...boxes.map(b=>b.maxZ)):Math.max(4,engineDepth+2)-Math.min(...boxes.map(b=>b.minZ))):interfaceFacing===3?(type==='input'?Math.max(4,engineDepth+2)-Math.min(...boxes.map(b=>b.minZ)):1-Math.max(...boxes.map(b=>b.maxZ))):entryZ-minZ+(type==='output'?lastBand*bandHeight:0);
      for(const record of records)for(let bit=0;bit<record.bits;bit++){const p=plans.get(record.id+':'+bit);boundaryPlans.set(record.id+':'+bit,{...p,x:p.x+offsetX,z:p.z+offsetZ,scale});}
    }
    function makeBoundary(p,isForce=false){const {record,bit}=p,type=p.node.type,local=record.scope+'/'+record.id+'/'+bit,net=type==='input'?(forced.has(p.output)&&!isForce?local+'/isolated':p.output):p.inputs[0],layout=boundaryPlans.get(record.id+':'+bit)||{x:-4,z:maxReservedZ+4+(serial++)*3,dir:R.directions[0],label:record.label,scale:1/8},x=layout.x,z=layout.z,dir=layout.dir;
      currentOwner=local;const body=device(type==='input'?'lever':'lamp',x,1,z,net,p.on,{id:record.id,scope:record.scope,bit,facing:record.source?.rotation/90||0}),port=type==='input'?dust(x+dir.x,1,z+dir.z,net,p.on):dust(x-dir.x*2,1,z-dir.z*2,net,p.on);if(type==='input'){port.capacity=15;port.exitDirection=dir;}else{const near=dust(x-dir.x,1,z-dir.z,net,p.on);near.routingLocked=true;near.approach=dir;port.tail=1;if(pitch>=16)port.entryDirection=dir;}
      if(isForce){const group=terminals.get(net)||{sources:[],targets:[]};terminals.set(net,group);group.sources.push(port);}else terminal(net,port,type==='input');
      const item={key:R.key(body),id:record.id,scope:record.scope,bit,label:layout.label,rotation:record.source?.rotation||0,source:record.source,scale:layout.scale,x:x+.5,y:1.5,z:z+.5,on:p.on};(type==='input'?levers:lamps).push(item);maxReservedZ=Math.max(maxReservedZ,z+2);if(type==='input')netSignal.set(net,p.on);if(record.x===undefined){record.x=x+.5;record.y=1.5;record.z=z+.5;}
    }
    function make(p,isForce=false){if(['input','output'].includes(p.node.type))return makeBoundary(p,isForce);const {x,z,reversed}=tile(p),{record,bit}=p,type=p.node.type,logicalNet=p.output,local=record.scope+'/'+record.id+'/'+bit,net=forced.has(logicalNet)&&!isForce?local+'/isolated':logicalNet;
      currentOwner=local;
      const X=dx=>x+(reversed?10-dx:dx);
      const line=(from,to,Z,N,on)=>{for(let dx=from;dx<=to;dx++)dust(X(dx),1,z+Z,N,on);};
      const repeat=(dx,Z,N,on,delay=1)=>device('repeater',X(dx),1,z+Z,N,on,{delay,facing:reversed?2:0});
      const entry=(N,Z)=>{line(-2,1,Z,N,false);const q=world.at({x:X(-2),y:1,z:z+Z});q.tail=4;q.entryDirection={x:reversed?-1:1,z:0};terminal(N,q);};
      if(type==='delay'){
        line(-2,0,4,p.inputs[0],false);world.at({x:X(-2),y:1,z:z+4}).tail=2;world.at({x:X(-2),y:1,z:z+4}).entryDirection={x:reversed?-1:1,z:0};terminal(p.inputs[0],world.at({x:X(-2),y:1,z:z+4}));repeat(1,4,net,p.on,Math.min(4,Math.max(1,p.node.redstoneDelay||1))).role='delay';line(2,2,4,net,p.on);const out=world.at({x:X(2),y:1,z:z+4});out.exitDirection={x:reversed?-1:1,z:0};out.capacity=15;terminal(net,out,true);netSignal.set(net,p.on);
      }else if(['nand','not','or'].includes(type)){
        const outLocal=net,tied=type==='not'||p.inputs[0]===p.inputs[1]&&!!p.forwardInputs?.[0]===!!p.forwardInputs?.[1];for(let i=0;i<(tied?1:2);i++){const Z=tied?4:i?5:3,N=p.inputs[i];entry(N,Z);dust(X(2),1,z+Z,N,!!p.inputBits[i]);if(p.forwardInputs?.[i]){repeat(3,Z,N,!!p.inputBits[i]).role='isolation';line(4,6,Z,outLocal,!!p.inputBits[i]);}else{put('support',X(3),1,z+Z);device('torch',X(4),1,z+Z,outLocal,!p.inputBits[i],{attached:{x:X(3),y:1,z:z+Z}});line(5,6,Z,outLocal,!p.inputBits[i]);}}dust(X(6),1,z+4,outLocal,p.on);line(7,8,4,net,p.on);for(const dx of [7,8])world.at({x:X(dx),y:1,z:z+4}).outputTail=true;const out=world.at({x:X(8),y:1,z:z+4});out.exitDirection={x:reversed?-1:1,z:0};out.capacity=tied?(p.forwardInputs?.[0]?11:12):p.forwardInputs?.some(Boolean)?10:11;terminal(net,out,true);netSignal.set(net,p.on);
      }
      if(record.x===undefined){record.x=X(5);record.y=2;record.z=z+4;}record.last={x:X(5),y:2,z:z+4};
    }
    for(const p of graph.primitives.filter(p=>!['input','output'].includes(p.node.type)).sort((a,b)=>a.bit-b.bit))make(p);for(const p of graph.primitives.filter(p=>['input','output'].includes(p.node.type)))make(p);
    for(const p of graph.forced){const record={id:'force:'+p.id,scope:p.scope,type:'input',label:'临时输入 '+p.id,bits:1,signal:[Number(p.on)]};make({record,node:{type:'input'},bit:p.bit,output:p.token,on:p.on},true);}
    // Merge multiple drivers through separate buffered branches into real dust OR junctions.
    let extraTile=0;const extraRow=1+Math.ceil(maxReservedZ/20);
    const ownerBlocks=new Map();for(const b of world.cells.values()){if(!ownerBlocks.has(b.owner))ownerBlocks.set(b.owner,[]);ownerBlocks.get(b.owner).push(b);}
    for(const [net,group] of [...terminals])if(group.sources.length>1){const sources=group.sources.slice();group.sources=[];const branches=sources.map((source,i)=>{const name=net+'/driver'+i;for(const b of ownerBlocks.get(source.owner)||[])if(b.net===net)b.net=name;terminals.set(name,{sources:[source],targets:[]});netSignal.set(name,!!netSignal.get(net));return name;});let previous=branches[0];
      for(let i=1;i<branches.length;i++){const index=extraTile++,col=index%64,row=extraRow+Math.floor(index/64),x=4+col*24,z=4+row*20,out=i===branches.length-1?net:net+'/merge'+i;reserve(x,z,true);currentOwner=out+'/junction';
        for(const [j,input] of [previous,branches[i]].entries()){const Z=z+(j?7:1);for(let dx=-2;dx<=1;dx++)dust(x+dx,1,Z,input,false);world.at({x:x-2,y:1,z:Z}).tail=3;terminal(input,world.at({x:x-2,y:1,z:Z}));device('repeater',x+2,1,Z,input,false,{delay:1,facing:0});for(let dx=3;dx<=6;dx++)dust(x+dx,1,Z,out,false);}
        for(let dz=2;dz<7;dz++)dust(x+6,1,z+dz,out,false);dust(x+7,1,z+4,out,false);device('repeater',x+8,1,z+4,out,false,{delay:1,facing:0});for(let dx=9;dx<=12;dx++)dust(x+dx,1,z+4,out,false);terminal(out,world.at({x:x+12,y:1,z:z+4}),true);previous=out;
      }
    }
    currentOwner=null;
    const tileBlocked=p=>p.y<=3&&(reserved.get(Math.floor(p.x/16)+','+Math.floor(p.z/16))||[]).some(rect=>p.x>=rect.minX&&p.x<=rect.maxX&&p.z>=rect.minZ&&p.z<=rect.maxZ);
    // Reserve an arrival cell so earlier wires cannot surround later inputs.
    const arrivalOffsets=[-1,0,1].flatMap(x=>[-1,0,1].map(z=>({x,z}))),arrivals=new Map();for(const [net,group] of terminals)for(const t of group.targets){const d=t.entryDirection;if(!d)continue;const center={x:t.x-d.x,y:t.y,z:t.z-d.z};for(const offset of arrivalOffsets){const key=(center.x+offset.x)+','+(center.z+offset.z),list=arrivals.get(key)||[];list.push({net,y:t.y,clearance:basis==='or-not'?Infinity:2});arrivals.set(key,list);}}
    if(pitch>=16)for(const [net,group] of terminals)for(const t of group.sources){const d=t.exitDirection;if(!d)continue;for(const offset of arrivalOffsets){const key=(t.x+d.x+offset.x)+','+(t.z+d.z+offset.z),list=arrivals.get(key)||[];list.push({net,y:t.y,clearance:1});arrivals.set(key,list);}}
    const portHeads=new Set([...terminals.values()].flatMap(g=>[...g.sources,...g.targets].map(p=>R.key({...p,y:p.y+1}))));
    function legal(p,net){const old=world.at(p);if(old)return old.kind==='dust'&&old.net===net&&!old.routingLocked;if((arrivals.get(p.x+','+p.z)||[]).some(a=>a.net!==net&&Math.abs(a.y-p.y)<=(a.clearance??2)))return false;if(tileBlocked(p))return false;const underKey=R.key({...p,y:p.y-1});if(portHeads.has(underKey))return false;const below=world.at({...p,y:p.y-1});if(below?.kind==='lamp'||below&&!R.supports(below))return false;
      for(const d of R.directions)for(let dy=-1;dy<=1;dy++){const q=world.at({x:p.x+d.x,y:p.y+dy,z:p.z+d.z});if(q?.routingLocked&&d.x*q.approach.z-d.z*q.approach.x)return false;if(q&&['dust','repeater','torch','lever','lamp'].includes(q.kind)&&q.net!==net)return false;}
      const under=world.at({...p,y:p.y-2});if(under?.kind==='torch'||under?.kind==='dust'&&world.dustNeighbors(under).some(q=>q.y>under.y))return false;return true;
    }
    const interpolate=points=>{const out=[points[0]];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y),Math.abs(b.z-a.z));for(let n=1;n<=length;n++)out.push({x:a.x+(b.x-a.x)*n/length,y:a.y+(b.y-a.y)*n/length,z:a.z+(b.z-a.z)*n/length});}return out;};
    function pathOK(path,net){const planned=new Set(path.map(R.key)),supports=new Set(path.map(p=>R.key({...p,y:p.y-1}))),headBlocked=p=>world.at(p)||planned.has(R.key(p))||supports.has(R.key(p));return path.every((p,i)=>{const prev=path[i-1];if(prev&&(Math.abs(p.y-prev.y)>1||p.y>prev.y&&headBlocked({...prev,y:prev.y+1})||p.y<prev.y&&headBlocked({...p,y:p.y+1})))return false;return legal(p,net)&&!planned.has(R.key({...p,y:p.y-1}));});}
    function routeSingle(a,b,net){const A={x:a.x,y:a.y,z:a.z},B={x:b.x,y:b.y,z:b.z};if(A.y===B.y){const direct=[[A,{...A,x:B.x},B],[A,{...A,z:B.z},B]].map(interpolate);for(const ps of direct)if(pathOK(ps,net))return ps;for(const ps of direct)for(const bridge of bridgePaths(ps,world,net))if(pathOK(bridge,net))return bridge;for(const offset of [2,-2,4,-4,8,-8]){const ps=interpolate([A,{...A,x:A.x+offset},{...B,x:A.x+offset},B]);if(pathOK(ps,net))return ps;}}
      const heap=[],best=new Map(),distance=p=>Math.abs(p.x-B.x)+Math.abs(p.z-B.z)+Math.abs(p.y-B.y),push=r=>{let i=heap.length;heap.push(r);while(i){const j=(i-1)>>1;if(heap[j].f<=r.f)break;heap[i]=heap[j];i=j;}heap[i]=r;},pop=()=>{const result=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(last.f<=heap[j].f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return result;};
      const minX=Math.min(A.x,B.x)-16,maxX=Math.max(A.x,B.x)+16,minZ=Math.min(A.z,B.z)-16,maxZ=Math.max(A.z,B.z)+16;push({p:A,g:0,f:distance(A),prev:null});best.set(R.key(A),0);
      for(let count=0;heap.length&&count<60000;count++){const r=pop();if(r.g!==best.get(R.key(r.p)))continue;if(R.key(r.p)===R.key(B)){const ps=[];for(let n=r;n;n=n.prev)ps.push(n.p);ps.reverse();if(pathOK(ps,net))return ps;continue;}
        for(const d of R.directions)for(const dy of [0,1,-1]){const p={x:r.p.x+d.x,y:r.p.y+dy,z:r.p.z+d.z};if(p.y<1||p.y>8||p.x<minX||p.x>maxX||p.z<minZ||p.z>maxZ||!legal(p,net))continue;if(dy>0&&world.at({...r.p,y:r.p.y+1})||dy<0&&world.at({...p,y:p.y+1}))continue;let overlaps=false;for(let ancestor=r;ancestor;ancestor=ancestor.prev)if(ancestor.p.x===p.x&&ancestor.p.z===p.z){overlaps=true;break;}if(overlaps)continue;const g=r.g+1+Math.abs(dy)*2,k=R.key(p);if(g>=(best.get(k)??Infinity))continue;best.set(k,g);push({p,g,f:g+distance(p),prev:r});}
      }return null;
    }
    let rebaseRoutes=false;
    function route(a,b,net){const direct=routeSingle(a,b,net);if(direct)return direct;const reverse=routeSingle(b,a,net);if(reverse)return reverse.reverse();
      const root=world.at(a);if(root?.kind!=='dust')return null;const previous=new Map([[root,null]]),queue=[root];
      for(let i=0;i<queue.length;i++)for(const next of world.dustNeighbors(queue[i]))if(next.net===net&&!previous.has(next)){previous.set(next,queue[i]);queue.push(next);}
      const target=world.at(b);if(previous.has(target)){const ps=[];for(let p=target;p;p=previous.get(p))ps.push(p);rebaseRoutes=true;return ps.reverse();}
      queue.sort((p,q)=>(Math.abs(p.x-b.x)+Math.abs(p.y-b.y)+Math.abs(p.z-b.z))-(Math.abs(q.x-b.x)+Math.abs(q.y-b.y)+Math.abs(q.z-b.z)));
      for(const start of queue.slice(0,16)){if(start===root)continue;const ps=routeSingle(start,b,net);if(ps){rebaseRoutes=true;return ps;}}return null;
    }
    progress(35,'正在铺设逐位红石线路与支撑…');const paths=[];let done=0;
    for(const [net,group] of [...terminals].sort((a,b)=>(b[1].sources[0]?.x||0)-(a[1].sources[0]?.x||0)||(a[1].sources[0]?.z||0)-(b[1].sources[0]?.z||0))){if(group.sources.length){const start=group.sources[0];for(const end of [...group.sources.slice(1),...group.targets].sort((a,b)=>(Math.abs(b.x-start.x)+Math.abs(b.z-start.z))-(Math.abs(a.x-start.x)+Math.abs(a.z-start.z)))){const ps=route(start,end,net);if(!ps){unrouted.push({from:R.key(start),to:R.key(end),net});continue;}for(const p of ps)support(p.x,p.y-1,p.z);for(const p of ps)dust(p.x,p.y,p.z,net,netSignal.get(net));paths.push({net,points:ps,buffer:group.sources.length===1,capacity:start.capacity||12,tail:end.tail||0});}}
      if(++done%200===0)progress(35+Math.round(done/terminals.size*40),'正在连接单比特网络 '+done+' / '+terminals.size);
    }
    function sourceCapacity(old,start){
      const seeds=new Set();for(const b of ownerBlocks.get(old.owner)||[]){let points=[];if(b.kind==='repeater')points=[R.add(b,R.directions[b.facing||0])];else if(b.kind==='lever'||b.kind==='torch')points=[...R.directions,{x:0,y:1,z:0},{x:0,y:-1,z:0}].map(d=>R.add(b,d)).filter(p=>b.kind!=='torch'||R.key(p)!==R.key(b.attached||R.add(b,{x:0,y:-1,z:0})));for(const p of points){const q=world.at(p);if(q?.kind==='dust'&&q.net===old.net&&q.owner===old.owner)seeds.add(q);}}
      let capacity=15;for(const seed of seeds){const distance=new Map([[seed,0]]),queue=[seed];for(let i=0;i<queue.length;i++)for(const q of world.dustNeighbors(queue[i]))if(q.net===old.net&&q.owner===old.owner&&!distance.has(q)){distance.set(q,distance.get(queue[i])+1);queue.push(q);}if(distance.has(start))capacity=Math.min(capacity,15-distance.get(start));}
      return seeds.size?Math.max(1,capacity):Math.max(1,(old.capacity||12)-Math.abs(start.x-old.x)-Math.abs(start.y-old.y)-Math.abs(start.z-old.z));
    }
    if(pruneWireLoops(world)||rebaseRoutes){
      paths.length=0;const skipped=new Set(unrouted.map(p=>p.net+'|'+p.to));
      for(const [net,group] of terminals)if(group.sources.length){const old=group.sources[0];let start=world.at(old);
        if(start?.kind!=='dust'){const candidates=(ownerBlocks.get(old.owner)||[]).filter(b=>b.kind==='dust'&&b.net===net&&world.at(b)===b);candidates.sort((a,b)=>(Math.abs(a.x-old.x)+Math.abs(a.y-old.y)+Math.abs(a.z-old.z))-(Math.abs(b.x-old.x)+Math.abs(b.y-old.y)+Math.abs(b.z-old.z)));start=candidates[0];}
        if(!start)continue;const previous=new Map([[start,null]]),queue=[start];for(let i=0;i<queue.length;i++)for(const next of world.dustNeighbors(queue[i]))if(next.net===net&&!previous.has(next)){previous.set(next,queue[i]);queue.push(next);}
        for(const end of [...group.sources.slice(1),...group.targets]){if(skipped.has(net+'|'+R.key(end)))continue;const target=world.at(end);if(!previous.has(target))throw Error('清理重复线路后端口未连通：'+R.key(end));const points=[];for(let p=target;p;p=previous.get(p))points.push(p);points.reverse();paths.push({net,points,buffer:group.sources.length===1,capacity:sourceCapacity(old,start),tail:end.tail||0});}
      }
    }
    // Walk the real available strength; a clear short route gets no repeater.
    for(const path of paths)if(path.buffer){let cursor=0,strength=path.capacity;const ps=path.points,last=ps.length-1;while(cursor<last){let next=last+1;for(let i=cursor+1;i<=last;i++)if(world.at(ps[i])?.kind==='repeater'){next=i;break;}const reach=next<=last?next-cursor:last-cursor+path.tail;
        if(next<=last&&reach<=strength){cursor=next;strength=16;continue;}if(next>last&&reach<strength)break;
        let chosen=-1;for(let i=Math.min(last-1,cursor+strength);i>cursor;i--){const p=ps[i],a=ps[i-1],c=ps[i+1],b=world.at(p),dx=c.x-a.x,dz=c.z-a.z;if(b?.kind==='dust'&&p.y===a.y&&p.y===c.y&&Math.abs(dx)+Math.abs(dz)===2&&!(dx&&dz)&&world.dustNeighbors(p).length===2){chosen=i;break;}}
        if(chosen<0){warnings.push('一条长线缺少可用的中继直段');break;}const b=world.at(ps[chosen]),a=ps[chosen-1],c=ps[chosen+1];b.kind='repeater';b.role='buffer';b.facing=R.directions.findIndex(d=>d.x===Math.sign(c.x-a.x)&&d.z===Math.sign(c.z-a.z));b.delay=1;b.on=!!netSignal.get(path.net);cursor=chosen;strength=16;
      }}
    const errors=world.validate();if(errors.length)throw Error(errors[0]);if(unrouted.length)warnings.push(unrouted.length+' 条连接未能安全布通，已留空，未使用穿透线路');if(graph.primitives.some(p=>p.node.type==='delay'))warnings.push('原延迟线逐位转换为 1–4 红石刻（2–8 游戏刻）中继器，物理计时与原“下一步”寄存器不同');
    progress(80,'正在验证红石连接并生成方块实例…');const sim=new R.Simulator(world);sim.drain();const batches=new Map(),bounds={min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};let instanceCount=0,maxWireHeight=1;
    function render(b,kind,x,y,z,w=1,h=1,d=1,yaw=0,tilt=0){const k=kind+':'+Math.floor(x/192)+':'+Math.floor(z/192),batch=batches.get(k)||{kind,key:k,values:[]};if(!batches.has(k))batches.set(k,batch);const index=batch.values.length/STRIDE,color=tint(b,kind);batch.values.push(x,y,z,w,h,d,yaw,...color,tilt);(b.renders||(b.renders=[])).push({key:k,index,kind});instanceCount++;for(const axis of ['x','y','z']){const v={x,y,z}[axis],extent={x:w,y:h,z:d}[axis]/2;bounds.min[axis]=Math.min(bounds.min[axis],v-extent);bounds.max[axis]=Math.max(bounds.max[axis],v+extent);}}
    for(const b of world.cells.values()){if(['dust','repeater'].includes(b.kind))maxWireHeight=Math.max(maxWireHeight,b.y);const x=b.x+.5,y=b.y,z=b.z+.5;
      if(b.kind==='support')render(b,'support',x,y+.5,z);
      else if(b.kind==='slab')render(b,'slab',x,y+.75,z,1,.5,1);
      else if(b.kind==='dust'){const directions=world.dustDirections(b);if(directions.has(0)||directions.has(2)){const from=directions.has(2)?-.5:-.05,to=directions.has(0)?.5:.05;render(b,'dust',x+(from+to)/2,y+.035,z,to-from,.045,.1);}if(directions.has(1)||directions.has(3)){const from=directions.has(3)?-.5:-.05,to=directions.has(1)?.5:.05;render(b,'dust',x,y+.035,z+(from+to)/2,.1,.045,to-from);}for(const q of world.dustNeighbors(b))if(q.y===b.y+1){const dx=q.x-b.x,dz=q.z-b.z;render(b,'dust',x+dx*.5,y+.5,z+dz*.5,dx?.035:.1,1,dz?.035:.1);}}
      else if(b.kind==='lever'){render(b,'leverBase',x,y+.1,z,.65,.2,.65,-(b.facing||0)*Math.PI/2);render(b,'leverHandle',x,y+.45,z,.12,.65,.12,-(b.facing||0)*Math.PI/2,b.on?-.5:.5);}
      else if(b.kind==='torch'){const attached=b.attached,dx=attached?b.x-attached.x:0,dz=attached?b.z-attached.z:0;render(b,'torch',x-dx*.25,y+.4,z-dz*.25,.14,.7,.14,dz?Math.PI/2:0,dx||dz?-.35:0);}
      else if(b.kind==='repeater'){const direction=R.directions[b.facing],yaw=-b.facing*Math.PI/2;render(b,'repeater',x,y+.0625,z,.95,.125,.95);render(b,'repeaterTrack',x,y+.137,z,.65,.02,.045,yaw);for(const side of [-1,1])render(b,'repeaterTrack',x+direction.x*.32-direction.z*side*.055,y+.14,z+direction.z*.32+direction.x*side*.055,.18,.02,.035,yaw+side*Math.PI/4);for(const offset of [.3125,.0625-(b.delay-1)*.125]){render(b,'torchStem',x+direction.x*offset,y+.25,z+direction.z*offset,.085,.24,.085);render(b,'torch',x+direction.x*offset,y+.4,z+direction.z*offset,.14,.14,.14);}if(b.role==='delay')for(let tick=0;tick<4;tick++)render(b,'repeaterGroove',x+direction.x*(.0625-tick*.125),y+.138,z+direction.z*(.0625-tick*.125),.025,.018,.5,yaw);}
      else if(b.kind==='lamp')render(b,'lamp',x,y+.5,z);
    }
    if(!instanceCount){bounds.min={x:-1,y:0,z:-1};bounds.max={x:1,y:1,z:1};}for(const item of [...levers,...lamps]){item.renders=world.cells.get(item.key).renders;item.on=!!world.cells.get(item.key).on;}const focus=levers.slice().sort((a,b)=>(a.source?.y??Infinity)-(b.source?.y??Infinity)||(a.source?.x??Infinity)-(b.source?.x??Infinity)||b.bit-a.bit)[0]||graph.records[0]||{x:0,y:1,z:0};
    const groupBounds=new Map(),merge=(scope,box)=>{const old=groupBounds.get(scope);if(!old)groupBounds.set(scope,{min:{...box.min},max:{...box.max}});else for(const axis of ['x','y','z']){old.min[axis]=Math.min(old.min[axis],box.min[axis]);old.max[axis]=Math.max(old.max[axis],box.max[axis]);}};
    if(basis==='or-not')for(const r of graph.records)if(Number.isFinite(r.x)&&r.scope!=='root')merge(r.scope,{min:{x:Math.min(r.x,r.last?.x??r.x)-7,y:0,z:Math.min(r.z,r.last?.z??r.z)-3},max:{x:Math.max(r.x,r.last?.x??r.x)+5,y:r.y+3,z:Math.max(r.z,r.last?.z??r.z)+3}});
    for(let i=graph.groups.length-1;i>=0;i--){const g=graph.groups[i],box=groupBounds.get(g.scope);if(box&&g.parent!=='root')merge(g.parent,box);}
    const nestedGates=basis==='or-not'?graph.groups.filter(g=>groupBounds.has(g.scope)&&! /^(?:测试\s*)?(?:NAND|NOT|OR|与非门|非门|或门)$/i.test(g.name)).map(g=>({...g,bounds:groupBounds.get(g.scope),label:g.name})):[];
    return {batches:[...batches.values()].map(b=>({kind:b.kind,key:b.key,data:new Float32Array(b.values)})),instanceCount,components:graph.records,basis,nestedGates,gateLabels:basis==='or-not'?graph.records.filter(r=>['not','or'].includes(r.type)).map(r=>({x:r.x,y:r.y,z:r.z,label:r.label})):[],bounds,focus,library:'内置红石方块',snapshot:true,physical:true,maxWireHeight,optimization:graph.optimization,levers,lamps,warnings,unrouted,world,simulation:sim};
  }
  function tint(b,kind){if(kind==='dust')return [.25+.75*(b.power||0)/15,.035+.15*(b.power||0)/15,.02];if(kind==='repeaterTrack')return rgb(b.on?0xd83624:0x6f241d);if(kind==='torch')return rgb(b.on?0xffa94c:0x51352b);if(kind==='lamp')return rgb(b.on?0xffcd63:0x684522);if(kind==='leverHandle')return rgb(b.on?0xd7bd83:0xa49371);return rgb(BLOCKS[kind].color);}
  function updates(blocks){return blocks.flatMap(b=>(b.renders||[]).map(r=>({...r,color:tint(b,r.kind),on:!!b.on,power:b.power||0,tilt:r.kind==='leverHandle'?(b.on?-.5:.5):undefined,yaw:r.kind==='leverHandle'?-(b.facing||0)*Math.PI/2:undefined})));}
  return {BLOCKS,STRIDE,GAME_TICK_MS:R.GAME_TICK_MS,pickLever,bridgePaths,pruneWireLoops,advanceCamera,look,compile,build,tint,updates};
});
