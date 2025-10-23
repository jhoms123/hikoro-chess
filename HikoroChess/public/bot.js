const BOT_BOARD_WIDTH = 10;
const BOT_BOARD_HEIGHT = 16;

const whitePalace = { minY: 0, maxY: 1, minX: 3, maxX: 6 };
const blackPalace = { minY: 14, maxY: 15, minX: 3, maxX: 6 };

const botSanctuarySquares = [
    {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
    {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
];

function isKingRestricted(color, boardState) {
    const height = boardState?.length || 0;
    const width = boardState?.[0]?.length || 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const piece = boardState[y]?.[x];
            if (piece && piece.type === 'prince' && piece.color === color) {
                return true;
            }
        }
    }
    return false;
}

function copyBoard(boardState) {
    if (!Array.isArray(boardState) || boardState.length === 0 || !Array.isArray(boardState[0])) {
        console.error("Invalid boardState passed to copyBoard:", boardState);
        return Array(BOT_BOARD_HEIGHT).fill(null).map(() => Array(BOT_BOARD_WIDTH).fill(null));
    }

    const newBoard = [];
    const height = boardState.length;
    for (let i = 0; i < height; i++) {
        if (Array.isArray(boardState[i])) {
            newBoard.push([...boardState[i]]);
        } else {
            console.error("Invalid board state row detected in copyBoard:", boardState[i], "at index", i);
            const width = boardState[0]?.length || BOT_BOARD_WIDTH;
            newBoard.push(Array(width).fill(null));
        }
    }

    while (newBoard.length < BOT_BOARD_HEIGHT) {
        console.warn(`copyBoard: Input board height ${height} was less than expected ${BOT_BOARD_HEIGHT}. Padding.`);
        const width = newBoard[0]?.length || BOT_BOARD_WIDTH;
        newBoard.push(Array(width).fill(null));
    }

    if (newBoard.length > BOT_BOARD_HEIGHT) {
        console.warn(`copyBoard: Input board height ${height} was more than expected ${BOT_BOARD_HEIGHT}. Trimming.`);
        newBoard.length = BOT_BOARD_HEIGHT;
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
    const protectingColor = targetPiece.color;
    const inFrontDir = protectingColor === 'white' ? -1 : 1;
    const pilutProtectorY = targetY + inFrontDir;

    if (isPositionValid(targetX, pilutProtectorY)) {
        const potentialProtector = board[pilutProtectorY]?.[targetX];
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
    const height = boardState?.length || 0;
    const width = boardState?.[0]?.length || 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const piece = boardState[y]?.[x];
            if (piece && piece.color === attackingColor) {
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

function getValidMovesForPiece(piece, x, y, boardState, bonusMoveActive = false) {
    if (!Array.isArray(boardState) || boardState.length === 0 || !Array.isArray(boardState[0])) {
        console.error("Invalid boardState passed to getValidMovesForPiece");
        return [];
    }
    if (!piece) return [];

    const moves = [];
    const color = piece.color;
    const fwd = color === 'white' ? 1 : -1;

    const addMove = (toX, toY) => {
        if (piece.type === 'lupa' && isKingRestricted(color, boardState)) {
            const palace = color === 'white' ? whitePalace : blackPalace;
            if (toX < palace.minX || toX > palace.maxX || toY < palace.minY || toY > palace.maxY) {
                return;
            }
        }
        if (!isPositionValid(toX, toY)) return;
        const target = boardState[toY]?.[toX];
        if (target === null) {
            moves.push({ x: toX, y: toY, isAttack: false });
        } else if (target && target.color !== piece.color) {
            if (!isProtected(target, toX, toY, boardState)) {
                moves.push({ x: toX, y: toY, isAttack: true });
            }
        }
    };

    const addNonCaptureMove = (toX, toY) => {
        if (piece.type === 'lupa' && isKingRestricted(color, boardState)) {
            const palace = color === 'white' ? whitePalace : blackPalace;
            if (toX < palace.minX || toX > palace.maxX || toY < palace.minY || toY > palace.maxY) {
                return;
            }
        }
        if (!isPositionValid(toX, toY)) return;
        if (boardState[toY]?.[toX] === null) {
            moves.push({ x: toX, y: toY, isAttack: false });
        }
    };

    const generateJotuJumpMoves = (dx, dy) => {
        let cx = x + dx;
        let cy = y + dy;
        let pathHasEnemy = false;
        let checkX = cx, checkY = cy;
        while(isPositionValid(checkX, checkY)) {
            const checkTarget = boardState[checkY]?.[checkX];
            if (checkTarget && checkTarget.color !== piece.color) { pathHasEnemy = true; break; }
            checkX += dx; checkY += dy;
        }
        if (!pathHasEnemy) {
            while (isPositionValid(cx, cy)) {
                const target = boardState[cy]?.[cx];
                if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); } else { break; }
                cx += dx; cy += dy;
            }
            return;
        }
        cx = x + dx; cy = y + dy;
        while (isPositionValid(cx, cy)) {
            const target = boardState[cy]?.[cx];
            if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); }
            else if (target.color !== piece.color) {
                if (!isProtected(target, cx, cy, boardState)) { moves.push({ x: cx, y: cy, isAttack: true }); }
                break;
            }
            else { break; }
            cx += dx; cy += dy;
        }
    };
    const generateLineMoves = (dx, dy) => {
        let cx = x + dx, cy = y + dy;
        while (isPositionValid(cx, cy)) {
            const target = boardState[cy]?.[cx];
            if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); }
            else {
                if (target.color !== piece.color) { if (!isProtected(target, cx, cy, boardState)) { moves.push({ x: cx, y: cy, isAttack: true }); }}
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

    switch (piece.type) {
        case 'lupa':
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); }
            break;
        case 'prince':
            addMove(x, y + fwd); addMove(x + 1, y + fwd); addMove(x - 1, y + fwd); addMove(x + 1, y - fwd); addMove(x - 1, y - fwd);
            break;
        case 'kota': generateLineMoves(1, 0); generateLineMoves(-1, 0); generateLineMoves(0, 1); generateLineMoves(0,-1); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } break;
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
            for (let dx = -1; dx <= 1; dx++) { for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } }
            addMove(x + 2, y + 2 * fwdDir); addMove(x - 2, y + 2 * fwdDir); addMove(x, y + 1 * fwdDir); addMove(x, y + 2 * fwdDir); addMove(x, y - 1 * fwdDir); addMove(x, y - 2 * fwdDir);
            break;
        }
        case 'mermaid': { for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); } break; }
		case 'cthulhu': {
            const cthulhuDir = piece.color === 'white' ? 1 : -1;
            const moveGenerator = bonusMoveActive ? addNonCaptureMove : addMove;
            const lineGenerator = bonusMoveActive ? generateNonCaptureLineMoves : generateLineMoves;
            for (let dx = -2; dx <= 2; dx++) { for (let dy = -2; dy <= 2; dy++) { if (dx === 0 && dy === 0) continue; moveGenerator(x + dx, y + dy); } }
            [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) moveGenerator(x + dx, y + dy); }));
            lineGenerator(-1, cthulhuDir); lineGenerator(1, cthulhuDir); lineGenerator(0, -cthulhuDir);
            break;
        }
    }
    return moves;
}

function getBonusMoves(piece, toX, toY, boardState) {
    if (!piece) return [];
    const bonusMovesRaw = getValidMovesForPiece(piece, toX, toY, boardState, true);
    return bonusMovesRaw.map(move => ({
        type: 'board', from: { x: toX, y: toY }, to: { x: move.x, y: move.y }, isAttack: false
    }));
}



