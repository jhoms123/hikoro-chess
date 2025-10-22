// ===================================================================
//              Hikoro Chess Bot - Enhanced Strategy
// ===================================================================

const BOT_BOARD_WIDTH = 10;
const BOT_BOARD_HEIGHT = 16;

// ===================================================================
// Section 1: Core Helper Functions & New Rule Constants
// ===================================================================

// --- Palace Definitions (Mirrored from gamelogic.js) ---
const whitePalace = { minY: 0, maxY: 1, minX: 3, maxX: 6 };
const blackPalace = { minY: 14, maxY: 15, minX: 3, maxX: 6 };

// --- Sanctuary Squares Definition ---
const botSanctuarySquares = [
    {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
    {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
];

// --- Function to check King Restriction (Mirrored from gamelogic.js) ---
function isKingRestricted(color, boardState) {
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y]?.[x];
            if (piece && piece.type === 'prince' && piece.color === color) {
                return true;
            }
        }
    }
    return false;
}
// --- End New Rule Helpers ---

function copyBoard(boardState) {
    const newBoard = [];
    for (let i = 0; i < boardState.length; i++) {
        if (Array.isArray(boardState[i])) {
             newBoard.push([...boardState[i]]);
        } else {
             console.error("Invalid board state row detected in copyBoard:", boardState[i]);
             newBoard.push([]);
        }
    }
    return newBoard;
}

function isPositionValid(x, y) {
    if (x < 0 || y < 0 || x >= BOT_BOARD_WIDTH || y >= BOT_BOARD_HEIGHT) return false;
    // Keep invalid corner logic if your game still uses it
    // if ((x <= 1 && y <= 2) || (x >= 8 && y <= 2)) return false;
    // if ((x <= 1 && y >= 13) || (x >= 8 && y >= 13)) return false;
    return true;
}

