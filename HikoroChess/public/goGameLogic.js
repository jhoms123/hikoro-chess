(function(exports) {

const BOARD_SIZE = 19;

/**
 * Creates the initial board state for the Go Variant
 */
exports.getInitialGoBoard = function() {
    // 0 = Empty, 1 = Black, 2 = White, 3 = Black Shield, 4 = White Shield
    return Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0));
}

/**
 * Public-facing function for the server to get valid moves.
 * data: { x, y }
 */
exports.getValidMoves = function(game, data) {
    if (!game || !data || data.x === undefined || data.y === undefined) return [];
    
    const { x, y } = data;
    const piece = game.boardState[y][x];
    if (!piece) return [];
    
    // Check if it's the correct player's piece
    const player = (game.isWhiteTurn ? 2 : 1);
    if (piece !== player) return []; // Can only select non-shield pieces

    return getValidMovesForGoPiece(x, y, game.boardState, player);
}

/**
 * Public-facing function for the server to make a move.
 * move: { type: 'place', to: {x,y} }
 * | { type: 'move', from: {x,y}, to: {x,y} }
 * | { type: 'shield', at: {x,y} }
 * | { type: 'resign' }
 */
exports.makeGoMove = function(game, move, playerColor) {
    const newGame = JSON.parse(JSON.stringify(game));
    const player = (playerColor === 'white' ? 2 : 1);
    let moveResult;
    // --- >>> ADD LOG <<< ---
    console.log(`  [goLogic] makeGoMove called. Type: ${move.type}, Player: ${player} (${playerColor})`);
    // --- >>> END LOG <<< ---

    switch (move.type) {
        case 'place':
            moveResult = placeStone(newGame, move.to.x, move.to.y, player);
            // --- >>> ADD LOG <<< ---
            console.log(`  [goLogic] placeStone result: success=${moveResult.success}, error=${moveResult.error}`);
            // --- >>> END LOG <<< ---
            break;
       // ... other cases ...
    }

    if (moveResult.success) {
        // --- >>> ADD LOG <<< ---
        console.log(`  [goLogic] Move success. Toggling turn from ${newGame.isWhiteTurn} to ${!newGame.isWhiteTurn}`);
        // --- >>> END LOG <<< ---
        moveResult.updatedGame.score = calculateScore(
            moveResult.updatedGame.boardState, 
            moveResult.updatedGame.blackPiecesLost, 
            moveResult.updatedGame.whitePiecesLost
        );
        if (move.type !== 'resign') {
            moveResult.updatedGame.lastMove = move.to || move.at;
            moveResult.updatedGame.isWhiteTurn = !newGame.isWhiteTurn; // Toggle turn
            moveResult.updatedGame.turnCount++;
            updateMoveList(moveResult.updatedGame, move);
        }
    }
    
    return moveResult;
}

function placeStone(game, x, y, player) {
    // --- >>> ADD LOG <<< ---
    console.log(`    [goLogic] placeStone: Placing ${player} at ${x},${y}. Current occupant: ${game.boardState[y]?.[x]}`);
    // --- >>> END LOG <<< ---
    if (game.boardState[y]?.[x] !== 0) { // Added safety check
        console.log(`    [goLogic] placeStone failed: Spot occupied.`); // Added log
        return { success: false, error: "Spot is occupied." };
    }
    
    game.boardState[y][x] = player;
    
    // --- >>> ADD LOG <<< ---
    console.log(`    [goLogic] placeStone: Placed stone. Checking captures/suicide...`);
    // --- >>> END LOG <<< ---
    if (!processCapturesAndSuicide(game, x, y, player)) {
        console.log(`    [goLogic] placeStone failed: Suicide move detected and reverted.`); // Added log
        return { success: false, error: "Illegal suicide move." };
    }
    
    console.log(`    [goLogic] placeStone success.`); // Added log
    return { success: true, updatedGame: game };
}

function movePiece(game, fromX, fromY, toX, toY, player) {
    const piece = game.boardState[fromY][fromX];
    if (piece !== player) {
        return { success: false, error: "Not your piece." };
    }

    const enemyPlayer = (player === 1) ? 2 : 1;
    const destState = game.boardState[toY][toX];
    
    const dx = Math.abs(toX - fromX);
    const dy = Math.abs(toY - fromY);

    let jumpedPiece = null;
    let jumpedPieceState = 0;

    // Check for valid move type
    if (dx + dy === 1 && destState === 0) {
        // Simple 1-square move
    } else if (((dx === 2 && dy === 0) || (dx === 0 && dy === 2)) && destState === 0) {
        // 2-square jump
        const midX = fromX + (toX - fromX) / 2;
        const midY = fromY + (toY - fromY) / 2;
        jumpedPieceState = game.boardState[midY][midX];

        if (jumpedPieceState === enemyPlayer) {
            jumpedPiece = { x: midX, y: midY, state: jumpedPieceState };
        } else {
            return { success: false, error: "Invalid jump." };
        }
    } else {
        return { success: false, error: "Invalid move." };
    }
    
    // Make the move
    game.boardState[fromY][fromX] = 0;
    if (jumpedPiece) {
        game.boardState[jumpedPiece.y][jumpedPiece.x] = 0;
        if (jumpedPiece.state === 1) game.blackPiecesLost++;
        if (jumpedPiece.state === 2) game.whitePiecesLost++;
    }
    game.boardState[toY][toX] = player;

    // Check for Go-captures and suicide
    if (!processCapturesAndSuicide(game, toX, toY, player)) {
        // Illegal suicide move, revert!
        game.boardState[fromY][fromX] = player;
        game.boardState[toY][toX] = 0; // It was an empty spot
        if (jumpedPiece) {
            game.boardState[jumpedPiece.y][jumpedPiece.x] = jumpedPiece.state;
            if (jumpedPiece.state === 1) game.blackPiecesLost--;
            if (jumpedPiece.state === 2) game.whitePiecesLost--;
        }
        return { success: false, error: "Illegal suicide move." };
    }
    
    return { success: true, updatedGame: game };
}

