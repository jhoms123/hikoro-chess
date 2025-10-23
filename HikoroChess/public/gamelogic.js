
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 16;


const pieceNotation = {
    lupa: "K", prince: "KP", 
    zur: "D", kota: "H", fin: "Oc", yoli: "B", pilut: "S",
    sult: "Cr", pawn: "F", cope: "Na", chair: "Du", jotu: "Sh", 
    kor: "J", finor: "Tc", greatshield: "Ss", greathorsegeneral: "Ac",
    neptune: "Np", mermaid: "Mm", cthulhu: "Ct"
};

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
        { y: 2, x: 5, type: 'pawn' }, { y: 2, x: 7, type: 'chair' },
        
        
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


