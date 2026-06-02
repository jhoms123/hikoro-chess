(function(exports) {

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 16;


const pieceNotation = {
    lupa: "K", prince: "KP",
    zur: "D", kota: "H", fin: "Oc", yoli: "B", pilut: "S",
    sult: "Cr", pawn: "F", cope: "Na", chair: "Du", jotu: "Sh",
    kor: "J", finor: "Tc", greatshield: "Ss", greathorsegeneral: "Ac",
    neptune: "Np", mermaid: "Mm", cthulhu: "Ct"
};

const notationToPieceType = {};
    for (const key in pieceNotation) {
        notationToPieceType[pieceNotation[key]] = key;
    }

const whitePalace = { minY: 0, maxY: 1, minX: 3, maxX: 6 };
const blackPalace = { minY: 14, maxY: 15, minX: 3, maxX: 6 };

function isKingRestricted(color, boardState) {

    for (let y = 0; y < BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            const piece = boardState[y][x];
            if (piece && piece.type === 'prince' && piece.color === color) {
                return true;
            }
        }
    }
    return false;
}

function getInitialBoard() {
    let boardState = Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null));
    const setup = [

        { y: 5, x: 0, type: 'pilut' }, { y: 5, x: 1, type: 'pilut' },
        { y: 5, x: 2, type: 'sult' }, { y: 5, x: 3, type: 'pilut' },
        { y: 5, x: 4, type: 'pilut' }, { y: 5, x: 5, type: 'pilut' },
        { y: 5, x: 6, type: 'pilut' }, { y: 5, x: 7, type: 'sult' },
        { y: 5, x: 8, type: 'pilut' }, { y: 5, x: 9, type: 'pilut' },

        { y: 4, x: 0, type: 'cope' }, { y: 4, x: 1, type: 'zur' },
        { y: 4, x: 2, type: 'kor' }, { y: 4, x: 3, type: 'fin' },
        { y: 4, x: 4, type: 'yoli' }, { y: 4, x: 5, type: 'yoli' },
        { y: 4, x: 6, type: 'fin' }, { y: 4, x: 7, type: 'kor' },
        { y: 4, x: 8, type: 'zur' }, { y: 4, x: 9, type: 'cope' },

        { y: 3, x: 1, type: 'cope' }, { y: 3, x: 2, type: 'jotu' },
        { y: 3, x: 3, type: 'neptune' }, { y: 3, x: 6, type: 'greathorsegeneral' },
        { y: 3, x: 7, type: 'jotu' }, { y: 3, x: 8, type: 'cope' },

        { y: 2, x: 3, type: 'chair' }, { y: 2, x: 4, type: 'pawn' },
        { y: 2, x: 5, type: 'pawn' }, { y: 2, x: 6, type: 'chair' },


		{ y: 1, x: 2, type: 'sult' }, { y: 1, x: 3, type: 'kota' },
        { y: 1, x: 6, type: 'kota' }, { y: 1, x: 7, type: 'sult' },


        { y: 0, x: 2, type: 'pawn' },
        { y: 0, x: 4, type: 'lupa' },
		{ y: 0, x: 5, type: 'prince' },
        { y: 0, x: 7, type: 'pawn' },

    ];
    setup.forEach(p => {

        if (isPositionValid(p.x, p.y)) {
            boardState[p.y][p.x] = { type: p.type, color: 'white' };
        }
        if (isPositionValid(p.x, BOARD_HEIGHT - 1 - p.y)) {
             boardState[BOARD_HEIGHT - 1 - p.y][p.x] = { type: p.type, color: 'black' };
        }
    });
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

