/* Deterministic rules for Shavari City Battle. The same rules drive play and tests. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ShavariCityBattleEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SIDES = Object.freeze(['carnelian', 'turquoise']);
    const otherSide = side => side === 'carnelian' ? 'turquoise' : 'carnelian';
    const RULE_KINDS = Object.freeze(['move', 'stack', 'capture', 'cover']);

    function create(setup) {
        const board = setup?.metadata?.board || {};
        const COLS = Number(board.columns) || 16;
        const ROWS = Number(board.rows) || 17;
        const FILES = Array.isArray(board.files) ? board.files.slice(0, COLS) : 'ABCDEFGHIJKLMNOP'.split('').slice(0, COLS);
        const types = new Map((setup?.pieceTypes || []).map(piece => [piece.id, piece]));
        if (!types.size) throw new Error('The setup has no piece types.');
        const typeOrdinals = new Map([...types.keys()].map((id, index) => [id, index + 1]));
        const hashSeeds = [0x4f1bbcdc, 0x87a3d2e1, 0x19c6e5a7, 0xd3b84f29];
        const turnHashValue = hashSeeds.map((seed, index) => mixHashWord((0x71a20001 + index * 0x10203) >>> 0, seed));
        const position = setup.position || {};
        const rules = setup.settings || {};
        const stackRules = rules.stacking || {};
        const movementRankRules = rules.movementRanks || {};
        const movementScoreWeights = {
            step: Number.isFinite(Number(movementRankRules.weights?.step)) ? Number(movementRankRules.weights.step) : 1,
            jump: Number.isFinite(Number(movementRankRules.weights?.jump)) ? Number(movementRankRules.weights.jump) : 2,
            line: Number.isFinite(Number(movementRankRules.weights?.line)) ? Number(movementRankRules.weights.line) : 5
        };
        const rank2MinScore = Number(movementRankRules.rank2MinScore) || 9;
        const rank3MinScore = Number(movementRankRules.rank3MinScore) || 20;
        const transform = setup.orientation?.oppositeCourtTransform || rules.orientationTransform || 'rank-flip';
        const maxHeight = Math.max(1, Math.min(8, Number(stackRules.maxHeight) || 3));
        const hasStackGroupRules = [...types.values()].some(piece => Object.prototype.hasOwnProperty.call(piece, 'stackGroup'));
        const stackGroupByType = new Map([...types.values()]
            .filter(piece => typeof piece.stackGroup === 'string' && piece.stackGroup)
            .map(piece => [piece.id, piece.stackGroup]));
        const generalTypes = new Set(types.has('lotus-general') ? ['lotus-general'] : [...types.values()].filter(p => p.basePiece && /general/i.test(p.name)).map(p => p.id));
        const captureGeneralWins = rules.victory?.captureGeneral !== false;
        const noMoveLoses = rules.victory?.noLegalMoveLoses !== false;
        const repetitionLimit = 3;
        const noCaptureLimit = 100;
        const plyLimit = 4000;

        function mixHashWord(value, seed) {
            let word = (value ^ seed) >>> 0;
            word = Math.imul(word ^ (word >>> 16), 0x7feb352d);
            word = Math.imul(word ^ (word >>> 15), 0x846ca68b);
            return (word ^ (word >>> 16)) >>> 0;
        }

        function hashCell(at, pieces) {
            const hash = [0, 0, 0, 0];
            for (let layer = 0; layer < pieces.length; layer++) {
                const piece = pieces[layer];
                const owner = piece.owner === 'turquoise' ? 1 : 0;
                const type = typeOrdinals.get(piece.typeId) || 0;
                const code = (((at * 8 + layer) * 2 + owner) * (types.size + 1) + type) >>> 0;
                for (let word = 0; word < hash.length; word++) hash[word] ^= mixHashWord(code, hashSeeds[word]);
            }
            return hash;
        }

        function hashPosition(state) {
            const hash = [0, 0, 0, 0];
            for (let at = 0; at < state.board.length; at++) {
                const cell = state.board[at];
                if (!cell.length) continue;
                const cellHash = hashCell(at, cell);
                for (let word = 0; word < hash.length; word++) hash[word] ^= cellHash[word];
            }
            if (state.turn === 'turquoise') {
                for (let word = 0; word < hash.length; word++) hash[word] ^= turnHashValue[word];
            }
            return hash;
        }

        function hashKey(hash) {
            return hash.map(word => word.toString(16).padStart(8, '0')).join('');
        }

        function turnHash(side) {
            return side === 'turquoise' ? turnHashValue : [0, 0, 0, 0];
        }

        const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < COLS && y >= 0 && y < ROWS;
        const index = (x, y) => y * COLS + x;
        const coord = point => `${FILES[point.x] || '?'}${point.y + 1}`;
        const getType = id => types.get(id) || null;
        const ownsGeneral = pieces => pieces.some(piece => generalTypes.has(piece.typeId));
        const stackGroupsMatch = pieces => {
            if (!hasStackGroupRules) return true;
            const group = stackGroupByType.get(pieces[0]?.typeId);
            return Boolean(group && pieces.every(piece => stackGroupByType.get(piece.typeId) === group));
        };
        const canStack = pieces => stackRules.enabled !== false && pieces.length <= maxHeight && !ownsGeneral(pieces) && stackGroupsMatch(pieces);

        function movementScoreForType(typeId) {
            const movement = types.get(typeId)?.movement || {};
            return (movement.steps || []).length * movementScoreWeights.step
                + (movement.jumps || []).length * movementScoreWeights.jump
                + (movement.rays || []).length * movementScoreWeights.line;
        }

        function rankForType(typeId) {
            const score = movementScoreForType(typeId);
            return score >= rank3MinScore ? 3 : score >= rank2MinScore ? 2 : 1;
        }

        function formationRank(pieces) {
            return (pieces || []).reduce((total, piece) => total + rankForType(piece.typeId), 0);
        }

        function initial() {
            const cells = Array.from({ length: COLS * ROWS }, () => []);
            const buildings = Array(COLS * ROWS).fill(false);
            for (const block of position.blockedSquares || []) {
                if (!inside(Number(block.x), Number(block.y))) continue;
                buildings[index(Number(block.x), Number(block.y))] = true;
            }
            for (const unit of position.units || []) {
                const x = Number(unit.x), y = Number(unit.y), side = SIDES.includes(unit.side) ? unit.side : null;
                if (!inside(x, y) || !side || !types.has(unit.typeId)) continue;
                const at = index(x, y);
                if (buildings[at]) throw new Error(`A unit and building share ${coord({ x, y })}.`);
                cells[at].push({ id: String(unit.id || `${unit.typeId}-${unit.side}-${at}-${cells[at].length}`), typeId: unit.typeId, owner: side });
                if (cells[at].length > 1 && !canStack(cells[at])) throw new Error(`An invalid formation starts at ${coord({ x, y })}.`);
            }
            const state = {
                board: cells,
                buildings,
                turn: 'carnelian',
                ply: 0,
                noCapturePlies: 0,
                result: null,
                lastMove: null,
                history: [],
                positionCounts: {}
            };
            state.positionCounts[signature(state)] = 1;
            state.positionHash = hashPosition(state);
            state.positionHashCounts = { [hashKey(state.positionHash)]: 1 };
            return state;
        }

        function cloneState(state) {
            return {
                board: state.board.map(stack => stack.map(piece => ({ ...piece }))),
                buildings: state.buildings.slice(),
                turn: state.turn,
                ply: state.ply,
                noCapturePlies: state.noCapturePlies,
                result: state.result ? { ...state.result } : null,
                lastMove: state.lastMove ? { ...state.lastMove, from: { ...state.lastMove.from }, to: { ...state.lastMove.to } } : null,
                history: state.history.map(move => ({ ...move, from: { ...move.from }, to: { ...move.to }, types: move.types.slice(), captured: move.captured.slice() })),
                positionCounts: { ...state.positionCounts },
                positionHash: state.positionHash.slice(),
                positionHashCounts: { ...state.positionHashCounts }
            };
        }

        function signature(state) {
            const occupied = [];
            for (let i = 0; i < state.board.length; i++) {
                const stack = state.board[i];
                if (stack.length) occupied.push(`${i}:${stack.map(piece => `${piece.owner[0]}-${piece.typeId}`).join('.')}`);
            }
            return `${state.turn}|${occupied.join('|')}`;
        }

        function transformed(rule, piece) {
            let dx = Number(rule.dx) || 0, dy = Number(rule.dy) || 0;
            if (piece.owner === 'turquoise') {
                if (transform === 'rotate-180') { dx = -dx; dy = -dy; }
                else dy = -dy;
            }
            return { dx, dy };
        }

        function stepPathIsClear(state, from, to) {
            const dx = to.x - from.x, dy = to.y - from.y;
            const length = Math.max(Math.abs(dx), Math.abs(dy));
            let previous = `${from.x},${from.y}`;
            for (let i = 1; i < length; i++) {
                const x = Math.round(from.x + dx * i / length);
                const y = Math.round(from.y + dy * i / length);
                const key = `${x},${y}`;
                if (key === previous) continue;
                previous = key;
                const at = index(x, y);
                if (state.buildings[at] || state.board[at].length) return false;
            }
            return true;
        }

        function landingOptions(state, moving, x, y, captureAllowed) {
            if (!inside(x, y)) return [];
            const at = index(x, y);
            if (state.buildings[at]) return [];
            const target = state.board[at];
            if (!target.length) return ['move'];
            const movingSide = moving[moving.length - 1].owner;
            const targetSide = target[target.length - 1].owner;
            if (targetSide === movingSide) return canStack([...target, ...moving]) ? ['stack'] : [];
            const options = [];
            const rankIsEnough = formationRank(moving) >= formationRank(target);
            if (captureAllowed && rankIsEnough) options.push('capture');
            if (captureAllowed && rankIsEnough && stackRules.enabled !== false && stackRules.tallerCanCoverShorter !== false && moving.length > target.length && canStack([...target, ...moving])) options.push('cover');
            return options;
        }

        function addDestination(destinations, state, moving, x, y, captureAllowed, ruleKind) {
            const options = landingOptions(state, moving, x, y, captureAllowed);
            if (!options.length) return;
            const id = index(x, y);
            if (!destinations.has(id)) destinations.set(id, { x, y, options: new Set(), via: new Set() });
            const entry = destinations.get(id);
            options.forEach(option => entry.options.add(option));
            entry.via.add(ruleKind);
        }

        function legalMoves(state, from, side = state?.turn) {
            if (!state || state.result || !inside(from?.x, from?.y) || !SIDES.includes(side)) return [];
            const source = state.board[index(from.x, from.y)];
            if (!source.length || source[source.length - 1].owner !== side) return [];
            const moving = source;
            const destinations = new Map();
            const addRules = (piece, kind, list) => {
                for (const rule of list || []) {
                    const { dx, dy } = transformed(rule, piece);
                    if (!dx && !dy) continue;
                    const capture = !!rule.capture;
                    if (kind === 'step' || kind === 'jump') {
                        const x = from.x + dx, y = from.y + dy;
                        if (!inside(x, y)) continue;
                        if (kind === 'step' && !stepPathIsClear(state, from, { x, y })) continue;
                        addDestination(destinations, state, moving, x, y, capture, kind);
                        continue;
                    }
                    const max = Math.max(1, Math.min(32, Number(rule.maxDistance) || Math.max(COLS, ROWS)));
                    for (let distance = 1; distance <= max; distance++) {
                        const x = from.x + dx * distance, y = from.y + dy * distance;
                        if (!inside(x, y)) break;
                        const at = index(x, y);
                        if (state.buildings[at]) break;
                        const obstacle = state.board[at];
                        addDestination(destinations, state, moving, x, y, capture, kind);
                        if (obstacle.length && (stackRules.tallerCanJumpShorter === false || moving.length <= obstacle.length)) break;
                    }
                }
            };
            for (const piece of moving) {
                const movement = types.get(piece.typeId)?.movement || {};
                addRules(piece, 'step', movement.steps);
                addRules(piece, 'jump', movement.jumps);
                addRules(piece, 'ray', movement.rays);
            }
            return [...destinations.values()].map(entry => ({ x: entry.x, y: entry.y, options: RULE_KINDS.filter(kind => entry.options.has(kind)), via: [...entry.via] }));
        }

        function hasLegalMove(state, side = state.turn) {
            const probe = side === state.turn ? state : { ...state, turn: side };
            for (let at = 0; at < probe.board.length; at++) {
                const stack = probe.board[at];
                if (!stack.length || stack[stack.length - 1].owner !== side) continue;
                if (legalMoves(probe, { x: at % COLS, y: Math.floor(at / COLS) }, side).length) return true;
            }
            return false;
        }

        function apply(state, action) {
            if (!state || state.result || !action || !inside(action.from?.x, action.from?.y) || !inside(action.to?.x, action.to?.y) || !RULE_KINDS.includes(action.kind)) return null;
            const destinations = legalMoves(state, action.from);
            const destination = destinations.find(move => move.x === action.to.x && move.y === action.to.y);
            if (!destination || !destination.options.includes(action.kind)) return null;
            const next = cloneState(state);
            const fromIndex = index(action.from.x, action.from.y), toIndex = index(action.to.x, action.to.y);
            const moving = next.board[fromIndex].splice(0);
            const target = next.board[toIndex];
            const captured = action.kind === 'capture' ? target.slice() : [];
            if (action.kind === 'capture') next.board[toIndex] = moving;
            else if (action.kind === 'cover' || action.kind === 'stack') next.board[toIndex] = [...target, ...moving];
            else next.board[toIndex] = moving;
            const record = {
                from: { ...action.from },
                to: { ...action.to },
                player: state.turn,
                kind: action.kind,
                types: moving.map(piece => types.get(piece.typeId)?.name || piece.typeId),
                captured: captured.map(piece => types.get(piece.typeId)?.name || piece.typeId),
                height: next.board[toIndex].length
            };
            next.ply++;
            next.lastMove = record;
            next.history.push(record);
            next.turn = otherSide(state.turn);
            next.noCapturePlies = action.kind === 'capture' ? 0 : (state.noCapturePlies || 0) + 1;

            const tookGeneral = captureGeneralWins && captured.some(piece => generalTypes.has(piece.typeId));
            if (tookGeneral) next.result = { winner: state.turn, reason: 'Lotus General captured' };
            const sig = signature(next);
            next.positionCounts[sig] = (next.positionCounts[sig] || 0) + 1;
            next.positionHash = hashPosition(next);
            const positionHashKey = hashKey(next.positionHash);
            next.positionHashCounts[positionHashKey] = (next.positionHashCounts[positionHashKey] || 0) + 1;
            if (!next.result && next.positionCounts[sig] >= repetitionLimit) next.result = { winner: null, reason: 'Threefold repetition' };
            if (!next.result && noMoveLoses && !hasLegalMove(next, next.turn)) next.result = { winner: state.turn, reason: 'No legal moves' };
            if (!next.result && next.noCapturePlies >= noCaptureLimit) next.result = { winner: null, reason: '100 plies without a capture' };
            if (!next.result && next.ply >= plyLimit) next.result = { winner: null, reason: 'Move limit reached' };
            return next;
        }

        function replay(journal, cursor = journal?.length) {
            if (!Array.isArray(journal) || journal.length > plyLimit || !Number.isInteger(cursor) || cursor < 0 || cursor > journal.length) return null;
            let state = initial();
            for (const action of journal.slice(0, cursor)) {
                state = apply(state, action);
                if (!state) return null;
            }
            return state;
        }

        return Object.freeze({ COLS, ROWS, FILES, maxHeight, types, generalTypes, initial, legalMoves, hasLegalMove, apply, replay, coord, index, inside, otherSide, movementScoreForType, rankForType, formationRank, hashCell, hashPosition, hashKey, turnHash });
    }

    return Object.freeze({ create, SIDES });
});
