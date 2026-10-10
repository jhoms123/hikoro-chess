/* Consolidate the existing mobile disclosures into an accessible options sheet. */
document.addEventListener('DOMContentLoaded', () => {
 const media=matchMedia('(max-width:760px)'), body=document.body;
 const theme=body.dataset.audioTheme;
 let drawer, toggle, moved=[];
 const active=()=>theme==='lobby'?body.classList.contains('game-active'):true;
 function refresh(){
  if(!media.matches || !active()){teardown();return;}
  if(drawer)return;
  body.classList.add('phone-game-shell');
  drawer=document.createElement('section');drawer.className='phone-options-drawer';drawer.id='phone-options';drawer.setAttribute('aria-label','Game options');
  toggle=document.createElement('button');toggle.type='button';toggle.className='phone-options-toggle';toggle.textContent='Options';toggle.setAttribute('aria-controls','phone-options');toggle.setAttribute('aria-expanded','false');
  toggle.addEventListener('click',()=>{const open=body.classList.toggle('phone-options-open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'Close options':'Options';});
  document.addEventListener('keydown',onEscape);
  body.append(drawer,toggle);
  const candidates=[...document.querySelectorAll('.mobile-disclosure,.collection-audio')].filter(el=>!el.closest('.phone-options-drawer'));
  if(theme==='shodansho'){const sidebar=document.querySelector('.game-sidebar');if(sidebar)candidates.push(sidebar);}
  if(theme==='lobby'){const settings=document.getElementById('hikoro-local-settings');if(settings)candidates.push(settings);}
  for(const el of candidates){const marker=document.createComment('phone options position');el.before(marker);drawer.append(el);moved.push([el,marker]);}
  const header=document.querySelector('.site-header,.collection-header,.garden-masthead');body.style.setProperty('--phone-top',(header?.getBoundingClientRect().height||0)+'px');
 }
 function onEscape(e){if(e.key==='Escape'&&body.classList.contains('phone-options-open')){body.classList.remove('phone-options-open');toggle?.setAttribute('aria-expanded','false');toggle.textContent='Options';toggle.focus();}}
 function teardown(){
  if(!drawer)return;
  for(const [el,marker] of moved){if(marker.isConnected)marker.replaceWith(el);}
  moved=[];drawer.remove();toggle.remove();drawer=toggle=null;
  body.classList.remove('phone-game-shell','phone-options-open');body.style.removeProperty('--phone-top');
  document.removeEventListener('keydown',onEscape);
 }
 media.addEventListener('change',()=>requestAnimationFrame(refresh));
 if(theme==='lobby'){new MutationObserver(()=>requestAnimationFrame(refresh)).observe(body,{attributes:true,attributeFilter:['class']});}
 requestAnimationFrame(refresh);
});
