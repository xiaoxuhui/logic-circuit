(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.LogicCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicPresets=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const list=Object.freeze([
    {id:'nand',name:'与非门',description:'两个输入都为1时，输出为0。'},
    {id:'not',name:'非门',description:'输入取反，用一个与非门搭成。'},
    {id:'and',name:'与门',description:'两个输入都为1时，输出为1。'},
    {id:'or',name:'或门',description:'任意输入为1时，输出为1。'},
    {id:'xor',name:'异或门',description:'两个输入不同时，输出为1。'},
    {id:'adder',name:'一位全加器',description:'A、B和进位相加，输出和与进位。'},
    {id:'oscillator',name:'时序振荡器 · 与非门＋延迟线',description:'按“下一步运行”让输出在0和1之间交替，也可以开启连续运行。'},
    {id:'counter4',name:'四位计数器 · 与非门＋延迟线',description:'22个与非门和4条延迟线组成计数器。开启计数时，每一步加1，从0数到15再回到0；关闭开关保持当前数字。'},
    {id:'pulse',name:'短期输入 · 与非门＋延迟线',description:'4个与非门搭成异或门，将原输入与延迟一拍的输入比较。切换输入产生一个脉冲，点击“下一步运行”后回到0；从0变1和从1变0都会触发。已附带可复用的短期输入自制门。'},
    {id:'calculator8',name:'八位加减计算器 · 自制门',description:'A、B输入0～255；减法开关0为加法、1为减法。显示结果的低八位及进位／无借位。自带异或门、一位全加器和八位计算器，可进入内部编辑或展开。'},
    {id:'register8',name:'八位寄存器 · 可控写入',description:'保存一个0～255的数。设置写入数据，将写入开关设为1，点击下一步保存；关闭写入后保持原值。可从我的逻辑门复用寄存器和八位选择器。'},
    {id:'ram256',name:'256×8位存储器 · 地址读写',description:'保存256个八位数字，每个数为0～255。地址输入0～255，读取输出立即显示该地址保存的数；设置写入数据和写入开关1，下一步只写入当前地址。关闭写入即可保持；全部清零会清空全部256个数。自带各层存储器自制门。'}
  ].map(Object.freeze));
  function basic(id){
    if(!list.some(p=>p.id===id))throw Error('没有这个默认存档');
    const nodes=[],wires=[],node=(id,type,x,y,label)=>{nodes.push({id,type,x,y,...(label?{label}:{})});return id;},connect=(a,b,port=0)=>wires.push({id:'w'+wires.length,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}}),nand=(id,a,b,x,y)=>{node(id,'nand',x,y);connect(a,id);connect(b,id,1);return id;};
    const xor=(prefix,a,b,x,y)=>{const both=nand(prefix+'n',a,b,x,y),u=nand(prefix+'u',a,both,x+220,y-80),v=nand(prefix+'v',b,both,x+220,y+80);return {both,out:nand(prefix+'o',u,v,x+440,y)};};
    if(id==='pulse'){node('a','input',0,0,'输入 A');nodes[0].value=0;node('q','delay',0,240,'上一拍 A');connect('a','q');const pulse=xor('pulse','a','q',320,120);node('o','output',1040,120,'短期脉冲');connect(pulse.out,'o');return {version:1,nodes,wires,definitions:{},delayState:{'root/q':0}};}
    if(id==='oscillator'){node('q','delay',0,80,'延迟记忆');const inv=nand('invert','q','q',300,80);node('o','output',600,80,'交替输出');connect(inv,'q');connect('q','o');return {version:1,nodes,wires,definitions:{},delayState:{'root/q':0}};}
    if(id==='counter4'){
      node('enable','input',0,0,'开启计数');nodes[0].value=1;let carry='enable';const delayState={};
      for(let bit=0;bit<4;bit++){const y=bit*460,q=node('q'+bit,'delay',300,y+180,'记忆 Q'+bit),next=xor('toggle'+bit,q,carry,600,y+180);connect(next.out,q);delayState['root/'+q]=0;if(bit<3){const n=nand('carryN'+bit,carry,q,600,y+380);carry=nand('carry'+bit,n,n,820,y+380);}}
      node('bus','hub',1400,780,'Q3 Q2 Q1 Q0');nodes.at(-1).bits=4;for(let bit=0;bit<4;bit++)connect('q'+bit,'bus',bit);node('count','output',1700,780,'当前计数');nodes.at(-1).bits=4;connect('bus','count');return {version:1,nodes,wires,definitions:{},delayState};
    }
    node('a','input',0,0,'A');if(id!=='not')node('b','input',0,160,'B');
    let out,x=440;
    if(id==='nand')out=nand('n','a','b',220,80);
    else if(id==='not')out=nand('n','a','a',220,0);
    else if(id==='and'){out=nand('and',nand('n','a','b',220,80),'n',440,80);x=660;}
    else if(id==='or'){out=nand('or',nand('na','a','a',220,0),nand('nb','b','b',220,160),440,80);x=660;}
    else if(id==='xor'){out=xor('xor','a','b',220,80).out;x=880;}
    else{node('cin','input',0,320,'进位 C_in');const ab=xor('ab','a','b',220,80),sum=xor('sum',ab.out,'cin',880,240),carry=nand('carry',ab.both,sum.both,1540,400);node('sumout','output',1760,160,'和 S');node('carryout','output',1760,400,'进位 C_out');connect(sum.out,'sumout');connect(carry,'carryout');}
    if(out){node('o','output',x,80,'输出 Q');connect(out,'o');}
    return {version:1,nodes,wires,definitions:{}};
  }
  function builder(definitions){
    const state={version:1,nodes:[],wires:[],definitions};
    const node=(id,type,x,y,label,extra={})=>{state.nodes.push({id,type,x,y,...(label?{label}:{}),...extra});return id;};
    const connect=(source,to,port=0)=>{const [from,out]=Array.isArray(source)?source:[source,0];state.wires.push({id:'w'+state.wires.length,a:{node:from,dir:'out',port:out},b:{node:to,dir:'in',port}});};
    return {state,node,connect,input:(id,bits,y,label,value=0)=>node(id,'input',0,y,label,{bits,value}),gate:(id,def,x,y)=>node(id,'custom',x,y,null,{def}),output:(id,bits,x,y,label)=>node(id,'output',x,y,label,{bits})};
  }
  function library(){const definitions={};for(const id of ['not','and','or','xor','adder','pulse'])definitions['preset_'+id]=C.makeDefinition(basic(id),id==='pulse'?'短期输入':list.find(p=>p.id===id).name);return definitions;}
  function addMux(definitions){
    const b=builder(definitions);b.input('a',8,0,'选择0');b.input('b',8,180,'选择1');b.input('s',1,360,'选择信号');
    b.node('sa','splitter',260,0,null,{bits:8});b.node('sb','splitter',260,300,null,{bits:8});b.connect('a','sa');b.connect('b','sb');b.node('ns','nand',260,660);b.connect('s','ns');b.connect('s','ns',1);
    b.node('pack','hub',1020,160,null,{bits:8});
    for(let bit=0;bit<8;bit++){const y=bit*220;b.node('left'+bit,'nand',520,y);b.connect(['sa',bit],'left'+bit);b.connect('ns','left'+bit,1);b.node('right'+bit,'nand',520,y+100);b.connect(['sb',bit],'right'+bit);b.connect('s','right'+bit,1);b.node('join'+bit,'nand',780,y+50);b.connect('left'+bit,'join'+bit);b.connect('right'+bit,'join'+bit,1);b.connect('join'+bit,'pack',bit);}
    b.output('o',8,1280,160,'选择结果');b.connect('pack','o');definitions.preset_mux8=C.makeDefinition(b.state,'八位二选一');
  }
  function addRegister(definitions){
    const b=builder(definitions);b.input('data',8,0,'写入数据');b.input('write',1,180,'写入');b.node('q','delay',260,340,'八位记忆',{bits:8});b.gate('select','preset_mux8',540,100);b.connect('q','select');b.connect('data','select',1);b.connect('write','select',2);b.connect('select','q');b.output('o',8,820,340,'保存的数');b.connect('q','o');definitions.preset_register8=C.makeDefinition(b.state,'八位可写寄存器');
  }
  function addCalculator(definitions){
    const b=builder(definitions);b.input('a',8,0,'A');b.input('b',8,180,'B');b.input('subtract',1,360,'减法');b.node('sa','splitter',260,0,null,{bits:8});b.node('sb','splitter',260,300,null,{bits:8});b.connect('a','sa');b.connect('b','sb');b.node('pack','hub',1200,160,null,{bits:8});let carry='subtract';
    for(let bit=0;bit<8;bit++){const y=bit*200;b.gate('invert'+bit,'preset_xor',540,y);b.connect(['sb',bit],'invert'+bit);b.connect('subtract','invert'+bit,1);b.gate('bit'+bit,'preset_adder',840,y);b.connect(['sa',bit],'bit'+bit);b.connect('invert'+bit,'bit'+bit,1);b.connect(carry,'bit'+bit,2);b.connect('bit'+bit,'pack',bit);carry=['bit'+bit,1];}
    b.output('result',8,1480,160,'结果（低八位）');b.output('carry',1,1480,360,'进位／无借位');b.connect('pack','result');b.connect(carry,'carry');definitions.preset_calculator8=C.makeDefinition(b.state,'八位加减计算器');
  }
  function addMemory(definitions){
    for(let bits=1;bits<=8;bits++){
      const b=builder(definitions);b.input('address',bits,0,'地址');b.input('data',8,180,'写入数据');b.input('write',1,360,'写入');let high='address';if(bits>1){b.node('address_bits','splitter',240,0,null,{bits});b.connect('address','address_bits');high=['address_bits',bits-1];}
      b.gate('not_high','preset_not',480,0);b.connect(high,'not_high');b.gate('write_left','preset_and',740,80);b.gate('write_right','preset_and',740,360);b.connect('write','write_left');b.connect('not_high','write_left',1);b.connect('write','write_right');b.connect(high,'write_right',1);
      for(const [id,enable,y] of [['left','write_left',60],['right','write_right',440]]){b.gate(id,bits===1?'preset_register8':'preset_ram'+(bits-1),1020,y);if(bits===1){b.connect('data',id);b.connect(enable,id,1);}else{b.connect('address',id);b.connect('data',id,1);b.connect(enable,id,2);}}
      b.gate('read','preset_mux8',1320,240);b.connect('left','read');b.connect('right','read',1);b.connect(high,'read',2);b.output('o',8,1600,240,'读取数据');b.connect('read','o');definitions['preset_ram'+bits]=C.makeDefinition(b.state,(2**bits)+'×8位存储器');
    }
  }
  function load(id){
    if(!list.some(p=>p.id===id))throw Error('没有这个默认存档');const definitions=library();
    if(!['calculator8','register8','ram256'].includes(id))return {...basic(id),definitions};
    if(id==='calculator8')addCalculator(definitions);else{addMux(definitions);addRegister(definitions);if(id==='ram256')addMemory(definitions);}
    const b=builder(definitions);
    if(id==='calculator8'){b.input('a',8,0,'A',5);b.input('b',8,180,'B',3);b.input('subtract',1,360,'减法（0加／1减）');b.gate('calculator','preset_calculator8',360,160);b.connect('a','calculator');b.connect('b','calculator',1);b.connect('subtract','calculator',2);b.output('result',8,740,100,'结果（低八位）');b.output('carry',1,740,300,'进位／无借位');b.connect('calculator','result');b.connect(['calculator',1],'carry');}
    else if(id==='register8'){b.input('data',8,0,'写入数据');b.input('write',1,180,'写入（下一步保存）');b.gate('register','preset_register8',360,100);b.connect('data','register');b.connect('write','register',1);b.output('o',8,740,100,'保存的数');b.connect('register','o');}
    else{b.input('address',8,0,'地址（0～255）');b.input('data',8,180,'写入数据（0～255）');b.input('write',1,360,'写入（下一步保存）');b.gate('memory','preset_ram8',380,160);b.connect('address','memory');b.connect('data','memory',1);b.connect('write','memory',2);b.output('o',8,780,160,'读取数据');b.connect('memory','o');}
    return b.state;
  }
  return {list,load};
});