const PIECE_TYPES = [
    'pawn', 'sult', 'pilut', 'fin', 'cope', 'kor', 'yoli', 'chair',
    'prince', 'greatshield', 'finor', 'jotu', 'mermaid', 'neptune',
    'kota', 'greathorsegeneral', 'zur', 'cthulhu', 'lupa'
];
const COLORS = ['white', 'black'];

function random64() {
    return BigInt(Math.floor(Math.random() * (2**32))) << 32n | BigInt(Math.floor(Math.random() * (2**32)));
}

const zobristTable = {};
for (const type of PIECE_TYPES) {
    zobristTable[type] = { white: [], black: [] };
    for (let c = 0; c < COLORS.length; c++) {
        const color = COLORS[c];
        for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
            zobristTable[type][color][y] = [];
            for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
                zobristTable[type][color][y][x] = random64();
            }
        }
    }
}
const zobristTurnBlack = random64();

function computeZobristHash(boardState, isBlackTurn) {
    let hash = 0n;
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y]?.[x];
            if (piece && zobristTable[piece.type]?.[piece.color]?.[y]?.[x]) {
                hash ^= zobristTable[piece.type][piece.color][y][x];
            }
        }
    }
    if (isBlackTurn) {
        hash ^= zobristTurnBlack;
    }
    return hash;
}

const TT_SIZE = 1 << 20;
let transpositionTable = new Map();
const TT_FLAG_EXACT = 0;
const TT_FLAG_LOWERBOUND = 1;
const TT_FLAG_UPPERBOUND = 2;

function storeTTEntry(hash, depth, score, flag, bestMove = null) {
    transpositionTable.set(hash, { depth, score, flag, bestMove });
}

function probeTTEntry(hash, depth, alpha, beta) {
    const entry = transpositionTable.get(hash);
    if (entry && entry.depth >= depth) {
        if (entry.flag === TT_FLAG_EXACT) {
            return { score: entry.score, bestMove: entry.bestMove };
        }
        if (entry.flag === TT_FLAG_LOWERBOUND && entry.score >= beta) {
            return { score: entry.score, bestMove: entry.bestMove };
        }
        if (entry.flag === TT_FLAG_UPPERBOUND && entry.score <= alpha) {
            return { score: entry.score, bestMove: entry.bestMove };
        }
    }
    return { score: null, bestMove: entry ? entry.bestMove : null };
}

function clearTT() {
    transpositionTable = new Map();
}

function handleBonusTurn(board, piece, move, depth, alpha, beta, isMaximizingPlayer, startTime, timeLimit, currentHash) {
    const bonusMoves = getBonusMoves(piece, move.to.x, move.to.y, board);
    if (bonusMoves.length === 0) {
        let nextHash = currentHash ^ zobristTurnBlack; 
        return minimax(board, depth - 1, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, nextHash);
    }
    let bestBonusEval = isMaximizingPlayer ? -Infinity : Infinity;
    for (const bonusMove of bonusMoves) {
        if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');
        const bonusBoard = copyBoard(board);
        const bonusPiece = bonusBoard[bonusMove.from.y]?.[bonusMove.from.x];
        if (!bonusPiece) continue;

        let nextHash = currentHash;
        nextHash ^= zobristTable[bonusPiece.type][bonusPiece.color][bonusMove.from.y][bonusMove.from.x];
        bonusBoard[bonusMove.to.y][bonusMove.to.x] = bonusPiece;
        bonusBoard[bonusMove.from.y][bonusMove.from.x] = null;
        nextHash ^= zobristTable[bonusPiece.type][bonusPiece.color][bonusMove.to.y][bonusMove.to.x];
        nextHash ^= zobristTurnBlack; 

        const evaluation = minimax(bonusBoard, depth - 1, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, nextHash);
        if (isMaximizingPlayer) {
            bestBonusEval = Math.max(bestBonusEval, evaluation);
            alpha = Math.max(alpha, bestBonusEval);
        } else {
            bestBonusEval = Math.min(bestBonusEval, evaluation);
            beta = Math.min(beta, bestBonusEval);
        }
        if (beta <= alpha) break;
    }
    return bestBonusEval;
}

const pieceValues = {
    'pawn': 100, 'sult': 150, 'pilut': 120, 'fin': 320, 'cope': 300, 'kor': 330, 'yoli': 330, 'chair': 500,
    'prince': 400,
    'greatshield': 300, 'finor': 550, 'jotu': 450, 'mermaid': 850, 'neptune': 1000, 'kota': 550,
    'greathorsegeneral': 1200, 'zur': 900, 'cthulhu': 1500, 'lupa': 20000
};

const SANCTUARY_THREAT_PENALTY_BASE = 500;
const SANCTUARY_DEFENSE_BONUS_BASE = 400;
const PRINCE_ADVANCEMENT_BONUS = 4;

function mirrorPST(table) {
    if (!Array.isArray(table)) { console.error("Invalid PST passed to mirrorPST:", table); return []; }
    return [...table].reverse();
}

