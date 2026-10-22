module.exports=()=>{
  const definitions=JSON.parse(JSON.stringify(require('./fixtures/minecraft-same-and.json').definitions));
  const n=(id,type,x,y,def)=>({id,type,x,y,...(def?{def}:{})});
  const w=(id,a,b,port=0)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}});
  return {version:1,definitions,nodes:[n('a','input',0,0),n('b','input',0,108),n('set','custom',276,108,'and'),n('d','delay',600,108),n('o','output',876,96),n('hold','custom',612,288,'and'),n('inv','custom',288,0,'not')],wires:[w('b','b','set',1),w('a','a','set'),w('set','set','d'),w('o','d','o'),w('feedback','d','hold',1),w('hold','hold','d'),w('inv','a','inv'),w('enable','inv','hold')]};
};
