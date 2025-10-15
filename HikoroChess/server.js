//server.js

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


function gameTimerTick() {
    const now = Date.now();
    for (const gameId in games) {
        const game = games[gameId];
        
        if (game && game.timeControl && game.timeControl.main === -1) {
            continue;
        }

        if (!game || game.gameOver || !game.players.black || !game.lastMoveTimestamp) {
            continue;
        }

        const activePlayerColor = game.isWhiteTurn ? 'white' : 'black';
        const opponentColor = game.isWhiteTurn ? 'black' : 'white';

        let timeLeft = game[`${activePlayerColor}TimeLeft`];
        let byoyomiPeriodsLeft = game[`${activePlayerColor}ByoyomiPeriodsLeft`];
        const { byoyomiTime } = game.timeControl;

        const timeSpent = (now - game.lastMoveTimestamp) / 1000;
        
        let displayTime = timeLeft - timeSpent;
        let displayByoyomi = byoyomiPeriodsLeft;
        let isInByoyomi = timeLeft <= 0;

        if (displayTime < 0) {
            isInByoyomi = true;
            const byoyomiTimeUsed = Math.abs(displayTime);

            // CORE FIX: Check if the time used this turn exceeds the byoyomi allowance.
            if (byoyomiTime > 0 && byoyomiTimeUsed > byoyomiTime) {
                game.gameOver = true;
                game.winner = opponentColor;
                io.to(gameId).emit('gameStateUpdate', game);
                continue;
            }
            
            // Calculate time left in the current byoyomi period for the live display
            if (byoyomiTime > 0) {
                displayTime = byoyomiTime - byoyomiTimeUsed;
            }
        }

        const timeUpdatePayload = {
            whiteTime: game.isWhiteTurn ? displayTime : game.whiteTimeLeft,
            blackTime: !game.isWhiteTurn ? displayTime : game.blackTimeLeft,
            whiteByoyomi: game.isWhiteTurn ? displayByoyomi : game.whiteByoyomiPeriodsLeft,
            blackByoyomi: !game.isWhiteTurn ? displayByoyomi : game.blackByoyomiPeriodsLeft,
            isInByoyomiWhite: game.isWhiteTurn ? isInByoyomi : (game.whiteTimeLeft <= 0),
            isInByoyomiBlack: !game.isWhiteTurn ? isInByoyomi : (game.blackTimeLeft <= 0),
        };
        
        io.to(gameId).emit('timeUpdate', timeUpdatePayload);
    }
}



setInterval(gameTimerTick, 1000);


function updateTimeOnMove(game) {
    if (!game.lastMoveTimestamp || (game.timeControl && game.timeControl.main === -1)) {
        return;
    }

    const now = Date.now();
    const timeSpent = (now - game.lastMoveTimestamp) / 1000;
    const activePlayerColor = game.isWhiteTurn ? 'white' : 'black';
    const opponentColor = game.isWhiteTurn ? 'black' : 'white';
    
    let timeLeft = game[`${activePlayerColor}TimeLeft`];
    const { byoyomiTime } = game.timeControl;

    timeLeft -= timeSpent;

    if (timeLeft < 0) {
        const byoyomiTimeUsed = Math.abs(timeLeft);
        
        // CORE FIX: Check if the time used this turn exceeds the byoyomi allowance.
        if (byoyomiTime > 0 && byoyomiTimeUsed > byoyomiTime) {
            game.gameOver = true;
            game.winner = opponentColor;
        }
        
        timeLeft = 0; // Main time is now considered 0.
    }
    
    game[`${activePlayerColor}TimeLeft`] = timeLeft;
    game.lastMoveTimestamp = now;
}


