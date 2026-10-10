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
