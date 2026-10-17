(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.LogicCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicExpanded=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names={nand:'与非门',input:'输入',output:'输出',hub:'集线器',splitter:'分线器'};
  const dec=bits=>bits.reduce((n,b,i)=>n+(b||0)*2**i,0);
  const bitText=bits=>bits.slice().reverse().join('');
  const color=bits=>bits.some(b=>b===1)?'#91e6be':'#7793a8';
  const path=points=>points.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ');
  const stroke=(points,bits)=>`<path class="expanded-wire" d="${path(points)}" stroke="${color(bits)}" stroke-width="${bits.length>1?4:2}"/>`;
  function build(source){
    const defs=source.definitions,leaves=[],frames=[],layouts=[];let total=0,netCounter=0;
    function circuit(local,overrides={},boundary=false,depth=0,scope='root',boundaryPorts=null){
      if(depth>12)throw Error('展开层数超过限制');
      const net=C.nets(local),sim=C.simulate(local,overrides),items=new Map(),inputs={},outputs={},ordered=local.nodes.slice().sort((a,b)=>a.y-b.y||a.x-b.x||a.id.localeCompare(b.id)),inputOrder=ordered.filter(n=>n.type==='input'),outputOrder=ordered.filter(n=>n.type==='output');
      for(const n of local.nodes){
        if(boundary&&!['input','output'].includes(n.type)&&!C.ports(n,defs).some(p=>net.portNet.has(C.key(p))))continue;
        if(++total>5000)throw Error('展开后的元件过多，请先减少电路规模');
        const s=C.spec(n,defs),label=(n.type==='input'?'IN'+(inputOrder.findIndex(p=>p.id===n.id)+1)+' · ':n.type==='output'?'OUT'+(outputOrder.findIndex(p=>p.id===n.id)+1)+' · ':'')+(n.label||(n.type==='custom'?defs[n.def].name:names[n.type]));
        if(n.type==='custom'){
          const d=defs[n.def],input={};d.inputs.forEach((p,i)=>input[p.id]=sim.portValues[C.key({node:n.id,dir:'in',port:i})]);
          const child=circuit({nodes:d.nodes,wires:d.wires,definitions:defs},input,true,depth+1,scope+'/'+n.id,d),w=child.w+40,h=child.h+64;
          const ins=d.inputs.map(p=>({x:0,y:40+child.inputs[p.id].y})),outs=d.outputs.map(p=>({x:w,y:40+child.outputs[p.id].y}));
          let links='';d.inputs.forEach((p,i)=>{const to={x:20+child.inputs[p.id].x,y:40+child.inputs[p.id].y};links+=stroke([ins[i],to],input[p.id]);});d.outputs.forEach((p,i)=>{const from={x:20+child.outputs[p.id].x,y:40+child.outputs[p.id].y};links+=stroke([from,outs[i]],sim.values[n.id][i]);});
          const markup=`<rect class="expanded-frame" width="${w}" height="${h}" rx="11"/><text class="expanded-frame-title" x="16" y="23">${esc(label)} · 内部电路</text>${links}<g transform="translate(20 40)">${child.svg}</g>`;
          items.set(n.id,{n,w,h,ins,outs,markup});frames.push({name:label,scope:scope+'/'+n.id});continue;
        }
        if(boundary&&(n.type==='input'||n.type==='output')){
          const isInput=n.type==='input',bits=isInput?sim.values[n.id][0]:sim.outputs[n.id],point={x:isInput?180:0,y:38},ports=boundaryPorts[isInput?'inputs':'outputs'],index=ports.findIndex(p=>p.id===n.id),label=(isInput?'IN':'OUT')+(index+1)+' · '+ports[index].label;
          const markup=`<g class="expanded-interface"><title>${esc(label)}</title><circle cx="${point.x}" cy="38" r="4" fill="${color(bits)}"/><text x="8" y="18">${esc(label.slice(0,16))}</text><text x="8" y="58">${bits.length} 位 · ${bitText(bits)}</text></g>`;
          items.set(n.id,{n,w:180,h:70,ins:isInput?[]:[point],outs:isInput?[point]:[],markup,order:index});continue;
        }
        const upright={...n,rotation:0},z=C.size(upright,defs),ports=C.ports({...upright,x:0,y:0},defs),ins=ports.filter(p=>p.dir==='in'),outs=ports.filter(p=>p.dir==='out');
        let glyph='⊼';if(n.type==='input')glyph=bitText(sim.values[n.id][0]);else if(n.type==='output')glyph=String(dec(sim.outputs[n.id]));else if(n.type==='hub')glyph=(n.bits||1)+' → 1';else if(n.type==='splitter')glyph='1 → '+(n.bits||1);
        const markup=`<g class="expanded-leaf" data-expanded-type="${n.type}"><title>${esc(label)}</title><rect width="${z.w}" height="${z.h}" rx="8"/><text class="expanded-title" x="76" y="20" text-anchor="middle">${esc(label.length>12?label.slice(0,11)+'…':label)}</text><text class="expanded-glyph" x="76" y="${z.h/2+18}" text-anchor="middle">${esc(glyph)}</text>${ports.map(p=>{const bits=sim.portValues[C.key({...p,node:n.id})];return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color(bits)}"/><text class="expanded-port-label" x="${p.x+(p.dir==='in'?10:-10)}" y="${p.y+3}" text-anchor="${p.dir==='in'?'start':'end'}">${esc(p.label)}</text>`;}).join('')}</g>`;
        items.set(n.id,{n,label,w:z.w,h:z.h,ins,outs,markup});leaves.push({type:n.type,id:n.id,scope,values:C.clone(sim.values[n.id]),inputs:s.inputs.map((_,i)=>C.clone(sim.portValues[C.key({node:n.id,dir:'in',port:i})])),output:n.type==='output'?C.clone(sim.outputs[n.id]):null});
      }
      const groups=[...net.groups.values()],columns=new Map(),top=65+groups.length*24;
      for(const item of items.values()){const key=boundary&&item.n.type==='input'?-Infinity:boundary&&item.n.type==='output'?Infinity:item.n.x;if(!columns.has(key))columns.set(key,[]);columns.get(key).push(item);}
      let x=0,height=top+80;
      for(const key of [...columns.keys()].sort((a,b)=>a-b)){
        const column=columns.get(key).sort((a,b)=>(a.order??a.n.y)-(b.order??b.n.y)||a.n.id.localeCompare(b.n.id)),left=column.reduce((n,i)=>n+i.ins.length,0),right=column.reduce((n,i)=>n+i.outs.length,0),columnW=Math.max(...column.map(i=>i.w));
        x+=40+left*16;let y=top,inSlot=0,outSlot=0;
        for(const item of column){item.x=x;item.y=y;item.inLanes=item.ins.map(()=>x-24-(inSlot++)*16);item.outLanes=item.outs.map(()=>x+columnW+24+(outSlot++)*16);y+=item.h+100;if(boundary&&item.n.type==='input')inputs[item.n.id]={x:item.x+item.outs[0].x,y:item.y+item.outs[0].y};if(boundary&&item.n.type==='output')outputs[item.n.id]={x:item.x+item.ins[0].x,y:item.y+item.ins[0].y};}
        height=Math.max(height,y-70);x+=columnW+40+right*16;
      }
      const width=Math.max(200,x),routes=[];let wiring='';
      for(const [index,group] of groups.entries()){
        const id='net-'+(++netCounter),label='N'+netCounter,bits=sim.wires[group.wires[0]],laneY=35+index*24,paths=[],ports=[...group.ports.values()];
        const endpoints=ports.map(p=>{const item=items.get(p.node),point=(p.dir==='in'?item.ins:item.outs)[p.port];return {x:item.x+point.x,y:item.y+point.y,lane:(p.dir==='in'?item.inLanes:item.outLanes)[p.port]};});
        const endpointName=p=>{const item=items.get(p.node);return (item.label||item.n.label||(item.n.type==='custom'?defs[item.n.def].name:names[item.n.type]))+' '+(p.dir==='in'?'输入':'输出')+(p.port+1);};
        const description=label+' · '+ports.map(endpointName).join(' ↔ ')+' · 值 '+bitText(bits);
        if(endpoints.length){const lanes=endpoints.map(p=>p.lane);paths.push([{x:Math.min(...lanes),y:laneY},{x:Math.max(...lanes),y:laneY}]);for(const p of endpoints)paths.push([{x:p.x,y:p.y},{x:p.lane,y:p.y},{x:p.lane,y:laneY}]);}
        else paths.push([{x:30,y:laneY},{x:130,y:laneY}]);
        const labelX=endpoints.length?Math.min(...endpoints.map(p=>p.lane)):30;
        wiring+=`<g class="expanded-net" data-expanded-net="${id}" data-description="${esc(description)}" role="button" tabindex="0" aria-label="${esc(description)}"><title>${esc(description)}</title>${paths.map(ps=>`<path class="expanded-net-hit" d="${path(ps)}"/>${stroke(ps,bits)}`).join('')}<text class="expanded-net-label" x="${labelX+4}" y="${laneY-6}">${label} · ${bitText(bits)}</text>${endpoints.map(p=>`<circle cx="${p.lane}" cy="${laneY}" r="3" fill="${color(bits)}"/><text class="expanded-net-label" x="${p.lane+3}" y="${p.y-6}">${label}</text>`).join('')}</g>`;
        routes.push({id,ports:ports.map(p=>({node:p.node,dir:p.dir,port:p.port})),paths});
      }
      layouts.push({scope,boxes:[...items.values()].map(i=>({id:i.n.id,x:i.x,y:i.y,w:i.w,h:i.h})),routes});
      return {w:width,h:height,inputs,outputs,svg:wiring+[...items.values()].map(item=>`<g transform="translate(${item.x} ${item.y})">${item.markup}</g>`).join('')};
    }
    const result=circuit(source);return {...result,leaves,frames,layouts};
  }
  return {build};
});
