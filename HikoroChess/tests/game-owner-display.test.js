'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..','public');

test('all game pieces show ownership through color or orientation, without numeric owner badges',()=>{
  for(const file of ['shodansho.html','hikoruka-ui.js','go-ui.js','shavari-ui.js','academy-ui.js']){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.doesNotMatch(source,/piece-army-label/,file+' should not render a numeric owner label on pieces');
  }
  const garden=fs.readFileSync(path.join(root,'shodansho.html'),'utf8');
  assert.doesNotMatch(garden,/fillText\(String\(piece\.owner\+1\)/,'Sho Dan Sho should not draw an owner number on pieces');
  assert.doesNotMatch(garden,/Army numbers identify owners/);
  const hikoro=fs.readFileSync(path.join(root,'script.js'),'utf8');
  assert.match(hikoro,/shogi-style orientation to show ownership/);
});

test('local Shield Go as White labels the bot Black and reports the winner by color',async t=>{
  const html=fs.readFileSync(path.join(root,'go.html'),'utf8');
  const ui=fs.readFileSync(path.join(root,'go-ui.js'),'utf8');
  const dom=new JSDOM(html,{url:'https://hikorochess.test/go.html',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window;
  w.GoVariant=require('../public/go-engine');
  w.GoVariantBot={chooseAction:()=>({type:'pass'})};
  w.SiteAudio={transition(){}};
  w.SiteRecords={completed(){},newTable(){},save(){}};
  let submittedNames=null;
  w.SiteAccounts={
    tablePlayers(players,labels){
      submittedNames=Array.isArray(players)?Array.from(players,p=>p.display_name):null;
      labels.forEach((label,i)=>{
        const area=w.document.querySelector('[data-player-seat="'+(i+1)+'"]');
        const details=w.document.createElement('span');
        const name=w.document.createElement('strong');
        const army=w.document.createElement('small');
        name.textContent=Array.isArray(players)?players[i].display_name:i===0?'Signed-in Player':label;
        army.textContent=area.dataset.army;
        details.append(name,army);
        area.replaceChildren(w.document.createElement('img'),details);
      });
    },
    playerName:(seat,fallback)=>seat===1?'Signed-in Player':fallback,
    register(){}
  };
  w.eval(ui);
  const opponent=w.document.querySelector('#local-opponent');
  opponent.value='1';
  opponent.dispatchEvent(new w.Event('change',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,100));
  const seatNames=[...w.document.querySelectorAll('.table-player strong')].map(n=>n.textContent);
  assert.deepEqual(seatNames,['You','Shield Go bot']);
  assert.deepEqual(submittedNames,['Shield Go bot','You']);
  assert.equal(w.document.querySelector('#turn-status').textContent,'You · White to move');
  w.document.querySelector('#pass-button').click();
  assert.equal(w.document.querySelector('#turn-status').textContent,'You win as White');
});
