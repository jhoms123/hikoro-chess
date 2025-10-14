const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://hikorochess.org", "https://www.hikorochess.org", "https://hikoro-chess.onrender.com"],
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 20000 
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let games = {};
let lobbyGames = {};

const { getInitialBoard, getValidMovesForPiece, isPositionValid } = require('./gamelogic');

function stopTimer(game) {
    if (game && game.timerId) {
        clearInterval(game.timerId);
        game.timerId = null;
    }
}

// Stable, standalone function to handle the game timer tick
function gameTick(gameId) {
    const game = games[gameId];
    // If the game ended or was deleted for any reason, stop.
    if (!game) { 
        return; 
    }
    if (game.gameOver) {
        stopTimer(game);
        return;
    }

    const activePlayer = game.isWhiteTurn ? 'white' : 'black';
    const opponent = game.isWhiteTurn ? 'black' : 'white';
    
    if (game[activePlayer + 'Time'] > 0) {
        game[activePlayer + 'Time']--;
    } else if (game.byoyomi > 0 && !game[activePlayer + 'InByoyomi']) {
        // Player's main time is out, enter byoyomi period.
        game[activePlayer + 'InByoyomi'] = true;
        game[activePlayer + 'Time'] = game.byoyomi;
    } else {
        // Time has fully run out.
        console.log(`Game ${gameId} ended. ${activePlayer} ran out of time.`);
        game.gameOver = true;
        game.winner = opponent;
        io.to(gameId).emit('gameStateUpdate', game);
        stopTimer(game);
        delete games[gameId]; // Clean up the finished game
        return; 
    }
    
    // Send the updated time to the clients
    io.to(gameId).emit('timeUpdate', { 
        whiteTime: game.whiteTime, 
        blackTime: game.blackTime 
    });
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.emit('lobbyUpdate', lobbyGames);

    socket.on('createGame', (settings) => {
        const gameId = `game_${Math.random().toString(36).substr(2, 9)}`;
        const timeControl = parseInt(settings.timeControl, 10);
        const byoyomi = parseInt(settings.byoyomi, 10);

        games[gameId] = {
            id: gameId,
            players: { white: socket.id, black: null },
            boardState: getInitialBoard(),
            whiteCaptured: [],
            blackCaptured: [],
            isWhiteTurn: true,
            turnCount: 0,
            bonusMoveInfo: null,
            gameOver: false,
            winner: null,
            timeControl: timeControl,
            byoyomi: byoyomi,
            whiteTime: timeControl,
            blackTime: timeControl,
            whiteInByoyomi: false,
            blackInByoyomi: false,
            timerId: null
        };
        lobbyGames[gameId] = { id: gameId, white: socket.id, black: null };
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
            io.to(gameId).emit('gameStart', game);
            io.emit('lobbyUpdate', lobbyGames);
            
            // Start the game timer if time control is enabled
            if (game.timeControl > 0) {
                console.log(`Starting timer for game ${gameId}.`);
                game.timerId = setInterval(() => gameTick(gameId), 1000);
            }
        } else {
            socket.emit('errorMsg', 'Game is full or does not exist.');
        }
    });
    
    socket.on('getValidMoves', (data) => {
        const { gameId, square } = data;
        const game = games[gameId];
        if (!game || !square) return;

        let bonusMoveActive = false;
        if (game.bonusMoveInfo) {
            if (square.x !== game.bonusMoveInfo.pieceX || square.y !== game.bonusMoveInfo.pieceY) {
                socket.emit('validMoves', []); 
                return;
            }
            bonusMoveActive = true;
        }

        const piece = game.boardState[square.y][square.x];
        if (piece) {
            const validMoves = getValidMovesForPiece(piece, square.x, square.y, game.boardState, bonusMoveActive);
            socket.emit('validMoves', validMoves);
        }
    });

    socket.on('makeMove', (data) => {
        const { gameId, from, to } = data;
        const game = games[gameId];
        if (!game || game.gameOver) return;

        const playerColor = game.players.white === socket.id ? 'white' : 'black';
        const isTurn = (playerColor === 'white' && game.isWhiteTurn) || (playerColor === 'black' && !game.isWhiteTurn);
        if (!isTurn) return;

        const piece = game.boardState[from.y][from.x];
        if (!piece || piece.color !== playerColor) return;
        
        let bonusMoveActive = false;
        if (game.bonusMoveInfo) {
            if (from.x !== game.bonusMoveInfo.pieceX || from.y !== game.bonusMoveInfo.pieceY) return;
            bonusMoveActive = true;
        }
        const validMoves = getValidMovesForPiece(piece, from.x, from.y, game.boardState, bonusMoveActive);
        const isValidMove = validMoves.some(m => m.x === to.x && m.y === to.y);

        if (isValidMove) {
            const targetPiece = game.boardState[to.y][to.x];
            const wasCapture = targetPiece !== null;
            
            if (piece.type === 'jotu') {
                const dx = Math.sign(to.x - from.x);
                const dy = Math.sign(to.y - from.y);
                if (Math.abs(to.x - from.x) > 1 || Math.abs(to.y - from.y) > 1) {
                    let cx = from.x + dx;
                    let cy = from.y + dy;
                    while (cx !== to.x || cy !== to.y) {
                        const intermediatePiece = game.boardState[cy][cx];
                        if (intermediatePiece && intermediatePiece.color === playerColor) {
                             if (intermediatePiece.type !== 'greathorsegeneral' && intermediatePiece.type !== 'cthulhu') {
                                 let pieceForHand = { type: intermediatePiece.type, color: playerColor };
                                 const capturedArray = playerColor === 'white' ? game.whiteCaptured : game.blackCaptured;
                                 if (capturedArray.length < 6) {
                                     capturedArray.push(pieceForHand);
                                 }
                            }
                            game.boardState[cy][cx] = null;
                        }
                        cx += dx;
                        cy += dy;
                    }
                }
            }

            if (targetPiece !== null) {
                const indestructiblePieces = ['greathorsegeneral', 'cthulhu', 'mermaid'];
                if (targetPiece.type === 'neptune') {
                    const losingPlayerColor = targetPiece.color;
                    const pieceForHand = { type: 'mermaid', color: losingPlayerColor };
                    const capturedArray = losingPlayerColor === 'white' ? game.whiteCaptured : game.blackCaptured;
                    if (capturedArray.length < 6) {
                        capturedArray.push(pieceForHand);
                    }
                } else if (!indestructiblePieces.includes(targetPiece.type)) {
                    let pieceForHand = { type: targetPiece.type, color: playerColor }; 
                    if (targetPiece.type === 'lupa') {
                        pieceForHand.type = 'sult';
                    }
                    const capturedArray = playerColor === 'white' ? game.whiteCaptured : game.blackCaptured;
                    if (capturedArray.length < 6) {
                        capturedArray.push(pieceForHand);
                    }
                }
            }
            
            game.boardState[to.y][to.x] = piece;
            game.boardState[from.y][from.x] = null;
            
            handlePromotion(piece, to.y, wasCapture);
            checkForWinner(game);
            
            if (game[playerColor + 'InByoyomi']) {
                game[playerColor + 'Time'] = game.byoyomi;
            }

            game.turnCount++;
            if (bonusMoveActive) {
                game.bonusMoveInfo = null;
                game.isWhiteTurn = !game.isWhiteTurn;
            } else if (piece.type === 'greathorsegeneral' && !wasCapture) {
                game.bonusMoveInfo = { pieceX: to.x, pieceY: to.y };
            } else if (piece.type === 'cope' && wasCapture) {
                game.bonusMoveInfo = { pieceX: to.x, pieceY: to.y };
            } else {
                game.bonusMoveInfo = null;
                game.isWhiteTurn = !game.isWhiteTurn;
            }
            io.to(gameId).emit('gameStateUpdate', game);
        }
    });
    
    socket.on('makeDrop', (data) => {
        const { gameId, piece, to } = data;
        const game = games[gameId];
        if (!game || game.gameOver) return;

        const playerColor = game.players.white === socket.id ? 'white' : 'black';
        const isTurn = (playerColor === 'white' && game.isWhiteTurn) || (playerColor === 'black' && !game.isWhiteTurn);
        if (!isTurn) return;
        
        if (game.boardState[to.y][to.x] === null && isPositionValid(to.x, to.y)) {
             const capturedArray = playerColor === 'white' ? game.whiteCaptured : game.blackCaptured;
             const pieceIndex = capturedArray.findIndex(p => p.type === piece.type && p.color === playerColor);
             if (pieceIndex > -1) {
                game.boardState[to.y][to.x] = { type: piece.type, color: playerColor };
                capturedArray.splice(pieceIndex, 1);
                
                if (game[playerColor + 'InByoyomi']) {
                    game[playerColor + 'Time'] = game.byoyomi;
                }
            
                game.bonusMoveInfo = null;
                game.isWhiteTurn = !game.isWhiteTurn;
                game.turnCount++;
                io.to(gameId).emit('gameStateUpdate', game);
             }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const gameId in games) {
            const game = games[gameId];
            if (game.players.white === socket.id || game.players.black === socket.id) {
                stopTimer(game);
                if(!game.gameOver) {
                    game.gameOver = true;
                    game.winner = game.players.white === socket.id ? 'black' : 'white';
                    io.to(gameId).emit('gameStateUpdate', game);
                }
                delete games[gameId];
                delete lobbyGames[gameId];
                io.emit('lobbyUpdate', lobbyGames);
                console.log(`Game ${gameId} removed due to disconnect.`);
                break;
            }
        }
    });
});

