const C=require('../src/core.js');
module.exports=()=>{
 const nodes=[{id:'a',type:'input',bits:4,value:0,x:0,y:0},{id:'k',type:'input',constant:true,bits:4,fractionBits:2,value:5,x:0,y:220},{id:'o',type:'output',bits:4,x:500,y:0},{id:'ko',type:'output',bits:4,fractionBits:2,x:500,y:220}],wire=(id,a,b,port=0)=>({id,a:{node:a,dir:'out',port},b:{node:b,dir:'in',port:0}}),wires=[wire('selected','a','o'),wire('fixed','k','ko')],definition=C.makeDefinition({nodes,wires},'功能');
 return {version:1,definitions:{g:definition},nodes:[{id:'i',type:'input',bits:4,value:3,x:0,y:0},{id:'g',type:'custom',def:'g',x:450,y:0},{id:'out',type:'output',bits:4,x:850,y:0}],wires:[wire('in','i','g'),wire('out','g','out')]};
};
