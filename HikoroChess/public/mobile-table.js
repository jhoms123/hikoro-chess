/* Mobile view controls only: the existing engines still handle every game action. */
document.addEventListener('DOMContentLoaded',()=>{
 const body=document.body,media=matchMedia('(max-width:760px)'),theme=body.dataset.audioTheme;
 const board=document.querySelector('#board-container,.mini-board-frame,.board-shell,#board-wrapper');
 if(!board)return;
 const originalParent=board.parentElement,viewport=document.createElement('div'),space=document.createElement('div'),surface=document.createElement('div');
 viewport.className='mobile-board-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label','Game board viewport. Zoom controls enlarge the board; drag to pan when enlarged.');
 space.className='mobile-board-space';surface.className='mobile-board-surface';
 board.before(viewport);viewport.append(space);space.append(surface);surface.append(board);
 const tray=document.createElement('nav');tray.className='mobile-table-tray';tray.setAttribute('aria-label','Mobile game controls');
 const status=document.createElement('p');status.className='mobile-turn-status';status.setAttribute('aria-live','polite');
 const tools=document.createElement('div');tools.className='mobile-view-tools';
 function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.className='material-control';b.dataset.material='pearl';b.addEventListener('click',action);tools.append(b);return b;}
 let scale=1,baseWidth=0,baseHeight=0,ready=false,frame=0,lastGesture=0,gesture=null,lastActive=null;
 const focus=button('Focus board',()=>{const on=body.classList.toggle('mobile-board-focus');focus.textContent=on?'Full page':'Focus board';focus.setAttribute('aria-pressed',String(on));viewport.scrollIntoView({block:'start'});});focus.setAttribute('aria-pressed','false');
 const minus=button('−',()=>zoom(scale-.25));minus.setAttribute('aria-label','Zoom out');
 const fit=button('100%',()=>zoom(1));fit.setAttribute('aria-label','Fit board');
 const plus=button('+',()=>zoom(scale+.25));plus.setAttribute('aria-label','Zoom in');
 button('Options',()=>{body.classList.remove('mobile-board-focus');focus.textContent='Focus board';focus.setAttribute('aria-pressed','false');document.querySelector('.match-panel,.game-sidebar,#turn-indicator-container')?.scrollIntoView({block:'start'});});
 const actions=document.createElement('div');actions.className='mobile-game-actions';
 const links=[];
 function mirror(source,label,persistent=false){if(!source)return;const b=document.createElement('button');b.type='button';b.className='material-control';b.dataset.material=theme==='go'?'stone':theme==='shavari'?'jade':'parchment';b.textContent=label;b.addEventListener('click',()=>{source.click();sync();});actions.append(b);links.push({source,b,label,persistent});}
 if(theme==='go'){mirror(document.getElementById('shield-button'),'Make shield');mirror(document.getElementById('pass-button'),'Pass');}
 if(theme==='shavari')for(const [mode,label]of [['all','Whole stack'],['top','Top piece'],['pair','Top two']])mirror(document.querySelector(`.mobile-mode [data-mode="${mode}"]`)||document.querySelector(`[data-mode="${mode}"]`),label);
 if(theme==='shodansho'){mirror(document.getElementById('pickup-btn'),'Pick up Sun');mirror(document.getElementById('cancel-selection-btn'),'Cancel');}
 mirror(document.querySelector('#rules-btn-ingame,#rules-button,.header-rules'),'Rules',true);
 tray.append(status,tools,actions);body.append(tray);
 function zoom(value,point){if(!ready)return;const next=Math.max(1,Math.min(3,value)),r=viewport.getBoundingClientRect();const x=point?point.x-r.left:viewport.clientWidth/2,y=point?point.y-r.top:viewport.clientHeight/2;
  const bx=(viewport.scrollLeft+x)/scale,by=(viewport.scrollTop+y)/scale;scale=next;
  surface.style.transform=`scale(${scale})`;space.style.width=baseWidth*scale+'px';space.style.height=baseHeight*scale+'px';
  viewport.scrollLeft=bx*scale-x;viewport.scrollTop=by*scale-y;viewport.classList.toggle('is-zoomed',scale>1);
  fit.textContent=Math.round(scale*100)+'%';minus.disabled=scale<=1;plus.disabled=scale>=3;
 }
 function layout(){if(!media.matches||!board.getClientRects().length){ready=false;viewport.removeAttribute('style');space.removeAttribute('style');surface.removeAttribute('style');viewport.classList.remove('is-zoomed');return;}
  const width=originalParent.clientWidth; if(!width)return;
  baseWidth=theme==='lobby'?Math.min(width,board.offsetWidth||width):width;
  // Account for the play area's padding rather than inflating its board.
  const parentStyle=getComputedStyle(originalParent);if(theme!=='lobby')baseWidth-=parseFloat(parentStyle.paddingLeft)+parseFloat(parentStyle.paddingRight);
  surface.style.width=baseWidth+'px';baseHeight=board.offsetHeight;
  if(!baseHeight)return;ready=true;zoom(scale);
 }
 function sync(){const active=theme!=='lobby'||body.classList.contains('game-active');if(active!==lastActive){lastActive=active;layout();if(!active){body.classList.remove('mobile-board-focus');focus.textContent='Focus board';focus.setAttribute('aria-pressed','false');scale=1;}}const hidden=!media.matches||!active;if(tray.hidden!==hidden)tray.hidden=hidden;const enabled=media.matches&&active;if(body.classList.contains('mobile-table-active')!==enabled)body.classList.toggle('mobile-table-active',enabled);
  const text=document.querySelector('#turn-status,#turn-indicator')?.textContent.trim()||'';if(status.textContent!==text)status.textContent=text;
  for(const {source,b,label,persistent}of links){if(b.disabled!==source.disabled)b.disabled=source.disabled;const pressed=source.getAttribute('aria-pressed');if(pressed!==null&&b.getAttribute('aria-pressed')!==pressed)b.setAttribute('aria-pressed',pressed);
   const visible=persistent||source.getClientRects().length>0&&!source.hidden;if(b.hidden===visible)b.hidden=!visible;
   const next=source.id==='shield-button'&&source.textContent.includes('finish')?'Shield · finish turn':label;if(b.textContent!==next)b.textContent=next;
  }
  if(!ready&&active)layout();
 }
 function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;sync();});}
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','disabled','hidden','aria-pressed','style']});
 media.addEventListener('change',()=>{scale=1;layout();if(!media.matches){body.classList.remove('mobile-board-focus');focus.textContent='Focus board';focus.setAttribute('aria-pressed','false');}sync();});
 window.addEventListener('resize',()=>{layout();schedule();});
 // Touch gestures are consumed only while panning a zoomed board or pinching.
 const distance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
 const midpoint=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
 viewport.addEventListener('touchstart',e=>{if(!media.matches)return;if(e.touches.length===2){gesture={pinch:distance(e.touches),scale};lastGesture=Date.now();e.preventDefault();}else if(scale>1&&e.touches.length===1)gesture={x:e.touches[0].clientX,y:e.touches[0].clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};},{passive:false});
 viewport.addEventListener('touchmove',e=>{if(!gesture)return;if(e.touches.length===2&&gesture.pinch){e.preventDefault();zoom(gesture.scale*distance(e.touches)/gesture.pinch,midpoint(e.touches));lastGesture=Date.now();}else if(e.touches.length===1&&gesture.x!==undefined){const dx=e.touches[0].clientX-gesture.x,dy=e.touches[0].clientY-gesture.y;if(Math.hypot(dx,dy)>6)gesture.moved=true;if(gesture.moved){e.preventDefault();viewport.scrollLeft=gesture.left-dx;viewport.scrollTop=gesture.top-dy;lastGesture=Date.now();}}},{passive:false});
 for(const event of ['click','mousedown','keydown'])viewport.addEventListener(event,()=>sync());
 viewport.addEventListener('touchend',()=>{gesture=null;});viewport.addEventListener('touchcancel',()=>{gesture=null;});
 for(const event of ['click','mousedown'])viewport.addEventListener(event,e=>{if(Date.now()-lastGesture<450){e.preventDefault();e.stopImmediatePropagation();}},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&body.classList.contains('mobile-board-focus')){body.classList.remove('mobile-board-focus');focus.textContent='Focus board';focus.setAttribute('aria-pressed','false');}});
 sync();
});
