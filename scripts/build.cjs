const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
const files=require('../game-hub.integration.json').files;
for(const f of files){const target=path.join(dist,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,f),target);}
console.log('Built dist: '+files.join(', '));
