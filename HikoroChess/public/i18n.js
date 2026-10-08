/* Presentation-only localization. Game state, notation and user content stay in their original form. */
(() => {
 'use strict';
 const KEY='hikoro-language-v1',catalog=window.HikoroSpanish||{},records=new WeakMap(),playerNames=new Set();let language='en';
 try{const saved=localStorage.getItem(KEY);language=saved==='es-CU'?'es-CU':'en';}catch{}
 const requested=new URLSearchParams(location.search).get('lang');if(requested==='en'||requested==='es-CU'){language=requested;try{localStorage.setItem(KEY,language);}catch{}}
 const normalize=s=>s.replace(/\s+/g,' ').trim();
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const phrases=new Map(Object.entries(catalog).map(([a,b])=>[normalize(a),normalize(b)]));
 const parts=[...phrases].filter(([a,b])=>a!==b&&a.length>1).sort((a,b)=>b[0].length-a[0].length);
 const fragment=new RegExp('(?<![\\p{L}\\p{N}_])(?:'+parts.map(([a])=>escape(a)).join('|')+')(?![\\p{L}\\p{N}_])','gu');
 const patterns=(window.HikoroSpanishPatterns||[]).map(([a,b])=>({regex:new RegExp('^'+a.split(/(\{(?:\d+|name)\})/).map(p=>/^\{/.test(p)?'(.+?)':escape(p)).join('')+'$'),keys:[...a.matchAll(/\{(\d+|name)\}/g)].map(m=>m[1]),target:b}));
 function spanish(value,depth=0){const s=normalize(value);if(phrases.has(s))return phrases.get(s);if(depth<3)for(const p of patterns){const m=s.match(p.regex);if(m)return p.target.replace(/\{(\d+|name)\}/g,(_,key)=>{const i=p.keys.indexOf(key),v=m[i+1];return key==='name'&&playerNames.has(v)?v:spanish(v,depth+1);});}return s.replace(fragment,k=>phrases.get(k));}
 function t(value){if(typeof value!=='string'||language==='en')return value;const leading=value.match(/^\s*/)[0],trailing=value.match(/\s*$/)[0];return leading+spanish(value)+trailing;}
 function ignored(el){return !el||Boolean(el.closest('script,style,textarea,code,pre,[translate="no"],[data-i18n-ignore],[contenteditable="true"],.player-seat-name'));}
 function applyValue(node,key,value,write){let data=records.get(node);if(!data){data={};records.set(node,data);}let r=data[key];if(!r||value!==r.last)r=data[key]={source:value,last:value};const next=t(r.source);r.last=next;if(value!==next)write(next);}
 function translate(root=document){
  const element=root.nodeType===1?root:root.parentElement;if(root.nodeType===3){if(!ignored(element))applyValue(root,'text',root.nodeValue,v=>root.nodeValue=v);return;}
  if(root.nodeType!==9&&ignored(element))return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode()))if(!ignored(n.parentElement)&&n.nodeValue.trim())applyValue(n,'text',n.nodeValue,v=>n.nodeValue=v);
  const elements=root.nodeType===1?[root,...root.querySelectorAll('*')]:[...root.querySelectorAll('*')];for(const el of elements){if(ignored(el))continue;for(const key of ['aria-label','title','placeholder','alt'])if(el.hasAttribute(key))applyValue(el,key,el.getAttribute(key),v=>el.setAttribute(key,v));}
 }
 function setLanguage(next){language=next==='es-CU'?'es-CU':'en';document.documentElement.lang=language;try{localStorage.setItem(KEY,language);}catch{}if(new URLSearchParams(location.search).has('lang')){const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(history.state,'',url.pathname+url.search+url.hash);}translate();for(const select of document.querySelectorAll('.language-select'))select.value=language;window.dispatchEvent(new CustomEvent('language-changed',{detail:{language}}));}
 function mount(){if(document.querySelector('.language-control'))return;const label=document.createElement('label');label.className='language-control';label.setAttribute('translate','no');const name=document.createElement('span');name.textContent='Language / Idioma';const select=document.createElement('select');select.className='language-select';select.setAttribute('aria-label','Language / Idioma');for(const [value,text]of [['en','English'],['es-CU','Español (Cuba)']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=language;select.onchange=()=>setLanguage(select.value);label.append(name,select);(document.querySelector('.player-appbar')||document.body).append(label);}
 const confirm=window.confirm.bind(window),alert=window.alert.bind(window);window.confirm=value=>confirm(t(value));window.alert=value=>alert(t(value));
 window.I18n={t,setLanguage,translate,registerNames(names){for(const name of names||[])if(typeof name==='string'&&name.trim())playerNames.add(name.trim());},original(node,key){return records.get(node)?.[key]?.source??node.getAttribute(key);},get language(){return language;},get locale(){return language==='es-CU'?'es-CU':'en-US';},date(value,options){return new Intl.DateTimeFormat(language==='es-CU'?'es-CU':'en-US',options).format(new Date(value));}};
 document.documentElement.lang=language;
 window.addEventListener('storage',event=>{if(event.key===KEY)setLanguage(event.newValue);});
 function start(){mount();translate();const observer=new MutationObserver(changes=>{const roots=new Set();for(const c of changes){if(c.type==='characterData')roots.add(c.target);else if(c.type==='attributes')roots.add(c.target);else roots.add(c.target);}for(const n of roots){let parent=n.parentNode,nested=false;while(parent){if(roots.has(parent)){nested=true;break;}parent=parent.parentNode;}if(n.isConnected&&!nested)translate(n);}if(!document.querySelector('.language-control'))mount();else{const bar=document.querySelector('.player-appbar'),label=document.querySelector('.language-control');if(bar&&label.parentElement!==bar)bar.append(label);}});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt']});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
