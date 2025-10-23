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
    const winnerText = document.getElementById('winner-text'); // Corrected ID
    const singlePlayerBtn = document.getElementById('single-player-btn');
    const playBotBtn = document.getElementById('play-bot-btn');

    const gameControls = document.getElementById('game-controls');
    const mainMenuBtn = document.getElementById('main-menu-btn');
    const rulesBtnIngame = document.getElementById('rules-btn-ingame');

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
	
	const whitePalace = { minY: 0, maxY: 1, minX: 3, maxX: 6 };
    const blackPalace = { minY: 14, maxY: 15, minX: 3, maxX: 6 };
	
	

    // --- Event Listeners and Initial Setup ---
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

    rulesBtnIngame.addEventListener('click', () => {
        populateRulesModal(); // The function you already have
        rulesModal.style.display = 'block';
    });

    mainMenuBtn.addEventListener('click', () => {
        if (gameId) {
            socket.emit('leaveGame', gameId);
        }
        window.location.reload();
    });
    // --- End Initial Setup ---

    // --- Helper Functions (formatTime, updateLobby, etc.) ---
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
        botBonusState = null;
        turnIndicator.textContent = "Waiting for an opponent...";
        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
    }

    function onGameStart(initialGameState) {
        gameId = initialGameState.id;
        botBonusState = null;

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
        gameControls.style.display = 'flex';

        renderNotationMarkers();
        updateLocalState(initialGameState);
    }

    function updateLocalState(newGameState) {
        const isNewGameOver = newGameState.gameOver && !gameState.gameOver;
        gameState = newGameState; // Update global state first

        if (isNewGameOver && newGameState.winner) {
             // Check winnerText exists before modifying
            if(winnerText) {
                const winnerName = newGameState.winner === 'draw' ? 'Draw' : newGameState.winner.charAt(0).toUpperCase() + newGameState.winner.slice(1);
                 winnerText.textContent = newGameState.winner === 'draw' ? 'Draw!' : `${winnerName} Wins!`;
                if (newGameState.reason) {
                    winnerText.textContent += ` (${newGameState.reason})`;
                }
            } else {
                console.error("winnerText element not found!");
            }
        }

        renderBoard();
        renderCaptured();
        updateTurnIndicator();
        renderMoveHistory(gameState.moveList);

        if (isBotGame && !gameState.gameOver && !gameState.isWhiteTurn) {
            setTimeout(() => {
                const capturedPiecesForBot = botBonusState ? [] : gameState.blackCaptured;
                const currentBonusState = botBonusState;
                botBonusState = null;

                // Make sure findBestMoveWithTimeLimit is globally available or imported
                const bestMove = findBestMoveWithTimeLimit(gameState, capturedPiecesForBot, currentBonusState);

                if (bestMove) {
                     const pieceThatMoved = bestMove.type === 'board' && gameState.boardState[bestMove.from.y]
                        ? gameState.boardState[bestMove.from.y][bestMove.from.x]
                        : null; // Handle potential out-of-bounds or non-board move

                    if (pieceThatMoved && !currentBonusState) {
                        const isCopeBonus = pieceThatMoved.type === 'cope' && bestMove.isAttack;
                        const isGHGBonus = (pieceThatMoved.type === 'greathorsegeneral' || pieceThatMoved.type === 'cthulhu') && !bestMove.isAttack;

                        if (isCopeBonus || isGHGBonus) {
                            botBonusState = {
                                piece: { ...pieceThatMoved },
                                from: { ...bestMove.to }
                            };
                        }
                    }

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
    }


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
        const ranks = Array.from({length: 16}, (_, i) => i + 1);

        const displayFiles = (myColor === 'black') ? [...files].reverse() : files;
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

                // Last Move Highlighting
                if (gameState.lastMove) {
                    if (x === gameState.lastMove.from?.x && y === gameState.lastMove.from?.y) {
                        square.classList.add('last-move-from');
                    }
                    if (x === gameState.lastMove.to.x && y === gameState.lastMove.to.y) {
                        square.classList.add('last-move-to');
                    }
                }

                const isSanctuary = sanctuarySquares.some(sq => sq.x === x && sq.y === y);
                if (isSanctuary) {
                    square.classList.add('sanctuary-square');
                }

                // --- [NEW] Add palace class ---
                const isWhitePalace = (x >= whitePalace.minX && x <= whitePalace.maxX && y >= whitePalace.minY && y <= whitePalace.maxY);
                const isBlackPalace = (x >= blackPalace.minX && x <= blackPalace.maxX && y >= blackPalace.minY && y <= blackPalace.maxY);
                if(isWhitePalace || isBlackPalace) {
                    square.classList.add('palace-square');
                }
                // --- [END NEW] ---

                // Assuming isPositionValid determines if a square is playable at all
                const isBoardValid = isPositionValid(x, y);

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
                    const spriteType = piece.type === 'prince' ? 'prince' : piece.type;
                    spriteImg.src = `sprites/${spriteType}_${piece.color}.png`;
                    spriteImg.alt = `${piece.color} ${piece.type}`;

                    pieceElement.appendChild(spriteImg);
                    square.appendChild(pieceElement);
                }
                boardElement.appendChild(square);
            }
        }
    }


    function renderCaptured() {
        // Assume gameState exists and has the necessary properties
        if (!gameState || !gameState.whiteCaptured || !gameState.blackCaptured) {
             console.error("Gamestate incomplete for renderCaptured");
             return;
        }

        const myCaptured = myColor === 'white' ? gameState.whiteCaptured : gameState.blackCaptured;
        const oppCaptured = myColor === 'white' ? gameState.blackCaptured : gameState.whiteCaptured;
        const myCapturedEl = document.querySelector(myColor === 'white' ? '#white-captured' : '#black-captured');
        const oppCapturedEl = document.querySelector(myColor === 'white' ? '#black-captured' : '#white-captured');

        // Check if elements exist
        if (!myCapturedEl || !oppCapturedEl) {
            console.error("Captured piece elements not found!");
            return;
        }


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
            // --- [NEW] Ensure correct Prince sprite is used ---
            const spriteType = piece.type === 'prince' ? 'prince' : piece.type;
            spriteImg.src = `sprites/${spriteType}_${isMyPiece ? myColor : (myColor === 'white' ? 'black' : 'white')}.png`;
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
         // Check if elements exist before updating
        if (!turnIndicator || !winnerText) {
             console.error("Turn indicator or winner text element not found!");
             return;
         }

        if (gameState.gameOver) {
            turnIndicator.textContent = ''; // Clear turn indicator on game over
            // Only update winner text if it hasn't been set yet (prevents overwriting)
            if(!winnerText.textContent || winnerText.textContent.includes("Turn")) {
                 const winnerName = gameState.winner === 'draw' ? 'Draw' : gameState.winner.charAt(0).toUpperCase() + gameState.winner.slice(1);
                 winnerText.textContent = gameState.winner === 'draw' ? 'Draw!' : `${winnerName} Wins!`;
                 if (gameState.reason) {
                    winnerText.textContent += ` (${gameState.reason})`;
                }
            }
        } else {
             winnerText.textContent = ''; // Clear winner text if game is ongoing
            if (isSinglePlayer) {
                turnIndicator.textContent = gameState.isWhiteTurn ? "White's Turn" : "Black's Turn";
            } else {
                const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
                turnIndicator.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
            }
        }
    }


    function animateMove(from, to, pieceImgSrc) {
        const fromSquareEl = document.querySelector(`[data-logical-x='${from.x}'][data-logical-y='${from.y}']`);
        const toSquareEl = document.querySelector(`[data-logical-x='${to.x}'][data-logical-y='${to.y}']`);

        if (!fromSquareEl || !toSquareEl || !boardElement) return; // Add boardElement check

        const boardRect = boardElement.getBoundingClientRect();
        const fromRect = fromSquareEl.getBoundingClientRect();
        const toRect = toSquareEl.getBoundingClientRect();

        const fromTop = fromRect.top - boardRect.top;
        const fromLeft = fromRect.left - boardRect.left;
        const toTop = toRect.top - boardRect.top;
        const toLeft = toRect.left - boardRect.left;

        const clone = document.createElement('div');
        clone.className = 'piece flying-piece';
        clone.innerHTML = `<img src="${pieceImgSrc}" alt="animating piece">`;

        clone.style.top = `${fromTop}px`;
        clone.style.left = `${fromLeft}px`;
        clone.style.width = `${fromRect.width}px`;
        clone.style.height = `${fromRect.height}px`;

        boardElement.appendChild(clone);
        void clone.offsetWidth;

        clone.style.top = `${toTop}px`;
        clone.style.left = `${toLeft}px`;

        setTimeout(() => {
            clone.remove();
        }, ANIMATION_DURATION);
    }

    function animateDrop(to, pieceImgSrc) {
        const toSquareEl = document.querySelector(`[data-logical-x='${to.x}'][data-logical-y='${to.y}']`);
        if (!toSquareEl || !boardElement) return; // Add boardElement check

        const boardRect = boardElement.getBoundingClientRect();
        const toRect = toSquareEl.getBoundingClientRect();

        const toTop = toRect.top - boardRect.top;
        const toLeft = toRect.left - boardRect.left;

        const clone = document.createElement('div');
        clone.className = 'piece flying-piece drop';
        clone.innerHTML = `<img src="${pieceImgSrc}" alt="animating piece">`;

        clone.style.top = `${toTop}px`;
        clone.style.left = `${toLeft}px`;
        clone.style.width = `${toRect.width}px`;
        clone.style.height = `${toRect.height}px`;

        boardElement.appendChild(clone);
        void clone.offsetWidth;
        clone.style.opacity = '1';

        setTimeout(() => {
            clone.remove();
        }, ANIMATION_DURATION);
    }


    function onSquareClick(x, y) {
        if (gameState.gameOver || !gameState.boardState) return; // Add gameState.boardState check

        const isMyTurn = (isSinglePlayer && !isBotGame) ||
                         (isBotGame && gameState.isWhiteTurn) ||
                         (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        // Case 1: Moving a selected piece
        if (selectedSquare && (selectedSquare.x !== x || selectedSquare.y !== y)) {
            if (isMyTurn) {
                const piece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x]; // Safe access
                if (piece) {
                     // --- [MODIFIED] Ensure correct Prince sprite is used ---
                     const spriteType = piece.type === 'prince' ? 'prince' : piece.type;
                    const pieceImgSrc = `sprites/${spriteType}_${piece.color}.png`;
                    animateMove(selectedSquare, { x, y }, pieceImgSrc);
                }
                socket.emit('makeMove', { gameId, from: selectedSquare, to: { x, y } });
            }
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
            return;
        }

        // Case 2: Dropping a selected piece
        if (isDroppingPiece) {
             // Prevent dropping King or Prince
             if (isDroppingPiece.type === 'lupa' || isDroppingPiece.type === 'prince') {
                  console.log("Cannot drop King or Prince.");
                  isDroppingPiece = null;
                  clearHighlights();
                  return;
             }
            if (isMyTurn) {
                const dropColor = isSinglePlayer ? (gameState.isWhiteTurn ? 'white' : 'black') : myColor;
                 // --- [MODIFIED] Ensure correct Prince sprite is used ---
                 const spriteType = isDroppingPiece.type === 'prince' ? 'prince' : isDroppingPiece.type;
                const pieceImgSrc = `sprites/${spriteType}_${dropColor}.png`;
                animateDrop({ x, y }, pieceImgSrc);
                socket.emit('makeDrop', { gameId, piece: isDroppingPiece, to: { x, y } });
            }
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
            return;
        }

        // Case 3: Selecting/deselecting a piece on the board
        const piece = gameState.boardState[y]?.[x]; // Safe access
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
        } else { // Case 4: Clicking an empty square
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
        }
    }

    function clearHighlights() {
        document.querySelectorAll('.square.selected, .square.preview-selected').forEach(s => {
            s.classList.remove('selected', 'preview-selected');
        });
        document.querySelectorAll('.move-plate').forEach(p => p.remove());
    }

    function drawHighlights(moves) {
        clearHighlights(); // Clear previous highlights first

        // Handle both piece selection and drop selection highlighting
        const elementToHighlight = selectedSquare
             ? document.querySelector(`[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`)
             : document.querySelector('.captured-piece.selected-drop'); // Need to add this class in onCapturedClick

        if (!elementToHighlight && !isDroppingPiece) return; // Nothing is selected

        const isMyTurn = (isSinglePlayer && !isBotGame) ||
                         (isBotGame && gameState.isWhiteTurn) ||
                         (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        if (selectedSquare && elementToHighlight) {
            elementToHighlight.classList.add(isMyTurn ? 'selected' : 'preview-selected');
        }
         // Highlight drop selection later if needed (requires adding class)

        moves.forEach(move => {
            const moveSquare = document.querySelector(`[data-logical-x='${move.x}'][data-logical-y='${move.y}']`);
            if (moveSquare) {
                const plate = document.createElement('div');
                plate.classList.add('move-plate');
                if (!isMyTurn) plate.classList.add('preview');
                if (move.isAttack) plate.classList.add('attack');
                 // Add specific class for drop highlights if needed (e.g., 'drop-plate')
                if (isDroppingPiece) plate.classList.add('drop');

                moveSquare.appendChild(plate);
            }
        });
    }

    function onCapturedClick(piece) {
         if (gameState.gameOver) return;

         // Prevent selecting King or Prince from hand (shouldn't be possible anyway)
        if (piece.type === 'lupa' || piece.type === 'prince') {
            console.log("Cannot select royalty from hand.");
            return;
        }

        // Deselect if clicking the same piece type again
        if (isDroppingPiece && isDroppingPiece.type === piece.type) {
            isDroppingPiece = null;
            selectedSquare = null; // Ensure board selection is also cleared
            clearHighlights();
            // TODO: Remove selected-drop class if you add it
            return;
        }

        selectedSquare = null; // Clear board selection
        isDroppingPiece = piece;
        clearHighlights(); // Clear board highlights
        // TODO: Add 'selected-drop' class to the clicked captured piece element
        highlightDropSquares();
    }


    function highlightDropSquares() {
        clearHighlights(); // Clear board highlights first

        // Highlight the selected captured piece if needed (add CSS for .captured-piece.selected-drop)
        // Example: Add class to the specific captured piece element

        const isMyTurn = (isSinglePlayer && !isBotGame) ||
                         (isBotGame && gameState.isWhiteTurn) ||
                         (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                 // const isBoardValid = !((x <= 1 && y <= 2) || (x >= 8 && y <= 2) || (x <= 1 && y >= 13) || (x >= 8 && y >= 13));
                 const isBoardValid = isPositionValid(x, y); // Use helper function

                // Check if square is empty AND valid for dropping
                if (gameState.boardState && gameState.boardState[y]?.[x] === null && isBoardValid) {
                     // Additional drop rules can be added here if needed (e.g., pawn drop restrictions)
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


    // --- Rules Modal Logic ---
    const rulesBtn = document.getElementById('rules-btn');
    const rulesModal = document.getElementById('rules-modal');
    const closeRulesBtn = document.getElementById('close-rules-btn');
    const rulesBody = document.getElementById('rules-body');

    // [MODIFIED] pieceInfo array with Prince and updated King
    const pieceInfo = [
        { name: 'King Kraken (King)', type: 'lupa', notation: 'K', desc: "The primary royal piece. Moves one square in any direction. **Special Rule:** Starts confined to the 'Palace' (the central 4x2 area on the back rank). It can only leave the Palace if your Kraken Prince has been captured.", special: 'Capture required to win.' },
        { name: 'Kraken Prince', type: 'prince', notation: 'KP', desc: "The secondary royal piece. Moves one step forward, or one step diagonally (forward or backward), like a Silver General in Shogi.", special: 'Capture required to win. Reaching a Sanctuary wins the game. If captured, the King Kraken is freed from the Palace.' },
        { name: 'Dolphin', type: 'zur', notation: 'D', desc: 'Moves any number of squares along a rank, file, or diagonal.' },
        { name: 'Hermit Crab', type: 'kota', notation: 'H', desc: 'Moves like a standard Rook (any number of squares horizontally or vertically) AND one square in any direction (like a King Kraken).' },
        { name: 'One Pincer Crab', type: 'fin', notation: 'Oc', desc: 'Moves any number of squares diagonally. It can also move one square horizontally (non-capture only).', special: 'Promotes to Two Pincer Crab upon capturing.' },
        { name: 'Big Eye Squid', type: 'yoli', notation: 'B', desc: 'Moves in an "L" shape (two squares in one direction, then one perpendicularly). It can also move one square horizontally or vertically.' },
        { name: 'Jellyfish', type: 'kor', notation: 'J', desc: 'Moves like a standard Knight OR one square diagonally.' },
        { name: 'Squid', type: 'pilut', notation: 'S', desc: "Moves one or two squares forward to an empty square. It **shields** the piece directly behind it, preventing that piece from being captured.", special: 'Promotes to Shield Squid.' },
        { name: 'Cray Fish', type: 'sult', notation: 'Cr', desc: 'Moves one step diagonally forward, one step straight forward, or one step straight backward. It can also move two steps straight forward.', special: 'Promotes to Dumbo Octopus.' },
        { name: 'Fish', type: 'pawn', notation: 'F', desc: 'Moves one square orthogonally (forwards, backwards, sideways) OR two squares diagonally in any direction.', special: 'Promotes to Dumbo Octopus.' },
        { name: 'Narwhal', type: 'cope', notation: 'Na', desc: "Has a unique forward jump and backward moves. **Special Ability:** After making a capture, the Narwhal gets a second, non-capture move during the same turn.", special: 'Bonus Move' },
        { name: 'Dumbo Octopus', type: 'chair', notation: 'Du', desc: 'Moves any number of squares diagonally or vertically (but not horizontally).' },
        { name: 'Hammer Head', type: 'jotu', notation: 'Sh', desc: 'Moves like a Rook, but it can **jump over friendly pieces** along its path. When it does, any jumped friendly pieces (except Ancient Creature and Cthulhu) are returned to your hand. It captures the first enemy piece it encounters and stops.' },
        { name: 'Two Pincer Crab', type: 'finor', notation: 'Tc', desc: 'Moves like a Bishop or a Knight. Acquired by capturing with a One Pincer Crab.' },
        { name: 'Shield Squid', type: 'greatshield', notation: 'Ss', desc: 'Can only make non-capture moves one square forward (diagonally or straight) or straight backward. **Special Ability:** It **shields all adjacent friendly pieces** on its sides and behind it (5 total squares).', special: 'Promotes from Squid.' },
        { name: 'Ancient Creature', type: 'greathorsegeneral', notation: 'Ac', desc: "**Special Ability:** After making a non-capture move, it gets a second, non-capture move during the same turn. It Moves like a knight but with the the range extended by one, like a bishop in the forward diagnols, and like a rook backwards.", special: 'Bonus Move & Promotes to Cthulhu upon capturing.' },
        { name: 'Neptune', type: 'neptune', notation: 'Np', desc: 'Moves like a King Kraken or Narwhal. It can also jump over the first piece it encounters (friendly or enemy) on a straight line, then continue moving and capturing along that path.', special: 'Upon capture, it returns to the original owner\'s hand as a Mermaid.' },
        { name: 'Mermaid', type: 'mermaid', notation: 'Mm', desc: 'Moves/Captures in a 5*5 square around itself, jumping over any piece.', special: 'Promotes to Neptune.' },
        { name: 'Cthulhu', type: 'cthulhu', notation: 'Ct', desc: "An extremely powerful piece with the combined moves of an Ancient Creature and a Mermaid. **Special Ability:** Retains the Ancient Creature's bonus non-capture move." }
    ];


    // [MODIFIED] Updated rules text
    function populateRulesModal() {
        rulesBody.innerHTML = `
            <h2>Winning the Game</h2>
            <p>There are two primary ways to achieve victory in Hikoro Chess:</p>
            <ul>
                <li><strong>Royalty Capture:</strong> Capture **both** the opponent's <strong>King Kraken</strong> and their <strong>Kraken Prince</strong>. Capturing only one is not sufficient.</li>
                <li><strong>Sanctuary Victory:</strong> Move either your own <strong>King Kraken</strong> OR your <strong>Kraken Prince</strong> onto one of the eight golden "Sanctuary" squares located on the sides of the board (rows 8 and 9, files a, b, i, j).</li>
            </ul>

            <h2>Special Mechanics</h2>

            <h3><span style="color: #FF5722;">👑</span> The Royal Family & The Palace</h3>
            <p>The King Kraken and Kraken Prince are special.</p>
            <ul>
                <li><strong>King Kraken Palace Rule:</strong> The King Kraken starts in and is confined to its "Palace" - the 4x2 area in the center of its back rank (squares d1-g1, d2-g2 for White; d15-g15, d16-g16 for Black). The King cannot leave this area.</li>
                <li><strong>Prince's Freedom:</strong> If your Kraken Prince is captured by the opponent, your King Kraken is immediately freed and can move anywhere on the board like a standard King for the rest of the game.</li>
                <li><strong>Royal Capture Rule:</strong> Neither the King Kraken nor the Kraken Prince can be taken and added to the capturing player's hand when captured. They are simply removed from the board. You must capture both to win via captures.</li>
            </ul>

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
            <p>When you capture an opponent's piece (excluding the King Kraken and Kraken Prince), it goes into your "Hand" (captured pieces area). On your turn, instead of moving a piece on the board, you can "drop" a piece from your hand onto any empty, valid square. You cannot have more than 6 pieces in your hand.</p>

            <h2>Piece Movesets</h2>
            <div class="piece-list" id="piece-list-container"></div>
        `;

        const pieceListContainer = document.getElementById('piece-list-container');
        if (!pieceListContainer) return; // Add safety check
        pieceListContainer.innerHTML = ''; // Clear previous entries

        // Sort pieces for better order (King, Prince first) and render
        [...pieceInfo].sort((a, b) => {
             if (a.type === 'lupa') return -1;
             if (b.type === 'lupa') return 1;
             if (a.type === 'prince') return -1; // Prince comes after King
             if (b.type === 'prince') return 1;
             // You might want additional sorting logic here, e.g., by name or value
             return 0; // Keep original relative order otherwise
         }).forEach(p => {
            const entry = document.createElement('div');
            entry.className = 'piece-entry';
            // Use the notation property from pieceInfo
            const notation = p.notation || '?';
            entry.innerHTML = `
                <div class="piece-header">
                    <img src="sprites/${p.type}_white.png" alt="${p.name}">
                    <span>${p.name} (${notation})</span>
                </div>
                <p>${p.desc}</p>
                ${p.special ? `<p><em><strong>Note:</strong> ${p.special}</em></p>` : ''}
            `;
            pieceListContainer.appendChild(entry);
        });
    }

    rulesBtn.addEventListener('click', () => {
        populateRulesModal();
        if (rulesModal) rulesModal.style.display = 'block'; // Safety check
    });

    closeRulesBtn.addEventListener('click', () => {
       if (rulesModal) rulesModal.style.display = 'none'; // Safety check
    });

    window.addEventListener('click', (event) => {
        if (event.target == rulesModal) {
            if (rulesModal) rulesModal.style.display = 'none'; // Safety check
        }
    });
    // --- End Rules Modal ---

}); // End DOMContentLoaded