/* Consistent navigation; activate the original controls so game listeners stay intact. */
document.addEventListener('DOMContentLoaded', () => {
 const body=document.body;
 const bar=document.createElement('nav');bar.className='collection-actions';bar.setAttribute('aria-label','Collection navigation');
 const words={en:['Collection','How to play','Options','Move history','Close'],es:['Colección','Cómo jugar','Opciones','Historial de jugadas','Cerrar']};
 const labels=[];bar.setAttribute('translate','no');
 function label(el,index){labels.push([el,index]);return el;}
 const home=label(document.createElement('a'),0);home.href='/';bar.append(home);
 const rules=()=>body.dataset.audioTheme==='lobby'?document.querySelector(body.classList.contains('game-active')?'#rules-btn-ingame':'#rules-btn'):document.querySelector('#rules-button,#rules-toggle,#rules-btn-ingame,.header-rules,#rules-btn');
 const options=()=>document.querySelector('#hikoro-local-settings,.match-panel,.city-sidebar,.game-sidebar,.arena aside,.controls-panel,.control-panel,.collection-practice aside');
 function reveal(el){if(!el)return;for(let n=el;n&&n!==body;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;el.scrollIntoView({block:'start',behavior:'auto'});if(!el.matches('button,a,input,select,summary'))el.tabIndex=-1;el.focus({preventScroll:true});}
 function button(index,fn){const b=label(document.createElement('button'),index);b.type='button';b.addEventListener('click',fn);bar.append(b);return b;}
 const ruleButton=button(1,()=>{const target=rules();if(target){if(target.tagName==='A'){reveal(document.querySelector(target.hash));}else target.click();}});
 const optionButton=button(2,()=>reveal(options()));
 const historyButton=button(3,()=>reveal(document.querySelector('.chronicle,#move-history-container,#move-log,#moveLog,#history-list,.move-history,.history-panel,#history')));
 function sync(){const lobby=body.dataset.audioTheme==='lobby'&&!body.classList.contains('game-active');ruleButton.hidden=!rules();optionButton.hidden=lobby||!options();historyButton.hidden=lobby||!document.querySelector('.chronicle,#move-history-container,#move-log,#moveLog,#history-list,.move-history,.history-panel,#history');}
 const heading=document.querySelector('.site-header,.collection-header,.garden-masthead');
 if(heading)heading.after(bar);else if(document.querySelector('main'))document.querySelector('main').before(bar);else body.prepend(bar);
 function translate(){const w=words[(window.I18n?.language||document.documentElement.lang).startsWith('es')?'es':'en'];for(const [el,i]of labels)el.textContent=w[i];}
 translate();sync();window.addEventListener('language-changed',translate);
 // Lobby controls appear only after a game starts.
 if(body.dataset.audioTheme==='lobby')new MutationObserver(sync).observe(body,{attributes:true,attributeFilter:['class']});
 // Anchored rules can be inside a collapsed mobile panel.
 document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{const target=document.getElementById(a.hash.slice(1));if(target)for(let n=target;n&&n!==body;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;}));
});
