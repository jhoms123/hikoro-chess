const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 16;

const pieceNotation = {
    lupa: "Lp", zur: "Zr", kota: "Kt", fin: "Fn", yoli: "Yl", pilut: "Pl",
    sult: "Sl", pawn: "P", cope: "Cp", chair: "Ch", jotu: "Jt", kor: "Kr",
    finor: "F+", greatshield: "GS", greathorsegeneral: "GH"
};

function getInitialBoard() {
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

function isPositionValid(x, y) {
    if (x < 0 || y < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT) return false;
    if ((x <= 1 && y <= 2) || (x >= 8 && y <= 2)) return false;
    if ((x <= 1 && y >= 13) || (x >= 8 && y >= 13)) return false;
    return true;
}

function getValidMovesForPiece(piece, x, y, boardState) {
    if (!piece) return [];
    const moves = [];
    
    const addMove = (toX, toY) => {
        if (!isPositionValid(toX, toY)) return;
        const target = boardState[toY][toX];
        if (target === null) moves.push({ x: toX, y: toY, isAttack: false });
        else if (target.color !== piece.color) moves.push({ x: toX, y: toY, isAttack: true });
    };

    const generateLineMoves = (dx, dy) => {
        let cx = x + dx, cy = y + dy;
        while (isPositionValid(cx, cy)) {
            const target = boardState[cy][cx];
            if (target === null) moves.push({ x: cx, y: cy, isAttack: false });
            else {
                if (target.color !== piece.color) moves.push({ x: cx, y: cy, isAttack: true });
                break;
            }
            cx += dx; cy += dy;
        }
    };

    // This switch statement is the same as in your original JS file
    switch (piece.type) {
        case 'lupa':
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy);
            } break;
        case 'zur':
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue; generateLineMoves(dx, dy);
            } break;
        case 'kota':
            generateLineMoves(1, 0); generateLineMoves(-1, 0);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy);
            } break;
        case 'fin':
            generateLineMoves(1, 1); generateLineMoves(-1, 1); generateLineMoves(1, -1); generateLineMoves(-1, -1);
            if (isPositionValid(x + 1, y) && !boardState[y][x + 1]) moves.push({x: x + 1, y: y, isAttack: false});
            if (isPositionValid(x - 1, y) && !boardState[y][x - 1]) moves.push({x: x - 1, y: y, isAttack: false});
            break;
        case 'yoli':
             [-2, -1, 1, 2].forEach(dx => [-2, -1, 1, 2].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); }));
            addMove(x + 1, y); addMove(x - 1, y); addMove(x, y + 1); addMove(x, y - 1); break;
        case 'pilut':
            const dir = piece.color === 'white' ? 1 : -1;
            if (isPositionValid(x, y + dir) && !boardState[y + dir][x]) {
                moves.push({ x: x, y: y + dir, isAttack: false });
                if (isPositionValid(x, y + 2 * dir) && !boardState[y + 2 * dir][x]) {
                    moves.push({ x: x, y: y + 2 * dir, isAttack: false });
                }
            } break;
        case 'sult':
            const fwd = piece.color === 'white' ? 1 : -1;
            addMove(x - 1, y + fwd); addMove(x + 1, y + fwd); addMove(x, y - fwd);
            addMove(x, y + fwd); addMove(x, y + 2 * fwd); break;
        case 'pawn':
            addMove(x, y + 1); addMove(x, y - 1); addMove(x + 1, y); addMove(x - 1, y);
            addMove(x + 2, y + 2); addMove(x - 2, y + 2); addMove(x + 2, y - 2); addMove(x - 2, y - 2); break;
        case 'cope':
            const fwdDir = piece.color === 'white' ? 1 : -1;
            addMove(x + 2, y + 2 * fwdDir); addMove(x - 2, y + 2 * fwdDir);
            addMove(x, y + 1 * fwdDir); addMove(x, y + 2 * fwdDir);
            addMove(x, y - 1 * fwdDir); addMove(x, y - 2 * fwdDir); break;
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
            [{dx:0,dy:gsDir},{dx:-1,dy:gsDir},{dx:1,dy:gsDir},{dx:0,dy:-gsDir}].forEach(m => {
                if (isPositionValid(x + m.dx, y + m.dy) && !boardState[y + m.dy][x + m.dx]) moves.push({x: x + m.dx, y: y + m.dy, isAttack: false});
            }); break;
        case 'greathorsegeneral':
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (dx === 0 && dy === 0) continue; addMove(x + dx, y + dy); }
            [-3, -1, 1, 3].forEach(dx => [-3, -1, 1, 3].forEach(dy => { if (Math.abs(dx) !== Math.abs(dy)) addMove(x + dx, y + dy); }));
            const ghgDir = piece.color === 'white' ? 1 : -1;
            generateLineMoves(-1, ghgDir); generateLineMoves(1, ghgDir); generateLineMoves(0, -ghgDir); break;
    }
    return moves;
}

module.exports = {
    getInitialBoard,
    getValidMovesForPiece,
    isPositionValid
};