const pawnPositionValue = [
    [0,0,0,0,0,0,0,0,0,0], [1,1,1,1,1,1,1,1,1,1], [1,1,2,2,2,2,2,2,1,1], [2,2,3,3,3,3,3,3,2,2], [2,3,3,4,4,4,4,3,3,2],
    [3,4,4,5,5,5,5,4,4,3], [4,5,5,6,6,6,6,5,5,4], [5,6,6,7,7,7,7,6,6,5], [6,7,7,8,8,8,8,7,7,6],
    [8,9,9,9,9,9,9,9,9,8], [10,10,10,10,10,10,10,10,10,10], [10,10,10,10,10,10,10,10,10,10], [5,5,5,5,5,5,5,5,5,5],
    [0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0]
];
const princePositionValue = [
    [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [ 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], [ 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], [10,10,10,10,10,10,10,10,10,10], [10,15,15,15,15,15,15,15,15,10],
    [15,20,20,20,20,20,20,20,20,15], [20,25,25,25,25,25,25,25,25,20], [30,35,35,35,35,35,35,35,35,30], [40,45,45,45,45,45,45,45,45,40],
    [50,55,55,55,55,55,55,55,55,50], [60,65,65,65,65,65,65,65,65,60], [70,75,75,75,75,75,75,75,75,70], [80,85,85,85,85,85,85,85,85,80],
    [90,95,95,95,95,95,95,95,95,90], [100,100,100,100,100,100,100,100,100,100], [100,100,100,100,100,100,100,100,100,100]
];
const knightPositionValue = [
    [-5,-4,-3,-3,-3,-3,-3,-3,-4,-5], [-4, 0, 0, 1, 1, 1, 1, 0, 0,-4], [-3, 0, 1, 2, 2, 2, 2, 1, 0,-3], [-3, 1, 2, 3, 3, 3, 3, 2, 1,-3],
    [-3, 1, 2, 3, 3, 3, 3, 2, 1,-3], [-3, 1, 2, 3, 3, 3, 3, 2, 1,-3], [-3, 1, 2, 3, 3, 3, 3, 2, 1,-3], [-3, 1, 2, 3, 3, 3, 3, 2, 1,-3],
    [-3, 1, 2, 3, 3, 3, 3, 2, 1,-3], [-3, 1, 2, 3, 3, 3, 3, 2, 1,-3], [-3, 1, 2, 3, 3, 3, 3, 2, 1,-3], [-3, 0, 1, 2, 2, 2, 2, 1, 0,-3],
    [-4, 0, 0, 1, 1, 1, 1, 0, 0,-4], [-5,-4,-3,-3,-3,-3,-3,-3,-4,-5], [-5,-4,-3,-3,-3,-3,-3,-3,-4,-5], [-5,-4,-3,-3,-3,-3,-3,-3,-4,-5]
];
const bishopPositionValue = [
    [-2,-1,-1,-1,-1,-1,-1,-1,-1,-2], [-1, 0, 0, 0, 0, 0, 0, 0, 0,-1], [-1, 0, 1, 1, 1, 1, 1, 1, 0,-1], [-1, 0, 1, 2, 2, 2, 2, 1, 0,-1],
    [-1, 0, 1, 2, 2, 2, 2, 1, 0,-1], [-1, 0, 1, 2, 2, 2, 2, 1, 0,-1], [-1, 0, 1, 2, 2, 2, 2, 1, 0,-1], [-1, 0, 1, 2, 2, 2, 2, 1, 0,-1],
    [-1, 0, 1, 2, 2, 2, 2, 1, 0,-1], [-1, 0, 1, 2, 2, 2, 2, 1, 0,-1], [-1, 0, 1, 2, 2, 2, 2, 1, 0,-1], [-1, 0, 1, 1, 1, 1, 1, 1, 0,-1],
    [-1, 0, 0, 0, 0, 0, 0, 0, 0,-1], [-2,-1,-1,-1,-1,-1,-1,-1,-1,-2], [-2,-1,-1,-1,-1,-1,-1,-1,-1,-2], [-2,-1,-1,-1,-1,-1,-1,-1,-1,-2]
];
const rookPositionValue = [
    [ 0, 0, 0, 1, 1, 1, 1, 0, 0, 0], [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1], [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1], [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1], [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1], [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1], [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1], [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1], [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1], [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
    [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1], [ 1, 2, 2, 2, 2, 2, 2, 2, 2, 1], [ 0, 0, 0, 1, 1, 1, 1, 0, 0, 0], [ 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]
];
const queenPositionValue = [
    [-2,-1,-1, 0, 0, 0, 0,-1,-1,-2], [-1, 0, 1, 1, 1, 1, 1, 1, 0,-1], [-1, 1, 1, 2, 2, 2, 2, 1, 1,-1], [ 0, 1, 2, 2, 2, 2, 2, 2, 1, 0],
    [ 0, 1, 2, 2, 2, 2, 2, 2, 1, 0], [ 0, 1, 2, 2, 2, 2, 2, 2, 1, 0], [ 0, 1, 2, 2, 2, 2, 2, 2, 1, 0], [ 0, 1, 2, 2, 2, 2, 2, 2, 1, 0],
    [ 0, 1, 2, 2, 2, 2, 2, 2, 1, 0], [ 0, 1, 2, 2, 2, 2, 2, 2, 1, 0], [ 0, 1, 2, 2, 2, 2, 2, 2, 1, 0], [-1, 1, 1, 2, 2, 2, 2, 1, 1,-1],
    [-1, 0, 1, 1, 1, 1, 1, 1, 0,-1], [-2,-1,-1, 0, 0, 0, 0,-1,-1,-2], [-2,-1,-1, 0, 0, 0, 0,-1,-1,-2], [-2,-1,-1, 0, 0, 0, 0,-1,-1,-2]
];
const kingEarlyPST = [
    [ 2, 3, 1, 0, 0, 0, 0, 1, 3, 2], [ 2, 2, 0, 0, 0, 0, 0, 0, 2, 2], [-1,-2,-2,-2,-2,-2,-2,-2,-2,-1], [-2,-3,-3,-4,-4,-4,-4,-3,-3,-2],
    [-3,-4,-4,-5,-5,-5,-5,-4,-4,-3], [-3,-4,-4,-5,-5,-5,-5,-4,-4,-3], [-3,-4,-4,-5,-5,-5,-5,-4,-4,-3], [-3,-4,-4,-5,-5,-5,-5,-4,-4,-3],
    [-3,-4,-4,-5,-5,-5,-5,-4,-4,-3], [-3,-4,-4,-5,-5,-5,-5,-4,-4,-3], [-3,-4,-4,-5,-5,-5,-5,-4,-4,-3], [-2,-3,-3,-4,-4,-4,-4,-3,-3,-2],
    [-1,-2,-2,-2,-2,-2,-2,-2,-2,-1], [ 2, 2, 0, 0, 0, 0, 0, 0, 2, 2], [ 2, 3, 1, 0, 0, 0, 0, 1, 3, 2], [ 2, 3, 1, 0, 0, 0, 0, 1, 3, 2]
];
const kingLatePST = [
    [-3,-2,-1, 0, 0, 0, 0,-1,-2,-3], [-2, 0, 1, 2, 2, 2, 2, 1, 0,-2], [-1, 1, 2, 3, 3, 3, 3, 2, 1,-1], [ 0, 2, 3, 3, 4, 4, 3, 3, 2, 0],
    [ 0, 2, 3, 3, 4, 4, 3, 3, 2, 0], [ 0, 2, 3, 3, 4, 4, 3, 3, 2, 0], [ 0, 2, 3, 3, 4, 4, 3, 3, 2, 0], [ 0, 2, 3, 3, 4, 4, 3, 3, 2, 0],
    [ 0, 2, 3, 3, 4, 4, 3, 3, 2, 0], [ 0, 2, 3, 3, 4, 4, 3, 3, 2, 0], [ 0, 2, 3, 3, 4, 4, 3, 3, 2, 0], [-1, 1, 2, 3, 3, 3, 3, 2, 1,-1],
    [-2, 0, 1, 2, 2, 2, 2, 1, 0,-2], [-3,-2,-1, 0, 0, 0, 0,-1,-2,-3], [-3,-2,-1, 0, 0, 0, 0,-1,-2,-3], [-3,-2,-1, 0, 0, 0, 0,-1,-2,-3]
];

const piecePST = {
    'pawn': pawnPositionValue, 'sult': pawnPositionValue, 'pilut': pawnPositionValue, 'cope': pawnPositionValue,
    'prince': princePositionValue,
    'kor': knightPositionValue, 'yoli': knightPositionValue,
    'fin': bishopPositionValue, 'chair': bishopPositionValue, 'greatshield': bishopPositionValue,
    'jotu': rookPositionValue, 'neptune': rookPositionValue,
    'zur': queenPositionValue, 'greathorsegeneral': queenPositionValue, 'cthulhu': queenPositionValue, 'mermaid': queenPositionValue,
    'finor': queenPositionValue, 'kota': queenPositionValue
};

function evaluateBoard(boardState) {
    if (!Array.isArray(boardState) || boardState.length !== BOT_BOARD_HEIGHT || !Array.isArray(boardState[0]) || boardState[0].length !== BOT_BOARD_WIDTH) {
        console.error("evaluateBoard received invalid boardState structure:", boardState); return 0;
    }

    let totalScore = 0; let whiteLupaPos = null; let blackLupaPos = null; let whitePrincePos = null; let blackPrincePos = null;
    let whitePrinceOnBoard = false; let blackPrinceOnBoard = false; let pieceCount = 0;
    let whiteLupaFoundEval = false; let blackLupaFoundEval = false; let whitePrinceFoundEval = false; let blackPrinceFoundEval = false;

    for(const sq of botSanctuarySquares) {
        const piece = boardState[sq.y]?.[sq.x];
        if (piece && (piece.type === 'lupa' || piece.type === 'prince')) { return piece.color === 'white' ? Infinity : -Infinity; }
    }

    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y]?.[x];
            if (piece) {
                const value = pieceValues[piece.type] || 0;
                let positionValue = 0;
                let table = piecePST[piece.type];

                if (piece.type === 'lupa') {
                    table = isKingRestricted(piece.color, boardState) ? kingEarlyPST : kingLatePST;
                    if(piece.color === 'white') whiteLupaFoundEval = true; else blackLupaFoundEval = true;
                } else if (piece.type === 'prince') {
                    if(piece.color === 'white') whitePrinceFoundEval = true; else blackPrinceFoundEval = true;
                } else { pieceCount++; }

                if (table) {
                    const pst = (piece.color === 'white') ? table : mirrorPST(table);
                    positionValue = (Array.isArray(pst) && pst[y] && pst[y][x] !== undefined) ? pst[y][x] : 0;
                } else if (piece.type === 'lupa') {
                    const kingTable = isKingRestricted(piece.color, boardState) ? kingEarlyPST : kingLatePST;
                    const pst = (piece.color === 'white') ? kingTable : mirrorPST(kingTable);
                    positionValue = (Array.isArray(pst) && pst[y] && pst[y][x] !== undefined) ? pst[y][x] : 0;
                }
                totalScore += (piece.color === 'white') ? (value + positionValue) : -(value + positionValue);
                if (piece.type === 'lupa') { if (piece.color === 'white') whiteLupaPos = {x, y}; else blackLupaPos = {x, y}; }
                if (piece.type === 'prince') { if (piece.color === 'white') whitePrincePos = {x, y}; else blackPrincePos = {x, y}; }
            }
        }
    }

    whitePrinceOnBoard = whitePrinceFoundEval;
    blackPrinceOnBoard = blackPrinceFoundEval;

    if (!whiteLupaFoundEval && !whitePrinceFoundEval) return -Infinity;
    if (!blackLupaFoundEval && !blackPrinceFoundEval) return Infinity;

    const isEndgame = pieceCount < 18;

    const royaltySafetyPenalty = 600; const princeSafetyPenalty = 300;
    if (whiteLupaPos && isSquareAttackedBy(whiteLupaPos.x, whiteLupaPos.y, boardState, 'black')) totalScore -= royaltySafetyPenalty;
    if (blackLupaPos && isSquareAttackedBy(blackLupaPos.x, blackLupaPos.y, boardState, 'white')) totalScore += royaltySafetyPenalty;
    if (whitePrincePos && isSquareAttackedBy(whitePrincePos.x, whitePrincePos.y, boardState, 'black')) totalScore -= princeSafetyPenalty;
    if (blackPrincePos && isSquareAttackedBy(blackPrincePos.x, blackPrincePos.y, boardState, 'white')) totalScore += princeSafetyPenalty;

    let whiteThreatDistance = Infinity; let threatenedSanctuary = null; let whiteThreatPieceType = null;
    const checkRoyaltyThreat = (royalPos) => {
        if (!royalPos) return { dist: Infinity, sq: null };
        let minDist = Infinity; let closestSq = null;
        for (const sanctuarySq of botSanctuarySquares) {
            const dist = Math.max(Math.abs(royalPos.x - sanctuarySq.x), Math.abs(royalPos.y - sanctuarySq.y));
            if (dist < minDist) { minDist = dist; closestSq = sanctuarySq; }
        }
        return { dist: minDist, sq: closestSq };
    };
    const whiteKingThreat = checkRoyaltyThreat(whiteLupaPos);
    const whitePrinceThreat = checkRoyaltyThreat(whitePrincePos);
    if (whiteKingThreat.dist <= whitePrinceThreat.dist) { whiteThreatDistance = whiteKingThreat.dist; threatenedSanctuary = whiteKingThreat.sq; whiteThreatPieceType = 'lupa'; }
    else { whiteThreatDistance = whitePrinceThreat.dist; threatenedSanctuary = whitePrinceThreat.sq; whiteThreatPieceType = 'prince'; }

    if (whiteThreatDistance <= 3) {
        const proximityFactor = Math.pow(4 - whiteThreatDistance, 2);
        let penalty = SANCTUARY_THREAT_PENALTY_BASE * proximityFactor;
        if (whiteThreatPieceType === 'prince') penalty *= 0.9;
        totalScore += penalty;
        if (threatenedSanctuary) {
            let defenseScore = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const checkX = threatenedSanctuary.x + dx; const checkY = threatenedSanctuary.y + dy;
                    if (isPositionValid(checkX, checkY)) {
                        const piece = boardState[checkY]?.[checkX];
                        if (piece && piece.color === 'black') {
                            const distToSq = Math.max(Math.abs(checkX - threatenedSanctuary.x), Math.abs(checkY - threatenedSanctuary.y));
                            defenseScore += SANCTUARY_DEFENSE_BONUS_BASE / (distToSq + 1);
                        }
                    }
                }
            }
            if (isSquareAttackedBy(threatenedSanctuary.x, threatenedSanctuary.y, boardState, 'black')) { defenseScore += SANCTUARY_DEFENSE_BONUS_BASE * 1.5; }
            totalScore -= defenseScore;
        }
    }

    if (blackPrincePos) {
        const rankBonus = (blackPalace.minY - blackPrincePos.y) * PRINCE_ADVANCEMENT_BONUS;
        totalScore -= rankBonus;
        if (isEndgame) { totalScore -= rankBonus * 1.5; }
    }

    return totalScore;
}

