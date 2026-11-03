(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicWireworld=api;
  if(typeof importScripts==='function'){const controller=api.createController(data=>root.postMessage(data));root.onmessage=e=>controller.handle(e.data);}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EMPTY=0,WIRE=1,HEAD=2,TAIL=3,MAX_CELLS=200000,COLORS=['#000000','#f59e0b','#2684ff','#ffffff'];
  const key=(x,y)=>x+','+y,position=value=>Number.isSafeInteger(value)&&Math.abs(value)<=1000000000;
  function validate(cells){if(!Array.isArray(cells)||cells.length>MAX_CELLS)throw Error('图案最多支持20万个非空格');const seen=new Set();for(const p of cells){if(!Array.isArray(p)||p.length!==3||!position(p[0])||!position(p[1])||!Number.isInteger(p[2])||p[2]<0||p[2]>3||seen.has(key(p[0],p[1])))throw Error('电线世界图案格式不正确');seen.add(key(p[0],p[1]));}return cells;}
  class World{
    constructor(pattern={cells:[]}){if(!pattern||typeof pattern!=='object'||Array.isArray(pattern)||!Array.isArray(pattern.cells)||pattern.kind!==undefined&&pattern.kind!=='wireworld')throw Error('请使用电线世界图案');if(pattern.version!==undefined&&pattern.version!==1)throw Error('不支持这个图案版本');this._cells=new Map();this.neighbours=new Map();this.topology=null;this.heads=new Set();this.tails=new Set();this.generation=Number.isSafeInteger(pattern.generation)&&pattern.generation>=0?pattern.generation:0;this.edit(pattern.cells);}
    get cells(){const t=this.topology;if(t?.dirty){for(let i=0;i<t.ids.length;i++)this._cells.set(t.ids[i],t.states[i]);t.dirty=false;}return this._cells;}
    get(x,y){const id=key(x,y),t=this.topology;return t?(t.states[t.index.get(id)]||EMPTY):(this._cells.get(id)||EMPTY);}
    edit(cells){validate(cells);void this.cells;this.topology=null;let size=this.cells.size;for(const [x,y,state] of cells){const previous=this.get(x,y);if(!previous&&state)size++;if(previous&&!state)size--;}if(size>MAX_CELLS)throw Error('图案最多支持20万个非空格');if(cells.some(([x,y,state])=>this.cells.has(key(x,y))!==!!state))this.neighbours.clear();const changes=[];for(const [x,y,state] of cells){const id=key(x,y);if(this.get(x,y)===state)continue;if(state)this.cells.set(id,state);else this.cells.delete(id);this.heads.delete(id);this.tails.delete(id);if(state===HEAD)this.heads.add(id);if(state===TAIL)this.tails.add(id);changes.push([x,y,state]);}return changes;}
    step(collect=true){
      if(!this.topology){const ids=[...this.cells.keys()],index=new Map(ids.map((id,i)=>[id,i])),coords=ids.map(id=>id.split(',').map(Number)),states=Uint8Array.from(ids,id=>this.cells.get(id)),neighbours=new Int32Array(ids.length*8).fill(-1);for(let i=0;i<ids.length;i++){const [x,y]=coords[i];let k=i*8;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)neighbours[k++]=index.get(key(x+dx,y+dy))??-1;}this.topology={ids,index,coords,states,neighbours,counts:new Uint8Array(ids.length),heads:[...this.heads].map(id=>index.get(id)),tails:[...this.tails].map(id=>index.get(id))};}
      const t=this.topology,touched=[],next=[],changes=[],headIds=new Set(),counts=t.counts;
      for(const i of t.heads)for(let k=i*8;k<i*8+8;k++){const n=t.neighbours[k];if(n>=0&&t.states[n]===WIRE){if(!counts[n])touched.push(n);counts[n]++;}}
      const set=(i,state)=>{t.states[i]=state;if(collect)changes.push([t.coords[i][0],t.coords[i][1],state]);};
      for(const i of t.tails)set(i,WIRE);for(const i of t.heads)set(i,TAIL);for(const i of touched){if(counts[i]===1||counts[i]===2){set(i,HEAD);next.push(i);headIds.add(t.ids[i]);}counts[i]=0;}
      t.dirty=true;t.tails=t.heads;t.heads=next;this.tails=this.heads;this.heads=headIds;this.generation++;return changes;
    }
    status(){return {generation:this.generation,total:this._cells.size,heads:this.heads.size,tails:this.tails.size,wires:this._cells.size-this.heads.size-this.tails.size,stable:!this.heads.size&&!this.tails.size};}
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
  function toRLE(pattern){
    if(!pattern||pattern.kind!==undefined&&pattern.kind!=='wireworld')throw Error('请使用电线世界图案');validate(pattern.cells);
    const cells=pattern.cells.filter(p=>p[2]!==EMPTY).slice().sort((a,b)=>a[1]-b[1]||a[0]-b[0]);let minX=0,minY=0,maxX=-1,maxY=-1;
    if(cells.length){minX=Infinity;minY=cells[0][1];maxX=-Infinity;maxY=cells.at(-1)[1];for(const [x] of cells){minX=Math.min(minX,x);maxX=Math.max(maxX,x);}}
    const lines=[],tokens=[],symbols={1:'C',2:'A',3:'B'},add=(n,s)=>{if(n)tokens.push((n>1?n:'')+s);};let row=minY,x=minX,run=0,symbol='';
    const flush=()=>{add(run,symbol);run=0;};
    for(const [cx,cy,state] of cells){if(cy!==row){flush();add(cy-row,'$');row=cy;x=minX;}if(cx>x){flush();add(cx-x,'.');}const next=symbols[state];if(next!==symbol){flush();symbol=next;}run++;x=cx+1;}flush();tokens.push('!');let line='';for(const token of tokens){if(line.length+token.length>70){lines.push(line);line='';}line+=token;}if(line)lines.push(line);
    const generation=Number.isSafeInteger(pattern.generation)&&pattern.generation>=0?pattern.generation:0;
    return '#CXRLE Pos='+minX+','+minY+' Gen='+generation+'\n#C Exported from Logic Workshop Wireworld\nx = '+(maxX-minX+1)+', y = '+(maxY-minY+1)+', rule = WireWorld\n'+lines.join('\n')+'\n';
  }
  function createController(send,compiler){
    let world=new World(),baseline=world.snapshot(),baselineDirty=false,timer=null,fast=false,epoch=0,compiled=null,values={},outputs=[],registers=[],cycle=1,feedbackPending=false;const pending=new Map();
    const stop=()=>{clearInterval(timer);timer=null;fast=false;epoch++;},remember=()=>{if(baselineDirty){baseline=world.snapshot();baselineDirty=false;}},sample=()=>{for(const p of [...outputs,...registers])if(world.generation>=p.ready&&world.generation%compiled.period===p.phase){p.value=Number(world.get(p.x,p.y)===HEAD);p.sampledAt=world.generation;}for(const p of compiled.feedbacks||[])if(world.generation>=p.ready&&world.generation%compiled.period===p.phase){const value=Number(world.get(p.x,p.y)===HEAD);if(values[p.source]!==value){values[p.source]=value;p.changedAt=world.generation;}}};
    const snapshot=()=>({...world.snapshot(),...(compiled?{layoutVersion:compiler.LAYOUT_VERSION||1,circuit:compiled.source,inputValues:{...values},cycle}: {})});
    const status=()=>({...world.status(),running:!!timer||fast,conversion:!!compiled,physicalFeedback:!!compiled?.feedbacks?.length,cycle,outputs,registers,inputs:compiled?compiled.inputs.map(({id,label,bit,type})=>({id,label,bit,type,value:values[id]})):[],logicalGates:compiled?.logicalGates||0,readyAt:compiled?.maxReady||0});
    const emit=(changes=[],replace=false)=>{if(replace)pending.clear();else for(const p of changes)pending.set(key(p[0],p[1]),p);send({changes:[...pending.values()],status:status(),...(replace?{pattern:snapshot()}: {})});pending.clear();};
    const readPorts=()=>{feedbackPending=false;outputs=compiled?compiled.outputs.map(p=>({...p,value:null})):[];registers=compiled?compiled.registers.map(p=>({...p,value:null})):[];};
    function install(board,nextValues,pattern){const normalized={};for(const p of board.inputs){const value=p.type==='constant'?1:nextValues?.[p.id]??p.value;if(value!==0&&value!==1)throw Error('电路输入必须为0或1');normalized[p.id]=value;}const next=new World(pattern||compiler.activate(board,normalized));stop();compiled=board;values=normalized;world=next;baseline=world.snapshot();baselineDirty=false;readPorts();sample();}
    const advance=()=>{const changes=world.step();if(compiled)sample();return changes;};
    return {destroy:stop,handle(d){try{
      if(d.type==='convert'){if(!compiler)throw Error('电路转换器未载入');const board=compiler.build(d.state);install(board,d.values);cycle=1;emit([],true);}
      else if(d.type==='load'){if(d.pattern?.circuit){if(!compiler)throw Error('电路转换器未载入');const board=compiler.build(d.pattern.circuit),migrated=d.pattern.layoutVersion!==(compiler.LAYOUT_VERSION||1);install(board,d.pattern.inputValues,migrated?undefined:d.pattern);cycle=Number.isSafeInteger(d.pattern.cycle)?Math.max(1,d.pattern.cycle):1;if(migrated){send({previousPattern:d.pattern});}}else{const next=new World(d.pattern);stop();compiled=null;values={};outputs=[];registers=[];world=next;baseline=world.snapshot();baselineDirty=false;cycle=1;}emit([],true);}
      else if(d.type==='input'){if(!compiled||!compiled.inputs.some(p=>p.id===d.id&&p.type==='input')||![0,1].includes(d.value))throw Error('电路输入必须为0或1');install(compiled,{...values,[d.id]:d.value});emit([],true);}
      else if(d.type==='next'){if(!compiled||!registers.length||registers.some(p=>p.value===null))throw Error('请先运行到本轮输出');const updated={...values};for(const p of registers)updated[p.source]=p.value;install(compiled,updated);cycle++;emit([],true);}
      else if(d.type==='edit'){stop();const changes=world.edit(d.cells);world.generation=0;compiled=null;values={};outputs=[];registers=[];baselineDirty=true;emit(changes);}
      else if(d.type==='step'){stop();remember();emit(advance());}
      else if(d.type==='run'){stop();remember();if(d.value&&(compiled||!world.status().stable)){const speed=Math.max(1,Math.min(120,Number(d.speed)||10));let lastTick=Date.now(),lastEmit=lastTick,credit=0;timer=setInterval(()=>{const now=Date.now();credit=Math.min(32,credit+(now-lastTick)*speed/1000);lastTick=now;const started=Date.now();while(credit>=1&&Date.now()-started<8){credit--;for(const p of advance())pending.set(key(p[0],p[1]),p);if(compiled&&registers.length&&[...outputs,...registers].every(p=>p.value!==null)&&registers.every(p=>{const f=compiled.feedbacks?.find(q=>q.source===p.source);return p.value===values[p.source]&&(!f||(p.sampledAt||0)>=(f.changedAt||0)+f.settle);})){stop();break;}if(world.status().stable&&(!compiled||[...outputs,...registers].every(p=>p.value!==null))){stop();break;}}if(!timer||now-lastEmit>=30){emit();lastEmit=now;}},16);}emit();}
      else if(d.type==='settle'){if(!compiled)throw Error('请先转换当前电路');stop();fast=true;const token=epoch,target=Math.max(world.generation+compiled.period,compiled.maxReady+compiled.period),chunk=()=>{if(epoch!==token||!fast)return;const changes=new Map(),started=Date.now();let steps=0;while(world.generation<target&&steps<32&&Date.now()-started<20){for(const p of advance())changes.set(key(p[0],p[1]),p);steps++;}if(world.generation>=target)fast=false;emit([...changes.values()]);if(fast)setTimeout(chunk,0);};emit();setTimeout(chunk,0);}
      else if(d.type==='reset'){stop();if(compiled){world=new World(compiler.activate(compiled,values));readPorts();}else{remember();world=new World({...baseline,generation:0});}emit([],true);}
    }catch(error){stop();emit();send({error:error.message});}}};
  }
  return {EMPTY,WIRE,HEAD,TAIL,COLORS,MAX_CELLS,World,line,sample,toRLE,createController};
});
