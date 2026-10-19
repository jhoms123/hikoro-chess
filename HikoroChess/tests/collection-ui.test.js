const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'../public');
test('shared navigation opens the original rules control and reveals collapsed options and records',()=>{
 const d=new JSDOM('<body><header class="site-header"><button id="rules-button">Rules</button></header><main><details><summary>Settings</summary><aside class="match-panel"><select><option>Bot</option></select></aside></details><details><summary>History</summary><section class="chronicle">Move 1</section></details></main></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=d.window;
 w.HTMLElement.prototype.scrollIntoView=function(){};let clicks=0;w.document.querySelector('#rules-button').onclick=()=>clicks++;
 w.eval(fs.readFileSync(path.join(root,'collection-ui.js'),'utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const b=w.document.querySelectorAll('.collection-actions button');b[0].click();assert.equal(clicks,1);b[1].click();assert.equal(w.document.querySelector('.match-panel').closest('details').open,true);assert.equal(w.document.activeElement,w.document.querySelector('.match-panel'));b[2].click();assert.equal(w.document.querySelector('.chronicle').closest('details').open,true);assert.equal(w.document.querySelectorAll('.match-panel select').length,1);
 w.I18n={language:'es-CU'};w.dispatchEvent(new w.Event('language-changed'));assert.equal(b[1].textContent,'Opciones');w.close();
});
test('Fourfold replay engine coexists with Sho Dan Sho global constants',()=>{
 const errors=[],d=new JSDOM('<!doctype html><body></body>',{runScripts:'dangerously'}),w=d.window;w.addEventListener('error',e=>{errors.push(e.message);e.preventDefault();});
 for(const source of ['const CENTER=[450,450];',fs.readFileSync(path.join(root,'fourfold-garden.js'),'utf8')]){const script=w.document.createElement('script');script.textContent=source;w.document.body.append(script);}
 assert.deepEqual(errors,[]);assert.equal(typeof w.FourfoldGardenEngine.initial,'function');assert.ok(w.FourfoldGardenEngine.initial());w.close();
});