function getCaptureMoves(boardState, color) {
    const captureMoves = [];
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y]?.[x];
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

function getAllValidMoves(boardState, color, capturedPieces) {
    const allMoves = [];
    const opponentColor = color === 'white' ? 'black' : 'white';

    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
            const piece = boardState[y]?.[x];
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
            if (pieceType === 'lupa' || pieceType === 'prince') {
                continue;
            }

            const droppedPieceValue = pieceValues[pieceType] || 0;

            for (let y = 0; y < BOT_BOARD_HEIGHT; y++) {
                for (let x = 0; x < BOT_BOARD_WIDTH; x++) {
                    if (isPositionValid(x, y) && boardState[y]?.[x] === null) {

                        let isSafeDrop = true;
                        let leastValuableAttackerValue = Infinity;

                        for (let attY = 0; attY < BOT_BOARD_HEIGHT; attY++) {
                            for (let attX = 0; attX < BOT_BOARD_WIDTH; attX++) {
                                const attackerPiece = boardState[attY]?.[attX];
                                if (attackerPiece && attackerPiece.color === opponentColor) {
                                    const attackerMoves = getValidMovesForPiece(attackerPiece, attX, attY, boardState, false);
                                    for (const move of attackerMoves) {
                                        if (move.x === x && move.y === y) {
                                            const attackerValue = pieceValues[attackerPiece.type] || 0;
                                            leastValuableAttackerValue = Math.min(leastValuableAttackerValue, attackerValue);
                                            break;
                                        }
                                    }
                                }
                            }
                            if (leastValuableAttackerValue < droppedPieceValue) break;
                        }

                        if (leastValuableAttackerValue < droppedPieceValue) {
                            isSafeDrop = false;
                        }

                        if (isSafeDrop) {
                            allMoves.push({ type: 'drop', pieceType: pieceType, to: { x, y }, isAttack: false });
                        }
                    }
                }
            }
        }
    }
    return allMoves;
}

const openingBook = {
    "central_prince": [
        { from: { x: 5, y: 15 }, to: { x: 5, y: 14 } },
        { from: { x: 5, y: 14 }, to: { x: 6, y: 13 } },
        { from: { x: 4, y: 10 }, to: { x: 4, y: 8 } },
        { from: { x: 5, y: 13 }, to: { x:5, y: 12 } },
		{ from: { x: 5, y: 12 }, to: { x:4, y: 9 } },
		{ from: { x: 6, y: 12 }, to: { x:4, y: 14 } },
    ],
    "side_bishop": [
        { from: { x: 2, y: 10 }, to: { x: 2, y: 9 } },
        { from: { x: 7, y: 10 }, to: { x: 7, y: 9 } },
        { from: { x: 5, y: 15 }, to: { x: 5, y: 14 } },
        { from: { x: 4, y: 10 }, to: { x: 4, y: 9 } },
		{ from: { x: 5, y: 14 }, to: { x: 6, y: 13 } },
    ],
    "sanctuary_defense": [
        { from: { x: 1, y: 10 }, to: { x: 1, y: 9 } },
        { from: { x: 8, y: 10 }, to: { x: 8, y: 9 } },
        { from: { x: 2, y: 11 }, to: { x: 3, y: 9 } },
        { from: { x: 7, y: 11 }, to: { x: 6, y: 9 } },
    ]
};
let chosenOpeningSequence = null;
let openingMoveIndex = 0;

