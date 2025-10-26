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

const { getInitialBoard, getValidMovesForPiece, isPositionValid, pieceNotation } = require('./public/gamelogic');


function toAlgebraic(x, y) {
    const file = String.fromCharCode('a'.charCodeAt(0) + x);
    const rank = y + 1;
    return `${file}${rank}`;
}

function generateNotation(piece, to, wasCapture, wasDrop) {
    const pieceAbbr = pieceNotation[piece.type] || '?';
    const coord = toAlgebraic(to.x, to.y);

    if (wasDrop) {
        return `${pieceAbbr}*${coord}`;
    }
    if (wasCapture) {
        return `${pieceAbbr}x${coord}`;
    }
    return `${pieceAbbr}${coord}`;
}

function updateMoveList(game, notationString) {
    const turnNum = Math.floor(game.turnCount / 2) + 1;

    if (game.isWhiteTurn) {
        game.moveList.push(`${turnNum}. ${notationString}`);
    } else {
        if (game.moveList.length > 0) {
            game.moveList[game.moveList.length - 1] += ` ${notationString}`;
        } else {
            game.moveList.push(`${turnNum}... ${notationString}`);
        }
    }
}

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

        if (byoyomiTime > 0 && byoyomiTimeUsed > byoyomiTime) {
            game.gameOver = true;
            game.winner = opponentColor;
            game.reason = "Timeout";
        }

        timeLeft = 0;
    }

    game[`${activePlayerColor}TimeLeft`] = timeLeft;
    game.lastMoveTimestamp = now;
}


