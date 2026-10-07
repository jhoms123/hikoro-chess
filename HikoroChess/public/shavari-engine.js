/* Shared, deterministic Shavari rules. Runs in the browser and on the server. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Shavari = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const SIZE = 9;
    const TYPES = Object.freeze({
        G: { name: 'Lotus general', icon: 'lotus', range: 1 },
        L: { name: 'Caravan lance', icon: 'camel', range: 8 },
        C: { name: 'Elephant cannon', icon: 'elephant-head', range: 8 },
        P: { name: 'Scarab pawn', icon: 'gold-scarab', range: 1 }
    });
    const validPoint = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < SIZE && p.y >= 0 && p.y < SIZE;
    const key = p => `${p.x},${p.y}`;
    const coord = p => `${'ABCDEFGHI'[p.x]}${9 - p.y}`;
    function signature(s) {
        return `${s.player}|` + Object.keys(s.board).sort().map(k => k + ':' + s.board[k].map(p => `${p.owner}${p.type}`).join('')).join('|');
    }
    function initial() {
        const s = { board: {}, player: 1, ply: 0, result: null, lastMove: null, history: [], positions: {} };
        for (const owner of [1, 2]) {
            const back = owner === 1 ? 8 : 0, front = owner === 1 ? 7 : 1;
            ['L','C','G','C','L'].forEach((type, i) => { s.board[`${i * 2},${back}`] = [{ type, owner }]; });
            for (let x = 0; x < SIZE; x += 2) s.board[`${x},${front}`] = [{ type: 'P', owner }];
        }
        s.positions[signature(s)] = 1;
        return s;
    }
    function legalMoves(s, from, mode = 'all') {
        if (!s || s.result || !validPoint(from) || !['all','top'].includes(mode)) return [];
        const stack = s.board[key(from)];
        if (!stack?.length || stack.at(-1).owner !== s.player) return [];
        const moving = mode === 'top' ? 1 : stack.length;
        // Preserve the upload's movement: the top piece leads, even for a whole stack.
        const distance = TYPES[stack.at(-1).type].range;
        const moves = [];
        for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
            for (let step = 1; step <= distance; step++) {
                const to = { x: from.x + dx * step, y: from.y + dy * step };
                if (!validPoint(to)) break;
                const target = s.board[key(to)] || [];
                if (!target.length) moves.push({ ...to, kind: 'move' });
                else {
                    if (target.at(-1).owner !== s.player) moves.push({ ...to, kind: 'capture' });
                    else if (target.length + moving <= 3) moves.push({ ...to, kind: 'stack' });
                    break;
                }
            }
        }
        return moves;
    }
    function hasMove(s) {
        return Object.keys(s.board).some(k => { const [x,y] = k.split(',').map(Number); return legalMoves(s, {x,y}, 'top').length; });
    }
    function apply(s, action) {
        if (!action || !validPoint(action.from) || !validPoint(action.to) || !['all','top'].includes(action.mode)) return null;
        const legal = legalMoves(s, action.from, action.mode).find(m => m.x === action.to.x && m.y === action.to.y);
        if (!legal) return null;
        const next = JSON.parse(JSON.stringify(s));
        const from = key(action.from), to = key(action.to);
        const moving = action.mode === 'top' ? [next.board[from].pop()] : next.board[from].splice(0);
        if (!next.board[from].length) delete next.board[from];
        const captured = legal.kind === 'capture' ? (next.board[to] || []) : [];
        next.board[to] = legal.kind === 'capture' ? moving : [...(next.board[to] || []), ...moving];
        const record = { from: { x: action.from.x, y: action.from.y }, to: { x: action.to.x, y: action.to.y }, mode: action.mode, player: s.player,
            types: moving.map(p => p.type), captured: captured.map(p => p.type), height: next.board[to].length };
        next.lastMove = record; next.history.push(record); next.ply++; next.player = 3 - s.player;
        if (captured.some(p => p.type === 'G')) next.result = { winner: s.player, reason: 'General captured' };
        const sig = signature(next); next.positions[sig] = (next.positions[sig] || 0) + 1;
        if (!next.result && next.positions[sig] >= 3) next.result = { winner: 0, reason: 'Threefold repetition' };
        if (!next.result && !hasMove(next)) next.result = { winner: 0, reason: 'No legal moves' };
        if (!next.result && next.ply >= 4000) next.result = { winner: 0, reason: 'Move limit reached' };
        return next;
    }
    function replay(actions, cursor = actions?.length) {
        if (!Array.isArray(actions) || actions.length > 4000 || !Number.isInteger(cursor) || cursor < 0 || cursor > actions.length) return null;
        let s = initial();
        for (const action of actions.slice(0, cursor)) { s = apply(s, action); if (!s) return null; }
        return s;
    }
    return { SIZE, TYPES, initial, legalMoves, apply, replay, coord };
});
