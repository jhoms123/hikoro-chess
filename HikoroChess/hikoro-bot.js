// Adapted from HikoroChess/Bot.cs: material values, central control, royal safety,
// capture ordering and bounded lookahead. The website's rules engine is
// authoritative for every candidate (including hand drops and bonus moves).
const rules = require('./gamelogic');

const values = {pawn:100,sult:200,pilut:200,kota:250,fin:250,yoli:300,chair:300,zur:400,kor:450,jotu:500,cope:350,greatshield:500,finor:500,greathorsegeneral:800,mermaid:700,neptune:900,cthulhu:1000,prince:10000,lupa:10000};
const CYCLE_HISTORY_WINDOW = 24;
const CYCLE_MOVE_PENALTY = 400;
const MAX_CYCLE_MOVE_PENALTY = 1600;
const opposite = color => color === 'white' ? 'black' : 'white';
const turn = game => game.isWhiteTurn ? 'white' : 'black';
const validSquare = (x,y) => x >= 0 && x < 10 && y >= 0 && y < 16 && !((x <= 1 || x >= 8) && (y <= 2 || y >= 13));

function legalMoves(game) {
    const color = turn(game), moves = [];
    for (let y=0;y<16;y++) for (let x=0;x<10;x++) {
        if (game.boardState[y][x]?.color !== color) continue;
        for (const to of rules.getValidMoves(game,{square:{x,y}})) moves.push({type:'board',from:{x,y},to:{x:to.x,y:to.y}});
    }
    if (!game.bonusMoveInfo) for (const type of new Set((game[color+'Captured']||[]).map(piece=>piece.type))) {
        if (type === 'lupa' || type === 'prince') continue;
        for (let y=0;y<16;y++) for (let x=0;x<10;x++) if (validSquare(x,y) && !game.boardState[y][x]) moves.push({type:'drop',piece:{type},to:{x,y}});
    }
    return moves;
}
function evaluate(game, color) {
    if (game.gameOver) return game.winner === color ? 29000 : game.winner === opposite(color) ? -29000 : 0;
    let score = 0;
    for (let y=0;y<16;y++) for (let x=0;x<10;x++) {
        const piece=game.boardState[y][x]; if (!piece) continue;
        const center=(x>=3&&x<=6&&y>=6&&y<=9)?20:0;
        const royal=(piece.type==='prince'||piece.type==='lupa')?(piece.color==='white'?y<=2:y>=13)?30:-30:0;
        score+=(piece.color===color?1:-1)*((values[piece.type]||100)+center+royal);
    }
    for (const side of ['white','black']) for (const piece of game[side+'Captured']||[]) score+=(side===color?1:-1)*(values[piece.type]||100)*0.8;
    return score;
}
function order(game, move) {
    if (move.type==='drop') return (values[move.piece.type]||100)/15 + (move.to.x>=3&&move.to.x<=6?15:0);
    const target=game.boardState[move.to.y][move.to.x], piece=game.boardState[move.from.y][move.from.x];
    return (target?(values[target.type]||100)*12-(values[piece.type]||100)/10:0)+(move.to.y>=6&&move.to.y<=9&&move.to.x>=3&&move.to.x<=6?20:0);
}
function moveSignature(move) {
    if (move?.type==='drop' && move.to) return `drop:${move.piece?.type||''}:${move.to.x},${move.to.y}`;
    if (move?.from && move.to) return `board:${move.from.x},${move.from.y}:${move.to.x},${move.to.y}:${move.promotion||move.promoteTo||''}`;
    return '';
}
function recentMoveCounts(game) {
    const counts = new Map();
    for (const move of (game.actionJournal||[]).slice(-CYCLE_HISTORY_WINDOW)) {
        const signature = moveSignature(move);
        if (signature) counts.set(signature, (counts.get(signature)||0)+1);
    }
    return counts;
}
function cyclePenalty(game, move, counts, next) {
    if (move?.type==='board' && game.boardState[move.to.y]?.[move.to.x]) return 0;
    if (move?.promotion || move?.promoteTo || move?.isPromotion) return 0;
    if (next?.gameOver) return 0;
    if (move?.type==='board' && game.boardState[move.from.y]?.[move.from.x]?.type !== next?.boardState[move.to.y]?.[move.to.x]?.type) return 0;
    const repeats = counts.get(moveSignature(move))||0;
    return Math.min(MAX_CYCLE_MOVE_PENALTY, repeats*CYCLE_MOVE_PENALTY);
}
function chooseMove(game,{budgetMs=150,width=12}={}) {
    const color=turn(game), deadline=Date.now()+budgetMs;
    const roots=legalMoves(game).sort((a,b)=>order(game,b)-order(game,a));
    if (!roots.length) return null;
    const repeatedMoves=recentMoveCounts(game);
    let best=roots[0],bestScore=-Infinity;
    // Include every root capture and the strongest quiet candidates. A bonus move
    // keeps the same player; its continuation must therefore maximize again.
    const shortlist=roots.filter((m,i)=>i<width || (m.type==='board'&&game.boardState[m.to.y][m.to.x])).slice(0,48);
    for (const move of shortlist) {
        if (Date.now()>deadline && bestScore>-Infinity) break;
        const result=rules.makeMove(game,move,color); if (!result.success) continue;
        const next=result.updatedGame;
        let score=evaluate(next,color);
        if (!next.gameOver && Date.now()<deadline) {
            const replies=legalMoves(next).sort((a,b)=>order(next,b)-order(next,a)).slice(0,width);
            let replyScore=turn(next)===color?-Infinity:Infinity;
            for (const reply of replies) {
                if (Date.now()>deadline) break;
                const outcome=rules.makeMove(next,reply,turn(next)); if (!outcome.success) continue;
                const value=evaluate(outcome.updatedGame,color);
                replyScore=turn(next)===color?Math.max(replyScore,value):Math.min(replyScore,value);
            }
            if (Number.isFinite(replyScore)) score=replyScore;
        }
        score-=cyclePenalty(game,move,repeatedMoves,next);
        if (score>bestScore) {bestScore=score;best=move;}
    }
    return best;
}
module.exports={chooseMove,legalMoves,evaluate};
