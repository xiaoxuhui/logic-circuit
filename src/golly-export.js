(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./conway-exchange'), require('./vendor/life-tiles'));
    return;
  }
  if (typeof importScripts === 'function') {
    importScripts('./core.js', './domino-model.js', './vendor/conway/logic-parse.js',
      './vendor/conway/logic-expand.js', './vendor/conway/logic-function-library.js',
      './conway-exchange.js', './vendor/life-tiles.js');
    const api = factory(root.LogicConwayExchange, root.LogicLifeTiles);
    root.onmessage = ({ data }) => {
      try {
        root.postMessage(api.exportToGolly(data.source, data.format));
      } catch (error) {
        root.postMessage({ error: error.message });
      }
    };
  }
})(globalThis, function(Exchange, library) {
  'use strict';

  const { tiles: Tiles, chargedTiles, notice } = library;
  const SIZE = 270;
  const tile = { and: 1, or: 2, gun: 4, split: 6, crossing: 7, stream: 8, turnUp: 12, takeLast: 13, loopTurn: 16, not: 20, tap: 21 };
  const eater = [[0, 0], [1, 0], [0, 1], [2, 1], [2, 2], [2, 3], [3, 3]];
  // In routing space, data travels left and trunks travel down. The actual
  // glider tracks are diagonal in Life, so both axes rotate by 45 degrees.
  const origin = (column, row) => [-SIZE * (column + row), SIZE * (row - column)];
  const hasTemporaryWires = source => Object.keys(source.wireOverrides || {}).length > 0
    || Object.values(source.scopedWireOverrides || {}).some(wires => Object.keys(wires).length);

  function buildPattern(source, options = {}) {
    return layoutPattern(Exchange.circuitSignals(source), { ...options, temporaryWires: hasTemporaryWires(source) });
  }

  function layoutPattern({ inputs, outputs }, { loop: requestLoop = false, seedRegisters = true, temporaryWires = false } = {}) {
    const registerOutputs = outputs.filter(output => output.delayId);
    const candidates = requestLoop && !temporaryWires ? registerOutputs.map(update => {
      const invert = registerOutputs.length === 1 && update.expression.op === 'NOT';
      const driver = invert ? update.expression.args[0] : update.expression;
      return driver.delayId === update.delayId ? { update, driver, invert } : null;
    }) : [];
    const feedbacks = candidates.every(Boolean) ? candidates : [];
    const feedback = feedbacks.length ? (feedbacks[0].invert ? 'invert' : 'hold') : null;
    const roots = [...feedbacks.map(item => item.driver), ...outputs.map(output => output.expression)];
    const producers = [];
    const signal = new Map();
    let row = 0;
    for (const root of roots) {
      const stack = [root];
      while (stack.length) {
        const expression = stack.at(-1);
        if (signal.has(expression)) { stack.pop(); continue; }
        const dependency = expression.args?.find(arg => !signal.has(arg));
        if (dependency) { stack.push(dependency); continue; }
        const index = producers.length;
        const item = { expression, index, column: -3 * index, row, requests: [], taps: new Set() };
        signal.set(expression, item);
        producers.push(item);
        row += expression.args?.length === 2 ? 2 : 1;
        stack.pop();
      }
    }

    function request(expression, y, before) {
      const from = signal.get(expression);
      from.requests.push({ y, before });
      from.taps.add(y);
      from.lastTap = y;
    }
    for (const item of producers) {
      item.expression.args?.forEach((arg, port) => request(arg, item.row + port, item.index));
    }
    const sinkColumn = -3 * producers.length;
    const probes = outputs.map(({ label, expression, delayId }, index) => {
      const y = row + index;
      request(expression, y, producers.length);
      const [x0, y0] = origin(sinkColumn, y);
      return { label, column: sinkColumn, row: y, x: x0 + 230, y: y0 + 230, ...(delayId ? { delayId } : {}) };
    });
    const probeById = new Map(probes.filter(probe => probe.delayId).map(probe => [probe.delayId, probe]));
    const returnById = new Map(feedbacks.map(({ update, driver, invert }, index) => {
      const lane = feedbacks.length - 1 - index;
      return [update.delayId, { source: signal.get(driver), probe: probeById.get(update.delayId),
        left: sinkColumn - 1 - lane, right: 2 + lane, bottom: row + outputs.length + 1 + lane,
        initialValue: update.initialValue, charged: !invert && !!update.initialValue }];
    }));
    const chargedRows = new Set([...returnById.values()].filter(route => route.charged).map(route => route.probe.row));

    const cells = [];
    const crossings = new Map(), streams = [];
    const routeKey = (column, y) => `${column},${y}`;
    function cross(column, y, charged = false) {
      crossings.set(routeKey(column, y), { column, y, charged });
    }
    function seedStream(column, y, rotation = 0) { streams.push({ column, y, rotation }); }
    function place(column, y, kind, rotation = 0, charged = false) {
      const [x0, y0] = origin(column, y);
      for (const packed of charged ? chargedTiles[kind] : Tiles[kind]) {
        let x = packed % SIZE, localY = Math.floor(packed / SIZE);
        for (let turn = 0; turn < rotation; turn++) [x, localY] = [SIZE - 1 - localY, x];
        cells.push([x0 + x, y0 + localY]);
      }
    }
    function placeEater(x0, y0) {
      for (const [x, y] of eater) cells.push([x0 + x, y0 + y]);
    }
    function placeBlock(x, y) {
      cells.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
    }
    function terminate(column, row) {
      // All terminal lanes carry southeast gliders along the tile diagonal.
      const [x0, y0] = origin(column, row);
      placeEater(x0 + 100, y0 + 100);
    }
    const unusedSide = Math.ceil(Math.sqrt(inputs.filter(input => !signal.has(input.expression)).length));
    const [unusedX, unusedY] = origin(Math.max(3, returnById.size + 2), 0);
    let unused = 0;
    const inputPorts = inputs.map(({ label, value, expression }) => {
      const producer = signal.get(expression);
      if (!producer) {
        // Keep unneeded inputs in a compact bank outside the feedback routes.
        const x = unusedX - 12 * (unused % unusedSide), y = unusedY - 12 * Math.floor(unused / unusedSide);
        unused++;
        placeEater(x, y);
        return { label, value, x, y, routed: false };
      }
      const [x0, y0] = origin(producer.column, producer.row);
      const x = x0 + 100, y = y0 + (value ? 160 : 100);
      if (value) placeBlock(x, y);
      else placeEater(x, y);
      return { label, value, x, y, routed: true };
    });
    const registerGuns = new Map();
    for (const item of producers) {
      const { expression, column, row: y, index } = item;
      const route = returnById.get(expression.delayId);
      const gate = { AND: tile.and, OR: tile.or, NOT: tile.not }[expression.op];
      if (gate) place(column, y, gate);
      else if (expression.delayId) {
        registerGuns.set(expression.delayId, origin(column, y));
        if (seedRegisters && !route && expression.defaultValue) place(column, y, tile.gun);
      } else if (expression.value ?? expression.defaultValue) place(column, y, tile.gun);
      if (expression.args?.length === 2) place(column, y + 1, tile.turnUp);
      const charged = route?.charged;
      place(column - 1, y, tile.split, 0, charged);
      terminate(column - 2, y);
      for (const tap of item.taps) place(column - 1, tap, tap === item.lastTap ? tile.takeLast : tile.tap, 0, charged);
      if (charged) for (let tap = y + 1; tap < item.lastTap; tap++) {
        if (!item.taps.has(tap)) seedStream(column - 1, tap, 1);
      }

      for (const { y: trackRow, before } of item.requests) {
        for (let other = index + 1; other < before; other++) {
          const trunk = producers[other];
          if (trunk.row < trackRow && trackRow < trunk.lastTap) cross(trunk.column - 1, trackRow, chargedRows.has(trackRow));
        }
      }
    }
    for (const probe of probes) {
      const route = returnById.get(probe.delayId);
      if (route) {
        const { left, right, bottom, source, charged, initialValue } = route, top = source.row;
        // Each earlier register takes an outer lane. The bottom leg travels northwest.
        place(left, probe.row, tile.loopTurn, 0, charged);
        place(left, bottom, tile.loopTurn, 1, charged);
        place(right, bottom, tile.loopTurn, 2, charged);
        place(right, top, tile.loopTurn, 3, charged);
        for (let i = 0; i < source.index; i++) {
          const trunk = producers[i];
          if (top < trunk.lastTap) cross(trunk.column - 1, top, charged);
        }
        if (charged) for (let x = source.column - 2; x > left; x--) seedStream(x, probe.row);
        if (initialValue) {
          for (let y = probe.row + 1; y < bottom; y++) seedStream(left, y, 1);
          for (let x = left + 1; x < right; x++) seedStream(x, bottom, 2);
          for (let y = top + 1; y < bottom; y++) seedStream(right, y, 3);
          for (let x = source.column; x < right; x++) seedStream(x, top);
        }
      } else terminate(probe.column - 1, probe.row);
      // Two stable blocks mark the sampling window without touching the stream.
      for (const [x, y] of [[probe.x - 28, probe.y + 10], [probe.x + 18, probe.y - 18]]) {
        placeBlock(x, y);
      }
    }
    for (const { column, y, charged } of crossings.values()) place(column, y, tile.crossing, 0, charged);
    for (const { column, y, rotation } of streams) {
      // The crossing passes the vertical stream straight through. Its horizontal stream uses the charged tile.
      if (rotation === 1 || !crossings.has(routeKey(column, y))) place(column, y, tile.stream, rotation);
    }
    const generation = 1080 * (-sinkColumn + row + outputs.length + producers.length + 4);
    const registers = registerOutputs.map(output => ({ id: output.delayId, initialValue: output.initialValue,
      gun: registerGuns.get(output.delayId) || null }));
    return { cells, inputs: inputPorts, outputs: probes, registers, generation, loop: !!feedback, feedback };
  }

  function encodeCells(cells) {
    const rows = new Map();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of cells) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(x);
    }
    const lines = [];
    let line = '', lastY = minY;
    function add(count, symbol) {
      if (!count) return;
      const token = (count > 1 ? count : '') + symbol;
      if (line.length + token.length > 70) { lines.push(line); line = ''; }
      line += token;
    }
    for (const y of [...rows.keys()].sort((a, b) => a - b)) {
      add(y - lastY, '$');
      lastY = y;
      const xs = rows.get(y).sort((a, b) => a - b);
      let cursor = minX;
      for (let i = 0; i < xs.length;) {
        const first = xs[i];
        let end = first;
        while (++i < xs.length && xs[i] <= end + 1) end = xs[i];
        add(first - cursor, 'b');
        add(end - first + 1, 'o');
        cursor = end + 1;
      }
    }
    add(1, '!');
    lines.push(line);
    return { minX, minY, body: [`x = ${maxX - minX + 1}, y = ${maxY - minY + 1}, rule = B3/S23`, ...lines].join('\n') };
  }

  function inputComments(inputs) {
    return inputs.map(({ label, value, routed, x, y }) =>
      `Input ${label.replace(/[\r\n]/g, ' ')} = ${value} at (${x}, ${y}) (${!routed ? 'unused, eater' : value ? 'source marker' : 'eater'})`);
  }

  function toRLE({ cells, inputs = [], outputs, generation, loop, feedback }, source) {
    const { minX, minY, body } = encodeCells(cells);
    const comments = outputs.map(({ label, x, y }) => `#C ${label.replace(/[\r\n]/g, ' ')} at (${x}, ${y})`);
    return [`#CXRLE Pos=${minX},${minY} Gen=0`, ...(source ? Exchange.gollySaveComments(source) : []),
      '#C Logic Workshop - Conway Life glider circuit',
      `#C After about ${generation} generations, look for moving gliders in each marked 40x40 output area (present=1).`,
      ...(loop ? ['#C The next-state stream returns through four turns to the delay input.'] : []),
      ...(feedback === 'hold' ? ['#C Direct feedback preserves the delay line\'s initial bit.'] : []),
      ...inputComments(inputs).map(comment => '#C '+comment), ...comments,
      '#C Gate tiles from rlongdragon, based on Nicholas Carlini’s designs.',
      ...notice.split('\n').map(text => `#C ${text}`),
      body, ''].join('\n');
  }

  function toLua(source, signals = Exchange.circuitSignals(source)) {
    if (!signals.outputs.some(output => output.delayId)) throw Error('当前电路没有延迟线，请使用 RLE 导出');
    const temporaryWires = hasTemporaryWires(source);
    const baseline = temporaryWires
      ? buildPattern({ ...source, wireOverrides: {}, scopedWireOverrides: {} }, { seedRegisters: false })
      : layoutPattern(signals, { seedRegisters: false });
    const first = temporaryWires ? layoutPattern(signals, { seedRegisters: false }) : null;
    const registers = new Map(baseline.registers.map(({ id }, index) => [id, index + 1]));
    function encodeFrame(pattern) {
      const { minX, minY, body } = encodeCells(pattern.cells);
      const guns = pattern.registers.filter(register => register.gun)
        .map(({ id, gun }) => `{${registers.get(id)},${gun.join(',')}}`);
      const probes = pattern.outputs.map(({ label, delayId, x, y }) => {
        const name = JSON.stringify(label.replace(/[\x00-\x1f\x7f]/g, ' '));
        return `{${x},${y},${registers.get(delayId) || 0},${name}}`;
      });
      return `{cells=g.parse([==[${body}]==],${minX},${minY}), generations=${pattern.generation},
  guns={${guns.join(',')}},
  probes={${probes.join(',')}}}`;
    }
    const gun = Tiles[tile.gun].flatMap(packed => [packed % SIZE, Math.floor(packed / SIZE)]);
    return `-- Logic Workshop: run this script in desktop Golly (File > Run Script).
-- Each round evolves a real B3/S23 circuit and samples every delay input before writing any register.
-- Press Escape to stop. The original layer is left in place.
${inputComments(baseline.inputs).map(comment => '-- '+comment).join('\n')}
${notice.split('\n').map(line => `-- ${line}`).join('\n')}
local g = golly()
if g.numlayers() >= g.maxlayers() then g.exit("Close a layer before starting the circuit.") end
g.addlayer()
g.new("Logic Workshop - clocked Life circuit")
g.setalgo("HashLife")
g.setrule("B3/S23")
local baseline = ${encodeFrame(baseline)}
local first = ${first ? encodeFrame(first) : 'nil'}
local gun = {${gun.join(',')}}
local state = {${baseline.registers.map(register => register.initialValue).join(',')}}
local round = 0

local function readBit(probe)
  local x, y = probe[1], probe[2]
  local cells = g.getcells({x,y,40,40})
  if #cells == 0 then return 0 end
  -- At a multiple of 60 generations the output lane has this glider phase.
  for _, point in ipairs({{11,10},{11,12},{12,12},{12,11},{10,12}}) do
    if g.getcell(x+point[1], y+point[2]) ~= 1 then
      g.exit("Output did not settle: " .. probe[4] .. " (round " .. round .. ")")
    end
  end
  return 1
end

while true do
  local frame = first or baseline
  local rect = g.getrect()
  if #rect > 0 then g.select(rect); g.clear(0); g.select({}) end
  g.setgen("0")
  g.putcells(frame.cells)
  for _, source in ipairs(frame.guns) do
    if state[source[1]] == 1 then g.putcells(gun, source[2], source[3]) end
  end
  if round == 0 then g.fit() end
  g.run(frame.generations)

  local nextState, readings = {}, {}
  for _, probe in ipairs(frame.probes) do
    local value = readBit(probe)
    if probe[3] > 0 then nextState[probe[3]] = value end
    readings[#readings+1] = probe[4] .. "=" .. value
  end
  local stable = first == nil
  for i, bit in ipairs(state) do
    if nextState[i] ~= bit then stable = false end
  end
  g.show("Round " .. round .. "  state " .. table.concat(state, "") .. " -> "
    .. table.concat(nextState, "") .. "  " .. table.concat(readings, "  ") .. (stable and "  [stable]" or ""))
  g.update()
  if stable then break end
  first = nil
  state = nextState
  round = round + 1
end
`;
  }

  function exportToGolly(source, format = 'rle') {
    const signals = Exchange.circuitSignals(source);
    if (format === 'lua') return { text: toLua(source, signals), format };
    const pattern = layoutPattern(signals, { loop: true, temporaryWires: hasTemporaryWires(source) });
    return { text: toRLE(pattern, source), format, outputs: pattern.outputs.length, generation: pattern.generation,
      feedback: pattern.feedback, registers: pattern.registers.length };
  }

  return { buildPattern, toRLE, toLua, exportToGolly };
});
