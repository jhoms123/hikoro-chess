(function(exports) {

/**
 * Creates the initial board state for the Go Variant
 */
exports.getInitialGoBoard = function(boardSize = 19) { // Accept boardSize as an argument
    // 0 = Empty, 1 = Black, 2 = White, 3 = Black Shield, 4 = White Shield
    return Array(boardSize).fill(0).map(() => Array(boardSize).fill(0));
}



exports.getValidMoves = function(game, data) {
    if (!game || !data || data.x === undefined || data.y === undefined) return [];
    
    const { x, y } = data;
    const piece = game.boardState[y][x];
    if (!piece) return [];
    
    // ✅ FIX: Determine player from game state, not passed-in color
    const player = (game.isWhiteTurn ? 2 : 1);
    
    // Check if it's the correct player's piece (normal or shield)
    if (piece !== player && piece !== (player + 2)) {
        console.log(`getValidMoves: Piece ${piece} does not belong to player ${player}`);
        return [];
    }

    // If a chain capture is pending, you can ONLY move that piece
    if (game.pendingChainCapture) {
        if (x !== game.pendingChainCapture.x || y !== game.pendingChainCapture.y) {
            return []; // Can't select any other piece
        }
        // If it IS the correct piece, only return jump moves
        const allMoves = getValidMovesForGoPiece(x, y, game.boardState, piece);
        // Filter for orthogonal jumps only
        return allMoves.filter(m => m.type === 'jump');
    }
    
    // Not a chain, just return all valid moves for the selected piece
    return getValidMovesForGoPiece(x, y, game.boardState, piece);
}

/**
 * Public-facing function for the server to make a move.
 * move: { type: 'place', to: {x,y} }
 * | { type: 'move', from: {x,y}, to: {x,y} }
 * | { type: 'shield', at: {x,y} }
 * | { type: 'pass' }
 * | { type: 'resign' }
 */
exports.makeGoMove = function(game, move, playerColor) {
    // Ensure game and move objects exist
    if (!game || !move) {
        return { success: false, error: "Invalid game or move object." };
    }

    const newGame = JSON.parse(JSON.stringify(game));

    // ✅✅✅ THIS IS THE CRITICAL PART ✅✅✅
    // Determine the player whose turn it ACTUALLY IS from the game state.
    const activePlayer = (newGame.isWhiteTurn ? 2 : 1); // 2 for White, 1 for Black
    // Determine the player making the request (only needed for resign)
    const requestingPlayer = (playerColor === 'white' ? 2 : 1);

    // --- Add this console log for debugging ---
    console.log(`[makeGoMove] Turn: ${newGame.isWhiteTurn ? 'White' : 'Black'}, ActivePlayer: ${activePlayer}, RequestingPlayer: ${requestingPlayer}, Move: `, move);
    // -----------------------------------------

    let moveResult = { success: false, error: "Unknown move type." };

    switch (move.type) {
        case 'place':
            // Use activePlayer
            moveResult = placeStone(newGame, move.to.x, move.to.y, activePlayer);
            break;
        case 'move':
            if (newGame.pendingChainCapture) {
                if (!move.from || move.from.x !== newGame.pendingChainCapture.x || move.from.y !== newGame.pendingChainCapture.y) {
                    return { success: false, error: "Invalid chain capture. Must move from the last landing spot." };
                }
                newGame.pendingChainCapture = null; // Clear before moving
            }
            // Use activePlayer
            moveResult = movePiece(newGame, move.from.x, move.from.y, move.to.x, move.to.y, activePlayer);
            break;
        case 'shield':
            // Use activePlayer
            moveResult = turnToShield(newGame, move.at.x, move.at.y, activePlayer);
            break;
        case 'pass':
            newGame.pendingChainCapture = null;
            moveResult = { success: true, updatedGame: newGame, isChain: false };
            break;
        case 'resign':
            // Use requestingPlayer
            moveResult = handleResign(newGame, requestingPlayer);
            break;
        default:
             moveResult = { success: false, error: "Unknown move type." };
    }

    // --- Process the result ---
    if (moveResult.success) {
        const updatedGame = moveResult.updatedGame;

        // Ensure score object exists before calculation
         if (!updatedGame.score) {
            updatedGame.score = { black: 0, white: 0, details: { black: {}, white: {} } };
         }
        updatedGame.score = calculateScore(
            updatedGame.boardState,
            updatedGame.blackPiecesLost || 0, // Default to 0 if undefined
            updatedGame.whitePiecesLost || 0  // Default to 0 if undefined
        );

        if (move.type !== 'resign') {
            // Set lastMove
            if (move.type === 'place' || move.type === 'move') {
                updatedGame.lastMove = move.to;
            } else if (move.type === 'shield') {
                updatedGame.lastMove = move.at;
            } else {
                updatedGame.lastMove = null; // Pass has no 'to'
            }

            // Ensure moveList exists
            if (!updatedGame.moveList) {
                updatedGame.moveList = [];
            }
            updateMoveList(updatedGame, move);

            // Toggle turn only if it's not a continuing chain capture
            if (!moveResult.isChain) {
                updatedGame.isWhiteTurn = !newGame.isWhiteTurn;
                updatedGame.turnCount = (updatedGame.turnCount || 0) + 1; // Ensure turnCount exists
                updatedGame.pendingChainCapture = null; // Clear chain flag when turn ends
            }
        }

        return { success: true, updatedGame: updatedGame };
    } else {
        // --- Add this console log for debugging failures ---
        console.error(`[makeGoMove] Failed: ${moveResult.error}`);
        // ----------------------------------------------
        return moveResult; // Return the failure result (contains error message)
    }
}

function placeStone(game, x, y, player) {
    if (game.boardState[y]?.[x] !== 0) { 
        return { success: false, error: "Spot is occupied." };
    }
    
    // **NEW RULE**: If chain capture is pending, you cannot place a stone.
    if (game.pendingChainCapture) {
        return { success: false, error: "Must complete chain capture or pass." };
    }

    game.boardState[y][x] = player;
    
    if (!processCapturesAndSuicide(game, x, y, player)) {
        return { success: false, error: "Illegal suicide move." };
    }
    
    // A regular 'place' move cannot be a chain
    return { success: true, updatedGame: game, isChain: false };
}

/**
 * **HEAVILY MODIFIED**
 * This function now handles moves for BOTH Normal and Shield stones.
 */
function movePiece(game, fromX, fromY, toX, toY, player) {
    const piece = game.boardState[fromY][fromX];
    const enemyPlayer = (player === 1) ? 2 : 1;
    
    // Check if it's the player's piece (normal or shield)
    if (piece !== player && piece !== (player + 2)) {
        return { success: false, error: "Not your piece." };
    }

    const destState = game.boardState[toY][toX];
    
    const dx = Math.abs(toX - fromX);
    const dy = Math.abs(toY - fromY);

    let jumpedPiece = null;
    let moveType = null; // 'jump' or 'move'

    // --- LOGIC FOR NORMAL STONE ---
    if (piece === player) {
        // Orthogonal jump check (2 squares)
        if (((dx === 2 && dy === 0) || (dx === 0 && dy === 2)) && destState === 0) {
            const midX = fromX + (toX - fromX) / 2;
            const midY = fromY + (toY - fromY) / 2;
            const jumpedPieceState = game.boardState[midY][midX];

            // Can only jump enemy NORMAL stones
            if (jumpedPieceState === enemyPlayer) {
                jumpedPiece = { x: midX, y: midY, state: jumpedPieceState };
                moveType = 'jump';
            } else {
                return { success: false, error: "Invalid jump. Can only jump enemy normal stones." };
            }
        } else {
            // **NEW RULE**: Normal stones cannot move, only capture.
            return { success: false, error: "Invalid move. Normal stones can only move by capturing." };
        }
    } 
    // --- LOGIC FOR SHIELD STONE ---
    else if (piece === player + 2) {
        // **NEW RULE**: Shields can move 1 square (ortho or diag) but not capture.
        if ((dx + dy === 1 || (dx === 1 && dy === 1)) && destState === 0) {
            // Valid 1-square move to an empty spot
            moveType = 'move';
        } else {
            return { success: false, error: "Invalid move. Shields can only move 1 square to an empty space." };
        }
    }
    
    // --- EXECUTE THE MOVE ---
    game.boardState[fromY][fromX] = 0;
    if (jumpedPiece) {
        game.boardState[jumpedPiece.y][jumpedPiece.x] = 0;
        if (jumpedPiece.state === 1) game.blackPiecesLost++;
        if (jumpedPiece.state === 2) game.whitePiecesLost++;
    }
    // Move the original piece (Normal or Shield)
    game.boardState[toY][toX] = piece; 

    // Check for Go-captures and suicide
    if (!processCapturesAndSuicide(game, toX, toY, player)) {
        // Illegal suicide move, revert!
        game.boardState[fromY][fromX] = piece; // Put original piece back
        game.boardState[toY][toX] = 0; // It was an empty spot
        if (jumpedPiece) {
            game.boardState[jumpedPiece.y][jumpedPiece.x] = jumpedPiece.state;
            if (jumpedPiece.state === 1) game.blackPiecesLost--;
            if (jumpedPiece.state === 2) game.whitePiecesLost--;
        }
        return { success: false, error: "Illegal suicide move." };
    }

    // --- **NEW CHAIN CAPTURE CHECK** ---
    let isChain = false;
    // Only check for chains if this move was a jump
    if (moveType === 'jump') {
        // Check for new *orthogonal* jumps from the *landing spot*
        const allNewMoves = getValidMovesForGoPiece(toX, toY, game.boardState, piece);
        const availableChainJumps = allNewMoves.filter(m => m.type === 'jump');
        
        if (availableChainJumps.length > 0) {
            // **Mark the game as pending a chain capture**
            game.pendingChainCapture = { x: toX, y: toY };
            isChain = true; // Signal to makeGoMove NOT to toggle the turn
        }
    }
    
    return { success: true, updatedGame: game, isChain: isChain };
}

function turnToShield(game, x, y, player) {
    if (game.boardState[y][x] !== player) {
        return { success: false, error: "Not your piece." };
    }

    // **NEW RULE**: If chain capture is pending, you cannot turn to shield.
    if (game.pendingChainCapture) {
        return { success: false, error: "Must complete chain capture or pass." };
    }
    
    game.boardState[y][x] = (player === 1) ? 3 : 4; // 3: Black Shield, 4: White Shield
    
    // Shielding can cause captures
    processCaptures(game, x, y, player);

    return { success: true, updatedGame: game, isChain: false };
}

function handleResign(game, player) {
    game.gameOver = true;
    game.winner = (player === 1) ? 'white' : 'black';
    game.reason = "Resignation";
    return { success: true, updatedGame: game };
}


// --- GO LOGIC (LIBERTIES, CAPTURES, SCORING) ---
// (These functions are unchanged from your file)

function getNeighbors(x, y, boardState) {
    const neighbors = [];
    if (isValid(x, y - 1, boardState)) neighbors.push({ x: x, y: y - 1 }); 
    if (isValid(x, y + 1, boardState)) neighbors.push({ x: x, y: y + 1 }); 
    if (isValid(x - 1, y, boardState)) neighbors.push({ x: x - 1, y: y }); 
    if (isValid(x + 1, y, boardState)) neighbors.push({ x: x + 1, y: y }); 
    return neighbors;
}

function isValid(x, y, boardState) {
    const boardSize = boardState.length;
    return x >= 0 && x < boardSize && y >= 0 && y < boardSize;
}

function findGroup(boardState, startX, startY) {
    const pieceType = boardState[startY][startX];
    if (pieceType === 0) return null; 

    const isBlackTeam = (pieceType === 1 || pieceType === 3);
    const queue = [{ x: startX, y: startY }];
    const visited = new Set([`${startX},${startY}`]);
    const stones = [];
    const liberties = new Set();

    while (queue.length > 0) {
        const { x, y } = queue.shift();
        stones.push({ x, y });
        const neighbors = getNeighbors(x, y, boardState);

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (visited.has(key)) continue;
            const state = boardState[n.y][n.x];

            if (state === 0) {
                liberties.add(key);
            } else {
                const isNeighborBlackTeam = (state === 1 || state === 3);
                if (isBlackTeam === isNeighborBlackTeam) {
                    visited.add(key);
                    queue.push({ x: n.x, y: n.y });
                }
            }
        }
    }
    return { stones, liberties };
}

function processCaptures(game, x, y, player) {
    const isBlackTeam = (player === 1 || player === 3);
    const neighbors = getNeighbors(x, y, game.boardState);
    
    for (const n of neighbors) {
        const state = game.boardState[n.y][n.x];
        if (state > 0) { 
            const isNeighborBlackTeam = (state === 1 || state === 3);
            if (isBlackTeam !== isNeighborBlackTeam) {
                const group = findGroup(game.boardState, n.x, n.y);
                if (group && group.liberties.size === 0) {
                    const isCapturedBlack = (state === 1 || state === 3);
                    for (const stone of group.stones) {
                        game.boardState[stone.y][stone.x] = 0;
                        if (isCapturedBlack) game.blackPiecesLost++; else game.whitePiecesLost++;
                    }
                }
            }
        }
    }
}

function processCapturesAndSuicide(game, x, y, player) {
    const isBlackTeam = (player === 1 || player === 3); // Check based on *acting* player's team
    let capturedStones = false;

    // 1. Check adjacent *enemy* groups for capture
    const neighbors = getNeighbors(x, y, game.boardState);
    for (const n of neighbors) {
        const state = game.boardState[n.y][n.x];
        if (state > 0) { 
            const isNeighborBlackTeam = (state === 1 || state === 3);
            if (isBlackTeam !== isNeighborBlackTeam) {
                const group = findGroup(game.boardState, n.x, n.y);
                if (group && group.liberties.size === 0) {
                    capturedStones = true;
                    const isCapturedBlack = (state === 1 || state === 3);
                    for (const stone of group.stones) {
                        game.boardState[stone.y][stone.x] = 0;
                        if (isCapturedBlack) game.blackPiecesLost++; else game.whitePiecesLost++;
                    }
                }
            }
        }
    }

    // 2. Check *own* group for suicide
    const myGroup = findGroup(game.boardState, x, y);
    if (myGroup && myGroup.liberties.size === 0 && !capturedStones) {
        // Suicide! Undo the move.
        // Note: The revert logic is now in movePiece, this just signals failure
        return false; // Illegal move
    }
    return true; // Legal move
}

/**
 * **HEAVILY MODIFIED**
 * Gets valid moves for a *specific piece* (Normal or Shield).
 */
function getValidMovesForGoPiece(x, y, boardState, piece) {
    const validMoves = [];
    const player = (piece === 1 || piece === 3) ? 1 : 2; // Get player's base color
    const enemyPlayer = (player === 1) ? 2 : 1;
    const boardSize = boardState.length;

    // --- LOGIC FOR NORMAL STONE (Captures Only) ---
    if (piece === player) {
        const jumps = [
            { dx: 0, dy: -2 }, { dx: 0, dy: 2 }, { dx: -2, dy: 0 }, { dx: 2, dy: 0 }
        ];

        for (const jump of jumps) {
            const landX = x + jump.dx;
            const landY = y + jump.dy;
            const midX = x + jump.dx / 2;
            const midY = y + jump.dy / 2;

            if (isValid(landX, landY, boardState) && boardState[landY][landX] === 0) {
                // Check if the middle square contains an enemy NORMAL stone
                if (isValid(midX, midY, boardState) && boardState[midY][midX] === enemyPlayer) {
                    validMoves.push({ x: landX, y: landY, type: 'jump' });
                }
            }
        }
    } 
    // --- LOGIC FOR SHIELD STONE (Moves Only) ---
    else if (piece === player + 2) {
        const potentialMoves = [
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, // Orthogonal
            { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }  // Diagonal
        ];

        for (const moveOffset of potentialMoves) {
            const moveX = x + moveOffset.dx;
            const moveY = y + moveOffset.dy;

            // Check if the move is within bounds and the destination is empty
            if (isValid(moveX, moveY, boardState) && boardState[moveY][moveX] === 0) {
                validMoves.push({ x: moveX, y: moveY, type: 'move' });
            }
        }
    }
    
    return validMoves;
}


/**
 * Runs a flood-fill (BFS) on all empty spots to find territory
 */
function calculateTerritory(boardState) {
    let blackTerritory = 0;
    let whiteTerritory = 0;
    const visited = new Set();
    const BOARD_SIZE = boardState.length;

    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const key = `${x},${y}`;
            if (boardState[y][x] === 0 && !visited.has(key)) {
                
                const region = []; 
                const queue = [{ x, y }];
                visited.add(key);
                let bordersBlack = false;
                let bordersWhite = false;

                while (queue.length > 0) {
                    const { x: cx, y: cy } = queue.shift();
                    region.push({ x: cx, y: cy });

                    const neighbors = getNeighbors(cx, cy, boardState);
                    for (const n of neighbors) {
                        const nKey = `${n.x},${n.y}`;
                        const state = boardState[n.y][n.x];
                        
                        if (state === 0 && !visited.has(nKey)) {
                            visited.add(nKey);
                            queue.push(n);
                        } else if (state === 1 || state === 3) {
                            bordersBlack = true;
                        } else if (state === 2 || state === 4) {
                            bordersWhite = true;
                        }
                    }
                }
                
                if (bordersBlack && !bordersWhite) {
                    blackTerritory += region.length;
                } else if (!bordersBlack && bordersWhite) {
                    whiteTerritory += region.length;
                }
            }
        }
    }
    return { black: blackTerritory, white: whiteTerritory };
}