io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.emit('lobbyUpdate', lobbyGames);

    socket.on('createGame', (data) => {
		
		console.log(`'createGame' event received from ${socket.id} with data:`, data);
		
		
		const { playerName, timeControl } = data || {}; 

		const gameId = `game_${Math.random().toString(36).substr(2, 9)}`;
		const tc = timeControl && timeControl.main !== undefined ? timeControl : { main: 300, byoyomiTime: 30, byoyomiPeriods: 3 };

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
			timeControl: tc,
			whiteTimeLeft: tc.main,
			blackTimeLeft: tc.main,
			whiteByoyomiPeriodsLeft: tc.byoyomiPeriods,
			blackByoyomiPeriodsLeft: tc.byoyomiPeriods,
			lastMoveTimestamp: null
		};
		
		lobbyGames[gameId] = { 
			id: gameId, 
			white: socket.id, 
			black: null,
			creatorName: playerName || 'Anonymous', 
			timeControl: tc          
		};

		socket.join(gameId);
		socket.emit('gameCreated', { gameId, color: 'white' });
		
		
		console.log("Broadcasting 'lobbyUpdate' with data:", lobbyGames);

		io.emit('lobbyUpdate', lobbyGames);
		console.log(`Game created: ${gameId} by ${playerName} (${socket.id})`);
	});

    socket.on('joinGame', (gameId) => {
        const game = games[gameId];
        if (game && !game.players.black) {
            game.players.black = socket.id;
            lobbyGames[gameId].black = socket.id;
            socket.join(gameId);
            delete lobbyGames[gameId];
            console.log(`${socket.id} joined game ${gameId} as black.`);
            
            game.lastMoveTimestamp = Date.now();

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

    // Check if the game is in a bonus move state
    let bonusMoveActive = false;
    if (game.bonusMoveInfo) {
        // If a bonus move is active, only the piece that earned it can be selected.
        if (square.x !== game.bonusMoveInfo.pieceX || square.y !== game.bonusMoveInfo.pieceY) {
            socket.emit('validMoves', []); // Send back empty array if wrong piece is clicked
            return;
        }
        bonusMoveActive = true;
    }

    const piece = game.boardState[square.y][square.x];
    if (piece) {
        const validMoves = getValidMovesForPiece(piece, square.x, square.y, game.boardState, bonusMoveActive);
        socket.emit('validMoves', validMoves);
    } else {
        socket.emit('validMoves', []); // No piece on the square, so no valid moves
    }
});
    
    socket.on('makeMove', (data) => {
    const { gameId, from, to } = data;
    const game = games[gameId];
    if (!game || game.gameOver) return;

    // --- START OF CORRECTED LOGIC ---
    let playerColor; // Declare playerColor in the function's scope
    let isTurn = false;

    // Determine the active player's color and check if it's their turn
    if (game.isSinglePlayer) {
        // In single-player/bot games, any move is allowed, but we track the turn color
        playerColor = game.isWhiteTurn ? 'white' : 'black';
        isTurn = true; 
    } else {
        // In a two-player game, verify the move comes from the correct player
        playerColor = game.players.white === socket.id ? 'white' : 'black';
        isTurn = (playerColor === 'white' && game.isWhiteTurn) || (playerColor === 'black' && !game.isWhiteTurn);
    }
    
    if (!isTurn) {
        // Silently ignore moves from the wrong player in a two-player game
        return;
    }
    // --- END OF CORRECTED LOGIC ---

    updateTimeOnMove(game);
    if (game.gameOver) { // This handles game over by timeout
        io.to(gameId).emit('gameStateUpdate', game);
        return;
    }

    const piece = game.boardState[from.y][from.x];
    
    // Validate that the piece exists and belongs to the current player
    if (!piece || piece.color !== playerColor) {
        return;
    }

    let bonusMoveActive = false;
    if (game.bonusMoveInfo) {
        if (from.x !== game.bonusMoveInfo.pieceX || from.y !== game.bonusMoveInfo.pieceY) {
            return; // Trying to move a different piece during a bonus move
        }
        bonusMoveActive = true;
    }

    const validMoves = getValidMovesForPiece(piece, from.x, from.y, game.boardState, bonusMoveActive);
    const isValidMove = validMoves.some(m => m.x === to.x && m.y === to.y);

    if (isValidMove) {
        // ---- The rest of your move logic remains the same ---- //
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
	
	socket.on('createSinglePlayerGame', () => {
        const gameId = `sp_game_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`Creating single-player game: ${gameId} for ${socket.id}`);

        const tc = { main: -1, byoyomiTime: 0, byoyomiPeriods: 0 }; // Unlimited time for single player

        const game = {
            id: gameId,
            players: { white: socket.id, black: socket.id }, // You control both
            boardState: getInitialBoard(),
            whiteCaptured: [],
            blackCaptured: [],
            isWhiteTurn: true,
            turnCount: 0,
            bonusMoveInfo: null,
            gameOver: false,
            winner: null,
            timeControl: tc,
            whiteTimeLeft: tc.main,
            blackTimeLeft: tc.main,
            whiteByoyomiPeriodsLeft: tc.byoyomiPeriods,
            blackByoyomiPeriodsLeft: tc.byoyomiPeriods,
            lastMoveTimestamp: Date.now(),
            isSinglePlayer: true // The important flag for the client
        };

        // Store the game on the server
        games[gameId] = game;

        // Join the socket to a room for this game
        socket.join(gameId);

        // Send the game state directly back to the player to start the game
        socket.emit('gameStart', game);
    });
    
    socket.on('makeDrop', (data) => {
		const { gameId, piece, to } = data;
		const game = games[gameId];
		if (!game || game.gameOver) return;

		// --- START OF FIX ---
		// Only perform the turn check if it's NOT a single-player game.
		let playerColor;
		if (!game.isSinglePlayer) {
			playerColor = game.players.white === socket.id ? 'white' : 'black';
			const isTurn = (playerColor === 'white' && game.isWhiteTurn) || (playerColor === 'black' && !game.isWhiteTurn);
			if (!isTurn) return;
		} else {
			// In single player, the color is determined by whose turn it is.
			playerColor = game.isWhiteTurn ? 'white' : 'black';
		}
		// --- END OF FIX ---

		updateTimeOnMove(game);
		if (game.gameOver) {
			io.to(gameId).emit('gameStateUpdate', game);
			return;
		}

		if (game.boardState[to.y][to.x] === null && isPositionValid(to.x, to.y)) {
			game.boardState[to.y][to.x] = { type: piece.type, color: playerColor };
			const capturedArray = playerColor === 'white' ? game.whiteCaptured : game.blackCaptured;
			// In single-player, piece.color from the client can be ambiguous, so we check against the current turn's color
			const pieceIndex = capturedArray.findIndex(p => p.type === piece.type && p.color === playerColor);
			if (pieceIndex > -1) {
				capturedArray.splice(pieceIndex, 1);
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
    
    if (piece.type === 'greathorsegeneral' && wasCapture) {
        piece.type = 'cthulhu';
    }

    if (piece.type === 'mermaid' && wasCapture) {
        piece.type = 'neptune';
    }
    
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
    if (game.gameOver) return;

    const winSquares = [
        {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
        {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
    ];

    for (const square of winSquares) {
        const pieceOnSquare = game.boardState[square.y][square.x];
        if (pieceOnSquare && pieceOnSquare.type === 'lupa') {
            game.gameOver = true;
            game.winner = pieceOnSquare.color;
            return;
        }
    }

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

    if (blackLupaCount < 2 && game.turnCount > 1) {
        game.gameOver = true;
        game.winner = 'white';
    } else if (whiteLupaCount < 2 && game.turnCount > 1) {
        game.gameOver = true;
        game.winner = 'black';
    }
}

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));