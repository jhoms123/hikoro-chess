const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://hikorochess.org", "https://www.hikorochess.org", "http://localhost:3000"],
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;

// Serve the public folder for HTML, CSS, images, etc.
app.use(express.static('public'));

// Explicitly serve gamelogic.js from the root folder to the browser
app.get('/gamelogic.js', (req, res) => {
    res.sendFile(__dirname + '/gamelogic.js');
});

let games = {};
let lobbyGames = {};

const hikoroLogic = require('./gamelogic');

function gameTimerTick() {
    const now = Date.now();
    for (const gameId in games) {
        const game = games[gameId];
        if (!game || game.gameOver || game.timeControl.main === -1 || !game.players.black || !game.lastMoveTimestamp) continue;

        const activePlayerColor = game.isWhiteTurn ? 'white' : 'black';
        const opponentColor = game.isWhiteTurn ? 'black' : 'white';
        
        let timeLeft = game[`${activePlayerColor}TimeLeft`];
        const timeSpent = (now - game.lastMoveTimestamp) / 1000;
        let displayTime = timeLeft - timeSpent;
        let isInByoyomi = timeLeft <= 0;

        if (displayTime < 0) {
            isInByoyomi = true;
            const byoyomiTimeUsed = Math.abs(displayTime);
            if (game.timeControl.byoyomiTime > 0 && byoyomiTimeUsed > game.timeControl.byoyomiTime) {
                endGame(gameId, opponentColor, "Timeout");
                continue;
            }
            if (game.timeControl.byoyomiTime > 0) displayTime = game.timeControl.byoyomiTime - byoyomiTimeUsed;
            else {
                endGame(gameId, opponentColor, "Timeout");
                continue;
            }
        }

        io.to(gameId).emit('timeUpdate', {
            whiteTime: game.isWhiteTurn ? displayTime : game.whiteTimeLeft,
            blackTime: !game.isWhiteTurn ? displayTime : game.blackTimeLeft,
            isInByoyomiWhite: game.isWhiteTurn ? isInByoyomi : (game.whiteTimeLeft <= 0),
            isInByoyomiBlack: !game.isWhiteTurn ? isInByoyomi : (game.blackTimeLeft <= 0),
        });
    }
}
setInterval(gameTimerTick, 1000);

function updateTimeOnMove(game) {
    if (!game.lastMoveTimestamp || game.timeControl.main === -1) return;
    
    const now = Date.now();
    const timeSpent = (now - game.lastMoveTimestamp) / 1000;
    const playerWhoMovedColor = !game.isWhiteTurn ? 'white' : 'black';
    
    game[`${playerWhoMovedColor}TimeLeft`] -= timeSpent;
    if (game[`${playerWhoMovedColor}TimeLeft`] < 0) game[`${playerWhoMovedColor}TimeLeft`] = 0; 
    
    game.lastMoveTimestamp = now;
}

function endGame(gameId, winner, reason) {
    const game = games[gameId];
    if (game) {
        game.gameOver = true;
        game.winner = winner;
        game.reason = reason;
        const stateToSend = { ...game };
        delete stateToSend.logic;
        io.to(gameId).emit('gameStateUpdate', stateToSend);
    }
}

function createGameObject(gameId, timeControl, isSinglePlayer, socketId, gameType = 'hikoro', maxPlayers = 2) {
    return {
        id: gameId,
        gameType: gameType,
        maxPlayers: maxPlayers,
        logic: {
            makeMove: hikoroLogic.makeMove,
            getValidMoves: hikoroLogic.getValidMoves,
        },
        players: gameType === 'hikoro' 
            ? { white: socketId, black: isSinglePlayer ? socketId : null }
            : [socketId], // Treat SDS players as an array
        boardState: hikoroLogic.getInitialBoard(),
        isWhiteTurn: true,
        turnCount: 0,
        gameOver: false,
        timeControl,
        whiteTimeLeft: timeControl.main,
        blackTimeLeft: timeControl.main,
        lastMoveTimestamp: isSinglePlayer ? Date.now() : null,
        isSinglePlayer,
        moveList: [],
        whiteCaptured: [], blackCaptured: [],
        whitePrinceOnBoard: true, blackPrinceOnBoard: true,
        sdsActions: [] // Make sure this defaults to an array!
    };
}