const isProtected = (targetPiece, targetX, targetY, board) => {
    // This logic needs to correctly handle the board array structure
    const protectingColor = targetPiece.color;
    const inFrontDir = protectingColor === 'white' ? 1 : -1;
    const pilutProtectorY = targetY + inFrontDir;

    // Check Pilut protection
    if (isPositionValid(targetX, pilutProtectorY)) {
        const potentialProtector = board[pilutProtectorY]?.[targetX];
        if (potentialProtector && potentialProtector.type === 'pilut' && potentialProtector.color === protectingColor) {
            return true;
        }
    }

    // Check Greatshield protection
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const gsX = targetX + dx;
            const gsY = targetY + dy;
            if (isPositionValid(gsX, gsY)) {
                const potentialProtector = board[gsY]?.[gsX];
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


function isSquareAttackedBy(targetX, targetY, boardState, attackingColor) {
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y]?.[x];
            if (piece && piece.color === attackingColor) {
                // Pass boardState correctly
                const moves = getValidMovesForPiece(piece, x, y, boardState, false);
                for (const move of moves) {
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
// Section 2: Move Generation (Updated for Prince/Palace)
// ===================================================================

function getValidMovesForPiece(piece, x, y, boardState, bonusMoveActive = false) {
    if (!piece) return [];
    const moves = [];
    const color = piece.color;
    const fwd = color === 'white' ? 1 : -1; // Forward direction

    // --- Add Move Helpers (with Palace Check integrated) ---
    const addMove = (toX, toY) => {
        // --- Palace Restriction Check ---
        if (piece.type === 'lupa' && isKingRestricted(color, boardState)) {
            const palace = color === 'white' ? whitePalace : blackPalace;
            if (toX < palace.minX || toX > palace.maxX || toY < palace.minY || toY > palace.maxY) {
                return;
            }
        }
        // --- End Restriction ---

        if (!isPositionValid(toX, toY)) return;
        const target = boardState[toY]?.[toX];
        if (target === null) {
            moves.push({ x: toX, y: toY, isAttack: false });
        } else if (target.color !== piece.color) {
            if (!isProtected(target, toX, toY, boardState)) {
                moves.push({ x: toX, y: toY, isAttack: true });
            }
        }
    };

    const addNonCaptureMove = (toX, toY) => {
         // --- Palace Restriction Check ---
         if (piece.type === 'lupa' && isKingRestricted(color, boardState)) {
            const palace = color === 'white' ? whitePalace : blackPalace;
            if (toX < palace.minX || toX > palace.maxX || toY < palace.minY || toY > palace.maxY) {
                return;
            }
        }
        // --- End Restriction ---

        if (!isPositionValid(toX, toY)) return;
        if (boardState[toY]?.[toX] === null) {
            moves.push({ x: toX, y: toY, isAttack: false });
        }
    };
    // --- End Add Move Helpers ---

    // --- Other move generation helpers ---
    const generateJotuJumpMoves = (dx, dy) => {
         let cx = x + dx;
         let cy = y + dy;
         let pathHasEnemy = false;

         let checkX = cx, checkY = cy;
         while(isPositionValid(checkX, checkY)) {
             const checkTarget = boardState[checkY]?.[checkX];
             if (checkTarget && checkTarget.color !== piece.color) {
                 pathHasEnemy = true;
                 break;
             }
             checkX += dx; checkY += dy;
         }

         if (!pathHasEnemy) {
             while (isPositionValid(cx, cy)) {
                 const target = boardState[cy]?.[cx];
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
             const target = boardState[cy]?.[cx];
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
             const target = boardState[cy]?.[cx];
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
         while (isPositionValid(cx, cy) && boardState[cy]?.[cx] === null) {
             moves.push({ x: cx, y: cy, isAttack: false });
             cx += dx; cy += dy;
         }
    };
    // --- End other helpers ---

    switch (piece.type) {
        case 'lupa':
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    addMove(x + dx, y + dy);
                }
            }
            break;
        case 'prince':
            addMove(x, y + fwd);
            addMove(x + 1, y + fwd);
            addMove(x - 1, y + fwd);
            addMove(x + 1, y - fwd);
            addMove(x - 1, y - fwd);
            break;
        case 'kota': generateLineMoves(1, 0); generateLineMoves(-1, 0); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } break;
        case 'zur': for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; generateLineMoves(dx, dy); } break;
        case 'fin': generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1); addNonCaptureMove(x + 1, y); addNonCaptureMove(x - 1, y); break;
        case 'yoli': [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); })); addMove(x + 1, y); addMove(x - 1, y); addMove(x, y + 1); addMove(x, y - 1); break;
        case 'pilut': { const dir = piece.color === 'white' ? 1 : -1; if (isPositionValid(x, y + dir) && boardState[y + dir]?.[x] === null) { moves.push({ x: x, y: y + dir, isAttack: false }); if (isPositionValid(x, y + 2 * dir) && boardState[y + 2 * dir]?.[x] === null) { moves.push({ x: x, y: y + 2 * dir, isAttack: false }); } } break; }
        case 'sult': { const fwd = piece.color === 'white' ? 1 : -1; addMove(x - 1, y + fwd); addMove(x + 1, y + fwd); addMove(x, y - fwd); addMove(x, y + fwd); addMove(x, y + 2 * fwd); break; }
        case 'pawn': addMove(x, y + 1); addMove(x, y - 1); addMove(x + 1, y); addMove(x - 1, y); addMove(x + 2, y + 2); addMove(x - 2, y + 2); addMove(x + 2, y - 2); addMove(x - 2, y - 2); break;
        case 'cope': { const fwdDir = piece.color === 'white' ? 1 : -1; const generateCopeMoves = (moveFunc) => { moveFunc(x + 2, y + 2 * fwdDir); moveFunc(x - 2, y + 2 * fwdDir); moveFunc(x, y + 1 * fwdDir); moveFunc(x, y + 2 * fwdDir); moveFunc(x, y - 1 * fwdDir); moveFunc(x, y - 2 * fwdDir); }; if (bonusMoveActive) { generateCopeMoves(addNonCaptureMove); } else { generateCopeMoves(addMove); } break; }
        case 'chair': generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1); generateLineMoves(0, 1); generateLineMoves(0, -1); break;
        case 'jotu': generateJotuJumpMoves(1, 0); generateJotuJumpMoves(-1, 0); if (piece.color === 'white') { generateJotuJumpMoves(0, 1); addMove(x, y - 1); } else { generateJotuJumpMoves(0, -1); addMove(x, y + 1); } break;
        case 'kor': addMove(x - 1, y - 1); addMove(x - 1, y + 1); addMove(x + 1, y + 1); addMove(x + 1, y - 1); [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) + Math.abs(dy) === 3) addMove(x + dx, y + dy); })); break;
        case 'finor': generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1); [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) + Math.abs(dy) === 3) addMove(x + dx, y + dy); })); break;
        case 'greatshield': { const gsDir = piece.color === 'white' ? 1 : -1; addNonCaptureMove(x, y + gsDir); addNonCaptureMove(x - 1, y + gsDir); addNonCaptureMove(x + 1, y + gsDir); addNonCaptureMove(x, y - gsDir); break; }
        case 'greathorsegeneral': { const ghgDir = piece.color === 'white' ? 1 : -1; if (bonusMoveActive) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addNonCaptureMove(x + dx, y + dy); } [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addNonCaptureMove(x + dx, y + dy); })); generateNonCaptureLineMoves(-1, ghgDir); generateNonCaptureLineMoves(1, ghgDir); generateNonCaptureLineMoves(0, -ghgDir); } else { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); })); generateLineMoves(-1, ghgDir); generateLineMoves(1, ghgDir); generateLineMoves(0, -ghgDir); } break; }
        case 'neptune': {
             const fwdDir = piece.color === 'white' ? 1 : -1;
             const directions = [{dx: 1, dy: fwdDir}, {dx: -1, dy: fwdDir}, {dx: 0, dy: fwdDir}, {dx: 0, dy: -fwdDir}];
             directions.forEach(({dx, dy}) => {
                 let cx = x + dx; let cy = y + dy; let screenFound = false;
                 while (isPositionValid(cx, cy)) {
                     const target = boardState[cy]?.[cx];
                     if (!screenFound) { if (target !== null) { screenFound = true; } }
                     else {
                         if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); }
                         else { if(target.color !== piece.color && !isProtected(target, cx, cy, boardState)) { moves.push({ x: cx, y: cy, isAttack: true }); } break; }
                     }
                     cx += dx; cy += dy;
                 }
             });
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
		case 'cthulhu': {
            const cthulhuDir = piece.color === 'white' ? 1 : -1;
            const moveGenerator = bonusMoveActive ? addNonCaptureMove : addMove;
            const lineGenerator = bonusMoveActive ? generateNonCaptureLineMoves : generateLineMoves;

            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    moveGenerator(x + dx, y + dy);
                }
            }
            [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => {
                if (Math.abs(dx) !== Math.abs(dy)) moveGenerator(x + dx, y + dy);
            }));

            lineGenerator(-1, cthulhuDir);
            lineGenerator(1, cthulhuDir);
            lineGenerator(0, -cthulhuDir);
            break;
        }
    }
    return moves;
}

function getBonusMoves(piece, toX, toY, boardState) {
    if (!piece) return [];

    const bonusMovesRaw = getValidMovesForPiece(piece, toX, toY, boardState, true);

    return bonusMovesRaw.map(move => ({
        type: 'board',
        from: { x: toX, y: toY },
        to: { x: move.x, y: move.y },
        isAttack: false
    }));
}

