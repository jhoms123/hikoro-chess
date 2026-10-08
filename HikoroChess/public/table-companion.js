(() => {
 'use strict';let socket,room,status;const titles={hikoro:'Hikoro',shodansho:'Sho Dan Sho',shavari:'Shavari',hikoruka:'Hikorüka',go:'Shield Go',academy:'Academy'};
 function element(tag,text){const n=document.createElement(tag);if(text)n.textContent=text;return n;}
 function mount(){if(document.getElementById('table-companion'))return;const aside=element('aside');aside.id='table-companion';aside.className='table-companion';aside.hidden=true;aside.setAttribute('aria-label','Online table and invitation');const host=document.querySelector('main')||document.body;host.prepend(aside);}
 function draw(){mount();const box=document.getElementById('table-companion');box.hidden=!status;if(!status)return;box.replaceChildren();const heading=element('strong',titles[status.gameType]+' · '+(status.finished?'Match complete':status.started?'At the table':'Waiting for players'));box.append(heading);
 const names=element('p',status.players.map(p=>p.name+' · '+(p.connected?'present':'reconnecting')+(p.rematch?' · rematch ready':'')).join(' / '));names.setAttribute('aria-live','polite');box.append(names);
 const safety=element('small',status.durable?'Your seat and accepted moves are saved. Keep this browser tab to reconnect.':'This server keeps rooms in memory; a restart ends them.');box.append(safety);
 if(!status.started){const label=element('label','Invitation link'),input=element('input');input.readOnly=true;input.value=location.origin+'/?join='+encodeURIComponent(room);label.append(input);box.append(label);const share=element('button','Copy invitation');share.onclick=async()=>{try{await navigator.clipboard.writeText(input.value);share.textContent='Invitation copied';}catch{input.select();share.textContent='Select and copy the link';}};box.append(share);}
 if(status.finished&&status.players.length===status.maxPlayers){let index;try{index=Number(sessionStorage.getItem('hikoro-seat-index-'+room));}catch{}const voted=Boolean(status.players[index]?.rematch),b=element('button',voted?'Cancel rematch request':'Request / accept rematch');b.disabled=!socket?.connected;b.onclick=()=>socket.emit('rematch',{gameId:room,accept:!voted});box.append(b);}
 }
 function attach(next){socket=next;room=new URLSearchParams(location.search).get('gameId')||null;
  next.on('seatAssigned',data=>{room=data.gameId;try{sessionStorage.setItem('hikoro-seat-'+room,data.token);sessionStorage.setItem('hikoro-seat-index-'+room,String(data.playerIndex));sessionStorage.setItem('hikoro-room-return',room);}catch{}});
  next.on('tableStatus',data=>{if(room&&room!==data.gameId)return;room=data.gameId;status=data;try{sessionStorage.setItem('hikoro-room-return',room);sessionStorage.setItem('hikoro-room-type',data.gameType);}catch{}draw();});
  next.on('connect',()=>{if(location.pathname!=='/'||new URLSearchParams(location.search).has('join'))return;let id,type,token;try{id=sessionStorage.getItem('hikoro-room-return');type=sessionStorage.getItem('hikoro-room-type');token=sessionStorage.getItem('hikoro-seat-'+id);}catch{}if(id&&token&&type&&type!=='hikoro'){room=id;next.emit(({go:'joinGoRoom',shavari:'joinShavariRoom',hikoruka:'joinHikorukaRoom',academy:'joinAcademyRoom',shodansho:'joinSdsRoom'})[type],{gameId:id,token});}});
  next.on('errorMsg',text=>{if(String(text).includes('could not be restored')){try{sessionStorage.removeItem('hikoro-room-return');sessionStorage.removeItem('hikoro-room-type');}catch{}status=null;draw();}});
  next.on('disconnect',()=>{if(status){status.players=status.players.map(p=>({...p,connected:false}));draw();}});
  next.on('rematchReady',data=>{try{sessionStorage.setItem('hikoro-active-room',data.gameType==='hikoro'?data.gameId:'');sessionStorage.setItem('hikoro-room-return',data.gameId);}catch{}location.href=data.gameType==='hikoro'?'/':('/'+data.gameType+'.html?gameId='+encodeURIComponent(data.gameId)+(data.gameType==='shodansho'?'&players='+data.maxPlayers:''));});
  for(const type of ['go','shavari','hikoruka','academy'])next.on(type+'State',data=>{if(location.pathname==='/'&&data.gameId===room)location.href='/'+type+'.html?gameId='+encodeURIComponent(room);});
  next.on('sdsSync',data=>{if(location.pathname==='/'&&room)location.href='/shodansho.html?gameId='+encodeURIComponent(room)+'&players='+data.playerCount;});
  const invitation=new URLSearchParams(location.search).get('join');
  if(location.pathname==='/'&&/^game_[a-f0-9]{16}$/.test(invitation||''))next.once('lobbyUpdate',rooms=>{const found=rooms[invitation];if(!found){const n=document.getElementById('site-notice');if(n){n.hidden=false;n.textContent='This invitation has expired or the table has already started.';}return;}const sel=document.getElementById('game-type-select');if(sel){sel.value=found.gameType;sel.dispatchEvent(new Event('change'));}next.emit('joinGame',invitation);history.replaceState(null,'','/');});
  return next;
 }
 window.TableCompanion={attach};document.addEventListener('DOMContentLoaded',mount);
})();