const MAX_SEARCH_DEPTH = 10;
let killerMoves = Array(MAX_SEARCH_DEPTH).fill(null).map(() => [null, null]);

function findBestMoveWithTimeLimit(gameState, capturedPieces, bonusMoveState = null) {
    const startTime = Date.now();
    const timeLimit = 8000;
    const { boardState, turnCount } = gameState;
    if (!boardState) {
        console.error("findBestMoveWithTimeLimit called with invalid gameState!");
        return null;
    }

    killerMoves = Array(MAX_SEARCH_DEPTH).fill(null).map(() => [null, null]);
    clearTT();

    if (turnCount <= 1) {
        chosenOpeningSequence = null;
        openingMoveIndex = 0;
    }

    if (turnCount === 1 && !chosenOpeningSequence) {
        const openingNames = Object.keys(openingBook);
        if (openingNames.length > 0) {
            const randomIndex = Math.floor(Math.random() * openingNames.length);
            const chosenName = openingNames[randomIndex];
            chosenOpeningSequence = openingBook[chosenName];
            openingMoveIndex = 0;
            console.log(`Bot selected opening: ${chosenName}`);
        }
    }

    if (chosenOpeningSequence && openingMoveIndex < chosenOpeningSequence.length && turnCount < 10) {
        const openingMove = chosenOpeningSequence[openingMoveIndex];
        const pieceAtFrom = boardState[openingMove.from.y]?.[openingMove.from.x];

        if (pieceAtFrom && pieceAtFrom.color === 'black') {
            const validMovesForPiece = getValidMovesForPiece(pieceAtFrom, openingMove.from.x, openingMove.from.y, boardState, false);
            const isOpeningMoveValid = validMovesForPiece.some(m => m.x === openingMove.to.x && m.y === openingMove.to.y);
            const immediateCaptures = getCaptureMoves(boardState, 'black');
            let bestCaptureValue = -Infinity;
            if (immediateCaptures.length > 0) {
                for (const cap of immediateCaptures) { const victim = boardState[cap.to.y]?.[cap.to.x]; const attacker = boardState[cap.from.y]?.[cap.from.x]; if(victim && attacker){ const value = (pieceValues[victim.type] || 0) - (pieceValues[attacker.type] || 0) / 10; bestCaptureValue = Math.max(bestCaptureValue, value);}}
            }

            if (isOpeningMoveValid && bestCaptureValue < (pieceValues['sult'] || 150)) {
                console.log(`Bot playing opening move ${openingMoveIndex + 1}:`, openingMove);
                openingMoveIndex++;
                const isAttack = !!boardState[openingMove.to.y]?.[openingMove.to.x];
                return { ...openingMove, type: 'board', isAttack: isAttack };
            } else {
                console.log(`Opening move ${openingMoveIndex + 1} invalid, unsafe, or better capture exists. Deviating.`);
                chosenOpeningSequence = null;
            }
        } else {
            console.log("Opening state mismatch (piece not found), deviating.");
            chosenOpeningSequence = null;
        }
    } else if (chosenOpeningSequence && openingMoveIndex >= chosenOpeningSequence.length) {
        console.log("Opening finished.");
        chosenOpeningSequence = null;
    }

    let bestMoveFound = null;
    let lastCompletedDepthResult = null;
    console.log("Bot searching with state:", { hasBonus: !!bonusMoveState });

    let currentHash = computeZobristHash(boardState, true); 

    for (let depth = 1; depth <= 3; depth++) { 
        console.log(`Searching at depth: ${depth}`);
        let currentDepthResult = null;
        try {
            currentDepthResult = findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit, bonusMoveState, currentHash);
        } catch (e) {
            if (e.message === 'TimeLimitExceeded') {
                 console.log(`Time limit exceeded during depth ${depth}. Using result from depth ${depth - 1}.`);
                 break;
             }
            console.error("Error during minimax search:", e);
            bestMoveFound = lastCompletedDepthResult;
            break;
        }
        if (currentDepthResult) {
            lastCompletedDepthResult = currentDepthResult;
        } else {
             
             if (depth === 1) {
                 console.warn("No moves found even at depth 1.");
                 break;
             }
        }
        
        if (Date.now() - startTime >= timeLimit) {
             console.log(`Time limit reached after completing depth ${depth}. Using this result.`);
             break;
         }
    }

    bestMoveFound = lastCompletedDepthResult;

    if (!bestMoveFound) {
        console.warn("Iterative deepening finished without finding a best move or timed out before depth 1 completed. Selecting random fallback.");
        let moves;
        if (bonusMoveState) {
            const { from } = bonusMoveState; const piece = boardState[from.y]?.[from.x];
            if (piece) moves = getBonusMoves(piece, from.x, from.y, boardState);
            else { console.error("Fallback Error: Piece not found for bonus move!"); moves = []; }
        } else { moves = getAllValidMoves(boardState, 'black', capturedPieces); }

        if (moves && moves.length > 0) {
            const captureMoves = moves.filter(m => m.isAttack);
            if (captureMoves.length > 0) {
                bestMoveFound = captureMoves[Math.floor(Math.random() * captureMoves.length)];
                console.log("Selected random capture fallback:", bestMoveFound);
            } else {
                bestMoveFound = moves[Math.floor(Math.random() * moves.length)];
                console.log("Selected random non-capture fallback:", bestMoveFound);
            }
        } else {
            console.error("CRITICAL: Bot found NO valid moves in fallback!"); return null;
        }
    }

    console.log("Final best move selected:", bestMoveFound);
    return bestMoveFound;
}

function findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit, bonusMoveState, currentHash) {
    let bestMove = null;
    let bestValue = Infinity;
    let alpha = -Infinity;
    let beta = Infinity;
    let moves;

    if (bonusMoveState) {
        const { from } = bonusMoveState; const piece = boardState[from.y]?.[from.x];
        if (piece) { moves = getBonusMoves(piece, from.x, from.y, boardState); }
        else { console.error("Error generating bonus moves: Piece not found!"); moves = []; }
    } else {
        moves = getAllValidMoves(boardState, 'black', capturedPieces);
    }
    if (moves.length === 0) { return null; }

    const ttProbe = probeTTEntry(currentHash, depth, alpha, beta);
    const ttBestMove = ttProbe.bestMove;

    moves.sort((a, b) => {
        let aIsTTBest = false;
        let bIsTTBest = false;
        if (ttBestMove) {
             if (a.type === ttBestMove.type) {
                if(a.type === 'board' && ttBestMove.from && a.from.x === ttBestMove.from.x && a.from.y === ttBestMove.from.y && a.to.x === ttBestMove.to.x && a.to.y === ttBestMove.to.y) aIsTTBest = true;
                if(a.type === 'drop' && a.pieceType === ttBestMove.pieceType && a.to.x === ttBestMove.to.x && a.to.y === ttBestMove.to.y) aIsTTBest = true;
             }
             if (b.type === ttBestMove.type) {
                if(b.type === 'board' && ttBestMove.from && b.from.x === ttBestMove.from.x && b.from.y === ttBestMove.from.y && b.to.x === ttBestMove.to.x && b.to.y === ttBestMove.to.y) bIsTTBest = true;
                if(b.type === 'drop' && b.pieceType === ttBestMove.pieceType && b.to.x === ttBestMove.to.x && b.to.y === ttBestMove.to.y) bIsTTBest = true;
             }
        }
        if (aIsTTBest !== bIsTTBest) return aIsTTBest ? -1 : 1;

        let scoreA = 0;
        let scoreB = 0;
        const DEFENSIVE_PILUT_DROP_BONUS = 500;

        if (a.type === 'board') {
            if (a.isAttack) {
                const victim = boardState[a.to.y]?.[a.to.x];
                const attacker = boardState[a.from.y]?.[a.from.x];
                scoreA = (victim ? (pieceValues[victim.type] || 0) * 10 : 0) - (attacker ? (pieceValues[attacker.type] || 0) : 1000);
            } else {
                const piece = boardState[a.from.y]?.[a.from.x];
                if (piece && piece.type === 'prince' && piece.color === 'black') {
                    scoreA += (a.from.y - a.to.y) * 5;
                }
            }
        } else if (a.type === 'drop' && a.pieceType === 'pilut') {
            const dropX = a.to.x;
            const dropY = a.to.y;
            const protectedY = dropY + 1;
            if (isPositionValid(dropX, protectedY)) {
                const potentiallyProtectedPiece = boardState[protectedY]?.[dropX];
                if (potentiallyProtectedPiece && potentiallyProtectedPiece.color === 'black') {
                    if (isSquareAttackedBy(dropX, protectedY, boardState, 'white')) {
                        scoreA += DEFENSIVE_PILUT_DROP_BONUS + (pieceValues[potentiallyProtectedPiece.type] || 0);
                    }
                }
            }
        }

        if (b.type === 'board') {
            if (b.isAttack) {
                const victim = boardState[b.to.y]?.[b.to.x];
                const attacker = boardState[b.from.y]?.[b.from.x];
                scoreB = (victim ? (pieceValues[victim.type] || 0) * 10 : 0) - (attacker ? (pieceValues[attacker.type] || 0) : 1000);
            } else {
                const piece = boardState[b.from.y]?.[b.from.x];
                if (piece && piece.type === 'prince' && piece.color === 'black') {
                    scoreB += (b.from.y - b.to.y) * 5;
                }
            }
        } else if (b.type === 'drop' && b.pieceType === 'pilut') {
            const dropX = b.to.x;
            const dropY = b.to.y;
            const protectedY = dropY + 1;
            if (isPositionValid(dropX, protectedY)) {
                const potentiallyProtectedPiece = boardState[protectedY]?.[dropX];
                if (potentiallyProtectedPiece && potentiallyProtectedPiece.color === 'black') {
                    if (isSquareAttackedBy(dropX, protectedY, boardState, 'white')) {
                        scoreB += DEFENSIVE_PILUT_DROP_BONUS + (pieceValues[potentiallyProtectedPiece.type] || 0);
                    }
                }
            }
        }

        return scoreB - scoreA;
    });

    let bestMoveCurrentDepth = null;
    let originalAlpha = alpha;

    for (const move of moves) {
        if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');
        const tempBoard = copyBoard(boardState);
        let nextHash = currentHash;

        if (move.type === 'drop') {
            const pieceType = move.pieceType;
            tempBoard[move.to.y][move.to.x] = { type: pieceType, color: 'black' };
             if(zobristTable[pieceType] && zobristTable[pieceType]['black'][move.to.y][move.to.x]){
                nextHash ^= zobristTable[pieceType]['black'][move.to.y][move.to.x];
             } else { console.warn("Missing Zobrist key for drop:", pieceType, move.to.y, move.to.x); }
        } else {
            const pieceToMove = tempBoard[move.from.y]?.[move.from.x];
            if (!pieceToMove) { console.warn("Piece not found for board move:", move); continue; }
            const targetPiece = tempBoard[move.to.y]?.[move.to.x];

            if(zobristTable[pieceToMove.type]?.[pieceToMove.color]?.[move.from.y]?.[move.from.x]){
                 nextHash ^= zobristTable[pieceToMove.type][pieceToMove.color][move.from.y][move.from.x];
            } else { console.warn("Missing Zobrist key for move from:", pieceToMove, move.from.y, move.from.x); }


            if (targetPiece) {
                 if(zobristTable[targetPiece.type]?.[targetPiece.color]?.[move.to.y]?.[move.to.x]){
                    nextHash ^= zobristTable[targetPiece.type][targetPiece.color][move.to.y][move.to.x];
                 } else { console.warn("Missing Zobrist key for capture:", targetPiece, move.to.y, move.to.x); }
            }

            tempBoard[move.to.y][move.to.x] = pieceToMove;
            tempBoard[move.from.y][move.from.x] = null;

            if(zobristTable[pieceToMove.type]?.[pieceToMove.color]?.[move.to.y]?.[move.to.x]){
                 nextHash ^= zobristTable[pieceToMove.type][pieceToMove.color][move.to.y][move.to.x];
            } else { console.warn("Missing Zobrist key for move to:", pieceToMove, move.to.y, move.to.x); }

        }
        nextHash ^= zobristTurnBlack;

        let boardValue;
        const pieceMoved = tempBoard[move.to.y]?.[move.to.x];
        const isCopeBonusTrigger = !bonusMoveState && pieceMoved?.type === 'cope' && move.isAttack;
        const isGHGBonusTrigger = !bonusMoveState && move.type === 'board' && (pieceMoved?.type === 'greathorsegeneral' || pieceMoved?.type === 'cthulhu') && !move.isAttack;

        if (isCopeBonusTrigger || isGHGBonusTrigger) {
            boardValue = handleBonusTurn(tempBoard, pieceMoved, move, depth, alpha, beta, false, startTime, timeLimit, nextHash);
        } else {
            boardValue = minimax(tempBoard, depth - 1, alpha, beta, true, startTime, timeLimit, nextHash);
        }

        if (boardValue < bestValue) {
            bestValue = boardValue;
            bestMove = move;
            bestMoveCurrentDepth = move;
        }
        beta = Math.min(beta, boardValue);
        if (beta <= alpha) {
            if (!move.isAttack && move.from) {
                storeKillerMove(depth, move);
            }
            break;
        }
    }

    let flag = TT_FLAG_EXACT;
    if (bestValue <= originalAlpha) {
        flag = TT_FLAG_UPPERBOUND;
    } else if (bestValue >= beta) {
        flag = TT_FLAG_LOWERBOUND;
    }
    if (bestMoveCurrentDepth) {
       storeTTEntry(currentHash, depth, bestValue, flag, bestMoveCurrentDepth);
    }

    return bestMove;
}

function storeKillerMove(depth, move) {
    if (depth < 0 || depth >= MAX_SEARCH_DEPTH) return;
    if (killerMoves[depth][0] && killerMoves[depth][0].from && move.from && killerMoves[depth][0].from.x === move.from.x && killerMoves[depth][0].from.y === move.from.y && killerMoves[depth][0].to.x === move.to.x && killerMoves[depth][0].to.y === move.to.y) {
        return;
    }
    killerMoves[depth][1] = killerMoves[depth][0];
    killerMoves[depth][0] = move;
}


