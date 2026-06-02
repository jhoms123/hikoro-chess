document.addEventListener('DOMContentLoaded', () => {

    const productionUrl = 'https://HikoroChess.org';
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const serverUrl = isLocal ? 'http://localhost:3000' : window.location.origin;

    const socket = io(serverUrl);

    const HIKORO_BOARD_WIDTH = 10;
    const HIKORO_BOARD_HEIGHT = 16;

    // --- DOM Elements ---
    const lobbyElement = document.getElementById('lobby');
    const createGameBtn = document.getElementById('create-game-btn');
    const gameListElement = document.getElementById('game-list');
    const singlePlayerBtn = document.getElementById('single-player-btn');
    const gameTypeSelect = document.getElementById('game-type-select');

    // --- Game Wrappers ---
    const hikoroGameWrapper = document.getElementById('hikoro-game-wrapper');
    const hikoroBoardElement = document.getElementById('game-board');

    // --- Shared UI Elements ---
    const turnIndicatorContainer = document.getElementById('turn-indicator-container');
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
    let isReplayMode = false;

    // --- State variables for Hikoro ---
    let selectedSquare = null;
    let isDroppingPiece = null;

    const sanctuarySquares = [
        {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
        {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
    ];

    const whitePalace = { minY: 0, maxY: 1, minX: 3, maxX: 6 };
    const blackPalace = { minY: 14, maxY: 15, minX: 3, maxX: 6 };

    if (gameTypeSelect) {
        gameTypeSelect.addEventListener('change', () => {
            const gameType = gameTypeSelect.value;
            const sdsPlayerCountContainer = document.getElementById('sds-player-count-container');
            
            if (gameType === 'shodansho') {
                if (startReplayBtn) {
                    startReplayBtn.disabled = true;
                    startReplayBtn.title = "Replay is not available for Sho Dan Sho";
                }
                if (kifuPasteArea) kifuPasteArea.disabled = true;
                if (sdsPlayerCountContainer) sdsPlayerCountContainer.style.display = 'flex';
            } else {
                if (startReplayBtn) {
                    startReplayBtn.disabled = false;
                    startReplayBtn.title = "";
                }
                if (kifuPasteArea) kifuPasteArea.disabled = false;
                if (sdsPlayerCountContainer) sdsPlayerCountContainer.style.display = 'none';
            }
        });
        
        // Trigger right away to set correct default state on page load
        setTimeout(() => gameTypeSelect.dispatchEvent(new Event('change')), 10);
    }

    createGameBtn.addEventListener('click', () => {
        const playerName = document.getElementById('player-name').value.trim() || 'Anonymous';
        const mainTime = parseInt(document.getElementById('time-control').value, 10);
        let byoyomiTime = parseInt(document.getElementById('byoyomi-control').value, 10);
        const gameType = gameTypeSelect ? gameTypeSelect.value : 'hikoro';
        
        const sdsPlayerCountEl = document.getElementById('sds-player-count');
        const sdsPlayerCount = sdsPlayerCountEl ? parseInt(sdsPlayerCountEl.value, 10) : 2;

        if (mainTime === 0 && byoyomiTime === 0) byoyomiTime = 15;
        const timeControl = {
            main: mainTime,
            byoyomiTime: mainTime === -1 ? 0 : byoyomiTime,
            byoyomiPeriods: mainTime === -1 ? 0 : (byoyomiTime > 0 ? 999 : 0)
        };

        const dataToSend = { playerName, timeControl, gameType, sdsPlayerCount };
        socket.emit('createGame', dataToSend);
    });

    singlePlayerBtn.addEventListener('click', () => {
        isSinglePlayer = true;
        const gameType = gameTypeSelect ? gameTypeSelect.value : 'hikoro';
        const sdsPlayerCountEl = document.getElementById('sds-player-count');
        const sdsPlayerCount = sdsPlayerCountEl ? parseInt(sdsPlayerCountEl.value, 10) : 2;
        socket.emit('createSinglePlayerGame', { gameType, sdsPlayerCount });
    });

    socket.on('lobbyUpdate', updateLobby);
    socket.on('gameCreated', onGameCreated);
    socket.on('gameStart', onGameStart);
    socket.on('gameStateUpdate', updateLocalState);
    socket.on('timeUpdate', updateTimerDisplay);
    socket.on('validMoves', drawHikoroHighlights); 
    socket.on('errorMsg', (message) => alert(message));
    socket.on('connect_error', (err) => {
        console.error("Connection failed:", err.message);
        alert("Failed to connect to the server. Check the developer console (F12) for more info.");
    });

    rulesBtnIngame.addEventListener('click', () => {
        populateHikoroRules();
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
            if (isSinglePlayer) {
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
                alert("Error: Hikoro game logic failed to load. Cannot start replay.");
                return;
            }

            replayGameTree = null;
            currentReplayNode = null;
            flatMoveList = [];
            currentMoveIndex = -1;
            awaitingBonusMove = null;
            selectedSquare = null;
            isDroppingPiece = null;
            clearHikoroHighlights();

            replayGameTree = buildReplayTree(kifuText); 
            if (!replayGameTree) {
                 alert("Failed to build replay tree from Kifu.");
                 return; 
            }

            currentReplayNode = replayGameTree; 
            isReplayMode = true;
            isSinglePlayer = false; 

            lobbyElement.style.display = 'none';
            hikoroGameWrapper.style.display = 'flex';
            turnIndicatorContainer.style.display = 'block';

            gameControls.style.display = 'flex'; 
            replayControls.style.display = 'flex'; 
            postGameControls.style.display = 'none'; 

            myColor = 'white'; 
            renderHikoroNotationMarkers();
            displayReplayState(currentReplayNode); 
        });
    }

    replayFirstBtn.addEventListener('click', () => {
        if (!isReplayMode || !replayGameTree) return;
        displayReplayState(replayGameTree); 
    });

    replayPrevBtn.addEventListener('click', () => {
        if (!isReplayMode || !currentReplayNode || !currentReplayNode.parent) return;
        displayReplayState(currentReplayNode.parent);
    });

    replayNextBtn.addEventListener('click', () => {
        if (!isReplayMode || !currentReplayNode) return;
        if (currentReplayNode.gameState.bonusMoveInfo) {
            console.log("Next button disabled: Bonus move required.");
            return;
        }
        if (currentReplayNode.children.length > 0) {
            displayReplayState(currentReplayNode.children[0]);
        }
    });

    replayLastBtn.addEventListener('click', () => {
        if (!isReplayMode || flatMoveList.length < 1) return;
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
        if (seconds === -1) return "∞";
        if (inByoyomi) return `B: ${Math.ceil(seconds)}s`;
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const paddedSecs = secs < 10 ? `0${secs}` : secs;
        const paddedMins = mins < 10 ? `0${mins}` : mins;
        return `${paddedMins}:${paddedSecs}`;
    }

    function updateTimerDisplay(times) {
        const whiteTimerEl_Hikoro = document.getElementById('white-time-hikoro');
        const blackTimerEl_Hikoro = document.getElementById('black-time-hikoro');

        if (!whiteTimerEl_Hikoro || !blackTimerEl_Hikoro) return;

        if (isReplayMode) {
             whiteTimerEl_Hikoro.style.display = 'none';
             blackTimerEl_Hikoro.style.display = 'none';
             return;
        } else {
             whiteTimerEl_Hikoro.style.display = 'inline-block';
             blackTimerEl_Hikoro.style.display = 'inline-block';
        }

        if (!gameState.timeControl) return;

        const { whiteTime, blackTime, isInByoyomiWhite, isInByoyomiBlack } = times;
        whiteTimerEl_Hikoro.textContent = formatTime(whiteTime, 0, isInByoyomiWhite);
        blackTimerEl_Hikoro.textContent = formatTime(blackTime, 0, isInByoyomiBlack);

        if (gameState.gameOver) {
            whiteTimerEl_Hikoro.classList.remove('active');
            blackTimerEl_Hikoro.classList.remove('active');
            return;
        }

        if (gameState.isWhiteTurn) {
            whiteTimerEl_Hikoro.classList.add('active');
            blackTimerEl_Hikoro.classList.remove('active');
        } else {
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
            const gameTypeStr = game.gameType === 'shodansho' ? `Sho Dan Sho (${game.currentPlayers || 1}/${game.maxPlayers || 2})` : "Hikoro Chess";

            infoSpan.textContent = `${creatorName}'s Game [${gameTypeStr}] [${timeString}]`; 
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
        isReplayMode = false;

        lobbyElement.style.display = 'none';
        turnIndicatorContainer.style.display = 'block';
        turnIndicator.textContent = "Waiting for opponents...";
        gameControls.style.display = 'flex';
        replayControls.style.display = 'none';
        postGameControls.style.display = 'none';
    }

    function onGameStart(initialGameState) {
        // Safe navigation directly to the Sho Dan Sho canvas environment
        if (initialGameState.gameType === 'shodansho') {
            const myIndex = initialGameState.players.indexOf(socket.id); // Valid index for SP or Online
            const pQuery = myIndex !== -1 ? `&p=${myIndex}` : '';
            window.location.href = `/shodansho.html?gameId=${initialGameState.id}${pQuery}&players=${initialGameState.maxPlayers}`;
            return;
        }

        gameId = initialGameState.id;
        gameState = initialGameState; 
        isReplayMode = false;
        isSinglePlayer = initialGameState.isSinglePlayer;

        if (isSinglePlayer) {
            myColor = 'white'; 
        } else {
            if (!myColor) myColor = 'black'; 
        }

        lobbyElement.style.display = 'none';
        turnIndicatorContainer.style.display = 'block';
        gameControls.style.display = 'flex';
        replayControls.style.display = 'none';
        postGameControls.style.display = 'none';

        hikoroGameWrapper.style.display = 'flex';
        renderHikoroNotationMarkers(); 
        updateLocalState(initialGameState); 
    }

    function updateLocalState(newGameState) {
        const isNewGameOver = newGameState.gameOver && !gameState.gameOver;
        gameState = newGameState; 

        if (isNewGameOver && newGameState.winner) {
            const winnerTextEl = document.getElementById('winnerText');
            if (winnerTextEl) {
                const winnerName = newGameState.winner === 'draw' ? 'Draw' : newGameState.winner.charAt(0).toUpperCase() + newGameState.winner.slice(1);
                winnerTextEl.textContent = newGameState.winner === 'draw' ? 'Draw!' : `${winnerName} Wins!`;
                if (newGameState.reason) {
                    winnerTextEl.textContent += ` (${newGameState.reason})`;
                }
            }
            if (postGameControls) {
                postGameControls.style.display = 'flex';
            }
        }

        renderHikoroBoard();
        renderHikoroCaptured();
        renderMoveHistory(gameState.moveList);

        if (newGameState.gameOver) {
            hikoroBoardElement.style.pointerEvents = 'none'; 
        } else {
            hikoroBoardElement.style.pointerEvents = 'auto'; 
        }

        updateTurnIndicator(); 
    }

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

    function renderHikoroBoard() {
        hikoroBoardElement.innerHTML = ''; 
        if (!gameState || !Array.isArray(gameState.boardState) || gameState.boardState.length === 0) {
            return;
        }

        for (let y = 0; y < HIKORO_BOARD_HEIGHT; y++) {
            for (let x = 0; x < HIKORO_BOARD_WIDTH; x++) {
                const square = document.createElement('div');
                square.classList.add('square');

                let displayX = x, displayY = y;
                if (myColor === 'white' || isSinglePlayer || isReplayMode) {
                    displayY = HIKORO_BOARD_HEIGHT - 1 - y;
                } else if (myColor === 'black') {
                    displayX = HIKORO_BOARD_WIDTH - 1 - x;
                }

                square.dataset.logicalX = x; 
                square.dataset.logicalY = y;
                square.style.gridRowStart = displayY + 1;    
                square.style.gridColumnStart = displayX + 1; 

                if (gameState.lastMove) {
                    if (gameState.lastMove.from && x === gameState.lastMove.from.x && y === gameState.lastMove.from.y) {
                        square.classList.add('last-move-from');
                    }
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
                hikoroBoardElement.appendChild(square); 
            }
        }
         if (isReplayMode && currentReplayNode?.gameState?.bonusMoveInfo && selectedSquare) {
             const bonusPiece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
             if (bonusPiece) {
                 const validBonusMoves = gameLogic.getValidMovesForPiece(bonusPiece, selectedSquare.x, selectedSquare.y, gameState.boardState, true).filter(m => !m.isAttack);
                 drawHikoroHighlights(validBonusMoves); 
                 const selSquareEl = document.querySelector(`#game-board .square[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`);
                if(selSquareEl) selSquareEl.classList.add('selected'); 
             }
         } else if (selectedSquare || isDroppingPiece) {
              if (selectedSquare) {
                  const piece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
                  if (piece) {
                       const bonusActive = !!gameState.bonusMoveInfo && gameState.bonusMoveInfo.pieceX === selectedSquare.x && gameState.bonusMoveInfo.pieceY === selectedSquare.y;
                       const validMoves = gameLogic.getValidMovesForPiece(piece, selectedSquare.x, selectedSquare.y, gameState.boardState, bonusActive);
                       drawHikoroHighlights(validMoves);
                  }
              } else if (isDroppingPiece) {
                  highlightHikoroDropSquares();
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

        const bottomHandEl = document.querySelector(isBottomHandWhite ? '#white-captured' : '#black-captured');
        const topHandEl = document.querySelector(isBottomHandWhite ? '#black-captured' : '#white-captured');
        const bottomLabelEl = document.querySelector(isBottomHandWhite ? '#white-captured-area .hand-label' : '#black-captured-area .hand-label');
        const topLabelEl = document.querySelector(isBottomHandWhite ? '#black-captured-area .hand-label' : '#white-captured-area .hand-label');

        if (!bottomHandEl || !topHandEl || !bottomLabelEl || !topLabelEl) return;

        if (isSinglePlayer || isReplayMode) {
             bottomLabelEl.textContent = "White's Hand";
             topLabelEl.textContent = "Black's Hand";
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
            spriteImg.src = `sprites/${spriteType}_${handColor}.png`;
            spriteImg.alt = `${handColor} ${spriteType}`;

            pieceElement.appendChild(spriteImg);
            el.appendChild(pieceElement);

            if (isClickable) {
                el.addEventListener('click', (event) => onCapturedClick(pieceData, handColor, event.currentTarget));
            }
            return el;
        };

        const bottomHandColor = isBottomHandWhite ? 'white' : 'black';
        const topHandColor = isBottomHandWhite ? 'black' : 'white';

        const isBottomHandClickable = (!isReplayMode && 
                                      ((isSinglePlayer && gameState.isWhiteTurn === isBottomHandWhite) || 
                                       (!isSinglePlayer && myColor === bottomHandColor && gameState.isWhiteTurn === (myColor === 'white')))); 

        const isTopHandClickable = (!isReplayMode && 
                                    ((isSinglePlayer && gameState.isWhiteTurn !== isBottomHandWhite) || 
                                    (!isSinglePlayer && myColor === topHandColor && gameState.isWhiteTurn === (myColor === 'white')))); 

          const groupPieces = (pieces) => {
               const counts = {};
               pieces.forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });
               return Object.entries(counts).sort(([typeA], [typeB]) => typeA.localeCompare(typeB));
           };

           groupPieces(bottomHandPieces).forEach(([type, count]) => {
               const pieceData = { type }; 
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

    function updateTurnIndicator() {
        if (!turnIndicator || !winnerText) return;

        if (gameState.gameOver && !isReplayMode) {
            turnIndicator.textContent = ''; 
            if (!winnerText.textContent || winnerText.textContent.includes("Turn")) {
                const winnerName = gameState.winner === 'draw' ? 'Draw' : gameState.winner.charAt(0).toUpperCase() + gameState.winner.slice(1);
                winnerText.textContent = gameState.winner === 'draw' ? 'Draw!' : `${winnerName} Wins!`;
                if (gameState.reason) {
                    winnerText.textContent += ` (${gameState.reason})`;
                }
            }
        } else {
            winnerText.textContent = ''; 
            if (isReplayMode) {
                turnIndicator.textContent = currentReplayNode?.gameState?.isWhiteTurn ? "White's Turn" : "Black's Turn";
            } else if (isSinglePlayer) {
                 turnIndicator.textContent = gameState.isWhiteTurn ? "White's Turn" : "Black's Turn";
            } else {
                const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
                turnIndicator.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
            }
        }
    }

    function animateHikoroMove(from, to, pieceImgSrc) {
        const fromSquareEl = document.querySelector(`#game-board .square[data-logical-x='${from.x}'][data-logical-y='${from.y}']`);
        const toSquareEl = document.querySelector(`#game-board .square[data-logical-x='${to.x}'][data-logical-y='${to.y}']`);

        if (!fromSquareEl || !toSquareEl || !hikoroBoardElement) return;

        const boardRect = hikoroBoardElement.getBoundingClientRect();
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

        hikoroBoardElement.appendChild(clone); 
        void clone.offsetWidth; 

        clone.style.top = `${toTop}px`;
        clone.style.left = `${toLeft}px`;

        setTimeout(() => {
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

        hikoroBoardElement.appendChild(clone);
        void clone.offsetWidth; 

        clone.style.top = `${toTop}px`;
        clone.style.opacity = '1';

        setTimeout(() => {
             if (clone.parentNode === hikoroBoardElement) {
                clone.remove();
            }
        }, ANIMATION_DURATION);
    }

    function clearHikoroHighlights() {
        document.querySelectorAll('#game-board .square.selected, #game-board .square.preview-selected').forEach(s => {
            s.classList.remove('selected', 'preview-selected');
        });
        document.querySelectorAll('#game-board .move-plate').forEach(p => p.remove());
         document.querySelectorAll('.captured-piece.selected-drop').forEach(p => p.classList.remove('selected-drop'));
    }

    function drawHikoroHighlights(moves) {
        clearHikoroHighlights(); 

        const elementToHighlight = selectedSquare
            ? document.querySelector(`#game-board .square[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`)
            : document.querySelector('.captured-piece.selected-drop'); 

        if (!selectedSquare && !isDroppingPiece) return;

        const isPlayerTurn = (isReplayMode) || 
                             (isSinglePlayer) || 
                             (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn))); 

         if (selectedSquare && elementToHighlight) {
             elementToHighlight.classList.add(isPlayerTurn ? 'selected' : 'preview-selected');
         }

         const bonusInfo = isReplayMode ? currentReplayNode?.gameState?.bonusMoveInfo : gameState.bonusMoveInfo;
         let movesToDraw = moves;
         if (bonusInfo && selectedSquare && (selectedSquare.x === bonusInfo.pieceX && selectedSquare.y === bonusInfo.pieceY)) {
             movesToDraw = moves.filter(move => !move.isAttack);
         } else if (bonusInfo && (!selectedSquare || selectedSquare.x !== bonusInfo.pieceX || selectedSquare.y !== bonusInfo.pieceY)) {
              movesToDraw = [];
         }

        movesToDraw.forEach(move => {
            const moveSquare = document.querySelector(`#game-board .square[data-logical-x='${move.x}'][data-logical-y='${move.y}']`);
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

    function highlightHikoroDropSquares() {
        document.querySelectorAll('#game-board .square.selected, #game-board .square.preview-selected').forEach(s => {
            s.classList.remove('selected', 'preview-selected');
        });
        document.querySelectorAll('#game-board .move-plate').forEach(p => p.remove());

        const isPlayerTurn = (isReplayMode) ||
                             (isSinglePlayer) ||
                             (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn)));

        for (let y = 0; y < HIKORO_BOARD_HEIGHT; y++) {
            for (let x = 0; x < HIKORO_BOARD_WIDTH; x++) {

                const isBoardValid = typeof gameLogic !== 'undefined' ? gameLogic.isPositionValid(x, y) : true;

                if (gameState.boardState && gameState.boardState[y]?.[x] === null && isBoardValid) {

                    const square = document.querySelector(`#game-board .square[data-logical-x='${x}'][data-logical-y='${y}']`);
                    if (square) {
                        const plate = document.createElement('div');
                        plate.classList.add('move-plate', 'drop'); 
                        if (!isPlayerTurn) plate.classList.add('preview');
                        square.appendChild(plate);
                    }
                }
            }
        }
    }

    function handleHikoroClick(x, y) {
        if (isReplayMode) {
            handleReplaySquareClick(x, y); 
            return;
        }
        if (gameState.gameOver || !gameState.boardState) return;

        const isPlayerTurn = (isSinglePlayer) || 
                             (!isSinglePlayer && ((myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn))); 

        if (!isPlayerTurn) return; 

        if (selectedSquare && (selectedSquare.x !== x || selectedSquare.y !== y)) {
            const piece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
            if (piece) {
                const spriteType = piece.type;
                const pieceImgSrc = `sprites/${spriteType}_${piece.color}.png`;

                const isBonusActive = !!gameState.bonusMoveInfo && gameState.bonusMoveInfo.pieceX === selectedSquare.x && gameState.bonusMoveInfo.pieceY === selectedSquare.y;
                const validMoves = typeof gameLogic !== 'undefined' ? gameLogic.getValidMovesForPiece(piece, selectedSquare.x, selectedSquare.y, gameState.boardState, isBonusActive) : [];
                const isValidTarget = validMoves.some(m => m.x === x && m.y === y);

                if (isValidTarget) {
                    animateHikoroMove(selectedSquare, { x, y }, pieceImgSrc); 
                    socket.emit('makeGameMove', {
                        gameId,
                        move: { type: 'board', from: selectedSquare, to: { x, y } }
                    });
                }
            }
            selectedSquare = null;
            isDroppingPiece = null;
            clearHikoroHighlights();
            return; 
        }

        if (isDroppingPiece) {
             if (isDroppingPiece.type === 'lupa' || isDroppingPiece.type === 'prince') {
                 isDroppingPiece = null;
                 clearHikoroHighlights();
                 return;
             }

             if (gameState.boardState[y]?.[x] === null && (typeof gameLogic !== 'undefined' ? gameLogic.isPositionValid(x,y) : true) ) {
                const dropColor = isSinglePlayer ? (gameState.isWhiteTurn ? 'white' : 'black') : myColor;
                const spriteType = isDroppingPiece.type;
                const pieceImgSrc = `sprites/${spriteType}_${dropColor}.png`;
                animateHikoroDrop({ x, y }, pieceImgSrc); 

                socket.emit('makeGameMove', {
                    gameId,
                    move: { type: 'drop', piece: isDroppingPiece, to: { x, y } } 
                });
             }
            selectedSquare = null;
            isDroppingPiece = null;
            clearHikoroHighlights();
            return; 
        }

        const piece = gameState.boardState[y]?.[x];
        if (piece) {
            let canSelectPiece = isSinglePlayer ? true : piece.color === myColor; 

             if (gameState.bonusMoveInfo &&
                 (piece.color !== (gameState.isWhiteTurn ? 'white' : 'black') || 
                  x !== gameState.bonusMoveInfo.pieceX || y !== gameState.bonusMoveInfo.pieceY)) { 
                  canSelectPiece = false; 
             }

            if (canSelectPiece) {
                if (selectedSquare && selectedSquare.x === x && selectedSquare.y === y) {
                    selectedSquare = null;
                    isDroppingPiece = null;
                    clearHikoroHighlights();
                } else {
                    selectedSquare = { x, y };
                    isDroppingPiece = null;
                    socket.emit('getValidMoves', {
                        gameId,
                        data: { square: { x, y } } 
                    });
                }
            } else if (piece.color !== (gameState.isWhiteTurn ? 'white' : 'black')) {
                 selectedSquare = null; isDroppingPiece = null; clearHikoroHighlights();
            }
        } else {
            selectedSquare = null;
            isDroppingPiece = null;
            clearHikoroHighlights();
        }
    }

    function handleHikoroCapturedClick(pieceData, handColor, clickedElement) {
        if (isReplayMode) {
            handleReplayCapturedClick(pieceData, handColor, clickedElement); 
            return;
        }
        if (gameState.gameOver || gameState.bonusMoveInfo) return; 

        const activeColor = gameState.isWhiteTurn ? 'white' : 'black';
        if (handColor !== activeColor) return; 

        const isPlayerAllowedToMove = (isSinglePlayer) || (!isSinglePlayer && myColor === activeColor); 
        if (!isPlayerAllowedToMove) return; 

        if (pieceData.type === 'lupa' || pieceData.type === 'prince') return;

        if (isDroppingPiece && isDroppingPiece.type === pieceData.type) {
            isDroppingPiece = null;
            selectedSquare = null; 
            clearHikoroHighlights(); 
            clickedElement.classList.remove('selected-drop'); 
            return;
        }

        selectedSquare = null; 
        isDroppingPiece = { type: pieceData.type }; 
        clearHikoroHighlights(); 
        document.querySelectorAll('.captured-piece.selected-drop').forEach(el => el.classList.remove('selected-drop'));
        clickedElement.classList.add('selected-drop'); 
        highlightHikoroDropSquares(); 
    }

    onSquareClick = handleHikoroClick;
    onCapturedClick = handleHikoroCapturedClick;

    let replayGameTree = null;
    let currentReplayNode = null;
    let flatMoveList = []; 
    let currentMoveIndex = -1; 
    let awaitingBonusMove = null; 

    function toAlgebraic(x, y) {
         const file = String.fromCharCode('a'.charCodeAt(0) + x);
         const rank = y + 1; 
         return `${file}${rank}`;
     }

    function fromAlgebraic(alg) {
        if (!alg || alg.length < 2) return null;
        const file = alg.charAt(0);
        const rank = parseInt(alg.slice(1), 10);
        if (isNaN(rank) || file < 'a' || file > 'j' || rank < 1 || rank > 16) {
             console.warn("Invalid algebraic notation:", alg);
             return null;
        }
        const x = file.charCodeAt(0) - 'a'.charCodeAt(0);
        const y = rank - 1; 
        return { x, y };
    }

    function generateServerNotation(piece, to, wasCapture, wasDrop) {
        if (typeof gameLogic === 'undefined' || !gameLogic.pieceNotation) return "?";
        const pieceAbbr = gameLogic.pieceNotation[piece.type] || '?';
        const coord = toAlgebraic(to.x, to.y);

        if (wasDrop) return `${pieceAbbr}*${coord}`;
        if (wasCapture) return `${pieceAbbr}x${coord}`;
        return `${pieceAbbr}${coord}`;
    }

    function parseKifuToMoveList(kifuText) {
        const moves = [];
        const lines = kifuText.split('\n');
        for (const line of lines) {
            const lineMatch = line.trim().match(/^(\d+)\.(?:\.\.)?\s*(.*)$/);
            if (lineMatch && lineMatch[2]) {
                const moveParts = lineMatch[2].trim().split(/\s+/); 
                moves.push(...moveParts.filter(part => part.length > 0));
            }
        }
        return moves;
    }

    function parseNotation(notation, boardState, isWhiteTurn) {
        if (typeof gameLogic === 'undefined' || !gameLogic.notationToPieceType || !gameLogic.getValidMovesForPiece) return null;

        const color = isWhiteTurn ? 'white' : 'black';

        let match = notation.match(/^([A-Z][A-Za-z]*)\*([a-j](?:[1-9]|1[0-6]))$/);
        if (match) {
            const pieceAbbr = match[1];
            const algTo = match[2];
            const to = fromAlgebraic(algTo);
            const pieceType = gameLogic.notationToPieceType[pieceAbbr];
            if (!pieceType || !to) return null;
            return { type: 'drop', piece: { type: pieceType }, to: to };
        }

        match = notation.match(/^([A-Z][A-Za-z]*)(x?)([a-j](?:[1-9]|1[0-6]))$/);
        if (match) {
            const pieceAbbr = match[1];
            const isCaptureNotation = match[2] === 'x'; 
            const algTo = match[3];
            const pieceType = gameLogic.notationToPieceType[pieceAbbr];
            const to = fromAlgebraic(algTo);

            if (!pieceType || !to) return null;

            let possibleMoves = []; 

            for (let y = 0; y < gameLogic.BOARD_HEIGHT; y++) {
                for (let x = 0; x < gameLogic.BOARD_WIDTH; x++) {
                    const piece = boardState[y]?.[x];
                    if (piece && piece.color === color && piece.type === pieceType) {
                        try {
                            const validMoves = gameLogic.getValidMovesForPiece(piece, x, y, boardState, false);
                            const matchingMove = validMoves.find(m => m.x === to.x && m.y === to.y);
                            if (matchingMove) {
                                possibleMoves.push({ type: 'board', from: { x, y }, to: to, isAttack: matchingMove.isAttack }); 
                            }
                        } catch (e) {
                            console.error(`Error checking valid moves for ${piece.type} at ${toAlgebraic(x,y)}:`, e);
                        }
                    }
                }
            }

            if (possibleMoves.length === 1) return possibleMoves[0]; 
            else if (possibleMoves.length > 1) return possibleMoves[0]; 
            else {
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
                            try {
                                const validMoves = gameLogic.getValidMovesForPiece(piece, x, y, boardState, false);
                                const matchingMove = validMoves.find(m => m.x === to.x && m.y === to.y);
                                if (matchingMove) {
                                    const inPromotionZone = (color === 'white' && to.y > 8) || (color === 'black' && to.y < 7);
                                    const wasCapture = matchingMove.isAttack;
                                    let promotedType = piece.type;

                                    if (piece.type === 'fin' && wasCapture) promotedType = 'finor';
                                    else if ((piece.type === 'sult' || piece.type === 'pawn') && inPromotionZone) promotedType = 'chair';
                                    else if (piece.type === 'pilut' && inPromotionZone) promotedType = 'greatshield';
                                    else if (piece.type === 'greathorsegeneral' && wasCapture) promotedType = 'cthulhu';
                                    else if (piece.type === 'mermaid' && wasCapture) promotedType = 'neptune';

                                    if (promotedType === pieceType) {
                                        possibleMoves.push({ type: 'board', from: { x, y }, to: to, isAttack: matchingMove.isAttack });
                                    }
                                }
                            } catch (e) {
                                console.error(`Error checking promoting moves for ${piece.type} at ${toAlgebraic(x,y)}:`, e);
                            }
                        }
                    }
                }

                if (possibleMoves.length === 1) return possibleMoves[0];
                else if (possibleMoves.length > 1) return possibleMoves[0];
                else return null; 
            }
        }
        return null;
    }

     function applyMoveToState(oldGameState, moveObj) {
         if (!moveObj) return oldGameState;
         
         let newGameState = typeof structuredClone === 'function'
             ? structuredClone(oldGameState)
             : JSON.parse(JSON.stringify(oldGameState));

         let { boardState, whiteCaptured, blackCaptured, isWhiteTurn } = newGameState;
         const color = isWhiteTurn ? 'white' : 'black';
         let pieceMovedOriginal = null; 
         let wasCapture = false; 

         if (moveObj.type === 'drop') {
             const { piece, to } = moveObj; 
             const droppedPiece = { type: piece.type, color: color }; 

             boardState[to.y][to.x] = droppedPiece; 

             const hand = isWhiteTurn ? whiteCaptured : blackCaptured;
             const pieceIndex = hand.findIndex(p => p.type === piece.type);
             if (pieceIndex > -1) hand.splice(pieceIndex, 1);
             pieceMovedOriginal = droppedPiece; 
             newGameState.lastMove = { from: null, to: moveObj.to }; 

         } else if (moveObj.type === 'board') {
             const { from, to } = moveObj;
             const piece = boardState[from.y]?.[from.x];

             pieceMovedOriginal = {...piece}; 
             const targetPiece = boardState[to.y]?.[to.x];
             wasCapture = targetPiece !== null;

             if (piece.type === 'jotu') {
                 const dx = Math.sign(to.x - from.x);
                 const dy = Math.sign(to.y - from.y);
                 if (Math.abs(to.x - from.x) > 1 || Math.abs(to.y - from.y) > 1) { 
                     let cx = from.x + dx, cy = from.y + dy;
                     while (cx !== to.x || cy !== to.y) {
                         if (cy >= 0 && cy < HIKORO_BOARD_HEIGHT && cx >= 0 && cx < HIKORO_BOARD_WIDTH) {
                            const iPiece = boardState[cy][cx];
                            if (iPiece && iPiece.color === color && iPiece.type !== 'greathorsegeneral' && iPiece.type !== 'cthulhu') {
                                const hand = isWhiteTurn ? whiteCaptured : blackCaptured;
                                if (hand.length < 6) hand.push({ type: iPiece.type });
                                boardState[cy][cx] = null; 
                            }
                         }
                         cx += dx; cy += dy;
                     }
                 }
             }

             if (targetPiece) {
                 if (targetPiece.type === 'prince') {
                     if (targetPiece.color === 'white') newGameState.whitePrinceOnBoard = false; else newGameState.blackPrinceOnBoard = false;
                 } else if (targetPiece.type !== 'lupa') { 
                     const indestructible = ['greathorsegeneral', 'cthulhu', 'mermaid'];
                     let handPieceType = targetPiece.type;
                     let targetHand = isWhiteTurn ? whiteCaptured : blackCaptured; 

                     if (targetPiece.type === 'neptune') {
                         handPieceType = 'mermaid';
                         targetHand = targetPiece.color === 'white' ? whiteCaptured : blackCaptured;
                     }

                     if (!indestructible.includes(targetPiece.type)) {
                         if (targetHand.length < 6) targetHand.push({ type: handPieceType });
                     }
                 }
             }

             const movingPieceObject = boardState[from.y][from.x]; 
             boardState[to.y][to.x] = movingPieceObject;
             boardState[from.y][from.x] = null;
             newGameState.lastMove = { from: moveObj.from, to: moveObj.to }; 

              const pieceNowAtTarget = boardState[to.y]?.[to.x];
              if (pieceNowAtTarget) {
                 if (pieceNowAtTarget.type !== 'prince') {
                     if (pieceNowAtTarget.type === 'greathorsegeneral' && wasCapture) pieceNowAtTarget.type = 'cthulhu';
                     else if (pieceNowAtTarget.type === 'mermaid' && wasCapture) pieceNowAtTarget.type = 'neptune';
                     else if (pieceNowAtTarget.type === 'fin' && wasCapture) pieceNowAtTarget.type = 'finor';
                     else {
                         const promotablePawns = ['sult', 'pawn', 'pilut'];
                         if (promotablePawns.includes(pieceNowAtTarget.type)) {
                             const inPromotionZone = (pieceNowAtTarget.color === 'white' && moveObj.to.y > 8) || (pieceNowAtTarget.color === 'black' && moveObj.to.y < 7);
                             if (inPromotionZone) {
                                 if (pieceNowAtTarget.type === 'pilut') pieceNowAtTarget.type = 'greatshield';
                                 else pieceNowAtTarget.type = 'chair';
                             }
                         }
                     }
                 }
              }

         }

         const isBonusContinuation = !!oldGameState.bonusMoveInfo; 

         let triggersBonus = false;
         if (pieceMovedOriginal && !isBonusContinuation && moveObj.type === 'board') {
             const isCopeBonusTrigger = pieceMovedOriginal.type === 'cope' && wasCapture;
             const isGHGBonusTrigger = (pieceMovedOriginal.type === 'greathorsegeneral') && !wasCapture;
             const pieceAtTarget = boardState[moveObj.to.y]?.[moveObj.to.x]; 
             const isCthulhuBonusTrigger = (pieceAtTarget?.type === 'cthulhu') && !wasCapture;

             triggersBonus = isCopeBonusTrigger || isGHGBonusTrigger || isCthulhuBonusTrigger;
         }

         if (triggersBonus) {
             newGameState.bonusMoveInfo = { pieceX: moveObj.to.x, pieceY: moveObj.to.y };
             newGameState.isWhiteTurn = oldGameState.isWhiteTurn; 
         } else { 
             newGameState.bonusMoveInfo = null; 
             newGameState.isWhiteTurn = !oldGameState.isWhiteTurn; 
             newGameState.turnCount++;
         }

         newGameState.gameOver = false;
         newGameState.winner = null;
         newGameState.reason = null;

         return newGameState;
     }

     function buildReplayTree(kifuText) {
         const moveNotations = parseKifuToMoveList(kifuText);
         if (moveNotations.length === 0) {
             alert("Invalid or empty kifu. Please check format.");
             return null;
         }

         const initialBoard = gameLogic.getInitialBoard();
         const rootNode = {
             moveNotation: "Start", moveObj: null,
             gameState: {
                 boardState: initialBoard, whiteCaptured: [], blackCaptured: [],
                 isWhiteTurn: true, turnCount: 0, gameOver: false, lastMove: null, bonusMoveInfo: null,
                 whitePrinceOnBoard: true, blackPrinceOnBoard: true
             },
             parent: null, children: [], isBonusSecondMove: false
         };

         let currentNode = rootNode;

         for (let i = 0; i < moveNotations.length; i++) {
             const notation = moveNotations[i];
             const currentGameState = currentNode.gameState; 
             const moveObj = parseNotation(notation, currentGameState.boardState, currentGameState.isWhiteTurn);

             if (!moveObj) {
                 alert(`Error parsing move "${notation}". Replay might be incomplete.`);
                 break; 
             }

             const newGameState = applyMoveToState(currentGameState, moveObj);

             const newNode = {
                 moveNotation: notation, moveObj: moveObj, gameState: newGameState,
                 parent: currentNode, children: [],
                 isBonusSecondMove: !!currentGameState.bonusMoveInfo && !newGameState.bonusMoveInfo
             };

             currentNode.children.push(newNode); 
             currentNode = newNode; 
         }

         flatMoveList = [rootNode];
         let node = rootNode;
         while(node.children.length > 0) {
              node = node.children[0]; 
              flatMoveList.push(node);
         }

         return rootNode;
     }

    function renderReplayMoveHistory() {
        if (!moveHistoryElement) return;
        moveHistoryElement.innerHTML = ''; 

        function renderNodeRecursive(node, parentDOMElement, depth) {
            if (!node || node === replayGameTree) {
                 if(node && node.children.length > 0){
                     const mainLineContainer = document.createElement('div');
                     mainLineContainer.classList.add('move-line');
                     parentDOMElement.appendChild(mainLineContainer);

                     node.children.forEach((child) => {
                         renderNodeRecursive(child, mainLineContainer, 0); 
                     });
                 }
                return;
            }

            const moveWrapper = document.createElement('div'); 
            moveWrapper.classList.add('move-wrapper');
            moveWrapper.style.marginLeft = `${depth * 15}px`;

            const moveEl = document.createElement('span'); 
            moveEl.classList.add('move-node');

            let moveText = node.moveNotation;
            const stateBefore = node.parent.gameState; 
            const turnNum = Math.floor(stateBefore.turnCount / 2) + 1;
            const wasWhiteMove = stateBefore.isWhiteTurn;

             if (wasWhiteMove) moveText = `${turnNum}. ${moveText}`;
             else moveText = `... ${moveText}`; 

             if (node.isBonusSecondMove) moveText = `> ${node.moveNotation}`;

            const isBranchStartNode = node.parent && node.parent.children.length > 1 && node.parent.children[0] !== node;
            if (isBranchStartNode && !node.isBonusSecondMove) moveText = `( ${moveText}`; 

            moveEl.textContent = moveText + " "; 

            if (node === currentReplayNode) {
                moveEl.classList.add('active-move');
                 setTimeout(() => {
                     if (node === currentReplayNode) {
                         moveWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                     }
                 }, 50); 
            }

            moveEl.addEventListener('click', () => displayReplayState(node));
            moveWrapper.appendChild(moveEl); 
            parentDOMElement.appendChild(moveWrapper); 

            if (node.children.length > 0) {
                 let containerForChildren = moveWrapper; 
                 if (node.children.length > 1) {
                     containerForChildren = document.createElement('div');
                     containerForChildren.classList.add('move-line-continuation');
                     moveWrapper.appendChild(containerForChildren);
                 }

                 renderNodeRecursive(node.children[0], containerForChildren, depth); 
                 for (let i = 1; i < node.children.length; i++) {
                     renderNodeRecursive(node.children[i], containerForChildren, depth + 1); 
                 }
            }
        }

        renderNodeRecursive(replayGameTree, moveHistoryElement, 0); 
    }

    function handleReplaySquareClick(x, y) {
        if (!currentReplayNode) return; 
        const currentGameState = currentReplayNode.gameState;

        if (currentGameState.bonusMoveInfo) {
            const bonusPieceX = currentGameState.bonusMoveInfo.pieceX;
            const bonusPieceY = currentGameState.bonusMoveInfo.pieceY;
            const piece = currentGameState.boardState[bonusPieceY]?.[bonusPieceX];

            if (!piece) {
                clearHikoroHighlights(); selectedSquare = null; awaitingBonusMove = null; 
                 currentReplayNode.gameState.bonusMoveInfo = null; 
                 updateTurnIndicator(); 
                return;
            }
            if (!selectedSquare || selectedSquare.x !== bonusPieceX || selectedSquare.y !== bonusPieceY) {
                 selectedSquare = { x: bonusPieceX, y: bonusPieceY }; 
                 isDroppingPiece = null;
                 const validBonusMoves = gameLogic.getValidMovesForPiece(piece, bonusPieceX, bonusPieceY, currentGameState.boardState, true).filter(m => !m.isAttack);
                 clearHikoroHighlights();
                 drawHikoroHighlights(validBonusMoves);
                 return; 
            }

            const validBonusMoves = gameLogic.getValidMovesForPiece(piece, bonusPieceX, bonusPieceY, currentGameState.boardState, true).filter(m => !m.isAttack);
            const isValidBonusTarget = validBonusMoves.some(m => m.x === x && m.y === y);

            if (isValidBonusTarget) {
                const moveObj = { type: 'board', from: { x: bonusPieceX, y: bonusPieceY }, to: { x, y } };
                const nextGameState = applyMoveToState(currentGameState, moveObj);
                const notationString = generateServerNotation(piece, { x, y }, false, false);

                let existingNode = currentReplayNode.children.find(child =>
                    child.moveObj?.type === 'board' &&
                    child.moveObj.from.x === moveObj.from.x && child.moveObj.from.y === moveObj.from.y &&
                    child.moveObj.to.x === moveObj.to.x && child.moveObj.to.y === moveObj.to.y &&
                    child.isBonusSecondMove 
                );

                if (!existingNode) {
                     existingNode = {
                         moveNotation: notationString, moveObj: moveObj, gameState: nextGameState,
                         parent: currentReplayNode, children: [], isBonusSecondMove: true
                     };
                     currentReplayNode.children.push(existingNode); 
                } 

                awaitingBonusMove = null; 
                selectedSquare = null;
                isDroppingPiece = null;
                clearHikoroHighlights();
                displayReplayState(existingNode); 
            } else {
                clearHikoroHighlights();
                drawHikoroHighlights(validBonusMoves);
            }
            return; 
        }

        if (selectedSquare && (selectedSquare.x !== x || selectedSquare.y !== y)) {
            const from = selectedSquare;
            const to = { x, y };
            const piece = currentGameState.boardState[from.y]?.[from.x];

            if (!piece) { clearHikoroHighlights(); selectedSquare = null; return; }

            const validMoves = gameLogic.getValidMovesForPiece(piece, from.x, from.y, currentGameState.boardState, false);
            const targetMove = validMoves.find(m => m.x === to.x && m.y === to.y);

            if (targetMove) {
                const wasCapture = targetMove.isAttack;
                const moveObj = { type: 'board', from, to };
                const nextGameState = applyMoveToState(currentGameState, moveObj);
                const notationString = generateServerNotation(piece, to, wasCapture, false);

                 let existingNode = currentReplayNode.children.find(child =>
                     child.moveObj?.type === 'board' &&
                     child.moveObj.from.x === moveObj.from.x && child.moveObj.from.y === moveObj.from.y &&
                     child.moveObj.to.x === moveObj.to.x && child.moveObj.to.y === moveObj.to.y &&
                     !child.isBonusSecondMove 
                 );

                 if (!existingNode) {
                      existingNode = {
                         moveNotation: notationString, moveObj: moveObj, gameState: nextGameState,
                         parent: currentReplayNode, children: [], isBonusSecondMove: false
                     };
                     currentReplayNode.children.push(existingNode); 
                 } 

                if (nextGameState.bonusMoveInfo) {
                    awaitingBonusMove = { from: to, pieceType: piece.type }; 
                    selectedSquare = { x: to.x, y: to.y }; 
                    displayReplayState(existingNode); 
                } else {
                    awaitingBonusMove = null;
                    selectedSquare = null;
                    isDroppingPiece = null;
                    clearHikoroHighlights();
                    displayReplayState(existingNode); 
                }
            } else {
                clearHikoroHighlights();
                selectedSquare = null;
            }
            return; 
        }

        if (isDroppingPiece) {
            const to = { x, y };
            if (isDroppingPiece.type === 'lupa' || isDroppingPiece.type === 'prince') {
                clearHikoroHighlights(); isDroppingPiece = null; return;
            }
            const moveObj = { type: 'drop', piece: { type: isDroppingPiece.type }, to };

            if (currentGameState.boardState[to.y]?.[to.x] === null && gameLogic.isPositionValid(to.x, to.y)) {
                const nextGameState = applyMoveToState(currentGameState, moveObj);
                const notationString = generateServerNotation({ type: isDroppingPiece.type }, to, false, true);

                 let existingNode = currentReplayNode.children.find(child =>
                     child.moveObj?.type === 'drop' &&
                     child.moveObj.piece.type === moveObj.piece.type &&
                     child.moveObj.to.x === moveObj.to.x && child.moveObj.to.y === moveObj.to.y
                 );

                 if (!existingNode) {
                     existingNode = {
                         moveNotation: notationString, moveObj: moveObj, gameState: nextGameState,
                         parent: currentReplayNode, children: [], isBonusSecondMove: false
                     };
                     currentReplayNode.children.push(existingNode); 
                 }

                awaitingBonusMove = null;
                selectedSquare = null;
                isDroppingPiece = null;
                clearHikoroHighlights();
                displayReplayState(existingNode); 

            } else {
                clearHikoroHighlights();
                isDroppingPiece = null;
            }
            return; 
        }

        const piece = currentGameState.boardState[y]?.[x];
        if (piece) {
            const canSelectPiece = piece.color === (currentGameState.isWhiteTurn ? 'white' : 'black');
            if (canSelectPiece) {
                if (selectedSquare && selectedSquare.x === x && selectedSquare.y === y) {
                    selectedSquare = null; 
                    clearHikoroHighlights();
                } else {
                    selectedSquare = { x, y };
                    isDroppingPiece = null; 
                    const validMoves = gameLogic.getValidMovesForPiece(piece, x, y, currentGameState.boardState, false);
                    clearHikoroHighlights();
                    drawHikoroHighlights(validMoves);
                    const selSquareEl = document.querySelector(`#game-board .square[data-logical-x='${x}'][data-logical-y='${y}']`);
                    if(selSquareEl) selSquareEl.classList.add('selected');
                }
            } else { 
                 selectedSquare = null; isDroppingPiece = null; clearHikoroHighlights();
            }
        } else { 
            selectedSquare = null;
            isDroppingPiece = null;
            clearHikoroHighlights();
        }
    }

    function handleReplayCapturedClick(pieceData, handColor, clickedElement) { 
        if (!currentReplayNode) return; 
        const currentGameState = currentReplayNode.gameState;

        if (currentGameState.bonusMoveInfo) return;

        const activeColor = currentGameState.isWhiteTurn ? 'white' : 'black';
        if (handColor !== activeColor) return;

        if (pieceData.type === 'lupa' || pieceData.type === 'prince') return;

        if (isDroppingPiece && isDroppingPiece.type === pieceData.type) {
            isDroppingPiece = null;
            selectedSquare = null; 
            clearHikoroHighlights(); 
            clickedElement.classList.remove('selected-drop'); 
            return;
        }

        selectedSquare = null; 
        isDroppingPiece = { type: pieceData.type }; 
        clearHikoroHighlights(); 
        document.querySelectorAll('.captured-piece.selected-drop').forEach(el => el.classList.remove('selected-drop'));
        clickedElement.classList.add('selected-drop'); 
        highlightHikoroDropSquares(); 
    }

    function displayReplayState(node) {
        if (!node) return;
        currentReplayNode = node; 

        let displayMoveNum = 0;
        let tempNode = node;
        let pathNodes = []; 
        while (tempNode && tempNode.parent) {
            pathNodes.unshift(tempNode); 
            tempNode = tempNode.parent;
        }
        pathNodes.forEach(n => { if (!n.isBonusSecondMove) displayMoveNum++; });

        gameState = node.gameState; 

        renderHikoroBoard(); 
        renderHikoroCaptured();
        updateTurnIndicator(); 
        renderReplayMoveHistory(); 

         let displayTotal = 0;
         flatMoveList.forEach(n => { if (n !== replayGameTree && !n.isBonusSecondMove) displayTotal++; });
        replayMoveNumber.textContent = `${displayMoveNum} / ${displayTotal}`;

        replayFirstBtn.disabled = (node === replayGameTree); 
        replayPrevBtn.disabled = (!node.parent); 
        replayNextBtn.disabled = node.children.length === 0 && !gameState.bonusMoveInfo;
        replayLastBtn.disabled = (flatMoveList.length <= 1 || node === flatMoveList[flatMoveList.length - 1]);

        if (!gameState.bonusMoveInfo) {
            awaitingBonusMove = null;
        }

         if (gameState.bonusMoveInfo) {
             selectedSquare = { x: gameState.bonusMoveInfo.pieceX, y: gameState.bonusMoveInfo.pieceY };
             isDroppingPiece = null; 
             const bonusPiece = gameState.boardState[selectedSquare.y]?.[selectedSquare.x];
             if (bonusPiece) {
                 const validBonusMoves = gameLogic.getValidMovesForPiece(bonusPiece, selectedSquare.x, selectedSquare.y, gameState.boardState, true).filter(m => !m.isAttack);
                 clearHikoroHighlights();
                 drawHikoroHighlights(validBonusMoves);
                 const bonusSquareEl = document.querySelector(`#game-board .square[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`);
                 if (bonusSquareEl) bonusSquareEl.classList.add('selected');
             } else {
                  clearHikoroHighlights(); selectedSquare = null; awaitingBonusMove = null;
             }
         } else if (selectedSquare || isDroppingPiece) {
              selectedSquare = null;
              isDroppingPiece = null;
              clearHikoroHighlights();
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

     if (rulesBtn) {
        rulesBtn.addEventListener('click', () => {
            populateHikoroRules();
            if (rulesModal) rulesModal.style.display = 'block';
        });
    }

    if (closeRulesBtn && rulesModal) {
        closeRulesBtn.addEventListener('click', () => {
           rulesModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target == rulesModal) {
            if (rulesModal) rulesModal.style.display = 'none';
        }
    });

});