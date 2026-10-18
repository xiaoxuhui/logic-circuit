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
  function points(w,state){const a=anchor(w.a,state),b=anchor(w.b,state);if(w.via?.length)return [a,...w.via,b];const x=(a.x+b.x)/2;return [a,{x,y:a.y},{x,y:b.y},b];}
  function route(aEnd,bEnd,state,ignoreWire=null){
    const a=anchor(aEnd,state),b=anchor(bEnd,state),boxes=state.nodes.map(n=>({id:n.id,x:n.x-8,y:n.y-8,w:size(n,state.definitions).w+16,h:size(n,state.definitions).h+16}));
    const segments=state.wires.filter(w=>w.id!==ignoreWire).flatMap(w=>{const ps=points(w,state);return ps.slice(1).map((b,i)=>({a:ps[i],b}));});
    const overlap=(p,q,c,d)=>p.x===q.x&&c.x===d.x&&Math.abs(p.x-c.x)<.01?Math.min(Math.max(p.y,q.y),Math.max(c.y,d.y))-Math.max(Math.min(p.y,q.y),Math.min(c.y,d.y))>.01:p.y===q.y&&c.y===d.y&&Math.abs(p.y-c.y)<.01&&Math.min(Math.max(p.x,q.x),Math.max(c.x,d.x))-Math.max(Math.min(p.x,q.x),Math.min(c.x,d.x))>.01;
    const clear=(p,q,owner=null)=>!segments.some(s=>overlap(p,q,s.a,s.b))&&!boxes.some(r=>r.id!==owner&&(p.x===q.x?p.x>r.x&&p.x<r.x+r.w&&Math.max(p.y,q.y)>r.y&&Math.min(p.y,q.y)<r.y+r.h:p.y>r.y&&p.y<r.y+r.h&&Math.max(p.x,q.x)>r.x&&Math.min(p.x,q.x)<r.x+r.w));
    const lead=(end,p)=>{if(!end.node)return [p];const n=state.nodes.find(n=>n.id===end.node),angle=(n.rotation||0)*Math.PI/180,sign=end.dir==='out'?1:-1,dx=Math.round(Math.cos(angle))*sign,dy=Math.round(Math.sin(angle))*sign;const choices=[[p,{x:p.x+dx*20,y:p.y+dy*20}],...[ -20,20,-32,32].map(offset=>{const q={x:p.x-dy*offset,y:p.y+dx*offset};return [p,q,{x:q.x+dx*20,y:q.y+dy*20}];})];return choices.find(ps=>ps.slice(1).every((q,i)=>clear(ps[i],q,end.node)))||choices[0];};
    const aLead=lead(aEnd,a),bLead=lead(bEnd,b),A=aLead.at(-1),B=bLead.at(-1);
    const clean=ps=>{const out=[];for(const p of ps){const q=out.at(-1);if(q&&q.x===p.x&&q.y===p.y)continue;while(out.length>1){const u=out.at(-2),v=out.at(-1);if((u.x===v.x&&v.x===p.x)||(u.y===v.y&&v.y===p.y))out.pop();else break;}out.push({x:p.x,y:p.y});}return out;};
    const candidates=[[A,{x:(A.x+B.x)/2,y:A.y},{x:(A.x+B.x)/2,y:B.y},B],[A,{x:B.x,y:A.y},B],[A,{x:A.x,y:B.y},B]];
    const ys=[...new Set([...boxes.flatMap(r=>[r.y-12,r.y+r.h+12]),...segments.flatMap(s=>[s.a.y-12,s.a.y+12,s.b.y-12,s.b.y+12])])].sort((x,y)=>Math.abs(x-(A.y+B.y)/2)-Math.abs(y-(A.y+B.y)/2));
    const xs=[...new Set([...boxes.flatMap(r=>[r.x-12,r.x+r.w+12]),...segments.flatMap(s=>[s.a.x-12,s.a.x+12,s.b.x-12,s.b.x+12])])].sort((x,y)=>Math.abs(x-(A.x+B.x)/2)-Math.abs(y-(A.x+B.x)/2));
    for(const y of ys)candidates.push([A,{x:A.x,y},{x:B.x,y},B]);for(const x of xs)candidates.push([A,{x,y:A.y},{x,y:B.y},B]);
    for(const ps of candidates)if(ps.slice(1).every((p,i)=>clear(ps[i],p)))return clean([...aLead,...ps,...bLead.slice().reverse()]);
    const X=[...new Set([A.x,B.x,...xs])].sort((a,b)=>a-b),Y=[...new Set([A.y,B.y,...ys])].sort((a,b)=>a-b),width=X.length,start=Y.indexOf(A.y)*width+X.indexOf(A.x),goal=Y.indexOf(B.y)*width+X.indexOf(B.x),queue=[start],prev=new Map([[start,null]]);
    for(let head=0;head<queue.length&&head<20000;head++){const id=queue[head],x=id%width,y=Math.floor(id/width);if(id===goal){const ps=[];for(let k=id;k!==null;k=prev.get(k))ps.push({x:X[k%width],y:Y[Math.floor(k/width)]});return clean([...aLead,...ps.reverse(),...bLead.slice().reverse()]);}for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){if(nx<0||nx>=X.length||ny<0||ny>=Y.length)continue;const next=ny*width+nx;if(!prev.has(next)&&clear({x:X[x],y:Y[y]},{x:X[nx],y:Y[ny]})){prev.set(next,id);queue.push(next);}}}
    return clean([...aLead,...candidates[0],...bLead.slice().reverse()]);
  }
  function project(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return {x:a.x+t*dx,y:a.y+t*dy};}
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function nets(state){
    const ws=state.wires,parent=ws.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
    const allPorts=state.nodes.flatMap(n=>ports(n,state.definitions)),portByKey=new Map(allPorts.map(p=>[key(p),p])),owners=new Map(),free=[];
    const ends=ws.map((w,i)=>[w.a,w.b].map(e=>{if(!e.node){free.push({i,p:e});return e;}const k=key(e);if(owners.has(k))join(i,owners.get(k));else owners.set(k,i);return portByKey.get(k);}));
    const paths=ws.map((w,i)=>{const [a,b]=ends[i],x=(a.x+b.x)/2;return w.via?.length?[a,...w.via,b]:[a,{x,y:a.y},{x,y:b.y},b];});
    // Only free endpoints can join the middle of another wire. Port-to-port
    // connections use the index above; mere path crossings stay separate.
    for(const {i,p} of free)for(let j=0;j<ws.length;j++)if(i!==j)for(let k=1;k<paths[j].length;k++)if(distance(p,project(p,paths[j][k-1],paths[j][k]))<0.05){join(i,j);break;}
    const groups=new Map(),portNet=new Map(),wireNet=new Map();
    ws.forEach((w,i)=>{const id=find(i);if(!groups.has(id))groups.set(id,{id,drivers:new Map(),ports:new Map(),wires:[]});const g=groups.get(id);g.wires.push(w.id);wireNet.set(w.id,id);for(const e of [w.a,w.b])if(e.node){const k=key(e),p=portByKey.get(k);g.ports.set(k,p);portNet.set(k,id);if(e.dir==='out')g.drivers.set(k,p);}});
    // A free endpoint placed exactly on a port also attaches to it.
    for(const p of allPorts)for(const {i,p:e} of free)if(distance(e,p)<0.05){const g=groups.get(find(i)),k=key(p);g.ports.set(k,p);portNet.set(k,g.id);if(p.dir==='out')g.drivers.set(k,p);}
    return {groups,portNet,wireNet};
  }
  const tableCache=new WeakMap();
  function compiledTables(defs){
    const signature=JSON.stringify(defs),cached=tableCache.get(defs);
    if(cached?.signature===signature)return cached.tables;
    const tables=new Map();tableCache.set(defs,{signature,tables});return tables;
  }
  function tableFor(id,defs,tables,visiting=new Set()){
    if(tables.has(id))return tables.get(id);
    const reject=reason=>{const result={eligible:false,reason};tables.set(id,result);return result;};
    if(visiting.has(id))return reject('循环依赖');
    const d=defs[id];if(!d)return reject('定义缺失');
    visiting.add(id);
    try{
      if(d.nodes.some(n=>n.type==='delay'))return reject('含延迟线');
      const children=new Map();
      for(const n of d.nodes)if(n.type==='custom'){
        const child=tableFor(n.def,defs,tables,visiting);if(!child.eligible)return reject(child.reason);
        children.set(n.id,child);
      }
      const local={nodes:d.nodes,wires:d.wires,definitions:defs},net=nets(local),drivers=new Map();
      for(const g of net.groups.values()){
        if(g.drivers.size>1||new Set([...g.ports.values()].map(p=>p.width)).size>1)return reject('连接错误');
        const driver=[...g.drivers.values()][0];if(driver)for(const p of g.ports.values())if(p.dir==='in')drivers.set(key(p),driver);
      }
      const byId=new Map(d.nodes.map(n=>[n.id,n])),dependencies=new Map(),followers=new Map();
      for(const n of d.nodes){const deps=new Set(ports(n,defs).filter(p=>p.dir==='in').map(p=>drivers.get(key(p))?.node).filter(Boolean));dependencies.set(n.id,deps);for(const dep of deps){if(!followers.has(dep))followers.set(dep,[]);followers.get(dep).push(n.id);}}
      const queue=d.nodes.filter(n=>!dependencies.get(n.id).size),order=[];
      for(let head=0;head<queue.length;head++){const n=queue[head];order.push(n);for(const target of followers.get(n.id)||[]){const deps=dependencies.get(target);deps.delete(n.id);if(!deps.size)queue.push(byId.get(target));}}
      if(order.length!==d.nodes.length)return reject('循环依赖');
      const rows=new Map(),inputBits=d.inputs.reduce((sum,p)=>sum+p.width,0);
      const evaluate=ins=>{
        const values={},outputs={},inputs=new Map(d.inputs.map((p,i)=>[p.id,ins[i]]));
        for(const n of order){
          const incoming=ports(n,defs).filter(p=>p.dir==='in').map(p=>{const driver=drivers.get(key(p));return driver?values[driver.node][driver.port]:Array(p.width).fill(0);});
          if(n.type==='input')values[n.id]=[inputs.get(n.id)||bitArray(n.value||0,width(n))];
          else if(n.type==='output'){values[n.id]=[];outputs[n.id]=incoming[0];}
          else if(n.type==='nand')values[n.id]=[[1-(incoming[0][0]&incoming[1][0])]];
          else if(n.type==='hub')values[n.id]=[incoming.map(bits=>bits[0])];
          else if(n.type==='splitter')values[n.id]=incoming[0].map(bit=>[bit]);
          else values[n.id]=children.get(n.id).lookup(incoming);
        }
        return d.outputs.map(p=>outputs[p.id]);
      };
      const table={eligible:true,inputBits,rows,lookup(ins){const k=ins.map(bits=>bits.join('')).join('|');if(rows.has(k))return rows.get(k);const result=evaluate(ins);if(rows.size>=4096)rows.delete(rows.keys().next().value);rows.set(k,result);return result;}};
      tables.set(id,table);
      if(inputBits<=8)for(let row=0;row<2**inputBits;row++){let offset=0;table.lookup(d.inputs.map(p=>{const bits=Array.from({length:p.width},(_,i)=>Math.floor(row/2**(offset+i))%2);offset+=p.width;return bits;}));}
      return table;
    }finally{visiting.delete(id);}
  }
  function definitionInfo(id,defs){const table=tableFor(id,defs,compiledTables(defs));return table.eligible?{method:'truth-table',inputBits:table.inputBits,cachedRows:table.rows.size}:{method:'circuit',reason:table.reason};}
  function createSimulator(){
    let signature=null,session;
    const run=state=>{
      const next=JSON.stringify(state.definitions||{});
      if(next!==signature){signature=next;session={topologies:new Map(),results:new Map()};}
      run.stats={topologyBuilds:0,cacheHits:0,nodeEvaluations:0,scopes:[]};
      const memory=state.delayState||{},memories=new Map();
      for(const [path,value] of Object.entries(memory)){const parts=path.split('/');for(let i=1;i<parts.length;i++){const scope=parts.slice(0,i).join('/');if(!memories.has(scope))memories.set(scope,[]);memories.get(scope).push([path.slice(scope.length),value]);}}
      return simulate(state,{},0,{memory,scope:'root',session,memories,stats:run.stats});
    };
    run.stats={};return run;
  }
  function simulationTopology(state,context){
    const signature=JSON.stringify([state.nodes.map(({value,...n})=>n),state.wires]),cache=context.session?.topologies;
    if(cache?.has(signature))return {signature,...cache.get(signature)};
    const net=nets(state),ps=new Map(state.nodes.map(n=>[n.id,ports(n,state.definitions)])),deps=new Map(),followers=new Map();
    for(const n of state.nodes){const dependencies=new Set();if(!['input','delay'].includes(n.type))for(const p of ps.get(n.id).filter(p=>p.dir==='in')){const g=net.groups.get(net.portNet.get(key(p)));if(g?.drivers.size===1&&[...g.ports.values()].every(q=>q.width===p.width))dependencies.add([...g.drivers.values()][0].node);}deps.set(n.id,dependencies);for(const id of dependencies){if(!followers.has(id))followers.set(id,[]);followers.get(id).push(n.id);}}
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
    const resultKey=context.session&&JSON.stringify([topology.signature,overrides,state.nodes.filter(n=>n.type==='input').map(n=>[n.id,n.value||0]),context.memories.get(context.scope)||[],context.scope==='root'?state.wireOverrides||{}:{}]);
    const cached=context.session?.results.get(context.scope);
    if(cached&&cached.key===resultKey){context.stats.cacheHits++;return cached.result;}
    if(context.stats)context.stats.scopes.push(context.scope);
    const tables=context.useTruthTables===false?null:(context.tables||compiledTables(defs));
    const forced=new Map();if(context.scope==='root')for(const [id,bits] of Object.entries(state.wireOverrides||{})){const group=net.wireNet.get(id);if(group!==undefined)forced.set(group,bits);}
    const low=w=>Array(w).fill(0);
    for(const n of state.nodes)values[n.id]=spec(n,defs).outputs.map(low);
    for(const g of net.groups.values()){
      if(g.drivers.size>1)issues.add('一条网络连接了多个输出，请分开连线');
      if(new Set([...g.ports.values()].map(p=>p.width)).size>1)issues.add('导线两端位宽不一致，请使用集线器或分线器');
    }
    function read(p,prev){const id=net.portNet.get(key(p));if(id===undefined)return low(p.width);if(forced.has(id))return bitArray(packBits(forced.get(id)),p.width);const g=net.groups.get(id);if(g.drivers.size!==1||[...g.ports.values()].some(q=>q.width!==p.width))return low(p.width);const d=[...g.drivers.values()][0];return prev[d.node]?.[d.port]||low(p.width);}
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
        else {const d=defs[n.def],table=tables&&tableFor(n.def,defs,tables);if(table?.eligible)next[n.id]=table.lookup(ins);else{const input={};d.inputs.forEach((p,i)=>input[p.id]=ins[i]);const sub=simulate({nodes:d.nodes,wires:d.wires,definitions:defs},input,depth+1,{...context,tables,memory:context.memory,scope:context.scope+'/'+n.id});next[n.id]=d.outputs.map(p=>sub.outputs[p.id]);sub.issues.forEach(x=>issues.add(x));}}
      }
      if(ordered||JSON.stringify(next)===JSON.stringify(current)){current=next;settled=true;break;}current=next;
    }
    if(!settled){issues.add('电路未收敛，请检查反馈回路；计算元件输出已设为低电平');for(const n of state.nodes)if(!['input','delay'].includes(n.type))current[n.id]=spec(n,defs).outputs.map(low);}
    for(const n of state.nodes)if(n.type==='output')outputs[n.id]=read(ps.get(n.id)[0],current);
    const wires={},portValues={};
    for(const n of state.nodes)for(const p of ps.get(n.id))portValues[key(p)]=p.dir==='out'&&!forced.has(net.portNet.get(key(p)))?current[n.id][p.port]:read(p,current);
    for(const w of state.wires){const g=net.groups.get(net.wireNet.get(w.id));const p=[...g.ports.values()][0];wires[w.id]=forced.get(g.id)||(p?read(p,current):[0]);}
    const definitionModes={};if(depth===0&&tables)for(const id of Object.keys(defs)){const table=tableFor(id,defs,tables);definitionModes[id]=table.eligible?'真值表':table.reason;}
    const result={values:current,outputs,wires,portValues,issues:[...issues],definitionModes,forcedWires:state.wires.filter(w=>forced.has(net.wireNet.get(w.id))).map(w=>w.id)};
    if(context.session){if(context.session.results.size>=4096)context.session.results.clear();context.session.results.set(context.scope,{key:resultKey,result});}
    return result;
  }
  // Sample every register from the same old state, including separate custom instances.
  function step(state){
    const memory=state.delayState||{},next={},defs=state.definitions||{},tables=compiledTables(defs);
    function sample(local,overrides={},scope='root',depth=0){
      const sim=simulate(local,overrides,depth,{memory,scope});
      for(const n of local.nodes){
        const ins=ports(n,defs).filter(p=>p.dir==='in').map(p=>sim.portValues[key(p)]);
        if(n.type==='delay')next[scope+'/'+n.id]=packBits(ins[0]);
        else if(n.type==='custom'&&!tableFor(n.def,defs,tables).eligible){const d=defs[n.def],input={};d.inputs.forEach((p,i)=>input[p.id]=ins[i]);sample({nodes:d.nodes,wires:d.wires,definitions:defs},input,scope+'/'+n.id,depth+1);}
      }
    }
    sample(state);return next;
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
    for(const local of [next,...Object.values(next.definitions)]){const active={...local,definitions:next.definitions};for(const w of local.wires)if(w.autoRoute&&[w.a,w.b].some(e=>local.nodes.some(n=>n.id===e.node&&n.type==='custom'&&n.def===id)))w.via=route(w.a,w.b,active,w.id).slice(1,-1);}
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
  return {clone,spec,baseSize,size,rotatedPoint,rotationTransform,ports,key,anchor,points,route,project,distance,nets,simulate,createSimulator,step,definitionInfo,countComponents,createComponentCounter,makeDefinition,updateDefinition,pruneDefinitions,deleteDefinition,validate,bitArray,packBits,decimal,formatValue,parseSignal,DISPLAY_FORMATS,MAX_BITS,MAX_DEPTH};
});
