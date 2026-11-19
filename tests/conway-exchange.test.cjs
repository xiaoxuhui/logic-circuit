const assert = require('node:assert/strict');
const { test } = require('node:test');
const Core = require('../src/core');
const Presets = require('../src/presets');
const Exchange = require('../src/conway-exchange');
const Parse = require('../src/vendor/conway/logic-parse');
const Expand = require('../src/vendor/conway/logic-expand');
const Library = require('../src/vendor/conway/logic-function-library');

const parseDefault = item => Parse.parse(Expand.instantiateFunction(item,
  Object.fromEntries(item.inputs.map(input => [input.name, input.defaultValue]))));

test('a custom wired OR keeps its inputs separate from its output and sibling branches', () => {
  for(const bits of [1,3]){
    const wire=(id,from,to,port=0)=>({id,a:{node:from,dir:'out',port:0},b:{node:to,dir:'in',port}});
    const definition=Core.makeDefinition({nodes:[
      {id:'x',type:'input',bits,x:0,y:0},{id:'y',type:'input',bits,x:0,y:160},
      {id:'o',type:'output',bits,x:300,y:80}],wires:[wire('x','x','o'),wire('y','y','o')]},'导线或门');
    const source={version:1,definitions:{or:definition},nodes:[
      {id:'a',type:'input',bits,x:0,y:0},{id:'b',type:'input',bits,x:0,y:160},
      {id:'gate',type:'custom',def:'or',x:300,y:80},
      {id:'o',type:'output',bits,x:600,y:80},{id:'branch',type:'output',bits,x:600,y:240}],
      wires:[wire('a','a','gate'),wire('b','b','gate',1),wire('o','gate','o'),wire('branch','a','branch')]};
    for(let a=0;a<2**bits;a++)for(let b=0;b<2**bits;b++){
      source.nodes[0].value=a;source.nodes[1].value=b;
      const expected=Object.values(Core.simulate(source).outputs).flat();
      const actual=Exchange.exportFunctions(source).functions.map(item=>parseDefault(item).expected);
      assert.deepEqual(actual,expected,`${bits} bits, ${a} OR ${b}, with independent A output`);
    }
  }
});

test('native Conway function-library round trip preserves every full-adder input row and both outputs', () => {
  for (let row = 0; row < 8; row++) {
    const source = Presets.load('adder');
    source.nodes.filter(n => n.type === 'input').forEach((n, i) => { n.value = (row >> i) & 1; });
    const before = JSON.stringify(source);
    const library = Library.parseLibrary(Exchange.serializeLibrary(Exchange.exportFunctions(source)));
    const imported = Exchange.importFunctions(library, library.functions.map(item => item.id));
    const expected = Object.values(Core.simulate(source).outputs).flat();
    assert.deepEqual(library.functions.map(item => parseDefault(item).expected), expected);
    assert.deepEqual(imported.map(gate => Core.simulate(gate).outputs[gate.outputs[0].id][0]), expected);
    assert.equal(JSON.stringify(source), before);
  }
});

test('delay values become inputs with the current default and next-state functions are separate', () => {
  const source = Presets.load('oscillator');
  source.delayState['root/q'] = 1;
  const { functions } = Exchange.exportFunctions(source);
  assert.equal(functions[0].inputs[0].defaultValue, 1);
  assert.equal(parseDefault(functions[0]).expected, 1);
  assert.match(functions[1].name, /下一步$/);
  assert.equal(parseDefault(functions[1]).expected, 0);
});

test('native library aliases and default variables survive import with a duplicate gate name', () => {
  const library = Library.createLibrary([
    Library.createFunction({ name: '反相', code: '!X', inputs: [{ name: 'X', defaultValue: 0 }] }),
    Library.createFunction({ name: 'AND_NOT', code: 'AND(FUNC1(A),B)', inputs: [
      { name: 'A', defaultValue: 0 }, { name: 'B', defaultValue: 1 },
    ] }),
  ]);
  const [gate] = Exchange.importFunctions(library, [library.functions[1].id], ['AND_NOT']);
  assert.equal(gate.name, 'AND_NOT (2)');
  assert.deepEqual(gate.inputs.map(p => p.label), ['A', 'B']);
  assert.deepEqual(Core.simulate(gate).outputs[gate.outputs[0].id], [1]);
  assert.deepEqual(Core.simulate(gate, { [gate.inputs[0].id]: [1] }).outputs[gate.outputs[0].id], [0]);
});
