// Worker receives game rules from gamelogic.js
importScripts('gamelogic.js');

// --- Bot Specific Constants ---
const botSanctuarySquares = [
    {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
    {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
];

// --- Piece Values & PSTs (Copied for Worker Context) ---
// It's often better to keep these directly in the worker
// if they are primarily for the bot's evaluation.
const pieceValues = {
    'pawn': 100, 'sult': 150, 'pilut': 120, 'fin': 320, 'cope': 300, 'kor': 330, 'yoli': 330, 'chair': 500,
    'prince': 400,
    'greatshield': 300, 'finor': 550, 'jotu': 450, 'mermaid': 850, 'neptune': 1000, 'kota': 550,
    'greathorsegeneral': 1200, 'zur': 900, 'cthulhu': 1500, 'lupa': 20000
};
const SANCTUARY_THREAT_PENALTY_BASE = 500;
const SANCTUARY_DEFENSE_BONUS_BASE = 400;
const PRINCE_ADVANCEMENT_BONUS = 4;

// Piece Square Tables (PSTs)
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
        for (let y = 0; y < BOARD_HEIGHT; y++) { // Uses BOARD_HEIGHT from gamelogic.js
            zobristTable[type][color][y] = [];
            for (let x = 0; x < BOARD_WIDTH; x++) { // Uses BOARD_WIDTH from gamelogic.js
                zobristTable[type][color][y][x] = random64();
            }
        }
    }
}
const zobristTurnBlack = random64();

