// Run once per subsequent release: node bump-version.cjs
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const old=source.match(/const APP_VERSION = '(\d+\.\d+\.\d+)'/)[1];
const parts=old.split('.').map(Number);parts[2]++;
const next=parts.join('.');
for(const file of ['app.js','index.html','sw.js','release.json']){
 const p=__dirname+'/'+file;
 fs.writeFileSync(p,fs.readFileSync(p,'utf8').replaceAll(old,next));
}
console.log('v'+old+' → v'+next);
