document.addEventListener('DOMContentLoaded', () => {

    const productionUrl = 'https://HikoroChess.org';
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const serverUrl = isLocal ? 'http://localhost:3000' : window.location.origin;

    const socket = io(serverUrl);

    
    let botWorker = null;
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


                
                if (bestMove.type === 'drop') {
                    socket.emit('makeDrop', { gameId, piece: { type: bestMove.pieceType }, to: bestMove.to });
                } else {
                    socket.emit('makeMove', { gameId, from: bestMove.from, to: bestMove.to });
                }
            } else {
                console.error("Bot worker returned no move.");
                
            }
        };

        botWorker.onerror = function(error) {
            console.error("Error in Bot Worker:", error.message, error);
            
        };

    } catch (e) {
        console.error("Failed to create Bot Worker:", e);
        alert("Could not initialize the AI worker. The bot will not function.");
        
    }
    


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
    const moveHistoryElement = document.getElementById('move-history'); // Get move history el

    // [NEW] Post-game and Replay elements
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
    let selectedSquare = null;
    let isDroppingPiece = null;
    let isSinglePlayer = false;
    let isBotGame = false;

    // [NEW] Replay state variables
    let isReplayMode = false;
    let replayGameTree = null; // Root node of the game tree
    let currentReplayNode = null; // The node currently being displayed
    let flatMoveList = []; // For easy Next/Prev on main line
    let currentMoveIndex = -1;

    let botBonusState = null; 
    let currentTurnHadBonusState = false; 


    const sanctuarySquares = [
        {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
        {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
    ];

    const whitePalace = { minY: 0, maxY: 1, minX: 3, maxX: 6 };
    const blackPalace = { minY: 14, maxY: 15, minX: 3, maxX: 6 };

    
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
        if (gameId && !isReplayMode) { // Don't emit leaveGame in replay mode
            socket.emit('leaveGame', gameId);
        }
        
        // This is the simplest way to reset all state
        window.location.reload(); 
    });

    // [NEW] Kifu and Replay Listeners
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
            
            // Check if gameLogic is loaded
            if (typeof gameLogic === 'undefined' || !gameLogic.getInitialBoard) {
                alert("Error: Game logic failed to load. Cannot start replay.");
                return;
            }

            replayGameTree = buildReplayTree(kifuText);
            if (!replayGameTree) return;
            
            flatMoveList = [replayGameTree];
            let node = replayGameTree;
            while(node.children.length > 0) {
                 // Follow the main line (first child)
                 node = node.children[0];
                 flatMoveList.push(node);
            }

            currentReplayNode = replayGameTree;
            currentMoveIndex = 0;
            isReplayMode = true;
            isSinglePlayer = false; // Ensure other modes are off
            isBotGame = false;
            
            // Hide lobby, show game
            lobbyElement.style.display = 'none';
            gameContainerElement.style.display = 'flex';
            gameControls.style.display = 'flex';
            replayControls.style.display = 'flex';
            
            // Set up board
            myColor = 'white'; // Replay is always from white's perspective
            renderNotationMarkers();
            displayReplayState(currentReplayNode);
        });
    }

    // [NEW] Replay Navigation Listeners
    replayFirstBtn.addEventListener('click', () => {
        if (!isReplayMode) return;
        currentMoveIndex = 0;
        displayReplayState(flatMoveList[currentMoveIndex]);
    });
    
    replayPrevBtn.addEventListener('click', () => {
        if (!isReplayMode) return;
        
        // Find current node's parent, regardless of branch
        if (currentReplayNode && currentReplayNode.parent) {
            displayReplayState(currentReplayNode.parent);
        }
    });
    
    replayNextBtn.addEventListener('click', () => {
        if (!isReplayMode) return;
        
        // Find index in flat list
        let flatIndex = flatMoveList.indexOf(currentReplayNode);
        if (flatIndex > -1 && flatIndex < flatMoveList.length - 1) {
             // On main line, just go to next
             displayReplayState(flatMoveList[flatIndex + 1]);
        } else if (currentReplayNode.children.length > 0) {
            // On a branch, or at end of main line with branches
            // Just go to the first child
            displayReplayState(currentReplayNode.children[0]);
        }
    });
    
    replayLastBtn.addEventListener('click', () => {
        if (!isReplayMode) return;
        currentMoveIndex = flatMoveList.length - 1;
        displayReplayState(flatMoveList[currentMoveIndex]);
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

        // [NEW] Hide timers in replay mode
        if (isReplayMode) {
             whiteTimerEl.style.display = 'none';
             blackTimerEl.style.display = 'none';
             return;
        } else {
             whiteTimerEl.style.display = 'inline-block';
             blackTimerEl.style.display = 'inline-block';
        }

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
        isReplayMode = false; // [NEW]
        botBonusState = null;
        turnIndicator.textContent = "Waiting for an opponent...";
        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
    }

    function onGameStart(initialGameState) {
        gameId = initialGameState.id;
        botBonusState = null;
        isReplayMode = false; // [NEW]

        isSinglePlayer = initialGameState.isSinglePlayer;

    if (isSinglePlayer) {
        myColor = 'white'; 
        
        console.log(`[onGameStart] Single player game started. isBotGame = ${isBotGame}`); 
    } else {
        
        isBotGame = false; 
        isSinglePlayer = false; 
        if (!myColor) {
            myColor = 'black';
        }
        console.log("[onGameStart] Multiplayer game started.");
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
        // CORRECTED ID HERE:
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

    renderBoard();
    renderCaptured();
    updateTurnIndicator();
    renderMoveHistory(gameState.moveList);

    console.log(`[updateLocalState] Checking bot turn: isBotGame=${isBotGame}, gameOver=${gameState.gameOver}, isWhiteTurn=${gameState.isWhiteTurn}, botWorkerExists=${!!botWorker}`);

    if (isBotGame && !gameState.gameOver && !gameState.isWhiteTurn && botWorker) {
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
    } else if (isBotGame && !gameState.isWhiteTurn && !botWorker) {
        console.error("Bot's turn, but worker is not available!");
    } else {
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

        // [MODIFIED] Use isSinglePlayer OR isReplayMode
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
        // [NEW] Divert to replay renderer if in replay mode
        if (isReplayMode) {
            renderReplayMoveHistory();
            return;
        }

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
                // [MODIFIED] Use isSinglePlayer OR isReplayMode
                if (myColor === 'white' || isSinglePlayer || isReplayMode) { 
                    displayY = BOARD_HEIGHT - 1 - y;
                } else if (myColor === 'black') { 
                    displayX = BOARD_WIDTH - 1 - x;
                    displayY = y; 
                    displayY = y; 
                    displayX = BOARD_WIDTH - 1 - x; 
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

                
                // [MODIFIED] Use gameLogic if available
                const isBoardValid = typeof gameLogic !== 'undefined' ? gameLogic.isPositionValid(x, y) : (typeof isPositionValid === 'function' ? isPositionValid(x, y) : true); 


                if (!isBoardValid) {
                    square.classList.add('invalid');
                } else {
                    square.addEventListener('click', (event) => {
                        const clickedSquare = event.currentTarget;
                        const logicalX = parseInt(clickedSquare.dataset.logicalX);
                        const logicalY = parseInt(clickedSquare.dataset.logicalY);
                        onSquareClick(logicalX, logicalY); // This function will now check isReplayMode
                    });
                }

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
                boardElement.appendChild(square);
            }
        }
    }


    function renderCaptured() {
        if (!gameState || !gameState.whiteCaptured || !gameState.blackCaptured) {
            console.error("Gamestate incomplete for renderCaptured");
            return;
        }

        
        // [MODIFIED] Use isSinglePlayer OR isReplayMode
        const isBottomHandWhite = (isSinglePlayer || isReplayMode || myColor === 'white');
        
        const bottomHandPieces = isBottomHandWhite ? gameState.whiteCaptured : gameState.blackCaptured;
        const topHandPieces = isBottomHandWhite ? gameState.blackCaptured : gameState.whiteCaptured;
        
        const bottomHandEl = document.querySelector(isBottomHandWhite ? '#white-captured' : '#black-captured');
        const topHandEl = document.querySelector(isBottomHandWhite ? '#black-captured' : '#white-captured');
        
        const bottomLabelEl = document.querySelector(isBottomHandWhite ? '#white-captured-area .hand-label' : '#black-captured-area .hand-label');
        const topLabelEl = document.querySelector(isBottomHandWhite ? '#black-captured-area .hand-label' : '#white-captured-area .hand-label');

        if (!bottomHandEl || !topHandEl || !bottomLabelEl || !topLabelEl) {
            console.error("Captured piece elements not found!");
            return;
        }

        
        // [MODIFIED] Add replay mode text
        if (isSinglePlayer || isReplayMode) {
             bottomLabelEl.textContent = "White's Hand";
             topLabelEl.textContent = (isBotGame && !isReplayMode) ? "Bot's Hand (Black)" : "Black's Hand";
        } else {
             bottomLabelEl.textContent = "Your Hand";
             topLabelEl.textContent = "Opponent's Hand";
        }

        
        bottomHandEl.innerHTML = '';
        topHandEl.innerHTML = '';

        
        const createCapturedPieceElement = (piece, handColor, isClickable) => {
            const el = document.createElement('div');
            el.classList.add('captured-piece', handColor); 

            const pieceElement = document.createElement('div');
            pieceElement.classList.add('piece');

            const spriteImg = document.createElement('img');
            const spriteType = piece.type;
            
            const displayColor = handColor; 
            spriteImg.src = `sprites/${spriteType}_${displayColor}.png`;
            spriteImg.alt = `${displayColor} ${piece.type}`;

            pieceElement.appendChild(spriteImg);
            el.appendChild(pieceElement);

            if (isClickable) {
                
                el.addEventListener('click', (event) => onCapturedClick(piece, handColor, event.currentTarget)); // This function will check isReplayMode
            }
            return el;
        };

        
        const bottomHandColor = isBottomHandWhite ? 'white' : 'black';
        const topHandColor = isBottomHandWhite ? 'black' : 'white';

        
        // [MODIFIED] Allow clicking both hands in replay mode
        const isBottomHandClickable = (isSinglePlayer && !isBotGame) || 
                                      (isSinglePlayer && isBotGame) || 
                                      (isReplayMode) || // [NEW]
                                      (!isSinglePlayer && myColor === bottomHandColor); 

        
        const isTopHandClickable = (isSinglePlayer && !isBotGame) || 
                                   (isReplayMode) || // [NEW]
                                   (!isSinglePlayer && myColor === topHandColor); 
                                
        
        bottomHandPieces.forEach((piece) => {
            const pieceEl = createCapturedPieceElement(piece, bottomHandColor, isBottomHandClickable);
            bottomHandEl.appendChild(pieceEl);
        });

        topHandPieces.forEach((piece) => {
            const pieceEl = createCapturedPieceElement(piece, topHandColor, isTopHandClickable);
            topHandEl.appendChild(pieceEl);
        });
    }
    
    function updateTurnIndicator() {
    // Fetch elements inside the function
    const turnIndicatorEl = document.getElementById('turn-indicator');
    // CORRECTED ID HERE:
    const winnerTextEl = document.getElementById('winnerText');

    if (!turnIndicatorEl || !winnerTextEl) {
        console.error("updateTurnIndicator: Turn indicator or winner text element not found!");
        return;
    }

    if (gameState.gameOver && !isReplayMode) {
        turnIndicatorEl.textContent = '';
        if (!winnerTextEl.textContent || winnerTextEl.textContent.includes("Turn")) {
            const winnerName = gameState.winner === 'draw' ? 'Draw' : gameState.winner.charAt(0).toUpperCase() + gameState.winner.slice(1);
            winnerTextEl.textContent = gameState.winner === 'draw' ? 'Draw!' : `${winnerName} Wins!`;
            if (gameState.reason) {
                winnerTextEl.textContent += ` (${gameState.reason})`;
            }
        }
    } else {
        winnerTextEl.textContent = '';
        if (isSinglePlayer || isReplayMode) {
            turnIndicatorEl.textContent = gameState.isWhiteTurn ? "White's Turn" : "Black's Turn";
        } else {
            const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
            turnIndicatorEl.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
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

        clone.style.position = 'absolute'; 
        clone.style.top = `${fromTop}px`;
        clone.style.left = `${fromLeft}px`;
        clone.style.width = `${fromRect.width}px`;
        clone.style.height = `${fromRect.height}px`;
        clone.style.zIndex = '100'; 
        clone.style.transition = `top ${ANIMATION_DURATION}ms ease-out, left ${ANIMATION_DURATION}ms ease-out`;


        boardElement.appendChild(clone);
        void clone.offsetWidth;

        clone.style.top = `${toTop}px`;
        clone.style.left = `${toLeft}px`;

        setTimeout(() => {
             if (clone.parentNode === boardElement) { 
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
        clone.className = 'piece flying-piece drop'; 
        clone.innerHTML = `<img src="${pieceImgSrc}" alt="animating piece">`;

        clone.style.position = 'absolute';
        clone.style.top = `${toTop - toRect.height}px`; 
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
        // [NEW] Divert to replay logic if in replay mode
        if (isReplayMode) {
            handleReplaySquareClick(x, y);
            return;
        }

        if (gameState.gameOver || !gameState.boardState) return;

        const isPlayerTurn = (isSinglePlayer && !isBotGame) ||
                             (isBotGame && gameState.isWhiteTurn) || 
                             (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        if (!isPlayerTurn) return; 

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
                 
                 canSelectPiece = piece.color === (gameState.isWhiteTurn ? 'white' : 'black');
                 if(isBotGame && !gameState.isWhiteTurn) canSelectPiece = false; 
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
         document.querySelectorAll('.captured-piece.selected-drop').forEach(p => p.classList.remove('selected-drop')); 
    }

    function drawHighlights(moves) {
        clearHighlights();

        const elementToHighlight = selectedSquare
            ? document.querySelector(`[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`)
            : document.querySelector('.captured-piece.selected-drop');

        if (!elementToHighlight && !isDroppingPiece) return;

        // [MODIFIED] Add isReplayMode check
        const isPlayerTurn = (isReplayMode) || // [NEW]
                             (isSinglePlayer && !isBotGame) ||
                             (isBotGame && gameState.isWhiteTurn) ||
                             (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));


         if (selectedSquare && elementToHighlight) {
             elementToHighlight.classList.add(isPlayerTurn ? 'selected' : 'preview-selected');
         } else if (isDroppingPiece && elementToHighlight) {
             
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

    function onCapturedClick(piece, handColor, clickedElement) {
        // [NEW] Divert to replay logic
        if (isReplayMode) {
            handleReplayCapturedClick(piece, handColor, clickedElement);
            return;
        }

        if (gameState.gameOver) return;

        
        const activeColor = gameState.isWhiteTurn ? 'white' : 'black';
        if (handColor !== activeColor) {
            return; 
        }

        
        const isPlayerAllowedToMove = (isSinglePlayer && !isBotGame) || 
                                    (isBotGame && gameState.isWhiteTurn) || 
                                    (!isSinglePlayer && myColor === activeColor); 

        if (!isPlayerAllowedToMove) {
            return; 
        }

        
        if (piece.type === 'lupa' || piece.type === 'prince') {
            console.log("Cannot select royalty from hand.");
            return;
        }

        
        if (isDroppingPiece && isDroppingPiece.type === piece.type) {
            
            isDroppingPiece = null;
            selectedSquare = null;
            clearHighlights();
            clickedElement.classList.remove('selected-drop'); 
            return;
        }

        
        selectedSquare = null;
        isDroppingPiece = piece; 
        clearHighlights();
        clickedElement.classList.add('selected-drop'); 
        highlightDropSquares();
    }


    function highlightDropSquares() {
        
        document.querySelectorAll('.square.selected, .square.preview-selected').forEach(s => {
            s.classList.remove('selected', 'preview-selected');
        });
        document.querySelectorAll('.move-plate').forEach(p => p.remove());

         // [MODIFIED] Add isReplayMode check
         const isPlayerTurn = (isReplayMode) || // [NEW]
                              (isSinglePlayer && !isBotGame) ||
                              (isBotGame && gameState.isWhiteTurn) ||
                              (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));


        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                
                // [MODIFIED] Use gameLogic
                const isBoardValid = typeof gameLogic !== 'undefined' ? gameLogic.isPositionValid(x, y) : (typeof isPositionValid === 'function' ? isPositionValid(x, y) : true);

                if (gameState.boardState && gameState.boardState[y]?.[x] === null && isBoardValid) {
                    
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
            return a.name.localeCompare(b.name); 
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

     
     function isPositionValid(x, y) {
        if (x < 0 || y < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return false;
        if ((x <= 1 && y <= 2) || (x >= 8 && y <= 2)) return false;
        if ((x <= 1 && y >= 13) || (x >= 8 && y >= 13)) return false;
        return true;
     }
	 
	 function toAlgebraic(x, y) {
        const file = String.fromCharCode('a'.charCodeAt(0) + x);
        const rank = y + 1; // y=0 is rank 1
        return `${file}${rank}`;
    }

    // [NEW] Helper to convert "e10" to {x: 4, y: 9}
    function fromAlgebraic(alg) {
        if (!alg || alg.length < 2) return null;
        const file = alg.charAt(0);
        const rank = parseInt(alg.slice(1), 10);
        if (isNaN(rank)) return null;
        
        const x = file.charCodeAt(0) - 'a'.charCodeAt(0);
        const y = rank - 1; // y=0 is rank 1
        return { x, y };
    }

    // [NEW] Helper to generate notation (copied from server.js)
    function generateServerNotation(piece, to, wasCapture, wasDrop) {
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

    // [NEW] Parse "1. W_Move B_Move" into ["W_Move", "B_Move"]
    function parseKifuToMoveList(kifuText) {
        const moves = [];
        const lines = kifuText.split('\n');
        for (const line of lines) {
            const parts = line.trim().match(/^\d+\.\s*([^\s]+)(?:\s+([^\s]+))?$/);
            if (parts) {
                if (parts[1]) moves.push(parts[1]); // White's move
                if (parts[2]) moves.push(parts[2]); // Black's move
            }
        }
        return moves; // Returns ["S*e10", "S*f7", "B*c5", "KPa8"]
    }
    
    // [NEW] Find the 'from' square for a move notation
    function parseNotation(notation, boardState, isWhiteTurn) {
        const color = isWhiteTurn ? 'white' : 'black';
        
        // 1. Check for Drop (e.g., "S*e10")
        let match = notation.match(/^([A-Za-z]+)\*([a-j]\d+)$/);
        if (match) {
            const pieceAbbr = match[1];
            const algTo = match[2];
            const pieceType = gameLogic.notationToPieceType[pieceAbbr];
            if (!pieceType) return null; 
            
            return {
                type: 'drop',
                piece: { type: pieceType },
                to: fromAlgebraic(algTo)
            };
        }
        
        // 2. Check for Move (e.g., "KPa8" or "KxPa8")
        match = notation.match(/^([A-Za-z]+)(x?)([a-j]\d+)$/);
        if (match) {
            const pieceAbbr = match[1];
            const algTo = match[3];
            const pieceType = gameLogic.notationToPieceType[pieceAbbr];
            const to = fromAlgebraic(algTo);
            
            if (!pieceType || !to) return null; 
            
            // Find the 'from' square
            for (let y = 0; y < gameLogic.BOARD_HEIGHT; y++) {
                for (let x = 0; x < gameLogic.BOARD_WIDTH; x++) {
                    const piece = boardState[y]?.[x];
                    if (piece && piece.color === color && piece.type === pieceType) {
                        const validMoves = gameLogic.getValidMovesForPiece(piece, x, y, boardState, false);
                        if (validMoves.some(m => m.x === to.x && m.y === to.y)) {
                            return {
                                type: 'board',
                                from: { x, y },
                                to: to
                            };
                        }
                    }
                }
            }
            console.warn(`Could not find 'from' square for move: ${notation}`);
            return null;
        }
        return null;
    }

    // [NEW] Simulate a move and return the new game state
    function applyMoveToState(oldGameState, move) {
        let newGameState = JSON.parse(JSON.stringify(oldGameState)); // Deep copy
        let { boardState, whiteCaptured, blackCaptured, isWhiteTurn } = newGameState;
        const color = isWhiteTurn ? 'white' : 'black';

        if (move.type === 'drop') {
            boardState[move.to.y][move.to.x] = { type: move.piece.type, color: color };
            const hand = isWhiteTurn ? whiteCaptured : blackCaptured;
            const pieceIndex = hand.findIndex(p => p.type === move.piece.type);
            if (pieceIndex > -1) hand.splice(pieceIndex, 1);
            
        } else if (move.type === 'board') {
            const piece = boardState[move.from.y][move.from.x];
            if (!piece) return oldGameState; 
            
            const targetPiece = boardState[move.to.y][move.to.x];
            if (targetPiece) {
                // Simplified capture logic for replay
                if (targetPiece.type !== 'lupa' && targetPiece.type !== 'prince') {
                    const hand = isWhiteTurn ? whiteCaptured : blackCaptured;
                    if (hand.length < 6) {
                        hand.push({ type: targetPiece.type, color: color });
                    }
                }
            }
            
            boardState[move.to.y][move.to.x] = piece;
            boardState[move.from.y][move.from.x] = null;
            
            // Note: Simplified replay doesn't handle promotions, but could be added here
        }

        newGameState.isWhiteTurn = !newGameState.isWhiteTurn;
        newGameState.turnCount++;
        newGameState.lastMove = move.type === 'board' ? { from: move.from, to: move.to } : { from: null, to: move.to };
        return newGameState;
    }

    // [NEW] Main Replay Game Tree Builder
    function buildReplayTree(kifuText) {
        const moveNotations = parseKifuToMoveList(kifuText); 
        if (moveNotations.length === 0) {
            alert("Invalid or empty kifu.");
            return null;
        }

        const initialBoard = gameLogic.getInitialBoard();
        const rootNode = {
            moveNotation: "Start",
            moveObj: null,
            gameState: {
                boardState: initialBoard,
                whiteCaptured: [],
                blackCaptured: [],
                isWhiteTurn: true,
                turnCount: 0,
                gameOver: false,
                lastMove: null
            },
            parent: null,
            children: []
        };

        let currentNode = rootNode;
        let currentGameState = rootNode.gameState;

        for (const notation of moveNotations) {
            const moveObj = parseNotation(notation, currentGameState.boardState, currentGameState.isWhiteTurn);
            if (!moveObj) {
                console.error(`Failed to parse move: ${notation}`);
                continue; // Skip this move
            }

            const newGameState = applyMoveToState(currentGameState, moveObj);
            
            const newNode = {
                moveNotation: notation,
                moveObj: moveObj,
                gameState: newGameState,
                parent: currentNode,
                children: []
            };
            
            currentNode.children.push(newNode);
            currentNode = newNode;
            currentGameState = newNode.gameState;
        }
        
        return rootNode;
    }
    
    // [NEW] Function to display a specific replay node
    function displayReplayState(node) {
        if (!node) return;
        
        currentReplayNode = node;
        
        // Find index in flat list (main line)
        currentMoveIndex = flatMoveList.indexOf(node);
        let moveNum = currentMoveIndex;

        if (currentMoveIndex === -1) {
            // This is a branch. Find its depth.
            let tempNode = node;
            let depth = 0;
            while (tempNode.parent) {
                depth++;
                tempNode = tempNode.parent;
            }
            moveNum = depth;
        }

        // Set global gameState for rendering functions
        gameState = node.gameState; 
        
        renderBoard();
        renderCaptured();
        updateTurnIndicator(); 
        renderReplayMoveHistory(); // Use the new tree renderer
        
        // Update replay controls
        let totalMoves = flatMoveList.length - 1;
        replayMoveNumber.textContent = `${moveNum} / ${totalMoves}`;
        
        replayFirstBtn.disabled = (moveNum <= 0 && currentMoveIndex !== -1);
        replayPrevBtn.disabled = (!node.parent);
        
        // Disable next/last if not on the main line
        replayNextBtn.disabled = (node.children.length === 0);
        replayLastBtn.disabled = (currentMoveIndex === -1 || currentMoveIndex === totalMoves);
    }

    // [NEW] Recursive move history renderer for branching
    function renderReplayMoveHistory() {
        if (!moveHistoryElement) return;
        moveHistoryElement.innerHTML = '';
        
        function renderNodeRecursive(node, parentEl, depth) {
            const moveEl = document.createElement('div');
            moveEl.classList.add('move-node');
            moveEl.style.paddingLeft = `${depth * 15}px`;
            
            let moveText = node.moveNotation;
             if (depth > 0 || node.parent) { // Not root
                 const isWhiteMove = !node.gameState.isWhiteTurn; // state is *after* move
                 if (isWhiteMove) {
                     const turnNum = Math.floor(node.gameState.turnCount / 2) + 1;
                     moveText = `${turnNum}. ${moveText}`;
                 } else {
                     moveText = `... ${moveText}`;
                 }
                 // Add parenthesis for branches
                 if (node.parent && node.parent.children.length > 1 && node.parent.children[0] !== node) {
                     moveText = `( ${moveText} )`;
                 }
             }
            moveEl.textContent = moveText;

            if (node === currentReplayNode) {
                moveEl.classList.add('active-move');
                // Scroll to active move
                setTimeout(() => moveEl.scrollIntoView({ behavior: 'auto', block: 'nearest' }), 0);
            }
            
            moveEl.addEventListener('click', (e) => {
                e.stopPropagation();
                displayReplayState(node);
            });
            
            parentEl.appendChild(moveEl);
            
            // Render children
            for (const child of node.children) {
                renderNodeRecursive(child, parentEl, depth + (node.parent && node.parent.children.length > 1 ? 1 : 0));
            }
        }
        
        renderNodeRecursive(replayGameTree, moveHistoryElement, 0);
    }

    // [NEW] Handler for clicks during replay
    function handleReplaySquareClick(x, y) {
        if (gameState.gameOver) return; // 'gameState' is set by displayReplayState

        if (selectedSquare && (selectedSquare.x !== x || selectedSquare.y !== y)) {
            // User is making a move (a new branch)
            const from = selectedSquare;
            const to = { x, y };
            const piece = gameState.boardState[from.y]?.[from.x];
            
            if (!piece) { clearHighlights(); selectedSquare = null; return; }
            
            const validMoves = gameLogic.getValidMovesForPiece(piece, from.x, from.y, gameState.boardState, false);
            const isValidBranchMove = validMoves.some(m => m.x === to.x && m.y === to.y);

            if (isValidBranchMove) {
                const moveObj = { type: 'board', from, to };
                const newGameState = applyMoveToState(gameState, moveObj);
                const wasCapture = !!gameState.boardState[to.y][to.x];
                const notationString = generateServerNotation(piece, to, wasCapture, false);
                
                const newNode = {
                    moveNotation: notationString,
                    moveObj: moveObj,
                    gameState: newGameState,
                    parent: currentReplayNode, // Branch off the *current* node
                    children: []
                };
                
                currentReplayNode.children.push(newNode);
                
                // If this was the main line, update it
                if (flatMoveList.indexOf(currentReplayNode) > -1) {
                    flatMoveList.splice(currentMoveIndex + 1); // Truncate old main line
                    flatMoveList.push(newNode);
                }
                
                displayReplayState(newNode);
            }
            
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
            return;
        }

        if (isDroppingPiece) {
            // User is dropping a piece (a new branch)
            const to = { x, y };
            const moveObj = { type: 'drop', piece: isDroppingPiece, to };
            
            if (gameState.boardState[to.y][to.x] === null && gameLogic.isPositionValid(to.x, to.y)) {
                const newGameState = applyMoveToState(gameState, moveObj);
                const notationString = generateServerNotation(isDroppingPiece, to, false, true);
                
                const newNode = {
                    moveNotation: notationString,
                    moveObj: moveObj,
                    gameState: newGameState,
                    parent: currentReplayNode,
                    children: []
                };
                
                currentReplayNode.children.push(newNode);
                
                if (flatMoveList.indexOf(currentReplayNode) > -1) {
                    flatMoveList.splice(currentMoveIndex + 1); 
                    flatMoveList.push(newNode);
                }

                displayReplayState(newNode);
            }
            
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
            return;
        }

        // Standard piece selection logic
        const piece = gameState.boardState[y]?.[x];
        if (piece) {
            const canSelectPiece = piece.color === (gameState.isWhiteTurn ? 'white' : 'black');

            if (canSelectPiece) {
                if (selectedSquare && selectedSquare.x === x && selectedSquare.y === y) {
                    selectedSquare = null;
                    clearHighlights();
                } else {
                    selectedSquare = { x, y };
                    isDroppingPiece = null;
                    
                    const validMoves = gameLogic.getValidMovesForPiece(piece, x, y, gameState.boardState, false);
                    drawHighlights(validMoves); 
                }
            }
        } else {
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
        }
    }

    // [NEW] Handler for captured clicks during replay
    function handleReplayCapturedClick(piece, handColor, clickedElement) {
        if (gameState.gameOver) return;

        const activeColor = gameState.isWhiteTurn ? 'white' : 'black';
        if (handColor !== activeColor) return;
        
        if (piece.type === 'lupa' || piece.type === 'prince') return;

        if (isDroppingPiece && isDroppingPiece.type === piece.type) {
            isDroppingPiece = null;
            selectedSquare = null;
            clearHighlights();
            clickedElement.classList.remove('selected-drop');
            return;
        }
        
        selectedSquare = null;
        isDroppingPiece = piece;
        clearHighlights();
        clickedElement.classList.add('selected-drop');
        highlightDropSquares();
    }

}); 