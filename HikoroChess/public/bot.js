// ===================================================================
//              Hikoro Chess Bot - Fully Upgraded
// ===================================================================

const BOT_BOARD_WIDTH = 10;
const BOT_BOARD_HEIGHT = 16;

// ===================================================================
// Section 1: Core Helper Functions
// ===================================================================

function copyBoard(boardState) {
    const newBoard = [];
    for (let i = 0; i < boardState.length; i++) {
        newBoard.push([...boardState[i]]);
    }
    return newBoard;
}

function isPositionValid(x, y) {
    if (x < 0 || y < 0 || x >= BOT_BOARD_WIDTH || y >= BOT_BOARD_HEIGHT) return false;
    if ((x <= 1 && y <= 2) || (x >= 8 && y <= 2)) return false;
    if ((x <= 1 && y >= 13) || (x >= 8 && y >= 13)) return false;
    return true;
}

const isProtected = (targetPiece, targetX, targetY, board) => {
    // ... (Your original isProtected logic remains unchanged)
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

/**
 * Checks if a given square (x, y) is attacked by any piece of the attackingColor.
 */
function isSquareAttackedBy(targetX, targetY, boardState, attackingColor) {
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y][x];
            if (piece && piece.color === attackingColor) {
                const moves = getValidMovesForPiece(piece, x, y, boardState, false);
                for (const move of moves) {
                    // Check for any move landing on the target square. For safety, we assume any move could be an attack.
                    if (move.x === targetX && move.y === targetY) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

// ===================================================================
// Section 2: Move Generation
// ===================================================================

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
                const target = boardState[cy][cx];
                if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); } else { break; }
                cx += dx; cy += dy;
            }
            return;
        }
        cx = x + dx; cy = y + dy;
        while (isPositionValid(cx, cy)) {
            const target = boardState[cy][cx];
            if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); } else if (target.color !== piece.color) {
                if (!isProtected(target, cx, cy, boardState)) { moves.push({ x: cx, y: cy, isAttack: true }); }
                break;
            }
            cx += dx; cy += dy;
        }
    };
    const generateLineMoves = (dx, dy) => {
        let cx = x + dx, cy = y + dy;
        while (isPositionValid(cx, cy)) {
            const target = boardState[cy][cx];
            if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); } else {
                if (target.color !== piece.color) { if (!isProtected(target, cx, cy, boardState)) { moves.push({ x: cx, y: cy, isAttack: true }); } }
                break;
            }
            cx += dx; cy += dy;
        }
    };
    const generateNonCaptureLineMoves = (dx, dy) => {
        let cx = x + dx, cy = y + dy;
        while (isPositionValid(cx, cy) && boardState[cy][cx] === null) {
            moves.push({ x: cx, y: cy, isAttack: false });
            cx += dx; cy += dy;
        }
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
        case 'cope': { const fwdDir = piece.color === 'white' ? 1 : -1; const generateCpeMoves = (moveFunc) => { moveFunc(x + 2, y + 2 * fwdDir); moveFunc(x - 2, y + 2 * fwdDir); moveFunc(x, y + 1 * fwdDir); moveFunc(x, y + 2 * fwdDir); moveFunc(x, y - 1 * fwdDir); moveFunc(x, y - 2 * fwdDir); }; if (bonusMoveActive) { generateCpeMoves(addNonCaptureMove); } else { generateCpeMoves(addMove); } break; }
        case 'chair': generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1); generateLineMoves(0, 1); generateLineMoves(0, -1); break;
        case 'jotu': generateJotuJumpMoves(1, 0); generateJotuJumpMoves(-1, 0); if (piece.color === 'white') { generateJotuJumpMoves(0, 1); addMove(x, y - 1); } else { generateJotuJumpMoves(0, -1); addMove(x, y + 1); } break;
        case 'kor': addMove(x - 1, y - 1); addMove(x - 1, y + 1); addMove(x + 1, y + 1); addMove(x + 1, y - 1); [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) + Math.abs(dy) === 3) addMove(x + dx, y + dy); })); break;
        case 'finor': generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1); [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) + Math.abs(dy) === 3) addMove(x + dx, y + dy); })); break;
        case 'greatshield': { const gsDir = piece.color === 'white' ? 1 : -1; addNonCaptureMove(x, y + gsDir); addNonCaptureMove(x - 1, y + gsDir); addNonCaptureMove(x + 1, y + gsDir); addNonCaptureMove(x, y - gsDir); break; }
        case 'greathorsegeneral': { const ghgDir = piece.color === 'white' ? 1 : -1; if (bonusMoveActive) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addNonCaptureMove(x + dx, y + dy); } [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addNonCaptureMove(x + dx, y + dy); })); generateNonCaptureLineMoves(-1, ghgDir); generateNonCaptureLineMoves(1, ghgDir); generateNonCaptureLineMoves(0, -ghgDir); } else { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); })); generateLineMoves(-1, ghgDir); generateLineMoves(1, ghgDir); generateLineMoves(0, -ghgDir); } break; }
        case 'neptune': {
            const fwdDir = piece.color === 'white' ? 1 : -1;
            const directions = [
                {dx: 1, dy: fwdDir}, {dx: -1, dy: fwdDir}, {dx: 0, dy: fwdDir}, {dx: 0, dy: -fwdDir}
            ];
            directions.forEach(({dx, dy}) => {
                let cx = x + dx; let cy = y + dy; let screenFound = false;
                while (isPositionValid(cx, cy)) {
                    const target = boardState[cy][cx];
                    if (!screenFound) { if (target !== null) { screenFound = true; } } 
                    else {
                        if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); } 
                        else { if(target.color !== piece.color && !isProtected(target, cx, cy, boardState)) { moves.push({ x: cx, y: cy, isAttack: true }); } break; }
                    }
                    cx += dx; cy += dy;
                }
            });
            // The typo was here (dy++ changed to dx++)
            for (let dx = -1; dx <= 1; dx++) { 
                for (let dy = -1; dy <= 1; dy++) { 
                    if (dx === 0 && dy === 0) continue; 
                    addMove(x + dx, y + dy); 
                }
            }
            addMove(x + 2, y + 2 * fwdDir); addMove(x - 2, y + 2 * fwdDir);
            addMove(x, y + 1 * fwdDir); addMove(x, y + 2 * fwdDir);
            addMove(x, y - 1 * fwdDir); addMove(x, y - 2 * fwdDir);
            break;
        }
        case 'mermaid': { for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } break; }
        case 'cthulhu': { for (let dx = -2; dx <= 2; dx++) { for (let dy = -2; dy <= 2; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } } [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); })); const ghgDir = piece.color === 'white' ? 1 : -1; generateLineMoves(-1, ghgDir); generateLineMoves(1, ghgDir); generateLineMoves(0, -ghgDir); break; }
    }
    return moves;
}