function handleBonusTurn(board, piece, move, depth, alpha, beta, isMaximizingPlayer, startTime, timeLimit) {
    const bonusMoves = getBonusMoves(piece, move.to.x, move.to.y, board);

    if (bonusMoves.length === 0) {
        // After bonus move fails/ends, turn passes to opponent
        return minimax(board, depth - 1, alpha, beta, !isMaximizingPlayer, startTime, timeLimit);
    }

    let bestBonusEval = isMaximizingPlayer ? -Infinity : Infinity;

    for (const bonusMove of bonusMoves) {
         if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');

        const bonusBoard = copyBoard(board);
        const bonusPiece = bonusBoard[bonusMove.from.y]?.[bonusMove.from.x];
         if (!bonusPiece) {
              console.error("Error in handleBonusTurn: piece not found at bonus 'from'.");
              continue;
         }
        bonusBoard[bonusMove.to.y][bonusMove.to.x] = bonusPiece;
        bonusBoard[bonusMove.from.y][bonusMove.from.x] = null;

        // After the bonus move, the turn passes to the opponent.
        const evaluation = minimax(bonusBoard, depth - 1, alpha, beta, !isMaximizingPlayer, startTime, timeLimit);

        if (isMaximizingPlayer) {
            bestBonusEval = Math.max(bestBonusEval, evaluation);
            alpha = Math.max(alpha, bestBonusEval);
        } else {
            bestBonusEval = Math.min(bestBonusEval, evaluation);
            beta = Math.min(beta, bestBonusEval);
        }
        if (beta <= alpha) {
            break;
        }
    }
    return bestBonusEval;
}
// ===================================================================
// Section 3: Evaluation, Piece Values, and Piece-Square Tables (Updated)
// ===================================================================

// [MODIFIED] Added Prince value, adjusted others
const pieceValues = {
    'pawn': 100, 'sult': 150, 'pilut': 120, 'fin': 320, 'cope': 300, 'kor': 330, 'yoli': 330, 'chair': 500,
    'prince': 400, // Added Prince value (similar to minor piece)
    'greatshield': 300, 'finor': 550, 'jotu': 450, 'mermaid': 850, 'neptune': 1000, 'kota': 550,
    'greathorsegeneral': 1200, 'zur': 900, 'cthulhu': 1500, 'lupa': 20000
};

const SANCTUARY_THREAT_PENALTY_BASE = 350; // Penalty for opponent royalty near sanctuary
const SANCTUARY_DEFENSE_BONUS_BASE = 10; // Bonus for bot pieces near threatened sanctuary
const PRINCE_ADVANCEMENT_BONUS = 2; // Bonus per rank the bot's prince has advanced

