(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LogicPresets=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const list=Object.freeze([
    {id:'nand',name:'与非门',description:'两个输入都为1时，输出为0。'},
    {id:'not',name:'非门',description:'输入取反，用一个与非门搭成。'},
    {id:'and',name:'与门',description:'两个输入都为1时，输出为1。'},
    {id:'or',name:'或门',description:'任意输入为1时，输出为1。'},
    {id:'xor',name:'异或门',description:'两个输入不同时，输出为1。'},
    {id:'adder',name:'一位全加器',description:'A、B和进位相加，输出和与进位。'}
  ].map(Object.freeze));
  function load(id){
    if(!list.some(p=>p.id===id))throw Error('没有这个默认存档');
    const nodes=[],wires=[],node=(id,type,x,y,label)=>{nodes.push({id,type,x,y,...(label?{label}:{})});return id;},connect=(a,b,port=0)=>wires.push({id:'w'+wires.length,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}}),nand=(id,a,b,x,y)=>{node(id,'nand',x,y);connect(a,id);connect(b,id,1);return id;};
    const xor=(prefix,a,b,x,y)=>{const both=nand(prefix+'n',a,b,x,y),u=nand(prefix+'u',a,both,x+220,y-80),v=nand(prefix+'v',b,both,x+220,y+80);return {both,out:nand(prefix+'o',u,v,x+440,y)};};
    node('a','input',0,0,'A');if(id!=='not')node('b','input',0,160,'B');
    let out,x=440;
    if(id==='nand')out=nand('n','a','b',220,80);
    else if(id==='not')out=nand('n','a','a',220,0);
    else if(id==='and'){out=nand('and',nand('n','a','b',220,80),'n',440,80);x=660;}
    else if(id==='or'){out=nand('or',nand('na','a','a',220,0),nand('nb','b','b',220,160),440,80);x=660;}
    else if(id==='xor'){out=xor('xor','a','b',220,80).out;x=880;}
    else{node('cin','input',0,320,'进位 C_in');const ab=xor('ab','a','b',220,80),sum=xor('sum',ab.out,'cin',880,240),carry=nand('carry',ab.both,sum.both,1540,400);node('sumout','output',1760,160,'和 S');node('carryout','output',1760,400,'进位 C_out');connect(sum.out,'sumout');connect(carry,'carryout');}
    if(out){node('o','output',x,80,'输出 Q');connect(out,'o');}
    return {version:1,nodes,wires,definitions:{}};
  }
  return {list,load};
});
