(function(root, factory) {
  const api = typeof module === 'object' && module.exports
    ? factory(require('./core.js'), require('./domino-model.js'), require('./vendor/conway/logic-parse.js'),
      require('./vendor/conway/logic-expand.js'), require('./vendor/conway/logic-function-library.js'))
    : factory(root.LogicCore, root.LogicDomino, root.LogicParse, root.LogicExpand, root.LogicFunctionLibrary);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LogicConwayExchange = api;
})(globalThis, function(Core, Domino, Parse, Expand, Library) {
  'use strict';

  const literal = value => ({ value, size: 1 });
  const zero = literal(0);
  const one = literal(1);
  const negate = a => a.value !== undefined ? (a.value ? zero : one)
    : a.op === 'NOT' ? a.args[0] : { op: 'NOT', args: [a], size: a.size + 1 };

  function join(op, a, b) {
    if (a === b) return a;
    if (op === 'AND') {
      if (a === zero || b === zero) return zero;
      if (a === one || b === one) return a === one ? b : a;
    } else {
      if (a === one || b === one) return one;
      if (a === zero || b === zero) return a === zero ? b : a;
    }
    return { op, args: [a, b], size: a.size + b.size + 1 };
  }

  function expressionText(expression, inputs, parentPrecedence = 0) {
    if (expression.name) {
      inputs.set(expression.name, expression.defaultValue);
      return expression.name;
    }
    if (expression.value !== undefined) return String(expression.value);
    const precedence = { OR: 1, AND: 2, NOT: 3 }[expression.op];
    const [a, b] = expression.args;
    const left = expressionText(a, inputs, precedence);
    const text = expression.op === 'NOT' ? `!${left}`
      : left + (expression.op === 'AND' ? '&&' : '||') + expressionText(b, inputs, precedence);
    return precedence < parentPrecedence ? `(${text})` : text;
  }

  function circuitOutputs(source) {
    let graph;
    try {
      graph = Domino.flatten(source);
    } catch (error) {
      if (error.message.includes('反馈环')) throw Error('请用延迟线断开反馈环，再转换为康威生命游戏');
      throw error;
    }
    const expressions = new Map(), nets = new Map();
    const sourceNodes = graph.items.filter(p => p.type === 'input' || p.type === 'delay');
    const occupiedNames = new Set(['AND', 'OR', 'NOT']);
    for (const [index, p] of sourceNodes.entries()) {
      if (p.constant || p.forced) {
        expressions.set(p, p.value ? one : zero);
        continue;
      }
      const label = p.label.replace(/ · b(\d+)$/, '_B$1');
      const preferred = /^[A-Z][A-Z0-9_]{0,11}$/i.test(label) ? label.toUpperCase() : '';
      let name = preferred && !occupiedNames.has(preferred) ? preferred : `I${index + 1}`;
      while (occupiedNames.has(name)) name += '_';
      occupiedNames.add(name);
      expressions.set(p, { name, defaultValue: p.value, size: 1 });
    }
    function net(id) {
      if (!nets.has(id)) {
        const drivers = (graph.drivers.get(id) || []).map(p => expressions.get(p));
        nets.set(id, drivers.reduce((a, b) => join('OR', a, b), zero));
      }
      return nets.get(id);
    }
    for (const p of graph.order) {
      expressions.set(p, negate(join('AND', net(p.inputs[0]), net(p.inputs[1]))));
    }
    const outputs = [...graph.items.filter(p => p.type === 'output'), ...graph.items.filter(p => p.type === 'delay')];
    if (!outputs.length) throw Error('请先添加输出指示灯，再转换电路');
    return outputs.map(p => ({
      label: p.label + (p.type === 'delay' ? '·下一步' : ''),
      expression: net(p.inputs[0]),
    }));
  }

  function exportFunctions(source) {
    const outputs = circuitOutputs(source);
    if (outputs.length > Library.MAX_FUNCTIONS) {
      throw Error(`康威函数库最多容纳 ${Library.MAX_FUNCTIONS} 项。请导出较小的子电路。`);
    }
    const usedNames = new Set();
    const functions = outputs.map(({ label, expression }) => {
      const inputs = new Map();
      try {
        if (expression.size > Parse.MAX_SOURCE_LENGTH) throw Error('表达式超过康威游戏的 200 字符限制');
        let code = expressionText(expression, inputs);
        // The destination requires a gate even for a direct wire or a fixed output.
        if (!expression.op) code = `!!${code}`;
        const item = Library.createFunction({
          name: uniqueName(`工坊·${label}`, usedNames, Library.MAX_NAME_LENGTH), code,
          inputs: [...inputs].map(([name, defaultValue]) => ({ name, defaultValue })),
        });
        Expand.instantiateFunction(item, Object.fromEntries(inputs));
        return item;
      } catch (error) {
        throw Error(`“${label}”无法导出：${error.message}`);
      }
    });
    return Library.createLibrary(functions);
  }

  function uniqueName(name, used, limit) {
    let result = name.slice(0, limit);
    for (let index = 2; used.has(result.toUpperCase()); index++) {
      const suffix = ` (${index})`;
      result = name.slice(0, limit - suffix.length) + suffix;
    }
    used.add(result.toUpperCase());
    return result;
  }

  function callableDefinitions(library) {
    // Mirror the Life game's call names, including FUNC<n> aliases and collisions.
    const used = new Set(['AND', 'OR', 'NOT']);
    return library.functions.map((item, index) => {
      const base = /^[A-Za-z][A-Za-z0-9_]*$/.test(item.name) ? item.name.toUpperCase() : `FUNC${index + 1}`;
      let callName = base;
      for (let suffix = 2; used.has(callName); suffix++) callName = `${base}_${suffix}`;
      used.add(callName);
      return { ...item, callName };
    });
  }

  function compileFunction(item, callable, name) {
    const program = Parse.splitProgram(Expand.expandFunctions(item.code, callable));
    const referenced = Parse.collectVariableNames(program.expression);
    const defaults = new Map(item.inputs.map(input => [input.name, input.defaultValue]));
    const assignments = new Map(referenced.map(variable => [variable, defaults.get(variable) ?? 0]));
    for (const [variable, value] of program.assignments) assignments.set(variable, value);
    const parsed = Parse.parseFunctionExpression(program.expression, assignments);
    const tree = parsed.tree || { gate: parsed.gate, children: parsed.inputs.map(value => ({ value })) };

    const nodes = [], wires = [], rows = [], variables = new Map(), constants = new Map(), gates = new Map();
    function node(type, depth, extra) {
      const row = rows[depth] || 0;
      rows[depth] = row + 1;
      const component = { id: `n${nodes.length}`, type, x: depth * 264, y: row * 120, ...extra };
      nodes.push(component);
      return { id: component.id, depth };
    }
    function wire(from, to, port = 0) {
      wires.push({ id: `w${wires.length}`, a: { node: from.id, dir: 'out', port: 0 }, b: { node: to.id, dir: 'in', port } });
    }
    function nand(a, b) {
      const key = [a.id, b.id].sort().join('/');
      if (!gates.has(key)) {
        const out = node('nand', Math.max(a.depth, b.depth) + 1);
        wire(a, out);
        wire(b, out, 1);
        gates.set(key, out);
      }
      return gates.get(key);
    }
    const not = a => nand(a, a);
    for (const variable of new Set([...defaults.keys(), ...referenced])) {
      if (assignments.has(variable)) variables.set(variable, node('input', 0, { label: variable.slice(0, 24), value: assignments.get(variable) }));
    }
    function build(expression) {
      if (expression.variable) return variables.get(expression.variable);
      if (!expression.gate) {
        const value = expression.value;
        if (!constants.has(value)) constants.set(value, node('input', 0, { constant: true, value, label: `常数 ${value}` }));
        return constants.get(value);
      }
      const first = expression.children[0];
      if (expression.gate === 'NOT' && first.gate === 'AND') {
        return nand(build(first.children[0]), build(first.children[1]));
      }
      const a = build(first);
      if (expression.gate === 'NOT') return not(a);
      const b = build(expression.children[1]);
      return expression.gate === 'AND' ? not(nand(a, b)) : nand(not(a), not(b));
    }
    const result = build(tree);
    wire(result, node('output', result.depth + 1, { label: 'Q' }));
    if (nodes.length > 500) throw Error('转换后的门超过工坊每个电路的 500 元件限制');
    return Core.makeDefinition({ nodes, wires }, name);
  }

  function importFunctions(library, ids, existingNames = []) {
    const callable = callableDefinitions(library);
    const used = new Set(existingNames.map(name => name.toUpperCase()));
    const selected = new Set(ids);
    return library.functions.filter(item => selected.has(item.id)).map(item => {
      try {
        return compileFunction(item, callable, uniqueName(item.name, used, 24));
      } catch (error) {
        throw Error(`“${item.name}”无法导入：${error.message}`);
      }
    });
  }

  return { circuitOutputs, exportFunctions, importFunctions, parseLibrary: Library.parseLibrary, serializeLibrary: Library.serializeLibrary };
});