// PSTs...
const pawnPositionValue = [ // Favors advancing, slight center
    [0,0,0,0,0,0,0,0,0,0], [1,1,1,1,1,1,1,1,1,1], [1,1,2,2,2,2,2,2,1,1], [2,2,3,3,3,3,3,3,2,2], [2,3,3,4,4,4,4,3,3,2],
    [3,4,4,5,5,5,5,4,4,3], [4,5,5,6,6,6,6,5,5,4], [5,6,6,7,7,7,7,6,6,5], [6,7,7,8,8,8,8,7,7,6],
    [8,9,9,9,9,9,9,9,9,8], [10,10,10,10,10,10,10,10,10,10], [10,10,10,10,10,10,10,10,10,10], [5,5,5,5,5,5,5,5,5,5], // Less penalty far back
    [0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0]
];
// [NEW] Prince PST strongly encourages reaching far ranks
const princePositionValue = [
    [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [ 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], [ 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], [10,10,10,10,10,10,10,10,10,10], [10,15,15,15,15,15,15,15,15,10],
    [15,20,20,20,20,20,20,20,20,15], [20,25,25,25,25,25,25,25,25,20], [30,35,35,35,35,35,35,35,35,30], [40,45,45,45,45,45,45,45,45,40], // Rank 9 (y=8)
    [50,55,55,55,55,55,55,55,55,50], [60,65,65,65,65,65,65,65,65,60], [70,75,75,75,75,75,75,75,75,70], [80,85,85,85,85,85,85,85,85,80], // Ranks 12, 13
    [90,95,95,95,95,95,95,95,95,90], [100,100,100,100,100,100,100,100,100,100], [100,100,100,100,100,100,100,100,100,100] // Ranks 15, 16
];

const knightPositionValue = [ /* ... unchanged ... */ ];
const bishopPositionValue = [ /* ... unchanged ... */ ];
const rookPositionValue = [ /* ... unchanged ... */ ];
const queenPositionValue = [ /* ... unchanged ... */ ];
const kingEarlyPST = [ /* ... unchanged ... */ ];
const kingLatePST = [ /* ... unchanged ... */ ];


// [MODIFIED] Added Prince PST mapping
const piecePST = {
    'pawn': pawnPositionValue, 'sult': pawnPositionValue, 'pilut': pawnPositionValue, 'cope': pawnPositionValue,
    'prince': princePositionValue, // Use the new Prince PST
    'kor': knightPositionValue, 'yoli': knightPositionValue,
    'fin': bishopPositionValue, 'chair': bishopPositionValue, 'greatshield': bishopPositionValue,
    'jotu': rookPositionValue, 'neptune': rookPositionValue,
    'zur': queenPositionValue, 'greathorsegeneral': queenPositionValue, 'cthulhu': queenPositionValue, 'mermaid': queenPositionValue,
    'finor': queenPositionValue, 'kota': queenPositionValue
    // Lupa uses dynamic PST based on whether Prince is captured
};

// [MODIFIED] Updated evaluation function
function evaluateBoard(boardState) {
    let totalScore = 0;
    let whiteLupaPos = null;
    let blackLupaPos = null;
    let whitePrincePos = null; // Track Prince positions
    let blackPrincePos = null;
    let whitePrinceOnBoard = false; // Track if they are on board
    let blackPrinceOnBoard = false;
    let pieceCount = 0; // To estimate game phase

    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y]?.[x];
            if (piece) {
                pieceCount++;
                const value = pieceValues[piece.type] || 0;
                let positionValue = 0;
                let table = piecePST[piece.type];

                if (piece.type === 'lupa') {
                    table = isKingRestricted(piece.color, boardState) ? kingEarlyPST : kingLatePST;
                }

                if (table) {
                    const pst = (piece.color === 'white') ? table : mirrorPST(table);
                    positionValue = (Array.isArray(pst) && pst[y] && pst[y][x] !== undefined) ? pst[y][x] : 0;
                 } else if (piece.type === 'lupa') {
                      const kingTable = isKingRestricted(piece.color, boardState) ? kingEarlyPST : kingLatePST;
                      const pst = (piece.color === 'white') ? kingTable : mirrorPST(kingTable);
                      positionValue = (Array.isArray(pst) && pst[y] && pst[y][x] !== undefined) ? pst[y][x] : 0;
                 }

                totalScore += (piece.color === 'white') ? (value + positionValue) : -(value + positionValue);

                if (piece.type === 'lupa') {
                    if (piece.color === 'white') whiteLupaPos = {x, y};
                    else blackLupaPos = {x, y};
                }
                if (piece.type === 'prince') {
                    if (piece.color === 'white') { whitePrincePos = {x, y}; whitePrinceOnBoard = true; }
                    else { blackPrincePos = {x, y}; blackPrinceOnBoard = true; }
                }
            }
        }
    }

    // --- Game Phase Estimation (simple version) ---
    // Max pieces ~ 40 initially (excluding pawns/piluts). Endgame ~< 15 pieces?
    const isEndgame = pieceCount < 18;

    // --- Royalty Safety & Threat Evaluation ---
    const royaltySafetyPenalty = 600; // Increased penalty for attacked royalty
    const princeSafetyPenalty = 300; // Lower penalty for attacked prince

    if (whiteLupaPos && isSquareAttackedBy(whiteLupaPos.x, whiteLupaPos.y, boardState, 'black')) {
        totalScore -= royaltySafetyPenalty;
    }
    if (blackLupaPos && isSquareAttackedBy(blackLupaPos.x, blackLupaPos.y, boardState, 'white')) {
        totalScore += royaltySafetyPenalty;
    }
    if (whitePrincePos && isSquareAttackedBy(whitePrincePos.x, whitePrincePos.y, boardState, 'black')) {
        totalScore -= princeSafetyPenalty;
    }
    if (blackPrincePos && isSquareAttackedBy(blackPrincePos.x, blackPrincePos.y, boardState, 'white')) {
        totalScore += princeSafetyPenalty;
    }

    // --- Sanctuary Threat Evaluation & Defense Bonus ---
    let whiteThreatDistance = Infinity;
    let threatenedSanctuary = null;

    const checkRoyaltyThreat = (royalPos) => {
        if (!royalPos) return Infinity;
        let minDist = Infinity;
        let closestSq = null;
        for (const sanctuarySq of botSanctuarySquares) {
            const dist = Math.max(Math.abs(royalPos.x - sanctuarySq.x), Math.abs(royalPos.y - sanctuarySq.y));
            if (dist < minDist) {
                minDist = dist;
                closestSq = sanctuarySq;
            }
        }
        return { dist: minDist, sq: closestSq };
    };

    const whiteKingThreat = checkRoyaltyThreat(whiteLupaPos);
    const whitePrinceThreat = checkRoyaltyThreat(whitePrincePos);

    // Find the closest threat
    if (whiteKingThreat.dist < whitePrinceThreat.dist) {
        whiteThreatDistance = whiteKingThreat.dist;
        threatenedSanctuary = whiteKingThreat.sq;
    } else {
        whiteThreatDistance = whitePrinceThreat.dist;
        threatenedSanctuary = whitePrinceThreat.sq;
    }

    // Apply penalty for threat
    if (whiteThreatDistance <= 3) {
        const proximityFactor = Math.pow(4 - whiteThreatDistance, 2);
        const penalty = SANCTUARY_THREAT_PENALTY_BASE * proximityFactor;
        totalScore += penalty; // Add penalty (bad for bot)

        // --- Add Defense Bonus ---
        if (threatenedSanctuary) {
             let defenseScore = 0;
             // Check squares around the threatened sanctuary
             for (let dy = -1; dy <= 1; dy++) {
                 for (let dx = -1; dx <= 1; dx++) {
                      if (dx === 0 && dy === 0) continue; // Skip sanctuary itself
                      const checkX = threatenedSanctuary.x + dx;
                      const checkY = threatenedSanctuary.y + dy;
                      if (isPositionValid(checkX, checkY)) {
                          const piece = boardState[checkY]?.[checkX];
                          if (piece && piece.color === 'black') { // If bot piece is nearby
                              // Bonus based on proximity to the sanctuary
                              const distToSq = Math.max(Math.abs(checkX - threatenedSanctuary.x), Math.abs(checkY - threatenedSanctuary.y));
                              defenseScore += SANCTUARY_DEFENSE_BONUS_BASE / (distToSq + 1); // Closer is better
                          }
                      }
                 }
             }
             // Subtract defense score (higher defense makes score lower/better for bot)
             totalScore -= defenseScore;
              // console.log(`Sanctuary ${threatenedSanctuary.x},${threatenedSanctuary.y} threatened (dist ${whiteThreatDistance}). Defense bonus: ${defenseScore.toFixed(1)}`);
        }
    }

     // --- [NEW] Bot Prince Advancement Bonus (stronger in endgame) ---
     if (blackPrincePos) {
          // Bonus based on rank (y-coordinate for black)
          // Black starts at rank 15 (y=14), wants to reach rank 8/7 (y=7/8)
          const rankBonus = (blackPalace.minY - blackPrincePos.y) * PRINCE_ADVANCEMENT_BONUS;
          totalScore -= rankBonus; // Subtract bonus (good for bot)

          // Give an extra boost in the endgame
          if (isEndgame) {
              totalScore -= rankBonus * 1.5; // Apply bonus more strongly
          }
     }


    // --- Check for immediate win/loss conditions ---
    // (This check remains crucial and should override heuristic scores)
    for(const sq of botSanctuarySquares) {
        const piece = boardState[sq.y]?.[sq.x];
        if (piece && (piece.type === 'lupa' || piece.type === 'prince')) {
            return piece.color === 'white' ? Infinity : -Infinity;
        }
    }
    // Check capture win condition
    if (!whiteLupaPos && !whitePrinceOnBoard) return -Infinity; // Black (bot) wins
    if (!blackLupaPos && !blackPrinceOnBoard) return Infinity;  // White (human) wins

    return totalScore;
}


