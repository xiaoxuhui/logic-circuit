(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('life-dialog'), canvas = $('life-canvas'), ctx = canvas.getContext('2d');
  const workerURL = new URL('conway-life-worker.js',document.currentScript.src);
  const controls = ['life-step','life-next','life-reset'];
  const pendingToggles = new Set();
  let worker, state, bounds, busy, running, timer, drag, frame, wanted, viewPending, picture;
  let camera = {x:0,y:0,scale:1};

  function message(text, error = false) {
    $('life-status').textContent = text;
    $('life-status').classList.toggle('error',error);
  }

  function render() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!picture)return;
    const {x,y,scale}=camera, {points,block}=picture;
    const size=Math.max(1,block*scale);
    ctx.fillStyle='#e4f5e8';
    for(let i=0;i<points.length;i+=2){
      const left=Math.floor(x+points[i]*scale),top=Math.floor(y+points[i+1]*scale);
      if(left<canvas.width&&top<canvas.height&&left+size>0&&top+size>0)ctx.fillRect(left,top,size,size);
    }
  }

  function requestView() {
    wanted=true;
    if(frame)return;
    frame=requestAnimationFrame(()=>{
      frame=0;
      render();
      if(!worker||!state||viewPending||!wanted)return;
      wanted=false;viewPending=true;
      const {x,y,scale}=camera;
      const block=2**Math.max(0,Math.floor(Math.log2(1/scale)));
      worker.postMessage({type:'view',bounds:{left:-x/scale,top:-y/scale,right:(canvas.width-x)/scale,bottom:(canvas.height-y)/scale,block}});
    });
  }

  function fit() {
    if(!bounds)return;
    const {minX,minY,maxX,maxY}=bounds;
    const scale=Math.min(10,canvas.width/Math.max(1,maxX-minX+1),canvas.height/Math.max(1,maxY-minY+1))*.88;
    camera={x:canvas.width/2-(minX+maxX)*scale/2,y:canvas.height/2-(minY+maxY)*scale/2,scale};
    requestView();
  }

  function locate({x,y}) {
    const scale=7;
    camera={x:canvas.width/2-x*scale,y:canvas.height/2-y*scale,scale};
    requestView();
  }

  function ports(container, data, interactive) {
    const active=document.activeElement;
    const focusIndex=container.contains(active) ? active.dataset.lifeIndex : undefined;
    const controls = data.map((port,index)=>{
      const row=document.createElement('div'), label=document.createElement('button'), value=document.createElement(interactive?'button':'span');
      row.className='life-port';label.className='subtle';label.textContent=port.label;label.title='在画布定位';label.onclick=()=>locate(port);
      label.dataset.lifeIndex=`locate-${index}`;
      value.className='signal-switch';value.classList.toggle('on',port.value===1);value.textContent=port.value ?? '—';
      if(interactive){
        value.dataset.lifeIndex=`toggle-${index}`;
        value.disabled=!port.editable;
        value.setAttribute('aria-label',`${port.label}，当前 ${port.value}${port.editable?'，点击切换':'，未接入电路'}`);
        value.onclick=()=>{
          if(pendingToggles.has(index))pendingToggles.delete(index);
          else pendingToggles.add(index);
          flushToggle();
        };
      }
      row.append(label,value);return row;
    });
    if(!controls.length)container.textContent=interactive?'无外部输入':'无外部输出';
    else container.replaceChildren(...controls);
    if(focusIndex!==undefined)container.querySelector(`[data-life-index="${focusIndex}"]`)?.focus({preventScroll:true});
  }

  function updateControls() {
    $('life-run').disabled=!state;
    $('life-run').textContent=running?'暂停':'运行';
    for(const id of controls)$(id).disabled=!state||busy;
  }

  function send(type, payload = {}) {
    if(!worker||busy)return;
    busy=true;updateControls();
    if(type==='step'&&payload.amount==='sample')message('正在按生命游戏规则演化…');
    worker.postMessage({type,...payload});
  }

  function nextRun() {
    clearTimeout(timer);
    if(!running||busy)return;
    timer=setTimeout(()=>{
      const speed=$('life-speed').value;
      send('step',{amount:speed==='sample'?speed:Number(speed)});
    },80);
  }

  function flushToggle() {
    if(busy||!pendingToggles.size)return;
    const index=pendingToggles.values().next().value;
    pendingToggles.delete(index);
    send('toggle',{index});
  }

  function setRunning(value) {
    running=value;
    updateControls();nextRun();
  }

  function receive({data}) {
    if(data.type==='view'){
      viewPending=false;picture=data;
      if(wanted)requestView();else render();
      return;
    }
    busy=false;
    if(data.type==='error'){
      if(data.operation==='view')viewPending=false;
      pendingToggles.clear();
      setRunning(false);message(data.message,true);return;
    }
    const previous=state;
    state=data;
    if(!previous)$('life-speed').value=data.period?'sample':'60';
    if(data.bounds){bounds=data.bounds;fit();}
    $('life-generation').textContent=`第 ${data.generation.toLocaleString()} 代`;
    $('life-timing').textContent=data.period ? `每 ${data.period.toLocaleString()} 代一拍` : '';
    $('life-read-at').textContent=data.reading?`第 ${data.reading.generation.toLocaleString()} 代`:'等待读取';
    $('life-next').textContent=data.period?'下一拍':'运行到输出';
    if(data.bounds||data.inputs.some((port,i)=>port.value!==previous?.inputs[i]?.value))ports($('life-inputs'),data.inputs,true);
    if(data.bounds||data.reading?.generation!==previous?.reading?.generation)ports($('life-outputs'),data.outputs.map((port,i)=>({...port,value:data.reading?.values[i]})),false);
    message(data.notice || (running?'正在运行':data.openLoop?'临时导线输入只转换当前一拍。':data.period?'可用「下一拍」读取同步输出。':'点击「运行到输出」读取信号。'),!!data.notice);
    updateControls();requestView();flushToggle();nextRun();
  }

  function resize() {
    if(!dialog.open)return;
    const rect=canvas.getBoundingClientRect();
    canvas.width=Math.max(1,Math.round(rect.width));canvas.height=Math.max(1,Math.round(rect.height));
    requestView();
  }

  $('life-open').onclick=()=>{
    dialog.showModal();
    state=bounds=picture=drag=null;busy=running=viewPending=false;
    pendingToggles.clear();
    $('life-generation').textContent='第 0 代';
    for(const id of ['life-timing','life-inputs','life-outputs','life-read-at'])$(id).textContent='';
    resize();updateControls();message('正在转换当前电路…');
    try{
      const bridge=new Worker(workerURL);
      worker=bridge;
      bridge.onmessage=event=>{if(worker===bridge)receive(event);};
      bridge.onerror=()=>{if(worker===bridge){busy=false;setRunning(false);message('无法启动模拟，请通过本地服务打开逻辑工坊。',true);}};
      send('init',{source:window.LogicApp.getObservationState()});
    }catch(error){message(error.message,true);}
  };
  $('life-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{
    worker?.terminate();worker=null;
    running=false;clearTimeout(timer);cancelAnimationFrame(frame);frame=0;
    $('life-open').focus();
  });
  $('life-fit').onclick=fit;
  $('life-run').onclick=()=>setRunning(!running);
  $('life-step').onclick=()=>{setRunning(false);send('step',{amount:1});};
  $('life-next').onclick=()=>{setRunning(false);send('step',{amount:'sample'});};
  $('life-reset').onclick=()=>{setRunning(false);send('reset');};
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX-camera.x,y:e.clientY-camera.y};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId){camera.x=e.clientX-drag.x;camera.y=e.clientY-drag.y;requestView();}});
  canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    const scale=Math.min(36,Math.max(.000001,camera.scale*Math.exp(-e.deltaY*.0015)));
    const ratio=scale/camera.scale;
    camera={x:x-(x-camera.x)*ratio,y:y-(y-camera.y)*ratio,scale};requestView();
  },{passive:false});
  new ResizeObserver(resize).observe(canvas);
})();