// --- Note: This internal function remains unchanged ---
function getValidMovesForPiece(piece, x, y, boardState, bonusMoveActive = false) {
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

		if (piece.type === 'lupa' && isKingRestricted(color, boardState)) {
            const palace = color === 'white' ? whitePalace : blackPalace;
            if (toX < palace.minX || toX > palace.maxX || toY < palace.minY || toY > palace.maxY) {
                return;
            }
        }
        if (!isPositionValid(toX, toY)) return;
        if (boardState[toY][toX] === null) {
            moves.push({ x: toX, y: toY, isAttack: false });
        }
    };

    const generateJotuJumpMoves = (dx, dy) => {
        let cx = x + dx;
        let cy = y + dy;
        let pathHasEnemy = false;

        let checkX = cx, checkY = cy;
        while(isPositionValid(checkX, checkY)) {
            const checkTarget = boardState[checkY][checkX];
            if (checkTarget && checkTarget.color !== piece.color) {
                pathHasEnemy = true;
                break;
            }
            checkX += dx; checkY += dy;
        }

        if (!pathHasEnemy) {
            while (isPositionValid(cx, cy)) {
                const target = boardState[cy][cx];
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
            const target = boardState[cy][cx];
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
        case 'pilut': { const dir = piece.color === 'white' ? 1 : -1; if (isPositionValid(x, y + dir) && !boardState[y + dir][x]) { moves.push({ x: x, y: y + dir, isAttack: false }); if (isPositionValid(x, y + 2 * dir) && !boardState[y + 2 * dir][x]) { moves.push({ x: x, y: y + 2 * dir, isAttack: false }); } } break; }
        case 'sult': { const fwd = piece.color === 'white' ? 1 : -1; addMove(x - 1, y + fwd); addMove(x + 1, y + fwd); addMove(x, y - fwd); addMove(x, y + fwd); addMove(x, y + 2 * fwd); break; }
        case 'pawn': addMove(x, y + 1); addMove(x, y - 1); addMove(x + 1, y); addMove(x - 1, y); addMove(x + 2, y + 2); addMove(x - 2, y + 2); addMove(x + 2, y - 2); addMove(x - 2, y - 2); break;
        case 'cope': { const fwdDir = piece.color === 'white' ? 1 : -1; const generateCopeMoves = (moveFunc) => { moveFunc(x + 2, y + 2 * fwdDir); moveFunc(x - 2, y + 2 * fwdDir); moveFunc(x, y + 1 * fwdDir); moveFunc(x, y + 2 * fwdDir); moveFunc(x, y - 1 * fwdDir); moveFunc(x, y - 2 * fwdDir); }; if (bonusMoveActive) { generateCopeMoves(addNonCaptureMove); } else { generateCopeMoves(addMove); } break; }
        case 'chair': generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1); generateLineMoves(0, 1); generateLineMoves(0, -1); break;
        case 'jotu':
            generateJotuJumpMoves(1, 0);
            generateJotuJumpMoves(-1, 0);
            if (piece.color === 'white') {
                generateJotuJumpMoves(0, 1);
                addMove(x, y - 1);
            }
            else {
                generateJotuJumpMoves(0, -1);
                addMove(x, y + 1);
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
        case 'neptune': {
            const fwdDir = piece.color === 'white' ? 1 : -1;
            const directions = [
                {dx: 1, dy: fwdDir}, {dx: -1, dy: fwdDir}, {dx: 0, dy: fwdDir}, {dx: 0, dy: -fwdDir}
            ];
            directions.forEach(({dx, dy}) => {
                let cx = x + dx; let cy = y + dy; let screenFound = false;
                while (isPositionValid(cx, cy)) {
                    const target = boardState[cy][cx];
                    if (!screenFound) { if (target !== null) { screenFound = true; } }
                    else {
                        if (target === null) { moves.push({ x: cx, y: cy, isAttack: false }); }
                        else { if(target.color !== piece.color && !isProtected(target, cx, cy, boardState)) { moves.push({ x: cx, y: cy, isAttack: true }); } break; }
                    }
                    cx += dx; cy += dy;
                }
            });
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); }
            addMove(x + 2, y + 2 * fwdDir); addMove(x - 2, y + 2 * fwdDir);
            addMove(x, y + 1 * fwdDir); addMove(x, y + 2 * fwdDir);
            addMove(x, y - 1 * fwdDir); addMove(x, y - 2 * fwdDir);
            break;
        }
        case 'mermaid': {
            for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
                if (dx === 0 && dy === 0) continue;
                addMove(x + dx, y + dy);
            }
            break;
        }
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