// ===================================================================
// Section 4: AI Search Logic (Minimax, Quiescence, Move Ordering)
// ===================================================================

function getCaptureMoves(boardState, color) { /* ... unchanged ... */ }

// [MODIFIED] Prevent dropping King or Prince
function getAllValidMoves(boardState, color, capturedPieces) {
    const allMoves = [];
    const opponentColor = color === 'white' ? 'black' : 'white';

    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y]?.[x]; // Safe access
            if (piece && piece.color === color) {
                const validMoves = getValidMovesForPiece(piece, x, y, boardState, false);
                for (const move of validMoves) {
                    allMoves.push({ type: 'board', from: { x, y }, to: { x: move.x, y: move.y }, isAttack: move.isAttack });
                }
            }
        }
    }

    if (capturedPieces && capturedPieces.length > 0) {
        const uniquePieceTypesInHand = [...new Set(capturedPieces.map(p => p.type))];
        for (const pieceType of uniquePieceTypesInHand) {
             // --- Cannot drop King or Prince ---
             if (pieceType === 'lupa' || pieceType === 'prince') {
                  continue;
             }
             // ---
            for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
                for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
                    // Drop move validation
                    if (isPositionValid(x, y) && boardState[y]?.[x] === null /* && !isSquareAttackedBy(...) */ ) {
                        allMoves.push({ type: 'drop', pieceType: pieceType, to: { x, y }, isAttack: false });
                    }
                }
            }
        }
    }
    return allMoves;
}

// ===================================================================
// Section 5: Opening Book
// ===================================================================

// Store opening sequences as arrays of moves { from: {x, y}, to: {x, y} }
// These are for the BOT (Black)
const openingBook = {
    // Opening 1: Central Pawn Push & Prince Advance
    "central_prince": [
        { from: { x: 5, y: 15 }, to: { x: 5, y: 14 } }, // Move right central pawn forward
        { from: { x: 4, y: 15 }, to: { x: 4, y: 14 } }, // Move left central pawn forward
        { from: { x: 5, y: 14 }, to: { x: 5, y: 13 } }, // Advance right Prince
        { from: { x: 4, y: 13 }, to: { x: 4, y: 12 } }, // Advance left Prince (or other piece)
        // Add more moves...
    ],
    // Opening 2: Side Pilut Advance & Bishop Development
    "side_bishop": [
        { from: { x: 3, y: 10 }, to: { x: 3, y: 9 } }, // Advance d-file Pilut
        { from: { x: 6, y: 10 }, to: { x: 6, y: 9 } }, // Advance g-file Pilut
        { from: { x: 4, y: 11 }, to: { x: 5, y: 10 } }, // Develop left Yoli (Bishop)
        { from: { x: 5, y: 11 }, to: { x: 4, y: 10 } }, // Develop right Yoli (Bishop)
        // Add more moves...
    ],
    // Opening 3: Defend Sanctuaries early
    "sanctuary_defense": [
         { from: { x: 1, y: 10 }, to: { x: 1, y: 9 } }, // Advance b-file Pilut
         { from: { x: 8, y: 10 }, to: { x: 8, y: 9 } }, // Advance i-file Pilut
         { from: { x: 2, y: 11 }, to: { x: 2, y: 10 } }, // Move left Kor (Knight) slightly forward
         { from: { x: 7, y: 11 }, to: { x: 7, y: 10 } }, // Move right Kor (Knight) slightly forward
         // Add more moves...
    ]
    // Add more openings here...
};

// Store the chosen opening for the current game (needs to be reset per game)
let chosenOpeningSequence = null;
let openingMoveIndex = 0;


// ===================================================================
// Section 6: Main Bot Logic (Updated with Opening Book)
// ===================================================================

