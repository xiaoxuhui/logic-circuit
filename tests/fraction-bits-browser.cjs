const assert=require('node:assert/strict'),path=require('node:path');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';const server=require('../scripts/serve.cjs');
(async()=>{
  if(!server.listening)await new Promise(r=>server.once('listening',r));
  const browser=await pw.chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    const source={version:1,definitions:{g:{name:'空门',inputs:[],outputs:[],nodes:[],wires:[]}},nodes:[{id:'i',type:'input',bits:8,value:3,x:0,y:0},{id:'o',type:'output',bits:8,x:400,y:0},{id:'g',type:'custom',def:'g',x:0,y:200}],wires:[{id:'w',a:{node:'i',dir:'out',port:0},b:{node:'o',dir:'in',port:0}}]};
    await page.locator('#file-input').setInputFiles({name:'fraction.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
    await page.waitForFunction(()=>LogicApp.getState().nodes[0].id==='i');
    const labels=()=>page.locator('#node-layer .decimal-summary').allTextContents(),control=page.locator('#fraction-bits');
    async function fraction(value){await control.fill(String(value));await control.press('Tab');}
    assert.equal(await control.inputValue(),'0');assert.deepEqual(await labels(),['3','3']);
    await fraction(2);assert.deepEqual(await labels(),['0.75','0.75']);
    await page.locator('#undo').click();assert.deepEqual(await labels(),['3','3']);
    await page.locator('#redo').click();assert.deepEqual(await labels(),['0.75','0.75']);
    await page.locator('#expand').click();assert.deepEqual(await labels(),['0.75','0.75']);
    await fraction(3);assert.deepEqual(await labels(),['0.375','0.375']);
    await page.locator('#back-to-circuit').click();assert.deepEqual(await labels(),['0.375','0.375']);
    await page.locator('[data-custom="g"]').click({button:'right'});
    assert.equal(await control.inputValue(),'3');await fraction(2);
    await page.locator('#back-to-circuit').click();assert.deepEqual(await labels(),['0.75','0.75']);
    await fraction(-1);assert.equal(await control.inputValue(),'2');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('logic-workshop-v1')||'{}').fractionBits===2);
    await page.reload();assert.equal(await control.inputValue(),'2');assert.deepEqual(await labels(),['0.75','0.75']);
    const wire=page.locator('[data-wire="w"] .wire-hit');
    const p=await wire.evaluate(el=>{const p=el.getPointAtLength(el.getTotalLength()/2),m=el.getScreenCTM();return {x:p.x*m.a+p.y*m.c+m.e,y:p.x*m.b+p.y*m.d+m.f};});
    await page.mouse.click(p.x,p.y);assert.equal(await page.locator('#wire-force-value').inputValue(),'0.75');
    await page.locator('#wire-force-value').fill('0.5');await page.locator('#wire-force-form button').click();
    assert.deepEqual(await labels(),['0.75','0.5']);
    await page.locator('#next-step').click();assert.deepEqual(await labels(),['0.75','0.75']);
    await page.locator('#number-format').selectOption('hex');assert.deepEqual(await labels(),['0x00.C','0x00.C']);
    await fraction(0);assert.deepEqual(await labels(),['0x03','0x03']);
    const result=await page.evaluate(()=>LogicApp.getState());assert.deepEqual(result.nodes,source.nodes);assert.deepEqual(result.wires,source.wires);
    assert.deepEqual(errors,[]);console.log('PASS browser: fractional IO, undo/redo, expansion, definition editing, validation, save/reload, temporary input, hex and integer reset');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
