(function(exports) {

    /**
     * Creates the initial board state for the Go Variant
     */
    exports.getInitialGoBoard = function(boardSize = 19) {
        return {
            board: Array(boardSize).fill(0).map(() => Array(boardSize).fill(0)),
            mustShieldAt: null 
        };
    }
    
    function isBoardStateEqual(boardA, boardB) {
        if (!boardA || !boardB) return false;
        if (boardA.length !== boardB.length) return false;
        
        const boardSize = boardA.length;
        for (let y = 0; y < boardSize; y++) {
            for (let x = 0; x < boardSize; x++) {
                if (boardA[y][x] !== boardB[y][x]) return false;
            }
        }
        return true;
    }
    
    exports.getValidMoves = function(game, data) {
        if (!game || !data || data.x === undefined || data.y === undefined) return [];
        
        const { x, y } = data;
        const piece = game.boardState[y]?.[x];
        if (!piece) return [];
        
        const player = (game.isWhiteTurn ? 2 : 1);
        
        // Strict ownership check
        if (piece !== player && piece !== (player + 2)) return [];
    
        // 1. Mandatory Shield Restriction
        if (game.mustShieldAt) {
            // No moves allowed, only shielding action (handled by UI button/logic)
            return [];
        }
    
        // 2. Pending Chain Restriction
        if (game.pendingChainCapture) {
            if (x !== game.pendingChainCapture.x || y !== game.pendingChainCapture.y) {
                return []; 
            }
            const allMoves = getValidMovesForGoPiece(x, y, game.boardState, piece);
            // Only jumps allowed
            return allMoves.filter(m => m.type === 'jump');
        }
        
        // 3. Normal Moves
        return getValidMovesForGoPiece(x, y, game.boardState, piece);
    }
    
    exports.makeGoMove = function(game, move, playerColor) {
        if (!game || !move) return { success: false, error: "Invalid data." };
    
        // Clone state for mutation
        const boardStateBeforeMove = structuredClone(game.boardState);
        const newGame = structuredClone(game);
    
        const activePlayer = (newGame.isWhiteTurn ? 2 : 1); 
        const requestingPlayer = (playerColor === 'white' ? 2 : 1);
    
        let moveResult = { success: false, error: "Unknown move type." };
    
        switch (move.type) {
            case 'place':
                moveResult = placeStone(newGame, move.to.x, move.to.y, activePlayer);
                break;
            case 'move':
                if (newGame.pendingChainCapture) {
                    if (!move.from || move.from.x !== newGame.pendingChainCapture.x || move.from.y !== newGame.pendingChainCapture.y) {
                        return { success: false, error: "Invalid chain capture." };
                    }
                    newGame.pendingChainCapture = null;
                }
                moveResult = movePiece(newGame, move.from.x, move.from.y, move.to.x, move.to.y, activePlayer);
                break;
            case 'shield':
                moveResult = turnToShield(newGame, move.at.x, move.at.y, activePlayer);
                break;
            case 'pass':
                if (newGame.mustShieldAt) return { success: false, error: "Must shield." };
                newGame.pendingChainCapture = null;
                moveResult = { success: true, updatedGame: newGame, isChain: false };
                break;
            case 'resign':
                moveResult = handleResign(newGame, requestingPlayer);
                break;
        }
    
        if (moveResult.success) {
            const updatedGame = moveResult.updatedGame;
    
            // Ko Rule
            if (['place', 'move', 'shield'].includes(move.type)) {
                if (isBoardStateEqual(updatedGame.boardState, game.previousBoardState)) {
                    return { success: false, error: "Ko rule violation." };
                }
            }
    
            updatedGame.score = calculateScore(updatedGame.boardState, updatedGame.blackPiecesLost || 0, updatedGame.whitePiecesLost || 0);
    
            if (move.type !== 'resign') {
                if (['place', 'move'].includes(move.type)) updatedGame.lastMove = move.to;
                else if (move.type === 'shield') updatedGame.lastMove = move.at;
                else updatedGame.lastMove = null;
    
                updateMoveList(updatedGame, move);
                updatedGame.previousBoardState = boardStateBeforeMove;
    
                if (!moveResult.isChain) {
                    updatedGame.isWhiteTurn = !game.isWhiteTurn;
                    updatedGame.turnCount = (updatedGame.turnCount || 0) + 1;
                    updatedGame.pendingChainCapture = null;
                    updatedGame.mustShieldAt = null;
                }
            }
    
            return { success: true, updatedGame: updatedGame };
        } else {
            return moveResult;
        }
    }
    
    function placeStone(game, x, y, player) {
        if (game.boardState[y][x] !== 0) return { success: false, error: "Occupied." };
        if (game.pendingChainCapture) return { success: false, error: "Finish chain." };
        if (game.mustShieldAt) return { success: false, error: "Must shield." };
    
        game.boardState[y][x] = player;
        
        if (!processCapturesAndSuicide(game, x, y, player)) {
            game.boardState[y][x] = 0;
            return { success: false, error: "Suicide." };
        }
        
        return { success: true, updatedGame: game, isChain: false };
    }
    
    function movePiece(game, fromX, fromY, toX, toY, player) {
        const piece = game.boardState[fromY][fromX];
        const enemyPlayer = (player === 1) ? 2 : 1;
        
        if (piece !== player && piece !== (player + 2)) return { success: false, error: "Not your piece." };
        if (game.mustShieldAt) return { success: false, error: "Must shield." };
    
        const destState = game.boardState[toY][toX];
        const dx = Math.abs(toX - fromX);
        const dy = Math.abs(toY - fromY);
    
        let jumpedPiece = null;
        let moveType = null;
    
        // Normal Stone Logic (Jump Only)
        if (piece === player) {
            if (((dx === 2 && dy === 0) || (dx === 0 && dy === 2)) && destState === 0) {
                const midX = fromX + (toX - fromX) / 2;
                const midY = fromY + (toY - fromY) / 2;
                const jumpedState = game.boardState[midY][midX];
    
                if (jumpedState === enemyPlayer) {
                    jumpedPiece = { x: midX, y: midY, state: jumpedState };
                    moveType = 'jump';
                } else {
                    return { success: false, error: "Invalid jump." };
                }
            } else {
                return { success: false, error: "Normal stones can only jump." };
            }
        } 
        // Shield Stone Logic (Move 1 step)
        else if (piece === player + 2) {
            if ((dx + dy === 1) && destState === 0) { 
                moveType = 'move';
            } else {
                return { success: false, error: "Shields move 1 step orthogonally." };
            }
        }
        
        // Execute Move
        const originalFrom = game.boardState[fromY][fromX];
        const originalTo = game.boardState[toY][toX];
        let originalJump = 0;
    
        game.boardState[fromY][fromX] = 0;
        if (jumpedPiece) {
            originalJump = game.boardState[jumpedPiece.y][jumpedPiece.x];
            game.boardState[jumpedPiece.y][jumpedPiece.x] = 0;
            if (jumpedPiece.state === 1) game.blackPiecesLost++;
            else game.whitePiecesLost++;
        }
        game.boardState[toY][toX] = piece; 
    
        if (!processCapturesAndSuicide(game, toX, toY, player)) {
            // Revert
            game.boardState[fromY][fromX] = originalFrom;
            game.boardState[toY][toX] = originalTo;
            if (jumpedPiece) {
                game.boardState[jumpedPiece.y][jumpedPiece.x] = originalJump;
                if (jumpedPiece.state === 1) game.blackPiecesLost--;
                else game.whitePiecesLost--;
            }
            return { success: false, error: "Suicide." };
        }
    
        let isChain = false;
        if (moveType === 'jump') {
            const newMoves = getValidMovesForGoPiece(toX, toY, game.boardState, piece);
            const chainJumps = newMoves.filter(m => m.type === 'jump');
            
            if (chainJumps.length > 0) {
                game.pendingChainCapture = { x: toX, y: toY };
                isChain = true;
            } else {
                game.pendingChainCapture = null;
                game.mustShieldAt = { x: toX, y: toY };
                isChain = true; 
            }
        }
        
        return { success: true, updatedGame: game, isChain: isChain };
    }
    
    function turnToShield(game, x, y, player) {
        if (game.mustShieldAt) {
            if (game.mustShieldAt.x !== x || game.mustShieldAt.y !== y) {
                return { success: false, error: "Wrong piece shielded." };
            }
            game.mustShieldAt = null;
        } else if (game.pendingChainCapture) {
             if (game.pendingChainCapture.x !== x || game.pendingChainCapture.y !== y) {
                return { success: false, error: "Wrong piece shielded." };
            }
            game.pendingChainCapture = null;
        } else {
            return { success: false, error: "Voluntary shielding disabled." };
        }
    
        if (game.boardState[y][x] !== player) return { success: false, error: "Not your piece." };
        
        game.boardState[y][x] = (player === 1) ? 3 : 4;
        processCaptures(game, x, y, player);
        
        return { success: true, updatedGame: game, isChain: false };
    }
    
    function handleResign(game, player) {
        game.gameOver = true;
        game.winner = (player === 1) ? 'white' : 'black';
        game.reason = "Resignation";
        return { success: true, updatedGame: game };
    }
    
    // --- Utils ---
    function getNeighbors(x, y, boardState) {
        const neighbors = [];
        const size = boardState.length;
        if (y > 0) neighbors.push({ x, y: y - 1 }); 
        if (y < size - 1) neighbors.push({ x, y: y + 1 }); 
        if (x > 0) neighbors.push({ x: x - 1, y }); 
        if (x < size - 1) neighbors.push({ x: x + 1, y }); 
        return neighbors;
    }
    
    function isValid(x, y, boardState) {
        return x >= 0 && x < boardState.length && y >= 0 && y < boardState.length;
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
        const isBlackTeam = (player === 1 || player === 3);
        let capturedStones = false;
        let capturedGroups = []; 
    
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
                        capturedGroups.push({ group: group.stones, isBlack: isCapturedBlack }); 
                        for (const stone of group.stones) {
                            game.boardState[stone.y][stone.x] = 0;
                            if (isCapturedBlack) game.blackPiecesLost++; else game.whitePiecesLost++;
                        }
                    }
                }
            }
        }
    
        const myGroup = findGroup(game.boardState, x, y);
        if (myGroup && myGroup.liberties.size === 0 && !capturedStones) {
            // Revert
            for (const captured of capturedGroups) {
                 const pieceType = captured.isBlack ? 1 : 2; 
                 for (const stone of captured.group) {
                     game.boardState[stone.y][stone.x] = pieceType;
                     if (captured.isBlack) game.blackPiecesLost--; else game.whitePiecesLost--;
                 }
            }
            return false;
        }
        return true;
    }
    
    function getValidMovesForGoPiece(x, y, boardState, piece) {
        const validMoves = [];
        const player = (piece === 1 || piece === 3) ? 1 : 2; 
        const enemyPlayer = (player === 1) ? 2 : 1;
    
        if (piece === player) {
            // Jump
            const jumps = [{ dx: 0, dy: -2 }, { dx: 0, dy: 2 }, { dx: -2, dy: 0 }, { dx: 2, dy: 0 }];
            for (const jump of jumps) {
                const landX = x + jump.dx;
                const landY = y + jump.dy;
                const midX = x + jump.dx / 2;
                const midY = y + jump.dy / 2;
    
                if (isValid(landX, landY, boardState) && boardState[landY][landX] === 0) {
                    if (isValid(midX, midY, boardState) && boardState[midY][midX] === enemyPlayer) {
                        validMoves.push({ x: landX, y: landY, type: 'jump' });
                    }
                }
            }
        } else if (piece === player + 2) {
            // Shield Move
            const potentialMoves = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
            for (const m of potentialMoves) {
                const moveX = x + m.dx;
                const moveY = y + m.dy;
                if (isValid(moveX, moveY, boardState) && boardState[moveY][moveX] === 0) {
                    validMoves.push({ x: moveX, y: moveY, type: 'move' });
                }
            }
        }
        return validMoves;
    }
    
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
                            } else if (state === 1 || state === 3) bordersBlack = true;
                            else if (state === 2 || state === 4) bordersWhite = true;
                        }
                    }
                    
                    if (bordersBlack && !bordersWhite) blackTerritory += region.length;
                    else if (!bordersBlack && bordersWhite) whiteTerritory += region.length;
                }
            }
        }
        return { black: blackTerritory, white: whiteTerritory };
    }
    
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
        return {
            black: blackStones + territory.black,
            white: whiteStones + territory.white,
            details: {
                black: { stones: blackStones, territory: territory.black, lost: blackPiecesLost },
                white: { stones: whiteStones, territory: territory.white, lost: whitePiecesLost }
            }
        };
    }
    
    function updateMoveList(game, move) {
        const turnNum = game.isWhiteTurn ? Math.floor(game.turnCount / 2) : Math.floor((game.turnCount -1) / 2) + 1;
        let notationString = "";
    
        switch (move.type) {
            case 'place': notationString = `P@${move.to.x},${move.to.y}`; break;
            case 'move': notationString = `M@${move.from.x},${move.from.y}>${move.to.x},${move.to.y}`; break;
            case 'shield': notationString = `S@${move.at.x},${move.at.y}`; break;
            case 'pass': notationString = `Pass`; break;
            case 'resign': notationString = `Resign`; break;
        }
        
        const isChainMove = (move.type === 'move' && move.to);
        
        if (!game.isWhiteTurn) {
            // White
            if (isChainMove && game.moveList.length > 0 && game.moveList[game.moveList.length - 1].startsWith(`${turnNum}.`) && !game.moveList[game.moveList.length - 1].includes(" ")) {
                game.moveList[game.moveList.length - 1] += `>${move.to.x},${move.to.y}`;
            } else {
                game.moveList.push(`${turnNum}. ${notationString}`);
            }
        } else {
            // Black
            if (isChainMove && game.moveList.length > 0 && game.moveList[game.moveList.length - 1].startsWith(`${turnNum}.`) && game.moveList[game.moveList.length - 1].includes(" ")) {
                game.moveList[game.moveList.length - 1] += `>${move.to.x},${move.to.y}`;
            } else {
                if (game.moveList.length > 0 && game.moveList[game.moveList.length -1].startsWith(`${turnNum}.`)) {
                    game.moveList[game.moveList.length - 1] += ` ${notationString}`;
                } else {
                    game.moveList.push(`${turnNum}... ${notationString}`);
                }
            }
        }
    }
    
    exports.calculateScore = calculateScore;
    exports.makeGoMove = makeGoMove;
    exports.getValidMoves = getValidMoves;
    
    })(typeof module === 'undefined' ? (this.goGameLogic = {}) : module.exports);