/**
 * Main entry point for the bot with a time limit, using iterative deepening.
 * Now accepts full gameState to check turn count for openings.
 */
 function findBestMoveWithTimeLimit(gameState, capturedPieces, bonusMoveState = null) {
    const startTime = Date.now();
    const timeLimit = 4000;
    const { boardState, turnCount } = gameState; // Extract turn count

    // --- Opening Book Logic ---
    // Choose an opening at the start of the bot's first turn (turnCount == 1 for black)
    if (turnCount === 1 && !chosenOpeningSequence) {
        const openingNames = Object.keys(openingBook);
        const randomIndex = Math.floor(Math.random() * openingNames.length);
        const chosenName = openingNames[randomIndex];
        chosenOpeningSequence = openingBook[chosenName];
        openingMoveIndex = 0;
        console.log(`Bot selected opening: ${chosenName}`);
    }

    // Play from opening book if applicable
    if (chosenOpeningSequence && openingMoveIndex < chosenOpeningSequence.length && turnCount < chosenOpeningSequence.length * 2) {
        const openingMove = chosenOpeningSequence[openingMoveIndex];

        // **Crucial Check:** Verify the opening move is still valid on the current board
        const pieceAtFrom = boardState[openingMove.from.y]?.[openingMove.from.x];
        if (pieceAtFrom && pieceAtFrom.color === 'black') { // Ensure the bot's piece is there
            const validMovesForPiece = getValidMovesForPiece(pieceAtFrom, openingMove.from.x, openingMove.from.y, boardState, false);
            const isOpeningMoveValid = validMovesForPiece.some(m => m.x === openingMove.to.x && m.y === openingMove.to.y);

             // **Safety Check:** Don't play opening move if a better capture exists
             const immediateCaptures = getCaptureMoves(boardState, 'black');
             let bestCaptureValue = -Infinity;
             if (immediateCaptures.length > 0) {
                  // Quick evaluation of captures
                 for (const cap of immediateCaptures) {
                      const victim = boardState[cap.to.y]?.[cap.to.x];
                      const attacker = boardState[cap.from.y]?.[cap.from.x];
                      if(victim && attacker){
                           const value = (pieceValues[victim.type] || 0) - (pieceValues[attacker.type] || 0) / 10; // Simple MVV-LVA
                           bestCaptureValue = Math.max(bestCaptureValue, value);
                      }
                 }
             }
             // Only play opening if valid AND no significantly valuable capture is missed (e.g., capturing anything better than a pawn/pilut)
            if (isOpeningMoveValid && bestCaptureValue < (pieceValues['sult'] || 150)) {
                console.log(`Bot playing opening move ${openingMoveIndex + 1}:`, openingMove);
                openingMoveIndex++;
                return { ...openingMove, type: 'board', isAttack: boardState[openingMove.to.y]?.[openingMove.to.x] !== null }; // Add type/isAttack
            } else {
                 console.log("Opening move invalid or better capture exists, deviating from book.");
                 chosenOpeningSequence = null; // Deviate from the book permanently
            }
        } else {
            console.log("Opening state mismatch, deviating from book.");
            chosenOpeningSequence = null; // Deviate from the book permanently
        }
    } else if (chosenOpeningSequence && openingMoveIndex >= chosenOpeningSequence.length) {
         console.log("Opening finished.");
         chosenOpeningSequence = null; // Opening sequence complete
    }
    // --- End Opening Book Logic ---


    // --- Normal Search (Iterative Deepening) ---
    let bestMoveFound = null;
    let lastCompletedDepthResult = null;

    console.log("Bot searching with state:", { hasBonus: !!bonusMoveState });

    for (let depth = 1; depth <= 4; depth++) { // Reduced max depth slightly for performance
        console.log(`Searching at depth: ${depth}`);
        let currentDepthResult = null;
        try {
            currentDepthResult = findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit, bonusMoveState);
        } catch (e) {
            if (e.message === 'TimeLimitExceeded') {
                console.log(`Time limit reached during depth ${depth}. Using best move from depth ${depth - 1}.`);
                break;
            }
            console.error("Error during minimax search:", e);
            break;
        }

        if (currentDepthResult) {
             lastCompletedDepthResult = currentDepthResult;
             // console.log(`Depth ${depth} completed. Best move found:`, lastCompletedDepthResult);
        } else {
             console.log(`No move found at depth ${depth}.`);
             if (depth === 1) break;
        }

        if (Date.now() - startTime >= timeLimit) {
            console.log(`Time limit reached after completing depth ${depth}.`);
            break;
        }
    }

    bestMoveFound = lastCompletedDepthResult;

    // Fallback if no move found
    if (!bestMoveFound) {
        console.warn("Iterative deepening finished without finding a best move. Selecting random fallback.");
        let moves;
        if (bonusMoveState) {
             const { from } = bonusMoveState;
             const piece = boardState[from.y]?.[from.x];
             if (piece) moves = getBonusMoves(piece, from.x, from.y, boardState);
             else { console.error("Fallback Error: Piece not found for bonus move!"); moves = []; }
        } else {
            moves = getAllValidMoves(boardState, 'black', capturedPieces);
        }

        if (moves && moves.length > 0) {
            bestMoveFound = moves[Math.floor(Math.random() * moves.length)];
             console.log("Selected random move:", bestMoveFound);
        } else {
             console.error("CRITICAL: Bot found NO valid moves in fallback!");
             return null;
        }
    }

    console.log("Final best move selected:", bestMoveFound);
    return bestMoveFound;
}

/**
 * Performs the search for a single depth level.
 */
function findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit, bonusMoveState) {
    let bestMove = null;
    let bestValue = Infinity; // Bot is minimizing (black)
    let alpha = -Infinity;
    let beta = Infinity;
    let moves;

    if (bonusMoveState) {
        const { from } = bonusMoveState;
        const piece = boardState[from.y]?.[from.x];
        if (piece) {
             // console.log(`Generating bonus moves for ${piece.type} at ${from.x},${from.y}`);
             moves = getBonusMoves(piece, from.x, from.y, boardState);
        } else {
             console.error("Error generating bonus moves: Piece not found at source!");
             moves = [];
        }
    } else {
        moves = getAllValidMoves(boardState, 'black', capturedPieces);
    }

     if (moves.length === 0) {
          // console.log("No valid moves found for bot at this node.");
          return null; // No moves possible
     }

    // Basic move ordering (Captures first)
    moves.sort((a, b) => (b.isAttack ? 10 : 0) - (a.isAttack ? 10 : 0)); // Give captures higher priority

    for (const move of moves) {
         if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');

        const tempBoard = copyBoard(boardState);
        let capturedType = null; // Store type for unmaking move if needed

        if (move.type === 'drop') {
            tempBoard[move.to.y][move.to.x] = { type: move.pieceType, color: 'black' };
        } else {
            const pieceToMove = tempBoard[move.from.y]?.[move.from.x];
             if (!pieceToMove) { continue; } // Skip if piece somehow disappeared

            const targetPiece = tempBoard[move.to.y]?.[move.to.x];
            if (targetPiece) capturedType = targetPiece.type; // Store type if capture

            tempBoard[move.to.y][move.to.x] = pieceToMove;
            tempBoard[move.from.y][move.from.x] = null;
            // TODO: Handle promotions simulation
        }

        let boardValue;
         const pieceMoved = tempBoard[move.to.y]?.[move.to.x];
         const isCopeBonusTrigger = !bonusMoveState && pieceMoved?.type === 'cope' && move.isAttack;
         const isGHGBonusTrigger = !bonusMoveState && (pieceMoved?.type === 'greathorsegeneral' || pieceMoved?.type === 'cthulhu') && !move.isAttack;

         if (isCopeBonusTrigger || isGHGBonusTrigger) {
             boardValue = handleBonusTurn(tempBoard, pieceMoved, move, depth, alpha, beta, false, startTime, timeLimit); // Pass depth (not depth-1) for bonus turn evaluation
         }
         else {
              boardValue = minimax(tempBoard, depth - 1, alpha, beta, true, startTime, timeLimit);
         }

        // Bot is minimizing
        if (boardValue < bestValue) {
            bestValue = boardValue;
            bestMove = move;
        }
        beta = Math.min(beta, boardValue);
        if (beta <= alpha) {
            break;
        }
    }

    return bestMove;
}


function minimax(boardState, depth, alpha, beta, isMaximizingPlayer, startTime, timeLimit) {
    if (Date.now() - startTime >= timeLimit) {
        throw new Error('TimeLimitExceeded');
    }

    // Check terminal nodes based on game rules first
    let whiteLupaPos = null, blackLupaPos = null, whitePrinceOnBoard = false, blackPrinceOnBoard = false;
     for (let y = 0; y < BOT_BOARD_HEIGHT; y++) { for (let x = 0; x < BOT_BOARD_WIDTH; x++) { const p = boardState[y]?.[x]; if (p) { if(p.type==='lupa'){if(p.color==='white')whiteLupaPos={x,y};else blackLupaPos={x,y};} else if(p.type==='prince'){if(p.color==='white')whitePrinceOnBoard=true;else blackPrinceOnBoard=true;}}}}
     for(const sq of botSanctuarySquares) { const p = boardState[sq.y]?.[sq.x]; if (p && (p.type === 'lupa' || p.type === 'prince')) return p.color === 'white' ? Infinity : -Infinity; }
     if (!whiteLupaPos && !whitePrinceOnBoard) return -Infinity; // Black wins
     if (!blackLupaPos && !blackPrinceOnBoard) return Infinity;  // White wins


    if (depth === 0) {
        return quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer, startTime, timeLimit);
    }

    const color = isMaximizingPlayer ? 'white' : 'black';
    const moves = getAllValidMoves(boardState, color, []); // Pass empty captured array

    if (moves.length === 0) {
        // Basic check: If the player whose turn it is has no moves, how is their King?
        const kingPos = isMaximizingPlayer ? whiteLupaPos : blackLupaPos;
        const opponentColor = isMaximizingPlayer ? 'black' : 'white';
        if (kingPos && isSquareAttackedBy(kingPos.x, kingPos.y, boardState, opponentColor)) {
            // Checkmate
             return isMaximizingPlayer ? -Infinity - depth : Infinity + depth; // Penalize faster checkmates
        } else {
             // Stalemate
             return 0;
        }
       // return evaluateBoard(boardState); // Fallback if checkmate/stalemate logic is complex
    }

    // Move Ordering
     moves.sort((a, b) => (b.isAttack ? 10 : 0) - (a.isAttack ? 10 : 0));


    if (isMaximizingPlayer) { // White (Human)
        let maxEval = -Infinity;
        for (const move of moves) {
             if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');

            const tempBoard = copyBoard(boardState);
            const pieceToMove = tempBoard[move.from.y]?.[move.from.x];

            if (!pieceToMove && move.type === 'board') { continue; }

            // Simulate move
            if (move.type === 'drop') {
                tempBoard[move.to.y][move.to.x] = { type: move.pieceType, color: color };
            } else {
                 tempBoard[move.to.y][move.to.x] = pieceToMove;
                 tempBoard[move.from.y][move.from.x] = null;
                 // TODO: Handle promotions simulation if needed
            }

            const pieceMoved = tempBoard[move.to.y]?.[move.to.x];
            const isCopeBonusTrigger = pieceMoved?.type === 'cope' && move.isAttack;
            const isGHGBonusTrigger = (pieceMoved?.type === 'greathorsegeneral' || pieceMoved?.type === 'cthulhu') && !move.isAttack;

            let eval;
            if (isCopeBonusTrigger || isGHGBonusTrigger) {
                 eval = handleBonusTurn(tempBoard, pieceMoved, move, depth, alpha, beta, true, startTime, timeLimit); // Pass depth
            } else {
                 eval = minimax(tempBoard, depth - 1, alpha, beta, false, startTime, timeLimit);
            }

            maxEval = Math.max(maxEval, eval);
            alpha = Math.max(alpha, eval);
            if (beta <= alpha) {
                break;
            }
        }
        return maxEval;

    } else { // Minimizing Player (Black/Bot)
        let minEval = Infinity;
        for (const move of moves) {
             if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');

            const tempBoard = copyBoard(boardState);
            const pieceToMove = tempBoard[move.from.y]?.[move.from.x];

             if (!pieceToMove && move.type === 'board') { continue; }

            // Simulate move
            if (move.type === 'drop') {
                tempBoard[move.to.y][move.to.x] = { type: move.pieceType, color: color };
            } else {
                 tempBoard[move.to.y][move.to.x] = pieceToMove;
                 tempBoard[move.from.y][move.from.x] = null;
                 // TODO: Handle promotions simulation
            }

            const pieceMoved = tempBoard[move.to.y]?.[move.to.x];
            const isCopeBonusTrigger = pieceMoved?.type === 'cope' && move.isAttack;
            const isGHGBonusTrigger = (pieceMoved?.type === 'greathorsegeneral' || pieceMoved?.type === 'cthulhu') && !move.isAttack;

            let eval;
             if (isCopeBonusTrigger || isGHGBonusTrigger) {
                  eval = handleBonusTurn(tempBoard, pieceMoved, move, depth, alpha, beta, false, startTime, timeLimit); // Pass depth
             } else {
                  eval = minimax(tempBoard, depth - 1, alpha, beta, true, startTime, timeLimit);
             }

            minEval = Math.min(minEval, eval);
            beta = Math.min(beta, eval);
            if (beta <= alpha) {
                break;
            }
        }
        return minEval;
    }
}


