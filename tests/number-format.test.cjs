const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js'),E=require('../src/expanded.js');
test('each component owns integer and fractional widths and hubs preserve all bits',()=>{
  const s={version:1,definitions:{},nodes:[{id:'i',type:'input',bits:4,value:3,x:0,y:0},{id:'s',type:'splitter',bits:4,x:300,y:0},{id:'h',type:'hub',bits:4,x:600,y:0},{id:'o',type:'output',bits:4,x:900,y:0}],wires:[{id:'a',a:{node:'i',dir:'out',port:0},b:{node:'s',dir:'in',port:0}},...Array.from({length:4},(_,b)=>({id:'bit'+b,a:{node:'s',dir:'out',port:b},b:{node:'h',dir:'in',port:b}})),{id:'z',a:{node:'h',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}]};
  let next=s;for(const id of ['i','s','h','o'])next=C.configureNumberBits(next,null,id,2,2);
  assert.deepEqual(next.wires,s.wires);assert.equal(C.nodeFractionBits(next.nodes[0],next),2);assert.equal(C.wireFractionBits(next,'a'),2);
  assert.deepEqual(C.spec(next.nodes[1]).outLabels,['b-2','b-1','b0','b1']);
  assert.deepEqual(C.simulate(next).outputs.o,C.bitArray(3,4));assert.equal((E.build(next).svg.match(/>0.75<\/text>/g)||[]).length,2);
  next=C.configureNumberBits(next,null,'o',4,0);assert.equal(C.nodeFractionBits(next.nodes.at(-1),next),0);assert.equal(C.nodeFractionBits(next.nodes[0],next),2);
  for(const [i,f] of [[0,2],[1,-1],[256,1],[1,0.5]])assert.throws(()=>C.configureNumberBits(next,null,'i',i,f));
  for(const type of ['input','output','hub','splitter']){const one={version:1,definitions:{},nodes:[{id:'n',type,bits:2,x:0,y:0}],wires:[]};assert.equal(C.configureNumberBits(one,null,'n',1,0).nodes[0].bits,1);}
  assert.equal(s.nodes[0].fractionBits,undefined);
});
test('binary fractional positions are exact and round-trip every eight-bit pattern in every mode',()=>{
  assert.equal(C.formatValue(C.bitArray(3,4),'unsigned',2),'0.75');
  assert.equal(C.formatValue(C.bitArray(0,8),'signed',2),'0');
  for(const count of [0,1,2,3,4,7,8,12])for(const format of C.DISPLAY_FORMATS)for(let n=0;n<256;n++){
    const bits=C.bitArray(n,8),text=C.formatValue(bits,format,count);
    assert.deepEqual(C.parseSignal(text,8,format,count),bits,format+' '+count+' '+n+' '+text);
  }
  assert.equal(C.formatValue(C.bitArray(255,8),'signed',2),'-0.25');
  assert.equal(C.formatValue(C.bitArray(3,8),'hex',2),'0x00.C');
  assert.deepEqual(C.parseSignal('0b0011',8,'unsigned',2),C.bitArray(3,8));
  assert.deepEqual(C.parseSignal('0x03',8,'unsigned',2),C.bitArray(3,8));
  assert.throws(()=>C.parseSignal('0.1',8,'unsigned',2),/精确/);
  assert.throws(()=>C.parseSignal('64',8,'unsigned',2),/超出/);
  for(const count of [-1,0.5,257,NaN])assert.throws(()=>C.formatValue([0],'unsigned',count));
});
test('fractional precision retains 256-bit accuracy and survives validation and expanded views',()=>{
  const bits=Array(256).fill(1);for(const format of C.DISPLAY_FORMATS)assert.deepEqual(C.parseSignal(C.formatValue(bits,format,256),256,format,256),bits);
  const s={version:1,fractionBits:2,definitions:{},nodes:[{id:'i',type:'input',bits:8,value:3,x:0,y:0},{id:'o',type:'output',bits:8,x:400,y:0}],wires:[{id:'w',a:{node:'i',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}]};
  assert.equal(C.validate(s).fractionBits,2);assert.equal((E.build(s).svg.match(/>0.75<\/text>/g)||[]).length,2);
  assert.deepEqual(C.simulate(s).outputs.o,C.bitArray(3,8));s.fractionBits=0;assert.equal((E.build(s).svg.match(/>3<\/text>/g)||[]).length,2);
  for(const count of [-1,0.5,257,'2',null])assert.throws(()=>C.validate({...s,fractionBits:count}));
});
test('all eight-bit patterns display unsigned, signed two-complement and padded hex',()=>{for(let n=0;n<256;n++){const bits=C.bitArray(n,8);assert.equal(C.formatValue(bits),String(n));assert.equal(C.formatValue(bits,'signed'),String(n<128?n:n-256));assert.equal(C.formatValue(bits,'hex'),'0x'+n.toString(16).toUpperCase().padStart(2,'0'));}});
test('large signed and hex values remain exact; format survives saves and expansion',()=>{for(const width of [16,64,128,256]){const bits=Array(width).fill(1);assert.equal(C.formatValue(bits,'signed'),'-1');assert.equal(C.formatValue(bits,'unsigned'),((1n<<BigInt(width))-1n).toString());assert.equal(C.formatValue(bits,'hex'),'0x'+'F'.repeat(width/4));}const s={version:1,definitions:{},nodes:[{id:'i',type:'input',bits:8,value:255,displayFormat:'signed',x:0,y:0},{id:'o',type:'output',bits:8,displayFormat:'hex',x:400,y:0}],wires:[{id:'w',a:{node:'i',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}]};assert.equal(C.validate(s).nodes[0].displayFormat,'signed');s.displayFormat='signed';assert.equal((E.build(s).svg.match(/>-1<\/text>/g)||[]).length,2);s.displayFormat='hex';assert.equal((E.build(s).svg.match(/>0xFF<\/text>/g)||[]).length,2);assert.equal(C.validate(s).displayFormat,'hex');assert.deepEqual(C.simulate(s).outputs.o,Array(8).fill(1));s.nodes[0].displayFormat='invalid';assert.throws(()=>C.validate(s));});
