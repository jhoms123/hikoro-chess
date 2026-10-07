(() => {
    'use strict';
    const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),gameId=params.get('gameId'),online=Boolean(gameId);
    const names={1:'Coral',2:'Deepwater'},storageKey='hikoruka-local-v1';
    let state=Hikoruka.initial(),journal=[],cursor=0,selected=null,flipped=false,mode=params.get('mode')==='bot'?'bot':'local';
    let socket,mySeat=null,connected=false,synced=false,pending=false,closed=false,timer=null,revision=0,confirmation=null;
    const cells=[];
    const sprite=(type,owner)=>`sprites/${Hikoruka.TYPES[type].sprite}_${owner===1?'white':'black'}.png`;
    function notice(message){$('notice').hidden=!message;$('notice').textContent=message;}
    function persist(){if(online)return;try{localStorage.setItem(storageKey,JSON.stringify({version:1,journal,cursor,mode,flipped}));}catch{notice('Automatic saving is unavailable. Save a record to keep this match.');}}
    if(!online){try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.version===1&&Number.isInteger(saved.cursor)&&['local','bot'].includes(saved.mode)&&Hikoruka.replay(saved.journal)&&Hikoruka.replay(saved.journal,saved.cursor)){journal=saved.journal;cursor=saved.cursor;state=Hikoruka.replay(journal,cursor);mode=saved.mode;flipped=Boolean(saved.flipped);if(cursor)notice('Your local match has been restored.');}}catch{notice('A new table is ready. The previous save could not be restored.');}}
    function cancelBot(){revision++;if(timer!==null)clearTimeout(timer);timer=null;}
    function humanTurn(){return !state.result&&!closed&&(online?connected&&synced&&!pending&&mySeat===state.player:mode==='local'||state.player===1);}
    function commit(action){const next=Hikoruka.apply(state,action);if(!next)return false;journal=journal.slice(0,cursor);journal.push({from:{...action.from},to:{...action.to}});cursor++;state=next;selected=null;persist();render();return true;}
    function scheduleBot(){cancelBot();if(online||mode!=='bot'||state.player!==2||state.result||$('confirm-dialog').open||$('rules-dialog').open)return;const expected=revision;timer=setTimeout(()=>{timer=null;if(revision!==expected||mode!=='bot'||state.player!==2||state.result)return;const action=Hikoruka.botMove(state);if(action)commit(action);},300);}
    function choose(to){if(!humanTurn())return;notice('');if(selected&&Hikoruka.legalMoves(state,selected).some(m=>m.r===to.r&&m.c===to.c)){const action={from:{...selected},to};if(online){pending=true;socket.emit('hikorukaAction',{gameId,action});render();}else if(commit(action))scheduleBot();return;}selected=selected?.r===to.r&&selected?.c===to.c?null:state.board[to.r][to.c]?.owner===state.player?to:null;render();}
    for(let r=0;r<5;r++)for(let c=0;c<5;c++){
        const cell=document.createElement('button');cell.type='button';cell.className='mini-cell';cell.dataset.r=r;cell.dataset.c=c;cell.tabIndex=-1;
        cell.addEventListener('click',()=>choose({r,c}));cell.addEventListener('keydown',e=>{
            const directions={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};
            if(directions[e.key]){e.preventDefault();const [dr,dc]=directions[e.key],sign=flipped?-1:1,nr=Math.max(0,Math.min(4,r+dr*sign)),nc=Math.max(0,Math.min(4,c+dc*sign));cells.forEach(b=>b.tabIndex=-1);cells[nr*5+nc].tabIndex=0;cells[nr*5+nc].focus();}
            else if(e.key==='Escape'){selected=null;render();}
        });cells.push(cell);$('board').appendChild(cell);
    }
    function render(){
        const legal=selected&&humanTurn()?Hikoruka.legalMoves(state,selected):[];
        for(const cell of cells){const r=Number(cell.dataset.r),c=Number(cell.dataset.c),piece=state.board[r][c],valid=legal.some(m=>m.r===r&&m.c===c),isSelected=selected?.r===r&&selected?.c===c;
            cell.style.order=(flipped?4-r:r)*5+(flipped?4-c:c);cell.className='mini-cell'+((r+c)%2?' dark':'')+(isSelected?' selected':'')+(valid?' legal'+(piece?' capture':''):'');
            if([state.lastMove?.from,state.lastMove?.to].some(p=>p?.r===r&&p?.c===c))cell.classList.add('last');
            cell.setAttribute('aria-pressed',String(isSelected));cell.setAttribute('aria-label',`${Hikoruka.coord({r,c})}: ${piece?names[piece.owner]+' '+Hikoruka.TYPES[piece.type].name:'empty'}${valid?piece?'; legal capture':'; legal move':''}`);cell.replaceChildren();
            if(piece){const token=document.createElement('span');token.className=`mini-piece p${piece.owner}`;const img=document.createElement('img');img.src=sprite(piece.type,piece.owner);img.alt='';const mark=document.createElement('span');mark.className='piece-owner';token.append(img,mark);cell.append(token);}
            const coordinate=document.createElement('span');coordinate.className='cell-coordinate';coordinate.textContent=Hikoruka.coord({r,c});cell.append(coordinate);
        }
        if(!cells.some(b=>b.tabIndex===0))cells[22].tabIndex=0;
        $('play-mode').textContent=online?'ONLINE TABLE':mode==='bot'?'CORAL VS BOT':'SHARED DEVICE';
        $('turn-status').textContent=state.result?state.result.winner?`${names[state.result.winner]} wins`:'Draw':closed?'Table closed':`${names[state.player]} to move`;
        $('connection-status').textContent=state.result?state.result.reason:online?closed?'Return to the collection to start another match.':!connected?'Reconnecting… Moves are paused.':!synced?'Restoring your seat…':pending?'Confirming your move…':mySeat===state.player?'Your court’s turn.':'Waiting for the other court.':mode==='bot'&&state.player===2?'The bot is considering its reply…':selected?`${legal.length} legal destinations`:'Select a piece to see its moves.';
        const detail=$('selection-detail');detail.replaceChildren();if(selected){const p=state.board[selected.r][selected.c],img=document.createElement('img'),text=document.createElement('div'),title=document.createElement('strong'),desc=document.createElement('small');img.src=sprite(p.type,p.owner);img.alt='';title.textContent=`${Hikoruka.coord(selected)} · ${Hikoruka.TYPES[p.type].name}`;desc.textContent=Hikoruka.TYPES[p.type].description;text.append(title,desc);detail.append(img,text);}else detail.textContent='Choose a piece from the active court.';
        for(const player of [1,2]){
            $(`count-${player}`).textContent=state.board.flat().filter(p=>p?.owner===player).length+' pieces';$(`strip-${player}`).classList.toggle('active',state.player===player&&!state.result);
            $(`court-${player}`).textContent=online?mySeat===player?'Your court':'Opponent’s court':mode==='bot'&&player===2?'Bot opponent':player===1?'Southern army · moves first':'Northern army';
            const list=$(`captures-${player}`);list.replaceChildren();for(const type of state.captured[player]){const img=document.createElement('img');img.src=sprite(type,3-player);img.alt=`Captured ${names[3-player]} ${Hikoruka.TYPES[type].name}`;img.title=img.alt;list.append(img);}if(!state.captured[player].length){const span=document.createElement('span');span.textContent='No captures yet';list.append(span);}
        }
        $('local-settings').hidden=online;$('opponent-select').value=mode;$('undo-button').disabled=online||cursor===0;$('redo-button').disabled=online||cursor===journal.length;
        $('new-button').hidden=online;$('resign-button').hidden=!online||Boolean(state.result)||closed;$('resign-button').disabled=!connected||!synced||pending;
        $('move-count').textContent=state.ply+' plies';const list=$('move-history'),atEnd=list.scrollHeight-list.scrollTop-list.clientHeight<35;list.replaceChildren();
        state.history.slice(-100).forEach((m,i)=>{const li=document.createElement('li'),n=document.createElement('span'),text=document.createElement('span');n.className='ply-no';n.textContent=Math.max(0,state.history.length-100)+i+1+'.';text.textContent=`${names[m.player]} ${m.type} · ${Hikoruka.coord(m.from)} ${m.captured?'×':'→'} ${Hikoruka.coord(m.to)}`;li.append(n,text);list.append(li);});
        if(!state.history.length){const li=document.createElement('li');li.className='empty-history';li.textContent='The first move is yours.';list.append(li);}if(atEnd)list.scrollTop=list.scrollHeight;
        const frame=document.querySelector('.mini-board-frame');frame.before($(`strip-${flipped?1:2}`));frame.after($(`strip-${flipped?2:1}`));
    }
    function start(nextMode=mode){cancelBot();mode=nextMode;state=Hikoruka.initial();journal=[];cursor=0;selected=null;notice('');persist();render();}
    function confirm(title,message,label,action){cancelBot();confirmation=action;$('confirm-title').textContent=title;$('confirm-message').textContent=message;$('accept-confirm').textContent=label;$('confirm-dialog').showModal();$('cancel-confirm').focus();}
    $('new-button').addEventListener('click',()=>{if(cursor||journal.length)confirm('Start a new match?','Save a record first if you want to keep this match. Your current position will be replaced.','Start new match',()=>start());else start();});
    $('opponent-select').addEventListener('change',()=>{const next=$('opponent-select').value;$('opponent-select').value=mode;if(next===mode)return;if(cursor||journal.length)confirm('Switch opponent?','Switching modes starts a fresh match. Save a record first if needed.','Switch mode',()=>start(next));else start(next);});
    $('cancel-confirm').addEventListener('click',()=>{$('confirm-dialog').close();confirmation=null;});$('accept-confirm').addEventListener('click',()=>{const action=confirmation;confirmation=null;$('confirm-dialog').close();action?.();});$('confirm-dialog').addEventListener('close',()=>scheduleBot());
    $('undo-button').addEventListener('click',()=>{if(online||!cursor)return;cancelBot();cursor--;if(mode==='bot')while(cursor>0&&cursor%2)cursor--;state=Hikoruka.replay(journal,cursor);selected=null;notice('');persist();render();});
    $('redo-button').addEventListener('click',()=>{if(online||cursor>=journal.length)return;cancelBot();cursor++;state=Hikoruka.replay(journal,cursor);if(mode==='bot'&&state.player===2&&!state.result&&cursor<journal.length)state=Hikoruka.replay(journal,++cursor);selected=null;notice('');persist();render();scheduleBot();});
    $('flip-button').addEventListener('click',()=>{flipped=!flipped;persist();render();});
    $('rules-button').addEventListener('click',()=>{cancelBot();$('rules-dialog').showModal();});$('close-rules').addEventListener('click',()=>$('rules-dialog').close());$('rules-dialog').addEventListener('close',()=>scheduleBot());
    $('resign-button').addEventListener('click',()=>confirm('Resign this match?','The other court will win. The final position and move record remain available.','Resign',()=>{if(connected&&synced)socket.emit('hikorukaResign',{gameId});}));
    $('lobby-link').addEventListener('click',e=>{if(online&&!state.result&&!closed){e.preventDefault();confirm('Leave this table?','Leaving ends the match. Refreshing preserves your seat.','Leave table',()=>{socket.emit('leaveGame',gameId);location.href='/';});}});
    $('save-button').addEventListener('click',()=>{const text=['HIKORÜKA CHESS','5 × 5 · capture the commander',...state.history.map((m,i)=>`${i+1}. ${names[m.player]} ${m.type} ${Hikoruka.coord(m.from)} ${m.captured?'×':'→'} ${Hikoruka.coord(m.to)}`),state.result?`${state.result.winner?names[state.result.winner]+' wins':'Draw'}: ${state.result.reason}`:`${names[state.player]} to move`].join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='hikoruka-match.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Match record downloaded.');});
    for(const [type,info]of Object.entries(Hikoruka.TYPES)){const card=document.createElement('article');card.className='guide-card';const img=document.createElement('img'),h=document.createElement('h3'),p=document.createElement('p'),small=document.createElement('small');img.src=sprite(type,1);img.alt='';h.textContent=info.name;p.textContent=info.description;small.textContent=`${type} · ${['S','I','V'].includes(type)?'two':'one'} per court`;card.append(img,h,p,small);$('guide-cards').append(card);}
    if(online){socket=io();socket.on('connect',()=>{connected=true;synced=false;pending=false;let token;try{token=sessionStorage.getItem('hikoro-seat-'+gameId);}catch{}if(!token){closed=true;notice('No saved seat. Join a Hikorüka table through the collection.');render();return;}socket.emit('joinHikorukaRoom',{gameId,token});render();});socket.on('disconnect',()=>{connected=false;pending=false;selected=null;render();});socket.on('hikorukaState',data=>{if(data.gameId!==gameId)return;state=data.state;mySeat=data.playerIndex+1;synced=true;pending=false;selected=null;notice('');render();});socket.on('errorMsg',message=>{pending=false;if(String(message).includes('could not be restored'))closed=true;notice(String(message));render();});socket.on('roomClosed',message=>{closed=true;pending=false;notice(String(message));render();});}
    render();if(params.get('showRules')==='1')$('rules-dialog').showModal();scheduleBot();
})();
