(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicWireworld=api;
  if(typeof importScripts==='function'){const controller=api.createController(data=>root.postMessage(data));root.onmessage=e=>controller.handle(e.data);}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EMPTY=0,WIRE=1,HEAD=2,TAIL=3,MAX_CELLS=200000,COLORS=['#000000','#f59e0b','#2684ff','#ffffff'];
  const key=(x,y)=>x+','+y,position=value=>Number.isSafeInteger(value)&&Math.abs(value)<=1000000000;
  function validate(cells){if(!Array.isArray(cells)||cells.length>MAX_CELLS)throw Error('图案最多支持20万个非空格');const seen=new Set();for(const p of cells){if(!Array.isArray(p)||p.length!==3||!position(p[0])||!position(p[1])||!Number.isInteger(p[2])||p[2]<0||p[2]>3||seen.has(key(p[0],p[1])))throw Error('电线世界图案格式不正确');seen.add(key(p[0],p[1]));}return cells;}
  class World{
    constructor(pattern={cells:[]}){if(!pattern||typeof pattern!=='object'||Array.isArray(pattern)||!Array.isArray(pattern.cells)||pattern.kind!==undefined&&pattern.kind!=='wireworld')throw Error('请使用电线世界图案');if(pattern.version!==undefined&&pattern.version!==1)throw Error('不支持这个图案版本');this.cells=new Map();this.heads=new Set();this.tails=new Set();this.generation=Number.isSafeInteger(pattern.generation)&&pattern.generation>=0?pattern.generation:0;this.edit(pattern.cells);}
    get(x,y){return this.cells.get(key(x,y))||EMPTY;}
    edit(cells){validate(cells);let size=this.cells.size;for(const [x,y,state] of cells){const previous=this.get(x,y);if(!previous&&state)size++;if(previous&&!state)size--;}if(size>MAX_CELLS)throw Error('图案最多支持20万个非空格');const changes=[];for(const [x,y,state] of cells){const id=key(x,y);if(this.get(x,y)===state)continue;if(state)this.cells.set(id,state);else this.cells.delete(id);this.heads.delete(id);this.tails.delete(id);if(state===HEAD)this.heads.add(id);if(state===TAIL)this.tails.add(id);changes.push([x,y,state]);}return changes;}
    step(){const counts=new Map(),nextHeads=new Set(),changes=[];for(const id of this.heads){const [x,y]=id.split(',').map(Number);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const n=key(x+dx,y+dy);if(this.cells.get(n)===WIRE)counts.set(n,(counts.get(n)||0)+1);}}
      for(const id of this.tails){this.cells.set(id,WIRE);const [x,y]=id.split(',').map(Number);changes.push([x,y,WIRE]);}
      for(const id of this.heads){this.cells.set(id,TAIL);const [x,y]=id.split(',').map(Number);changes.push([x,y,TAIL]);}
      for(const [id,count] of counts)if(count===1||count===2){this.cells.set(id,HEAD);nextHeads.add(id);const [x,y]=id.split(',').map(Number);changes.push([x,y,HEAD]);}
      this.tails=this.heads;this.heads=nextHeads;this.generation++;return changes;
    }
    status(){return {generation:this.generation,total:this.cells.size,heads:this.heads.size,tails:this.tails.size,wires:this.cells.size-this.heads.size-this.tails.size,stable:!this.heads.size&&!this.tails.size};}
    snapshot(){return {version:1,kind:'wireworld',generation:this.generation,cells:[...this.cells].map(([id,state])=>[...id.split(',').map(Number),state])};}
  }
  function line(x0,y0,x1,y1){if(![x0,y0,x1,y1].every(position)||Math.max(Math.abs(x1-x0),Math.abs(y1-y0))>=MAX_CELLS)throw Error('请放大画布后再绘制长线');const cells=[],dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let error=dx+dy;while(true){cells.push([x0,y0]);if(x0===x1&&y0===y1)break;const e=2*error;if(e>=dy){error+=dy;x0+=sx;}if(e<=dx){error+=dx;y0+=sy;}}return cells;}
  function sample(name='signal'){
    const cells=new Map(),put=(x,y,state=WIRE)=>cells.set(key(x,y),[x,y,state]);
    if(name==='signal'){for(let x=-24;x<=24;x++)put(x,0);put(-23,0,TAIL);put(-22,0,HEAD);}
    else if(name==='branch'){for(let x=-18;x<=0;x++)put(x,0);for(let x=1;x<=18;x++){put(x,-x);put(x,x);}put(-13,0,TAIL);put(-12,0,HEAD);}
    else if(name==='loop'){const vertices=[[3,0],[14,0],[17,3],[17,10],[14,13],[3,13],[0,10],[0,3]],path=[];for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];path.push(...line(...a,...b).slice(0,-1));}for(const [x,y] of path)put(x-8,y-6);put(path[0][0]-8,path[0][1]-6,TAIL);put(path[1][0]-8,path[1][1]-6,HEAD);}
    else if(name!=='empty')throw Error('没有这个示例');return {version:1,kind:'wireworld',generation:0,cells:[...cells.values()]};
  }
  function createController(send,compiler){
    let world=new World(),baseline=world.snapshot(),baselineDirty=false,timer=null,fast=false,epoch=0,compiled=null,values={},outputs=[],registers=[],cycle=1;
    const stop=()=>{clearInterval(timer);timer=null;fast=false;epoch++;},remember=()=>{if(baselineDirty){baseline=world.snapshot();baselineDirty=false;}},sample=()=>{for(const p of [...outputs,...registers])if(world.generation>=p.ready&&world.generation%compiled.period===p.phase)p.value=Number(world.get(p.x,p.y)===HEAD);};
    const snapshot=()=>({...world.snapshot(),...(compiled?{circuit:compiled.source,inputValues:{...values},cycle}: {})});
    const status=()=>({...world.status(),running:!!timer||fast,conversion:!!compiled,cycle,outputs,registers,inputs:compiled?compiled.inputs.map(({id,label,bit,type})=>({id,label,bit,type,value:values[id]})):[],logicalGates:compiled?.logicalGates||0,readyAt:compiled?.maxReady||0});
    const emit=(changes=[],replace=false)=>send({changes,status:status(),...(replace?{pattern:snapshot()}: {})});
    const readPorts=()=>{outputs=compiled?compiled.outputs.map(p=>({...p,value:null})):[];registers=compiled?compiled.registers.map(p=>({...p,value:null})):[];};
    function install(board,nextValues,pattern){const normalized={};for(const p of board.inputs){const value=nextValues?.[p.id]??p.value;if(value!==0&&value!==1)throw Error('电路输入必须为0或1');normalized[p.id]=value;}const next=new World(pattern||compiler.activate(board,normalized));stop();compiled=board;values=normalized;world=next;baseline=world.snapshot();baselineDirty=false;readPorts();sample();}
    const advance=()=>{const changes=world.step();if(compiled)sample();return changes;};
    return {destroy:stop,handle(d){try{
      if(d.type==='convert'){if(!compiler)throw Error('电路转换器未载入');const board=compiler.build(d.state);install(board,d.values);cycle=1;emit([],true);}
      else if(d.type==='load'){if(d.pattern?.circuit){if(!compiler)throw Error('电路转换器未载入');const board=compiler.build(d.pattern.circuit);install(board,d.pattern.inputValues,d.pattern);cycle=Number.isSafeInteger(d.pattern.cycle)?Math.max(1,d.pattern.cycle):1;}else{const next=new World(d.pattern);stop();compiled=null;values={};outputs=[];registers=[];world=next;baseline=world.snapshot();baselineDirty=false;cycle=1;}emit([],true);}
      else if(d.type==='input'){if(!compiled||!compiled.inputs.some(p=>p.id===d.id)||![0,1].includes(d.value))throw Error('电路输入必须为0或1');install(compiled,{...values,[d.id]:d.value});emit([],true);}
      else if(d.type==='next'){if(!compiled||!registers.length||registers.some(p=>p.value===null))throw Error('请先运行到本轮输出');const updated={...values};for(const p of registers)updated[p.source]=p.value;install(compiled,updated);cycle++;emit([],true);}
      else if(d.type==='edit'){stop();const changes=world.edit(d.cells);world.generation=0;compiled=null;values={};outputs=[];registers=[];baselineDirty=true;emit(changes);}
      else if(d.type==='step'){stop();remember();emit(advance());}
      else if(d.type==='run'){stop();remember();if(d.value&&(compiled||!world.status().stable))timer=setInterval(()=>{const changes=advance();if(world.status().stable&&(!compiled||[...outputs,...registers].every(p=>p.value!==null)))stop();emit(changes);},1000/Math.max(1,Math.min(120,Number(d.speed)||10)));emit();}
      else if(d.type==='settle'){if(!compiled)throw Error('请先转换当前电路');stop();fast=true;const token=epoch,target=Math.max(world.generation+compiled.period,compiled.maxReady+compiled.period),chunk=()=>{if(epoch!==token||!fast)return;const changes=new Map(),started=Date.now();let steps=0;while(world.generation<target&&steps<32&&Date.now()-started<20){for(const p of advance())changes.set(key(p[0],p[1]),p);steps++;}if(world.generation>=target)fast=false;emit([...changes.values()]);if(fast)setTimeout(chunk,0);};emit();setTimeout(chunk,0);}
      else if(d.type==='reset'){stop();if(compiled){world=new World(compiler.activate(compiled,values));readPorts();}else{remember();world=new World({...baseline,generation:0});}emit([],true);}
    }catch(error){stop();emit();send({error:error.message});}}};
  }
  return {EMPTY,WIRE,HEAD,TAIL,COLORS,MAX_CELLS,World,line,sample,createController};
});