// --- NEW WRAPPER FUNCTIONS ---

/**
 * Public-facing function for the server to get valid moves.
 * data: { square: { x, y } }
 */
exports.getValidMoves = function(game, data) {
    if (!game || !data || !data.square) return [];

    const { x, y } = data.square;
    // Safety check for board dimensions
    if (y < 0 || y >= game.boardState.length || x < 0 || x >= game.boardState[0].length) {
        console.error("getValidMoves: Invalid coordinates", data.square);
        return [];
    }
    const piece = game.boardState[y][x];
    if (!piece) return [];

    let bonusMoveActive = false;
    if (game.bonusMoveInfo) {
        if (x !== game.bonusMoveInfo.pieceX || y !== game.bonusMoveInfo.pieceY) {
            return []; // Not the bonus piece
        }
        bonusMoveActive = true;
    }

    return getValidMovesForPiece(piece, x, y, game.boardState, bonusMoveActive);
}

/**
 * Public-facing function for the server to make a move.
 * move: { type: 'board', from, to } or { type: 'drop', piece, to }
 */
exports.makeMove = function(game, move, playerColor) {
    // Deep clone the game state to prevent mutation issues
    // Note: JSON stringify/parse is a simple way, but can be slow for large states or complex objects.
    // Consider a dedicated deep cloning library if performance becomes an issue.
    const newGame = JSON.parse(JSON.stringify(game));

    if (move.type === 'board') {
        const { from, to } = move;

        // --- Input Validation ---
        if (!from || from.x === undefined || from.y === undefined || !to || to.x === undefined || to.y === undefined) {
             return { success: false, error: "Missing or invalid move coordinates." };
        }
        if (from.y < 0 || from.y >= newGame.boardState.length || from.x < 0 || from.x >= newGame.boardState[0].length) {
             return { success: false, error: "Invalid 'from' coordinates." };
        }
        // --- End Validation ---

        const piece = newGame.boardState[from.y][from.x];

        if (!piece) {
            return { success: false, error: "No piece at the 'from' square." };
        }
        if (piece.color !== playerColor) {
            return { success: false, error: "Cannot move opponent's piece." };
        }

        let bonusMoveActive = false;
        if (newGame.bonusMoveInfo) {
             if (from.x !== newGame.bonusMoveInfo.pieceX || from.y !== newGame.bonusMoveInfo.pieceY) {
                 return { success: false, error: "Must complete bonus move with the designated piece." };
             }
             bonusMoveActive = true;
         }

        // Get valid moves *from the internal function*
        const validMoves = getValidMovesForPiece(piece, from.x, from.y, newGame.boardState, bonusMoveActive);
        const isValidMove = validMoves.some(m => m.x === to.x && m.y === to.y);

        if (!isValidMove) {
            console.warn(`Invalid move attempt: ${playerColor} ${piece.type} from ${from.x},${from.y} to ${to.x},${to.y}. Bonus: ${bonusMoveActive}`);
            // console.log("Calculated valid moves:", validMoves); // Uncomment for debugging
            return { success: false, error: "Invalid move target." };
        }
        // --- End Validation ---

        const targetPiece = newGame.boardState[to.y][to.x];
        const wasCapture = targetPiece !== null;
        const notationString = generateNotation(piece, to, wasCapture, false);

        // --- Jotu Capture Logic ---
        if (piece.type === 'jotu') {
             const dx = Math.sign(to.x - from.x);
             const dy = Math.sign(to.y - from.y);
             // Check if it was a jump move (distance > 1)
             if (Math.abs(to.x - from.x) > 1 || Math.abs(to.y - from.y) > 1) {
                 let cx = from.x + dx;
                 let cy = from.y + dy;
                 // Iterate over squares between from and to
                 while (cx !== to.x || cy !== to.y) {
                     if (isPositionValid(cx, cy)) { // Ensure intermediate square is valid
                         const intermediatePiece = newGame.boardState[cy][cx];
                         if (intermediatePiece && intermediatePiece.color === playerColor) {
                             // Check if piece should go to hand
                             if (intermediatePiece.type !== 'greathorsegeneral' && intermediatePiece.type !== 'cthulhu') {
                                 // Add piece type to the correct hand (server doesn't need color here, just type)
                                 let pieceForHand = { type: intermediatePiece.type };
                                 const capturedArray = playerColor === 'white' ? newGame.whiteCaptured : newGame.blackCaptured;
                                 if (capturedArray.length < 6) {
                                     capturedArray.push(pieceForHand);
                                 } else {
                                     console.log("Hand is full, cannot add jumped piece:", intermediatePiece.type);
                                 }
                             }
                             // Remove the jumped piece from the board
                             newGame.boardState[cy][cx] = null;
                         }
                     }
                     cx += dx;
                     cy += dy;
                 }
             }
        }
        // --- End Jotu Logic ---

        // --- Standard Capture Logic ---
        if (targetPiece !== null) {
            if(targetPiece.type === 'prince') {
                if (targetPiece.color === 'white') newGame.whitePrinceOnBoard = false;
                else newGame.blackPrinceOnBoard = false;
                console.log(`${targetPiece.color} Prince captured!`);
            } else {
                const indestructiblePieces = ['greathorsegeneral', 'cthulhu', 'mermaid'];
                if (targetPiece.type === 'neptune') {
                    // Neptune returns as Mermaid to the *original owner's* hand
                    const losingPlayerColor = targetPiece.color;
                    const pieceForHand = { type: 'mermaid' }; // Server only tracks type in hand
                    const capturedArray = losingPlayerColor === 'white' ? newGame.whiteCaptured : newGame.blackCaptured; // Add to owner's hand
                    if (capturedArray.length < 6) capturedArray.push(pieceForHand);
                 }
                 // Add captured piece to *capturing player's* hand (if applicable)
                 else if (!indestructiblePieces.includes(targetPiece.type) && targetPiece.type !== 'lupa') {
                     let pieceForHand = { type: targetPiece.type }; // Server only tracks type
                     const capturedArray = playerColor === 'white' ? newGame.whiteCaptured : newGame.blackCaptured; // Add to capturer's hand
                     if (capturedArray.length < 6) {
                         capturedArray.push(pieceForHand);
                     } else {
                          console.log("Hand is full, cannot add captured piece:", targetPiece.type);
                     }
                 }
                 // If Lupa or indestructible, piece is just removed (no hand add)
            }
        }
        // --- End Standard Capture Logic ---

        // --- Execute Move ---
        newGame.boardState[to.y][to.x] = piece; // Place the piece (object reference)
        newGame.boardState[from.y][from.x] = null; // Clear the original square
        // --- End Execute Move ---

        // --- Handle Promotion ---
        // handlePromotion modifies the piece object *at the target square*
        handlePromotion(newGame.boardState[to.y][to.x], to.y, wasCapture);
        // --- End Handle Promotion ---

        // --- Update Game State ---
        updateMoveList(newGame, notationString);
        newGame.lastMove = { from, to };

        checkForWinner(newGame); // Check win conditions
        newGame.turnCount++; // Increment turn count (might be adjusted by bonus logic)

        // --- Bonus Move Logic ---
        if (bonusMoveActive) {
            // This was the second (bonus) move
            newGame.bonusMoveInfo = null; // Clear bonus flag
            newGame.isWhiteTurn = !newGame.isWhiteTurn; // Switch turn AFTER bonus
        } else if (['greathorsegeneral', 'cthulhu'].includes(piece.type) && !wasCapture) {
            // First move, non-capture GH/Ct triggers bonus
            newGame.bonusMoveInfo = { pieceX: to.x, pieceY: to.y };
            // Turn does NOT change yet
            newGame.turnCount--; // Decrement turn count as bonus doesn't count as a full turn progression yet
        } else if (piece.type === 'cope' && wasCapture) {
            // First move, capture Cope triggers bonus
            newGame.bonusMoveInfo = { pieceX: to.x, pieceY: to.y };
            // Turn does NOT change yet
            newGame.turnCount--; // Decrement turn count
        } else {
            // Normal move, no bonus triggered
            newGame.bonusMoveInfo = null;
            newGame.isWhiteTurn = !newGame.isWhiteTurn; // Switch turn
        }
        // --- End Bonus Move Logic ---
        // --- End Update Game State ---

        return { success: true, updatedGame: newGame };

    } 
	
	else if (move.type === 'resign') { // <-- ADD THIS ENTIRE BLOCK
        newGame.gameOver = true;
        newGame.winner = (playerColor === 'white') ? 'black' : 'white';
        newGame.reason = "Resignation";
        return { success: true, updatedGame: newGame };

    }
	
	else if (move.type === 'drop') {
        const { piece, to } = move; // piece only contains { type }

        // --- Input Validation ---
         if (!piece || !piece.type || !to || to.x === undefined || to.y === undefined) {
             return { success: false, error: "Missing or invalid drop data." };
         }
        if (piece.type === 'lupa' || piece.type === 'prince') {
		    return { success: false, error: "Cannot drop royalty." };
		}
        if (to.y < 0 || to.y >= newGame.boardState.length || to.x < 0 || to.x >= newGame.boardState[0].length || !isPositionValid(to.x, to.y)) {
             return { success: false, error: "Invalid drop coordinates." };
        }
		if (newGame.boardState[to.y][to.x] !== null) {
		    return { success: false, error: "Cannot drop onto an occupied square." };
		}
        // --- End Validation ---

        // Check if piece is in hand
        const capturedArray = playerColor === 'white' ? newGame.whiteCaptured : newGame.blackCaptured;
		const pieceIndex = capturedArray.findIndex(p => p.type === piece.type);

        if (pieceIndex > -1) {
            // --- Execute Drop ---
            const droppedPiece = { type: piece.type, color: playerColor }; // Create the full piece object
            const notationString = generateNotation(droppedPiece, to, false, true);

			newGame.boardState[to.y][to.x] = droppedPiece; // Place on board
			capturedArray.splice(pieceIndex, 1); // Remove from hand
            // --- End Execute Drop ---

            // --- Update Game State ---
            updateMoveList(newGame, notationString);
            newGame.lastMove = { from: null, to }; // Mark drop
            newGame.bonusMoveInfo = null; // Drops never trigger bonus
            newGame.isWhiteTurn = !newGame.isWhiteTurn; // Switch turn
            newGame.turnCount++;
            // --- End Update Game State ---

			return { success: true, updatedGame: newGame };
		} else {
		    return { success: false, error: "Piece not found in hand." };
		}
    }

    // Fallback if move type wasn't 'board' or 'drop'
    return { success: false, error: "Unknown move type." };
}


