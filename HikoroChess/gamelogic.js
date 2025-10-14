const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 16;

const pieceNotation = {
    lupa: "L", zur: "Zr", kota: "Kt", fin: "Fn", yoli: "Yl", pilut: "Pl",
    sult: "Sl", pawn: "P", cope: "Cp", chair: "Ch", jotu: "Jt", kor: "Kr",
    finor: "F+", greatshield: "GS", greathorsegeneral: "GH"
};

function getInitialBoard() {
    let boardState = Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null));
    const setup = [
        { y: 5, x: 0, type: 'pilut' }, { y: 5, x: 1, type: 'pilut' },
        { y: 5, x: 2, type: 'sult' }, { y: 5, x: 3, type: 'pilut' },
        { y: 5, x: 4, type: 'pilut' }, { y: 5, x: 5, type: 'pilut' },
        { y: 5, x: 6, type: 'pilut' }, { y: 5, x: 7, type: 'sult' },
        { y: 5, x: 8, type: 'pilut' }, { y: 5, x: 9, type: 'pilut' },
        { y: 4, x: 0, type: 'cope' }, { y: 4, x: 1, type: 'greathorsegeneral' },
        { y: 4, x: 2, type: 'kor' }, { y: 4, x: 3, type: 'fin' },
        { y: 4, x: 4, type: 'yoli' }, { y: 4, x: 5, type: 'yoli' },
        { y: 4, x: 6, type: 'fin' }, { y: 4, x: 7, type: 'kor' },
        { y: 4, x: 8, type: 'zur' }, { y: 4, x: 9, type: 'cope' },
        { y: 3, x: 1, type: 'cope' }, { y: 3, x: 2, type: 'jotu' },
        { y: 3, x: 3, type: 'pawn' }, { y: 3, x: 6, type: 'pawn' },
        { y: 3, x: 7, type: 'jotu' }, { y: 3, x: 8, type: 'cope' },
        { y: 2, x: 4, type: 'cope' }, { y: 2, x: 5, type: 'cope' },
        { y: 1, x: 2, type: 'chair' }, { y: 1, x: 3, type: 'kota' },
        { y: 1, x: 6, type: 'kota' }, { y: 1, x: 7, type: 'chair' },
        { y: 0, x: 2, type: 'lupa' }, { y: 0, x: 4, type: 'pawn' },
        { y: 0, x: 5, type: 'pawn' }, { y: 0, x: 7, type: 'lupa' },
    ];
    setup.forEach(p => boardState[p.y][p.x] = { type: p.type, color: 'white' });
    setup.forEach(p => boardState[BOARD_HEIGHT - 1 - p.y][p.x] = { type: p.type, color: 'black' });
    return boardState;
}

