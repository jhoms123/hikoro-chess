importScripts('gamelogic.js');
const BOT_BOARD_WIDTH = 10;
const BOT_BOARD_HEIGHT = 16;

const whitePalace = { minY: 0, maxY: 1, minX: 3, maxX: 6 };
const blackPalace = { minY: 14, maxY: 15, minX: 3, maxX: 6 };

const botSanctuarySquares = [
    {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
    {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
];

// --- Piece Values & PSTs ---
const pieceValues = {
    'pawn': 100, 'sult': 150, 'pilut': 120, 'fin': 320, 'cope': 300, 'kor': 330, 'yoli': 330, 'chair': 500,
    'prince': 400,
    'greatshield': 300, 'finor': 550, 'jotu': 450, 'mermaid': 850, 'neptune': 1000, 'kota': 550,
    'greathorsegeneral': 1200, 'zur': 900, 'cthulhu': 1500, 'lupa': 20000
};
const SANCTUARY_THREAT_PENALTY_BASE = 500;
const SANCTUARY_DEFENSE_BONUS_BASE = 400;
const PRINCE_ADVANCEMENT_BONUS = 4;

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

// --- Zobrist & TT ---
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

// --- Killer Moves ---
const MAX_SEARCH_DEPTH = 10;
let killerMoves = Array(MAX_SEARCH_DEPTH).fill(null).map(() => [null, null]);

function storeKillerMove(depth, move) {
    if (depth < 0 || depth >= MAX_SEARCH_DEPTH) return;
    if (killerMoves[depth][0] && killerMoves[depth][0].from && move.from && killerMoves[depth][0].from.x === move.from.x && killerMoves[depth][0].from.y === move.from.y && killerMoves[depth][0].to.x === move.to.x && killerMoves[depth][0].to.y === move.to.y) {
        return;
    }
    killerMoves[depth][1] = killerMoves[depth][0];
    killerMoves[depth][0] = move;
}


// --- Opening Book ---
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




function findBestMoveWithTimeLimit(gameState, capturedPieces, bonusMoveState = null) {
    const startTime = Date.now();
    const timeLimit = 8000;
    const { boardState, turnCount } = gameState;
    if (!boardState) {
        console.error("Worker: Invalid gameState received!");
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
            console.log(`Worker: Bot selected opening: ${chosenName}`);
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
                console.log(`Worker: Bot playing opening move ${openingMoveIndex + 1}:`, openingMove);
                openingMoveIndex++;
                const isAttack = !!boardState[openingMove.to.y]?.[openingMove.to.x];
                return { ...openingMove, type: 'board', isAttack: isAttack };
            } else {
                console.log(`Worker: Opening move ${openingMoveIndex + 1} invalid, unsafe, or better capture exists. Deviating.`);
                chosenOpeningSequence = null;
            }
        } else {
            console.log("Worker: Opening state mismatch (piece not found), deviating.");
            chosenOpeningSequence = null;
        }
    } else if (chosenOpeningSequence && openingMoveIndex >= chosenOpeningSequence.length) {
        console.log("Worker: Opening finished.");
        chosenOpeningSequence = null;
    }

    let bestMoveFound = null;
    let lastCompletedDepthResult = null;
    console.log("Worker: Bot searching with state:", { hasBonus: !!bonusMoveState });

    let currentHash = computeZobristHash(boardState, true);

    for (let depth = 1; depth <= 3; depth++) {
        console.log(`Worker: Searching at depth: ${depth}`);
        let currentDepthResult = null;
        try {
            currentDepthResult = findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit, bonusMoveState, currentHash);
        } catch (e) {
             if (e.message === 'TimeLimitExceeded') {
                 console.log(`Worker: Time limit exceeded during depth ${depth}. Using result from depth ${depth - 1}.`);
                 break;
             }
            console.error("Worker: Error during minimax search:", e);
            bestMoveFound = lastCompletedDepthResult;
            break;
        }
        if (currentDepthResult) {
            lastCompletedDepthResult = currentDepthResult;
         } else {
             if (depth === 1) {
                 console.warn("Worker: No moves found even at depth 1.");
                 break;
             }
        }
         if (Date.now() - startTime >= timeLimit) {
             console.log(`Worker: Time limit reached after completing depth ${depth}. Using this result.`);
             break;
         }
    }

    bestMoveFound = lastCompletedDepthResult;

    if (!bestMoveFound) {
        console.warn("Worker: Iterative deepening finished without finding a best move or timed out before depth 1 completed. Selecting random fallback.");
        let moves;
        if (bonusMoveState) {
            const { from } = bonusMoveState; const piece = boardState[from.y]?.[from.x];
            if (piece) moves = getBonusMoves(piece, from.x, from.y, boardState);
            else { console.error("Worker: Fallback Error - Piece not found for bonus move!"); moves = []; }
        } else { moves = getAllValidMoves(boardState, 'black', capturedPieces); }

        if (moves && moves.length > 0) {
            const captureMoves = moves.filter(m => m.isAttack);
            if (captureMoves.length > 0) {
                bestMoveFound = captureMoves[Math.floor(Math.random() * captureMoves.length)];
                console.log("Worker: Selected random capture fallback:", bestMoveFound);
            } else {
                bestMoveFound = moves[Math.floor(Math.random() * moves.length)];
                console.log("Worker: Selected random non-capture fallback:", bestMoveFound);
            }
        } else {
            console.error("Worker: CRITICAL - Bot found NO valid moves in fallback!"); return null;
        }
    }

    console.log("Worker: Final best move selected:", bestMoveFound);
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
        else { console.error("Worker: Error generating bonus moves - Piece not found!"); moves = []; }
    } else {
        moves = getAllValidMoves(boardState, 'black', capturedPieces);
    }
    if (moves.length === 0) { return null; }

    const ttProbe = probeTTEntry(currentHash, depth, alpha, beta);
    const ttBestMove = ttProbe.bestMove;

    const getMinSanctuaryDist = (pieceX, pieceY) => {
        let minDist = Infinity;
        for (const sq of botSanctuarySquares) {
            const dist = Math.max(Math.abs(pieceX - sq.x), Math.abs(pieceY - sq.y));
            minDist = Math.min(minDist, dist);
        }
        return minDist;
    };


    moves.sort((a, b) => {
        let aIsTTBest = false;
        let bIsTTBest = false;
        if (ttBestMove) {
             if (a.type === ttBestMove.type) {
                if(a.type === 'board' && ttBestMove.from && a.from && a.from.x === ttBestMove.from.x && a.from.y === ttBestMove.from.y && a.to.x === ttBestMove.to.x && a.to.y === ttBestMove.to.y) aIsTTBest = true;
                if(a.type === 'drop' && a.pieceType === ttBestMove.pieceType && a.to.x === ttBestMove.to.x && a.to.y === ttBestMove.to.y) aIsTTBest = true;
             }
             if (b.type === ttBestMove.type) {
                if(b.type === 'board' && ttBestMove.from && b.from && b.from.x === ttBestMove.from.x && b.from.y === ttBestMove.from.y && b.to.x === ttBestMove.to.x && b.to.y === ttBestMove.to.y) bIsTTBest = true;
                if(b.type === 'drop' && b.pieceType === ttBestMove.pieceType && b.to.x === ttBestMove.to.x && b.to.y === ttBestMove.to.y) bIsTTBest = true;
             }
        }
        if (aIsTTBest !== bIsTTBest) return aIsTTBest ? -1 : 1;

        let sanctuaryScoreA = 0;
        let sanctuaryScoreB = 0;
        const SANCTUARY_MOVE_BONUS = 10000;
        let whiteLupaPos = null; let whitePrincePos = null; // Find opponent royalty for sort heuristic
        for (let y=0; y<BOT_BOARD_HEIGHT; y++) { for (let x=0; x<BOT_BOARD_WIDTH; x++) { const p = boardState[y]?.[x]; if (p && p.color === 'white'){ if(p.type === 'lupa') whiteLupaPos = {x, y}; else if (p.type === 'prince') whitePrincePos = {x, y}; } } }
        const whiteRoyalPos = whitePrincePos || whiteLupaPos; // Prince is usually the bigger threat


        if (a.type === 'board' && a.from) {
             const pieceA = boardState[a.from.y]?.[a.from.x];
             if (pieceA && (pieceA.type === 'lupa' || pieceA.type === 'prince')) {
                 const distBefore = getMinSanctuaryDist(a.from.x, a.from.y);
                 const distAfter = getMinSanctuaryDist(a.to.x, a.to.y);
                 if (pieceA.color === 'black' && distAfter < distBefore) sanctuaryScoreA += SANCTUARY_MOVE_BONUS / (distAfter + 1);
                 if (pieceA.color === 'white' && distAfter > distBefore && distBefore <=2) sanctuaryScoreA += SANCTUARY_MOVE_BONUS / 2; // Only bonus if pushing *away* from near sanctuary
             }
              if (whiteRoyalPos && getMinSanctuaryDist(whiteRoyalPos.x, whiteRoyalPos.y) <= 2) {
                 if (getMinSanctuaryDist(a.to.x, a.to.y) <= 1) sanctuaryScoreA += SANCTUARY_MOVE_BONUS / 3;
                 if (a.isAttack && a.to.x === whiteRoyalPos.x && a.to.y === whiteRoyalPos.y) sanctuaryScoreA += SANCTUARY_MOVE_BONUS;
              }
        }
         else if (a.type === 'drop' && a.pieceType === 'pilut') {
             const protectedY = a.to.y + 1;
              const potentiallyProtectedPiece = boardState[protectedY]?.[a.to.x];
               if (potentiallyProtectedPiece && potentiallyProtectedPiece.color === 'black' && isSquareAttackedBy(a.to.x, protectedY, boardState, 'white') && getMinSanctuaryDist(a.to.x, protectedY) <=2) {
                    sanctuaryScoreA += SANCTUARY_MOVE_BONUS / 2;
               }
         }

         if (b.type === 'board' && b.from) {
              const pieceB = boardState[b.from.y]?.[b.from.x];
              if (pieceB && (pieceB.type === 'lupa' || pieceB.type === 'prince')) {
                  const distBefore = getMinSanctuaryDist(b.from.x, b.from.y);
                  const distAfter = getMinSanctuaryDist(b.to.x, b.to.y);
                  if (pieceB.color === 'black' && distAfter < distBefore) sanctuaryScoreB += SANCTUARY_MOVE_BONUS / (distAfter + 1);
                   if (pieceB.color === 'white' && distAfter > distBefore && distBefore <=2) sanctuaryScoreB += SANCTUARY_MOVE_BONUS / 2;
              }
               if (whiteRoyalPos && getMinSanctuaryDist(whiteRoyalPos.x, whiteRoyalPos.y) <= 2) {
                  if (getMinSanctuaryDist(b.to.x, b.to.y) <= 1) sanctuaryScoreB += SANCTUARY_MOVE_BONUS / 3;
                  if (b.isAttack && b.to.x === whiteRoyalPos.x && b.to.y === whiteRoyalPos.y) sanctuaryScoreB += SANCTUARY_MOVE_BONUS;
               }
         }
          else if (b.type === 'drop' && b.pieceType === 'pilut') {
              const protectedY = b.to.y + 1;
               const potentiallyProtectedPiece = boardState[protectedY]?.[b.to.x];
                if (potentiallyProtectedPiece && potentiallyProtectedPiece.color === 'black' && isSquareAttackedBy(b.to.x, protectedY, boardState, 'white') && getMinSanctuaryDist(b.to.x, protectedY) <=2) {
                     sanctuaryScoreB += SANCTUARY_MOVE_BONUS / 2;
                }
          }

        if (sanctuaryScoreA !== sanctuaryScoreB) return sanctuaryScoreB - sanctuaryScoreA;


        if (a.isAttack !== b.isAttack) return a.isAttack ? -1 : 1;
        if (a.isAttack) {
            const victimA = boardState[a.to.y]?.[a.to.x]; const attackerA = a.from ? boardState[a.from.y]?.[a.from.x] : null;
            const victimB = boardState[b.to.y]?.[b.to.x]; const attackerB = b.from ? boardState[b.from.y]?.[b.from.x] : null;
            const valA = (victimA ? (pieceValues[victimA.type] || 0) * 10 : 0) - (attackerA ? (pieceValues[attackerA.type] || 0) : 1000);
            const valB = (victimB ? (pieceValues[victimB.type] || 0) * 10 : 0) - (attackerB ? (pieceValues[attackerB.type] || 0) : 1000);
             if (valA !== valB) return valB - valA;
        }


        const killers = (depth >= 0 && depth < MAX_SEARCH_DEPTH) ? killerMoves[depth] : [null, null];
        let aIsKiller = false; let bIsKiller = false;
        if (a.from && killers[0] && killers[0].from) { aIsKiller = a.from.x === killers[0].from.x && a.from.y === killers[0].from.y && a.to.x === killers[0].to.x && a.to.y === killers[0].to.y; }
        if (a.from && killers[1] && killers[1].from && !aIsKiller) { aIsKiller = a.from.x === killers[1].from.x && a.from.y === killers[1].from.y && a.to.x === killers[1].to.x && a.to.y === killers[1].to.y; }
        if (b.from && killers[0] && killers[0].from) { bIsKiller = b.from.x === killers[0].from.x && b.from.y === killers[0].from.y && b.to.x === killers[0].to.x && b.to.y === killers[0].to.y; }
        if (b.from && killers[1] && killers[1].from && !bIsKiller) { bIsKiller = b.from.x === killers[1].from.x && b.from.y === killers[1].from.y && b.to.x === killers[1].to.x && b.to.y === killers[1].to.y; }
        if (aIsKiller !== bIsKiller) { return aIsKiller ? -1 : 1; }

        let scoreA_pilut = 0; let scoreB_pilut = 0;
        const DEFENSIVE_PILUT_DROP_BONUS = 500;
         if (a.type === 'drop' && a.pieceType === 'pilut') {
            const protectedY_A = a.to.y + 1;
            if (isPositionValid(a.to.x, protectedY_A)) {
                const potentiallyProtectedPiece_A = boardState[protectedY_A]?.[a.to.x];
                if (potentiallyProtectedPiece_A && potentiallyProtectedPiece_A.color === 'black' && isSquareAttackedBy(a.to.x, protectedY_A, boardState, 'white')) {
                    scoreA_pilut += DEFENSIVE_PILUT_DROP_BONUS + (pieceValues[potentiallyProtectedPiece_A.type] || 0);
                }
            }
        }
         if (b.type === 'drop' && b.pieceType === 'pilut') {
             const protectedY_B = b.to.y + 1;
             if (isPositionValid(b.to.x, protectedY_B)) {
                 const potentiallyProtectedPiece_B = boardState[protectedY_B]?.[b.to.x];
                 if (potentiallyProtectedPiece_B && potentiallyProtectedPiece_B.color === 'black' && isSquareAttackedBy(b.to.x, protectedY_B, boardState, 'white')) {
                     scoreB_pilut += DEFENSIVE_PILUT_DROP_BONUS + (pieceValues[potentiallyProtectedPiece_B.type] || 0);
                 }
             }
         }
         if (scoreA_pilut !== scoreB_pilut) return scoreB_pilut - scoreA_pilut;

        let scoreA_prince = 0; let scoreB_prince = 0;
        if (!a.isAttack && a.type==='board' && a.from) { const piece = boardState[a.from.y]?.[a.from.x]; if (piece && piece.type === 'prince' && piece.color === 'black') { scoreA_prince += (a.from.y - a.to.y) * 5; } }
        if (!b.isAttack && b.type==='board' && b.from) { const piece = boardState[b.from.y]?.[b.from.x]; if (piece && piece.type === 'prince' && piece.color === 'black') { scoreB_prince += (b.from.y - b.to.y) * 5; } }
        if (scoreA_prince !== scoreB_prince) return scoreB_prince - scoreA_prince;

        return 0; // Default: No preference
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

    return bestMove; // Return the best move found *at this depth*
}

function minimax(boardState, depth, alpha, beta, isMaximizingPlayer, startTime, timeLimit, currentHash) {
    const timeCheckStart = Date.now();
    if (timeCheckStart - startTime >= timeLimit) {
        throw new Error('TimeLimitExceeded');
    }

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
        // Simplified checkmate/stalemate return
        if (kingPos && isSquareAttackedBy(kingPos.x, kingPos.y, boardState, opponentColor)) { return isMaximizingPlayer ? -Infinity - depth : Infinity + depth; }
        else { return 0; } // Stalemate
    }


    moves.sort((a, b) => {
         let aIsTTBest = false;
         let bIsTTBest = false;
         if (ttBestMove) {
              if (a.type === ttBestMove.type) {
                 if(a.type === 'board' && ttBestMove.from && a.from && a.from.x === ttBestMove.from.x && a.from.y === ttBestMove.from.y && a.to.x === ttBestMove.to.x && a.to.y === ttBestMove.to.y) aIsTTBest = true;
                 if(a.type === 'drop' && a.pieceType === ttBestMove.pieceType && a.to.x === ttBestMove.to.x && a.to.y === ttBestMove.to.y) aIsTTBest = true;
              }
              if (b.type === ttBestMove.type) {
                 if(b.type === 'board' && ttBestMove.from && b.from && b.from.x === ttBestMove.from.x && b.from.y === ttBestMove.from.y && b.to.x === ttBestMove.to.x && b.to.y === ttBestMove.to.y) bIsTTBest = true;
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
            if (valA !== valB) return valB - valA; // Check if scores differ before falling through
        }

        const killers = (depth >= 0 && depth < MAX_SEARCH_DEPTH) ? killerMoves[depth] : [null, null];
        let aIsKiller = false; let bIsKiller = false;
        if (a.from && killers[0] && killers[0].from) { aIsKiller = a.from.x === killers[0].from.x && a.from.y === killers[0].from.y && a.to.x === killers[0].to.x && a.to.y === killers[0].to.y; }
        if (a.from && killers[1] && killers[1].from && !aIsKiller) { aIsKiller = a.from.x === killers[1].from.x && a.from.y === killers[1].from.y && a.to.x === killers[1].to.x && a.to.y === killers[1].to.y; }
        if (b.from && killers[0] && killers[0].from) { bIsKiller = b.from.x === killers[0].from.x && b.from.y === killers[0].from.y && b.to.x === killers[0].to.x && b.to.y === killers[0].to.y; }
        if (b.from && killers[1] && killers[1].from && !bIsKiller) { bIsKiller = b.from.x === killers[1].from.x && b.from.y === killers[1].from.y && b.to.x === killers[1].to.x && b.to.y === killers[1].to.y; }
        if (aIsKiller !== bIsKiller) { return aIsKiller ? -1 : 1; }

        return 0;
    });


    let bestMove = null;
    let bestScore = isMaximizingPlayer ? -Infinity : Infinity;
    const isRootNode = (depth === 3 || depth === 2); // Adjust if your max depth changes

    for (const move of moves) {
        const currentTime = Date.now();
        const dynamicTimeLimit = timeLimit - (isRootNode ? 50 : 20);
        if (currentTime - startTime >= dynamicTimeLimit) {
            throw new Error('TimeLimitExceeded');
        }

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

        try {
            if (isCopeBonusTrigger || isGHGBonusTrigger) {
                eval = handleBonusTurn(tempBoard, pieceMoved, move, depth, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, nextHash);
            } else {
                eval = minimax(tempBoard, depth - 1, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, nextHash);
            }
        } catch (e) {
            if (e.message === 'TimeLimitExceeded') {
                 throw e;
            } else {
                console.error("Worker: Unexpected error during recursive search:", e);
                eval = isMaximizingPlayer ? -Infinity : Infinity;
            }
        }


        if (isMaximizingPlayer) {
            if (eval > bestScore) {
                bestScore = eval;
                bestMove = move;
            }
            alpha = Math.max(alpha, eval);
            if (beta <= alpha) {
                if (!move.isAttack && move.from) { storeKillerMove(depth, move); }
                break;
            }
        } else {
             if (eval < bestScore) {
                 bestScore = eval;
                 bestMove = move;
             }
             beta = Math.min(beta, eval);
             if (beta <= alpha) {
                 if (!move.isAttack && move.from) { storeKillerMove(depth, move); }
                 break;
             }
        }
    }

    let flag = TT_FLAG_EXACT;
    if (bestScore <= alphaOrig) { flag = TT_FLAG_UPPERBOUND; }
    else if (bestScore >= beta) { flag = TT_FLAG_LOWERBOUND; }
    storeTTEntry(currentHash, depth, bestScore, flag, bestMove || ttBestMove);

    return bestScore;
}


const QUIESCENCE_MAX_DEPTH = 3;

function quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer, startTime, timeLimit, depth = QUIESCENCE_MAX_DEPTH, currentHash) {
    if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');

    let alphaOrig = alpha;
    // const ttProbe = probeTTEntry(currentHash, depth + 100, alpha, beta); // Optional QSearch TT
    // if (ttProbe.score !== null) { return ttProbe.score; }


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
        const attackerA = a.from ? boardState[a.from.y]?.[a.from.x] : null; const attackerB = b.from ? boardState[b.from.y]?.[b.from.x] : null;
        const victimValA = victimA ? (pieceValues[victimA.type] || 0) : 0; const victimValB = victimB ? (pieceValues[victimB.type] || 0) : 0;
        const attackerValA = attackerA ? (pieceValues[attackerA.type] || 0) : 0; const attackerValB = attackerB ? (pieceValues[attackerB.type] || 0) : 0;
        if (victimValA !== victimValB) return victimValB - victimValA; else return attackerValA - attackerValB;
    });

    let bestMove = null;
    let bestScore = isMaximizingPlayer ? -Infinity : Infinity;


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

        let score;
         try {
             score = quiescenceSearch(tempBoard, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, depth - 1, nextHash);
         } catch (e) {
             if (e.message === 'TimeLimitExceeded') {
                 throw e;
             } else {
                 console.error("Worker: Unexpected error during quiescence search:", e);
                 score = isMaximizingPlayer ? -Infinity : Infinity;
             }
         }


        if (isMaximizingPlayer) {
             if (score > bestScore) {
                 bestScore = score;
                 bestMove = move;
             }
             alpha = Math.max(alpha, score);
             if (beta <= alpha) break;
        } else {
             if (score < bestScore) {
                 bestScore = score;
                 bestMove = move;
             }
             beta = Math.min(beta, score);
             if (beta <= alpha) break;
        }
    }

    // let flag = TT_FLAG_EXACT;
    // if (bestScore <= alphaOrig) { flag = TT_FLAG_UPPERBOUND; }
    // else if (bestScore >= beta) { flag = TT_FLAG_LOWERBOUND; }
    // if(bestMove) storeTTEntry(currentHash, depth + 100, bestScore, flag, bestMove);

    return bestScore;
}


// --- Web Worker Message Handler ---
self.onmessage = function(e) {
    // console.log("Worker received message:", e.data);
    const { gameState, capturedPieces, bonusMoveState } = e.data;

    if (!gameState) {
        console.error("Worker: Received invalid message data.");
        postMessage(null); // Send back null if data is bad
        return;
    }

    try {
        const bestMove = findBestMoveWithTimeLimit(gameState, capturedPieces, bonusMoveState);
        // console.log("Worker finished search. Best move:", bestMove);
        postMessage(bestMove); // Send the result back to the main thread
    } catch (error) {
        console.error("Worker: Error during findBestMoveWithTimeLimit:", error);
        postMessage(null); // Send back null in case of error during search
    }
};

// Log to confirm worker script loaded (optional)
// console.log("botWorker.js loaded and ready.");