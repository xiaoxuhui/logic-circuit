const C=require('../src/core.js');
module.exports=function xorFixture(){
  const n=(id,type,x=0,y=0,extra={})=>({id,type,x,y,...extra}),w=(id,a,b,port=0)=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir:'in',port}});
  const definitions=JSON.parse(JSON.stringify(require('./fixtures/minecraft-same-and.json').definitions));
  definitions.or=C.makeDefinition({definitions,nodes:[n('a','input'),n('b','input',0,160),n('na','custom',200,0,{def:'not'}),n('nb','custom',200,160,{def:'not'}),n('g','custom',450,0,{def:'nand'}),n('o','output',700)],wires:[w('a','a','na'),w('b','b','nb'),w('na','na','g'),w('nb','nb','g',1),w('q','g','o')]},'OR');
  return {version:1,definitions,nodes:[n('a','input'),n('b','input',0,160),n('na','custom',280,10,{def:'not'}),n('nb','custom',270,170,{def:'not'}),n('ab','custom',550,0,{def:'and'}),n('ba','custom',550,200,{def:'and'}),n('or','custom',750,110,{def:'or'}),n('o','output',970,110)],wires:[w('a','a','na'),w('b','b','nb'),w('a-ab','a','ab'),w('nb-ab','nb','ab',1),w('na-ba','na','ba'),w('b-ba','b','ba',1),w('ab-or','ab','or'),w('ba-or','ba','or',1),w('q','or','o')]};
};
