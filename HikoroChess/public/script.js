document.addEventListener('DOMContentLoaded', () => {

    const productionUrl = 'https://HikoroChess.org';
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const serverUrl = isLocal ? 'http://localhost:3000' : window.location.origin;

    const socket = io(serverUrl);

    // --- Create the Web Worker ---
    let botWorker = null;
    try {
        botWorker = new Worker('botWorker.js');
        console.log("Bot Worker created successfully.");

        // --- Handle messages FROM the worker ---
        botWorker.onmessage = function(e) {
            const bestMove = e.data;
            console.log("Received best move from worker:", bestMove);

            if (bestMove) {
                // Determine piece that potentially triggered bonus (needed for botBonusState update)
                const pieceThatMoved = bestMove.type === 'board' && gameState.boardState[bestMove.from.y]
                    ? gameState.boardState[bestMove.from.y][bestMove.from.x]
                    : null;

                // Update botBonusState *before* sending move to server, based on the move the bot *just* decided on.
                // We clear botBonusState *before* asking the worker, so this check is for the *next* turn.
                if (pieceThatMoved && !currentTurnHadBonusState) { // Use a flag to track if the current calculation was already a bonus
                    const isCopeBonus = pieceThatMoved.type === 'cope' && bestMove.isAttack;
                    const isGHGBonus = (pieceThatMoved.type === 'greathorsegeneral' || pieceThatMoved.type === 'cthulhu') && !bestMove.isAttack;

                    if (isCopeBonus || isGHGBonus) {
                        botBonusState = {
                            piece: { ...pieceThatMoved },
                            from: { ...bestMove.to }
                        };
                         console.log("Setting up botBonusState for next turn:", botBonusState);
                    } else {
                        botBonusState = null; // Clear if no bonus triggered
                    }
                } else {
                     botBonusState = null; // Clear if it was already a bonus move calculation or not a bonus trigger
                }


                // --- Send the move TO the server ---
                if (bestMove.type === 'drop') {
                    socket.emit('makeDrop', { gameId, piece: { type: bestMove.pieceType }, to: bestMove.to });
                } else {
                    socket.emit('makeMove', { gameId, from: bestMove.from, to: bestMove.to });
                }
            } else {
                console.error("Bot worker returned no move.");
                // Handle stalemate or error? Maybe alert the user?
            }
        };

        botWorker.onerror = function(error) {
            console.error("Error in Bot Worker:", error.message, error);
            // Handle worker error - maybe display a message to the user
        };

    } catch (e) {
        console.error("Failed to create Bot Worker:", e);
        alert("Could not initialize the AI worker. The bot will not function.");
        // Disable bot play if worker fails?
    }
    // --- End Worker Setup ---


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

    const gameControls = document.getElementById('game-controls');
    const mainMenuBtn = document.getElementById('main-menu-btn');
    const rulesBtnIngame = document.getElementById('rules-btn-ingame');

    const ANIMATION_DURATION = 250;

    let gameState = {};
    let myColor = null;
    let gameId = null;
    let selectedSquare = null;
    let isDroppingPiece = null;
    let isSinglePlayer = false;
    let isBotGame = false;

    let botBonusState = null; // Still needed to track bonus state between turns
    let currentTurnHadBonusState = false; // Flag for worker message handler


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
        botBonusState = null;
        socket.emit('createSinglePlayerGame');
    });

    playBotBtn.addEventListener('click', () => {
        isSinglePlayer = true;
        isBotGame = true;
        botBonusState = null;
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
        populateRulesModal();
        rulesModal.style.display = 'block';
    });

    mainMenuBtn.addEventListener('click', () => {
        if (gameId) {
            socket.emit('leaveGame', gameId);
        }
        window.location.reload();
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
            myColor = 'white'; // Assume player is white in SP/Bot games
             isBotGame = initialGameState.players.black === 'BOT'; // Check if it's explicitly a bot game if server sets it
             // Or keep the logic from playBotBtn click:
             // isBotGame = isBotGame && isSinglePlayer;
        } else if (!myColor) {
            myColor = 'black'; // Joined a game
            isSinglePlayer = false;
            isBotGame = false;
        }

        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
        gameControls.style.display = 'flex';

        renderNotationMarkers();
        updateLocalState(initialGameState);
    }

    function updateLocalState(newGameState) {
        const isNewGameOver = newGameState.gameOver && !gameState.gameOver;
        gameState = newGameState;

        if (isNewGameOver && newGameState.winner) {
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
		
		console.log(`[updateLocalState] Checking bot turn: isBotGame=${isBotGame}, gameOver=${gameState.gameOver}, isWhiteTurn=${gameState.isWhiteTurn}, botWorkerExists=${!!botWorker}`);

        // --- Trigger Bot Move via Web Worker ---
        if (isBotGame && !gameState.gameOver && !gameState.isWhiteTurn && botWorker) {
            console.log("Bot's turn. Sending state to worker. Bonus state:", botBonusState);
            // Send necessary data to the worker
            const capturedPiecesForBot = gameState.blackCaptured; // Worker needs captured pieces for potential drops
            currentTurnHadBonusState = !!botBonusState; // Set flag before clearing

            // Make deep copies to avoid issues with transferable objects if needed later
            const safeGameState = JSON.parse(JSON.stringify(gameState));
            const safeCapturedPieces = JSON.parse(JSON.stringify(capturedPiecesForBot));
            const safeBonusState = botBonusState ? JSON.parse(JSON.stringify(botBonusState)) : null;

             // Clear botBonusState for the *next* turn calculation, the worker will use the state passed in message
             // botBonusState = null; // We'll set this *after* the worker returns the move
			 console.log("Posting message to worker:", { gameState: safeGameState, capturedPieces: safeCapturedPieces, bonusMoveState: safeBonusState });

            botWorker.postMessage({
                gameState: safeGameState,
                capturedPieces: safeCapturedPieces,
                bonusMoveState: safeBonusState
            });

        } else if (isBotGame && !gameState.isWhiteTurn && !botWorker) {
            console.error("Bot's turn, but worker is not available!");
        }
	
		else { // ADD THIS ELSE
             console.log("[updateLocalState] Conditions *not* met for bot move.");
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

        const displayFiles = (myColor === 'black' && !isSinglePlayer) ? [...files].reverse() : files;
        const displayRanks = (myColor === 'white' || isSinglePlayer) ? [...ranks].reverse() : ranks;


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
        if (!gameState.boardState) return;

        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                const square = document.createElement('div');
                square.classList.add('square');

                let displayX = x, displayY = y;
                if (myColor === 'white' || isSinglePlayer) { // White's perspective for player 1 or single player
                    displayY = BOARD_HEIGHT - 1 - y;
                } else if (myColor === 'black') { // Black's perspective if player 2
                    displayX = BOARD_WIDTH - 1 - x;
                     displayY = y; // Keep original y for black perspective if needed, or reverse like white? Reverse seems more standard. Let's reverse both.
                     displayY = y; // Actually keep y as is, just reverse x
                     displayX = BOARD_WIDTH - 1 - x; // Reverse x for black
                }


                square.dataset.logicalX = x;
                square.dataset.logicalY = y;
                square.style.gridRowStart = displayY + 1;
                square.style.gridColumnStart = displayX + 1;

                if (gameState.lastMove) {
                    if (gameState.lastMove.from && x === gameState.lastMove.from.x && y === gameState.lastMove.from.y) {
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

                const isWhitePalace = (x >= whitePalace.minX && x <= whitePalace.maxX && y >= whitePalace.minY && y <= whitePalace.maxY);
                const isBlackPalace = (x >= blackPalace.minX && x <= blackPalace.maxX && y >= blackPalace.minY && y <= blackPalace.maxY);
                if(isWhitePalace || isBlackPalace) {
                    square.classList.add('palace-square');
                }

                 // Use a separate isPositionValid function assumed to be globally available or imported
                 // Ensure this function exists or copy it here.
                const isBoardValid = typeof isPositionValid === 'function' ? isPositionValid(x, y) : true; // Fallback


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

                const piece = gameState.boardState[y]?.[x]; // Safe access
                if (piece) {
                    const pieceElement = document.createElement('div');
                    pieceElement.classList.add('piece', piece.color);

                    const spriteImg = document.createElement('img');
                    const spriteType = piece.type;
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
        if (!gameState || !gameState.whiteCaptured || !gameState.blackCaptured) {
            console.error("Gamestate incomplete for renderCaptured");
            return;
        }

         const playerCaptured = (isSinglePlayer || myColor === 'white') ? gameState.whiteCaptured : gameState.blackCaptured;
         const opponentCaptured = (isSinglePlayer || myColor === 'white') ? gameState.blackCaptured : gameState.whiteCaptured;
         const playerCapturedEl = document.querySelector((isSinglePlayer || myColor === 'white') ? '#white-captured' : '#black-captured');
         const opponentCapturedEl = document.querySelector((isSinglePlayer || myColor === 'white') ? '#black-captured' : '#white-captured');


        if (!playerCapturedEl || !opponentCapturedEl) {
            console.error("Captured piece elements not found!");
            return;
        }

        const playerLabelEl = document.querySelector((isSinglePlayer || myColor === 'white') ? '#white-captured-area .hand-label' : '#black-captured-area .hand-label');
        const opponentLabelEl = document.querySelector((isSinglePlayer || myColor === 'white') ? '#black-captured-area .hand-label' : '#white-captured-area .hand-label');


        if (isSinglePlayer) {
             playerLabelEl.textContent = "Your Hand";
             opponentLabelEl.textContent = isBotGame ? "Bot's Hand" : "Black's Hand"; // Assuming player is white in SP
        } else {
             playerLabelEl.textContent = "Your Hand";
             opponentLabelEl.textContent = "Opponent's Hand";
        }


        playerCapturedEl.innerHTML = '';
        opponentCapturedEl.innerHTML = '';

        const createCapturedPieceElement = (piece, isPlayerPiece) => {
            const el = document.createElement('div');
            el.classList.add('captured-piece', piece.color);

            const pieceElement = document.createElement('div');
            pieceElement.classList.add('piece');

            const spriteImg = document.createElement('img');
            const spriteType = piece.type;
            // Determine the color to display based on whose hand it's theoretically in
             const displayColor = isPlayerPiece ? (isSinglePlayer ? 'white' : myColor) : (isSinglePlayer ? 'black' : (myColor === 'white' ? 'black' : 'white'));
             spriteImg.src = `sprites/${spriteType}_${displayColor}.png`;
             spriteImg.alt = `${displayColor} ${piece.type}`;


            pieceElement.appendChild(spriteImg);
            el.appendChild(pieceElement);

            if (isPlayerPiece) {
                el.addEventListener('click', () => onCapturedClick(piece));
            }
            return el;
        };

        playerCaptured.forEach((piece) => {
            const pieceEl = createCapturedPieceElement(piece, true);
            playerCapturedEl.appendChild(pieceEl);
        });

        opponentCaptured.forEach((piece) => {
            const pieceEl = createCapturedPieceElement(piece, false);
            opponentCapturedEl.appendChild(pieceEl);
        });
    }

    function updateTurnIndicator() {
        if (!turnIndicator || !winnerText) {
            console.error("Turn indicator or winner text element not found!");
            return;
        }

        if (gameState.gameOver) {
            turnIndicator.textContent = '';
            if(!winnerText.textContent || winnerText.textContent.includes("Turn")) {
                const winnerName = gameState.winner === 'draw' ? 'Draw' : gameState.winner.charAt(0).toUpperCase() + gameState.winner.slice(1);
                winnerText.textContent = gameState.winner === 'draw' ? 'Draw!' : `${winnerName} Wins!`;
                if (gameState.reason) {
                    winnerText.textContent += ` (${gameState.reason})`;
                }
            }
        } else {
            winnerText.textContent = '';
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

        if (!fromSquareEl || !toSquareEl || !boardElement) return;

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

        clone.style.position = 'absolute'; // Ensure positioning context
        clone.style.top = `${fromTop}px`;
        clone.style.left = `${fromLeft}px`;
        clone.style.width = `${fromRect.width}px`;
        clone.style.height = `${fromRect.height}px`;
        clone.style.zIndex = '100'; // Make sure it's above other pieces
        clone.style.transition = `top ${ANIMATION_DURATION}ms ease-out, left ${ANIMATION_DURATION}ms ease-out`;


        boardElement.appendChild(clone);
        void clone.offsetWidth;

        clone.style.top = `${toTop}px`;
        clone.style.left = `${toLeft}px`;

        setTimeout(() => {
             if (clone.parentNode === boardElement) { // Check if it's still attached
                clone.remove();
             }
        }, ANIMATION_DURATION);
    }

    function animateDrop(to, pieceImgSrc) {
        const toSquareEl = document.querySelector(`[data-logical-x='${to.x}'][data-logical-y='${to.y}']`);
        if (!toSquareEl || !boardElement) return;

        const boardRect = boardElement.getBoundingClientRect();
        const toRect = toSquareEl.getBoundingClientRect();

        const toTop = toRect.top - boardRect.top;
        const toLeft = toRect.left - boardRect.left;

        const clone = document.createElement('div');
        clone.className = 'piece flying-piece drop'; // Add 'drop' class for potential styling
        clone.innerHTML = `<img src="${pieceImgSrc}" alt="animating piece">`;

        clone.style.position = 'absolute';
        clone.style.top = `${toTop - toRect.height}px`; // Start above
        clone.style.left = `${toLeft}px`;
        clone.style.width = `${toRect.width}px`;
        clone.style.height = `${toRect.height}px`;
        clone.style.zIndex = '100';
        clone.style.opacity = '0';
        clone.style.transition = `top ${ANIMATION_DURATION}ms ease-in, opacity ${ANIMATION_DURATION}ms ease-in`;


        boardElement.appendChild(clone);
        void clone.offsetWidth;
        clone.style.top = `${toTop}px`;
        clone.style.opacity = '1';

        setTimeout(() => {
             if (clone.parentNode === boardElement) {
                clone.remove();
            }
        }, ANIMATION_DURATION);
    }


    function onSquareClick(x, y) {
        if (gameState.gameOver || !gameState.boardState) return;

        const isPlayerTurn = (isSinglePlayer && !isBotGame) ||
                           (isBotGame && gameState.isWhiteTurn) || // Player always plays white vs bot
                           (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        if (!isPlayerTurn) return; // Ignore clicks if not player's turn

        if (selectedSquare && (selectedSquare.x !== x || selectedSquare.y !== y)) {
            const piece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
            if (piece) {
                const spriteType = piece.type;
                const pieceImgSrc = `sprites/${spriteType}_${piece.color}.png`;
                animateMove(selectedSquare, { x, y }, pieceImgSrc);
            }
            socket.emit('makeMove', { gameId, from: selectedSquare, to: { x, y } });
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
            return;
        }

        if (isDroppingPiece) {
             if (isDroppingPiece.type === 'lupa' || isDroppingPiece.type === 'prince') {
                 console.log("Cannot drop King or Prince.");
                 isDroppingPiece = null;
                 clearHighlights();
                 return;
             }
            const dropColor = isSinglePlayer ? (gameState.isWhiteTurn ? 'white' : 'black') : myColor;
            const spriteType = isDroppingPiece.type;
            const pieceImgSrc = `sprites/${spriteType}_${dropColor}.png`;
            animateDrop({ x, y }, pieceImgSrc);
            socket.emit('makeDrop', { gameId, piece: isDroppingPiece, to: { x, y } });
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
            return;
        }

        const piece = gameState.boardState[y]?.[x];
        if (piece) {
            let canSelectPiece;
             if (isSinglePlayer) {
                 // In SP/Bot games, player is always white (or current turn's color if hotseat)
                 canSelectPiece = piece.color === (gameState.isWhiteTurn ? 'white' : 'black');
                 if(isBotGame && !gameState.isWhiteTurn) canSelectPiece = false; // Player can only move white vs bot
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
                    socket.emit('getValidMoves', { gameId, square: { x, y } }); // Request highlights from server
                }
            }
        } else {
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
         document.querySelectorAll('.captured-piece.selected-drop').forEach(p => p.classList.remove('selected-drop')); // Clear captured highlight
    }

    function drawHighlights(moves) {
        clearHighlights();

        const elementToHighlight = selectedSquare
            ? document.querySelector(`[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`)
            : document.querySelector('.captured-piece.selected-drop');

        if (!elementToHighlight && !isDroppingPiece) return;

        const isPlayerTurn = (isSinglePlayer && !isBotGame) ||
                           (isBotGame && gameState.isWhiteTurn) ||
                           (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));


         if (selectedSquare && elementToHighlight) {
            elementToHighlight.classList.add(isPlayerTurn ? 'selected' : 'preview-selected');
         } else if (isDroppingPiece && elementToHighlight) {
             // Already handled by adding 'selected-drop' in onCapturedClick
         }

        moves.forEach(move => {
            const moveSquare = document.querySelector(`[data-logical-x='${move.x}'][data-logical-y='${move.y}']`);
            if (moveSquare) {
                const plate = document.createElement('div');
                plate.classList.add('move-plate');
                if (!isPlayerTurn) plate.classList.add('preview');
                if (move.isAttack) plate.classList.add('attack');
                if (isDroppingPiece) plate.classList.add('drop');

                moveSquare.appendChild(plate);
            }
        });
    }

    function onCapturedClick(piece) {
        if (gameState.gameOver) return;

         const isPlayerTurn = (isSinglePlayer && !isBotGame) ||
                            (isBotGame && gameState.isWhiteTurn) || // Player always plays white vs bot
                            (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

         if (!isPlayerTurn) return; // Can only select captured pieces on your turn


        if (piece.type === 'lupa' || piece.type === 'prince') {
            console.log("Cannot select royalty from hand.");
            return;
        }

        const clickedElement = event.currentTarget; // Get the clicked div

        if (isDroppingPiece && isDroppingPiece.type === piece.type) {
            isDroppingPiece = null;
            selectedSquare = null;
            clearHighlights();
            clickedElement.classList.remove('selected-drop'); // Remove highlight
            return;
        }

        selectedSquare = null;
        isDroppingPiece = piece;
        clearHighlights();
        clickedElement.classList.add('selected-drop'); // Add highlight to clicked captured piece
        highlightDropSquares();
    }


    function highlightDropSquares() {
        // Clear only board highlights, keep captured piece selected
        document.querySelectorAll('.square.selected, .square.preview-selected').forEach(s => {
            s.classList.remove('selected', 'preview-selected');
        });
        document.querySelectorAll('.move-plate').forEach(p => p.remove());

         const isPlayerTurn = (isSinglePlayer && !isBotGame) ||
                            (isBotGame && gameState.isWhiteTurn) ||
                            (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));


        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                 // Use a separate isPositionValid function
                 const isBoardValid = typeof isPositionValid === 'function' ? isPositionValid(x, y) : true;

                if (gameState.boardState && gameState.boardState[y]?.[x] === null && isBoardValid) {
                    // Basic check: is square empty and valid? Add more drop rules here if needed.
                    const square = document.querySelector(`[data-logical-x='${x}'][data-logical-y='${y}']`);
                    if (square) {
                        const plate = document.createElement('div');
                        plate.classList.add('move-plate', 'drop');
                        if (!isPlayerTurn) {
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
        { name: 'King Kraken (King)', type: 'lupa', notation: 'K', desc: "Moves one square in any direction. Starts confined to the 'Palace'. Can only leave if your Kraken Prince is captured.", special: 'Capture required to win.' },
        { name: 'Kraken Prince', type: 'prince', notation: 'KP', desc: "Moves one step forward, or one step diagonally (forward or backward).", special: 'Capture required to win. Reaching a Sanctuary wins. If captured, the King Kraken is freed.' },
        { name: 'Dolphin', type: 'zur', notation: 'D', desc: 'Moves any number of squares along a rank, file, or diagonal.' },
        { name: 'Hermit Crab', type: 'kota', notation: 'H', desc: 'Moves like a Rook AND one square any direction.' },
        { name: 'One Pincer Crab', type: 'fin', notation: 'Oc', desc: 'Moves any squares diagonally. Can also move one square horizontally (non-capture only).', special: 'Promotes to Two Pincer Crab upon capturing.' },
        { name: 'Big Eye Squid', type: 'yoli', notation: 'B', desc: 'Moves in an "L" shape (2+1). Can also move one square orthogonally.' },
        { name: 'Jellyfish', type: 'kor', notation: 'J', desc: 'Moves like a Knight OR one square diagonally.' },
        { name: 'Squid', type: 'pilut', notation: 'S', desc: "Moves one or two squares forward (empty squares only). Shields piece behind it.", special: 'Promotes to Shield Squid.' },
        { name: 'Cray Fish', type: 'sult', notation: 'Cr', desc: 'Moves one step diagonally forward, straight forward, or straight backward. Can also move two steps straight forward.', special: 'Promotes to Dumbo Octopus.' },
        { name: 'Fish', type: 'pawn', notation: 'F', desc: 'Moves one square orthogonally OR two squares diagonally.', special: 'Promotes to Dumbo Octopus.' },
        { name: 'Narwhal', type: 'cope', notation: 'Na', desc: "Unique forward jump and backward moves. Gets a second, non-capture move after capturing.", special: 'Bonus Move' },
        { name: 'Dumbo Octopus', type: 'chair', notation: 'Du', desc: 'Moves any squares diagonally or vertically.' },
        { name: 'Hammer Head', type: 'jotu', notation: 'Sh', desc: 'Moves like a Rook, jumping over friendly pieces (returning them to hand, except AC/Ct). Captures first enemy and stops.' },
        { name: 'Two Pincer Crab', type: 'finor', notation: 'Tc', desc: 'Moves like a Bishop or a Knight. (Promoted Fin)' },
        { name: 'Shield Squid', type: 'greatshield', notation: 'Ss', desc: 'Non-capture moves: one square forward (diag/straight) or straight backward. Shields adjacent friendly pieces on sides/behind.', special: 'Promoted Pilut.' },
        { name: 'Ancient Creature', type: 'greathorsegeneral', notation: 'Ac', desc: "Gets a second, non-capture move after a non-capture move. Moves like a knight (extended 3+1/1+3), bishop forward diag, rook backward.", special: 'Bonus Move & Promotes to Cthulhu upon capturing.' },
        { name: 'Neptune', type: 'neptune', notation: 'Np', desc: 'Moves like King or Narwhal. Jumps first piece orthogonally, continues moving/capturing.', special: 'Upon capture, returns to owner\'s hand as Mermaid.' },
        { name: 'Mermaid', type: 'mermaid', notation: 'Mm', desc: 'Moves/Captures in a 5x5 square around itself, jumping over any piece.', special: 'Promotes to Neptune upon capturing.' },
        { name: 'Cthulhu', type: 'cthulhu', notation: 'Ct', desc: "Combines moves of Ancient Creature and Mermaid. Retains AC's bonus non-capture move." }
    ];

    function populateRulesModal() {
        rulesBody.innerHTML = `
            <h2>Winning the Game</h2>
            <ul>
                <li><strong>Royalty Capture:</strong> Capture **both** the opponent's King Kraken and Kraken Prince.</li>
                <li><strong>Sanctuary Victory:</strong> Move your King Kraken OR Kraken Prince onto one of the eight golden "Sanctuary" squares.</li>
            </ul>
            <h2>Special Mechanics</h2>
            <h3><span style="color: #FF5722;">👑</span> The Royal Family & The Palace</h3>
            <ul>
                <li><strong>King Kraken Palace Rule:</strong> Confined to its starting 4x2 Palace area.</li>
                <li><strong>Prince's Freedom:</strong> If your Prince is captured, your King is freed from the Palace.</li>
                <li><strong>Royal Capture Rule:</strong> Captured Kings/Princes are removed, not added to hand.</li>
            </ul>
            <h3><span style="color: #4CAF50;">🛡️</span> Piece Protection</h3>
              <ul>
                  <li><strong>Squid (Pilut):</strong> Protects friendly piece directly behind it.</li>
                  <li><strong>Shield Squid (Greatshield):</strong> Protects adjacent friendly pieces on sides/behind (5 squares).</li>
              </ul>
              <h3><span style="color: #4CAF50;">⏩</span> Bonus Moves</h3>
            <ul>
                <li><strong>Narwhal (Cope):</strong> After a capture, gets a second non-capture move.</li>
                <li><strong>Ancient Creature / Cthulhu:</strong> After a non-capture move, gets a second non-capture move.</li>
            </ul>
            <h3><span style="color: #4CAF50;">✋</span> Drops</h3>
            <p>Captured pieces (except royalty) go to your Hand. On your turn, drop a piece from hand onto any empty, valid square (max 6 pieces in hand).</p>
            <h2>Piece Movesets</h2>
            <div class="piece-list" id="piece-list-container"></div>
        `;

        const pieceListContainer = document.getElementById('piece-list-container');
        if (!pieceListContainer) return;
        pieceListContainer.innerHTML = '';

        [...pieceInfo].sort((a, b) => {
            if (a.type === 'lupa') return -1; if (b.type === 'lupa') return 1;
            if (a.type === 'prince') return -1; if (b.type === 'prince') return 1;
            return a.name.localeCompare(b.name); // Sort others alphabetically
        }).forEach(p => {
            const entry = document.createElement('div');
            entry.className = 'piece-entry';
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
        if (rulesModal) rulesModal.style.display = 'block';
    });

    closeRulesBtn.addEventListener('click', () => {
       if (rulesModal) rulesModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == rulesModal) {
            if (rulesModal) rulesModal.style.display = 'none';
        }
    });

     // Need a global or accessible isPositionValid function for renderBoard
     // If it's not already global, define it here or ensure it's imported/available
     function isPositionValid(x, y) {
        if (x < 0 || y < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return false;
        if ((x <= 1 && y <= 2) || (x >= 8 && y <= 2)) return false;
        if ((x <= 1 && y >= 13) || (x >= 8 && y >= 13)) return false;
        return true;
     }

}); // End DOMContentLoaded