io.on('connection', (socket) => {
    socket.emit('lobbyUpdate', lobbyGames);

    socket.on('createGame', (data) => {
        const { playerName, timeControl, gameType } = data;
        const gameId = `game_${Math.random().toString(36).substr(2, 9)}`;
        const tc = timeControl || { main: 300, byoyomiTime: 30 };
        const gt = gameType || 'hikoro';
        
        const sdsPlayerCount = data.sdsPlayerCount || 2;
        const maxPlayers = gt === 'shodansho' ? sdsPlayerCount : 2;
        
        games[gameId] = createGameObject(gameId, tc, false, socket.id, gt, maxPlayers);
        
        lobbyGames[gameId] = { id: gameId, gameType: gt, creatorName: playerName || 'Anonymous', timeControl: tc, currentPlayers: 1, maxPlayers: maxPlayers };
        
        socket.join(gameId);
        socket.emit('gameCreated', { gameId, color: gt === 'shodansho' ? 'waiting' : 'white' });
        io.emit('lobbyUpdate', lobbyGames);
    });

    socket.on('joinGame', (gameId) => {
        const game = games[gameId];
        if (!game) return socket.emit('errorMsg', 'Game not found.');

        if (game.gameType === 'shodansho') {
            if (game.players.length < game.maxPlayers && !game.players.includes(socket.id)) {
                game.players.push(socket.id);
                socket.join(gameId);
                
                if (lobbyGames[gameId]) {
                    lobbyGames[gameId].currentPlayers = game.players.length;
                    io.emit('lobbyUpdate', lobbyGames);
                }

                if (game.players.length === game.maxPlayers) {
                    delete lobbyGames[gameId];
                    io.emit('lobbyUpdate', lobbyGames);

                    game.started = true;
                    game.lastMoveTimestamp = Date.now();
                    const stateToSend = { ...game };
                    delete stateToSend.logic;
                    io.to(gameId).emit('gameStart', stateToSend);
                } else {
                    socket.emit('gameCreated', { gameId, color: 'waiting' });
                }
            } else {
                socket.emit('errorMsg', 'Game full or you are already in it.');
            }
        } else {
            // Hikoro
            if (!game.players.black) {
                game.players.black = socket.id;
                delete lobbyGames[gameId]; 
                socket.join(gameId);
                game.started = true;
                game.lastMoveTimestamp = Date.now();
                
                const stateToSend = { ...game };
                delete stateToSend.logic;
                io.to(gameId).emit('gameStart', stateToSend);
                io.emit('lobbyUpdate', lobbyGames);
            } else {
                socket.emit('errorMsg', 'Game full or not found.');
            }
        }
    });

    socket.on('createSinglePlayerGame', (data) => {
        const gt = (data && data.gameType) ? data.gameType : 'hikoro';
        const spCount = (data && data.sdsPlayerCount) ? data.sdsPlayerCount : 2;
        const gameId = `sp_${Math.random().toString(36).substr(2, 9)}`;
        const tc = { main: -1, byoyomiTime: 0 };
        
        games[gameId] = createGameObject(gameId, tc, true, socket.id, gt, spCount);
        games[gameId].started = true;
        
        socket.join(gameId);
        const stateToSend = { ...games[gameId] };
        delete stateToSend.logic;
        socket.emit('gameStart', stateToSend);
    });

    socket.on('makeGameMove', (data) => {
        const { gameId, move } = data;
        const game = games[gameId];
        if (!game) return socket.emit('errorMsg', 'Game not found.');

        let playerColor = game.players.white === socket.id ? 'white' : 'black';
        if (game.isSinglePlayer) playerColor = game.isWhiteTurn ? 'white' : 'black';

        // Turn Validation
        const isTurn = (playerColor === 'white' && game.isWhiteTurn) || (playerColor === 'black' && !game.isWhiteTurn);
        if (!isTurn && move.type !== 'resign') return socket.emit('errorMsg', "Not your turn.");

        updateTimeOnMove(game);
        if (game.gameOver) return;

        const result = game.logic.makeMove(game, move, playerColor);

        if (result.success) {
            // Re-attach logic functions (they are lost on struct copy/JSON parse)
            const originalLogic = game.logic;
            games[gameId] = result.updatedGame;
            games[gameId].logic = originalLogic;

            const stateToSend = { ...games[gameId] };
            delete stateToSend.logic;
            io.to(gameId).emit('gameStateUpdate', stateToSend);
        } else {
            socket.emit('errorMsg', result.error);
        }
    });

    socket.on('getValidMoves', (data) => {
        const { gameId, data: moveData } = data;
        const game = games[gameId];
        if (game && game.logic) {
            socket.emit('validMoves', game.logic.getValidMoves(game, moveData));
        }
    });

    // Sho Dan Sho Action Syncing
    socket.on('joinSdsRoom', (gameId) => {
        socket.join(gameId);
        if (games[gameId]) {
            // Always emit sdsSync to tell client to unblock, even if empty array!
            socket.emit('sdsSync', games[gameId].sdsActions || []);
        }
    });

    socket.on('sdsAction', (data) => {
        const game = games[data.gameId];
        if (game) {
            if (!game.sdsActions) game.sdsActions = [];
            game.sdsActions.push(data.action);
        }
        io.to(data.gameId).emit('sdsAction', data.action);
    });

    socket.on('leaveGame', (gameId) => {
        const game = games[gameId];
        if (game) {
            if (!game.isSinglePlayer && !game.gameOver) {
                endGame(gameId, game.players.white === socket.id ? 'black' : 'white', "Opponent Forfeited");
            }
            delete games[gameId];
            delete lobbyGames[gameId];
            io.emit('lobbyUpdate', lobbyGames);
        }
    });

    socket.on('disconnect', () => {
        for (const gameId in games) {
            const game = games[gameId];
            if ((game.gameType === 'hikoro' && (game.players.white === socket.id || game.players.black === socket.id)) ||
                (game.gameType === 'shodansho' && game.players.includes && game.players.includes(socket.id))) {
                
                // Do not delete game if it hasn't fully started yet (lobby abandonment)
                if (game.gameType === 'shodansho' && !game.started) {
                    game.players = game.players.filter(id => id !== socket.id);
                    if (lobbyGames[gameId]) {
                        lobbyGames[gameId].currentPlayers = game.players.length;
                        io.emit('lobbyUpdate', lobbyGames);
                    }
                    if (game.players.length === 0) {
                        delete games[gameId];
                        delete lobbyGames[gameId];
                        io.emit('lobbyUpdate', lobbyGames);
                    }
                    continue;
                }

                if (!game.isSinglePlayer && !game.gameOver) {
                    endGame(gameId, "disconnected", "Player Disconnected");
                }
                delete games[gameId];
                delete lobbyGames[gameId];
                io.emit('lobbyUpdate', lobbyGames);
            }
        }
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));