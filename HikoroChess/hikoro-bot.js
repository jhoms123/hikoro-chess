// Adapted from HikoroChess/Bot.cs: material values, central control, royal safety,
// capture ordering and bounded lookahead. The website's rules engine is
// authoritative for every candidate (including hand drops and bonus moves).
const rules = require('./gamelogic');

const values = {pawn:100,sult:200,pilut:200,kota:250,fin:250,yoli:300,chair:300,zur:400,kor:450,jotu:500,cope:350,greatshield:500,finor:500,greathorsegeneral:800,mermaid:700,neptune:900,cthulhu:1000,prince:10000,lupa:10000};
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
function chooseMove(game,{budgetMs=150,width=12}={}) {
    const color=turn(game), deadline=Date.now()+budgetMs;
    const roots=legalMoves(game).sort((a,b)=>order(game,b)-order(game,a));
    if (!roots.length) return null;
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
        if (score>bestScore) {bestScore=score;best=move;}
    }
    return best;
}
module.exports={chooseMove,legalMoves,evaluate};
