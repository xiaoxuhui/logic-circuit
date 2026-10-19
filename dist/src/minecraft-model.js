(function(root,factory){
  if(typeof importScripts==='function'&&!root.LogicCore)importScripts('./core.js','./expanded.js');
  const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.LogicCore,typeof module==='object'&&module.exports?require('./expanded.js'):root.LogicExpanded);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicMinecraft=api;
  if(typeof importScripts==='function')root.onmessage=e=>{try{root.postMessage({progress:5,message:'正在读取电路与内部结构…'});const model=api.build(e.data.state,(progress,message)=>root.postMessage({progress,message}));root.postMessage({model},model.batches.map(b=>b.data.buffer));}catch(error){root.postMessage({error:error.message||'转换失败'});}};
})(typeof globalThis!=='undefined'?globalThis:this,function(C,E){
  'use strict';
  const STRIDE=11,GRID=24;
  const BLOCKS=Object.freeze({support:{name:'白色混凝土',color:0xc7d1cc},dust:{name:'红石粉',color:0x9f2922},torch:{name:'红石火把',color:0xcf6140},repeater:{name:'红石中继器',color:0xc5bab0},leverBase:{name:'拉杆底座',color:0x858e88},leverHandle:{name:'拉杆',color:0xb2a17b},lamp:{name:'红石灯',color:0xb27836},glass:{name:'内部端子',color:0x6fbbba}});
  const rgb=hex=>[(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255];
  const high=0xef4a2b,low=0x66231c;
  function advanceCamera(camera,keys,seconds,speed=12){
    const has=key=>keys.has?keys.has(key):keys.includes(key),forward=Number(has('KeyW'))-Number(has('KeyS')),right=Number(has('KeyD'))-Number(has('KeyA')),up=Number(has('Space'))-Number(has('ShiftLeft')||has('ShiftRight')),distance=Math.min(.05,Math.max(0,seconds))*speed/Math.max(1,Math.hypot(forward,right,up)),sin=Math.sin(camera.yaw),cos=Math.cos(camera.yaw);
    return {...camera,x:camera.x+(cos*right-sin*forward)*distance,y:camera.y+up*distance,z:camera.z+(-sin*right-cos*forward)*distance};
  }
  function look(camera,dx,dy){return {...camera,yaw:camera.yaw-dx*.0025,pitch:Math.max(-Math.PI/2+.02,Math.min(Math.PI/2-.02,camera.pitch-dy*.0025))};}
  function build(source,progress=()=>{}){
    const state=C.validate(source),view=E.build(state),layouts=new Map(view.layouts.map(l=>[l.scope,l])),rootScope=view.layouts.at(-1).scope,offsets=new Map([[rootScope,{x:0,z:0}]]),locals=new Map([[rootScope,state]]),leaves=new Map(view.leaves.map(n=>[n.scope+'/'+n.id,n])),batches=new Map(),components=[],bounds={min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};
    let instanceCount=0,focus=null;progress(30,'正在摆放内置红石方块…');
    for(const scope of offsets.keys())for(const child of layouts.get(scope).children||[]){const p=offsets.get(scope),node=locals.get(scope).nodes.find(n=>scope+'/'+n.id===child.scope);offsets.set(child.scope,{x:p.x+child.x,z:p.z+child.y});locals.set(child.scope,{...state.definitions[node.def],definitions:state.definitions});}
    function block(kind,x,y,z,w=1,h=1,d=1,yaw=0,color=BLOCKS[kind].color,tilt=0){
      const key=kind+':'+Math.floor(x/96)+':'+Math.floor(z/96),entry=batches.get(key)||{kind,key,values:[]};if(!batches.has(key))batches.set(key,entry);
      entry.values.push(x,y,z,w,h,d,yaw,...rgb(color),tilt);instanceCount++;
      const c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw)),extent={x:(w*c+d*s)/2,y:h/2,z:(w*s+d*c)/2};for(const axis of ['x','y','z']){const value=axis==='x'?x:axis==='y'?y:z;bounds.min[axis]=Math.min(bounds.min[axis],value-extent[axis]);bounds.max[axis]=Math.max(bounds.max[axis],value+extent[axis]);}
    }
    function segment(a,b,y,kind,color,thickness=.13){const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.001)return;block(kind,(a.x+b.x)/2,y,(a.z+b.z)/2,thickness,kind==='support'?.24:.055,length,Math.atan2(b.x-a.x,b.z-a.z),color);}
    let done=0;
    for(const [scope,offset] of offsets){const layout=layouts.get(scope),local=locals.get(scope),children=new Set((layout.children||[]).map(c=>c.scope.slice(scope.length+1))),portSignals=new Map();
      for(const route of layout.routes)for(const p of route.ports)portSignals.set(C.key(p),route.bits||[0]);
      for(const box of layout.boxes){if(children.has(box.id))continue;const node=local.nodes.find(n=>n.id===box.id),leaf=leaves.get(scope+'/'+box.id),base=C.baseSize(node,state.definitions),W=base.w/GRID,D=base.h/GRID,origin={x:(offset.x+box.x)/GRID,z:(offset.z+box.y)/GRID},rootIO=scope===rootScope&&['input','output'].includes(node.type),signal=leaf?.output||leaf?.values?.[0]||portSignals.get(C.key({node:node.id,dir:node.type==='input'?'out':'in',port:0}))||[0];
        const put=(kind,x,y,z,w,h,d,color,tilt=0)=>{const p=C.rotatedPoint({x:x*GRID,y:z*GRID},{...node,x:0,y:0},state.definitions);block(kind,origin.x+p.x/GRID,y,origin.z+p.y/GRID,w,h,d,-(node.rotation||0)*Math.PI/180,color,tilt);};
        put('support',W/2,.25,D/2,W,.5,D);
        if(rootIO){for(let bit=0;bit<(node.bits||1);bit++){const x=W/2-((node.bits||1)-1)*.5+bit,on=!!signal[(node.bits||1)-1-bit];if(node.type==='input'){put('leverBase',x,.61,D/2,.7,.22,.7);put('leverHandle',x+(on?.17:-.17),1,D/2,.13,.7,.13,on?0xd7bd83:0xa49371,on?-.5:.5);}else put('lamp',x,1,D/2,.88,1,.88,on?0xffcd63:0x684522);}}
        else if(['input','output'].includes(node.type))put('glass',W/2,.7,D/2,.6,.4,.6,signal.some(Boolean)?0x9ce9d4:0x477f7f);
        else if(node.type==='nand'){
          const inputs=leaf?.inputs||[[0],[0]],out=leaf?.values?.[0]?.[0]||0;
          for(let i=0;i<2;i++){const z=D/2+(i? .6:-.6),lit=!inputs[i]?.[0];put('support',2,.9,z,.8,.8,.8);put('torch',2.5,1.06,z,.13,.65,.13,lit?0xffa94c:0x51352b);put('dust',1,.55,z,1.2,.06,.12,inputs[i]?.[0]?high:low);put('dust',3.6,.55,z,1.9,.06,.12,lit?high:low);}
          put('dust',W-.8,.55,D/2,.13,.06,1.4,out?high:low);put('dust',W-.4,.55,D/2,.8,.06,.13,out?high:low);
        }else if(node.type==='delay'){
          put('repeater',W/2,.64,D/2,1.8,.27,1.1);for(const x of [-.5,.5])put('torch',W/2+x,.94,D/2,.13,.4,.13,signal.some(Boolean)?0xffa94c:0x51352b);put('dust',W/2,.8,D/2,1.5,.04,.08,signal.some(Boolean)?high:low);
        }else{const ps=C.ports({...node,x:0,y:0,rotation:0},state.definitions);for(const p of ps){const on=portSignals.get(C.key(p))?.some(Boolean);put('dust',p.x/GRID+(p.dir==='in'?.7:-.7),.55,p.y/GRID,1.4,.06,.1,on?high:low);}put('glass',W/2,.75,D/2,.65,.5,Math.min(D-1,1.5));}
        const center={x:origin.x+box.w/GRID/2,y:1,z:origin.z+box.h/GRID/2};components.push({id:node.id,scope,type:node.type,label:node.label||(node.type==='input'?'输入':node.type==='output'?'输出':node.type==='nand'?'与非门':node.type==='delay'?'延迟线':node.type==='hub'?'集线器':'分线器'),bits:node.bits||1,signal:signal.slice(),...center});if(!focus||rootIO&&node.type==='input'&&focus.type!=='input')focus={...center,type:node.type};
      }
      layout.routes.forEach((route,index)=>{const y=1.35+index*.3,on=route.bits?.some(Boolean),color=on?high:low;for(const ps of route.paths){const points=ps.map(p=>({x:(offset.x+p.x)/GRID,z:(offset.z+p.y)/GRID}));for(let i=1;i<points.length;i++){segment(points[i-1],points[i],y-.16,'support',0x8a9a96,.3);segment(points[i-1],points[i],y,'dust',color);}if(points.length){const p=points[0];block('dust',p.x,(y+.6)/2,p.z,.1,Math.max(.05,y-.6),.1,0,color);}}});
      done++;if(done%20===0)progress(30+Math.round(done/offsets.size*65),'正在生成结构 '+done+' / '+offsets.size);
    }
    if(!instanceCount){bounds.min={x:-1,y:0,z:-1};bounds.max={x:1,y:1,z:1};}
    return {batches:[...batches.values()].map(b=>({kind:b.kind,key:b.key,data:new Float32Array(b.values)})),instanceCount,components,bounds,focus:focus||{x:0,y:1,z:0},library:'内置红石方块',snapshot:true};
  }
  return {BLOCKS,STRIDE,advanceCamera,look,build};
});
