const assert = require('node:assert/strict');
const { test } = require('node:test');
const Golly = require('../src/golly-export');
const Presets = require('../src/presets');

function decode(rle) {
  const [first, ...lines] = rle.trim().split('\n');
  const [, originX, originY] = first.match(/^#CXRLE Pos=(-?\d+),(-?\d+) Gen=0$/).map(Number);
  const data = lines.filter(line => !line.startsWith('#') && !line.startsWith('x =')).join('');
  assert.match(data, /^(?:\d*[bo$])*!$/);
  const cells = [];
  let x = originX, y = originY;
  for (const [, number, symbol] of data.matchAll(/(\d*)([bo$!])/g)) {
    const count = Number(number || 1);
    if (symbol === 'o') {
      for (let i = 0; i < count; i++) cells.push([x++, y]);
    } else if (symbol === 'b') {
      x += count;
    } else if (symbol === '$') {
      y += count;
      x = originX;
    }
  }
  return cells;
}

test('Golly RLE preserves every compiled Life cell and marks each output of a full adder', () => {
  const source = Presets.load('adder');
  source.nodes[0].value = 1;
  const original = JSON.stringify(source);
  const pattern = Golly.buildPattern(source);
  const rle = Golly.toRLE(pattern);
  assert.match(rle, /rule = B3\/S23/);
  assert.match(rle, /Copyright \(c\) 2023 rlongdragon/);
  assert.deepEqual(pattern.outputs.map(probe => probe.label), ['和 S', '进位 C_out']);
  const expected = [...new Set(pattern.cells.map(point => point.join(',')))].sort();
  assert.deepEqual(decode(rle).map(point => point.join(',')).sort(), expected);
  assert.equal(JSON.stringify(source), original);
});

test('Golly layout uses current input switches and exports delay read and next-state probes', () => {
  const source = Presets.load('oscillator');
  const low = Golly.buildPattern(source);
  source.delayState['root/q'] = 1;
  const high = Golly.buildPattern(source);
  assert.deepEqual(low.outputs.map(probe => probe.label), ['交替输出', '延迟记忆·下一步']);
  assert.deepEqual(high.outputs, low.outputs);
  assert.ok(high.cells.length > low.cells.length);
  assert.throws(() => Golly.buildPattern({ version: 1, nodes: [], wires: [], definitions: {} }), /输出指示灯/);
});
