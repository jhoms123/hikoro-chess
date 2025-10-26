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
    const winnerText = document.getElementById('winnerText'); // Corrected ID used here
    const singlePlayerBtn = document.getElementById('single-player-btn');
    const playBotBtn = document.getElementById('play-bot-btn');

    const gameControls = document.getElementById('game-controls');
    const mainMenuBtn = document.getElementById('main-menu-btn');
    const rulesBtnIngame = document.getElementById('rules-btn-ingame');
    const moveHistoryElement = document.getElementById('move-history');

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

    let isReplayMode = false;
	let replayGameTree = null;
	let currentReplayNode = null;
	let flatMoveList = []; // Only used for First/Last button now
	let currentMoveIndex = -1; // Index within flatMoveList if applicable
	let awaitingBonusMove = null; // Tracks pending bonus move info during branching

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
        if (gameId && !isReplayMode) {
            socket.emit('leaveGame', gameId);
        }
        window.location.reload();
    });

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

            if (typeof gameLogic === 'undefined' || !gameLogic.getInitialBoard) {
                alert("Error: Game logic failed to load. Cannot start replay.");
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
            clearHighlights();
            // --- End reset ---

            replayGameTree = buildReplayTree(kifuText);
            if (!replayGameTree) {
                 alert("Failed to build replay tree from Kifu.");
                 return; // Stop if tree building failed
            }

            // flatMoveList is now built inside buildReplayTree

            currentReplayNode = replayGameTree; // Start at the root (before first move)
            isReplayMode = true;
            isSinglePlayer = false;
            isBotGame = false;

            lobbyElement.style.display = 'none';
            gameContainerElement.style.display = 'flex';
            gameControls.style.display = 'flex'; // Show Rules/Main Menu
            replayControls.style.display = 'flex'; // Show Replay Navigation
            postGameControls.style.display = 'none'; // Hide kifu download/copy

            myColor = 'white';
            renderNotationMarkers();
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
        const whiteTimerEl = document.getElementById('white-time');
        const blackTimerEl = document.getElementById('black-time');

        // Allow gameState check even without timeControl in replay
        if (!whiteTimerEl || !blackTimerEl || (!gameState.timeControl && !isReplayMode)) return;

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
        isReplayMode = false;
        botBonusState = null;
        turnIndicator.textContent = "Waiting for an opponent...";
        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
         // Ensure correct controls are visible/hidden
         gameControls.style.display = 'flex';
         replayControls.style.display = 'none';
         postGameControls.style.display = 'none';
    }

    function onGameStart(initialGameState) {
        gameId = initialGameState.id;
        botBonusState = null;
        isReplayMode = false;

        isSinglePlayer = initialGameState.isSinglePlayer;

        if (isSinglePlayer) {
            myColor = 'white';
            console.log(`[onGameStart] Single player game started. isBotGame = ${isBotGame}`);
        } else {
            isBotGame = false;
            isSinglePlayer = false;
            if (!myColor) {
                myColor = 'black'; // Assume joined as black if not creator
            }
            console.log("[onGameStart] Multiplayer game started.");
        }

        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
        gameControls.style.display = 'flex';
        replayControls.style.display = 'none';
        postGameControls.style.display = 'none';


        renderNotationMarkers();
        updateLocalState(initialGameState);
    }

    // --- Uses updated updateTurnIndicator ---
    function updateLocalState(newGameState) {
        const isNewGameOver = newGameState.gameOver && !gameState.gameOver;
        gameState = newGameState; // Update global state first

        if (isNewGameOver && newGameState.winner) {
            const winnerTextEl = document.getElementById('winnerText'); // Fetch ID here
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
        updateTurnIndicator(); // Will fetch its own elements now
        renderMoveHistory(gameState.moveList); // Will check isReplayMode

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
            // console.log("[updateLocalState] Conditions *not* met for bot move."); // Reduce console noise
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
        // Use gameState directly as it's updated by displayReplayState or updateLocalState
        if (!gameState || !gameState.boardState) return;

        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                const square = document.createElement('div');
                square.classList.add('square');

                let displayX = x, displayY = y;
                if (myColor === 'white' || isSinglePlayer || isReplayMode) {
                    displayY = BOARD_HEIGHT - 1 - y;
                } else if (myColor === 'black') {
                    displayX = BOARD_WIDTH - 1 - x;
                    // displayY = y; // Redundant line removed
                }


                square.dataset.logicalX = x;
                square.dataset.logicalY = y;
                square.style.gridRowStart = displayY + 1;
                square.style.gridColumnStart = displayX + 1;

                // Highlight last move based on gameState
                if (gameState.lastMove) {
                    if (gameState.lastMove.from && x === gameState.lastMove.from.x && y === gameState.lastMove.from.y) {
                        square.classList.add('last-move-from');
                    }
                    // Handle drops where from is null
                    if (gameState.lastMove.to && x === gameState.lastMove.to.x && y === gameState.lastMove.to.y) {
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


                const isBoardValid = typeof gameLogic !== 'undefined' ? gameLogic.isPositionValid(x, y) : true;


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
         // After rendering, reapply highlights if needed (e.g., during bonus move)
         if (isReplayMode && gameState.bonusMoveInfo && selectedSquare) {
             const bonusPiece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
             if (bonusPiece) {
                 const validBonusMoves = gameLogic.getValidMovesForPiece(bonusPiece, selectedSquare.x, selectedSquare.y, gameState.boardState, true).filter(m => !m.isAttack);
                 drawHighlights(validBonusMoves); // Redraw highlights
                 const selSquareEl = document.querySelector(`[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`);
                if(selSquareEl) selSquareEl.classList.add('selected'); // Re-select
             }
         } else if (selectedSquare || isDroppingPiece) {
             // Reapply highlights if a piece was selected before re-render (less common)
              if (selectedSquare) {
                  const piece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
                  if (piece) {
                       const validMoves = gameLogic.getValidMovesForPiece(piece, selectedSquare.x, selectedSquare.y, gameState.boardState, false);
                       drawHighlights(validMoves);
                  }
              } else if (isDroppingPiece) {
                  highlightDropSquares();
                  const dropEl = document.querySelector(`.captured-piece .piece img[alt$="${isDroppingPiece.type}"]`)?.closest('.captured-piece');
                  if(dropEl) dropEl.classList.add('selected-drop');

              }
         }
    }


    function renderCaptured() {
        // Use gameState directly
        if (!gameState || !gameState.whiteCaptured || !gameState.blackCaptured) {
            // console.warn("Gamestate incomplete for renderCaptured"); // Reduce noise
            return;
        }


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


        if (isSinglePlayer || isReplayMode) {
             bottomLabelEl.textContent = "White's Hand";
             topLabelEl.textContent = (isBotGame && !isReplayMode) ? "Bot's Hand (Black)" : "Black's Hand";
        } else {
             bottomLabelEl.textContent = "Your Hand";
             topLabelEl.textContent = "Opponent's Hand";
        }


        bottomHandEl.innerHTML = '';
        topHandEl.innerHTML = '';


        const createCapturedPieceElement = (pieceData, handColor, isClickable) => { // pieceData only has {type}
            const el = document.createElement('div');
            el.classList.add('captured-piece', handColor);

            const pieceElement = document.createElement('div');
            pieceElement.classList.add('piece');

            const spriteImg = document.createElement('img');
            const spriteType = pieceData.type; // Use type from pieceData

            const displayColor = handColor;
            spriteImg.src = `sprites/${spriteType}_${displayColor}.png`;
            spriteImg.alt = `${displayColor} ${spriteType}`; // Use spriteType here

            pieceElement.appendChild(spriteImg);
            el.appendChild(pieceElement);

            if (isClickable) {
                // Pass the pieceData which just has the type
                el.addEventListener('click', (event) => onCapturedClick(pieceData, handColor, event.currentTarget));
            }
            return el;
        };


        const bottomHandColor = isBottomHandWhite ? 'white' : 'black';
        const topHandColor = isBottomHandWhite ? 'black' : 'white';


        const isBottomHandClickable = (isSinglePlayer && !isBotGame && gameState.isWhiteTurn === isBottomHandWhite) ||
                                      (isSinglePlayer && isBotGame && gameState.isWhiteTurn) || // Only allow clicking white's hand vs bot
                                      (isReplayMode) ||
                                      (!isSinglePlayer && myColor === bottomHandColor);


        const isTopHandClickable = (isSinglePlayer && !isBotGame && gameState.isWhiteTurn === isBottomHandWhite) || // Allow clicking black in pass-and-play
                                   (isReplayMode) ||
                                   (!isSinglePlayer && myColor === topHandColor);


        // --- Render Captured Pieces (Group by type) ---
         const groupPieces = (pieces) => {
             const counts = {};
             pieces.forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });
             return Object.entries(counts).sort(([typeA], [typeB]) => typeA.localeCompare(typeB)); // Sort alphabetically
         };

         groupPieces(bottomHandPieces).forEach(([type, count]) => {
             const pieceData = { type }; // Pass just the type
             const pieceEl = createCapturedPieceElement(pieceData, bottomHandColor, isBottomHandClickable);
             if (count > 1) {
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

    // --- Uses element fetching inside ---
    function updateTurnIndicator() {
        const turnIndicatorEl = document.getElementById('turn-indicator');
        const winnerTextEl = document.getElementById('winnerText'); // Use correct ID

        if (!turnIndicatorEl || !winnerTextEl) {
            console.error("updateTurnIndicator: Turn indicator or winner text element not found!");
            return;
        }

        if (gameState.gameOver && !isReplayMode) {
            turnIndicatorEl.textContent = '';
            // Ensure content is empty or default before setting winner
            if (!winnerTextEl.textContent || winnerTextEl.textContent.includes("Turn")) {
                const winnerName = gameState.winner === 'draw' ? 'Draw' : gameState.winner.charAt(0).toUpperCase() + gameState.winner.slice(1);
                winnerTextEl.textContent = gameState.winner === 'draw' ? 'Draw!' : `${winnerName} Wins!`;
                if (gameState.reason) {
                    winnerTextEl.textContent += ` (${gameState.reason})`;
                }
            }
        } else {
            winnerTextEl.textContent = ''; // Clear winner text
            if (isSinglePlayer || isReplayMode) {
                 // Use gameState which is updated globally
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
        void clone.offsetWidth; // Trigger reflow

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
        clone.style.top = `${toTop - toRect.height}px`; // Start above
        clone.style.left = `${toLeft}px`;
        clone.style.width = `${toRect.width}px`;
        clone.style.height = `${toRect.height}px`;
        clone.style.zIndex = '100';
        clone.style.opacity = '0';
        clone.style.transition = `top ${ANIMATION_DURATION}ms ease-in, opacity ${ANIMATION_DURATION}ms ease-in`;

        boardElement.appendChild(clone);
        void clone.offsetWidth; // Trigger reflow

        clone.style.top = `${toTop}px`;
        clone.style.opacity = '1';

        setTimeout(() => {
             if (clone.parentNode === boardElement) {
                clone.remove();
            }
        }, ANIMATION_DURATION);
    }


    function onSquareClick(x, y) {
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
                // Check if move is valid before animating/sending
                const validMoves = gameLogic.getValidMovesForPiece(piece, selectedSquare.x, selectedSquare.y, gameState.boardState, !!gameState.bonusMoveInfo);
                const isValidTarget = validMoves.some(m => m.x === x && m.y === y);
                if (isValidTarget) {
                    animateMove(selectedSquare, { x, y }, pieceImgSrc);
                    socket.emit('makeMove', { gameId, from: selectedSquare, to: { x, y } });
                } else {
                    console.log("Invalid move target selected.");
                }

            }
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
             // Check if drop is valid before animating/sending
             if (gameState.boardState[y]?.[x] === null && gameLogic.isPositionValid(x,y)) {
                const dropColor = isSinglePlayer ? (gameState.isWhiteTurn ? 'white' : 'black') : myColor;
                const spriteType = isDroppingPiece.type;
                const pieceImgSrc = `sprites/${spriteType}_${dropColor}.png`;
                animateDrop({ x, y }, pieceImgSrc);
                socket.emit('makeDrop', { gameId, piece: isDroppingPiece, to: { x, y } });
             } else {
                 console.log("Invalid drop location.");
             }
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

             // Allow selecting only the bonus piece if bonus move is pending
             if (gameState.bonusMoveInfo &&
                 (piece.color !== (gameState.isWhiteTurn ? 'white' : 'black') ||
                  x !== gameState.bonusMoveInfo.pieceX || y !== gameState.bonusMoveInfo.pieceY)) {
                  console.log("Must complete bonus move with the correct piece.");
                  canSelectPiece = false; // Prevent selecting other pieces
                  // Maybe flash the required piece?
             }


            if (canSelectPiece) {
                if (selectedSquare && selectedSquare.x === x && selectedSquare.y === y) {
                    selectedSquare = null;
                    isDroppingPiece = null;
                    clearHighlights();
                } else {
                    selectedSquare = { x, y };
                    isDroppingPiece = null;
                    // Request valid moves from server (handles bonus state)
                    socket.emit('getValidMoves', { gameId, square: { x, y } });
                }
            } else if (piece.color !== (gameState.isWhiteTurn ? 'white' : 'black')) {
                 // Clicked opponent piece when not selecting yours - clear selection
                 selectedSquare = null; isDroppingPiece = null; clearHighlights();
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
        clearHighlights(); // Ensure clean slate

        const elementToHighlight = selectedSquare
            ? document.querySelector(`[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`)
            : document.querySelector('.captured-piece.selected-drop');

        // Check if selection exists
        if (!selectedSquare && !isDroppingPiece) return;

        const isPlayerTurn = (isReplayMode) ||
                             (isSinglePlayer && !isBotGame) ||
                             (isBotGame && gameState.isWhiteTurn) ||
                             (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

         // Highlight the selected square/piece
         if (selectedSquare && elementToHighlight) {
             elementToHighlight.classList.add(isPlayerTurn ? 'selected' : 'preview-selected');
         } else if (isDroppingPiece && elementToHighlight) {
             // Already handled by selected-drop class added in onCapturedClick
         }

         // Filter moves if bonus move is required
         const bonusInfo = isReplayMode ? currentReplayNode?.gameState?.bonusMoveInfo : gameState.bonusMoveInfo;
         let movesToDraw = moves;
         if (bonusInfo && selectedSquare && (selectedSquare.x === bonusInfo.pieceX && selectedSquare.y === bonusInfo.pieceY)) {
             // Only show non-capture moves for the bonus piece
             movesToDraw = moves.filter(move => !move.isAttack);
         } else if (bonusInfo && (!selectedSquare || selectedSquare.x !== bonusInfo.pieceX || selectedSquare.y !== bonusInfo.pieceY)) {
              // If bonus is pending but wrong piece selected, show no moves
              movesToDraw = [];
         }


        movesToDraw.forEach(move => {
            const moveSquare = document.querySelector(`[data-logical-x='${move.x}'][data-logical-y='${move.y}']`);
            if (moveSquare) {
                const plate = document.createElement('div');
                plate.classList.add('move-plate');
                if (!isPlayerTurn) plate.classList.add('preview'); // Should not happen if turn logic correct
                if (move.isAttack) plate.classList.add('attack');
                if (isDroppingPiece) plate.classList.add('drop');

                moveSquare.appendChild(plate);
            }
        });
    }

    function onCapturedClick(pieceData, handColor, clickedElement) { // pieceData only has {type}
        if (isReplayMode) {
            handleReplayCapturedClick(pieceData, handColor, clickedElement);
            return;
        }

        if (gameState.gameOver) return;

        // Prevent selecting captured piece if bonus move is pending
        if(gameState.bonusMoveInfo){
             console.log("Cannot select captured piece during bonus move.");
             return;
        }

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


        if (pieceData.type === 'lupa' || pieceData.type === 'prince') {
            console.log("Cannot select royalty from hand.");
            return;
        }


        if (isDroppingPiece && isDroppingPiece.type === pieceData.type) {

            isDroppingPiece = null;
            selectedSquare = null;
            clearHighlights();
            clickedElement.classList.remove('selected-drop');
            return;
        }


        selectedSquare = null;
        isDroppingPiece = { type: pieceData.type }; // Store just the type
        clearHighlights();
        clickedElement.classList.add('selected-drop');
        highlightDropSquares(); // Uses global gameState
    }


    function highlightDropSquares() {

        document.querySelectorAll('.square.selected, .square.preview-selected').forEach(s => {
            s.classList.remove('selected', 'preview-selected');
        });
        document.querySelectorAll('.move-plate').forEach(p => p.remove());

         const isPlayerTurn = (isReplayMode) ||
                               (isSinglePlayer && !isBotGame) ||
                               (isBotGame && gameState.isWhiteTurn) ||
                               (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));


        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {

                const isBoardValid = typeof gameLogic !== 'undefined' ? gameLogic.isPositionValid(x, y) : true;

                // Use global gameState
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

    // --- Piece Info Data --- (Assuming unchanged)
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

     // --- Replay Helper Functions ---
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
            const lineMatch = line.trim().match(/^(\d+)\.\s*(.*)$/);
            if (lineMatch && lineMatch[2]) {
                const moveParts = lineMatch[2].trim().split(/\s+/);
                moves.push(...moveParts);
            }
        }
        console.log("Parsed Kifu:", moves);
        return moves;
    }

    // --- Updated Notation Parser ---
    function parseNotation(notation, boardState, isWhiteTurn) {
    // Requires gameLogic to be loaded
    if (typeof gameLogic === 'undefined' || !gameLogic.notationToPieceType || !gameLogic.getValidMovesForPiece) {
         console.error("parseNotation: gameLogic not available");
         return null;
    }

    const color = isWhiteTurn ? 'white' : 'black';
    console.log(`Parsing notation: "${notation}" for ${color}`); // Log input

    // 1. Check for Drop
    let match = notation.match(/^([A-Z][A-Za-z]*)\*([a-j](?:[1-9]|1[0-6]))$/);
    if (match) {
        const pieceAbbr = match[1];
        const algTo = match[2];
        const to = fromAlgebraic(algTo);
        const pieceType = gameLogic.notationToPieceType[pieceAbbr];
        if (!pieceType || !to) { console.warn(`Invalid drop notation or target: "${notation}"`); return null;}
        console.log(` -> Parsed as Drop: type=${pieceType}, to=`, to);
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

        if (!pieceType || !to) { console.warn(`Invalid move notation or target: "${notation}"`); return null; }
        console.log(` -> Attempting Move: type=${pieceType}, to=`, to, ` CaptureNotation=${isCaptureNotation}`);

        let foundMove = null;
        for (let y = 0; y < gameLogic.BOARD_HEIGHT; y++) {
            for (let x = 0; x < gameLogic.BOARD_WIDTH; x++) {
                const piece = boardState[y]?.[x];
                if (piece && piece.color === color && piece.type === pieceType) {
                    console.log(` -> Checking piece at ${toAlgebraic(x,y)} (${piece.type})`);
                     try {
                        const validMoves = gameLogic.getValidMovesForPiece(piece, x, y, boardState, false);
                        const matchingMove = validMoves.find(m => m.x === to.x && m.y === to.y);
                        if (matchingMove) {
                             console.log(`   -> Found valid move from ${toAlgebraic(x,y)} to ${algTo}. Is Attack=${matchingMove.isAttack}`);
                            // Check consistency: notation says capture ('x'), but move logic says no attack? Or vice versa?
                            if (isCaptureNotation && !matchingMove.isAttack) {
                                 console.warn(`   -> Mismatch: Notation "${notation}" indicates capture, but move logic says no attack.`);
                            } else if (!isCaptureNotation && matchingMove.isAttack) {
                                 console.warn(`   -> Mismatch: Notation "${notation}" indicates NO capture, but move logic says attack.`);
                                 // Allow this, standard notation often omits 'x'
                            }

                             // If multiple pieces can move, this might overwrite a previous find, but usually only one is legal.
                             foundMove = { type: 'board', from: { x, y }, to: to };
                             // Don't break immediately, log all possibilities in case of ambiguity later
                        } else {
                             // console.log(`   -> No valid move to ${algTo} from ${toAlgebraic(x,y)}`);
                        }
                     } catch(e) {
                         console.error(`Error checking valid moves for ${piece.type} at ${toAlgebraic(x,y)}:`, e);
                     }
                }
            }
        }

        if (foundMove) {
             console.log(` -> Successfully parsed "${notation}" as Move: from=`, foundMove.from, ` to=`, foundMove.to);
             return foundMove;
        } else {
             console.warn(`Could not find a valid 'from' square for move: "${notation}" for ${color}`);
             // Log board state for debugging
             // console.log("Board state at time of failure:", JSON.stringify(boardState));
             return null;
        }
    }

     console.warn("Could not parse notation (doesn't match drop or move):", notation);
    return null; // Doesn't match drop or move format
}

     // --- Updated Apply Move Function ---
    function applyMoveToState(oldGameState, moveObj) {
        if (!moveObj) {
             console.error("applyMoveToState received null moveObj");
             return oldGameState;
        }
        let newGameState = JSON.parse(JSON.stringify(oldGameState)); // Deep copy is crucial
        let { boardState, whiteCaptured, blackCaptured, isWhiteTurn } = newGameState;
        const color = isWhiteTurn ? 'white' : 'black';
        let pieceMovedOriginal = null; // Store original piece info before mutation
        let wasCapture = false;

        // Apply the move
        if (moveObj.type === 'drop') {
            const droppedPiece = { type: moveObj.piece.type, color: color };
             if(!boardState[moveObj.to.y]){ console.error("Invalid 'to.y' in drop:", moveObj); return oldGameState;}
            boardState[moveObj.to.y][moveObj.to.x] = droppedPiece;
            const hand = isWhiteTurn ? whiteCaptured : blackCaptured;
            const pieceIndex = hand.findIndex(p => p.type === moveObj.piece.type);
            if (pieceIndex > -1) {
                 hand.splice(pieceIndex, 1);
            } else {
                 console.warn("ApplyMove: Drop piece type not found in hand", moveObj, hand);
                 // Proceed anyway for replay robustness, but log warning
            }
            pieceMovedOriginal = droppedPiece;
            newGameState.lastMove = { from: null, to: moveObj.to };

        } else if (moveObj.type === 'board') {
            const piece = boardState[moveObj.from.y]?.[moveObj.from.x];
            if (!piece) {
                 console.error("ApplyMove: Piece not found at source", moveObj);
                 return oldGameState;
            }
            pieceMovedOriginal = {...piece}; // Clone piece info *before* potential promotion

            const targetPiece = boardState[moveObj.to.y]?.[moveObj.to.x];
            wasCapture = targetPiece !== null;

            if (targetPiece) {
                if (targetPiece.type !== 'lupa' && targetPiece.type !== 'prince') {
                    const hand = isWhiteTurn ? whiteCaptured : blackCaptured;
                     let capturedType = targetPiece.type;
                     // Handle Neptune -> Mermaid capture specifically
                     if (targetPiece.type === 'neptune') {
                          capturedType = 'mermaid';
                          // Mermaid goes back to original owner's hand, but client just needs type
                     }
                    if (hand.length < 6) {
                         hand.push({ type: capturedType }); // Client only needs type for display
                    }
                }
            }

            const movingPieceObject = boardState[moveObj.from.y][moveObj.from.x];
            boardState[moveObj.to.y][moveObj.to.x] = movingPieceObject;
            boardState[moveObj.from.y][moveObj.from.x] = null;
            newGameState.lastMove = { from: moveObj.from, to: moveObj.to };

            // Handle promotions *after* move
             const pieceNowAtTarget = boardState[moveObj.to.y]?.[moveObj.to.x];
             if (pieceNowAtTarget) {
                 handlePromotion(pieceNowAtTarget, moveObj.to.y, wasCapture); // Mutates piece
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
        if (pieceMovedOriginal && !isBonusContinuation) { // Check on first move only
            const isCopeBonusTrigger = pieceMovedOriginal.type === 'cope' && wasCapture;
            const isGHGBonusTrigger = (pieceMovedOriginal.type === 'greathorsegeneral' || pieceMovedOriginal.type === 'cthulhu') && !wasCapture && moveObj.type === 'board';
            triggersBonus = isCopeBonusTrigger || isGHGBonusTrigger;
        }

        if (triggersBonus) {
            newGameState.bonusMoveInfo = { pieceX: moveObj.to.x, pieceY: moveObj.to.y };
            newGameState.isWhiteTurn = oldGameState.isWhiteTurn; // Turn does NOT change yet
             // turnCount doesn't increment yet
        } else if (isBonusContinuation) {
            newGameState.bonusMoveInfo = null; // Bonus finished
            newGameState.isWhiteTurn = !oldGameState.isWhiteTurn; // Turn changes AFTER bonus
            newGameState.turnCount++; // Increment turn count AFTER bonus
        } else {
            newGameState.bonusMoveInfo = null; // Normal move
            newGameState.isWhiteTurn = !oldGameState.isWhiteTurn; // Turn changes
            newGameState.turnCount++; // Increment turn count
        }

        newGameState.gameOver = false; // Reset game over status for branching
        newGameState.winner = null;
        newGameState.reason = null;

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
                isWhiteTurn: true, turnCount: 0, gameOver: false, lastMove: null, bonusMoveInfo: null
            },
            parent: null, children: [], isBonusSecondMove: false
        };

        let currentNode = rootNode;

        for (let i = 0; i < moveNotations.length; i++) {
            const notation = moveNotations[i];
            const currentGameState = currentNode.gameState; // State *before* this move
            const moveObj = parseNotation(notation, currentGameState.boardState, currentGameState.isWhiteTurn);

            if (!moveObj) {
                console.error(`Failed to parse move: "${notation}" (move index ${i}). Stopping tree build.`);
                alert(`Error parsing move "${notation}" (approx move ${Math.floor(i/2)+1}). Replay might be incomplete or incorrect.`);
                break; // Stop building if parsing fails
            }

            const newGameState = applyMoveToState(currentGameState, moveObj);

            // Basic check if state actually changed
            if (JSON.stringify(newGameState.boardState) === JSON.stringify(currentGameState.boardState) &&
                JSON.stringify(newGameState.whiteCaptured) === JSON.stringify(currentGameState.whiteCaptured) &&
                JSON.stringify(newGameState.blackCaptured) === JSON.stringify(currentGameState.blackCaptured)) {
                 console.error(`Applying move "${notation}" did not change game state. Stopping build.`, {oldState: currentGameState, move: moveObj, newState: newGameState});
                 alert(`Error applying move "${notation}" (approx move ${Math.floor(i/2)+1}). State did not change. Replay might be incomplete or incorrect.`);
                 break; // Stop if move application seems faulty
            }

            const newNode = {
                moveNotation: notation, moveObj: moveObj, gameState: newGameState,
                parent: currentNode, children: [],
                // Mark if this node represents the state *after* a bonus move was completed
                isBonusSecondMove: !!currentGameState.bonusMoveInfo && !newGameState.bonusMoveInfo
            };

            currentNode.children.push(newNode);
            currentNode = newNode; // Move to the newly created node for the next iteration
        }

        // Build flatMoveList AFTER the tree is constructed
        flatMoveList = [rootNode];
        let node = rootNode;
        while(node.children.length > 0) {
             node = node.children[0]; // Always follow the first child
             flatMoveList.push(node);
        }
        console.log("Built tree, main line length:", flatMoveList.length);

        return rootNode;
    }

    // --- Updated Move History Renderer ---
    function renderReplayMoveHistory() {
    if (!moveHistoryElement) return;
    moveHistoryElement.innerHTML = ''; // Clear previous history

    // Recursive function to render a node and its main continuation + branches
    function renderNodeRecursive(node, container, depth) {
        // Skip root node itself in display
        if (!node || node === replayGameTree) {
             if(node && node.children.length > 0){
                // Render all top-level moves (children of root) directly into the main container
                node.children.forEach((child, index) => {
                     renderNodeRecursive(child, container, 0); // Start all at depth 0
                });
             }
            return;
        }

        const moveWrapper = document.createElement('div'); // Wrapper for this move line
        moveWrapper.classList.add('move-wrapper');
        moveWrapper.style.marginLeft = `${depth * 20}px`; // Apply indentation based on depth

        const moveEl = document.createElement('span'); // Use span for the clickable text
        moveEl.classList.add('move-node');

        let moveText = node.moveNotation;
        const stateBefore = node.parent.gameState;
        const turnNum = Math.floor(stateBefore.turnCount / 2) + 1;
        const wasWhiteMove = stateBefore.isWhiteTurn;

        // --- Handle Bonus Move Display ---
        if (node.isBonusSecondMove) {
            // If it's the second part, just show the notation indented slightly more
            moveText = `> ${moveText}`;
             moveWrapper.style.marginLeft = `${parseInt(moveWrapper.style.marginLeft || '0', 10) + 10}px`; // Extra indent for bonus part
            // No turn number/ellipsis needed
        } else if (wasWhiteMove) {
            moveText = `${turnNum}. ${moveText}`;
        } else {
            moveText = `... ${moveText}`;
        }

         // Add parenthesis for the start of a branch variation line
         const isBranchStart = node.parent && node.parent !== replayGameTree && node.parent.children[0] !== node;
         if (isBranchStart && !node.isBonusSecondMove) {
              moveText = `( ${moveText}`;
         }


        moveEl.textContent = moveText + " "; // Add space

        if (node === currentReplayNode) {
            moveEl.classList.add('active-move');
            setTimeout(() => {
                if (node === currentReplayNode) {
                    moveWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, 50);
        }

        moveEl.addEventListener('click', (e) => {
            e.stopPropagation();
            displayReplayState(node);
        });

        moveWrapper.appendChild(moveEl);
        container.appendChild(moveWrapper); // Add this move line to the parent container

        // --- Render Children ---
        if (node.children.length > 0) {
            // Render the first child (main continuation) recursively into the *same container*
            renderNodeRecursive(node.children[0], container, depth); // Continues at same depth

            // Render other children (branches) into the *same container*, increasing depth
            for (let i = 1; i < node.children.length; i++) {
                renderNodeRecursive(node.children[i], container, depth + 1); // Branches increase depth
            }
        } else if (isBranchStart && !node.isBonusSecondMove){
             // If this was the start of a branch and has no children, add closing paren
             // This is tricky, might need adjustment based on bonus moves
             // moveEl.textContent += " )"; // Simplistic closing paren
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
                clearHighlights(); selectedSquare = null; awaitingBonusMove = null; // Clear state
                // Maybe try to recover by clearing bonusMoveInfo?
                 currentReplayNode.gameState.bonusMoveInfo = null;
                 updateTurnIndicator(); // Refresh display
                return;
            }
            // Ensure correct piece is selected
            if (!selectedSquare || selectedSquare.x !== bonusPieceX || selectedSquare.y !== bonusPieceY) {
                 selectedSquare = { x: bonusPieceX, y: bonusPieceY }; // Auto-select
                 isDroppingPiece = null;
                 const validBonusMoves = gameLogic.getValidMovesForPiece(piece, bonusPieceX, bonusPieceY, currentGameState.boardState, true).filter(m => !m.isAttack);
                 clearHighlights();
                 drawHighlights(validBonusMoves);
                 const bonusSquareEl = document.querySelector(`[data-logical-x='${bonusPieceX}'][data-logical-y='${bonusPieceY}']`);
                 if(bonusSquareEl) bonusSquareEl.classList.add('selected');
                 console.log("Auto-selected piece for required bonus move.");
                 return; // Wait for click on target
            }

            // Correct piece is selected, check if target is valid bonus move
            const validBonusMoves = gameLogic.getValidMovesForPiece(piece, bonusPieceX, bonusPieceY, currentGameState.boardState, true).filter(m => !m.isAttack);
            const isValidBonusTarget = validBonusMoves.some(m => m.x === x && m.y === y);

            if (isValidBonusTarget) {
                const moveObj = { type: 'board', from: { x: bonusPieceX, y: bonusPieceY }, to: { x, y } };
                const nextGameState = applyMoveToState(currentGameState, moveObj);
                const notationString = generateServerNotation(piece, { x, y }, false, false); // Bonus = non-capture

                const newNode = {
                    moveNotation: notationString, moveObj: moveObj, gameState: nextGameState,
                    parent: currentReplayNode, children: [], isBonusSecondMove: true
                };

                currentReplayNode.children.push(newNode); // Add as child
                awaitingBonusMove = null; // Bonus complete
                selectedSquare = null;
                isDroppingPiece = null;
                clearHighlights();
                displayReplayState(newNode); // Display state *after* bonus move
            } else {
                console.log("Invalid target for bonus move.");
                // Keep piece selected, redraw highlights
                clearHighlights();
                drawHighlights(validBonusMoves);
                const bonusSquareEl = document.querySelector(`[data-logical-x='${bonusPieceX}'][data-logical-y='${bonusPieceY}']`);
                if(bonusSquareEl) bonusSquareEl.classList.add('selected');
            }
            return; // End processing for this click
        }

        // --- Standard move/selection logic (if NOT awaiting bonus) ---
        if (selectedSquare && (selectedSquare.x !== x || selectedSquare.y !== y)) {
            const from = selectedSquare;
            const to = { x, y };
            const piece = currentGameState.boardState[from.y]?.[from.x];

            if (!piece) { clearHighlights(); selectedSquare = null; return; }

            const validMoves = gameLogic.getValidMovesForPiece(piece, from.x, from.y, currentGameState.boardState, false);
            const targetMove = validMoves.find(m => m.x === to.x && m.y === to.y);

            if (targetMove) {
                const wasCapture = targetMove.isAttack;
                const moveObj = { type: 'board', from, to };
                const nextGameState = applyMoveToState(currentGameState, moveObj);
                const notationString = generateServerNotation(piece, to, wasCapture, false);

                const newNode = {
                    moveNotation: notationString, moveObj: moveObj, gameState: nextGameState,
                    parent: currentReplayNode, children: [], isBonusSecondMove: false
                };

                currentReplayNode.children.push(newNode); // Add branch

                if (nextGameState.bonusMoveInfo) {
                    // Bonus triggered by this move
                    awaitingBonusMove = { from: to, pieceType: piece.type }; // Track for next click
                    selectedSquare = { x: to.x, y: to.y }; // Keep piece selected
                    displayReplayState(newNode); // Show state after first move, triggers bonus highlighting in displayReplayState
                } else {
                    // Normal move completed
                    awaitingBonusMove = null;
                    selectedSquare = null;
                    isDroppingPiece = null;
                    clearHighlights();
                    displayReplayState(newNode); // Show state after normal move
                }
            } else {
                clearHighlights();
                selectedSquare = null; // Deselect if invalid target clicked
            }
            return;
        }

        if (isDroppingPiece) {
            const to = { x, y };
            const moveObj = { type: 'drop', piece: { type: isDroppingPiece.type }, to }; // Use type from pieceData

            if (currentGameState.boardState[to.y]?.[to.x] === null && gameLogic.isPositionValid(to.x, to.y)) {
                const nextGameState = applyMoveToState(currentGameState, moveObj);
                const notationString = generateServerNotation({ type: isDroppingPiece.type }, to, false, true);

                const newNode = {
                    moveNotation: notationString, moveObj: moveObj, gameState: nextGameState,
                    parent: currentReplayNode, children: [], isBonusSecondMove: false
                };

                currentReplayNode.children.push(newNode); // Add branch

                awaitingBonusMove = null; // Drops don't trigger bonus
                selectedSquare = null;
                isDroppingPiece = null;
                clearHighlights();
                displayReplayState(newNode);

            } else {
                clearHighlights();
                isDroppingPiece = null; // Deselect invalid drop
            }
            return;
        }

        // --- Standard piece selection ---
        const piece = currentGameState.boardState[y]?.[x];
        if (piece) {
            const canSelectPiece = piece.color === (currentGameState.isWhiteTurn ? 'white' : 'black');
            if (canSelectPiece) {
                if (selectedSquare && selectedSquare.x === x && selectedSquare.y === y) {
                    selectedSquare = null; // Deselect
                    clearHighlights();
                } else {
                    selectedSquare = { x, y }; // Select
                    isDroppingPiece = null;
                    const validMoves = gameLogic.getValidMovesForPiece(piece, x, y, currentGameState.boardState, false);
                    clearHighlights();
                    drawHighlights(validMoves);
                    const selSquareEl = document.querySelector(`[data-logical-x='${x}'][data-logical-y='${y}']`);
                    if(selSquareEl) selSquareEl.classList.add('selected');
                }
            } else { // Clicked opponent piece
                 selectedSquare = null; isDroppingPiece = null; clearHighlights();
            }
        } else { // Clicked empty square
            selectedSquare = null;
            isDroppingPiece = null;
            clearHighlights();
        }
    }

    // --- Updated handleReplayCapturedClick ---
    function handleReplayCapturedClick(pieceData, handColor, clickedElement) { // pieceData only has {type}
        if (!currentReplayNode) return;
        const currentGameState = currentReplayNode.gameState;

        if (currentGameState.bonusMoveInfo) {
             console.log("Cannot select captured piece while bonus move is pending.");
             return;
        }

        const activeColor = currentGameState.isWhiteTurn ? 'white' : 'black';
        if (handColor !== activeColor) return;

        if (pieceData.type === 'lupa' || pieceData.type === 'prince') return;

        if (isDroppingPiece && isDroppingPiece.type === pieceData.type) {
            isDroppingPiece = null;
            selectedSquare = null;
            clearHighlights();
            clickedElement.classList.remove('selected-drop');
            return;
        }

        selectedSquare = null;
        isDroppingPiece = { type: pieceData.type }; // Store just the type
        clearHighlights();
        clickedElement.classList.add('selected-drop');
        highlightDropSquares(); // Uses global gameState set by displayReplayState
    }

    // --- Updated Display Replay State ---
    function displayReplayState(node) {
        if (!node) return;
        currentReplayNode = node;

        let displayMoveNum = 0;
        let tempNode = node;
        while (tempNode && tempNode.parent) { // Traverse up to root
            if (!tempNode.isBonusSecondMove) {
                displayMoveNum++; // Count non-bonus-second moves as steps
            }
            tempNode = tempNode.parent;
        }

        gameState = node.gameState; // Set global state for renderers

        renderBoard();
        renderCaptured();
        updateTurnIndicator();
        renderReplayMoveHistory(); // Render the tree

        // Update controls
        let totalMainMoves = flatMoveList.length - 1; // Total moves in original game
         // Adjust total count display to reflect full turns (pairs of moves) roughly
         let displayTotal = 0;
         flatMoveList.forEach(n => { if (n !== replayGameTree && !n.isBonusSecondMove) displayTotal++; });
        replayMoveNumber.textContent = `${displayMoveNum} / ${displayTotal}`;


        replayFirstBtn.disabled = (node === replayGameTree); // Disable if at root
        replayPrevBtn.disabled = (!node.parent); // Disable if no parent

        // Next button enabled if children exist OR if bonus is pending
        replayNextBtn.disabled = node.children.length === 0 && !gameState.bonusMoveInfo;

        replayLastBtn.disabled = (flatMoveList.length <= 1 || node === flatMoveList[flatMoveList.length - 1]);

        // Clear bonus requirement *unless* we are displaying the state that requires it
        if (!gameState.bonusMoveInfo) {
            awaitingBonusMove = null;
        }

        // Manage highlights based on bonus state
         if (gameState.bonusMoveInfo) {
             // Bonus is pending, force selection and highlight bonus moves
             selectedSquare = { x: gameState.bonusMoveInfo.pieceX, y: gameState.bonusMoveInfo.pieceY };
             isDroppingPiece = null;
             const bonusPiece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
             if (bonusPiece) {
                 const validBonusMoves = gameLogic.getValidMovesForPiece(bonusPiece, selectedSquare.x, selectedSquare.y, gameState.boardState, true).filter(m => !m.isAttack);
                 clearHighlights();
                 drawHighlights(validBonusMoves);
                 const bonusSquareEl = document.querySelector(`[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`);
                 if (bonusSquareEl) bonusSquareEl.classList.add('selected');
             } else {
                  console.error("Bonus pending but piece missing!"); clearHighlights(); selectedSquare = null; awaitingBonusMove = null;
             }
         } else if (selectedSquare || isDroppingPiece) {
              // If navigating and a selection was active (but not bonus), clear it
              selectedSquare = null;
              isDroppingPiece = null;
              clearHighlights();
         }
    }


    // --- handlePromotion Helper (Add if not already present from gamelogic) ---
    // Make sure this is available in the script's scope if not imported
    function handlePromotion(piece, y, wasCapture) {
         if(!piece) return; // Safety check
         const color = piece.color;
         const originalType = piece.type; // Remember original type

         if (piece.type === 'prince') return;

         if (piece.type === 'greathorsegeneral' && wasCapture) {
             piece.type = 'cthulhu';
         } else if (piece.type === 'mermaid' && wasCapture) {
             piece.type = 'neptune';
         } else if (piece.type === 'fin' && wasCapture) {
             piece.type = 'finor';
         } else {
             const promotablePawns = ['sult', 'pawn', 'pilut'];
             if (promotablePawns.includes(piece.type)) {
                 const inPromotionZone = (color === 'white' && y > 8) || (color === 'black' && y < 7);
                 if (inPromotionZone) {
                     if (piece.type === 'pilut') piece.type = 'greatshield';
                     else piece.type = 'chair'; // Sult and Pawn promote to Chair
                 }
             }
         }
         // Log if promotion happened
         // if(piece.type !== originalType) console.log(`Promoted ${color} ${originalType} to ${piece.type}`);
     }


}); // End DOMContentLoaded