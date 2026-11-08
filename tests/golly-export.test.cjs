const assert = require('node:assert/strict');
const { test } = require('node:test');
const Core = require('../src/core');
const Exchange = require('../src/conway-exchange');
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
  assert.equal(Golly.buildPattern(source, { loop: true }).feedback, 'invert');
  assert.throws(() => Golly.buildPattern({ version: 1, nodes: [], wires: [], definitions: {} }), /输出指示灯/);
});

test('Golly exports actual RLE by default even for a counter and keeps Lua explicit', () => {
  const counter = Presets.load('counter4');
  const snapshot = Golly.exportToGolly(counter);
  assert.equal(snapshot.format, 'rle');
  assert.equal(snapshot.registers, 4);
  assert.ok(decode(snapshot.text).length > 0);
  const script = Golly.exportToGolly(counter, 'lua');
  assert.equal(script.format, 'lua');
  assert.match(script.text, /local state = \{0,0,0,0\}/);
  const combinational = Golly.exportToGolly(Presets.load('not'));
  assert.equal(combinational.format, 'rle');
  assert.match(combinational.text, /rule = B3\/S23/);
  const oscillator = Presets.load('oscillator');
  const loop = Golly.exportToGolly(oscillator);
  assert.equal(loop.format, 'rle');
  assert.equal(loop.feedback, 'invert');
  assert.match(loop.text, /returns through four turns/);
});

test('Golly RLE round-trips the original counter, wires, custom gates, and delay state', () => {
  const source = Presets.load('counter4');
  source.delayState['root/q0'] = 1;
  source.delayState['root/q2'] = 1;
  source.definitions.saved = Core.makeDefinition(Presets.load('not'), '我保存的非门');
  source.nodes.push({ id: 'saved', type: 'custom', def: 'saved', x: 1800, y: 120, rotation: 90 });
  const { text } = Golly.exportToGolly(source);
  const native = Golly.toRLE(Golly.buildPattern(source, { loop: true }));
  assert.deepEqual(decode(text), decode(native), 'the archive leaves the compiled Life cells intact');
  assert.deepEqual(Core.validate(JSON.parse(Exchange.readGollySave(text.replaceAll('\n', '\r\n')))), source);
  assert.throws(() => Exchange.readGollySave(native), /没有逻辑工坊的原电路存档/);
  assert.throws(() => Exchange.readGollySave(text.split('#C LogicWorkshop-End')[0]), /不完整/);
});

test('Golly marks each input bit, including zero and unused inputs', () => {
  const source = {
    version: 1, definitions: {},
    nodes: [
      { id: 'i', type: 'input', x: 0, y: 0, bits: 2, value: 1, label: 'A' },
      { id: 'u', type: 'input', x: 0, y: 100, value: 1, label: '备用' },
      { id: 'o', type: 'output', x: 300, y: 0, bits: 2 },
    ],
    wires: [{ id: 'w', a: { node: 'i', dir: 'out', port: 0 }, b: { node: 'o', dir: 'in', port: 0 } }],
  };
  const pattern = Golly.buildPattern(source);
  assert.deepEqual(pattern.inputs.map(({ label, value, routed }) => [label, value, routed]), [
    ['A · b1', 0, true], ['A · b0', 1, true], ['备用', 1, false],
  ]);
  const rle = Golly.toRLE(pattern);
  const live = new Set(decode(rle).map(cell => cell.join(',')));
  for (const { label, value, routed, x, y } of pattern.inputs) {
    assert.ok(rle.includes(`#C Input ${label} = ${value} at (${x}, ${y})`));
    const size = routed && value ? 2 : 4;
    let count = 0;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) count += live.has(`${x + dx},${y + dy}`);
    assert.equal(count, size === 2 ? 4 : 7);
  }
  const oscillator = Presets.load('oscillator');
  oscillator.nodes.push(source.nodes[1]);
  assert.match(Golly.toLua(oscillator), /-- Input 备用 = 1 at \(-?\d+, -?\d+\) \(unused, eater\)/);
});

function evolvePattern(cells, generation) {
  const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
  const left = Math.min(...xs) - 20, top = Math.min(...ys) - 20;
  const width = Math.max(...xs) - left + 21, height = Math.max(...ys) - top + 21;
  const index = (x, y) => (y - top) * width + x - left;
  const live = new Uint8Array(width * height), counts = new Uint8Array(live.length);
  const neighbors = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
  let active = [...new Set(cells.map(([x, y]) => index(x, y)))], next = [];
  const touched = [];
  for (const cell of active) live[cell] = 1;
  for (let step = 0; step < generation; step++) {
    for (const cell of active) for (const offset of neighbors) {
      const neighbor = cell + offset;
      if (counts[neighbor]++ === 0) touched.push(neighbor);
    }
    for (const cell of touched) {
      const count = counts[cell];
      counts[cell] = 0;
      if (count !== 3 && !(count === 2 && live[cell])) continue;
      const x = cell % width;
      if (x === 0 || x === width - 1 || cell < width || cell >= live.length - width) {
        assert.fail(`Cells escaped the circuit at generation ${step + 1}`);
      }
      next.push(cell);
    }
    for (const cell of active) live[cell] = 0;
    for (const cell of next) live[cell] = 1;
    touched.length = active.length = 0;
    [active, next] = [next, active];
  }
  return (x, y) => live[index(x, y)];
}

const probeGlider = [[11, 10], [11, 12], [12, 12], [12, 11], [10, 12]];

test('Golly terminates the unused splitter branch and absorbs the stream after the output probe', () => {
  const source = {
    version: 1, definitions: {},
    nodes: [{ id: 'i', type: 'input', x: 0, y: 0, value: 1 }, { id: 'o', type: 'output', x: 200, y: 0 }],
    wires: [{ id: 'w', a: { node: 'i', dir: 'out', port: 0 }, b: { node: 'o', dir: 'in', port: 0 } }],
  };
  const { cells, inputs: [input], outputs: [probe], generation } = Golly.buildPattern(source);
  const live = evolvePattern(cells, generation);
  for (const [dx, dy] of probeGlider) {
    assert.equal(live(probe.x + dx, probe.y + dy), 1, 'the output glider is still readable');
  }
  for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    assert.equal(live(input.x + dx, input.y + dy), 1, 'the input marker remains stable');
  }
});

test('direct delay feedback holds zero or one and the seeded loop starts with a full stream', () => {
  const source = {
    version: 1, definitions: {},
    nodes: [{ id: 'q', type: 'delay', x: 0, y: 0 }, { id: 'o', type: 'output', x: 200, y: 0 }],
    wires: ['q', 'o'].map(id => ({ id, a: { node: 'q', dir: 'out', port: 0 }, b: { node: id, dir: 'in', port: 0 } })),
  };
  for (const value of [0, 1]) {
    source.delayState = { 'root/q': value };
    const pattern = Golly.buildPattern(source, { loop: true });
    assert.equal(pattern.feedback, 'hold');
    assert.match(Golly.toRLE(pattern), /Direct feedback preserves/);
    const probe = pattern.outputs.find(output => output.delayId);
    for (const generations of [0, 120]) {
      const live = evolvePattern(pattern.cells, generations);
      for (const [dx, dy] of probeGlider) assert.equal(live(probe.x + dx, probe.y + dy), value);
    }
  }
});