function computeZobristHash(boardState, isBlackTurn) {
    let hash = 0n;
    for (let y = 0; y < BOARD_HEIGHT; y++) { // Uses BOARD_HEIGHT
        for (let x = 0; x < BOARD_WIDTH; x++) { // Uses BOARD_WIDTH
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


// --- START OF NEWLY ADDED HELPER FUNCTIONS ---

function copyBoard(boardState) {
    if (!Array.isArray(boardState) || boardState.length === 0 || !Array.isArray(boardState[0])) {
        console.error("Invalid boardState passed to copyBoard:", boardState);
        return Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null)); // Use imported constants
    }

    const newBoard = [];
    const height = boardState.length;
    for (let i = 0; i < height; i++) {
        if (Array.isArray(boardState[i])) {
            // Create a shallow copy of the row, assuming pieces are immutable objects or copied later
            newBoard.push(boardState[i].map(piece => piece ? {...piece} : null));
        } else {
            console.error("Invalid board state row detected in copyBoard:", boardState[i], "at index", i);
            const width = boardState[0]?.length || BOARD_WIDTH; // Use imported constant
            newBoard.push(Array(width).fill(null));
        }
    }

    // Ensure correct dimensions (might not be strictly necessary if input is always correct)
    while (newBoard.length < BOARD_HEIGHT) {
        console.warn(`copyBoard: Input board height ${height} was less than expected ${BOARD_HEIGHT}. Padding.`);
        const width = newBoard[0]?.length || BOARD_WIDTH; // Use imported constant
        newBoard.push(Array(width).fill(null));
    }
    if (newBoard.length > BOARD_HEIGHT) {
        console.warn(`copyBoard: Input board height ${height} was more than expected ${BOARD_HEIGHT}. Trimming.`);
        newBoard.length = BOARD_HEIGHT; // Use imported constant
    }

    return newBoard;
}


function isSquareAttackedBy(targetX, targetY, boardState, attackingColor) {
    const height = boardState?.length || 0;
    const width = boardState?.[0]?.length || 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const piece = boardState[y]?.[x];
            if (piece && piece.color === attackingColor) {
                // IMPORTANT: Use the getValidMovesForPiece available in this worker scope
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

function getBonusMoves(piece, toX, toY, boardState) {
    if (!piece) return [];
    // Use the getValidMovesForPiece available in this worker scope
    const bonusMovesRaw = getValidMovesForPiece(piece, toX, toY, boardState, true);
    // Filter to ensure they are non-capture moves, although getValidMoves should already do this with bonusMoveActive=true
    return bonusMovesRaw
        .filter(move => !move.isAttack) // Double-check it's not an attack
        .map(move => ({
            type: 'board', from: { x: toX, y: toY }, to: { x: move.x, y: move.y }, isAttack: false
        }));
}

function handleBonusTurn(board, piece, move, depth, alpha, beta, isMaximizingPlayer, startTime, timeLimit, currentHash) {
    const bonusMoves = getBonusMoves(piece, move.to.x, move.to.y, board);

    // If no bonus moves possible, just proceed to the next player's turn evaluation
    if (bonusMoves.length === 0) {
        let nextHash = currentHash ^ zobristTurnBlack; // Flip turn in hash
        return minimax(board, depth - 1, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, nextHash);
    }

    // If there ARE bonus moves, evaluate them from the perspective of the SAME player
    let bestBonusEval = isMaximizingPlayer ? -Infinity : Infinity;

    for (const bonusMove of bonusMoves) {
        if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded');

        const bonusBoard = copyBoard(board);
        const bonusPiece = bonusBoard[bonusMove.from.y]?.[bonusMove.from.x]; // Should be the piece that just moved
        if (!bonusPiece) {
             console.warn("Bonus Turn: Piece not found at bonus move start square?");
             continue;
        }

        let nextHash = currentHash; // Start from hash *after* the initial move

        // Apply Zobrist for the bonus move itself
        if(zobristTable[bonusPiece.type]?.[bonusPiece.color]?.[bonusMove.from.y]?.[bonusMove.from.x]){
             nextHash ^= zobristTable[bonusPiece.type][bonusPiece.color][bonusMove.from.y][bonusMove.from.x];
        } else { console.warn("Missing Zobrist key for bonus move from:", bonusPiece, bonusMove.from.y, bonusMove.from.x); }

        bonusBoard[bonusMove.to.y][bonusMove.to.x] = bonusPiece;
        bonusBoard[bonusMove.from.y][bonusMove.from.x] = null;

        if(zobristTable[bonusPiece.type]?.[bonusPiece.color]?.[bonusMove.to.y]?.[bonusMove.to.x]){
             nextHash ^= zobristTable[bonusPiece.type][bonusPiece.color][bonusMove.to.y][bonusMove.to.x];
        } else { console.warn("Missing Zobrist key for bonus move to:", bonusPiece, bonusMove.to.y, bonusMove.to.x); }

        // NOW flip the turn in the hash for the opponent's reply
        nextHash ^= zobristTurnBlack;

        // Evaluate the opponent's response after the bonus move
        const evaluation = minimax(bonusBoard, depth - 1, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, nextHash);

        // Update the best score for the player who made the bonus move
        if (isMaximizingPlayer) {
            bestBonusEval = Math.max(bestBonusEval, evaluation);
            alpha = Math.max(alpha, bestBonusEval);
        } else {
            bestBonusEval = Math.min(bestBonusEval, evaluation);
            beta = Math.min(beta, bestBonusEval);
        }
        if (beta <= alpha) break; // Alpha-beta cutoff
    }
    return bestBonusEval;
}


// --- Evaluation ---
function mirrorPST(table) {
    if (!Array.isArray(table)) { console.error("Invalid PST passed to mirrorPST:", table); return []; }
    // Creates a new reversed array (doesn't modify original)
    return [...table].reverse();
}

function evaluateBoard(boardState) {
    // Basic check for valid board structure
    if (!Array.isArray(boardState) || boardState.length !== BOARD_HEIGHT || !Array.isArray(boardState[0]) || boardState[0].length !== BOARD_WIDTH) {
        console.error("evaluateBoard received invalid boardState structure:", boardState); return 0;
    }

    let totalScore = 0;
    let whiteLupaPos = null; let blackLupaPos = null;
    let whitePrincePos = null; let blackPrincePos = null;
    let whiteLupaFoundEval = false; let blackLupaFoundEval = false;
    let whitePrinceFoundEval = false; let blackPrinceFoundEval = false;
    let pieceCount = 0; // Count non-royal pieces for endgame detection

    // Check for immediate Sanctuary win (highest priority)
    for(const sq of botSanctuarySquares) {
        const piece = boardState[sq.y]?.[sq.x];
        if (piece && (piece.type === 'lupa' || piece.type === 'prince')) {
            // Return immediate large score for win/loss
            return piece.color === 'white' ? Infinity : -Infinity;
        }
    }

    // Calculate material and positional score
    for (let y = 0; y < BOARD_HEIGHT; y++) { // Use BOARD_HEIGHT
        for (let x = 0; x < BOARD_WIDTH; x++) { // Use BOARD_WIDTH
            const piece = boardState[y]?.[x];
            if (piece) {
                const value = pieceValues[piece.type] || 0;
                let positionValue = 0;
                let table = piecePST[piece.type]; // Use piecePST defined in this worker

                // Determine if King is restricted for PST selection
                if (piece.type === 'lupa') {
                    // isKingRestricted needs to be available or defined here
                    table = isKingRestricted(piece.color, boardState) ? kingEarlyPST : kingLatePST;
                    if(piece.color === 'white') whiteLupaFoundEval = true; else blackLupaFoundEval = true;
                } else if (piece.type === 'prince') {
                     if(piece.color === 'white') whitePrinceFoundEval = true; else blackPrinceFoundEval = true;
                } else {
                    pieceCount++; // Count non-royal piece
                }

                // Apply PST
                if (table) {
                    const pst = (piece.color === 'white') ? table : mirrorPST(table); // Use mirrorPST defined here
                    // Safe access to PST value
                    positionValue = (Array.isArray(pst) && pst[y] && pst[y][x] !== undefined) ? pst[y][x] : 0;
                } else if (piece.type === 'lupa') { // Fallback if type wasn't in piecePST but is King
                    const kingTable = isKingRestricted(piece.color, boardState) ? kingEarlyPST : kingLatePST;
                    const pst = (piece.color === 'white') ? kingTable : mirrorPST(kingTable);
                    positionValue = (Array.isArray(pst) && pst[y] && pst[y][x] !== undefined) ? pst[y][x] : 0;
                }

                totalScore += (piece.color === 'white') ? (value + positionValue) : -(value + positionValue);

                // Store royal positions
                if (piece.type === 'lupa') { if (piece.color === 'white') whiteLupaPos = {x, y}; else blackLupaPos = {x, y}; }
                if (piece.type === 'prince') { if (piece.color === 'white') whitePrincePos = {x, y}; else blackPrincePos = {x, y}; }
            }
        }
    }

    // Check for game over by royalty capture (almost as high priority as sanctuary)
    if (!whiteLupaFoundEval && !whitePrinceFoundEval) return -Infinity; // Black wins
    if (!blackLupaFoundEval && !blackPrinceFoundEval) return Infinity;  // White wins

    // --- Add evaluation heuristics ---

    const isEndgame = pieceCount < 18; // Example threshold for endgame

    // 1. King/Prince Safety (Penalty if attacked)
    const royaltySafetyPenalty = 600; const princeSafetyPenalty = 300;
    if (whiteLupaPos && isSquareAttackedBy(whiteLupaPos.x, whiteLupaPos.y, boardState, 'black')) totalScore -= royaltySafetyPenalty;
    if (blackLupaPos && isSquareAttackedBy(blackLupaPos.x, blackLupaPos.y, boardState, 'white')) totalScore += royaltySafetyPenalty;
    if (whitePrincePos && isSquareAttackedBy(whitePrincePos.x, whitePrincePos.y, boardState, 'black')) totalScore -= princeSafetyPenalty;
    if (blackPrincePos && isSquareAttackedBy(blackPrincePos.x, blackPrincePos.y, boardState, 'white')) totalScore += princeSafetyPenalty;


    // 2. Sanctuary Threat/Defense (Simplified)
    let whiteThreatDistance = Infinity; let threatenedSanctuary = null; let whiteThreatPieceType = null;

    // Helper to find min distance from a royal piece to any sanctuary square
    const checkRoyaltyThreat = (royalPos) => {
        if (!royalPos) return { dist: Infinity, sq: null };
        let minDist = Infinity; let closestSq = null;
        for (const sanctuarySq of botSanctuarySquares) {
            // Using Chebyshev distance (max of dx, dy) as approximation
            const dist = Math.max(Math.abs(royalPos.x - sanctuarySq.x), Math.abs(royalPos.y - sanctuarySq.y));
            if (dist < minDist) { minDist = dist; closestSq = sanctuarySq; }
        }
        return { dist: minDist, sq: closestSq };
    };

    const whiteKingThreat = checkRoyaltyThreat(whiteLupaPos);
    const whitePrinceThreat = checkRoyaltyThreat(whitePrincePos);

    // Prioritize the closer piece
    if (whiteKingThreat.dist <= whitePrinceThreat.dist) {
        whiteThreatDistance = whiteKingThreat.dist;
        threatenedSanctuary = whiteKingThreat.sq;
        whiteThreatPieceType = 'lupa';
    } else {
        whiteThreatDistance = whitePrinceThreat.dist;
        threatenedSanctuary = whitePrinceThreat.sq;
        whiteThreatPieceType = 'prince';
    }

    // If white is close to sanctuary, it's bad for black (so add score for white)
    if (whiteThreatDistance <= 3) { // Adjust threshold as needed
        const proximityFactor = Math.pow(4 - whiteThreatDistance, 2); // Closer = bigger factor
        let penalty = SANCTUARY_THREAT_PENALTY_BASE * proximityFactor;
        if (whiteThreatPieceType === 'prince') penalty *= 0.9; // Slightly less penalty for prince
        totalScore += penalty; // White gains score (bad for black)

        // Check black's defense around the threatened sanctuary
        if (threatenedSanctuary) {
            let defenseScore = 0;
            // Check adjacent squares for black defenders
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const checkX = threatenedSanctuary.x + dx; const checkY = threatenedSanctuary.y + dy;
                    if (isPositionValid(checkX, checkY)) { // Use isPositionValid
                        const piece = boardState[checkY]?.[checkX];
                        if (piece && piece.color === 'black') {
                           const distToSq = Math.max(Math.abs(checkX - threatenedSanctuary.x), Math.abs(checkY - threatenedSanctuary.y));
                           defenseScore += SANCTUARY_DEFENSE_BONUS_BASE / (distToSq + 1); // Closer defender = more score
                        }
                    }
                }
            }
            // Bonus if the sanctuary square itself is attacked by black
            if (isSquareAttackedBy(threatenedSanctuary.x, threatenedSanctuary.y, boardState, 'black')) {
                 defenseScore += SANCTUARY_DEFENSE_BONUS_BASE * 1.5;
            }
            totalScore -= defenseScore; // Black defense reduces white's threat bonus
        }
    }

    // 3. Black Prince Advancement Bonus
    if (blackPrincePos) {
        // Bonus based on how far the prince has advanced (closer to rank 0)
        const rankBonus = (blackPalace.minY - blackPrincePos.y) * PRINCE_ADVANCEMENT_BONUS; // blackPalace needs to be available
        totalScore -= rankBonus; // Subtract from total score (good for black)
        // Increase bonus in endgame
        if (isEndgame) { totalScore -= rankBonus * 1.5; }
    }

    // Add more heuristics here: piece mobility, control of center, pawn structure etc.

    return totalScore;
}


function getCaptureMoves(boardState, color) {
    const captureMoves = [];
    for (let y = 0; y < BOARD_HEIGHT; y++) { // Use BOARD_HEIGHT
        for (let x = 0; x < BOARD_WIDTH; x++) { // Use BOARD_WIDTH
            const piece = boardState[y]?.[x];
            if (piece && piece.color === color) {
                // Use getValidMovesForPiece from this worker scope
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

    // Board Moves
    for (let y = 0; y < BOARD_HEIGHT; y++) { // Use BOARD_HEIGHT
        for (let x = 0; x < BOARD_WIDTH; x++) { // Use BOARD_WIDTH
            const piece = boardState[y]?.[x];
            if (piece && piece.color === color) {
                // Use getValidMovesForPiece from this worker scope
                const validMoves = getValidMovesForPiece(piece, x, y, boardState, false);
                for (const move of validMoves) {
                    allMoves.push({ type: 'board', from: { x, y }, to: { x: move.x, y: move.y }, isAttack: move.isAttack });
                }
            }
        }
    }

    // Drop Moves
    if (capturedPieces && capturedPieces.length > 0) {
        // Get unique piece types available for dropping
        const uniquePieceTypesInHand = [...new Set(capturedPieces.map(p => p.type))];

        for (const pieceType of uniquePieceTypesInHand) {
            // Cannot drop King or Prince
            if (pieceType === 'lupa' || pieceType === 'prince') {
                continue;
            }

            const droppedPieceValue = pieceValues[pieceType] || 0; // Value of piece being dropped

            for (let y = 0; y < BOARD_HEIGHT; y++) { // Use BOARD_HEIGHT
                for (let x = 0; x < BOARD_WIDTH; x++) { // Use BOARD_WIDTH
                    // Check if square is valid and empty
                    if (isPositionValid(x, y) && boardState[y]?.[x] === null) { // Use isPositionValid

                        // Basic drop safety check (optional but recommended for stronger AI)
                        // Is the square attacked by a *less valuable* opponent piece?
                        let isSafeDrop = true;
                        let leastValuableAttackerValue = Infinity;

                        // Check all opponent pieces
                         for (let attY = 0; attY < BOARD_HEIGHT; attY++) {
                             for (let attX = 0; attX < BOARD_WIDTH; attX++) {
                                 const attackerPiece = boardState[attY]?.[attX];
                                 if (attackerPiece && attackerPiece.color === opponentColor) {
                                     const attackerMoves = getValidMovesForPiece(attackerPiece, attX, attY, boardState, false);
                                     for (const move of attackerMoves) {
                                         if (move.x === x && move.y === y) { // If opponent piece attacks the drop square
                                             const attackerValue = pieceValues[attackerPiece.type] || 0;
                                             leastValuableAttackerValue = Math.min(leastValuableAttackerValue, attackerValue);
                                             break; // Found an attacker for this piece, check next piece
                                         }
                                     }
                                 }
                                 // Optimization: If we already found an attacker cheaper than the dropped piece, stop checking
                                 if (leastValuableAttackerValue < droppedPieceValue) break;
                             }
                             if (leastValuableAttackerValue < droppedPieceValue) break;
                         }

                         // If the cheapest attacker is worth less than the piece we're dropping, it's not safe
                         if (leastValuableAttackerValue < droppedPieceValue) {
                             isSafeDrop = false;
                         }

                        // Add the drop move (consider adding only safe drops for stronger play)
                        // if (isSafeDrop) { // Uncomment to only consider "safe" drops
                             allMoves.push({ type: 'drop', pieceType: pieceType, to: { x, y }, isAttack: false });
                        // }
                    }
                }
            }
        }
    }
    return allMoves;
}

// --- END OF NEWLY ADDED HELPER FUNCTIONS ---


// --- Main AI Search Functions (findBestMove, minimax, etc.) ---

function findBestMoveWithTimeLimit(gameState, capturedPieces, bonusMoveState = null) {
    const startTime = Date.now();
    const timeLimit = 8000; // 8 seconds
    const { boardState, turnCount } = gameState;
    if (!boardState) {
        console.error("Worker: Invalid gameState received in findBestMoveWithTimeLimit!");
        return null;
    }

    // Reset killer moves and transposition table for a new search
    killerMoves = Array(MAX_SEARCH_DEPTH).fill(null).map(() => [null, null]);
    clearTT();

    // Reset opening book state if it's the very start of the game
    if (turnCount <= 1) { // Assuming turnCount starts at 0 or 1 for the first move
        chosenOpeningSequence = null;
        openingMoveIndex = 0;
    }

    // Select opening if it's black's first move (turnCount 1)
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

    // Try playing from the opening book
     if (chosenOpeningSequence && openingMoveIndex < chosenOpeningSequence.length && turnCount < 10) { // Limit opening book usage
        const openingMove = chosenOpeningSequence[openingMoveIndex];
        const pieceAtFrom = boardState[openingMove.from.y]?.[openingMove.from.x];

        // Check if the piece expected by the opening book is actually there and belongs to black
        if (pieceAtFrom && pieceAtFrom.color === 'black') {
            const validMovesForPiece = getValidMovesForPiece(pieceAtFrom, openingMove.from.x, openingMove.from.y, boardState, false);
            const isOpeningMoveValid = validMovesForPiece.some(m => m.x === openingMove.to.x && m.y === openingMove.to.y);

            // Basic safety check: Don't play opening move if a valuable capture is available
            const immediateCaptures = getCaptureMoves(boardState, 'black'); // Use getCaptureMoves
            let bestCaptureValue = -Infinity;
            if (immediateCaptures.length > 0) {
                 for (const cap of immediateCaptures) {
                      const victim = boardState[cap.to.y]?.[cap.to.x];
                      const attacker = boardState[cap.from.y]?.[cap.from.x];
                      if(victim && attacker){
                           // Simple MVV-LVA (Most Valuable Victim - Least Valuable Attacker) heuristic
                           const value = (pieceValues[victim.type] || 0) - (pieceValues[attacker.type] || 0) / 10;
                           bestCaptureValue = Math.max(bestCaptureValue, value);
                      }
                 }
            }

            // Play opening move if valid and no significantly better capture exists
            // Adjust the threshold (e.g., pieceValues['sult']) as needed
            if (isOpeningMoveValid && bestCaptureValue < (pieceValues['sult'] || 150)) {
                console.log(`Worker: Bot playing opening move ${openingMoveIndex + 1}:`, openingMove);
                openingMoveIndex++;
                const isAttack = !!boardState[openingMove.to.y]?.[openingMove.to.x]; // Check if target square occupied
                // Return the move in the expected format for the main thread
                return { ...openingMove, type: 'board', isAttack: isAttack };
            } else {
                 console.log(`Worker: Opening move ${openingMoveIndex + 1} invalid, unsafe, or better capture exists. Deviating.`);
                 chosenOpeningSequence = null; // Deviate from book
            }
        } else {
             console.log("Worker: Opening state mismatch (piece not found or wrong color), deviating.");
             chosenOpeningSequence = null; // Deviate from book
        }
     } else if (chosenOpeningSequence && openingMoveIndex >= chosenOpeningSequence.length) {
         console.log("Worker: Opening finished.");
         chosenOpeningSequence = null; // Clear sequence once done
     }


    // If not playing from opening book, start iterative deepening search
    let bestMoveFound = null;
    let lastCompletedDepthResult = null;
    console.log("Worker: Bot searching with state:", { hasBonus: !!bonusMoveState });

    let currentHash = computeZobristHash(boardState, true); // True because it's black's turn

    for (let depth = 1; depth <= 3; depth++) { // Iterative deepening up to depth 3
        console.log(`Worker: Searching at depth: ${depth}`);
        let currentDepthResult = null;
        try {
            // Pass capturedPieces for drop move generation
            currentDepthResult = findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit, bonusMoveState, currentHash);
        } catch (e) {
             if (e.message === 'TimeLimitExceeded') {
                  console.log(`Worker: Time limit exceeded during depth ${depth}. Using result from depth ${depth - 1}.`);
                  break; // Stop searching deeper
             }
            // Log other errors but try to use the previous depth's result
            console.error("Worker: Error during minimax search:", e);
            bestMoveFound = lastCompletedDepthResult; // Use last good result
            break; // Stop searching
        }

        // If a move was found at this depth, store it
        if (currentDepthResult) {
            lastCompletedDepthResult = currentDepthResult;
         } else {
              // If no move found even at depth 1, something is wrong
              if (depth === 1) {
                   console.warn("Worker: No moves found even at depth 1.");
                   break;
              }
              // If no move found at deeper depth, use previous result (shouldn't happen if depth 1 worked)
              console.warn(`Worker: No move found at depth ${depth}, using result from ${depth-1}`);
              break;
         }

         // Check time limit after completing a depth
         if (Date.now() - startTime >= timeLimit) {
              console.log(`Worker: Time limit reached after completing depth ${depth}. Using this result.`);
              break; // Stop searching deeper
         }
    }

    bestMoveFound = lastCompletedDepthResult;

    // Fallback if search fails or times out before depth 1 completes
    if (!bestMoveFound) {
        console.warn("Worker: Iterative deepening finished without finding a best move or timed out before depth 1 completed. Selecting random fallback.");
        let moves;
        if (bonusMoveState) {
            const { from } = bonusMoveState; const piece = boardState[from.y]?.[from.x];
            if (piece) moves = getBonusMoves(piece, from.x, from.y, boardState);
            else { console.error("Worker: Fallback Error - Piece not found for bonus move!"); moves = []; }
        } else {
            // Pass capturedPieces to getAllValidMoves for fallback drops
            moves = getAllValidMoves(boardState, 'black', capturedPieces);
        }

        if (moves && moves.length > 0) {
             // Prefer captures in fallback
             const captureMoves = moves.filter(m => m.isAttack);
             if (captureMoves.length > 0) {
                 bestMoveFound = captureMoves[Math.floor(Math.random() * captureMoves.length)];
                 console.log("Worker: Selected random capture fallback:", bestMoveFound);
             } else {
                 bestMoveFound = moves[Math.floor(Math.random() * moves.length)];
                 console.log("Worker: Selected random non-capture fallback:", bestMoveFound);
             }
        } else {
            // This is critical - means the bot has no legal moves (checkmate/stalemate?)
            console.error("Worker: CRITICAL - Bot found NO valid moves in fallback!");
            return null; // Return null if truly no moves
        }
    }

    console.log("Worker: Final best move selected:", bestMoveFound);
    return bestMoveFound;
}


function findBestMoveAtDepth(boardState, capturedPieces, depth, startTime, timeLimit, bonusMoveState, currentHash) {
    let bestMove = null;
    let bestValue = Infinity; // Black (minimizing player) wants the lowest score
    let alpha = -Infinity;
    let beta = Infinity;
    let moves;

    // Generate moves based on whether it's a bonus turn or regular turn
    if (bonusMoveState) {
        const { from } = bonusMoveState; const piece = boardState[from.y]?.[from.x];
        if (piece) { moves = getBonusMoves(piece, from.x, from.y, boardState); }
        else { console.error("Worker: Error generating bonus moves - Piece not found!"); moves = []; }
    } else {
        // Pass capturedPieces here for drop moves
        moves = getAllValidMoves(boardState, 'black', capturedPieces);
    }

    // If no moves, return null (should indicate checkmate/stalemate upstream)
    if (moves.length === 0) {
        console.warn("Worker: No valid moves found at depth", depth);
        return null;
    }

    // --- Move Ordering ---
    const ttProbe = probeTTEntry(currentHash, depth, alpha, beta);
    const ttBestMove = ttProbe.bestMove;

    // Helper for sanctuary distance heuristic in sorting
     const getMinSanctuaryDist = (pieceX, pieceY) => {
          let minDist = Infinity;
          for (const sq of botSanctuarySquares) {
               const dist = Math.max(Math.abs(pieceX - sq.x), Math.abs(pieceY - sq.y));
               minDist = Math.min(minDist, dist);
          }
          return minDist;
     };

    moves.sort((a, b) => {
        // 1. TT Move Priority
        let aIsTTBest = false; let bIsTTBest = false;
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
        if (aIsTTBest !== bIsTTBest) return aIsTTBest ? -1 : 1; // Prioritize TT move

        // 2. Sanctuary Related Moves (High Priority)
        let sanctuaryScoreA = 0; let sanctuaryScoreB = 0;
        const SANCTUARY_MOVE_BONUS = 10000; // Large value to prioritize these
        let whiteLupaPos = null; let whitePrincePos = null;
        for (let y=0; y<BOARD_HEIGHT; y++) { for (let x=0; x<BOARD_WIDTH; x++) { const p = boardState[y]?.[x]; if (p && p.color === 'white'){ if(p.type === 'lupa') whiteLupaPos = {x, y}; else if (p.type === 'prince') whitePrincePos = {x, y}; } } }
        const whiteRoyalPos = whiteLupaPos || whitePrincePos; // Check opponent's closest royal piece

        const calculateSanctuaryScore = (move) => {
            let score = 0;
            if (move.type === 'board' && move.from) {
                const piece = boardState[move.from.y]?.[move.from.x];
                if (piece && (piece.type === 'lupa' || piece.type === 'prince')) {
                    const distBefore = getMinSanctuaryDist(move.from.x, move.from.y);
                    const distAfter = getMinSanctuaryDist(move.to.x, move.to.y);
                    // Black moving towards sanctuary
                    if (piece.color === 'black' && distAfter < distBefore) score += SANCTUARY_MOVE_BONUS / (distAfter + 1);
                    // Pushing white away from sanctuary (if they are close)
                    if (piece.color === 'white' && distAfter > distBefore && distBefore <=2) score += SANCTUARY_MOVE_BONUS / 2;
                }
                // Defending sanctuary if opponent is close
                 if (whiteRoyalPos && getMinSanctuaryDist(whiteRoyalPos.x, whiteRoyalPos.y) <= 2) {
                     // Moving a piece near the threatened sanctuary
                     if (getMinSanctuaryDist(move.to.x, move.to.y) <= 1) score += SANCTUARY_MOVE_BONUS / 3;
                     // Capturing the threatening white piece near sanctuary
                     if (move.isAttack && move.to.x === whiteRoyalPos.x && move.to.y === whiteRoyalPos.y) score += SANCTUARY_MOVE_BONUS;
                 }
            } else if (move.type === 'drop' && move.pieceType === 'pilut') {
                // Dropping pilut to defend a piece near sanctuary
                const protectedY = move.to.y + 1; // Pilut protects piece behind (for black)
                const potentiallyProtectedPiece = boardState[protectedY]?.[move.to.x];
                if (potentiallyProtectedPiece && potentiallyProtectedPiece.color === 'black' && isSquareAttackedBy(move.to.x, protectedY, boardState, 'white') && getMinSanctuaryDist(move.to.x, protectedY) <=2) {
                    score += SANCTUARY_MOVE_BONUS / 2;
                }
            }
            return score;
        };
        sanctuaryScoreA = calculateSanctuaryScore(a);
        sanctuaryScoreB = calculateSanctuaryScore(b);
        if (sanctuaryScoreA !== sanctuaryScoreB) return sanctuaryScoreB - sanctuaryScoreA; // Higher score first

        // 3. Captures (MVV-LVA: Most Valuable Victim - Least Valuable Attacker)
        if (a.isAttack !== b.isAttack) return a.isAttack ? -1 : 1; // Prioritize captures
        if (a.isAttack) { // Both are captures, compare value
            const victimA = boardState[a.to.y]?.[a.to.x]; const attackerA = a.from ? boardState[a.from.y]?.[a.from.x] : null; // Drop attacker is hypothetical
            const victimB = boardState[b.to.y]?.[b.to.x]; const attackerB = b.from ? boardState[b.from.y]?.[b.from.x] : null;
            // Approximate value: High victim value, low attacker value is good
            const valA = (victimA ? (pieceValues[victimA.type] || 0) * 10 : 0) - (attackerA ? (pieceValues[attackerA.type] || 0) : 1000); // Penalize drops slightly less?
            const valB = (victimB ? (pieceValues[victimB.type] || 0) * 10 : 0) - (attackerB ? (pieceValues[attackerB.type] || 0) : 1000);
             if (valA !== valB) return valB - valA; // Higher value capture first
        }

        // 4. Killer Moves
        const killers = (depth >= 0 && depth < MAX_SEARCH_DEPTH) ? killerMoves[depth] : [null, null];
        let aIsKiller = false; let bIsKiller = false;
        // Check if move 'a' matches killer move 1 or 2
        if (a.type === 'board' && a.from) { // Only board moves can be killers?
             if (killers[0] && killers[0].from && a.from.x === killers[0].from.x && a.from.y === killers[0].from.y && a.to.x === killers[0].to.x && a.to.y === killers[0].to.y) aIsKiller = true;
             if (!aIsKiller && killers[1] && killers[1].from && a.from.x === killers[1].from.x && a.from.y === killers[1].from.y && a.to.x === killers[1].to.x && a.to.y === killers[1].to.y) aIsKiller = true;
        }
        // Check if move 'b' matches killer move 1 or 2
        if (b.type === 'board' && b.from) {
             if (killers[0] && killers[0].from && b.from.x === killers[0].from.x && b.from.y === killers[0].from.y && b.to.x === killers[0].to.x && b.to.y === killers[0].to.y) bIsKiller = true;
             if (!bIsKiller && killers[1] && killers[1].from && b.from.x === killers[1].from.x && b.from.y === killers[1].from.y && b.to.x === killers[1].to.x && b.to.y === killers[1].to.y) bIsKiller = true;
        }
        if (aIsKiller !== bIsKiller) { return aIsKiller ? -1 : 1; } // Prioritize killer moves

        // 5. Other Heuristics (e.g., defensive drops, prince advancement)
         let scoreA_heuristic = 0; let scoreB_heuristic = 0;
         const DEFENSIVE_PILUT_DROP_BONUS = 500;
         if (a.type === 'drop' && a.pieceType === 'pilut') {
              const protectedY_A = a.to.y + 1; // Protects piece behind for black
              if (isPositionValid(a.to.x, protectedY_A)) {
                   const potentiallyProtectedPiece_A = boardState[protectedY_A]?.[a.to.x];
                   if (potentiallyProtectedPiece_A && potentiallyProtectedPiece_A.color === 'black' && isSquareAttackedBy(a.to.x, protectedY_A, boardState, 'white')) {
                        scoreA_heuristic += DEFENSIVE_PILUT_DROP_BONUS + (pieceValues[potentiallyProtectedPiece_A.type] || 0);
                   }
              }
         } else if (a.type === 'board' && !a.isAttack && a.from) {
             const piece = boardState[a.from.y]?.[a.from.x];
             if (piece && piece.type === 'prince' && piece.color === 'black') {
                 // Prioritize moving prince forward (decrease in Y)
                 scoreA_heuristic += (a.from.y - a.to.y) * 5; // Positive score if y decreases
             }
         }

        if (b.type === 'drop' && b.pieceType === 'pilut') {
              const protectedY_B = b.to.y + 1;
              if (isPositionValid(b.to.x, protectedY_B)) {
                   const potentiallyProtectedPiece_B = boardState[protectedY_B]?.[b.to.x];
                   if (potentiallyProtectedPiece_B && potentiallyProtectedPiece_B.color === 'black' && isSquareAttackedBy(b.to.x, protectedY_B, boardState, 'white')) {
                        scoreB_heuristic += DEFENSIVE_PILUT_DROP_BONUS + (pieceValues[potentiallyProtectedPiece_B.type] || 0);
                   }
              }
         } else if (b.type === 'board' && !b.isAttack && b.from) {
             const piece = boardState[b.from.y]?.[b.from.x];
             if (piece && piece.type === 'prince' && piece.color === 'black') {
                 scoreB_heuristic += (b.from.y - b.to.y) * 5;
             }
         }
         if (scoreA_heuristic !== scoreB_heuristic) return scoreB_heuristic - scoreA_heuristic; // Higher heuristic score first

        return 0; // Default: No preference
    });
    // --- End Move Ordering ---

    let bestMoveCurrentDepth = null;
    let originalAlpha = alpha; // Store original alpha for TT flag

    // --- Iterate through sorted moves ---
    for (const move of moves) {
        if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded'); // Check time before making move

        const tempBoard = copyBoard(boardState); // Use copyBoard
        let nextHash = currentHash; // Start with current hash

        // Apply move and update hash
        if (move.type === 'drop') {
            const pieceType = move.pieceType;
             tempBoard[move.to.y][move.to.x] = { type: pieceType, color: 'black' };
             // Update hash for dropped piece
             if(zobristTable[pieceType] && zobristTable[pieceType]['black'][move.to.y][move.to.x]){
                  nextHash ^= zobristTable[pieceType]['black'][move.to.y][move.to.x];
             } else { console.warn("Missing Zobrist key for drop:", pieceType, move.to.y, move.to.x); }
        } else { // Board move
            const pieceToMove = tempBoard[move.from.y]?.[move.from.x];
            if (!pieceToMove) { console.warn("Piece not found for board move:", move); continue; } // Skip if piece somehow missing
            const targetPiece = tempBoard[move.to.y]?.[move.to.x]; // Piece being captured, if any

            // Remove piece from origin square in hash
             if(zobristTable[pieceToMove.type]?.[pieceToMove.color]?.[move.from.y]?.[move.from.x]){
                  nextHash ^= zobristTable[pieceToMove.type][pieceToMove.color][move.from.y][move.from.x];
             } else { console.warn("Missing Zobrist key for move from:", pieceToMove, move.from.y, move.from.x); }

            // If capture, remove captured piece from target square in hash
             if (targetPiece) {
                  if(zobristTable[targetPiece.type]?.[targetPiece.color]?.[move.to.y]?.[move.to.x]){
                       nextHash ^= zobristTable[targetPiece.type][targetPiece.color][move.to.y][move.to.x];
                  } else { console.warn("Missing Zobrist key for capture:", targetPiece, move.to.y, move.to.x); }
             }

            // Make move on temp board
            tempBoard[move.to.y][move.to.x] = pieceToMove;
            tempBoard[move.from.y][move.from.x] = null;

            // Add moved piece to target square in hash
             if(zobristTable[pieceToMove.type]?.[pieceToMove.color]?.[move.to.y]?.[move.to.x]){
                  nextHash ^= zobristTable[pieceToMove.type][pieceToMove.color][move.to.y][move.to.x];
             } else { console.warn("Missing Zobrist key for move to:", pieceToMove, move.to.y, move.to.x); }
        }

        // Flip turn in hash
        nextHash ^= zobristTurnBlack;

        // --- Recursive Call or Bonus Turn Handling ---
        let boardValue;
        const pieceMoved = tempBoard[move.to.y]?.[move.to.x]; // Get the piece that ended up on the 'to' square

        // Check if this move triggers a bonus turn FOR BLACK
        const isCopeBonusTrigger = !bonusMoveState && pieceMoved?.type === 'cope' && move.isAttack;
        const isGHGBonusTrigger = !bonusMoveState && move.type === 'board' && (pieceMoved?.type === 'greathorsegeneral' || pieceMoved?.type === 'cthulhu') && !move.isAttack;

        if (isCopeBonusTrigger || isGHGBonusTrigger) {
            // Call handleBonusTurn, which will evaluate bonus moves for BLACK (minimizing player)
            // The result will be the evaluation after the bonus sequence, from WHITE's perspective
            boardValue = handleBonusTurn(tempBoard, pieceMoved, move, depth, alpha, beta, false, startTime, timeLimit, nextHash ^ zobristTurnBlack); // Pass hash *before* turn flip
        } else {
            // Regular move, call minimax for the opponent (WHITE, maximizing player)
            boardValue = minimax(tempBoard, depth - 1, alpha, beta, true, startTime, timeLimit, nextHash);
        }
        // --- End Recursive Call ---


        // --- Update Best Move (Minimizing Player) ---
        if (boardValue < bestValue) {
            bestValue = boardValue;
            bestMove = move; // Store the move that led to this value
            bestMoveCurrentDepth = move; // Store best move found specifically at this depth for TT
        }
        beta = Math.min(beta, boardValue); // Update beta

        // Alpha-beta cutoff
        if (beta <= alpha) {
            // If this move caused a cutoff and it wasn't a capture, store as killer move
            if (!move.isAttack && move.type === 'board' && move.from) { // Check move type and from exists
                storeKillerMove(depth, move);
            }
            break; // Prune remaining moves
        }
        // --- End Update Best Move ---
    }

    // --- Store result in Transposition Table ---
    let flag = TT_FLAG_EXACT;
    if (bestValue <= originalAlpha) { // Failed low (didn't raise alpha) - upper bound
        flag = TT_FLAG_UPPERBOUND;
    } else if (bestValue >= beta) { // Failed high (caused beta cutoff) - lower bound
        flag = TT_FLAG_LOWERBOUND;
    }
    // Only store if a move was actually found and evaluated at this depth
    if (bestMoveCurrentDepth) {
       storeTTEntry(currentHash, depth, bestValue, flag, bestMoveCurrentDepth);
    }
    // --- End TT Store ---

    return bestMove; // Return the best move found at this specific depth
}


function minimax(boardState, depth, alpha, beta, isMaximizingPlayer, startTime, timeLimit, currentHash) {
     const timeCheckStart = Date.now();
     if (timeCheckStart - startTime >= timeLimit) {
          throw new Error('TimeLimitExceeded');
     }

    let alphaOrig = alpha; // Store original alpha for TT flag type
    const ttProbe = probeTTEntry(currentHash, depth, alpha, beta);
    if (ttProbe.score !== null) {
        // If TT entry is valid for the current bounds, return its score
        return ttProbe.score;
    }
    const ttBestMove = ttProbe.bestMove; // Get best move from TT for ordering, even if score isn't exact

    // --- Base Case: Check for Game Over or Max Depth ---
    // Check for Sanctuary Win first (most definitive)
    for(const sq of botSanctuarySquares) { // Use botSanctuarySquares defined globally
        const p = boardState[sq.y]?.[sq.x];
        if (p && (p.type === 'lupa' || p.type === 'prince')) {
            return p.color === 'white' ? Infinity : -Infinity; // Immediate win/loss score
        }
    }

    // Check for Royalty Capture Win
    let whiteLupaPos = null, blackLupaPos = null, whitePrinceOnBoard = false, blackPrinceOnBoard = false;
    for (let y = 0; y < BOARD_HEIGHT; y++) { for (let x = 0; x < BOARD_WIDTH; x++) { const p = boardState[y]?.[x]; if (p) { if(p.type==='lupa'){if(p.color==='white')whiteLupaPos={x,y};else blackLupaPos={x,y};} else if(p.type==='prince'){if(p.color==='white')whitePrinceOnBoard=true;else blackPrinceOnBoard=true;}}}}

    if (!whiteLupaPos && !whitePrinceOnBoard) return -Infinity - depth; // Black wins (add depth bias)
    if (!blackLupaPos && !blackPrinceOnBoard) return Infinity + depth;  // White wins (add depth bias)


    // Max depth reached, transition to Quiescence Search
    if (depth === 0) {
        return quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer, startTime, timeLimit, QUIESCENCE_MAX_DEPTH, currentHash);
    }
    // --- End Base Case ---


    // --- Generate and Sort Moves ---
    const color = isMaximizingPlayer ? 'white' : 'black';
    // Pass empty array for capturedPieces if not needed or handle appropriately
    const moves = getAllValidMoves(boardState, color, []); // Need captured pieces if drops are possible

    // Check for Checkmate/Stalemate if no moves available
    if (moves.length === 0) {
        const kingPos = isMaximizingPlayer ? whiteLupaPos : blackLupaPos; // Find current player's king
        const opponentColor = isMaximizingPlayer ? 'black' : 'white';
        // If king is under attack and no moves, it's checkmate
        if (kingPos && isSquareAttackedBy(kingPos.x, kingPos.y, boardState, opponentColor)) {
             // Losing score, slightly better if mate is further away
             return isMaximizingPlayer ? -Infinity - depth : Infinity + depth;
        } else {
             // No moves but king not attacked = stalemate
             return 0; // Draw score
        }
    }

    // Move Ordering (similar to findBestMoveAtDepth, but simpler maybe)
    moves.sort((a, b) => {
        // 1. TT Move
         let aIsTTBest = false; let bIsTTBest = false;
         if (ttBestMove) { // Use TT best move hint
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

        // 2. Captures (MVV-LVA)
        if (a.isAttack !== b.isAttack) {
            return a.isAttack ? -1 : 1; // Captures first
        }
        if (a.isAttack) { // If both are captures, compare value
            const victimA = boardState[a.to.y]?.[a.to.x]; const attackerA = a.from ? boardState[a.from.y]?.[a.from.x] : null;
            const victimB = boardState[b.to.y]?.[b.to.x]; const attackerB = b.from ? boardState[b.from.y]?.[b.from.x] : null;
            const valA = (victimA ? (pieceValues[victimA.type] || 0) * 10 : 0) - (attackerA ? (pieceValues[attackerA.type] || 0) : 1000);
            const valB = (victimB ? (pieceValues[victimB.type] || 0) * 10 : 0) - (attackerB ? (pieceValues[attackerB.type] || 0) : 1000);
            // Sort higher value captures first (descending order)
            if (valA !== valB) return valB - valA;
        }

        // 3. Killer Moves
        const killers = (depth >= 0 && depth < MAX_SEARCH_DEPTH) ? killerMoves[depth] : [null, null];
        let aIsKiller = false; let bIsKiller = false;
        if (a.type === 'board' && a.from) { // Check only board moves for killers
             if (killers[0] && killers[0].from && a.from.x === killers[0].from.x && a.from.y === killers[0].from.y && a.to.x === killers[0].to.x && a.to.y === killers[0].to.y) aIsKiller = true;
             if (!aIsKiller && killers[1] && killers[1].from && a.from.x === killers[1].from.x && a.from.y === killers[1].from.y && a.to.x === killers[1].to.x && a.to.y === killers[1].to.y) aIsKiller = true;
        }
         if (b.type === 'board' && b.from) {
             if (killers[0] && killers[0].from && b.from.x === killers[0].from.x && b.from.y === killers[0].from.y && b.to.x === killers[0].to.x && b.to.y === killers[0].to.y) bIsKiller = true;
             if (!bIsKiller && killers[1] && killers[1].from && b.from.x === killers[1].from.x && b.from.y === killers[1].from.y && b.to.x === killers[1].to.x && b.to.y === killers[1].to.y) bIsKiller = true;
         }
        if (aIsKiller !== bIsKiller) { return aIsKiller ? -1 : 1; } // Killers first

        return 0; // Default order otherwise
    });
    // --- End Move Generation/Sorting ---


    // --- Iterate Through Moves ---
    let bestMove = null; // Track best move for TT entry
    let bestScore = isMaximizingPlayer ? -Infinity : Infinity;
    const isRootNode = (depth === 3 || depth === 2); // Simple check if near the top, adjust max depth if needed

    for (const move of moves) {
         // Slightly tighter time limit deeper in the search
         const currentTime = Date.now();
         const dynamicTimeLimit = timeLimit - (isRootNode ? 50 : 20); // Spend less time on deeper nodes
         if (currentTime - startTime >= dynamicTimeLimit) {
              throw new Error('TimeLimitExceeded');
         }

        const tempBoard = copyBoard(boardState); // Create copy for simulation
        let nextHash = currentHash; // Copy current hash

        // Apply move and update hash
         if (move.type === 'drop') {
             const pieceType = move.pieceType;
              tempBoard[move.to.y][move.to.x] = { type: pieceType, color: color };
             if(zobristTable[pieceType]?.[color]?.[move.to.y]?.[move.to.x]){
                  nextHash ^= zobristTable[pieceType][color][move.to.y][move.to.x];
             } else { console.warn("Missing Zobrist key for drop:", pieceType, color, move.to.y, move.to.x); }
         } else { // Board move
             const pieceToMove = tempBoard[move.from.y]?.[move.from.x]; if (!pieceToMove) continue; // Should not happen
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
         nextHash ^= zobristTurnBlack; // Flip turn in hash


        // --- Recursive Call / Bonus Handling ---
        const pieceMoved = tempBoard[move.to.y]?.[move.to.x];
        const isCopeBonusTrigger = pieceMoved?.type === 'cope' && move.isAttack;
        const isGHGBonusTrigger = (pieceMoved?.type === 'greathorsegeneral' || pieceMoved?.type === 'cthulhu') && !move.isAttack && move.type === 'board';
        let eval;

        try {
            if (isCopeBonusTrigger || isGHGBonusTrigger) {
                // Call handleBonusTurn for the *current* player (isMaximizingPlayer)
                // Result is evaluation after opponent's reply to the bonus sequence
                 eval = handleBonusTurn(tempBoard, pieceMoved, move, depth, alpha, beta, isMaximizingPlayer, startTime, timeLimit, nextHash ^ zobristTurnBlack); // Pass hash *before* turn flip
            } else {
                // Regular move, call minimax for the *opponent*
                eval = minimax(tempBoard, depth - 1, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, nextHash);
            }
        } catch (e) {
            if (e.message === 'TimeLimitExceeded') {
                 throw e; // Propagate up
            } else {
                 console.error("Worker: Unexpected error during recursive search:", e);
                 // Return worst score if unexpected error occurs
                 eval = isMaximizingPlayer ? -Infinity : Infinity;
            }
        }
        // --- End Recursive Call ---


        // --- Update Alpha/Beta and Best Score ---
        if (isMaximizingPlayer) {
            if (eval > bestScore) {
                bestScore = eval;
                bestMove = move; // Store the move that led to this score
            }
            alpha = Math.max(alpha, eval);
            if (beta <= alpha) { // Beta cutoff
                 if (!move.isAttack && move.type === 'board' && move.from) { storeKillerMove(depth, move); } // Store non-capture killer
                 break;
            }
        } else { // Minimizing Player (Black)
             if (eval < bestScore) {
                 bestScore = eval;
                 bestMove = move;
             }
             beta = Math.min(beta, eval);
             if (beta <= alpha) { // Alpha cutoff
                 if (!move.isAttack && move.type === 'board' && move.from) { storeKillerMove(depth, move); } // Store non-capture killer
                 break;
             }
        }
        // --- End Update ---
    }
    // --- End Move Iteration ---


    // --- Store in Transposition Table ---
    let flag = TT_FLAG_EXACT; // Assume exact score unless cutoff occurred
    if (bestScore <= alphaOrig) { flag = TT_FLAG_UPPERBOUND; } // Failed low
    else if (bestScore >= beta) { flag = TT_FLAG_LOWERBOUND; } // Failed high
    // Store using the original hash for this position, depth, calculated score, flag, and best move found
    storeTTEntry(currentHash, depth, bestScore, flag, bestMove || ttBestMove); // Use TT move if no move improved alpha
    // --- End TT Store ---

    return bestScore; // Return the best score found for this node
}


const QUIESCENCE_MAX_DEPTH = 3; // How deep to search for captures only

function quiescenceSearch(boardState, alpha, beta, isMaximizingPlayer, startTime, timeLimit, depth = QUIESCENCE_MAX_DEPTH, currentHash) {
    if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded'); // Check time limit

    // TT probe (optional for QSearch, can help but adds overhead)
    // let alphaOrig = alpha;
    // const ttProbe = probeTTEntry(currentHash, depth + 100, alpha, beta); // Use high depth to avoid collision
    // if (ttProbe.score !== null) { return ttProbe.score; }

    // --- Base Case: Game Over or Stand Pat ---
    // Check immediate win/loss conditions first
    for(const sq of botSanctuarySquares) { const p = boardState[sq.y]?.[sq.x]; if (p && (p.type === 'lupa' || p.type === 'prince')) return p.color === 'white' ? Infinity : -Infinity; }
    let whiteLupaPosQ = null, blackLupaPosQ = null, whitePrinceOnBoardQ = false, blackPrinceOnBoardQ = false;
    for (let y = 0; y < BOARD_HEIGHT; y++) { for (let x = 0; x < BOARD_WIDTH; x++) { const p = boardState[y]?.[x]; if (p) { if(p.type==='lupa'){if(p.color==='white')whiteLupaPosQ={x,y};else blackLupaPosQ={x,y};} else if(p.type==='prince'){if(p.color==='white')whitePrinceOnBoardQ=true;else blackPrinceOnBoardQ=true;}}}}
    if (!whiteLupaPosQ && !whitePrinceOnBoardQ) return -Infinity - depth; // Add depth bias
    if (!blackLupaPosQ && !blackPrinceOnBoardQ) return Infinity + depth;  // Add depth bias

    // Evaluate the current static board position ("stand pat" score)
    let stand_pat = evaluateBoard(boardState); // Use evaluateBoard function

    // If max quiescence depth reached, return static evaluation
    if (depth === 0) return stand_pat;

    // --- Update Alpha/Beta with Stand Pat Score ---
    // If the static score is already outside the alpha-beta window, we can prune
    if (isMaximizingPlayer) {
        if (stand_pat >= beta) return beta; // Fail high - opponent won't allow this
        alpha = Math.max(alpha, stand_pat); // Update alpha if stand_pat is better
    } else { // Minimizing player
        if (stand_pat <= alpha) return alpha; // Fail low - opponent won't allow this
        beta = Math.min(beta, stand_pat);   // Update beta if stand_pat is better (worse for white)
    }
    // --- End Update ---


    // --- Generate and Sort ONLY Capture Moves ---
    const color = isMaximizingPlayer ? 'white' : 'black';
    const captureMoves = getCaptureMoves(boardState, color); // Use getCaptureMoves

    // If no captures available, return the stand pat score
    if (captureMoves.length === 0) return stand_pat;

    // Sort captures (MVV-LVA is good here)
    captureMoves.sort((a, b) => {
        const victimA = boardState[a.to.y]?.[a.to.x]; const victimB = boardState[b.to.y]?.[b.to.x];
        const attackerA = a.from ? boardState[a.from.y]?.[a.from.x] : null; const attackerB = b.from ? boardState[b.from.y]?.[b.from.x] : null;
        // Prioritize capturing high-value pieces with low-value attackers
        const victimValA = victimA ? (pieceValues[victimA.type] || 0) : 0; const victimValB = victimB ? (pieceValues[victimB.type] || 0) : 0;
        const attackerValA = attackerA ? (pieceValues[attackerA.type] || 0) : 0; const attackerValB = attackerB ? (pieceValues[attackerB.type] || 0) : 0;
        // Simple MVV-LVA: sort by victim value descending, then attacker value ascending
        if (victimValA !== victimValB) return victimValB - victimValA; // Higher victim value first
        else return attackerValA - attackerValB; // Lower attacker value first
    });
    // --- End Move Generation/Sorting ---


    // --- Iterate Through Capture Moves ---
    let bestMove = null; // Track best move for TT
    let bestScore = stand_pat; // Initialize best score with stand_pat

    for (const move of captureMoves) {
        if (Date.now() - startTime >= timeLimit) throw new Error('TimeLimitExceeded'); // Check time

        const tempBoard = copyBoard(boardState);
        const piece = tempBoard[move.from.y]?.[move.from.x];
        if (!piece) continue; // Should not happen for capture moves from board
        const targetPiece = tempBoard[move.to.y]?.[move.to.x]; // The piece being captured
        let nextHash = currentHash; // Copy hash

        // Apply move and update hash
         if(zobristTable[piece.type]?.[piece.color]?.[move.from.y]?.[move.from.x]){
              nextHash ^= zobristTable[piece.type][piece.color][move.from.y][move.from.x];
         } else { console.warn("Missing Zobrist key QSearch move from:", piece, move.from.y, move.from.x); }
         if (targetPiece) { // Should always exist for a capture move
              if(zobristTable[targetPiece.type]?.[targetPiece.color]?.[move.to.y]?.[move.to.x]){
                   nextHash ^= zobristTable[targetPiece.type][targetPiece.color][move.to.y][move.to.x];
              } else { console.warn("Missing Zobrist key QSearch capture:", targetPiece, move.to.y, move.to.x); }
         } else { console.warn("Quiescence search move was not a capture?", move); } // Should not happen
        tempBoard[move.to.y][move.to.x] = piece;
        tempBoard[move.from.y][move.from.x] = null;
         if(zobristTable[piece.type]?.[piece.color]?.[move.to.y]?.[move.to.x]){
              nextHash ^= zobristTable[piece.type][piece.color][move.to.y][move.to.x];
         } else { console.warn("Missing Zobrist key QSearch move to:", piece, move.to.y, move.to.x); }
         nextHash ^= zobristTurnBlack; // Flip turn


        // --- Recursive Call ---
        let score;
         try {
              score = quiescenceSearch(tempBoard, alpha, beta, !isMaximizingPlayer, startTime, timeLimit, depth - 1, nextHash);
         } catch (e) {
              if (e.message === 'TimeLimitExceeded') {
                   throw e; // Propagate up
              } else {
                   console.error("Worker: Unexpected error during quiescence search:", e);
                   score = isMaximizingPlayer ? -Infinity : Infinity; // Return worst score on error
              }
         }
        // --- End Recursive Call ---


        // --- Update Alpha/Beta and Best Score ---
        if (isMaximizingPlayer) {
             if (score > bestScore) {
                 bestScore = score;
                 bestMove = move;
             }
             alpha = Math.max(alpha, score);
             if (beta <= alpha) break; // Beta cutoff
        } else { // Minimizing player
             if (score < bestScore) {
                 bestScore = score;
                 bestMove = move;
             }
             beta = Math.min(beta, score);
             if (beta <= alpha) break; // Alpha cutoff
        }
        // --- End Update ---
    }
    // --- End Move Iteration ---


    // TT Store (Optional for QSearch)
    // let flag = TT_FLAG_EXACT;
    // if (bestScore <= alphaOrig) { flag = TT_FLAG_UPPERBOUND; }
    // else if (bestScore >= beta) { flag = TT_FLAG_LOWERBOUND; }
    // if(bestMove) storeTTEntry(currentHash, depth + 100, bestScore, flag, bestMove);

    return bestScore; // Return the best score found (either stand_pat or from a capture sequence)
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
console.log("botWorker.js loaded and ready with helper functions.");