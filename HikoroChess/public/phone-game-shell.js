/* A compact table bar and a single dismissible sheet for secondary controls. */
document.addEventListener('DOMContentLoaded',()=>{
 const body=document.body,media=matchMedia('(max-width:760px)'),theme=body.dataset.audioTheme;
 let bar,drawer,list,openButton,moved=[],resizeObserver,frame=0,observer;
 const playing=()=>theme==='lobby'?body.classList.contains('game-active'):true;
 const visibleTarget=el=>{if(!el)return false;for(let node=el;node&&node!==document.body;node=node.parentElement)if(node.hidden||node.style.display==='none')return false;return true;};
 function action(label,selector){
  const target=document.querySelector(selector);if(!target)return;
  const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label',label);
  button.addEventListener('click',()=>target.click());bar.append(button);
  const sync=()=>{const show=visibleTarget(target);if(button.hidden===show)button.hidden=!show;if(button.disabled!==target.disabled)button.disabled=target.disabled;};
  sync();return sync;
 }
 let syncActions=[];
 function fit(){
  if(!media.matches||!playing())return;
  const viewport=document.querySelector('.mobile-board-viewport');
  if(!viewport||viewport.classList.contains('is-detailed'))return;
  const ratio=theme==='lobby'?0.64:1;
  const width=Math.max(100,Math.floor(Math.min(viewport.clientWidth-4,(viewport.clientHeight-4)*ratio)));
  const surface=viewport.querySelector('.mobile-board-surface');if(!surface)return;
  const size=width+'px';
  if(surface.style.getPropertyValue('--mobile-board-width')!==size)surface.style.setProperty('--mobile-board-width',size);
  if(surface.style.getPropertyValue('--phone-fit-width')!==size)surface.style.setProperty('--phone-fit-width',size);
 }
 function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;fit();for(const sync of syncActions)sync();});}
 function open(){body.classList.add('phone-options-open');openButton.setAttribute('aria-expanded','true');drawer.setAttribute('aria-hidden','false');drawer.querySelector('.phone-options-head button').focus();}
 function close(){body.classList.remove('phone-options-open');openButton?.setAttribute('aria-expanded','false');drawer?.setAttribute('aria-hidden','true');openButton?.focus();}
 function keydown(e){if(e.key==='Escape'&&body.classList.contains('phone-options-open'))close();}
 function relocateTo(el,parent,before=null){if(!el||!parent||el.parentElement===parent)return;const marker=document.createComment('original table position');el.before(marker);parent.insertBefore(el,before);moved.push([el,marker]);}
 function relocate(el){if(!el||el.closest('.phone-options-list'))return;relocateTo(el,list);}
 function setup(){
  if(bar)return;
  body.classList.add('phone-game-shell');
  window.scrollTo(0,0);
  bar=document.createElement('nav');bar.className='phone-table-bar';bar.setAttribute('aria-label','Game actions');
  const name=document.createElement('strong');name.className='phone-game-name';name.textContent=({lobby:'Hikoro',academy:'Academy',hikoruka:'Hikorüka',shavari:'Shavari',shodansho:'Sho Dan Sho',go:'Shield Go'})[theme]||'Game';bar.append(name);
  drawer=document.createElement('section');drawer.id='phone-options';drawer.className='phone-options-drawer';drawer.setAttribute('aria-label','Game options');drawer.setAttribute('aria-hidden','true');
  const head=document.createElement('div');head.className='phone-options-head';const title=document.createElement('span');title.textContent='Game options';const closeButton=document.createElement('button');closeButton.type='button';closeButton.textContent='Close';closeButton.addEventListener('click',close);head.append(title,closeButton);
  list=document.createElement('div');list.className='phone-options-list';drawer.append(head,list);
  syncActions=[];
  syncActions.push(action('Exit','#main-menu-btn')||action('Exit','#lobby-link')||action('Exit','.site-header .collection-link'));
  if(theme==='go'){syncActions.push(action('Pass','#pass-button'));syncActions.push(action('Shield','#shield-button'));}
  if(theme==='shodansho'){syncActions.push(action('Pick up','#pickup-btn'));syncActions.push(action('Cancel','#cancel-selection-btn'));}
  syncActions.push(action('Resign','#resign-button'));
  syncActions=syncActions.filter(Boolean);
  openButton=document.createElement('button');openButton.type='button';openButton.className='phone-options-toggle';openButton.textContent='Options';openButton.setAttribute('aria-controls','phone-options');openButton.setAttribute('aria-expanded','false');openButton.addEventListener('click',()=>body.classList.contains('phone-options-open')?close():open());bar.append(openButton);
  const anchor=theme==='lobby'?document.getElementById('hikoro-game-wrapper'):document.querySelector('main')||document.querySelector('.match-layout');
  anchor?.before(bar);body.append(drawer);
  if(theme==='shodansho'){
   const layout=document.querySelector('.game-layout'),viewport=document.querySelector('.mobile-board-viewport'),statusBox=document.querySelector('.game-sidebar>div'),hands=document.getElementById('hands-container'),boardWrap=document.getElementById('board-wrapper');
   if(!media.matches&&statusBox&&!statusBox.closest('.game-layout'))relocateTo(statusBox,layout,viewport||layout?.firstElementChild);
   if(!media.matches&&hands&&!hands.closest('.game-layout'))relocateTo(hands,layout,viewport?.nextSibling||boardWrap?.nextSibling||null);
   relocate(document.querySelector('.mobile-garden-actions'));relocate(document.querySelector('.game-sidebar'));relocate(document.querySelector('.inventory-sidebar'));
  }else if(theme==='lobby'){
   const history=document.getElementById('move-history-container');
   relocate(document.querySelector('.table-companion'));
   relocate(document.getElementById('hikoro-local-settings'));
   const historyGroup=history?.closest('.mobile-disclosure')||history;relocate(historyGroup);
   relocate(document.getElementById('game-controls'));relocate(document.getElementById('post-game-controls'));relocate(document.getElementById('replay-controls'));
  }else{
   const panel=document.querySelector('.match-panel'),play=document.querySelector('.play-area'),turn=panel?.querySelector('.turn-panel');
   if(turn&&play&&!turn.closest('.play-area'))relocateTo(turn,play,play.firstElementChild);
   relocate(panel);
  }
  const candidates=[...document.querySelectorAll('.mobile-disclosure,.collection-audio')].filter(el=>!el.parentElement?.closest('.mobile-disclosure'));
  for(const el of candidates)relocate(el);
  relocate(document.querySelector('.lesson-dock'));relocate(document.querySelector('.mobile-board-tools'));
  if(theme==='academy'){relocate(document.querySelector('.mobile-lesson-picker'));relocate(document.querySelector('.mobile-selection'));}
  if(theme==='lobby'){relocate(document.getElementById('hikoro-local-settings'));relocate(document.getElementById('mobile-hikoro-actions'));}
  relocate(document.querySelector('.board-tools'));relocate(document.querySelector('.mobile-stack-tools'));relocate(document.querySelector('.captures'));relocate(document.querySelector('.piece-guide'));relocate(document.querySelector('.go-summary'));
  body.style.setProperty('--phone-top',Math.ceil(bar.getBoundingClientRect().bottom)+'px');
  resizeObserver=new ResizeObserver(schedule);
  const viewport=document.querySelector('.mobile-board-viewport');if(viewport)resizeObserver.observe(viewport);
  document.addEventListener('keydown',keydown);schedule();
 }
 function teardown(){
  if(!bar)return;
  close();resizeObserver?.disconnect();resizeObserver=null;document.removeEventListener('keydown',keydown);
  for(const [el,marker] of moved.reverse()){if(marker.isConnected){if(el.isConnected)marker.replaceWith(el);else marker.remove();}}
  moved=[];bar.remove();drawer.remove();bar=drawer=list=openButton=null;
  body.classList.remove('phone-game-shell','phone-options-open');body.style.removeProperty('--phone-top');
 }
 function placeDesktopStatus(){if(media.matches||theme==='lobby'||theme==='shodansho')return;const panel=document.querySelector('.match-panel'),play=document.querySelector('.play-area'),turn=panel?.querySelector('.turn-panel');if(turn&&play&&!turn.closest('.play-area'))relocateTo(turn,play,play.firstElementChild);}
 function refresh(){if(playing()){if(!bar)setup();placeDesktopStatus();}else teardown();}
 media.addEventListener('change',()=>requestAnimationFrame(refresh));
 window.addEventListener('resize',()=>{if(bar)body.style.setProperty('--phone-top',Math.ceil(bar.getBoundingClientRect().bottom)+'px');schedule();});
 observer=new MutationObserver(()=>{if(theme==='lobby'&&!bar&&playing())requestAnimationFrame(refresh);else if(theme==='lobby'&&bar&&!playing())requestAnimationFrame(refresh);else if(bar){if(theme==='lobby')relocate(document.querySelector('.table-companion'));schedule();}});
 observer.observe(body,{subtree:true,attributes:true,attributeFilter:['class','hidden','disabled','style']});
 requestAnimationFrame(refresh);
});
