// ===================================================================
// Step 1: Game Logic for the Bot (Unchanged)
// ===================================================================

const BOT_BOARD_WIDTH = 10;
const BOT_BOARD_HEIGHT = 16;

function isPositionValid(x, y) {
    if (x < 0 || y < 0 || x >= BOT_BOARD_WIDTH || y >= BOT_BOARD_HEIGHT) return false;
    if ((x <= 1 && y <= 2) || (x >= 8 && y <= 2)) return false;
    if ((x <= 1 && y >= 13) || (x >= 8 && y >= 13)) return false;
    return true;
}

// ... (Paste the rest of your existing game logic functions here: isProtected, getValidMovesForPiece, etc.)
// (The actual move generation rules do not need to change)
const isProtected = (targetPiece, targetX, targetY, board) => {
    const protectingColor = targetPiece.color;
    const inFrontDir = protectingColor === 'white' ? 1 : -1;
    const pilutProtectorY = targetY + inFrontDir;
    if (isPositionValid(targetX, pilutProtectorY)) {
        const potentialProtector = board[pilutProtectorY][targetX];
        if (potentialProtector && potentialProtector.type === 'pilut' && potentialProtector.color === protectingColor) {
            return true;
        }
    }
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const gsX = targetX + dx;
            const gsY = targetY + dy;
            if (isPositionValid(gsX, gsY)) {
                const potentialProtector = board[gsY][gsX];
                if (potentialProtector && potentialProtector.type === 'greatshield' && potentialProtector.color === protectingColor) {
                    const gsForwardDir = potentialProtector.color === 'white' ? 1 : -1;
                    const isTargetInFrontStraight = (targetX === gsX && targetY === gsY + gsForwardDir);
                    const isTargetInFrontDiagLeft = (targetX === gsX - 1 && targetY === gsY + gsForwardDir);
                    const isTargetInFrontDiagRight = (targetX === gsX + 1 && targetY === gsY + gsForwardDir);
                    if (!(isTargetInFrontStraight || isTargetInFrontDiagLeft || isTargetInFrontDiagRight)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
};
function getValidMovesForPiece(piece, x, y, boardState, bonusMoveActive = false) {
    if (!piece) return [];
    const moves = [];
    const addMove = (toX, toY) => {
        if (!isPositionValid(toX, toY)) return;
        const target = boardState[toY][toX];
        if (target === null) {
            moves.push({ x: toX, y: toY, isAttack: false });
        } else if (target.color !== piece.color) {
            if (!isProtected(target, toX, toY, boardState)) {
                moves.push({ x: toX, y: toY, isAttack: true });
            }
        }
    };
    const addNonCaptureMove = (toX, toY) => {
        if (!isPositionValid(toX, toY)) return;
        if (boardState[toY][toX] === null) {
            moves.push({ x: toX, y: toY, isAttack: false });
        }
    };
    const generateJotuJumpMoves = (dx, dy) => {
        let cx = x + dx; let cy = y + dy; let pathHasEnemy = false;
        let checkX = cx, checkY = cy;
        while(isPositionValid(checkX, checkY)) {
            const checkTarget = boardState[checkY][checkX];
            if (checkTarget && checkTarget.color !== piece.color) { pathHasEnemy = true; break; }
            checkX += dx; checkY += dy;
        }
        if (!pathHasEnemy) {
            while (isPositionValid(cx, cy)) {
                if (boardState[cy][cx] === null) { moves.push({ x: cx, y: cy, isAttack: false }); } else { break; }
                cx += dx; cy += dy;
            }
            return;
        }
        cx = x + dx; cy = y + dy;
        while (isPositionValid(cx, cy)) {
            const target = boardState[cy][cx];
            if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); }
            else if (target.color !== piece.color) { if (!isProtected(target, cx, cy, boardState)) { moves.push({ x: cx, y: cy, isAttack: true }); } break; }
            cx += dx; cy += dy;
        }
    };
    const generateLineMoves = (dx, dy) => {
        let cx = x + dx, cy = y + dy;
        while (isPositionValid(cx, cy)) {
            const target = boardState[cy][cx];
            if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); }
            else { if (target.color !== piece.color && !isProtected(target, cx, cy, boardState)) { moves.push({ x: cx, y: cy, isAttack: true }); } break; }
            cx += dx; cy += dy;
        }
    };
    const generateNonCaptureLineMoves = (dx, dy) => {
        let cx = x + dx, cy = y + dy;
        while (isPositionValid(cx, cy) && boardState[cy][cx] === null) { moves.push({ x: cx, y: cy, isAttack: false }); cx += dx; cy += dy; }
    };
    switch (piece.type) {
        case 'lupa': for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } break;
        case 'kota': generateLineMoves(1, 0); generateLineMoves(-1, 0); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } break;
        case 'zur': for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; generateLineMoves(dx, dy); } break;
        case 'fin': generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1); addNonCaptureMove(x + 1, y); addNonCaptureMove(x - 1, y); break;
        case 'yoli': [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); })); addMove(x + 1, y); addMove(x - 1, y); addMove(x, y + 1); addMove(x, y - 1); break;
        case 'pilut': { const dir = piece.color === 'white' ? 1 : -1; if (isPositionValid(x, y + dir) && !boardState[y + dir][x]) { moves.push({ x: x, y: y + dir, isAttack: false }); if (isPositionValid(x, y + 2 * dir) && !boardState[y + 2 * dir][x]) { moves.push({ x: x, y: y + 2 * dir, isAttack: false }); } } break; }
        case 'sult': { const fwd = piece.color === 'white' ? 1 : -1; addMove(x - 1, y + fwd); addMove(x + 1, y + fwd); addMove(x, y - fwd); addMove(x, y + fwd); addMove(x, y + 2 * fwd); break; }
        case 'pawn': addMove(x, y + 1); addMove(x, y - 1); addMove(x + 1, y); addMove(x - 1, y); addMove(x + 2, y + 2); addMove(x - 2, y + 2); addMove(x + 2, y - 2); addMove(x - 2, y - 2); break;
        case 'cope': { const fwdDir = piece.color === 'white' ? 1 : -1; const generateCopeMoves = (moveFunc) => { moveFunc(x + 2, y + 2 * fwdDir); moveFunc(x - 2, y + 2 * fwdDir); moveFunc(x, y + 1 * fwdDir); moveFunc(x, y + 2 * fwdDir); moveFunc(x, y - 1 * fwdDir); moveFunc(x, y - 2 * fwdDir); }; if (bonusMoveActive) { generateCopeMoves(addNonCaptureMove); } else { generateCopeMoves(addMove); } break; }
        case 'chair': generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1); generateLineMoves(0, 1); generateLineMoves(0, -1); break;
        case 'jotu': generateJotuJumpMoves(1, 0); generateJotuJumpMoves(-1, 0); if (piece.color === 'white') { generateJotuJumpMoves(0, 1); addMove(x, y - 1); } else { generateJotuJumpMoves(0, -1); addMove(x, y + 1); } break;
        case 'kor': addMove(x - 1, y - 1); addMove(x - 1, y + 1); addMove(x + 1, y + 1); addMove(x + 1, y - 1); [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) + Math.abs(dy) === 3) addMove(x + dx, y + dy); })); break;
        case 'finor': generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1); [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) + Math.abs(dy) === 3) addMove(x + dx, y + dy); })); break;
        case 'greatshield': const gsDir = piece.color === 'white' ? 1 : -1; addNonCaptureMove(x, y + gsDir); addNonCaptureMove(x - 1, y + gsDir); addNonCaptureMove(x + 1, y + gsDir); addNonCaptureMove(x, y - gsDir); break;
        case 'greathorsegeneral': { const ghgDir = piece.color === 'white' ? 1 : -1; if (bonusMoveActive) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addNonCaptureMove(x + dx, y + dy); } [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addNonCaptureMove(x + dx, y + dy); })); generateNonCaptureLineMoves(-1, ghgDir); generateNonCaptureLineMoves(1, ghgDir); generateNonCaptureLineMoves(0, -ghgDir); } else { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); })); generateLineMoves(-1, ghgDir); generateLineMoves(1, ghgDir); generateLineMoves(0, -ghgDir); } break; }
        case 'neptune': { const fwdDir = piece.color === 'white' ? 1 : -1; const directions = [{dx: 1, dy: fwdDir}, {dx: -1, dy: fwdDir}, {dx: 0, dy: fwdDir}, {dx: 0, dy: -fwdDir}]; directions.forEach(({dx, dy}) => { let cx = x + dx; let cy = y + dy; let screenFound = false; while (isPositionValid(cx, cy)) { const target = boardState[cy][cx]; if (!screenFound) { if (target !== null) { screenFound = true; } } else { if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); } else { if(target.color !== piece.color && !isProtected(target, cx, cy, boardState)) { moves.push({ x: cx, y: cy, isAttack: true }); } break; } } cx += dx; cy += dy; } }); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } addMove(x + 2, y + 2 * fwdDir); addMove(x - 2, y + 2 * fwdDir); addMove(x, y + 1 * fwdDir); addMove(x, y + 2 * fwdDir); addMove(x, y - 1 * fwdDir); addMove(x, y - 2 * fwdDir); break; }
        case 'mermaid': { for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } break; }
        case 'cthulhu': { for (let dx = -2; dx <= 2; dx++) { for (let dy = -2; dy <= 2; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } } [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); })); const ghgDir = piece.color === 'white' ? 1 : -1; generateLineMoves(-1, ghgDir); generateLineMoves(1, ghgDir); generateLineMoves(0, -ghgDir); break; }
    }
    return moves;
}