function turnToShield(game, x, y, player) {
    if (game.boardState[y][x] !== player) {
        return { success: false, error: "Not your piece." };
    }
    
    game.boardState[y][x] = (player === 1) ? 3 : 4; // 3: Black Shield, 4: White Shield
    
    // Shielding can cause captures
    processCaptures(game, x, y, player);

    return { success: true, updatedGame: game };
}

function handleResign(game, player) {
    game.gameOver = true;
    game.winner = (player === 1) ? 'white' : 'black';
    game.reason = "Resignation";
    return { success: true, updatedGame: game };
}


// --- GO LOGIC (LIBERTIES, CAPTURES, SCORING) ---

function getNeighbors(x, y) {
    const neighbors = [];
    if (isValid(x, y - 1)) neighbors.push({ x: x, y: y - 1 }); 
    if (isValid(x, y + 1)) neighbors.push({ x: x, y: y + 1 }); 
    if (isValid(x - 1, y)) neighbors.push({ x: x - 1, y: y }); 
    if (isValid(x + 1, y)) neighbors.push({ x: x + 1, y: y }); 
    return neighbors;
}

function isValid(x, y) {
    return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
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
        const neighbors = getNeighbors(x, y);

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

/**
 * Checks and processes only enemy captures. Used by turnToShield.
 */
function processCaptures(game, x, y, player) {
    const isBlackTeam = (player === 1 || player === 3);
    const neighbors = getNeighbors(x, y);
    
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

/**
 * Checks for enemy captures AND self-suicide.
 * Returns false if move is illegal suicide.
 */
function processCapturesAndSuicide(game, x, y, player) {
    const isBlackTeam = (player === 1);
    let capturedStones = false;

    // 1. Check adjacent *enemy* groups for capture
    const neighbors = getNeighbors(x, y);
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
        game.boardState[y][x] = 0; 
        return false; // Illegal move
    }
    return true; // Legal move
}

/**
 * Gets valid moves for a standard (non-shield) Go piece.
 */
function getValidMovesForGoPiece(x, y, boardState, player) {
    const validMoves = [];
    const enemyPlayer = (player === 1) ? 2 : 1;

    // 1. Check simple 1-square moves
    const neighbors = getNeighbors(x, y);
    for (const move of neighbors) {
        if (boardState[move.y][move.x] === 0) {
            validMoves.push({ x: move.x, y: move.y, type: 'move' });
        }
    }

    // 2. Check 2-square jump captures
    const jumps = [
        { dx: 0, dy: -2 }, { dx: 0, dy: 2 }, { dx: -2, dy: 0 }, { dx: 2, dy: 0 }
    ];

    for (const jump of jumps) {
        const landX = x + jump.dx;
        const landY = y + jump.dy;
        const midX = x + jump.dx / 2;
        const midY = y + jump.dy / 2;

        if (isValid(landX, landY) && boardState[landY][landX] === 0) {
            if (isValid(midX, midY) && boardState[midY][midX] === enemyPlayer) {
                validMoves.push({ x: landX, y: landY, type: 'jump' });
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

                    const neighbors = getNeighbors(cx, cy);
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

    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const state = boardState[y][x];
            if (state === 1 || state === 3) blackStones++;
            else if (state === 2 || state === 4) whiteStones++;
        }
    }

    const territory = calculateTerritory(boardState);
    
    const blackScore = blackStones + territory.black - blackPiecesLost;
    const whiteScore = whiteStones + territory.white - whitePiecesLost;

    return {
        black: blackScore,
        white: whiteScore,
        details: {
            black: { stones: blackStones, territory: territory.black, lost: blackPiecesLost },
            white: { stones: whiteStones, territory: territory.white, lost: whitePiecesLost }
        }
    };
}

/**
 * Generates a simple notation for the move list.
 */
function updateMoveList(game, move) {
    const turnNum = Math.floor(game.turnCount / 2) + 1;
    let notationString = "";

    // This switch's job is ONLY to create the string
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
        case 'resign':
            notationString = `Resign`;
            break;
        default:
             notationString = `Unknown`;
    }

    if (game.isWhiteTurn) { // This logic was wrong before, should be based on whose turn it *was*
        // This is White's move, so start a new line
        game.moveList.push(`${turnNum}. ${notationString}`);
    } else {
        // This is Black's move, so append to the last line
        if (game.moveList.length > 0) {
            game.moveList[game.moveList.length - 1] += ` ${notationString}`;
        } else {
            // Should not happen if white moves first, but good to have
            game.moveList.push(`${turnNum}... ${notationString}`);
        }
    }
}


})(typeof module === 'undefined' ? (this.goGameLogic = {}) : module.exports);