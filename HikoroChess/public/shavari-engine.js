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
    function movingPieces(stack, mode) {
        if (!stack?.length) return [];
        if (mode === 'all') return stack;
        if (mode === 'top') return stack.slice(-1);
        if (mode === 'pair' && stack.length >= 2) return stack.slice(-2);
        return [];
    }
    function legalMoves(s, from, mode = 'all') {
        if (!s || s.result || !validPoint(from)) return [];
        const stack = s.board[key(from)];
        if (!stack?.length || stack.at(-1).owner !== s.player) return [];
        const moving = movingPieces(stack, mode);
        if (!moving.length) return [];
        // Union of every carried piece's moves, including buried enemy pieces.
        const distance = Math.max(...moving.map(p => TYPES[p.type].range));
        const moves = [];
        for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
            for (let step = 1; step <= distance; step++) {
                const to = { x: from.x + dx * step, y: from.y + dy * step };
                if (!validPoint(to)) break;
                const target = s.board[key(to)] || [];
                if (!target.length) moves.push({ ...to, kind: 'move' });
                else {
                    const enemy = target.at(-1).owner !== s.player;
                    if (enemy) {
                        moves.push({ ...to, kind: 'capture' });
                        if (moving.length > target.length && moving.length + target.length <= 3)
                            moves.push({ ...to, kind: 'cover' });
                    } else if (target.length + moving.length <= 3) moves.push({ ...to, kind: 'stack' });
                    // Taller moving formations may travel beyond shorter blockers.
                    if (moving.length <= target.length) break;
                }
            }
        }
        return moves;
    }
    function hasMove(s) {
        return Object.keys(s.board).some(k => { const [x,y] = k.split(',').map(Number);
            return ['all','top','pair'].some(mode => legalMoves(s, {x,y}, mode).length); });
    }
    function apply(s, action) {
        if (!action || !validPoint(action.from) || !validPoint(action.to) || !['all','top','pair'].includes(action.mode)) return null;
        if (action.kind !== undefined && !['move','stack','capture','cover'].includes(action.kind)) return null;
        const legal = legalMoves(s, action.from, action.mode).find(m => m.x === action.to.x && m.y === action.to.y && (action.kind === undefined ? m.kind !== 'cover' : m.kind === action.kind));
        if (!legal) return null;
        const next = JSON.parse(JSON.stringify(s));
        const from = key(action.from), to = key(action.to);
        const count = movingPieces(next.board[from], action.mode).length;
        const moving = next.board[from].splice(-count);
        if (!next.board[from].length) delete next.board[from];
        const captured = legal.kind === 'capture' ? (next.board[to] || []) : [];
        next.board[to] = legal.kind === 'capture' ? moving : [...(next.board[to] || []), ...moving];
        const record = { from: { x: action.from.x, y: action.from.y }, to: { x: action.to.x, y: action.to.y }, mode: action.mode, player: s.player,
            kind: legal.kind, types: moving.map(p => p.type), owners: moving.map(p => p.owner), captured: captured.map(p => p.type), height: next.board[to].length };
        next.lastMove = record; next.history.push(record); next.ply++; next.player = 3 - s.player;
        const lostGenerals = new Set(captured.filter(p => p.type === 'G').map(p => p.owner));
        if (lostGenerals.size) next.result = { winner: lostGenerals.size === 2 ? 0 : 3 - [...lostGenerals][0], reason: lostGenerals.size === 2 ? 'Both generals captured' : 'General captured' };
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
    return { SIZE, TYPES, initial, movingPieces, legalMoves, apply, replay, coord };
});
