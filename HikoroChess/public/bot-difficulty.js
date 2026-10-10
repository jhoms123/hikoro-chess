/* Shared local-opponent thinking budgets. Higher levels allocate more SEARCH time, not a cosmetic delay. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();
 else root.BotDifficulty=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const levels=Object.freeze([
  {ms:500,label:'Easy · 0.5 second'},
  {ms:1000,label:'Casual · 1 second'},
  {ms:1500,label:'Standard · 1.5 seconds'},
  {ms:2000,label:'Challenging · 2 seconds'},
  {ms:3000,label:'Expert · 3 seconds'},
  {ms:4000,label:'Master · 4 seconds'}
 ]);
 const allowed=new Set(levels.map(x=>x.ms));
 const normalize=ms=>allowed.has(Number(ms))?Number(ms):1000;
 const key=game=>'hikoro-bot-thinking-v1-'+game;
 function get(game){
  try{return normalize(localStorage.getItem(key(game)));}
  catch{return 1000;}
 }
 function set(game,ms){
  const value=normalize(ms);
  try{localStorage.setItem(key(game),String(value));}catch{}
  return value;
 }
 function attach(game,host,onChange){
  const parent=typeof host==='string'?document.getElementById(host):host;
  if(!parent)return null;
  const existing=document.getElementById('bot-difficulty-'+game);
  if(existing)return existing.closest('.bot-difficulty-control');
  if(!document.getElementById('bot-difficulty-styles')){
   const style=document.createElement('style');style.id='bot-difficulty-styles';
   style.textContent='.bot-difficulty-control{display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px 0;margin:6px 0;max-width:100%}.bot-difficulty-control[hidden]{display:none!important}.bot-difficulty-control label{font-weight:700;font-size:12px;letter-spacing:.04em;color:inherit}.bot-difficulty-control select{box-sizing:border-box;max-width:100%;width:100%;min-height:42px;border-radius:8px;border:1px solid #a7977299;background:#26372f;color:#f8f0dc;padding:8px 12px;font-size:14px;cursor:pointer}.bot-difficulty-control small{font-size:11px;line-height:1.35;opacity:.8}';
   (document.head||document.documentElement).append(style);
  }
  const wrapper=document.createElement('div');wrapper.className='bot-difficulty-control';
  wrapper.dataset.game=game;
  const label=document.createElement('label');label.htmlFor='bot-difficulty-'+game;label.textContent='BOT DIFFICULTY · THINKING TIME';
  const select=document.createElement('select');select.id='bot-difficulty-'+game;select.name='bot-difficulty-'+game;
  for(const level of levels){const option=document.createElement('option');option.value=String(level.ms);option.textContent=level.label;select.append(option);}
  select.value=String(get(game));
  const hint=document.createElement('small');hint.textContent='More thinking time gives the bot more search opportunities. Applies on its next move.';
  wrapper.append(label,select,hint);parent.append(wrapper);
  select.addEventListener('change',()=>{const ms=set(game,select.value);select.value=String(ms);if(typeof onChange==='function')onChange(ms);});
  return wrapper;
 }
 function show(game,visible){const el=typeof document!=='undefined'?document.getElementById('bot-difficulty-'+game):null;if(el)el.closest('.bot-difficulty-control').hidden=!visible;}
 return Object.freeze({levels,normalize,get,set,attach,show});
});
