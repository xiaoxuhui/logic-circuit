const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
for(const f of ['index.html','styles.css','src/core.js','src/app.js']){const target=path.join(dist,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,f),target);}
console.log('Built dist: index.html, styles.css, src/core.js, src/app.js');
