// ===================================================================
// Step 2: Bot's Upgraded "Brain" with Time Management
// ===================================================================

const pieceValues = {
    'pawn': 100, 'sult': 100, 'pilut': 150, 'fin': 300, 'cope': 320, 'chair': 500,
    'greatshield': 400, 'finor': 550, 'jotu': 800, 'mermaid': 850, 'neptune': 1000,
    'greathorsegeneral': 1200, 'cthulhu': 1500, 'lupa': 20000
};

const pawnPositionValue = [
    [0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1],[2,2,2,2,2,2,2,2,2,2],[3,3,3,3,3,3,3,3,3,3],
    [4,4,4,4,4,4,4,4,4,4],[5,5,5,5,5,5,5,5,5,5],[10,10,10,10,10,10,10,10,10,10],[20,20,20,20,20,20,20,20,20,20],
    [30,30,30,30,30,30,30,30,30,30],[0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0],[0,0,a,0,0,0,0,0,0,0],
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