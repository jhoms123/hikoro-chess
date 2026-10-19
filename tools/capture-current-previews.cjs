const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),out=root+'/HikoroChess/public/assets/collection/matches';
(async()=>{const {server,io}=require(root+'/HikoroChess/server').createServer();await new Promise(r=>server.listen(3001,'127.0.0.1',r));const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--single-process','--no-zygote','--disable-dev-shm-usage','--disable-gpu','--disable-software-rasterizer']});const context=await b.newContext({viewport:{width:1440,height:1100},hasTouch:true}),p=await context.newPage();await p.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:3001')?r.continue():r.abort());const results=[];
for(const game of (process.env.MATCH_GAMES||'academy,hikoruka,shavari,go,fourfold-garden,valley-hunt,shavari-city-battle,shodansho,shavari-go,index').split(',')){
 try{await p.goto('http://127.0.0.1:3001/'+(game==='index'?'':game+'.html'),{waitUntil:'domcontentloaded'});await p.waitForTimeout(1200);
 if(game==='index'){await p.locator('#single-player-btn').click();await p.locator('#hikoro-game-wrapper').waitFor({state:'visible'});await p.waitForTimeout(300);}
 if(game==='academy'){await p.locator('#learning-mode').selectOption('match');if(await p.locator('#confirm-dialog').isVisible())await p.locator('#accept-confirm').click();}
 if(['academy','hikoruka','shavari'].includes(game)){
  const source=game==='academy'?'.mini-cell':game==='hikoruka'?'.mini-cell:has(.p1)':'.intersection:has(.token.p1)';const dest='.mini-cell.legal,.intersection.legal,.intersection.legal-stack';
  if(!await p.locator(dest).count())for(const e of await p.locator(source).all()){await e.click();if(await p.locator(dest).count())break;}
  await p.locator(dest).first().click();assert.match(await p.locator('#move-count').textContent(),/^1 /);
 }
 if(game==='shavari-go'){
 await p.locator('#play-mode').selectOption('local');await p.locator('#start-match').click();
 const canvas=p.locator('#board');await canvas.press('Enter');for(let i=0;i<4;i++)await canvas.press('ArrowUp');await canvas.press('Enter');for(let i=0;i<4;i++)await canvas.press('ArrowLeft');await canvas.press('Enter');for(let i=0;i<8;i++)await canvas.press('ArrowDown');await canvas.press('Enter');assert.match(await p.locator('#move-count').textContent(),/4/);
 }
 if(game==='go'){for(const [x,y]of [[4,4],[3,4],[4,3],[5,4],[3,3],[5,3],[3,5],[5,5]])await p.locator(`.intersection[data-x="${x}"][data-y="${y}"]`).click();assert.ok(await p.locator('.go-stone').count());}
 if(game==='fourfold-garden'){await p.locator('.reserve-flower[data-piece-type="rose"]').click();for(const e of await p.locator('.point').all()){await e.click();if(await p.locator('.point .token').count())break;}assert.ok(await p.locator('.point .token').count());}
 if(game==='valley-hunt'){await p.locator('#gameMode').selectOption('local');for(const e of await p.locator('.cell:has(.token.moss)').all()){await e.click();if(await p.locator('.cell.legal').count())break;}await p.locator('.cell.legal').first().click();assert.ok(await p.locator('.log-item').count());}
 if(game==='shavari-city-battle'){for(const e of await p.locator('.city-square[aria-label*="Carnelian"]').all()){await e.click();if(await p.locator('.legal-move').count())break;}await p.locator('.legal-move').first().click();assert.match(await p.locator('#move-count').textContent(),/^1 /);}
 if(game==='shodansho'){
 const accepted=await p.evaluate(()=>{let accepted=0;for(let i=0;i<18;i++){const kind=['daisy','clover','star','water','chysalith','sun'][i%6];game.selectHand(kind);if(!game.legalMoves.length)continue;const move=game.legalMoves[(i*11+3)%game.legalMoves.length],before=game.pieces.size;game.clickVertex(move.dst);if(game.pieces.size>before)accepted++;}game.selectedHandKind=null;game.legalMoves=[];updateDOM();return accepted;});assert.ok(accepted>=6);await p.waitForFunction(()=>!isAnimatingBoard);
 }
 if(game==='fourfold-garden'){
 const count=await p.evaluate(()=>{const E=window.FourfoldGardenEngine;let s=E.initial();const types=['rose','chrysanthemum','vine','bamboo'];for(let turn=0;turn<8;turn++){const type=types[Math.floor(turn/2)],indices=Array.from({length:121},(_,i)=>i).sort((a,b)=>Math.abs(a%11-5)+Math.abs(Math.floor(a/11)-5)-Math.abs(b%11-5)-Math.abs(Math.floor(b/11)-5));let placed=false;for(const index of indices){const next=E.apply(s,{kind:'place',type,index});if(next){s=next;placed=true;break;}}if(!placed||s.result)break;if(s.turnStage==='bonus'){const next=E.apply(s,{kind:'finish'});if(!next)break;s=next;}}return s.board.filter(Boolean).length;});assert.ok(count>=6);
 }
 if(game==='index'){let moved=false;for(const e of await p.locator('.square:has(.piece)').all()){await e.click();await p.waitForTimeout(100);if(await p.locator('.square:has(.move-plate)').count()){await p.locator('.square:has(.move-plate)').first().click();moved=true;break;}}assert.ok(moved);}
 if(await p.locator('.phone-options-toggle').count()){await p.locator('.phone-options-toggle').click();assert.equal(await p.locator('#phone-options').getAttribute('aria-hidden'),'false');await p.keyboard.press('Escape');assert.equal(await p.locator('#phone-options').getAttribute('aria-hidden'),'true');}
 await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));await p.waitForTimeout(500);
 const selector=({index:'#board-container',academy:'.mini-board-frame',hikoruka:'.mini-board-frame',shavari:'#board',go:'#board','fourfold-garden':'#board','valley-hunt':'.board-shell','shavari-city-battle':'.city-board-frame',shodansho:'#gameCanvas','shavari-go':'.board-wrap'})[game];
 await p.locator(selector).screenshot({path:out+'/'+(game==='index'?'hikoro':game)+'-current.png'});
 execFileSync(process.env.PYTHON||'python',['-c',"from PIL import Image; import sys; from pathlib import Path; p=Path(sys.argv[1]); Image.open(p).convert('RGB').save(p.with_suffix('.webp'),'WEBP',quality=94,method=6); p.unlink()",out+'/'+(game==='index'?'hikoro':game)+'-current.png']);
 results.push({game,ok:true});console.log(game+' PASS');
 }catch(e){results.push({game,ok:false,error:e.message});console.log(game+' FAIL '+e.message)}
}
fs.writeFileSync(out+'/current-preview-validation.json',JSON.stringify([...new Map([...(fs.existsSync(out+'/current-preview-validation.json')?JSON.parse(fs.readFileSync(out+'/current-preview-validation.json')):[]),...results].map(x=>[x.game,x])).values()],null,2));if(results.some(x=>!x.ok))process.exitCode=1;await b.close();io.close();server.close();})().catch(e=>{console.error(e);process.exit(1)});