// ===================================================================
// Section 3: Evaluation, Piece Values, and Piece-Square Tables
// ===================================================================

const pieceValues = {
    'pawn': 100, 'sult': 100, 'pilut': 150, 'fin': 300, 'cope': 320, 'kor': 330, 'yoli': 340, 'chair': 500,
    'greatshield': 400, 'finor': 550, 'jotu': 800, 'mermaid': 850, 'neptune': 1000, 'kota': 1050,
    'greathorsegeneral': 1200, 'zur': 1100, 'cthulhu': 1500, 'lupa': 20000
};

// Helper function to create a mirrored board for black pieces
function mirrorPST(table) {
    return [...table].reverse();
}

// --- Piece-Square Tables (PSTs) ---
// These tables give bonuses or penalties based on a piece's position.
// A piece in the center is generally stronger than one on the edge.

const pawnPositionValue = [
    [0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0], [1,1,1,1,1,1,1,1,1,1], [2,2,2,2,2,2,2,2,2,2], [3,3,3,3,3,3,3,3,3,3],
    [5,5,5,5,5,5,5,5,5,5], [8,8,8,8,8,8,8,8,8,8], [10,10,10,10,10,10,10,10,10,10], [15,15,15,15,15,15,15,15,15,15],
    [25,25,25,25,25,25,25,25,25,25], [40,40,40,40,40,40,40,40,40,40], [0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0]
];

