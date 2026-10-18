const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),files=['browser.cjs',...fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('-browser.cjs')).sort()];
for(const file of files){console.log('RUN '+file);const result=spawnSync(process.execPath,[path.join(root,'tests',file)],{cwd:root,stdio:'inherit',env:process.env});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
console.log('PASS '+files.length+' browser suites');
