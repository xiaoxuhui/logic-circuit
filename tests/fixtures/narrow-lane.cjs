const C=require('../../src/core.js');
module.exports=(gap=20)=>{
  const a={node:'s',dir:'out',port:0},end=(node,port=0)=>({node,dir:'in',port});
  const inner={nodes:[...[0,1,2].map(i=>({id:'i'+i,type:'input',bits:8,x:0,y:i*120})),{id:'o',type:'output',bits:8,x:400,y:0}],wires:[],definitions:{}};
  return {version:1,nodes:[{id:'s',type:'input',bits:8,x:0,y:0},{id:'sp',type:'splitter',bits:8,x:256+gap,y:-72},{id:'t',type:'custom',def:'g',x:1000,y:300}],definitions:{g:C.makeDefinition(inner,'G')},wires:[
    {id:'straight',a,b:end('sp')},
    {id:'up',a,b:{x:100,y:160},via:[{x:244,y:20},{x:244+gap,y:20},{x:244+gap,y:160}]},
    {id:'near',a:{x:900,y:180},b:end('t',1),via:[{x:1000-gap,y:180},{x:1000-gap,y:352}]}
  ]};
};
