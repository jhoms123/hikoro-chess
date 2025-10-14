// public/script.js

document.addEventListener('DOMContentLoaded', () => {
   
   const productionUrl = 'https://HikoroChess.org';
   const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
   const serverUrl = isLocal ? 'http://localhost:3000' : window.location.origin;

   const socket = io(serverUrl);
    
    const BOARD_WIDTH = 10;
    const BOARD_HEIGHT = 16;
    
    // UI Elements
    const lobbyElement = document.getElementById('lobby');
    const gameContainerElement = document.getElementById('game-container');
    const createGameBtn = document.getElementById('create-game-btn');
    const gameListElement = document.getElementById('game-list');
    const boardElement = document.getElementById('game-board');
    const turnIndicator = document.getElementById('turn-indicator');
    const winnerText = document.getElementById('winner-text');

    // Client State
    let gameState = {};
    let myColor = null;
    let gameId = null;
    let selectedSquare = null;
    let isDroppingPiece = null;
    
    const sanctuarySquares = [
        {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
        {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
    ];

    // --- Lobby Listeners ---
    createGameBtn.addEventListener('click', () => socket.emit('createGame'));
    socket.on('lobbyUpdate', updateLobby);
    socket.on('gameCreated', onGameCreated);
    socket.on('gameStart', onGameStart);
    
    // --- Game Listeners ---
    socket.on('gameStateUpdate', updateLocalState);
    socket.on('validMoves', drawHighlights);
    socket.on('errorMsg', (message) => alert(message));
    socket.on('connect_error', (err) => {
        console.error("Connection failed:", err.message);
        alert("Failed to connect to the server. Check the developer console (F12) for more info.");
    });

    function updateLobby(games) {
        gameListElement.innerHTML = '';
        for (const id in games) {
            const gameItem = document.createElement('div');
            gameItem.classList.add('game-item');
            gameItem.innerHTML = `<span>Game by Player 1</span>`;
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
        turnIndicator.textContent = "Waiting for an opponent...";
        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
    }

    function onGameStart(initialGameState) {
        if (!myColor) myColor = 'black';
        gameId = initialGameState.id;
        lobbyElement.style.display = 'none';
        gameContainerElement.style.display = 'flex';
        updateLocalState(initialGameState);
    }

    function updateLocalState(newGameState) {
        gameState = newGameState;
        renderAll();
        const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
        if (isMyTurn && gameState.bonusMoveInfo) {
            const bonusPieceSquare = { 
                x: gameState.bonusMoveInfo.pieceX, 
                y: gameState.bonusMoveInfo.pieceY 
            };
            selectedSquare = bonusPieceSquare;
            socket.emit('getValidMoves', { gameId, square: bonusPieceSquare });
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
        document.querySelector(myColor === 'white' ? '#white-captured-area h3' : '#black-captured-area h3').textContent = "Your Hand";
        document.querySelector(myColor === 'white' ? '#black-captured-area h3' : '#white-captured-area h3').textContent = "Opponent's Hand";
        myCapturedEl.innerHTML = '';
        oppCapturedEl.innerHTML = '';

        myCaptured.forEach((piece) => {
            const el = document.createElement('div');
            el.classList.add('captured-piece', piece.color);

            const pieceElement = document.createElement('div');
            pieceElement.classList.add('piece', piece.color);
            const spriteImg = document.createElement('img');
            spriteImg.src = `sprites/${piece.type}_${piece.color}.png`;
            spriteImg.alt = `${piece.color} ${piece.type}`;
            pieceElement.appendChild(spriteImg);
            el.appendChild(pieceElement);

            el.addEventListener('click', () => onCapturedClick(piece));
            myCapturedEl.appendChild(el);
        });

        oppCaptured.forEach((piece) => {
            const el = document.createElement('div');
            el.classList.add('captured-piece', piece.color);
            
            const pieceElement = document.createElement('div');
            pieceElement.classList.add('piece', piece.color);
            const spriteImg = document.createElement('img');
            spriteImg.src = `sprites/${piece.type}_${piece.color}.png`;
            spriteImg.alt = `${piece.color} ${piece.type}`;
            pieceElement.appendChild(spriteImg);
            el.appendChild(pieceElement);

            oppCapturedEl.appendChild(el);
        });
    }

    function updateTurnIndicator() {
        if (gameState.gameOver) {
            turnIndicator.textContent = '';
            winnerText.textContent = `${gameState.winner.charAt(0).toUpperCase() + gameState.winner.slice(1)} Wins!`;
            return;
        }
        const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
        turnIndicator.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
    }

    // REFACTORED: To allow selecting pieces on opponent's turn
    function onSquareClick(x, y) {
        if (gameState.gameOver) return;
        const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);

        // This part handles making a move, which can only happen if it's your turn.
        if (isMyTurn && selectedSquare) {
            // Check if the click is a move attempt (not on the selected square itself)
            if (selectedSquare.x !== x || selectedSquare.y !== y) {
                socket.emit('makeMove', { gameId, from: selectedSquare, to: { x, y } });
                selectedSquare = null;
                clearHighlights();
                return;
            }
        }
        
        // This part handles selecting/deselecting a piece, which can happen anytime.
        const piece = gameState.boardState[y][x];
        if (piece && piece.color === myColor) {
            // If clicking the same piece again, deselect it.
            if (selectedSquare && selectedSquare.x === x && selectedSquare.y === y) {
                selectedSquare = null;
                clearHighlights();
            } else { // Otherwise, select the new piece.
                selectedSquare = { x, y };
                socket.emit('getValidMoves', { gameId, square: { x, y } });
            }
        } else {
            // If you click an empty square or an enemy piece, just clear any selection.
            selectedSquare = null;
            clearHighlights();
        }
    }
    
    // REFACTORED: To draw gray dots for previews
    function drawHighlights(moves) {
        clearHighlights();
        if (!selectedSquare) return;

        const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
        const selectedSquareElement = document.querySelector(`[data-logical-x='${selectedSquare.x}'][data-logical-y='${selectedSquare.y}']`);

        if (selectedSquareElement) {
            // Use 'selected' class for your turn, 'preview-selected' for opponent's turn
            selectedSquareElement.classList.add(isMyTurn ? 'selected' : 'preview-selected');
        }

        moves.forEach(move => {
            const moveSquare = document.querySelector(`[data-logical-x='${move.x}'][data-logical-y='${move.y}']`);
            if (moveSquare) {
                const plate = document.createElement('div');
                plate.classList.add('move-plate');
                // If it's not your turn, add the 'preview' class to make it gray
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
        if (!isMyTurn || gameState.gameOver || gameState.bonusMoveInfo) return;
        if (isDroppingPiece && isDroppingPiece.type === piece.type) {
            isDroppingPiece = null;
            clearHighlights();
            return;
        }
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