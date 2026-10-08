const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=root+'/docs/mobile-update';
(async()=>{const {server,io}=require(root+'/HikoroChess/server').createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});fs.mkdirSync(out,{recursive:true});
try{for(const viewport of [{width:390,height:844},{width:320,height:740},{width:740,height:390}]){
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,reducedMotion:'reduce'}),page=await context.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const game of ['hikoro','shodansho','shavari','hikoruka','go','academy']){
  await page.goto('http://127.0.0.1:'+server.address().port+(game==='hikoro'?'/':'/'+game+'.html'),{waitUntil:'networkidle'});
  if(game==='hikoro'){await page.locator('#single-player-btn').click();await page.locator('#hikoro-game-wrapper').waitFor({state:'visible'});}
  const tray=page.locator('.mobile-table-tray');await tray.waitFor({state:'visible'});
  await tray.getByRole('button',{name:'Focus board',exact:true}).click();assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('mobile-board-focus')),true);
  await tray.getByRole('button',{name:'Zoom in',exact:true}).click();assert.equal(await tray.getByRole('button',{name:'Fit board',exact:true}).innerText(),'125%');
  assert.equal(await page.locator('.mobile-board-surface').evaluate(e=>getComputedStyle(e).transform.startsWith('matrix(1.25')),true);
  await tray.getByRole('button',{name:'Fit board',exact:true}).click();assert.equal(await tray.getByRole('button',{name:'Fit board',exact:true}).innerText(),'100%');
  if(game==='go'){
   const at=(x,y)=>page.locator(`.intersection[data-x="${x}"][data-y="${y}"]`);
   for(const [x,y]of [[0,4],[1,4],[8,8],[3,4]])await at(x,y).click();
   await at(0,4).click();await at(2,4).click();
   await page.waitForFunction(()=>[...document.querySelectorAll('.mobile-game-actions button')].some(b=>b.textContent==='Pass'&&b.disabled));assert.equal(await tray.getByRole('button',{name:'Pass',exact:true}).isDisabled(),true);
   await tray.getByRole('button',{name:'Shield · finish turn',exact:true}).click();assert.equal(await at(2,4).locator('.shield').count(),1);
   await tray.getByRole('button',{name:'Zoom in',exact:true}).click();await at(3,4).click();assert.equal(await at(3,4).getAttribute('aria-pressed'),'true');
  }
  if(game==='academy'){
   await tray.getByRole('button',{name:'Zoom in',exact:true}).click();const legal=page.locator('.mini-cell.legal').first();await legal.click();assert.match(await page.locator('#move-count').innerText(),/^1 /);
  }
  if(game==='hikoro'&&viewport.width===390){
   // Exercise actual multi-touch pinch and drag; no board click may be synthesized.
   const cdp=await context.newCDPSession(page),box=await page.locator('.mobile-board-viewport').boundingBox();
   const touch=(x,y,id)=>({x,y,id});const cx=box.x+box.width/2,cy=box.y+120;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(cx-35,cy,1),touch(cx+35,cy,2)]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(cx-65,cy,1),touch(cx+65,cy,2)]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.notEqual(await tray.getByRole('button',{name:'Fit board',exact:true}).innerText(),'100%');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(cx,cy,1)]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(cx-50,cy-60,1)]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.equal(await page.locator('.mobile-board-viewport').evaluate(e=>e.scrollTop>0),true);
   await tray.getByRole('button',{name:'Fit board',exact:true}).click();
  }
  if(viewport.width===390)await page.screenshot({path:out+'/'+game+'-focus.jpg',type:'jpeg',quality:65});
  await tray.getByRole('button',{name:'Rules',exact:true}).click();
  const light=page.locator('dialog[open],#rules-modal').filter({visible:true});
  await page.waitForTimeout(50);
  const pale=await page.evaluate(()=>{
   const roots=[...document.querySelectorAll('dialog[open],.modal-content,#rules-content,body[data-audio-theme=academy] .panel,.game-sidebar .bg-game-panel')].filter(e=>e.getClientRects().length);
   const bad=[];for(const root of roots)for(const e of root.querySelectorAll('p,li,small,label,h2,h3,h4')){if(!e.getClientRects().length||e.closest('button,.mode-toggle,.audio-settings'))continue;const rgb=getComputedStyle(e).color.match(/[\d.]+/g)?.slice(0,3).map(Number);if(rgb&&Math.min(...rgb)>170)bad.push({text:e.textContent.slice(0,70),color:getComputedStyle(e).color});}return bad;
  });assert.deepEqual(pale,[],game+' pale text on parchment');
  if(game==='go'&&viewport.width===390)await page.screenshot({path:out+'/go-rules.jpg',type:'jpeg',quality:65});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,game+' overflow');
  assert.deepEqual(errors,[]);console.log('PASS',game,viewport.width,viewport.height,'focus, zoom, controls, contrast');
 }
 await context.close();
}}finally{await browser.close();await new Promise(r=>io.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
