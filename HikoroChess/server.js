const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://hikorochess.org", "https://www.hikorochess.org", "https://hikoro-chess.onrender.com", "http://localhost:3000"],
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let games = {};
let lobbyGames = {};

// --- MODIFIED: Import both logic modules ---
const hikoroLogic = require('./public/gamelogic');
const goLogic = require('./public/goGameLogic'); // NEW


// --- Timer functions (unchanged) ---
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
        const { byoyomiTime } = game.timeControl;

        const timeSpent = (now - game.lastMoveTimestamp) / 1000;

        let displayTime = timeLeft - timeSpent;
        let isInByoyomi = timeLeft <= 0;

        if (displayTime < 0) {
            isInByoyomi = true;
            const byoyomiTimeUsed = Math.abs(displayTime);

            if (byoyomiTime > 0 && byoyomiTimeUsed > byoyomiTime) {
                game.gameOver = true;
                game.winner = opponentColor;
                game.reason = "Timeout";
                io.to(gameId).emit('gameStateUpdate', game);
                continue;
            }

            if (byoyomiTime > 0) {
                displayTime = byoyomiTime - byoyomiTimeUsed;
            } else {
                 // No byoyomi, timeout occurred earlier
                 game.gameOver = true;
                 game.winner = opponentColor;
                 game.reason = "Timeout";
                 io.to(gameId).emit('gameStateUpdate', game);
                 continue;
            }
        }

        const timeUpdatePayload = {
            whiteTime: game.isWhiteTurn ? displayTime : game.whiteTimeLeft,
            blackTime: !game.isWhiteTurn ? displayTime : game.blackTimeLeft,
            isInByoyomiWhite: game.isWhiteTurn ? isInByoyomi : (game.whiteTimeLeft <= 0),
            isInByoyomiBlack: !game.isWhiteTurn ? isInByoyomi : (game.blackTimeLeft <= 0),
        };

        io.to(gameId).emit('timeUpdate', timeUpdatePayload);
    }
}
setInterval(gameTimerTick, 1000);

function updateTimeOnMove(game) {
    if (!game.lastMoveTimestamp || (game.timeControl && game.timeControl.main === -1)) {
        return; // Don't update time for unlimited games or before game starts
    }

    const now = Date.now();
    const timeSpent = (now - game.lastMoveTimestamp) / 1000;
    // Determine who just moved based on the *previous* turn state
    const playerWhoMovedColor = !game.isWhiteTurn ? 'white' : 'black';
    const opponentColor = game.isWhiteTurn ? 'white' : 'black'; // The player whose clock will start NOW

    let timeLeft = game[`${playerWhoMovedColor}TimeLeft`];
    const { byoyomiTime } = game.timeControl;

    timeLeft -= timeSpent;

    if (timeLeft < 0) {
        const byoyomiTimeUsed = Math.abs(timeLeft);

        if (byoyomiTime > 0 && byoyomiTimeUsed > byoyomiTime) {
            // Player ran out of main time AND byoyomi time
            game.gameOver = true;
            game.winner = opponentColor;
            game.reason = "Timeout";
            // Don't update time further, game is over
            return;
        }
        // If they used byoyomi but didn't exceed it, their main time becomes 0
        timeLeft = 0;
    }

    // Update the time for the player who just moved
    game[`${playerWhoMovedColor}TimeLeft`] = timeLeft;
    // Set the timestamp for the *next* player's turn
    game.lastMoveTimestamp = now;
}