function handlePromotion(piece, y, wasCapture) {
    const color = piece.color;
    if (piece.type === 'greathorsegeneral' && wasCapture) piece.type = 'cthulhu';
    if (piece.type === 'mermaid' && wasCapture) piece.type = 'neptune';
    if (piece.type === 'fin' && wasCapture) piece.type = 'finor';
    const promotablePawns = ['sult', 'pawn', 'pilut'];
    if (promotablePawns.includes(piece.type)) {
        const inPromotionZone = (color === 'white' && y > 8) || (color === 'black' && y < 7);
        if (inPromotionZone) {
            if (piece.type === 'pilut') piece.type = 'greatshield';
            else piece.type = 'chair';
        }
    }
}

function checkForWinner(game) {
    let winnerFound = false;
    const winSquares = [ {x:0,y:7},{x:1,y:7},{x:8,y:7},{x:9,y:7},{x:0,y:8},{x:1,y:8},{x:8,y:8},{x:9,y:8} ];
    for (const square of winSquares) {
        const pieceOnSquare = game.boardState[square.y][square.x];
        if (pieceOnSquare && pieceOnSquare.type === 'lupa') {
            game.winner = pieceOnSquare.color;
            winnerFound = true;
            break;
        }
    }
    if (!winnerFound) {
        let whiteLupaCount = 0;
        let blackLupaCount = 0;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 10; x++) {
            const piece = game.boardState[y][x];
            if (piece && piece.type === 'lupa') {
                if (piece.color === 'white') whiteLupaCount++; else blackLupaCount++;
            }
        }
        if (blackLupaCount === 0) { game.winner = 'white'; winnerFound = true; }
        else if (whiteLupaCount === 0) { game.winner = 'black'; winnerFound = true; }
    }
    if (winnerFound) {
        game.gameOver = true;
        stopTimer(game);
    }
}

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));