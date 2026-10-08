const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=root+'/docs/mobile-redesign';
(async()=>{const {server,io}=require(root+'/HikoroChess/server').createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});fs.mkdirSync(out,{recursive:true});const results=[];
try{for(const viewport of [{width:390,height:844},{width:320,height:740},{width:740,height:390}]){
 for(const game of ['hikoro','shodansho','shavari','hikoruka','go','academy']){
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const tap=async loc=>{await loc.scrollIntoViewIfNeeded();await loc.tap();};
 await page.goto('http://127.0.0.1:'+server.address().port+(game==='hikoro'?'/':'/'+game+'.html'),{waitUntil:'networkidle'});
 if(game==='hikoro'){if(viewport.width===390)await page.screenshot({path:out+'/home.jpg',fullPage:true,type:'jpeg',quality:75});await tap(page.locator('#single-player-btn'));await page.locator('#hikoro-game-wrapper').waitFor({state:'visible'});}
 await page.waitForFunction(()=>document.querySelector('.mobile-board-surface')?.style.getPropertyValue('--mobile-board-width'));
 assert.equal(await page.locator('.mobile-table-tray').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,game+' fit overflow');
 if(game==='academy'){
  await tap(page.locator('.mini-cell.legal').first());assert.match(await page.locator('#move-count').textContent(),/^1 /);
  await tap(page.locator('#flip-button'));assert.equal(await page.locator('.mobile-board-surface .player-strip').count(),0,'player strips must not enlarge with board');
  await page.locator('#lesson-select').selectOption(await page.locator('#lesson-select option').nth(1).getAttribute('value'));if(await page.locator('#confirm-dialog').isVisible())await tap(page.locator('#accept-confirm'));assert.equal(await page.locator('.mobile-selection #lesson-tip').count(),1);
 }
 if(game==='hikoruka'){
  for(const cell of await page.locator('.mini-cell:has(.p1)').all()){await tap(cell);if(await page.locator('.mini-cell.legal').count())break;}
  await tap(page.locator('.mini-cell.legal').first());assert.match(await page.locator('#move-count').textContent(),/^1 /);await tap(page.locator('#flip-button'));
  assert.equal(await page.locator('.mobile-board-surface .player-strip').count(),0);
 }
 if(game==='shavari'){
  const source=page.locator('.mobile-mode [data-mode=top]');await tap(source);assert.equal(await source.getAttribute('aria-pressed'),'true');await tap(page.locator('.mobile-mode [data-mode=all]'));
  for(const node of await page.locator('.intersection:has(.token.p1)').all()){await tap(node);if(await page.locator('.intersection.legal,.intersection.legal-stack').count())break;}
  await tap(page.locator('.intersection.legal,.intersection.legal-stack').first());assert.match(await page.locator('#move-count').textContent(),/^1 /);
 }
 if(game==='go'){
  const at=(x,y)=>page.locator(`.intersection[data-x="${x}"][data-y="${y}"]`);
  for(const [x,y]of [[0,4],[1,4],[8,8],[3,4]])await tap(at(x,y));await tap(at(0,4));await tap(at(2,4));assert.equal(await page.locator('#pass-button').isDisabled(),true);await tap(page.locator('#shield-button'));assert.equal(await at(2,4).locator('.shield').count(),1);
  await page.getByText('Game setup',{exact:true}).click();await page.locator('#board-size').selectOption('13');await tap(page.locator('#accept-confirm'));assert.equal(await page.locator('.intersection').count(),169);await page.waitForFunction(()=>document.querySelector('.mobile-board-viewport').classList.contains('is-detailed'));
 }
 if(game==='shodansho'){
  await page.waitForFunction(()=>!isAnimatingBoard);
  assert.equal(await page.locator('#hands-container .reserve-card:visible').count(),1);
  await tap(page.locator('#hands-container .reserve-card[data-active=true] .reserve-flower').first());
  const pointForDrop=()=>page.evaluate(()=>{const v=board.vertices.get(game.legalMoves[0].dst),r=canvas.getBoundingClientRect(),a=targetRotationAngle,dx=v.x-450,dy=v.y-450;return {x:r.left+(450+dx*Math.cos(a)-dy*Math.sin(a))*r.width/900,y:r.top+(450+dx*Math.sin(a)+dy*Math.cos(a))*r.height/900};});
  let point=await pointForDrop();await page.evaluate(p=>window.scrollBy(0,p.y-innerHeight/2),point);point=await pointForDrop();await page.touchscreen.tap(point.x,point.y);assert.equal(await page.evaluate(()=>game.pieces.size),1,'garden touch drop');
  await tap(page.locator('#cancel-selection-btn'));await tap(page.locator('.mobile-hand-toggle'));assert.equal(await page.locator('#hands-container .reserve-card:visible').count(),2);await tap(page.locator('.mobile-hand-toggle'));
 }
 if(game==='hikoro'){
  let moved=false;for(const sq of await page.locator('.square:has(.piece.white)').all()){await tap(sq);await page.waitForTimeout(80);if(await page.locator('.square:has(.move-plate)').count()){await tap(page.locator('.square:has(.move-plate)').first());moved=true;break;}}
  assert.equal(moved,true,'Hikoro touch move');
  assert.equal(await page.locator('.square').count(),160);
 }
 const tools=page.locator('.mobile-board-tools');
 if(await tools.count()){
  await tap(tools.getByRole('button',{name:'Larger board',exact:true}));assert.equal(await page.locator('.mobile-board-viewport').evaluate(e=>e.scrollWidth>e.clientWidth),true);
  await tap(tools.getByRole('button',{name:'Move view',exact:true}));assert.equal(await page.locator('.mobile-board-viewport').evaluate(e=>e.classList.contains('is-navigating')),true);
  // A real drag cannot dispatch a game click while navigating.
  await page.locator('.mobile-board-viewport').scrollIntoViewIfNeeded();const box=await page.locator('.mobile-board-viewport').boundingBox(),cdp=await context.newCDPSession(page);const x=box.x+box.width*.7,y=Math.max(10,box.y)+Math.min(80,box.height/3);
  await page.evaluate(()=>{window.boardClicks=0;document.querySelector('.mobile-board-surface').addEventListener('click',()=>window.boardClicks++);});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-80,y:y-30,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.evaluate(()=>window.boardClicks),0);
  await tap(tools.getByRole('button',{name:'Tap to play',exact:true}));await tap(tools.getByRole('button',{name:'Fit board',exact:true}));
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,game+' post-move overflow');
 await page.evaluate(()=>window.scrollTo(0,0));if(viewport.width===390){await page.screenshot({path:out+'/'+game+'.jpg',type:'jpeg',quality:80});await page.screenshot({path:out+'/'+game+'-full.jpg',type:'jpeg',quality:70,fullPage:true});}
 // Mobile -> desktop -> mobile restores source nodes, including game controls and audio.
 await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(100);assert.equal(await page.locator('.mobile-disclosure').count(),0,game+' disclosure restore');assert.equal(await page.locator('#audio-mute').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,game+' desktop overflow');await page.setViewportSize(viewport);await page.waitForTimeout(100);
 assert.equal(await page.locator('#audio-mute').count(),1);if(game!=='hikoro')assert.equal(await page.locator('#rules-button,.header-rules').count(),1);
 const rules=page.locator(game==='hikoro'?'#rules-btn-ingame':game==='shodansho'?'.header-rules':'#rules-button');await tap(rules);assert.equal(await page.locator('dialog[open],#rules-modal').filter({visible:true}).count(),1);
 assert.deepEqual(errors,[],game+' console errors');results.push({game,...viewport,passed:true});console.log('PASS',game,viewport.width,viewport.height);await context.close();
 }
}fs.writeFileSync(out+'/validation.json',JSON.stringify(results,null,2));}finally{await browser.close();await new Promise(r=>io.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
