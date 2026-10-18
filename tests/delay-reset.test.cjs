const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
const n=(id,type,extra={})=>({id,type,x:0,y:0,...extra});
function fixture(){
  const defs={one:C.makeDefinition({nodes:[n('d','delay',{bits:256}),n('nand','nand')],wires:[],definitions:{}},'单延迟')};
  defs.wrap=C.makeDefinition({nodes:[n('child','custom',{def:'one'}),n('nand','nand')],wires:[],definitions:defs},'嵌套单延迟');
  defs.two=C.makeDefinition({nodes:[n('a','custom',{def:'one'}),n('b','custom',{def:'one'})],wires:[],definitions:defs},'双延迟');
  return {version:1,definitions:defs,nodes:[n('direct','delay'),n('single','custom',{def:'one'}),n('wrapped','custom',{def:'wrap'}),n('double','custom',{def:'two'}),n('input','input',{value:1})],wires:[],delayState:{'root/direct':1,'root/single/d':'1'.repeat(256),'root/wrapped/child/d':7,'root/double/a/d':3,'root/double/b/d':5}};
}
test('partial reset checks only visible components and skips a multi-delay parent completely',()=>{const s=fixture(),before=C.clone(s);assert.deepEqual(C.resetDelays(s,'partial'),{'root/double/a/d':3,'root/double/b/d':5});assert.deepEqual(s,before);});
test('visible expansion leaves reset only the displayed delays, without changing other instances',()=>{const s=fixture();assert.deepEqual(C.resetDelays(s,'partial',[{id:'d',type:'delay',scope:'root/double/a'}]),{'root/direct':1,'root/single/d':'1'.repeat(256),'root/wrapped/child/d':7,'root/double/b/d':5});});
test('all reset clears every register; default zeros need no expanded-state enumeration',()=>{const s=fixture();assert.deepEqual(C.resetDelays(s,'all'),{});s.delayState={};assert.deepEqual(C.resetDelays(s,'partial'),{});assert.throws(()=>C.resetDelays(s,'other'));});