const QUIESCENCE_MAX_DEPTH = 3;

 function quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer, startTime, timeLimit, depth = QUIESCENCE_MAX_DEPTH) {
     if (Date.now() - startTime >= timeLimit) {
         throw new Error('TimeLimitExceeded');
     }

     // Check terminal nodes
     let whiteLupaPosQ = null, blackLupaPosQ = null, whitePrinceOnBoardQ = false, blackPrinceOnBoardQ = false;
      for (let y = 0; y < BOT_BOARD_HEIGHT; y++) { for (let x = 0; x < BOT_BOARD_WIDTH; x++) { const p = boardState[y]?.[x]; if (p) { if(p.type==='lupa'){if(p.color==='white')whiteLupaPosQ={x,y};else blackLupaPosQ={x,y};} else if(p.type==='prince'){if(p.color==='white')whitePrinceOnBoardQ=true;else blackPrinceOnBoardQ=true;}}}}
      for(const sq of botSanctuarySquares) { const p = boardState[sq.y]?.[sq.x]; if (p && (p.type === 'lupa' || p.type === 'prince')) return p.color === 'white' ? Infinity : -Infinity; }
      if (!whiteLupaPosQ && !whitePrinceOnBoardQ) return -Infinity;
      if (!blackLupaPosQ && !blackPrinceOnBoardQ) return Infinity;


     let stand_pat = evaluateBoard(boardState);

     if (depth === 0) {
         return stand_pat;
     }

     // Use stand_pat score for pruning check before generating moves
     if (isMaximizingPlayer) {
          if (stand_pat >= beta) return beta; // Current score is already too good for maximizing player
          alpha = Math.max(alpha, stand_pat); // Update lower bound
     } else {
          if (stand_pat <= alpha) return alpha; // Current score is already too good for minimizing player
          beta = Math.min(beta, stand_pat); // Update upper bound
     }


     const color = isMaximizingPlayer ? 'white' : 'black';
     const captureMoves = getCaptureMoves(boardState, color);

     if (captureMoves.length === 0) {
         return stand_pat; // No captures, position is quiet
     }

      // MVV-LVA Ordering
      captureMoves.sort((a, b) => {
          const victimA = boardState[a.to.y]?.[a.to.x];
          const victimB = boardState[b.to.y]?.[b.to.x];
          const attackerA = boardState[a.from.y]?.[a.from.x];
          const attackerB = boardState[b.from.y]?.[b.from.x];
          const victimValA = victimA ? (pieceValues[victimA.type] || 0) : 0;
          const victimValB = victimB ? (pieceValues[victimB.type] || 0) : 0;
          const attackerValA = attackerA ? (pieceValues[attackerA.type] || 0) : 0;
          const attackerValB = attackerB ? (pieceValues[attackerB.type] || 0) : 0;
          if (victimValA !== victimValB) return victimValB - victimValA;
          else return attackerValA - attackerValB;
      });


     for (const move of captureMoves) {
         if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');

         const tempBoard = copyBoard(boardState);
         const piece = tempBoard[move.from.y]?.[move.from.x];

         if (!piece) { continue; } // Skip if piece missing

          // Simulate capture
          tempBoard[move.to.y][move.to.x] = piece;
          tempBoard[move.from.y][move.from.x] = null;
          // TODO: Handle promotions during quiescence if needed

         let score = quiescenceSearch(tempBoard, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, depth - 1);

         if (isMaximizingPlayer) {
             alpha = Math.max(alpha, score);
             if (beta <= alpha) break; // Beta cutoff
         } else {
             beta = Math.min(beta, score);
             if (beta <= alpha) break; // Alpha cutoff
         }
     }
     return isMaximizingPlayer ? alpha : beta;
 }