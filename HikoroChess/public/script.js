document.addEventListener('DOMContentLoaded', () => {
    
    const productionUrl = 'https://HikoroChess.org';
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const serverUrl = isLocal ? 'http://localhost:3000' : window.location.origin;

    const socket = io(serverUrl);
    
    const BOARD_WIDTH = 10;
    const BOARD_HEIGHT = 16;
    
    const lobbyElement = document.getElementById('lobby');
    const gameContainerElement = document.getElementById('game-container');
    const createGameBtn = document.getElementById('create-game-btn');
    const gameListElement = document.getElementById('game-list');
    const boardElement = document.getElementById('game-board');
    const turnIndicator = document.getElementById('turn-indicator');
    const winnerText = document.getElementById('winner-text');
    const singlePlayerBtn = document.getElementById('single-player-btn');
    const playBotBtn = document.getElementById('play-bot-btn');

    let gameState = {};
    let myColor = null;
    let gameId = null;
    let selectedSquare = null;
    let isDroppingPiece = null;
    let isSinglePlayer = false;
    let isBotGame = false;
    
    const sanctuarySquares = [
        {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
        {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
    ];

    
    createGameBtn.addEventListener('click', () => {
        const playerName = document.getElementById('player-name').value.trim() || 'Anonymous';
        const mainTime = parseInt(document.getElementById('time-control').value, 10);
        let byoyomiTime = parseInt(document.getElementById('byoyomi-control').value, 10);

        if (mainTime === 0 && byoyomiTime === 0) {
            byoyomiTime = 15; 
        }

        const timeControl = {
            main: mainTime,
            byoyomiTime: mainTime === -1 ? 0 : byoyomiTime, 
            byoyomiPeriods: mainTime === -1 ? 0 : (byoyomiTime > 0 ? 999 : 0)
        };
        
        const dataToSend = { playerName, timeControl };
        socket.emit('createGame', dataToSend);
    });
    
    singlePlayerBtn.addEventListener('click', () => {
        isSinglePlayer = true;
        isBotGame = false;
        socket.emit('createSinglePlayerGame');
    });

    playBotBtn.addEventListener('click', () => {
        isSinglePlayer = true; // Bot game is a type of single player game
        isBotGame = true;
        socket.emit('createSinglePlayerGame');
    });

    socket.on('lobbyUpdate', updateLobby);
    socket.on('gameCreated', onGameCreated);
    socket.on('gameStart', onGameStart);
    
    socket.on('gameStateUpdate', updateLocalState);
    socket.on('timeUpdate', updateTimerDisplay);
    socket.on('validMoves', drawHighlights);
    socket.on('errorMsg', (message) => alert(message));
    socket.on('connect_error', (err) => {
        console.error("Connection failed:", err.message);
        alert("Failed to connect to the server. Check the developer console (F12) for more info.");
    });

    function setupTimerElements() {
        const whiteArea = document.getElementById('white-captured-area');
        const blackArea = document.getElementById('black-captured-area');

        if (whiteArea && !document.getElementById('white-timer')) {
            whiteTimerEl = document.createElement('div');
            whiteTimerEl.id = 'white-timer';
            whiteTimerEl.className = 'timer';
            whiteArea.appendChild(whiteTimerEl);
        } else {
            whiteTimerEl = document.getElementById('white-timer');
        }

        if (blackArea && !document.getElementById('black-timer')) {
            blackTimerEl = document.createElement('div');
            blackTimerEl.id = 'black-timer';
            blackTimerEl.className = 'timer';
            blackArea.appendChild(blackTimerEl);
        } else {
            blackTimerEl = document.getElementById('black-timer');
        }
    }
	
	function formatTimeControl(tc) {
        if (!tc || tc.main === -1) { return 'Unlimited'; }
        const mainMinutes = Math.floor(tc.main / 60);
        let formattedString = `${mainMinutes} min`;
        if (tc.byoyomiTime > 0) { formattedString += ` + ${tc.byoyomiTime}s`; }
        return formattedString;
    }

    function formatTime(seconds, periods, inByoyomi) {
        if (seconds === -1) {
            return "∞";
        }
        
        if (inByoyomi) {
            return `B: ${Math.ceil(seconds)}s`;
        }
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const paddedSecs = secs < 10 ? `0${secs}` : secs;
        const paddedMins = mins < 10 ? `0${mins}` : mins;
        return `${paddedMins}:${paddedSecs}`;
    }

    function updateTimerDisplay(times) {
        const whiteTimerEl = document.getElementById('white-time');
        const blackTimerEl = document.getElementById('black-time');

        if (!whiteTimerEl || !blackTimerEl || !gameState.timeControl) return;

        const { whiteTime, blackTime, whiteByoyomi, blackByoyomi, isInByoyomiWhite, isInByoyomiBlack } = times;

        whiteTimerEl.textContent = formatTime(whiteTime, whiteByoyomi, isInByoyomiWhite);
        blackTimerEl.textContent = formatTime(blackTime, blackByoyomi, isInByoyomiBlack);
        
        if (gameState.gameOver) {
            whiteTimerEl.classList.remove('active');
            blackTimerEl.classList.remove('active');
            return;
        }

        if (gameState.isWhiteTurn) {
            whiteTimerEl.classList.add('active');
            blackTimerEl.classList.remove('active');
        } else {
            blackTimerEl.classList.add('active');
            whiteTimerEl.classList.remove('active');
        }
    }


    function updateLobby(games) {
        gameListElement.innerHTML = '';
        for (const id in games) {
            const game = games[id];
            const gameItem = document.createElement('div');
            gameItem.classList.add('game-item');
            const infoSpan = document.createElement('span');
            const creatorName = game.creatorName || 'Player 1'; 
            const timeString = game.timeControl ? formatTimeControl(game.timeControl) : 'Unknown Time';
            infoSpan.textContent = `${creatorName}'s Game [${timeString}]`;
            gameItem.appendChild(infoSpan);
            const joinBtn = document.createElement('button');
            joinBtn.textContent = 'Join';
            joinBtn.classList.add('join-btn');
            joinBtn.addEventListener('click', () => socket.emit('joinGame', id));
            gameItem.appendChild(joinBtn);
            gameListElement.appendChild(gameItem);
        }
    }

    function onGameCreated(data) {
        gameId = data.gameId;
        myColor = data.color;
        isSinglePlayer = false;
        isBotGame = false;
        turnIndicator.textContent = "Waiting for an opponent...";
        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
        // setupTimerElements();
    }

    function onGameStart(initialGameState) {
        gameId = initialGameState.id;

        if (initialGameState.isSinglePlayer) {
            isSinglePlayer = true;
            myColor = 'white'; // Lock view for single player modes
        } else if (!myColor) {
            myColor = 'black';
            isSinglePlayer = false;
        }
        isBotGame = isBotGame && isSinglePlayer; // Ensure bot flag is consistent

        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
        // setupTimerElements();
        updateLocalState(initialGameState);
    }

    function updateLocalState(newGameState) {
        const isNewGameOver = newGameState.gameOver && !gameState.gameOver;
        gameState = newGameState;

        if (isNewGameOver && newGameState.winner) {
            const winnerName = newGameState.winner.charAt(0).toUpperCase() + newGameState.winner.slice(1);
            winnerText.textContent = `${winnerName} Wins!`;
            if (newGameState.reason) {
                winnerText.textContent += ` (${newGameState.reason})`;
            }
        }
        
        renderAll();

        // Check if it's the bot's turn to move
        if (isBotGame && !gameState.gameOver && !gameState.isWhiteTurn) {
			setTimeout(() => {
				console.log("Bot is thinking...");
				// MODIFIED LINE: Call the new time-managed function
				const bestMove = findBestMoveWithTimeLimit(gameState.boardState, gameState.blackCaptured);
				
				if (bestMove) {
					console.log("Bot chose move:", bestMove);
					if (bestMove.type === 'drop') {
						socket.emit('makeDrop', { gameId, piece: { type: bestMove.pieceType }, to: bestMove.to });
					} else {
						socket.emit('makeMove', { gameId, from: bestMove.from, to: bestMove.to });
					}
				} else {
					console.log("Bot has no moves!");
				}
			}, 100); // Reduced delay
		}
    }

    function renderAll() {
        if (!gameState.boardState) return;
        renderBoard();
        renderCaptured();
        updateTurnIndicator();
    }
    
    function renderBoard() {
        boardElement.innerHTML = '';
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                const square = document.createElement('div');
                square.classList.add('square');
                
                let displayX = x, displayY = y;
                if (myColor === 'white') {
                    displayY = BOARD_HEIGHT - 1 - y;
                } else { 
                    displayX = BOARD_WIDTH - 1 - x;
                }
                
                square.dataset.logicalX = x;
                square.dataset.logicalY = y;
                square.style.gridRowStart = displayY + 1;
                square.style.gridColumnStart = displayX + 1;

                const isLight = (x + y) % 2 === 0;
                square.classList.add(isLight ? 'light' : 'dark');

                const isSanctuary = sanctuarySquares.some(sq => sq.x === x && sq.y === y);
                if (isSanctuary) {
                    square.classList.add('sanctuary-square');
                }

                const isBoardValid = !((x <= 1 && y <= 2) || (x >= 8 && y <= 2) || (x <= 1 && y >= 13) || (x >= 8 && y >= 13));
                if (!isBoardValid) {
                    square.classList.add('invalid');
                } else {
                    square.addEventListener('click', (event) => {
                        const clickedSquare = event.currentTarget;
                        const logicalX = parseInt(clickedSquare.dataset.logicalX);
                        const logicalY = parseInt(clickedSquare.dataset.logicalY);
                        onSquareClick(logicalX, logicalY);
                    });
                }

                const piece = gameState.boardState[y][x];
                if (piece) {
                    const pieceElement = document.createElement('div');
                    pieceElement.classList.add('piece', piece.color);

                    const spriteImg = document.createElement('img');
                    spriteImg.src = `sprites/${piece.type}_${piece.color}.png`;
                    spriteImg.alt = `${piece.color} ${piece.type}`;

                    pieceElement.appendChild(spriteImg);
                    square.appendChild(pieceElement);
                }
                boardElement.appendChild(square);
            }
        }
    }

    function renderCaptured() {
        const myCaptured = myColor === 'white' ? gameState.whiteCaptured : gameState.blackCaptured;
        const oppCaptured = myColor === 'white' ? gameState.blackCaptured : gameState.whiteCaptured;
        const myCapturedEl = document.querySelector(myColor === 'white' ? '#white-captured' : '#black-captured');
        const oppCapturedEl = document.querySelector(myColor === 'white' ? '#black-captured' : '#white-captured');
        
        document.querySelector(myColor === 'white' ? '#white-captured-area .hand-label' : '#black-captured-area .hand-label').textContent = "Your Hand";
        document.querySelector(myColor === 'white' ? '#black-captured-area .hand-label' : '#white-captured-area .hand-label').textContent = "Opponent's Hand";

        myCapturedEl.innerHTML = '';
        oppCapturedEl.innerHTML = '';

        const createCapturedPieceElement = (piece, isMyPiece) => {
            const el = document.createElement('div');
            el.classList.add('captured-piece', piece.color);

            const pieceElement = document.createElement('div');
            pieceElement.classList.add('piece');
            
            const spriteImg = document.createElement('img');
            spriteImg.src = `sprites/${piece.type}_${piece.color}.png`;
            spriteImg.alt = `${piece.color} ${piece.type}`;

            pieceElement.appendChild(spriteImg);
            el.appendChild(pieceElement);

            if (isMyPiece) {
                el.addEventListener('click', () => onCapturedClick(piece));
            }
            return el;
        };

        myCaptured.forEach((piece) => {
            const pieceEl = createCapturedPieceElement(piece, true);
            myCapturedEl.appendChild(pieceEl);
        });

        oppCaptured.forEach((piece) => {
            const pieceEl = createCapturedPieceElement(piece, false);
            oppCapturedEl.appendChild(pieceEl);
        });
    }

    function updateTurnIndicator() {
        if (gameState.gameOver) {
            turnIndicator.textContent = '';
            if(!winnerText.textContent) {
                winnerText.textContent = `${gameState.winner.charAt(0).toUpperCase() + gameState.winner.slice(1)} Wins!`;
            }
            return;
        }

        if (isSinglePlayer) {
            turnIndicator.textContent = gameState.isWhiteTurn ? "White's Turn" : "Black's Turn";
            const whiteLabel = isBotGame ? "Your Hand" : "White's Hand";
            const blackLabel = isBotGame ? "Bot's Hand" : "Black's Hand";
            document.querySelector('#white-captured-area .hand-label').textContent = whiteLabel;
            document.querySelector('#black-captured-area .hand-label').textContent = blackLabel;
        } else {
            const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
            turnIndicator.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
            document.querySelector(myColor === 'white' ? '#white-captured-area .hand-label' : '#black-captured-area .hand-label').textContent = "Your Hand";
            document.querySelector(myColor === 'white' ? '#black-captured-area .hand-label' : '#white-captured-area .hand-label').textContent = "Opponent's Hand";
        }
    }

    function onSquareClick(x, y) {
        if (gameState.gameOver) return;

        const isMyTurn = (isSinglePlayer && !isBotGame) || 
                         (isBotGame && gameState.isWhiteTurn) || 
                         (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        if (!isMyTurn) return;

        if (isDroppingPiece) {
            socket.emit('makeDrop', { gameId, piece: isDroppingPiece, to: { x, y } });
            isDroppingPiece = null;
            clearHighlights();
            return;
        }

        if (selectedSquare) {
            if (selectedSquare.x !== x || selectedSquare.y !== y) {
                socket.emit('makeMove', { gameId, from: selectedSquare, to: { x, y } });
                selectedSquare = null;
                clearHighlights();
                return;
            }
        }
        
        const piece = gameState.boardState[y][x];
        if (piece) {
            const canSelectPiece = isSinglePlayer ? 
                (piece.color === (gameState.isWhiteTurn ? 'white' : 'black')) : 
                (piece.color === myColor);

            if (canSelectPiece) {
                if (selectedSquare && selectedSquare.x === x && selectedSquare.y === y) {
                    selectedSquare = null;
                    clearHighlights();
                } else {
                    isDroppingPiece = null;
                    selectedSquare = { x, y };
                    socket.emit('getValidMoves', { gameId, square: { x, y } });
                }
            }
        } else {
            selectedSquare = null;
            clearHighlights();
        }
    }
    
    function drawHighlights(moves) {
        clearHighlights();
        if (!selectedSquare) return;

        const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
        const selectedSquareElement = document.querySelector(`[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`);

        if (selectedSquareElement) {
            selectedSquareElement.classList.add(isMyTurn ? 'selected' : 'preview-selected');
        }

        moves.forEach(move => {
            const moveSquare = document.querySelector(`[data-logical-x='${move.x}'][data-logical-y='${move.y}']`);
            if (moveSquare) {
                const plate = document.createElement('div');
                plate.classList.add('move-plate');
                if (!isMyTurn) {
                    plate.classList.add('preview');
                }
                if (move.isAttack) {
                    plate.classList.add('attack');
                }
                moveSquare.appendChild(plate);
            }
        });
    }

    function onCapturedClick(piece) {
        const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
        
        if (!isMyTurn || gameState.gameOver) return;

        if (isDroppingPiece && isDroppingPiece.type === piece.type) {
            isDroppingPiece = null;
            clearHighlights();
            return;
        }
        
        selectedSquare = null;
        isDroppingPiece = piece;
        highlightDropSquares();
    }

    function highlightDropSquares() {
        clearHighlights();
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                    const isBoardValid = !((x <= 1 && y <= 2) || (x >= 8 && y <= 2) || (x <= 1 && y >= 13) || (x >= 8 && y >= 13));
                if (gameState.boardState[y][x] === null && isBoardValid) {
                    const square = document.querySelector(`[data-logical-x='${x}'][data-logical-y='${y}']`);
                    const plate = document.createElement('div');
                    plate.classList.add('move-plate', 'drop');
                    if(square) square.appendChild(plate);
                }
            }
        }
    }
    
    function clearHighlights() {
        document.querySelectorAll('.square.selected').forEach(s => s.classList.remove('selected'));
        document.querySelectorAll('.square.preview-selected').forEach(s => s.classList.remove('preview-selected'));
        document.querySelectorAll('.move-plate').forEach(p => p.remove());
    }
});