io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.emit('lobbyUpdate', lobbyGames);

    // --- MODIFIED: createGame is now generic ---
    socket.on('createGame', (data) => {
		const { playerName, timeControl, gameType, boardSize: clientBoardSize } = data || {}; // gameType added
        
        if (!gameType || (gameType !== 'hikoro' && gameType !== 'go')) {
            socket.emit('errorMsg', 'Invalid game type specified.');
            return;
        }

		const gameId = `game_${Math.random().toString(36).substr(2, 9)}`;
		const tc = timeControl && timeControl.main !== undefined ? timeControl : { main: 300, byoyomiTime: 30, byoyomiPeriods: 3 };

        const logic = (gameType === 'hikoro') ? hikoroLogic : goLogic;
        const boardSize = (gameType === 'go' && clientBoardSize) ? clientBoardSize : 19;
        const makeMoveFunction = (gameType === 'hikoro') ? hikoroLogic.makeMove : goLogic.makeGoMove; // Assign correct function
        const getValidMovesFunction = (gameType === 'hikoro') ? hikoroLogic.getValidMoves : goLogic.getValidMoves; // Assign correct function

        // --- MODIFIED: Separate board initialization ---
        let initialBoardState, initialMustShieldAt = null;
        if (gameType === 'hikoro') {
            initialBoardState = hikoroLogic.getInitialBoard();
        } else {
            const goBoardData = goLogic.getInitialGoBoard(boardSize);
            initialBoardState = goBoardData.board;     // <-- Get the .board array
            initialMustShieldAt = goBoardData.mustShieldAt; // <-- Get the mustShieldAt property
        }
        // --- END MODIFICATION ---

		const game = {
			id: gameId,
            gameType: gameType, // Store the type
			boardSize: (gameType === 'go') ? boardSize : null,
            logic: { // Store the functions needed by the server
                makeMove: makeMoveFunction,
                getValidMoves: getValidMovesFunction,
                calculateScore: (gameType === 'go') ? goLogic.calculateScore : undefined // Only Go needs score calculation here
            },
			players: { white: socket.id, black: null },
			boardState: initialBoardState, // <-- Assign the correct array
			isWhiteTurn: true,
			turnCount: 0,
			gameOver: false,
			winner: null,
			reason: null,
			timeControl: tc,
			whiteTimeLeft: tc.main,
			blackTimeLeft: tc.main,
			lastMoveTimestamp: null, // Set when second player joins
            moveList: [],
            lastMove: null,
            // Hikoro-specific state (initialize anyway)
            whiteCaptured: [],
			blackCaptured: [],
			bonusMoveInfo: null,
            whitePrinceOnBoard: true,
            blackPrinceOnBoard: true,
            // Go-specific state (initialize anyway)
           blackPiecesLost: 0,
            whitePiecesLost: 0,
            score: { black: 0, white: 0, details: {} },
            mustShieldAt: initialMustShieldAt // <-- ADD THIS LINE
		};
        
        // Add initial score for Go
        if (gameType === 'go' && game.logic.calculateScore) {
            game.score = game.logic.calculateScore(game.boardState, 0, 0);
        }

        games[gameId] = game;
		lobbyGames[gameId] = {
			id: gameId,
            gameType: gameType,
			creatorName: playerName || 'Anonymous',
			timeControl: tc
		};

		socket.join(gameId);
		socket.emit('gameCreated', { gameId, color: 'white' });
		io.emit('lobbyUpdate', lobbyGames);
		console.log(`Game created: ${gameId} [${gameType}] by ${playerName} (${socket.id})`);
	});

    socket.on('joinGame', (gameId) => {
        const game = games[gameId];
        if (game && !game.players.black) {
            game.players.black = socket.id;
            delete lobbyGames[gameId]; // Remove from lobby once full

            socket.join(gameId);

            // Start the timer only when the second player joins
            game.lastMoveTimestamp = Date.now();

            // Emit gameStart AFTER setting the timestamp
            io.to(gameId).emit('gameStart', game); // Send the full initial state
            io.emit('lobbyUpdate', lobbyGames); // Update lobby for everyone
            console.log(`${socket.id} joined game ${gameId}`);
        } else {
            socket.emit('errorMsg', 'Game is full or does not exist.');
        }
    });


    // --- NEW: Generic getValidMoves handler ---
    socket.on('getValidMoves', (data) => {
        const { gameId, data: moveData } = data; // Client sends { gameId, data: { ... } }
        const game = games[gameId];
        if (!game || !moveData || !game.logic || !game.logic.getValidMoves) {
            console.error(`getValidMoves error: Game ${gameId} or logic not found`);
            return;
        }

        try {
            // Delegate to the game's logic module
            const validMoves = game.logic.getValidMoves(game, moveData);
            socket.emit('validMoves', validMoves);
        } catch (error) {
            console.error(`Error in getValidMoves for ${gameId} (${game.gameType}):`, error);
            socket.emit('validMoves', []); // Send empty array on error
        }
    });

    // --- NEW: Generic makeGameMove handler (replaces makeMove and makeDrop) ---
    socket.on('makeGameMove', (data) => {
        const { gameId, move } = data;
        const game = games[gameId];


if (!game) {
            console.error(`[Server] Move failed: Game ${gameId} not found. Server may have restarted.`);
            socket.emit('errorMsg', 'Game not found. The server may have restarted. Please return to the main menu.');
            return; // Stop execution to prevent the crash
        }
        // --- >>> ADD SERVER LOGS <<< ---
        console.log(`[Server] Received makeGameMove for ${gameId}: ${JSON.stringify(move)}`);
        // --- >>> END SERVER LOGS <<< ---

        

        let playerColor;
        let isTurn = false;
        if (game.isSinglePlayer) {
            playerColor = game.isWhiteTurn ? 'white' : 'black';
            isTurn = true;
        } else {
            playerColor = game.players.white === socket.id ? 'white' : 'black';
            isTurn = (playerColor === 'white' && game.isWhiteTurn) || (playerColor === 'black' && !game.isWhiteTurn);
        }
        // --- >>> ADD SERVER LOGS <<< ---
        console.log(`[Server] Determined: isSinglePlayer=${game.isSinglePlayer}, playerColor=${playerColor}, isTurn=${isTurn}`);
        // --- >>> END SERVER LOGS <<< ---

        if (!isTurn) {
            console.log(`[Server] Move rejected: Not player ${socket.id}'s turn.`);
            socket.emit('errorMsg', "It's not your turn.");
            return;
        }

        updateTimeOnMove(game);
        if (game.gameOver) { /* ... handle timeout ... */ return; }

        try {
            // --- >>> ADD SERVER LOGS <<< ---
            console.log(`[Server] Calling ${game.gameType} logic makeMove with color: ${playerColor}`);
            // --- >>> END SERVER LOGS <<< ---
            const result = game.logic.makeMove(game, move, playerColor);

            // --- >>> ADD SERVER LOGS <<< ---
            console.log(`[Server] Logic result: success=${result.success}, error=${result.error}`);
            if(result.success) {
                console.log(`[Server] New state: isWhiteTurn=${result.updatedGame.isWhiteTurn}, turnCount=${result.updatedGame.turnCount}`);
                // Optional: Log board state at the move location
                if (move.to) console.log(`       Board[${move.to.y}][${move.to.x}]=${result.updatedGame.boardState[move.to.y]?.[move.to.x]}`);
                else if (move.at) console.log(`       Board[${move.at.y}][${move.at.x}]=${result.updatedGame.boardState[move.at.y]?.[move.at.x]}`);
            }
            // --- >>> END SERVER LOGS <<< ---

            if (result.success) {
                // --- FIX: Preserve the logic functions ---
                const originalLogic = games[gameId].logic;
                games[gameId] = result.updatedGame;
                games[gameId].logic = originalLogic;
                // --- END FIX ---

                const stateToSend = { ...result.updatedGame };
                delete stateToSend.logic; // This removes it for the client
                io.to(gameId).emit('gameStateUpdate', stateToSend);
                console.log(`[Server] Move successful for ${playerColor}. Emitted gameStateUpdate.`);
            } else {
                console.log(`[Server] Move failed: ${result.error}`);
                socket.emit('errorMsg', result.error || "Invalid move.");
            }
        } catch (error) { /* ... handle error ... */ }
    });

	// --- MODIFIED: createSinglePlayerGame is now generic ---
    socket.on('createSinglePlayerGame', (data) => {
        const { gameType, boardSize: clientBoardSize } = data || {};
        
        if (!gameType || (gameType !== 'hikoro' && gameType !== 'go')) {
            socket.emit('errorMsg', 'Invalid game type specified.');
            return;
        }

        const gameId = `sp_game_${Math.random().toString(36).substr(2, 9)}`;
        const tc = { main: -1, byoyomiTime: 0, byoyomiPeriods: 0 }; // Unlimited time

        // --- Assign logic and board based on type ---
        const logic = (gameType === 'hikoro') ? hikoroLogic : goLogic;
        // ✅ MODIFIED: Use clientBoardSize, default to 19
        const boardSize = (gameType === 'go' && clientBoardSize) ? clientBoardSize : 19;
        const makeMoveFunction = (gameType === 'hikoro') ? hikoroLogic.makeMove : goLogic.makeGoMove;
        const getValidMovesFunction = (gameType === 'hikoro') ? hikoroLogic.getValidMoves : goLogic.getValidMoves;

        // --- MODIFIED: Separate board initialization ---
        let initialBoardState, initialMustShieldAt = null;
        if (gameType === 'hikoro') {
            initialBoardState = hikoroLogic.getInitialBoard();
        } else {
            const goBoardData = goLogic.getInitialGoBoard(boardSize);
            initialBoardState = goBoardData.board;     // <-- Get the .board array
            initialMustShieldAt = goBoardData.mustShieldAt; // <-- Get the mustShieldAt property
        }
        // --- END MODIFICATION ---
        
        const game = {
            id: gameId,
            gameType: gameType,
			boardSize: (gameType === 'go') ? boardSize : null,
            logic: { // Store functions
                 makeMove: makeMoveFunction,
                 getValidMoves: getValidMovesFunction,
                 calculateScore: (gameType === 'go') ? goLogic.calculateScore : undefined
            },
            players: { white: socket.id, black: socket.id }, // Same player
            boardState: initialBoardState, // <-- Assign the correct array
            isWhiteTurn: true,
            turnCount: 0,
            gameOver: false,
            winner: null,
            reason: null,
            timeControl: tc,
            whiteTimeLeft: tc.main,
            blackTimeLeft: tc.main,
            lastMoveTimestamp: Date.now(), // Start immediately
            isSinglePlayer: true,
            moveList: [],
            lastMove: null,
            // Hikoro-specific state
            whiteCaptured: [],
			blackCaptured: [],
			bonusMoveInfo: null,
            whitePrinceOnBoard: true,
            blackPrinceOnBoard: true,
            // Go-specific state
            blackPiecesLost: 0,
            whitePiecesLost: 0,
            score: { black: 0, white: 0, details: {} },
            mustShieldAt: initialMustShieldAt // <-- ADD THIS LINE
        };
        
        if (gameType === 'go' && game.logic.calculateScore) {
            game.score = game.logic.calculateScore(game.boardState, 0, 0);
        }

        games[gameId] = game;
        socket.join(gameId);
        // Remove logic before sending state
        const stateToSend = { ...game };
        delete stateToSend.logic;
        socket.emit('gameStart', stateToSend);
        console.log(`Single player [${gameType}] game created: ${gameId}`);
    });

    socket.on('leaveGame', (gameId) => {
        const game = games[gameId];
        if (game) {
            console.log(`Player ${socket.id} is leaving game ${gameId}`);
            // Check if it's a multiplayer game and not over yet
            if (!game.isSinglePlayer && !game.gameOver) {
                game.gameOver = true;
                // Determine winner based on who is leaving
                game.winner = game.players.white === socket.id ? 'black' : 'white';
                game.reason = "Opponent Forfeited";
                // Remove logic before sending state
                const stateToSend = { ...game };
                delete stateToSend.logic;
                io.to(gameId).emit('gameStateUpdate', stateToSend); // Notify remaining player
            }
            // Clean up game data
            delete games[gameId];
            delete lobbyGames[gameId]; // Ensure removed from lobby too
            io.emit('lobbyUpdate', lobbyGames); // Update lobby for everyone
        }
        // Force the leaving client to disconnect from the room (optional but good practice)
        socket.leave(gameId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Iterate through active games to handle disconnects
        for (const gameId in games) {
            const game = games[gameId];
            // Check if the disconnected player was in this game
            if (game.players.white === socket.id || game.players.black === socket.id) {
                console.log(`Player ${socket.id} disconnected from game ${gameId}`);
                // Handle only if it's a multiplayer game and not already over
                if (!game.isSinglePlayer && !game.gameOver) {
                    game.gameOver = true;
                    // Determine winner based on who disconnected
                    game.winner = game.players.white === socket.id ? 'black' : 'white';
                    game.reason = "Opponent disconnected";
                    // Remove logic before sending state
                    const stateToSend = { ...game };
                    delete stateToSend.logic;
                    io.to(gameId).emit('gameStateUpdate', stateToSend); // Notify the remaining player
                }
                // Clean up game data regardless of single/multiplayer
                delete games[gameId];
                delete lobbyGames[gameId]; // Ensure removed from lobby too
                io.emit('lobbyUpdate', lobbyGames); // Update lobby for everyone
                console.log(`Game ${gameId} removed due to player disconnect.`);
                // Since we found the game, no need to check further games for this socket
                break;
            }
        }
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));