/**
 * Calculates the complete score object.
 */
function calculateScore(boardState, blackPiecesLost, whitePiecesLost) {
    let blackStones = 0;
    let whiteStones = 0;
    const BOARD_SIZE = boardState.length;

    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const state = boardState[y][x];
            if (state === 1 || state === 3) blackStones++;
            else if (state === 2 || state === 4) whiteStones++;
        }
    }

    const territory = calculateTerritory(boardState);
    
    const blackScore = blackStones + territory.black;
    const whiteScore = whiteStones + territory.white;

    return {
        black: blackScore,
        white: whiteScore,
        details: {
            black: { stones: blackStones, territory: territory.black, lost: blackPiecesLost },
            white: { stones: whiteStones, territory: territory.white, lost: whitePiecesLost }
        }
    };
}

function updateMoveList(game, move) {
    // This logic needs to account for pendingChainCapture
    // If a chain is pending, the turn *hasn't* incremented yet.
    
    // Find the turn number based on the *actual* turn count
    // The turn has already toggled, so we use isWhiteTurn to see who *just* moved
    const turnNum = game.isWhiteTurn ? Math.floor(game.turnCount / 2) : Math.floor((game.turnCount -1) / 2) + 1;
    let notationString = "";

    switch (move.type) {
        case 'place':
            notationString = `P@${move.to.x},${move.to.y}`;
            break;
        case 'move':
            notationString = `M@${move.from.x},${move.from.y}>${move.to.x},${move.to.y}`;
            break;
        case 'shield':
            notationString = `S@${move.at.x},${move.at.y}`;
            break;
        case 'pass': 
            notationString = `Pass`;
            break;
        case 'resign':
            notationString = `Resign`;
            break;
        default:
            notationString = `Unknown`;
    }
    
    // **NEW CHAIN CAPTURE NOTATION**
    // ✅ FIX 2: Only check for chain if it's a 'move' type
    const isChainMove = (move.type === 'move' && move.to);

    // ✅ FIX 1: Logic is inverted because game.isWhiteTurn has already been toggled
    if (!game.isWhiteTurn) {
        // This was White's move.
        // Is it a *new* move or a chain?
        if (isChainMove && game.moveList.length > 0 && game.moveList[game.moveList.length - 1].startsWith(`${turnNum}.`) && !game.moveList[game.moveList.length - 1].includes(" ")) {
             // This is a chain capture (e.g., "1. M@1,1>1,3" exists, add ">1,5")
            game.moveList[game.moveList.length - 1] += `>${move.to.x},${move.to.y}`;
        } else {
             // Start a new line for White's turn
            game.moveList.push(`${turnNum}. ${notationString}`);
        }
    } else {
        // This was Black's move.
        // Is it a *new* move or a chain?
        if (isChainMove && game.moveList.length > 0 && game.moveList[game.moveList.length - 1].startsWith(`${turnNum}.`) && game.moveList[game.moveList.length - 1].includes(" ")) {
             // This is a chain capture (e.g., "1. M@... M@..." exists, add ">1,5")
            game.moveList[game.moveList.length - 1] += `>${move.to.x},${move.to.y}`;
        } else {
            // Append Black's first move to the line
            if (game.moveList.length > 0 && game.moveList[game.moveList.length -1].startsWith(`${turnNum}.`)) {
                game.moveList[game.moveList.length - 1] += ` ${notationString}`;
            } else {
                game.moveList.push(`${turnNum}... ${notationString}`); // Black moved first
            }
        }
    }
}function updateMoveList(game, move) {
    // This logic needs to account for pendingChainCapture
    // If a chain is pending, the turn *hasn't* incremented yet.
    
    // Find the turn number based on the *actual* turn count
    // The turn has already toggled, so we use isWhiteTurn to see who *just* moved
    const turnNum = game.isWhiteTurn ? Math.floor(game.turnCount / 2) : Math.floor((game.turnCount -1) / 2) + 1;
    let notationString = "";

    switch (move.type) {
        case 'place':
            notationString = `P@${move.to.x},${move.to.y}`;
            break;
        case 'move':
            notationString = `M@${move.from.x},${move.from.y}>${move.to.x},${move.to.y}`;
            break;
        case 'shield':
            notationString = `S@${move.at.x},${move.at.y}`;
            break;
        case 'pass': 
            notationString = `Pass`;
            break;
        case 'resign':
            notationString = `Resign`;
            break;
        default:
            notationString = `Unknown`;
    }
    
    // **NEW CHAIN CAPTURE NOTATION**
    // ✅ FIX 2: Only check for chain if it's a 'move' type
    const isChainMove = (move.type === 'move' && move.to);

    // ✅ FIX 1: Logic is inverted because game.isWhiteTurn has already been toggled
    if (!game.isWhiteTurn) {
        // This was White's move.
        // Is it a *new* move or a chain?
        if (isChainMove && game.moveList.length > 0 && game.moveList[game.moveList.length - 1].startsWith(`${turnNum}.`) && !game.moveList[game.moveList.length - 1].includes(" ")) {
             // This is a chain capture (e.g., "1. M@1,1>1,3" exists, add ">1,5")
            game.moveList[game.moveList.length - 1] += `>${move.to.x},${move.to.y}`;
        } else {
             // Start a new line for White's turn
            game.moveList.push(`${turnNum}. ${notationString}`);
        }
    } else {
        // This was Black's move.
        // Is it a *new* move or a chain?
        if (isChainMove && game.moveList.length > 0 && game.moveList[game.moveList.length - 1].startsWith(`${turnNum}.`) && game.moveList[game.moveList.length - 1].includes(" ")) {
             // This is a chain capture (e.g., "1. M@... M@..." exists, add ">1,5")
            game.moveList[game.moveList.length - 1] += `>${move.to.x},${move.to.y}`;
        } else {
            // Append Black's first move to the line
            if (game.moveList.length > 0 && game.moveList[game.moveList.length -1].startsWith(`${turnNum}.`)) {
                game.moveList[game.moveList.length - 1] += ` ${notationString}`;
            } else {
                game.moveList.push(`${turnNum}... ${notationString}`); // Black moved first
            }
        }
    }
}


})(typeof module === 'undefined' ? (this.goGameLogic = {}) : module.exports);