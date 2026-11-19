const assert = require('node:assert/strict');
const { test } = require('node:test');
const { World } = require('../src/conway-life');

function evolve(points) {
  const counts = new Map();
  for (const cell of points) {
    const [x,y] = cell.split(',').map(Number);
    for (let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) if(dx||dy) {
      const key=`${x+dx},${y+dy}`;
      counts.set(key,(counts.get(key)||0)+1);
    }
  }
  return new Set([...counts].filter(([key,n])=>n===3||(n===2&&points.has(key))).map(([key])=>key));
}

test('Life fast-forward matches B3/S23 across jumps, edits, and the original bounds', () => {
  const points=[[1,0],[2,1],[0,2],[1,2],[2,2],[-7,-6],[-6,-6],[-5,-6],[15,-15],[15,-14],[16,-15],[16,-14]];
  let expected=new Set(points.map(point=>point.join(',')));
  const world=new World(points);
  for(const step of [1,13,32,99,3]){
    if(step===32){world.set(15,-15,0);expected.delete('15,-15');}
    for(let i=0;i<step;i++)expected=evolve(expected);
    world.advance(step);
    const cells=world.view({left:-100,top:-100,right:100,bottom:100,block:1}), actual=new Set();
    for(let i=0;i<cells.length;i+=2)actual.add(`${cells[i]},${cells[i+1]}`);
    assert.deepEqual(actual,expected);
    for(const cell of expected)assert.equal(world.get(...cell.split(',').map(Number)),1);
  }
  assert.equal(world.generation,148);
});

test('Life XOR clears stale output after an input change and reads the propagated result', () => {
  const fs=require('node:fs'),vm=require('node:vm');
  let message;
  const context=vm.createContext({
    self:{},importScripts(){},
    LogicGollyExport:require('../src/golly-export'),LogicConwayLife:{World},
    postMessage(value){message=value;},
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/conway-life-worker'),'utf8'),context);
  const send=data=>{
    context.self.onmessage({data});
    assert.equal(message.type,'state',message.message);
    return message;
  };
  const source=require('../src/presets').load('xor');
  send({type:'init',source});
  assert.equal(send({type:'step',amount:'sample'}).reading.values[0],0);
  assert.equal(send({type:'toggle',index:0}).reading,null);
  assert.equal(send({type:'step',amount:1}).reading,null);
  assert.equal(send({type:'step',amount:'sample'}).reading.values[0],1);
  assert.equal(send({type:'toggle',index:1}).reading,null);
  assert.equal(send({type:'step',amount:'sample'}).reading.values[0],0);
});

test('Life conversion preserves each primitive truth table and XOR fanout through actual evolution', () => {
  const fs=require('node:fs'),vm=require('node:vm');
  const Core=require('../src/core'),Presets=require('../src/presets');
  let message;
  const context=vm.createContext({
    self:{},importScripts(){},
    LogicGollyExport:require('../src/golly-export'),LogicConwayLife:{World},
    postMessage(value){message=value;},
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/conway-life-worker'),'utf8'),context);
  const send=data=>{
    context.self.onmessage({data});
    assert.equal(message.type,'state',message.message);
    return message;
  };
  for(const id of ['nand','not','and','or','xor','adder']){
    const source=Presets.load(id);
    if(id==='xor'){
      source.nodes.unshift({id:'branch',type:'output',x:1200,y:-100,label:'B 的支路'});
      source.wires.push({id:'branch',a:{node:'b',dir:'out',port:0},b:{node:'branch',dir:'in',port:0}});
    }
    const inputs=source.nodes.filter(node=>node.type==='input');
    const outputs=source.nodes.filter(node=>node.type==='output');
    const simulate=Core.createSimulator();
    const check=row=>{
      const actual=send({type:'step',amount:'sample'}).reading.values;
      const result=simulate(source);
      assert.deepEqual(Array.from(actual),outputs.map(node=>result.outputs[node.id][0]),`${id}, inputs ${row}`);
    };
    for(let row=0;row<2**inputs.length;row++){
      inputs.forEach((node,index)=>{node.value=row>>index&1;});
      send({type:'init',source});
      check(row);
    }
    inputs.forEach(node=>{node.value=0;});
    send({type:'init',source});
    check(0);
    let previous=0;
    for(let row=1;row<2**inputs.length;row++){
      const next=row^(row>>1);
      const index=inputs.findIndex((node,bit)=>(next>>bit&1)!==(previous>>bit&1));
      inputs[index].value=next>>index&1;
      send({type:'toggle',index});
      check(next);
      previous=next;
    }
  }
  const Expanded=require('../src/expanded');
  const inner=Presets.load('xor');
  inner.definitions.inner=Core.makeDefinition(inner,'封装的异或门');
  const nested={version:1,definitions:inner.definitions,
    nodes:[{id:'a',type:'input',x:0,y:0},{id:'b',type:'input',x:0,y:160},
      {id:'gate',type:'custom',def:'inner',x:300,y:80},{id:'o',type:'output',x:600,y:80}],
    wires:[{id:'a',a:{node:'a',dir:'out',port:0},b:{node:'gate',dir:'in',port:0}},
      {id:'b',a:{node:'b',dir:'out',port:0},b:{node:'gate',dir:'in',port:1}},
      {id:'o',a:{node:'gate',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}]};
  for(let row=0;row<4;row++){
    nested.nodes[0].value=row&1;nested.nodes[1].value=row>>1;
    const captured={version:1,...Expanded.focus(nested,'gate').source};
    const expected=Core.simulate(nested).outputs.o[0];
    for(const source of [nested,captured]){
      send({type:'init',source});
      assert.equal(send({type:'step',amount:'sample'}).reading.values[0],expected,`nested XOR ${row}`);
    }
  }
});