function minimax(boardState, depth, alpha, beta, isMaximizingPlayer, startTime, timeLimit, currentHash) {
    if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');

    let alphaOrig = alpha;
    const ttProbe = probeTTEntry(currentHash, depth, alpha, beta);
    if (ttProbe.score !== null) {
        return ttProbe.score;
    }
    const ttBestMove = ttProbe.bestMove;

    let whiteLupaPos = null, blackLupaPos = null, whitePrinceOnBoard = false, blackPrinceOnBoard = false;
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) { for (let x = 0; x < BOT_BOARD_WIDTH; x++) { const p = boardState[y]?.[x]; if (p) { if(p.type==='lupa'){if(p.color==='white')whiteLupaPos={x,y};else blackLupaPos={x,y};} else if(p.type==='prince'){if(p.color==='white')whitePrinceOnBoard=true;else blackPrinceOnBoard=true;}}}}
    for(const sq of botSanctuarySquares) { const p = boardState[sq.y]?.[sq.x]; if (p && (p.type === 'lupa' || p.type === 'prince')) return p.color === 'white' ? Infinity : -Infinity; }
    if (!whiteLupaPos && !whitePrinceOnBoard) return -Infinity - depth;
    if (!blackLupaPos && !blackPrinceOnBoard) return Infinity + depth;

    if (depth === 0) {
        return quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer, startTime, timeLimit, QUIESCENCE_MAX_DEPTH, currentHash);
    }

    const color = isMaximizingPlayer ? 'white' : 'black';
    const moves = getAllValidMoves(boardState, color, []);
    if (moves.length === 0) {
        const kingPos = isMaximizingPlayer ? whiteLupaPos : blackLupaPos;
        const opponentColor = isMaximizingPlayer ? 'black' : 'white';
        if (kingPos && isSquareAttackedBy(kingPos.x, kingPos.y, boardState, opponentColor)) { return isMaximizingPlayer ? -Infinity - depth : Infinity + depth; }
        else { return 0; }
    }

    moves.sort((a, b) => {
         let aIsTTBest = false;
         let bIsTTBest = false;
         if (ttBestMove) {
              if (a.type === ttBestMove.type) {
                 if(a.type === 'board' && ttBestMove.from && a.from.x === ttBestMove.from.x && a.from.y === ttBestMove.from.y && a.to.x === ttBestMove.to.x && a.to.y === ttBestMove.to.y) aIsTTBest = true;
                 if(a.type === 'drop' && a.pieceType === ttBestMove.pieceType && a.to.x === ttBestMove.to.x && a.to.y === ttBestMove.to.y) aIsTTBest = true;
              }
              if (b.type === ttBestMove.type) {
                 if(b.type === 'board' && ttBestMove.from && b.from.x === ttBestMove.from.x && b.from.y === ttBestMove.from.y && b.to.x === ttBestMove.to.x && b.to.y === ttBestMove.to.y) bIsTTBest = true;
                 if(b.type === 'drop' && b.pieceType === ttBestMove.pieceType && b.to.x === ttBestMove.to.x && b.to.y === ttBestMove.to.y) bIsTTBest = true;
              }
         }
         if (aIsTTBest !== bIsTTBest) return aIsTTBest ? -1 : 1;

        if (a.isAttack !== b.isAttack) {
            return a.isAttack ? -1 : 1;
        }
        if (a.isAttack) {
            const victimA = boardState[a.to.y]?.[a.to.x]; const attackerA = a.from ? boardState[a.from.y]?.[a.from.x] : null;
            const victimB = boardState[b.to.y]?.[b.to.x]; const attackerB = b.from ? boardState[b.from.y]?.[b.from.x] : null;
            const valA = (victimA ? (pieceValues[victimA.type] || 0) * 10 : 0) - (attackerA ? (pieceValues[attackerA.type] || 0) : 1000);
            const valB = (victimB ? (pieceValues[victimB.type] || 0) * 10 : 0) - (attackerB ? (pieceValues[attackerB.type] || 0) : 1000);
            return valB - valA;
        }

        const killers = (depth >= 0 && depth < MAX_SEARCH_DEPTH) ? killerMoves[depth] : [null, null];
        let aIsKiller = false; let bIsKiller = false;
        if (a.from && killers[0]) { aIsKiller = a.from.x === killers[0].from.x && a.from.y === killers[0].from.y && a.to.x === killers[0].to.x && a.to.y === killers[0].to.y; }
        if (a.from && killers[1] && !aIsKiller) { aIsKiller = a.from.x === killers[1].from.x && a.from.y === killers[1].from.y && a.to.x === killers[1].to.x && a.to.y === killers[1].to.y; }
        if (b.from && killers[0]) { bIsKiller = b.from.x === killers[0].from.x && b.from.y === killers[0].from.y && b.to.x === killers[0].to.x && b.to.y === killers[0].to.y; }
        if (b.from && killers[1] && !bIsKiller) { bIsKiller = b.from.x === killers[1].from.x && b.from.y === killers[1].from.y && b.to.x === killers[1].to.x && b.to.y === killers[1].to.y; }
        if (aIsKiller !== bIsKiller) { return aIsKiller ? -1 : 1; }

        return 0;
    });

    let bestMove = null;

    if (isMaximizingPlayer) {
        let maxEval = -Infinity;
        for (const move of moves) {
            if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');
            const tempBoard = copyBoard(boardState); let nextHash = currentHash;

            if (move.type === 'drop') {
                const pieceType = move.pieceType;
                tempBoard[move.to.y][move.to.x] = { type: pieceType, color: color };
                if(zobristTable[pieceType]?.[color]?.[move.to.y]?.[move.to.x]){
                    nextHash ^= zobristTable[pieceType][color][move.to.y][move.to.x];
                } else { console.warn("Missing Zobrist key for drop:", pieceType, color, move.to.y, move.to.x); }
            } else {
                const pieceToMove = tempBoard[move.from.y]?.[move.from.x]; if (!pieceToMove) continue;
                const targetPiece = tempBoard[move.to.y]?.[move.to.x];
                 if(zobristTable[pieceToMove.type]?.[pieceToMove.color]?.[move.from.y]?.[move.from.x]){
                     nextHash ^= zobristTable[pieceToMove.type][pieceToMove.color][move.from.y][move.from.x];
                 } else { console.warn("Missing Zobrist key for move from:", pieceToMove, move.from.y, move.from.x); }
                if (targetPiece) {
                     if(zobristTable[targetPiece.type]?.[targetPiece.color]?.[move.to.y]?.[move.to.x]){
                        nextHash ^= zobristTable[targetPiece.type][targetPiece.color][move.to.y][move.to.x];
                     } else { console.warn("Missing Zobrist key for capture:", targetPiece, move.to.y, move.to.x); }
                }
                tempBoard[move.to.y][move.to.x] = pieceToMove;
                tempBoard[move.from.y][move.from.x] = null;
                 if(zobristTable[pieceToMove.type]?.[pieceToMove.color]?.[move.to.y]?.[move.to.x]){
                    nextHash ^= zobristTable[pieceToMove.type][pieceToMove.color][move.to.y][move.to.x];
                 } else { console.warn("Missing Zobrist key for move to:", pieceToMove, move.to.y, move.to.x); }
            }
            nextHash ^= zobristTurnBlack;

            const pieceMoved = tempBoard[move.to.y]?.[move.to.x];
            const isCopeBonusTrigger = pieceMoved?.type === 'cope' && move.isAttack;
            const isGHGBonusTrigger = (pieceMoved?.type === 'greathorsegeneral' || pieceMoved?.type === 'cthulhu') && !move.isAttack && move.type === 'board';
            let eval;
            if (isCopeBonusTrigger || isGHGBonusTrigger) {
                 eval = handleBonusTurn(tempBoard, pieceMoved, move, depth, alpha, beta, true, startTime, timeLimit, nextHash);
            } else {
                eval = minimax(tempBoard, depth - 1, alpha, beta, false, startTime, timeLimit, nextHash);
            }

            if (eval > maxEval) {
                maxEval = eval;
                bestMove = move;
            }
            alpha = Math.max(alpha, eval);
            if (beta <= alpha) {
                if (!move.isAttack && move.from) { storeKillerMove(depth, move); }
                break;
            }
        }
        let flag = TT_FLAG_EXACT;
        if (maxEval <= alphaOrig) { flag = TT_FLAG_UPPERBOUND; }
        else if (maxEval >= beta) { flag = TT_FLAG_LOWERBOUND; }
        storeTTEntry(currentHash, depth, maxEval, flag, bestMove);
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of moves) {
            if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');
            const tempBoard = copyBoard(boardState); let nextHash = currentHash;

             if (move.type === 'drop') {
                 const pieceType = move.pieceType;
                 tempBoard[move.to.y][move.to.x] = { type: pieceType, color: color };
                if(zobristTable[pieceType]?.[color]?.[move.to.y]?.[move.to.x]){
                    nextHash ^= zobristTable[pieceType][color][move.to.y][move.to.x];
                 } else { console.warn("Missing Zobrist key for drop:", pieceType, color, move.to.y, move.to.x); }
             } else {
                 const pieceToMove = tempBoard[move.from.y]?.[move.from.x]; if (!pieceToMove) continue;
                 const targetPiece = tempBoard[move.to.y]?.[move.to.x];
                  if(zobristTable[pieceToMove.type]?.[pieceToMove.color]?.[move.from.y]?.[move.from.x]){
                      nextHash ^= zobristTable[pieceToMove.type][pieceToMove.color][move.from.y][move.from.x];
                  } else { console.warn("Missing Zobrist key for move from:", pieceToMove, move.from.y, move.from.x); }
                 if (targetPiece) {
                      if(zobristTable[targetPiece.type]?.[targetPiece.color]?.[move.to.y]?.[move.to.x]){
                         nextHash ^= zobristTable[targetPiece.type][targetPiece.color][move.to.y][move.to.x];
                      } else { console.warn("Missing Zobrist key for capture:", targetPiece, move.to.y, move.to.x); }
                 }
                 tempBoard[move.to.y][move.to.x] = pieceToMove;
                 tempBoard[move.from.y][move.from.x] = null;
                  if(zobristTable[pieceToMove.type]?.[pieceToMove.color]?.[move.to.y]?.[move.to.x]){
                     nextHash ^= zobristTable[pieceToMove.type][pieceToMove.color][move.to.y][move.to.x];
                  } else { console.warn("Missing Zobrist key for move to:", pieceToMove, move.to.y, move.to.x); }
             }
             nextHash ^= zobristTurnBlack;

            const pieceMoved = tempBoard[move.to.y]?.[move.to.x];
            const isCopeBonusTrigger = pieceMoved?.type === 'cope' && move.isAttack;
            const isGHGBonusTrigger = (pieceMoved?.type === 'greathorsegeneral' || pieceMoved?.type === 'cthulhu') && !move.isAttack && move.type === 'board';
            let eval;
            if (isCopeBonusTrigger || isGHGBonusTrigger) {
                eval = handleBonusTurn(tempBoard, pieceMoved, move, depth, alpha, beta, false, startTime, timeLimit, nextHash);
            } else {
                eval = minimax(tempBoard, depth - 1, alpha, beta, true, startTime, timeLimit, nextHash);
            }

            if (eval < minEval) {
                minEval = eval;
                bestMove = move;
            }
            beta = Math.min(beta, eval);
            if (beta <= alpha) {
                if (!move.isAttack && move.from) { storeKillerMove(depth, move); }
                break;
            }
        }
        let flag = TT_FLAG_EXACT;
        if (minEval <= alphaOrig) { flag = TT_FLAG_UPPERBOUND; }
        else if (minEval >= beta) { flag = TT_FLAG_LOWERBOUND; }
        storeTTEntry(currentHash, depth, minEval, flag, bestMove);
        return minEval;
    }
}


