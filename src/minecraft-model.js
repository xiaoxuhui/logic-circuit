(function(root,factory){
  if(typeof importScripts==='function'&&!root.LogicCore)importScripts('./core.js','./expanded.js','./minecraft-redstone.js');
  const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.LogicCore,typeof module==='object'&&module.exports?require('./expanded.js'):root.LogicExpanded,typeof module==='object'&&module.exports?require('./minecraft-redstone.js'):root.LogicRedstone);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicMinecraft=api;
  if(typeof importScripts==='function'){
    let current,sim,running=false;
    const send=(force=false)=>{if(!sim)return;const updates=api.updates(sim.drain());if(updates.length||force)root.postMessage({updates,tick:sim.tick});};
    root.onmessage=e=>{try{const data=e.data;if(data.type==='toggle'){if(sim?.toggle(data.key))send();return;}if(data.type==='step'){sim?.step().forEach(b=>sim.changes.add(b));send(true);return;}if(data.type==='running'){running=data.value;return;}
      current=api.build(data.state,(progress,message)=>root.postMessage({progress,message}));sim=current.simulation;sim.drain();const {world,simulation,...model}=current;root.postMessage({model},model.batches.map(b=>b.data.buffer));
    }catch(error){root.postMessage({error:error.message||'转换失败'});}};
    setInterval(()=>{if(sim&&running&&sim.pending.size){sim.step().forEach(b=>sim.changes.add(b));send();}},100);
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(C,E,R){
  'use strict';
  const STRIDE=11;
  const BLOCKS=Object.freeze({support:{name:'白色混凝土',color:0xc7d1cc},slab:{name:'上半砖',color:0x9aa9a0},dust:{name:'红石粉',color:0x9f2922},torch:{name:'红石火把',color:0xcf6140},repeater:{name:'红石中继器',color:0xc5bab0},leverBase:{name:'拉杆底座',color:0x858e88},leverHandle:{name:'拉杆',color:0xb2a17b},lamp:{name:'红石灯',color:0xb27836},torchStem:{name:'火把木柄',color:0x947546},repeaterTrack:{name:'中继器方向线',color:0x802d26},repeaterGroove:{name:'中继器档位',color:0x85847b}});
  const rgb=hex=>[(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255];
  function advanceCamera(camera,keys,seconds,speed=12){const has=key=>keys.has?keys.has(key):keys.includes(key),forward=Number(has('KeyW'))-Number(has('KeyS')),right=Number(has('KeyD'))-Number(has('KeyA')),up=Number(has('Space'))-Number(has('ShiftLeft')||has('ShiftRight')),distance=Math.min(.05,Math.max(0,seconds))*speed/Math.max(1,Math.hypot(forward,right,up)),sin=Math.sin(camera.yaw),cos=Math.cos(camera.yaw);return {...camera,x:camera.x+(cos*right-sin*forward)*distance,y:camera.y+up*distance,z:camera.z+(-sin*right-cos*forward)*distance};}
  function look(camera,dx,dy){return {...camera,yaw:camera.yaw-dx*.0025,pitch:Math.max(-Math.PI/2+.02,Math.min(Math.PI/2-.02,camera.pitch-dy*.0025))};}
  // Port-bit aliases eliminate hubs, splitters and hierarchy boundaries, never a bus-valued block.
  function compile(source){
    const state=C.validate(source),parent=new Map(),records=[],primitives=[],forced=[],netCache=new Map(),context=C.createSimulationContext(state);
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
        if(node.type==='custom'){const def=state.definitions[node.def],child=scope+'/'+node.id,input=Object.fromEntries(def.inputs.map((p,i)=>[p.id,sim.portValues[C.key({node:node.id,dir:'in',port:i})]]));visit(def,child,input,node.def,depth+1);for(const [dir,ports] of [['in',def.inputs],['out',def.outputs]])ports.forEach((p,i)=>{for(let bit=0;bit<p.width;bit++)union(token(dir,i,bit),port(child,p.id,dir==='in'?'out':'in',0,bit));});continue;}
        if(scope!=='root'&&['input','output'].includes(node.type))continue;
        const signal=node.type==='output'?sim.outputs[node.id]:sim.values[node.id]?.[0]||[0],record={id:node.id,scope,type:node.type,label:node.label||({input:'输入',output:'输出',nand:'与非门',delay:'延迟线'})[node.type],bits:node.bits||1,signal:signal.slice()};records.push(record);
        const count=node.type==='nand'?1:node.bits||1;for(let bit=0;bit<count;bit++)primitives.push({record,node,bit,inputs:spec.inputs.map((_,p)=>token('in',p,bit)),output:spec.outputs.length?token('out',0,bit):null,on:!!signal[bit],inputBits:spec.inputs.map((_,p)=>sim.portValues[C.key({node:node.id,dir:'in',port:p})]?.[bit]||0)});
      }
    }
    visit(state,'root');for(const p of primitives){p.inputs=p.inputs.map(find);if(p.output)p.output=find(p.output);}for(const p of forced)p.token=find(p.token);
    return {state,records,primitives,forced};
  }
  function build(source,progress=()=>{}){
    progress(5,'正在逐位展开端口连接…');const graph=compile(source),world=new R.World(),terminals=new Map(),warnings=[],unrouted=[],reserved=new Map(),levers=[],lamps=[];
    const forced=new Map(graph.forced.map(p=>[p.token,p])),netSignal=new Map();let serial=0,currentOwner=null,maxReservedZ=0;
    function put(kind,x,y,z,extra={}){return world.put({kind,x,y,z,owner:currentOwner,...extra});}
    function support(x,y,z){const p={x,y,z},old=world.at(p);if(!old)put('support',x,y,z);else if(!R.supports(old))throw Error('支撑与元件重叠：'+R.key(p));}
    function dust(x,y,z,net,on=false){support(x,y-1,z);const old=world.at({x,y,z});if(old){if(old.kind!=='dust'||old.net!==net)throw Error('线路重叠：'+R.key(old));return old;}return put('dust',x,y,z,{net,power:on?15:0});}
    function device(kind,x,y,z,net,on,extra={}){if(kind!=='torch')support(x,y-1,z);return put(kind,x,y,z,{net,on,...extra});}
    function terminal(net,p,source=false){if(source&&forced.has(net))return;const group=terminals.get(net)||{sources:[],targets:[]};if(!terminals.has(net))terminals.set(net,group);group[source?'sources':'targets'].push(p);}
    const recordSlots=new Map(graph.records.map((record,i)=>[record,i])),maxBits=graph.records.reduce((max,record)=>Math.max(max,record.bits),1),bandHeight=Math.max(20,maxBits*3+10);
    function reserve(x,z,complex){const rect={minX:x-1,maxX:x+11,minZ:z+(complex?-1:3),maxZ:z+(complex?9:5)},col=Math.floor((x-4)/24);maxReservedZ=Math.max(maxReservedZ,rect.maxZ);for(let bucket=Math.floor(rect.minZ/20);bucket<=Math.floor(rect.maxZ/20);bucket++){const k=col+','+bucket;if(!reserved.has(k))reserved.set(k,[]);reserved.get(k).push(rect);}}
    function tile(p){if(!recordSlots.has(p.record))recordSlots.set(p.record,graph.records.length+serial++);const i=recordSlots.get(p.record),band=Math.floor(i/64),col=band%2?63-i%64:i%64,x=4+col*24,z=4+band*bandHeight+p.bit*3;reserve(x,z,p.node.type==='nand');return {x,z,reversed:!!(band%2)};}
    function make(p,isForce=false){const {x,z,reversed}=tile(p),{record,bit}=p,type=p.node.type,logicalNet=p.output,local=record.scope+'/'+record.id+'/'+bit,net=forced.has(logicalNet)&&!isForce?local+'/isolated':logicalNet;
      currentOwner=local;
      const X=dx=>x+(reversed?10-dx:dx);
      const line=(from,to,Z,N,on)=>{for(let dx=from;dx<=to;dx++)dust(X(dx),1,z+Z,N,on);};
      const repeat=(dx,Z,N,on,delay=1)=>device('repeater',X(dx),1,z+Z,N,on,{delay,facing:reversed?2:0});
      const entry=(N,Z)=>{line(-2,1,Z,N,false);const q=world.at({x:X(-2),y:1,z:z+Z});terminal(N,q);};
      if(type==='input'){
        const lever=device('lever',X(3),1,z+4,local,p.on,{id:record.id,scope:record.scope,bit});line(4,4,4,local,p.on);repeat(5,4,local,p.on);line(6,12,4,net,p.on);if(isForce){const group=terminals.get(net)||{sources:[],targets:[]};terminals.set(net,group);group.sources.push(world.at({x:X(12),y:1,z:z+4}));}else terminal(net,world.at({x:X(12),y:1,z:z+4}),true);levers.push({key:R.key(lever),id:record.id,scope:record.scope,bit,x:lever.x+.5,y:lever.y+.5,z:lever.z+.5,on:p.on});netSignal.set(net,p.on);
      }else if(type==='output'){
        line(-2,0,4,p.inputs[0],false);terminal(p.inputs[0],world.at({x:X(-2),y:1,z:z+4}));repeat(1,4,local,p.on);const lamp=device('lamp',X(2),1,z+4,local,p.on,{id:record.id,scope:record.scope,bit});lamps.push({key:R.key(lamp),id:record.id,scope:record.scope,bit,x:lamp.x+.5,y:lamp.y+.5,z:lamp.z+.5});
      }else if(type==='delay'){
        line(-2,0,4,p.inputs[0],false);terminal(p.inputs[0],world.at({x:X(-2),y:1,z:z+4}));repeat(1,4,net,p.on,Math.min(4,Math.max(1,p.node.redstoneDelay||1))).role='delay';line(2,12,4,net,p.on);terminal(net,world.at({x:X(12),y:1,z:z+4}),true);netSignal.set(net,p.on);
      }else if(type==='nand'){
        const outLocal=local+'/q';for(let i=0;i<2;i++){const Z=i?7:1,N=p.inputs[i];entry(N,Z);repeat(2,Z,N,!!p.inputBits[i]);put('support',X(3),1,z+Z);device('torch',X(4),1,z+Z,outLocal,!p.inputBits[i],{attached:{x:X(3),y:1,z:z+Z}});line(5,6,Z,outLocal,!p.inputBits[i]);}for(let Z=2;Z<7;Z++)dust(X(6),1,z+Z,outLocal,p.on);line(7,7,4,outLocal,p.on);repeat(8,4,net,p.on);line(9,12,4,net,p.on);terminal(net,world.at({x:X(12),y:1,z:z+4}),true);netSignal.set(net,p.on);
      }
      if(record.x===undefined){record.x=X(5);record.y=2;record.z=z+4;}record.last={x:X(5),y:2,z:z+4};
    }
    for(const p of graph.primitives.sort((a,b)=>a.bit-b.bit))make(p);
    for(const p of graph.forced){const record={id:'force:'+p.id,scope:p.scope,type:'input',label:'临时输入 '+p.id,bits:1,signal:[Number(p.on)]};make({record,node:{type:'input'},bit:p.bit,output:p.token,on:p.on},true);}
    // Merge multiple drivers through separate buffered branches into real dust OR junctions.
    let extraTile=0;const extraRow=1+Math.ceil(maxReservedZ/20);
    const ownerBlocks=new Map();for(const b of world.cells.values()){if(!ownerBlocks.has(b.owner))ownerBlocks.set(b.owner,[]);ownerBlocks.get(b.owner).push(b);}
    for(const [net,group] of [...terminals])if(group.sources.length>1){const sources=group.sources.slice();group.sources=[];const branches=sources.map((source,i)=>{const name=net+'/driver'+i;for(const b of ownerBlocks.get(source.owner)||[])if(b.net===net)b.net=name;terminals.set(name,{sources:[source],targets:[]});netSignal.set(name,!!netSignal.get(net));return name;});let previous=branches[0];
      for(let i=1;i<branches.length;i++){const index=extraTile++,col=index%64,row=extraRow+Math.floor(index/64),x=4+col*24,z=4+row*20,out=i===branches.length-1?net:net+'/merge'+i;reserve(x,z,true);currentOwner=out+'/junction';
        for(const [j,input] of [previous,branches[i]].entries()){const Z=z+(j?7:1);for(let dx=-2;dx<=1;dx++)dust(x+dx,1,Z,input,false);terminal(input,world.at({x:x-2,y:1,z:Z}));device('repeater',x+2,1,Z,input,false,{delay:1,facing:0});for(let dx=3;dx<=6;dx++)dust(x+dx,1,Z,out,false);}
        for(let dz=2;dz<7;dz++)dust(x+6,1,z+dz,out,false);dust(x+7,1,z+4,out,false);device('repeater',x+8,1,z+4,out,false,{delay:1,facing:0});for(let dx=9;dx<=12;dx++)dust(x+dx,1,z+4,out,false);terminal(out,world.at({x:x+12,y:1,z:z+4}),true);previous=out;
      }
    }
    currentOwner=null;
    const tileBlocked=p=>p.y<=3&&(reserved.get(Math.floor((p.x-3)/24)+','+Math.floor(p.z/20))||[]).some(rect=>p.x>=rect.minX&&p.x<=rect.maxX&&p.z>=rect.minZ&&p.z<=rect.maxZ);
    function legal(p,net){const old=world.at(p);if(old)return old.kind==='dust'&&old.net===net;if(tileBlocked(p))return false;const below=world.at({...p,y:p.y-1});if(below&&!R.supports(below))return false;
      for(const d of R.directions)for(let dy=-1;dy<=1;dy++){const q=world.at({x:p.x+d.x,y:p.y+dy,z:p.z+d.z});if(q&&['dust','repeater','torch','lever'].includes(q.kind)&&q.net!==net)return false;}
      const under=world.at({...p,y:p.y-2});if(under?.kind==='torch')return false;return true;
    }
    const interpolate=points=>{const out=[points[0]];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y),Math.abs(b.z-a.z));for(let n=1;n<=length;n++)out.push({x:a.x+(b.x-a.x)*n/length,y:a.y+(b.y-a.y)*n/length,z:a.z+(b.z-a.z)*n/length});}return out;};
    function pathOK(path,net){const planned=new Set(path.map(R.key));return path.every(p=>legal(p,net)&&!planned.has(R.key({...p,y:p.y-1})));}
    function route(a,b,net){const A={x:a.x,y:a.y,z:a.z},B={x:b.x,y:b.y,z:b.z};if(A.y===B.y){const candidates=[[A,{...A,x:B.x},B],[A,{...A,z:B.z},B]];for(const offset of [2,-2,4,-4,8,-8])candidates.push([A,{...A,x:A.x+offset},{...B,x:A.x+offset},B]);for(const points of candidates){const ps=interpolate(points);if(pathOK(ps,net))return ps;}}
      const heap=[],best=new Map(),distance=p=>Math.abs(p.x-B.x)+Math.abs(p.z-B.z)+Math.abs(p.y-B.y),push=r=>{let i=heap.length;heap.push(r);while(i){const j=(i-1)>>1;if(heap[j].f<=r.f)break;heap[i]=heap[j];i=j;}heap[i]=r;},pop=()=>{const result=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(last.f<=heap[j].f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return result;};
      const minX=Math.min(A.x,B.x)-16,maxX=Math.max(A.x,B.x)+16,minZ=Math.min(A.z,B.z)-16,maxZ=Math.max(A.z,B.z)+16;push({p:A,g:0,f:distance(A),prev:null});best.set(R.key(A),0);
      for(let count=0;heap.length&&count<14000;count++){const r=pop();if(r.g!==best.get(R.key(r.p)))continue;if(R.key(r.p)===R.key(B)){const ps=[];for(let n=r;n;n=n.prev)ps.push(n.p);ps.reverse();if(pathOK(ps,net))return ps;continue;}
        for(const d of R.directions)for(const dy of [0,1,-1]){const p={x:r.p.x+d.x,y:r.p.y+dy,z:r.p.z+d.z};if(p.y<1||p.y>8||p.x<minX||p.x>maxX||p.z<minZ||p.z>maxZ||!legal(p,net))continue;if(dy>0&&world.at({...r.p,y:r.p.y+1}))continue;const g=r.g+1+Math.abs(dy)*2,k=R.key(p);if(g>=(best.get(k)??Infinity))continue;best.set(k,g);push({p,g,f:g+distance(p),prev:r});}
      }return null;
    }
    progress(35,'正在铺设逐位红石线路与支撑…');const paths=[];let done=0;
    for(const [net,group] of terminals){if(group.sources.length){const start=group.sources[0];for(const end of [...group.sources.slice(1),...group.targets]){const ps=route(start,end,net);if(!ps){unrouted.push({from:R.key(start),to:R.key(end),net});continue;}for(const p of ps)support(p.x,p.y-1,p.z);for(const p of ps)dust(p.x,p.y,p.z,net,netSignal.get(net));paths.push({net,points:ps,buffer:group.sources.length===1});}}
      if(++done%200===0)progress(35+Math.round(done/terminals.size*40),'正在连接单比特网络 '+done+' / '+terminals.size);
    }
    // Buffer only straight non-branching sections of single-source trees.
    for(const path of paths)if(path.buffer){let since=6;for(let i=1;i<path.points.length-1;i++){const p=path.points[i],b=world.at(p);if(b?.kind==='repeater'){since=0;continue;}since++;if(since<7)continue;const a=path.points[i-1],c=path.points[i+1],dx=c.x-a.x,dz=c.z-a.z;if(a.y!==p.y||c.y!==p.y||Math.abs(dx)+Math.abs(dz)!==2||dx&&dz)continue;const neighbors=world.dustNeighbors(p);if(neighbors.length!==2)continue;b.kind='repeater';b.facing=R.directions.findIndex(d=>d.x===Math.sign(dx)&&d.z===Math.sign(dz));b.delay=1;b.on=!!netSignal.get(path.net);since=0;}}
    const errors=world.validate();if(errors.length)throw Error(errors[0]);if(unrouted.length)warnings.push(unrouted.length+' 条连接未能安全布通，已留空，未使用穿透线路');if(graph.primitives.some(p=>p.node.type==='delay'))warnings.push('原延迟线逐位转换为 1–4 刻中继器，物理计时与原“下一步”寄存器不同');
    progress(80,'正在验证红石连接并生成方块实例…');const sim=new R.Simulator(world);sim.drain();const batches=new Map(),bounds={min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};let instanceCount=0;
    function render(b,kind,x,y,z,w=1,h=1,d=1,yaw=0,tilt=0){const k=kind+':'+Math.floor(x/192)+':'+Math.floor(z/192),batch=batches.get(k)||{kind,key:k,values:[]};if(!batches.has(k))batches.set(k,batch);const index=batch.values.length/STRIDE,color=tint(b,kind);batch.values.push(x,y,z,w,h,d,yaw,...color,tilt);(b.renders||(b.renders=[])).push({key:k,index,kind});instanceCount++;for(const axis of ['x','y','z']){const v={x,y,z}[axis],extent={x:w,y:h,z:d}[axis]/2;bounds.min[axis]=Math.min(bounds.min[axis],v-extent);bounds.max[axis]=Math.max(bounds.max[axis],v+extent);}}
    for(const b of world.cells.values()){const x=b.x+.5,y=b.y,z=b.z+.5;
      if(b.kind==='support')render(b,'support',x,y+.5,z);
      else if(b.kind==='slab')render(b,'slab',x,y+.75,z,1,.5,1);
      else if(b.kind==='dust'){const links=world.dustNeighbors(b),xs=links.some(p=>p.x!==b.x),zs=links.some(p=>p.z!==b.z);for(const d of R.directions){const q=world.at(R.add(b,d));if(q&&['torch','repeater','lever','support','lamp'].includes(q.kind))links.push(q);}const X=xs||links.some(p=>p.x!==b.x),Z=zs||links.some(p=>p.z!==b.z);if(X||!Z)render(b,'dust',x,y+.035,z,1,.045,.1);if(Z)render(b,'dust',x,y+.035,z,.1,.045,1);for(const q of world.dustNeighbors(b))if(q.y===b.y+1){const dx=q.x-b.x,dz=q.z-b.z;render(b,'dust',x+dx*.5,y+.5,z+dz*.5,dx?.035:.1,1,dz?.035:.1);}}
      else if(b.kind==='lever'){render(b,'leverBase',x,y+.1,z,.65,.2,.65);render(b,'leverHandle',x,y+.45,z,.12,.65,.12,0,b.on?-.5:.5);}
      else if(b.kind==='torch'){const attached=b.attached,dx=attached?b.x-attached.x:0,dz=attached?b.z-attached.z:0;render(b,'torch',x-dx*.25,y+.4,z-dz*.25,.14,.7,.14,dz?Math.PI/2:0,dx||dz?-.35:0);}
      else if(b.kind==='repeater'){const direction=R.directions[b.facing],yaw=-b.facing*Math.PI/2;render(b,'repeater',x,y+.0625,z,.95,.125,.95);render(b,'repeaterTrack',x,y+.137,z,.65,.02,.045,yaw);for(const side of [-1,1])render(b,'repeaterTrack',x+direction.x*.32-direction.z*side*.055,y+.14,z+direction.z*.32+direction.x*side*.055,.18,.02,.035,yaw+side*Math.PI/4);for(const offset of [.3125,.0625-(b.delay-1)*.125]){render(b,'torchStem',x+direction.x*offset,y+.25,z+direction.z*offset,.085,.24,.085);render(b,'torch',x+direction.x*offset,y+.4,z+direction.z*offset,.14,.14,.14);}if(b.role==='delay')for(let tick=0;tick<4;tick++)render(b,'repeaterGroove',x+direction.x*(.0625-tick*.125),y+.138,z+direction.z*(.0625-tick*.125),.025,.018,.5,yaw);}
      else if(b.kind==='lamp')render(b,'lamp',x,y+.5,z);
    }
    if(!instanceCount){bounds.min={x:-1,y:0,z:-1};bounds.max={x:1,y:1,z:1};}for(const item of [...levers,...lamps]){item.renders=world.cells.get(item.key).renders;item.on=!!world.cells.get(item.key).on;}const focus=levers[0]||graph.records[0]||{x:0,y:1,z:0};
    return {batches:[...batches.values()].map(b=>({kind:b.kind,key:b.key,data:new Float32Array(b.values)})),instanceCount,components:graph.records,bounds,focus,library:'内置红石方块',snapshot:true,physical:true,levers,lamps,warnings,unrouted,world,simulation:sim};
  }
  function tint(b,kind){if(kind==='dust')return [.25+.75*(b.power||0)/15,.035+.15*(b.power||0)/15,.02];if(kind==='repeaterTrack')return rgb(b.on?0xd83624:0x6f241d);if(kind==='torch')return rgb(b.on?0xffa94c:0x51352b);if(kind==='lamp')return rgb(b.on?0xffcd63:0x684522);if(kind==='leverHandle')return rgb(b.on?0xd7bd83:0xa49371);return rgb(BLOCKS[kind].color);}
  function updates(blocks){return blocks.flatMap(b=>(b.renders||[]).map(r=>({...r,color:tint(b,r.kind),on:!!b.on,power:b.power||0,tilt:r.kind==='leverHandle'?(b.on?-.5:.5):undefined})));}
  return {BLOCKS,STRIDE,advanceCamera,look,compile,build,tint,updates};
});