// ===================================================================
// Step 2: Bot's Upgraded "Brain"
// ===================================================================

const pieceValues = {
    'pawn': 100, 'sult': 100, 'pilut': 150, 'fin': 300, 'cope': 320, 'chair': 500,
    'greatshield': 400, 'finor': 550, 'jotu': 800, 'mermaid': 850, 'neptune': 1000,
    'greathorsegeneral': 1200, 'cthulhu': 1500, 'lupa': 20000
};

// IMPROVEMENT: Piece-Square Tables add value based on piece position
// This encourages the bot to move pieces to better squares.
const pawnPositionValue = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    [5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    [10,10,10,10,10,10,10,10,10,10],
    [20,20,20,20,20,20,20,20,20,20],
    [30,30,30,30,30,30,30,30,30,30],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

// NEW: A smarter evaluation function
function evaluateBoard(boardState) {
    let totalScore = 0;
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y][x];
            if (piece) {
                const value = pieceValues[piece.type] || 0;
                let positionValue = 0;
                
                // Add position score for pawns/sults
                if (piece.type === 'pawn' || piece.type === 'sult') {
                    positionValue = (piece.color === 'white') ? pawnPositionValue[y][x] : pawnPositionValue[BOT_BOARD_HEIGHT - 1 - y][x];
                }

                if (piece.color === 'white') {
                    totalScore += (value + positionValue);
                } else {
                    totalScore -= (value + positionValue);
                }
            }
        }
    }
    return totalScore;
}

