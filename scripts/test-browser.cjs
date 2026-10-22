const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),files=['browser.cjs',...fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('-browser.cjs')&&(f!=='large-live-browser.cjs'||process.env.LOGIC_LIVE_FIXTURE)).sort()];
const attempts=Math.max(1,Number(process.env.LOGIC_BROWSER_ATTEMPTS)||1),tailLimit=80;
const summary=lines=>{const file=process.env.GITHUB_STEP_SUMMARY;if(!file)return;try{fs.appendFileSync(file,lines.join('\n')+'\n');}catch(error){console.log('summary skipped: '+error.message);}};
const names=list=>list.length?list.map(f=>'`'+f.file+'`').join(', '):'none';
const run=file=>new Promise(resolve=>{const tail=[];const child=spawn(process.execPath,[path.join(root,'tests',file)],{cwd:root,env:process.env});const take=chunk=>{const text=chunk.toString();process.stdout.write(text);for(const line of text.split('\n')){if(!line.trim())continue;tail.push(line);if(tail.length>tailLimit)tail.shift();}};child.stdout.on('data',take);child.stderr.on('data',take);child.on('error',error=>{tail.push('spawn failed: '+(error&&error.message||error));resolve({status:1,tail});});child.on('close',code=>resolve({status:code||0,tail}));});
(async()=>{
  const flaky=[],failed=[];
  for(const file of files){
    console.log('RUN '+file);let result,used=0;
    while(true){used++;result=await run(file);if(result.status===0||used>=attempts)break;console.log('RETRY '+file+' (attempt '+(used+1)+'/'+attempts+')');}
    if(result.status===0){if(used>1)flaky.push({file,used});continue;}
    failed.push({file,used,tail:result.tail});break;
  }
  if(flaky.length)console.log('FLAKY '+flaky.map(f=>f.file).join(', '));
  if(failed.length){
    const {file,used,tail}=failed[0],evidence=tail.slice(-40);
    console.log('FAIL '+file+' ('+used+' attempt'+(used>1?'s':'')+'), last output:');
    for(const line of evidence)console.log('  '+line);
    console.log('REPRODUCE node tests/'+file);
    summary(['## Browser suites: FAIL','','- failed: `'+file+'` ('+used+' attempt'+(used>1?'s':'')+')','- reproduce: `node tests/'+file+'`','- flaky: '+names(flaky),'','```',...evidence,'```']);
    process.exit(1);
  }
  console.log('PASS '+files.length+' browser suites'+(flaky.length?'; flaky: '+flaky.map(f=>f.file).join(', '):''));
  summary(['## Browser suites: PASS','','- suites: '+files.length,'- flaky: '+names(flaky)]);
})();
