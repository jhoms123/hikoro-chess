const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const BotDifficulty=require('../public/bot-difficulty');
const Hikoruka=require('../public/hikoruka-engine');
const HikorukaBot=require('../public/hikoruka-bot');
const root=path.join(__dirname,'..');
const read=filepath=>fs.readFileSync(path.join(root,filepath),'utf8');

test('Difficulty offers six increasing actual thinking budgets from half to four seconds',()=>{
 assert.deepEqual(BotDifficulty.levels.map(level=>level.ms),[500,1000,1500,2000,3000,4000]);
 assert.equal(BotDifficulty.normalize(4000),4000);
 assert.equal(BotDifficulty.normalize(750),1000);
 assert.equal(BotDifficulty.normalize(-999),1000);
});
test('All six game pages load the shared difficulty selector',()=>{
 for(const file of ['index.html','hikoruka.html','academy.html','shavari.html','shodansho.html','go.html']){
  assert.match(read('public/'+file),/bot-difficulty\.js\?v=20261010-six-game/,file);
 }
});
test('Every game passes selected duration to the real bot search',()=>{
 const academy=read('public/academy-ui.js');
 const shavari=read('public/shavari-ui.js');
 const hikoruka=read('public/hikoruka-ui.js');
 const go=read('public/go-ui.js');
 const sds=read('public/shodansho.html');
 const hikoro=read('public/script.js');
 const server=read('server.js');
 assert.match(academy,/budgetMs:window\.BotDifficulty\.get\('academy'\)/);
 assert.match(shavari,/ms: window\.BotDifficulty\.get\('shavari'\)/);
 assert.match(hikoruka,/timeMs:window\.BotDifficulty\.get\('hikoruka'\)/);
 assert.match(go,/timeMs:window\.BotDifficulty\.get\('go'\)/);
 assert.match(sds,/budget:window\.BotDifficulty\.get\('shodansho'\)/);
 assert.match(hikoro,/hikoroBotBudgetMs:window\.BotDifficulty\.get\('hikoro'\)/);
 assert.match(server,/calculateHikoroBotMove\(snapshot,botBudget\(snapshot\.hikoroBotBudgetMs\)\)/);
});
test('Hikoruka has real budgeted iterative alpha-beta and legal move fallback',()=>{
 const s=Hikoruka.initial();
 const start=Date.now();
 const a=HikorukaBot.chooseMove(s,{timeMs:80,maxDepth:4});
 assert.ok(a);
 assert.ok(Hikoruka.allMoves(s).some(m=>JSON.stringify(m)===JSON.stringify(a)));
 assert.ok(Date.now()-start<2500);
});
test('Long Hikoro thinking runs in a dedicated Node worker, not Socket.IO main thread',()=>{
 assert.match(read('server.js'),/new Worker\(path\.join\(__dirname,'hikoro-bot-worker\.js'\)/);
 assert.match(read('hikoro-bot-worker.js'),/Bot\.chooseMove\(workerData\.game,\{budgetMs,width\}\)/);
});
test('Sho Dan Sho bot difficulty control is visible only in local bot matches',()=>{
 const html=read('public/shodansho.html');
 assert.match(html,/id="sds-bot-difficulty-slot"/);
 assert.match(html,/show\('shodansho',!isOnline&&localBotSeatCount>0\)/);
});

test('Difficulty selector is keyboard-selectable, remembers choices, and hides without removing settings',()=>{
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<!doctype html><html><head></head><body><section id="controls"></section></body></html>',{url:'https://hikorochess.org/hikoruka.html',runScripts:'outside-only'});
 dom.window.eval(read('public/bot-difficulty.js'));
 let updates=0;
 const panel=dom.window.BotDifficulty.attach('hikoruka','controls',()=>{updates++;});
 const select=panel.querySelector('select');
 assert.equal(select.options.length,6);
 assert.equal(select.value,'1000');
 select.value='4000';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 assert.equal(updates,1);
 assert.equal(dom.window.BotDifficulty.get('hikoruka'),4000);
 assert.equal(dom.window.localStorage.getItem('hikoro-bot-thinking-v1-hikoruka'),'4000');
 dom.window.BotDifficulty.show('hikoruka',false);
 assert.equal(panel.hidden,true);
 dom.window.BotDifficulty.show('hikoruka',true);
 assert.equal(panel.hidden,false);
 assert.equal(dom.window.BotDifficulty.attach('hikoruka','controls'),panel);
 dom.window.close();
});

test('Hikoruka Worker actually receives a 0.5-second search budget and returns legal moves',()=>{
 const vm=require('node:vm');
 let response;
 const scope=vm.createContext({console,Date,Math,Int8Array,Map,Set,setTimeout,clearTimeout});
 scope.self={postMessage:data=>{response=data;}};
 scope.importScripts=(...urls)=>{for(const uri of urls)vm.runInContext(read('public/'+uri.split('?')[0].replace(/^\\//,'')),scope);};
 vm.runInContext(read('public/hikoruka-bot-worker.js'),scope);
 const position=Hikoruka.initial();
 scope.self.onmessage({data:{id:88,state:position,timeMs:500}});
 assert.equal(response.id,88);
 assert.ok(response.action,JSON.stringify(response));
 assert.ok(Hikoruka.allMoves(position).some(move=>JSON.stringify(move)===JSON.stringify(response.action)));
});
