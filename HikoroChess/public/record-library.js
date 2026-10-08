(() => {
 'use strict';const ids=new Map(),last=new Map(),KEY='hikoro-recent-records-v1';
 const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]').filter(r=>r?.format==='hikoro-record'&&Array.isArray(r.actions));}catch{return [];}};
 const id=type=>{if(!ids.has(type))ids.set(type,(()=>{try{return localStorage.getItem('hikoro-record-id-'+type);}catch{return null;}})()||crypto.randomUUID());try{localStorage.setItem('hikoro-record-id-'+type,ids.get(type));}catch{}return ids.get(type);};
 function remember(record){const rows=read().filter(r=>r.id!==record.id);rows.unshift(record);while(rows.length>50||JSON.stringify(rows).length>3000000)rows.pop();try{localStorage.setItem(KEY,JSON.stringify(rows));}catch{throw Error('Device history is full. Download this record to keep it.');}return record;}
 function download(record){const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=record.game+'-'+(record.id||'match')+'.hikoro.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function view(record){sessionStorage.setItem('hikoro-replay-record',JSON.stringify(record));location.href='/replay.html';}
 function completed(type,payload,result,gameId){if(!result)return;const recordId=gameId||payload.recordId||id(type);if(last.get(type)===recordId)return;try{const record=MatchRecord.create(type,payload,result,{id:recordId});remember(record);last.set(type,recordId);if(!gameId)window.SiteAccounts?.archiveRecord(record).catch(()=>{});}catch{ /* An invalid record never replaces an existing one. */ }}
 function save(type,payload){const record=MatchRecord.create(type,payload,payload.result,{id:payload.recordId||payload.gameId||id(type)});remember(record);download(record);if(!payload.gameId)window.SiteAccounts?.archiveRecord(record).catch(()=>{});return record;}
 window.SiteRecords={save,read,remember,download,view,id,newTable:type=>{ids.set(type,crypto.randomUUID());try{localStorage.setItem('hikoro-record-id-'+type,ids.get(type));}catch{}last.delete(type);},completed};
})();
