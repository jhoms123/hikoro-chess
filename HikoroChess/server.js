const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const socketIo = require('socket.io');
const hikoroLogic = require('./gamelogic');
const { remainingTime, commitClock } = require('./clock');
const { createSdsValidator, applySdsAction } = require('./sds-validator');
const Shavari = require('./public/shavari-engine');
const Hikoruka = require('./public/hikoruka-engine');
const Go = require('./public/go-engine');
const Academy = require('./public/academy-engine');
const { installAccounts } = require('./accounts');
const MatchRecord = require('./public/match-record');
const Identity = require('./public/player-identity');
const { createRoomStore } = require('./room-store');

function createServer({ accountOptions, roomStore = accountOptions?.clientFactory ? null : createRoomStore(accountOptions?.env || process.env) } = {}) {
    const app = express();
    const server = http.createServer(app);
    const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'https://hikorochess.org,https://www.hikorochess.org,http://localhost:3000').split(',').map(value=>value.trim()).filter(Boolean));
    if(process.env.RENDER_EXTERNAL_URL)allowedOrigins.add(process.env.RENDER_EXTERNAL_URL.replace(/\/$/,''));
    const io = socketIo(server, { maxHttpBufferSize: 32768,
        allowRequest: (req,done)=>done(null,!req.headers.origin||allowedOrigins.has(req.headers.origin)),
        cors: { origin: [...allowedOrigins], methods: ['GET', 'POST'] },
        pingInterval: 25000, pingTimeout: 20000 });
    app.disable('x-powered-by');
    app.use((_req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"base-uri 'self'; object-src 'none'; frame-ancestors 'self'"});next();});
    app.set('trust proxy', 1); // Render's single reverse proxy; do not trust arbitrary forwarding hops.
    const accounts = installAccounts(app, io, accountOptions);
    if(process.env.SITE_REVIEW_MODE==='true')app.get('/api/review-data',(_req,res)=>res.json(require('./review-data').reviewData()));
    app.use(express.static(path.join(__dirname, 'public')));
    app.get('/gamelogic.js', (req, res) => res.sendFile(path.join(__dirname, 'gamelogic.js')));
    app.get('/health', (req, res) => res.status(storageReady ? 200 : 503).json({ status: storageReady ? 'ok' : 'restoring', rooms: roomStore ? 'durable' : 'memory' }));
    // Keep the old bookmarked URL on the maintained game page.
    app.get('/shodan', (req, res) => res.redirect('/shodansho.html' + (req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '')));
    const games = new Map();
    const lobby = new Map();
    const sessions = new Map();
    const resultRetries = new Map();
    let effects = null, queue = Promise.resolve(), storageReady = !roomStore;
    const defer = action => effects ? effects.push(action) : action();
    const broadcast = (id, event, data) => { const copy = structuredClone(data); defer(() => io.to(id).emit(event, copy)); };
    const reply = (socket, event, data) => { const copy = structuredClone(data); defer(() => socket.emit(event, copy)); };
    const emitLobby = () => { const copy = Object.fromEntries(lobby); defer(() => io.emit('lobbyUpdate', copy)); };
    const ttl = game => game.gameOver ? 3600000 : game.started ? 21600000 : 1800000;
    function snapshot(game) { const session = sessions.get(game.id); return {version:1, game:state(game), session:{tokens:session.tokens, accountIds:session.accountIds, journal:session.journal}}; }
    function restore(saved) {
        if(saved?.version !== 1 || !saved.game || !saved.session || !/^((game)|(sp))_[a-f0-9]{16}$/.test(saved.game.id)) throw Error('Invalid stored room');
        const game = structuredClone(saved.game), data = structuredClone(saved.session);
        const rules = {shavari:Shavari, hikoruka:Hikoruka, go:Go, academy:Academy}[game.gameType];
        let engine = rules ? (game.gameType==='go' ? rules.initial(game.boardSize) : rules.initial()) : game.gameType==='shodansho'&&!game.isSinglePlayer ? createSdsValidator(game.maxPlayers) : null;
        if(rules) for(const action of data.journal){ engine=rules.apply(engine,action); if(!engine)throw Error('Invalid stored action'); }
        if(game.gameType==='shodansho'&&engine)for(const action of game.sdsActions)if(!applySdsAction(engine,action))throw Error('Invalid stored garden action');
        if(game.gameOver&&rules&&!engine.result)engine.result={winner:game.winner==='draw'?0:Number(game.winner),reason:game.reason};
        games.set(game.id,game); sessions.set(game.id,{...data,engine});
        if(!game.started&&!game.gameOver)lobby.set(game.id,{id:game.id,gameType:game.gameType,creatorName:game.name,timeControl:game.timeControl,currentPlayers:data.tokens.length,maxPlayers:game.maxPlayers,boardSize:game.boardSize});
    }
    const ready = roomStore ? roomStore.load().then(rows=>{ for(const saved of rows){try{if(Date.now()-saved.game.lastActivity<=ttl(saved.game))restore(saved);}catch{console.error('A stored room could not be restored.');}} storageReady=true; }).catch(error=>{console.error('Online room storage could not load.');throw error;}) : Promise.resolve();
    ready.then(()=>{for(const game of games.values())if(game.gameOver)persistResult(game);}).catch(()=>{});
    io.use(async (_socket,next)=>{try{await ready;next();}catch{next(Error('Online tables are temporarily unavailable. Please try again.'));}});
    function command(action,socket) {
        const task=queue.then(async()=>{
            await ready; const before=new Map([...games].map(([id,game])=>[id,JSON.stringify(snapshot(game))])); effects=[];
            try{
                await action();
                const rows=[...games].map(([id,game])=>({id,snapshot:snapshot(game),expires_at:new Date(game.lastActivity+ttl(game)).toISOString()})).filter(row=>JSON.stringify(row.snapshot)!==before.get(row.id));
                const removed=[...before.keys()].filter(id=>!games.has(id));
                if(roomStore&&(rows.length||removed.length))await roomStore.commit(rows,removed);
                const committed=effects;effects=null;for(const effect of committed)effect();
            }catch{
                effects=null;games.clear();sessions.clear();lobby.clear();for(const value of before.values())restore(JSON.parse(value));
                for(const live of io.sockets.sockets.values()){for(const id of live.rooms)if(/^(game|sp)_/.test(id))live.leave(id);for(const game of games.values())if(member(game,live))live.join(game.id);}
                if(socket)reply(socket,'errorMsg','Your action was not saved. The table is unchanged; please try again.');
                else console.error('Online room update could not be saved.');
            }
        });queue=task.catch(()=>{});return task;
    }
    const state = game => { const { logic, ...publicState } = game; return publicState; };
    const err = (socket, message) => reply(socket,'errorMsg', message);
    const ticket = () => crypto.randomBytes(24).toString('hex');
    const seat = (game, socket) => game.gameType !== 'hikoro' ? game.players.indexOf(socket.id)
        : game.players.white === socket.id ? 0 : game.players.black === socket.id ? 1 : -1;
    const member = (game, socket) => seat(game, socket) !== -1;
    function sendVariant(game, onlySocket) {
        const engine = sessions.get(game.id)?.engine;
        if (!engine) return;
        const { positions, ...publicEngine } = engine;
        publicEngine.playerProfiles=game.playerProfiles;
        publicEngine.recordJournal = sessions.get(game.id).journal || [];
        game.players.forEach((id, playerIndex) => {
            if (!onlySocket || id === onlySocket.id) broadcast(id, `${game.gameType}State`, { gameId: game.id, state: publicEngine, playerIndex });
        });
    }
    function roster(game) {
        const ids=game.gameType==='hikoro'?[game.players.white,game.players.black]:game.players;
        broadcast(game.id,'tableStatus',{gameId:game.id,gameType:game.gameType,started:game.started,finished:game.gameOver,
            durable:Boolean(roomStore),local:Boolean(game.isSinglePlayer),maxPlayers:game.maxPlayers,players:game.playerProfiles.map((profile,i)=>({name:profile.display_name,connected:Boolean(ids[i]&&io.sockets.sockets.has(ids[i])),rematch:Boolean(game.rematchVotes?.includes(i))}))});
    }
    function finish(game, winner, reason) {
        game.gameOver = true; game.winner = winner; game.reason = reason;
        game.lastActivity = Date.now();
        persistResult(game);
        if (['shavari','hikoruka','go','academy'].includes(game.gameType)) {
            sessions.get(game.id).engine.result = { winner: winner === 'draw' ? 0 : Number(winner), reason };
            sendVariant(game);
        } else broadcast(game.id, 'gameStateUpdate', state(game));
        if (game.gameType !== 'hikoro') broadcast(game.id, 'roomClosed', reason);
        roster(game);
    }
    function remove(game) {
        accounts.forget(game.id);resultRetries.delete(game.id);
        games.delete(game.id); sessions.delete(game.id); lobby.delete(game.id); emitLobby();
    }
    function persistResult(game) {
        const session = sessions.get(game.id);
        if (!session) return;
        resultRetries.set(game.id,Date.now());
        const winner = game.gameType === 'hikoro' ? game.winner === 'draw' ? 0 : game.winner === 'white' ? 1 : game.winner === 'black' ? 2 : -1
            : game.gameType === 'shodansho' ? game.winner === 'draw' ? 0 : Number.isInteger(session.engine?.winner) ? session.engine.winner + 1 : Number(game.winner)
            : session.engine?.result?.winner ?? (game.winner === 'draw' ? 0 : Number(game.winner));
        const result={winner,reason:game.reason||session.engine?.result?.reason||session.engine?.message};
        const payload={journal:game.gameType==='hikoro'?game.actionJournal:game.gameType==='shodansho'?game.sdsActions:session.journal,size:game.boardSize,playerCount:game.maxPlayers,mode:'match',lesson:'pawn'};
        let record;try{record=MatchRecord.create(game.gameType,payload,result,{id:game.id,players:Array.from({length:game.maxPlayers},(_,i)=>game.playerProfiles?.[i]?.display_name||'Player '+(i+1))});}catch{console.error('Match replay record could not be constructed.');}
        defer(() => { void accounts.recordResult(game, session.accountIds, result, record); });
    }
    function options(data) {
        if (!data || typeof data !== 'object') return null;
        const gameType = data.gameType || 'hikoro';
        if (!['hikoro', 'shodansho', 'shavari', 'hikoruka', 'go', 'academy'].includes(gameType)) return null;
        const maxPlayers = gameType === 'shodansho' ? Number(data.sdsPlayerCount || 2) : 2;
        if (![2, 3, 4].includes(maxPlayers)) return null;
        const tc = data.timeControl || { main: 300, byoyomiTime: 30 };
        if (![-1, 0, 300, 900, 1800, 3600].includes(tc.main) || ![0, 15, 30, 60].includes(tc.byoyomiTime)) return null;
        const timeControl = gameType !== 'hikoro' ? { main: -1, byoyomiTime: 0 }
            : { main: tc.main, byoyomiTime: tc.main === -1 ? 0 : tc.main === 0 && tc.byoyomiTime === 0 ? 15 : tc.byoyomiTime };
        const boardSize = Number(data.boardSize || 9);
        if (gameType === 'go' && ![9,13].includes(boardSize)) return null;
        return { gameType, maxPlayers, timeControl, ...(gameType === 'go' ? {boardSize} : {}), name: String(data.playerName || 'Anonymous').trim().slice(0, 15) || 'Anonymous' };
    }
    function newGame(socket, config, single, announceSeat = true) {
        const id = `${single ? 'sp' : 'game'}_${crypto.randomBytes(8).toString('hex')}`;
        const identity=socket.data.playerIdentity||Identity.publicIdentity({display_name:config.name});
        config.name=identity.display_name;
        const game = { id, ...config, playerProfiles:[identity], players: config.gameType === 'hikoro' ? { white: socket.id, black: single ? socket.id : null } : [socket.id],
            boardState: hikoroLogic.getInitialBoard(), isWhiteTurn: true, turnCount: 0, gameOver: false,
            whiteTimeLeft: config.timeControl.main, blackTimeLeft: config.timeControl.main,
            lastMoveTimestamp: single ? Date.now() : null, lastActivity: Date.now(), isSinglePlayer: single, started: single,
            moveList: [], actionJournal: [], whiteCaptured: [], blackCaptured: [], whitePrinceOnBoard: true, blackPrinceOnBoard: true, sdsActions: [] };
        games.set(id, game);
        const tokens = [ticket()];
        sessions.set(id, { tokens, journal: [], accountIds: [socket.data.accountId || null], engine: config.gameType === 'academy' ? Academy.initial() : config.gameType === 'go' ? Go.initial(config.boardSize) : config.gameType === 'hikoruka' ? Hikoruka.initial() : config.gameType === 'shavari' ? Shavari.initial() : config.gameType === 'shodansho' && !single ? createSdsValidator(config.maxPlayers) : null });
        socket.join(id);
        if (announceSeat) reply(socket, 'seatAssigned', { gameId: id, token: tokens[0], playerIndex: 0 });
        roster(game);
        return game;
    }
    function tick() {
        const now = Date.now();
        for (const game of games.values()) {
            if(game.gameOver&&now-(resultRetries.get(game.id)||0)>=60000)persistResult(game);
            const ttl = game.gameOver ? 3600000 : game.started ? 21600000 : 1800000;
            if (now - game.lastActivity > ttl) { broadcast(game.id, 'roomClosed', 'This inactive room has expired.'); remove(game); continue; }
            if (game.gameType !== 'hikoro' || !game.started || game.gameOver || game.timeControl.main === -1) continue;
            const t = remainingTime(game, now);
            if (t.expired) { finish(game, t.color === 'white' ? 'black' : 'white', 'Timeout'); continue; }
            broadcast(game.id, 'timeUpdate', {
                whiteTime: t.color === 'white' ? t.display : game.whiteTimeLeft || game.timeControl.byoyomiTime,
                blackTime: t.color === 'black' ? t.display : game.blackTimeLeft || game.timeControl.byoyomiTime,
                isInByoyomiWhite: t.color === 'white' ? t.byoyomi : game.whiteTimeLeft <= 0,
                isInByoyomiBlack: t.color === 'black' ? t.byoyomi : game.blackTimeLeft <= 0 });
        }
    }
    const interval = setInterval(() => command(tick), 1000);
    interval.unref(); server.on('close', () => clearInterval(interval));
    io.on('connection', socket => {
        const on = (event, action) => socket.on(event, data => command(() => action(data),socket));
        reply(socket, 'lobbyUpdate', Object.fromEntries(lobby));
        let createTimes = [];
        function canCreate() {
            createTimes = createTimes.filter(t => Date.now() - t < 60000);
            if (createTimes.length >= 5 || games.size >= 500) { err(socket, 'Please wait before creating another room.'); return false; }
            createTimes.push(Date.now()); return true;
        }
        on('createGame', data => {
            const config = options(data);
            if (!config) return err(socket, 'Invalid game settings.');
            if (!canCreate()) return;
            const game = newGame(socket, config, false);
            lobby.set(game.id, { id: game.id, gameType: game.gameType, creatorName: game.name, timeControl: game.timeControl, currentPlayers: 1, maxPlayers: game.maxPlayers, boardSize: game.boardSize });
            reply(socket, 'gameCreated', { gameId: game.id, gameType:game.gameType, color: game.gameType === 'hikoro' ? 'white' : 'waiting' }); roster(game); emitLobby();
        });
        on('createSinglePlayerGame', data => {
            const config = options({ ...data, timeControl: { main: -1, byoyomiTime: 0 } });
            if (!config) return err(socket, 'Invalid game settings.');
            if (['shavari','hikoruka','go','academy'].includes(config.gameType)) return err(socket, `Local play is available at /${config.gameType}.html.`);
            if (!canCreate()) return;
            reply(socket, 'gameStart', state(newGame(socket, config, true)));
        });
        on('restoreHikoroSave', data => {
            if (!Array.isArray(data?.journal) || data.journal.length > 10000 || !canCreate()) return err(socket, 'This saved match cannot be restored.');
            const config = options({ gameType: 'hikoro', timeControl: { main: -1, byoyomiTime: 0 } });
            let game = newGame(socket, config, true, false);
            try {
                for (const move of data.journal) {
                    if (game.gameOver) throw new Error();
                    const result = hikoroLogic.makeMove(game, move, game.isWhiteTurn ? 'white' : 'black');
                    if (!result.success) throw new Error();
                    game = result.updatedGame;
                }
                game.actionJournal = JSON.parse(JSON.stringify(data.journal));
                game.lastActivity = Date.now(); games.set(game.id, game);
                reply(socket, 'seatAssigned', { gameId: game.id, token: sessions.get(game.id).tokens[0], playerIndex: 0 });
                reply(socket, 'gameStart', state(game));
            } catch { socket.leave(game.id); remove(game); err(socket, 'This saved match is not valid under the current Hikoro rules.'); }
        });
        on('joinGame', id => {
            const game = games.get(id);
            if (!game || game.started || game.gameOver) return err(socket, 'This room is no longer available.');
            if (member(game, socket)) return err(socket, 'You are already in this room.');
            let index;
            if (game.gameType !== 'hikoro') {
                if (game.players.length >= game.maxPlayers) return err(socket, 'This room is full.');
                index = game.players.push(socket.id) - 1;
            } else { if (game.players.black) return err(socket, 'This room is full.'); game.players.black = socket.id; index = 1; }
            const token = ticket(); sessions.get(id).tokens[index] = token;
            sessions.get(id).accountIds[index] = socket.data.accountId || null;
            game.playerProfiles[index]=socket.data.playerIdentity||Identity.publicIdentity(null,'Guest '+(index+1));
            reply(socket, 'seatAssigned', { gameId: id, token, playerIndex: index }); socket.join(id);
            game.lastActivity = Date.now();
            const count = game.gameType === 'hikoro' ? 2 : game.players.length;
            if (count === game.maxPlayers) {
                game.started = true; game.lastMoveTimestamp = Date.now(); lobby.delete(id);
                broadcast(id, 'gameStart', state(game));
            } else {
                lobby.get(id).currentPlayers = count;
                reply(socket, 'gameCreated', { gameId: id, gameType:game.gameType, color: 'waiting' });
            }
            roster(game);emitLobby();
        });
        function resume(data, type) {
            const game = games.get(data?.gameId); const session = sessions.get(data?.gameId);
            const index = session?.tokens.indexOf(data?.token);
            if (!game || !session || index === -1 || index === undefined || game.gameType !== type)
                return err(socket, 'This seat could not be restored. Return to the lobby to start a new game.');
            if (session.accountIds[index] && session.accountIds[index] !== socket.data.accountId)
                return err(socket, 'Sign in with the account that opened this seat.');
            const arraySeats = type !== 'hikoro';
            const oldId = arraySeats ? game.players[index] : game.players[index === 0 ? 'white' : 'black'];
            if (oldId !== socket.id && io.sockets.sockets.has(oldId)) io.sockets.sockets.get(oldId).leave(game.id);
            if (arraySeats) game.players[index] = socket.id;
            else { game.players[index === 0 ? 'white' : 'black'] = socket.id; if (game.isSinglePlayer) game.players.black = socket.id; }
            game.playerProfiles[index]=socket.data.playerIdentity||game.playerProfiles[index];
            socket.join(game.id); game.lastActivity = Date.now();
            broadcast(game.id, 'playerIdentities',{gameId:game.id,players:game.playerProfiles});roster(game);
            if (['shavari','hikoruka','go','academy'].includes(type)) {
                if (!game.started) return reply(socket, 'gameCreated', { gameId: game.id, gameType:game.gameType, color: 'waiting' });
                sendVariant(game, socket);
            } else if (type === 'shodansho'&&!game.started) reply(socket,'gameCreated',{gameId:game.id,gameType:game.gameType,color:'waiting'});
            else if (type === 'shodansho') reply(socket, 'sdsSync', { actions: game.sdsActions, playerIndex: index, playerCount: game.maxPlayers, playerProfiles:game.playerProfiles });
            else if (!game.started) reply(socket, 'gameCreated', { gameId: game.id, gameType:game.gameType, color: index === 0 ? 'white' : 'black' });
            else reply(socket, 'gameStart', state(game));
        }
        on('refreshPlayerIdentity',async data=>{
            const now=Date.now();if(now-(socket.data.identityRefreshAt||0)<1000)return;socket.data.identityRefreshAt=now;
            try{await accounts.refreshIdentity(socket,data?.token);for(const game of games.values()){
                const index=seat(game,socket);if(index<0||!socket.data.accountId)continue;
                game.playerProfiles[index]=socket.data.playerIdentity;
                if(lobby.has(game.id)&&index===0){game.name=socket.data.playerIdentity.display_name;lobby.get(game.id).creatorName=game.name;}
                broadcast(game.id, 'playerIdentities',{gameId:game.id,players:game.playerProfiles});roster(game);
            }emitLobby();}catch{err(socket,'Your profile could not refresh. Try again.');}
        });
        on('rematch', data => {
            const old=games.get(data?.gameId);const index=old&&seat(old,socket);
            if(!old||index<0||!old.gameOver||old.isSinglePlayer)return err(socket,'Finish an online match before requesting a rematch.');
            old.rematchVotes=old.rematchVotes||[];
            if(data.accept===false)old.rematchVotes=old.rematchVotes.filter(i=>i!==index);
            else if(!old.rematchVotes.includes(index))old.rematchVotes.push(index);
            old.lastActivity=Date.now();roster(old);
            if(old.rematchVotes.length!==old.maxPlayers)return;
            const ids=old.gameType==='hikoro'?[old.players.white,old.players.black]:old.players;
            const participants=ids.map(id=>io.sockets.sockets.get(id));
            if(participants.some(s=>!s))return err(socket,'All players must reconnect before the rematch can begin.');
            participants.push(participants.shift()); // Rotate first move fairly, including three/four player games.
            const fresh=newGame(participants[0],{gameType:old.gameType,maxPlayers:old.maxPlayers,timeControl:{...old.timeControl},boardSize:old.boardSize,name:old.name},false);
            for(let i=1;i<participants.length;i++){
                const next=participants[i],session=sessions.get(fresh.id);
                if(fresh.gameType==='hikoro')fresh.players.black=next.id;else fresh.players.push(next.id);
                session.tokens[i]=ticket();session.accountIds[i]=next.data.accountId||null;
                fresh.playerProfiles[i]=next.data.playerIdentity||old.playerProfiles[ids.indexOf(next.id)];
                next.join(fresh.id);reply(next,'seatAssigned',{gameId:fresh.id,token:session.tokens[i],playerIndex:i});
            }
            fresh.started=true;fresh.lastMoveTimestamp=Date.now();old.rematchVotes=[];
            broadcast(fresh.id,'rematchReady',{gameId:fresh.id,gameType:fresh.gameType,maxPlayers:fresh.maxPlayers});roster(fresh);roster(old);
        });
        on('resumeGame', data => resume(data, 'hikoro'));
        on('joinSdsRoom', data => resume(data, 'shodansho'));
        on('joinShavariRoom', data => resume(data, 'shavari'));
        on('joinHikorukaRoom', data => resume(data, 'hikoruka'));
        on('joinGoRoom', data => resume(data, 'go'));
        on('joinAcademyRoom', data => resume(data, 'academy'));
        for (const [type, rules] of [['shavari',Shavari],['hikoruka',Hikoruka],['go',Go],['academy',Academy]]) {
            on(`${type}Action`, data => {
                const game = games.get(data?.gameId), engine = sessions.get(data?.gameId)?.engine;
                if (!game || game.gameType !== type || !game.started || game.gameOver || seat(game,socket) !== engine.player-1)
                    return err(socket,'Not your turn or this seat is no longer active.');
                const next = rules.apply(engine,data?.action);
                if (!next) return err(socket,'That move is not legal.');
                sessions.get(game.id).engine=next;sessions.get(game.id).journal.push(JSON.parse(JSON.stringify(data.action)));game.lastActivity=Date.now();game.gameOver=Boolean(next.result);sendVariant(game);if(game.gameOver){persistResult(game);roster(game);}
            });
            on(`${type}Resign`, data => {
                const game=games.get(data?.gameId);
                if (!game || game.gameType!==type || !game.started || game.gameOver || !member(game,socket))return err(socket,'You do not hold an active seat in this game.');
                finish(game,2-seat(game,socket),'Resignation');
            });
        }
        on('makeGameMove', data => {
            const game = games.get(data?.gameId); const move = data?.move;
            if (!game || game.gameType !== 'hikoro' || !member(game, socket)) return err(socket, 'You do not hold a seat in this game.');
            if (!game.started || game.gameOver) return err(socket, 'This game is not accepting moves.');
            if (!move || typeof move !== 'object') return err(socket, 'Invalid move.');
            const color = game.isSinglePlayer ? (game.isWhiteTurn ? 'white' : 'black') : seat(game, socket) === 0 ? 'white' : 'black';
            if (move.type !== 'resign' && (color === 'white') !== game.isWhiteTurn) return err(socket, 'Not your turn.');
            const now = Date.now();
            if (game.timeControl.main !== -1 && remainingTime(game, now).expired) return finish(game, game.isWhiteTurn ? 'black' : 'white', 'Timeout');
            let result;
            try { result = hikoroLogic.makeMove(game, move, color); } catch { return err(socket, 'Invalid move data.'); }
            if (!result.success) return err(socket, result.error);
            const next = result.updatedGame;
            next.actionJournal = [...(game.actionJournal || []), JSON.parse(JSON.stringify(move))];
            const complete = game.isWhiteTurn !== next.isWhiteTurn;
            commitClock(game, now, complete);
            next.whiteTimeLeft = game.whiteTimeLeft; next.blackTimeLeft = game.blackTimeLeft; next.lastMoveTimestamp = game.lastMoveTimestamp;
            next.lastActivity = now; games.set(game.id, next);
            if(next.gameOver){persistResult(next);roster(next);}
            broadcast(game.id, 'gameStateUpdate', state(next));
        });
        on('getValidMoves', data => {
            const game = games.get(data?.gameId);
            if (!game || game.gameType !== 'hikoro' || !member(game, socket)) return;
            reply(socket, 'validMoves', hikoroLogic.getValidMoves(game, data.data));
        });
        on('sdsAction', data => {
            const game = games.get(data?.gameId); const engine = sessions.get(data?.gameId)?.engine;
            if (!game || !engine || !game.started || game.gameOver || seat(game, socket) !== engine.currentPlayer)
                return err(socket, 'Not your turn or this seat is no longer active.');
            if (game.sdsActions.length >= 10000) return err(socket, 'This room has reached its move limit.');
            let action;
            try { action = applySdsAction(engine, data.action); } catch { return err(socket, 'Invalid action data.'); }
            if (!action) return err(socket, 'That action is not legal.');
            game.sdsActions.push(action); game.lastActivity = Date.now(); game.gameOver = engine.phase === 'game_over';
            if(game.gameOver){persistResult(game);roster(game);}
            broadcast(game.id, 'sdsAction', action);
        });
        on('leaveGame', id => {
            const game = games.get(id);
            if (!game || !member(game, socket)) return err(socket, 'You do not hold a seat in this room.');
            if (game.started && !game.isSinglePlayer && !game.gameOver) finish(game,
                game.gameType === 'hikoro' ? (seat(game, socket) === 0 ? 'black' : 'white') : ['shavari','hikoruka','go','academy'].includes(game.gameType) ? 2 - seat(game, socket) : 'draw', 'A player left the room.');
            else broadcast(id, 'roomClosed', 'This room was closed.');
            socket.leave(id); remove(game);
        });
        on('disconnect', () => { for(const game of games.values())if(member(game,socket))roster(game); });
    });
    return { server, io, ready, flush: () => queue };
}
if (require.main === module) {
    const { server } = createServer();
    server.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${server.address().port}`));
}
module.exports = { createServer };