// Knight-like pieces (Kor, Yoli) love the center outposts.
const knightPositionValue = [
    [-10,-5,-5,-5,-5,-5,-5,-5,-5,-10], [-5, 0, 5, 5, 5, 5, 5, 5, 0,-5], [-5, 5,10,15,15,15,15,10, 5,-5], [-5, 5,15,20,20,20,20,15, 5,-5],
    [-5, 5,15,20,20,20,20,15, 5,-5], [-5, 5,15,20,20,20,20,15, 5,-5], [-5, 5,15,20,20,20,20,15, 5,-5], [-5, 5,15,20,20,20,20,15, 5,-5],
    [-5, 5,15,20,20,20,20,15, 5,-5], [-5, 5,15,20,20,20,20,15, 5,-5], [-5, 5,15,20,20,20,20,15, 5,-5], [-5, 5,10,15,15,15,15,10, 5,-5],
    [-5, 0, 5, 5, 5, 5, 5, 5, 0,-5], [-10,-5,-5,-5,-5,-5,-5,-5,-5,-10], [-10,-5,-5,-5,-5,-5,-5,-5,-5,-10], [-10,-5,-5,-5,-5,-5,-5,-5,-5,-10]
];

// Bishop-like pieces (Fin, Chair) thrive on open diagonals.
const bishopPositionValue = [
    [-5,-5,-5,-5,-5,-5,-5,-5,-5,-5], [-5, 5, 5, 5, 5, 5, 5, 5, 5,-5], [-5, 5,10,10,10,10,10,10, 5,-5], [-5, 5,10,15,15,15,15,10, 5,-5],
    [-5, 5,10,15,15,15,15,10, 5,-5], [-5, 5,10,15,15,15,15,10, 5,-5], [-5, 5,10,15,15,15,15,10, 5,-5], [-5, 5,10,15,15,15,15,10, 5,-5],
    [-5, 5,10,15,15,15,15,10, 5,-5], [-5, 5,10,15,15,15,15,10, 5,-5], [-5, 5,10,15,15,15,15,10, 5,-5], [-5, 5,10,10,10,10,10,10, 5,-5],
    [-5, 5, 5, 5, 5, 5, 5, 5, 5,-5], [-5,-5,-5,-5,-5,-5,-5,-5,-5,-5], [-5,-5,-5,-5,-5,-5,-5,-5,-5,-5], [-5,-5,-5,-5,-5,-5,-5,-5,-5,-5]
];

// Rook-like pieces (Jotu, Neptune) want open files and ranks.
const rookPositionValue = [
    [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0],
    [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0],
    [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0],
    [15,15,15,15,15,15,15,15,15,15], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0], [ 0, 0, 5, 10, 10, 10, 10, 5, 0, 0]
];

// Major pieces (Zur, GHG, Cthulhu) are queens. They want to be everywhere.
const queenPositionValue = [
    [-10,-5,-5,-5,-5,-5,-5,-5,-5,-10], [-5, 0, 5, 5, 5, 5, 5, 5, 0,-5], [-5, 5,10,15,15,15,15,10, 5,-5], [-5, 5,15,20,20,20,20,15, 5,-5],
    [-5, 5,15,25,25,25,25,15, 5,-5], [-5, 5,15,25,25,25,25,15, 5,-5], [-5, 5,15,25,25,25,25,15, 5,-5], [-5, 5,15,25,25,25,25,15, 5,-5],
    [-5, 5,15,25,25,25,25,15, 5,-5], [-5, 5,15,25,25,25,25,15, 5,-5], [-5, 5,15,20,20,20,20,15, 5,-5], [-5, 5,10,15,15,15,15,10, 5,-5],
    [-5, 0, 5, 5, 5, 5, 5, 5, 0,-5], [-10,-5,-5,-5,-5,-5,-5,-5,-5,-10], [-10,-5,-5,-5,-5,-5,-5,-5,-5,-10], [-10,-5,-5,-5,-5,-5,-5,-5,-5,-10]
];

const piecePST = {
    'pawn': pawnPositionValue, 'sult': pawnPositionValue, 'pilut': pawnPositionValue, 'cope': pawnPositionValue,
    'kor': knightPositionValue, 'yoli': knightPositionValue,
    'fin': bishopPositionValue, 'chair': bishopPositionValue, 'greatshield': bishopPositionValue,
    'jotu': rookPositionValue, 'neptune': rookPositionValue,
    'zur': queenPositionValue, 'greathorsegeneral': queenPositionValue, 'cthulhu': queenPositionValue, 'mermaid': queenPositionValue,
    'finor': queenPositionValue, 'kota': queenPositionValue
};

