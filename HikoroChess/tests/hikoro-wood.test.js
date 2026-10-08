'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../public');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
test('Hikoro wooden atlas contains both embedded image assets',()=>{
 const css=read('hikoro-wood-assets.css');
 assert.match(css,/--hikoro-wood-sprites:url\("data:image\/webp;base64,/);
 assert.match(css,/--hikoro-wood-board:url\("data:image\/webp;base64,/);
 for(const raw of css.matchAll(/data:image\/webp;base64,([a-zA-Z0-9+/=]+)/g)){
   const buffer=Buffer.from(raw[1],'base64');assert.equal(buffer.subarray(0,4).toString(),'RIFF');
   assert.equal(buffer.subarray(8,12).toString(),'WEBP');
 }
});
test('all nineteen real game types and alternate Squid have wood sprites and face opposite directions',()=>{
 const elements=[];
 const document={createElement(tag){const e={tagName:tag,style:{},dataset:{},setAttribute(k,v){this[k]=v}};elements.push(e);return e}};
 const window={};vm.runInNewContext(read('hikoro-wood.js'),{window,document});
 const W=window.HikoroWood;
 const expected=['lupa','prince','zur','kota','fin','yoli','pilut','sult','pawn','cope','chair','jotu','kor','finor','greatshield','greathorsegeneral','neptune','mermaid','cthulhu'];
 assert.deepEqual(Array.from(W.names.slice(0,19)),expected);
 expected.forEach(name=>{
  assert.equal(W.make(name,'white').dataset.type,name);
  assert.match(W.make(name,'black').className,/faces-south/);
  assert.match(W.make(name,'white').className,/faces-north/);
 });
 assert.equal(W.names.length,20);
});
test('the game and learning table both load the atlas and renderer',()=>{
 for(const html of ['index.html','academy.html']) {
  const source=read(html);
  assert.match(source,/hikoro-wood-assets\.css/);
  assert.match(source,/hikoro-wood\.css/);
  assert.match(source,/hikoro-wood\.js/);
 }
 assert.match(read('script.js'),/renderHand\(topColor,'top'\)/);
 assert.match(read('script.js'),/renderHand\(bottomColor,'bottom'\)/);
 assert.match(read('script.js'),/HikoroWood\.make\(piece\.type,piece\.color\)/);
 assert.match(read('academy-ui.js'),/HikoroWood\.make/);
});
