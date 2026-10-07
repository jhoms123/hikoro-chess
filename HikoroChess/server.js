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

function createServer() {
    const app = express();
    const server = http.createServer(app);
    const io = socketIo(server, { maxHttpBufferSize: 32768,
        cors: { origin: (process.env.ALLOWED_ORIGINS || 'https://hikorochess.org,https://www.hikorochess.org,http://localhost:3000').split(','), methods: ['GET', 'POST'] },
        pingInterval: 25000, pingTimeout: 20000 });
    app.disable('x-powered-by');
    app.use(express.static(path.join(__dirname, 'public')));
    app.get('/gamelogic.js', (req, res) => res.sendFile(path.join(__dirname, 'gamelogic.js')));
    app.get('/health', (req, res) => res.json({ status: 'ok' }));
    // Keep the old bookmarked URL on the maintained game page.
    app.get('/shodan', (req, res) => res.redirect('/shodansho.html' + (req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '')));
    const games = new Map();
    const lobby = new Map();
    const sessions = new Map();
    const emitLobby = () => io.emit('lobbyUpdate', Object.fromEntries(lobby));
    const state = game => { const { logic, ...publicState } = game; return publicState; };
    const err = (socket, message) => socket.emit('errorMsg', message);
    const ticket = () => crypto.randomBytes(24).toString('hex');
    const seat = (game, socket) => game.gameType !== 'hikoro' ? game.players.indexOf(socket.id)
        : game.players.white === socket.id ? 0 : game.players.black === socket.id ? 1 : -1;
    const member = (game, socket) => seat(game, socket) !== -1;
    function sendVariant(game, onlySocket) {
        const engine = sessions.get(game.id)?.engine;
        if (!engine) return;
        const { positions, ...publicEngine } = engine;
        game.players.forEach((id, playerIndex) => {
            if (!onlySocket || id === onlySocket.id) io.to(id).emit(`${game.gameType}State`, { gameId: game.id, state: publicEngine, playerIndex });
        });
    }
    function finish(game, winner, reason) {
        game.gameOver = true; game.winner = winner; game.reason = reason;
        game.lastActivity = Date.now();
        if (['shavari','hikoruka'].includes(game.gameType)) {
            sessions.get(game.id).engine.result = { winner: winner === 'draw' ? 0 : Number(winner), reason };
            sendVariant(game);
        } else io.to(game.id).emit('gameStateUpdate', state(game));
        if (game.gameType !== 'hikoro') io.to(game.id).emit('roomClosed', reason);
    }
    function remove(game) {
        games.delete(game.id); sessions.delete(game.id); lobby.delete(game.id); emitLobby();
    }
    function options(data) {
        if (!data || typeof data !== 'object') return null;
        const gameType = data.gameType || 'hikoro';
        if (!['hikoro', 'shodansho', 'shavari', 'hikoruka'].includes(gameType)) return null;
        const maxPlayers = gameType === 'shodansho' ? Number(data.sdsPlayerCount || 2) : 2;
        if (![2, 3, 4].includes(maxPlayers)) return null;
        const tc = data.timeControl || { main: 300, byoyomiTime: 30 };
        if (![-1, 0, 300, 900, 1800, 3600].includes(tc.main) || ![0, 15, 30, 60].includes(tc.byoyomiTime)) return null;
        const timeControl = gameType !== 'hikoro' ? { main: -1, byoyomiTime: 0 }
            : { main: tc.main, byoyomiTime: tc.main === -1 ? 0 : tc.main === 0 && tc.byoyomiTime === 0 ? 15 : tc.byoyomiTime };
        return { gameType, maxPlayers, timeControl, name: String(data.playerName || 'Anonymous').trim().slice(0, 15) || 'Anonymous' };
    }
    function newGame(socket, config, single) {
        const id = `${single ? 'sp' : 'game'}_${crypto.randomBytes(8).toString('hex')}`;
        const game = { id, ...config, players: config.gameType === 'hikoro' ? { white: socket.id, black: single ? socket.id : null } : [socket.id],
            boardState: hikoroLogic.getInitialBoard(), isWhiteTurn: true, turnCount: 0, gameOver: false,
            whiteTimeLeft: config.timeControl.main, blackTimeLeft: config.timeControl.main,
            lastMoveTimestamp: single ? Date.now() : null, lastActivity: Date.now(), isSinglePlayer: single, started: single,
            moveList: [], whiteCaptured: [], blackCaptured: [], whitePrinceOnBoard: true, blackPrinceOnBoard: true, sdsActions: [] };
        games.set(id, game);
        const tokens = [ticket()];
        sessions.set(id, { tokens, engine: config.gameType === 'hikoruka' ? Hikoruka.initial() : config.gameType === 'shavari' ? Shavari.initial() : config.gameType === 'shodansho' && !single ? createSdsValidator(config.maxPlayers) : null });
        socket.join(id);
        socket.emit('seatAssigned', { gameId: id, token: tokens[0], playerIndex: 0 });
        return game;
    }
    function tick() {
        const now = Date.now();
        for (const game of games.values()) {
            const ttl = game.gameOver ? 3600000 : game.started ? 21600000 : 1800000;
            if (now - game.lastActivity > ttl) { io.to(game.id).emit('roomClosed', 'This inactive room has expired.'); remove(game); continue; }
            if (game.gameType !== 'hikoro' || !game.started || game.gameOver || game.timeControl.main === -1) continue;
            const t = remainingTime(game, now);
            if (t.expired) { finish(game, t.color === 'white' ? 'black' : 'white', 'Timeout'); continue; }
            io.to(game.id).emit('timeUpdate', {
                whiteTime: t.color === 'white' ? t.display : game.whiteTimeLeft || game.timeControl.byoyomiTime,
                blackTime: t.color === 'black' ? t.display : game.blackTimeLeft || game.timeControl.byoyomiTime,
                isInByoyomiWhite: t.color === 'white' ? t.byoyomi : game.whiteTimeLeft <= 0,
                isInByoyomiBlack: t.color === 'black' ? t.byoyomi : game.blackTimeLeft <= 0 });
        }
    }
    const interval = setInterval(tick, 1000);
    interval.unref(); server.on('close', () => clearInterval(interval));
    io.on('connection', socket => {
        socket.emit('lobbyUpdate', Object.fromEntries(lobby));
        let createTimes = [];
        function canCreate() {
            createTimes = createTimes.filter(t => Date.now() - t < 60000);
            if (createTimes.length >= 5 || games.size >= 500) { err(socket, 'Please wait before creating another room.'); return false; }
            createTimes.push(Date.now()); return true;
        }
        socket.on('createGame', data => {
            const config = options(data);
            if (!config) return err(socket, 'Invalid game settings.');
            if (!canCreate()) return;
            const game = newGame(socket, config, false);
            lobby.set(game.id, { id: game.id, gameType: game.gameType, creatorName: config.name, timeControl: game.timeControl, currentPlayers: 1, maxPlayers: game.maxPlayers });
            socket.emit('gameCreated', { gameId: game.id, color: game.gameType === 'hikoro' ? 'white' : 'waiting' }); emitLobby();
        });
        socket.on('createSinglePlayerGame', data => {
            const config = options({ ...data, timeControl: { main: -1, byoyomiTime: 0 } });
            if (!config) return err(socket, 'Invalid game settings.');
            if (['shavari','hikoruka'].includes(config.gameType)) return err(socket, `Local play is available at /${config.gameType}.html.`);
            if (!canCreate()) return;
            socket.emit('gameStart', state(newGame(socket, config, true)));
        });
        socket.on('joinGame', id => {
            const game = games.get(id);
            if (!game || game.started || game.gameOver) return err(socket, 'This room is no longer available.');
            if (member(game, socket)) return err(socket, 'You are already in this room.');
            let index;
            if (game.gameType !== 'hikoro') {
                if (game.players.length >= game.maxPlayers) return err(socket, 'This room is full.');
                index = game.players.push(socket.id) - 1;
            } else { if (game.players.black) return err(socket, 'This room is full.'); game.players.black = socket.id; index = 1; }
            const token = ticket(); sessions.get(id).tokens[index] = token;
            socket.emit('seatAssigned', { gameId: id, token, playerIndex: index }); socket.join(id);
            game.lastActivity = Date.now();
            const count = game.gameType === 'hikoro' ? 2 : game.players.length;
            if (count === game.maxPlayers) {
                game.started = true; game.lastMoveTimestamp = Date.now(); lobby.delete(id);
                io.to(id).emit('gameStart', state(game));
            } else {
                lobby.get(id).currentPlayers = count;
                socket.emit('gameCreated', { gameId: id, color: 'waiting' });
            }
            emitLobby();
        });
        function resume(data, type) {
            const game = games.get(data?.gameId); const session = sessions.get(data?.gameId);
            const index = session?.tokens.indexOf(data?.token);
            if (!game || !session || index === -1 || index === undefined || game.gameType !== type)
                return err(socket, 'This seat could not be restored. Return to the lobby to start a new game.');
            const arraySeats = type !== 'hikoro';
            const oldId = arraySeats ? game.players[index] : game.players[index === 0 ? 'white' : 'black'];
            if (oldId !== socket.id && io.sockets.sockets.has(oldId)) io.sockets.sockets.get(oldId).leave(game.id);
            if (arraySeats) game.players[index] = socket.id;
            else { game.players[index === 0 ? 'white' : 'black'] = socket.id; if (game.isSinglePlayer) game.players.black = socket.id; }
            socket.join(game.id); game.lastActivity = Date.now();
            if (['shavari','hikoruka'].includes(type)) {
                if (!game.started) return socket.emit('gameCreated', { gameId: game.id, color: 'waiting' });
                sendVariant(game, socket);
            } else if (type === 'shodansho') socket.emit('sdsSync', { actions: game.sdsActions, playerIndex: index, playerCount: game.maxPlayers });
            else if (!game.started) socket.emit('gameCreated', { gameId: game.id, color: index === 0 ? 'white' : 'black' });
            else socket.emit('gameStart', state(game));
        }
        socket.on('resumeGame', data => resume(data, 'hikoro'));
        socket.on('joinSdsRoom', data => resume(data, 'shodansho'));
        socket.on('joinShavariRoom', data => resume(data, 'shavari'));
        socket.on('joinHikorukaRoom', data => resume(data, 'hikoruka'));
        for (const [type, rules] of [['shavari',Shavari],['hikoruka',Hikoruka]]) {
            socket.on(`${type}Action`, data => {
                const game = games.get(data?.gameId), engine = sessions.get(data?.gameId)?.engine;
                if (!game || game.gameType !== type || !game.started || game.gameOver || seat(game,socket) !== engine.player-1)
                    return err(socket,'Not your turn or this seat is no longer active.');
                const next = rules.apply(engine,data?.action);
                if (!next) return err(socket,'That move is not legal.');
                sessions.get(game.id).engine=next;game.lastActivity=Date.now();game.gameOver=Boolean(next.result);sendVariant(game);
            });
            socket.on(`${type}Resign`, data => {
                const game=games.get(data?.gameId);
                if (!game || game.gameType!==type || !game.started || game.gameOver || !member(game,socket))return err(socket,'You do not hold an active seat in this game.');
                finish(game,2-seat(game,socket),'Resignation');
            });
        }
        socket.on('makeGameMove', data => {
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
            const complete = game.isWhiteTurn !== next.isWhiteTurn;
            commitClock(game, now, complete);
            next.whiteTimeLeft = game.whiteTimeLeft; next.blackTimeLeft = game.blackTimeLeft; next.lastMoveTimestamp = game.lastMoveTimestamp;
            next.lastActivity = now; games.set(game.id, next);
            io.to(game.id).emit('gameStateUpdate', state(next));
        });
        socket.on('getValidMoves', data => {
            const game = games.get(data?.gameId);
            if (!game || game.gameType !== 'hikoro' || !member(game, socket)) return;
            socket.emit('validMoves', hikoroLogic.getValidMoves(game, data.data));
        });
        socket.on('sdsAction', data => {
            const game = games.get(data?.gameId); const engine = sessions.get(data?.gameId)?.engine;
            if (!game || !engine || !game.started || game.gameOver || seat(game, socket) !== engine.currentPlayer)
                return err(socket, 'Not your turn or this seat is no longer active.');
            if (game.sdsActions.length >= 10000) return err(socket, 'This room has reached its move limit.');
            let action;
            try { action = applySdsAction(engine, data.action); } catch { return err(socket, 'Invalid action data.'); }
            if (!action) return err(socket, 'That action is not legal.');
            game.sdsActions.push(action); game.lastActivity = Date.now(); game.gameOver = engine.phase === 'game_over';
            io.to(game.id).emit('sdsAction', action);
        });
        socket.on('leaveGame', id => {
            const game = games.get(id);
            if (!game || !member(game, socket)) return err(socket, 'You do not hold a seat in this room.');
            if (game.started && !game.isSinglePlayer && !game.gameOver) finish(game,
                game.gameType === 'hikoro' ? (seat(game, socket) === 0 ? 'black' : 'white') : ['shavari','hikoruka'].includes(game.gameType) ? 2 - seat(game, socket) : 'draw', 'A player left the room.');
            else io.to(id).emit('roomClosed', 'This room was closed.');
            socket.leave(id); remove(game);
        });
        socket.on('disconnect', () => {
            for (const game of games.values()) {
                if (!member(game, socket)) continue;
                if (game.started) continue; // Authenticated seats can reconnect after a page redirect or network interruption.
                if (game.gameType === 'hikoro') { remove(game); continue; }
                const index = game.players.indexOf(socket.id);
                game.players.splice(index, 1); sessions.get(game.id).tokens.splice(index, 1);
                if (!game.players.length) { remove(game); continue; }
                lobby.get(game.id).currentPlayers = game.players.length;
                game.players.forEach((id, i) => io.to(id).emit('seatAssigned', { gameId: game.id, token: sessions.get(game.id).tokens[i], playerIndex: i }));
                emitLobby();
            }
        });
    });
    return { server, io };
}
if (require.main === module) {
    const { server } = createServer();
    server.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${server.address().port}`));
}
module.exports = { createServer };
