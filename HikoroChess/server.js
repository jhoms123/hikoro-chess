const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 16;

const pieceNotation = {
    lupa: "Lp", zur: "Zr", kota: "Kt", fin: "Fn", yoli: "Yl", pilut: "Pl",
    sult: "Sl", pawn: "P", cope: "Cp", chair: "Ch", jotu: "Jt", kor: "Kr",
    finor: "F+", greatshield: "GS", greathorsegeneral: "GH"
};

class Game {
    constructor() {
        this.boardState = this.getInitialBoard();
        this.currentPlayer = 'white';
        this.selectedPiece = null;
        this.greatHorseGeneralSecondMove = false;
        this.copeBonusMove = false;
    }

    getInitialBoard() {
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

    isPositionValid(x, y) {
        if (x < 0 || y < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return false;
        if ((x <= 1 && y <= 2) || (x >= 8 && y <= 2)) return false;
        if ((x <= 1 && y >= 13) || (x >= 8 && y >= 13)) return false;
        return true;
    }

    isProtected(targetPiece, targetX, targetY) {
        const protectingColor = targetPiece.color;
        
        // Pilut Protection from behind
        const pilutDir = protectingColor === 'white' ? -1 : 1;
        const potentialPilutY = targetY + pilutDir;
        if (this.isPositionValid(targetX, potentialPilutY)) {
            const protector = this.boardState[potentialPilutY][targetX];
            if (protector && protector.type === 'pilut' && protector.color === protectingColor) {
                return true;
            }
        }

        // Great Shield Protection (sides, back-diagonals, straight back)
        const gsDir = protectingColor === 'white' ? -1 : 1;
        const positionsToCheck = [
            { dx: 0, dy: gsDir },    // Straight behind
            { dx: -1, dy: gsDir },   // Back-diagonal left
            { dx: 1, dy: gsDir },    // Back-diagonal right
            { dx: -1, dy: 0 },       // Side left
            { dx: 1, dy: 0 }         // Side right
        ];
        
        for (let pos of positionsToCheck) {
            const protectorX = targetX + pos.dx;
            const protectorY = targetY + pos.dy;
            if (this.isPositionValid(protectorX, protectorY)) {
                const protector = this.boardState[protectorY][protectorX];
                if (protector && protector.type === 'greatshield' && protector.color === protectingColor) {
                    return true;
                }
            }
        }
        return false;
    }

    getValidMovesForPiece(piece, x, y) {
        if (!piece || piece.color !== this.currentPlayer) return [];
        
        const moves = [];

        const addMove = (toX, toY) => {
            if (!this.isPositionValid(toX, toY)) return;
            const target = this.boardState[toY][toX];
            if (target === null) {
                moves.push({ x: toX, y: toY, isAttack: false });
            } else if (target.color !== piece.color) {
                if (!this.isProtected(target, toX, toY)) {
                    moves.push({ x: toX, y: toY, isAttack: true });
                }
            }
        };

        const addNonCaptureMove = (toX, toY) => {
            if (!this.isPositionValid(toX, toY)) return;
            const target = this.boardState[toY][toX];
            if (target === null) {
                moves.push({ x: toX, y: toY, isAttack: false });
            }
        };

        const generateLineMoves = (dx, dy) => {
            let cx = x + dx, cy = y + dy;
            while (this.isPositionValid(cx, cy)) {
                const target = this.boardState[cy][cx];
                if (target === null) {
                    moves.push({ x: cx, y: cy, isAttack: false });
                } else {
                    if (target.color !== piece.color) {
                        if (!this.isProtected(target, cx, cy)) {
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
            while (this.isPositionValid(cx, cy) && this.boardState[cy][cx] === null) {
                moves.push({ x: cx, y: cy, isAttack: false });
                cx += dx; cy += dy;
            }
        };

        let moveList = [];
        let isSpecialMoveTurn = false;

        // Check for special move states
        if (this.greatHorseGeneralSecondMove) {
            if (piece.type === 'greathorsegeneral') {
                isSpecialMoveTurn = true;
            } else {
                return []; // Only the GHG can move on its second turn.
            }
        } else if (this.copeBonusMove) {
            if (piece.type === 'cope') {
                isSpecialMoveTurn = true;
            } else {
                return []; // Only the Cope can move on its bonus turn.
            }
        }

        switch (piece.type) {
            case 'lupa':
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        addMove(x + dx, y + dy);
                    }
                }
                break;
            case 'zur':
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        generateLineMoves(dx, dy);
                    }
                }
                break;
            case 'kota':
                generateLineMoves(1, 0); generateLineMoves(-1, 0);
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue;
                        addMove(x + dx, y + dy);
                    }
                }
                break;
            case 'fin':
                generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1);
                addNonCaptureMove(x + 1, y);
                addNonCaptureMove(x - 1, y);
                break;
            case 'yoli':
                [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); }));
                addMove(x + 1, y); addMove(x - 1, y); addMove(x, y + 1); addMove(x, y - 1); break;
            case 'pilut':
                const dir = piece.color === 'white' ? 1 : -1;
                if (this.isPositionValid(x, y + dir) && !this.boardState[y + dir][x]) {
                    moves.push({ x: x, y: y + dir, isAttack: false });
                    if (this.isPositionValid(x, y + 2 * dir) && !this.boardState[y + 2 * dir][x]) {
                        moves.push({ x: x, y: y + 2 * dir, isAttack: false });
                    }
                }
                break;
            case 'sult':
                const fwd = piece.color === 'white' ? 1 : -1;
                addMove(x - 1, y + fwd); addMove(x + 1, y + fwd); addMove(x, y - fwd);
                addMove(x, y + fwd); addMove(x, y + 2 * fwd); break;
            case 'pawn':
                addMove(x, y + 1); addMove(x, y - 1); addMove(x + 1, y); addMove(x - 1, y);
                addMove(x + 2, y + 2); addMove(x - 2, y + 2); addMove(x + 2, y - 2); addMove(x - 2, y - 2); break;
            case 'cope':
                const fwdDir = piece.color === 'white' ? 1 : -1;
                if (this.copeBonusMove) {
                    addNonCaptureMove(x + 2, y + 2 * fwdDir);
                    addNonCaptureMove(x - 2, y + 2 * fwdDir);
                    addNonCaptureMove(x, y + 1 * fwdDir);
                    addNonCaptureMove(x, y + 2 * fwdDir);
                    addNonCaptureMove(x, y - 1 * fwdDir);
                    addNonCaptureMove(x, y - 2 * fwdDir);
                } else {
                    addMove(x + 2, y + 2 * fwdDir); addMove(x - 2, y + 2 * fwdDir);
                    addMove(x, y + 1 * fwdDir); addMove(x, y + 2 * fwdDir);
                    addMove(x, y - 1 * fwdDir); addMove(x, y - 2 * fwdDir);
                }
                break;
            case 'chair':
                generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1);
                generateLineMoves(0, 1); generateLineMoves(0, -1); break;
            case 'jotu':
                generateLineMoves(1, 0); generateLineMoves(-1, 0);
                if (piece.color === 'white') { generateLineMoves(0, 1); addMove(x, y - 1); }
                else { generateLineMoves(0, -1); addMove(x, y + 1); } break;
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
            case 'greathorsegeneral':
                const ghgDir = piece.color === 'white' ? 1 : -1;
                if (this.greatHorseGeneralSecondMove) {
                    // Second move: non-capture only
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            if (dx === 0 && dy === 0) continue;
                            addNonCaptureMove(x + dx, y + dy);
                        }
                    }
                    [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addNonCaptureMove(x + dx, y + dy); }));
                    generateNonCaptureLineMoves(-1, ghgDir);
                    generateNonCaptureLineMoves(1, ghgDir);
                    generateNonCaptureLineMoves(0, -ghgDir);
                } else {
                    // First move: captures allowed
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            if (dx === 0 && dy === 0) continue;
                            addMove(x + dx, y + dy);
                        }
                    }
                    [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); }));
                    generateLineMoves(-1, ghgDir);
                    generateLineMoves(1, ghgDir);
                    generateLineMoves(0, -ghgDir);
                }
                break;
        }
        return moves;
    }

    makeMove(fromX, fromY, toX, toY) {
        const piece = this.boardState[fromY][fromX];
        if (!piece) return false;

        const moves = this.getValidMovesForPiece(piece, fromX, fromY);
        const validMove = moves.find(m => m.x === toX && m.y === toY);

        if (validMove) {
            // Check for special move conditions and update game state
            if (piece.type === 'greathorsegeneral') {
                if (validMove.isAttack) {
                    this.greatHorseGeneralSecondMove = false; // Capture ends the turn
                } else {
                    this.greatHorseGeneralSecondMove = true; // Non-capture grants a second move
                }
            } else if (piece.type === 'cope' && validMove.isAttack) {
                this.copeBonusMove = true;
            } else {
                this.greatHorseGeneralSecondMove = false;
                this.copeBonusMove = false;
                this.switchPlayer();
            }
            
            this.boardState[toY][toX] = piece;
            this.boardState[fromY][fromX] = null;
            return true;
        }

        return false;
    }
    
    switchPlayer() {
        if (!this.greatHorseGeneralSecondMove && !this.copeBonusMove) {
            this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        }
        // Special moves don't change the player
        if(this.greatHorseGeneralSecondMove || this.copeBonusMove) {
            // Need a way to end the turn after the bonus move.
            // This is likely handled by your UI logic after the second move is made.
        }
    }
}

module.exports = {
    Game,
    pieceNotation,
    BOARD_WIDTH,
    BOARD_HEIGHT
};
