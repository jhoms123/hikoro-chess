// public/script.js

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Server Connection ---
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const serverUrl = isLocal ? 'http://localhost:3000' : window.location.origin;
    const socket = io(serverUrl);
    
    const BOARD_WIDTH = 10;
    const BOARD_HEIGHT = 16;
    const sanctuarySquares = [
        {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
        {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
    ];

    const lobbyElement = document.getElementById('lobby');
    const gameContainerElement = document.getElementById('game-container');
    const createGameBtn = document.getElementById('create-game-btn');
    const gameListElement = document.getElementById('game-list');
    const boardElement = document.getElementById('game-board');
    const turnIndicator = document.getElementById('turn-indicator');
    const winnerText = document.getElementById('winner-text');

    let gameState = {};
    let myColor = null;
    let gameId = null;
    let selectedSquare = null;
    let isDroppingPiece = null;
    
    createGameBtn.addEventListener('click', () => {
        const timeControl = document.getElementById('time-control').value;
        const byoyomi = document.getElementById('byoyomi-control').value;
        socket.emit('createGame', { timeControl, byoyomi });
    });
    
    socket.on('lobbyUpdate', updateLobby);
    socket.on('gameCreated', onGameCreated);
    socket.on('gameStart', onGameStart);
    socket.on('gameStateUpdate', updateLocalState);
    socket.on('validMoves', drawHighlights);
    socket.on('errorMsg', (message) => alert(message));
    socket.on('timeUpdate', (data) => {
        updateClocks(data.whiteTime, data.blackTime);
    });

    function formatTime(seconds) {
        if (seconds < 0) return "00:00";
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    function updateClocks(whiteTime, blackTime) {
        if (!myColor) return;
        const yourTime = myColor === 'white' ? whiteTime : blackTime;
        const opponentTime = myColor === 'white' ? blackTime : whiteTime;

        document.getElementById(`${myColor}-time`).textContent = formatTime(yourTime);
        document.getElementById(myColor === 'white' ? 'black-time' : 'white-time').textContent = formatTime(opponentTime);
    }

    function updateLobby(games) {
        gameListElement.innerHTML = '';
        for (const id in games) {
            const gameItem = document.createElement('div');
            gameItem.classList.add('game-item');
            gameItem.innerHTML = `<span>Game by Player 1</span>`;
            const joinBtn = document.createElement('button');
            joinBtn.textContent = 'Join';
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
        if (gameState.timeControl > 0) {
            updateClocks(gameState.whiteTime, gameState.blackTime);
        }
        const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
        if (isMyTurn && gameState.bonusMoveInfo) {
            selectedSquare = { x: gameState.bonusMoveInfo.pieceX, y: gameState.bonusMoveInfo.pieceY };
            socket.emit('getValidMoves', { gameId, square: selectedSquare });
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
                
                // THIS IS THE CORRECTED BOARD FLIPPING LOGIC
                let displayX = x;
                let displayY = y;
                if (myColor === 'white') {
                    displayY = BOARD_HEIGHT - 1 - y;
                } else if (myColor === 'black') {
                    displayY = BOARD_HEIGHT - 1 - y;
                    displayX = BOARD_WIDTH - 1 - x;
                }
                
                square.dataset.logicalX = x;
                square.dataset.logicalY = y;
                square.style.gridRowStart = displayY + 1;
                square.style.gridColumnStart = displayX + 1;

                square.classList.add((x + y) % 2 === 0 ? 'light' : 'dark');

                if (sanctuarySquares.some(sq => sq.x === x && sq.y === y)) {
                    square.classList.add('sanctuary-square');
                }

                const isBoardValid = !((x <= 1 && y <= 2) || (x >= 8 && y <= 2) || (x <= 1 && y >= 13) || (x >= 8 && y >= 13));
                if (!isBoardValid) {
                    square.classList.add('invalid');
                } else {
                    square.addEventListener('click', () => onSquareClick(x, y));
                }

                const piece = gameState.boardState[y][x];
                if (piece) {
                    const pieceElement = document.createElement('div');
                    pieceElement.classList.add('piece');
                    const spriteImg = document.createElement('img');
                    spriteImg.src = `sprites/${piece.type}_${piece.color}.png`;
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
        
        // This ensures the "Your Hand" and "Opponent's Hand" labels are always correct
        const myHeader = document.querySelector(myColor === 'white' ? '#white-captured-area h3' : '#black-captured-area h3');
        const oppHeader = document.querySelector(myColor === 'white' ? '#black-captured-area h3' : '#white-captured-area h3');
        
        // We only want the text part, not the clock span
        myHeader.childNodes[0].nodeValue = "Your Hand (";
        oppHeader.childNodes[0].nodeValue = "Opponent's Hand (";

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

        myCaptured.forEach(piece => myCapturedEl.appendChild(createCapturedPieceElement(piece, true)));
        oppCaptured.forEach(piece => oppCapturedEl.appendChild(createCapturedPieceElement(piece, false)));
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

    // --- User Interaction ---
    function onSquareClick(x, y) {
        if (gameState.gameOver) return;
        const isMyTurn = (myColor === 'white' && gameState.isWhiteTurn) || (myColor === 'black' && !gameState.isWhiteTurn);
        
        if (isDroppingPiece) {
            socket.emit('makeDrop', { gameId, piece: isDroppingPiece, to: { x, y } });
            isDroppingPiece = null;
            clearHighlights();
            return;
        }

        if (isMyTurn && selectedSquare) {
            if (selectedSquare.x !== x || selectedSquare.y !== y) {
                socket.emit('makeMove', { gameId, from: selectedSquare, to: { x, y } });
                selectedSquare = null;
                clearHighlights();
                return;
            }
        }
        
        const piece = gameState.boardState[y][x];
        if (piece && piece.color === myColor) {
            if (selectedSquare && selectedsquare.x === x && selectedSquare.y === y) {
                selectedSquare = null;
                clearHighlights();
            } else {
                isDroppingPiece = null; // Cancel any drop selection
                selectedSquare = { x, y };
                socket.emit('getValidMoves', { gameId, square: { x, y } });
            }
        } else {
            selectedSquare = null;
            clearHighlights();
        }
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

    // --- Highlighting Functions ---
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
                if (!isMyTurn) plate.classList.add('preview');
                if (move.isAttack) plate.classList.add('attack');
                moveSquare.appendChild(plate);
            }
        });
    }

    function highlightDropSquares() {
        clearHighlights();
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                const isBoardValid = !((x <= 1 && y <= 2) || (x >= 8 && y <= 2) || (x <= 1 && y >= 13) || (x >= 8 && y >= 13));
                if (gameState.boardState[y][x] === null && isBoardValid) {
                    const square = document.querySelector(`[data-logical-x='${x}'][data-logical-y='${y}']`);
                    if (square) {
                        const plate = document.createElement('div');
                        plate.classList.add('move-plate', 'drop');
                        square.appendChild(plate);
                    }
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