const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');
// Execute only our checked-in shared rules. No client-supplied code is evaluated.
const rules = new vm.Script(fs.readFileSync(path.join(__dirname, 'public/shodansho-engine.js'), 'utf8') + '\nthis.engine = new Game(new BoardData(), playerCount);');
function createSdsValidator(playerCount) {
    const context = vm.createContext({ playerCount, isOnline: false, performance,
        requestAnimationFrame() {}, drawBoard() {}, updateDOM() {} });
    rules.runInContext(context, { timeout: 1000 });
    return context.engine;
}
function applySdsAction(engine, action) {
    if (!action || typeof action !== 'object' || engine.phase === 'game_over') return null;
    let canonical;
    if (action.type === 'dropSelectedHand') {
        if (typeof action.key !== 'string' || !engine.board.vertices.has(action.key) ||
            !Object.hasOwn(engine.players[engine.currentPlayer].hand, action.kind) ||
            engine.players[engine.currentPlayer].hand[action.kind] <= 0 || engine.occupied().has(action.key) ||
            !engine.canDrop(action.kind, action.key)[0]) return null;
        canonical = { type: action.type, key: action.key, kind: action.kind };
        engine.dropSelectedHand(action.key, action.kind, true);
    } else if (action.type === 'applyMove') {
        const piece = engine.pieces.get(action.move?.pieceId);
        if (!piece || !piece.pos || piece.owner !== engine.currentPlayer) return null;
        const move = engine.generateMoves(piece).find(m => m.dst === action.move.dst);
        if (!move) return null;
        // Capture target and path are derived from the server's rules, never the client.
        canonical = { type: action.type, move: JSON.parse(JSON.stringify(move)) };
        engine.applyMove(move, true);
    } else if (action.type === 'pickupSelectedSun') {
        const piece = engine.pieces.get(action.pieceId);
        if (!piece || piece.kind !== 'sun' || !piece.pos || piece.owner !== engine.currentPlayer) return null;
        canonical = { type: action.type, pieceId: piece.id };
        engine.pickupSelectedSun(piece.id, true);
    } else return null;
    return canonical;
}
module.exports = { createSdsValidator, applySdsAction };
