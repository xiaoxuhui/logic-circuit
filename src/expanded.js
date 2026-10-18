if(typeof importScripts==='function'&&typeof document==='undefined')importScripts('./core.js');
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.LogicCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicExpanded=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names={nand:'与非门',delay:'延迟线',input:'输入',output:'输出',hub:'集线器',splitter:'分线器'};
  const dec=bits=>C.decimal(bits);
  const bitText=bits=>bits.slice().reverse().join('');
  const color=bits=>bits.some(b=>b===1)?'#91e6be':'#7793a8';
  const path=points=>points.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ');
  const stroke=(points,bits)=>`<path class="expanded-wire wire-line ${bits.some(b=>b===1)?'high':''} ${bits.length>1?'bus':''}" d="${path(points)}" stroke="${color(bits)}" stroke-width="${bits.length>1?4:2}"/>`;
  const MAX_CACHE_BYTES=8*1024*1024,MAX_CACHE_ENTRIES=128,templates=new Map(),structures=new Map();
  let templateBytes=0,structureBytes=0,structureId=0,sceneId=0,lastStats={hits:0,misses:0,circuitsBuilt:0,evictions:0};
  function internStructure(key){
    if(structures.has(key)){const id=structures.get(key);structures.delete(key);structures.set(key,id);return id;}
    const id=++structureId,bytes=key.length*2;if(bytes>MAX_CACHE_BYTES)return id;
    while(structures.size>=256||structureBytes+bytes>MAX_CACHE_BYTES){const first=structures.keys().next().value;structureBytes-=first.length*2;structures.delete(first);}
    structures.set(key,id);structureBytes+=bytes;return id;
  }
  const moveScope=(scope,from,to)=>scope===from?to:scope.startsWith(from+'/')?to+scope.slice(from.length):scope;
  function rebase(view,from,to){
    const {svg,symbols,...data}=view,result={...C.clone(data),svg,...(symbols?{symbols:symbols.map(s=>({...s}))}:{})},netId=id=>id.replace(/^(net|link)-([^:]+):(\d+)$/,(_,kind,scope,index)=>kind+'-'+encodeURIComponent(moveScope(decodeURIComponent(scope),from,to))+':'+index);
    if(from===to)return result;
    result.svg=result.svg.replace(/data-expanded-scope="([^"]*)"/g,(_,scope)=>'data-expanded-scope="'+esc(moveScope(scope,from,to))+'"').replace(/data-expanded-net="([^"]*)"/g,(_,id)=>'data-expanded-net="'+netId(id)+'"');
    for(const item of [...result.leaves,...result.frames,...result.layouts])item.scope=moveScope(item.scope,from,to);
    for(const layout of result.layouts){for(const child of layout.children||[])child.scope=moveScope(child.scope,from,to);for(const route of layout.routes){route.scope=moveScope(route.scope,from,to);route.id=netId(route.id);}}
    return result;
  }
  function cacheView(key,view,scope,stats){
    const {svg,symbols,...data}=view,strings=key.length+svg.length+(symbols||[]).reduce((sum,s)=>sum+s.svg.length+s.id.length,0);if(2*strings>MAX_CACHE_BYTES)return;
    const bytes=2*(strings+JSON.stringify(data).length);if(bytes>MAX_CACHE_BYTES)return;const template=rebase(view,scope,'root');
    while(templates.size>=MAX_CACHE_ENTRIES||templateBytes+bytes>MAX_CACHE_BYTES){const first=templates.keys().next().value;templateBytes-=templates.get(first).bytes;templates.delete(first);stats.evictions++;}
    templates.set(key,{view:template,bytes});templateBytes+=bytes;
  }
  function getCacheStats(){return {...lastStats,entries:templates.size,bytes:templateBytes,structureBytes,maxEntries:MAX_CACHE_ENTRIES,maxBytes:MAX_CACHE_BYTES};}
  function clearCache(){templates.clear();structures.clear();templateBytes=structureBytes=0;lastStats={hits:0,misses:0,circuitsBuilt:0,evictions:0};}
  function build(source,options={}){
    const maxLayers=options.maxLayers??Infinity;
    if(maxLayers!==Infinity&&(!Number.isInteger(maxLayers)||maxLayers<1||maxLayers>C.MAX_DEPTH))throw Error('展开层数请输入 1–'+C.MAX_DEPTH+' 之间的整数');
    const compact=options.compact??(!options.direct&&Object.values(C.countComponents(source)).reduce((a,b)=>a+b,0)>5000);
    const simulationContext=C.createSimulationContext(source),defs=source.definitions,leaves=[],frames=[],layouts=[],stats={hits:0,misses:0,circuitsBuilt:0,evictions:0},definitionIds=new Map(),visiting=new Set(),memories=new Map(),forces=new Map();let total=0;lastStats=stats;
    const structure=(local,ports)=>internStructure(JSON.stringify([local.nodes.map(n=>n.type==='input'?{...n,value:undefined}:n),local.wires,ports,local.nodes.filter(n=>n.type==='custom').map(n=>[n.def,definitionId(n.def)])]));
    function definitionId(id){if(definitionIds.has(id))return definitionIds.get(id);if(visiting.has(id))throw Error('自定义门循环依赖');visiting.add(id);const d=defs[id];if(!d)throw Error('自定义门不存在');const result=structure(d,[d.name,d.inputs,d.outputs,d.nodes.filter(n=>n.type==='input').map(n=>[n.id,n.value||0])]);visiting.delete(id);definitionIds.set(id,result);return result;}
    for(const [path,value] of Object.entries(source.delayState||{}).sort(([a],[b])=>a.localeCompare(b))){const parts=path.split('/');for(let i=1;i<parts.length;i++){const scope=parts.slice(0,i).join('/');if(!memories.has(scope))memories.set(scope,[]);memories.get(scope).push([path.slice(scope.length),value]);}}
    for(const [path,value] of Object.entries(source.scopedWireOverrides||{}).sort(([a],[b])=>a.localeCompare(b))){const parts=path.split('/');for(let i=1;i<=parts.length;i++){const scope=parts.slice(0,i).join('/');if(!forces.has(scope))forces.set(scope,[]);forces.get(scope).push([path.slice(scope.length),Object.entries(value).sort(([a],[b])=>a.localeCompare(b))]);}}
    function circuit(local,overrides={},boundary=false,depth=0,scope='root',boundaryPorts=null){
      if(depth>C.MAX_DEPTH)throw Error('展开层数超过限制');
      const startTotal=total,startLeaves=leaves.length,startFrames=frames.length,startLayouts=layouts.length;
      const cacheKey=JSON.stringify([structure(local,boundaryPorts&&[boundaryPorts.name,boundaryPorts.inputs,boundaryPorts.outputs]),boundary,scope==='root',Number.isFinite(maxLayers)?Math.max(0,maxLayers-depth):null,compact,!!options.direct,!!options.readOnly,!!options.preserveLayout,options.debugNode,source.displayFormat||'unsigned',Object.entries(overrides).sort(([a],[b])=>a.localeCompare(b)),local.nodes.filter(n=>n.type==='input').map(n=>[n.id,overrides[n.id]===undefined?n.value||0:overrides[n.id]]),memories.get(scope)||[],forces.get(scope)||[],local.wireOverrides||{}]);
      const cached=templates.get(cacheKey);
      if(cached){if(depth+cached.view.depthSpan>C.MAX_DEPTH)throw Error('展开层数超过限制');templates.delete(cacheKey);templates.set(cacheKey,cached);stats.hits++;const view=rebase(cached.view,'root',scope);total+=view.count;leaves.push(...view.leaves);frames.push(...view.frames);layouts.push(...view.layouts);return view;}
      stats.misses++;stats.circuitsBuilt++;let netCounter=0,depthSpan=0;const symbols=new Map();
      const net=C.nets(local),sim=C.simulate(local,overrides,depth,{...simulationContext,memory:source.delayState||{},scope,scopedOverrides:source.scopedWireOverrides||{}}),items=new Map(),inputs={},outputs={},ordered=local.nodes.slice().sort((a,b)=>a.y-b.y||a.x-b.x||a.id.localeCompare(b.id)),inputOrder=ordered.filter(n=>n.type==='input'),outputOrder=ordered.filter(n=>n.type==='output');
      for(const n of local.nodes){
        if(boundary&&!['input','output'].includes(n.type)&&!C.ports(n,defs).some(p=>net.portNet.has(C.key(p))))continue;
        total++;
        const s=C.spec(n,defs),label=(n.type==='input'?'IN'+(inputOrder.findIndex(p=>p.id===n.id)+1)+' · ':n.type==='output'?'OUT'+(outputOrder.findIndex(p=>p.id===n.id)+1)+' · ':'')+(n.label||(n.type==='custom'?defs[n.def].name:names[n.type]));
        if(n.type==='custom'&&!options.direct&&depth<maxLayers){
          const d=defs[n.def],input={};d.inputs.forEach((p,i)=>input[p.id]=sim.portValues[C.key({node:n.id,dir:'in',port:i})]);
          const child=circuit({nodes:d.nodes,wires:d.wires,definitions:defs},input,true,depth+1,scope+'/'+n.id,d),pad=28+Math.max(d.inputs.length,d.outputs.length)*14,w=child.w+pad*2;
          depthSpan=Math.max(depthSpan,child.depthSpan+1);
          for(const symbol of child.symbols||[])symbols.set(symbol.id,symbol);
          const spread=(ports,points,x)=>{const used=[];return ports.map(p=>{let y=40+points[p.id].y;while(used.some(v=>Math.abs(v-y)<24))y+=24;used.push(y);return {x,y};});};
          const ins=spread(d.inputs,child.inputs,0),outs=spread(d.outputs,child.outputs,w),h=Math.max(child.h+64,...ins.map(p=>p.y+30),...outs.map(p=>p.y+30));

          const link=(ps,bits,dir,index)=>{
            let targetScope=scope,group=net.groups.get(net.portNet.get(C.key({node:n.id,dir,port:index})));
            if(!group){const port=d[dir==='in'?'inputs':'outputs'][index],inner={nodes:d.nodes,wires:d.wires,definitions:defs},innerNet=C.nets(inner),endpoint=C.ports(d.nodes.find(n=>n.id===port.id),defs)[0];group=innerNet.groups.get(innerNet.portNet.get(C.key(endpoint)));targetScope=scope+'/'+n.id;}
            if(!group)return '';
            const id='link-'+encodeURIComponent(scope)+':'+(++netCounter),description='连接线 · '+bitText(bits);
            return '<g class="expanded-net" data-expanded-net="'+id+'" data-expanded-scope="'+esc(targetScope)+'" data-expanded-wire="'+esc(group.wires[0])+'" data-description="'+esc(description)+'" role="button" tabindex="0"><path class="expanded-net-hit" d="'+path(ps)+'"/>'+stroke(ps,bits)+'</g>';
          };
          let links='';d.inputs.forEach((p,i)=>{const to={x:pad+child.inputs[p.id].x,y:40+child.inputs[p.id].y},lane=pad-14*(i+1);links+=link([ins[i],{x:lane,y:ins[i].y},{x:lane,y:to.y},to],input[p.id],'in',i);});d.outputs.forEach((p,i)=>{const from={x:pad+child.outputs[p.id].x,y:40+child.outputs[p.id].y},lane=w-pad+14*(i+1);links+=link([from,{x:lane,y:from.y},{x:lane,y:outs[i].y},outs[i]],sim.portValues[C.key({node:n.id,dir:'out',port:i})],'out',i);});
          const markup=`<rect class="expanded-frame" width="${w}" height="${h}" rx="11"/><text class="expanded-frame-title" x="16" y="23">${esc(label)} · 内部电路</text>${links}<g transform="translate(${pad} 40)">${compact?`<use href="#${child.symbolId}" data-expanded-scene="true" data-expanded-child="${n.id}"/>`:child.svg}</g>`;
          items.set(n.id,{n,w,h,ins,outs,markup,childPad:pad,childW:child.w,childH:child.h});frames.push({name:label,scope:scope+'/'+n.id});continue;
        }
        if(boundary&&(n.type==='input'||n.type==='output')){
          const isInput=n.type==='input',bits=isInput?sim.values[n.id][0]:sim.outputs[n.id],z=C.size(n,defs),point=C.ports({...n,x:0,y:0},defs)[0],drawPoint=C.ports({...n,x:0,y:0,rotation:0},defs)[0],ports=boundaryPorts[isInput?'inputs':'outputs'],index=ports.findIndex(p=>p.id===n.id),label=(isInput?'IN':'OUT')+(index+1)+' · '+ports[index].label;
          const markup=`<g class="expanded-interface"><title>${esc(label)}</title><g transform="${C.rotationTransform(n,defs)}"><circle cx="${drawPoint.x}" cy="${drawPoint.y}" r="4" fill="${color(bits)}"/><text x="8" y="18">${esc(label.slice(0,14))}</text><text x="8" y="62">${bits.length} 位 · ${bitText(bits)}</text></g></g>`;
          items.set(n.id,{n,w:z.w,h:z.h,ins:isInput?[]:[point],outs:isInput?[point]:[],markup});continue;
        }
        const upright=options.preserveLayout||['input','output'].includes(n.type)?n:{...n,rotation:0},z=C.size(upright,defs),base=C.baseSize(n,defs),ports=C.ports({...upright,x:0,y:0},defs),drawPorts=C.ports({...upright,x:0,y:0,rotation:0},defs),ins=ports.filter(p=>p.dir==='in'),outs=ports.filter(p=>p.dir==='out');
        let glyph=n.type==='custom'?'◇':'⊼';if(n.type==='delay')glyph='▸▏ '+dec(sim.values[n.id][0]);else if(n.type==='input')glyph=bitText(sim.values[n.id][0]);else if(n.type==='output')glyph=String(dec(sim.outputs[n.id]));else if(n.type==='hub')glyph=(n.bits||1)+' → 1';else if(n.type==='splitter')glyph='1 → '+(n.bits||1);
        const switches=n.type==='input'?sim.values[n.id][0].slice().reverse().map((value,index)=>{const count=n.bits||1,cell=24,bit=count-index-1;return `<g class="bit-switch ${value?'high':'low'}" ${options.readOnly?'':`data-bit-toggle="${n.id}" data-bit="${bit}" role="button" tabindex="0" aria-label="${esc(label)} b${bit}" aria-pressed="${!!value}"`} transform="translate(${base.w/2-count*cell/2+index*cell} 33)"><rect width="${cell-2}" height="31" rx="4"/><text x="${(cell-2)/2}" y="21" text-anchor="middle" style="font-size:14px">${value}</text></g>`;}).join(''):n.type==='output'?[...bitText(sim.outputs[n.id])].map((digit,i,all)=>`<g class="digit-cell" transform="translate(${base.w/2-all.length*12+i*24} 33)"><rect width="22" height="31" rx="4"/><text x="11" y="21" text-anchor="middle">${digit}</text></g>`).join(''):'';
        const multiIO=['input','output'].includes(n.type)&&(n.bits||1)>1,decimalLabel=multiIO?`<text class="decimal-summary" x="${base.w/2}" y="${base.h+17}" text-anchor="middle" aria-label="数值">${C.formatValue(n.type==='input'?sim.values[n.id][0]:sim.outputs[n.id],source.displayFormat)}</text>`:'';
        const markup=`<g class="expanded-leaf" data-expanded-type="${n.type}" ${scope==='root'?`data-expanded-node="${n.id}"`:''}><g transform="${C.rotationTransform(upright,defs)}"><title>${esc(label)}</title><rect width="${base.w}" height="${base.h}" rx="8"/><text class="expanded-title" x="${base.w/2}" y="20" text-anchor="middle">${esc(label.length>12?label.slice(0,11)+'…':label)}</text>${switches||`<text class="expanded-glyph" x="${base.w/2}" y="${base.h/2+18}" text-anchor="middle">${esc(glyph)}</text>`}${decimalLabel}${drawPorts.map(p=>{const bits=sim.portValues[C.key({...p,node:n.id})];return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color(bits)}"/><text class="expanded-port-label" x="${p.x+(p.dir==='in'?10:-10)}" y="${p.y+3}" text-anchor="${p.dir==='in'?'start':'end'}">${esc(p.label)}</text>`;}).join('')}</g></g>`;
        items.set(n.id,{n,label,w:z.w,h:z.h,ins,outs,markup});leaves.push({type:n.type,id:n.id,...(n.def?{def:n.def}:{}),scope,values:C.clone(sim.values[n.id]),inputs:s.inputs.map((_,i)=>C.clone(sim.portValues[C.key({node:n.id,dir:'in',port:i})])),output:n.type==='output'?C.clone(sim.outputs[n.id]):null});
      }
      const groups=[...net.groups.values()],columns=new Map(),top=65+groups.length*24;
      for(const item of items.values()){const key=item.n.type==='input'?-Infinity:item.n.type==='output'?Infinity:item.n.x;if(!columns.has(key))columns.set(key,[]);columns.get(key).push(item);}
      let x=0,height=top+80,offset={x:0,y:0};
      if(options.preserveLayout){
        const points=local.wires.flatMap(w=>C.points(w,local));
        const bounds=[...local.nodes,...points],min=bounds.reduce((p,q)=>({x:Math.min(p.x,q.x),y:Math.min(p.y,q.y)}),{x:Infinity,y:Infinity});
        offset={x:32-(Number.isFinite(min.x)?min.x:0),y:32-(Number.isFinite(min.y)?min.y:0)};
        for(const item of items.values()){item.x=item.n.x+offset.x;item.y=item.n.y+offset.y;item.inLanes=item.ins.map(p=>item.x+p.x);item.outLanes=item.outs.map(p=>item.x+p.x);}
        x=Math.max(200,...[...items.values()].map(i=>i.x+i.w+32),...points.map(p=>p.x+offset.x+32));
        height=Math.max(120,...[...items.values()].map(i=>i.y+i.h+52),...points.map(p=>p.y+offset.y+32));
      }else for(const key of [...columns.keys()].sort((a,b)=>a-b)){
        const column=columns.get(key).sort((a,b)=>a.n.y-b.n.y||a.n.id.localeCompare(b.n.id)),io=!Number.isFinite(key),minX=io?Math.min(...column.map(i=>i.n.x)):0,minY=io?Math.min(...column.map(i=>i.n.y)):0,left=column.reduce((n,i)=>n+i.ins.length,0),right=column.reduce((n,i)=>n+i.outs.length,0),columnW=Math.max(...column.map(i=>i.w+(io?i.n.x-minX:0)));
        x+=40+left*16;let y=top,inSlot=0,outSlot=0;
        for(const item of column){item.x=x+(io?item.n.x-minX:0);item.y=io?top+item.n.y-minY:y;item.inLanes=item.ins.map(()=>x-24-(inSlot++)*16);item.outLanes=item.outs.map(()=>x+columnW+24+(outSlot++)*16);y=io?Math.max(y,item.y+item.h+100):y+item.h+100;if(boundary&&item.n.type==='input')inputs[item.n.id]={x:item.x+item.outs[0].x,y:item.y+item.outs[0].y};if(boundary&&item.n.type==='output')outputs[item.n.id]={x:item.x+item.ins[0].x,y:item.y+item.ins[0].y};}
        height=Math.max(height,y-70);x+=columnW+40+right*16;
      }
      const width=Math.max(200,x),routes=[];let wiring='';
      for(const [index,group] of groups.entries()){
        const id='net-'+encodeURIComponent(scope)+':'+(++netCounter),label='N'+netCounter,bits=sim.wires[group.wires[0]],laneY=35+index*24,paths=[],ports=[...group.ports.values()];
        const endpoints=ports.map(p=>{const item=items.get(p.node),point=(p.dir==='in'?item.ins:item.outs)[p.port];return {x:item.x+point.x,y:item.y+point.y,lane:(p.dir==='in'?item.inLanes:item.outLanes)[p.port]};});
        const endpointName=p=>{const item=items.get(p.node);return (item.label||item.n.label||(item.n.type==='custom'?defs[item.n.def].name:names[item.n.type]))+' '+(p.dir==='in'?'输入':'输出')+(p.port+1);};
        const description=label+' · '+ports.map(endpointName).join(' ↔ ')+' · 值 '+bitText(bits);
        if(options.preserveLayout){for(const wire of local.wires.filter(w=>group.wires.includes(w.id)))paths.push(C.points(wire,local).map(p=>({x:p.x+offset.x,y:p.y+offset.y})));}
        else if(endpoints.length){const lanes=endpoints.map(p=>p.lane);paths.push([{x:Math.min(...lanes),y:laneY},{x:Math.max(...lanes),y:laneY}]);for(const p of endpoints)paths.push([{x:p.x,y:p.y},{x:p.lane,y:p.y},{x:p.lane,y:laneY}]);}
        else paths.push([{x:30,y:laneY},{x:130,y:laneY}]);
        const labelX=options.preserveLayout?paths[0][0].x:endpoints.length?Math.min(...endpoints.map(p=>p.lane)):30,labelY=options.preserveLayout?paths[0][0].y:laneY;
        wiring+=`<g class="expanded-net" data-expanded-net="${id}" data-expanded-scope="${esc(scope)}" data-expanded-wire="${esc(group.wires[0])}" data-forced="${sim.forcedWires.includes(group.wires[0])}" data-description="${esc(description)}" role="button" tabindex="0" aria-label="${esc(description)}"><title>${esc(description)}</title>${paths.map(ps=>`<path class="expanded-net-hit" d="${path(ps)}"/>${stroke(ps,bits)}`).join('')}<text class="expanded-net-label" x="${labelX+4}" y="${labelY-6}">${label} · ${bitText(bits)}${sim.forcedWires.includes(group.wires[0])?' · 临时':''}</text>${options.preserveLayout?'':endpoints.map(p=>`<circle cx="${p.lane}" cy="${laneY}" r="3" fill="${color(bits)}"/><text class="expanded-net-label" x="${p.lane+3}" y="${p.y-6}">${label}</text>`).join('')}</g>`;
        routes.push({id,scope,wire:group.wires[0],ports:ports.map(p=>({node:p.node,dir:p.dir,port:p.port})),paths});
      }
      layouts.push({scope,boxes:[...items.values()].map(i=>({id:i.n.id,x:i.x,y:i.y,w:i.w,h:i.h})),routes,children:[...items.values()].filter(i=>i.childPad!==undefined).map(i=>({scope:scope+'/'+i.n.id,x:i.x+i.childPad,y:i.y+40,w:i.childW,h:i.childH}))});
      const result={w:width,h:height,inputs,outputs,svg:wiring+[...items.values()].map(item=>`<g ${scope==='root'&&item.n.id===options.debugNode?'class="debug-target"':''} transform="translate(${item.x} ${item.y})">${item.markup}</g>`).join(''),count:total-startTotal,depthSpan};
      if(compact){if(scope!=='root'){result.symbolId='expanded-state-'+(++sceneId);const svg=rebase({...result,leaves:[],frames:[],layouts:[]},scope,'root').svg;symbols.set(result.symbolId,{id:result.symbolId,svg});layouts.at(-1).symbolId=result.symbolId;}result.symbols=[...symbols.values()];}
      cacheView(cacheKey,{...result,leaves:leaves.slice(startLeaves),frames:frames.slice(startFrames),layouts:layouts.slice(startLayouts)},scope,stats);return result;
    }
    const result=circuit(source,{},false,0,options.scope||'root');return {...result,compact,sceneSvg:compact?result.svg:undefined,svg:compact?'<defs>'+(result.symbols||[]).map(s=>'<g id="'+s.id+'">'+s.svg+'</g>').join('')+'</defs>'+result.svg:result.svg,leaves,frames,layouts};
  }
  const sceneLayouts=new WeakMap();
  const sceneSymbols=new WeakMap();
  function layoutIndex(view){let indexed=sceneLayouts.get(view);if(!indexed){indexed=new Map(view.layouts.map(l=>[l.scope,l]));sceneLayouts.set(view,indexed);}return indexed;}
  function captureAnchor(view,point){
    const indexed=layoutIndex(view),levels=[];
    function visit(scope,p){
      const layout=indexed.get(scope);if(!layout)return;
      const contains=b=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h;
      const distance=b=>Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.w),Math.max(b.y-p.y,0,p.y-b.y-b.h));
      const nearest=layout.boxes.reduce((best,b)=>!best||distance(b)<distance(best)?b:best,null),gate=layout.boxes.find(contains);
      if(nearest){
        const axis=(key,size)=>{const v=p[key];let left=null,right=null;for(const b of layout.boxes){if(b[key]+b[size]<=v&&(!left||distance(b)<distance(left)))left=b;if(b[key]>=v&&(!right||distance(b)<distance(right)))right=b;}
          if(left&&right&&right[key]>left[key]+left[size])return {left:left.id,right:right.id,t:(v-left[key]-left[size])/(right[key]-left[key]-left[size])};
          const start=nearest[key],end=start+nearest[size];return v<start?{id:nearest.id,edge:0,offset:v-start}:v>end?{id:nearest.id,edge:1,offset:v-end}:{id:nearest.id,t:(v-start)/nearest[size]};};
        levels.push({scope,gate:gate?.id,x:axis('x','w'),y:axis('y','h')});
      }
      const child=(layout.children||[]).find(contains);if(child)visit(child.scope,{x:p.x-child.x,y:p.y-child.y});
    }
    visit(view.layouts.at(-1)?.scope,point);return {levels,point:{...point}};
  }
  function resolveAnchor(view,anchor){
    const indexed=layoutIndex(view),rootScope=view.layouts.at(-1)?.scope;
    function locate(scope){if(scope===rootScope)return {layout:indexed.get(scope),x:0,y:0};if(!rootScope||!scope.startsWith(rootScope+'/'))return null;const parent=locate(scope.slice(0,scope.lastIndexOf('/'))),child=parent?.layout?.children?.find(c=>c.scope===scope);return child?{layout:indexed.get(scope),x:parent.x+child.x,y:parent.y+child.y}:null;}
    for(const level of anchor.levels.slice().reverse()){
      const located=locate(level.scope);if(!located?.layout)continue;const boxes=new Map(located.layout.boxes.map(b=>[b.id,b]));
      if(level.gate){const b=boxes.get(level.gate);if(b)return {x:located.x+b.x,y:located.y+b.y};continue;}
      const axis=(a,key,size)=>{if(a.left){const left=boxes.get(a.left),right=boxes.get(a.right);return left&&right?left[key]+left[size]+a.t*(right[key]-left[key]-left[size]):null;}const b=boxes.get(a.id);return b?b[key]+(a.edge===undefined?a.t*b[size]:a.edge*b[size]+a.offset):null;};
      const x=axis(level.x,'x','w'),y=axis(level.y,'y','h');if(x!==null&&y!==null)return {x:located.x+x,y:located.y+y};
    }
    return {...anchor.point};
  }
  function viewportSvg(view,rect,scale=1){
    if(!view.compact)return view.svg;if(!view.sceneSvg)return '';
    let indexed=sceneLayouts.get(view);if(!indexed){indexed=new Map(view.layouts.map(l=>[l.scope,l]));sceneLayouts.set(view,indexed);}let symbols=sceneSymbols.get(view);if(!symbols){symbols=new Map(view.symbols.map(s=>[s.id,s.svg]));sceneSymbols.set(view,symbols);}
    function draw(scope,svg,origin){const layout=indexed.get(scope);return svg.replace(/<use href="#([^"]+)" data-expanded-scene="true" data-expanded-child="([^"]+)"\/>/g,(_,id,node)=>{const child=layout.children.find(c=>c.scope===scope+'/'+node);if(!child)return '';const x=origin.x+child.x,y=origin.y+child.y;if(x>rect.x+rect.w||x+child.w<rect.x||y>rect.y+rect.h||y+child.h<rect.y||Math.min(child.w,child.h)*scale<14)return '';const local=symbols.get(id).replace(/data-expanded-scope="([^"]*)"/g,(_,s)=>'data-expanded-scope="'+esc(moveScope(s,'root',child.scope))+'"').replace(/data-expanded-net="(net|link)-([^:]+):(\d+)"/g,(_,kind,s,i)=>'data-expanded-net="'+kind+'-'+encodeURIComponent(moveScope(decodeURIComponent(s),'root',child.scope))+':'+i+'"');return draw(child.scope,local,{x,y});});}
    return draw(view.layouts.at(-1).scope,view.sceneSvg,{x:0,y:0});
  }
  function hitTest(view,point,tolerance=6){
    let indexed=sceneLayouts.get(view);if(!indexed){indexed=new Map(view.layouts.map(l=>[l.scope,l]));sceneLayouts.set(view,indexed);}
    function hit(scope,p){const layout=indexed.get(scope);if(!layout)return null;for(const child of layout.children||[])if(p.x>=child.x-tolerance&&p.x<=child.x+child.w+tolerance&&p.y>=child.y-tolerance&&p.y<=child.y+child.h+tolerance){const found=hit(child.scope,{x:p.x-child.x,y:p.y-child.y});if(found)return found;}
      let best=null,distance=tolerance;for(const route of layout.routes)for(const path of route.paths)for(let i=1;i<path.length;i++){const d=C.distance(p,C.project(p,path[i-1],path[i]));if(d<=distance){distance=d;best={scope:route.scope,id:route.wire};}}return best;
    }
    return hit(view.layouts.at(-1)?.scope,point);
  }
  function focus(source,nodeId){
    const node=source.nodes.find(n=>n.id===nodeId);
    if(node?.type!=='custom')throw Error('请选择一个自定义逻辑门');
    const definition=source.definitions[node.def],sim=C.simulate(source),nodes=C.clone(definition.nodes);
    definition.inputs.forEach((port,i)=>{nodes.find(n=>n.id===port.id).value=C.packBits(sim.portValues[C.key({node:nodeId,dir:'in',port:i})]);});
    const prefix='root/'+nodeId+'/',memory={};
    for(const [path,value] of Object.entries(source.delayState||{}))if(path.startsWith(prefix))memory['root/'+path.slice(prefix.length)]=value;

    const scopedWireOverrides={};
    for(const [scope,values] of Object.entries(source.scopedWireOverrides||{}))if(scope==='root/'+nodeId||scope.startsWith(prefix))scopedWireOverrides['root'+scope.slice(('root/'+nodeId).length)]=C.clone(values);
    const captured={nodes,wires:C.clone(definition.wires),definitions:source.definitions,delayState:memory,displayFormat:source.displayFormat,scopedWireOverrides};
    return {...build(captured,{readOnly:true,direct:true,preserveLayout:true}),source:captured};
  }
  return {build,focus,getCacheStats,clearCache,hitTest,viewportSvg,captureAnchor,resolveAnchor};
});
if(typeof importScripts==='function'&&typeof document==='undefined')self.onmessage=e=>{try{const view=self.LogicExpanded.build(e.data.source,e.data.options);self.postMessage({id:e.data.id,view,stats:self.LogicExpanded.getCacheStats()});}catch(error){self.postMessage({id:e.data.id,error:error.message});}};
