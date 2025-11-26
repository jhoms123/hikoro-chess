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

app.use(express.static('public'));

let games = {};
let lobbyGames = {};

const hikoroLogic = require('./gamelogic');
const goLogic = require('./goGameLogic');

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

function createGameObject(gameId, gameType, clientBoardSize, timeControl, isSinglePlayer, socketId) {
    const isHikoro = gameType === 'hikoro';
    const boardSize = (gameType === 'go' && clientBoardSize) ? clientBoardSize : 19;
    const logicModule = isHikoro ? hikoroLogic : goLogic;
    
    let initialBoardState, initialMustShieldAt = null;
    if (isHikoro) {
        initialBoardState = hikoroLogic.getInitialBoard();
    } else {
        const data = goLogic.getInitialGoBoard(boardSize);
        initialBoardState = data.board;
        initialMustShieldAt = data.mustShieldAt;
    }

    const game = {
        id: gameId,
        gameType,
        boardSize: isHikoro ? null : boardSize,
        logic: {
            makeMove: isHikoro ? hikoroLogic.makeMove : goLogic.makeGoMove,
            getValidMoves: isHikoro ? hikoroLogic.getValidMoves : goLogic.getValidMoves,
        },
        players: { white: socketId, black: isSinglePlayer ? socketId : null },
        boardState: initialBoardState,
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
        score: { black: 0, white: 0, details: {} },
        mustShieldAt: initialMustShieldAt,
        previousBoardState: null 
    };

    if (gameType === 'go') game.score = goLogic.calculateScore(game.boardState, 0, 0);
    return game;
}

io.on('connection', (socket) => {
    socket.emit('lobbyUpdate', lobbyGames);

    socket.on('createGame', (data) => {
        const { playerName, timeControl, gameType, boardSize } = data;
        const gameId = `game_${Math.random().toString(36).substr(2, 9)}`;
        const tc = timeControl || { main: 300, byoyomiTime: 30 };
        
        games[gameId] = createGameObject(gameId, gameType, boardSize, tc, false, socket.id);
        
        lobbyGames[gameId] = { id: gameId, gameType, creatorName: playerName || 'Anonymous', timeControl: tc };
        
        socket.join(gameId);
        socket.emit('gameCreated', { gameId, color: 'white' });
        io.emit('lobbyUpdate', lobbyGames);
    });

    socket.on('joinGame', (gameId) => {
        const game = games[gameId];
        if (game && !game.players.black) {
            game.players.black = socket.id;
            delete lobbyGames[gameId]; 
            socket.join(gameId);
            game.lastMoveTimestamp = Date.now();
            
            const stateToSend = { ...game };
            delete stateToSend.logic;
            io.to(gameId).emit('gameStart', stateToSend);
            io.emit('lobbyUpdate', lobbyGames);
        } else {
            socket.emit('errorMsg', 'Game full or not found.');
        }
    });

    socket.on('createSinglePlayerGame', (data) => {
        const { gameType, boardSize } = data;
        const gameId = `sp_${Math.random().toString(36).substr(2, 9)}`;
        const tc = { main: -1, byoyomiTime: 0 };
        
        games[gameId] = createGameObject(gameId, gameType, boardSize, tc, true, socket.id);
        
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
            if (game.players.white === socket.id || game.players.black === socket.id) {
                if (!game.isSinglePlayer && !game.gameOver) {
                    endGame(gameId, game.players.white === socket.id ? 'black' : 'white', "Opponent Disconnected");
                }
                delete games[gameId];
                delete lobbyGames[gameId];
                io.emit('lobbyUpdate', lobbyGames);
            }
        }
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));