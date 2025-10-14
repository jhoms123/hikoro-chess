// ===================================================================
// Step 2: Bot's Upgraded "Brain" with Time Management
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
        let cx = x + dx;
        let cy = y + dy;
        let pathHasEnemy = false;
        
        let checkX = cx, checkY = cy;
        while(isPositionValid(checkX, checkY)) {
            const checkTarget = boardState[checkY][checkX];
            if (checkTarget && checkTarget.color !== piece.color) {
                pathHasEnemy = true;
                break;
            }
            checkX += dx; checkY += dy;
        }

        if (!pathHasEnemy) {
            while (isPositionValid(cx, cy)) {
                const target = boardState[cy][cx];
                if (target === null) {
                    moves.push({ x: cx, y: cy, isAttack: false });
                } else {
                    break;
                }
                cx += dx; cy += dy;
            }
            return;
        }

        cx = x + dx;
        cy = y + dy;
        while (isPositionValid(cx, cy)) {
            const target = boardState[cy][cx];
            if (target === null) {
                moves.push({ x: cx, y: cy, isAttack: false });
            } else if (target.color !== piece.color) {
                if (!isProtected(target, cx, cy, boardState)) {
                    moves.push({ x: cx, y: cy, isAttack: true });
                }
                break;
            }
            cx += dx;
            cy += dy;
        }
    };

    const generateLineMoves = (dx, dy) => {
        let cx = x + dx, cy = y + dy;
        while (isPositionValid(cx, cy)) {
            const target = boardState[cy][cx];
            if (target === null) {
                moves.push({ x: cx, y: cy, isAttack: false });
            } else {
                if (target.color !== piece.color) {
                    if (!isProtected(target, cx, cy, boardState)) {
                        moves.push({ x: cx, y: cy, isAttack: true });
                    }
                }
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
        case 'cope': { const fwdDir = piece.color === 'white' ? 1 : -1; const generateCopeMoves = (moveFunc) => { moveFunc(x + 2, y + 2 * fwdDir); moveFunc(x - 2, y + 2 * fwdDir); moveFunc(x, y + 1 * fwdDir); moveFunc(x, y + 2 * fwdDir); moveFunc(x, y - 1 * fwdDir); moveFunc(x, y - 2 * fwdDir); }; if (bonusMoveActive) { generateCopeMoves(addNonCaptureMove); } else { generateCopeMoves(addMove); } break; }
        case 'chair': generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1); generateLineMoves(0, 1); generateLineMoves(0, -1); break;
        case 'jotu':
            generateJotuJumpMoves(1, 0); 
            generateJotuJumpMoves(-1, 0);
            if (piece.color === 'white') { 
                generateJotuJumpMoves(0, 1); 
                addMove(x, y - 1);
            }
            else { 
                generateJotuJumpMoves(0, -1); 
                addMove(x, y + 1);
            }
            break;
        case 'kor':
            addMove(x - 1, y - 1); addMove(x - 1, y + 1); addMove(x + 1, y + 1); addMove(x + 1, y - 1);
            [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) + Math.abs(dy) === 3) addMove(x + dx, y + dy); }));
            break;
        case 'finor':
            generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1);
            [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) + Math.abs(dy) === 3) addMove(x + dx, y + dy); }));
            break;
        case 'greatshield':
            const gsDir = piece.color === 'white' ? 1 : -1;
            addNonCaptureMove(x, y + gsDir);
            addNonCaptureMove(x - 1, y + gsDir);
            addNonCaptureMove(x + 1, y + gsDir);
            addNonCaptureMove(x, y - gsDir);
            break;
        case 'greathorsegeneral': {
            const ghgDir = piece.color === 'white' ? 1 : -1;
            if (bonusMoveActive) {
                for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    addNonCaptureMove(x + dx, y + dy);
                }
                [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addNonCaptureMove(x + dx, y + dy); }));
                generateNonCaptureLineMoves(-1, ghgDir);
                generateNonCaptureLineMoves(1, ghgDir);
                generateNonCaptureLineMoves(0, -ghgDir);
            } else {
                for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    addMove(x + dx, y + dy);
                }
                [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); }));
                generateLineMoves(-1, ghgDir);
                generateLineMoves(1, ghgDir);
                generateLineMoves(0, -ghgDir);
            }
            break;
        }
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
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); }
            addMove(x + 2, y + 2 * fwdDir); addMove(x - 2, y + 2 * fwdDir);
            addMove(x, y + 1 * fwdDir); addMove(x, y + 2 * fwdDir);
            addMove(x, y - 1 * fwdDir); addMove(x, y - 2 * fwdDir);
            break;
        }
        case 'mermaid': {
            for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
                if (dx === 0 && dy === 0) continue;
                addMove(x + dx, y + dy);
            }
            break;
        }
		case 'cthulhu': {
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    addMove(x + dx, y + dy);
                }
            }
            [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { 
                if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); 
            }));
            const ghgDir = piece.color === 'white' ? 1 : -1;
            generateLineMoves(-1, ghgDir);
            generateLineMoves(1, ghgDir);
            generateLineMoves(0, -ghgDir);
            break;
        }
    }
    return moves;
}


