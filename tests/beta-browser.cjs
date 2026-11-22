const assert=require('node:assert/strict'),path=require('node:path');
let playwright;
try{playwright=require('playwright');}
catch{playwright=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
process.env.PORT='0';
const server=require('../scripts/serve.cjs');
(async()=>{
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
  const browser=await playwright.chromium.launch();
  try{
    const page=await browser.newPage({viewport:{width:1440,height:960},acceptDownloads:true}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    const original=await page.evaluate(()=>window.LogicApp.getState());
    await page.locator('#default-saves').click();
    await page.locator('#default-save-select').selectOption('beta');
    const downloading=page.waitForEvent('download');
    await page.locator('#default-save-form button[type=submit]').click();
    const backup=await downloading,stream=await backup.createReadStream(),chunks=[];
    for await(const chunk of stream)chunks.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)),original);
    await page.waitForFunction(()=>window.LogicApp.getState().nodes.some(node=>node.id==='memory'));
    const read=()=>page.evaluate(()=>{
      const result=window.LogicApp.getSimulation(),size=Number(window.LogicCore.decimal(result.outputs.size));
      return {code:Number(window.LogicCore.decimal(result.outputs.term)).toString(2).padStart(size,'0'),normal:result.outputs.normal[0],invalid:result.outputs.invalid_code[0]};
    });
    assert.equal((await read()).code,'0101001000100010');
    await page.locator('#next-step').click();
    assert.equal((await read()).code,'0100100010');
    await page.locator('#next-step').click();
    assert.deepEqual(await read(),{code:'0010',normal:1,invalid:0});
    await page.locator('#next-step').click();
    assert.deepEqual(await read(),{code:'0010',normal:1,invalid:0});
    await page.locator('#fit').click();
    await page.locator('[data-toggle="load"]').click();
    await page.locator('#next-step').click();
    await page.locator('[data-toggle="load"]').click();
    assert.equal((await read()).code,'0101001000100010');
    await page.waitForFunction(()=>{
      const save=JSON.parse(localStorage.getItem('logic-workshop-v1'));
      return save?.nodes.some(node=>node.id==='memory')&&save.delayState?.['root/memory']===16*2**19+21026;
    });
    await page.reload();
    assert.equal((await read()).code,'0101001000100010');
    await page.locator('#next-step').click();
    assert.equal((await read()).code,'0100100010');
    await page.locator('#next-step').click();
    assert.equal((await read()).code,'0010');
    assert.deepEqual(errors,[]);
    console.log('PASS beta default: automatic backup, two actual delay steps, stable normal form, program load, storage and reload.');
  }finally{
    await browser.close();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