function evaluateBoard(boardState) {
    let totalScore = 0;
    let whiteLupaPositions = [];
    let blackLupaPositions = [];

    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y][x];
            if (piece) {
                const value = pieceValues[piece.type] || 0;
                let positionValue = 0;
                
                const table = piecePST[piece.type];
                if (table) {
                    const pst = (piece.color === 'white') ? table : mirrorPST(table);
                    positionValue = pst[y] ? (pst[y][x] || 0) : 0;
                }

                totalScore += (piece.color === 'white') ? (value + positionValue) : -(value + positionValue);
                
                if (piece.type === 'lupa') {
                    if (piece.color === 'white') whiteLupaPositions.push({x, y});
                    else blackLupaPositions.push({x, y});
                }
            }
        }
    }

    // Lupa Safety Check: Apply a heavy penalty if a Lupa is attacked.
    for (const pos of whiteLupaPositions) {
        if (isSquareAttackedBy(pos.x, pos.y, boardState, 'black')) {
            totalScore -= 500;
        }
    }
    for (const pos of blackLupaPositions) {
        if (isSquareAttackedBy(pos.x, pos.y, boardState, 'white')) {
            totalScore += 500;
        }
    }
    
    return totalScore;
}


// ===================================================================
// Section 4: AI Search Logic (Minimax, Quiescence, Move Ordering)
// ===================================================================

/**
 * A more efficient function that only generates capture moves for the Quiescence Search.
 */
function getCaptureMoves(boardState, color) {
    const captureMoves = [];
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y][x];
            if (piece && piece.color === color) {
                const allPieceMoves = getValidMovesForPiece(piece, x, y, boardState, false);
                for (const move of allPieceMoves) {
                    if (move.isAttack) {
                        captureMoves.push({ type: 'board', from: { x, y }, to: { x: move.x, y: move.y }, isAttack: true });
                    }
                }
            }
        }
    }
    return captureMoves;
}

/**
 * Generates all valid moves, including safe drop moves.
 */
function getAllValidMoves(boardState, color, capturedPieces) {
    const allMoves = [];
    const opponentColor = color === 'white' ? 'black' : 'white';
    
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y][x];
            if (piece && piece.color === color) {
                const validMoves = getValidMovesForPiece(piece, x, y, boardState, false);
                for (const move of validMoves) {
                    allMoves.push({ type: 'board', from: { x, y }, to: { x: move.x, y: move.y }, isAttack: move.isAttack });
                }
            }
        }
    }

    if (capturedPieces && capturedPieces.length > 0) {
        const uniquePieceTypes = [...new Set(capturedPieces.map(p => p.type))];
        for (const pieceType of uniquePieceTypes) {
            for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
                for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
                    // Drop move is only valid if the square is empty AND not attacked by the opponent.
                    if (isPositionValid(x, y) && boardState[y][x] === null && !isSquareAttackedBy(x, y, boardState, opponentColor)) {
                        allMoves.push({ type: 'drop', pieceType: pieceType, to: { x, y }, isAttack: false });
                    }
                }
            }
        }
    }
    return allMoves;
}

/**
 * Main entry point for the bot with a time limit, using iterative deepening.
 */
function findBestMoveWithTimeLimit(boardState, capturedPieces) {
    const startTime = Date.now();
    const timeLimit = 4000;
    let bestMoveFound = null;

    for (let depth = 1; depth <= 5; depth++) { 
        console.log(`Searching at depth: ${depth}`);
        let result;
        try {
            result = findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit);
        } catch (e) {
            if (e.message === 'TimeLimitExceeded') {
                console.log(`Time limit reached during depth ${depth}. Using best move from previous depth.`);
                break; // Exit loop if time runs out
            }
            throw e; // Re-throw other errors
        }

        if (result) {
            bestMoveFound = result;
        }

        if (Date.now() - startTime >= timeLimit) {
            break;
        }
    }
    
    if (!bestMoveFound) {
        console.log("Time ran out or no move found, picking a fallback move.");
        const moves = getAllValidMoves(boardState, 'black', capturedPieces);
        if (moves.length > 0) {
            bestMoveFound = moves[Math.floor(Math.random() * moves.length)];
        }
    }

    return bestMoveFound;
}

/**
 * This function performs the actual search for a given depth with MVV-LVA move ordering.
 */
function findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit) {
    let bestMove = null;
    let bestValue = Infinity;

    const moves = getAllValidMoves(boardState, 'black', capturedPieces);

    // MVV-LVA Move Ordering: Prioritize the most valuable captures.
    moves.sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;
        if (a.isAttack && a.type === 'board') {
            const victim = boardState[a.to.y][a.to.x];
            const aggressor = boardState[a.from.y][a.from.x];
            if (victim && aggressor) {
                scoreA = (pieceValues[victim.type] || 0) - (pieceValues[aggressor.type] || 0);
            }
        }
        if (b.isAttack && b.type === 'board') {
            const victim = boardState[b.to.y][b.to.x];
            const aggressor = boardState[b.from.y][b.from.x];
            if (victim && aggressor) {
                scoreB = (pieceValues[victim.type] || 0) - (pieceValues[aggressor.type] || 0);
            }
        }
        return scoreB - scoreA;
    });
    
    for (const move of moves) {
        const tempBoard = copyBoard(boardState);
        if (move.type === 'drop') {
            tempBoard[move.to.y][move.to.x] = { type: move.pieceType, color: 'black' };
        } else {
            const piece = tempBoard[move.from.y][move.from.x];
            tempBoard[move.to.y][move.to.x] = piece;
            tempBoard[move.from.y][move.from.x] = null;
        }

        let boardValue = minimax(tempBoard, depth - 1, -Infinity, Infinity, true, startTime, timeLimit);
        
        if (boardValue < bestValue) {
            bestValue = boardValue;
            bestMove = move;
        }
    }
    
    return bestMove;
}

/**
 * The core minimax algorithm with alpha-beta pruning.
 */
function minimax(boardState, depth, alpha, beta, isMaximizingPlayer, startTime, timeLimit) {
    if (Date.now() - startTime >= timeLimit) {
        throw new Error('TimeLimitExceeded');
    }

    if (depth === 0) {
        return quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer, startTime, timeLimit);
    }
    
    const color = isMaximizingPlayer ? 'white' : 'black';
    const moves = getAllValidMoves(boardState, color, []); // No drops inside search
    if (moves.length === 0) {
        return evaluateBoard(boardState);
    }

    if (isMaximizingPlayer) {
        let maxEval = -Infinity;
        for (const move of moves) {
            const tempBoard = copyBoard(boardState);
            const piece = tempBoard[move.from.y][move.from.x];
            tempBoard[move.to.y][move.to.x] = piece;
            tempBoard[move.from.y][move.from.x] = null;
            const evaluation = minimax(tempBoard, depth - 1, alpha, beta, false, startTime, timeLimit);
            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            const tempBoard = copyBoard(boardState);
            const piece = tempBoard[move.from.y][move.from.x];
            tempBoard[move.to.y][move.to.x] = piece;
            tempBoard[move.from.y][move.from.x] = null;
            const evaluation = minimax(tempBoard, depth - 1, alpha, beta, true, startTime, timeLimit);
            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

/**
 * A search that only evaluates captures to avoid the horizon effect.
 */
function quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer, startTime, timeLimit, depth = 5) {
    if (Date.now() - startTime >= timeLimit) {
        throw new Error('TimeLimitExceeded');
    }
    if (depth === 0) {
        return evaluateBoard(boardState);
    }
    
    let stand_pat = evaluateBoard(boardState);
    if (isMaximizingPlayer) {
        if (stand_pat >= beta) return beta;
        alpha = Math.max(alpha, stand_pat);
    } else {
        if (stand_pat <= alpha) return alpha;
        beta = Math.min(beta, stand_pat);
    }
    
    const color = isMaximizingPlayer ? 'white' : 'black';
    const captureMoves = getCaptureMoves(boardState, color);

    for (const move of captureMoves) {
        const tempBoard = copyBoard(boardState);
        const piece = tempBoard[move.from.y][move.from.x];
        tempBoard[move.to.y][move.to.x] = piece;
        tempBoard[move.from.y][move.from.x] = null;
        
        let score = quiescenceSearch(tempBoard, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, depth - 1);
        if (isMaximizingPlayer) {
            alpha = Math.max(alpha, score);
            if (beta <= alpha) break;
        } else {
            beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
    }
    return isMaximizingPlayer ? alpha : beta;
}