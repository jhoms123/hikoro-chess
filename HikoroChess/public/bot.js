// This file contains all the logic for the AI bot.

// ===================================================================
// Step 1: Game Logic for the Bot (copied from gamelogic.js)
// The bot needs its own understanding of the game's rules.
// ===================================================================

const BOT_BOARD_WIDTH = 10;
const BOT_BOARD_HEIGHT = 16;

function isPositionValid(x, y) {
    if (x < 0 || y < 0 || x >= BOT_BOARD_WIDTH || y >= BOT_BOARD_HEIGHT) return false;
    if ((x <= 1 && y <= 2) || (x >= 8 && y <= 2)) return false;
    if ((x <= 1 && y >= 13) || (x >= 8 && y >= 13)) return false;
    return true;
}

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
// Step 2: Bot's "Brain"
// ===================================================================

const pieceValues = {
    'pawn': 10, 'sult': 10, 'pilut': 20, 'fin': 30, 'cope': 40, 'chair': 50,
    'greatshield': 60, 'finor': 70, 'jotu': 80, 'mermaid': 90, 'neptune': 100,
    'greathorsegeneral': 120, 'cthulhu': 150, 'lupa': 9999
};

function evaluateBoard(boardState) {
    let totalScore = 0;
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y][x];
            if (piece) {
                const value = pieceValues[piece.type] || 0;
                if (piece.color === 'white') {
                    totalScore += value;
                } else {
                    totalScore -= value;
                }
            }
        }
    }
    return totalScore;
}

function getAllValidMoves(boardState, color) {
    const allMoves = [];
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y][x];
            if (piece && piece.color === color) {
                const validMoves = getValidMovesForPiece(piece, x, y, boardState, false);
                for (const move of validMoves) {
                    allMoves.push({
                        from: { x, y },
                        to: { x: move.x, y: move.y },
                        isAttack: move.isAttack
                    });
                }
            }
        }
    }
    return allMoves;
}

function findBestMove(boardState) {
    let bestMove = null;
    let bestValue = -Infinity;
    
    // The bot is always black, the maximizing player.
    const moves = getAllValidMoves(boardState, 'black');
    
    // Simple strategy: prefer captures
    moves.sort((a, b) => (b.isAttack ? 1 : 0) - (a.isAttack ? 1 : 0));

    for (const move of moves) {
        const tempBoard = JSON.parse(JSON.stringify(boardState));
        const piece = tempBoard[move.from.y][move.from.x];
        
        // Simulate capture
        const targetPiece = tempBoard[move.to.y][move.to.x];
        
        tempBoard[move.to.y][move.to.x] = piece;
        tempBoard[move.from.y][move.from.x] = null;
        
        // Minimax at depth 1 (looks one move ahead for the opponent)
        let boardValue = minimax(tempBoard, 1, false); // Pass 'false' for minimizing player (white's turn)
        
        // Add a small random factor to avoid repetitive moves
        boardValue += Math.random() * 0.1;

        if (boardValue > bestValue) {
            bestValue = boardValue;
            bestMove = move;
        }
    }
    return bestMove;
}

function minimax(boardState, depth, isMaximizingPlayer) {
    if (depth === 0) {
        return evaluateBoard(boardState);
    }
    
    const color = isMaximizingPlayer ? 'black' : 'white';
    const moves = getAllValidMoves(boardState, color);
    let bestValue = isMaximizingPlayer ? -Infinity : Infinity;

    for (const move of moves) {
        const tempBoard = JSON.parse(JSON.stringify(boardState));
        const piece = tempBoard[move.from.y][move.from.x];
        tempBoard[move.to.y][move.to.x] = piece;
        tempBoard[move.from.y][move.from.x] = null;

        const value = minimax(tempBoard, depth - 1, !isMaximizingPlayer);
        bestValue = isMaximizingPlayer ? Math.max(bestValue, value) : Math.min(bestValue, value);
    }

    return bestValue;
}