function isPositionValid(x, y) {
    if (x < 0 || y < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return false;
    if ((x <= 1 && y <= 2) || (x >= 8 && y <= 2)) return false;
    if ((x <= 1 && y >= 13) || (x >= 8 && y >= 13)) return false;
    return true;
}

/**
 * Checks if a piece at a given position is protected by a friendly Pilut or Great Shield.
 * @param {object} targetPiece - The piece being attacked.
 * @param {number} targetX - The x-coordinate of the piece being attacked.
 * @param {number} targetY - The y-coordinate of the piece being attacked.
 * @param {Array<Array<object>>} board - The current board state.
 * @returns {boolean} - True if the piece is protected.
 */
const isProtected = (targetPiece, targetX, targetY, board) => {
    const protectingColor = targetPiece.color;
    // Direction towards the friendly side of the board for the targetPiece
    const behindDir = protectingColor === 'white' ? -1 : 1;

    // 1. Check for Pilut protection (must be directly behind the target)
    const pilutProtectorY = targetY + behindDir;
    if (isPositionValid(targetX, pilutProtectorY)) {
        const potentialProtector = board[pilutProtectorY][targetX];
        if (potentialProtector && potentialProtector.type === 'pilut' && potentialProtector.color === protectingColor) {
            return true;
        }
    }

    // 2. Check for Great Shield protection (sides, back, back-diagonals)
    // Iterate through the 8 squares around the target to find a friendly Great Shield.
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue; // Skip the target's own square

            const gsX = targetX + dx;
            const gsY = targetY + dy;

            if (isPositionValid(gsX, gsY)) {
                const potentialProtector = board[gsY][gsX];
                if (potentialProtector && potentialProtector.type === 'greatshield' && potentialProtector.color === protectingColor) {
                    // Found a friendly GS. A GS does NOT protect its forward three squares.
                    const gsForwardDir = potentialProtector.color === 'white' ? 1 : -1;

                    // Check if the target is in the GS's UNPROTECTED forward zone relative to the GS.
                    const isTargetInFrontStraight = (targetX === gsX && targetY === gsY + gsForwardDir);
                    const isTargetInFrontDiagLeft = (targetX === gsX - 1 && targetY === gsY + gsForwardDir);
                    const isTargetInFrontDiagRight = (targetX === gsX + 1 && targetY === gsY + gsForwardDir);

                    if (!(isTargetInFrontStraight || isTargetInFrontDiagLeft || isTargetInFrontDiagRight)) {
                        // The target is not in the GS's front arc, so it is protected.
                        return true;
                    }
                }
            }
        }
    }

    return false; // Not protected by any piece
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
            // Check for protection before adding an attack move
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
        case 'lupa':
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    addMove(x + dx, y + dy);
                }
            }
            break;
        case 'zur':
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    generateLineMoves(dx, dy);
                }
            }
            break;
        case 'kota':
            generateLineMoves(1, 0); generateLineMoves(-1, 0);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    addMove(x + dx, y + dy);
                }
            }
            break;
        case 'fin':
            generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1);
            addNonCaptureMove(x + 1, y);
            addNonCaptureMove(x - 1, y);
            break;
        case 'yoli':
            [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); }));
            addMove(x + 1, y); addMove(x - 1, y); addMove(x, y + 1); addMove(x, y - 1); break;
        case 'pilut':
            const dir = piece.color === 'white' ? 1 : -1;
            if (isPositionValid(x, y + dir) && !boardState[y + dir][x]) {
                moves.push({ x: x, y: y + dir, isAttack: false });
                if (isPositionValid(x, y + 2 * dir) && !boardState[y + 2 * dir][x]) {
                    moves.push({ x: x, y: y + 2 * dir, isAttack: false });
                }
            }
            break;
        case 'sult':
            const fwd = piece.color === 'white' ? 1 : -1;
            addMove(x - 1, y + fwd); addMove(x + 1, y + fwd); addMove(x, y - fwd);
            addMove(x, y + fwd); addMove(x, y + 2 * fwd); break;
        case 'pawn':
            addMove(x, y + 1); addMove(x, y - 1); addMove(x + 1, y); addMove(x - 1, y);
            addMove(x + 2, y + 2); addMove(x - 2, y + 2); addMove(x + 2, y - 2); addMove(x - 2, y - 2); break;
        case 'cope': {
            const fwdDir = piece.color === 'white' ? 1 : -1;
            const generateCopeMoves = (moveFunc) => {
                moveFunc(x + 2, y + 2 * fwdDir); moveFunc(x - 2, y + 2 * fwdDir);
                moveFunc(x, y + 1 * fwdDir); moveFunc(x, y + 2 * fwdDir);
                moveFunc(x, y - 1 * fwdDir); moveFunc(x, y - 2 * fwdDir);
            };

            // If it's a bonus move (after a capture), only non-capture moves are allowed.
            if (bonusMoveActive) {
                generateCopeMoves(addNonCaptureMove);
            } else {
                generateCopeMoves(addMove);
            }
            break;
        }
        case 'chair':
            generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1);
            generateLineMoves(0, 1); generateLineMoves(0, -1); break;
        case 'jotu':
            generateLineMoves(1, 0); generateLineMoves(-1, 0);
            if (piece.color === 'white') { generateLineMoves(0, 1); addMove(x, y - 1); }
            else { generateLineMoves(0, -1); addMove(x, y + 1); } break;
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
                // Second move (non-capture only)
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        addNonCaptureMove(x + dx, y + dy);
                    }
                }
                [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addNonCaptureMove(x + dx, y + dy); }));
                generateNonCaptureLineMoves(-1, ghgDir);
                generateNonCaptureLineMoves(1, ghgDir);
                generateNonCaptureLineMoves(0, -ghgDir);
            } else {
                // First move (captures allowed)
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        addMove(x + dx, y + dy);
                    }
                }
                [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); }));
                generateLineMoves(-1, ghgDir);
                generateLineMoves(1, ghgDir);
                generateLineMoves(0, -ghgDir);
            }
            break;
        }
    }
    return moves;
}

module.exports = {
    getInitialBoard,
    getValidMovesForPiece,
    isPositionValid
};