document.addEventListener('DOMContentLoaded', () => {

    const productionUrl = 'https://HikoroChess.org';
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const serverUrl = isLocal ? 'http://localhost:3000' : window.location.origin;

    const socket = io(serverUrl);


    let botWorker = null;
	let botWorkerGo = null;
    try {
        botWorker = new Worker('botWorker.js');
        console.log("Bot Worker created successfully.");


        botWorker.onmessage = function(e) {
            const bestMove = e.data;
            console.log("Received best move from worker:", bestMove);

            if (bestMove) {

                const pieceThatMoved = bestMove.type === 'board' && gameState.boardState[bestMove.from.y]
                    ? gameState.boardState[bestMove.from.y][bestMove.from.x]
                    : null;


                if (pieceThatMoved && !currentTurnHadBonusState) {
                    const isCopeBonus = pieceThatMoved.type === 'cope' && bestMove.isAttack;
                    const isGHGBonus = (pieceThatMoved.type === 'greathorsegeneral' || pieceThatMoved.type === 'cthulhu') && !bestMove.isAttack;

                    if (isCopeBonus || isGHGBonus) {
                        botBonusState = {
                            piece: { ...pieceThatMoved },
                            from: { ...bestMove.to }
                        };
                         console.log("Setting up botBonusState for next turn:", botBonusState);
                    } else {
                        botBonusState = null;
                    }
                } else {
                        botBonusState = null;
                }

                // --- MODIFIED EMIT ---
                if (bestMove.type === 'drop') {
                    socket.emit('makeGameMove', {
                        gameId,
                        move: { type: 'drop', piece: { type: bestMove.pieceType }, to: bestMove.to }
                    });
                } else {
                    socket.emit('makeGameMove', {
                        gameId,
                        move: { type: 'board', from: bestMove.from, to: bestMove.to }
                    });
                }
            } else {
                console.error("Bot worker returned no move.");

            }
        };

        botWorker.onerror = function(error) {
            console.error("Error in Bot Worker:", error.message, error);

        };
		
		botWorkerGo = new Worker('botWorkerGo.js');
        console.log("Bot Worker (Go) created successfully.");

        botWorkerGo.onmessage = function(e) {
            const bestMove = e.data;
            console.log("Received best move from Go worker:", bestMove);

            if (bestMove) {
                // Go bot is simpler, just emit the move
                socket.emit('makeGameMove', {
                    gameId,
                    move: bestMove 
                });
            } else if (e.data && e.data.error) {
                 console.error("Go Bot Worker failed to load:", e.data.error);
                 alert("Go Bot failed to load. Please check console.");
            } else {
                console.error("Go Bot worker returned no move.");
            }
        };

        botWorkerGo.onerror = function(error) {
            console.error("Error in Go Bot Worker:", error.message, error);
        };

    } catch (e) {
        console.error("Failed to create Bot Worker:", e);
        alert("Could not initialize the AI worker. The bot will not function.");

    }

    const HIKORO_BOARD_WIDTH = 10;
    const HIKORO_BOARD_HEIGHT = 16;

    const lobbyElement = document.getElementById('lobby');
	const goBoardSizeWrapper = document.getElementById('go-board-size-wrapper');
    const createGameBtn = document.getElementById('create-game-btn');
    const gameListElement = document.getElementById('game-list');
    const singlePlayerBtn = document.getElementById('single-player-btn');
    const playBotBtn = document.getElementById('play-bot-btn');

    // --- NEW: Game Type Selector ---
    const gameTypeSelect = document.getElementById('game-type-select');

    // --- Game Wrappers ---
    const hikoroGameWrapper = document.getElementById('hikoro-game-wrapper');
    const goGameWrapper = document.getElementById('go-game-wrapper');

    // --- Hikoro Elements ---
    const hikoroBoardElement = document.getElementById('game-board');

    // --- Go Elements ---
    const goBoardContainer = document.getElementById('go-board-container');
    const goShieldButton = document.getElementById('go-shield-button');
    const goBlackScoreDisplay = document.getElementById('go-black-score');
    const goBlackScoreDetails = document.getElementById('go-black-score-details');
    const goWhiteScoreDisplay = document.getElementById('go-white-score');
    const goWhiteScoreDetails = document.getElementById('go-white-score-details');
	const goPassButton = document.getElementById('go-pass-button');

    // --- Shared UI Elements ---
    const turnIndicator = document.getElementById('turn-indicator');
    const winnerText = document.getElementById('winnerText');
    const gameControls = document.getElementById('game-controls');
    const mainMenuBtn = document.getElementById('main-menu-btn');
    const rulesBtnIngame = document.getElementById('rules-btn-ingame');
    const moveHistoryElement = document.getElementById('move-history');
	const resignButton = document.getElementById('resign-button');

    const postGameControls = document.getElementById('post-game-controls');
    const copyKifuBtn = document.getElementById('copy-kifu-btn');
    const downloadKifuBtn = document.getElementById('download-kifu-btn');

    const replaySection = document.getElementById('replay-section');
    const kifuPasteArea = document.getElementById('kifu-paste-area');
    const startReplayBtn = document.getElementById('start-replay-btn');
    const replayControls = document.getElementById('replay-controls');
    const replayFirstBtn = document.getElementById('replay-first-btn');
    const replayPrevBtn = document.getElementById('replay-prev-btn');
    const replayNextBtn = document.getElementById('replay-next-btn');
    const replayLastBtn = document.getElementById('replay-last-btn');
    const replayMoveNumber = document.getElementById('replay-move-number');

    const ANIMATION_DURATION = 250;

    let gameState = {};
    let myColor = null;
    let gameId = null;
    let isSinglePlayer = false;
    let isBotGame = false;
    let isReplayMode = false;

    // --- State variables for Hikoro ---
    let selectedSquare = null;
    let isDroppingPiece = null;
    let botBonusState = null;
    let currentTurnHadBonusState = false;

    // --- State variables for Go ---
    let goSelectedPiece = null;
    let goClickTimer = null;


    const sanctuarySquares = [
        {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
        {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
    ];

    const whitePalace = { minY: 0, maxY: 1, minX: 3, maxX: 6 };
    const blackPalace = { minY: 14, maxY: 15, minX: 3, maxX: 6 };


    // --- MODIFIED: Lobby Button Listeners ---

    // NEW: Disable bot/replay for Go
    gameTypeSelect.addEventListener('change', () => {
        const gameType = gameTypeSelect.value;
        if (gameType === 'go') {
            goBoardSizeWrapper.style.display = 'block'; // Show size selector
            playBotBtn.disabled = false; // <-- SET TO false
            playBotBtn.title = "Play Against Bot"; // <-- UPDATE TITLE
            startReplayBtn.disabled = true;
            startReplayBtn.title = "Replay is not available for Go Variant";
            kifuPasteArea.disabled = true;
        } else {
            goBoardSizeWrapper.style.display = 'none'; // Hide size selector
            playBotBtn.disabled = false;
            playBotBtn.title = "Play Against Bot";
            startReplayBtn.disabled = false;
            startReplayBtn.title = "";
            kifuPasteArea.disabled = false;
        }
    });

    createGameBtn.addEventListener('click', () => {
        const playerName = document.getElementById('player-name').value.trim() || 'Anonymous';
        const mainTime = parseInt(document.getElementById('time-control').value, 10);
        let byoyomiTime = parseInt(document.getElementById('byoyomi-control').value, 10);
        const gameType = gameTypeSelect.value;
        // ✅ ADDED these 2 lines
        const goBoardSizeSelect = document.getElementById('go-board-size-select');
        const boardSize = parseInt(goBoardSizeSelect.value, 10);

        if (mainTime === 0 && byoyomiTime === 0) byoyomiTime = 15;
        const timeControl = {
            main: mainTime,
            byoyomiTime: mainTime === -1 ? 0 : byoyomiTime,
            byoyomiPeriods: mainTime === -1 ? 0 : (byoyomiTime > 0 ? 999 : 0)
        };

        // ✅ MODIFIED dataToSend
        const dataToSend = { playerName, timeControl, gameType };
        if (gameType === 'go') {
            dataToSend.boardSize = boardSize; // Add boardSize if it's a Go game
        }
        socket.emit('createGame', dataToSend);
    });

    singlePlayerBtn.addEventListener('click', () => {
        isSinglePlayer = true;
        isBotGame = false;
        botBonusState = null;
        const gameType = gameTypeSelect.value;
        // ✅ ADDED these 2 lines
        const goBoardSizeSelect = document.getElementById('go-board-size-select');
        const boardSize = parseInt(goBoardSizeSelect.value, 10);

        // ✅ MODIFIED dataToSend
        const dataToSend = { gameType };
        if (gameType === 'go') {
            dataToSend.boardSize = boardSize;
        }
        socket.emit('createSinglePlayerGame', dataToSend);
    });

    playBotBtn.addEventListener('click', () => {
        const gameType = gameTypeSelect.value; 
    
        // The "if (gameType === 'go')" block that showed the alert is now removed.
    
        isSinglePlayer = true;
        isBotGame = true; // This client-side flag is crucial
        botBonusState = null;
    
        // We must also send the board size, just like the 'singlePlayerBtn' does
        const goBoardSizeSelect = document.getElementById('go-board-size-select');
        const boardSize = parseInt(goBoardSizeSelect.value, 10);
        
        const dataToSend = { gameType };
        if (gameType === 'go') {
            dataToSend.boardSize = boardSize;
        }

        socket.emit('createSinglePlayerGame', dataToSend); // Send the correct data
    });

    socket.on('lobbyUpdate', updateLobby);
    socket.on('gameCreated', onGameCreated);
    socket.on('gameStart', onGameStart);
    socket.on('gameStateUpdate', updateLocalState);
    socket.on('timeUpdate', updateTimerDisplay);
    socket.on('validMoves', drawValidMoves); // Renamed from drawHighlights
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
        if (gameId && !isReplayMode) {
            socket.emit('leaveGame', gameId);
        }
        window.location.reload();
    });
	
	if (resignButton) {
        resignButton.addEventListener('click', () => {
            if (gameState.gameOver || isReplayMode || !gameId) return;

            // Don't allow resigning in single-player (pass-and-play)
            if (isSinglePlayer && !isBotGame) {
                alert("Cannot resign in a local pass-and-play game.");
                return;
            }

            if (confirm("Are you sure you want to resign?")) {
                socket.emit('makeGameMove', {
                    gameId,
                    move: { type: 'resign' }
                });
            }
        });
    }

    if (goPassButton) {
        goPassButton.addEventListener('click', () => {
            if (gameState.gameOver || isReplayMode) return;
            
            // Client-side turn check for responsiveness
			const isMyTurn = 
			                // 1. Is it pass-and-play? (Allow always)
			                (isSinglePlayer && !isBotGame) || 
			                // 2. Is it a bot game AND white's (human's) turn?
			                (isSinglePlayer && isBotGame && gameState.isWhiteTurn) ||
			                // 3. Is it multiplayer AND my turn?
			                (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));
            
            if (isMyTurn) {
                console.log("Emitting pass move");
                socket.emit('makeGameMove', {
                    gameId,
                    move: { type: 'pass' }
                });
            } else {
                console.log("Not your turn to pass.");
            }
        });
    }

    if (copyKifuBtn) {
        copyKifuBtn.addEventListener('click', () => {
            if (gameState && gameState.moveList) {
                const kifuText = gameState.moveList.join('\n');
                navigator.clipboard.writeText(kifuText).then(() => {
                    alert('Kifu copied to clipboard!');
                }, (err) => {
                    console.error('Failed to copy kifu: ', err);
                    alert('Failed to copy. See console for details.');
                });
            }
        });
    }

    if (downloadKifuBtn) {
        downloadKifuBtn.addEventListener('click', () => {
            if (gameState && gameState.moveList) {
                const kifuText = gameState.moveList.join('\n');
                const blob = new Blob([kifuText], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `hikoro-chess-kifu-${gameId || 'game'}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        });
    }

    if (startReplayBtn) {
        startReplayBtn.addEventListener('click', () => {
            const kifuText = kifuPasteArea.value;
            if (!kifuText.trim()) return;

            // Ensure Hikoro gameLogic is available for replay
            if (typeof gameLogic === 'undefined' || !gameLogic.getInitialBoard) {
                alert("Error: Hikoro game logic failed to load. Cannot start replay.");
                return;
            }

            // --- Reset replay state before building ---
            replayGameTree = null;
            currentReplayNode = null;
            flatMoveList = [];
            currentMoveIndex = -1;
            awaitingBonusMove = null;
            selectedSquare = null;
            isDroppingPiece = null;
            clearHikoroHighlights();
            // --- End reset ---

            replayGameTree = buildReplayTree(kifuText); // Uses Hikoro logic
            if (!replayGameTree) {
                 alert("Failed to build replay tree from Kifu.");
                 return; // Stop if tree building failed
            }

            // flatMoveList is now built inside buildReplayTree

            currentReplayNode = replayGameTree; // Start at the root (before first move)
            isReplayMode = true;
            isSinglePlayer = false; // Replay is not single player mode
            isBotGame = false;

            lobbyElement.style.display = 'none';
            // --- SHOW HIKORO WRAPPER FOR REPLAY ---
            hikoroGameWrapper.style.display = 'flex';
            goGameWrapper.style.display = 'none';

            gameControls.style.display = 'flex'; // Show Rules/Main Menu
            replayControls.style.display = 'flex'; // Show Replay Navigation
            postGameControls.style.display = 'none'; // Hide kifu download/copy

            myColor = 'white'; // Replay always viewed from white's perspective initially
            renderHikoroNotationMarkers();
            displayReplayState(currentReplayNode); // Display the initial state
        });
    }

       // --- Updated Replay Navigation Listeners ---
    replayFirstBtn.addEventListener('click', () => {
        if (!isReplayMode || !replayGameTree) return;
        displayReplayState(replayGameTree); // Go to the root node (before first move)
    });

    replayPrevBtn.addEventListener('click', () => {
        if (!isReplayMode || !currentReplayNode || !currentReplayNode.parent) return;
        displayReplayState(currentReplayNode.parent);
    });

    replayNextBtn.addEventListener('click', () => {
        if (!isReplayMode || !currentReplayNode) return;
        // If a bonus move is pending from current state, DO NOTHING (user must click)
        if (currentReplayNode.gameState.bonusMoveInfo) {
            console.log("Next button disabled: Bonus move required.");
            // Maybe provide visual feedback?
            return;
        }
        // Otherwise, go to the first child (main continuation or first branch)
        if (currentReplayNode.children.length > 0) {
            displayReplayState(currentReplayNode.children[0]);
        }
    });

    replayLastBtn.addEventListener('click', () => {
        if (!isReplayMode || flatMoveList.length < 1) return;
        // Go to the last node of the *original* main line
        displayReplayState(flatMoveList[flatMoveList.length - 1]);
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
        // This function updates *both* sets of timer elements.
        // The correct set will be visible based on the game wrapper.
        const whiteTimerEl = document.getElementById('white-time'); // Go timer element
        const blackTimerEl = document.getElementById('black-time'); // Go timer element
        const whiteTimerEl_Hikoro = document.getElementById('white-time-hikoro');
        const blackTimerEl_Hikoro = document.getElementById('black-time-hikoro');

        if (!whiteTimerEl || !blackTimerEl || !whiteTimerEl_Hikoro || !blackTimerEl_Hikoro) return;

        // Hide timers in replay mode
        if (isReplayMode) {
             whiteTimerEl.style.display = 'none';
             blackTimerEl.style.display = 'none';
             whiteTimerEl_Hikoro.style.display = 'none';
             blackTimerEl_Hikoro.style.display = 'none';
             return;
        } else {
            // Ensure they are visible if not in replay
             whiteTimerEl.style.display = 'inline-block';
             blackTimerEl.style.display = 'inline-block';
             whiteTimerEl_Hikoro.style.display = 'inline-block';
             blackTimerEl_Hikoro.style.display = 'inline-block';
        }

        // Don't update if time control data isn't available (e.g., initial state before start)
        if (!gameState.timeControl) return;

        const { whiteTime, blackTime, isInByoyomiWhite, isInByoyomiBlack } = times;

        const whiteTimeStr = formatTime(whiteTime, 0, isInByoyomiWhite);
        const blackTimeStr = formatTime(blackTime, 0, isInByoyomiBlack);

        // Update Hikoro timers
        whiteTimerEl_Hikoro.textContent = whiteTimeStr;
        blackTimerEl_Hikoro.textContent = blackTimeStr;

        // Update Go timers
        whiteTimerEl.textContent = whiteTimeStr;
        blackTimerEl.textContent = blackTimeStr;

        // Remove active class if game over
        if (gameState.gameOver) {
            whiteTimerEl.classList.remove('active');
            blackTimerEl.classList.remove('active');
            whiteTimerEl_Hikoro.classList.remove('active');
            blackTimerEl_Hikoro.classList.remove('active');
            return;
        }

        // Apply active class based on whose turn it is
        if (gameState.isWhiteTurn) {
            whiteTimerEl.classList.add('active');
            blackTimerEl.classList.remove('active');
            whiteTimerEl_Hikoro.classList.add('active');
            blackTimerEl_Hikoro.classList.remove('active');
        } else {
            blackTimerEl.classList.add('active');
            whiteTimerEl.classList.remove('active');
            blackTimerEl_Hikoro.classList.add('active');
            whiteTimerEl_Hikoro.classList.remove('active');
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
            const gameTypeStr = game.gameType === 'go' ? "Go Variant" : "Hikoro Chess"; // NEW

            infoSpan.textContent = `${creatorName}'s Game [${gameTypeStr}] [${timeString}]`; // NEW
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
        isReplayMode = false;
        botBonusState = null;

        lobbyElement.style.display = 'none';
        // Don't show game wrapper yet, wait for gameStart
        turnIndicator.textContent = "Waiting for an opponent...";
        gameControls.style.display = 'flex';
        replayControls.style.display = 'none';
        postGameControls.style.display = 'none';
    }

    function onGameStart(initialGameState) {
        gameId = initialGameState.id;
        gameState = initialGameState; // Set initial gameState immediately
        botBonusState = null;
        isReplayMode = false;
        isSinglePlayer = initialGameState.isSinglePlayer;

        if (isSinglePlayer) {
            myColor = 'white'; // Default view for single player
            // The 'isBotGame' flag is ALREADY set correctly by the
            // playBotBtn or singlePlayerBtn click listener.
            // We DO NOT overwrite it here.
        } else {
            isBotGame = false; // This is correct (multiplayer is not a bot game)
            if (!myColor) myColor = 'black'; // Assume joined as black if not creator
        }

        // --- FIX FOR SCORE WARNING ---
        // Ensure the score object exists for Go games before rendering
        if (gameState.gameType === 'go' && (!gameState.score || !gameState.score.details)) {
            gameState.score = {
                black: 0, white: 0,
                details: {
                    black: { stones: 0, territory: 0, lost: 0 },
                    white: { stones: 0, territory: 0, lost: 0 }
                }
            };
            console.log("Initialized default score object for Go game start.");
        }
        // --- END FIX ---


        lobbyElement.style.display = 'none';
        gameControls.style.display = 'flex';
        replayControls.style.display = 'none';
        postGameControls.style.display = 'none';


        // This is the main UI switch
        if (initialGameState.gameType === 'go') {
            goGameWrapper.style.display = 'flex';
            hikoroGameWrapper.style.display = 'none';
            createGoBoard(); // Create the Go board elements
        } else {
            goGameWrapper.style.display = 'none';
            hikoroGameWrapper.style.display = 'flex';
            renderHikoroNotationMarkers(); // Render Hikoro notations
        }

        updateLocalState(initialGameState); // Render initial state
    }

    // --- MODIFIED: Main State/Render Loop ---

    function updateLocalState(newGameState) {
    const isNewGameOver = newGameState.gameOver && !gameState.gameOver;
    gameState = newGameState; // Update global state first

    // Update Game Over text
    if (isNewGameOver && newGameState.winner) {
        const winnerTextEl = document.getElementById('winnerText');
        if (winnerTextEl) {
            const winnerName = newGameState.winner === 'draw' ? 'Draw' : newGameState.winner.charAt(0).toUpperCase() + newGameState.winner.slice(1);
            winnerTextEl.textContent = newGameState.winner === 'draw' ? 'Draw!' : `${winnerName} Wins!`;
            if (newGameState.reason) {
                winnerTextEl.textContent += ` (${newGameState.reason})`;
            }
        } else {
            console.error("updateLocalState (Game Over): winnerText element not found!");
        }
        if (postGameControls) {
            postGameControls.style.display = 'flex';
        }
    }

    // --- NEW: Render based on gameType ---
    if (gameState.gameType === 'go') {
        renderGoBoard();
        renderGoScore();
        
        // --- NEW/MODIFIED SHIELD BUTTON LOGIC ---
        let showShield = false;
        const player = gameState.isWhiteTurn ? 2 : 1;
        
        if (!gameState.gameOver) {
            if (gameState.mustShieldAt) {
                // Mandatory shield
                const piece = gameState.boardState[gameState.mustShieldAt.y]?.[gameState.mustShieldAt.x];
                if (piece === player) showShield = true;
            } else if (gameState.pendingChainCapture) {
                // Optional shield during chain
                const piece = gameState.boardState[gameState.pendingChainCapture.y]?.[gameState.pendingChainCapture.x];
                if (piece === player) showShield = true;
            } else if (goSelectedPiece) {
                // Voluntary shield on selected piece
                const piece = gameState.boardState[goSelectedPiece.y]?.[goSelectedPiece.x];
                if (piece === player) showShield = true;
            }
        }
        goShieldButton.style.display = showShield ? 'block' : 'none';
        // --- END MODIFIED LOGIC ---

        // Show pass button if it's a Go game and not over
        goPassButton.style.display = (gameState.gameOver || isReplayMode) ? 'none' : 'block';

            // --- NEW: Handle auto-selection for mustShieldAt ---
            if (gameState.mustShieldAt) {
                console.log("Must shield! Auto-selecting piece.");
                // Automatically select the piece that must be shielded
                // This ensures highlights are drawn correctly by renderGoBoard
                selectGoPiece(gameState.mustShieldAt.x, gameState.mustShieldAt.y);
            } else if (gameState.pendingChainCapture) {
                console.log("Chain capture pending! Re-selecting piece.");
                // Automatically select the piece at its new landing spot
                // This will trigger getValidMoves, which will now only return new jumps
                selectGoPiece(gameState.pendingChainCapture.x, gameState.pendingChainCapture.y);
            }
        
        if (newGameState.gameOver) { // Disable board for Go
            goBoardContainer.classList.add('disabled');
        } else {
            goBoardContainer.classList.remove('disabled'); // Ensure enabled if not over
        }
    } else {
        renderHikoroBoard();
        renderHikoroCaptured();
        renderMoveHistory(gameState.moveList);
         if (newGameState.gameOver) { // Disable board for Hikoro
             hikoroBoardElement.style.pointerEvents = 'none'; // Basic disable
         } else {
             hikoroBoardElement.style.pointerEvents = 'auto'; // Re-enable
         }
    }

    updateTurnIndicator(); // This is shared

    // --- MODIFIED: Bot check ---
    if (isBotGame && gameState.gameType === 'hikoro' && !gameState.gameOver && !gameState.isWhiteTurn && botWorker) {
        console.log("Bot's turn. Sending state to worker. Bonus state:", botBonusState);

            const capturedPiecesForBot = gameState.blackCaptured;
            currentTurnHadBonusState = !!botBonusState;

             const safeGameState = JSON.parse(JSON.stringify(gameState));
             const safeCapturedPieces = JSON.parse(JSON.stringify(capturedPiecesForBot));
             const safeBonusState = botBonusState ? JSON.parse(JSON.stringify(botBonusState)) : null;

            console.log("Posting message to worker:", { gameState: safeGameState, capturedPieces: safeCapturedPieces, bonusMoveState: safeBonusState });

            botWorker.postMessage({
                gameState: safeGameState,
                capturedPieces: safeCapturedPieces,
                bonusMoveState: safeBonusState
        });
        
        } else if (isBotGame && gameState.gameType === 'go' && !gameState.gameOver && !gameState.isWhiteTurn && botWorkerGo) {
        console.log("Go Bot's turn. Sending state to worker.");
        
        // The bot only needs the game state.
        // We must clone it to avoid transferring an un-clonable object.
        const safeGameState = JSON.parse(JSON.stringify(gameState));
        
        botWorkerGo.postMessage({
            gameState: safeGameState
        });
    // --- END OF NEW BLOCK ---

    } else if (isBotGame && !gameState.isWhiteTurn && !botWorker) {
        console.error("Bot's turn, but worker is not available!");
    }
	}

    // Renamed from drawHighlights
    function drawValidMoves(moves) {
        if (!gameState || !gameState.gameType) return; // Guard against early calls
        if (gameState.gameType === 'go') {
            drawGoHighlights(moves);
        } else {
            drawHikoroHighlights(moves);
        }
    }

    // --- RENAMED: All Hikoro-specific functions ---

    function renderHikoroNotationMarkers() {
        const filesTop = document.querySelector('#hikoro-game-wrapper .notation-files-top');
        const filesBottom = document.querySelector('#hikoro-game-wrapper .notation-files-bottom');
        const ranksLeft = document.querySelector('#hikoro-game-wrapper .notation-ranks-left');
        const ranksRight = document.querySelector('#hikoro-game-wrapper .notation-ranks-right');

        if (!filesTop || !filesBottom || !ranksLeft || !ranksRight) return;

        filesTop.innerHTML = '';
        filesBottom.innerHTML = '';
        ranksLeft.innerHTML = '';
        ranksRight.innerHTML = '';

        const files = Array.from({length: HIKORO_BOARD_WIDTH}, (_, i) => String.fromCharCode('a'.charCodeAt(0) + i));
        const ranks = Array.from({length: HIKORO_BOARD_HEIGHT}, (_, i) => i + 1);

        // Adjust orientation based on player color (only in multiplayer)
        const displayFiles = (myColor === 'black' && !isSinglePlayer && !isReplayMode) ? [...files].reverse() : files;
        const displayRanks = (myColor === 'white' || isSinglePlayer || isReplayMode) ? [...ranks].reverse() : ranks;


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
        if (isReplayMode) {
            renderReplayMoveHistory(); // Special renderer for replay tree
            return;
        }

        if (!moveHistoryElement) return;
        moveHistoryElement.innerHTML = ''; // Clear previous moves
        if (!moves) return;

        moves.forEach(moveString => {
            const moveEl = document.createElement('div');
            moveEl.textContent = moveString;
            moveHistoryElement.appendChild(moveEl);
        });
        // Scroll to the bottom to show the latest move
        moveHistoryElement.scrollTop = moveHistoryElement.scrollHeight;
    }
    function renderHikoroBoard() {
        hikoroBoardElement.innerHTML = ''; // Clear previous board state
        // Use global gameState which is updated by updateLocalState or displayReplayState
        if (!gameState || !Array.isArray(gameState.boardState) || gameState.boardState.length === 0) {
            console.error("renderHikoroBoard: gameState or boardState is missing!");
            return;
        }

        for (let y = 0; y < HIKORO_BOARD_HEIGHT; y++) {
            for (let x = 0; x < HIKORO_BOARD_WIDTH; x++) {
                const square = document.createElement('div');
                square.classList.add('square');

                // Determine display coordinates based on player color (for board orientation)
                let displayX = x, displayY = y;
                // White's perspective (or single player/replay) has rank 1 at the bottom (y=0 -> displayY=15)
                if (myColor === 'white' || isSinglePlayer || isReplayMode) {
                    displayY = HIKORO_BOARD_HEIGHT - 1 - y;
                }
                // Black's perspective reverses files (x=0 -> displayX=9)
                else if (myColor === 'black') {
                    displayX = HIKORO_BOARD_WIDTH - 1 - x;
                    // Black perspective keeps ranks ascending from bottom (y=0 -> displayY=0)
                }


                square.dataset.logicalX = x; // Store the logical coordinates
                square.dataset.logicalY = y;
                // Set grid position based on calculated display coordinates
                square.style.gridRowStart = displayY + 1;    // CSS grid is 1-based
                square.style.gridColumnStart = displayX + 1; // CSS grid is 1-based

                // Highlight last move based on global gameState
                if (gameState.lastMove) {
                    if (gameState.lastMove.from && x === gameState.lastMove.from.x && y === gameState.lastMove.from.y) {
                        square.classList.add('last-move-from');
                    }
                    if (gameState.lastMove.to && x === gameState.lastMove.to.x && y === gameState.lastMove.to.y) {
                        square.classList.add('last-move-to');
                    }
                }

                // Add special square classes
                const isSanctuary = sanctuarySquares.some(sq => sq.x === x && sq.y === y);
                if (isSanctuary) {
                    square.classList.add('sanctuary-square');
                }
                const isWhitePalace = (x >= whitePalace.minX && x <= whitePalace.maxX && y >= whitePalace.minY && y <= whitePalace.maxY);
                const isBlackPalace = (x >= blackPalace.minX && x <= blackPalace.maxX && y >= blackPalace.minY && y <= blackPalace.maxY);
                if(isWhitePalace || isBlackPalace) {
                    square.classList.add('palace-square');
                }


                // Check if the square is valid according to game logic
                const isBoardValid = typeof gameLogic !== 'undefined' ? gameLogic.isPositionValid(x, y) : true; // Fallback


                if (!isBoardValid) {
                    square.classList.add('invalid'); // Mark invalid squares visually
                } else {
                    // Add click listener only to valid squares
                    square.addEventListener('click', (event) => {
                        const clickedSquare = event.currentTarget;
                        const logicalX = parseInt(clickedSquare.dataset.logicalX);
                        const logicalY = parseInt(clickedSquare.dataset.logicalY);
                        onSquareClick(logicalX, logicalY); // Calls the reassigned handleHikoroClick
                    });
                }

                // Render piece if one exists at this logical coordinate
                const piece = gameState.boardState[y]?.[x];
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
                hikoroBoardElement.appendChild(square); // Add the square to the board grid
            }
        }
         // After rendering, reapply highlights if needed (e.g., during bonus move or replay nav)
         if (isReplayMode && currentReplayNode?.gameState?.bonusMoveInfo && selectedSquare) {
             const bonusPiece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
             if (bonusPiece) {
                 const validBonusMoves = gameLogic.getValidMovesForPiece(bonusPiece, selectedSquare.x, selectedSquare.y, gameState.boardState, true).filter(m => !m.isAttack);
                 drawHikoroHighlights(validBonusMoves); // Redraw highlights
                 const selSquareEl = document.querySelector(`#game-board .square[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`);
                if(selSquareEl) selSquareEl.classList.add('selected'); // Re-select
             }
         } else if (selectedSquare || isDroppingPiece) {
              // Reapply highlights if a piece was selected before re-render
              if (selectedSquare) {
                  const piece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
                  if (piece) {
                       // Get moves based on current bonus state
                       const bonusActive = !!gameState.bonusMoveInfo && gameState.bonusMoveInfo.pieceX === selectedSquare.x && gameState.bonusMoveInfo.pieceY === selectedSquare.y;
                       const validMoves = gameLogic.getValidMovesForPiece(piece, selectedSquare.x, selectedSquare.y, gameState.boardState, bonusActive);
                       drawHikoroHighlights(validMoves);
                  }
              } else if (isDroppingPiece) {
                  highlightHikoroDropSquares();
                  // Re-highlight selected captured piece
                  const dropEl = document.querySelector(`.captured-piece .piece img[alt$="${isDroppingPiece.type}"]`)?.closest('.captured-piece');
                  if(dropEl) dropEl.classList.add('selected-drop');
              }
         }
    }

    function renderHikoroCaptured() {
        if (!gameState || !gameState.whiteCaptured || !gameState.blackCaptured) {
            return;
        }

        const isBottomHandWhite = (isSinglePlayer || isReplayMode || myColor === 'white');

        const bottomHandPieces = isBottomHandWhite ? gameState.whiteCaptured : gameState.blackCaptured;
        const topHandPieces = isBottomHandWhite ? gameState.blackCaptured : gameState.whiteCaptured;

        // Ensure we are selecting within the correct wrapper
        const bottomHandEl = document.querySelector(isBottomHandWhite ? '#white-captured' : '#black-captured');
        const topHandEl = document.querySelector(isBottomHandWhite ? '#black-captured' : '#white-captured');
        const bottomLabelEl = document.querySelector(isBottomHandWhite ? '#white-captured-area .hand-label' : '#black-captured-area .hand-label');
        const topLabelEl = document.querySelector(isBottomHandWhite ? '#black-captured-area .hand-label' : '#white-captured-area .hand-label');

        if (!bottomHandEl || !topHandEl || !bottomLabelEl || !topLabelEl) {
            console.error("renderHikoroCaptured: Captured piece elements not found!");
            return;
        }

        // Update labels based on context
        if (isSinglePlayer || isReplayMode) {
             bottomLabelEl.textContent = "White's Hand";
             topLabelEl.textContent = (isBotGame && !isReplayMode) ? "Bot's Hand (Black)" : "Black's Hand";
        } else {
             bottomLabelEl.textContent = "Your Hand";
             topLabelEl.textContent = "Opponent's Hand";
        }

        bottomHandEl.innerHTML = '';
        topHandEl.innerHTML = '';

        const createCapturedPieceElement = (pieceData, handColor, isClickable) => {
            const el = document.createElement('div');
            el.classList.add('captured-piece', handColor);

            const pieceElement = document.createElement('div');
            pieceElement.classList.add('piece');

            const spriteImg = document.createElement('img');
            const spriteType = pieceData.type;
            const displayColor = handColor; // Piece in hand shows original color
            spriteImg.src = `sprites/${spriteType}_${displayColor}.png`;
            spriteImg.alt = `${displayColor} ${spriteType}`;

            pieceElement.appendChild(spriteImg);
            el.appendChild(pieceElement);

            if (isClickable) {
                // Add click listener using the reassigned handler
                el.addEventListener('click', (event) => onCapturedClick(pieceData, handColor, event.currentTarget));
            }
            return el;
        };

        const bottomHandColor = isBottomHandWhite ? 'white' : 'black';
        const topHandColor = isBottomHandWhite ? 'black' : 'white';

        // Determine clickability based on whose turn it is
        const isBottomHandClickable = (!isReplayMode && // Not clickable in replay
                                      ((isSinglePlayer && gameState.isWhiteTurn === isBottomHandWhite && !isBotGame) || // Single player, correct turn, not bot
                                       (isSinglePlayer && isBotGame && isBottomHandWhite && gameState.isWhiteTurn) || // Vs Bot, only white hand clickable
                                       (!isSinglePlayer && myColor === bottomHandColor && gameState.isWhiteTurn === (myColor === 'white')))); // Multiplayer, your hand, your turn

        const isTopHandClickable = (!isReplayMode && // Not clickable in replay
                                    ((isSinglePlayer && gameState.isWhiteTurn !== isBottomHandWhite && !isBotGame) || // Single player, other turn, not bot
                                    (!isSinglePlayer && myColor === topHandColor && gameState.isWhiteTurn === (myColor === 'white')))); // Multiplayer, your hand, your turn (should not happen for top hand usually)


        // --- Render Captured Pieces (Group by type) ---
          const groupPieces = (pieces) => {
               const counts = {};
               pieces.forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });
               // Sort alphabetically by piece type for consistent display
               return Object.entries(counts).sort(([typeA], [typeB]) => typeA.localeCompare(typeB));
           };

           groupPieces(bottomHandPieces).forEach(([type, count]) => {
               const pieceData = { type }; // Pass just the type
               const pieceEl = createCapturedPieceElement(pieceData, bottomHandColor, isBottomHandClickable);
               if (count > 1) { // Add count badge if more than one
                    const countBadge = document.createElement('span');
                    countBadge.classList.add('piece-count');
                    countBadge.textContent = count;
                    pieceEl.appendChild(countBadge);
               }
               bottomHandEl.appendChild(pieceEl);
           });

           groupPieces(topHandPieces).forEach(([type, count]) => {
               const pieceData = { type };
               const pieceEl = createCapturedPieceElement(pieceData, topHandColor, isTopHandClickable);
                if (count > 1) {
                    const countBadge = document.createElement('span');
                    countBadge.classList.add('piece-count');
                    countBadge.textContent = count;
                    pieceEl.appendChild(countBadge);
               }
               topHandEl.appendChild(pieceEl);
           });
    }

    function updateTurnIndicator() {
        const turnIndicatorEl = document.getElementById('turn-indicator');
        const winnerTextEl = document.getElementById('winnerText');

        if (!turnIndicatorEl || !winnerTextEl) {
            console.error("updateTurnIndicator: Turn indicator or winner text element not found!");
            return;
        }

        // Handle game over state first
        if (gameState.gameOver && !isReplayMode) {
            turnIndicatorEl.textContent = ''; // Clear the turn indicator
            // Display winner information if not already shown
            if (!winnerTextEl.textContent || winnerTextEl.textContent.includes("Turn")) {
                const winnerName = gameState.winner === 'draw' ? 'Draw' : gameState.winner.charAt(0).toUpperCase() + gameState.winner.slice(1);
                winnerTextEl.textContent = gameState.winner === 'draw' ? 'Draw!' : `${winnerName} Wins!`;
                if (gameState.reason) {
                    winnerTextEl.textContent += ` (${gameState.reason})`;
                }
            }
        } else {
            winnerTextEl.textContent = ''; // Clear winner text if game is ongoing or in replay
            if (isReplayMode) {
                // In replay, just show whose turn it is based on the current node
                turnIndicatorEl.textContent = currentReplayNode?.gameState?.isWhiteTurn ? "White's Turn" : "Black's Turn";
            } else if (isSinglePlayer) {
                 // In single player (pass & play or vs bot)
                 turnIndicatorEl.textContent = gameState.isWhiteTurn ? "White's Turn" : "Black's Turn";
            } else {
                // In multiplayer
                const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
                turnIndicatorEl.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
            }
        }
    }

    function animateHikoroMove(from, to, pieceImgSrc) {
        const fromSquareEl = document.querySelector(`#game-board .square[data-logical-x='${from.x}'][data-logical-y='${from.y}']`);
        const toSquareEl = document.querySelector(`#game-board .square[data-logical-x='${to.x}'][data-logical-y='${to.y}']`);

        // Use hikoroBoardElement for positioning context
        if (!fromSquareEl || !toSquareEl || !hikoroBoardElement) return;

        const boardRect = hikoroBoardElement.getBoundingClientRect();
        const fromRect = fromSquareEl.getBoundingClientRect();
        const toRect = toSquareEl.getBoundingClientRect();

        // Calculate positions relative to the hikoroBoardElement
        const fromTop = fromRect.top - boardRect.top;
        const fromLeft = fromRect.left - boardRect.left;
        const toTop = toRect.top - boardRect.top;
        const toLeft = toRect.left - boardRect.left;

        const clone = document.createElement('div');
        clone.className = 'piece flying-piece';
        clone.innerHTML = `<img src="${pieceImgSrc}" alt="animating piece">`;

        clone.style.position = 'absolute'; // Position relative to parent
        clone.style.top = `${fromTop}px`;
        clone.style.left = `${fromLeft}px`;
        clone.style.width = `${fromRect.width}px`;
        clone.style.height = `${fromRect.height}px`;
        clone.style.zIndex = '100'; // Ensure it's above other pieces
        clone.style.transition = `top ${ANIMATION_DURATION}ms ease-out, left ${ANIMATION_DURATION}ms ease-out`;

        hikoroBoardElement.appendChild(clone); // Append to the board for correct relative positioning
        void clone.offsetWidth; // Trigger reflow to apply initial styles before transition

        // Set target position to start animation
        clone.style.top = `${toTop}px`;
        clone.style.left = `${toLeft}px`;

        // Remove the clone after animation completes
        setTimeout(() => {
             // Check if the clone is still a child before removing
             if (clone.parentNode === hikoroBoardElement) {
                clone.remove();
             }
        }, ANIMATION_DURATION);
    }

    function animateHikoroDrop(to, pieceImgSrc) {
        const toSquareEl = document.querySelector(`#game-board .square[data-logical-x='${to.x}'][data-logical-y='${to.y}']`);
        if (!toSquareEl || !hikoroBoardElement) return;

        const boardRect = hikoroBoardElement.getBoundingClientRect();
        const toRect = toSquareEl.getBoundingClientRect();

        const toTop = toRect.top - boardRect.top;
        const toLeft = toRect.left - boardRect.left;

        const clone = document.createElement('div');
        clone.className = 'piece flying-piece drop'; // 'drop' class for potential opacity effect
        clone.innerHTML = `<img src="${pieceImgSrc}" alt="animating piece">`;

        clone.style.position = 'absolute';
        clone.style.top = `${toTop - toRect.height}px`; // Start one square above
        clone.style.left = `${toLeft}px`;
        clone.style.width = `${toRect.width}px`;
        clone.style.height = `${toRect.height}px`;
        clone.style.zIndex = '100';
        clone.style.opacity = '0'; // Start invisible
        clone.style.transition = `top ${ANIMATION_DURATION}ms ease-in, opacity ${ANIMATION_DURATION}ms ease-in`;

        hikoroBoardElement.appendChild(clone);
        void clone.offsetWidth; // Trigger reflow

        // Animate to final position and fade in
        clone.style.top = `${toTop}px`;
        clone.style.opacity = '1';

        // Remove after animation
        setTimeout(() => {
             if (clone.parentNode === hikoroBoardElement) {
                clone.remove();
            }
        }, ANIMATION_DURATION);
    }

    function clearHikoroHighlights() {
        // Clear selection styles from squares
        document.querySelectorAll('#game-board .square.selected, #game-board .square.preview-selected').forEach(s => {
            s.classList.remove('selected', 'preview-selected');
        });
        // Remove move indicator plates
        document.querySelectorAll('#game-board .move-plate').forEach(p => p.remove());
         // Clear selection style from captured pieces
         document.querySelectorAll('.captured-piece.selected-drop').forEach(p => p.classList.remove('selected-drop'));
    }

    function drawHikoroHighlights(moves) {
        clearHikoroHighlights(); // Ensure clean slate

        // Find the element that is currently selected (either a square or a captured piece)
        const elementToHighlight = selectedSquare
            ? document.querySelector(`#game-board .square[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`)
            : document.querySelector('.captured-piece.selected-drop'); // Find based on class

        // If nothing is selected, don't draw highlights
        if (!selectedSquare && !isDroppingPiece) return;

        // Determine if the current player is allowed to make a move (affects highlight style)
        const isPlayerTurn = (isReplayMode) || // Always allow interaction in replay
                             (isSinglePlayer && !isBotGame) || // Allow in pass-and-play
                             (isBotGame && gameState.isWhiteTurn) || // Allow white vs bot
                             (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn))); // Multiplayer check

         // Highlight the selected square/piece
         if (selectedSquare && elementToHighlight) {
             // Use 'selected' for active turn, 'preview-selected' otherwise (e.g., opponent's turn)
             elementToHighlight.classList.add(isPlayerTurn ? 'selected' : 'preview-selected');
         } else if (isDroppingPiece && elementToHighlight) {
             // The selected-drop class is already added in onCapturedClick
         }

         // Filter moves if a bonus move is required (only show valid bonus moves)
         const bonusInfo = isReplayMode ? currentReplayNode?.gameState?.bonusMoveInfo : gameState.bonusMoveInfo;
         let movesToDraw = moves;
         if (bonusInfo && selectedSquare && (selectedSquare.x === bonusInfo.pieceX && selectedSquare.y === bonusInfo.pieceY)) {
             // Bonus is pending for the selected piece: only allow non-capture moves
             movesToDraw = moves.filter(move => !move.isAttack);
         } else if (bonusInfo && (!selectedSquare || selectedSquare.x !== bonusInfo.pieceX || selectedSquare.y !== bonusInfo.pieceY)) {
              // Bonus is pending, but the wrong piece (or no piece) is selected: show NO moves
              movesToDraw = [];
         }


        // Draw the move plates for valid target squares
        movesToDraw.forEach(move => {
            const moveSquare = document.querySelector(`#game-board .square[data-logical-x='${move.x}'][data-logical-y='${move.y}']`);
            if (moveSquare) {
                const plate = document.createElement('div');
                plate.classList.add('move-plate');
                // Use preview style if it's not the player's active turn
                if (!isPlayerTurn) plate.classList.add('preview');
                // Different style for attack moves
                if (move.isAttack) plate.classList.add('attack');
                // Different style for drop targets
                if (isDroppingPiece) plate.classList.add('drop');

                moveSquare.appendChild(plate); // Add the highlight plate to the square
            }
        });
    }

    function highlightHikoroDropSquares() {
        // Clear existing highlights first
        document.querySelectorAll('#game-board .square.selected, #game-board .square.preview-selected').forEach(s => {
            s.classList.remove('selected', 'preview-selected');
        });
        document.querySelectorAll('#game-board .move-plate').forEach(p => p.remove());

        // Determine if it's the player's active turn
        const isPlayerTurn = (isReplayMode) ||
                             (isSinglePlayer && !isBotGame) ||
                             (isBotGame && gameState.isWhiteTurn) ||
                             (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        // Iterate through all logical board positions
        for (let y = 0; y < HIKORO_BOARD_HEIGHT; y++) {
            for (let x = 0; x < HIKORO_BOARD_WIDTH; x++) {

                // Check if the position is valid according to game rules
                const isBoardValid = typeof gameLogic !== 'undefined' ? gameLogic.isPositionValid(x, y) : true;

                // Check if the square is empty on the current game state
                // Use global gameState which reflects the current board
                if (gameState.boardState && gameState.boardState[y]?.[x] === null && isBoardValid) {

                    // Find the corresponding DOM element for the square
                    const square = document.querySelector(`#game-board .square[data-logical-x='${x}'][data-logical-y='${y}']`);
                    if (square) {
                        // Create and add the drop highlight plate
                        const plate = document.createElement('div');
                        plate.classList.add('move-plate', 'drop'); // Style for drops
                        // Use preview style if it's not the active player's turn
                        if (!isPlayerTurn) {
                            plate.classList.add('preview');
                        }
                        square.appendChild(plate);
                    }
                }
            }
        }
    }


    // --- MODIFIED: Click Handlers to emit new event ---

    function handleHikoroClick(x, y) {
        if (isReplayMode) {
            handleReplaySquareClick(x, y); // Delegate to replay handler
            return;
        }
        // Basic game state checks
        if (gameState.gameOver || !gameState.boardState) return;

        // Determine if the current client is allowed to move
        const isPlayerTurn = (isSinglePlayer && !isBotGame) || // Allow in pass-and-play
                             (isBotGame && gameState.isWhiteTurn) || // Allow white vs bot
                             (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn))); // Multiplayer check

        if (!isPlayerTurn) return; // Not allowed to move

        // --- Logic for moving a selected piece ---
        if (selectedSquare && (selectedSquare.x !== x || selectedSquare.y !== y)) {
            const piece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
            if (piece) {
                const spriteType = piece.type;
                const pieceImgSrc = `sprites/${spriteType}_${piece.color}.png`;

                // Client-side check for valid target (primarily for animation)
                const isBonusActive = !!gameState.bonusMoveInfo && gameState.bonusMoveInfo.pieceX === selectedSquare.x && gameState.bonusMoveInfo.pieceY === selectedSquare.y;
                // Use gameLogic for validation
                const validMoves = typeof gameLogic !== 'undefined' ? gameLogic.getValidMovesForPiece(piece, selectedSquare.x, selectedSquare.y, gameState.boardState, isBonusActive) : [];
                const isValidTarget = validMoves.some(m => m.x === x && m.y === y);

                if (isValidTarget) {
                    animateHikoroMove(selectedSquare, { x, y }, pieceImgSrc); // Animate visually
                    // Emit the generic move event to the server for validation and state update
                    socket.emit('makeGameMove', {
                        gameId,
                        move: { type: 'board', from: selectedSquare, to: { x, y } }
                    });
                } else {
                    console.log("Invalid move target selected."); // Target square is not valid
                }

            }
            // Clear selection after attempting a move (valid or invalid)
            selectedSquare = null;
            isDroppingPiece = null;
            clearHikoroHighlights();
            return; // End click processing
        }

        // --- Logic for dropping a piece ---
        if (isDroppingPiece) {
             // Prevent dropping royalty
             if (isDroppingPiece.type === 'lupa' || isDroppingPiece.type === 'prince') {
                 console.log("Cannot drop King or Prince.");
                 isDroppingPiece = null;
                 clearHikoroHighlights();
                 return;
             }

             // Client-side check for valid drop location (empty and valid square)
             if (gameState.boardState[y]?.[x] === null && (typeof gameLogic !== 'undefined' ? gameLogic.isPositionValid(x,y) : true) ) {
                // Determine drop color based on context
                const dropColor = isSinglePlayer ? (gameState.isWhiteTurn ? 'white' : 'black') : myColor;
                const spriteType = isDroppingPiece.type;
                const pieceImgSrc = `sprites/${spriteType}_${dropColor}.png`;
                animateHikoroDrop({ x, y }, pieceImgSrc); // Animate visually

                // Emit the generic drop event
                socket.emit('makeGameMove', {
                    gameId,
                    move: { type: 'drop', piece: isDroppingPiece, to: { x, y } } // Send only type
                });
             } else {
                 console.log("Invalid drop location."); // Clicked on occupied or invalid square
             }
             // Clear selection after attempting a drop
            selectedSquare = null;
            isDroppingPiece = null;
            clearHikoroHighlights();
            return; // End click processing
        }

        // --- Logic for selecting a piece on the board ---
        const piece = gameState.boardState[y]?.[x];
        if (piece) {
            // Determine if this piece can be selected by the current player
            let canSelectPiece;
             if (isSinglePlayer) { // Allow selecting either color in pass-and-play, unless vs bot
                 canSelectPiece = !isBotGame || (piece.color === 'white' && gameState.isWhiteTurn); // Only allow selecting white vs bot if it's white's turn
             } else { // Multiplayer
                 canSelectPiece = piece.color === myColor; // Can only select your own color
             }

             // Override selection if a bonus move is pending for a *different* piece
             if (gameState.bonusMoveInfo &&
                 (piece.color !== (gameState.isWhiteTurn ? 'white' : 'black') || // Must be current player's piece
                  x !== gameState.bonusMoveInfo.pieceX || y !== gameState.bonusMoveInfo.pieceY)) { // Must be the specific bonus piece
                  console.log("Must complete bonus move with the correct piece.");
                  canSelectPiece = false; // Prevent selecting other pieces
             }


            if (canSelectPiece) {
                // Toggle selection if clicking the same piece again
                if (selectedSquare && selectedSquare.x === x && selectedSquare.y === y) {
                    selectedSquare = null;
                    isDroppingPiece = null;
                    clearHikoroHighlights();
                } else {
                    // Select the new piece
                    selectedSquare = { x, y };
                    isDroppingPiece = null;
                    // Request valid moves from the server (server handles bonus logic)
                    socket.emit('getValidMoves', {
                        gameId,
                        data: { square: { x, y } } // Pass coordinates
                    });
                    // Highlights will be drawn when server responds with 'validMoves'
                }
            } else if (piece.color !== (gameState.isWhiteTurn ? 'white' : 'black')) {
                 // Clicked opponent's piece when not selecting yours - just clear any selection
                 selectedSquare = null; isDroppingPiece = null; clearHikoroHighlights();
            }
        } else {
            // Clicked an empty square when not moving or dropping - clear selection
            selectedSquare = null;
            isDroppingPiece = null;
            clearHikoroHighlights();
        }
    }

    function handleHikoroCapturedClick(pieceData, handColor, clickedElement) {
        if (isReplayMode) {
            handleReplayCapturedClick(pieceData, handColor, clickedElement); // Delegate
            return;
        }
        if (gameState.gameOver) return; // No actions if game over

        // Prevent selecting captured piece if bonus move is pending
        if(gameState.bonusMoveInfo){
             console.log("Cannot select captured piece during bonus move.");
             return;
        }

        // Determine whose turn it actually is
        const activeColor = gameState.isWhiteTurn ? 'white' : 'black';
        // Check if the clicked hand belongs to the player whose turn it is
        if (handColor !== activeColor) {
            console.log("Cannot select piece from opponent's hand or out of turn.");
            return; // Not the active player's hand
        }

        // Determine if the current client is allowed to control this hand
        const isPlayerAllowedToMove = (isSinglePlayer && !isBotGame) || // Allow in pass-and-play
                                      (isBotGame && gameState.isWhiteTurn) || // Allow white vs bot
                                      (!isSinglePlayer && myColor === activeColor); // Multiplayer check

        if (!isPlayerAllowedToMove) {
             console.log("Not your turn to select from hand.");
            return; // Client doesn't control this color's turn
        }

        // Prevent selecting royalty
        if (pieceData.type === 'lupa' || pieceData.type === 'prince') {
            console.log("Cannot select royalty from hand.");
            return;
        }

        // Toggle selection: If clicking the same piece type again, deselect
        if (isDroppingPiece && isDroppingPiece.type === pieceData.type) {
            isDroppingPiece = null;
            selectedSquare = null; // Clear board selection too
            clearHikoroHighlights(); // Clear board highlights
            clickedElement.classList.remove('selected-drop'); // Remove visual selection from piece
            return;
        }

        // Select piece for dropping
        selectedSquare = null; // Clear any board selection
        isDroppingPiece = { type: pieceData.type }; // Store just the type for dropping
        clearHikoroHighlights(); // Clear board highlights
        // Remove selection from previously selected captured piece
        document.querySelectorAll('.captured-piece.selected-drop').forEach(el => el.classList.remove('selected-drop'));
        clickedElement.classList.add('selected-drop'); // Add visual selection to this piece
        highlightHikoroDropSquares(); // Highlight valid drop squares on the board (uses global gameState)
    }

    // --- NEW: All Go-specific client functions ---

    function createGoBoard() {
        goBoardContainer.innerHTML = ''; // Clear previous board if any

        const boardSize = gameState.boardSize || 19;

        // --- Dynamic Size Adjustments ---
        const isPortrait = window.matchMedia("(orientation: portrait)").matches;
        // Adjust base size if needed, especially for smaller screens
        const baseCellSize = isPortrait ? (window.innerWidth * 0.045) : 30;
        // Ensure cellSizePx is an integer for cleaner calculations
        const cellSizePx = Math.floor(baseCellSize);
        const paddingPx = cellSizePx / 2;

        // Set CSS variables for cell size and padding
        goBoardContainer.style.setProperty('--go-cell-size', `${cellSizePx}px`);
        goBoardContainer.style.setProperty('--go-padding', `${paddingPx}px`);

        // Set grid dimensions
        goBoardContainer.style.gridTemplateColumns = `repeat(${boardSize}, ${cellSizePx}px)`;
        goBoardContainer.style.gridTemplateRows = `repeat(${boardSize}, ${cellSizePx}px)`;

        // Calculate size for the ::before element's lines area
        const linesWidth = cellSizePx * (boardSize - 1);
        const linesHeight = cellSizePx * (boardSize - 1);

        // --- Calculate and Set Explicit Container Size ---
        const borderThickness = 2; // 1px border on left/right or top/bottom
        const totalWidth = linesWidth + (2 * paddingPx) + borderThickness;
        const totalHeight = linesHeight + (2 * paddingPx) + borderThickness;
        goBoardContainer.style.width = `${totalWidth}px`;
        goBoardContainer.style.height = `${totalHeight}px`;
        // --- End Container Size Calculation ---

        // Inject style rule for ::before width and height
        const styleSheetId = 'go-board-lines-style';
        let styleSheet = document.getElementById(styleSheetId);
        if (!styleSheet) {
            styleSheet = document.createElement('style');
            styleSheet.id = styleSheetId;
            document.head.appendChild(styleSheet);
        }
        // Update the rule to set width and height for ::before
        styleSheet.textContent = `
            #go-board-container::before {
                width: ${linesWidth}px;
                height: ${linesHeight}px;
            }
        `;
        // --- End Dynamic Size Adjustments ---

        // Add intersections (rest of function remains the same)
        for (let y = 0; y < boardSize; y++) {
            for (let x = 0; x < boardSize; x++) {
                const intersection = document.createElement('div');
                intersection.classList.add('intersection');
                intersection.dataset.x = x;
                intersection.dataset.y = y;
                intersection.addEventListener('click', handleGoClick);
                intersection.addEventListener('dblclick', handleGoDblClick);
                goBoardContainer.appendChild(intersection);
            }
        }
        // Add shield button listener (remains the same)
        goShieldButton.removeEventListener('click', handleGoShieldClick);
        goShieldButton.addEventListener('click', handleGoShieldClick);
    }

    function renderGoBoard() {
        clearGoHighlights(); // Clear previous highlights and selections
        if (!gameState || !gameState.boardState) {
            console.error("renderGoBoard: gameState or boardState missing!");
            return;
        }

        // ✅ GET boardSize from game state
        const boardSize = gameState.boardSize || 19;

        // ✅ USE dynamic boardSize in loops
        for (let y = 0; y < boardSize; y++) {
            for (let x = 0; x < boardSize; x++) {
                const intersection = document.querySelector(`#go-board-container .intersection[data-x='${x}'][data-y='${y}']`);
                if (!intersection) continue;
                intersection.innerHTML = ''; // Clear previous stone/highlight

                const stoneType = gameState.boardState[y][x];
                let stone = null;

                if (stoneType > 0) {
                    stone = document.createElement('div');
                    stone.classList.add('stone'); // Base class

                    // Add classes based on stoneType for background images
                    // ⛔ REMOVED STRAY CSS LINE FROM HERE
                    switch (stoneType) {
                        case 1: // Black
                            stone.classList.add('go-black');
                            break;
                        case 2: // White
                            stone.classList.add('go-white');
                            break;
                        case 3: // Black Shield
                            stone.classList.add('go-black-shield');
                            break;
                        case 4: // White Shield
                            stone.classList.add('go-white-shield');
                            break;
                    }
                    // --- MODIFICATION END ---

                    intersection.appendChild(stone);

                    // Add last move highlight if applicable
                    if (gameState.lastMove && gameState.lastMove.x === x && gameState.lastMove.y === y) {
                        // ⛔ REMOVED STRAY 'TML' FROM HERE
                        stone.classList.add('last-move');
                    }
                    // Add selected highlight if applicable
                    if (goSelectedPiece && goSelectedPiece.x === x && goSelectedPiece.y === y) {
                        stone.classList.add('selected');
                    }
                }
            }
        }
        // If a piece is selected, request valid moves from the server
        if (goSelectedPiece) {
            socket.emit('getValidMoves', {
                gameId,
                data: { x: goSelectedPiece.x, y: goSelectedPiece.y }
                // ⛔ REMOVED STRAY 'Section' FROM HERE
            });
        }
    }

    function renderGoScore() {
        // Check if score data is available in gameState
        if (!gameState.score || !gameState.score.details || !gameState.score.details.black || !gameState.score.details.white) {
             console.warn("renderGoScore: Score data incomplete in gameState.");
             // Optionally set default text
             goBlackScoreDisplay.textContent = '0';
             goBlackScoreDetails.textContent = `(Stones: 0, Terr: 0)`;
             goWhiteScoreDisplay.textContent = '0';
             goWhiteScoreDetails.textContent = `(Stones: 0, Terr: 0)`;
             return;
        }

        const { black, white, details } = gameState.score;

        // Update score display elements
        goBlackScoreDisplay.textContent = black;
        goBlackScoreDetails.textContent = `(Stones: ${details.black.stones}, Terr: ${details.black.territory})`;

        goWhiteScoreDisplay.textContent = white;
        goWhiteScoreDetails.textContent = `(Stones: ${details.white.stones}, Terr: ${details.white.territory})`;
    }


    function handleGoClick(e) {
    // Ignore clicks if game is over or in replay
    if (gameState.gameOver || isReplayMode) return;

    // Clear any existing double-click timer
    if (goClickTimer) {
        clearTimeout(goClickTimer);
        goClickTimer = null;
    }

    const target = e.currentTarget;
    const x = parseInt(target.dataset.x, 10);
    const y = parseInt(target.dataset.y, 10);

    // Set a timer to distinguish single click from double click
    goClickTimer = setTimeout(() => {
        // Double-check game state in case it ended during the timeout
        if (gameState.gameOver) return;

        const cellState = gameState.boardState[y]?.[x];
        const player = gameState.isWhiteTurn ? 2 : 1; // 1 for Black, 2 for White
        const myPlayerColorValue = !isSinglePlayer ? (myColor === 'white' ? 2 : 1) : null;

        // --- Client-side Turn Check ---
        // Prevent actions if it's not the client's turn in multiplayer
        if (!isSinglePlayer && player !== myPlayerColorValue) {
            console.log("CLIENT BLOCKED: Not your turn (Go Multiplayer).");
            if (goSelectedPiece) {
                deselectGoPiece();
            }
            return;
        }

        // 2. Bot Game check (THIS IS THE FIX)
        // If it's a bot game AND it's black's turn (the bot's turn)
        if (isBotGame && !gameState.isWhiteTurn) {
            console.log("CLIENT BLOCKED: Bot is thinking.");
            return; // Just ignore the click
        }
        // --- Main Click Logic ---

        // --- NEW: Forced Shield Check ---
        if (gameState.mustShieldAt) {
            // If a shield is mandatory, only allow clicking that *exact* piece
            // (which will just re-select it). Block all other actions.
            if (x === gameState.mustShieldAt.x && y === gameState.mustShieldAt.y) {
                // This is the *only* allowed click.
                // Let it fall through to the "select piece" logic.
                console.log("Clicked the 'must shield' piece.");
            } else {
                console.log("CLIENT BLOCKED: Must shield piece at", gameState.mustShieldAt);
                // TODO: Flash the required piece?
                return; // Block all other clicks
            }
        }
        // --- END NEW CHECK ---

        if (goSelectedPiece) {
            // A piece IS currently selected

            // 1. Check if clicking the SAME selected piece again
            if (goSelectedPiece.x === x && goSelectedPiece.y === y) {
                console.log("Clicked selected piece again. Deselecting.");
                deselectGoPiece(); // Deselect it
            }
            // 2. Check if clicking an EMPTY square (potential move target)
            else if (cellState === 0) {
                console.log("Attempting to move selected piece...");
                const from = goSelectedPiece;
                const to = { x, y };
                // Emit the move attempt to the server for validation
                socket.emit('makeGameMove', {
                    gameId,
                    move: { type: 'move', from, to }
                });
                // Deselect immediately after sending the attempt. Server response will update board.
                deselectGoPiece();
            }
            // 3. Clicked any OTHER square (opponent piece, shield, invalid target)
            else {
                console.log("Clicked invalid target/occupied square while piece selected. Deselecting.");
                deselectGoPiece(); // Deselect the piece
            }

        } else {
            // NO piece is currently selected

            // 4. Check if clicking an EMPTY square
            if (cellState === 0) {
                console.log("Attempting to place stone...");
                // Emit place request
                socket.emit('makeGameMove', {
                    gameId,
                    move: { type: 'place', to: { x, y } }
                });
                // No need to deselect, nothing was selected
            }
            // 5. Check if clicking YOUR OWN stone (not a shield)
            else if (cellState === player || cellState === player + 2) {
                console.log("Attempting to select piece...");
                selectGoPiece(x, y); // Select the clicked piece
            }
            // 6. Clicked opponent piece or ANY shield
            else {
                console.log("Clicked opponent piece or shield - doing nothing.");
                // Ensure nothing stays visually selected if it shouldn't
                if (goSelectedPiece) { // Should be null here, but just in case
                     deselectGoPiece();
                 }
            }
        }

        goClickTimer = null; // Clear timer reference after executing
    }, 200); // 200ms delay to allow for double-click detection
}

    function handleGoDblClick(e) {
    if (gameState.gameOver || isReplayMode) return; // Prevent actions

    // Cancel the pending single-click timer
    if (goClickTimer) {
        clearTimeout(goClickTimer);
        goClickTimer = null;
    }

    const target = e.currentTarget;
    const x = parseInt(target.dataset.x, 10);
    const y = parseInt(target.dataset.y, 10);
    const cellState = gameState.boardState[y][x];

    // Determine the player whose turn it is
    const player = gameState.isWhiteTurn ? 2 : 1;
    // Determine the color this client controls
    const myPlayerColor = !isSinglePlayer ? (myColor === 'white' ? 2 : 1) : null;

    // --- CHECK IF ALLOWED TO MOVE ---
    if (!isSinglePlayer && player !== myPlayerColor) {
         console.log("CLIENT BLOCKED: Not your turn to shield (Go Multiplayer).");
         return; // Not your turn in multiplayer
    }
    if (isBotGame && !gameState.isWhiteTurn) {
         console.log("CLIENT BLOCKED: Bot is thinking (shield dblclick).");
         return; // Bot's turn
    }

    // --- THIS IS THE FIX ---
    // --- MODIFIED: Check Chain/Mandatory Shield logic ---

    // 1. Check if a mandatory shield is active
    if (gameState.mustShieldAt) {
        if (x !== gameState.mustShieldAt.x || y !== gameState.mustShieldAt.y) {
            console.log("Cannot shield. Must shield the piece at", gameState.mustShieldAt);
            return;
        }
        // If they clicked the correct piece, fall through to shield it.
        console.log("Performing mandatory shield via dblclick.");
    }
    // 2. Check if an optional chain shield is active
    else if (gameState.pendingChainCapture) {
        if (x !== gameState.pendingChainCapture.x || y !== gameState.pendingChainCapture.y) {
            console.log("Can only shield the active capturing piece during a chain.");
            return;
        }
        // If they clicked the correct piece, fall through to shield it.
        console.log("Performing optional chain shield via dblclick.");
    }
    // 3. If no forced/chain state, this is a VOLUNTARY shield.
    // The check for `cellState === player` below will handle it.
    // --- END MODIFIED LOGIC ---

    // 2. Check if the double-clicked piece is the current player's *stone* (not shield)
    if (cellState === player) { 
         if (goSelectedPiece) deselectGoPiece(); // Deselect if another piece was selected
         // --- Emit Turn to Shield move ---
         socket.emit('makeGameMove', {
             gameId,
             move: { type: 'shield', at: { x, y } }
         });
         // State update will come from server
    } else {
        console.log("Can only turn your own NORMAL stones into shields.");
    }
    // --- END OF FIX ---
}


    function handleGoShieldClick() {
    if (gameState.gameOver) return; // Simpler check

    // Determine the player whose turn it is
    const player = gameState.isWhiteTurn ? 2 : 1;
    // Determine the color this client controls
    const myPlayerColor = !isSinglePlayer ? (myColor === 'white' ? 2 : 1) : null;

    // Check if it's the player's turn before emitting (for multiplayer responsiveness)
    if (!isSinglePlayer && player !== myPlayerColor) {
         console.log("CLIENT BLOCKED: Not your turn to shield (Go Multiplayer).");
         return;
    }
    if (isBotGame && !gameState.isWhiteTurn) {
         console.log("CLIENT BLOCKED: Bot is thinking (shield button).");
         return; // Bot's turn
    }

    // --- NEW/MODIFIED SHIELD LOGIC ---
    let shieldCoords = null;
    let pieceToShield = null;

    if (gameState.mustShieldAt) {
         // Case 1: Mandatory Shield
         shieldCoords = gameState.mustShieldAt;
         pieceToShield = gameState.boardState[shieldCoords.y]?.[shieldCoords.x];
         console.log("Emitting mandatory shield at", shieldCoords);

    } else if (gameState.pendingChainCapture) {
         // Case 2: Optional Shield during chain
         shieldCoords = gameState.pendingChainCapture;
         pieceToShield = gameState.boardState[shieldCoords.y]?.[shieldCoords.x];
         console.log("Emitting optional shield at", shieldCoords);

    } else if (goSelectedPiece) {
         // Case 3: Voluntary Shield on selected piece
         shieldCoords = goSelectedPiece;
         pieceToShield = gameState.boardState[shieldCoords.y]?.[shieldCoords.x];
         console.log("Emitting voluntary shield at", shieldCoords);
    
    } else {
         console.log("Shield button clicked, but no piece is selected/pending/mandatory.");
         return; // Nothing to shield
    }

    // Check if the piece at the coords is valid to be shielded
    if (pieceToShield !== player) {
         console.log("Cannot shield opponent's piece, shield, or empty square.");
         // Don't deselect, the state might be forced
         return;
    }
    // --- END NEW/MODIFIED LOGIC ---

    // Emit shield move
    socket.emit('makeGameMove', { 
         gameId,
         move: { type: 'shield', at: { x: shieldCoords.x, y: shieldCoords.y } }
    // --- THIS IS THE FIX: The stray '_B_' that was here is removed ---
    });
    
    // Deselect *only* if it was a voluntary shield
    if (!gameState.mustShieldAt && !gameState.pendingChainCapture) {
         deselectGoPiece(); // Deselect after sending request
    }
    // If it was forced/chain, the server response will clear the state
    // and updateLocalState will handle the UI.
}

    function selectGoPiece(x, y) {
        goSelectedPiece = { x, y };
        goShieldButton.style.display = 'block';
        renderGoBoard(); // This re-renders board and requests highlights
    }

    function deselectGoPiece() {
        goSelectedPiece = null;
        goShieldButton.style.display = 'none';
        clearGoHighlights(); // Clear highlights immediately
        renderGoBoard(); // Re-render board without selection
    }

    function clearGoHighlights() {
        // Remove valid move indicators
        document.querySelectorAll('#go-game-wrapper .valid-move').forEach(el => el.remove());
        // Remove selected class from stones
        document.querySelectorAll('#go-game-wrapper .stone.selected').forEach(el => el.classList.remove('selected'));
    }

    function drawGoHighlights(moves) {
        clearGoHighlights(); // Clear previous highlights
        if (!goSelectedPiece) return; // Need a selected piece to show moves for

        // Highlight the selected stone itself
        const stoneEl = document.querySelector(`#go-board-container .intersection[data-x='${goSelectedPiece.x}'][data-y='${goSelectedPiece.y}'] .stone`);
        if (stoneEl) stoneEl.classList.add('selected');

        // Draw move plates (green circles) on valid target intersections
        moves.forEach(move => {
            const cell = document.querySelector(`#go-board-container .intersection[data-x='${move.x}'][data-y='${move.y}']`);
            // Ensure cell exists and doesn't already contain a stone visual
            if (cell && !cell.querySelector('.stone')) {
                cell.innerHTML = '<div class="valid-move"></div>';
            }
        });
    }

    // --- RENAMING your original click handlers ---
    const original_onSquareClick = typeof onSquareClick !== 'undefined' ? onSquareClick : null;
    const original_onCapturedClick = typeof onCapturedClick !== 'undefined' ? onCapturedClick : null;

    // Assign the specific handlers (listeners added dynamically based on game type)
    onSquareClick = handleHikoroClick;
    onCapturedClick = handleHikoroCapturedClick;

    // --- (Keep your replay functions unchanged) ---
    let replayGameTree = null;
	let currentReplayNode = null;
	let flatMoveList = []; // Only used for First/Last button now
	let currentMoveIndex = -1; // Index within flatMoveList if applicable
	let awaitingBonusMove = null; // Tracks pending bonus move info during branching

    function toAlgebraic(x, y) {
         const file = String.fromCharCode('a'.charCodeAt(0) + x);
         const rank = y + 1; // y=0 is rank 1
         return `${file}${rank}`;
     }

    function fromAlgebraic(alg) {
        if (!alg || alg.length < 2) return null;
        const file = alg.charAt(0);
        const rank = parseInt(alg.slice(1), 10);
        // Added validation
        if (isNaN(rank) || file < 'a' || file > 'j' || rank < 1 || rank > 16) {
             console.warn("Invalid algebraic notation:", alg);
             return null;
        }
        const x = file.charCodeAt(0) - 'a'.charCodeAt(0);
        const y = rank - 1; // y=0 is rank 1
        return { x, y };
    }

    function generateServerNotation(piece, to, wasCapture, wasDrop) {
        // Requires gameLogic to be loaded
        if (typeof gameLogic === 'undefined' || !gameLogic.pieceNotation) {
             console.error("generateServerNotation: gameLogic not available");
             return "?";
        }
        const pieceAbbr = gameLogic.pieceNotation[piece.type] || '?';
        const coord = toAlgebraic(to.x, to.y);

        if (wasDrop) {
            return `${pieceAbbr}*${coord}`;
        }
        if (wasCapture) {
            return `${pieceAbbr}x${coord}`;
        }
        return `${pieceAbbr}${coord}`;
    }

     // --- Updated Kifu Parser ---
    function parseKifuToMoveList(kifuText) {
        const moves = [];
        const lines = kifuText.split('\n');
        for (const line of lines) {
            // Match lines like "1. MoveW MoveB" or "1... MoveB"
            const lineMatch = line.trim().match(/^(\d+)\.(?:\.\.)?\s*(.*)$/);
            if (lineMatch && lineMatch[2]) {
                const moveParts = lineMatch[2].trim().split(/\s+/); // Split by one or more spaces
                // Filter out empty strings that might result from multiple spaces
                moves.push(...moveParts.filter(part => part.length > 0));
            }
        }
        console.log("Parsed Kifu:", moves);
        return moves;
    }


    function parseNotation(notation, boardState, isWhiteTurn) {
        // Requires gameLogic to be loaded
        if (typeof gameLogic === 'undefined' || !gameLogic.notationToPieceType || !gameLogic.getValidMovesForPiece) {
            console.error("parseNotation: gameLogic not available");
            return null;
        }

        const color = isWhiteTurn ? 'white' : 'black';
        // console.log(`Parsing notation: "${notation}" for ${color}`); // Reduce noise

        // 1. Check for Drop
        let match = notation.match(/^([A-Z][A-Za-z]*)\*([a-j](?:[1-9]|1[0-6]))$/);
        if (match) {
            const pieceAbbr = match[1];
            const algTo = match[2];
            const to = fromAlgebraic(algTo);
            const pieceType = gameLogic.notationToPieceType[pieceAbbr];
            if (!pieceType || !to) {
                console.warn(`Invalid drop notation or target: "${notation}"`);
                return null;
            }
            // console.log(` -> Parsed as Drop: type=${pieceType}, to=`, to);
            return { type: 'drop', piece: { type: pieceType }, to: to };
        }

        // 2. Check for Move
        match = notation.match(/^([A-Z][A-Za-z]*)(x?)([a-j](?:[1-9]|1[0-6]))$/);
        if (match) {
            const pieceAbbr = match[1];
            const isCaptureNotation = match[2] === 'x'; // Check if 'x' is present
            const algTo = match[3];
            const pieceType = gameLogic.notationToPieceType[pieceAbbr];
            const to = fromAlgebraic(algTo);

            if (!pieceType || !to) {
                console.warn(`Invalid move notation or target: "${notation}"`);
                return null;
            }
            // console.log(` -> Attempting Move: type=${pieceType}, to=`, to, ` CaptureNotation=${isCaptureNotation}`);

            let possibleMoves = []; // Store possible 'from' squares

            // First pass: Check for pieces of the exact type specified in the notation
            for (let y = 0; y < gameLogic.BOARD_HEIGHT; y++) {
                for (let x = 0; x < gameLogic.BOARD_WIDTH; x++) {
                    const piece = boardState[y]?.[x];
                    if (piece && piece.color === color && piece.type === pieceType) {
                        // console.log(` -> Checking piece at ${toAlgebraic(x,y)} (${piece.type})`);
                        try {
                            // Check moves WITHOUT bonus active first, as Kifu doesn't denote bonus
                            const validMoves = gameLogic.getValidMovesForPiece(piece, x, y, boardState, false);
                            const matchingMove = validMoves.find(m => m.x === to.x && m.y === to.y);
                            if (matchingMove) {
                                // console.log(`    -> Found valid move from ${toAlgebraic(x,y)} to ${algTo}. Is Attack=${matchingMove.isAttack}`);
                                // Basic capture notation validation (optional, can be noisy)
                                // if (isCaptureNotation && !matchingMove.isAttack) { /* warn */ }
                                // else if (!isCaptureNotation && matchingMove.isAttack) { /* warn */ }
                                possibleMoves.push({ type: 'board', from: { x, y }, to: to, isAttack: matchingMove.isAttack }); // Add isAttack info
                            }
                        } catch (e) {
                            console.error(`Error checking valid moves for ${piece.type} at ${toAlgebraic(x,y)}:`, e);
                        }
                    }
                }
            }

            // Handle Ambiguity or Failed First Pass
            if (possibleMoves.length === 1) {
                // console.log(` -> Successfully parsed "${notation}" as Move: from=`, possibleMoves[0].from, ` to=`, possibleMoves[0].to);
                return possibleMoves[0]; // Unambiguous, correct move
            } else if (possibleMoves.length > 1) {
                console.warn(`AMBIGUOUS MOVE: "${notation}". Multiple pieces (${pieceType}) can move to ${algTo}. Defaulting to first.`);
                return possibleMoves[0]; // Kifu ambiguous, best guess
            } else {
                // Second pass: Check for promotions
                // console.log(` -> No ${pieceType} found. Checking for pieces that *promote* to ${pieceType}`);
                const promotingTypes = [];
                if (pieceType === 'chair') promotingTypes.push('sult', 'pawn');
                if (pieceType === 'greatshield') promotingTypes.push('pilut');
                if (pieceType === 'finor') promotingTypes.push('fin');
                if (pieceType === 'cthulhu') promotingTypes.push('greathorsegeneral');
                if (pieceType === 'neptune') promotingTypes.push('mermaid');

                for (let y = 0; y < gameLogic.BOARD_HEIGHT; y++) {
                    for (let x = 0; x < gameLogic.BOARD_WIDTH; x++) {
                        const piece = boardState[y]?.[x];
                        if (piece && piece.color === color && promotingTypes.includes(piece.type)) {
                            // console.log(` -> Checking promoting piece at ${toAlgebraic(x,y)} (${piece.type})`);
                            try {
                                const validMoves = gameLogic.getValidMovesForPiece(piece, x, y, boardState, false);
                                const matchingMove = validMoves.find(m => m.x === to.x && m.y === to.y);
                                if (matchingMove) {
                                    const inPromotionZone = (color === 'white' && to.y > 8) || (color === 'black' && to.y < 7);
                                    const wasCapture = matchingMove.isAttack;
                                    let promotedType = piece.type;

                                    // Simulate promotion logic
                                    if (piece.type === 'fin' && wasCapture) promotedType = 'finor';
                                    else if ((piece.type === 'sult' || piece.type === 'pawn') && inPromotionZone) promotedType = 'chair';
                                    else if (piece.type === 'pilut' && inPromotionZone) promotedType = 'greatshield';
                                    else if (piece.type === 'greathorsegeneral' && wasCapture) promotedType = 'cthulhu';
                                    else if (piece.type === 'mermaid' && wasCapture) promotedType = 'neptune';

                                    if (promotedType === pieceType) {
                                        // console.log(`    -> Found valid *promoting* move from ${toAlgebraic(x,y)} to ${algTo}.`);
                                        possibleMoves.push({ type: 'board', from: { x, y }, to: to, isAttack: matchingMove.isAttack });
                                    }
                                }
                            } catch (e) {
                                console.error(`Error checking promoting moves for ${piece.type} at ${toAlgebraic(x,y)}:`, e);
                            }
                        }
                    }
                }

                // Check promotion scan results
                if (possibleMoves.length === 1) {
                    // console.log(` -> Successfully parsed "${notation}" as Promoting Move: from=`, possibleMoves[0].from, ` to=`, possibleMoves[0].to);
                    return possibleMoves[0];
                } else if (possibleMoves.length > 1) {
                    console.warn(`AMBIGUOUS PROMOTING MOVE: "${notation}". Multiple pieces promote to ${pieceType} at ${algTo}. Defaulting.`);
                    return possibleMoves[0];
                } else {
                    console.warn(`Could not find valid 'from' for move: "${notation}" for ${color}`);
                    return null; // Failed both scans
                }
            }
        }

        console.warn("Could not parse notation (format mismatch):", notation);
        return null;
    }


       // --- Updated Apply Move Function (Client-side simulation for Replay) ---
     function applyMoveToState(oldGameState, moveObj) {
         if (!moveObj) {
             console.error("applyMoveToState received null moveObj");
             return oldGameState;
         }
         // Use structuredClone for a more robust deep copy if available, fallback to JSON
         let newGameState = typeof structuredClone === 'function'
             ? structuredClone(oldGameState)
             : JSON.parse(JSON.stringify(oldGameState));

         let { boardState, whiteCaptured, blackCaptured, isWhiteTurn } = newGameState;
         const color = isWhiteTurn ? 'white' : 'black';
         let pieceMovedOriginal = null; // Store original piece info before mutation
         let wasCapture = false; // Track if the move was a capture

         // --- Apply the move ---
         if (moveObj.type === 'drop') {
             const { piece, to } = moveObj; // piece has { type }
             const droppedPiece = { type: piece.type, color: color }; // Create full piece object

             // Basic validation before applying
             if (to.y < 0 || to.y >= HIKORO_BOARD_HEIGHT || to.x < 0 || to.x >= HIKORO_BOARD_WIDTH) {
                 console.error("ApplyMove (Drop): Invalid 'to' coordinates", moveObj); return oldGameState;
             }
             if(boardState[to.y][to.x] !== null) {
                 console.error("ApplyMove (Drop): Target square not empty", moveObj); return oldGameState;
             }

             boardState[to.y][to.x] = droppedPiece; // Place on board

             // Remove from hand (server only stores type, so match by type)
             const hand = isWhiteTurn ? whiteCaptured : blackCaptured;
             const pieceIndex = hand.findIndex(p => p.type === piece.type);
             if (pieceIndex > -1) {
                 hand.splice(pieceIndex, 1);
             } else {
                 console.warn("ApplyMove: Drop piece type not found in hand", moveObj, hand);
                 // Proceed anyway for replay robustness?
             }
             pieceMovedOriginal = droppedPiece; // Track what was dropped
             newGameState.lastMove = { from: null, to: moveObj.to }; // Update last move for highlighting

         } else if (moveObj.type === 'board') {
             const { from, to } = moveObj;

             // Basic validation
             if (from.y < 0 || from.y >= HIKORO_BOARD_HEIGHT || from.x < 0 || from.x >= HIKORO_BOARD_WIDTH ||
                 to.y < 0 || to.y >= HIKORO_BOARD_HEIGHT || to.x < 0 || to.x >= HIKORO_BOARD_WIDTH ) {
                 console.error("ApplyMove (Board): Invalid coordinates", moveObj); return oldGameState;
             }
             const piece = boardState[from.y]?.[from.x];
             if (!piece) {
                 console.error("ApplyMove: Piece not found at source", moveObj); return oldGameState;
             }
             if (piece.color !== color) {
                 console.error("ApplyMove: Trying to move opponent's piece", moveObj); return oldGameState;
             }

             pieceMovedOriginal = {...piece}; // Clone piece info *before* potential promotion

             const targetPiece = boardState[to.y]?.[to.x];
             wasCapture = targetPiece !== null;

             // --- Jotu Capture Logic ---
             if (piece.type === 'jotu') {
                 const dx = Math.sign(to.x - from.x);
                 const dy = Math.sign(to.y - from.y);
                 if (Math.abs(to.x - from.x) > 1 || Math.abs(to.y - from.y) > 1) { // Was a jump
                     let cx = from.x + dx, cy = from.y + dy;
                     while (cx !== to.x || cy !== to.y) {
                         // Check bounds before accessing boardState
                         if (cy >= 0 && cy < HIKORO_BOARD_HEIGHT && cx >= 0 && cx < HIKORO_BOARD_WIDTH) {
                            const iPiece = boardState[cy][cx];
                            if (iPiece && iPiece.color === color && iPiece.type !== 'greathorsegeneral' && iPiece.type !== 'cthulhu') {
                                const hand = isWhiteTurn ? whiteCaptured : blackCaptured;
                                if (hand.length < 6) hand.push({ type: iPiece.type });
                                boardState[cy][cx] = null; // Remove jumped piece
                            }
                         }
                         cx += dx; cy += dy;
                     }
                 }
             }
             // --- End Jotu ---


             // --- Standard Capture Logic ---
             if (targetPiece) {
                 // Royalty are removed from game
                 if (targetPiece.type === 'prince') {
                     if (targetPiece.color === 'white') newGameState.whitePrinceOnBoard = false; else newGameState.blackPrinceOnBoard = false;
                 } else if (targetPiece.type !== 'lupa') { // Lupa also removed, others might go to hand
                     const indestructible = ['greathorsegeneral', 'cthulhu', 'mermaid'];
                     let handPieceType = targetPiece.type;
                     let targetHand = isWhiteTurn ? whiteCaptured : blackCaptured; // Piece goes to capturer's hand

                     if (targetPiece.type === 'neptune') {
                         handPieceType = 'mermaid';
                         // Neptune -> Mermaid goes back to *original owner's* hand
                         targetHand = targetPiece.color === 'white' ? whiteCaptured : blackCaptured;
                     }

                     if (!indestructible.includes(targetPiece.type)) {
                         if (targetHand.length < 6) {
                             targetHand.push({ type: handPieceType });
                         }
                     }
                 }
                 // Lupa, Prince, Indestructible are removed, nothing added to hand
             }
             // --- End Standard Capture ---

             // Execute the move
             const movingPieceObject = boardState[from.y][from.x]; // Get reference before nulling
             boardState[to.y][to.x] = movingPieceObject;
             boardState[from.y][from.x] = null;
             newGameState.lastMove = { from: moveObj.from, to: moveObj.to }; // Update last move

             // Handle promotions *after* the piece is at the target square
              const pieceNowAtTarget = boardState[to.y]?.[to.x];
              if (pieceNowAtTarget) {
                 // Pass wasCapture to handlePromotion
                 handlePromotion(pieceNowAtTarget, moveObj.to.y, wasCapture); // Mutates piece at target
              } else {
                 console.error("ApplyMove: Piece disappeared after move!", moveObj);
                 return oldGameState; // State is inconsistent
              }

         } else {
             console.error("ApplyMove: Unknown move type", moveObj);
             return oldGameState;
         }

         // --- Update Bonus Move Info & Turn (Crucial Logic) ---
         const isBonusContinuation = !!oldGameState.bonusMoveInfo; // Was previous state waiting?

         let triggersBonus = false;
         // Check original piece *before* promotion, only if it wasn't already a bonus move
         if (pieceMovedOriginal && !isBonusContinuation && moveObj.type === 'board') {
             const isCopeBonusTrigger = pieceMovedOriginal.type === 'cope' && wasCapture;
             // Check original type for GH trigger
             const isGHGBonusTrigger = (pieceMovedOriginal.type === 'greathorsegeneral') && !wasCapture;
             // Check Cthulhu trigger (already promoted or started as Cthulhu)
             const pieceAtTarget = boardState[moveObj.to.y]?.[moveObj.to.x]; // Get potentially promoted piece
             const isCthulhuBonusTrigger = (pieceAtTarget?.type === 'cthulhu') && !wasCapture;

             triggersBonus = isCopeBonusTrigger || isGHGBonusTrigger || isCthulhuBonusTrigger;
         }

         if (triggersBonus) {
             // Set bonus info based on the landing square
             newGameState.bonusMoveInfo = { pieceX: moveObj.to.x, pieceY: moveObj.to.y };
             newGameState.isWhiteTurn = oldGameState.isWhiteTurn; // Turn does NOT change yet
             // Don't increment turn count on the first part of a bonus move
         } else { // Includes finishing a bonus move or a normal move
             newGameState.bonusMoveInfo = null; // Clear bonus flag
             newGameState.isWhiteTurn = !oldGameState.isWhiteTurn; // Turn changes
             // Increment turn count only AFTER bonus move completes or for normal moves
             // (Turn count represents completed turns by *both* players or single moves in sequence)
             newGameState.turnCount++;
         }

         // Reset game over status for branching in replay
         newGameState.gameOver = false;
         newGameState.winner = null;
         newGameState.reason = null;

         // Optional: Recalculate winner state here if needed for immediate feedback in replay
         // checkForWinner(newGameState); // Assumes checkForWinner exists

         return newGameState;
     }

       // --- Updated Build Replay Tree ---
     function buildReplayTree(kifuText) {
         const moveNotations = parseKifuToMoveList(kifuText);
         if (moveNotations.length === 0) {
             alert("Invalid or empty kifu. Please check format (e.g., '1. MoveW MoveB').");
             return null;
         }

         const initialBoard = gameLogic.getInitialBoard();
         const rootNode = {
             moveNotation: "Start", moveObj: null,
             gameState: {
                 boardState: initialBoard, whiteCaptured: [], blackCaptured: [],
                 isWhiteTurn: true, turnCount: 0, gameOver: false, lastMove: null, bonusMoveInfo: null,
                 // Ensure initial prince status is set for replay logic
                 whitePrinceOnBoard: true, blackPrinceOnBoard: true
             },
             parent: null, children: [], isBonusSecondMove: false
         };

         let currentNode = rootNode;

         for (let i = 0; i < moveNotations.length; i++) {
             const notation = moveNotations[i];
             const currentGameState = currentNode.gameState; // State *before* this move
             const moveObj = parseNotation(notation, currentGameState.boardState, currentGameState.isWhiteTurn);

             if (!moveObj) {
                 console.error(`Failed to parse move: "${notation}" (index ${i}). Stopping tree build.`);
                 alert(`Error parsing move "${notation}" (approx move ${Math.floor(i/2)+1}). Replay might be incomplete or incorrect.`);
                 break; // Stop building if parsing fails
             }

             // Apply the move to get the next state
             const newGameState = applyMoveToState(currentGameState, moveObj);

             // Basic check if state actually changed (helps catch errors in applyMove)
             // Use a more reliable deep comparison if necessary
             if (JSON.stringify(newGameState.boardState) === JSON.stringify(currentGameState.boardState) &&
                 JSON.stringify(newGameState.whiteCaptured) === JSON.stringify(currentGameState.whiteCaptured) &&
                 JSON.stringify(newGameState.blackCaptured) === JSON.stringify(currentGameState.blackCaptured)) {
                 console.error(`Applying move "${notation}" did not change game state. Stopping build.`, {oldState: currentGameState, move: moveObj, newState: newGameState});
                 alert(`Error applying move "${notation}" (approx move ${Math.floor(i/2)+1}). State did not change. Replay might be incomplete or incorrect.`);
                 break; // Stop if move application seems faulty
             }

             // Create the new node in the tree
             const newNode = {
                 moveNotation: notation, moveObj: moveObj, gameState: newGameState,
                 parent: currentNode, children: [],
                 // Mark if this node represents the state *after* a bonus move was completed
                 // Check if the PREVIOUS state had bonus info, but the NEW state does NOT
                 isBonusSecondMove: !!currentGameState.bonusMoveInfo && !newGameState.bonusMoveInfo
             };

             currentNode.children.push(newNode); // Add new node as child of current
             currentNode = newNode; // Move to the newly created node for the next iteration
         }

         // Build flatMoveList AFTER the tree is constructed (for First/Last buttons)
         flatMoveList = [rootNode];
         let node = rootNode;
         while(node.children.length > 0) {
              node = node.children[0]; // Always follow the first child (main line)
              flatMoveList.push(node);
         }
         console.log("Built tree, main line length:", flatMoveList.length);

         return rootNode;
     }

    // --- Updated Move History Renderer ---
    function renderReplayMoveHistory() {
        if (!moveHistoryElement) return;
        moveHistoryElement.innerHTML = ''; // Clear previous history

        // Recursive function to render nodes and their variations
        function renderNodeRecursive(node, parentDOMElement, depth) {
            // Skip root node itself, start with its direct children
            if (!node || node === replayGameTree) {
                 if(node && node.children.length > 0){
                     // Create a container for the main line moves starting from root
                     const mainLineContainer = document.createElement('div');
                     mainLineContainer.classList.add('move-line');
                     parentDOMElement.appendChild(mainLineContainer);

                     // Render children into the main container
                     node.children.forEach((child, index) => {
                         renderNodeRecursive(child, mainLineContainer, 0); // All children of root are at depth 0 visually
                     });
                 }
                return;
            }

            const moveWrapper = document.createElement('div'); // Wrapper for move + potential branches
            moveWrapper.classList.add('move-wrapper');
            // Indent based on depth (especially for branches)
            moveWrapper.style.marginLeft = `${depth * 15}px`;

            const moveEl = document.createElement('span'); // Use span for the text part
            moveEl.classList.add('move-node');

            let moveText = node.moveNotation;
            const stateBefore = node.parent.gameState; // State *before* this move
            // Calculate turn number based on the state *before* the move
            const turnNum = Math.floor(stateBefore.turnCount / 2) + 1;
            const wasWhiteMove = stateBefore.isWhiteTurn;

             // Add move number/ellipsis based on whose move it was (before bonus check)
             if (wasWhiteMove) {
                 moveText = `${turnNum}. ${moveText}`;
             } else {
                 moveText = `... ${moveText}`; // Use ellipsis for black's move
             }

             // Prepend ">" if it's the second part of a bonus move
             if (node.isBonusSecondMove) {
                 // Overwrite number/ellipsis if it's a bonus continuation
                 moveText = `> ${node.moveNotation}`;
             }


            // Add parenthesis for the start of a branch variation
            // A node starts a branch if it's not the first child of its parent
            const isBranchStartNode = node.parent && node.parent.children.length > 1 && node.parent.children[0] !== node;
            if (isBranchStartNode && !node.isBonusSecondMove) { // Don't add '(' to bonus continuations
                 moveText = `( ${moveText}`; // Add opening parenthesis
                 // Closing parenthesis is harder, maybe add visually via CSS border/line
            }

            moveEl.textContent = moveText + " "; // Add space after text for readability

            // Highlight the currently displayed move
            if (node === currentReplayNode) {
                moveEl.classList.add('active-move');
                 // Scroll the wrapper into view smoothly
                 setTimeout(() => {
                     // Check again in case user navigated quickly
                     if (node === currentReplayNode) {
                         moveWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                     }
                 }, 50); // Small delay to ensure rendering
            }

            // Add click listener to navigate replay
            moveEl.addEventListener('click', (e) => {
                displayReplayState(node);
            });

            moveWrapper.appendChild(moveEl); // Add the text span to the wrapper
            parentDOMElement.appendChild(moveWrapper); // Add the wrapper to the container

            // --- Render Children Recursively ---
            if (node.children.length > 0) {
                 let containerForChildren = moveWrapper; // By default, nest directly
                 // Create a new sub-container for branches visually if needed
                 if (node.children.length > 1) {
                     containerForChildren = document.createElement('div');
                     containerForChildren.classList.add('move-line-continuation');
                     // Append to the wrapper, AFTER the moveEl span
                     moveWrapper.appendChild(containerForChildren);
                 }

                 // Render first child (main continuation) into the appropriate container
                 renderNodeRecursive(node.children[0], containerForChildren, depth); // Main line stays at same depth visually

                 // Render other variations (branches) into the same container, increasing logical depth
                 for (let i = 1; i < node.children.length; i++) {
                     renderNodeRecursive(node.children[i], containerForChildren, depth + 1); // Increase depth for branches
                 }
            }
        }

        renderNodeRecursive(replayGameTree, moveHistoryElement, 0); // Start rendering from root
    }

    // --- Updated handleReplaySquareClick ---
    function handleReplaySquareClick(x, y) {
        if (!currentReplayNode) return; // Should not happen in replay mode
        const currentGameState = currentReplayNode.gameState;

        // --- Check if awaiting BONUS move ---
        if (currentGameState.bonusMoveInfo) {
            const bonusPieceX = currentGameState.bonusMoveInfo.pieceX;
            const bonusPieceY = currentGameState.bonusMoveInfo.pieceY;
            const piece = currentGameState.boardState[bonusPieceY]?.[bonusPieceX];

            if (!piece) {
                console.error("Bonus move pending, but piece not found at expected location!");
                clearHikoroHighlights(); selectedSquare = null; awaitingBonusMove = null; // Clear state
                 currentReplayNode.gameState.bonusMoveInfo = null; // Attempt recovery
                 updateTurnIndicator(); // Refresh display
                return;
            }
            // Ensure correct piece is selected
            if (!selectedSquare || selectedSquare.x !== bonusPieceX || selectedSquare.y !== bonusPieceY) {
                 selectedSquare = { x: bonusPieceX, y: bonusPieceY }; // Auto-select
                 isDroppingPiece = null;
                 // Get valid non-capture moves for the bonus piece
                 const validBonusMoves = gameLogic.getValidMovesForPiece(piece, bonusPieceX, bonusPieceY, currentGameState.boardState, true).filter(m => !m.isAttack);
                 clearHikoroHighlights();
                 drawHikoroHighlights(validBonusMoves);
                 const bonusSquareEl = document.querySelector(`#game-board .square[data-logical-x='${bonusPieceX}'][data-logical-y='${bonusPieceY}']`);
                 if(bonusSquareEl) bonusSquareEl.classList.add('selected');
                 console.log("Auto-selected piece for required bonus move.");
                 return; // Wait for click on target
            }

            // Correct piece is selected, check if target is valid bonus move
            const validBonusMoves = gameLogic.getValidMovesForPiece(piece, bonusPieceX, bonusPieceY, currentGameState.boardState, true).filter(m => !m.isAttack);
            const isValidBonusTarget = validBonusMoves.some(m => m.x === x && m.y === y);

            if (isValidBonusTarget) {
                // Construct the move object for the bonus move
                const moveObj = { type: 'board', from: { x: bonusPieceX, y: bonusPieceY }, to: { x, y } };
                // Apply the move to get the resulting game state
                const nextGameState = applyMoveToState(currentGameState, moveObj);
                // Generate notation for this bonus move (non-capture)
                const notationString = generateServerNotation(piece, { x, y }, false, false);

                // Check if this exact move already exists as a child node
                let existingNode = currentReplayNode.children.find(child =>
                    child.moveObj?.type === 'board' &&
                    child.moveObj.from.x === moveObj.from.x && child.moveObj.from.y === moveObj.from.y &&
                    child.moveObj.to.x === moveObj.to.x && child.moveObj.to.y === moveObj.to.y &&
                    child.isBonusSecondMove // Ensure it's marked as the second part
                );

                if (!existingNode) {
                     // Create a new node if this variation wasn't in the original Kifu
                     console.log("Creating new node for bonus move variation.");
                     existingNode = {
                         moveNotation: notationString, moveObj: moveObj, gameState: nextGameState,
                         parent: currentReplayNode, children: [], isBonusSecondMove: true
                     };
                     currentReplayNode.children.push(existingNode); // Add as a new child branch
                } else {
                     console.log("Following existing node for bonus move.");
                }


                awaitingBonusMove = null; // Bonus complete
                selectedSquare = null;
                isDroppingPiece = null;
                clearHikoroHighlights();
                displayReplayState(existingNode); // Display state *after* bonus move
            } else {
                console.log("Invalid target for bonus move.");
                // Keep piece selected, redraw highlights for bonus moves
                clearHikoroHighlights();
                drawHikoroHighlights(validBonusMoves);
                const bonusSquareEl = document.querySelector(`#game-board .square[data-logical-x='${bonusPieceX}'][data-logical-y='${bonusPieceY}']`);
                if(bonusSquareEl) bonusSquareEl.classList.add('selected');
            }
            return; // End processing for this click
        }

        // --- Standard move/selection logic (if NOT awaiting bonus) ---
        if (selectedSquare && (selectedSquare.x !== x || selectedSquare.y !== y)) {
            const from = selectedSquare;
            const to = { x, y };
            const piece = currentGameState.boardState[from.y]?.[from.x];

            if (!piece) { clearHikoroHighlights(); selectedSquare = null; return; }

            // Check if this move is valid from the current state (ignore bonus flag here)
            const validMoves = gameLogic.getValidMovesForPiece(piece, from.x, from.y, currentGameState.boardState, false);
            const targetMove = validMoves.find(m => m.x === to.x && m.y === to.y);

            if (targetMove) {
                const wasCapture = targetMove.isAttack;
                const moveObj = { type: 'board', from, to };
                // Apply move to get next state
                const nextGameState = applyMoveToState(currentGameState, moveObj);
                // Generate notation
                const notationString = generateServerNotation(piece, to, wasCapture, false);

                 // Check if this exact move already exists as a child node
                 let existingNode = currentReplayNode.children.find(child =>
                     child.moveObj?.type === 'board' &&
                     child.moveObj.from.x === moveObj.from.x && child.moveObj.from.y === moveObj.from.y &&
                     child.moveObj.to.x === moveObj.to.x && child.moveObj.to.y === moveObj.to.y &&
                     !child.isBonusSecondMove // Ensure it's NOT the second part of bonus
                 );

                 if (!existingNode) {
                     // Create a new node if this variation wasn't in the Kifu
                     console.log("Creating new node for move variation.");
                      existingNode = {
                         moveNotation: notationString, moveObj: moveObj, gameState: nextGameState,
                         parent: currentReplayNode, children: [], isBonusSecondMove: false
                     };
                     currentReplayNode.children.push(existingNode); // Add as a new child branch
                 } else {
                     console.log("Following existing node for move.");
                 }


                // Check if the move just made triggers a bonus
                if (nextGameState.bonusMoveInfo) {
                    // Bonus triggered, keep piece selected for the next click
                    awaitingBonusMove = { from: to, pieceType: piece.type }; // Track info if needed
                    selectedSquare = { x: to.x, y: to.y }; // Keep selected
                    displayReplayState(existingNode); // Show state after first move, triggers bonus highlighting
                } else {
                    // Normal move completed, clear selections
                    awaitingBonusMove = null;
                    selectedSquare = null;
                    isDroppingPiece = null;
                    clearHikoroHighlights();
                    displayReplayState(existingNode); // Show state after normal move
                }
            } else {
                // Invalid target clicked, deselect
                clearHikoroHighlights();
                selectedSquare = null;
            }
            return; // End processing
        }

        // --- Drop Logic ---
        if (isDroppingPiece) {
            const to = { x, y };
            // Ensure piece type is valid for dropping
            if (isDroppingPiece.type === 'lupa' || isDroppingPiece.type === 'prince') {
                clearHikoroHighlights(); isDroppingPiece = null; return;
            }
            // Construct drop move object
            const moveObj = { type: 'drop', piece: { type: isDroppingPiece.type }, to };

            // Client-side validation: empty and valid square
            if (currentGameState.boardState[to.y]?.[to.x] === null && gameLogic.isPositionValid(to.x, to.y)) {
                // Apply drop to get next state
                const nextGameState = applyMoveToState(currentGameState, moveObj);
                // Generate notation for drop
                const notationString = generateServerNotation({ type: isDroppingPiece.type }, to, false, true);

                 // Check if this exact drop already exists as a child node
                 let existingNode = currentReplayNode.children.find(child =>
                     child.moveObj?.type === 'drop' &&
                     child.moveObj.piece.type === moveObj.piece.type &&
                     child.moveObj.to.x === moveObj.to.x && child.moveObj.to.y === moveObj.to.y
                 );

                 if (!existingNode) {
                     // Create a new node if this variation wasn't in the Kifu
                     console.log("Creating new node for drop variation.");
                     existingNode = {
                         moveNotation: notationString, moveObj: moveObj, gameState: nextGameState,
                         parent: currentReplayNode, children: [], isBonusSecondMove: false
                     };
                     currentReplayNode.children.push(existingNode); // Add as a new child branch
                 } else {
                     console.log("Following existing node for drop.");
                 }

                // Drops don't trigger bonus moves
                awaitingBonusMove = null;
                selectedSquare = null;
                isDroppingPiece = null;
                clearHikoroHighlights();
                displayReplayState(existingNode); // Show state after drop

            } else {
                // Invalid drop location clicked, deselect
                clearHikoroHighlights();
                isDroppingPiece = null;
            }
            return; // End processing
        }

        // --- Standard piece selection on the board ---
        const piece = currentGameState.boardState[y]?.[x];
        if (piece) {
            // Allow selecting only the piece whose turn it is
            const canSelectPiece = piece.color === (currentGameState.isWhiteTurn ? 'white' : 'black');
            if (canSelectPiece) {
                // Toggle selection if clicking the same piece again
                if (selectedSquare && selectedSquare.x === x && selectedSquare.y === y) {
                    selectedSquare = null; // Deselect
                    clearHikoroHighlights();
                } else {
                    // Select the new piece
                    selectedSquare = { x, y };
                    isDroppingPiece = null; // Clear drop selection
                    // Get and draw valid moves (no bonus flag needed here, handled above)
                    const validMoves = gameLogic.getValidMovesForPiece(piece, x, y, currentGameState.boardState, false);
                    clearHikoroHighlights();
                    drawHikoroHighlights(validMoves);
                    // Add visual selection to the square
                    const selSquareEl = document.querySelector(`#game-board .square[data-logical-x='${x}'][data-logical-y='${y}']`);
                    if(selSquareEl) selSquareEl.classList.add('selected');
                }
            } else { // Clicked opponent piece
                 // Clear any selection if opponent piece is clicked
                 selectedSquare = null; isDroppingPiece = null; clearHikoroHighlights();
            }
        } else { // Clicked empty square when not moving/dropping
            // Clear any selection
            selectedSquare = null;
            isDroppingPiece = null;
            clearHikoroHighlights();
        }
    }


    // --- Updated handleReplayCapturedClick ---
    function handleReplayCapturedClick(pieceData, handColor, clickedElement) { // pieceData only has {type}
        if (!currentReplayNode) return; // Check if replay is active
        const currentGameState = currentReplayNode.gameState;

        // Prevent selecting from hand if bonus move is pending
        if (currentGameState.bonusMoveInfo) {
             console.log("Cannot select captured piece while bonus move is pending.");
             return;
        }

        // Allow selecting only from the hand of the player whose turn it is
        const activeColor = currentGameState.isWhiteTurn ? 'white' : 'black';
        if (handColor !== activeColor) return;

        // Prevent selecting royalty
        if (pieceData.type === 'lupa' || pieceData.type === 'prince') return;

        // Toggle selection: If clicking the same piece type again, deselect
        if (isDroppingPiece && isDroppingPiece.type === pieceData.type) {
            isDroppingPiece = null;
            selectedSquare = null; // Clear board selection too
            clearHikoroHighlights(); // Clear board highlights
            clickedElement.classList.remove('selected-drop'); // Remove visual selection
            return;
        }

        // Select piece for dropping
        selectedSquare = null; // Clear any board selection
        isDroppingPiece = { type: pieceData.type }; // Store just the type
        clearHikoroHighlights(); // Clear board highlights
        // Remove selection from previously selected captured piece
        document.querySelectorAll('.captured-piece.selected-drop').forEach(el => el.classList.remove('selected-drop'));
        clickedElement.classList.add('selected-drop'); // Add visual selection to this piece
        highlightHikoroDropSquares(); // Highlight valid drop squares on the board (uses global gameState)
    }


    // --- Updated Display Replay State ---
    function displayReplayState(node) {
        if (!node) return;
        currentReplayNode = node; // Update the current position in the tree

        // Calculate the display move number by traversing up the main line
        let displayMoveNum = 0;
        let tempNode = node;
        let pathNodes = []; // Store nodes in path for accurate count
        while (tempNode && tempNode.parent) {
            pathNodes.unshift(tempNode); // Add to beginning
            tempNode = tempNode.parent;
        }
        pathNodes.forEach(n => { if (!n.isBonusSecondMove) displayMoveNum++; });

        gameState = node.gameState; // Set global state for renderers

        // Render the board and captured pieces based on the node's game state
        renderHikoroBoard(); // Replay mode always uses Hikoro board rendering
        renderHikoroCaptured();
        updateTurnIndicator(); // Update whose turn it is
        renderReplayMoveHistory(); // Re-render the move tree, highlighting the current node

        // Update replay control buttons and move number display
        // Calculate total moves in the *original* main line for display consistency
         let displayTotal = 0;
         flatMoveList.forEach(n => { if (n !== replayGameTree && !n.isBonusSecondMove) displayTotal++; });
        replayMoveNumber.textContent = `${displayMoveNum} / ${displayTotal}`;

        // Enable/disable navigation buttons based on position in the tree
        replayFirstBtn.disabled = (node === replayGameTree); // Disable if at root
        replayPrevBtn.disabled = (!node.parent); // Disable if no parent (at root)

        // Next button: disable if no children AND no bonus pending
        replayNextBtn.disabled = node.children.length === 0 && !gameState.bonusMoveInfo;

        // Last button: disable if at the end of the *original* main line
        replayLastBtn.disabled = (flatMoveList.length <= 1 || node === flatMoveList[flatMoveList.length - 1]);

        // Clear bonus requirement *unless* we are displaying the state that requires it
        if (!gameState.bonusMoveInfo) {
            awaitingBonusMove = null;
        }

        // Manage highlights and selections based on bonus state for interactive replay
         if (gameState.bonusMoveInfo) {
             // Bonus is pending in this state, force selection of the bonus piece
             selectedSquare = { x: gameState.bonusMoveInfo.pieceX, y: gameState.bonusMoveInfo.pieceY };
             isDroppingPiece = null; // Cannot drop during bonus
             const bonusPiece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
             if (bonusPiece) {
                 // Get and highlight only the valid non-capture moves
                 const validBonusMoves = gameLogic.getValidMovesForPiece(bonusPiece, selectedSquare.x, selectedSquare.y, gameState.boardState, true).filter(m => !m.isAttack);
                 clearHikoroHighlights();
                 drawHikoroHighlights(validBonusMoves);
                 // Visually select the piece on the board
                 const bonusSquareEl = document.querySelector(`#game-board .square[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`);
                 if (bonusSquareEl) bonusSquareEl.classList.add('selected');
             } else {
                  // Error state: Bonus info exists but piece is gone? Clear state.
                  console.error("Replay bonus state error: Piece missing!");
                  clearHikoroHighlights(); selectedSquare = null; awaitingBonusMove = null;
             }
         } else if (selectedSquare || isDroppingPiece) {
              // If navigating and a selection *was* active (but not bonus), clear it for the new state
              selectedSquare = null;
              isDroppingPiece = null;
              clearHikoroHighlights();
         }
    }

    // --- (Keep your rules modal functions unchanged) ---
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

    function populateGoRules() {
        rulesBody.innerHTML = `
            <h2>Go Variant Rules</h2>
            <p>This is a fast-paced Go variant combining elements of Go and Chess.</p>

            <h3>Objective</h3>
            <p>The goal is to have a higher score than your opponent. Your score is the sum of:</p>
            <ul>
                <li><strong>Territory:</strong> Empty intersections you have surrounded.</li>
                <li><strong>Stones:</strong> The number of your stones on the board.</li>
            </ul>

            <h3>Gameplay</h3>
            <p>On your turn, you can choose one of four actions:</p>
            
            <h4>1. Place a Stone (Default Click)</h4>
            <p>Click on any empty intersection to place one of your stones. This is the most common move.</p>

            <h4>2. Move a Stone (Click to Select, Click to Move)</h4>
            <p>Click one of your existing stones to select it. Click a valid empty square to move it. Valid moves depend on the piece type:</p>
            <ul>
                <li><strong>Normal Stone:</strong> Can only move by making a <strong>Jump Capture</strong>. A jump is a two-square orthogonal move over a single <strong>enemy</strong> stone, landing on an empty space (like in Checkers).</li>
                <li><strong>Shield Stone:</strong> Can move one square <strong>orthogonally</strong> (up, down, left, or right) to an empty space. It cannot capture.</li>
            </ul>

            <h4>3. Turn to Shield (Double-Click or Select + Button)</h4>
            <p>Double-click one of your <strong>normal stones</strong> (or select it and press the 'Shield' button) to turn it into a Shield. A Shield cannot be captured by a jump, but it can be captured by the Go Capture rule. It counts for territory and score.</p>

            <h4>4. Pass Turn</h4>
            <p>You can click the 'Pass Turn' button. This is required if you are in a chain capture and do not wish to continue jumping.</p>

            <h3>Capture Rules</h3>
            <p>There are two ways to capture stones:</p>
            <ol>
                <li><strong>Jump Capture (via Move):</strong> As described above, jumping over a single enemy stone captures it. You can chain multiple jumps together in one turn.</li>
                <li><strong>Go Capture (via Placement or Move):</strong> If any of your moves (placing or moving) results in an enemy group having no "liberties" (empty adjacent spaces), that entire group is captured and removed from the board.</li>
            </ol>

            <h3><span style="color: #FF5722;">⚠️</span> Special Rules</h3>
            <p><strong>Suicide Rule:</strong> You cannot make a move (place or move a stone) that results in your own group having zero liberties, <em>unless</em> that move also captures an enemy group at the same time.</p>
            <p><strong>Ko Rule:</strong> You cannot make a move that would return the board to the <strong>exact state</strong> it was in just before your opponent's last move. This prevents infinite loops.</p>
        `;
    }
	
	
	function populateRulesModal() {
        // Check the global gameState to decide which rules to show
        if (gameState && gameState.gameType === 'go') {
            populateGoRules();
        } else {
            // Default to Hikoro rules
            populateHikoroRules();
        }
    }

    // --- RENAMED HIKORO RULES (Your old function) ---
    function populateHikoroRules() {
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
            return a.name.localeCompare(b.name);
        }).forEach(p => {
            const entry = document.createElement('div');
            entry.className = 'piece-entry';
            const notation = p.notation || '?';
            entry.innerHTML = `
                <div class="piece-header">
                    <img src="sprites/${p.type}_white.png" alt="${p.name}">
                  - <span>${p.name} (${notation})</span>
                </div>
                <p>${p.desc}</p>
                ${p.special ? `<p><em><strong>Note:</strong> ${p.special}</em></p>` : ''}
            `;
            pieceListContainer.appendChild(entry);
        });
    }

    // Ensure rulesBtn exists before adding listener
     if (rulesBtn) {
        rulesBtn.addEventListener('click', () => {
            // --- MODIFIED: Check the lobby dropdown to show correct rules ---
            const gameType = gameTypeSelect.value; 
            if (gameType === 'go') {
                populateGoRules();
            } else {
                populateHikoroRules();
            }
            if (rulesModal) rulesModal.style.display = 'block';
        });
    } else {
         console.warn("Rules button (#rules-btn) not found in lobby.");
    }


    if (closeRulesBtn && rulesModal) {
        closeRulesBtn.addEventListener('click', () => {
           rulesModal.style.display = 'none';
        });
    }

    // Close modal if clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target == rulesModal) {
            if (rulesModal) rulesModal.style.display = 'none';
        }
    });

}); // End DOMContentLoaded
