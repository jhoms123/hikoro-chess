const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const {server,io}=require(root+'/HikoroChess/server').createServer();
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
 try{
  for(const size of [9,13])for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:width===390?844:1140},reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/go.html?size='+size,{waitUntil:'networkidle'});
   const at=(x,y)=>page.locator(`.intersection[data-x="${x}"][data-y="${y}"]`);
   const click=(x,y)=>at(x,y).click();
   for(const [x,y]of [[0,4],[1,4],[8,8],[3,4]])await click(x,y);
   await click(0,4);await click(2,4);
   assert.equal(await page.locator('#pass-button').isDisabled(),true);
   assert.equal(await page.locator('#shield-button').isEnabled(),true);
   assert.match(await page.locator('#connection-status').innerText(),/Continue a highlighted jump/);
   // A refresh and Escape must keep the mandatory jumping stone selected.
   await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#shield-button').isEnabled(),true);
   await at(2,4).press('Escape');assert.equal(await page.locator('#shield-button').isEnabled(),true);
   // Stop early, then undo back into the chain and take its final jump.
   await page.locator('#shield-button').click();assert.equal(await at(2,4).locator('.shield').count(),1);
   assert.match(await page.locator('#turn-status').innerText(),/White/);
   await page.locator('#undo-button').click();assert.equal(await page.locator('#pass-button').isDisabled(),true);
   await click(4,4);assert.match(await page.locator('#selection-detail').innerText(),/No further jumps/);
   assert.match(await page.locator('#turn-status').innerText(),/Black/);
   assert.equal(await page.locator('.legal-jump').count(),0);
   const out=root+'/docs/go-shield-update';fs.mkdirSync(out,{recursive:true});
   await page.screenshot({path:out+`/mandatory-shield-${size}-${width}.jpg`,type:'jpeg',quality:85,fullPage:true});
   await page.locator('#shield-button').click();assert.equal(await at(4,4).locator('.shield').count(),1);
   assert.match(await page.locator('#turn-status').innerText(),/White/);
   assert.equal(await page.locator('#pass-button').isEnabled(),true);
   await page.locator('#undo-button').click();await page.locator('#redo-button').click();
   assert.equal(await at(4,4).locator('.shield').count(),1);
   assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   console.log(`PASS ${size}x${size} at ${width}px: early shield, terminal shield, refresh, Escape, undo/redo`);
   await context.close();
  }
 }finally{await browser.close();await new Promise(r=>io.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
