/* City Battle adaptation of the Shavari bot: timed iterative search over the game's rules engine. */
(function (root, factory) {
    const engineApi = typeof module === 'object' && module.exports
        ? require('./shavari-city-battle-engine.js')
        : root.ShavariCityBattleEngine;
    const api = factory(engineApi);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ShavariCityBattleBot = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (engineApi) {
    'use strict';

    const MATE = 500000;
    const MATERIAL = Object.freeze({
        'lotus-general': 2600, 'caravan-lance': 510, 'elephant-cannon': 510,
        'scarab-pawn': 110, 'lancer-pawn': 190, 'lancer-knight': 580,
        'cannon-general': 620, 'camel-lancer': 390, 'city-soldier': 250,
        'city-pawn': 150, 'lotus-pawn': 160, 'cart-runner': 520,
        'cannon-cart': 560, 'fighting-dog': 340, 'elephant-soldier': 270
    });

    function create(setup) {
        if (!engineApi?.create) throw new Error('The City Battle rules engine is unavailable.');
        const engine = engineApi.create(setup);
        const size = engine.COLS * engine.ROWS;
        const captureGeneralWins = setup.settings?.victory?.captureGeneral !== false;
        const noMoveLoses = setup.settings?.victory?.noLegalMoveLoses !== false;
        const values = new Map([...engine.types].map(([id, type]) => [id, MATERIAL[id] || valueFromMovement(type)]));
        let deadline = Infinity, nodes = 0, stopped = false, table = new Map(), killers = new Map();

        function valueFromMovement(type) {
            const move = type.movement || {};
            const steps = (move.steps || []).length, jumps = (move.jumps || []).length, rays = (move.rays || []).length;
            return Math.max(100, Math.round(95 + steps * 17 + jumps * 21 + rays * 70));
        }

        function signature(state) {
            const occupied = [];
            for (let i = 0; i < size; i++) {
                const stack = state.board[i];
                if (stack.length) occupied.push(`${i}:${stack.map(piece => `${piece.owner[0]}-${piece.typeId}`).join('.')}`);
            }
            return `${state.turn}|${occupied.join('|')}`;
        }

        function makeState(restored) {
            return {
                board: restored.board.map(stack => stack.slice()),
                buildings: restored.buildings,
                turn: restored.turn,
                ply: restored.ply,
                noCapturePlies: restored.noCapturePlies,
                positionCounts: { ...restored.positionCounts }
            };
        }

        function generate(state, side = state.turn) {
            const actions = [];
            for (let at = 0; at < size; at++) {
                const stack = state.board[at];
                if (!stack.length || stack[stack.length - 1].owner !== side) continue;
                const from = { x: at % engine.COLS, y: Math.floor(at / engine.COLS) };
                for (const destination of engine.legalMoves(state, from, side)) {
                    const to = { x: destination.x, y: destination.y };
                    for (const kind of destination.options) actions.push({ from, to, kind });
                }
            }
            return actions;
        }

        function moveOrderScore(state, action, ttMove, ply) {
            if (ttMove && sameAction(action, ttMove)) return 2_000_000;
            const fromAt = engine.index(action.from.x, action.from.y), toAt = engine.index(action.to.x, action.to.y);
            const moving = state.board[fromAt], target = state.board[toAt];
            let score = 0;
            if (action.kind === 'capture') {
                score += 30_000 + target.reduce((sum, piece) => sum + (values.get(piece.typeId) || 100), 0) * 8;
                if (target.some(piece => engine.generalTypes.has(piece.typeId))) score += 1_000_000;
                score -= (values.get(moving[moving.length - 1].typeId) || 100) / 8;
            } else if (action.kind === 'cover') {
                score += 8_000 + target.reduce((sum, piece) => sum + (values.get(piece.typeId) || 100), 0) * 2;
            } else if (action.kind === 'stack') score += 1_500;
            const centerX = (engine.COLS - 1) / 2, centerY = (engine.ROWS - 1) / 2;
            score += 15 - (Math.abs(action.to.x - centerX) + Math.abs(action.to.y - centerY)) * 1.4;
            score += action.kind === 'move' ? 0 : 2;
            const killer = killers.get(ply) || [];
            if (killer.some(move => sameAction(action, move))) score += 10_000;
            return score;
        }

        function sameAction(a, b) {
            return a.kind === b.kind && a.from.x === b.from.x && a.from.y === b.from.y && a.to.x === b.to.x && a.to.y === b.to.y;
        }

        function ordered(state, actions, ttMove, ply) {
            return actions.map(action => ({ action, score: moveOrderScore(state, action, ttMove, ply) }))
                .sort((a, b) => b.score - a.score).map(entry => entry.action);
        }

        function make(state, action) {
            const fromAt = engine.index(action.from.x, action.from.y), toAt = engine.index(action.to.x, action.to.y);
            const moving = state.board[fromAt], target = state.board[toAt];
            const capturedGeneral = action.kind === 'capture' && target.some(piece => engine.generalTypes.has(piece.typeId));
            const old = { from: moving, to: target, turn: state.turn, ply: state.ply, noCapturePlies: state.noCapturePlies, capturedGeneral };
            state.board[fromAt] = [];
            if (action.kind === 'capture' || action.kind === 'move') state.board[toAt] = moving;
            else state.board[toAt] = target.concat(moving);
            state.turn = engine.otherSide(state.turn);
            state.ply++;
            state.noCapturePlies = action.kind === 'capture' ? 0 : state.noCapturePlies + 1;
            const key = signature(state);
            state.positionCounts[key] = (state.positionCounts[key] || 0) + 1;
            old.key = key;
            return old;
        }

        function unmake(state, action, old) {
            const fromAt = engine.index(action.from.x, action.from.y), toAt = engine.index(action.to.x, action.to.y);
            const count = state.positionCounts[old.key] || 0;
            if (count <= 1) delete state.positionCounts[old.key];
            else state.positionCounts[old.key] = count - 1;
            state.board[fromAt] = old.from;
            state.board[toAt] = old.to;
            state.turn = old.turn;
            state.ply = old.ply;
            state.noCapturePlies = old.noCapturePlies;
        }

        function isDraw(state) {
            if (state.noCapturePlies >= 100 || state.ply >= 4000) return true;
            return (state.positionCounts[signature(state)] || 0) >= 3;
        }

        function evaluate(state) {
            let score = 0;
            const cx = (engine.COLS - 1) / 2, cy = (engine.ROWS - 1) / 2;
            for (let at = 0; at < size; at++) {
                const stack = state.board[at];
                if (!stack.length) continue;
                const x = at % engine.COLS, y = Math.floor(at / engine.COLS);
                for (const piece of stack) {
                    const sign = piece.owner === state.turn ? 1 : -1;
                    const material = values.get(piece.typeId) || 100;
                    const advance = piece.owner === 'carnelian' ? engine.ROWS - 1 - y : y;
                    const center = Math.max(0, 8 - Math.abs(x - cx) - Math.abs(y - cy));
                    score += sign * (material + advance * 1.35 + center * 1.2);
                }
                if (stack.length > 1) {
                    const top = stack[stack.length - 1];
                    score += (top.owner === state.turn ? 1 : -1) * (stack.length - 1) * 20;
                }
            }
            return score;
        }

        function checkTime() {
            nodes++;
            if ((nodes & 63) === 0 && Date.now() >= deadline) stopped = true;
            return stopped;
        }

        function negamax(state, depth, alpha, beta, ply) {
            if (checkTime()) return evaluate(state);
            if (depth <= 0) {
                if (!engine.hasLegalMove(state, state.turn)) return noMoveLoses ? -MATE + ply : 0;
                if (isDraw(state)) return 0;
                return evaluate(state);
            }
            const actions = generate(state);
            if (!actions.length) return noMoveLoses ? -MATE + ply : 0;
            if (isDraw(state)) return 0;

            const key = `${signature(state)}#${state.noCapturePlies}#${state.positionCounts[signature(state)] || 0}`;
            const entry = table.get(key);
            const originalAlpha = alpha;
            if (entry && entry.depth >= depth) {
                if (entry.flag === 'exact') return entry.score;
                if (entry.flag === 'lower') alpha = Math.max(alpha, entry.score);
                else if (entry.flag === 'upper') beta = Math.min(beta, entry.score);
                if (alpha >= beta) return entry.score;
            }
            let bestScore = -Infinity, bestAction = null;
            for (const action of ordered(state, actions, entry?.action, ply)) {
                const old = make(state, action);
                let score;
                if (captureGeneralWins && old.capturedGeneral) score = MATE - (ply + 1);
                else if (isDraw(state)) score = 0;
                else score = -negamax(state, depth - 1, -beta, -alpha, ply + 1);
                unmake(state, action, old);
                if (score > bestScore) { bestScore = score; bestAction = action; }
                if (score > alpha) alpha = score;
                if (alpha >= beta) {
                    if (action.kind !== 'capture') {
                        const slots = killers.get(ply) || [];
                        killers.set(ply, [action, ...slots.filter(move => !sameAction(move, action))].slice(0, 2));
                    }
                    break;
                }
                if (stopped) break;
            }
            if (bestAction && !stopped) {
                const flag = bestScore <= originalAlpha ? 'upper' : bestScore >= beta ? 'lower' : 'exact';
                if (table.size > 100000) table.clear();
                table.set(key, { depth, score: bestScore, flag, action: bestAction });
            }
            return bestScore;
        }

        function choose(journal, cursor = journal?.length, thinkingMs = 1000) {
            const restored = engine.replay(journal, cursor);
            if (!restored || restored.result || !Array.isArray(journal)) return { action: null, depth: 0, nodes: 0, score: null };
            const root = makeState(restored), rootActions = generate(root);
            if (!rootActions.length) return { action: null, depth: 0, nodes: 0, score: -MATE };
            const budget = Math.max(100, Math.min(4000, Number(thinkingMs) || 1000));
            deadline = Date.now() + Math.max(80, budget - Math.min(25, budget * 0.04));
            nodes = 0; stopped = false; table = new Map(); killers = new Map();
            let bestAction = ordered(root, rootActions, null, 0)[0], bestScore = -Infinity, completedDepth = 0;
            for (const action of rootActions) {
                const old = make(root, action);
                const score = captureGeneralWins && old.capturedGeneral ? MATE - 1 : !engine.hasLegalMove(root, root.turn) ? (noMoveLoses ? MATE - 1 : 0) : isDraw(root) ? 0 : -evaluate(root);
                unmake(root, action, old);
                if (score > bestScore) { bestScore = score; bestAction = action; }
            }
            for (let depth = 1; depth <= 16 && !stopped; depth++) {
                const alpha = depth > 1 ? bestScore - 80 : -Infinity;
                const beta = depth > 1 ? bestScore + 80 : Infinity;
                let windowScore = -Infinity, windowAction = null, a = alpha;
                for (const action of ordered(root, rootActions, table.get(`${signature(root)}#${root.noCapturePlies}#${root.positionCounts[signature(root)] || 0}`)?.action, 0)) {
                    const old = make(root, action);
                    let score;
                    if (captureGeneralWins && old.capturedGeneral) score = MATE - 1;
                    else if (isDraw(root)) score = 0;
                    else score = -negamax(root, depth - 1, -beta, -a, 1);
                    unmake(root, action, old);
                    if (score > windowScore) { windowScore = score; windowAction = action; }
                    if (score > a) a = score;
                    if (stopped) break;
                }
                if (stopped) break;
                if (windowScore <= alpha || windowScore >= beta) {
                    stopped = false;
                    const full = searchRootWindow(root, rootActions, depth, -Infinity, Infinity);
                    if (!full || stopped) break;
                    windowScore = full.score; windowAction = full.action;
                }
                if (windowAction) { bestAction = windowAction; bestScore = windowScore; completedDepth = depth; }
                if (Math.abs(bestScore) >= MATE - 32) break;
            }
            return { action: bestAction, depth: completedDepth, nodes, score: bestScore };
        }

        function searchRootWindow(root, actions, depth, alpha, beta) {
            let best = -Infinity, bestAction = null, a = alpha;
            for (const action of ordered(root, actions, null, 0)) {
                const old = make(root, action);
                let score;
                if (captureGeneralWins && old.capturedGeneral) score = MATE - 1;
                else if (isDraw(root)) score = 0;
                else score = -negamax(root, depth - 1, -beta, -a, 1);
                unmake(root, action, old);
                if (score > best) { best = score; bestAction = action; }
                if (score > a) a = score;
                if (stopped) return null;
            }
            return { score: best, action: bestAction };
        }

        return Object.freeze({ choose, engine });
    }

    return Object.freeze({ create });
});
