const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'../public');
test('every homepage game uses a successfully captured current match preview',()=>{
 const d=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8')),cards=[...d.window.document.querySelectorAll('.game-choice')];
 const captures=JSON.parse(fs.readFileSync(path.join(root,'assets/collection/matches/current-preview-validation.json'),'utf8'));
 assert.equal(cards.length,10);assert.equal(captures.length,10);assert.ok(captures.every(x=>x.ok));
 for(const card of cards){const game=card.dataset.game,image=card.querySelector('img.card-table'),src=image.getAttribute('src').split('?')[0];assert.equal(src,'assets/collection/matches/'+game+'-current.webp');assert.ok(captures.some(x=>x.game===(game==='hikoro'?'index':game)&&x.ok));const bytes=fs.readFileSync(path.join(root,src));assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');}
 assert.match(d.window.document.querySelector('[data-game="fourfold-garden"]').textContent,/Prince Pai Sho/);d.window.close();
});
