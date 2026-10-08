(() => {
 'use strict';const KEY='hikoro-notes-v1';let cloud=new Map(),cloudScope=null;
 const scope=()=>window.SiteAccounts?.notesScope?.()||'device';
 const key=()=>KEY+':'+scope();
 function clean(value,count=10000){const notes={title:String(value?.title||'').slice(0,80),bookmarks:[],comments:{}};notes.bookmarks=[...new Set((Array.isArray(value?.bookmarks)?value.bookmarks:[]).filter(n=>Number.isInteger(n)&&n>=0&&n<=count))].slice(0,100);for(const [step,text]of Object.entries(value?.comments||{}))if(/^\d+$/.test(step)&&Number(step)<=count&&Object.keys(notes.comments).length<100)notes.comments[step]=String(text).slice(0,500);if(JSON.stringify(notes).length>28000)throw Error('Journal notes are too large. Keep up to 100 short notes.');return notes;}
 function local(){try{return JSON.parse(localStorage.getItem(key())||'{}');}catch{return {};}}
 function read(id,count){return clean((cloudScope===scope()?cloud.get(id):null)||local()[id],count);}
 async function refresh(){const account=scope(),rows=await SiteAccounts.annotations();if(account!==scope())return;cloudScope=account;cloud=new Map((rows||[]).map(row=>[row.match_id,row.notes]));}
 async function save(id,value,count){const account=scope(),notes=clean(value,count),all=local();all[id]=notes;localStorage.setItem(key(),JSON.stringify(all));const saved=await SiteAccounts.saveNotes(id,notes);if(saved&&account===scope()){cloudScope=account;cloud.set(id,notes);}return saved;}
 window.JournalNotes={clean,read,refresh,save};
})();
