(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const types=['nand','input','output','hub','splitter','custom'];
  const width=n=>n.bits||1;
  const bitArray=(value,bits)=>Array.from({length:bits},(_,i)=>(value>>i)&1);
  function spec(n,defs={}){
    if(n.type==='nand')return {inputs:[1,1],outputs:[1],inLabels:['A','B'],outLabels:['Q']};
    if(n.type==='input')return {inputs:[],outputs:[width(n)],inLabels:[],outLabels:[n.label||'OUT']};
    if(n.type==='output')return {inputs:[width(n)],outputs:[],inLabels:[n.label||'IN'],outLabels:[]};
    if(n.type==='hub')return {inputs:Array(width(n)).fill(1),outputs:[width(n)],inLabels:Array.from({length:width(n)},(_,i)=>'b'+i),outLabels:[width(n)+'位']};
    if(n.type==='splitter')return {inputs:[width(n)],outputs:Array(width(n)).fill(1),inLabels:[width(n)+'位'],outLabels:Array.from({length:width(n)},(_,i)=>'b'+i)};
    const d=defs[n.def];if(!d)throw Error('自定义门不存在');
    return {inputs:d.inputs.map(p=>p.width),outputs:d.outputs.map(p=>p.width),inLabels:d.inputs.map(p=>p.label),outLabels:d.outputs.map(p=>p.label)};
  }
  function size(n,defs){const s=spec(n,defs);return {w:152,h:Math.max(80,Math.max(s.inputs.length,s.outputs.length)*24+32)};}
  function ports(n,defs){const s=spec(n,defs),z=size(n,defs),out=[];for(const dir of ['in','out']){const ws=s[dir==='in'?'inputs':'outputs'],labels=s[dir==='in'?'inLabels':'outLabels'];ws.forEach((w,i)=>out.push({node:n.id,dir,port:i,width:w,label:labels[i],x:n.x+(dir==='out'?z.w:0),y:n.y+z.h/2-(ws.length-1)*12+i*24}));}return out;}
  const key=p=>p.node+':'+p.dir+':'+p.port;
  function anchor(e,state){if(!e.node)return {x:e.x,y:e.y};const n=state.nodes.find(n=>n.id===e.node);return ports(n,state.definitions).find(p=>p.dir===e.dir&&p.port===e.port);}
  function points(w,state){const a=anchor(w.a,state),b=anchor(w.b,state);if(w.via?.length)return [a,...w.via,b];const x=(a.x+b.x)/2;return [a,{x,y:a.y},{x,y:b.y},b];}
  function project(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return {x:a.x+t*dx,y:a.y+t*dy};}
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function nets(state){
    const ws=state.wires,parent=ws.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
    const paths=ws.map(w=>points(w,state));
    const ends=ws.map(w=>[anchor(w.a,state),anchor(w.b,state)]);
    for(let i=0;i<ws.length;i++)for(let j=0;j<i;j++){
      let touch=false;
      for(const [ei,pi] of [[i,j],[j,i]])for(const e of ends[ei])for(let k=1;k<paths[pi].length;k++)if(distance(e,project(e,paths[pi][k-1],paths[pi][k]))<0.05)touch=true;
      if(touch)join(i,j);
    }
    const groups=new Map(),portNet=new Map(),wireNet=new Map();
    ws.forEach((w,i)=>{const id=find(i);if(!groups.has(id))groups.set(id,{id,drivers:new Map(),ports:new Map(),wires:[]});const g=groups.get(id);g.wires.push(w.id);wireNet.set(w.id,id);for(const e of [w.a,w.b])if(e.node){const k=key(e),p=anchor(e,state);g.ports.set(k,p);portNet.set(k,id);if(e.dir==='out')g.drivers.set(k,p);}});
    // A free endpoint placed exactly on a port also attaches to it.
    for(const n of state.nodes)for(const p of ports(n,state.definitions))for(let i=0;i<ws.length;i++)if(ends[i].some(e=>distance(e,p)<0.05)){const g=groups.get(find(i)),k=key(p);g.ports.set(k,p);portNet.set(k,g.id);if(p.dir==='out')g.drivers.set(k,p);}
    return {groups,portNet,wireNet};
  }
  function simulate(state,overrides={},depth=0){
    if(depth>12)throw Error('自定义门嵌套过深');
    const defs=state.definitions||{},net=nets(state),issues=new Set(),values={},outputs={};
    const unknown=w=>Array(w).fill(null);
    for(const n of state.nodes)values[n.id]=spec(n,defs).outputs.map(unknown);
    for(const g of net.groups.values()){
      if(g.drivers.size>1)issues.add('一条网络连接了多个输出，请分开连线');
      if(new Set([...g.ports.values()].map(p=>p.width)).size>1)issues.add('导线两端位宽不一致，请使用集线器或分线器');
    }
    function read(p,prev){const id=net.portNet.get(key(p));if(id===undefined)return unknown(p.width);const g=net.groups.get(id);if(g.drivers.size!==1||[...g.ports.values()].some(q=>q.width!==p.width))return unknown(p.width);const d=[...g.drivers.values()][0];return prev[d.node]?.[d.port]||unknown(p.width);}
    let current=values,settled=false;
    for(let step=0;step<Math.min(state.nodes.length+4,512);step++){
      const next={};
      for(const n of state.nodes){
        const ps=ports(n,defs),ins=ps.filter(p=>p.dir==='in').map(p=>read(p,current));
        if(n.type==='input')next[n.id]=[overrides[n.id]||bitArray(n.value||0,width(n))];
        else if(n.type==='output')next[n.id]=[];
        else if(n.type==='nand'){const a=ins[0][0],b=ins[1][0];next[n.id]=[[a===0||b===0?1:a===1&&b===1?0:null]];}
        else if(n.type==='hub')next[n.id]=[ins.map(v=>v[0])];
        else if(n.type==='splitter')next[n.id]=ins[0].map(v=>[v]);
        else {const d=defs[n.def],input={};d.inputs.forEach((p,i)=>input[p.id]=ins[i]);const sub=simulate({nodes:d.nodes,wires:d.wires,definitions:defs},input,depth+1);next[n.id]=d.outputs.map(p=>sub.outputs[p.id]);sub.issues.forEach(x=>issues.add(x));}
      }
      if(JSON.stringify(next)===JSON.stringify(current)){current=next;settled=true;break;}current=next;
    }
    if(!settled)issues.add('电路未收敛，请检查反馈回路');
    for(const n of state.nodes)if(n.type==='output')outputs[n.id]=read(ports(n,defs)[0],current);
    const wires={},portValues={};
    for(const n of state.nodes)for(const p of ports(n,defs))portValues[key(p)]=p.dir==='out'?current[n.id][p.port]:read(p,current);
    for(const w of state.wires){const g=net.groups.get(net.wireNet.get(w.id));const p=[...g.ports.values()][0];wires[w.id]=p?read(p,current):[null];}
    return {values:current,outputs,wires,portValues,issues:[...issues]};
  }
  function makeDefinition(state,name){
    name=String(name).trim();if(!name||name.length>24)throw Error('名称请输入 1–24 个字');
    const sorted=state.nodes.slice().sort((a,b)=>a.y-b.y||a.x-b.x||a.id.localeCompare(b.id));
    const portsFor=type=>sorted.filter(n=>n.type===type).map((n,i)=>({id:n.id,label:n.label||(type==='input'?'I':'O')+(i+1),width:width(n)}));
    const inputs=portsFor('input'),outputs=portsFor('output');
    if(!inputs.length||!outputs.length)throw Error('请先放置输入和输出元件，再封装电路');
    if(inputs.length>16||outputs.length>16)throw Error('封装最多支持 16 个输入和 16 个输出');
    return {name,inputs,outputs,nodes:clone(state.nodes),wires:clone(state.wires)};
  }
  function validate(raw){
    const fail=()=>{throw Error('电路文件无效或不兼容，请检查格式、端口和自定义门');};
    if(!raw||raw.version!==1||!Array.isArray(raw.nodes)||!Array.isArray(raw.wires)||!raw.definitions||typeof raw.definitions!=='object'||Array.isArray(raw.definitions))fail();
    const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
    const finite=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e9;
    const label=x=>x===undefined||(typeof x==='string'&&x.length<=24);
    const defs=raw.definitions,ids=Object.keys(defs);if(ids.length>80||ids.some(id=>!safeId(id)))fail();
    function circuit(s){
      if(!Array.isArray(s.nodes)||!Array.isArray(s.wires)||s.nodes.length>500||s.wires.length>1500)fail();
      const nodeIds=new Set(),wireIds=new Set();
      for(const n of s.nodes){if(!n||!safeId(n.id)||nodeIds.has(n.id)||!types.includes(n.type)||!finite(n.x)||!finite(n.y)||!label(n.label))fail();nodeIds.add(n.id);if(n.bits!==undefined&&(!Number.isInteger(n.bits)||n.bits<1||n.bits>8))fail();if(['hub','splitter'].includes(n.type)&&width(n)<2)fail();if(n.value!==undefined&&(!Number.isInteger(n.value)||n.value<0||n.value>=2**width(n)))fail();if(n.type==='custom'&&(!safeId(n.def)||!Object.hasOwn(defs,n.def)))fail();}
      for(const w of s.wires){if(!w||!safeId(w.id)||wireIds.has(w.id))fail();wireIds.add(w.id);for(const e of [w.a,w.b]){if(!e||typeof e!=='object')fail();if(e.node){if(!nodeIds.has(e.node)||!['in','out'].includes(e.dir)||!Number.isInteger(e.port)||e.port<0)fail();const n=s.nodes.find(n=>n.id===e.node);let ps;try{ps=spec(n,defs);}catch{fail();}if(e.port>=ps[e.dir==='in'?'inputs':'outputs'].length)fail();}else if(!finite(e.x)||!finite(e.y))fail();}if(w.via!==undefined&&(!Array.isArray(w.via)||w.via.length>100||w.via.some(p=>!finite(p.x)||!finite(p.y))))fail();}
    }
    for(const id of ids){const d=defs[id];if(!d||!label(d.name)||!d.name||!Array.isArray(d.inputs)||!Array.isArray(d.outputs)||!Array.isArray(d.nodes))fail();for(const [ps,type] of [[d.inputs,'input'],[d.outputs,'output']]){if(!ps.length||ps.length>16||new Set(ps.map(p=>p.id)).size!==ps.length)fail();for(const p of ps){const n=d.nodes.find(n=>n.id===p.id);if(!n||n.type!==type||p.width!==width(n)||!label(p.label))fail();}if(d.nodes.filter(n=>n.type===type).length!==ps.length)fail();}}
    let total=raw.nodes.length;for(const id of ids){circuit(defs[id]);total+=defs[id].nodes.length;}if(total>5000)fail();circuit(raw);
    const visiting=new Set(),done=new Set();function visit(id,depth){if(visiting.has(id)||depth>12)fail();if(done.has(id))return;visiting.add(id);for(const n of defs[id].nodes)if(n.type==='custom')visit(n.def,depth+1);visiting.delete(id);done.add(id);}ids.forEach(id=>visit(id,0));
    if(raw.camera&&(!finite(raw.camera.x)||!finite(raw.camera.y)||!Number.isFinite(raw.camera.scale)||raw.camera.scale<0.2||raw.camera.scale>2.5))fail();
    return clone(raw);
  }
  return {clone,spec,size,ports,key,anchor,points,project,distance,simulate,makeDefinition,validate,bitArray};
});