// --- INTERNAL HELPER FUNCTIONS (Not Exported, but used by makeMove) ---

function handlePromotion(piece, y, wasCapture) {
    // Safety check
    if (!piece) return;

    const color = piece.color;
    const originalType = piece.type; // Remember original type for logging

    // Prince never promotes
    if (piece.type === 'prince') return;

    // Specific piece promotions based on capture
    if (piece.type === 'greathorsegeneral' && wasCapture) {
        piece.type = 'cthulhu';
    } else if (piece.type === 'mermaid' && wasCapture) {
        piece.type = 'neptune';
    } else if (piece.type === 'fin' && wasCapture) {
        piece.type = 'finor';
    } else {
        // Zone-based promotions for "pawn-like" pieces
        const promotablePawns = ['sult', 'pawn', 'pilut'];
        if (promotablePawns.includes(piece.type)) {
            // Determine if the 'to' square 'y' is in the promotion zone for the piece's color
            const inPromotionZone = (color === 'white' && y > 8) || (color === 'black' && y < 7);
            if (inPromotionZone) {
                if (piece.type === 'pilut') {
                    piece.type = 'greatshield';
                } else { // Sult and Pawn promote to Chair
                    piece.type = 'chair';
                }
            }
        }
    }

    // Optional: Log if a promotion occurred
    if (piece.type !== originalType) {
        console.log(`Promotion: ${color} ${originalType} -> ${piece.type} at y=${y}`);
    }
}


