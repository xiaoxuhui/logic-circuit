(() => {
  'use strict';
  const C=window.LogicCore,$=id=>document.getElementById(id),svg=$('canvas');
  const names={nand:'与非门',input:'输入开关',output:'输出指示灯',hub:'集线器',splitter:'分线器'};
  const subtitles={nand:'NAND',input:'SIGNAL INPUT',output:'SIGNAL OUTPUT',hub:'BUS PACK',splitter:'BUS UNPACK'};
  const desc={nand:'两个输入都是 1 时，输出为 0。',input:'点击开关，给电路一个 0 或 1。',output:'实时显示输入端的信号。',hub:'顶部为最低位 b0，按位打包为总线。',splitter:'将总线拆为单比特，顶部为最低位 b0。',custom:'你封装的电路，拥有独立的内部逻辑。'};
  let counter=0;const uid=prefix=>prefix+Date.now().toString(36)+(counter++).toString(36);
  const initial=()=>({version:1,nodes:[{id:uid('n'),type:'nand',x:0,y:0}],wires:[],definitions:{}});
  let state=initial(),camera={x:0,y:0,scale:1},selected=null,mode='wire',space=false,gesture=null,sim,saveTimer,toastTimer;
  let past=[],future=[],placement=null,busEdit=null,expanded=null;
  const placementPreview=document.createElement('div');placementPreview.className='placement-preview';placementPreview.hidden=true;placementPreview.setAttribute('aria-hidden','true');document.body.append(placementPreview);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const title=n=>n.label||(n.type==='custom'?state.definitions[n.def].name:names[n.type]);
  const snapshot=()=>C.clone({version:1,nodes:state.nodes,wires:state.wires,definitions:state.definitions});
  function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
  function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem('logic-workshop-v1',JSON.stringify({...snapshot(),camera:expanded?expanded.camera:camera}));$('save-status').textContent='已保存到此浏览器';}catch{$('save-status').textContent='存储不可用，请导出备份';}},200);}
  function commit(before){state.definitions=C.pruneDefinitions(state);if(JSON.stringify(before)!==JSON.stringify(snapshot())){past.push(before);if(past.length>60)past.shift();future=[];}render();save();}
  function change(fn){if(expanded){toast('全部收回后即可继续编辑电路');return;}const before=snapshot();fn();commit(before);}
  function restore(s){state=C.clone(s);selected=null;render();save();}
  function undo(){if(!past.length)return;future.push(snapshot());restore(past.pop());}
  function redo(){if(!future.length)return;past.push(snapshot());restore(future.pop());}
  function localPoint(e){const b=svg.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
  function worldPoint(e){const p=localPoint(e);return {x:(p.x-camera.x)/camera.scale,y:(p.y-camera.y)/camera.scale};}
  function setCamera(){
    $('world').setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    $('grid').setAttribute('patternTransform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    $('zoom-label').textContent=Math.round(camera.scale*100)+'%';
  }
  function zoom(factor,p={x:svg.clientWidth/2,y:svg.clientHeight/2}){const scale=Math.max(expanded?.025:.2,Math.min(2.5,camera.scale*factor)),ratio=scale/camera.scale;camera.x=p.x-(p.x-camera.x)*ratio;camera.y=p.y-(p.y-camera.y)*ratio;camera.scale=scale;setCamera();save();}
  function fit(initialView=false){
    if(expanded){const view=expanded.view,fitted=Math.max(.025,Math.min(1,(svg.clientWidth-80)/view.w,(svg.clientHeight-180)/view.h)),scale=initialView?Math.max(.8,fitted):fitted;camera={x:initialView?40:(svg.clientWidth-view.w*scale)/2,y:initialView?140:100+(svg.clientHeight-180-view.h*scale)/2,scale};setCamera();save();return;}
    if(!state.nodes.length){camera={x:svg.clientWidth/2,y:svg.clientHeight/2,scale:1};setCamera();return;}
    const boxes=state.nodes.map(n=>({...n,...C.size(n,state.definitions)})),ps=state.wires.flatMap(w=>C.points(w,state));
    const minX=Math.min(...boxes.map(b=>b.x),...ps.map(p=>p.x)),maxX=Math.max(...boxes.map(b=>b.x+b.w),...ps.map(p=>p.x));
    const minY=Math.min(...boxes.map(b=>b.y),...ps.map(p=>p.y)),maxY=Math.max(...boxes.map(b=>b.y+b.h),...ps.map(p=>p.y));
    const scale=initialView?Math.min(1,svg.clientWidth/320):Math.max(.2,Math.min(1.25,(svg.clientWidth-90)/(maxX-minX||1),(svg.clientHeight-190)/(maxY-minY||1)));
    camera={x:svg.clientWidth*(initialView&&svg.clientWidth>500?.68:.5)-(minX+maxX)/2*scale,y:svg.clientHeight*(initialView?.34:.49)-(minY+maxY)/2*scale,scale};setCamera();if(selected)renderInspector();save();
  }
  function signalClass(bits){return bits?.some(x=>x===1)?'high':'low';}
  function signalText(bits){return !bits?'0':bits.length===1?String(bits[0]||0):bits.slice().reverse().map(x=>x||0).join('');}
  const binary=n=>(n.value||0).toString(2).padStart(n.bits||1,'0');
  function bitSwitches(n,canvas=false){const bits=n.bits||1,cell=Math.min(28,128/bits);return binary(n).split('').map((value,index)=>{const bit=bits-index-1,attrs=`data-bit-toggle="${n.id}" data-bit="${bit}" aria-label="切换 b${bit}" aria-pressed="${value==='1'}"`;return canvas?`<g class="bit-switch ${value==='1'?'high':'low'}" ${attrs} role="button" tabindex="0" transform="translate(${76-bits*cell/2+index*cell} 33)"><title>b${bit} · 点击切换 0/1</title><rect width="${cell-2}" height="31" rx="4"/><text x="${(cell-2)/2}" y="21" text-anchor="middle">${value}</text></g>`:`<button type="button" class="bit-switch ${value==='1'?'high':'low'}" ${attrs} title="b${bit} · 点击切换 0/1">${value}</button>`;}).join('');}
  const decimal=bits=>!bits?0:bits.reduce((value,bit,i)=>value+(bit||0)*2**i,0);
  const path=ps=>ps.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ');
  function renderWires(){
    $('wire-layer').innerHTML=state.wires.map(w=>{const ps=C.points(w,state),bits=sim.wires[w.id],isBus=bits.length>1,mid=ps[Math.floor(ps.length/2)];return `<g class="wire ${selected?.id===w.id?'selected':''}" data-wire="${w.id}"><path class="wire-hit" d="${path(ps)}"/><path class="wire-line ${signalClass(bits)} ${isBus?'bus':''}" d="${path(ps)}"/>${isBus?`<text class="bus-label" x="${mid.x+8}" y="${mid.y-9}">${bits.length}b · ${signalText(bits)}</text>`:''}${[w.a,w.b].filter(e=>!e.node).map(e=>`<circle class="junction" cx="${e.x}" cy="${e.y}" r="3.3"/>`).join('')}</g>`;}).join('');
  }
  function renderNodes(){
    $('node-layer').innerHTML=state.nodes.map(n=>{const z=C.baseSize(n,state.definitions),ps=C.ports({...n,rotation:0},state.definitions),value=n.type==='input'?C.bitArray(n.value||0,n.bits||1):sim.outputs[n.id];const t=title(n),short=t.length>12?t.slice(0,11)+'…':t;
      let symbol='';
      if(n.type==='nand')symbol='<text class="node-glyph" x="76" y="66" text-anchor="middle">⊼</text>';
      else if(n.type==='input')symbol=(n.bits||1)>1?bitSwitches(n,true):`<g class="toggle ${signalClass(value)}" data-toggle="${n.id}" role="button" tabindex="0" aria-label="切换${escape(t)}" aria-pressed="${!!n.value}"><rect x="51" y="32" width="50" height="32" rx="6"/><text x="76" y="54" text-anchor="middle">${signalText(value)}</text></g>`;
      else if(n.type==='output'){const color=signalClass(value)==='high'?'#91e6be':'#7793a8';symbol=value.length>1?`<g class="numeric-display"><rect x="39" y="32" width="74" height="34" rx="4" fill="#0d1c24" stroke="#496675"/><text x="76" y="55" text-anchor="middle" fill="${color}" font-family="monospace" font-size="21">${decimal(value)}</text><text x="76" y="${z.h+27}" text-anchor="middle" fill="#7494a5" font-size="7">DEC · ${value.length} BIT</text></g>`:`<g class="single-indicator"><circle cx="76" cy="49" r="15" fill="${color}18" stroke="${color}"/><text x="76" y="54" text-anchor="middle" fill="${color}" font-family="monospace" font-size="13">${signalText(value)}</text></g>`;}
      else if(n.type==='custom')symbol=`<text x="76" y="${z.h/2+10}" text-anchor="middle" fill="#bca6dd" font-size="23">◇</text>`;
      else symbol=`<path d="M 65 38 L ${n.type==='hub'?87:65} ${z.h/2} L ${n.type==='hub'?65:87} ${z.h-20}" fill="none" stroke="#7dabc4" stroke-width="2"/>`;
      return `<g class="node ${(selected?.type==='nodes'?selected.ids.includes(n.id):selected?.id===n.id)?'selected':''}" data-node="${n.id}" transform="translate(${n.x} ${n.y})"><g transform="${C.rotationTransform(n,state.definitions)}"><title>${escape(t)} · ${escape(desc[n.type])}</title><rect class="body" width="${z.w}" height="${z.h}" rx="9"/><text class="node-title" x="76" y="20" text-anchor="middle">${escape(short)}</text>${symbol}${ps.map(p=>{const bits=sim.portValues[C.key(p)],color=signalClass(bits)==='high'?'#91e6be':'#7c99ac';return `<g class="port" data-port="${p.port}" data-dir="${p.dir}" transform="translate(${p.x-n.x} ${p.y-n.y})"><title>${escape(p.label)} · ${p.width} 位 · ${signalText(bits)}</title><circle r="10" opacity="0"/><circle r="${p.width>1?5.5:4.5}" style="stroke:${color};fill:${signalClass(bits)==='high'?'#91e6be':'#17252e'}"/><text x="${p.dir==='in'?11:-11}" y="3" text-anchor="${p.dir==='in'?'start':'end'}">${escape(p.label.slice(0,9))}</text></g>`;}).join('')}<text class="node-subtitle" x="76" y="${z.h+15}" text-anchor="middle">${escape(n.type==='custom'?'CUSTOM GATE':subtitles[n.type])}</text></g></g>`;
    }).join('');
  }
  function renderInspector(){
    const n=selected?.type==='node'?state.nodes.find(n=>n.id===selected.id):null;
    document.querySelector('.inspector').classList.toggle('has-selection',!!selected);
    if(selected?.type==='nodes'){const count=selected.ids.length;$('selection-panel').innerHTML=`<div class="selection-eyebrow">多选元件</div><div class="selected-name">已选中 ${count} 个元件</div><p class="selection-description">Backspace / Delete 一次删除所选元件和关联导线。<br>Esc 取消选择，Ctrl+Z 撤销删除。</p>`;$('selection-status').textContent='已选中 '+count+' 个元件';return;}
    if(!n){$('selection-panel').innerHTML=selected?'<div class="selection-eyebrow">已选中导线</div><div class="selected-name">电路连接</div><p class="selection-description">按 Delete 删除，或继续从导线分出一条支路。</p>':'<div class="selection-eyebrow">元件属性</div><div class="selected-name">等待你的选择 <span class="micro">↖</span></div><p class="selection-description">点击画布上的元件，<br>查看信号与调整参数。</p>';$('selection-status').textContent=selected?'已选中导线':'选中元件以查看属性';return;}
    $('selection-status').textContent=title(n)+' · X '+Math.round(n.x)+' / Y '+Math.round(n.y);
    const canBits=['input','output','hub','splitter'].includes(n.type),bits=n.bits||1;
    $('selection-panel').innerHTML=`<div class="selection-eyebrow">已选中元件</div><div class="selected-name">${escape(title(n))}<span class="micro">${escape(subtitles[n.type]||'CUSTOM')}</span></div><div class="selection-description">${desc[n.type]}</div><label class="property-row">名称<input id="prop-name" maxlength="24" value="${escape(n.label||'')}" placeholder="${escape(names[n.type]||title(n))}"></label>${canBits?`<label class="property-row">位宽<select id="prop-bits">${Array.from({length:['hub','splitter'].includes(n.type)?7:8},(_,i)=>i+(['hub','splitter'].includes(n.type)?2:1)).map(i=>`<option value="${i}" ${bits===i?'selected':''}>${i} 位</option>`).join('')}</select></label>`:''}${n.type==='input'?`<div class="property-row">输入值 ${bits===1?`<button id="prop-toggle" class="signal-switch ${n.value?'on':''}">${n.value||0} ⇄</button>`:`<div class="bit-switches" aria-label="二进制输入">${bitSwitches(n)}</div>`}</div>`:''}<div style="margin-top:15px">${C.ports(n,state.definitions).map(p=>`<div class="port-reading"><span>${p.dir==='in'?'输入':'输出'} ${escape(p.label)} · ${p.width} 位</span><code>${signalText(sim.portValues[C.key(p)])}</code></div>`).join('')}</div>`;

    if(n.type==='output'&&bits>1){const row=document.createElement('div');row.className='property-row';row.innerHTML='<span>十进制值</span><code class="decimal-value">'+decimal(sim.outputs[n.id])+'</code>';$('selection-panel').append(row);}
    $('prop-name').onchange=e=>change(()=>n.label=e.target.value.trim());
    if($('prop-bits'))$('prop-bits').onchange=e=>{const b=Number(e.target.value);change(()=>resizeBits(n,b));toast('位宽已更新；请检查相连导线的位宽。');};
    if($('prop-toggle'))$('prop-toggle').onclick=()=>toggle(n.id);

    if(window.innerWidth<=980){
      const panel=document.querySelector('.inspector'),close=document.createElement('button');close.className='inspector-close';close.textContent='×';close.title='关闭属性';close.onclick=()=>{selected=null;render();};panel.prepend(close);panel.querySelectorAll('.inspector-close').forEach((b,i)=>{if(i)b.remove();});
      const r=panel.getBoundingClientRect(),b=svg.getBoundingClientRect(),z=C.size(n,state.definitions),left=b.x+camera.x+n.x*camera.scale,top=b.y+camera.y+n.y*camera.scale;
      if(left+z.w*camera.scale>r.left-12&&left<r.right&&top+z.h*camera.scale>r.top-15&&top<r.bottom){camera.y-=Math.min(top+z.h*camera.scale-r.top+20,Math.max(0,top-b.top-110));setCamera();}
    }
  }
  function renderLibrary(){
    const ids=Object.keys(state.definitions).filter(id=>!state.definitions[id].hidden);$('custom-count').textContent=String(ids.length).padStart(2,'0');$('custom-empty').style.display=ids.length?'none':'';
    $('custom-library').innerHTML=ids.map(id=>{const d=state.definitions[id];return `<div class="custom-entry"><button class="component" data-custom="${id}" title="拖出 ${escape(d.name)}；右键从元件库删除"><span class="component-symbol" style="color:#bca6dd">◇</span><span><b>${escape(d.name)}</b><small>${d.inputs.length} 输入 / ${d.outputs.length} 输出</small></span></button><button class="delete-custom" data-delete-custom="${id}" title="删除 ${escape(d.name)}" aria-label="删除保存的逻辑门 ${escape(d.name)}"><span aria-hidden="true">×</span><span class="mobile-delete-label">删除</span></button></div>`;}).join('');
  }
  function deleteSavedGate(id){if(expanded||placement||!Object.hasOwn(state.definitions,id))return;const name=state.definitions[id].name;change(()=>{state=C.deleteDefinition(state,id);});toast('已从“我的逻辑门”删除「'+name+'」，可撤销恢复。');}
  $('custom-library').addEventListener('click',e=>{const b=e.target.closest('[data-delete-custom]');if(b){e.stopPropagation();deleteSavedGate(b.dataset.deleteCustom);}});
  $('custom-library').addEventListener('contextmenu',e=>{const b=e.target.closest('[data-custom],[data-delete-custom]');if(b){e.preventDefault();deleteSavedGate(b.dataset.custom||b.dataset.deleteCustom);}});
  function render(){
    sim=C.simulate(state);if(expanded){$('wire-layer').innerHTML='';$('node-layer').innerHTML=expanded.view.svg;$('draft-layer').innerHTML='';document.querySelector('.inspector').classList.remove('has-selection');$('selection-panel').innerHTML='<div class="selection-eyebrow">已全部展开</div><div class="selected-name">查看内部电路</div><p class="selection-description">所有自定义实例已递归展开。<br>平移、缩放可查看细节，点击线路高亮连接。<br>点击“全部收回”恢复编辑。</p>';$('selection-status').textContent='只读展开 · '+expanded.view.leaves.length+' 个原始元件';}else{renderWires();renderNodes();renderInspector();}renderLibrary();setCamera();
    $('undo').disabled=!!expanded||!past.length;$('redo').disabled=!!expanded||!future.length;$('delete').disabled=!!expanded||!selected;$('rotate').disabled=!!expanded||!['node','nodes'].includes(selected?.type);
    for(const id of ['package','import','new','wire-mode','export-clear'])$(id).disabled=!!expanded;document.querySelectorAll('.library button').forEach(b=>b.disabled=!!expanded);
    $('expand').disabled=!expanded&&!state.nodes.some(n=>n.type==='custom');$('expand').textContent=expanded?'全部收回':'全部展开';$('expand').setAttribute('aria-pressed',String(!!expanded));
    $('onboarding').hidden=!!expanded||!(state.nodes.length===1&&state.nodes[0].type==='nand'&&!state.wires.length);
    $('node-count').textContent=expanded?expanded.view.leaves.length+' 个原始元件 · 只读':state.nodes.length+' 个元件 · '+state.wires.length+' 根导线';
    $('sim-status').textContent=sim.issues.length?'检查连接':'信号已稳定';
    $('sim-dot').style.background=sim.issues.length?'#e5b978':'#91e6be';
    $('sim-detail').textContent=sim.issues[0]||(!state.wires.length?'未接线输入默认为 0（低电平）。':'电路正在实时响应输入变化。');
  }
  function toggleExpanded(){if(gesture||placement||document.querySelector('dialog[open]'))return;if(expanded){const previous=expanded;expanded=null;camera={...previous.camera};setMode(previous.mode);selected=null;render();save();return;}if(!state.nodes.some(n=>n.type==='custom')){toast('先在画布上放置一个自定义门');return;}try{const view=window.LogicExpanded.build(snapshot());expanded={view,camera:{...camera},mode};selected=null;setMode('pan');render();fit(true);}catch(error){toast(error.message);}}
  function placementNode(type,def){const n={id:uid('n'),type,x:0,y:0};if(type==='input')n.value=0;if(type==='hub'||type==='splitter')n.bits=2;if(type==='custom')n.def=def;return n;}
  function previewPlacement(e){
    if(!placement)return;const g=placement,n=g.node,z=C.size(n,state.definitions),r=svg.getBoundingClientRect(),hit=document.elementFromPoint(e.clientX,e.clientY),inside=e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom&&(hit===svg||svg.contains(hit)),scale=inside?camera.scale:1;
    g.inside=inside;g.point={clientX:e.clientX,clientY:e.clientY};g.moved=g.moved||Math.hypot(e.clientX-g.start.x,e.clientY-g.start.y)>5;
    placementPreview.style.left=(e.clientX-(z.w/2+8)*scale)+'px';placementPreview.style.top=(e.clientY-(z.h/2+8)*scale)+'px';placementPreview.style.width=(z.w+16)*scale+'px';placementPreview.style.height=(z.h+16)*scale+'px';placementPreview.classList.toggle('can-drop',inside);
    placementPreview.innerHTML=`<svg viewBox="-8 -8 ${z.w+16} ${z.h+16}" width="100%" height="100%"><g class="node selected"><rect class="body" width="${z.w}" height="${z.h}" rx="9"/><text class="node-title" x="76" y="20" text-anchor="middle">${escape(title(n))}</text><text x="76" y="${z.h/2+15}" text-anchor="middle" fill="#91e6be" font-size="30">${({nand:'⊼',input:'01',output:'◉',hub:'⇥',splitter:'⇤',custom:'◇'})[n.type]}</text>${C.ports(n,state.definitions).map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5" fill="#17252e" stroke="#91e6be"/>`).join('')}</g></svg>`;
  }
  function endPlacement(e,cancel=false){
    if(!placement)return;const g=placement;if(e&&e.pointerId!==undefined&&e.pointerId!==g.pointerId)return;if(e&&!cancel)previewPlacement(e);placement=null;placementPreview.hidden=true;document.body.classList.remove('placing-component');g.source.classList.remove('being-dragged');if(g.source.hasPointerCapture(g.pointerId))g.source.releasePointerCapture(g.pointerId);
    if(cancel||!g.moved||!g.inside)return;
    const p=worldPoint(g.point);if(['hub','splitter'].includes(g.node.type)){openBusDialog(g.node,p);return;}const z=C.size(g.node,state.definitions);g.node.x=Math.round((p.x-z.w/2)/12)*12;g.node.y=Math.round((p.y-z.h/2)/12)*12;
    change(()=>{state.nodes.push(g.node);selected={type:'node',id:g.node.id};});
  }
  document.querySelector('.library').addEventListener('pointerdown',e=>{
    const source=e.target.closest('[data-add],[data-custom]');if(!source||e.button!==0||gesture||placement||expanded)return;if(state.nodes.length>=500)return toast('当前画布已达 500 个元件');
    placement={node:placementNode(source.dataset.add||'custom',source.dataset.custom),source,pointerId:e.pointerId,start:{x:e.clientX,y:e.clientY},moved:false};source.setPointerCapture(e.pointerId);source.classList.add('being-dragged');document.body.classList.add('placing-component');placementPreview.hidden=false;previewPlacement(e);e.preventDefault();
  });
  document.addEventListener('pointermove',e=>{if(placement&&e.pointerId===placement.pointerId){previewPlacement(e);e.preventDefault();}},{passive:false});
  document.addEventListener('pointerup',e=>endPlacement(e));document.addEventListener('pointercancel',e=>endPlacement(e,true));
  document.addEventListener('lostpointercapture',e=>{if(placement&&e.pointerId===placement.pointerId)endPlacement(e,true);});
  function rotateSelected(){if(expanded||gesture||placement)return;const ids=selected?.type==='nodes'?selected.ids:selected?.type==='node'?[selected.id]:[];if(!ids.length)return;change(()=>{for(const n of state.nodes.filter(n=>ids.includes(n.id))){const before=C.size(n,state.definitions);n.rotation=((n.rotation||0)+90)%360;const after=C.size(n,state.definitions);n.x+=(before.w-after.w)/2;n.y+=(before.h-after.h)/2;}});}
  function toggle(id){const n=state.nodes.find(n=>n.id===id);if(!n)return;change(()=>{n.value=((n.value||0)+1)%(2**(n.bits||1));selected={type:'node',id};});}
  function toggleBit(id,bit){const n=state.nodes.find(n=>n.id===id);if(!n||n.type!=='input'||!Number.isInteger(bit)||bit<0||bit>=(n.bits||1))return;change(()=>{n.value=(n.value||0)^(2**bit);selected={type:'node',id};});}
  function activateBit(target){const id=target.dataset.bitToggle,bit=Number(target.dataset.bit),panel=target.closest('#selection-panel'),focused=document.activeElement===target;toggleBit(id,bit);if(focused)(panel?$('selection-panel'):svg).querySelector(`[data-bit-toggle="${id}"][data-bit="${bit}"]`)?.focus({preventScroll:true});}
  document.addEventListener('click',e=>{const t=e.target.closest('[data-bit-toggle]');if(t)activateBit(t);});
  document.addEventListener('keydown',e=>{const t=e.target.closest('[data-bit-toggle]');if(t&&['Enter',' '].includes(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();e.stopPropagation();activateBit(t);}},true);
  function resizeBits(n,bits){n.bits=bits;n.value=(n.value||0)%(2**bits);state.wires=state.wires.filter(w=>[w.a,w.b].every(e=>e.node!==n.id||C.ports(n,state.definitions).some(p=>p.dir===e.dir&&p.port===e.port)));}
  function updateBusSummary(){if(!busEdit)return;const value=$('bus-count').value.trim(),count=/^[0-9]+$/.test(value)?Number(value):0,hub=busEdit.node.type==='hub';$('bus-summary').textContent=count>=2&&count<=8?(hub?count+' 根单比特线 → 1 条 '+count+' 位总线':'1 条 '+count+' 位总线 → '+count+' 根单比特线'):(hub?'输入要合成一条总线的单比特线数量。':'输入要从一条总线拆出的单比特线数量。');}
  function openBusDialog(node,center=null){busEdit={node,center};$('bus-heading').textContent='设置'+names[node.type]+'线数';$('bus-count').value=center?'':String(node.bits);$('bus-error').textContent='';$('bus-confirm').textContent=center?'放置元件':'应用';updateBusSummary();$('bus-dialog').showModal();$('bus-count').focus();if(!center)$('bus-count').select();}
  $('bus-count').oninput=()=>{updateBusSummary();$('bus-error').textContent='';};
  $('bus-dialog').addEventListener('close',()=>{if(!$('bus-dialog').open)busEdit=null;});
  $('bus-form').onsubmit=e=>{e.preventDefault();if(!busEdit)return;const value=$('bus-count').value.trim(),count=Number(value);if(!/^[0-9]+$/.test(value)||!Number.isInteger(count)||count<2||count>8){$('bus-error').textContent='线数请输入 2–8 之间的整数';return;}const {node,center}=busEdit;if(center){node.bits=count;const z=C.size(node,state.definitions);node.x=Math.round((center.x-z.w/2)/12)*12;node.y=Math.round((center.y-z.h/2)/12)*12;change(()=>{state.nodes.push(node);selected={type:'node',id:node.id};});}else{const current=state.nodes.find(n=>n.id===node.id);if(!current){$('bus-dialog').close();return;}change(()=>{resizeBits(current,count);selected={type:'node',id:current.id};});}busEdit=null;$('bus-dialog').close();};
  function remove(target=selected){if(!target)return;change(()=>{if(target.type==='node'||target.type==='nodes'){const ids=new Set(target.type==='nodes'?target.ids:[target.id]);state.nodes=state.nodes.filter(n=>!ids.has(n.id));state.wires=state.wires.filter(w=>!ids.has(w.a.node)&&!ids.has(w.b.node));}else state.wires=state.wires.filter(w=>w.id!==target.id);selected=null;});}
  function endpoint(p){return p.node?{node:p.node,dir:p.dir,port:p.port}:{x:p.x,y:p.y};}
  function snap(p){
    const threshold=14/camera.scale;let closest=null,dist=threshold;
    for(const n of state.nodes)for(const q of C.ports(n,state.definitions)){const d=C.distance(p,q);if(d<dist){closest=q;dist=d;}}
    if(closest)return {anchor:endpoint(closest),point:closest,snapped:true};
    for(const w of state.wires){const ps=C.points(w,state);for(let i=1;i<ps.length;i++){const q=C.project(p,ps[i-1],ps[i]),d=C.distance(p,q);if(d<dist){closest=q;dist=d;}}}
    const point=closest||{x:Math.round(p.x/12)*12,y:Math.round(p.y/12)*12};return {anchor:endpoint(point),point,snapped:!!closest};
  }
  function setMode(next){mode=next;$('wire-mode').classList.toggle('active',mode==='wire');$('pan-mode').classList.toggle('active',mode==='pan');svg.classList.toggle('panning',mode==='pan'||space);}
  svg.addEventListener('contextmenu',e=>e.preventDefault());
  svg.addEventListener('pointerdown',e=>{
    if(![0,1,2].includes(e.button)||gesture||placement)return;if(expanded&&e.button===0&&e.target.closest('[data-expanded-net]'))return;
    const p=worldPoint(e),nodeEl=e.target.closest('[data-node]'),port=e.target.closest('[data-port]'),wire=e.target.closest('[data-wire]'),toggleEl=e.target.closest('[data-toggle]');
    if(e.button===2&&(nodeEl||wire)){gesture={type:'right-delete',target:{type:nodeEl?'node':'wire',id:nodeEl?nodeEl.dataset.node:wire.dataset.wire},start:localPoint(e),moved:false,pointerId:e.pointerId};}
    else if(e.button===2||e.button===1||space||mode==='pan'){gesture={type:'pan',start:localPoint(e),camera:{...camera}};svg.classList.add('dragging');}
    else if(e.target.matches('input'))return;
    else if(toggleEl||e.target.closest('[data-bit-toggle]'))return;
    else if(port){const n=state.nodes.find(n=>n.id===nodeEl.dataset.node),q=C.ports(n,state.definitions).find(q=>q.dir===port.dataset.dir&&q.port===Number(port.dataset.port));gesture={type:'wire',start:q,a:endpoint(q),current:q,moved:false};}
    else if(nodeEl){const n=state.nodes.find(n=>n.id===nodeEl.dataset.node);selected={type:'node',id:n.id};gesture={type:'node',id:n.id,start:p,x:n.x,y:n.y,before:snapshot(),moved:false};render();}
    else {const s=snap(p);gesture={type:'wire',start:s.point,a:s.anchor,current:s.point,moved:false,wire:wire?.dataset.wire};}
    if(gesture){svg.setPointerCapture(e.pointerId);svg.focus({preventScroll:true});e.preventDefault();}
  });
  svg.addEventListener('pointermove',e=>{
    const p=worldPoint(e);$('coords').textContent='X '+Math.round(p.x)+' · Y '+Math.round(p.y);if(!gesture)return;
    if(gesture.type==='right-delete'){gesture.moved=gesture.moved||C.distance(localPoint(e),gesture.start)>6;}
    else if(gesture.type==='pan'){const q=localPoint(e);camera.x=gesture.camera.x+q.x-gesture.start.x;camera.y=gesture.camera.y+q.y-gesture.start.y;setCamera();}
    else if(gesture.type==='node'){const n=state.nodes.find(n=>n.id===gesture.id);if(!n)return;gesture.moved=gesture.moved||C.distance(p,gesture.start)*camera.scale>5;if(!gesture.moved)return;n.x=Math.round((gesture.x+p.x-gesture.start.x)/12)*12;n.y=Math.round((gesture.y+p.y-gesture.start.y)/12)*12;sim=C.simulate(state);renderWires();renderNodes();}
    else {const s=snap(p);gesture.current=s.point;gesture.b=s.anchor;gesture.moved=C.distance(gesture.start,p)*camera.scale>6;const a=gesture.start,b=s.point,x=(a.x+b.x)/2;$('draft-layer').innerHTML=`<path class="draft" d="M${a.x},${a.y} H${x} V${b.y} H${b.x}"/>${s.snapped?`<circle class="snap-ring" cx="${b.x}" cy="${b.y}" r="10"/>`:''}`;}
  });
  function finish(e,cancel=false){
    if(!gesture)return;const g=gesture;gesture=null;svg.classList.remove('dragging');$('draft-layer').innerHTML='';if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
    if(g.type==='right-delete'){if(cancel||g.moved||C.distance(localPoint(e),g.start)>6)return;const hit=document.elementFromPoint(e.clientX,e.clientY),target=hit?.closest(g.target.type==='node'?'[data-node]':'[data-wire]');if(target&&(g.target.type==='node'?target.dataset.node:target.dataset.wire)===g.target.id)remove(g.target);return;}
    if(g.type==='pan'){save();return;}
    if(g.type==='node'){if(cancel)state=g.before;else commit(g.before);render();const n=state.nodes.find(n=>n.id===g.id);if(!cancel&&!g.moved&&n&&['hub','splitter'].includes(n.type))openBusDialog(n);return;}
    if(cancel)return;
    if(g.moved){if(state.wires.length>=1500)return toast('当前画布已达 1500 根导线');const b=g.b||snap(worldPoint(e)).anchor;if(JSON.stringify(g.a)===JSON.stringify(b))return;change(()=>{const w={id:uid('w'),a:g.a,b};state.wires.push(w);selected={type:'wire',id:w.id};});if(sim.issues.length)toast(sim.issues[0]);}
    else {selected=g.wire?{type:'wire',id:g.wire}:null;renderInspector();$('delete').disabled=!selected;}
  }
  svg.addEventListener('pointerup',e=>finish(e));svg.addEventListener('pointercancel',e=>finish(e,true));
  function highlightExpanded(target){const net=target.closest('[data-expanded-net]');svg.querySelectorAll('[data-expanded-net]').forEach(el=>{el.classList.toggle('is-focused',!!net&&el===net);el.classList.toggle('is-muted',!!net&&el!==net);});$('selection-status').textContent=net?net.dataset.description:'只读展开 · 点击线路可追踪连接';}
  svg.addEventListener('click',e=>{if(expanded){highlightExpanded(e.target);return;}const t=e.target.closest('[data-toggle]');if(t)toggle(t.dataset.toggle);});
  svg.addEventListener('keydown',e=>{if(expanded&&['Enter',' '].includes(e.key)&&e.target.closest('[data-expanded-net]')){e.preventDefault();e.stopPropagation();highlightExpanded(e.target);}});
  svg.addEventListener('keydown',e=>{const t=e.target.closest('[data-toggle]');if(t&&['Enter',' '].includes(e.key)){e.preventDefault();toggle(t.dataset.toggle);}});
  svg.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.0013),localPoint(e));},{passive:false});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&placement){e.preventDefault();endPlacement(null,true);return;}
    if(e.target.matches('input,select,textarea')||e.target.isContentEditable||document.querySelector('dialog[open]')||placement)return;
    if(expanded){if(e.key==='Escape'){e.preventDefault();toggleExpanded();}else if(['Backspace','Delete'].includes(e.key)||e.ctrlKey||e.metaKey)e.preventDefault();return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();if(gesture)return;selected=state.nodes.length?{type:'nodes',ids:state.nodes.map(n=>n.id)}:null;window.getSelection()?.removeAllRanges();render();return;}
    if(e.code==='Space'){e.preventDefault();if(!e.repeat)rotateSelected();return;}
    if(e.key==='Escape'){if(gesture){if(gesture.type==='node')state=gesture.before;gesture=null;$('draft-layer').innerHTML='';}selected=null;render();}
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
    if(!e.ctrlKey&&!e.metaKey){if(e.key.toLowerCase()==='h')setMode('pan');if(e.key.toLowerCase()==='w')setMode('wire');}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;setMode(mode);}});
  window.addEventListener('blur',()=>{endPlacement(null,true);if(gesture?.type==='right-delete'){const id=gesture.pointerId;gesture=null;if(svg.hasPointerCapture(id))svg.releasePointerCapture(id);}space=false;setMode(mode);});
  $('wire-mode').onclick=()=>setMode('wire');$('pan-mode').onclick=()=>setMode('pan');$('undo').onclick=undo;$('redo').onclick=redo;$('delete').onclick=()=>remove();
  $('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);$('fit').onclick=()=>fit();
  $('expand').onclick=toggleExpanded;$('rotate').onclick=rotateSelected;
  $('help').onclick=()=>$('help-dialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('package').onclick=()=>{try{const d=C.makeDefinition(state,'新逻辑门');$('package-summary').textContent=d.inputs.length+' 个输入 · '+d.outputs.length+' 个输出 · '+state.nodes.length+' 个元件';$('package-error').textContent='';$('package-dialog').showModal();$('gate-name').focus();}catch(e){toast(e.message);}};
  $('package-form').onsubmit=e=>{e.preventDefault();try{if(Object.keys(state.definitions).length>=80)throw Error('自定义门数量已达 80 个');const d=C.makeDefinition(state,$('gate-name').value);change(()=>state.definitions[uid('g')]=d);$('package-dialog').close();$('gate-name').value='';toast('已封装「'+d.name+'」，可以在左侧元件库找到它。');}catch(e){$('package-error').textContent=e.message;}};
  $('new').onclick=()=>$('new-dialog').showModal();$('confirm-new').onclick=()=>{change(()=>{state={...initial(),definitions:state.definitions};selected=null;});fit(true);$('new-dialog').close();};
  function exportAll(){const blob=new Blob([JSON.stringify({...snapshot(),camera:expanded?expanded.camera:camera},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');try{a.href=url;a.download='逻辑工坊-全部存档.json';document.body.append(a);a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}}
  $('export').onclick=()=>{try{exportAll();toast('全部电路与自定义门已导出到一个存档文件');}catch{toast('导出失败，原内容已保留，请重试');}};
  $('export-clear').onclick=()=>{if(expanded||gesture||placement)return;$('export-clear-summary').textContent=state.nodes.length+' 个元件 · '+state.wires.length+' 根导线 · '+Object.values(state.definitions).filter(d=>!d.hidden).length+' 个自定义门';$('export-clear-dialog').showModal();};
  $('confirm-export-clear').onclick=()=>{if(expanded)return;try{exportAll();}catch{toast('导出失败，原内容已保留，请重试');return;}change(()=>{state={version:1,nodes:[],wires:[],definitions:{}};selected=null;});$('export-clear-dialog').close();toast('已导出并全部清空；取消下载或想恢复时，按 Ctrl+Z');};
  function importAllText(text){if(new TextEncoder().encode(text).length>2*1024*1024)throw Error('存档过大，请使用 2MB 以内的内容');const next=C.validate(JSON.parse(text));if(expanded)throw Error('全部收回后即可导入');change(()=>{state=next;selected=null;});if(next.camera){camera=next.camera;setCamera();}else fit();toast('全部内容已导入，可以撤销恢复');}
  $('import').onclick=()=>{$('import-text').value='';$('import-error').textContent='';$('import-dialog').showModal();$('import-text').focus();};
  $('import-file').onclick=()=>$('file-input').click();
  $('import-form').onsubmit=e=>{e.preventDefault();try{importAllText($('import-text').value);$('import-dialog').close();}catch(error){$('import-error').textContent=error instanceof SyntaxError?'存档不是有效 JSON，请粘贴完整文字':error.message;}};
  $('copy-save').onclick=async()=>{const field=$('import-text'),text=JSON.stringify({...snapshot(),camera:expanded?expanded.camera:camera},null,2);field.value=text;field.focus();field.select();$('import-error').textContent='';try{await navigator.clipboard.writeText(text);toast('完整存档文字已复制，粘贴到“全部导入”即可恢复');}catch{toast('存档文字已选中，请按 Ctrl+C 复制');}};
  $('file-input').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2*1024*1024)throw Error('存档过大，请使用 2MB 以内的内容');importAllText(await f.text());$('import-dialog').close();}catch(error){toast(error instanceof SyntaxError?'文件不是有效 JSON':error.message);}e.target.value='';};
  // Activate touch controls directly on release. Some mobile browsers suppress
  // compatibility clicks after a captured SVG drag. Guard the later native
  // click so that a single tap never invokes a control twice.
  let touchButton=null,lastTouch=null;
  document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){const button=e.target.closest('button,[data-toggle],[data-bit-toggle]');touchButton=button?{button,x:e.clientX,y:e.clientY,id:e.pointerId}:null;}},true);
  document.addEventListener('pointercancel',()=>{touchButton=null;},true);
  document.addEventListener('pointerup',e=>{const t=touchButton;touchButton=null;if(e.pointerType!=='touch'||!t||t.id!==e.pointerId||t.button!==e.target.closest('button,[data-toggle],[data-bit-toggle]')||t.button.disabled||Math.hypot(e.clientX-t.x,e.clientY-t.y)>12)return;lastTouch={button:t.button,time:Date.now(),x:e.clientX,y:e.clientY};e.preventDefault();if(t.button.dataset.toggle)toggle(t.button.dataset.toggle);else if(t.button.dataset.bitToggle)activateBit(t.button);else t.button.click();},true);
  document.addEventListener('click',e=>{if(!e.isTrusted||!lastTouch||Date.now()-lastTouch.time>=700)return;const hit=e.target.closest('button,[data-toggle],[data-bit-toggle]'),sameButton=hit===lastTouch.button||(lastTouch.button.dataset.bitToggle&&hit?.dataset.bitToggle===lastTouch.button.dataset.bitToggle&&hit.dataset.bit===lastTouch.button.dataset.bit)||(lastTouch.button.dataset.toggle&&hit?.dataset.toggle===lastTouch.button.dataset.toggle),deletedRowClick=lastTouch.button.dataset.deleteCustom&&(e.pointerType==='touch'||e.sourceCapabilities?.firesTouchEvents)&&Math.hypot(e.clientX-lastTouch.x,e.clientY-lastTouch.y)<=12;if(sameButton||deletedRowClick){e.preventDefault();e.stopImmediatePropagation();}},true);
  let restored=false;
  try{const raw=localStorage.getItem('logic-workshop-v1');if(raw){state=C.validate(JSON.parse(raw));if(state.camera){camera=state.camera;restored=true;}}}catch{toast('上次的存档无法读取，已打开新画布。');}
  render();if(!restored)fit(true);
  let oldWidth=svg.clientWidth,oldHeight=svg.clientHeight;new ResizeObserver(()=>{const w=svg.clientWidth,h=svg.clientHeight;camera.x+=(w-oldWidth)/2;camera.y+=(h-oldHeight)/2;oldWidth=w;oldHeight=h;setCamera();}).observe(svg);
  window.LogicApp={getState:()=>C.clone({...snapshot(),camera:expanded?expanded.camera:camera}),getSimulation:()=>C.clone(sim),getView:()=>({expanded:!!expanded,leafCount:expanded?.view.leaves.length||0,camera:{...camera}})};
})();
