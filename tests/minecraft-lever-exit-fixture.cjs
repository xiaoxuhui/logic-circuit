module.exports=(offsetX=0,offsetY=0)=>{
  const n=(id,type,x,y)=>({id,type,x:x+offsetX,y:y+offsetY});
  const w=(id,a,b,port=0,dir='in')=>({id,a:{node:a,dir:'out',port:0},b:{node:b,dir,port}});
  return {version:1,definitions:{},nodes:[n('b','input',228,60),n('a','input',0,0),n('c','input',0,228),n('inv','nand',408,60),n('nor','nand',612,132),n('o','output',816,132)],wires:[w('merge','a','c',0,'out'),w('b0','b','inv'),w('b1','b','inv',1),w('inv0','inv','nor'),w('inv1','inv','nor',1),w('c0','c','nor'),w('c1','c','nor',1),w('o','nor','o')]};
};
