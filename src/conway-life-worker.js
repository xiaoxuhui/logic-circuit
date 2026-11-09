'use strict';
importScripts('./golly-export.js','./conway-life.js');

const glider = [[11,10],[11,12],[12,12],[12,11],[10,12]];
const ship = [[0,0],[3,0],[4,1],[0,2],[4,2],[1,3],[2,3],[3,3],[4,3]];
let world, source, inputs, outputs, period, settleAt, settleDuration, feedback, openLoop, reading;

function switchCells(rle) {
  const points = [];
  let x = 0, y = 0;
  for (const [, length, token] of rle.matchAll(/(\d*)([bo$])/g)) {
    const count = Number(length || 1);
    if (token === '$') { x = 0; y += count; }
    else if (token === 'b') x += count;
    else for (let i = 0; i < count; i++) points.push([x++,y]);
  }
  return points;
}

function load() {
  world = null;
  const pattern = LogicGollyExport.buildPattern(source,{loop:true});
  world = new LogicConwayLife.World(pattern.cells);
  inputs = pattern.inputs.map(({label,value,x,y,switchRLE}) => ({label,value,x,y,editable:!!switchRLE,cells:switchRLE ? switchCells(switchRLE) : []}));
  outputs = pattern.outputs.filter(output => !output.delayId);
  period = pattern.period || 0;
  settleAt = settleDuration = pattern.generation;
  feedback = pattern.feedback;
  openLoop = pattern.registers.length>0&&!pattern.loop;
  reading = null;
}

function report(fit = false, notice = '') {
  const generation = world.generation;
  if (period ? generation % period === 0 : generation >= settleAt && generation % 60 === 0) {
    reading = { generation, values:outputs.map(({x,y}) => Number((period ? ship : glider).every(([dx,dy]) => world.get(x+dx,y+dy)))) };
  }
  postMessage({type:'state',generation,period,openLoop,notice,reading,
    inputs:inputs.map(({label,value,x,y,editable}) => ({label,value,x,y,editable})),
    outputs, bounds:fit ? world.bounds : null});
}

function toggle(index) {
  const input = inputs[index];
  if (!input?.editable) return '';
  // At this phase the eater is intact and the next ship is outside the switch footprint.
  const phase = world.generation % 60;
  if (phase) world.advance(60-phase);
  const {x,y,cells,value} = input;
  for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){
    const expected = !value && cells.some(([a,b]) => a===dx&&b===dy);
    if(world.get(x+dx,y+dy)!==Number(expected))return '开关位置暂时有信号经过，请再推进几代后重试。';
  }
  for(const [dx,dy] of cells)world.set(x+dx,y+dy,value);
  input.value=1-value;
  if(!period) settleAt=world.generation+settleDuration;
  return '';
}

self.onmessage = ({data}) => {
  try {
    switch(data.type) {
      case 'init': source=data.source;load();report(true);break;
      case 'reset': load();report(true);break;
      case 'toggle': report(false,toggle(data.index));break;
      case 'step': {
        const generation=world.generation;
        const steps=data.amount==='sample' ? period ? period-generation%period
          : generation<settleAt ? settleAt-generation : (feedback?settleDuration:60)-generation%60 : data.amount;
        world.advance(Math.min(2**26,steps));
        report();
        break;
      }
      case 'view': {
        const points=world.view(data.bounds);
        postMessage({type:'view',points,block:data.bounds.block},[points.buffer]);
        break;
      }
    }
  }catch(error){postMessage({type:'error',operation:data.type,message:error.message});}
};
