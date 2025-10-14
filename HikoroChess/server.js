// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://hikorochess.org", "https://www.hikorochess.org", "https://hikoro-chess.onrender.com"],
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let games = {};
let lobbyGames = {};

const { getInitialBoard, getValidMovesForPiece, isPositionValid } = require('./gamelogic');


io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.emit('lobbyUpdate', lobbyGames);

    socket.on('createGame', () => {
        const gameId = `game_${Math.random().toString(36).substr(2, 9)}`;
        games[gameId] = {
            id: gameId,
            players: { white: socket.id, black: null },
            boardState: getInitialBoard(),
            whiteCaptured: [],
            blackCaptured: [],
            isWhiteTurn: true,
            bonusMoveInfo: null,
            gameOver: false,
            winner: null
        };
        lobbyGames[gameId] = { id: gameId, white: socket.id, black: null };
        socket.join(gameId);
        socket.emit('gameCreated', { gameId, color: 'white' });
        io.emit('lobbyUpdate', lobbyGames);
        console.log(`Game created: ${gameId} by ${socket.id}`);
    });

    socket.on('joinGame', (gameId) => {
        const game = games[gameId];
        if (game && !game.players.black) {
            game.players.black = socket.id;
            lobbyGames[gameId].black = socket.id;
            socket.join(gameId);
            delete lobbyGames[gameId];
            console.log(`${socket.id} joined game ${gameId} as black.`);
            io.to(gameId).emit('gameStart', game);
            io.emit('lobbyUpdate', lobbyGames);
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

    // MODIFIED: To handle Great Horse General captures
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
            if (from.x !== game.bonusMoveInfo.pieceX || from.y !== game.bonusMoveInfo.pieceY) {
                return;
            }
            bonusMoveActive = true;
        }

        const validMoves = getValidMovesForPiece(piece, from.x, from.y, game.boardState, bonusMoveActive);
        const isValidMove = validMoves.some(m => m.x === to.x && m.y === to.y);

        if (isValidMove) {
            const targetPiece = game.boardState[to.y][to.x];
            const wasCapture = targetPiece !== null;

            if (targetPiece !== null) {
                // ADDED: GHG is permanently lost when captured
                if (targetPiece.type !== 'greathorsegeneral') {
                    let pieceForHand = { type: targetPiece.type, color: targetPiece.color };
                    if (pieceForHand.type === 'finor') pieceForHand.type = 'fin';
                    if (pieceForHand.type === 'greatshield') pieceForHand.type = 'pilut';
                    if (pieceForHand.type === 'chair') pieceForHand.type = 'pawn'; 

                    if (playerColor === 'white' && game.whiteCaptured.length < 6) game.whiteCaptured.push(pieceForHand);
                    else if (playerColor === 'black' && game.blackCaptured.length < 6) game.blackCaptured.push(pieceForHand);
                }
            }
            
            game.boardState[to.y][to.x] = piece;
            game.boardState[from.y][from.x] = null;
            
            handlePromotion(piece, to.y, wasCapture);
            
            // This now checks for both win conditions
            checkForWinner(game);

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
             game.boardState[to.y][to.x] = { type: piece.type, color: playerColor };
             const capturedArray = playerColor === 'white' ? game.whiteCaptured : game.blackCaptured;
             const pieceIndex = capturedArray.findIndex(p => p.type === piece.type);
             if (pieceIndex > -1) {
                capturedArray.splice(pieceIndex, 1);
                game.bonusMoveInfo = null;
                game.isWhiteTurn = !game.isWhiteTurn;
                io.to(gameId).emit('gameStateUpdate', game);
             }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const gameId in games) {
            const game = games[gameId];
            if (game.players.white === socket.id || game.players.black === socket.id) {
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
    // --- 1. Lupa Sanctuary Win Condition ---
    const winSquares = [
        {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
        {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
    ];

    for (const square of winSquares) {
        const pieceOnSquare = game.boardState[square.y][square.x];
        if (pieceOnSquare && pieceOnSquare.type === 'lupa') {
            game.gameOver = true;
            game.winner = pieceOnSquare.color;
            return; // Game is over, no need to check further
        }
    }

    // --- 2. Lupa Capture Win Condition (Corrected Logic) ---
    // This condition is met only when a player has ZERO Lupas left.
    let whiteLupaCount = 0;
    let blackLupaCount = 0;
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 10; x++) {
            const piece = game.boardState[y][x];
            if (piece && piece.type === 'lupa') {
                if (piece.color === 'white') whiteLupaCount++;
                else blackLupaCount++;
            }
        }
    }

    if (blackLupaCount === 0) {
        game.gameOver = true;
        game.winner = 'white';
    } else if (whiteLupaCount === 0) {
        game.gameOver = true;
        game.winner = 'black';
    }
}


server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));