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
    
    // --- NEW: STATE TRACKER FOR BOT'S BONUS MOVES ---
    let botBonusState = null;
    
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
        botBonusState = null; // Reset on new game
        socket.emit('createSinglePlayerGame');
    });

    playBotBtn.addEventListener('click', () => {
        isSinglePlayer = true;
        isBotGame = true;
        botBonusState = null; // Reset on new game
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

        const { whiteTime, blackTime, isInByoyomiWhite, isInByoyomiBlack } = times;

        whiteTimerEl.textContent = formatTime(whiteTime, 0, isInByoyomiWhite);
        blackTimerEl.textContent = formatTime(blackTime, 0, isInByoyomiBlack);
        
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
        botBonusState = null; // Reset on new game
        turnIndicator.textContent = "Waiting for an opponent...";
        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
    }

    function onGameStart(initialGameState) {
        gameId = initialGameState.id;
        botBonusState = null; // Reset on new game

        if (initialGameState.isSinglePlayer) {
            isSinglePlayer = true;
            myColor = 'white';
        } else if (!myColor) {
            myColor = 'black';
            isSinglePlayer = false;
        }
        isBotGame = isBotGame && isSinglePlayer;

        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
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

        // --- UPDATED BOT HANDLING LOGIC ---
        if (isBotGame && !gameState.gameOver && !gameState.isWhiteTurn) {
            setTimeout(() => {
                // If a bonus move is pending, the bot cannot drop pieces.
                const capturedPiecesForBot = botBonusState ? [] : gameState.blackCaptured;

                // Call the bot, passing the current bonus state (which may be null).
                const bestMove = findBestMoveWithTimeLimit(gameState.boardState, capturedPiecesForBot, botBonusState);

                // The bonus state has been used, clear it for the next turn.
                botBonusState = null;

                if (bestMove) {
                    // Check if THIS move will trigger a bonus for the NEXT turn.
                    const pieceThatMoved = bestMove.type === 'board' ? gameState.boardState[bestMove.from.y][bestMove.from.x] : null;
                    if (pieceThatMoved) {
                        const isCopeBonus = pieceThatMoved.type === 'cope' && bestMove.isAttack;
                        const isGHGBonus = (pieceThatMoved.type === 'greathorsegeneral' || pieceThatMoved.type === 'cthulhu') && !bestMove.isAttack;

                        if (isCopeBonus || isGHGBonus) {
                            // Set the bonus state for the next time this function is called for the bot's turn.
                            botBonusState = {
                                piece: pieceThatMoved,
                                from: bestMove.to // The piece will be at its destination for the next move
                            };
                        }
                    }

                    // Send the move to the server.
                    if (bestMove.type === 'drop') {
                        socket.emit('makeDrop', { gameId, piece: { type: bestMove.pieceType }, to: bestMove.to });
                    } else {
                        socket.emit('makeMove', { gameId, from: bestMove.from, to: bestMove.to });
                    }
                } else {
                    console.error("Bot returned no move.");
                }
            }, 100);
        }
        // --- END UPDATED LOGIC ---
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
                } else if (myColor === 'black') { 
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
        
        if (isSinglePlayer) {
            document.querySelector('#white-captured-area .hand-label').textContent = isBotGame ? "Your Hand" : "White's Hand";
            document.querySelector('#black-captured-area .hand-label').textContent = isBotGame ? "Bot's Hand" : "Black's Hand";
        } else {
            document.querySelector(myColor === 'white' ? '#white-captured-area .hand-label' : '#black-captured-area .hand-label').textContent = "Your Hand";
            document.querySelector(myColor === 'white' ? '#black-captured-area .hand-label' : '#white-captured-area .hand-label').textContent = "Opponent's Hand";
        }

        myCapturedEl.innerHTML = '';
        oppCapturedEl.innerHTML = '';

        const createCapturedPieceElement = (piece, isMyPiece) => {
            const el = document.createElement('div');
            el.classList.add('captured-piece', piece.color);

            const pieceElement = document.createElement('div');
            pieceElement.classList.add('piece');
            
            const spriteImg = document.createElement('img');
            spriteImg.src = `sprites/${piece.type}_${isMyPiece ? myColor : (myColor === 'white' ? 'black' : 'white')}.png`;
            spriteImg.alt = `${isMyPiece ? myColor : (myColor === 'white' ? 'black' : 'white')} ${piece.type}`;

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
        } else {
            const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
            turnIndicator.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
        }
    }

    function onSquareClick(x, y) {
        if (gameState.gameOver) return;

        const isMyTurn = (isSinglePlayer && !isBotGame) || 
                         (isBotGame && gameState.isWhiteTurn) || 
                         (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        // Case 1: A piece is selected, and we're clicking a new square to move.
        if (selectedSquare && (selectedSquare.x !== x || selectedSquare.y !== y)) {
            if (isMyTurn) {
                socket.emit('makeMove', { gameId, from: selectedSquare, to: { x, y } });
            }
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
            return;
        }

        // Case 2: A captured piece is selected for dropping.
        if (isDroppingPiece) {
            if (isMyTurn) {
                socket.emit('makeDrop', { gameId, piece: isDroppingPiece, to: { x, y } });
            }
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
            return;
        }

        // Case 3: We are selecting/deselecting a piece on the board.
        const piece = gameState.boardState[y][x];
        if (piece) {
            let canSelectPiece;
            if (isSinglePlayer) {
                canSelectPiece = piece.color === (gameState.isWhiteTurn ? 'white' : 'black');
            } else {
                canSelectPiece = piece.color === myColor;
            }

            if (canSelectPiece) {
                if (selectedSquare && selectedSquare.x === x && selectedSquare.y === y) {
                    selectedSquare = null;
                    isDroppingPiece = null;
                    clearHighlights();
                } else { 
                    selectedSquare = { x, y };
                    isDroppingPiece = null; 
                    socket.emit('getValidMoves', { gameId, square: { x, y } });
                }
            }
        } else { // Case 4: Clicking an empty square with nothing selected.
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
        }
    }
    
    function clearHighlights() {
        document.querySelectorAll('.square.selected').forEach(s => s.classList.remove('selected'));
        document.querySelectorAll('.square.preview-selected').forEach(s => s.classList.remove('preview-selected'));
        document.querySelectorAll('.move-plate').forEach(p => p.remove());
    }
    
    function drawHighlights(moves) {
		clearHighlights();
		if (!selectedSquare) return;

		const isMyTurn = (isSinglePlayer && !isBotGame) || 
						 (isBotGame && gameState.isWhiteTurn) || 
						 (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

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
        if (gameState.gameOver) return;

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

        const isMyTurn = (isSinglePlayer && !isBotGame) || 
                         (isBotGame && gameState.isWhiteTurn) || 
                         (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                const isBoardValid = !((x <= 1 && y <= 2) || (x >= 8 && y <= 2) || (x <= 1 && y >= 13) || (x >= 8 && y >= 13));
                if (gameState.boardState[y][x] === null && isBoardValid) {
                    const square = document.querySelector(`[data-logical-x='${x}'][data-logical-y='${y}']`);
                    if (square) {
                        const plate = document.createElement('div');
                        plate.classList.add('move-plate', 'drop');

                        if (!isMyTurn) {
                            plate.classList.add('preview');
                        }
                        square.appendChild(plate);
                    }
                }
            }
        }
    }
	
	const rulesBtn = document.getElementById('rules-btn');
    const rulesModal = document.getElementById('rules-modal');
    const closeRulesBtn = document.getElementById('close-rules-btn');
    const rulesBody = document.getElementById('rules-body');

    const pieceInfo = [
        // Core Pieces
        { name: 'Lupa (King)', desc: "The main objective. Moves one square in any direction. You must capture both of the opponent's Lupa to win." },
        { name: 'Zur (Queen)', desc: 'Moves any number of squares along a rank, file, or diagonal.' },
        { name: 'Kota (Rook+)', desc: 'Moves like a standard Rook (any number of squares horizontally or vertically) AND one square in any direction (like a Lupa).' },
        { name: 'Fin (Bishop+)', desc: 'Moves any number of squares diagonally. It can also move one square horizontally (non-capture only).' },
        { name: 'Yoli (Knight+)', desc: 'Moves in an "L" shape (two squares in one direction, then one perpendicularly). It can also move one square horizontally or vertically.' },
        { name: 'Kor (Knight-Hybrid)', desc: 'Moves like a standard Knight OR one square diagonally.' },

        // Pawns & Shielding
        { name: 'Pilut (Pawn/Shield)', desc: "Moves one or two squares forward to an empty square. It **shields** the piece directly behind it, preventing that piece from being captured.", special: 'Promotes to Greatshield.' },
        { name: 'Sult (Pawn)', desc: 'Moves one step diagonally forward, one step straight forward, or one step straight backward. It can also move two steps straight forward.' },
        { name: 'Pawn', desc: 'Moves one square orthogonally (forwards, backwards, sideways) OR two squares diagonally in any direction.' },
        
        // Unique Mechanics
        { name: 'Cope (Bonus Mover)', desc: "Has a unique forward jump and backward moves. **Special Ability:** After making a capture, the Cope gets a second, non-capture move during the same turn.", special: 'Bonus Move' },
        { name: 'Chair (Bishop/Rook)', desc: 'Moves any number of squares diagonally or vertically (but not horizontally).' },
        { name: 'Jotu (Jumper)', desc: 'Moves like a Rook, but it can **jump over friendly pieces** along its path. When it does, any jumped friendly pieces (except GHG and Cthulhu) are returned to your hand. It captures the first enemy piece it encounters and stops.' },
        
        // Promoted & Elite Pieces
        { name: 'Finor (Promoted Fin)', desc: 'Moves like a Bishop or a Knight. Acquired by capturing with a Fin.' },
        { name: 'Greatshield (Promoted Pilut)', desc: 'Can only make non-capture moves one square forward (diagonally or straight) or straight backward. **Special Ability:** It **shields all adjacent friendly pieces** (except those directly in front) from capture.', special: 'Promotes from Pilut.' },
        { name: 'Greathorse General', desc: "**Special Ability:** After making a non-capture move, it gets a second, non-capture move during the same turn.", special: 'Bonus Move & Promotes to Cthulhu upon capturing.' },
        { name: 'Neptune', desc: 'Can move like a Lupa or Cope. It can also "jump" over the first piece it sees (friendly or enemy) in a straight line, and can then continue moving and capturing like a Rook from that point.' , special: 'Demotes to Mermaid upon being captured.' },
        { name: 'Mermaid', desc: 'Moves exactly two squares in any direction, jumping over any intervening pieces.' },
        { name: 'Cthulhu (Promoted GHG)', desc: "An extremely powerful piece with the combined moves of a Greathorse General and a Mermaid. **Special Ability:** Retains the Greathorse General's bonus non-capture move." }
    ];

    function populateRulesModal() {
        rulesBody.innerHTML = `
            <h2>Winning the Game</h2>
            <p>There are two ways to achieve victory in Hikoro Chess:</p>
            <ul>
                <li><strong>Lupa Capture:</strong> The primary objective. Capture both of the opponent's <strong>Lupa</strong> pieces.</li>
                <li><strong>Sanctuary Victory:</strong> Move one of your own <strong>Lupa</strong> pieces onto one of the eight golden "Sanctuary" squares on the opponent's side of the board.</li>
            </ul>

            <h2>Special Mechanics</h2>
            <h3><span style="color: #4CAF50;">🛡️</span> Piece Protection</h3>
            <p>Some pieces can shield others from being captured. A protected piece cannot be taken.</p>
            <ul>
                <li><strong>Pilut:</strong> Protects the single friendly piece directly behind it.</li>
                <li><strong>Greatshield:</strong> Protects all 8 adjacent friendly pieces (except those in its forward path).</li>
            </ul>
             <h3><span style="color: #4CAF50;">⏩</span> Bonus Moves</h3>
            <p>Certain pieces can move twice in one turn under specific conditions.</p>
            <ul>
                <li><strong>Cope:</strong> After making a <strong>capture</strong>, it gets a second, non-capture move.</li>
                <li><strong>Greathorse General / Cthulhu:</strong> After making a <strong>non-capture</strong> move, it gets a second, non-capture move.</li>
            </ul>
            <h3><span style="color: #4CAF50;">✋</span> Drops</h3>
            <p>When you capture an opponent's piece (with some exceptions), it goes into your "Hand" (captured pieces area). On your turn, instead of moving a piece on the board, you can "drop" a piece from your hand onto any empty square. You cannot have more than 6 pieces in your hand.</p>

            <h2>Piece Movesets</h2>
            <div class="piece-list" id="piece-list-container"></div>
        `;

        const pieceListContainer = document.getElementById('piece-list-container');
        pieceInfo.forEach(p => {
            const pieceType = p.name.split(' ')[0].toLowerCase().replace('(', '');
            const entry = document.createElement('div');
            entry.className = 'piece-entry';
            entry.innerHTML = `
                <div class="piece-header">
                    <img src="sprites/${pieceType}_white.png" alt="${p.name}">
                    <span>${p.name}</span>
                </div>
                <p>${p.desc}</p>
                ${p.special ? `<p><em><strong>Note:</strong> ${p.special}</em></p>` : ''}
            `;
            pieceListContainer.appendChild(entry);
        });
    }


    rulesBtn.addEventListener('click', () => {
        populateRulesModal(); // Populate with fresh content each time
        rulesModal.style.display = 'block';
    });

    closeRulesBtn.addEventListener('click', () => {
        rulesModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == rulesModal) {
            rulesModal.style.display = 'none';
        }
    });
});