'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),templatePath=path.join(__dirname,'bastion-spectator.template.html'),outputPath=path.join(root,'public','bastion-spectator.html');
let html=fs.readFileSync(templatePath,'utf8');
for(const [marker,file]of [['/*@@BASTION_ENGINE@@*/','bastion-engine.js'],['/*@@BASTION_BOT@@*/','bastion-bot.js']]){
 const source=fs.readFileSync(path.join(root,'public',file),'utf8');
 if(!html.includes(marker))throw new Error(`Missing ${marker} in spectator template.`);
 html=html.replace(marker,source.trim());
}
if(/<script\s+[^>]*src=/i.test(html)||/<link\s+[^>]*rel=["']stylesheet/i.test(html))throw new Error('Spectator output must not depend on external scripts or stylesheets.');
fs.writeFileSync(outputPath,html);
console.log(`Built ${path.relative(root,outputPath)} (${Buffer.byteLength(html)} bytes).`);
