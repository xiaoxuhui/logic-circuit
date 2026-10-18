(() => {
  'use strict';
  const C=window.LogicCore,$=id=>document.getElementById(id),svg=$('canvas'),simulate=C.createSimulator(),countComponents=C.createComponentCounter();
  const names={nand:'与非门',delay:'延迟线',input:'输入开关',output:'输出指示灯',hub:'集线器',splitter:'分线器'};
  const formatNames={unsigned:'无符号十进制',signed:'有符号十进制',hex:'十六进制'};
  const subtitles={nand:'NAND',delay:'ONE STEP DELAY',input:'SIGNAL INPUT',output:'SIGNAL OUTPUT',hub:'BUS PACK',splitter:'BUS UNPACK'};
  const desc={delay:'先接收输入，下一步运行时才输出。点击“全部清零”后，所有延迟线输出为 0。',nand:'两个输入都是 1 时，输出为 0。',input:'点击开关，给电路一个 0 或 1。',output:'实时显示输入端的信号。',hub:'顶部为最低位 b0，按位打包为总线。',splitter:'将总线拆为单比特，顶部为最低位 b0。',custom:'你封装的电路，拥有独立的内部逻辑。'};
  let counter=0;const uid=prefix=>prefix+Date.now().toString(36)+(counter++).toString(36);
  const initial=()=>({version:1,nodes:[{id:uid('n'),type:'nand',x:0,y:0}],wires:[],definitions:{}});
  let state=initial(),camera={x:0,y:0,scale:1},selected=null,mode='wire',space=false,gesture=null,sim,saveTimer,toastTimer,unreadableSave=null;
  let past=[],future=[],placement=null,busEdit=null,expanded=null,gateEditor=null,pastePreview=null,lastPointer=null,storageReadFailed=false,recoveryPending=false,wireInspectorTarget=null,delayInspectorTarget=null;
  const pasteLayer=document.createElementNS('http://www.w3.org/2000/svg','g');pasteLayer.setAttribute('class','paste-preview');pasteLayer.setAttribute('data-paste-preview','');pasteLayer.style.display='none';$('world').append(pasteLayer);
  const placementPreview=document.createElement('div');placementPreview.className='placement-preview';placementPreview.hidden=true;placementPreview.setAttribute('aria-hidden','true');document.body.append(placementPreview);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const title=n=>n.label||(n.type==='custom'?state.definitions[n.def].name:names[n.type]);
  const snapshot=()=>C.clone({version:1,nodes:state.nodes,wires:state.wires,definitions:state.definitions,delayState:state.delayState||{},displayFormat:state.displayFormat||'unsigned',wireOverrides:state.wireOverrides||{},scopedWireOverrides:state.scopedWireOverrides||{},...(gateEditor?{editorRoot:gateEditor.root}:{})});
  function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
  const backupKey='logic-workshop-refresh-backups-v1';
  const saveText=()=>unreadableSave??JSON.stringify({...storedSnapshot(),camera:gateEditor?gateEditor.camera:expanded?expanded.camera:camera});
  function readBackups(){try{const items=JSON.parse(localStorage.getItem(backupKey)||'[]');return Array.isArray(items)?items.filter(item=>typeof item?.text==='string'&&typeof item.time==='string').slice(0,10):[];}catch{return [];}}
  function writeStored(key,text){try{localStorage.setItem(key,text);return localStorage.getItem(key)===text;}catch{return false;}}
  function backupText(text,reason,recoverFrom){
    if(!text)return false;
    try{let items=readBackups();if(items[0]?.text===text&&items[0].reason===reason&&items[0].recoverFrom===recoverFrom)return true;items=[{time:new Date().toISOString(),reason,text,...(recoverFrom===undefined?{}:{recoverFrom})},...items.filter(item=>item.text!==text)].slice(0,10);
      while(items.length){if(writeStored(backupKey,JSON.stringify(items)))return true;items.pop();}
    }catch{}return false;
  }
  function checkpoint(reason,backupOnSuccess=true){
    clearTimeout(saveTimer);
    try{
      if(storageReadFailed)throw Error('原存档读取失败');
      const text=saveText();let previous;try{previous=localStorage.getItem('logic-workshop-v1');}catch{}
      const saved=unreadableSave===null?writeStored('logic-workshop-v1',text):previous===text;
      const backed=(backupOnSuccess||!saved||recoveryPending)&&backupText(text,saved?reason:'自动恢复备份',saved?undefined:previous);
      if(backed)recoveryPending=!saved;
      $('save-status').textContent=saved?'已保存到此浏览器':backed?'主存档保存失败，已自动备份':'保存和备份失败，请先导出存档';
      return saved||backed;
    }catch{$('save-status').textContent='保存失败，请留在本页并导出存档';return false;}
  }
  function preserveBeforeLeave(e){if(checkpoint('刷新或关闭前'))return;if(e?.type==='beforeunload'){e.preventDefault();e.returnValue='';}toast('保存和备份未成功，请取消刷新，先全部导出存档');}
  window.addEventListener('beforeunload',preserveBeforeLeave);window.addEventListener('pagehide',preserveBeforeLeave);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')checkpoint('切换页面前');});
  function showBackups(){const items=readBackups();$('backup-list').innerHTML=items.length?items.map((item,i)=>{let detail='原始存档';try{const data=JSON.parse(item.text);detail=(data.nodes?.length||0)+' 个元件 · '+(data.wires?.length||0)+' 根导线 · '+Object.keys(data.definitions||{}).length+' 个自定义门';}catch{}return '<div class="backup-entry"><div><strong>'+escape(new Date(item.time).toLocaleString('zh-CN',{hour12:false}))+'</strong><small>'+escape(detail+' · '+item.reason)+'</small></div><button class="subtle" data-restore-backup="'+i+'">恢复</button></div>';}).join(''):'<p>还没有备份。刷新、关闭或删除时会自动备份。</p>';$('backup-error').textContent='';$('backup-dialog').showModal();}
  $('backups').onclick=showBackups;
  $('backup-list').onclick=e=>{const button=e.target.closest('[data-restore-backup]');if(!button)return;const item=readBackups()[Number(button.dataset.restoreBackup)];if(!item)return;try{C.validate(JSON.parse(item.text));backupText(saveText(),'恢复其他备份前');if(gesture||placement)throw Error('请先结束当前拖动操作');if(gateEditor){if(expanded?.libraryView)setGateMode('edit');finishGateEditing();}else while(expanded)returnToCircuit();importAllText(item.text);$('backup-dialog').close();}catch(error){$('backup-error').textContent=error.message;}};
  function save(){if(unreadableSave!==null||storageReadFailed){$('save-status').textContent='原存档已保留，请先导出备份';return;}clearTimeout(saveTimer);saveTimer=setTimeout(()=>checkpoint('自动保存恢复点',false),200);}
  function commit(before){
    const missing=(a,b)=>{const ids=new Set(b.map(item=>item.id));return a.some(item=>!ids.has(item.id));};
    const removed=missing(before.nodes,state.nodes)||missing(before.wires,state.wires)||Object.keys(before.definitions).some(id=>!state.definitions[id]||(!before.definitions[id].hidden&&state.definitions[id].hidden));
    if(removed){const original=C.clone(before.editorRoot||before);delete original.editorRoot;delete original.wireOverrides;delete original.scopedWireOverrides;backupText(JSON.stringify({...original,camera:gateEditor?gateEditor.camera:camera}),'删除前');}
    if(gateEditor){try{gateEditor.root=C.updateDefinition({...gateEditor.root,definitions:state.definitions,displayFormat:state.displayFormat||'unsigned'},gateEditor.id,state);state.definitions=gateEditor.root.definitions;}catch(error){state=C.clone(before);if(before.editorRoot){gateEditor.root=C.clone(before.editorRoot);state.definitions=gateEditor.root.definitions;}toast(error.message);render();return;}}state.definitions=C.pruneDefinitions(gateEditor?gateEditor.root:state);if(gateEditor)gateEditor.root.definitions=state.definitions;if(JSON.stringify(before)!==JSON.stringify(snapshot())){past.push(before);if(past.length>60)past.shift();future=[];}if(removed)backupText(saveText(),'删除后');render();save();}
  function change(fn){if(unreadableSave!==null||storageReadFailed){toast('原存档读取失败，已保留；请先全部导出备份，再导入恢复');return;}if(expanded){toast(expanded.libraryView?'切换到编辑模式后可修改':'全部收回后即可继续编辑电路');return;}cancelPaste();const before=snapshot();fn();commit(before);}
  function restore(s){stopRunning();state=C.clone(s);if(gateEditor&&s.editorRoot){gateEditor.root=C.clone(s.editorRoot);state.definitions=gateEditor.root.definitions;delete state.editorRoot;}selected=null;render();save();}
  function undo(){if(!past.length)return;future.push(snapshot());restore(past.pop());}
  function redo(){if(!future.length)return;past.push(snapshot());restore(future.pop());}
  function localPoint(e){const b=svg.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
  function worldPoint(e){const p=localPoint(e);return {x:(p.x-camera.x)/camera.scale,y:(p.y-camera.y)/camera.scale};}
  let cameraMotionUntil=0;
  function setCamera(moving=false){
    $('world').setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    $('grid').setAttribute('patternTransform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
    $('zoom-label').textContent=Math.round(camera.scale*100)+'%';
    if(expanded?.view.compact){if(moving){cameraMotionUntil=performance.now()+100;showPanImage();scheduleViewportDraw();}else drawExpanded();}
  }
  function zoom(factor,p={x:svg.clientWidth/2,y:svg.clientHeight/2},moving=false){const scale=Math.max(expanded?.025:.2,Math.min(2.5,camera.scale*factor)),ratio=scale/camera.scale;camera.x=p.x-(p.x-camera.x)*ratio;camera.y=p.y-(p.y-camera.y)*ratio;camera.scale=scale;setCamera(moving);save();}
  function fit(initialView=false){
    if(expanded){const view=expanded.view,top=expanded.instanceView?180:100,bottom=expanded.instanceView?140:80,fitted=Math.max(.025,Math.min(1,(svg.clientWidth-80)/view.w,(svg.clientHeight-top-bottom)/view.h)),scale=initialView?Math.max(.8,fitted):fitted;camera={x:initialView?40:(svg.clientWidth-view.w*scale)/2,y:initialView?140:top+(svg.clientHeight-top-bottom-view.h*scale)/2,scale};setCamera();save();return;}
    if(!state.nodes.length){camera={x:svg.clientWidth/2,y:svg.clientHeight/2,scale:1};setCamera();return;}
    const boxes=state.nodes.map(n=>({...n,...C.size(n,state.definitions)})),ps=state.wires.flatMap(w=>C.points(w,state));
    const minX=Math.min(...boxes.map(b=>b.x),...ps.map(p=>p.x)),maxX=Math.max(...boxes.map(b=>b.x+b.w),...ps.map(p=>p.x));
    const minY=Math.min(...boxes.map(b=>b.y),...ps.map(p=>p.y)),maxY=Math.max(...boxes.map(b=>b.y+b.h),...ps.map(p=>p.y));
    const scale=initialView?Math.min(1,svg.clientWidth/320):Math.max(.2,Math.min(1.25,(svg.clientWidth-90)/(maxX-minX||1),(svg.clientHeight-190)/(maxY-minY||1)));
    camera={x:svg.clientWidth*(initialView&&svg.clientWidth>500?.68:.5)-(minX+maxX)/2*scale,y:svg.clientHeight*(initialView?.34:.49)-(minY+maxY)/2*scale,scale};setCamera();if(selected)renderInspector();save();
  }
  function signalClass(bits){return bits?.some(x=>x===1)?'high':'low';}
  function signalText(bits){return !bits?'0':bits.length===1?String(bits[0]||0):bits.slice().reverse().map(x=>x||0).join('');}
  const binary=n=>C.bitArray(n.value||0,n.bits||1).reverse().join('');
  function bitSwitches(n,canvas=false){const bits=n.bits||1,cell=24,center=C.baseSize(n,state.definitions).w/2;return binary(n).split('').map((value,index)=>{const bit=bits-index-1,attrs=`data-bit-toggle="${n.id}" data-bit="${bit}" aria-label="切换 b${bit}" aria-pressed="${value==='1'}"`;return canvas?`<g class="bit-switch ${value==='1'?'high':'low'}" ${attrs} role="button" tabindex="0" transform="translate(${center-bits*cell/2+index*cell} 33)"><title>b${bit} · 点击切换 0/1</title><rect width="${cell-2}" height="31" rx="4"/><text x="${(cell-2)/2}" y="21" text-anchor="middle" style="font-size:14px">${value}</text></g>`:`<button type="button" class="bit-switch ${value==='1'?'high':'low'}" ${attrs} title="b${bit} · 点击切换 0/1">${value}</button>`;}).join('');}
  const decimal=bits=>C.decimal(bits||[0]);
  function digitCells(text,center){return [...String(text)].map((digit,i)=>`<g class="digit-cell" transform="translate(${center-text.length*12+i*24} 33)"><rect width="22" height="31" rx="4"/><text x="11" y="21" text-anchor="middle">${digit}</text></g>`).join('');}
  const path=ps=>ps.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ');
  function renderWires(target=$('wire-layer')){
    target.innerHTML=state.wires.map(w=>{const ps=C.points(w,state),bits=sim.wires[w.id],isBus=bits.length>1,mid=ps[Math.floor(ps.length/2)];return `<g class="wire ${selected?.id===w.id?'selected':''}" data-wire="${w.id}" data-forced="${sim.forcedWires.includes(w.id)}"><path class="wire-hit" d="${path(ps)}"/><path class="wire-line ${signalClass(bits)} ${isBus?'bus':''}" d="${path(ps)}"/>${isBus?`<text class="bus-label" x="${mid.x+8}" y="${mid.y-9}">${bits.length}b · ${signalText(bits)}</text>`:''}${sim.forcedWires.includes(w.id)?`<text class="forced-wire-label" x="${mid.x+8}" y="${mid.y+18}">临时 ${C.formatValue(bits,state.displayFormat)}</text>`:''}${[w.a,w.b].filter(e=>!e.node).map(e=>`<circle class="junction" cx="${e.x}" cy="${e.y}" r="3.3"/>`).join('')}</g>`;}).join('');
  }
  function renderNodes(target=$('node-layer')){
    target.innerHTML=state.nodes.map(n=>{const z=C.baseSize(n,state.definitions),ps=C.ports({...n,rotation:0},state.definitions),value=n.type==='input'?C.bitArray(n.value||0,n.bits||1):sim.outputs[n.id];const t=title(n),short=t.length>12?t.slice(0,11)+'…':t;
      let symbol='';
      if(n.type==='nand')symbol='<text class="node-glyph" x="76" y="66" text-anchor="middle">⊼</text>';
      else if(n.type==='input')symbol=(n.bits||1)>1?bitSwitches(n,true):`<g class="toggle ${signalClass(value)}" data-toggle="${n.id}" role="button" tabindex="0" aria-label="切换${escape(t)}" aria-pressed="${!!n.value}"><rect x="51" y="32" width="50" height="32" rx="6"/><text x="${z.w/2}" y="54" text-anchor="middle">${signalText(value)}</text></g>`;
      else if(n.type==='output'){const color=signalClass(value)==='high'?'#91e6be':'#7793a8';symbol=value.length>1?`<g class="numeric-display" style="--digit-color:${color}">${digitCells(signalText(value),z.w/2)}</g>`:`<g class="single-indicator"><circle cx="${z.w/2}" cy="49" r="15" fill="${color}18" stroke="${color}"/><text x="${z.w/2}" y="54" text-anchor="middle" fill="${color}" font-family="monospace" font-size="13">${signalText(value)}</text></g>`;}
      else if(n.type==='delay')symbol=`<text class="node-glyph" x="${z.w/2}" y="62" text-anchor="middle" style="font-size:24px">▸▏ ${decimal(sim.values[n.id][0])}</text>`;
      else if(n.type==='custom')symbol=`<text x="${z.w/2}" y="${z.h/2+10}" text-anchor="middle" fill="#bca6dd" font-size="23">◇</text>`;
      else symbol=`<path d="M 65 38 L ${n.type==='hub'?87:65} ${z.h/2} L ${n.type==='hub'?65:87} ${z.h-20}" fill="none" stroke="#7dabc4" stroke-width="2"/>`;
      const multiIO=['input','output'].includes(n.type)&&(n.bits||1)>1;if(multiIO)symbol+=`<text class="decimal-summary" x="${z.w/2}" y="${z.h+17}" text-anchor="middle" aria-label="${formatNames[state.displayFormat||'unsigned']}">${C.formatValue(value,state.displayFormat)}</text>`;
      return `<g class="node ${(selected?.type==='nodes'?selected.ids.includes(n.id):selected?.id===n.id)?'selected':''}" data-node="${n.id}" transform="translate(${n.x} ${n.y})"><g transform="${C.rotationTransform(n,state.definitions)}"><title>${escape(t)} · ${escape(desc[n.type])}</title><rect class="body" width="${z.w}" height="${z.h}" rx="9"/><text class="node-title" x="${z.w/2}" y="20" text-anchor="middle">${escape(short)}</text>${symbol}${ps.map(p=>{const bits=sim.portValues[C.key(p)],color=signalClass(bits)==='high'?'#91e6be':'#7c99ac';return `<g class="port" data-port="${p.port}" data-dir="${p.dir}" transform="translate(${p.x-n.x} ${p.y-n.y})"><title>${escape(p.label)} · ${p.width} 位 · ${signalText(bits)}</title><circle r="10" opacity="0"/><circle r="${p.width>1?5.5:4.5}" style="stroke:${color};fill:${signalClass(bits)==='high'?'#91e6be':'#17252e'}"/><text x="${p.dir==='in'?11:-11}" y="3" text-anchor="${p.dir==='in'?'start':'end'}">${escape(p.label.slice(0,9))}</text></g>`;}).join('')}<text class="node-subtitle" x="${z.w/2}" y="${z.h+(multiIO?35:15)}" text-anchor="middle">${escape(n.type==='custom'?(sim.definitionModes[n.def]==='状态真值表'?'STATE TABLE':sim.definitionModes[n.def]==='真值表'?'TRUTH TABLE':'CUSTOM CIRCUIT'):subtitles[n.type])}</text></g></g>`;
    }).join('');
  }
  function scopedCircuit(scope){
    let local=state,result=simulate(state),path='root';
    for(const id of scope.split('/').slice(1)){
      const n=local.nodes.find(n=>n.id===id);if(n?.type!=='custom')throw Error('导线所属实例已不存在');
      const d=state.definitions[n.def],inputs=Object.fromEntries(d.inputs.map((p,i)=>[p.id,result.portValues[C.key({node:id,dir:'in',port:i})]]));
      path+='/'+id;local={nodes:d.nodes,wires:d.wires,definitions:state.definitions};
      result=C.simulate(local,inputs,1,{memory:state.delayState||{},scope:path,scopedOverrides:state.scopedWireOverrides||{}});
    }
    return {local,result};
  }
  function hasWireForces(){return Object.keys(state.wireOverrides||{}).length>0||Object.values(state.scopedWireOverrides||{}).some(ws=>Object.keys(ws).length);}
  let expansionWorker=null,expansionJob=null,pendingExpansion=null,expansionSequence=0;
  const largeExpansion=source=>Object.values(countComponents(source)).reduce((a,b)=>a+b,0)>5000;
  const pendingView=()=>({compact:true,pending:true,svg:'',w:200,h:120,leaves:[],frames:[],layouts:[]});
  function applyExpansionReady(){if(!expanded?.readyView||gesture||activePointers.size)return;if(performance.now()<cameraMotionUntil){scheduleViewportDraw();return;}const {view,stats,initial,initialCamera}=expanded.readyView;delete expanded.readyView;expanded.view=view;expanded.renderStats=stats;render();if(initial&&JSON.stringify(camera)===JSON.stringify(initialCamera))fit(true);}
  function pumpExpansion(){if(expansionJob||!pendingExpansion)return;if(!expansionWorker){expansionWorker=new Worker('./src/expanded.js');expansionWorker.onmessage=e=>{const job=expansionJob;expansionJob=null;if(job?.frame===expanded){if(e.data.error){expanded.view.pending=false;toast(e.data.error);}else{expanded.readyView={view:e.data.view,stats:e.data.stats,initial:job.initial,initialCamera:job.initialCamera};applyExpansionReady();}}pumpExpansion();};expansionWorker.onerror=()=>{expansionJob=null;pendingExpansion=null;toast('展开后台计算失败，请收回后重试');};}expansionJob=pendingExpansion;pendingExpansion=null;expansionWorker.postMessage({id:expansionJob.id,source:expansionJob.source,options:{debugNode:expansionJob.frame.debugNode,readOnly:!!expansionJob.frame.libraryView,maxLayers:expansionJob.frame.maxLayers}});}
  function requestExpansion(frame,source,initial=false){const key=JSON.stringify(source);if(frame.workerKey===key)return;frame.workerKey=key;pendingExpansion={id:++expansionSequence,frame,source,initial,initialCamera:{...camera}};pumpExpansion();}
  function refreshExpanded(){
    if(!expanded)return;
    if(expanded.instanceView){let source=snapshot(),scope='root';for(const frame of [...expanded.parents,expanded]){frame.target=source.nodes.find(n=>n.id===frame.debugNode);scope+='/'+frame.debugNode;frame.scope=scope;frame.view=window.LogicExpanded.focus(source,frame.debugNode);source=frame.view.source;}}
    else if(expanded.view.compact)requestExpansion(expanded,snapshot());else expanded.view=window.LogicExpanded.build(snapshot(),{debugNode:expanded.debugNode,readOnly:!!expanded.libraryView,maxLayers:expanded.maxLayers});
  }
  function renderDelayInspector(){
    const target=delayInspectorTarget;if(!target||!expanded?.instanceView)return;
    const pageSize=50,data=C.delayRegisters(state,target.scope,target.page*pageSize,pageSize),format=state.displayFormat||'unsigned';
    document.querySelector('.inspector').classList.add('has-selection');
    $('selection-panel').innerHTML='<div class="selection-eyebrow">内部延迟线 · '+data.total+' 条</div><div class="selected-name">延迟状态 <button id="close-delay-inspector" class="subtle" aria-label="关闭延迟状态">×</button></div><p class="selection-description">修改当前存储值，输出立即更新。仅作用于当前实例。</p><button id="clear-delay-states" class="subtle" title="清零当前元件内所有延迟状态，包括其它页" '+(data.total?'':'disabled')+'>全部清零</button><div class="delay-state-list">'+data.items.map(item=>{const value=C.bitArray(item.value,item.width);return '<div class="delay-state-entry" data-delay-path="'+escape(item.path)+'"><div class="delay-state-label" title="'+escape(item.label)+'">'+escape(item.label)+'</div><small>'+item.width+' 位 · '+formatNames[format]+'</small>'+(item.width===1?'<button class="signal-switch '+(value[0]?'on':'')+'" data-delay-toggle="'+escape(item.path)+'" aria-label="切换延迟状态">'+value[0]+' ⇄</button>':'<form data-delay-form="'+escape(item.path)+'"><input data-delay-value aria-label="延迟线数值" maxlength="260" value="'+C.formatValue(value,format)+'"><button type="submit" class="subtle">应用</button></form>')+'</div>';}).join('')+'</div>'+(data.total?'':'<p class="selection-description">这个元件内没有延迟线。</p>')+(data.total>pageSize?'<div class="delay-state-pages"><button id="delay-prev" class="subtle" '+(target.page?'':'disabled')+'>上一页</button><span>'+(target.page*pageSize+1)+'–'+Math.min((target.page+1)*pageSize,data.total)+' / '+data.total+'</span><button id="delay-next" class="subtle" '+((target.page+1)*pageSize<data.total?'':'disabled')+'>下一页</button></div>':'')+'<p id="delay-edit-error" class="error" role="alert"></p>';
    $('selection-status').textContent='实例内部延迟状态 · '+data.total+' 条';
    $('selection-panel').querySelector('.delay-state-list').scrollTop=target.scrollTop||0;
    $('close-delay-inspector').onclick=()=>{delayInspectorTarget=null;render();};
    $('clear-delay-states').onclick=()=>{try{const before=snapshot(),prefix=target.scope+'/';stopRunning();state.delayState=Object.fromEntries(Object.entries(state.delayState||{}).filter(([path])=>path!==target.scope&&!path.startsWith(prefix)));refreshExpanded();commit(before);}catch(error){$('delay-edit-error').textContent=error.message;}};
    const apply=(item,bits)=>{try{const before=snapshot(),next=C.setDelayValue(state,item.path,bits);stopRunning();state.delayState=next;refreshExpanded();commit(before);}catch(error){$('delay-edit-error').textContent=error.message;}};
    for(const item of data.items){const row=[...$('selection-panel').querySelectorAll('[data-delay-path]')].find(row=>row.dataset.delayPath===item.path);if(item.width===1)row.querySelector('[data-delay-toggle]').onclick=()=>apply(item,[1-C.bitArray(state.delayState?.[item.path]||0,1)[0]]);else row.querySelector('form').onsubmit=e=>{e.preventDefault();try{apply(item,C.parseSignal(row.querySelector('[data-delay-value]').value,item.width,format));}catch(error){$('delay-edit-error').textContent=error.message;}};}
    if($('delay-prev'))$('delay-prev').onclick=()=>{target.page--;target.scrollTop=0;renderDelayInspector();};if($('delay-next'))$('delay-next').onclick=()=>{target.page++;target.scrollTop=0;renderDelayInspector();};
  }
  function openDelayInspector(id){if(!expanded?.instanceView)return;stopRunning();wireInspectorTarget=null;delayInspectorTarget={scope:expanded.scope+'/'+id,page:0};renderDelayInspector();}
  function setWireTemporary(target,value){
    const {local}=scopedCircuit(target.scope),wire=local.wires.find(w=>w.id===target.id);if(!wire)return;
    const net=C.nets(local),group=net.wireNet.get(wire.id),before=snapshot();stopRunning();
    let values;if(target.scope==='root')values=state.wireOverrides=state.wireOverrides||{};else{state.scopedWireOverrides=state.scopedWireOverrides||{};values=state.scopedWireOverrides[target.scope]=state.scopedWireOverrides[target.scope]||{};}
    for(const id of Object.keys(values))if(net.wireNet.get(id)===group)delete values[id];values[wire.id]=value;
    past.push(before);if(past.length>60)past.shift();future=[];wireInspectorTarget=target;refreshExpanded();render();save();
  }
  function activateWire(target){
    const bits=scopedCircuit(target.scope).result.wires[target.id];if(!bits)return;
    delayInspectorTarget=null;wireInspectorTarget=target;
    if(bits.length===1)setWireTemporary(target,[1-(bits[0]||0)]);else if(!expanded&&target.scope==='root')renderSelection();else renderWireInspector(target);
  }
  function renderWireInspector(target={scope:'root',id:selected?.id}){
    const {local,result}=scopedCircuit(target.scope),wire=local.wires.find(w=>w.id===target.id);if(!wire)return;
    const bits=result.wires[wire.id],forced=result.forcedWires.includes(wire.id);document.querySelector('.inspector').classList.add('has-selection');
    $('selection-panel').innerHTML='<div class="selection-eyebrow">已选中导线 · '+bits.length+' 位</div><div class="selected-name">'+(forced?'临时输入已生效':'导线临时输入')+'</div><p class="selection-description">'+(bits.length===1?'左键点击导线切换 0 / 1。':'输入临时数值，覆盖原输入与当前驱动。')+'下一步先采样，再清除临时值。</p>'+(bits.length===1?'<div class="port-reading"><span>当前值</span><code>'+bits[0]+'</code></div>':'<form id="wire-force-form"><label class="property-row">'+formatNames[state.displayFormat||'unsigned']+'<input id="wire-force-value" type="text" maxlength="260" aria-label="导线临时数值" value="'+C.formatValue(bits,state.displayFormat)+'"></label><button class="primary" type="submit" style="margin-top:12px">应用临时输入</button><p id="wire-force-error" class="error" role="alert"></p></form>');
    $('selection-status').textContent=forced?'临时输入 · 下一步运行后清除':'已选中导线';
    if(bits.length===1)return;
    $('wire-force-form').onsubmit=e=>{e.preventDefault();try{setWireTemporary(target,C.parseSignal($('wire-force-value').value,bits.length,state.displayFormat));}catch(error){if($('wire-force-error'))$('wire-force-error').textContent=error.message;else toast(error.message);}};
  }
  function renderInspector(){
    const n=selected?.type==='node'?state.nodes.find(n=>n.id===selected.id):null;
    document.querySelector('.inspector').classList.toggle('has-selection',!!selected);
    if(selected?.type==='nodes'){const count=selected.ids.length;$('selection-panel').innerHTML=`<div class="selection-eyebrow">多选元件</div><div class="selected-name">已选中 ${count} 个元件</div><p class="selection-description">拖动所选元件主体可整体移动。<br>Backspace / Delete 删除元件和关联导线。<br>Esc 取消选择，Ctrl+Z 撤销删除。</p>`;$('selection-status').textContent='已选中 '+count+' 个元件';return;}
    if(selected?.type==='wire'){renderWireInspector();return;}
    if(!n){$('selection-panel').innerHTML=selected?'<div class="selection-eyebrow">已选中导线</div><div class="selected-name">电路连接</div><p class="selection-description">按 Delete 删除，或继续从导线分出一条支路。</p>':'<div class="selection-eyebrow">元件属性</div><div class="selected-name">等待你的选择 <span class="micro">↖</span></div><p class="selection-description">点击画布上的元件，<br>查看信号与调整参数。</p>';$('selection-status').textContent=selected?'已选中导线':'选中元件以查看属性';return;}
    $('selection-status').textContent=title(n)+' · X '+Math.round(n.x)+' / Y '+Math.round(n.y);
    const canBits=['input','output','hub','splitter','delay'].includes(n.type),bits=n.bits||1;
    $('selection-panel').innerHTML=`<div class="selection-eyebrow">已选中元件</div><div class="selected-name">${escape(title(n))}<span class="micro">${escape(subtitles[n.type]||'CUSTOM')}</span></div><div class="selection-description">${desc[n.type]}</div><label class="property-row">名称<input id="prop-name" maxlength="24" value="${escape(n.label||'')}" placeholder="${escape(names[n.type]||title(n))}"></label>${canBits?`<label class="property-row">位宽<input id="prop-bits" type="number" min="${['hub','splitter'].includes(n.type)?2:1}" max="${C.MAX_BITS}" step="1" inputmode="numeric" value="${bits}" aria-label="位宽"></label>`:''}${n.type==='input'?`<div class="property-row">输入值 ${bits===1?`<button id="prop-toggle" class="signal-switch ${n.value?'on':''}">${n.value||0} ⇄</button>`:`<div class="bit-switches" aria-label="二进制输入">${bitSwitches(n)}</div>`}</div>`:''}<div style="margin-top:15px">${C.ports(n,state.definitions).map(p=>`<div class="port-reading"><span>${p.dir==='in'?'输入':'输出'} ${escape(p.label)} · ${p.width} 位</span><code>${signalText(sim.portValues[C.key(p)])}</code></div>`).join('')}</div>`;

    if(['input','output'].includes(n.type)&&bits>1){const row=document.createElement('div');row.className='property-row';row.innerHTML='<span>'+formatNames[state.displayFormat||'unsigned']+'</span><code class="decimal-value">'+C.formatValue(n.type==='input'?C.bitArray(n.value||0,bits):sim.outputs[n.id],state.displayFormat)+'</code>';$('selection-panel').append(row);}
    $('prop-name').onchange=e=>change(()=>n.label=e.target.value.trim());
    if($('prop-bits'))$('prop-bits').onchange=e=>{const b=Number(e.target.value),min=['hub','splitter'].includes(n.type)?2:1;if(!Number.isInteger(b)||b<min||b>C.MAX_BITS){e.target.value=bits;toast('位宽请输入 '+min+'–'+C.MAX_BITS+' 的整数');return;}change(()=>resizeBits(n,b));toast('位宽已更新；请检查相连导线的位宽。');};
    if($('prop-toggle'))$('prop-toggle').onclick=()=>toggle(n.id);

    if(window.innerWidth<=980){
      const panel=document.querySelector('.inspector'),close=document.createElement('button');close.className='inspector-close';close.textContent='×';close.title='关闭属性';close.onclick=()=>{selected=null;render();};panel.prepend(close);panel.querySelectorAll('.inspector-close').forEach((b,i)=>{if(i)b.remove();});
      const r=panel.getBoundingClientRect(),b=svg.getBoundingClientRect(),z=C.size(n,state.definitions),left=b.x+camera.x+n.x*camera.scale,top=b.y+camera.y+n.y*camera.scale;
      if(left+z.w*camera.scale>r.left-12&&left<r.right&&top+z.h*camera.scale>r.top-15&&top<r.bottom){camera.y-=Math.min(top+z.h*camera.scale-r.top+20,Math.max(0,top-b.top-110));setCamera();}
    }
  }
  function renderLibrary(){
    const ids=Object.keys(state.definitions).filter(id=>!state.definitions[id].hidden);$('custom-count').textContent=String(ids.length).padStart(2,'0');$('custom-empty').style.display=ids.length?'none':'';
    $('custom-library').innerHTML=ids.map(id=>{const d=state.definitions[id];return `<div class="custom-entry"><button class="component" data-custom="${id}" title="拖出 ${escape(d.name)}；右键编辑内部电路"><span class="component-symbol" style="color:#bca6dd">◇</span><span><b>${escape(d.name)}</b><small>${d.inputs.length} 输入 / ${d.outputs.length} 输出 · ${escape(sim.definitionModes[id]||'电路模拟')}</small></span></button><button class="delete-custom" data-delete-custom="${id}" title="删除 ${escape(d.name)}" aria-label="删除保存的逻辑门 ${escape(d.name)}"><span aria-hidden="true">×</span><span class="mobile-delete-label">删除</span></button></div>`;}).join('');
  }
  function deleteSavedGate(id){if(expanded||gateEditor||placement||!Object.hasOwn(state.definitions,id))return;const name=state.definitions[id].name;change(()=>{state=C.deleteDefinition(state,id);});toast('已从“我的逻辑门”删除「'+name+'」，可撤销恢复。');}
  $('custom-library').addEventListener('click',e=>{const b=e.target.closest('[data-delete-custom]');if(b){e.stopPropagation();deleteSavedGate(b.dataset.deleteCustom);}});
  $('custom-library').addEventListener('contextmenu',e=>{const b=e.target.closest('[data-custom],[data-delete-custom]');if(b){e.preventDefault();if(b.dataset.custom)debugSavedGate(b.dataset.custom);else deleteSavedGate(b.dataset.deleteCustom);}});
  const storedSnapshot=()=>{const result=gateEditor?C.clone(gateEditor.root):expanded?.original?C.clone(expanded.original):snapshot();delete result.wireOverrides;delete result.scopedWireOverrides;return result;};
  function editingWouldRecurse(id,seen=new Set()){if(!gateEditor)return false;if(id===gateEditor.id)return true;if(seen.has(id))return false;seen.add(id);return state.definitions[id]?.nodes.some(n=>n.type==='custom'&&editingWouldRecurse(n.def,seen))||false;}
  function debugSavedGate(id){if(expanded||gateEditor||placement||gesture)return;const d=state.definitions[id];if(!d)return;stopRunning();cancelPaste();const root=snapshot();gateEditor={id,root,before:C.clone(root),camera:{...camera},mode,past,future};state={version:1,nodes:C.clone(d.nodes),wires:C.clone(d.wires),definitions:root.definitions,displayFormat:root.displayFormat};past=[];future=[];selected=null;setMode('wire');const before=snapshot();if(repairWirePaths(true))commit(before);else render();fit(true);toast('正在编辑「'+d.name+'」，修改会同步更新所有引用');}
  function setGateMode(nextMode){if(!gateEditor||gesture||placement)return;cancelPaste();stopRunning();if(nextMode==='view'&&!expanded){const view=window.LogicExpanded.build(snapshot(),{readOnly:true});expanded={libraryView:true,view,camera:{...camera},mode};selected=null;setMode('pan');render();fit();}else if(nextMode==='edit'&&expanded?.libraryView){const previous=expanded;expanded=null;camera={...previous.camera};setMode(previous.mode);selected=null;render();}}
  $('gate-mode-edit').onclick=()=>setGateMode('edit');$('gate-mode-view').onclick=()=>setGateMode('view');
  function finishGateEditing(){if(!gateEditor||gesture||placement)return;stopRunning();cancelPaste();const previous=gateEditor;gateEditor=null;state=previous.root;past=previous.past;future=previous.future;camera={...previous.camera};setMode(previous.mode);selected=null;commit(previous.before);}
  let runTimer=null,runGeneration=0;const activePointers=new Set();
  document.addEventListener('pointerdown',e=>activePointers.add(e.pointerId),true);
  window.addEventListener('pointerup',e=>{activePointers.delete(e.pointerId);requestAnimationFrame(applyExpansionReady);},true);window.addEventListener('pointercancel',e=>activePointers.delete(e.pointerId),true);window.addEventListener('blur',()=>activePointers.clear());
  function stopRunning(){runGeneration++;clearTimeout(runTimer);runTimer=null;$('auto-run').textContent='自动运行';$('auto-run').setAttribute('aria-pressed','false');}
  function advance(manual=false){
    if(expanded?.libraryView&&!hasWireForces()||gesture||placement||!manual&&activePointers.size||document.querySelector('dialog[open]'))return;
    const before=manual?snapshot():null;state.delayState=C.step(state);state.wireOverrides={};state.scopedWireOverrides={};
    if(expanded)refreshExpanded();
    if(manual&&!expanded?.libraryId)commit(before);else{render();save();}
  }
  function startRunning(){stopRunning();const speed=Math.max(.1,Math.min(60,Number($('run-speed').value)||1));$('run-speed').value=speed;const generation=runGeneration,tick=()=>{if(generation!==runGeneration)return;const start=performance.now();advance();if(generation===runGeneration)runTimer=setTimeout(tick,Math.max(16,1000/speed-(performance.now()-start)));};runTimer=setTimeout(tick,1000/speed);$('auto-run').textContent='暂停';$('auto-run').setAttribute('aria-pressed','true');}
  $('next-step').onclick=()=>{stopRunning();advance(true);};
  $('auto-run').onclick=()=>runTimer?stopRunning():startRunning();
  $('run-speed').onchange=()=>{const running=!!runTimer;$('run-speed').value=Math.max(.1,Math.min(60,Number($('run-speed').value)||1));if(running)startRunning();};
  function resetSimulation(mode){if(expanded?.libraryView)return;stopRunning();const before=snapshot(),visible=expanded?.instanceView?expanded.view.source.nodes.map(n=>({...n,scope:expanded.scope})):expanded?.view.leaves;state.delayState=C.resetDelays(state,mode,visible);if(expanded)refreshExpanded();if(expanded?.libraryId){render();save();}else commit(before);}
  $('reset-simulation').onclick=()=>resetSimulation('all');$('reset-partial').onclick=()=>resetSimulation('partial');
  function renderSelection(){
    const ids=new Set(selected?.type==='nodes'?selected.ids:selected?.type==='node'?[selected.id]:[]);
    svg.querySelectorAll('[data-node]').forEach(el=>el.classList.toggle('selected',ids.has(el.dataset.node)));
    svg.querySelectorAll('[data-wire]').forEach(el=>el.classList.toggle('selected',selected?.type==='wire'&&selected.id===el.dataset.wire));
    renderInspector();$('delete').disabled=!selected;$('rotate').disabled=!['node','nodes'].includes(selected?.type);$('debug').disabled=selected?.type!=='node'||!['nand','custom'].includes(state.nodes.find(n=>n.id===selected?.id)?.type);
  }
  let drawnExpandedSvg=null,drawnRegion=null,viewportTimer=null,panImageUrl=null,panImageRegion=null,requestedPanRegion=null,panImageSequence=0,panImageCss=null;
  const panImageLayer=document.createElementNS('http://www.w3.org/2000/svg','g');panImageLayer.id='pan-image-layer';panImageLayer.style.pointerEvents='none';panImageLayer.style.visibility='hidden';$('world').append(panImageLayer);
  function hidePanImage(){panImageLayer.style.visibility='hidden';$('node-layer').style.visibility='';}
  function showPanImage(){if(panImageUrl&&panImageRegion===drawnRegion&&expanded?.view===panImageRegion.view){panImageLayer.style.visibility='visible';$('node-layer').style.visibility='hidden';}}
  function clearPanImage(){panImageSequence++;hidePanImage();panImageLayer.replaceChildren();if(panImageUrl)URL.revokeObjectURL(panImageUrl);panImageUrl=null;panImageRegion=null;requestedPanRegion=null;}
  async function preparePanImage(markup,region){
    requestedPanRegion=region;const sequence=++panImageSequence;let svgUrl=null,pngUrl=null;
    try{if(panImageCss===null)panImageCss=[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules].map(rule=>rule.cssText);}catch{return [];}}).join('\n');
      let factor=Math.min(window.devicePixelRatio||1,1.5,3072/(region.w*region.scale),3072/(region.h*region.scale));const area=region.w*region.h*region.scale*region.scale*factor*factor;if(area>6000000)factor*=Math.sqrt(6000000/area);const width=Math.max(1,Math.round(region.w*region.scale*factor)),height=Math.max(1,Math.round(region.h*region.scale*factor));
      const source='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="'+region.x+' '+region.y+' '+region.w+' '+region.h+'"><style>'+panImageCss+'</style>'+markup+'</svg>';svgUrl=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));const image=new Image();image.src=svgUrl;await image.decode();if(sequence!==panImageSequence)return;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;if(!blob)throw Error('No raster');pngUrl=URL.createObjectURL(blob);
      if(sequence!==panImageSequence||region!==drawnRegion||expanded?.view!==region.view)return;const old=panImageUrl,node=document.createElementNS('http://www.w3.org/2000/svg','image');node.setAttribute('href',pngUrl);node.setAttribute('x',region.x);node.setAttribute('y',region.y);node.setAttribute('width',region.w);node.setAttribute('height',region.h);node.setAttribute('data-pan-background','true');panImageLayer.replaceChildren(node);panImageUrl=pngUrl;pngUrl=null;panImageRegion=region;if(old)URL.revokeObjectURL(old);if(performance.now()<cameraMotionUntil)showPanImage();
    }catch{}finally{if(svgUrl)URL.revokeObjectURL(svgUrl);if(pngUrl)URL.revokeObjectURL(pngUrl);}
  }
  function scheduleViewportDraw(){clearTimeout(viewportTimer);viewportTimer=setTimeout(()=>{applyExpansionReady();drawExpanded();},110);}
  function drawExpanded(){if(!expanded)return;if(performance.now()>=cameraMotionUntil)hidePanImage();const view=expanded.view;if(view.compact&&performance.now()<cameraMotionUntil){scheduleViewportDraw();return;}let markup=view.svg;
    if(view.compact){const rect={x:-camera.x/camera.scale,y:-camera.y/camera.scale,w:svg.clientWidth/camera.scale,h:svg.clientHeight/camera.scale},r=drawnRegion;
      if(r?.view===view&&rect.x>=r.x&&rect.y>=r.y&&rect.x+rect.w<=r.x+r.w&&rect.y+rect.h<=r.y+r.h&&camera.scale>=r.scale*.8&&camera.scale<=r.scale*1.25)return;
      const padX=rect.w*.35,padY=rect.h*.35;drawnRegion={view,x:rect.x-padX,y:rect.y-padY,w:rect.w+2*padX,h:rect.h+2*padY,scale:camera.scale};markup=window.LogicExpanded.viewportSvg(view,drawnRegion,camera.scale);
    }else drawnRegion=null;
    if(drawnExpandedSvg!==markup){$('node-layer').innerHTML=markup;drawnExpandedSvg=markup;}if(view.compact&&markup&&view.sceneSvg&&requestedPanRegion!==drawnRegion)preparePanImage(markup,drawnRegion);
  }
  function render(){
    if(delayInspectorTarget){const list=$('selection-panel').querySelector('.delay-state-list');if(list)delayInspectorTarget.scrollTop=list.scrollTop;}
    $('number-format').value=state.displayFormat||'unsigned';
    sim=simulate(state);if(expanded){$('wire-layer').innerHTML='';drawExpanded();$('draft-layer').innerHTML='';document.querySelector('.inspector').classList.remove('has-selection');const target=expanded.instanceView?expanded.target:gateEditor?{type:'custom',def:gateEditor.id}:expanded.libraryId?{type:'custom',def:expanded.libraryId}:state.nodes.find(n=>n.id===expanded.debugNode),sources=expanded.libraryView||expanded.instanceView?[]:state.nodes.filter(n=>n.type==='input');$('selection-panel').innerHTML='<div class="selection-eyebrow">'+(expanded.instanceView?'状态查看':expanded.libraryView?'查看模式 · 只读':target?'逻辑门调试':'已全部展开')+'</div><div class="selected-name">'+escape(target?(expanded.libraryView||expanded.instanceView?'查看：':'调试：')+title(target):'实时调试电路')+'</div><p class="selection-description">'+(expanded.instanceView?'当前实例的输入和延迟状态已带入内部，保持原值。<br>左键点击内部自定义门继续进入；右键元件编辑其延迟状态。<br>点击导线设置临时值。<br>点击“退出”返回上一层。':expanded.libraryView?'查看内部结构，可平移、缩放；点击导线设置临时输入。<br>切换到编辑模式可修改原层级电路。':'点击输入位可实时切换，返回后保留。<br>输入组、输出组保持各自原来的相对位置。<br>点击导线设置临时输入，点击“返回原电路”恢复画布。')+'</p><div class="debug-sources">'+sources.map(n=>'<div class="debug-source"><span>'+escape(title(n))+'</span><div class="bit-switches">'+bitSwitches(n)+'</div></div>').join('')+'</div>';$('selection-status').textContent=(expanded.instanceView?'状态查看 · 第 '+(expanded.parents.length+1)+' 层 · ':expanded.libraryView?'查看模式 · ':'实时调试 · ')+expanded.view.leaves.length+' 个原始元件';}else{drawnExpandedSvg=null;drawnRegion=null;if(panImageUrl||panImageRegion)clearPanImage();renderWires();renderNodes();renderInspector();}renderLibrary();setCamera();
    $('undo').disabled=!!expanded||!past.length;$('redo').disabled=!!expanded||!future.length;$('delete').disabled=!!expanded||!selected;$('rotate').disabled=!!expanded||!['node','nodes'].includes(selected?.type);$('debug').disabled=!!expanded||selected?.type!=='node'||!['nand','custom'].includes(state.nodes.find(n=>n.id===selected?.id)?.type);$('exit-gate').hidden=!expanded?.instanceView;$('back-to-circuit').hidden=!!expanded?.instanceView||!(expanded||gateEditor);$('back-to-circuit').textContent=gateEditor&&!expanded?.libraryView?'保存并返回原电路':'返回原电路';
    for(const id of ['package','import','new','wire-mode','export-clear'])$(id).disabled=!!expanded;document.querySelectorAll('.library button').forEach(b=>b.disabled=!!expanded||!!(gateEditor&&(b.dataset.deleteCustom||b.dataset.custom&&editingWouldRecurse(b.dataset.custom))));if(gateEditor)for(const id of ['import','new','export-clear'])$(id).disabled=true;
    $('node-layer').classList.toggle('read-only-view',!!expanded?.libraryView||!!expanded?.instanceView);
    $('gate-view-modes').hidden=!gateEditor;$('gate-mode-edit').setAttribute('aria-pressed',String(!!gateEditor&&!expanded));$('gate-mode-view').setAttribute('aria-pressed',String(!!expanded?.libraryView));$('expand').hidden=!!gateEditor||!!expanded?.instanceView;$('expand-layers').hidden=$('expand').hidden;for(const id of ['next-step','auto-run','reset-simulation','reset-partial'])$(id).disabled=!!expanded?.libraryView&&(id!=='next-step'||!hasWireForces());
    $('expand').disabled=!!gateEditor||!expanded&&!state.nodes.some(n=>n.type==='custom');$('expand-layers').disabled=$('expand').disabled;$('expand-layers').textContent=expanded?.maxLayers?'展开多少层 · 当前 '+expanded.maxLayers+' 层':'展开多少层';$('expand').textContent=expanded?'全部收回':'全部展开';$('expand').setAttribute('aria-pressed',String(!!expanded));
    $('onboarding').hidden=!!gateEditor||!!expanded||!(state.nodes.length===1&&state.nodes[0].type==='nand'&&!state.wires.length);
    $('node-count').textContent=gateEditor?(expanded?.libraryView?'查看：':'编辑：')+state.definitions[gateEditor.id].name+' · '+state.nodes.length+' 个元件':expanded?(expanded.view.pending?'正在后台展开…':expanded.view.leaves.length+' 个原始元件 · 调试'):state.nodes.length+' 个元件 · '+state.wires.length+' 根导线';
    const counts=countComponents(state);$('nand-count').textContent=counts.nand;$('delay-count').textContent=counts.delay;$('hub-count').textContent=counts.hub;$('splitter-count').textContent=counts.splitter;$('component-counts').title=(gateEditor?'当前门':'当前电路')+'，含自定义门内部元件；同一门每放置一次都会累加，不按类型去重';
    if(expanded&&wireInspectorTarget)try{renderWireInspector(wireInspectorTarget);}catch{wireInspectorTarget=null;}
    if(expanded?.instanceView&&delayInspectorTarget)try{renderDelayInspector();}catch(error){delayInspectorTarget=null;toast(error.message);}
    $('sim-status').textContent=sim.issues.length?'检查连接':'信号已稳定';
    $('sim-dot').style.background=sim.issues.length?'#e5b978':'#91e6be';
    $('sim-detail').textContent=sim.issues[0]||(!state.wires.length?'未接线输入默认为 0（低电平）。':'电路正在实时响应输入变化。');
  }
  function returnToCircuit(){wireInspectorTarget=null;delayInspectorTarget=null;if(gateEditor){if(expanded?.libraryView)setGateMode('edit');finishGateEditing();return;}if(!expanded||gesture||placement)return;if(!expanded.instanceView)stopRunning();if(expanded.instanceView&&expanded.parents.length){const parent=expanded.parents.pop();Object.assign(expanded,{view:parent.view,target:parent.target,debugNode:parent.debugNode,scope:parent.scope});camera={...parent.camera};refreshExpanded();render();save();return;}const previous=expanded;expanded=null;if(previous.original)state=previous.original;camera={...previous.camera};setMode(previous.mode);selected=null;if(previous.before)commit(previous.before);else{render();save();}}
  function enterExpanded(debugNode=null,maxLayers){if(gateEditor||expanded||gesture||placement||document.querySelector('dialog[open]'))return;if(!debugNode&&!state.nodes.some(n=>n.type==='custom')){toast('先在画布上放置一个自定义门');return;}try{wireInspectorTarget=null;delayInspectorTarget=null;const source=snapshot(),background=largeExpansion(source),view=background?pendingView():window.LogicExpanded.build(source,{debugNode,maxLayers});expanded={view,debugNode,maxLayers,camera:{...camera},mode};selected=null;setMode('pan');render();if(background)requestExpansion(expanded,source,true);else fit(true);}catch(error){toast(error.message);}}
  function toggleExpanded(){if(expanded)returnToCircuit();else enterExpanded();}
  function enterGateView(id){
    if((expanded&&!expanded.instanceView)||gateEditor||gesture||placement)return;
    try{
      wireInspectorTarget=null;delayInspectorTarget=null;const scope=expanded?expanded.scope+'/'+id:'root/'+id,source=expanded?expanded.view.source:snapshot(),target=source.nodes.find(n=>n.id===id),view=window.LogicExpanded.focus(source,id);
      if(expanded){expanded.parents.push({view:expanded.view,target:expanded.target,debugNode:expanded.debugNode,scope:expanded.scope,camera:{...camera}});Object.assign(expanded,{view,target,debugNode:id,scope});}
      else expanded={view,target,parents:[],debugNode:id,scope,instanceView:true,camera:{...camera},mode};
      selected=null;setMode('pan');render();fit();
    }catch(error){toast(error.message);}
  }
  function placementNode(type,def){const n={id:uid('n'),type,x:0,y:0};if(type==='input')n.value=0;if(type==='hub'||type==='splitter')n.bits=2;if(type==='custom')n.def=def;return n;}
  function previewPlacement(e){
    if(!placement)return;const g=placement,n=g.node,z=C.size(n,state.definitions),r=svg.getBoundingClientRect(),hit=document.elementFromPoint(e.clientX,e.clientY),inside=e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom&&(hit===svg||svg.contains(hit)),scale=inside?camera.scale:1;
    g.inside=inside;g.point={clientX:e.clientX,clientY:e.clientY};g.moved=g.moved||Math.hypot(e.clientX-g.start.x,e.clientY-g.start.y)>5;
    placementPreview.style.left=(e.clientX-(z.w/2+8)*scale)+'px';placementPreview.style.top=(e.clientY-(z.h/2+8)*scale)+'px';placementPreview.style.width=(z.w+16)*scale+'px';placementPreview.style.height=(z.h+16)*scale+'px';placementPreview.classList.toggle('can-drop',inside);
    placementPreview.innerHTML=`<svg viewBox="-8 -8 ${z.w+16} ${z.h+16}" width="100%" height="100%"><g class="node selected"><rect class="body" width="${z.w}" height="${z.h}" rx="9"/><text class="node-title" x="${z.w/2}" y="20" text-anchor="middle">${escape(title(n))}</text><text x="${z.w/2}" y="${z.h/2+15}" text-anchor="middle" fill="#91e6be" font-size="30">${({nand:'⊼',delay:'▸▏',input:'01',output:'◉',hub:'⇥',splitter:'⇤',custom:'◇'})[n.type]}</text>${C.ports(n,state.definitions).map(p=>`<circle cx="${p.x}" cy="${p.y}" r="5" fill="#17252e" stroke="#91e6be"/>`).join('')}</g></svg>`;
  }
  function endPlacement(e,cancel=false){
    if(!placement)return;const g=placement;if(e&&e.pointerId!==undefined&&e.pointerId!==g.pointerId)return;if(e&&!cancel)previewPlacement(e);placement=null;placementPreview.hidden=true;document.body.classList.remove('placing-component');g.source.classList.remove('being-dragged');if(g.source.hasPointerCapture(g.pointerId))g.source.releasePointerCapture(g.pointerId);
    if(cancel||!g.moved||!g.inside)return;
    const p=worldPoint(g.point);if(['hub','splitter'].includes(g.node.type)){openBusDialog(g.node,p);return;}const z=C.size(g.node,state.definitions);g.node.x=Math.round((p.x-z.w/2)/12)*12;g.node.y=Math.round((p.y-z.h/2)/12)*12;
    change(()=>{state.nodes.push(g.node);selected={type:'node',id:g.node.id};});
  }
  document.querySelector('.library').addEventListener('pointerdown',e=>{
    const source=e.target.closest('[data-add],[data-custom]');if(!source||source.disabled||e.button!==0||gesture||placement||expanded)return;if(state.nodes.length>=500)return toast('当前画布已达 500 个元件');
    placement={node:placementNode(source.dataset.add||'custom',source.dataset.custom),source,pointerId:e.pointerId,start:{x:e.clientX,y:e.clientY},moved:false};source.setPointerCapture(e.pointerId);source.classList.add('being-dragged');document.body.classList.add('placing-component');placementPreview.hidden=false;previewPlacement(e);e.preventDefault();
  });
  document.addEventListener('pointermove',e=>{if(placement&&e.pointerId===placement.pointerId){previewPlacement(e);e.preventDefault();}},{passive:false});
  document.addEventListener('pointerup',e=>endPlacement(e));document.addEventListener('pointercancel',e=>endPlacement(e,true));
  document.addEventListener('lostpointercapture',e=>{if(placement&&e.pointerId===placement.pointerId)endPlacement(e,true);});
  function rerouteWires(){for(const w of state.wires)if(w.autoRoute){const routed=C.route(w.a,w.b,state,w.id);if(routed)w.via=routed.slice(1,-1);}}
  function repairWirePaths(automaticOnly=false){
    const freeEnds=state.wires.flatMap(w=>[w.a,w.b]).filter(p=>!p.node),touchesFree=ps=>freeEnds.some(p=>ps.slice(1).some((q,i)=>C.distance(p,C.project(p,ps[i],q))<.05));let changed=false;
    for(const w of state.wires){if(automaticOnly&&!w.autoRoute||!w.a.node||!w.b.node||(!C.wireOverlaps(w,state)&&!C.wireHitsGate(w,state))||touchesFree(C.points(w,state)))continue;const routed=C.route(w.a,w.b,state,w.id);if(!routed||touchesFree(routed))continue;const via=routed.slice(1,-1);if(JSON.stringify(w.via||[])!==JSON.stringify(via)||!w.autoRoute){w.via=via;w.autoRoute=true;changed=true;}}
    return changed;
  }
  function rotateSelected(){if(expanded||gesture||placement)return;const ids=selected?.type==='nodes'?selected.ids:selected?.type==='node'?[selected.id]:[];if(!ids.length)return;change(()=>{for(const n of state.nodes.filter(n=>ids.includes(n.id))){const before=C.size(n,state.definitions);n.rotation=((n.rotation||0)+90)%360;const after=C.size(n,state.definitions);n.x+=(before.w-after.w)/2;n.y+=(before.h-after.h)/2;}rerouteWires();});}
  function setInputValue(n,value){if(expanded?.libraryView||expanded?.instanceView)return;if(n.type!=='input'||n.value===value)return;const before=snapshot();n.value=value;if(expanded?.libraryId){const saved=state.definitions[expanded.libraryId].nodes.find(p=>p.id===n.id);if(saved)saved.value=value;expanded.view=window.LogicExpanded.build(snapshot());render();save();return;}if(expanded){refreshExpanded();selected=null;}else selected={type:'node',id:n.id};commit(before);}
  $('number-format').onchange=e=>{const format=e.target.value;if(!C.DISPLAY_FORMATS.includes(format))return;const before=snapshot();state.displayFormat=format;if(expanded?.original)expanded.original.displayFormat=format;if(expanded)refreshExpanded();if(expanded?.libraryId){render();save();}else commit(before);};
  function toggle(id){const n=state.nodes.find(n=>n.id===id);if(n){const values=C.bitArray(n.value||0,n.bits||1);for(let bit=0;bit<values.length;bit++){values[bit]=1-values[bit];if(values[bit])break;}setInputValue(n,C.packBits(values));}}
  function toggleBit(id,bit){const n=state.nodes.find(n=>n.id===id);if(!n||n.type!=='input'||!Number.isInteger(bit)||bit<0||bit>=(n.bits||1))return;const values=C.bitArray(n.value||0,n.bits||1);values[bit]=1-values[bit];setInputValue(n,C.packBits(values));}
  function activateBit(target){const id=target.dataset.bitToggle,bit=Number(target.dataset.bit),panel=target.closest('#selection-panel'),focused=document.activeElement===target;toggleBit(id,bit);if(focused)(panel?$('selection-panel'):svg).querySelector(`[data-bit-toggle="${id}"][data-bit="${bit}"]`)?.focus({preventScroll:true});}
  document.addEventListener('click',e=>{const t=e.target.closest('[data-bit-toggle]');if(t)activateBit(t);});
  document.addEventListener('keydown',e=>{const t=e.target.closest('[data-bit-toggle]');if(t&&['Enter',' '].includes(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();e.stopPropagation();activateBit(t);}},true);
  function resizeBits(n,bits){n.bits=bits;n.value=C.packBits(C.bitArray(n.value||0,bits));state.wires=state.wires.filter(w=>[w.a,w.b].every(e=>e.node!==n.id||C.ports(n,state.definitions).some(p=>p.dir===e.dir&&p.port===e.port)));rerouteWires();}
  function updateBusSummary(){if(!busEdit)return;const value=$('bus-count').value.trim(),count=/^[0-9]+$/.test(value)?Number(value):0,hub=busEdit.node.type==='hub';$('bus-summary').textContent=count>=2&&count<=C.MAX_BITS?(hub?count+' 根单比特线 → 1 条 '+count+' 位总线':'1 条 '+count+' 位总线 → '+count+' 根单比特线'):(hub?'输入要合成一条总线的单比特线数量。':'输入要从一条总线拆出的单比特线数量。');}
  function openBusDialog(node,center=null){busEdit={node,center};$('bus-heading').textContent='设置'+names[node.type]+'线数';$('bus-count').value=center?'':String(node.bits);$('bus-error').textContent='';$('bus-confirm').textContent=center?'放置元件':'应用';updateBusSummary();$('bus-dialog').showModal();$('bus-count').focus();if(!center)$('bus-count').select();}
  $('bus-count').oninput=()=>{updateBusSummary();$('bus-error').textContent='';};
  $('bus-dialog').addEventListener('close',()=>{if(!$('bus-dialog').open)busEdit=null;});
  $('bus-form').onsubmit=e=>{e.preventDefault();if(!busEdit)return;const value=$('bus-count').value.trim(),count=Number(value);if(!/^[0-9]+$/.test(value)||!Number.isInteger(count)||count<2||count>C.MAX_BITS){$('bus-error').textContent='线数请输入 2–256 之间的整数';return;}const {node,center}=busEdit;if(center){node.bits=count;const z=C.size(node,state.definitions);node.x=Math.round((center.x-z.w/2)/12)*12;node.y=Math.round((center.y-z.h/2)/12)*12;change(()=>{state.nodes.push(node);selected={type:'node',id:node.id};});}else{const current=state.nodes.find(n=>n.id===node.id);if(!current){$('bus-dialog').close();return;}change(()=>{resizeBits(current,count);selected={type:'node',id:current.id};});}busEdit=null;$('bus-dialog').close();};
  function remove(target=selected){if(!target)return;change(()=>{if(target.type==='node'||target.type==='nodes'){const ids=new Set(target.type==='nodes'?target.ids:[target.id]);state.nodes=state.nodes.filter(n=>!ids.has(n.id));state.wires=state.wires.filter(w=>!ids.has(w.a.node)&&!ids.has(w.b.node));}else state.wires=state.wires.filter(w=>w.id!==target.id);selected=null;});}
  let circuitClipboard=null,suppressCanvasClickUntil=0;
  function selectionIds(){return selected?.type==='nodes'?selected.ids:selected?.type==='node'?[selected.id]:[];}
  function copySelection(){
    const ids=new Set(selectionIds());if(!ids.size)return;
    const nodes=state.nodes.filter(n=>ids.has(n.id)),net=C.nets(state),internal=new Set([...net.groups.values()].filter(g=>[...g.ports.values()].filter(p=>ids.has(p.node)).length>=2).map(g=>g.id));
    const wires=state.wires.filter(w=>internal.has(net.wireNet.get(w.id))&&[w.a,w.b].every(e=>!e.node||ids.has(e.node))),definitions={};
    function collect(id){if(definitions[id])return;definitions[id]=C.clone(state.definitions[id]);for(const n of definitions[id].nodes)if(n.type==='custom')collect(n.def);}
    for(const n of nodes)if(n.type==='custom')collect(n.def);
    circuitClipboard={nodes:C.clone(nodes),wires:C.clone(wires),definitions,pastes:0};toast('已复制 '+nodes.length+' 个元件，Ctrl+V 粘贴');
  }
  function pasteSelection(){
    if(!circuitClipboard)return;const clip=circuitClipboard;
    if(state.nodes.length+clip.nodes.length>500||state.wires.length+clip.wires.length>1500){toast('粘贴后将超过元件或导线数量上限');return;}
    const defIds={},defCopies={};
    function mapDefinition(id){if(defIds[id])return defIds[id];const d=C.clone(clip.definitions[id]);for(const n of d.nodes)if(n.type==='custom')n.def=mapDefinition(n.def);const mapped=JSON.stringify(state.definitions[id])===JSON.stringify(d)?id:uid('g');defIds[id]=mapped;defCopies[mapped]=d;return mapped;}
    Object.keys(clip.definitions).forEach(mapDefinition);
    if(Object.keys(state.definitions).length+Object.values(defIds).filter(id=>!state.definitions[id]).length>80){toast('自定义门数量已达上限');return;}
    const nodeIds=Object.fromEntries(clip.nodes.map(n=>[n.id,uid('n')])),end=p=>p.node?{...p,node:nodeIds[p.node]}:{...p};
    const nodes=C.clone(clip.nodes).map(n=>({...n,id:nodeIds[n.id],...(n.type==='custom'?{def:defIds[n.def]}:{})})),wires=C.clone(clip.wires).map(w=>({...w,id:uid('w'),a:end(w.a),b:end(w.b)}));
    const definitions={...state.definitions,...defCopies},boxes=nodes.map(n=>({...n,...C.size(n,definitions)})),minX=Math.min(...boxes.map(n=>n.x)),minY=Math.min(...boxes.map(n=>n.y)),maxX=Math.max(...boxes.map(n=>n.x+n.w)),maxY=Math.max(...boxes.map(n=>n.y+n.h));
    const original={state,sim,selected};
    try{state={version:1,nodes,wires,definitions,displayFormat:original.state.displayFormat||'unsigned'};sim=simulate(state);selected={type:'nodes',ids:nodes.map(n=>n.id)};const wireGroup=document.createElementNS(svg.namespaceURI,'g'),nodeGroup=document.createElementNS(svg.namespaceURI,'g');renderWires(wireGroup);renderNodes(nodeGroup);pasteLayer.replaceChildren(wireGroup,nodeGroup);}finally{state=original.state;sim=original.sim;selected=original.selected;}
    stopRunning();pastePreview={nodes,wires,defCopies,center:{x:(minX+maxX)/2,y:(minY+maxY)/2},offset:{x:0,y:0}};pasteLayer.style.display='';
    const rect=svg.getBoundingClientRect();movePaste(lastPointer||{clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2});toast('移动鼠标选择位置，左键放下，Esc 取消');
  }
  function cancelPaste(){if(!pastePreview)return;pastePreview=null;pasteLayer.replaceChildren();pasteLayer.style.display='none';}
  function movePaste(e){if(!pastePreview)return;const p=worldPoint(e);pastePreview.offset={x:Math.round((p.x-pastePreview.center.x)/12)*12,y:Math.round((p.y-pastePreview.center.y)/12)*12};pasteLayer.setAttribute('transform',`translate(${pastePreview.offset.x} ${pastePreview.offset.y})`);}
  function placePaste(e){movePaste(e);const preview=pastePreview;cancelPaste();const shift=p=>({...p,x:p.x+preview.offset.x,y:p.y+preview.offset.y}),end=p=>p.node?p:shift(p);change(()=>{for(const [id,d] of Object.entries(preview.defCopies))if(!state.definitions[id])state.definitions[id]=d;state.nodes.push(...preview.nodes.map(shift));state.wires.push(...preview.wires.map(w=>({...w,a:end(w.a),b:end(w.b),...(w.via?{via:w.via.map(shift)}:{})})));selected={type:'nodes',ids:preview.nodes.map(n=>n.id)};});suppressCanvasClickUntil=Date.now()+100;}
  document.addEventListener('pointermove',e=>{lastPointer={clientX:e.clientX,clientY:e.clientY};if(pastePreview)movePaste(e);});
  document.addEventListener('pointerdown',e=>{if(pastePreview&&!svg.contains(e.target))cancelPaste();},true);
  function updateMarquee(p){const g=gesture,x=Math.min(g.start.x,p.x),y=Math.min(g.start.y,p.y),w=Math.abs(p.x-g.start.x),h=Math.abs(p.y-g.start.y);g.current=p;const ids=state.nodes.filter(n=>{const z=C.size(n,state.definitions);return n.x<=x+w&&n.x+z.w>=x&&n.y<=y+h&&n.y+z.h>=y;}).map(n=>n.id);selected=ids.length?{type:'nodes',ids}:null;renderNodes();$('selection-status').textContent='框选 '+ids.length+' 个元件';$('delete').disabled=!selected;$('draft-layer').innerHTML=`<rect class="selection-marquee" x="${x}" y="${y}" width="${w}" height="${h}"/>`;}
  function beginGroupMove(p,pointerId){const before=snapshot(),ids=new Set(selected.ids),net=C.nets(before),internal=new Set([...net.groups.values()].filter(g=>g.ports.size&&[...g.ports.values()].every(p=>ids.has(p.node))).map(g=>g.id));gesture={type:'nodes',pointerId,start:p,before,ids,moved:false,internalWires:new Set(before.wires.filter(w=>internal.has(net.wireNet.get(w.id))||(ids.has(w.a.node)&&ids.has(w.b.node))).map(w=>w.id))};}
  function moveGroup(p){const g=gesture;g.moved=g.moved||C.distance(p,g.start)*camera.scale>5;if(!g.moved)return;const dx=Math.round((p.x-g.start.x)/12)*12,dy=Math.round((p.y-g.start.y)/12)*12,shift=p=>({...p,x:p.x+dx,y:p.y+dy}),end=p=>p.node?p:shift(p);for(const original of g.before.nodes)if(g.ids.has(original.id)){const n=state.nodes.find(n=>n.id===original.id);if(n){n.x=original.x+dx;n.y=original.y+dy;}}for(const original of g.before.wires)if(g.internalWires.has(original.id)){const w=state.wires.find(w=>w.id===original.id);if(w){w.a=end(original.a);w.b=end(original.b);if(original.via)w.via=original.via.map(shift);}}rerouteWires();sim=simulate(state);renderWires();renderNodes();}
  function endpoint(p){return p.node?{node:p.node,dir:p.dir,port:p.port}:{x:p.x,y:p.y};}
  function snap(p){
    const threshold=14/camera.scale;let closest=null,dist=threshold;
    for(const n of state.nodes)for(const q of C.ports(n,state.definitions)){const d=C.distance(p,q);if(d<dist){closest=q;dist=d;}}
    if(closest)return {anchor:endpoint(closest),point:closest,snapped:true};
    for(const w of state.wires){const ps=C.points(w,state);for(let i=1;i<ps.length;i++){const q=C.project(p,ps[i-1],ps[i]),d=C.distance(p,q);if(d<dist){closest=q;dist=d;}}}
    const point=closest||{x:Math.round(p.x/12)*12,y:Math.round(p.y/12)*12};return {anchor:endpoint(point),point,snapped:!!closest};
  }
  function setMode(next){mode=next;$('wire-mode').classList.toggle('active',mode==='wire');$('pan-mode').classList.toggle('active',mode==='pan');svg.classList.toggle('panning',mode==='pan'||space);}
  svg.addEventListener('click',e=>{if(Date.now()<suppressCanvasClickUntil&&!e.target.closest('[data-expanded-net]')){e.preventDefault();e.stopImmediatePropagation();}},true);
  svg.addEventListener('contextmenu',e=>e.preventDefault());
  svg.addEventListener('pointerdown',e=>{
    if(pastePreview){if(e.button===0){placePaste(e);svg.focus({preventScroll:true});}e.preventDefault();return;}
    if(![0,1,2].includes(e.button)||gesture||placement)return;if(expanded&&e.button===0&&(e.target.closest('[data-expanded-net],[data-bit-toggle]')||expanded.view.compact&&window.LogicExpanded.hitTest(expanded.view,worldPoint(e),6/camera.scale)))return;
    const p=worldPoint(e),nodeEl=e.target.closest('[data-node]'),port=e.target.closest('[data-port]'),wire=e.target.closest('[data-wire]'),toggleEl=e.target.closest('[data-toggle]');
    if(e.button===0&&!space&&expanded?.instanceView&&e.target.closest('[data-expanded-type=custom][data-expanded-node]')){gesture={type:'instance-node',id:e.target.closest('[data-expanded-node]').dataset.expandedNode,start:localPoint(e),camera:{...camera},moved:false};}
    else if(e.button===2&&expanded?.instanceView&&e.target.closest('[data-expanded-node]')){gesture={type:'delay-inspect',id:e.target.closest('[data-expanded-node]').dataset.expandedNode,start:localPoint(e),camera:{...camera},moved:false};}
    else if(e.button===0&&e.shiftKey&&!expanded){gesture={type:'marquee',start:p,current:p,beforeSelection:C.clone(selected)};updateMarquee(p);}
    else if(e.button===2&&(nodeEl||wire)){gesture={type:'right-delete',target:{type:nodeEl?'node':'wire',id:nodeEl?nodeEl.dataset.node:wire.dataset.wire},start:localPoint(e),moved:false,pointerId:e.pointerId};}
    else if(e.button===0&&wire&&mode==='pan'&&!space){gesture={type:'wire-select',wire:wire.dataset.wire,start:localPoint(e),camera:{...camera},moved:false};}
    else if(e.button===2||e.button===1||space||mode==='pan'){gesture={type:'pan',start:localPoint(e),camera:{...camera}};svg.classList.add('dragging');}
    else if(e.target.matches('input'))return;
    else if(toggleEl||e.target.closest('[data-bit-toggle]'))return;
    else if(port){const n=state.nodes.find(n=>n.id===nodeEl.dataset.node),q=C.ports(n,state.definitions).find(q=>q.dir===port.dataset.dir&&q.port===Number(port.dataset.port));gesture={type:'wire',start:q,a:endpoint(q),current:q,moved:false};}
    else if(nodeEl){const n=state.nodes.find(n=>n.id===nodeEl.dataset.node);if(selected?.type==='nodes'&&selected.ids.includes(n.id))beginGroupMove(p,e.pointerId);else{selected={type:'node',id:n.id};gesture={type:'node',id:n.id,start:p,x:n.x,y:n.y,before:null,moved:false};}renderSelection();}
    else {const s=snap(p);gesture={type:'wire',start:s.point,a:s.anchor,current:s.point,moved:false,wire:wire?.dataset.wire};}
    if(gesture){gesture.pointerId=e.pointerId;if(gesture.type==='wire')gesture.lastPointer=localPoint(e);svg.setPointerCapture(e.pointerId);svg.focus({preventScroll:true});e.preventDefault();}
  });
  svg.addEventListener('pointermove',e=>{
    // A mouse chord reports intermediate button presses/releases as pointermove.
    if(gesture&&e.pointerType==='mouse'&&e.pointerId===gesture.pointerId){
      const q=localPoint(e);
      if(gesture.type==='pan'&&e.buttons===3&&!expanded&&mode==='wire'){
        const s=snap(worldPoint(e));gesture={type:'wire',start:s.point,a:s.anchor,current:s.point,moved:false,pointerId:e.pointerId,lastPointer:q};
      }
      if(gesture.type==='wire'){
        if(!(e.buttons&1)){
          finish(e);
          if(e.buttons&2){gesture={type:'pan',start:q,camera:{...camera},pointerId:e.pointerId};svg.setPointerCapture(e.pointerId);svg.classList.add('dragging');}
          return;
        }
        if(e.buttons&2){camera.x+=q.x-gesture.lastPointer.x;camera.y+=q.y-gesture.lastPointer.y;setCamera();}
        gesture.lastPointer=q;svg.classList.toggle('dragging',!!(e.buttons&2));
      }
    }
    const p=worldPoint(e);$('coords').textContent='X '+Math.round(p.x)+' · Y '+Math.round(p.y);if(!gesture)return;
    if(gesture.type==='marquee'){updateMarquee(p);}
    else if(gesture.type==='right-delete'){gesture.moved=gesture.moved||C.distance(localPoint(e),gesture.start)>6;}
    else if(gesture.type==='pan'||gesture.type==='instance-node'||gesture.type==='wire-select'||gesture.type==='delay-inspect'){const q=localPoint(e);if(gesture.type==='instance-node'||gesture.type==='wire-select'||gesture.type==='delay-inspect')gesture.moved=gesture.moved||C.distance(q,gesture.start)>5;camera.x=gesture.camera.x+q.x-gesture.start.x;camera.y=gesture.camera.y+q.y-gesture.start.y;setCamera(true);}
    else if(gesture.type==='nodes'){moveGroup(p);}
    else if(gesture.type==='node'){const n=state.nodes.find(n=>n.id===gesture.id);if(!n)return;gesture.moved=gesture.moved||C.distance(p,gesture.start)*camera.scale>5;if(!gesture.moved)return;if(!gesture.before)gesture.before=snapshot();n.x=Math.round((gesture.x+p.x-gesture.start.x)/12)*12;n.y=Math.round((gesture.y+p.y-gesture.start.y)/12)*12;rerouteWires();sim=simulate(state);renderWires();renderNodes();}
    else {const s=snap(p);gesture.current=s.point;gesture.b=s.anchor;gesture.moved=C.distance(gesture.start,p)*camera.scale>6;const routed=C.route(gesture.a,s.anchor,state);$('draft-layer').innerHTML=routed?`<path class="draft" d="${path(routed)}"/>${s.snapped?`<circle class="snap-ring" cx="${s.point.x}" cy="${s.point.y}" r="10"/>`:''}`:'';}
  });
  function finish(e,cancel=false){
    if(!gesture)return;const g=gesture;gesture=null;svg.classList.remove('dragging');$('draft-layer').innerHTML='';if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
    if(g.type==='marquee'){suppressCanvasClickUntil=Date.now()+100;if(cancel)selected=g.beforeSelection;render();return;}
    if(g.type==='right-delete'){if(cancel||g.moved||C.distance(localPoint(e),g.start)>6)return;const hit=document.elementFromPoint(e.clientX,e.clientY),target=hit?.closest(g.target.type==='node'?'[data-node]':'[data-wire]');if(target&&(g.target.type==='node'?target.dataset.node:target.dataset.wire)===g.target.id){const n=state.nodes.find(n=>n.id===g.target.id);remove(g.target);}return;}
    if(g.type==='instance-node'){suppressCanvasClickUntil=Date.now()+100;if(cancel){camera={...g.camera};setCamera();}else if(!g.moved)enterGateView(g.id);save();return;}
    if(g.type==='delay-inspect'){if(cancel){camera={...g.camera};setCamera();}else if(!g.moved)openDelayInspector(g.id);save();return;}
    if(g.type==='wire-select'){if(!cancel&&!g.moved){selected={type:'wire',id:g.wire};activateWire({scope:'root',id:g.wire});}save();return;}
    if(g.type==='pan'){save();return;}
    if(g.type==='nodes'){if(cancel)state=g.before;else if(g.moved){suppressCanvasClickUntil=Date.now()+100;commit(g.before);}render();return;}
    if(g.type==='node'){if(g.moved){if(cancel)state=g.before;else commit(g.before);render();}else renderSelection();const n=state.nodes.find(n=>n.id===g.id);if(!cancel&&!g.moved&&n?.type==='custom'&&!gateEditor){suppressCanvasClickUntil=Date.now()+100;enterGateView(n.id);}else if(!cancel&&!g.moved&&n&&['hub','splitter'].includes(n.type))openBusDialog(n);return;}
    if(cancel)return;
    if(g.moved){if(state.wires.length>=1500)return toast('当前画布已达 1500 根导线');const b=g.b||snap(worldPoint(e)).anchor;if(JSON.stringify(g.a)===JSON.stringify(b))return;const routed=C.route(g.a,b,state);if(!routed)return toast('找不到避开逻辑门的路径，请调整元件位置');change(()=>{const w={id:uid('w'),a:g.a,b,via:routed.slice(1,-1),autoRoute:true};state.wires.push(w);selected={type:'wire',id:w.id};});if(sim.issues.length)toast(sim.issues[0]);}
    else {selected=g.wire?{type:'wire',id:g.wire}:null;if(g.wire)activateWire({scope:'root',id:g.wire});else renderSelection();}
  }
  svg.addEventListener('pointerup',e=>finish(e));svg.addEventListener('pointercancel',e=>finish(e,true));
  function highlightExpanded(target){
    const net=target.closest('[data-expanded-net]');svg.querySelectorAll('[data-expanded-net]').forEach(el=>{el.classList.toggle('is-focused',!!net&&el===net);el.classList.toggle('is-muted',!!net&&el!==net);});
    if(net?.dataset.expandedWire){const scope=expanded.instanceView?expanded.scope+(net.dataset.expandedScope||'root').slice(4):(net.dataset.expandedScope||'root');wireInspectorTarget={scope,id:net.dataset.expandedWire};try{activateWire(wireInspectorTarget);const current=svg.querySelector('[data-expanded-net="'+net.dataset.expandedNet+'"]');svg.querySelectorAll('[data-expanded-net]').forEach(el=>{el.classList.toggle('is-focused',el===current);el.classList.toggle('is-muted',el!==current);});}catch(error){toast(error.message);}}
    const live=net&&svg.querySelector('[data-expanded-net="'+net.dataset.expandedNet+'"]');$('selection-status').textContent=live?.dataset.description||net?.dataset.description||'实时调试 · 点击导线设置临时输入';
  }
  svg.addEventListener('click',e=>{if(expanded){if(expanded.view.compact&&e.target.closest('[data-expanded-scene]')){const hit=window.LogicExpanded.hitTest(expanded.view,worldPoint(e),6/camera.scale);if(hit)try{activateWire(hit);}catch(error){toast(error.message);}}else highlightExpanded(e.target);return;}const t=e.target.closest('[data-toggle]');if(t)toggle(t.dataset.toggle);});
  svg.addEventListener('keydown',e=>{if(expanded&&['Enter',' '].includes(e.key)&&e.target.closest('[data-expanded-net]')){e.preventDefault();e.stopPropagation();highlightExpanded(e.target);}});
  svg.addEventListener('keydown',e=>{const t=e.target.closest('[data-toggle]');if(t&&['Enter',' '].includes(e.key)){e.preventDefault();toggle(t.dataset.toggle);}});
  svg.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.0013),localPoint(e),true);},{passive:false});
  document.addEventListener('keydown',e=>{
    if(pastePreview){if(e.key==='Escape'){e.preventDefault();cancelPaste();}else if(!e.target.matches('input,select,textarea'))e.preventDefault();return;}
    if(e.key==='Escape'&&placement){e.preventDefault();endPlacement(null,true);return;}
    if(e.target.matches('input,select,textarea')||e.target.isContentEditable||document.querySelector('dialog[open]')||placement)return;
    if(expanded){if(e.key==='Escape'){e.preventDefault();if(expanded.libraryView)setGateMode('edit');else toggleExpanded();}else if(['Backspace','Delete'].includes(e.key)||e.ctrlKey||e.metaKey)e.preventDefault();return;}
    if((e.ctrlKey||e.metaKey)&&['c','v'].includes(e.key.toLowerCase())){e.preventDefault();if(!gesture&&!e.repeat){if(e.key.toLowerCase()==='c')copySelection();else pasteSelection();}return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();if(gesture)return;selected=state.nodes.length?{type:'nodes',ids:state.nodes.map(n=>n.id)}:null;window.getSelection()?.removeAllRanges();render();return;}
    if(e.code==='Space'){e.preventDefault();if(!e.repeat)rotateSelected();return;}
    if(e.key==='Escape'){if(gesture){if(['node','nodes'].includes(gesture.type)&&gesture.before)state=gesture.before;const pointerId=gesture.pointerId;gesture=null;svg.classList.remove('dragging');if(pointerId!==undefined&&svg.hasPointerCapture(pointerId))svg.releasePointerCapture(pointerId);$('draft-layer').innerHTML='';}selected=null;render();}
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
    if(!e.ctrlKey&&!e.metaKey){if(e.key.toLowerCase()==='h')setMode('pan');if(e.key.toLowerCase()==='w')setMode('wire');}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;setMode(mode);}});
  window.addEventListener('blur',()=>{endPlacement(null,true);if(gesture?.type==='right-delete'){const id=gesture.pointerId;gesture=null;if(svg.hasPointerCapture(id))svg.releasePointerCapture(id);}space=false;setMode(mode);});
  $('wire-mode').onclick=()=>setMode('wire');$('pan-mode').onclick=()=>setMode('pan');$('undo').onclick=undo;$('redo').onclick=redo;$('delete').onclick=()=>remove();
  $('zoom-in').onclick=()=>zoom(1.2);$('zoom-out').onclick=()=>zoom(1/1.2);$('fit').onclick=()=>fit();
  $('expand').onclick=toggleExpanded;
  $('expand-layers').onclick=()=>{if(gateEditor||expanded?.instanceView||gesture||placement)return;$('layers-count').value=String(expanded?.maxLayers||1);$('layers-error').textContent='';$('layers-dialog').showModal();$('layers-count').focus();$('layers-count').select();};
  $('layers-form').onsubmit=e=>{e.preventDefault();const text=$('layers-count').value.trim(),layers=Number(text);if(!/^[0-9]+$/.test(text)||!Number.isInteger(layers)||layers<1||layers>C.MAX_DEPTH){$('layers-error').textContent='请输入 1–'+C.MAX_DEPTH+' 之间的整数';return;}const debugNode=expanded?.debugNode;stopRunning();$('layers-dialog').close();if(expanded)returnToCircuit();enterExpanded(debugNode,layers);};$('rotate').onclick=rotateSelected;$('back-to-circuit').onclick=returnToCircuit;$('exit-gate').onclick=returnToCircuit;$('debug').onclick=()=>enterExpanded(selected?.id);
  $('help').onclick=()=>$('help-dialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('package').onclick=()=>{try{const d=C.makeDefinition(state,'新逻辑门');$('package-summary').textContent=d.inputs.length+' 个输入 · '+d.outputs.length+' 个输出 · '+state.nodes.length+' 个元件';$('package-error').textContent='';$('package-dialog').showModal();$('gate-name').focus();}catch(e){toast(e.message);}};
  $('package-form').onsubmit=e=>{e.preventDefault();try{if(Object.keys(state.definitions).length>=80)throw Error('自定义门数量已达 80 个');const d=C.makeDefinition(state,$('gate-name').value);change(()=>state.definitions[uid('g')]=d);$('package-dialog').close();$('gate-name').value='';toast('已封装「'+d.name+'」，可以在左侧元件库找到它。');}catch(e){$('package-error').textContent=e.message;}};
  $('new').onclick=()=>$('new-dialog').showModal();$('confirm-new').onclick=()=>{stopRunning();change(()=>{state={...initial(),definitions:state.definitions};selected=null;});fit(true);$('new-dialog').close();};
  function exportAll(){const text=unreadableSave??JSON.stringify({...storedSnapshot(),camera:gateEditor?gateEditor.camera:expanded?expanded.camera:camera},null,2);if(window.GameHubBridge&&typeof window.GameHubBridge.saveFile==='function'){if(!window.GameHubBridge.saveFile('逻辑工坊-全部存档.json',text))throw Error('宿主未受理导出');return;}const blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');try{a.href=url;a.download='逻辑工坊-全部存档.json';document.body.append(a);a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}}
  $('export').onclick=()=>{try{exportAll();toast('全部电路与自定义门已导出到一个存档文件');}catch{toast('导出失败，原内容已保留，请重试');}};
  $('export-clear').onclick=()=>{if(expanded||gesture||placement)return;$('export-clear-summary').textContent=state.nodes.length+' 个元件 · '+state.wires.length+' 根导线 · '+Object.values(state.definitions).filter(d=>!d.hidden).length+' 个自定义门';$('export-clear-dialog').showModal();};
  $('confirm-export-clear').onclick=()=>{if(expanded)return;stopRunning();try{exportAll();}catch{toast('导出失败，原内容已保留，请重试');return;}change(()=>{state={version:1,nodes:[],wires:[],definitions:{}};selected=null;});$('export-clear-dialog').close();toast('已导出并全部清空；取消下载或想恢复时，按 Ctrl+Z');};
  function importAllText(text){if(new TextEncoder().encode(text).length>2*1024*1024)throw Error('存档过大，请使用 2MB 以内的内容');const next=C.validate(JSON.parse(text));if(expanded)throw Error('全部收回后即可导入');stopRunning();unreadableSave=null;storageReadFailed=false;change(()=>{state=next;selected=null;});if(next.camera){camera=next.camera;setCamera();}else fit();toast('全部内容已导入，可以撤销恢复');}
  $('import').onclick=()=>{$('import-text').value='';$('import-error').textContent='';$('import-dialog').showModal();$('import-text').focus();};
  $('import-file').onclick=()=>$('file-input').click();
  $('import-form').onsubmit=e=>{e.preventDefault();try{importAllText($('import-text').value);$('import-dialog').close();}catch(error){$('import-error').textContent=error instanceof SyntaxError?'存档不是有效 JSON，请粘贴完整文字':error.message;}};
  $('copy-save').onclick=async()=>{const field=$('import-text'),text=unreadableSave??JSON.stringify({...storedSnapshot(),camera:expanded?expanded.camera:camera},null,2);field.value=text;field.focus();field.select();$('import-error').textContent='';try{await navigator.clipboard.writeText(text);toast('完整存档文字已复制，粘贴到“全部导入”即可恢复');}catch{toast('存档文字已选中，请按 Ctrl+C 复制');}};
  $('file-input').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2*1024*1024)throw Error('存档过大，请使用 2MB 以内的内容');importAllText(await f.text());$('import-dialog').close();}catch(error){toast(error instanceof SyntaxError?'文件不是有效 JSON':error.message);}e.target.value='';};
  // Activate touch controls directly on release. Some mobile browsers suppress
  // compatibility clicks after a captured SVG drag. Guard the later native
  // click so that a single tap never invokes a control twice.
  let touchButton=null,lastTouch=null;
  document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){const button=e.target.closest('button,[data-toggle],[data-bit-toggle]');touchButton=button?{button,x:e.clientX,y:e.clientY,id:e.pointerId}:null;}},true);
  document.addEventListener('pointercancel',()=>{touchButton=null;},true);
  document.addEventListener('pointerup',e=>{const t=touchButton;touchButton=null;if(e.pointerType!=='touch'||!t||t.id!==e.pointerId||t.button!==e.target.closest('button,[data-toggle],[data-bit-toggle]')||t.button.disabled||Math.hypot(e.clientX-t.x,e.clientY-t.y)>12)return;lastTouch={button:t.button,time:Date.now(),x:e.clientX,y:e.clientY};e.preventDefault();if(t.button.dataset.toggle)toggle(t.button.dataset.toggle);else if(t.button.dataset.bitToggle)activateBit(t.button);else t.button.click();},true);
  document.addEventListener('click',e=>{if(!e.isTrusted||!lastTouch||Date.now()-lastTouch.time>=700)return;const hit=e.target.closest('button,[data-toggle],[data-bit-toggle]'),sameButton=hit===lastTouch.button||(lastTouch.button.dataset.bitToggle&&hit?.dataset.bitToggle===lastTouch.button.dataset.bitToggle&&hit.dataset.bit===lastTouch.button.dataset.bit)||(lastTouch.button.dataset.toggle&&hit?.dataset.toggle===lastTouch.button.dataset.toggle),deletedRowClick=lastTouch.button.dataset.deleteCustom&&(e.pointerType==='touch'||e.sourceCapabilities?.firesTouchEvents)&&Math.hypot(e.clientX-lastTouch.x,e.clientY-lastTouch.y)<=12;if(sameButton||deletedRowClick){e.preventDefault();e.stopImmediatePropagation();}},true);
  let restored=false,recoveredBackup=false;
  try{let raw=localStorage.getItem('logic-workshop-v1');const pending=readBackups()[0];if(pending?.reason==='自动恢复备份'&&Object.hasOwn(pending,'recoverFrom')&&pending.recoverFrom===raw){try{C.validate(JSON.parse(pending.text));raw=pending.text;recoveredBackup=true;}catch{}}if(raw){backupText(raw,'加载前');unreadableSave=raw;state=C.validate(JSON.parse(raw));unreadableSave=null;if(state.camera){camera=state.camera;restored=true;}}}catch{storageReadFailed=unreadableSave===null;toast('上次存档无法读取，原记录已保留；请先全部导出备份。');}
  const oldRouting=snapshot();if(repairWirePaths()){past.push(oldRouting);save();}
  render();if(!restored)fit(true);if(recoveredBackup)checkpoint('恢复刷新备份后');
  let oldWidth=svg.clientWidth,oldHeight=svg.clientHeight;new ResizeObserver(()=>{const w=svg.clientWidth,h=svg.clientHeight;camera.x+=(w-oldWidth)/2;camera.y+=(h-oldHeight)/2;oldWidth=w;oldHeight=h;setCamera();}).observe(svg);
  window.LogicApp={getState:()=>C.clone({...storedSnapshot(),camera:expanded?expanded.camera:camera}),getSimulation:()=>C.clone(sim),getPerformance:()=>({expansion:expanded?.renderStats||window.LogicExpanded.getCacheStats(),simulation:{...simulate.stats},counts:{...countComponents.stats}}),getView:()=>({editingGate:gateEditor?.id||null,gateMode:gateEditor?(expanded?.libraryView?'view':'edit'):null,expanded:!!expanded,instanceView:!!expanded?.instanceView,depth:expanded?.instanceView?expanded.parents.length+1:0,debugNode:expanded?.debugNode||null,leafCount:expanded?.view.leaves.length||0,maxLayers:expanded?.maxLayers??null,pending:!!expanded?.view.pending,compact:!!expanded?.view.compact,camera:{...camera}})};
})();
