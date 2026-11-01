(function(root,factory){
  if(typeof importScripts==='function'&&!root.LogicCore)importScripts('./core.js');
  const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.LogicCore);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicDomino=api;
  if(typeof importScripts==='function'){
    let sim,timer=null;const stop=()=>{clearInterval(timer);timer=null;};
    const send=(reset=false)=>{const changes=Int32Array.from(sim.changes.flat());sim.changes=[];root.postMessage({status:sim.status(),changes,reset,running:!!timer},[changes.buffer]);};
    root.onmessage=e=>{try{const d=e.data;if(d.type==='build'){stop();const board=d.gate?api.buildGate(d.gate):api.build(d.state);sim=new api.Simulator(board);root.postMessage({board:{bones:board.bones.map(({x,y,angle,kind})=>({x,y,angle,kind})),modules:board.modules,bounds:board.bounds,gateCount:board.gateCount,gateTitle:board.gateTitle||'与非门',delayCount:board.delays.length,sourceName:d.name||'当前电路'}});send(true);}
      else if(sim){if(d.type==='step'){stop();sim.step();send();}else if(d.type==='run'){stop();if(d.value&&!sim.complete)timer=setInterval(()=>{sim.step();if(sim.complete)stop();send();},Math.max(8,Math.min(1000,Number(d.ms)||80)));send();}else if(d.type==='reset'){stop();sim.reset();send(true);}else if(d.type==='input'){stop();sim.setInput(d.id,d.value);send(true);}else if(d.type==='next'){stop();sim.nextCycle();send(true);}}}catch(error){stop();root.postMessage({error:error.message});}};
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  // A NOT's input topples a bridge backwards before the delayed trigger arrives.
  // Propagation is derived from falling/standing footprints, not logical links.
  function flatten(source){
    const state=C.validate(source),parent=new Map(),items=[],forces=[];
    const find=k=>{if(!parent.has(k))parent.set(k,k);let p=k;while(parent.get(p)!==p)p=parent.get(p);while(k!==p){const n=parent.get(k);parent.set(k,p);k=n;}return p;};
    const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent.set(a,b);},port=(s,id,d,p,b)=>find(s+'/'+id+':'+d+':'+p+':'+b);
    function visit(local,scope,depth=0){
      if(depth>C.MAX_DEPTH)throw Error('骨牌转换：嵌套过深');
      const net=C.nets({...local,definitions:state.definitions});
      for(const g of net.groups.values())for(let b=0;b<g.width;b++){let first;for(const p of g.ports.values())if(b<p.width){const k=port(scope,p.node,p.dir,p.port,b);if(first===undefined)first=k;else join(first,k);}}
      for(const [id,bits] of Object.entries(scope==='root'?{...state.wireOverrides,...state.scopedWireOverrides?.root}:state.scopedWireOverrides?.[scope]||{})){
        const g=net.groups.get(net.wireNet.get(id));if(!g)continue;for(let b=0;b<g.width;b++){const p=[...g.ports.values()].find(p=>p.width>b);if(p)forces.push({token:port(scope,p.node,p.dir,p.port,b),value:bits[b]||0});}
      }
      for(const n of local.nodes){const s=C.spec(n,state.definitions),p=(d,i,b)=>port(scope,n.id,d,i,b);
        if(n.type==='custom'){const def=state.definitions[n.def],child=scope+'/'+n.id;visit(def,child,depth+1);for(const [d,ports] of [['in',def.inputs],['out',def.outputs]])ports.forEach((q,i)=>{for(let b=0;b<q.width;b++)join(p(d,i,b),port(child,q.id,d==='in'?'out':'in',0,b));});continue;}
        if(n.type==='hub'||n.type==='splitter'){for(let b=0;b<(n.bits||1);b++)join(p(n.type==='hub'?'out':'in',0,b),p(n.type==='hub'?'in':'out',b,0));continue;}
        if(scope!=='root'&&['input','output'].includes(n.type))continue;
        for(let b=0;b<(n.type==='nand'?1:n.bits||1);b++)items.push({id:scope+'/'+n.id+':'+b,node:n.id,scope,bit:b,type:n.type,label:(n.label||{input:'输入',output:'输出',nand:'与非门',delay:'延迟线'}[n.type])+(n.bits>1?' · b'+b:''),inputs:s.inputs.map((_,i)=>p('in',i,b)),output:s.outputs.length?p('out',0,b):null,value:C.bitArray(n.type==='delay'?state.delayState?.[scope+'/'+n.id]||0:n.value||0,n.bits||1)[b],sourceY:n.y,sourceX:n.x});
      }
    }
    visit(state,'root');for(const p of items){p.inputs=p.inputs.map(find);if(p.output)p.output=find(p.output);}
    const forced=new Map(forces.map(f=>[find(f.token),f.value]));for(const [token,value] of forced)items.push({id:'forced:'+token,type:'input',label:'临时输入',bit:0,value,output:token,inputs:[],forced:true});
    const drivers=new Map();for(const p of items)if(p.output&&(!forced.has(p.output)||p.forced)){if(!drivers.has(p.output))drivers.set(p.output,[]);drivers.get(p.output).push(p);}
    const gates=items.filter(p=>p.type==='nand'),waiting=new Map(),users=new Map(),order=[];
    for(const p of gates){const deps=new Set(p.inputs.flatMap(t=>(drivers.get(t)||[]).filter(d=>d.type==='nand')));waiting.set(p,deps.size);if(!deps.size)order.push(p);for(const d of deps){if(!users.has(d))users.set(d,[]);users.get(d).push(p);}}
    for(let i=0;i<order.length;i++){const p=order[i];p.level=1+Math.max(0,...p.inputs.flatMap(t=>(drivers.get(t)||[]).filter(d=>d.type==='nand').map(d=>d.level)));for(const q of users.get(p)||[])if(waiting.set(q,waiting.get(q)-1).get(q)===0)order.push(q);}
    if(order.length!==gates.length)throw Error('存在没有延迟线的反馈环：一次倒下的骨牌不能循环触发。请在反馈中加入延迟线，再逐轮运行。');
    return {items,drivers,order};
  }
  function curvedPath(points,spacing=14,radius=34){
    const clean=[];for(const p of points){const last=clean.at(-1);if(!last||Math.hypot(last.x-p.x,last.y-p.y)>1e-6)clean.push({x:p.x,y:p.y});}
    if(clean.length<2)return clean.map(p=>({...p,angle:0}));
    const dense=[clean[0]],line=p=>{const a=dense.at(-1),n=Math.max(1,Math.ceil(Math.hypot(p.x-a.x,p.y-a.y)/3));for(let k=1;k<=n;k++)dense.push({x:a.x+(p.x-a.x)*k/n,y:a.y+(p.y-a.y)*k/n});};
    for(let i=1;i<clean.length-1;i++){
      const a=clean[i-1],b=clean[i],c=clean[i+1],la=Math.hypot(b.x-a.x,b.y-a.y),lb=Math.hypot(c.x-b.x,c.y-b.y),u={x:(b.x-a.x)/la,y:(b.y-a.y)/la},v={x:(c.x-b.x)/lb,y:(c.y-b.y)/lb};
      if(Math.abs(u.x*v.y-u.y*v.x)<1e-6){line(b);continue;}
      const r=Math.min(radius,la/2,lb/2),start={x:b.x-u.x*r,y:b.y-u.y*r},end={x:b.x+v.x*r,y:b.y+v.y*r};line(start);
      const count=Math.max(8,Math.ceil(r));for(let k=1;k<=count;k++){const t=k/count,s=1-t;dense.push({x:s*s*start.x+2*s*t*b.x+t*t*end.x,y:s*s*start.y+2*s*t*b.y+t*t*end.y});}
    }
    line(clean.at(-1));const lengths=[0];for(let i=1;i<dense.length;i++)lengths.push(lengths.at(-1)+Math.hypot(dense[i].x-dense[i-1].x,dense[i].y-dense[i-1].y));
    const total=lengths.at(-1),count=Math.max(1,Math.ceil(total/spacing)),samples=[];let cursor=1;
    for(let k=0;k<=count;k++){const at=total*k/count;while(cursor<lengths.length-1&&lengths[cursor]<at)cursor++;const a=dense[cursor-1],b=dense[cursor],t=(at-lengths[cursor-1])/(lengths[cursor]-lengths[cursor-1]||1);samples.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
    return samples.map((p,i)=>{const a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)];return {...p,angle:Math.atan2(b.y-a.y,b.x-a.x)};});
  }
  const DIMENSIONS=Object.freeze({height:24,width:10,thickness:3});
  function hits(a,b,sign=1){
    const c=Math.cos(a.angle),s=Math.sin(a.angle),u=Math.cos(b.angle),v=Math.sin(b.angle),h=DIMENSIONS.height/2,w=DIMENSIONS.width/2,t=DIMENSIONS.thickness/2;
    const dx=b.x-a.x-sign*c*(h+t),dy=b.y-a.y-sign*s*(h+t);
    for(const [x,y] of [[c,s],[-s,c],[u,v],[-v,u]])if(Math.abs(dx*x+dy*y)>h*Math.abs(c*x+s*y)+w*Math.abs(-s*x+c*y)+t*Math.abs(u*x+v*y)+w*Math.abs(-v*x+u*y)+1e-6)return false;
    return true;
  }
  function contacts(bones){
    const tiles=new Map(),size=40;for(let i=0;i<bones.length;i++){const b=bones[i],key=Math.floor(b.x/size)+','+Math.floor(b.y/size);if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(i);}
    for(let i=0;i<bones.length;i++){const b=bones[i];b.contacts=[[],[]];for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)for(const j of tiles.get((Math.floor(b.x/size)+x)+','+(Math.floor(b.y/size)+y))||[]){if(i===j)continue;const q=bones[j],direction=(q.x-b.x)*Math.cos(q.angle)+(q.y-b.y)*Math.sin(q.angle)>=0?1:-1;for(const sign of [1,-1])if(hits(b,q,sign))b.contacts[sign===1?0:1].push([j,direction]);}}
  }
  function shareBranches(board,instances){
    const bones=board.bones,removed=new Set(),hiddenModules=new Set(),first=new Map(),pairs=[];
    for(const p of instances){if(first.has(p.expression))pairs.push([first.get(p.expression),p]);else first.set(p.expression,p);}
    pairs.sort((a,b)=>(b[1].end-b[1].start)-(a[1].end-a[1].start));let shared=0;
    for(const [origin,copy] of pairs){
      if(copy.end-copy.start<70||removed.has(origin.pin)||removed.has(copy.pin))continue;
      const degree=new Int32Array(bones.length);for(let i=0;i<bones.length;i++)if(!removed.has(i))for(const next of bones[i].next)if(!removed.has(next))degree[next]++;
      const discarded=new Set();let targetPin=copy.pin;
      while(bones[targetPin].next.length===1){const next=bones[targetPin].next[0];if(removed.has(next))break;discarded.add(targetPin);targetPin=next;if(degree[next]>1||['knock','output','bridge','clock'].includes(bones[next].kind))break;}
      let sourcePin=origin.pin;for(let n=0;n<16&&(bones[sourcePin].next.length!==1||Math.abs(bones[sourcePin].angle)>.05);n++){sourcePin=bones[sourcePin].next[0];if(sourcePin===undefined)break;}if(sourcePin===undefined)continue;const source=bones[sourcePin],target=bones[targetPin],excluded=i=>removed.has(i)||discarded.has(i)||(i>=copy.start&&i<copy.end&&i!==targetPin),oldFirst=source.next[0];
      if(oldFirst===undefined||removed.has(oldFirst)||source.next.length!==1)continue;
      const trunk=new Set([sourcePin]);let cursor=oldFirst;for(let n=0;n<5000&&cursor!==undefined;n++){if(degree[cursor]>1||['clock','bridge','knock','output'].includes(bones[cursor].kind))break;trunk.add(cursor);cursor=bones[cursor].next[0];}
      const old=bones[oldFirst],saved={x:old.x,y:old.y,angle:old.angle};let accepted=false;
      for(const sign of [-1,1]){
        old.x=source.x+18;old.y=source.y-sign*7;const next=old.next[0];old.angle=next===undefined?0:Math.atan2(bones[next].y-old.y,bones[next].x-old.x);
        if(!hits(source,old)||next!==undefined&&!hits(old,bones[next]))continue;
        const head={x:source.x+18,y:source.y+sign*7,angle:sign*Math.PI/5},start={x:source.x+56,y:source.y+sign*56},approach=Math.cos(target.angle)>=0?-1:1,end={x:target.x+approach*42,y:target.y};
        const route=freeRoute(bones,excluded,start,end,source,target);if(!route)continue;
        const points=[head,...curvedPath([head,start,...route,end,{x:target.x+approach*18,y:target.y},target]).slice(1,-1)];
        if(points.length>=copy.end-copy.start+discarded.size-8)continue;
        let valid=hits(source,points[0]);for(let i=1;i<points.length&&valid;i++)valid=hits(points[i-1],points[i]);valid&&=hits(points.at(-1),target);if(!valid)continue;
        const local=new Map();for(let i=0;i<bones.length;i++)if(!excluded(i)){const b=bones[i],key=Math.floor(b.x/40)+','+Math.floor(b.y/40);if(!local.has(key))local.set(key,[]);local.get(key).push(i);}
        for(const a of points){if(!valid)break;for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)for(const id of local.get((Math.floor(a.x/40)+x)+','+(Math.floor(a.y/40)+y))||[]){const b=bones[id];if(trunk.has(id)||Math.hypot(b.x-source.x,b.y-source.y)<45||Math.hypot(b.x-target.x,b.y-target.y)<45)continue;if(hits(a,b)||hits(b,a)){valid=false;break;}}}
        if(!valid)continue;
        for(let i=copy.start;i<copy.end;i++)if(i!==targetPin)removed.add(i);for(const id of discarded)removed.add(id);for(let i=copy.mStart;i<copy.mEnd;i++)hiddenModules.add(i);
        let previous=sourcePin;for(const p of points){const id=bones.length;bones.push({...p,kind:'wire',next:[]});bones[previous].next.push(id);previous=id;}bones[previous].next.push(targetPin);shared++;accepted=true;break;
      }
      if(!accepted)Object.assign(old,saved);
    }
    if(!shared){board.sharedBranches=0;return;}
    const map=new Map(),kept=[];for(let i=0;i<bones.length;i++)if(!removed.has(i)){map.set(i,kept.length);kept.push(bones[i]);}
    for(const b of kept)b.next=b.next.filter(id=>map.has(id)).map(id=>map.get(id));
    board.bones=kept;board.modules=board.modules.filter((_,i)=>!hiddenModules.has(i));for(const p of [...board.inputs,...board.delays]){p.pins=p.pins.filter(id=>map.has(id)).map(id=>map.get(id));if(p.target!==undefined)p.target=map.get(p.target);}for(const p of board.outputs)p.pin=map.get(p.pin);board.clocks=board.clocks.filter(c=>map.has(c.pin)).map(c=>({...c,pin:map.get(c.pin),after:map.get(c.after)}));
    const indegree=new Int32Array(kept.length),ready=new Float64Array(kept.length).fill(1),edges=kept.map(b=>b.next.map(id=>[id,1]));for(const c of board.clocks)edges[c.after].push([c.pin,4]);for(const list of edges)for(const [id] of list)indegree[id]++;
    const queue=[];for(let i=0;i<kept.length;i++)if(!indegree[i])queue.push(i);for(let i=0;i<queue.length;i++)for(const [next,weight] of edges[queue[i]]){ready[next]=Math.max(ready[next],ready[queue[i]]+weight);if(!--indegree[next])queue.push(next);}if(queue.length!==kept.length)throw Error('骨牌分岔拓扑形成反馈');
    let end=1;for(const value of ready)end=Math.max(end,value);for(const c of board.clocks)c.at=ready[c.pin];board.endAt=end+3;board.sharedBranches=shared;board.savedBones=board.originalBoneCount-board.bones.length;
  }
  function freeRoute(bones,excluded,start,end,source,target){
    const step=28,blocked=new Set(),key=(x,y)=>x+','+y;let minX=Math.min(start.x,end.x),maxX=Math.max(start.x,end.x),minY=Math.min(start.y,end.y),maxY=Math.max(start.y,end.y);
    for(let i=0;i<bones.length;i++)if(!excluded(i)){const b=bones[i];minX=Math.min(minX,b.x);maxX=Math.max(maxX,b.x);minY=Math.min(minY,b.y);maxY=Math.max(maxY,b.y);if(Math.hypot(b.x-source.x,b.y-source.y)<65||Math.hypot(b.x-target.x,b.y-target.y)<65)continue;for(let y=Math.floor((b.y-42)/step);y<=Math.ceil((b.y+42)/step);y++)for(let x=Math.floor((b.x-42)/step);x<=Math.ceil((b.x+42)/step);x++)if(Math.hypot(x*step-b.x,y*step-b.y)<43)blocked.add(key(x,y));}
    const sx=Math.round(start.x/step),sy=Math.round(start.y/step),ex=Math.round(end.x/step),ey=Math.round(end.y/step),first=key(sx,sy),last=key(ex,ey),prev=new Map([[first,null]]),queue=[{x:sx,y:sy}];blocked.delete(first);blocked.delete(last);const bounds={x0:Math.floor(minX/step)-5,x1:Math.ceil(maxX/step)+5,y0:Math.floor(minY/step)-5,y1:Math.ceil(maxY/step)+5};
    for(let i=0;i<queue.length&&queue.length<140000;i++){const p=queue[i],k=key(p.x,p.y);if(k===last){const path=[];let cur=k;while(cur!==null){const [x,y]=cur.split(',').map(Number);path.push({x:x*step,y:y*step});cur=prev.get(cur);}path.reverse();const simplified=[];for(let j=0;j<path.length;j++){const a=path[j-1],b=path[j],c=path[j+1];if(a&&c&&(b.x-a.x)*(c.y-b.y)===(b.y-a.y)*(c.x-b.x))continue;simplified.push(b);}return simplified;}
      const dirs=Math.abs(ex-p.x)>Math.abs(ey-p.y)?[[Math.sign(ex-p.x)||1,0],[0,Math.sign(ey-p.y)||1],[0,-(Math.sign(ey-p.y)||1)],[-(Math.sign(ex-p.x)||1),0]]:[[0,Math.sign(ey-p.y)||1],[Math.sign(ex-p.x)||1,0],[-(Math.sign(ex-p.x)||1),0],[0,-(Math.sign(ey-p.y)||1)]];
      for(const [dx,dy] of dirs){const x=p.x+dx,y=p.y+dy,k=key(x,y);if(x<bounds.x0||x>bounds.x1||y<bounds.y0||y>bounds.y1||prev.has(k)||blocked.has(k))continue;prev.set(k,key(p.x,p.y));queue.push({x,y});}
    }return null;
  }
  function build(source){
    const graph=flatten(source),bones=[],modules=[],inputs=[],delays=[],outputs=[],clocks=[],expressions=new Map(),nets=new Map(),bounds={minX:-35,minY:-35,maxX:100,maxY:100};let endAt=1,placedGateCount=0;const instances=[];
    const sources=graph.items.filter(p=>p.type==='input'||p.type==='delay').sort((a,b)=>(a.sourceY||0)-(b.sourceY||0)||(a.sourceX||0)-(b.sourceX||0)||b.bit-a.bit);
    for(const p of sources){const item={id:p.id,label:p.label,bit:p.bit,value:p.value,pins:[]};(p.type==='input'?inputs:delays).push(item);expressions.set(p,{type:p.type,item,w:80,h:100});}
    const zero={type:'zero',w:80,h:100},not=a=>({type:'not',a,w:a.w+260,h:a.h+180}),or=(a,b)=>({type:'or',a,b,w:Math.max(a.w,b.w)+220,h:a.h+b.h+100});
    const net=t=>{if(nets.has(t))return nets.get(t);const list=(graph.drivers.get(t)||[]).map(p=>expressions.get(p));if(list.some(p=>!p))throw Error('骨牌拓扑尚未就绪');const e=list.reduce((a,b)=>a?or(a,b):b,null)||zero;nets.set(t,e);return e;};
    for(const p of graph.order){const a=net(p.inputs[0]),b=net(p.inputs[1]);let e;if(a===b)e=not(a);else e=or(not(a),not(b));e={...e,nand:true};expressions.set(p,e);}
    const bone=(x,y,kind='wire',angle=0)=>{const id=bones.length;bones.push({x,y,kind,angle,next:[]});bounds.maxX=Math.max(bounds.maxX,x+55);bounds.maxY=Math.max(bounds.maxY,y+55);return id;};
    const chain=(points,kind='wire',interior=false)=>{let ps=curvedPath(points);if(interior)ps=ps.slice(1,-1);const ids=ps.map(p=>bone(p.x,p.y,kind,p.angle));for(let i=1;i<ids.length;i++)bones[ids[i-1]].next.push(ids[i]);return ids;};
    function connect(from,to,points,kind='wire'){const ids=chain([bones[from],...points,bones[to]],kind,true);if(ids.length){bones[from].next.push(ids[0]);bones[ids.at(-1)].next.push(to);}else bones[from].next.push(to);return ids.length+1;}
    function place(e,x,y){const start=bones.length,mStart=modules.length,r=placeRaw(e,x,y);instances.push({expression:e,start,end:bones.length,pin:r.pin,mStart,mEnd:modules.length});return r;}
    function placeRaw(e,x,y){
      if(bones.length>1000000)throw Error('当前无交叉摆放超过一百万张骨牌');
      if(e.nand)placedGateCount++;
      if(e.type==='input'||e.type==='delay'||e.type==='zero'){const pin=bone(x+50,y+e.h/2,e.type==='zero'?'wire':e.type);if(e.item)e.item.pins.push(pin);modules.push({x:x+25,y:y+e.h/2,label:e.item?.label||'0',type:e.type});return {pin,ready:1};}
      if(e.type==='not'){
        const a=place(e.a,x,y),cy=bones[a.pin].y,X=x+e.a.w+70,by=cy+60;
        const data=bone(X+14,by,'knock',Math.PI);const arrival=a.ready+connect(a.pin,data,[{x:X+75,y:cy},{x:X+75,y:by}]);
        const reach=18/Math.SQRT2,prefix=chain([{x:X-50,y:by+70},{x:X-50,y:by-14},{x:X-24,y:by-24},{x:X-reach,y:by-reach}],'clock'),bridge=bone(X,by,'bridge',Math.PI/4);bones[prefix.at(-1)].angle=Math.PI/4;bones[prefix.at(-1)].next.push(bridge);prefix.push(bridge);
        const first=bone(X+reach,by+reach,'clock',Math.PI/4);bones[bridge].next.push(first);
        const out=bone(x+e.w-20,by+55,'junction'),distance=1+connect(first,out,[{x:X+35,y:by+55}],'clock'),clockAt=arrival+4;clocks.push({pin:prefix[0],at:clockAt,after:data});const ready=clockAt+prefix.length+distance;endAt=Math.max(endAt,ready);
        if(e.nand)modules.push({x:X,y:cy-15,label:'与非门',type:'nand'});return {pin:out,ready};
      }
      const a=place(e.a,x,y),b=place(e.b,x,y+e.a.h+100),out=bone(x+e.w-20,y+e.a.h+50,'junction'),q=bones[out];
      const da=connect(a.pin,out,[{x:q.x-70,y:bones[a.pin].y},{x:q.x-70,y:q.y-25}],'junction'),db=connect(b.pin,out,[{x:q.x-70,y:bones[b.pin].y},{x:q.x-70,y:q.y+25}],'junction');
      if(e.nand)modules.push({x:q.x-80,y:q.y-20,label:'与非门',type:'nand'});return {pin:out,ready:Math.max(a.ready+da,b.ready+db)};
    }
    let y=0;const sinks=graph.items.filter(p=>p.type==='output'||p.type==='delay').sort((a,b)=>(a.sourceY||0)-(b.sourceY||0)||b.bit-a.bit);
    for(const p of sinks){const expr=net(p.inputs[0]);if(!Number.isFinite(expr.h)||!Number.isFinite(expr.w))throw Error('无交叉骨牌布局过大');const r=place(expr,0,y),q=bones[r.pin],pin=bone(q.x+45,q.y,'output');const ready=r.ready+connect(r.pin,pin,[])+2;endAt=Math.max(endAt,ready);modules.push({x:q.x+45,y:q.y,label:p.type==='delay'?p.label+' · 下一轮':p.label,type:'output'});if(p.type==='delay')delays.find(d=>d.id===p.id).target=pin;else outputs.push({id:p.id,label:p.label,bit:p.bit,pin,ready});y+=expr.h+200;}
    const board={bones,modules,bounds,inputs,outputs,delays,clocks,endAt,gateCount:graph.order.length,placedGateCount};
    board.originalBoneCount=bones.length;shareBranches(board,instances);contacts(board.bones);return board;
  }
  class Simulator{
    constructor(board){this.board=board;this.inputs=board.inputs.map(p=>({...p}));this.delays=board.delays.map(p=>({...p}));this.cycle=1;this.reset();}
    schedule(id,at,direction=1){if(!this.pending.has(at))this.pending.set(at,[]);this.pending.get(at).push([id,direction]);}
    reset(){this.tick=0;this.states=new Uint8Array(this.board.bones.length);this.changes=[];this.pending=new Map();this.toppled=0;this.complete=false;for(const p of [...this.inputs,...this.delays])if(p.value)for(const pin of p.pins||[p.pin])this.schedule(pin,1);for(const c of this.board.clocks)this.schedule(c.pin,c.at);}
    step(){if(this.complete)return;this.tick++;const list=this.pending.get(this.tick)||[],impulses=new Map();this.pending.delete(this.tick);for(const [id,direction] of list)if(!this.states[id])impulses.set(id,(impulses.get(id)||0)+direction);for(const [id,impulse] of impulses){if(!impulse)continue;const direction=Math.sign(impulse);this.states[id]=direction===1?1:2;this.changes.push([id,this.states[id]]);this.toppled++;const b=this.board.bones[id];for(const [next,dir] of b.contacts[direction===1?0:1])this.schedule(next,this.tick+1,dir);}this.complete=this.tick>=this.board.endAt&&this.pending.size===0;}
    run(){while(!this.complete)this.step();return this.status();}
    setInput(id,value){const p=this.inputs.find(p=>p.id===id);if(!p||![0,1].includes(value))throw Error('骨牌输入必须是0或1');p.value=value;this.reset();}
    nextCycle(){if(!this.complete)throw Error('请先完成本轮推倒，再采样延迟并进入下一轮');const values=this.delays.map(p=>Number(this.states[p.target]===1));this.delays.forEach((p,i)=>p.value=values[i]);this.cycle++;this.reset();}
    status(){return {tick:this.tick,endAt:this.board.endAt,cycle:this.cycle,complete:this.complete,toppled:this.toppled,total:this.states.length,sharedBranches:this.board.sharedBranches||0,savedBones:this.board.savedBones||0,inputs:this.inputs.map(({id,label,bit,value})=>({id,label,bit,value})),delays:this.delays.map(p=>({id:p.id,label:p.label,value:p.value,next:this.complete?Number(this.states[p.target]===1):null})),outputs:this.board.outputs.map(p=>({id:p.id,label:p.label,bit:p.bit,value:this.complete?Number(this.states[p.pin]===1):null}))};}
  }
  function buildGate(type){
    if(type==='routing')return buildRouting();
    if(type==='cross')return buildCrossover();
    if(!['or','xor'].includes(type))throw Error('未知骨牌基础门');const bones=[],modules=[],inputs=[],outputs=[],point=(x,y)=>({x,y});
    const add=(p,kind='wire',angle=0)=>{const id=bones.length;bones.push({...p,kind,angle,next:[]});return id;};
    const path=(ps,kind='wire')=>{const ids=curvedPath(ps).map(p=>add(p,kind,p.angle));for(let i=1;i<ids.length;i++)bones[ids[i-1]].next.push(ids[i]);return ids;};
    const out=add(point(210,0),'output');outputs.push({id:'Q',label:'Q',bit:0,pin:out});modules.push({...bones[out],label:'Q',type:'output'});
    if(type==='or'){
      for(const [i,sign] of [-1,1].entries()){const ids=path([point(-140,sign*65),point(-40,sign*65),point(145,sign*35),point(190,sign*10),point(210,0)]);inputs.push({id:i?'B':'A',label:i?'B':'A',bit:0,value:0,pins:[ids[0]]});modules.push({...bones[ids[0]],label:i?'B':'A',type:'input'});}
    }else{
      for(const [i,ps] of [[point(-140,0),point(-18,0)],[point(0,140),point(0,18)]].entries()){const ids=path(ps);inputs.push({id:i?'B':'A',label:i?'B':'A',bit:0,value:0,pins:[ids[0]]});modules.push({...bones[ids[0]],label:i?'B':'A',type:'input'});}
      const bridge=add(point(0,0),'bridge',Math.PI/4),reach=18/Math.SQRT2;
      const plus=path([point(reach,reach),point(65,175),point(145,175),point(190,10),point(210,0)]);
      const minus=path([point(-reach,-reach),point(-50,-50),point(-50,-100),point(145,-100),point(190,-10),point(210,0)]);bones[minus[0]].angle=Math.PI/4;
      bones[bridge].next.push(plus[0]);modules.push({x:0,y:-5,label:'异或门',type:'gate'});
    }
    // Coincident terminal samples are one physical domino, shared by both lanes.
    const duplicates=new Set(bones.flatMap((b,i)=>i!==out&&Math.hypot(b.x-210,b.y)<1e-6?[i]:[]));for(const b of bones)b.next=b.next.map(i=>duplicates.has(i)?out:i);
    const map=new Map(),kept=[];for(let i=0;i<bones.length;i++)if(!duplicates.has(i)){map.set(i,kept.length);kept.push(bones[i]);}for(const b of kept)b.next=b.next.map(i=>map.get(i));for(const p of inputs)p.pins=p.pins.map(i=>map.get(i));outputs[0].pin=map.get(out);contacts(kept);
    return {bones:kept,modules,inputs,outputs,delays:[],clocks:[],bounds:{minX:-180,minY:-155,maxX:265,maxY:235},endAt:kept.length+4,gateCount:1,gateTitle:type==='or'?'或门':'异或门',sharedBranches:0};
  }
  function buildCrossover(){
    const delays={rootA:0,rootB:0,a:0,b:0,t2:0,t3:0};
    function assemble(){
      const bones=[],modules=[],centers=[],units=[];
      for(const [index,[x,y]] of [[0,0],[500,-400],[500,400]].entries()){
        const unit=buildGate('xor'),offset=bones.length,sign=index===2?-1:1;for(const p of unit.bones)bones.push({...p,x:p.x+x,y:p.y*sign+y,angle:p.angle*sign,next:p.next.map(id=>id+offset)});modules.push({x,y,label:'异或门',type:'gate'});centers.push(offset+unit.bones.findIndex(p=>p.kind==='bridge'));units.push({a:offset+unit.inputs[0].pins[0],b:offset+unit.inputs[1].pins[0],out:offset+unit.outputs[0].pin});
      }
      const add=(x,y,angle=0,kind='wire')=>{const id=bones.length;bones.push({x,y,angle,kind,next:[]});return id;};
      const connect=(from,to,via)=>{const ps=curvedPath([bones[from],...via.map(([x,y])=>({x,y})),bones[to]]).slice(1,-1);let previous=from;for(const p of ps){const id=add(p.x,p.y,p.angle);bones[previous].next.push(id);previous=id;}bones[previous].next.push(to);};
      const fork=(id,y)=>{const upper=add(-702,y-7,-Math.PI/5),lower=add(-702,y+7,Math.PI/5);bones[id].next.push(upper,lower);return [upper,lower];};
      const a=add(-720,-400,0,'input'),b=add(-720,400,0,'input'),[au,ad]=fork(a,-400),[bu,bd]=fork(b,400);
      connect(ad,units[0].a,[[-650,-340],[-650,-200],[-650-delays.rootA,-200],[-650-delays.rootA,-100],[-200,-100],[-200,0]]);
      connect(bu,units[0].b,[[-650,340],[-650,240],[-620-delays.rootB,240],[-620-delays.rootB,200],[0,200]]);
      connect(au,units[1].a,[[-650,-450],[-650,-450-delays.a],[-100,-450-delays.a],[-100,-400]]);
      connect(bd,units[2].a,[[-650,450],[-650,450+delays.b],[-100,450+delays.b],[-100,400]]);
      const t=units[0].out,tu=add(bones[t].x+18,-7,-Math.PI/5),td=add(bones[t].x+18,7,Math.PI/5);bones[t].next.push(tu,td);
      connect(tu,units[1].b,[[280,-40],[650+delays.t2,-40],[650+delays.t2,-180],[500,-180]]);
      connect(td,units[2].b,[[280,40],[650+delays.t3,40],[650+delays.t3,180],[500,180]]);
      modules.push({x:-720,y:-400,label:'A',type:'input'},{x:-720,y:400,label:'B',type:'input'},{x:710,y:-400,label:'B · 预接输入',type:'output'},{x:710,y:400,label:'A · 预接输入',type:'output'});
      contacts(bones);return {bones,modules,centers,inputs:[{id:'A',label:'A',bit:0,value:0,pins:[a]},{id:'B',label:'B',bit:0,value:0,pins:[b]}],outputs:[{id:'B-out',label:'B',bit:0,pin:units[1].out},{id:'A-out',label:'A',bit:0,pin:units[2].out}],delays:[],clocks:[],bounds:{minX:-800-Math.max(delays.rootA,delays.rootB),minY:-560-delays.a,maxX:980+Math.max(delays.t2,delays.t3),maxY:Math.max(750,560+delays.b)},endAt:bones.length+8,gateCount:3,gateTitle:'异或门',sharedBranches:3};
    }
    function trace(board,row){const sim=new Simulator(board),arrivals=board.centers.map(()=>({}));sim.inputs.forEach((p,i)=>p.value=row>>i&1);sim.reset();while(!sim.complete){for(const [id,d] of sim.pending.get(sim.tick+1)||[]){const index=board.centers.indexOf(id);if(index>=0&&arrivals[index][d]===undefined)arrivals[index][d]=sim.tick+1;}sim.step();}return {arrivals,values:sim.status().outputs.map(p=>p.value)};}
    let board;
    for(let iteration=0;iteration<50;iteration++){
      board=assemble();const a=trace(board,1),b=trace(board,2),rootA=a.arrivals[0][1],rootB=b.arrivals[0][-1];
      if(rootA===undefined||rootB===undefined)throw Error('交叉器的输入连接未接通');
      if(rootA!==rootB){delays[rootA<rootB?'rootA':'rootB']+=Math.max(1,Math.abs(rootA-rootB)*8);continue;}
      let changed=false;for(const [sample,index,direct,trunk] of [[a,1,'a','t2'],[b,2,'b','t3']]){const pos=sample.arrivals[index][1],neg=sample.arrivals[index][-1];if(pos===undefined||neg===undefined)throw Error('交叉器的分岔连接未接通');if(pos!==neg){delays[pos<neg?direct:trunk]+=Math.max(1,Math.abs(pos-neg)*8);changed=true;}}
      if(changed)continue;
      if([0,1,2,3].every(row=>{const r=trace(board,row).values;return r[0]===(row>>1&1)&&r[1]===(row&1);}))return board;
      throw Error('交叉器还未通过四种输入验证');
    }
    throw Error('交叉器的骨牌到达时间尚未对齐');
  }
  function buildRouting(){
    const b=buildCrossover(),bones=b.bones,left=b.bounds.minX-140,bottom=b.bounds.maxY+140;
    const add=(x,y,angle=0,kind='wire')=>{const id=bones.length;bones.push({x,y,angle,kind,next:[]});return id;};
    const connect=(from,to,via)=>{let prev=from;for(const p of curvedPath([bones[from],...via.map(([x,y])=>({x,y})),bones[to]]).slice(1,-1)){const id=add(p.x,p.y,p.angle);bones[prev].next.push(id);prev=id;}bones[prev].next.push(to);};
    const cin=add(-720,0,Math.PI,'input'),fork=add(800,bottom);connect(cin,fork,[[left,0],[left,bottom]]);
    for(const sign of [-1,1]){const head=add(818,bottom+sign*7,sign*Math.PI/5),out=add(1100,bottom+sign*60,0,'output');bones[fork].next.push(head);connect(head,out,[[880,bottom+sign*60]]);b.outputs.push({id:'cin-'+sign,label:'进位 C_in · 预接 '+(sign<0?'1':'2'),bit:0,pin:out});b.modules.push({x:1100,y:bottom+sign*60,label:'C_in · 预接输入 '+(sign<0?'1':'2'),type:'output'});}
    b.inputs.push({id:'Cin',label:'进位 C_in',bit:0,value:0,pins:[cin]});b.modules.push({x:-720,y:0,label:'进位 C_in',type:'input'});b.bounds={...b.bounds,minX:left-50,maxX:Math.max(b.bounds.maxX,1180),maxY:bottom+130};b.sharedBranches++;b.endAt=bones.length+8;contacts(bones);return b;
  }
  function demo(){
    const nodes=[],wires=[];const n=(id,type,x,y,label)=>{nodes.push({id,type,x,y,label});return id;},w=(a,b,p=0)=>wires.push({id:'w'+wires.length,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port:p}}),gate=(id,a,b,x,y)=>{n(id,'nand',x,y,'与非门');w(a,id);w(b,id,1);return id;};
    n('a','input',0,0,'A');n('b','input',0,160,'B');n('cin','input',0,320,'进位 C_in');
    function xor(prefix,a,b,x,y){const t=gate(prefix+'n',a,b,x,y),u=gate(prefix+'u',a,t,x+180,y-60),v=gate(prefix+'v',b,t,x+180,y+70);return {out:gate(prefix+'o',u,v,x+360,y),both:t};}
    const ab=xor('ab','a','b',220,40),sum=xor('sum',ab.out,'cin',800,180),carry=gate('carry',ab.both,sum.both,1380,360);n('sumout','output',1600,0,'和 S');n('carryout','output',1600,180,'进位 C');w(sum.out,'sumout');w(carry,'carryout');return {version:1,nodes,wires,definitions:{}};
  }
  return {flatten,curvedPath,build,buildGate,buildCrossover,buildRouting,Simulator,demo,hits,contacts,DIMENSIONS};
});