const pieceValues = {
    'pawn': 100, 'sult': 100, 'pilut': 150, 'fin': 300, 'cope': 320, 'chair': 500,
    'greatshield': 400, 'finor': 550, 'jotu': 800, 'mermaid': 850, 'neptune': 1000,
    'greathorsegeneral': 1200, 'cthulhu': 1500, 'lupa': 20000, 'zur': 1100
};

const pawnPositionValue = [
    [0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1],[2,2,2,2,2,2,2,2,2,2],[3,3,3,3,3,3,3,3,3,3],
    [4,4,4,4,4,4,4,4,4,4],[5,5,5,5,5,5,5,5,5,5],[10,10,10,10,10,10,10,10,10,10],[20,20,20,20,20,20,20,20,20,20],
    [30,30,30,30,30,30,30,30,30,30],[0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0]
];

function evaluateBoard(boardState) {
    let totalScore = 0;
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y][x];
            if (piece) {
                const value = pieceValues[piece.type] || 0;
                let positionValue = 0;
                if (piece.type === 'pawn' || piece.type === 'sult') {
                    positionValue = (piece.color === 'white') ? pawnPositionValue[y][x] : pawnPositionValue[BOT_BOARD_HEIGHT - 1 - y][x];
                }
                totalScore += (piece.color === 'white') ? (value + positionValue) : -(value + positionValue);
            }
        }
    }
    return totalScore;
}

function getAllValidMoves(boardState, color, capturedPieces) {
    const allMoves = [];
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
                    if (isPositionValid(x, y) && boardState[y][x] === null) {
                        allMoves.push({ type: 'drop', pieceType: pieceType, to: { x, y }, isAttack: false });
                    }
                }
            }
        }
    }
    return allMoves;
}

// NEW: Main entry point for the bot with a time limit
function findBestMoveWithTimeLimit(boardState, capturedPieces) {
    const startTime = Date.now();
    const timeLimit = 4000; // 4 seconds
    let bestMoveFound = null;

    // Iterative Deepening: Search at depth 1, then 2, then 3, and so on.
    for (let depth = 1; depth <= 10; depth++) { // Search up to a max depth of 10
        console.log(`Searching at depth: ${depth}`);
        const result = findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit);

        if (Date.now() - startTime >= timeLimit) {
            console.log(`Time limit reached during depth ${depth}. Using best move from depth ${depth - 1}.`);
            break; // Time is up, break out of the loop
        }

        // A full depth search completed in time, so we can trust this result
        bestMoveFound = result;
    }
    
    // If no move was ever found (e.g., time runs out on depth 1), pick a random one
    if (!bestMoveFound) {
        console.log("Time ran out on initial search, picking a fallback move.");
        const moves = getAllValidMoves(boardState, 'black', capturedPieces);
        bestMoveFound = moves[Math.floor(Math.random() * moves.length)];
    }

    return bestMoveFound;
}

// This function performs the actual search for a given depth
function findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit) {
    let bestMove = null;
    let bestValue = -Infinity;

    const moves = getAllValidMoves(boardState, 'black', capturedPieces);
    moves.sort((a, b) => b.isAttack - a.isAttack); // Prioritize captures
    
    for (const move of moves) {
        // IMPORTANT: Check the time before analyzing each new move
        if (Date.now() - startTime >= timeLimit) {
            return null; // Signal that the search should be aborted
        }

        const tempBoard = JSON.parse(JSON.stringify(boardState));
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


// Minimax and Quiescence search functions remain the same as before
function minimax(boardState, depth, alpha, beta, isMaximizingPlayer) {
    if (depth === 0) {
        return quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer);
    }
    const color = isMaximizingPlayer ? 'black' : 'white';
    const moves = getAllValidMoves(boardState, color, []);
    if (moves.length === 0) {
        return evaluateBoard(boardState);
    }
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
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            const tempBoard = JSON.parse(JSON.stringify(boardState));
            const piece = tempBoard[move.from.y][move.from.x];
            tempBoard[move.to.y][move.to.x] = piece;
            tempBoard[move.from.y][move.from.x] = null;
            const evaluation = minimax(tempBoard, depth - 1, alpha, beta, true);
            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer) {
    let stand_pat = evaluateBoard(boardState);
    if (isMaximizingPlayer) {
        if (stand_pat >= beta) return beta;
        alpha = Math.max(alpha, stand_pat);
    } else {
        if (stand_pat <= alpha) return alpha;
        beta = Math.min(beta, stand_pat);
    }
    const color = isMaximizingPlayer ? 'black' : 'white';
    const captureMoves = getAllValidMoves(boardState, color, []).filter(move => move.isAttack);
    for (const move of captureMoves) {
        const tempBoard = JSON.parse(JSON.stringify(boardState));
        const piece = tempBoard[move.from.y][move.from.x];
        tempBoard[move.to.y][move.to.x] = piece;
        tempBoard[move.from.y][move.from.x] = null;
        let score = quiescenceSearch(tempBoard, alpha, beta, !isMaximizingPlayer);
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