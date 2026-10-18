const C=require('../../src/core.js');
const n=(id,type,x=0,y=0,extra={})=>({id,type,x,y,...extra}),w=(id,a,b,p=0)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port:p}});
function large(){const g=C.makeDefinition({nodes:[n('i','input'),n('d','delay',240),n('o','output',480),...Array.from({length:30},(_,i)=>n('n'+i,'nand',i*200,200))],wires:[w('a','i','d'),w('b','d','o')],definitions:{}},'单元');const h=C.makeDefinition({nodes:Array.from({length:100},(_,i)=>n('g'+i,'custom',i*200,0,{def:'g'})),wires:[],definitions:{g}},'三千门');return {version:1,definitions:{g,h},nodes:[n('big','custom',0,0,{def:'h'}),n('i','input',0,200,{value:0}),n('o','output',240,200)],wires:[w('x','i','o')]};}
module.exports={large,n,w};
