const C=require('../src/core.js');
module.exports=function largeExpansion(){
  const n=(id,type,x=0,y=0,extra={})=>({id,type,x,y,...extra}),w=(id,a,b,port=0)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}}),defs={};
  function chain(type,count,def){const nodes=[n('i','input'),...Array.from({length:count},(_,i)=>n('g'+i,type,240+i*180,0,def?{def}:{})),n('o','output',240+count*180)],wires=[];for(let i=0;i<count;i++){const from=i?'g'+(i-1):'i';wires.push(w('w'+i,from,'g'+i));if(type==='nand')wires.push(w('w'+i+'b',from,'g'+i,1));}wires.push(w('out','g'+(count-1),'o'));return {nodes,wires,definitions:defs};}
  defs.cell=C.makeDefinition(chain('nand',30),'三十个与非门');defs.row=C.makeDefinition(chain('custom',10,'cell'),'三百个与非门');
  return {version:1,...chain('custom',100,'row')};
};
