/* Layout adapters preserve the original controls, listeners, artwork and engines. */
document.addEventListener('DOMContentLoaded',()=>{
 const body=document.body,media=matchMedia('(max-width:760px)'),theme=body.dataset.audioTheme;
 const board=document.querySelector('#board-container,.mini-board-frame,.board-shell,#board-wrapper');
 const relocations=[],disclosures=[];
 let mobile=false,detailed=false,navigating=false,goSize=null;
 function move(element,parent,before=null){if(!element||!parent)return;const marker=document.createComment('desktop position');element.before(marker);relocations.push({element,marker});parent.insertBefore(element,before);}
 function fold(element,label){if(!element)return;const box=document.createElement('details'),summary=document.createElement('summary');box.className='mobile-disclosure';summary.textContent=label;element.before(box);box.append(summary,element);disclosures.push(box);return box;}
 function control(label,fn,parent){const b=document.createElement('button');b.type='button';b.className='material-control';b.dataset.material=theme==='go'?'stone':theme==='shavari'?'jade':'parchment';b.textContent=label;b.addEventListener('click',fn);parent.append(b);return b;}
 let viewport,surface,tools,fit,detail,pan,hint,status;
 if(board){
  viewport=document.createElement('div');viewport.className='mobile-board-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label','Game board');surface=document.createElement('div');surface.className='mobile-board-surface';board.before(viewport);viewport.append(surface);surface.append(board);
  if(['lobby','shodansho','go','shavari','academy'].includes(theme)){
   tools=document.createElement('div');tools.className='mobile-board-tools';viewport.after(tools);
   fit=control('Fit board',()=>setView(false,false),tools);detail=control('Larger board',()=>setView(true,false),tools);pan=control('Move view',()=>setView(detailed,!navigating),tools);pan.setAttribute('aria-pressed','false');
   hint=document.createElement('p');hint.className='mobile-board-hint';tools.append(hint);
  }
  // Navigation is an explicit mode. Neither dragging nor tapping in that mode sends a game action.
  for(const type of ['pointerdown','mousedown','click','dblclick','contextmenu'])viewport.addEventListener(type,e=>{if(mobile&&navigating){e.preventDefault();e.stopImmediatePropagation();}},true);
 }
 function layout(){if(!board||!mobile)return;const available=viewport.clientWidth;if(!available)return;const minimum=theme==='lobby'?530:theme==='shodansho'?720:theme==='go'?640:theme==='shavari'?520:440;const width=detailed?Math.max(available*1.5,minimum):available;
  surface.style.setProperty('--mobile-board-width',width+'px');viewport.classList.toggle('is-detailed',detailed);viewport.classList.toggle('is-navigating',navigating);
  if(tools){detail.setAttribute('aria-pressed',String(detailed));fit.setAttribute('aria-pressed',String(!detailed));pan.hidden=!detailed;pan.setAttribute('aria-pressed',String(navigating));pan.textContent=navigating?'Tap to play':'Move view';hint.textContent=detailed?(navigating?'Drag to explore the board. Choose Tap to play before making a move.':'Tap pieces and destinations. Choose Move view to drag the board safely.'):theme==='lobby'?'Tap a piece, then its destination. Enlarge for smaller targets.':theme==='shodansho'?'Choose a flower below, then tap a gate. Enlarge for precise placement.':'';hint.hidden=!hint.textContent;}
 }
 function setView(large,nav){detailed=large;navigating=nav;layout();if(!large&&viewport){viewport.scrollTop=0;viewport.scrollLeft=0;}}
 function adapt(on){if(on===mobile)return;mobile=on;
  if(on){
   const play=document.querySelector('.play-area'),panel=document.querySelector('.match-panel');
   if(play&&panel){
    move(panel.querySelector('.turn-panel'),play,play.firstChild);
    const selection=document.getElementById('selection-detail')?.closest('.panel');if(selection){selection.classList.add('mobile-selection');move(selection,play,document.querySelector('.board-tools'));}
    if(theme==='go'){const actions=selection?.querySelector('.match-actions');if(actions){actions.classList.add('mobile-go-actions');move(actions,play,viewport);}}
    if(theme==='shavari'){const stack=document.querySelector('.mobile-mode');if(stack){stack.classList.add('mobile-stack-tools');move(stack,play,viewport);}}
    if(theme==='academy'){
     const picker=document.createElement('div');picker.className='mobile-lesson-picker';viewport.before(picker);
     move(document.querySelector('label[for=lesson-select]'),picker);move(document.getElementById('lesson-select'),picker);
     move(document.getElementById('lesson-tip'),selection);
    }
    for(const item of [...panel.children]){if(item.matches('.chronicle'))fold(item,'Move history & save');else if(item.matches('#local-settings'))fold(item,'Game setup');else if(item.matches('#lesson-panel'))fold(item,'Lesson guidance');else if(item.matches('.panel'))fold(item,'Score details');else fold(item,'Match options');}
    fold(document.querySelector('.captures'),'Captured pieces');fold(document.querySelector('.piece-guide'),'Piece guide');fold(document.querySelector('.go-summary'),'Strategy & scoring');
   }
   if(theme==='shodansho'){
    const gameLayout=document.querySelector('.game-layout'),statusBox=document.getElementById('turn-indicator')?.closest('.bg-game-panel');if(statusBox){statusBox.classList.add('mobile-garden-status');if(!statusBox.closest('.game-layout'))move(statusBox,gameLayout,gameLayout.firstChild);}
    move(document.getElementById('hands-container'),gameLayout,viewport);
    const actions=document.createElement('div');actions.className='mobile-garden-actions';move(document.getElementById('pickup-btn'),actions);move(document.getElementById('cancel-selection-btn'),actions);move(document.getElementById('main-menu-btn'),actions);gameLayout.insertBefore(actions,viewport);
    const handToggle=control('Other players’ hands',()=>{const on=body.classList.toggle('show-all-hands');handToggle.setAttribute('aria-expanded',String(on));handToggle.textContent=on?'Hide other hands':'Other players’ hands';},document.querySelector('.inventory-sidebar>.bg-game-panel'));handToggle.classList.add('mobile-hand-toggle');handToggle.setAttribute('aria-expanded','false');
    document.getElementById('piece-info-content').textContent='Tap a board piece or choose a flower to see its movement.';
    fold(document.querySelector('.game-sidebar>div'),'Garden options');
   }
   if(theme==='lobby'){
    const shortcuts=document.createElement('div');shortcuts.className='mobile-hikoro-actions';document.getElementById('hikoro-game-wrapper').prepend(shortcuts);move(document.getElementById('rules-btn-ingame'),shortcuts);move(document.getElementById('main-menu-btn'),shortcuts);
    status=document.createElement('p');status.className='mobile-hikoro-status';status.setAttribute('aria-live','polite');document.getElementById('hikoro-game-wrapper').prepend(status);
    move(document.getElementById('hikoro-local-settings'),document.getElementById('hikoro-game-wrapper'),viewport);
    fold(document.getElementById('move-history-container'),'Move history');
   }
   const audio=document.querySelector('.collection-audio');if(audio)move(audio,document.querySelector('main')||body);
   for(const box of disclosures)box.open=false;
   if(theme==='go'){goSize=document.querySelectorAll('.intersection').length;detailed=goSize===169;}layout();
  }else{
   // Restore exact source nodes and their original order; no duplicate game controls.
   for(const {element,marker} of relocations.reverse()){marker.replaceWith(element);}relocations.length=0;
   for(const box of disclosures){const child=box.children[1];if(child)box.replaceWith(child);else box.remove();}disclosures.length=0;
   document.querySelectorAll('.mobile-lesson-picker,.mobile-hand-toggle,.mobile-hikoro-status,.mobile-garden-actions,.mobile-hikoro-actions').forEach(e=>e.remove());body.classList.remove('show-all-hands');status=null;detailed=false;navigating=false;
   surface?.removeAttribute('style');viewport?.classList.remove('is-detailed','is-navigating');
  }
 }
 // Listen to state changes without rebuilding a toolbar or mirroring buttons.
 let pending=false;
 const observer=new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;if(status){const text=document.getElementById('turn-indicator')?.textContent||'';if(status.textContent!==text)status.textContent=text;}if(mobile&&theme==='go'){const size=document.querySelectorAll('.intersection').length;if(size!==goSize){goSize=size;setView(size===169,false);}}if(mobile&&board&&surface.style.getPropertyValue('--mobile-board-width')==='')layout();});});observer.observe(body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});
 media.addEventListener('change',()=>adapt(media.matches));window.addEventListener('resize',layout);if(viewport)new ResizeObserver(layout).observe(viewport);
 document.querySelectorAll('.game-choice').forEach(card=>card.addEventListener('click',()=>{if(media.matches)document.getElementById('game-setup')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});}));
 adapt(media.matches);
});

