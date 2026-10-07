/* Shared, opt-out audio. Game adapters call this only for accepted actions. */
(() => {
'use strict';
const ROOT='/assets/audio/',KEY='hikoro-audio-v1';
const themes={lobby:{title:'The Old Tower Inn',move:'ui'},hikoro:{title:'Underwater World',move:'water',capture:'water-capture'},hikoruka:{title:'Exploration',move:'wood',capture:'wood-capture'},academy:{title:'The Bard’s Tale',move:'wood',capture:'wood-capture'},shavari:{title:'Desert Loop',move:'stone',capture:'stone-capture'},shodansho:{title:'Asianoriental1',move:'flower',capture:'flower-capture'},go:{title:'First Light Particles',move:'stone',capture:'stone-capture'}};
let settings={muted:false,music:true,effects:true,musicVolume:.22,effectsVolume:.55},theme=document.body?.dataset.audioTheme||'lobby',unlocked=false,silent=0,music=null,fade=null,panel=null;
const pools=new Map(),active=new Set();
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved){for(const k of ['muted','music','effects'])if(typeof saved[k]==='boolean')settings[k]=saved[k];for(const k of ['musicVolume','effectsVolume'])if(Number.isFinite(saved[k]))settings[k]=Math.max(0,Math.min(1,saved[k]));}}catch{}
function save(){try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}}
function pause(){clearInterval(fade);fade=null;music?.pause();for(const a of active)a.pause();active.clear();}
function refresh(){if(!panel)return;panel.querySelector('summary').textContent=settings.muted?'Sound · muted':unlocked?'Sound · on':'Sound · ready';panel.querySelector('#audio-mute').textContent=settings.muted?'Unmute all':'Mute all';panel.querySelector('#audio-mute').setAttribute('aria-pressed',String(settings.muted));panel.querySelector('#audio-track').textContent=themes[theme].title;}
function musicPlay(){clearInterval(fade);fade=null;if(!unlocked||settings.muted||!settings.music||document.hidden){music?.pause();return;}if(!music||music.dataset.theme!==theme){music?.pause();music=new Audio(ROOT+theme+'.mp3');music.dataset.theme=theme;music.loop=true;music.preload='none';music.volume=0;music.addEventListener('error',()=>{if(panel)panel.querySelector('#audio-status').textContent='Music could not load. Game sounds remain available.';});}const player=music;player.play().then(()=>{if(player!==music||settings.muted||!settings.music||document.hidden){player.pause();return;}let step=0;fade=setInterval(()=>{if(player!==music){clearInterval(fade);return;}player.volume=settings.musicVolume*Math.min(1,++step/12);if(step>=12){clearInterval(fade);fade=null;}},40);}).catch(()=>{if(panel)panel.querySelector('#audio-status').textContent='Tap or press a key to start sound.';});}
function setTheme(next){if(!themes[next])return;const changed=next!==theme;theme=next;refresh();if(changed)musicPlay();}
function action(game,kind='move'){
 if(!themes[game]||silent)return;
 document.dispatchEvent(new CustomEvent('collection-audio-event',{detail:{theme:game,kind}}));
 if(!unlocked||settings.muted||!settings.effects||document.hidden||!settings.effectsVolume)return;
 const name=kind==='win'?'victory':kind==='end'?'finish':kind==='ui'?'ui':kind==='shield'?'shield':kind==='capture'?themes[game].capture||'wood-capture':themes[game].move;
 let pool=pools.get(name);if(!pool){pool=Array.from({length:3},()=>{const a=new Audio(ROOT+name+'.mp3');a.preload='auto';a.addEventListener('ended',()=>active.delete(a));return a;});pools.set(name,pool);}
 const a=pool.find(a=>a.paused)||pool[0];a.pause();a.currentTime=0;a.volume=settings.effectsVolume;active.add(a);a.play().catch(()=>active.delete(a));
}
function transition(game,before,after){
 if(!before||!after||before===after)return;
 const previous=before.result||(before.gameOver?{winner:before.winner}:null),result=after.result||(after.gameOver?{winner:after.winner}:null);
 if(result&&!previous){action(game,result.winner&&result.winner!=='draw'?'win':'end');return;}
 const oldPly=before.ply??before.moveList?.length,newPly=after.ply??after.moveList?.length;
 if(!Number.isInteger(oldPly)||newPly!==oldPly+1)return;
 const record=after.history?.at(-1),count=s=>s.lost?Object.values(s.lost).reduce((a,b)=>a+b,0):s.captured?Object.values(s.captured).reduce((a,b)=>a+(Array.isArray(b)?b.length:0),0):0;
 const last=after.lastMove,target=before.boardState&&last?.to?before.boardState[last.to.y]?.[last.to.x]:null;
 const capture=Boolean(record?.captured?.length||typeof record?.captured==='string'&&record.captured||count(after)>count(before)||target);
 const type=record?.action?.type;
 action(game,capture?'capture':type==='pass'?'ui':type==='shield'?'shield':'move');
}
function silence(fn){silent++;try{return fn();}finally{silent--;}}
function unlock(){unlocked=true;refresh();if(panel)panel.querySelector('#audio-status').textContent='Music pauses when this tab is hidden.';musicPlay();}
function mount(){
 theme=document.body.dataset.audioTheme||theme;
 panel=document.createElement('details');panel.className='collection-audio';panel.innerHTML='<summary>Sound · ready</summary><div class="audio-settings"><button type="button" id="audio-mute" aria-pressed="false">Mute all</button><label><input type="checkbox" id="audio-music" checked> Music</label><label for="audio-music-volume">Music volume <input type="range" id="audio-music-volume" min="0" max="100" value="22"></label><label><input type="checkbox" id="audio-effects" checked> Move & capture sounds</label><label for="audio-effects-volume">Effects volume <input type="range" id="audio-effects-volume" min="0" max="100" value="55"></label><span>Playing: <strong id="audio-track"></strong></span><small id="audio-status" role="status">Sound starts after your first tap or key press.</small><a href="/assets/audio/CREDITS.md" target="_blank" rel="noopener">Music & sound credits</a></div>';
 const header=document.querySelector('.site-header,.collection-header');if(header)header.after(panel);else document.body.prepend(panel);
 for(const [id,k]of [['audio-music','music'],['audio-effects','effects']]){const el=panel.querySelector('#'+id);el.checked=settings[k];el.addEventListener('change',()=>{settings[k]=el.checked;save();if(k==='music')musicPlay();else if(!settings.effects){for(const a of active)a.pause();active.clear();}});}
 for(const [id,k]of [['audio-music-volume','musicVolume'],['audio-effects-volume','effectsVolume']]){const el=panel.querySelector('#'+id);el.value=settings[k]*100;el.addEventListener('input',()=>{settings[k]=Number(el.value)/100;save();if(k==='musicVolume'&&music){clearInterval(fade);music.volume=settings[k];}});}
 panel.querySelector('#audio-mute').addEventListener('click',()=>{settings.muted=!settings.muted;save();if(settings.muted)pause();else musicPlay();refresh();});refresh();
 document.addEventListener('pointerdown',()=>{if(!unlocked)unlock();},{capture:true});document.addEventListener('keydown',e=>{if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&!unlocked)unlock();},{capture:true});
 document.addEventListener('click',e=>{if(e.target.closest('[data-game],#flip-button,#rules-button,#close-rules'))action(theme,'ui');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else musicPlay();});window.addEventListener('pagehide',pause);
}
window.SiteAudio=Object.freeze({setTheme,action,transition,silence});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
