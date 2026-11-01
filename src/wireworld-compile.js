(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core'):root.LogicCore,typeof module==='object'&&module.exports?require('./domino-model'):root.LogicDomino,typeof module==='object'&&module.exports?require('./wireworld-model'):root.LogicWireworld);if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicWireworldCompile=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C,D,W){
  'use strict';
  const PERIOD=16,mod=n=>(n%PERIOD+PERIOD)%PERIOD;
  // Grid paths bevel right-angle turns, keeping nonadjacent wire cells out of each other's Moore neighbourhood.
  function route(points,radii={}){const result=[],append=p=>{if(!result.length||result.at(-1)[0]!==p[0]||result.at(-1)[1]!==p[1])result.push(p);},line=p=>{if(!result.length){append(p);return;}for(const q of W.line(...result.at(-1),...p).slice(1))append(q);};line(points[0]);for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],u=[Math.sign(b[0]-a[0]),Math.sign(b[1]-a[1])],v=[Math.sign(c[0]-b[0]),Math.sign(c[1]-b[1])];if(u[0]*v[0]+u[1]*v[1]===0&&Math.abs(u[0])+Math.abs(u[1])===1&&Math.abs(v[0])+Math.abs(v[1])===1){const r=Math.min(radii[i]||1,Math.floor(Math.hypot(b[0]-a[0],b[1]-a[1])/2),Math.floor(Math.hypot(c[0]-b[0],c[1]-b[1])/2));line([b[0]-u[0]*r,b[1]-u[1]*r]);line([b[0]+v[0]*r,b[1]+v[1]*r]);}else line(b);}line(points.at(-1));return result;}
  function build(source){
    source=C.validate(source);let graph;try{graph=D.flatten(source);}catch(error){if(error.message.includes('反馈环'))throw Error('当前电路的反馈回路需要延迟线才能转换；画布中可以直接绘制循环线路');throw error;}const cells=new Map(),inputs=[],sourceMap=new Map(),expressions=new Map(),nets=new Map(),outputs=[],registers=[],modules=[];let gateCount=0;
    const put=(x,y,state=W.WIRE)=>{const id=x+','+y;if(!cells.has(id)&&cells.size>=W.MAX_CELLS)throw Error('转换后的电线世界超过20万个格子');if(!cells.has(id)||state!==W.WIRE)cells.set(id,[x,y,state]);},wire=points=>{for(const p of points)put(...p);},sources=graph.items.filter(p=>p.type==='input'||p.type==='delay').sort((a,b)=>(a.sourceY||0)-(b.sourceY||0)||(a.sourceX||0)-(b.sourceX||0)||b.bit-a.bit);
    for(const p of sources){const input={id:p.id,label:p.label,bit:p.bit,value:p.value,type:p.type,seeds:[]};inputs.push(input);sourceMap.set(p,input);expressions.set(p,{type:'source',source:input,w:48,h:40});}
    const zero={type:'zero',w:16,h:40},not=a=>({type:'not',a,w:a.w+70,h:a.h}),or=(a,b)=>({type:'or',a,b,w:Math.max(a.w,b.w)+75,h:a.h+b.h+32});
    const net=t=>{if(nets.has(t))return nets.get(t);const children=(graph.drivers.get(t)||[]).map(p=>expressions.get(p));if(children.some(p=>!p))throw Error('转换拓扑未就绪');const expr=children.reduce((a,b)=>a?or(a,b):b,null)||zero;nets.set(t,expr);return expr;};
    for(const p of graph.order){const a=net(p.inputs[0]),b=net(p.inputs[1]),expr=a===b?not(a):or(not(a),not(b));expressions.set(p,{...expr,nand:true});}
    const ring=[[2,0],[3,0],[4,0],[5,1],[6,2],[6,3],[6,4],[5,5],[4,6],[3,6],[2,6],[1,5],[0,4],[0,3],[0,2],[1,1]];
    function oscillator(x,y,tapPhase,input){for(const p of ring)put(x+p[0],y+p[1]);const index=mod(2-tapPhase),head=[x+ring[index][0],y+ring[index][1]],previous=ring[mod(index-1)],tail=[x+previous[0],y+previous[1]];if(input)input.seeds.push({head,tail});else{put(...head,W.HEAD);put(...tail,W.TAIL);}}
    function negative(x,y,inputPhase){
      wire(route([[x-30,y],[x+3,y],[x+5,y-2],[x+7,y-2],[x+8,y-1]]));
      oscillator(x-26,y+6,mod(inputPhase+10));wire(route([[x-22,y+6],[x-20,y+4],[x+5,y+4],[x+8,y+1]]));
      for(let i=7;i<=9;i++)put(x+i,y);wire(route([[x+8,y+1],[x+9,y+2],[x+10,y+2],[x+12,y],[x+19,y]]));
    }
    function merge(x,y){for(const sign of [-1,1])wire(route([[x-8,y+sign],[x,y+sign],[x+1,y+sign*2],[x+2,y+sign*2],[x+3,y+sign]]));wire(route([[x+2,y],[x+14,y]]));}
    function connection(from,to,channel,pad=0,sign=1){const points=[[from.x,from.y]],radii={};if(pad){const h=(pad+(pad%2?5:4))/2;points.push([from.x+8,from.y],[from.x+8,from.y+sign*h],[from.x+22,from.y+sign*h],[from.x+22,from.y]);if(pad%2)radii[4]=2;}points.push([channel,from.y],[channel,to.y],[to.x,to.y]);return route(points,radii);}
    function place(e,x,y){if(!Number.isFinite(e.w)||!Number.isFinite(e.h)||e.w>100000000||e.h>100000000)throw Error('展开后的电路过大');if(e.nand)gateCount++;
      if(e.type==='zero'){wire(route([[x,y+14],[x+15,y+14]]));return {x:x+15,y:y+14,phase:0,ready:0};}
      if(e.type==='source'){oscillator(x+10,y+16,15,e.source);wire(route([[x+14,y+16],[x+16,y+14],[x+47,y+14]]));return {x:x+47,y:y+14,phase:0,ready:48};}
      if(e.type==='not'){const a=place(e.a,x,y),X=x+e.a.w+50,points=route([[a.x,a.y],[X-30,a.y]]),length=points.length-1;wire(points);negative(X,a.y,mod(a.phase+length));modules.push({type:e.nand?'nand':'not',x:X,y:a.y});return {x:X+19,y:a.y,phase:mod(a.phase+length+51),ready:a.ready+length+51};}
      const a=place(e.a,x,y),b=place(e.b,x,y+e.a.h+32),X=x+Math.max(e.a.w,e.b.w)+60,Y=y+e.a.h+16,pa=connection(a,{x:X-8,y:Y-1},X-18),pb=connection(b,{x:X-8,y:Y+1},X-18),phase=mod(a.phase+pa.length-1),needed=mod(phase-b.phase-pb.length+1),padding=needed>0&&needed<4?needed+16:needed,padded=connection(b,{x:X-8,y:Y+1},X-18,padding,1);if(padded.length-pb.length!==padding)throw Error('线路相位未对齐');wire(pa);wire(padded);merge(X,Y);modules.push({type:e.nand?'nand':'or',x:X,y:Y});return {x:X+14,y:Y,phase:mod(phase+22),ready:Math.max(a.ready+pa.length-1,b.ready+padded.length-1)+22};
    }
    let y=0;const sinks=graph.items.filter(p=>p.type==='output'||p.type==='delay').sort((a,b)=>(a.sourceY||0)-(b.sourceY||0)||b.bit-a.bit);
    const roots=sinks.length?sinks:graph.order.filter(p=>!graph.order.some(q=>q.inputs.some(t=>(graph.drivers.get(t)||[]).includes(p))));
    for(const p of roots){const expr=sinks.length?net(p.inputs[0]):expressions.get(p),result=place(expr,0,y),port={...result,x:result.x+8,phase:mod(result.phase+8),ready:result.ready+8,id:p.id,label:p.type==='delay'?p.label+' · 下一轮':p.label,bit:p.bit,node:p.node,value:null};wire(route([[result.x,result.y],[port.x,port.y]]));if(p.type==='delay')registers.push({...port,source:p.id});else outputs.push({...port,terminal:p.type!=='output'});y+=expr.h+32;}
    if(!roots.length)for(const p of sources){place(expressions.get(p),0,y);y+=72;}
    return {source,period:PERIOD,inputs,outputs,registers,modules,gateCount,logicalGates:graph.order.length,basePattern:{version:1,kind:'wireworld',generation:0,cells:[...cells.values()]},maxReady:Math.max(0,...outputs.map(p=>p.ready),...registers.map(p=>p.ready))};
  }
  function activate(board,values={}){const pattern={...board.basePattern,cells:board.basePattern.cells.map(p=>[...p])},index=new Map(pattern.cells.map((p,i)=>[p[0]+','+p[1],i]));for(const input of board.inputs)if(values[input.id]===undefined?input.value:values[input.id])for(const {head,tail} of input.seeds){pattern.cells[index.get(head.join(','))][2]=W.HEAD;pattern.cells[index.get(tail.join(','))][2]=W.TAIL;}return pattern;}
  return {PERIOD,route,build,activate};
});
