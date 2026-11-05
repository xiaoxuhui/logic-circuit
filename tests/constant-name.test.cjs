const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js'),E=require('../src/expanded.js'),D=require('../src/domino-model.js'),fixture=require('./constant-name-fixture.cjs');
test('constants retain widths and values but never become public definition inputs',()=>{
 const s=fixture();assert.equal(s.definitions.g.inputs.length,1);assert.equal(s.definitions.g.inputs[0].id,'a');C.validate(s);
 assert.deepEqual(C.simulate(s).values.g[1],C.bitArray(5,4));
 assert.deepEqual(C.simulate({...s.definitions.g,definitions:s.definitions},{k:C.bitArray(0,4)}).outputs.ko,C.bitArray(5,4));
 const next=C.setConstantValue(s,'g','k',C.bitArray(7,4));assert.equal(next.definitions.g.inputs.length,1);assert.equal(next.definitions.g.nodes.find(n=>n.id==='k').fractionBits,2);assert.deepEqual(C.simulate(next).values.g[1],C.bitArray(7,4));assert.equal(s.definitions.g.nodes.find(n=>n.id==='k').value,5);
 assert.doesNotThrow(()=>E.build(next));assert.doesNotThrow(()=>E.focus(next,'g'));assert.equal(D.flatten(next).items.filter(n=>n.scope==='root/g'&&n.node==='k').length,4);
 assert.throws(()=>C.setConstantValue(s,'g','a',C.bitArray(1,4)));
});
test('gate names follow the selected internal wire, independently of constants, using cached calculation',()=>{
 const s=fixture();s.definitions.g.nameWire='selected';const run=C.createSimulator();
 let sim=run(s);assert.equal(C.gateDisplayName(s.nodes[1],s,sim),'功能_3');assert.equal(run(s).nameValues.g.bits.join(''),C.bitArray(3,4).join(''));
 s.nodes[0].value=9;sim=run(s);assert.equal(C.gateDisplayName(s.nodes[1],s,sim),'功能_9');
 const changed=C.setConstantValue(s,'g','k',C.bitArray(15,4));assert.equal(C.gateDisplayName(changed.nodes[1],changed,run(changed)),'功能_9');
 changed.definitions.g.nameWire='fixed';assert.equal(C.gateDisplayName(changed.nodes[1],changed,run(changed)),'功能_3.75');
 changed.displayFormat='signed';assert.equal(C.gateDisplayName(changed.nodes[1],changed,run(changed)),'功能_-0.25');
 const local=C.clone(changed.definitions.g);local.wires=local.wires.filter(w=>w.id!=='fixed');const next=C.updateDefinition(changed,'g',local);assert.equal(next.definitions.g.nameWire,undefined);assert.equal(C.gateDisplayName(next.nodes[1],next,run(next)),'功能');
});
test('constant and name metadata are validated and saved without changing port identities',()=>{
 const s=fixture();s.definitions.g.nameWire='fixed';assert.deepEqual(C.validate(JSON.parse(JSON.stringify(s))).definitions.g.inputs,s.definitions.g.inputs);
 assert.throws(()=>C.validate({...s,definitions:{g:{...s.definitions.g,nameWire:'missing'}}}));
 const bad=C.clone(s);bad.definitions.g.inputs.push({id:'k',label:'错误',width:4});assert.throws(()=>C.validate(bad));
});
test('displayed wire values follow independent register instances and next-step state',()=>{
 const s=fixture(),old=s.definitions.g,local=C.clone(old);local.nodes.push({id:'d',type:'delay',bits:4,x:250,y:0});local.wires[0].a.node='d';local.wires.push({id:'sample',a:{node:'a',dir:'out',port:0},b:{node:'d',dir:'in',port:0}});s.definitions.g={...C.makeDefinition(local,old.name),nameWire:'selected'};
 s.nodes.push({id:'j',type:'input',bits:4,value:9,x:0,y:400},{id:'g2',type:'custom',def:'g',x:450,y:400});s.wires.push({id:'in2',a:{node:'j',dir:'out',port:0},b:{node:'g2',dir:'in',port:0}});s.delayState={'root/g/d':2,'root/g2/d':7};
 const run=C.createSimulator();let sim=run(s);assert.equal(C.gateDisplayName(s.nodes[1],s,sim),'功能_2');assert.equal(C.gateDisplayName(s.nodes.at(-1),s,sim),'功能_7');
 s.delayState=C.step(s);sim=run(s);assert.equal(C.gateDisplayName(s.nodes[1],s,sim),'功能_3');assert.equal(C.gateDisplayName(s.nodes.at(-1),s,sim),'功能_9');
});
