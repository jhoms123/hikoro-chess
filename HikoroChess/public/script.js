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
    
    // --- BUG FIX: ADDED MISSING VARIABLE DECLARATIONS ---
    const gameControls = document.getElementById('game-controls');
    const mainMenuBtn = document.getElementById('main-menu-btn');
    const rulesBtnIngame = document.getElementById('rules-btn-ingame');

    // --- [NEW] ---
    const ANIMATION_DURATION = 250; // ms, must match CSS

    let gameState = {};
    let myColor = null;
    let gameId = null;
    let selectedSquare = null;
    let isDroppingPiece = null;
    let isSinglePlayer = false;
    let isBotGame = false;
    
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
            myColor = 'white'; // Default to white for SP
        } else if (!myColor) {
            myColor = 'black'; // Must be joining as black
            isSinglePlayer = false;
        }
        isBotGame = isBotGame && isSinglePlayer; // Can only be bot game if it's also SP

        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
        gameControls.style.display = 'flex';

        // [NEW] Render notation markers *before* first board render
        renderNotationMarkers(); 
        
        updateLocalState(initialGameState);
    }
    
    rulesBtnIngame.addEventListener('click', () => {
        populateRulesModal(); // The function you already have
        rulesModal.style.display = 'block';
    });
    
    mainMenuBtn.addEventListener('click', () => {
        if (gameId) {
            socket.emit('leaveGame', gameId);
        }
        // The simplest and cleanest way to reset the client state is to reload.
        window.location.reload();
    });


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
        
        // [MODIFIED] Removed renderAll() and call functions directly
        renderBoard();
        renderCaptured();
        updateTurnIndicator();
        renderMoveHistory(gameState.moveList); // [NEW]

        // --- UPDATED BOT HANDLING LOGIC ---
        if (isBotGame && !gameState.gameOver && !gameState.isWhiteTurn) {
            setTimeout(() => {
                // If a bonus move is pending, the bot cannot drop pieces.
                const capturedPiecesForBot = botBonusState ? [] : gameState.blackCaptured;

                // --- FIX: Capture the current state and clear it BEFORE the search ---
                const currentBonusState = botBonusState;
                botBonusState = null; 

                // Call the bot, passing the (now-cleared) bonus state.
                const bestMove = findBestMoveWithTimeLimit(gameState.boardState, capturedPiecesForBot, currentBonusState);

                if (bestMove) {
                    // Check if THIS move will trigger a bonus for the NEXT turn.
                    const pieceThatMoved = bestMove.type === 'board' ? gameState.boardState[bestMove.from.y][bestMove.from.x] : null;
                    
                    // --- FIX: Only set a new bonus if we were NOT just in a bonus move ---
                    if (pieceThatMoved && !currentBonusState) {
                        const isCopeBonus = pieceThatMoved.type === 'cope' && bestMove.isAttack;
                        const isGHGBonus = (pieceThatMoved.type === 'greathorsegeneral' || pieceThatMoved.type === 'cthulhu') && !bestMove.isAttack;

                        if (isCopeBonus || isGHGBonus) {
                            // Set the bonus state for the next time this function is called for the bot's turn.
                            botBonusState = {
                                piece: { ...pieceThatMoved }, // Store a copy
                                from: { ...bestMove.to }     // The piece will be at its destination
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
                    console.error("Bot returned no move. This likely means a stalemate or a search error.");
                }
            }, 100);
        }
        // --- END UPDATED LOGIC ---
    }

    // [REMOVED] renderAll() function is no longer needed

    // [NEW] Renders the file/rank markers around the board
    function renderNotationMarkers() {
        const filesTop = document.querySelector('.notation-files-top');
        const filesBottom = document.querySelector('.notation-files-bottom');
        const ranksLeft = document.querySelector('.notation-ranks-left');
        const ranksRight = document.querySelector('.notation-ranks-right');
        
        if (!filesTop || !filesBottom || !ranksLeft || !ranksRight) return;

        filesTop.innerHTML = '';
        filesBottom.innerHTML = '';
        ranksLeft.innerHTML = '';
        ranksRight.innerHTML = '';

        const files = Array.from({length: 10}, (_, i) => String.fromCharCode('a'.charCodeAt(0) + i));
        // Ranks go from 1 (White's side) to 16 (Black's side)
        const ranks = Array.from({length: 16}, (_, i) => i + 1);

        // Player-dependent orientation
        const displayFiles = (myColor === 'black') ? [...files].reverse() : files;
        // White wants 16 at the top, 1 at the bottom. Black wants 1 at the top, 16 at the bottom.
        const displayRanks = (myColor === 'white') ? [...ranks].reverse() : ranks;

        displayFiles.forEach(file => {
            const fileElTop = document.createElement('div');
            fileElTop.textContent = file;
            filesTop.appendChild(fileElTop);
            
            const fileElBottom = document.createElement('div');
            fileElBottom.textContent = file;
            filesBottom.appendChild(fileElBottom);
        });

        displayRanks.forEach(rank => {
            const rankElLeft = document.createElement('div');
            rankElLeft.textContent = rank;
            ranksLeft.appendChild(rankElLeft);

            const rankElRight = document.createElement('div');
            rankElRight.textContent = rank;
            ranksRight.appendChild(rankElRight);
        });
    }

    // [NEW] Renders the move history list
    function renderMoveHistory(moves) {
        const moveHistoryElement = document.getElementById('move-history');
        if (!moveHistoryElement) return;
        moveHistoryElement.innerHTML = '';
        if (!moves) return;

        moves.forEach(moveString => {
            const moveEl = document.createElement('div');
            moveEl.textContent = moveString;
            moveHistoryElement.appendChild(moveEl);
        });
        // Auto-scroll to bottom
        moveHistoryElement.scrollTop = moveHistoryElement.scrollHeight;
    }

    
    function renderBoard() {
        boardElement.innerHTML = '';
        if (!gameState.boardState) return; // Guard clause

        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                const square = document.createElement('div');
                square.classList.add('square');
                
                let displayX = x, displayY = y;
                // Board orientation
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
                
                // --- [NEW] Last Move Highlighting ---
                if (gameState.lastMove) {
                    // Use optional chaining for 'from' in case it was a drop
                    if (x === gameState.lastMove.from?.x && y === gameState.lastMove.from?.y) {
                        square.classList.add('last-move-from');
                    }
                    if (x === gameState.lastMove.to.x && y === gameState.lastMove.to.y) {
                        square.classList.add('last-move-to');
                    }
                }
                // --- [END NEW] ---

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

    // --- [NEW] Animation function for piece moves ---
    function animateMove(from, to, pieceImgSrc) {
        const fromSquareEl = document.querySelector(`[data-logical-x='${from.x}'][data-logical-y='${from.y}']`);
        const toSquareEl = document.querySelector(`[data-logical-x='${to.x}'][data-logical-y='${to.y}']`);
        
        if (!fromSquareEl || !toSquareEl) return;

        const boardRect = boardElement.getBoundingClientRect();
        const fromRect = fromSquareEl.getBoundingClientRect();
        const toRect = toSquareEl.getBoundingClientRect();

        // Calculate positions relative to the game board
        const fromTop = fromRect.top - boardRect.top;
        const fromLeft = fromRect.left - boardRect.left;
        const toTop = toRect.top - boardRect.top;
        const toLeft = toRect.left - boardRect.left;

        // Create the clone
        const clone = document.createElement('div');
        clone.className = 'piece flying-piece';
        clone.innerHTML = `<img src="${pieceImgSrc}" alt="animating piece">`;

        // Set start position
        clone.style.top = `${fromTop}px`;
        clone.style.left = `${fromLeft}px`;
        clone.style.width = `${fromRect.width}px`;
        clone.style.height = `${fromRect.height}px`;

        boardElement.appendChild(clone);

        // Force browser to register the start state
        void clone.offsetWidth;

        // Set end state to trigger transition
        clone.style.top = `${toTop}px`;
        clone.style.left = `${toLeft}px`;

        // Clean up the clone after animation
        setTimeout(() => {
            clone.remove();
        }, ANIMATION_DURATION);
    }

    // --- [NEW] Animation function for piece drops ---
    function animateDrop(to, pieceImgSrc) {
        const toSquareEl = document.querySelector(`[data-logical-x='${to.x}'][data-logical-y='${to.y}']`);
        if (!toSquareEl) return;

        const boardRect = boardElement.getBoundingClientRect();
        const toRect = toSquareEl.getBoundingClientRect();

        const toTop = toRect.top - boardRect.top;
        const toLeft = toRect.left - boardRect.left;

        const clone = document.createElement('div');
        clone.className = 'piece flying-piece drop'; // Add 'drop' class
        clone.innerHTML = `<img src="${pieceImgSrc}" alt="animating piece">`;

        // Set final position and size
        clone.style.top = `${toTop}px`;
        clone.style.left = `${toLeft}px`;
        clone.style.width = `${toRect.width}px`;
        clone.style.height = `${toRect.height}px`;

        boardElement.appendChild(clone);

        // Force reflow
        void clone.offsetWidth;

        // Trigger fade-in
        clone.style.opacity = '1';

        setTimeout(() => {
            clone.remove();
        }, ANIMATION_DURATION);
    }


    function onSquareClick(x, y) {
        if (gameState.gameOver) return;

        const isMyTurn = (isSinglePlayer && !isBotGame) || 
                         (isBotGame && gameState.isWhiteTurn) || 
                         (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        // Case 1: A piece is selected, and we're clicking a new square to move.
        if (selectedSquare && (selectedSquare.x !== x || selectedSquare.y !== y)) {
            if (isMyTurn) {
                // --- [NEW] Trigger animation before sending move ---
                const piece = gameState.boardState[selectedSquare.y][selectedSquare.x];
                if (piece) {
                    const pieceImgSrc = `sprites/${piece.type}_${piece.color}.png`;
                    animateMove(selectedSquare, { x, y }, pieceImgSrc);
                }
                // --- [END NEW] ---
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
                // --- [NEW] Trigger drop animation ---
                const dropColor = isSinglePlayer ? (gameState.isWhiteTurn ? 'white' : 'black') : myColor;
                const pieceImgSrc = `sprites/${isDroppingPiece.type}_${dropColor}.png`;
                animateDrop({ x, y }, pieceImgSrc);
                // --- [END NEW] ---
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
        { name: 'King Kraken (King)', type: 'lupa', desc: "The main objective. Moves one square in any direction. You must capture both of the opponent's King Krakens to win." },
        { name: 'Dolphin', type: 'zur', desc: 'Moves any number of squares along a rank, file, or diagonal.' },
        { name: 'Hermit Crab', type: 'kota', desc: 'Moves like a standard Rook (any number of squares horizontally or vertically) AND one square in any direction (like a King Kraken).' },
        { name: 'One Pincer Crab', type: 'fin', desc: 'Moves any number of squares diagonally. It can also move one square horizontally (non-capture only).', special: 'Promotes to Two Pincer Crab upon capturing.' },
        { name: 'Big Eye Squid', type: 'yoli', desc: 'Moves in an "L" shape (two squares in one direction, then one perpendicularly). It can also move one square horizontally or vertically.' },
        { name: 'Jellyfish', type: 'kor', desc: 'Moves like a standard Knight OR one square diagonally.' },
        { name: 'Squid', type: 'pilut', desc: "Moves one or two squares forward to an empty square. It **shields** the piece directly behind it, preventing that piece from being captured.", special: 'Promotes to Shield Squid.' },
        { name: 'Cray Fish', type: 'sult', desc: 'Moves one step diagonally forward, one step straight forward, or one step straight backward. It can also move two steps straight forward.', special: 'Promotes to Dumbo Octopus.' },
        { name: 'Fish', type: 'pawn', desc: 'Moves one square orthogonally (forwards, backwards, sideways) OR two squares diagonally in any direction.', special: 'Promotes to Dumbo Octopus.' },
        { name: 'Narwhal', type: 'cope', desc: "Has a unique forward jump and backward moves. **Special Ability:** After making a capture, the Narwhal gets a second, non-capture move during the same turn.", special: 'Bonus Move' },
        { name: 'Dumbo Octopus', type: 'chair', desc: 'Moves any number of squares diagonally or vertically (but not horizontally).' },
        { name: 'Hammer Head', type: 'jotu', desc: 'Moves like a Rook, but it can **jump over friendly pieces** along its path. When it does, any jumped friendly pieces (except Ancient Creature and Cthulhu) are returned to your hand. It captures the first enemy piece it encounters and stops.' },
        { name: 'Two Pincer Crab', type: 'finor', desc: 'Moves like a Bishop or a Knight. Acquired by capturing with a One Pincer Crab.' },
        { name: 'Shield Squid', type: 'greatshield', desc: 'Can only make non-capture moves one square forward (diagonally or straight) or straight backward. **Special Ability:** It **shields all adjacent friendly pieces** on its sides and behind it (5 total squares).', special: 'Promotes from Squid.' },
        // --- FILENAME FIX APPLIED HERE ---
        { name: 'Ancient Creature', type: 'greathorsegeneral', desc: "**Special Ability:** After making a non-capture move, it gets a second, non-capture move during the same turn. It Moves like a knight but with the the range extended by one, like a bishop in the forward diagnols, and like a rook backwards.", special: 'Bonus Move & Promotes to Cthulhu upon capturing.' },
        { name: 'Neptune', type: 'neptune', desc: 'Moves like a King Kraken or Narwhal. It can also jump over the first piece it encounters (friendly or enemy) on a straight line, then continue moving and capturing along that path.', special: 'Upon capture, it returns to the original owner\'s hand as a Mermaid.' },
        { name: 'Mermaid', type: 'mermaid', desc: 'Moves/Captures in a 5*5 square around itself, jumping over any piece.', special: 'Promotes to Neptune.' },
        { name: 'Cthulhu', type: 'cthulhu', desc: "An extremely powerful piece with the combined moves of an Ancient Creature and a Mermaid. **Special Ability:** Retains the Ancient Creature's bonus non-capture move." }
    ];

    function populateRulesModal() {
        rulesBody.innerHTML = `
            <h2>Winning the Game</h2>
            <p>There are two ways to achieve victory in Hikoro Chess:</p>
            <ul>
                <li><strong>King kraken Capture:</strong> The primary objective. Capture both of the opponent's <strong>King Krakens</strong> pieces.</li>
                <li><strong>Sanctuary Victory:</strong> Move one of your own <strong>King Kraken</strong> pieces onto one of the eight golden "Sanctuary" located on the sides of the board.</li>
            </ul>

            <h2>Special Mechanics</h2>
            <h3><span style="color: #4CAF50;">🛡️</span> Piece Protection</h3>
            <p>Some pieces can shield others from being captured. A protected piece cannot be taken.</p>
            <ul>
                <li><strong>Squid:</strong> Protects the single friendly piece directly behind it.</li>
                <li><strong>Shield Squid:</strong> Protects all adjacent friendly pieces on its sides and behind it (5 total squares).</li>
            </ul>
             <h3><span style="color: #4CAF50;">⏩</span> Bonus Moves</h3>
            <p>Certain pieces can move twice in one turn under specific conditions.</p>
            <ul>
                <li><strong>Narwhal:</strong> After making a <strong>capture</strong>, it gets a second, non-capture move.</li>
                <li><strong>Ancient Creature / Cthulhu:</strong> After making a <strong>non-capture</strong> move, it gets a second, non-capture move.</li>
            </ul>
            <h3><span style="color: #4CAF50;">✋</span> Drops</h3>
            <p>When you capture an opponent's piece (with some exceptions), it goes into your "Hand" (captured pieces area). On your turn, instead of moving a piece on the board, you can "drop" a piece from your hand onto any empty square. You cannot have more than 6 pieces in your hand.</p>

            <h2>Piece Movesets</h2>
            <div class="piece-list" id="piece-list-container"></div>
        `;

        const pieceListContainer = document.getElementById('piece-list-container');
        pieceInfo.forEach(p => {
            const entry = document.createElement('div');
            entry.className = 'piece-entry';
            // Correctly uses p.type for the image source
            entry.innerHTML = `
                <div class="piece-header">
                    <img src="sprites/${p.type}_white.png" alt="${p.name}">
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