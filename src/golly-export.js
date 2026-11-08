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
        const pattern = api.buildPattern(data);
        root.postMessage({ text: api.toRLE(pattern), outputs: pattern.outputs.length, generation: pattern.generation });
      } catch (error) {
        root.postMessage({ error: error.message });
      }
    };
  }
})(globalThis, function(Exchange, library) {
  'use strict';

  const { tiles: Tiles, notice } = library;
  const SIZE = 270;
  const tile = { and: 1, or: 2, gun: 4, sink: 5, split: 6, crossing: 7, turnUp: 12, takeLast: 13, not: 20, tap: 21 };
  // In routing space, data travels left and trunks travel down. The actual
  // glider tracks are diagonal in Life, so both axes rotate by 45 degrees.
  const origin = (column, row) => [-SIZE * (column + row), SIZE * (row - column)];

  function buildPattern(source) {
    const outputs = Exchange.circuitOutputs(source);
    const producers = [];
    const signal = new Map();
    let row = 0;
    for (const output of outputs) {
      const stack = [output.expression];
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
    const probes = outputs.map(({ label, expression }, index) => {
      const y = row + index;
      request(expression, y, producers.length);
      const [x0, y0] = origin(sinkColumn, y);
      return { label, column: sinkColumn, row: y, x: x0 + 230, y: y0 + 230 };
    });

    const cells = [];
    function place(column, y, kind) {
      const [x0, y0] = origin(column, y);
      for (const packed of Tiles[kind]) cells.push([x0 + packed % SIZE, y0 + Math.floor(packed / SIZE)]);
    }
    for (const item of producers) {
      const { expression, column, row: y, index } = item;
      const gate = { AND: tile.and, OR: tile.or, NOT: tile.not }[expression.op];
      if (gate) place(column, y, gate);
      else if (expression.value ?? expression.defaultValue) place(column, y, tile.gun);
      if (expression.args?.length === 2) place(column, y + 1, tile.turnUp);
      place(column - 1, y, tile.split);
      place(column - 2, y, tile.sink);
      for (const tap of item.taps) place(column - 1, tap, tap === item.lastTap ? tile.takeLast : tile.tap);

      for (const { y: trackRow, before } of item.requests) {
        for (let other = index + 1; other < before; other++) {
          const trunk = producers[other];
          if (trunk.row < trackRow && trackRow < trunk.lastTap) place(trunk.column - 1, trackRow, tile.crossing);
        }
      }
    }
    for (const probe of probes) {
      place(probe.column - 1, probe.row, tile.sink);
      // Two stable blocks mark the sampling window without touching the stream.
      for (const [x, y] of [[probe.x - 28, probe.y + 10], [probe.x + 18, probe.y - 18]]) {
        cells.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
      }
    }
    const generation = 1080 * (-sinkColumn + row + outputs.length + producers.length + 4);
    return { cells, outputs: probes, generation };
  }

  function toRLE({ cells, outputs, generation }) {
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
    const comments = outputs.map(({ label, x, y }) => `#C ${label.replace(/[\r\n]/g, ' ')} at (${x}, ${y})`);
    return [`#CXRLE Pos=${minX},${minY} Gen=0`, '#C Logic Workshop - Conway Life glider circuit',
      `#C After about ${generation} generations, look for moving gliders in each marked 40x40 output area (present=1).`,
      ...comments, '#C Gate tiles from rlongdragon, based on Nicholas Carlini’s designs.',
      ...notice.split('\n').map(text => `#C ${text}`),
      `x = ${maxX - minX + 1}, y = ${maxY - minY + 1}, rule = B3/S23`, ...lines, ''].join('\n');
  }

  return { buildPattern, toRLE };
});
