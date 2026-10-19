(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const types=['nand','input','output','hub','splitter','delay','custom'];
  const width=n=>n.bits||1;
  const MAX_BITS=256,MAX_DEPTH=32;
  const bigValue=value=>typeof value==='string'?BigInt('0b'+value):BigInt(value||0);
  const bitArray=(value,bits)=>{const text=bigValue(value).toString(2).padStart(bits,'0').slice(-bits);return [...text].reverse().map(Number);};
  const packBits=bits=>{const text=bits.slice().reverse().join('')||'0',value=BigInt('0b'+text);return value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):text;};
  const decimal=bits=>bigValue(packBits(bits)).toString();
  const DISPLAY_FORMATS=['unsigned','signed','hex'];
  function formatValue(bits,format='unsigned'){const value=bigValue(packBits(bits));if(format==='hex')return '0x'+value.toString(16).toUpperCase().padStart(Math.ceil(bits.length/4),'0');if(format==='signed'&&bits.at(-1)===1)return (value-(1n<<BigInt(bits.length))).toString();return value.toString();}
  function parseSignal(text,bits,format='unsigned'){
    text=String(text).trim();const modulus=1n<<BigInt(bits),literal=/^0[xb]/i.test(text);let value;
    try{if(literal){if(!/^(0x[0-9a-f]+|0b[01]+)$/i.test(text))throw Error();value=BigInt(text);}else if(format==='hex'){if(!/^[0-9a-f]+$/i.test(text))throw Error();value=BigInt('0x'+text);}else{if(!/^-?\d+$/.test(text))throw Error();value=BigInt(text);}}catch{throw Error('请输入当前模式的整数，也可使用 0x 或 0b 前缀');}
    const signed=format==='signed'&&!literal,min=signed?-(modulus/2n):0n,max=signed?modulus/2n-1n:modulus-1n;if(value<min||value>max)throw Error('数值超出 '+bits+' 位范围');return bitArray(value<0?value+modulus:value,bits);
  }
  function spec(n,defs={}){
    if(n.type==='nand')return {inputs:[1,1],outputs:[1],inLabels:['A','B'],outLabels:['Q']};
    if(n.type==='delay')return {inputs:[width(n)],outputs:[width(n)],inLabels:['IN'],outLabels:['Q']};
    if(n.type==='input')return {inputs:[],outputs:[width(n)],inLabels:[],outLabels:[n.label||'OUT']};
    if(n.type==='output')return {inputs:[width(n)],outputs:[],inLabels:[n.label||'IN'],outLabels:[]};
    if(n.type==='hub')return {inputs:Array(width(n)).fill(1),outputs:[width(n)],inLabels:Array.from({length:width(n)},(_,i)=>'b'+i),outLabels:[width(n)+'位']};
    if(n.type==='splitter')return {inputs:[width(n)],outputs:Array(width(n)).fill(1),inLabels:[width(n)+'位'],outLabels:Array.from({length:width(n)},(_,i)=>'b'+i)};
    const d=defs[n.def];if(!d)throw Error('自定义门不存在');
    return {inputs:d.inputs.map(p=>p.width),outputs:d.outputs.map(p=>p.width),inLabels:d.inputs.map(p=>p.label),outLabels:d.outputs.map(p=>p.label)};
  }
  function baseSize(n,defs){const s=spec(n,defs),digits=['input','output'].includes(n.type)?width(n):n.type==='delay'?Math.ceil(width(n)*Math.log10(2)):0;return {w:Math.max(152,digits*24+52),h:Math.max(80,Math.max(s.inputs.length,s.outputs.length)*24+32)};}
  function size(n,defs){const z=baseSize(n,defs);return (n.rotation||0)%180?{w:z.h,h:z.w}:z;}
  function rotatedPoint(p,n,defs){const z=baseSize(n,defs);switch(n.rotation||0){case 90:return {x:z.h-p.y,y:p.x};case 180:return {x:z.w-p.x,y:z.h-p.y};case 270:return {x:p.y,y:z.w-p.x};default:return p;}}
  function rotationTransform(n,defs){const z=baseSize(n,defs);switch(n.rotation||0){case 90:return `translate(${z.h} 0) rotate(90)`;case 180:return `translate(${z.w} ${z.h}) rotate(180)`;case 270:return `translate(0 ${z.w}) rotate(270)`;default:return '';}}
  function ports(n,defs){const s=spec(n,defs),z=baseSize(n,defs),out=[];for(const dir of ['in','out']){const ws=s[dir==='in'?'inputs':'outputs'],labels=s[dir==='in'?'inLabels':'outLabels'];ws.forEach((w,i)=>{const p=rotatedPoint({x:dir==='out'?z.w:0,y:z.h/2-(ws.length-1)*12+i*24},n,defs);out.push({node:n.id,dir,port:i,width:w,label:labels[i],x:n.x+p.x,y:n.y+p.y});});}return out;}
  const key=p=>p.node+':'+p.dir+':'+p.port;
  function anchor(e,state){if(!e.node)return {x:e.x,y:e.y};const n=state.nodes.find(n=>n.id===e.node);return ports(n,state.definitions).find(p=>p.dir===e.dir&&p.port===e.port);}
  function points(w,state){const a=anchor(w.a,state),b=anchor(w.b,state);if(Array.isArray(w.via))return [a,...w.via,b];const x=(a.x+b.x)/2;return [a,{x,y:a.y},{x,y:b.y},b];}
  function segmentsOverlap(p,q,c,d){const dx=q.x-p.x,dy=q.y-p.y,ex=d.x-c.x,ey=d.y-c.y;if((!dx&&!dy)||(!ex&&!ey)||Math.abs(dx*ey-dy*ex)>1e-7||Math.abs(dx*(c.y-p.y)-dy*(c.x-p.x))>1e-7)return false;const axis=Math.abs(dx)>=Math.abs(dy)?'x':'y';return Math.min(Math.max(p[axis],q[axis]),Math.max(c[axis],d[axis]))-Math.max(Math.min(p[axis],q[axis]),Math.min(c[axis],d[axis]))>1e-7;}
  function segmentHitsBox(p,q,r){let low=0,high=1;for(const [axis,extent] of [['x','w'],['y','h']]){const delta=q[axis]-p[axis],min=r[axis]+1e-7,max=r[axis]+r[extent]-1e-7;if(!delta){if(p[axis]<=min||p[axis]>=max)return false;}else{const a=(min-p[axis])/delta,b=(max-p[axis])/delta;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(low>=high)return false;}}return low<high;}
  function wireOverlaps(w,state){const ps=points(w,state);return state.wires.some(other=>other.id!==w.id&&points(other,state).slice(1).some((q,i,tail)=>{const p=i?tail[i-1]:anchor(other.a,state);return ps.slice(1).some((b,j)=>segmentsOverlap(ps[j],b,p,q));}));}
  function wireHitsGate(w,state){const ps=points(w,state);return state.nodes.some(n=>{const box={...n,...size(n,state.definitions)};return ps.slice(1).some((q,i)=>segmentHitsBox(ps[i],q,box));});}
  const ROUTE_CLEARANCE=24;
  function routePortExits(end,p,state,boxes,clear){
    if(!end.node)return [[p]];
    const n=state.nodes.find(n=>n.id===end.node),angle=(n.rotation||0)*Math.PI/180,sign=end.dir==='out'?1:-1,dx=Math.round(Math.cos(angle))*sign,dy=Math.round(Math.sin(angle))*sign;
    const side=offset=>{const q={x:p.x-dy*offset,y:p.y+dx*offset};return [p,q,{x:q.x+dx*ROUTE_CLEARANCE,y:q.y+dy*ROUTE_CLEARANCE}];},valid=ps=>ps.slice(1).every((q,i)=>clear(ps[i],q,end.node));
    const usual=[[p,{x:p.x+dx*ROUTE_CLEARANCE,y:p.y+dy*ROUTE_CLEARANCE}],...[-1,1,-2,2].map(k=>side(k*ROUTE_CLEARANCE))].filter(valid);if(usual.length)return usual;
    // If a neighbouring component blocks normal exits, move along the port face
    // to its one-cell boundary rather than squeezing into a sub-cell corridor.
    const offsets=[...new Set(boxes.flatMap(r=>[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y+r.h}]).map(q=>-(q.x-p.x)*dy+(q.y-p.y)*dx))].filter(Boolean).sort((a,b)=>Math.abs(a)-Math.abs(b)),out=[];
    for(const offset of offsets){const ps=side(offset);if(valid(ps)){out.push(ps);if(out.length===4)break;}}
    return out;
  }
  function leastOverlapRoute(aEnd,bEnd,state,ignoreWire){
    const a=anchor(aEnd,state),b=anchor(bEnd,state),boxes=state.nodes.map(n=>({id:n.id,x:n.x-ROUTE_CLEARANCE,y:n.y-ROUTE_CLEARANCE,w:size(n,state.definitions).w+2*ROUTE_CLEARANCE,h:size(n,state.definitions).h+2*ROUTE_CLEARANCE}));
    const segments=state.wires.filter(w=>w.id!==ignoreWire).flatMap((w,id)=>{const ps=points(w,state);return ps.slice(1).map((b,i)=>({a:ps[i],b,id}));}),edgeCache=new Map();
    const clear=(p,q,owner=null)=>!boxes.some(r=>r.id!==owner&&segmentHitsBox(p,q,r));
    const exits=(end,p)=>routePortExits(end,p,state,boxes,clear);
    const starts=exits(aEnd,a),ends=exits(bEnd,b);if(!starts.length||!ends.length)return null;
    const edge=(p,q)=>{const k=p.x+','+p.y+'>'+q.x+','+q.y;if(edgeCache.has(k))return edgeCache.get(k);const length=distance(p,q),ranges=[];if(length)for(const s of segments)if(segmentsOverlap(p,q,s.a,s.b)){const dot=r=>((r.x-p.x)*(q.x-p.x)+(r.y-p.y)*(q.y-p.y))/length;ranges.push({id:s.id,low:Math.max(0,Math.min(dot(s.a),dot(s.b))),high:Math.min(length,Math.max(dot(s.a),dot(s.b)))});}const stops=[...new Set([0,length,...ranges.flatMap(r=>[r.low,r.high])])].sort((a,b)=>a-b),sections=stops.slice(1).map((stop,i)=>({length:stop-stops[i],ids:new Set(ranges.filter(r=>r.low<(stops[i]+stop)/2&&r.high>(stops[i]+stop)/2).map(r=>r.id))}));const result={sections,length};edgeCache.set(k,result);return result;};
    const advance=(ps,previous={ids:new Set(),repeats:0,shared:0,length:0})=>{let {ids,repeats,shared,length}=previous;for(let i=1;i<ps.length;i++){const e=edge(ps[i-1],ps[i]);if(!e.length)continue;for(const section of e.sections){for(const id of section.ids)if(!ids.has(id))repeats++;ids=section.ids;shared+=section.length*ids.size;}length+=e.length;}return {ids,repeats,shared,length};};
    const compare=(p,q)=>p.repeats-q.repeats||p.shared-q.shared||p.priority-q.priority,better=(p,q)=>!q||compare({...p,priority:p.length},{...q,priority:q.length})<0;
    const clean=ps=>{const out=[];for(const p of ps){const q=out.at(-1);if(q&&q.x===p.x&&q.y===p.y)continue;while(out.length>1){const u=out.at(-2),v=out.at(-1);if(u.x===v.x&&v.x===p.x&&(v.y-u.y)*(p.y-v.y)>=0||u.y===v.y&&v.y===p.y&&(v.x-u.x)*(p.x-v.x)>=0)out.pop();else break;}out.push({x:p.x,y:p.y});}return out;};
    const valid=ps=>{for(let i=1;i<ps.length;i++){if(state.nodes.some(n=>segmentHitsBox(ps[i-1],ps[i],{...n,...size(n,state.definitions)})))return false;for(let j=1;j<i;j++)if(segmentsOverlap(ps[i-1],ps[i],ps[j-1],ps[j]))return false;}return true;};
    const coords=[...starts,...ends].flat(),X=[...new Set([...coords.flatMap(p=>[p.x-12,p.x,p.x+12]),...boxes.flatMap(r=>[r.x,r.x+r.w]),...segments.flatMap(s=>[s.a.x-12,s.a.x,s.a.x+12,s.b.x-12,s.b.x,s.b.x+12])])].sort((x,y)=>x-y),Y=[...new Set([...coords.flatMap(p=>[p.y-12,p.y,p.y+12]),...boxes.flatMap(r=>[r.y,r.y+r.h]),...segments.flatMap(s=>[s.a.y-12,s.a.y,s.a.y+12,s.b.y-12,s.b.y,s.b.y+12])])].sort((x,y)=>x-y),width=X.length,index=p=>Y.indexOf(p.y)*width+X.indexOf(p.x),goals=new Map(ends.map(ps=>[index(ps.at(-1)),ps]));
    let bestPath=null,bestScore=null;const consider=ps=>{ps=clean(ps);if(!valid(ps))return;const score=advance(ps);if(better(score,bestScore)){bestPath=ps;bestScore={...score,priority:score.length};}};
    // Keep a safe incumbent if the bounded search reaches its work budget.
    for(const start of starts)for(const end of ends){const A=start.at(-1),B=end.at(-1),candidates=[[A,{x:B.x,y:A.y},B],[A,{x:A.x,y:B.y},B]];for(const x of [X[0],X.at(-1)])candidates.push([A,{x,y:A.y},{x,y:B.y},B]);for(const y of [Y[0],Y.at(-1)])candidates.push([A,{x:A.x,y},{x:B.x,y},B]);for(const ps of candidates)if(ps.slice(1).every((q,i)=>clear(ps[i],q)))consider([...start,...ps,...end.slice().reverse()]);}
    const heap=[],best=new Map(),estimate=p=>Math.abs(p.x-b.x)+Math.abs(p.y-b.y);
    const push=item=>{let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(compare(heap[p],item)<=0)break;heap[i]=heap[p];i=p;}heap[i]=item;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&compare(heap[c+1],heap[c])<0)c++;if(compare(last,heap[c])<=0)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
    starts.forEach((ps,i)=>{const p=ps.at(-1),id=index(p),score=advance(ps),record={...score,id,p,key:id+':s'+i,previous:null,source:ps,priority:score.length+estimate(p)};best.set(record.key,record);push(record);});
    for(let visited=0;heap.length&&visited<20000;visited++){
      const current=pop();if(best.get(current.key)!==current)continue;if(bestScore&&compare(current,bestScore)>=0)return bestPath;
      if(goals.has(current.id)){const tail=[];let root=current;for(let r=current;r;r=r.previous){tail.push(r.p);root=r;}consider([...root.source,...tail.reverse().slice(1),...goals.get(current.id).slice().reverse().slice(1)]);}
      const x=current.id%width,y=Math.floor(current.id/width);
      for(const [dir,[nx,ny]] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].entries()){if(nx<0||nx>=X.length||ny<0||ny>=Y.length)continue;const p={x:X[nx],y:Y[ny]};if(!clear(current.p,p))continue;const id=ny*width+nx,key=id+':'+dir,score=advance([current.p,p],current),old=best.get(key);if(!better(score,old))continue;const record={...score,id,p,key,previous:current,priority:score.length+estimate(p)};best.set(key,record);push(record);}
    }
    return bestPath;
  }
  function route(aEnd,bEnd,state,ignoreWire=null,directOnly=false){
    const a=anchor(aEnd,state),b=anchor(bEnd,state),boxes=state.nodes.map(n=>({id:n.id,x:n.x-ROUTE_CLEARANCE,y:n.y-ROUTE_CLEARANCE,w:size(n,state.definitions).w+2*ROUTE_CLEARANCE,h:size(n,state.definitions).h+2*ROUTE_CLEARANCE}));
    const segments=state.wires.filter(w=>w.id!==ignoreWire).flatMap(w=>{const ps=points(w,state);return ps.slice(1).map((b,i)=>({a:ps[i],b}));});
    const overlap=segmentsOverlap;
    const clear=(p,q,owner=null)=>!segments.some(s=>overlap(p,q,s.a,s.b))&&!boxes.some(r=>r.id!==owner&&segmentHitsBox(p,q,r));
    const leads=(end,p)=>{const usable=routePortExits(end,p,state,boxes,clear);if(usable.length||!end.node)return usable;
      const n=state.nodes.find(n=>n.id===end.node),angle=(n.rotation||0)*Math.PI/180,sign=end.dir==='out'?1:-1,dx=Math.round(Math.cos(angle))*sign,dy=Math.round(Math.sin(angle))*sign;
      // Distinct angled exits keep dense fanout connected without shared strokes.
      for(let offset=1;offset<=256&&usable.length<4;offset++)for(const side of [-1,1]){const q={x:p.x+dx*ROUTE_CLEARANCE-dy*offset*side,y:p.y+dy*ROUTE_CLEARANCE+dx*offset*side};if(clear(p,q,end.node))usable.push([p,q]);}return usable;
    };
    // A clear straight connector needs no lead-and-return detour, even between close ports.
    if(!segments.some(s=>overlap(a,b,s.a,s.b))&&!state.nodes.some(n=>segmentHitsBox(a,b,{...n,...size(n,state.definitions)}))&&!boxes.some(r=>r.id!==aEnd.node&&r.id!==bEnd.node&&segmentHitsBox(a,b,r)))return [{x:a.x,y:a.y},{x:b.x,y:b.y}];
    if(directOnly)return null;
    if(distance(a,b)<=2*ROUTE_CLEARANCE){
      const outward=(end,p,q)=>{if(!end.node)return true;const n=state.nodes.find(n=>n.id===end.node),angle=(n.rotation||0)*Math.PI/180,sign=end.dir==='out'?1:-1,dx=Math.round(Math.cos(angle))*sign,dy=Math.round(Math.sin(angle))*sign;return (q.x-p.x)*dx+(q.y-p.y)*dy>0&&Math.abs((q.x-p.x)*dy-(q.y-p.y)*dx)<1e-7;};
      const candidates=[[a,{x:b.x,y:a.y},b],[a,{x:a.x,y:b.y},b],[a,{x:(a.x+b.x)/2,y:a.y},{x:(a.x+b.x)/2,y:b.y},b],[a,{x:a.x,y:(a.y+b.y)/2},{x:b.x,y:(a.y+b.y)/2},b]];
      for(const ps of candidates.sort((p,q)=>p.length-q.length)){if(!outward(aEnd,a,ps[1])||!outward(bEnd,b,ps.at(-2)))continue;if(ps.slice(1).every((q,i)=>!segments.some(s=>overlap(ps[i],q,s.a,s.b))&&!state.nodes.some(n=>segmentHitsBox(ps[i],q,{...n,...size(n,state.definitions)}))&&!boxes.some(r=>r.id!==aEnd.node&&r.id!==bEnd.node&&segmentHitsBox(ps[i],q,r))))return ps.map(p=>({x:p.x,y:p.y}));}
    }
    const starts=leads(aEnd,a),ends=leads(bEnd,b);if(!starts.length||!ends.length)return leastOverlapRoute(aEnd,bEnd,state,ignoreWire);
    const A=starts[0].at(-1),B=ends[0].at(-1);
    const clean=ps=>{const out=[];for(const p of ps){const q=out.at(-1);if(q&&q.x===p.x&&q.y===p.y)continue;while(out.length>1){const u=out.at(-2),v=out.at(-1);if((u.x===v.x&&v.x===p.x&&(v.y-u.y)*(p.y-v.y)>=0)||(u.y===v.y&&v.y===p.y&&(v.x-u.x)*(p.x-v.x)>=0))out.pop();else break;}out.push({x:p.x,y:p.y});}return out;};
    const complete=(start,ps,end)=>{const result=clean([...start,...ps,...end.slice().reverse()]);for(let i=1;i<result.length;i++){if(segments.some(s=>overlap(result[i-1],result[i],s.a,s.b)))return null;for(let j=1;j<i;j++)if(overlap(result[i-1],result[i],result[j-1],result[j]))return null;}return result;};
    const ys=[...new Set([...boxes.flatMap(r=>[r.y,r.y+r.h]),...segments.flatMap(s=>[s.a.y-12,s.a.y+12,s.b.y-12,s.b.y+12])])].sort((x,y)=>Math.abs(x-(A.y+B.y)/2)-Math.abs(y-(A.y+B.y)/2));
    const xs=[...new Set([...boxes.flatMap(r=>[r.x,r.x+r.w]),...segments.flatMap(s=>[s.a.x-12,s.a.x+12,s.b.x-12,s.b.x+12])])].sort((x,y)=>Math.abs(x-(A.x+B.x)/2)-Math.abs(y-(A.x+B.x)/2));
    for(const start of starts)for(const end of ends){const a=start.at(-1),b=end.at(-1),candidates=[[a,{x:b.x,y:a.y},b],[a,{x:a.x,y:b.y},b],[a,{x:(a.x+b.x)/2,y:a.y},{x:(a.x+b.x)/2,y:b.y},b]];
      for(const y of ys)candidates.push([a,{x:a.x,y},{x:b.x,y},b]);for(const x of xs)candidates.push([a,{x,y:a.y},{x,y:b.y},b]);
      for(const ps of candidates)if(ps.slice(1).every((p,i)=>clear(ps[i],p))){const result=complete(start,ps,end);if(result)return result;}
    }
    // Search all usable exits together. Failure must never invent an unchecked path.
    const tips=[...starts,...ends].map(ps=>ps.at(-1)),X=[...new Set([...tips.map(p=>p.x),...xs])].sort((a,b)=>a-b),Y=[...new Set([...tips.map(p=>p.y),...ys])].sort((a,b)=>a-b),width=X.length,index=p=>Y.indexOf(p.y)*width+X.indexOf(p.x),goals=new Map(ends.map(ps=>[index(ps.at(-1)),ps])),origins=new Map(),prev=new Map(),cost=new Map(),heap=[];
    const estimate=p=>Math.min(...ends.map(ps=>{const b=ps.at(-1);return Math.abs(p.x-b.x)+Math.abs(p.y-b.y);}));
    const priority=(a,b)=>a.f-b.f||b.g-a.g;
    const push=item=>{let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(priority(heap[p],item)<=0)break;heap[i]=heap[p];i=p;}heap[i]=item;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&priority(heap[c+1],heap[c])<0)c++;if(priority(last,heap[c])<=0)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
    for(const ps of starts){const p=ps.at(-1),id=index(p);origins.set(id,ps);prev.set(id,null);cost.set(id,0);push({id,g:0,f:estimate(p)});}
    for(let visited=0;heap.length&&visited<20000;visited++){
      const current=pop(),{id,g}=current;if(g!==cost.get(id))continue;const x=id%width,y=Math.floor(id/width),p={x:X[x],y:Y[y]};
      if(goals.has(id)){const ps=[];let start=id;for(let k=id;k!==null;k=prev.get(k)){start=k;ps.push({x:X[k%width],y:Y[Math.floor(k/width)]});}const result=complete(origins.get(start),ps.reverse(),goals.get(id));if(result)return result;}
      for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){if(nx<0||nx>=X.length||ny<0||ny>=Y.length)continue;const next=ny*width+nx,q={x:X[nx],y:Y[ny]},ng=g+Math.abs(p.x-q.x)+Math.abs(p.y-q.y);if(ng<(cost.get(next)??Infinity)&&clear(p,q)){cost.set(next,ng);prev.set(next,id);push({id:next,g:ng,f:ng+estimate(q)});}}
    }
    return leastOverlapRoute(aEnd,bEnd,state,ignoreWire);
  }
  function project(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return {x:a.x+t*dx,y:a.y+t*dy};}
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function nets(state){
    const ws=state.wires,parent=ws.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
    const allPorts=state.nodes.flatMap(n=>ports(n,state.definitions)),portByKey=new Map(allPorts.map(p=>[key(p),p])),owners=new Map(),free=[];
    const ends=ws.map((w,i)=>[w.a,w.b].map(e=>{if(!e.node){free.push({i,p:e});return e;}const k=key(e);if(owners.has(k))join(i,owners.get(k));else owners.set(k,i);return portByKey.get(k);}));
    const paths=ws.map((w,i)=>{const [a,b]=ends[i],x=(a.x+b.x)/2;return Array.isArray(w.via)?[a,...w.via,b]:[a,{x,y:a.y},{x,y:b.y},b];});
    // Only free endpoints can join the middle of another wire. Port-to-port
    // connections use the index above; mere path crossings stay separate.
    for(const {i,p} of free)for(let j=0;j<ws.length;j++)if(i!==j)for(let k=1;k<paths[j].length;k++)if(distance(p,project(p,paths[j][k-1],paths[j][k]))<0.05){join(i,j);break;}
    const groups=new Map(),portNet=new Map(),wireNet=new Map();
    ws.forEach((w,i)=>{const id=find(i);if(!groups.has(id))groups.set(id,{id,drivers:new Map(),ports:new Map(),wires:[]});const g=groups.get(id);g.wires.push(w.id);wireNet.set(w.id,id);for(const e of [w.a,w.b])if(e.node){const k=key(e),p=portByKey.get(k);g.ports.set(k,p);portNet.set(k,id);if(e.dir==='out')g.drivers.set(k,p);}});
    // A free endpoint placed exactly on a port also attaches to it.
    for(const p of allPorts)for(const {i,p:e} of free)if(distance(e,p)<0.05){const g=groups.get(find(i)),k=key(p);g.ports.set(k,p);portNet.set(k,g.id);if(p.dir==='out')g.drivers.set(k,p);}
    return {groups,portNet,wireNet};
  }
  const tableCache=new WeakMap(),sharedTableCache=new Map();
  function compiledTables(defs){
    const signature=JSON.stringify(defs),cached=tableCache.get(defs);
    if(cached?.signature===signature)return cached.tables;
    let tables=sharedTableCache.get(signature);
    if(!tables){tables=new Map();tables.definitions=JSON.parse(signature);if(sharedTableCache.size>=4)sharedTableCache.delete(sharedTableCache.keys().next().value);sharedTableCache.set(signature,tables);}
    tableCache.set(defs,{signature,tables});return tables;
  }
  function tableFor(id,defs,tables,visiting=new Set()){
    defs=tables.definitions||defs;
    if(tables.has(id))return tables.get(id);
    const reject=reason=>{const result={eligible:false,reason};tables.set(id,result);return result;};
    if(visiting.has(id))return reject('循环依赖');
    const d=defs[id];if(!d)return reject('定义缺失');
    visiting.add(id);
    try{
      const registers=[];
      for(const n of d.nodes){
        if(n.type==='delay')registers.push({path:n.id,width:width(n)});
        else if(n.type==='custom'){
          const child=tableFor(n.def,defs,tables,visiting);if(!child.eligible)return reject(child.reason);
          for(const p of child.registers)registers.push({path:n.id+'/'+p.path,width:p.width});
        }
      }
      const local={nodes:d.nodes,wires:d.wires,definitions:defs},net=nets(local);
      for(const g of net.groups.values())if(new Set([...g.ports.values()].map(p=>p.width)).size>1)return reject('连接错误');
      const rows=new Map(),rowSizes=new Map();let cachedBytes=0;const inputBits=d.inputs.reduce((sum,p)=>sum+p.width,0),stateBits=registers.reduce((sum,p)=>sum+p.width,0),topologyCache=new Map(),scope='table:'+id;
      const table={eligible:true,inputBits,stateBits,registers,rows,get cachedBytes(){return cachedBytes;},lookup(ins,stored=[],stats){
        const state=registers.map((p,i)=>bitArray(stored[i]||0,p.width)),k=ins.map(bits=>bits.join('')).join('|')+'#'+state.map(bits=>bits.join('')).join('|');
        if(rows.has(k)){if(stats)stats.tableHits++;return rows.get(k);}
        if(stats)stats.tableMisses++;
        const memory=Object.fromEntries(registers.map((p,i)=>[scope+'/'+p.path,packBits(state[i])])),overrides=Object.fromEntries(d.inputs.map((p,i)=>[p.id,ins[i]]));
        const sim=simulate(local,overrides,1,{memory,scope,tables,topologyCache,stats,captureNext:true});
        const result={outputs:d.outputs.map(p=>sim.outputs[p.id]),next:registers.map(p=>sim.nextDelayState[scope+'/'+p.path]||0),issues:sim.issues};
        const bytes=2*(k.length+JSON.stringify(result).length);
        if(bytes<=4*1024*1024){while(rows.size>=4096||cachedBytes+bytes>4*1024*1024){const oldest=rows.keys().next().value;cachedBytes-=rowSizes.get(oldest);rows.delete(oldest);rowSizes.delete(oldest);}rows.set(k,result);rowSizes.set(k,bytes);cachedBytes+=bytes;}return result;
      }};
      tables.set(id,table);
      // State tables stay sparse even when small; no exponential register enumeration.
      if(!stateBits&&inputBits<=8)for(let row=0;row<2**inputBits;row++){let offset=0;table.lookup(d.inputs.map(p=>{const bits=Array.from({length:p.width},(_,i)=>Math.floor(row/2**(offset+i))%2);offset+=p.width;return bits;}));}
      return table;
    }finally{visiting.delete(id);}
  }
  function lookupState(table,ins,scope,context){return table.lookup(ins,table.registers.map(p=>context.memory[scope+'/'+p.path]||0),context.stats);}
  function definitionInfo(id,defs){const table=tableFor(id,defs,compiledTables(defs));return table.eligible?{method:'truth-table',inputBits:table.inputBits,cachedRows:table.rows.size,...(table.stateBits?{stateBits:table.stateBits,cachedBytes:table.cachedBytes}:{})}:{method:'circuit',reason:table.reason};}
  function createSimulationContext(state){return {tables:compiledTables(state.definitions||{}),topologyCache:new Map()};}
  function createSimulator(){
    let signature=null,session;
    const run=state=>{
      const next=JSON.stringify(state.definitions||{});
      if(next!==signature){signature=next;session={topologies:new Map(),results:new Map(),tables:compiledTables(state.definitions||{})};}
      if(state.definitions)tableCache.set(state.definitions,{signature,tables:session.tables});
      run.stats={topologyBuilds:0,cacheHits:0,nodeEvaluations:0,tableHits:0,tableMisses:0,scopes:[]};
      const memory=state.delayState||{},memories=new Map();
      for(const [path,value] of Object.entries(memory)){const parts=path.split('/');for(let i=1;i<parts.length;i++){const scope=parts.slice(0,i).join('/');if(!memories.has(scope))memories.set(scope,[]);memories.get(scope).push([path.slice(scope.length),value]);}}
      return simulate(state,{},0,{memory,scope:'root',session,memories,stats:run.stats,tables:session.tables});
    };
    run.stats={};return run;
  }
  function simulationTopology(state,context){
    const signature=JSON.stringify([state.nodes.map(({value,...n})=>n),state.wires]),cache=context.topologyCache||context.session?.topologies;
    if(cache?.has(signature))return {signature,...cache.get(signature)};
    const net=nets(state),ps=new Map(state.nodes.map(n=>[n.id,ports(n,state.definitions)])),deps=new Map(),followers=new Map();
    for(const n of state.nodes){const dependencies=new Set();if(!['input','delay'].includes(n.type))for(const p of ps.get(n.id).filter(p=>p.dir==='in')){const g=net.groups.get(net.portNet.get(key(p)));if(g&&[...g.ports.values()].every(q=>q.width===p.width))for(const driver of g.drivers.values())dependencies.add(driver.node);}deps.set(n.id,dependencies);for(const id of dependencies){if(!followers.has(id))followers.set(id,[]);followers.get(id).push(n.id);}}
    const order=state.nodes.filter(n=>!deps.get(n.id).size).map(n=>n.id);
    for(let head=0;head<order.length;head++)for(const id of followers.get(order[head])||[]){const d=deps.get(id);d.delete(order[head]);if(!d.size)order.push(id);}
    const topology={net,ps,order:order.length===state.nodes.length?order:null};
    if(context.stats)context.stats.topologyBuilds++;
    if(cache){if(cache.size>=128)cache.clear();cache.set(signature,topology);}
    return {signature,...topology};
  }
  function simulate(state,overrides={},depth=0,context={memory:state.delayState||{},scope:'root'}){
    if(depth>MAX_DEPTH)throw Error('自定义门嵌套过深');
    const defs=state.definitions||{},topology=simulationTopology(state,context),{net,ps}=topology,issues=new Set(),values={},outputs={};
    const scopedOverrides=context.scopedOverrides||state.scopedWireOverrides||{},scopeKeys=Object.keys(scopedOverrides),blocked=scope=>scopeKeys.some(path=>path===scope||path.startsWith(scope+'/'));
    context={...context,scopedOverrides};
    const resultKey=context.session&&JSON.stringify([topology.signature,overrides,state.nodes.filter(n=>n.type==='input').map(n=>[n.id,n.value||0]),context.memories.get(context.scope)||[],context.scope==='root'?state.wireOverrides||{}:{},scopeKeys.filter(path=>path===context.scope||path.startsWith(context.scope+'/')).map(path=>[path,scopedOverrides[path]])]);
    const cached=context.session?.results.get(context.scope);
    if(cached&&cached.key===resultKey){context.stats.cacheHits++;return cached.result;}
    if(context.stats)context.stats.scopes.push(context.scope);
    const tables=context.useTruthTables===false?null:(context.tables||compiledTables(defs));
    const forced=new Map();for(const [id,bits] of Object.entries(context.scope==='root'?{...(state.wireOverrides||{}),...(scopedOverrides.root||{})}:scopedOverrides[context.scope]||{})){const group=net.wireNet.get(id);if(group!==undefined)forced.set(group,bits);}
    const low=w=>Array(w).fill(0);
    for(const n of state.nodes)values[n.id]=spec(n,defs).outputs.map(low);
    for(const g of net.groups.values()){
      if(new Set([...g.ports.values()].map(p=>p.width)).size>1)issues.add('导线两端位宽不一致，请使用集线器或分线器');
    }
    function read(p,prev){const id=net.portNet.get(key(p));if(id===undefined)return low(p.width);if(forced.has(id))return bitArray(packBits(forced.get(id)),p.width);const g=net.groups.get(id);if([...g.ports.values()].some(q=>q.width!==p.width))return low(p.width);if(g.drivers.size===1){const d=g.drivers.values().next().value;return prev[d.node]?.[d.port]||low(p.width);}const result=low(p.width);for(const d of g.drivers.values()){const bits=prev[d.node]?.[d.port];if(bits)for(let i=0;i<p.width;i++)result[i]|=bits[i]||0;}return result;}
    let current=values,settled=false;
    const byId=new Map(state.nodes.map(n=>[n.id,n])),ordered=topology.order&&context.useTopological!==false?topology.order.map(id=>byId.get(id)):null;
    for(let step=0;step<(ordered?1:Math.min(state.nodes.length+4,512));step++){
      const next={};
      for(const n of ordered||state.nodes){
        if(context.stats)context.stats.nodeEvaluations++;
        const ins=ps.get(n.id).filter(p=>p.dir==='in').map(p=>read(p,ordered?next:current));
        if(n.type==='input')next[n.id]=[overrides[n.id]||bitArray(n.value||0,width(n))];
        else if(n.type==='output')next[n.id]=[];
        else if(n.type==='delay')next[n.id]=[bitArray(context.memory[context.scope+'/'+n.id]||0,width(n))];
        else if(n.type==='nand')next[n.id]=[[1-(ins[0][0]&ins[1][0])]];
        else if(n.type==='hub')next[n.id]=[ins.map(v=>v[0])];
        else if(n.type==='splitter')next[n.id]=ins[0].map(v=>[v]);
        else {const d=defs[n.def],table=tables&&tableFor(n.def,defs,tables);if(table?.eligible&&!blocked(context.scope+'/'+n.id)){const row=lookupState(table,ins,context.scope+'/'+n.id,context);next[n.id]=row.outputs;row.issues.forEach(x=>issues.add(x));}else{const input={};d.inputs.forEach((p,i)=>input[p.id]=ins[i]);const sub=simulate({nodes:d.nodes,wires:d.wires,definitions:defs},input,depth+1,{...context,tables,memory:context.memory,scope:context.scope+'/'+n.id,captureNext:false});next[n.id]=d.outputs.map(p=>sub.outputs[p.id]);sub.issues.forEach(x=>issues.add(x));}}
      }
      if(ordered||JSON.stringify(next)===JSON.stringify(current)){current=next;settled=true;break;}current=next;
    }
    if(!settled){issues.add('电路未收敛，请检查反馈回路；计算元件输出已设为低电平');for(const n of state.nodes)if(!['input','delay'].includes(n.type))current[n.id]=spec(n,defs).outputs.map(low);}
    for(const n of state.nodes)if(n.type==='output')outputs[n.id]=read(ps.get(n.id)[0],current);
    const wires={},portValues={};
    for(const n of state.nodes)for(const p of ps.get(n.id))portValues[key(p)]=p.dir==='out'&&!forced.has(net.portNet.get(key(p)))?current[n.id][p.port]:read(p,current);
    for(const w of state.wires){const g=net.groups.get(net.wireNet.get(w.id));const p=[...g.ports.values()][0];wires[w.id]=forced.get(g.id)||(p?read(p,current):[0]);}
    const definitionModes={};if(depth===0&&tables)for(const id of Object.keys(defs)){const table=tableFor(id,defs,tables);definitionModes[id]=table.eligible?(table.stateBits?'状态真值表':'真值表'):table.reason;}
    const result={values:current,outputs,wires,portValues,issues:[...issues],definitionModes,forcedWires:state.wires.filter(w=>forced.has(net.wireNet.get(w.id))).map(w=>w.id)};
    if(context.captureNext){
      const nextDelayState={};
      for(const n of state.nodes){
        const ins=ps.get(n.id).filter(p=>p.dir==='in').map(p=>read(p,current)),scope=context.scope+'/'+n.id;
        if(n.type==='delay')nextDelayState[scope]=packBits(ins[0]);
        else if(n.type==='custom'){
          const d=defs[n.def],table=tables&&tableFor(n.def,defs,tables);
          if(table?.eligible&&!blocked(scope)){if(!table.registers.length)continue;const row=lookupState(table,ins,scope,context);table.registers.forEach((p,i)=>nextDelayState[scope+'/'+p.path]=row.next[i]);}
          else {const input=Object.fromEntries(d.inputs.map((p,i)=>[p.id,ins[i]])),sub=simulate({nodes:d.nodes,wires:d.wires,definitions:defs},input,depth+1,{...context,tables,scope,captureNext:true});Object.assign(nextDelayState,sub.nextDelayState);}
        }
      }
      result.nextDelayState=nextDelayState;
    }
    if(context.session){if(context.session.results.size>=4096)context.session.results.clear();context.session.results.set(context.scope,{key:resultKey,result});}
    return result;
  }
  // Every transition row is sampled from the same old register values.
  function step(state){return simulate(state,{},0,{memory:state.delayState||{},scope:'root',captureNext:true}).nextDelayState;}
  function resetDelays(state,mode='all',visible=null){
    if(mode==='all')return {};
    if(mode!=='partial')throw Error('未知清零模式');
    const defs=state.definitions||{},counts=new Map(),visiting=new Set(),exact=new Set(),subtrees=new Set();
    // Only 0, 1 or more-than-1 matters. Count definitions once, not expanded instances.
    function count(id){
      if(counts.has(id))return counts.get(id);if(visiting.has(id))throw Error('自定义门循环依赖');
      const d=defs[id];if(!d)throw Error('自定义门不存在');visiting.add(id);let total=0;
      for(const n of d.nodes){if(n.type==='delay')total++;else if(n.type==='custom')total+=count(n.def);if(total>1){total=2;break;}}
      visiting.delete(id);counts.set(id,total);return total;
    }
    for(const n of visible||state.nodes){const path=(n.scope||'root')+'/'+n.id;if(n.type==='delay')exact.add(path);else if(n.type==='custom'&&count(n.def)===1)subtrees.add(path);}
    return Object.fromEntries(Object.entries(state.delayState||{}).filter(([path])=>{
      if(exact.has(path))return false;for(let i=path.indexOf('/',5);i>=0;i=path.indexOf('/',i+1))if(subtrees.has(path.slice(0,i)))return false;return true;
    }));
  }
  function delayTarget(state,path){
    const parts=String(path).split('/');if(parts.shift()!=='root'||parts.some(p=>!p))throw Error('延迟线实例路径无效');
    let nodes=state.nodes,node=null;const names=[];
    for(let i=0;i<parts.length;i++){
      node=nodes.find(n=>n.id===parts[i]);if(!node)throw Error('元件实例已不存在');
      names.push(node.label||(node.type==='custom'?state.definitions[node.def]?.name:node.type==='delay'?'延迟线':'元件'));
      if(i<parts.length-1){if(node.type!=='custom'||!state.definitions[node.def])throw Error('延迟线实例路径无效');nodes=state.definitions[node.def].nodes;}
    }
    return {node,names};
  }
  function delayRegisters(state,scope='root',offset=0,limit=50){
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<0||limit>1000000)throw Error('分页参数无效');
    if(limit===0)limit=Infinity;
    const defs=state.definitions||{},memo=new Map(),visiting=new Set(),items=[];let skip=offset;
    function countNode(n){if(n.type==='delay')return 1;if(n.type!=='custom')return 0;if(memo.has(n.def))return memo.get(n.def);if(visiting.has(n.def))throw Error('自定义门循环依赖');const d=defs[n.def];if(!d)throw Error('自定义门不存在');visiting.add(n.def);const count=d.nodes.reduce((sum,n)=>sum+countNode(n),0);visiting.delete(n.def);memo.set(n.def,count);return count;}
    function visit(n,path,names){const count=countNode(n);if(!count||items.length>=limit)return;if(skip>=count){skip-=count;return;}if(n.type==='delay'){const bits=width(n);items.push({path,label:names.join(' / '),width:bits,value:packBits(bitArray(state.delayState?.[path]||0,bits))});}else for(const child of defs[n.def].nodes){visit(child,path+'/'+child.id,[...names,child.label||(child.type==='custom'?defs[child.def]?.name:child.type==='delay'?'延迟线':'元件')]);if(items.length>=limit)break;}}
    if(scope==='root'){const total=state.nodes.reduce((sum,n)=>sum+countNode(n),0);for(const n of state.nodes){visit(n,'root/'+n.id,[n.label||(n.type==='custom'?defs[n.def]?.name:'延迟线')]);if(items.length>=limit)break;}return {total,items};}
    const {node,names}=delayTarget(state,scope),total=countNode(node);visit(node,scope,names);return {total,items};
  }
  function setDelayValue(state,path,bits){
    const {node}=delayTarget(state,path);if(node?.type!=='delay'||!Array.isArray(bits)||bits.length!==width(node)||bits.some(bit=>bit!==0&&bit!==1))throw Error('延迟线数值或位宽无效');
    if(path.length>1200||!Object.hasOwn(state.delayState||{},path)&&Object.keys(state.delayState||{}).length>=5000)throw Error('延迟状态超过存档限制');
    return {...state.delayState,[path]:packBits(bits)};
  }
  function countComponents(state){
    // Cache one definition's composition, then add it again for EVERY placed instance.
    const memo=new Map(),visiting=new Set(),defs=state.definitions||{};
    function count(nodes){const total={nand:0,delay:0,hub:0,splitter:0};for(const n of nodes){if(Object.hasOwn(total,n.type))total[n.type]++;else if(n.type==='custom'){if(!memo.has(n.def)){if(visiting.has(n.def))throw Error('自定义门循环依赖');visiting.add(n.def);memo.set(n.def,count(defs[n.def].nodes));visiting.delete(n.def);}const sub=memo.get(n.def);for(const type of Object.keys(total))total[type]+=sub[type];}}return total;}
    return count(state.nodes);
  }
  function createComponentCounter(){
    const entries=new Map();let rootKey=null,rootCounts,knownDefinitions=new Map();const blank=()=>({nand:0,delay:0,hub:0,splitter:0});
    const count=state=>{
      count.stats={definitionsBuilt:0,rootBuilt:0};const defs=state.definitions||{},visiting=new Set(),resolved=new Map(),changed=knownDefinitions.size!==Object.keys(defs).length||Object.entries(defs).some(([id,d])=>knownDefinitions.get(id)!==d);
      if(changed)for(const entry of entries.values())entry.dirty=true;
      const composition=nodes=>JSON.stringify(nodes.map(n=>n.type==='custom'?['custom',n.def]:[n.type]));
      function definition(id){
        if(entries.has(id)&&!entries.get(id).dirty)return entries.get(id);
        if(resolved.has(id))return resolved.get(id);if(visiting.has(id))throw Error('自定义门循环依赖');
        const d=defs[id];if(!d)throw Error('自定义门不存在');visiting.add(id);
        let entry=entries.get(id);
        if(entry?.definition!==d){const signature=composition(d.nodes);entry={...entry,definition:d,signature,types:d.nodes.map(n=>[n.type,n.def])};entries.set(id,entry);}
        const children=entry.types.filter(([type])=>type==='custom').map(([,child])=>definition(child));
        const key=entry.signature+'|'+children.map(c=>c.revision).join(',');
        if(entry.key!==key){const counts=blank();let i=0;for(const [type] of entry.types){if(type==='custom'){const child=children[i++].counts;for(const k of Object.keys(counts))counts[k]+=child[k];}else if(Object.hasOwn(counts,type))counts[type]++;}entry.key=key;entry.counts=counts;entry.revision=(entry.revision||0)+1;count.stats.definitionsBuilt++;}
        entry.dirty=false;visiting.delete(id);resolved.set(id,entry);return entry;
      }
      const children=state.nodes.filter(n=>n.type==='custom').map(n=>definition(n.def));
      const nextKey=composition(state.nodes)+'|'+children.map(c=>c.revision).join(',');
      if(nextKey!==rootKey){rootCounts=blank();let i=0;for(const n of state.nodes){if(n.type==='custom'){for(const k of Object.keys(rootCounts))rootCounts[k]+=children[i].counts[k];i++;}else if(Object.hasOwn(rootCounts,n.type))rootCounts[n.type]++;}rootKey=nextKey;count.stats.rootBuilt++;}
      for(const id of entries.keys())if(!Object.hasOwn(defs,id))entries.delete(id);
      knownDefinitions=new Map(Object.entries(defs));
      return {...rootCounts};
    };
    count.invalidate=()=>{entries.clear();knownDefinitions=new Map();rootKey=null;};count.stats={};return count;
  }
  function makeDefinition(state,name){
    name=String(name).trim();if(!name||name.length>24)throw Error('名称请输入 1–24 个字');
    const sorted=state.nodes.slice().sort((a,b)=>a.y-b.y||a.x-b.x||a.id.localeCompare(b.id));
    const portsFor=type=>sorted.filter(n=>n.type===type).map((n,i)=>({id:n.id,label:n.label||(type==='input'?'I':'O')+(i+1),width:width(n)}));
    const inputs=portsFor('input'),outputs=portsFor('output');
    if(inputs.length>16||outputs.length>16)throw Error('封装最多支持 16 个输入和 16 个输出');
    return {name,inputs,outputs,nodes:clone(state.nodes),wires:clone(state.wires)};
  }
  function updateDefinition(root,id,edited){
    const next=clone(root),old=next.definitions[id];if(!old)throw Error('自定义门不存在');
    const updated={...old,...makeDefinition(edited,old.name)};
    for(const dir of ['inputs','outputs']){const pending=new Map(updated[dir].map(p=>[p.id,p])),ordered=[];for(const p of old[dir])if(pending.has(p.id)){ordered.push(pending.get(p.id));pending.delete(p.id);}updated[dir]=ordered.concat([...pending.values()]);}
    next.definitions[id]=updated;
    for(const local of [next,...Object.values(next.definitions)]){
      const targets=new Set(local.nodes.filter(n=>n.type==='custom'&&n.def===id).map(n=>n.id));
      local.wires=local.wires.filter(w=>{for(const e of [w.a,w.b])if(targets.has(e.node)){const dir=e.dir==='in'?'inputs':'outputs',port=old[dir][e.port],index=updated[dir].findIndex(p=>p.id===port?.id);if(index<0)return false;e.port=index;}return true;});
    }
    for(const [path,value] of Object.entries(next.delayState||{})){let local=next,n;const parts=path.split('/').slice(1);for(let i=0;i<parts.length;i++){n=local.nodes.find(n=>n.id===parts[i]);if(!n)break;if(i<parts.length-1){if(n.type!=='custom'){n=null;break;}local=next.definitions[n.def];}}if(n?.type==='delay')next.delayState[path]=packBits(bitArray(value,width(n)));else delete next.delayState[path];}
    validate(next);
    for(const local of [next,...Object.values(next.definitions)]){const active={...local,definitions:next.definitions};for(const w of local.wires)if(w.autoRoute&&[w.a,w.b].some(e=>local.nodes.some(n=>n.id===e.node&&n.type==='custom'&&n.def===id))){const routed=route(w.a,w.b,active,w.id);if(routed)w.via=routed.slice(1,-1);}}
    return next;
  }
  function pruneDefinitions(state){
    const defs=state.definitions,keep=new Set();
    function visit(id){if(keep.has(id))return;if(!Object.hasOwn(defs,id))throw Error('自定义门不存在');keep.add(id);for(const n of defs[id].nodes)if(n.type==='custom')visit(n.def);}
    for(const id of Object.keys(defs))if(!defs[id].hidden)visit(id);
    for(const n of state.nodes)if(n.type==='custom')visit(n.def);
    return Object.fromEntries(Object.entries(defs).filter(([id])=>keep.has(id)));
  }
  function deleteDefinition(state,id){
    if(!Object.hasOwn(state.definitions,id))throw Error('自定义门不存在');
    const next=clone(state);next.definitions[id].hidden=true;next.definitions=pruneDefinitions(next);return next;
  }
  function validate(raw){
    const fail=()=>{throw Error('电路文件无效或不兼容，请检查格式、端口和自定义门');};
    if(raw?.displayFormat!==undefined&&!DISPLAY_FORMATS.includes(raw.displayFormat))fail();
    if(!raw||raw.version!==1||!Array.isArray(raw.nodes)||!Array.isArray(raw.wires)||!raw.definitions||typeof raw.definitions!=='object'||Array.isArray(raw.definitions))fail();
    const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
    if(raw.wireOverrides!==undefined&&(!raw.wireOverrides||typeof raw.wireOverrides!=='object'||Array.isArray(raw.wireOverrides)||Object.keys(raw.wireOverrides).length>1500||Object.entries(raw.wireOverrides).some(([id,bits])=>!safeId(id)||!Array.isArray(bits)||!bits.length||bits.length>MAX_BITS||bits.some(b=>b!==0&&b!==1))))fail();
    if(raw.scopedWireOverrides!==undefined){const entries=Object.entries(raw.scopedWireOverrides||{});if(!raw.scopedWireOverrides||typeof raw.scopedWireOverrides!=='object'||Array.isArray(raw.scopedWireOverrides)||entries.length>5000)fail();for(const [scope,ws] of entries)if(scope.length>2800||scope!=='root'&&!scope.startsWith('root/')||!scope.split('/').every(safeId)||!ws||typeof ws!=='object'||Array.isArray(ws)||Object.entries(ws).some(([id,bits])=>!safeId(id)||!Array.isArray(bits)||!bits.length||bits.length>MAX_BITS||bits.some(b=>b!==0&&b!==1)))fail();}
    const validValue=(v,bits)=>typeof v==='string'?/^[01]+$/.test(v)&&v.length<=bits:Number.isSafeInteger(v)&&v>=0&&v<2**bits;
    if(raw.delayState!==undefined&&(!raw.delayState||typeof raw.delayState!=='object'||Array.isArray(raw.delayState)||Object.keys(raw.delayState).length>5000||Object.entries(raw.delayState).some(([k,v])=>k.length>1200||!k.startsWith('root/')||!k.split('/').every(safeId)||!validValue(v,MAX_BITS))))fail();
    const finite=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e9;
    const label=x=>x===undefined||(typeof x==='string'&&x.length<=24);
    const defs=raw.definitions,ids=Object.keys(defs);if(ids.length>80||ids.some(id=>!safeId(id)))fail();
    function circuit(s){
      if(!Array.isArray(s.nodes)||!Array.isArray(s.wires)||s.nodes.length>500||s.wires.length>1500)fail();
      if(s.nodes.some(n=>n&&n.displayFormat!==undefined&&!DISPLAY_FORMATS.includes(n.displayFormat)))fail();
      const nodeIds=new Set(),wireIds=new Set();
      for(const n of s.nodes){if(!n||!safeId(n.id)||nodeIds.has(n.id)||!types.includes(n.type)||!finite(n.x)||!finite(n.y)||!label(n.label))fail();nodeIds.add(n.id);if(n.rotation!==undefined&&![0,90,180,270].includes(n.rotation))fail();if(n.bits!==undefined&&(!Number.isInteger(n.bits)||n.bits<1||n.bits>MAX_BITS))fail();if(['hub','splitter'].includes(n.type)&&width(n)<2)fail();if(n.value!==undefined&&!validValue(n.value,width(n)))fail();if(n.type==='custom'&&(!safeId(n.def)||!Object.hasOwn(defs,n.def)))fail();}
      for(const w of s.wires){if(!w||!safeId(w.id)||wireIds.has(w.id))fail();wireIds.add(w.id);for(const e of [w.a,w.b]){if(!e||typeof e!=='object')fail();if(e.node){if(!nodeIds.has(e.node)||!['in','out'].includes(e.dir)||!Number.isInteger(e.port)||e.port<0)fail();const n=s.nodes.find(n=>n.id===e.node);let ps;try{ps=spec(n,defs);}catch{fail();}if(e.port>=ps[e.dir==='in'?'inputs':'outputs'].length)fail();}else if(!finite(e.x)||!finite(e.y))fail();}if(w.via!==undefined&&(!Array.isArray(w.via)||w.via.length>100||w.via.some(p=>!finite(p.x)||!finite(p.y))))fail();}
    }
    for(const id of ids){const d=defs[id];if(!d||!label(d.name)||!d.name||(d.hidden!==undefined&&typeof d.hidden!=='boolean')||!Array.isArray(d.inputs)||!Array.isArray(d.outputs)||!Array.isArray(d.nodes))fail();for(const [ps,type] of [[d.inputs,'input'],[d.outputs,'output']]){if(ps.length>16||ps.some(p=>!p)||new Set(ps.map(p=>p.id)).size!==ps.length)fail();for(const p of ps){const n=d.nodes.find(n=>n.id===p.id);if(!n||n.type!==type||p.width!==width(n)||typeof p.label!=='string'||!p.label||!label(p.label))fail();}if(d.nodes.filter(n=>n.type===type).length!==ps.length)fail();}}
    let total=raw.nodes.length;for(const id of ids){circuit(defs[id]);total+=defs[id].nodes.length;}if(total>5000)fail();circuit(raw);
    for(const [path,value] of Object.entries(raw.delayState||{})){let local=raw,n;const parts=path.split('/').slice(1);for(let i=0;i<parts.length;i++){n=local.nodes.find(n=>n.id===parts[i]);if(!n)break;if(i<parts.length-1){if(n.type!=='custom'){n=null;break;}local=defs[n.def];}}if(n?.type==='delay'&&!validValue(value,width(n)))fail();}
    const visiting=new Set(),memo=new Map();function visit(id){if(visiting.has(id))fail();if(memo.has(id))return memo.get(id);visiting.add(id);let depth=1,cost=defs[id].nodes.length;for(const n of defs[id].nodes)if(n.type==='custom'){const sub=visit(n.def);depth=Math.max(depth,1+sub.depth);cost+=sub.cost;}if(depth>MAX_DEPTH||cost>1000000)fail();visiting.delete(id);const result={depth,cost};memo.set(id,result);return result;}ids.forEach(visit);let cost=raw.nodes.length;for(const n of raw.nodes)if(n.type==='custom')cost+=visit(n.def).cost;if(cost>1000000)fail();
    if(raw.camera&&(!finite(raw.camera.x)||!finite(raw.camera.y)||!Number.isFinite(raw.camera.scale)||raw.camera.scale<0.2||raw.camera.scale>2.5))fail();
    return clone(raw);
  }
  return {clone,spec,baseSize,size,rotatedPoint,rotationTransform,ports,key,anchor,points,route,wireOverlaps,wireHitsGate,project,distance,nets,simulate,createSimulator,createSimulationContext,step,resetDelays,delayRegisters,setDelayValue,definitionInfo,countComponents,createComponentCounter,makeDefinition,updateDefinition,pruneDefinitions,deleteDefinition,validate,bitArray,packBits,decimal,formatValue,parseSignal,DISPLAY_FORMATS,MAX_BITS,MAX_DEPTH};
});
