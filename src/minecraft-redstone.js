(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicRedstone=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Coordinates name occupied block cells; rendering dimensions never define connectivity.
  const GAME_TICK_MS=50,REDSTONE_TICK_GAME_TICKS=2;
  const key=p=>p.x+','+p.y+','+p.z;
  const directions=[{x:1,y:0,z:0},{x:0,y:0,z:1},{x:-1,y:0,z:0},{x:0,y:0,z:-1}];
  const around=[...directions,{x:0,y:1,z:0},{x:0,y:-1,z:0}];
  const add=(p,d)=>({x:p.x+d.x,y:p.y+(d.y||0),z:p.z+d.z});
  const solid=b=>!!b&&['support','lamp'].includes(b.kind);
  const supports=b=>solid(b)||b?.kind==='slab';
  class World {
    constructor(blocks=[]){this.cells=new Map();for(const b of blocks)this.put(b);}
    at(p){return this.cells.get(key(p));}
    put(b){if(!['x','y','z'].every(a=>Number.isInteger(b[a])))throw Error('方块坐标必须为整数');const k=key(b),old=this.cells.get(k);if(old&&old!==b)throw Error('方块重叠：'+k);this.cells.set(k,b);return b;}
    dustNeighbors(p){const result=[];for(const d of directions){const q=add(p,d),level=this.at(q);if(level?.kind==='dust')result.push(level);
      // A top slab is a valid upward receiver but cannot send power back down.
      if(supports(level)&&!solid(this.at(add(p,{x:0,y:1,z:0})))){const up=this.at(add(q,{x:0,y:1,z:0}));if(up?.kind==='dust')result.push(up);}
      if(!solid(level)&&solid(this.at(add(p,{x:0,y:-1,z:0})))){const down=this.at(add(q,{x:0,y:-1,z:0}));if(down?.kind==='dust')result.push(down);}
    }return result;}
    dustDirections(p,neighbors=this.dustNeighbors(p)){
      const connected=new Set(neighbors.map(q=>directions.findIndex(d=>q.x-p.x===d.x&&q.z-p.z===d.z)));
      for(let i=0;i<4;i++){const q=this.at(add(p,directions[i]));if(q&&['repeater','lever','torch'].includes(q.kind))connected.add(i);}
      if(connected.size===1)connected.add(([...connected][0]+2)%4);if(!connected.size)for(let i=0;i<4;i++)connected.add(i);return connected;
    }
    validate(){const errors=[];for(const b of this.cells.values()){
      if(['dust','repeater','lever'].includes(b.kind)&&!supports(this.at(add(b,{x:0,y:-1,z:0}))))errors.push('缺少支撑：'+key(b));
      if(b.kind==='torch'){const p=b.attached||add(b,{x:0,y:-1,z:0});if(!solid(this.at(p))||Math.abs(p.x-b.x)+Math.abs(p.y-b.y)+Math.abs(p.z-b.z)!==1||p.y>b.y)errors.push('火把缺少合法附着方块：'+key(b));}
      if(b.kind==='repeater'&&(!Number.isInteger(b.delay)||b.delay<1||b.delay>4))errors.push('中继器档位无效：'+key(b));
    }return errors;}
  }
  class Simulator {
    constructor(world){this.world=world;this.tick=0;this.pending=new Map();this.changes=new Set();this.active=[...world.cells.values()].filter(b=>!['support','slab'].includes(b.kind));this.devices=this.active.filter(b=>['torch','repeater','lamp'].includes(b.kind));this.dust=this.active.filter(b=>b.kind==='dust');this.links=new Map(this.dust.map(b=>[b,world.dustNeighbors(b)]));this.power=new Map();this.refresh();}
    refresh(){const world=this.world,direct=new Map(),strong=new Map(),weak=new Map(),levels=new Map(),queue=[],set=(map,k,v)=>{if(v>(map.get(k)||0))map.set(k,v);};
      const emit=(b,p,strongBlock=false)=>{const target=world.at(p),k=key(p);set(direct,k,15);if(strongBlock&&solid(target))set(strong,k,15);};
      for(const b of this.active)if(b.on){if(b.kind==='lever'){for(const d of around)emit(b,add(b,d));const p=b.attached||add(b,{x:0,y:-1,z:0});if(solid(world.at(p)))set(strong,key(p),15);}
        else if(b.kind==='torch'){const attached=b.attached||add(b,{x:0,y:-1,z:0});for(const d of around){const p=add(b,d);if(key(p)!==key(attached))emit(b,p,d.y===1);}}
        else if(b.kind==='repeater')emit(b,add(b,directions[b.facing||0]),true);
      }
      const seed=(b,v)=>{if(v>(levels.get(b)||0)){levels.set(b,v);queue.push(b);}};
      for(const b of this.dust){let v=direct.get(key(b))||0;for(const d of around)v=Math.max(v,strong.get(key(add(b,d)))||0);seed(b,v);}
      for(let i=0;i<queue.length;i++){const b=queue[i],v=levels.get(b)-1;if(v>0)for(const q of this.links.get(b))seed(q,v);}
      for(const b of this.dust){const value=levels.get(b)||0;if(b.power!==value){b.power=value;this.changes.add(b);}if(!value)continue;const below=add(b,{x:0,y:-1,z:0});if(solid(world.at(below)))set(weak,key(below),value);
        const connected=world.dustDirections(b,this.links.get(b)||[]);
        for(let i=0;i<4;i++)if(!connected.size||connected.has(i)){const p=add(b,directions[i]);if(solid(world.at(p)))set(weak,key(p),value);}
      }
      const blockPower=p=>Math.max(strong.get(key(p))||0,weak.get(key(p))||0);
      const backPower=(b,d)=>{const p=add(b,d),q=world.at(p);if(!q)return 0;if(q.kind==='dust')return q.power||0;if(solid(q))return blockPower(p);if(q.kind==='lever'||q.kind==='torch')return q.on?15:0;if(q.kind==='repeater'&&q.on&&key(add(q,directions[q.facing||0]))===key(b))return 15;return 0;};
      for(const b of this.devices){let wanted=false,delay=REDSTONE_TICK_GAME_TICKS;
        if(b.kind==='torch')wanted=!blockPower(b.attached||add(b,{x:0,y:-1,z:0}));
        else if(b.kind==='repeater'){const facing=b.facing||0,locked=[(facing+1)%4,(facing+3)%4].some(i=>{const q=world.at(add(b,directions[i]));return q?.kind==='repeater'&&q.on&&key(add(q,directions[q.facing||0]))===key(b);});if(locked){this.pending.delete(b);continue;}wanted=!!backPower(b,directions[(facing+2)%4]);delay=b.delay*REDSTONE_TICK_GAME_TICKS;}
        else {wanted=!!(direct.get(key(b))||blockPower(b)||around.some(d=>blockPower(add(b,d))));delay=wanted?0:2*REDSTONE_TICK_GAME_TICKS;}
        if(wanted===!!b.on){this.pending.delete(b);continue;}if(!delay){b.on=wanted;this.changes.add(b);continue;}const old=this.pending.get(b);if(!old||old.on!==wanted)this.pending.set(b,{at:this.tick+delay,on:wanted});
      }
      this.power=levels;
    }
    resolvePending(){if(!this.pending.size)return false;const events=[...this.pending];this.pending.clear();for(const [b,event] of events){b.on=event.on;this.changes.add(b);}this.refresh();return true;}
    step(){this.tick++;let changed=false;for(const [b,event] of this.pending)if(event.at<=this.tick){this.pending.delete(b);b.on=event.on;this.changes.add(b);changed=true;}if(changed)this.refresh();return this.drain();}
    toggle(p){const b=typeof p==='string'?this.world.cells.get(p):this.world.at(p);if(b?.kind!=='lever')return false;b.on=!b.on;this.changes.add(b);this.refresh();return true;}
    drain(){const changes=[...this.changes];this.changes.clear();return changes;}
  }
  return {World,Simulator,key,directions,add,solid,supports,GAME_TICK_MS,REDSTONE_TICK_GAME_TICKS};
});
