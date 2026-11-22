(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.LogicCore,typeof module==='object'&&module.exports?require('./beta-preset.js'):root.LogicBetaPreset);if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicPresets=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C,Beta){
  'use strict';
  const list=Object.freeze([
    {id:'nand',name:'与非门',description:'两个输入都为1时，输出为0。'},
    {id:'not',name:'非门',description:'输入取反，用一个与非门搭成。'},
    {id:'and',name:'与门',description:'两个输入都为1时，输出为1。'},
    {id:'or',name:'或门',description:'任意输入为1时，输出为1。'},
    {id:'xor',name:'异或门',description:'两个输入不同时，输出为1。'},
    {id:'adder',name:'一位全加器',description:'A、B和进位相加，输出和与进位。'},
    {id:'lambda',name:'λ 演算 · 丘奇布尔值',description:'试验 (λp.λa.λb. p a b) P A B。P=1 代表 TRUE（λa.λb.a），结果为 A；P=0 代表 FALSE（λa.λb.b），结果为 B。修改 P、A、B 即可看到结果。'},
    {id:'beta',name:'β 归约器 · 19 位 BLC＋延迟线',description:'与非门电路每拍执行一次最左最外 β 归约，一条多位延迟线保存程序和长度。支持所有不超过19位的闭合BLC。默认 ((λx.x)(λx.x))(λx.x)，两拍得到 λx.x（0010）。BLC右对齐，旁边填写有效位数；更换程序后打开“装入程序”、运行一步，再关闭。完成后保持结果；无效输入、归约溢出会亮灯并保持原程序。'},
    {id:'turing8',name:'TM 图灵机 · 八格纸带加一',description:'默认纸带是 7。点「下一步运行」执行一次转移：读到 1 就写 0，并向左一格；读到 0 就写 1 并停机。到纸带左端仍有进位时，结果回绕到 0。读写头位置从右到左为 0～7。换一组数据时，打开「装入纸带」、运行一步，然后关闭装入再继续。'},
    {id:'oscillator',name:'时序振荡器 · 与非门＋延迟线',description:'按“下一步运行”让输出在0和1之间交替，也可以开启连续运行。'},
    {id:'counter4',name:'四位计数器 · 与非门＋延迟线',description:'22个与非门和4条延迟线组成计数器。开启计数时，每一步加1，从0数到15再回到0；关闭开关保持当前数字。'},
    {id:'pulse',name:'短期输入 · 与非门＋延迟线',description:'4个与非门搭成异或门，将原输入与延迟一拍的输入比较。切换输入产生一个脉冲，点击“下一步运行”后回到0；从0变1和从1变0都会触发。已附带可复用的短期输入自制门。'},
    {id:'calculator8',name:'八位加减计算器 · 自制门',description:'A、B输入0～255；减法开关0为加法、1为减法。显示结果的低八位及进位／借位：减法只有A小于B才亮，0减0不亮。自带异或门、一位全加器和八位计算器，可进入内部编辑或展开。'},
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
  function lambdaExample(definitions){
    addMux(definitions);
    const apply=builder(definitions);
    apply.input('p',1,0,'P');
    apply.input('a',8,180,'A');
    apply.input('b',8,360,'B');
    apply.gate('select','preset_mux8',360,150);
    apply.connect('b','select');
    apply.connect('a','select',1);
    apply.connect('p','select',2);
    apply.output('o',8,720,160,'P A B');
    apply.connect('select','o');
    definitions.preset_lambda=C.makeDefinition(apply.state,'丘奇布尔应用');

    const demo=builder(definitions);
    demo.input('p',1,0,'P（0 FALSE／1 TRUE）',1);
    demo.input('a',8,180,'A',5);
    demo.input('b',8,360,'B',3);
    demo.gate('apply','preset_lambda',360,150);
    demo.connect('p','apply');
    demo.connect('a','apply',1);
    demo.connect('b','apply',2);
    demo.output('result',8,720,160,'P A B');
    demo.connect('apply','result');
    return demo.state;
  }
  function turingExample(definitions){
    addMux(definitions);
    function logic(b,id,type,x,y,...sources){
      b.gate(id,'preset_'+type,x,y);
      sources.forEach((source,port)=>b.connect(source,id,port));
      return id;
    }

    const tape=builder(definitions);
    tape.input('symbols',8,0,'纸带');
    tape.input('head',8,180,'读写头');
    tape.input('run',1,360,'运行');
    tape.node('symbols_bits','splitter',260,0,null,{bits:8});
    tape.node('head_bits','splitter',260,420,null,{bits:8});
    tape.connect('symbols','symbols_bits');
    tape.connect('head','head_bits');
    tape.node('write_bus','hub',1040,120,null,{bits:8});
    const reads=[];
    for(let bit=0;bit<8;bit++){
      const y=bit*180,symbol=['symbols_bits',bit],cursor=['head_bits',bit];
      const write=logic(tape,'write'+bit,'and',520,y,cursor,'run');
      const next=logic(tape,'symbol'+bit,'xor',780,y,symbol,write);
      tape.connect(next,'write_bus',bit);
      reads.push(logic(tape,'read'+bit,'and',520,y+85,cursor,symbol));
    }
    function reduceOr(sources,y){
      return sources.reduce((left,right,index)=>logic(tape,'or'+y+'_'+index,'or',1050+250*index,y,left,right));
    }
    const read=reduceOr(reads,1520);
    const position=[[1,3,5,7],[2,3,6,7],[4,5,6,7]].map((indices,bit)=>reduceOr(indices.map(index=>['head_bits',index]),1700+180*bit));
    tape.node('position','hub',2200,1910,null,{bits:3});
    position.forEach((source,bit)=>tape.connect(source,'position',bit));
    tape.output('written',8,2960,120,'写入后纸带');tape.connect('write_bus','written');
    tape.output('symbol',1,2960,1520,'当前符号');tape.connect(read,'symbol');
    tape.output('index',3,2960,1910,'读写头位置');tape.connect('position','index');
    definitions.preset_turing_tape=C.makeDefinition(tape.state,'图灵机纸带读写');

    const tm=builder(definitions);
    tm.input('data',8,0,'初始纸带');
    tm.input('load',1,180,'装入');
    tm.node('origin','input',0,340,'起始读写头',{bits:8,value:1,constant:true});
    tm.node('symbols','delay',360,40,'纸带',{bits:8});
    tm.node('head','delay',360,240,'读写头',{bits:8});
    tm.node('running','delay',360,470,'运行状态');
    logic(tm,'access','turing_tape',660,90,'symbols','head','running');
    tm.node('head_bits','splitter',660,390,null,{bits:8});tm.connect('head','head_bits');
    tm.node('shift','hub',990,410,null,{bits:8});
    for(let bit=1;bit<8;bit++)tm.connect(['head_bits',bit-1],'shift',bit);
    const awayFromEnd=logic(tm,'can_move','not',990,680,['head_bits',7]);
    const carrying=logic(tm,'carry','and',990,220,'running',['access',1]);
    const move=logic(tm,'move_left','and',1250,220,carrying,awayFromEnd);
    const nextHead=logic(tm,'next_head','mux8',1510,400,'head','shift',move);
    tm.connect(logic(tm,'load_head','mux8',1780,400,nextHead,'origin','load'),'head');
    tm.connect(logic(tm,'load_tape','mux8',1780,80,['access',0],'data','load'),'symbols');
    tm.connect(logic(tm,'next_run','or',1510,650,move,'load'),'running');
    const halted=logic(tm,'halt','not',1780,650,'running');
    tm.output('tape',8,2070,40,'纸带');tm.connect('symbols','tape');
    tm.output('index',3,2070,240,'读写头位置');tm.connect(['access',2],'index');
    tm.output('halted',1,2070,470,'已停机');tm.connect(halted,'halted');
    definitions.preset_turing8=C.makeDefinition(tm.state,'八格纸带加一图灵机');

    const demo=builder(definitions);
    demo.input('data',8,0,'初始纸带',7);
    demo.input('load',1,220,'装入纸带');
    logic(demo,'machine','turing8',360,115,'data','load');
    demo.output('tape',8,720,0,'纸带');demo.connect('machine','tape');
    demo.output('index',3,720,195,'读写头位置');demo.connect(['machine',1],'index');
    demo.output('halted',1,720,375,'已停机');demo.connect(['machine',2],'halted');
    demo.state.delayState={'root/machine/symbols':7,'root/machine/head':1,'root/machine/running':1};
    return demo.state;
  }
  function addRegister(definitions){
    const b=builder(definitions);b.input('data',8,0,'写入数据');b.input('write',1,180,'写入');b.node('q','delay',260,340,'八位记忆',{bits:8});b.gate('select','preset_mux8',540,100);b.connect('q','select');b.connect('data','select',1);b.connect('write','select',2);b.connect('select','q');b.output('o',8,820,340,'保存的数');b.connect('q','o');definitions.preset_register8=C.makeDefinition(b.state,'八位可写寄存器');
  }
  function addCalculator(definitions){
    const b=builder(definitions);b.input('a',8,0,'A');b.input('b',8,180,'B');b.input('subtract',1,360,'减法');b.node('sa','splitter',260,0,null,{bits:8});b.node('sb','splitter',260,300,null,{bits:8});b.connect('a','sa');b.connect('b','sb');b.node('pack','hub',1200,160,null,{bits:8});let carry='subtract';
    for(let bit=0;bit<8;bit++){const y=bit*200;b.gate('invert'+bit,'preset_xor',540,y);b.connect(['sb',bit],'invert'+bit);b.connect('subtract','invert'+bit,1);b.gate('bit'+bit,'preset_adder',840,y);b.connect(['sa',bit],'bit'+bit);b.connect('invert'+bit,'bit'+bit,1);b.connect(carry,'bit'+bit,2);b.connect('bit'+bit,'pack',bit);carry=['bit'+bit,1];}
    b.output('result',8,1480,160,'结果（低八位）');b.output('carry',1,1480,360,'进位／借位');b.connect('pack','result');b.gate('flag','preset_xor',1200,540);b.connect(carry,'flag');b.connect('subtract','flag',1);b.connect('flag','carry');definitions.preset_calculator8=C.makeDefinition(b.state,'八位加减计算器');
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
    if(id==='lambda')return lambdaExample(definitions);
    if(id==='beta')return Beta.build(definitions);
    if(id==='turing8')return turingExample(definitions);
    if(!['calculator8','register8','ram256'].includes(id))return {...basic(id),definitions};
    if(id==='calculator8')addCalculator(definitions);else{addMux(definitions);addRegister(definitions);if(id==='ram256')addMemory(definitions);}
    const b=builder(definitions);
    if(id==='calculator8'){b.input('a',8,0,'A',5);b.input('b',8,180,'B',3);b.input('subtract',1,360,'减法（0加／1减）');b.gate('calculator','preset_calculator8',360,160);b.connect('a','calculator');b.connect('b','calculator',1);b.connect('subtract','calculator',2);b.output('result',8,740,100,'结果（低八位）');b.output('carry',1,740,300,'进位／借位');b.connect('calculator','result');b.connect(['calculator',1],'carry');}
    else if(id==='register8'){b.input('data',8,0,'写入数据');b.input('write',1,180,'写入（下一步保存）');b.gate('register','preset_register8',360,100);b.connect('data','register');b.connect('write','register',1);b.output('o',8,740,100,'保存的数');b.connect('register','o');}
    else{b.input('address',8,0,'地址（0～255）');b.input('data',8,180,'写入数据（0～255）');b.input('write',1,360,'写入（下一步保存）');b.gate('memory','preset_ram8',380,160);b.connect('address','memory');b.connect('data','memory',1);b.connect('write','memory',2);b.output('o',8,780,160,'读取数据');b.connect('memory','o');}
    return b.state;
  }
  return {list,load};
});