const QUIESCENCE_MAX_DEPTH = 3;

function quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer, startTime, timeLimit, depth = QUIESCENCE_MAX_DEPTH, currentHash) {
    if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');

    let alphaOrig = alpha;
    
  

    let whiteLupaPosQ = null, blackLupaPosQ = null, whitePrinceOnBoardQ = false, blackPrinceOnBoardQ = false;
    for (let y = 0; y < BOT_BOARD_HEIGHT; y++) { for (let x = 0; x < BOT_BOARD_WIDTH; x++) { const p = boardState[y]?.[x]; if (p) { if(p.type==='lupa'){if(p.color==='white')whiteLupaPosQ={x,y};else blackLupaPosQ={x,y};} else if(p.type==='prince'){if(p.color==='white')whitePrinceOnBoardQ=true;else blackPrinceOnBoardQ=true;}}}}
    for(const sq of botSanctuarySquares) { const p = boardState[sq.y]?.[sq.x]; if (p && (p.type === 'lupa' || p.type === 'prince')) return p.color === 'white' ? Infinity : -Infinity; }
    if (!whiteLupaPosQ && !whitePrinceOnBoardQ) return -Infinity - depth;
    if (!blackLupaPosQ && !blackPrinceOnBoardQ) return Infinity + depth;

    let stand_pat = evaluateBoard(boardState);
    if (depth === 0) return stand_pat;

    if (isMaximizingPlayer) {
        if (stand_pat >= beta) return beta;
        alpha = Math.max(alpha, stand_pat);
    } else {
        if (stand_pat <= alpha) return alpha;
        beta = Math.min(beta, stand_pat);
    }

    const color = isMaximizingPlayer ? 'white' : 'black';
    const captureMoves = getCaptureMoves(boardState, color);
    if (captureMoves.length === 0) return stand_pat;

    captureMoves.sort((a, b) => {
        const victimA = boardState[a.to.y]?.[a.to.x]; const victimB = boardState[b.to.y]?.[b.to.x];
        const attackerA = boardState[a.from.y]?.[a.from.x]; const attackerB = boardState[b.from.y]?.[b.from.x];
        const victimValA = victimA ? (pieceValues[victimA.type] || 0) : 0; const victimValB = victimB ? (pieceValues[victimB.type] || 0) : 0;
        const attackerValA = attackerA ? (pieceValues[attackerA.type] || 0) : 0; const attackerValB = attackerB ? (pieceValues[attackerB.type] || 0) : 0;
        if (victimValA !== victimValB) return victimValB - victimValA; else return attackerValA - attackerValB;
    });

    let bestMove = null;

    for (const move of captureMoves) {
        if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');
        const tempBoard = copyBoard(boardState);
        const piece = tempBoard[move.from.y]?.[move.from.x];
        if (!piece) continue;
        const targetPiece = tempBoard[move.to.y]?.[move.to.x];
        let nextHash = currentHash;

        if(zobristTable[piece.type]?.[piece.color]?.[move.from.y]?.[move.from.x]){
             nextHash ^= zobristTable[piece.type][piece.color][move.from.y][move.from.x];
        } else { console.warn("Missing Zobrist key QSearch move from:", piece, move.from.y, move.from.x); }
        if (targetPiece) {
            if(zobristTable[targetPiece.type]?.[targetPiece.color]?.[move.to.y]?.[move.to.x]){
               nextHash ^= zobristTable[targetPiece.type][targetPiece.color][move.to.y][move.to.x];
            } else { console.warn("Missing Zobrist key QSearch capture:", targetPiece, move.to.y, move.to.x); }
        } else { console.warn("Quiescence search move was not a capture?", move); } 

        tempBoard[move.to.y][move.to.x] = piece;
        tempBoard[move.from.y][move.from.x] = null;

        if(zobristTable[piece.type]?.[piece.color]?.[move.to.y]?.[move.to.x]){
            nextHash ^= zobristTable[piece.type][piece.color][move.to.y][move.to.x];
        } else { console.warn("Missing Zobrist key QSearch move to:", piece, move.to.y, move.to.x); }
        nextHash ^= zobristTurnBlack;

        let score = quiescenceSearch(tempBoard, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, depth - 1, nextHash);

        if (isMaximizingPlayer) {
             if (score > alpha) {
                 alpha = score;
                 bestMove = move;
             }
             if (beta <= alpha) break;
        } else {
             if (score < beta) {
                 beta = score;
                 bestMove = move;
             }
             if (beta <= alpha) break;
        }
    }

    


    return isMaximizingPlayer ? alpha : beta;
}