// NEW: Move generation now includes drops
function getAllValidMoves(boardState, color, capturedPieces) {
    const allMoves = [];
    
    // 1. Get moves for pieces on the board
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y][x];
            if (piece && piece.color === color) {
                const validMoves = getValidMovesForPiece(piece, x, y, boardState, false);
                for (const move of validMoves) {
                    allMoves.push({
                        type: 'board',
                        from: { x, y },
                        to: { x: move.x, y: move.y }
                    });
                }
            }
        }
    }

    // 2. Get moves for dropping captured pieces
    if (capturedPieces && capturedPieces.length > 0) {
        const uniquePieceTypes = [...new Set(capturedPieces.map(p => p.type))];
        for (const pieceType of uniquePieceTypes) {
            for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
                for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
                    if (isPositionValid(x, y) && boardState[y][x] === null) {
                        allMoves.push({
                            type: 'drop',
                            pieceType: pieceType,
                            to: { x, y }
                        });
                    }
                }
            }
        }
    }
    
    return allMoves;
}

// Main function that decides the move
function findBestMove(boardState, capturedPieces) {
    // Increase depth to 3 for a stronger bot, thanks to Alpha-Beta Pruning
    const depth = 3; 
    let bestMove = null;
    let bestValue = -Infinity;

    const moves = getAllValidMoves(boardState, 'black', capturedPieces);
    
    for (const move of moves) {
        const tempBoard = JSON.parse(JSON.stringify(boardState));
        
        // Apply the move to the temporary board
        if (move.type === 'drop') {
            tempBoard[move.to.y][move.to.x] = { type: move.pieceType, color: 'black' };
        } else {
            const piece = tempBoard[move.from.y][move.from.x];
            tempBoard[move.to.y][move.to.x] = piece;
            tempBoard[move.from.y][move.from.x] = null;
        }

        let boardValue = minimax(tempBoard, depth - 1, -Infinity, Infinity, false); // false for minimizing player (white)
        
        if (boardValue > bestValue) {
            bestValue = boardValue;
            bestMove = move;
        }
    }
    return bestMove;
}

// NEW: Minimax with Alpha-Beta Pruning for a much faster search
function minimax(boardState, depth, alpha, beta, isMaximizingPlayer) {
    if (depth === 0) {
        return evaluateBoard(boardState);
    }
    
    const color = isMaximizingPlayer ? 'black' : 'white';
    // Note: The recursive search doesn't simulate drops for simplicity, but could be added later.
    const moves = getAllValidMoves(boardState, color, []); 
    
    if (isMaximizingPlayer) {
        let maxEval = -Infinity;
        for (const move of moves) {
            const tempBoard = JSON.parse(JSON.stringify(boardState));
            const piece = tempBoard[move.from.y][move.from.x];
            tempBoard[move.to.y][move.to.x] = piece;
            tempBoard[move.from.y][move.from.x] = null;

            const evaluation = minimax(tempBoard, depth - 1, alpha, beta, false);
            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) {
                break; // Beta cutoff
            }
        }
        return maxEval;
    } else { // Minimizing player
        let minEval = Infinity;
        for (const move of moves) {
            const tempBoard = JSON.parse(JSON.stringify(boardState));
            const piece = tempBoard[move.from.y][move.from.x];
            tempBoard[move.to.y][move.to.x] = piece;
            tempBoard[move.from.y][move.from.x] = null;

            const evaluation = minimax(tempBoard, depth - 1, alpha, beta, true);
            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) {
                break; // Alpha cutoff
            }
        }
        return minEval;
    }
}