// gamelogic.js

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
    
    // --- REWRITTEN JOTU-SPECIFIC MOVE LOGIC ---
    const generateJotuLineMoves = (dx, dy) => {
        // First, check if there is an enemy anywhere on this path.
        let pathHasEnemy = false;
        let checkX = x + dx;
        let checkY = y + dy;
        while (isPositionValid(checkX, checkY)) {
            const target = boardState[checkY][checkX];
            if (target && target.color !== piece.color) {
                pathHasEnemy = true;
                break;
            }
            // If we hit a friendly piece first, we can't see the enemy, so stop checking.
            if (target && target.color === piece.color) {
                break;
            }
            checkX += dx;
            checkY += dy;
        }

        // Now, generate moves. The Jotu is stopped by the FIRST piece it hits.
        let cx = x + dx;
        let cy = y + dy;
        while (isPositionValid(cx, cy)) {
            const target = boardState[cy][cx];
            if (target === null) {
                moves.push({ x: cx, y: cy, isAttack: false }); // Move to empty square
            } else {
                // The path is blocked. Check if the blocking piece is a valid target.
                if (target.color !== piece.color) { // It's an enemy piece
                    if (!isProtected(target, cx, cy, boardState)) {
                        moves.push({ x: cx, y: cy, isAttack: true });
                    }
                } else { // It's a friendly piece
                    if (pathHasEnemy) {
                        // Can only capture the friendly piece if an enemy was visible down the line
                        moves.push({ x: cx, y: cy, isAttack: true });
                    }
                }
                // IMPORTANT: Break the loop after hitting the first piece, regardless of what it is.
                break; 
            }
            cx += dx;
            cy += dy;
        }
    };
    // --- END OF NEW JOTU LOGIC ---

    switch (piece.type) {
        case 'lupa':
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                addMove(x + dx, y + dy);
            }
            break;
        case 'zur':
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                generateLineMoves(dx, dy);
            }
            break;
        case 'kota':
            generateLineMoves(1, 0); generateLineMoves(-1, 0);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                addMove(x + dx, y + dy);
            }
            break;
        case 'fin':
            generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1);
            addNonCaptureMove(x + 1, y); addNonCaptureMove(x - 1, y);
            break;
        case 'yoli':
            [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); }));
            addMove(x + 1, y); addMove(x - 1, y); addMove(x, y + 1); addMove(x, y - 1);
            break;
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
            addMove(x, y + fwd); addMove(x, y + 2 * fwd);
            break;
        case 'pawn':
            addMove(x, y + 1); addMove(x, y - 1); addMove(x + 1, y); addMove(x - 1, y);
            addMove(x + 2, y + 2); addMove(x - 2, y + 2); addMove(x + 2, y - 2); addMove(x - 2, y - 2);
            break;
        case 'cope': {
            const fwdDir = piece.color === 'white' ? 1 : -1;
            const generateCopeMoves = (moveFunc) => {
                moveFunc(x + 2, y + 2 * fwdDir); moveFunc(x - 2, y + 2 * fwdDir);
                moveFunc(x, y + 1 * fwdDir); moveFunc(x, y + 2 * fwdDir);
                moveFunc(x, y - 1 * fwdDir); moveFunc(x, y - 2 * fwdDir);
            };
            if (bonusMoveActive) {
                generateCopeMoves(addNonCaptureMove);
            } else {
                generateCopeMoves(addMove);
            }
            break;
        }
        case 'chair':
            generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1);
            generateLineMoves(0, 1); generateLineMoves(0, -1);
            break;
        // MODIFIED: Jotu now uses its special move generation
        case 'jotu':
            generateJotuLineMoves(1, 0); 
            generateJotuLineMoves(-1, 0);
            if (piece.color === 'white') { 
                generateJotuLineMoves(0, 1); 
                addMove(x, y - 1); // Standard one-step move backward
            }
            else { 
                generateJotuLineMoves(0, -1); 
                addMove(x, y + 1); // Standard one-step move backward
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
    }
    return moves;
}

module.exports = {
    getInitialBoard,
    getValidMovesForPiece,
    isPositionValid
};