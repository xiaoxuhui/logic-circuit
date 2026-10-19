const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
test('explicit direct wire cannot join an invisible legacy elbow near another input',()=>{
 const state={nodes:[{id:'i',type:'input',x:0,y:0,value:1},{id:'n',type:'nand',x:400,y:100}],wires:[{id:'a',a:{node:'i',dir:'out',port:0},b:{node:'n',dir:'in',port:0},via:[]},{id:'b',a:{x:276,y:40},b:{node:'n',dir:'in',port:1},via:[]}],definitions:{}};
 const sim=C.simulate(state),net=C.nets(state);assert.notEqual(net.wireNet.get('a'),net.wireNet.get('b'));assert.deepEqual(sim.portValues['n:in:0'],[1]);assert.deepEqual(sim.portValues['n:in:1'],[0]);
 const branch=C.clone(state);branch.wires[1].a={x:276,y:84};assert.equal(C.nets(branch).wireNet.get('a'),C.nets(branch).wireNet.get('b'));assert.deepEqual(C.simulate(branch).portValues['n:in:1'],[1]);
});
