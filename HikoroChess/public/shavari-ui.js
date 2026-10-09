/* Shavari table controls and rendering. The engine owns all game rules. */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const params = new URLSearchParams(location.search), gameId = params.get('gameId');
    const online = Boolean(gameId), storeKey = 'shavari-local-v4';
    const courts = { 1: 'Carnelian', 2: 'Turquoise' };
    let state = Shavari.initial(), selected = null, mode = 'all', flipped = false, botSeat = null, botThinking = false, botGeneration = 0, botWorker = null, botErrorPly = -1;
    let journal = [], cursor = 0, mySeat = null, connected = false, pending = false, socket;
    let pendingAction = null;
    let confirmation = null, roomClosed = false, hasSynced = false;
    const nodes = [];
    function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
    function persist() {
        if (online) return;
        try { localStorage.setItem(storeKey, JSON.stringify({ version: 4, journal, cursor, flipped, botSeat })); }
        catch { notice('Automatic saving is unavailable. Use Save record to keep this match.'); }
    }
    if (!online) {
        try {
            const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
            if ((saved?.version === 3 || saved?.version === 4) && Number.isInteger(saved.cursor) && Shavari.replay(saved.journal) && Shavari.replay(saved.journal, saved.cursor)) {
                journal = saved.journal; cursor = saved.cursor; state = Shavari.replay(journal, cursor); flipped = Boolean(saved.flipped);
                botSeat = saved.version === 4 && [1,2].includes(saved.botSeat) ? saved.botSeat : null;
                $('local-opponent').value = String(botSeat ?? 'none');
                if (cursor) notice('Your local match has been restored.');
            } else if (saved) notice('This saved match no longer fits the current Shavari rules. A new table is ready.');
        } catch { notice('The saved match could not be restored. A new table is ready.'); }
    }
    function isBotTurn() { return !online && botSeat === state.player; }
    function canPlay() { return !state.result && !roomClosed && !isBotTurn() && (!online || connected && hasSynced && !pending && mySeat === state.player); }
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        const node = document.createElement('button'); node.type = 'button'; node.className = 'intersection';
        node.dataset.x = x; node.dataset.y = y; node.tabIndex = -1;
        node.addEventListener('click', () => choose({x,y}));
        node.addEventListener('keydown', e => {
            const directions = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] };
            if (directions[e.key]) {
                e.preventDefault(); const [dx,dy] = directions[e.key], sign = flipped ? -1 : 1;
                const nx = Math.max(0,Math.min(8,x + dx * sign)), ny = Math.max(0,Math.min(8,y + dy * sign));
                nodes.forEach(b => b.tabIndex = -1); nodes[ny * 9 + nx].tabIndex = 0; nodes[ny * 9 + nx].focus();
            } else if (e.key === 'Escape') { selected = null;  render(); }
        });
        nodes.push(node); $('board-nodes').appendChild(node);
    }
    function execute(action, fromBot = false) {
        const botMoveAllowed = fromBot && !online && isBotTurn() && !state.result && !roomClosed;
        if ((!fromBot && !canPlay()) || (fromBot && !botMoveAllowed) || !action?.from || !action?.to || !Shavari.legalMoves(state,action.from,action.mode).some(m=>m.x===action.to.x&&m.y===action.to.y&&m.kind===action.kind)) return;
        if(online){pending=true;socket.emit('shavariAction',{gameId,action});render();}
        else{journal=journal.slice(0,cursor);journal.push(action);cursor++;const next=Shavari.apply(state,action);if(!next)return;window.SiteAudio?.transition('shavari',state,next);state=next;selected=null;persist();render();}
    }
    function choose(to) {
        if(!canPlay())return;
        notice('');
        if(selected){
            const choices=Shavari.legalMoves(state,selected,mode).filter(m=>m.x===to.x&&m.y===to.y);
            if(choices.length){
                const action={from:{...selected},to,mode};
                if(choices.some(m=>m.kind==='cover')){pendingAction=action;$('landing-dialog').showModal();$('cancel-landing').focus();}
                else execute({...action,kind:choices[0].kind});
                return;
            }
        }
        const stack=state.board[`${to.x},${to.y}`];
        if(stack?.at(-1).owner!==state.player)return;
        selected=selected?.x===to.x&&selected?.y===to.y?null:to;render();
    }
    function drawCoordinates() {
        $('coordinates').replaceChildren();
        for (let i = 0; i < 9; i++) {
            for (const side of ['top','bottom','left','right']) {
                const el = document.createElement('span'); el.className = 'coordinate';
                const pos = 7.5 + i * 10.625;
                el.style.left = `${side === 'left' ? 1.8 : side === 'right' ? 98.2 : pos}%`;
                el.style.top = `${side === 'top' ? 1.8 : side === 'bottom' ? 98.2 : pos}%`;
                el.textContent = side === 'top' || side === 'bottom' ? 'ABCDEFGHI'[flipped ? 8-i : i] : String(flipped ? i+1 : 9-i);
                $('coordinates').appendChild(el);
            }
        }
    }
    function cancelBot() {
        botGeneration++; botThinking = false; botErrorPly = -1;
        if (botWorker) { botWorker.terminate(); botWorker = null; }
    }
    function scheduleBot() {
        if (online || !isBotTurn() || state.result || roomClosed || botThinking || botErrorPly === state.ply) return;
        const ticket = ++botGeneration; botThinking = true;
        $('turn-status').textContent = 'Shavari v1.3.3 bot to move';
        $('connection-status').textContent = 'Shavari bot is thinking…';
        try {
            botWorker = new Worker('shavari-bot-worker.js?v=20261009-v133');
            const worker = botWorker;
            worker.onmessage = event => {
                if (ticket !== botGeneration) return;
                botWorker = null; botThinking = false; worker.terminate();
                if (event.data?.error || !event.data?.action) {
                    botErrorPly = state.ply; notice('The Shavari bot could not calculate a move. Change the local opponent or reload the match.'); render(); return;
                }
                botErrorPly = -1; execute(event.data.action, true);
            };
            worker.onerror = () => {
                if (ticket !== botGeneration) return;
                botWorker = null; botThinking = false; worker.terminate(); botErrorPly = state.ply;
                notice('The Shavari bot worker could not start. Change the local opponent or reload the match.'); render();
            };
            worker.postMessage({ id: ticket, journal: journal.slice(0, cursor), ms: 900 });
        } catch {
            botThinking = false; botErrorPly = state.ply; botWorker = null;
            notice('The Shavari bot worker could not start. Change the local opponent or reload the match.'); $('connection-status').textContent='Bot unavailable · change the local opponent to retry.';
        }
    }
    function render() {
window.SiteAccounts.tablePlayers?.(online?state.playerProfiles:null,['Player 1','Player 2'],online?gameId:null);
window.SiteRecords?.completed('shavari',recordPayload(),state.result,online?gameId:null);
        const moves = selected && canPlay() ? Shavari.legalMoves(state, selected, mode) : [];
        const focus = document.activeElement;
        nodes.forEach((node,i) => {
            const x=i%9,y=Math.floor(i/9),stack=state.board[`${x},${y}`] || [], top=stack.at(-1);
            const legal=moves.find(m=>m.x===x&&m.y===y&&m.kind==='cover')||moves.find(m=>m.x===x&&m.y===y), isSelected=selected?.x===x&&selected?.y===y;
            node.style.left = `${(flipped ? 8-x : x)*12.5}%`; node.style.top = `${(flipped ? 8-y : y)*12.5}%`;
            node.className='intersection'+(legal ? ` legal legal-${legal.kind}`:'')+(isSelected?' selected':'');
            if ([state.lastMove?.from,state.lastMove?.to].some(p=>p?.x===x&&p?.y===y)) node.classList.add('last');
            node.setAttribute('aria-label', `${Shavari.coord({x,y})}: ${top ? courts[top.owner]+' controls; '+stack.map(p=>courts[p.owner]+' '+Shavari.TYPES[p.type].name).join(', ')+'; '+stack.length+' piece'+(stack.length===1?'':'s')+', base to top' : 'empty'}${legal ? '; legal '+legal.kind : ''}`);
            node.setAttribute('aria-pressed', String(isSelected)); node.replaceChildren();
            if (top) {
                const token=document.createElement('span'); token.className=`token p${top.owner} height-${stack.length}`;
                const img=document.createElement('img'); img.src=`assets/shavari/${Shavari.TYPES[top.type].icon}.svg`;img.alt='';token.appendChild(img);
                if (stack.length>1) {
                    const ribbon=document.createElement('span');ribbon.className='stack-ribbon';
                    stack.forEach(p=>{const mini=document.createElement('img');mini.src=`assets/shavari/${Shavari.TYPES[p.type].icon}.svg`;mini.alt='';mini.className=`p${p.owner}`;ribbon.appendChild(mini);});token.appendChild(ribbon);
                    const badge=document.createElement('span'); badge.className='height-badge';badge.textContent=stack.length;token.appendChild(badge); }
                node.appendChild(token);
            }
        });
        if (!nodes.some(n=>n.tabIndex===0)) nodes[76].tabIndex=0;
        if (nodes.includes(focus)) focus.focus();
        drawCoordinates();
        $('turn-status').textContent=state.result ? (state.result.winner ? `${window.SiteAccounts.playerName?.(state.result.winner,courts[state.result.winner])||courts[state.result.winner]} wins` : 'Draw') : roomClosed ? 'Table closed' : isBotTurn() ? 'Shavari v1.3.3 bot to move' : `${window.SiteAccounts.playerName?.(state.player,courts[state.player])||courts[state.player]} to move`;
        if (state.result) $('connection-status').textContent=state.result.reason;
        else if (!online) $('connection-status').textContent=isBotTurn() ? (botErrorPly === state.ply ? 'Bot unavailable · change the local opponent to retry.' : 'Shavari bot is thinking…') : selected ? `${new Set(moves.map(m=>`${m.x},${m.y}`)).size} legal destinations · ${mode==='top'?'detach the top piece':mode==='pair'?'carry the top two':'move the full formation'}` : 'Select a piece to see its paths.';
        else $('connection-status').textContent=roomClosed ? 'Return to the collection to open another room.' : !connected ? 'Reconnecting… Moves are paused.' : !hasSynced ? 'Restoring your seat…' : pending ? 'Confirming your move…' : mySeat===state.player ? 'Your court’s turn.' : 'Waiting for the other court.';
        $('mode-all').setAttribute('aria-pressed',String(mode==='all'));$('mode-top').setAttribute('aria-pressed',String(mode==='top'));$('mode-pair').setAttribute('aria-pressed',String(mode==='pair'));
        document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
        const detail=$('selection-detail');detail.replaceChildren();
        if (selected) {
            const stack=state.board[`${selected.x},${selected.y}`];
            const icons=document.createElement('div');icons.className='selection-pieces';
            stack.forEach(p=>{const img=document.createElement('img');img.src=`assets/shavari/${Shavari.TYPES[p.type].icon}.svg`;img.alt=courts[p.owner]+' '+Shavari.TYPES[p.type].name;img.className=`p${p.owner}`;icons.appendChild(img);});
            const text=document.createElement('div'),heading=document.createElement('strong'),small=document.createElement('small');
            heading.textContent=`${Shavari.coord(selected)} · ${stack.length===1?'Single piece':stack.length+'-piece formation'}`;
            small.textContent=`${courts[stack.at(-1).owner]} controls · combined moves · ${stack.length>1?'base → top':'select a highlighted path'}`;
            text.append(heading,small);detail.append(icons,text);
        } else detail.textContent='Choose one of the active court’s pieces.';
        for (const p of [1,2]) {
            const count=Object.values(state.board).flat().filter(v=>v.owner===p).length;$(`count-${p}`).textContent=count+' pieces';
            const strip=document.querySelector(p===1?'.player-strip.carnelian':'.player-strip.turquoise');strip.classList.toggle('active',state.player===p&&!state.result);
            $(`court-${p}`).textContent=online ? mySeat===p?'Your court':'Opponent’s court' : p===1?'Southern army · moves first':'Northern army';
        }
        $('move-count').textContent=state.ply+' plies';
        const history=$('move-history'),nearBottom=history.scrollHeight-history.scrollTop-history.clientHeight<35;history.replaceChildren();
        state.history.slice(-100).forEach((m,i)=>{
            const li=document.createElement('li'),number=document.createElement('span'),move=document.createElement('span');number.className='ply-no';
            number.textContent=String(Math.max(0,state.history.length-100)+i+1)+'.';
            move.textContent=`${courts[m.player]} ${m.types.join('+')} · ${Shavari.coord(m.from)} ${m.kind==='cover'?'⊕':m.captured.length?'×':'→'} ${Shavari.coord(m.to)}${m.height>1?' · '+m.height+' high':''}`;
            li.append(number,move);history.appendChild(li);
        });
        if (!state.history.length) {const li=document.createElement('li');li.className='empty-history';li.textContent='The first move is yours.';history.appendChild(li);}
        if (nearBottom) history.scrollTop=history.scrollHeight;
        $('undo-button').disabled=online||cursor===0;$('redo-button').disabled=online||cursor===journal.length;
        $('new-button').hidden=online;$('resign-button').hidden=!online||Boolean(state.result)||roomClosed;
        $('resign-button').disabled=!connected||!hasSynced||pending;
        $('local-opponent-control').hidden=online;
        $('local-opponent').value=String(botSeat ?? 'none');
        const firstStrip=document.querySelector(flipped?'.carnelian':'.turquoise'),lastStrip=document.querySelector(flipped?'.turquoise':'.carnelian');
        $('board').parentElement.before(firstStrip);$('board').parentElement.after(lastStrip);
        scheduleBot();
    }
    document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;render();}));
    for (const id of ['all','top','pair']) $(`mode-${id}`).addEventListener('click',()=>{mode=id;render();});
    $('cancel-landing').addEventListener('click',()=>$('landing-dialog').close());
    for(const kind of ['capture','cover']) $(`${kind}-landing`).addEventListener('click',()=>{const action=pendingAction;$('landing-dialog').close();pendingAction=null;if(action)execute({...action,kind});});
    $('flip-button').addEventListener('click',()=>{flipped=!flipped;persist();render();});
    $('undo-button').addEventListener('click',()=>{if(online||!cursor)return;cancelBot();let steps=1;if(botSeat&&state.player!==botSeat&&state.history.at(-1)?.player===botSeat&&cursor>1)steps=2;cursor=Math.max(0,cursor-steps);state=Shavari.replay(journal,cursor);selected=null;notice('');persist();render();});
    $('redo-button').addEventListener('click',()=>{if(online||cursor>=journal.length)return;cancelBot();let steps=botSeat&&state.player!==botSeat&&cursor+1<journal.length?2:1;cursor=Math.min(journal.length,cursor+steps);state=Shavari.replay(journal,cursor);selected=null;notice('');persist();render();});
    function confirm(title,message,label,action){$('confirm-title').textContent=title;$('confirm-message').textContent=message;$('accept-confirm').textContent=label;confirmation=action;$('confirm-dialog').showModal();$('cancel-confirm').focus();}
    $('local-opponent').addEventListener('change',()=>{
        const value=$('local-opponent').value, nextSeat=value==='none'?null:Number(value);
        const start=()=>{cancelBot();botSeat=nextSeat;state=Shavari.initial();journal=[];cursor=0;selected=null;mode='all';notice('');window.SiteRecords?.newTable('shavari');persist();render();};
        if(cursor||journal.length)confirm('Change local opponent?','Starting this setup replaces the current position. Save a record first if you want to keep it.','Start new match',start);else start();
    });
    $('new-button').addEventListener('click',()=>{
        const start=()=>{cancelBot();window.SiteRecords?.newTable('shavari');state=Shavari.initial();journal=[];cursor=0;selected=null;mode='all';notice('');persist();render();};
        if(cursor||journal.length)confirm('Start a new match?','Your current position will be replaced. Save a record first if you want to keep it.','Start new match',start);else start();
    });
    $('cancel-confirm').addEventListener('click',()=>{$('confirm-dialog').close();$('local-opponent').value=String(botSeat ?? 'none');});
    $('accept-confirm').addEventListener('click',()=>{$('confirm-dialog').close();confirmation?.();confirmation=null;});
    $('resign-button').addEventListener('click',()=>confirm('Resign this match?','The other court will win. You can save the move record afterwards.','Resign',()=>{if(connected&&hasSynced)socket.emit('shavariResign',{gameId});}));
    $('lobby-link').addEventListener('click',e=>{
        if(online&&!state.result&&!roomClosed){e.preventDefault();confirm('Leave this table?','Leaving ends the match for both courts. Refreshing this page preserves your seat.','Leave table',()=>{socket.emit('leaveGame',gameId);location.href='/';});}
    });
    $('rules-button').addEventListener('click',()=>$('rules-dialog').showModal());$('close-rules').addEventListener('click',()=>$('rules-dialog').close());
    $('save-button').addEventListener('click',()=>{try{SiteRecords.save('shavari',recordPayload());notice('Replay record downloaded and added to history.');}catch(e){notice(e.message);}});
    for(const [type,info] of Object.entries(Shavari.TYPES)){
        const card=document.createElement('article');card.className='guide-card';
        const img=document.createElement('img');img.src=`assets/shavari/${info.icon}.svg`;img.alt='';
        const h=document.createElement('h3');h.textContent=info.name;const desc=document.createElement('p');desc.textContent=info.description;
        const small=document.createElement('small');small.textContent=type==='G'?'G · capture this to win':`${type} · ${type==='P'?'five':'two'} per court`;card.append(img,h,desc,small);$('guide-cards').appendChild(card);
    }
    if(online){
        $('play-mode').textContent='ONLINE TABLE';
        socket=window.SiteAccounts.socket();
        socket.on('connect',()=>{
            connected=true;pending=false;hasSynced=false;
            let token;try{token=sessionStorage.getItem('hikoro-seat-' + gameId);}catch{}
            if(!token){roomClosed=true;notice('No saved seat for this room. Join a table through the collection.');render();return;}
            socket.emit('joinShavariRoom',{gameId,token});render();
        });
        socket.on('disconnect',()=>{connected=false;pending=false;selected=null;render();});
        socket.on('shavariState',data=>{
            if(data.gameId!==gameId)return;pendingAction=null;$('landing-dialog').close();if(hasSynced)window.SiteAudio?.transition('shavari',state,data.state);state=data.state;mySeat=data.playerIndex+1;hasSynced=true;pending=false;selected=null;
            notice('');render();
        });
        socket.on('errorMsg',message=>{pending=false;notice(String(message));render();});
        socket.on('roomClosed',reason=>{roomClosed=true;pending=false;notice(String(reason));render();});
    }
    render();
    if(params.get('showRules')==='1')$('rules-dialog').showModal();

    function recordPayload(){return {journal:online?(state.recordJournal||[]):journal,cursor:online?(state.recordJournal||[]).length:cursor,result:state.result,gameId:online?gameId:null};}
window.SiteAccounts.register('shavari',()=>online?null:{version:4,journal,cursor,flipped,botSeat},saved=>{
        const restored=saved?.version===4&&Shavari.replay(saved.journal,saved.cursor);
        if(online||!restored||!Shavari.replay(saved.journal))throw Error('Invalid save');
        cancelBot();journal=saved.journal;cursor=saved.cursor;state=restored;flipped=Boolean(saved.flipped);botSeat=[1,2].includes(saved.botSeat)?saved.botSeat:null;selected=null;persist();render();
    },recordPayload);
})();
