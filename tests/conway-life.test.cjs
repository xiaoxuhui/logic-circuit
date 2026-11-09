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