function checkForWinner(game) {
    if (game.gameOver) return; // Don't check if already over

    // 1. Sanctuary Check
    const sanctuarySquares = [
        {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
        {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
    ];

    for (const square of sanctuarySquares) {
        const pieceOnSquare = game.boardState[square.y][square.x];
        if (pieceOnSquare && (pieceOnSquare.type === 'lupa' || pieceOnSquare.type === 'prince')) {
            game.gameOver = true;
            game.winner = pieceOnSquare.color;
            game.reason = "Sanctuary";
            console.log(`${game.winner} wins by Sanctuary! Piece: ${pieceOnSquare.type}`);
            return; // Game over, no need to check further
        }
    }

    // 2. Royalty Capture Check
    // Recalculate Lupa presence on the board (more robust than relying on flags)
    let whiteLupaOnBoard = false;
    let blackLupaOnBoard = false;
    for (let y = 0; y < BOARD_HEIGHT; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            const piece = game.boardState[y][x];
            if (piece && piece.type === 'lupa') {
                if (piece.color === 'white') whiteLupaOnBoard = true;
                else blackLupaOnBoard = true;
            }
        }
    }

    // Check win condition using board Lupa presence and Prince capture status
    // Ensure turnCount > 0 to prevent win on initial setup (though unlikely)
    if (!blackLupaOnBoard && !game.blackPrinceOnBoard && game.turnCount > 0) {
        game.gameOver = true;
        game.winner = 'white';
        game.reason = "Royalty Capture";
        console.log("White wins by Royalty Capture!");
    } else if (!whiteLupaOnBoard && !game.whitePrinceOnBoard && game.turnCount > 0) {
        game.gameOver = true;
        game.winner = 'black';
        game.reason = "Royalty Capture";
        console.log("Black wins by Royalty Capture!");
    }
}


function toAlgebraic(x, y) {
    const file = String.fromCharCode('a'.charCodeAt(0) + x);
    const rank = y + 1; // Rank 1 is at y=0
    return `${file}${rank}`;
}

function generateNotation(piece, to, wasCapture, wasDrop) {
    if (!piece || !to) return '?'; // Basic validation
    const pieceAbbr = pieceNotation[piece.type] || '?';
    const coord = toAlgebraic(to.x, to.y);

    if (wasDrop) {
        return `${pieceAbbr}*${coord}`;
    }
    if (wasCapture) {
        return `${pieceAbbr}x${coord}`;
    }
    // Standard move
    return `${pieceAbbr}${coord}`;
}

function updateMoveList(game, notationString) {
    // Ensure moveList exists
    if (!game.moveList) {
        game.moveList = [];
    }
    // Calculate turn number based on count *before* the current move was fully processed
    const turnNum = Math.floor(game.turnCount / 2) + 1;

    // isWhiteTurn reflects the state *before* the turn switch in makeMove
    if (game.isWhiteTurn) {
        // White's move: Start a new entry
        game.moveList.push(`${turnNum}. ${notationString}`);
    } else {
        // Black's move: Append to the last entry if it exists
        if (game.moveList.length > 0) {
            game.moveList[game.moveList.length - 1] += ` ${notationString}`;
        } else {
            // Should not happen if white always moves first, but handle defensively
            game.moveList.push(`${turnNum}... ${notationString}`);
        }
    }
}

// --- ORIGINAL EXPORTS (Keep them) ---
exports.getInitialBoard = getInitialBoard;
exports.getValidMovesForPiece = getValidMovesForPiece; // Keep for bot/internal use
exports.isPositionValid = isPositionValid;
exports.pieceNotation = pieceNotation;
exports.notationToPieceType = notationToPieceType;
exports.isKingRestricted = isKingRestricted;
exports.isProtected = isProtected;
exports.BOARD_WIDTH = BOARD_WIDTH;
exports.BOARD_HEIGHT = BOARD_HEIGHT;
exports.whitePalace = whitePalace;
exports.blackPalace = blackPalace;


})(typeof module === 'undefined' ? (this.gameLogic = {}) : module.exports);