io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.emit('lobbyUpdate', lobbyGames);

    socket.on('createGame', (data) => {
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
			reason: null,
			timeControl: tc,
			whiteTimeLeft: tc.main,
			blackTimeLeft: tc.main,
			lastMoveTimestamp: null,
            moveList: [],
            lastMove: null,
            whitePrinceOnBoard: true,
            blackPrinceOnBoard: true
		};

		lobbyGames[gameId] = {
			id: gameId,
			creatorName: playerName || 'Anonymous',
			timeControl: tc
		};

		socket.join(gameId);
		socket.emit('gameCreated', { gameId, color: 'white' });
		io.emit('lobbyUpdate', lobbyGames);
		console.log(`Game created: ${gameId} by ${playerName} (${socket.id})`);
	});

    socket.on('joinGame', (gameId) => {
        const game = games[gameId];
        if (game && !game.players.black) {
            game.players.black = socket.id;
            delete lobbyGames[gameId];

            socket.join(gameId);

            game.lastMoveTimestamp = Date.now();

            io.to(gameId).emit('gameStart', game);
            io.emit('lobbyUpdate', lobbyGames);
            console.log(`${socket.id} joined game ${gameId}`);
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
        } else {
            socket.emit('validMoves', []);
        }
    });

    socket.on('makeMove', (data) => {
        const { gameId, from, to } = data;
        const game = games[gameId];
        if (!game || game.gameOver) return;

        let playerColor;
        let isTurn = false;
        if (game.isSinglePlayer) {
            playerColor = game.isWhiteTurn ? 'white' : 'black';
            isTurn = true;
        } else {
            playerColor = game.players.white === socket.id ? 'white' : 'black';
            isTurn = (playerColor === 'white' && game.isWhiteTurn) || (playerColor === 'black' && !game.isWhiteTurn);
        }
        if (!isTurn) return;


        updateTimeOnMove(game);
        if (game.gameOver) {
            io.to(gameId).emit('gameStateUpdate', game);
            return;
        }

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
            const notationString = generateNotation(piece, to, wasCapture, false);

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
                if(targetPiece.type === 'prince') {
                    if (targetPiece.color === 'white') {
                        game.whitePrinceOnBoard = false;
                        console.log("White Prince captured!");
                    } else {
                        game.blackPrinceOnBoard = false;
                        console.log("Black Prince captured!");
                    }
                } else {
                    const indestructiblePieces = ['greathorsegeneral', 'cthulhu', 'mermaid'];
                    if (targetPiece.type === 'neptune') {
                        const losingPlayerColor = targetPiece.color;
                        const pieceForHand = { type: 'mermaid', color: losingPlayerColor };
                        const capturedArray = losingPlayerColor === 'white' ? game.whiteCaptured : game.blackCaptured;
                        if (capturedArray.length < 6) {
                            capturedArray.push(pieceForHand);
                        }
                     }
                     else if (!indestructiblePieces.includes(targetPiece.type) && targetPiece.type !== 'lupa') {
                         let pieceForHand = { type: targetPiece.type, color: playerColor };
                         const capturedArray = playerColor === 'white' ? game.whiteCaptured : game.blackCaptured;
                         if (capturedArray.length < 6) {
                             capturedArray.push(pieceForHand);
                         }
                     }
                }
            }

            game.boardState[to.y][to.x] = piece;
            game.boardState[from.y][from.x] = null;
            handlePromotion(piece, to.y, wasCapture);

            updateMoveList(game, notationString);
            game.lastMove = { from, to };

            checkForWinner(game);
            game.turnCount++;

            if (bonusMoveActive) {
                game.bonusMoveInfo = null;
                game.isWhiteTurn = !game.isWhiteTurn;
            } else if (['greathorsegeneral', 'cthulhu'].includes(piece.type) && !wasCapture) {
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
        const tc = { main: -1, byoyomiTime: 0, byoyomiPeriods: 0 };
        const game = {
            id: gameId,
            players: { white: socket.id, black: socket.id },
            boardState: getInitialBoard(),
            whiteCaptured: [],
            blackCaptured: [],
            isWhiteTurn: true,
            turnCount: 0,
            bonusMoveInfo: null,
            gameOver: false,
            winner: null,
            reason: null,
            timeControl: tc,
            whiteTimeLeft: tc.main,
            blackTimeLeft: tc.main,
            lastMoveTimestamp: Date.now(),
            isSinglePlayer: true,
            moveList: [],
            lastMove: null,
            whitePrinceOnBoard: true,
            blackPrinceOnBoard: true
        };
        games[gameId] = game;
        socket.join(gameId);
        socket.emit('gameStart', game);
    });

    socket.on('makeDrop', (data) => {
		const { gameId, piece, to } = data;
		const game = games[gameId];
		if (!game || game.gameOver) return;

		let playerColor;
		if (!game.isSinglePlayer) {
			playerColor = game.players.white === socket.id ? 'white' : 'black';
			const isTurn = (playerColor === 'white' && game.isWhiteTurn) || (playerColor === 'black' && !game.isWhiteTurn);
			if (!isTurn) return;
		} else {
			playerColor = game.isWhiteTurn ? 'white' : 'black';
		}

		updateTimeOnMove(game);
		if (game.gameOver) {
			io.to(gameId).emit('gameStateUpdate', game);
			return;
		}

		if (piece.type === 'lupa' || piece.type === 'prince') {
		    console.log("Attempted to drop invalid piece type:", piece.type);
		    return;
		}

		if (game.boardState[to.y][to.x] === null && isPositionValid(to.x, to.y)) {
            const droppedPiece = { type: piece.type, color: playerColor };
            const notationString = generateNotation(droppedPiece, to, false, true);

			game.boardState[to.y][to.x] = droppedPiece;
			const capturedArray = playerColor === 'white' ? game.whiteCaptured : game.blackCaptured;
			const pieceIndex = capturedArray.findIndex(p => p.type === piece.type);

            if (pieceIndex > -1) {
				capturedArray.splice(pieceIndex, 1);

                updateMoveList(game, notationString);
                game.lastMove = { from: null, to };

				game.bonusMoveInfo = null;
				game.isWhiteTurn = !game.isWhiteTurn;
				game.turnCount++;
				io.to(gameId).emit('gameStateUpdate', game);
			} else {
			    console.error(`Error: Piece type ${piece.type} not found in captured array for ${playerColor}`);
			    game.boardState[to.y][to.x] = null;
			}
		}
	});

	socket.on('leaveGame', (gameId) => {
        const game = games[gameId];
        if (game) {
            console.log(`Player ${socket.id} is leaving game ${gameId}`);
            if (!game.isSinglePlayer && !game.gameOver) {
                game.gameOver = true;
                game.winner = game.players.white === socket.id ? 'black' : 'white';
                game.reason = "Opponent Forfeited";
                io.to(gameId).emit('gameStateUpdate', game);
            }
            delete games[gameId];
            delete lobbyGames[gameId];
            io.emit('lobbyUpdate', lobbyGames);
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
                    game.reason = "Opponent disconnected";
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

    if (piece.type === 'prince') return;

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

    const sanctuarySquares = [
        {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
        {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
    ];

    for (const square of sanctuarySquares) {
        const pieceOnSquare = game.boardState[square.y][square.x];
        if (pieceOnSquare && (pieceOnSquare.type === 'lupa' || pieceOnSquare.type === 'prince')) {
            game.gameOver = true;
            game.winner = pieceOnSquare.color;
            game.reason = "Sanctuary";
            console.log(`${game.winner} wins by Sanctuary! Piece: ${pieceOnSquare.type}`);
            return;
        }
    }

    let whiteLupaOnBoard = false;
    let blackLupaOnBoard = false;

    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 10; x++) {
            const piece = game.boardState[y][x];
            if (piece && piece.type === 'lupa') {
                if (piece.color === 'white') whiteLupaOnBoard = true;
                else blackLupaOnBoard = true;
            }
        }
    }

    if (!blackLupaOnBoard && !game.blackPrinceOnBoard && game.turnCount > 0) {
        game.gameOver = true;
        game.winner = 'white';
        game.reason = "Royalty Capture";
         console.log("White wins by Royalty Capture!");
    } else if (!whiteLupaOnBoard && !game.whitePrinceOnBoard && game.turnCount > 0) {
        game.gameOver = true;
        game.winner = 'black';
        game.reason = "Royalty Capture";
         console.log("Black wins by Royalty Capture!");
    }
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));