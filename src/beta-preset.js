(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./core'):root.LogicCore);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LogicBetaPreset=api;
})(globalThis,function(Core){
  'use strict';
  const CAPACITY=19,LENGTH_BITS=5,STATE_BITS=CAPACITY+LENGTH_BITS,OUTPUT_BITS=STATE_BITS+3,STAGE_SIZE=256;
  const variable=index=>({type:'var',index});
  const abstraction=body=>({type:'abs',body});
  const application=(left,right)=>({type:'app',left,right});
  function encode(term){
    if(term.type==='var')return '1'.repeat(term.index)+'0';
    if(term.type==='abs')return '00'+encode(term.body);
    return '01'+encode(term.left)+encode(term.right);
  }
  function shift(term,amount,depth=0){
    if(term.type==='var')return variable(term.index>depth?term.index+amount:term.index);
    if(term.type==='abs')return abstraction(shift(term.body,amount,depth+1));
    return application(shift(term.left,amount,depth),shift(term.right,amount,depth));
  }
  function substitute(term,index,value,depth=0){
    if(term.type==='var')return term.index===index+depth?shift(value,depth):term;
    if(term.type==='abs')return abstraction(substitute(term.body,index,value,depth+1));
    return application(substitute(term.left,index,value,depth),substitute(term.right,index,value,depth));
  }
  function reduce(term){
    if(term.type==='var')return null;
    if(term.type==='abs'){
      const body=reduce(term.body);
      return body?abstraction(body):null;
    }
    if(term.left.type==='abs')return shift(substitute(term.left.body,1,shift(term.right,1)),-1);
    const left=reduce(term.left);
    if(left)return application(left,term.right);
    const right=reduce(term.right);
    return right?application(term.left,right):null;
  }
  function terms(size,depth,cache){
    const key=size+','+depth;
    if(cache.has(key))return cache.get(key);
    const result=[];
    if(size>=2&&size-1<=depth)result.push(variable(size-1));
    if(size>=4)for(const body of terms(size-2,depth+1,cache))result.push(abstraction(body));
    for(let left=2;left<=size-4;left++){
      for(const a of terms(left,depth,cache))for(const b of terms(size-2-left,depth,cache))result.push(application(a,b));
    }
    cache.set(key,result);
    return result;
  }
  function compile(){
    const rows=[],cache=new Map();
    for(let size=4;size<=CAPACITY;size++)for(const term of terms(size,0,cache)){
      const code=encode(term),next=reduce(term),nextCode=next?encode(next):code;
      const key=size*2**CAPACITY+parseInt(code,2),overflow=nextCode.length>CAPACITY;
      const payload=overflow?key:nextCode.length*2**CAPACITY+parseInt(nextCode,2);
      rows.push({key,value:payload+(next?0:2**STATE_BITS)+(overflow?2**(STATE_BITS+1):0)+2**(STATE_BITS+2)});
    }
    const nodes=[],intern=new Map();
    function join(bit,low,high){
      if(low===high)return low;
      const key=bit+','+low+','+high;
      if(intern.has(key))return intern.get(key);
      const id=nodes.length+2;
      nodes.push({bit,low,high});intern.set(key,id);
      return id;
    }
    function decision(entries,bit){
      if(!entries.length)return Array(OUTPUT_BITS).fill(0);
      if(bit<0)return Array.from({length:OUTPUT_BITS},(_,index)=>Math.floor(entries[0].value/2**index)%2);
      const low=[],high=[];
      for(const row of entries)(Math.floor(row.key/2**bit)%2?high:low).push(row);
      const a=decision(low,bit-1),b=decision(high,bit-1);
      return a.map((value,index)=>join(bit,value,b[index]));
    }
    return {nodes,roots:decision(rows,STATE_BITS-1)};
  }
  function circuit(definitions){
    const state={version:1,nodes:[],wires:[],definitions};
    function node(id,type,x,y,extra={}){state.nodes.push({id,type,x,y,...extra});return id;}
    function wire(from,to,port=0){
      const [id,output]=Array.isArray(from)?from:[from,0];
      state.wires.push({id:'w'+state.wires.length,a:{node:id,dir:'out',port:output},b:{node:to,dir:'in',port}});
    }
    const input=(id,bits,y,label,value=0)=>node(id,'input',0,y,{bits,label,value});
    const gate=(id,def,x,y)=>node(id,'custom',x,y,{def});
    const output=(id,bits,x,y,label)=>node(id,'output',x,y,{bits,label});
    return {state,node,wire,input,gate,output};
  }
  function addSelect(definitions){
    const c=circuit(definitions);
    c.input('a',1,0,'选择0');c.input('b',1,180,'选择1');c.input('s',1,360,'选择');
    c.node('ns','nand',250,360);c.wire('s','ns');c.wire('s','ns',1);
    c.node('a0','nand',500,80);c.wire('a','a0');c.wire('ns','a0',1);
    c.node('b1','nand',500,260);c.wire('b','b1');c.wire('s','b1',1);
    c.node('join','nand',750,170);c.wire('a0','join');c.wire('b1','join',1);
    c.output('o',1,1000,170,'结果');c.wire('join','o');
    definitions.beta_mux1=Core.makeDefinition(c.state,'β 单比特选择');
  }
  function addROM(definitions,{nodes,roots}){
    const count=Math.ceil(nodes.length/STAGE_SIZE),sizes=Array.from({length:count},(_,stage)=>Math.min(STAGE_SIZE,nodes.length-stage*STAGE_SIZE));
    const dependencies=[];
    for(let stage=0;stage<count;stage++){
      const c=circuit(definitions),start=stage*STAGE_SIZE,previous=new Set(),literals=new Set();
      for(const item of nodes.slice(start,start+sizes[stage]))for(const id of [item.low,item.high]){
        if(id<2)literals.add(id);
        if(id>=2&&Math.floor((id-2)/STAGE_SIZE)<stage)previous.add(Math.floor((id-2)/STAGE_SIZE));
      }
      const sources=[...previous].sort((a,b)=>a-b);
      dependencies.push(sources);
      c.input('data',STATE_BITS,0,'当前程序');
      c.node('bits','splitter',250,0,{bits:STATE_BITS});c.wire('data','bits');
      sources.forEach((source,index)=>{
        c.input('prior'+source,sizes[source],(index+1)*180,'前级 '+source);
        c.node('split'+source,'splitter',250,(index+1)*180,{bits:sizes[source]});c.wire('prior'+source,'split'+source);
      });
      for(const value of literals)c.node(value?'one':'zero','input',250,-260+value*120,{constant:true,value});
      function ref(id){
        if(id<2)return id?'one':'zero';
        const owner=Math.floor((id-2)/STAGE_SIZE);
        return owner===stage?'n'+id:['split'+owner,(id-2)%STAGE_SIZE];
      }
      c.node('pack','hub',2600,0,{bits:sizes[stage]});
      for(let index=0;index<sizes[stage];index++){
        const id=start+index+2,item=nodes[id-2],name='n'+id;
        c.gate(name,'beta_mux1',520+index%8*240,Math.floor(index/8)*160);
        c.wire(ref(item.low),name);c.wire(ref(item.high),name,1);c.wire(['bits',item.bit],name,2);
        c.wire(name,'pack',index);
      }
      c.output('o',sizes[stage],2900,0,'前级结果');c.wire('pack','o');
      definitions['beta_stage'+stage]=Core.makeDefinition(c.state,'β 归约电路 '+(stage+1));
    }
    const c=circuit(definitions);
    c.input('data',STATE_BITS,0,'当前程序');
    for(let stage=0;stage<count;stage++){
      c.gate('stage'+stage,'beta_stage'+stage,300+stage%4*280,Math.floor(stage/4)*520);
      c.wire('data','stage'+stage);
      dependencies[stage].forEach((source,index)=>c.wire('stage'+source,'stage'+stage,index+1));
      c.node('split'+stage,'splitter',1500+stage%4*240,Math.floor(stage/4)*520,{bits:sizes[stage]});c.wire('stage'+stage,'split'+stage);
    }
    for(const value of new Set(roots.filter(id=>id<2)))c.node(value?'one':'zero','input',200,-260+value*120,{constant:true,value});
    c.node('pack','hub',2550,0,{bits:OUTPUT_BITS});
    roots.forEach((id,index)=>{
      const source=id<2?id?'one':'zero':['split'+Math.floor((id-2)/STAGE_SIZE),(id-2)%STAGE_SIZE];
      c.wire(source,'pack',index);
    });
    c.output('o',OUTPUT_BITS,2850,0,'下一步及状态');c.wire('pack','o');
    definitions.beta_rom=Core.makeDefinition(c.state,'BLC 一步 β 归约');
  }
  function addBusSelect(definitions){
    const c=circuit(definitions);
    c.input('a',STATE_BITS,0,'保持');c.input('b',STATE_BITS,180,'更新');c.input('s',1,360,'选择');
    for(const id of ['a','b']){c.node('split'+id,'splitter',260,id==='a'?0:300,{bits:STATE_BITS});c.wire(id,'split'+id);}
    c.node('pack','hub',850,0,{bits:STATE_BITS});
    for(let bit=0;bit<STATE_BITS;bit++){
      c.gate('select'+bit,'beta_mux1',550,bit*130);
      c.wire(['splita',bit],'select'+bit);c.wire(['splitb',bit],'select'+bit,1);c.wire('s','select'+bit,2);c.wire('select'+bit,'pack',bit);
    }
    c.output('o',STATE_BITS,1150,0,'结果');c.wire('pack','o');
    definitions.beta_bus_select=Core.makeDefinition(c.state,'β 程序选择');
  }
  function build(definitions){
    addSelect(definitions);addROM(definitions,compile());addBusSelect(definitions);
    const c=circuit(definitions),code='0101001000100010';
    c.input('program',CAPACITY,0,'初始 BLC（右对齐）',parseInt(code,2));
    c.input('length',LENGTH_BITS,180,'初始位数',code.length);
    c.input('load',1,360,'装入程序');c.input('run',1,500,'运行',1);
    c.node('code_bits','splitter',600,-240,{bits:CAPACITY});c.wire('program','code_bits');
    c.node('length_bits','splitter',600,-80,{bits:LENGTH_BITS});c.wire('length','length_bits');
    c.node('initial','hub',900,-240,{bits:STATE_BITS});
    for(let bit=0;bit<CAPACITY;bit++)c.wire(['code_bits',bit],'initial',bit);
    for(let bit=0;bit<LENGTH_BITS;bit++)c.wire(['length_bits',bit],'initial',CAPACITY+bit);
    c.node('memory','delay',900,200,{bits:STATE_BITS,label:'BLC 及长度记忆'});
    c.gate('reduce','beta_rom',1220,200);c.wire('memory','reduce');
    c.node('result_bits','splitter',1500,200,{bits:OUTPUT_BITS});c.wire('reduce','result_bits');
    c.node('next','hub',1790,200,{bits:STATE_BITS});
    for(let bit=0;bit<STATE_BITS;bit++)c.wire(['result_bits',bit],'next',bit);
    function logic(id,type,a,b,x,y){c.gate(id,'preset_'+type,x,y);c.wire(a,id);if(b)c.wire(b,id,1);return id;}
    const normal=['result_bits',STATE_BITS],overflow=['result_bits',STATE_BITS+1],valid=['result_bits',STATE_BITS+2];
    const invalid=logic('invalid','not',valid,null,1800,600);
    const safe=logic('safe','not',overflow,null,1800,760);
    const unfinished=logic('unfinished','not',normal,null,1800,920);
    const enabled=logic('enabled','and',valid,'run',2050,600);
    const inRange=logic('in_range','and',enabled,safe,2300,600);
    const advance=logic('advance','and',inRange,unfinished,2550,600);
    c.gate('keep','beta_bus_select',2050,200);c.wire('memory','keep');c.wire('next','keep',1);c.wire(advance,'keep',2);
    c.gate('load_program','beta_bus_select',2350,200);c.wire('keep','load_program');c.wire('initial','load_program',1);c.wire('load','load_program',2);c.wire('load_program','memory');
    c.node('memory_bits','splitter',1220,-240,{bits:STATE_BITS});c.wire('memory','memory_bits');
    c.node('current','hub',1600,-240,{bits:CAPACITY});c.node('current_length','hub',1600,-40,{bits:LENGTH_BITS});
    for(let bit=0;bit<CAPACITY;bit++)c.wire(['memory_bits',bit],'current',bit);
    for(let bit=0;bit<LENGTH_BITS;bit++)c.wire(['memory_bits',CAPACITY+bit],'current_length',bit);
    c.output('term',CAPACITY,2900,-240,'当前 BLC');c.wire('current','term');
    c.output('size',LENGTH_BITS,2900,-40,'有效位数');c.wire('current_length','size');
    c.output('normal',1,2900,220,'已完成');c.wire(normal,'normal');
    c.output('invalid_code',1,2900,390,'无效输入');c.wire(invalid,'invalid_code');
    c.output('overflow',1,2900,550,'归约溢出');c.wire(overflow,'overflow');
    c.state.delayState={'root/memory':code.length*2**CAPACITY+parseInt(code,2)};
    return c.state;
  }
  return {build};
});
