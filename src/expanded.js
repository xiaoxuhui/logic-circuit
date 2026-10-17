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
    const defs=source.definitions,leaves=[],frames=[];let total=0;
    function circuit(local,overrides={},boundary=false,depth=0,scope='root'){
      if(depth>12)throw Error('展开层数超过限制');
      const sim=C.simulate(local,overrides),items=new Map(),inputs={},outputs={};
      for(const n of local.nodes){
        if(++total>5000)throw Error('展开后的元件过多，请先减少电路规模');
        const s=C.spec(n,defs),label=n.label||(n.type==='custom'?defs[n.def].name:names[n.type]);
        if(n.type==='custom'){
          const d=defs[n.def],input={};d.inputs.forEach((p,i)=>input[p.id]=sim.portValues[C.key({node:n.id,dir:'in',port:i})]);
          const child=circuit({nodes:d.nodes,wires:d.wires,definitions:defs},input,true,depth+1,scope+'/'+n.id),w=child.w+40,h=child.h+64;
          const ins=d.inputs.map(p=>({x:0,y:40+child.inputs[p.id].y})),outs=d.outputs.map(p=>({x:w,y:40+child.outputs[p.id].y}));
          let links='';d.inputs.forEach((p,i)=>{const to={x:20+child.inputs[p.id].x,y:40+child.inputs[p.id].y};links+=stroke([ins[i],to],input[p.id]);});d.outputs.forEach((p,i)=>{const from={x:20+child.outputs[p.id].x,y:40+child.outputs[p.id].y};links+=stroke([from,outs[i]],sim.values[n.id][i]);});
          const markup=`<rect class="expanded-frame" width="${w}" height="${h}" rx="11"/><text class="expanded-frame-title" x="16" y="23">${esc(label)} · 内部电路</text>${links}<g transform="translate(20 40)">${child.svg}</g>`;
          items.set(n.id,{n,w,h,ins,outs,markup});frames.push({name:label,scope:scope+'/'+n.id});continue;
        }
        if(boundary&&(n.type==='input'||n.type==='output')){
          const bits=n.type==='input'?sim.values[n.id][0]:sim.outputs[n.id],point={x:28,y:30};
          const markup=`<g class="expanded-interface"><circle cx="28" cy="30" r="4" fill="${color(bits)}"/><text x="28" y="14" text-anchor="middle">${esc(n.label||(n.type==='input'?'IN':'OUT'))}</text><text x="28" y="50" text-anchor="middle">${bitText(bits)}</text></g>`;
          items.set(n.id,{n,w:56,h:60,ins:n.type==='output'?[point]:[],outs:n.type==='input'?[point]:[],markup});continue;
        }
        const z=C.size(n,defs),ports=C.ports({...n,x:0,y:0},defs),ins=ports.filter(p=>p.dir==='in'),outs=ports.filter(p=>p.dir==='out');
        let glyph='⊼';if(n.type==='input')glyph=bitText(sim.values[n.id][0]);else if(n.type==='output')glyph=String(dec(sim.outputs[n.id]));else if(n.type==='hub')glyph=(n.bits||1)+' → 1';else if(n.type==='splitter')glyph='1 → '+(n.bits||1);
        const markup=`<g class="expanded-leaf" data-expanded-type="${n.type}"><rect width="${z.w}" height="${z.h}" rx="8"/><text class="expanded-title" x="76" y="20" text-anchor="middle">${esc(label)}</text><text class="expanded-glyph" x="76" y="${z.h/2+18}" text-anchor="middle">${esc(glyph)}</text>${ports.map(p=>{const bits=sim.portValues[C.key({...p,node:n.id})];return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color(bits)}"/><text class="expanded-port-label" x="${p.x+(p.dir==='in'?10:-10)}" y="${p.y+3}" text-anchor="${p.dir==='in'?'start':'end'}">${esc(p.label)}</text>`;}).join('')}</g>`;
        items.set(n.id,{n,w:z.w,h:z.h,ins,outs,markup});leaves.push({type:n.type,id:n.id,scope,values:C.clone(sim.values[n.id]),inputs:s.inputs.map((_,i)=>C.clone(sim.portValues[C.key({node:n.id,dir:'in',port:i})])),output:n.type==='output'?C.clone(sim.outputs[n.id]):null});
      }
      const columns=new Map();for(const item of items.values()){const x=item.n.x;if(!columns.has(x))columns.set(x,[]);columns.get(x).push(item);}
      let x=0,height=80;for(const key of [...columns.keys()].sort((a,b)=>a-b)){const column=columns.get(key).sort((a,b)=>a.n.y-b.n.y||a.n.id.localeCompare(b.n.id));let y=0,columnW=0;for(const item of column){item.x=x;item.y=y;y+=item.h+70;columnW=Math.max(columnW,item.w);if(boundary&&item.n.type==='input')inputs[item.n.id]={x:item.x+item.outs[0].x,y:item.y+item.outs[0].y};if(boundary&&item.n.type==='output')outputs[item.n.id]={x:item.x+item.ins[0].x,y:item.y+item.ins[0].y};}height=Math.max(height,y-70);x+=columnW+100;}
      const width=Math.max(152,x-100),anchor=e=>{const item=items.get(e.node);if(!item)return null;const p=(e.dir==='in'?item.ins:item.outs)[e.port];return {x:item.x+p.x,y:item.y+p.y};};
      const net=C.nets(local);let wiring='',floating=0;
      for(const group of net.groups.values()){
        const ps=[...group.ports.values()].map(anchor),j=ps.length?{x:(Math.min(...ps.map(p=>p.x))+Math.max(...ps.map(p=>p.x)))/2,y:(Math.min(...ps.map(p=>p.y))+Math.max(...ps.map(p=>p.y)))/2}:{x:60+(floating++)*130,y:height+45};
        for(const id of group.wires){const w=local.wires.find(w=>w.id===id),a=w.a.node?anchor(w.a):ps.length?j:{x:j.x-45,y:j.y},b=w.b.node?anchor(w.b):ps.length?j:{x:j.x+45,y:j.y};wiring+=stroke([a,{x:j.x,y:a.y},j,{x:j.x,y:b.y},b],sim.wires[id]);}
        if(group.wires.length>1)wiring+=`<circle cx="${j.x}" cy="${j.y}" r="3" fill="${color(sim.wires[group.wires[0]])}"/>`;
      }
      return {w:Math.max(width,floating*130),h:height+(floating?75:0),inputs,outputs,svg:wiring+[...items.values()].map(item=>`<g transform="translate(${item.x} ${item.y})">${item.markup}</g>`).join('')};
    }
    const result=circuit(source);return {...result,leaves,frames};
  }
  return {build};
});
