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
        let deadline = Infinity, nodes = 0, tableHits = 0, stopped = false, table = new Map(), killers = new Map(), rootDefenseBonuses = new Map();
        const generalCaptureCache = new Map(), evaluationCache = new Map();
        const safeGeneralMoveCache = new Map();
        const engineTransform = setup.orientation?.oppositeCourtTransform || setup.settings?.orientationTransform || 'rank-flip';

        const movementProfiles = new Map([...engine.types].map(([id, type]) => {
            const movement = type.movement || {};
            const mobility = new Set();
            const forwardSouth = new Set(), forwardNorth = new Set(), forwardAny = new Set();
            for (const [kind, key] of [['step', 'steps'], ['jump', 'jumps'], ['ray', 'rays']]) {
                for (const rule of movement[key] || []) {
                    const dx = Number(rule.dx) || 0, dy = Number(rule.dy) || 0;
                    const distance = kind === 'ray' ? Number(rule.maxDistance) || 0 : 1;
                    const shape = `${kind}:${dx},${dy}:${distance}`;
                    mobility.add(shape);
                    if (dy < 0) forwardSouth.add(shape);
                    if (dy > 0) forwardNorth.add(shape);
                    if (dy !== 0) forwardAny.add(shape);
                }
            }
            return [id, { group: type.stackGroup || null, mobility, forwardSouth, forwardNorth, forwardAny }];
        }));

        const captureProfiles = new Map([...engine.types].map(([id, type]) => {
            const movement = type.movement || {};
            const bySide = {};
            for (const side of ['carnelian', 'turquoise']) {
                const direct = new Set(), rays = [];
                for (const kind of ['step', 'jump', 'ray']) {
                    const rules = movement[`${kind}s`] || [];
                    for (const rule of rules) {
                        if (!rule.capture) continue;
                        let dx = Number(rule.dx) || 0, dy = Number(rule.dy) || 0;
                        if (side === 'turquoise') {
                            if (engineTransform === 'rotate-180') { dx = -dx; dy = -dy; }
                            else dy = -dy;
                        }
                        if (!dx && !dy) continue;
                        if (kind === 'ray') {
                            rays.push({ dx, dy, maxDistance: Math.max(1, Math.min(32, Number(rule.maxDistance) || Math.max(engine.COLS, engine.ROWS))) });
                        } else direct.add(`${dx},${dy}`);
                    }
                }
                bySide[side] = { direct, rays };
            }
            return [id, bySide];
        }));

        function rayDistance(ray, from, target) {
            const dx = target.x - from.x, dy = target.y - from.y;
            const distance = ray.dx ? dx / ray.dx : dy / ray.dy;
            return Number.isInteger(distance) && distance >= 1 && distance <= ray.maxDistance
                && dx === ray.dx * distance && dy === ray.dy * distance ? distance : null;
        }

        function defensiveStackBonuses(state, actions) {
            const candidates = new Map(), bonuses = new Map();
            if (setup.settings?.stacking?.tallerCanJumpShorter === false) return bonuses;
            for (const action of actions) {
                if (action.kind !== 'stack') continue;
                const fromAt = engine.index(action.from.x, action.from.y), toAt = engine.index(action.to.x, action.to.y);
                const moving = state.board[fromAt], existing = state.board[toAt];
                if (!candidates.has(toAt)) candidates.set(toAt, []);
                candidates.get(toAt).push({ movingHeight: moving.length, existingHeight: existing.length });
            }
            if (!candidates.size) return bonuses;

            const defendingSide = state.turn, attackingSide = engine.otherSide(defendingSide);
            for (let at = 0; at < size; at++) {
                const enemyStack = state.board[at];
                if (!enemyStack.length || enemyStack[enemyStack.length - 1].owner !== attackingSide) continue;
                const enemyFrom = { x: at % engine.COLS, y: Math.floor(at / engine.COLS) };
                const uniqueRays = new Map();
                for (const piece of enemyStack) {
                    for (const ray of captureProfiles.get(piece.typeId)?.[attackingSide]?.rays || []) {
                        uniqueRays.set(`${ray.dx},${ray.dy}:${ray.maxDistance}`, ray);
                    }
                }
                if (!uniqueRays.size) continue;
                // Resolve this enemy stack's legal captures once, then look for
                // valuable targets behind possible stack destinations.
                const captures = engine.legalMoves(state, enemyFrom, attackingSide)
                    .filter(destination => destination.options.includes('capture'));
                if (captures.length < 2) continue;
                for (const ray of uniqueRays.values()) {
                    const alongRay = [];
                    for (const destination of captures) {
                        const distance = rayDistance(ray, enemyFrom, destination);
                        if (distance !== null) alongRay.push({ destination, distance });
                    }
                    if (alongRay.length < 2) continue;
                    for (const target of alongRay) {
                        const targetStack = state.board[engine.index(target.destination.x, target.destination.y)];
                        if (!targetStack.some(piece => piece.owner === defendingSide)) continue;
                        const targetValue = targetStack.reduce((sum, piece) => sum + (values.get(piece.typeId) || 100), 0);
                        if (targetValue < 300 && !targetStack.some(piece => engine.generalTypes.has(piece.typeId))) continue;
                        for (const block of alongRay) {
                            if (block.distance >= target.distance) continue;
                            const blockAt = engine.index(block.destination.x, block.destination.y);
                            const existing = state.board[blockAt];
                            if (!existing.some(piece => piece.owner === defendingSide)) continue;
                            for (const candidate of candidates.get(blockAt) || []) {
                                if (enemyStack.length <= candidate.existingHeight
                                    || enemyStack.length > candidate.existingHeight + candidate.movingHeight) continue;
                                bonuses.set(blockAt, Math.max(bonuses.get(blockAt) || 0, 100_000 + targetValue * 10));
                            }
                        }
                    }
                }
            }
            return bonuses;
        }

        function formationValue(firstId, secondId) {
            const first = movementProfiles.get(firstId), second = movementProfiles.get(secondId);
            if (!first || !second || !first.group || first.group !== second.group) return -30;
            const shared = [...first.mobility].filter(rule => second.mobility.has(rule)).length;
            const union = first.mobility.size + second.mobility.size - shared;
            if (!union) return -12;
            const unique = union - shared;
            const similarity = shared / union;
            const forwardUnique = [...new Set([...first.forwardAny, ...second.forwardAny])]
                .filter(rule => !(first.forwardAny.has(rule) && second.forwardAny.has(rule))).length;
            // Joining two near-identical move sets burns a turn; complementary
            // profiles earn a small bonus, especially when they add forward reach.
            return Math.max(-16, Math.min(30, unique * 7 - shared * 4 + Math.min(3, forwardUnique) * 3 - similarity * 5));
        }

        function stackCarrierBonus(stack, advance) {
            if (stack.length < 2 || advance < 4) return 0;
            const forwardKey = stack[0].owner === 'carnelian' ? 'forwardSouth' : 'forwardNorth';
            const forwardCarrier = stack.some(piece => movementProfiles.get(piece.typeId)?.[forwardKey].size);
            const bestValue = Math.max(...stack.map(piece => values.get(piece.typeId) || 100));
            return forwardCarrier && bestValue >= 350 ? 8 : 0;
        }

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

        function occurrenceHash(key, count) {
            let first = 2166136261, second = 2246822519;
            for (let i = 0; i < key.length; i++) {
                const code = key.charCodeAt(i);
                first = Math.imul(first ^ code, 16777619);
                second = Math.imul(second ^ code, 3266489917);
            }
            return [Math.imul(first ^ count, 16777619) >>> 0, Math.imul(second ^ count, 668265263) >>> 0];
        }

        function historyHash(counts) {
            let first = 0, second = 0;
            for (const [key, count] of Object.entries(counts)) {
                const token = occurrenceHash(key, count);
                first ^= token[0];
                second ^= token[1];
            }
            return [first >>> 0, second >>> 0];
        }

        function transpositionKey(state) {
            return `${state.positionHashKey}#${state.noCapturePlies}#${state.positionHashCounts[state.positionHashKey] || 0}#${state.historyHash[0]}#${state.historyHash[1]}`;
        }

        function makeState(restored) {
            const positionHash = Array.isArray(restored.positionHash) ? restored.positionHash.slice() : engine.hashPosition(restored);
            const positionHashKey = engine.hashKey(positionHash);
            const positionHashCounts = { ...(restored.positionHashCounts || {}) };
            if (!positionHashCounts[positionHashKey]) {
                const oldKey = signature(restored);
                positionHashCounts[positionHashKey] = restored.positionCounts?.[oldKey] || 1;
            }
            const repetitionHash = historyHash(positionHashCounts);
            return {
                board: restored.board.map(stack => stack.slice()),
                buildings: restored.buildings,
                turn: restored.turn,
                ply: restored.ply,
                noCapturePlies: restored.noCapturePlies,
                positionHash,
                positionHashKey,
                positionHashCounts,
                historyHash: repetitionHash
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
                score += (ply === 0 ? 7_000 : 8_000) + target.reduce((sum, piece) => sum + (values.get(piece.typeId) || 100), 0) * 2;
            } else if (action.kind === 'stack') {
                const quality = formationValue(moving[moving.length - 1].typeId, target[target.length - 1].typeId);
                score += ply === 0
                    ? (quality > 0 ? 8_000 + quality * 12 : 6_500 + quality * 5)
                    : (quality > 0 ? 1_500 + quality * 12 : -250 + quality * 5);
                if (ply === 0) score += rootDefenseBonuses.get(toAt) || 0;
            }
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

        function prioritizeMove(actions, ttMove) {
            if (!ttMove) return actions;
            const index = actions.findIndex(action => sameAction(action, ttMove));
            return index <= 0 ? actions : [actions[index], ...actions.slice(0, index), ...actions.slice(index + 1)];
        }

        function make(state, action) {
            const fromAt = engine.index(action.from.x, action.from.y), toAt = engine.index(action.to.x, action.to.y);
            const moving = state.board[fromAt], target = state.board[toAt];
            const capturedGeneral = action.kind === 'capture' && target.some(piece => engine.generalTypes.has(piece.typeId));
            const old = { from: moving, to: target, turn: state.turn, ply: state.ply, noCapturePlies: state.noCapturePlies, positionHash: state.positionHash, positionHashKey: state.positionHashKey, historyHash: state.historyHash.slice(), capturedGeneral };
            const nextHash = state.positionHash.slice();
            const fromBefore = engine.hashCell(fromAt, moving), toBefore = engine.hashCell(toAt, target);
            for (let word = 0; word < nextHash.length; word++) nextHash[word] ^= fromBefore[word] ^ toBefore[word];
            state.board[fromAt] = [];
            if (action.kind === 'capture' || action.kind === 'move') state.board[toAt] = moving;
            else state.board[toAt] = target.concat(moving);
            const fromAfter = engine.hashCell(fromAt, state.board[fromAt]), toAfter = engine.hashCell(toAt, state.board[toAt]);
            state.turn = engine.otherSide(state.turn);
            const oldTurnHash = engine.turnHash(old.turn), newTurnHash = engine.turnHash(state.turn);
            for (let word = 0; word < nextHash.length; word++) nextHash[word] ^= fromAfter[word] ^ toAfter[word] ^ oldTurnHash[word] ^ newTurnHash[word];
            state.positionHash = nextHash;
            state.positionHashKey = engine.hashKey(nextHash);
            state.ply++;
            state.noCapturePlies = action.kind === 'capture' ? 0 : state.noCapturePlies + 1;
            const previousCount = state.positionHashCounts[state.positionHashKey] || 0;
            if (previousCount) {
                const previousToken = occurrenceHash(state.positionHashKey, previousCount);
                state.historyHash[0] ^= previousToken[0];
                state.historyHash[1] ^= previousToken[1];
            }
            state.positionHashCounts[state.positionHashKey] = previousCount + 1;
            const nextToken = occurrenceHash(state.positionHashKey, previousCount + 1);
            state.historyHash[0] = (state.historyHash[0] ^ nextToken[0]) >>> 0;
            state.historyHash[1] = (state.historyHash[1] ^ nextToken[1]) >>> 0;
            old.key = state.positionHashKey;
            return old;
        }

        function unmake(state, action, old) {
            const fromAt = engine.index(action.from.x, action.from.y), toAt = engine.index(action.to.x, action.to.y);
            const count = state.positionHashCounts[old.key] || 0;
            if (count <= 1) delete state.positionHashCounts[old.key];
            else state.positionHashCounts[old.key] = count - 1;
            state.historyHash = old.historyHash;
            state.board[fromAt] = old.from;
            state.board[toAt] = old.to;
            state.turn = old.turn;
            state.ply = old.ply;
            state.noCapturePlies = old.noCapturePlies;
            state.positionHash = old.positionHash;
            state.positionHashKey = old.positionHashKey;
        }

        function isDraw(state) {
            if (state.noCapturePlies >= 100 || state.ply >= 4000) return true;
            return (state.positionHashCounts[state.positionHashKey] || 0) >= 3;
        }

        function evaluate(state) {
            const cacheKey = state.positionHashKey;
            if (cacheKey && evaluationCache.has(cacheKey)) return evaluationCache.get(cacheKey);
            let score = 0;
            const cx = (engine.COLS - 1) / 2, cy = (engine.ROWS - 1) / 2;
            const generals = { carnelian: null, turquoise: null };
            const pieceSquares = { carnelian: [], turquoise: [] };
            for (let at = 0; at < size; at++) {
                const stack = state.board[at];
                if (!stack.length) continue;
                const x = at % engine.COLS, y = Math.floor(at / engine.COLS);
                const top = stack[stack.length - 1];
                pieceSquares[top.owner].push({ at, x, y, stack });
                if (stack.some(piece => engine.generalTypes.has(piece.typeId))) generals[top.owner] = { at, x, y };
                for (const piece of stack) {
                    const sign = piece.owner === state.turn ? 1 : -1;
                    const material = values.get(piece.typeId) || 100;
                    const advance = piece.owner === 'carnelian' ? engine.ROWS - 1 - y : y;
                    const center = Math.max(0, 8 - Math.abs(x - cx) - Math.abs(y - cy));
                    const enemyHalf = Math.max(0, advance - Math.floor(engine.ROWS / 2));
                    score += sign * (material + advance * 1.45 + center * 1.8 + enemyHalf * 1.05);

                    // Jumps ignore intervening units, so an invasion of the
                    // back three ranks is dangerous: reward the attacker and
                    // charge the defending side for conceding those landings.
                    if (advance >= engine.ROWS - 3) {
                        const invasion = (advance - (engine.ROWS - 4)) * (18 + Math.min(18, material * 0.025));
                        score += sign * invasion;
                    }
                    if (advance <= 3 && Math.abs(x - cx) <= 3) score += sign * 3;
                }
                if (stack.length > 1) {
                    const sign = top.owner === state.turn ? 1 : -1;
                    const advance = top.owner === 'carnelian' ? engine.ROWS - 1 - y : y;
                    score += sign * formationValue(stack[0].typeId, stack[1].typeId) * 1.35;
                    score += sign * stackCarrierBonus(stack, advance);
                }
            }

            // A nearby enemy makes a valuable lone unit, or an exposed whole
            // stack, easier to lose. Adjacent friendly units provide support.
            for (const side of ['carnelian', 'turquoise']) {
                const sign = side === state.turn ? 1 : -1;
                for (const piece of pieceSquares[side]) {
                    let enemyAdjacent = false, friendAdjacent = false;
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dy) continue;
                        const x = piece.x + dx, y = piece.y + dy;
                        if (x < 0 || x >= engine.COLS || y < 0 || y >= engine.ROWS) continue;
                        const neighbor = state.board[engine.index(x, y)];
                        if (!neighbor.length) continue;
                        if (neighbor[neighbor.length - 1].owner === side) friendAdjacent = true;
                        else enemyAdjacent = true;
                    }
                    if (enemyAdjacent) {
                        const exposed = piece.stack.reduce((sum, unit) => sum + (values.get(unit.typeId) || 100), 0);
                        const safetyWeight = side === state.turn ? 1.9 : 0.55;
                        score -= sign * exposed * (friendAdjacent ? 0.035 : 0.085) * safetyWeight;
                    }
                }

                const general = generals[side];
                if (!general) continue;
                let nearestEnemy = 99, nearbyFriends = 0;
                for (const target of pieceSquares[side === 'carnelian' ? 'turquoise' : 'carnelian']) {
                    nearestEnemy = Math.min(nearestEnemy, Math.max(Math.abs(target.x - general.x), Math.abs(target.y - general.y)));
                }
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                    if (!dx && !dy) continue;
                    const x = general.x + dx, y = general.y + dy;
                    if (x < 0 || x >= engine.COLS || y < 0 || y >= engine.ROWS) continue;
                    const neighbor = state.board[engine.index(x, y)];
                    if (neighbor.length && neighbor[neighbor.length - 1].owner === side) nearbyFriends++;
                }
                const danger = nearestEnemy <= 4 ? [0, 420, 270, 150, 72][nearestEnemy] : 0;
                const cover = Math.min(30, nearbyFriends * 7);
                const ownSafetyWeight = side === state.turn ? 2.0 : 0.55;
                const coverWeight = side === state.turn ? 1.5 : 0.65;
                score += sign * (cover * coverWeight - danger * ownSafetyWeight);
                if (side === state.turn) {
                    const safeMoves = safeGeneralMoveCount(state, side, general.at);
                    score += safeMoves ? Math.min(4, safeMoves) * 16 : -90;
                }
            }
            if (cacheKey) {
                if (evaluationCache.size > 50_000) evaluationCache.clear();
                evaluationCache.set(cacheKey, score);
            }
            return score;
        }

        function scoreToTable(score, ply) {
            if (score > MATE - 10000) return score + ply;
            if (score < -MATE + 10000) return score - ply;
            return score;
        }

        function scoreFromTable(score, ply) {
            if (score > MATE - 10000) return score - ply;
            if (score < -MATE + 10000) return score + ply;
            return score;
        }

        function checkTime() {
            nodes++;
            if ((nodes & 63) === 0 && Date.now() >= deadline) stopped = true;
            return stopped;
        }

        function canReachGeneral(from, moving, target) {
            const targetDx = target.x - from.x, targetDy = target.y - from.y;
            for (const piece of moving) {
                const profile = captureProfiles.get(piece.typeId)?.[piece.owner];
                if (!profile) continue;
                if (profile.direct.has(`${targetDx},${targetDy}`)) return true;
                for (const { dx, dy, maxDistance } of profile.rays) {
                    const distance = dx ? targetDx / dx : targetDy / dy;
                    if (Number.isInteger(distance) && distance >= 1 && distance <= maxDistance
                        && targetDx === dx * distance && targetDy === dy * distance) return true;
                }
            }
            return false;
        }

        function hasGeneralCapture(state, attackerSide, defenderSide) {
            const cacheKey = state.positionHashKey ? `${state.positionHashKey}:${attackerSide}:${defenderSide}` : null;
            if (cacheKey && generalCaptureCache.has(cacheKey)) return generalCaptureCache.get(cacheKey);
            const targets = [];
            for (let at = 0; at < size; at++) {
                const stack = state.board[at];
                if (stack.some(piece => piece.owner === defenderSide && engine.generalTypes.has(piece.typeId))) {
                    targets.push({ x: at % engine.COLS, y: Math.floor(at / engine.COLS) });
                }
            }
            if (!targets.length) return cacheGeneralCapture(cacheKey, false);

            const attackers = [];
            for (let at = 0; at < size; at++) {
                const stack = state.board[at];
                if (!stack.length || stack[stack.length - 1].owner !== attackerSide) continue;
                const from = { x: at % engine.COLS, y: Math.floor(at / engine.COLS) };
                if (targets.some(target => canReachGeneral(from, stack, target))) attackers.push({ from, targets });
            }
            for (const { from } of attackers) {
                for (const destination of engine.legalMoves(state, from, attackerSide)) {
                    if (!destination.options.includes('capture')) continue;
                    if (targets.some(target => destination.x === target.x && destination.y === target.y)) {
                        return cacheGeneralCapture(cacheKey, true);
                    }
                }
            }
            return cacheGeneralCapture(cacheKey, false);
        }

        function cacheGeneralCapture(key, value) {
            if (key) {
                if (generalCaptureCache.size > 50_000) generalCaptureCache.clear();
                generalCaptureCache.set(key, value);
            }
            return value;
        }

        function safeGeneralMoveCount(state, side, fromAt) {
            const key = `${state.positionHashKey}:safe-general:${side}:${fromAt}`;
            if (safeGeneralMoveCache.has(key)) return safeGeneralMoveCache.get(key);
            const from = { x: fromAt % engine.COLS, y: Math.floor(fromAt / engine.COLS) };
            const generalStack = state.board[fromAt];
            let safe = 0;
            for (const destination of engine.legalMoves(state, from, side)) {
                const toAt = engine.index(destination.x, destination.y);
                const displaced = state.board[toAt];
                state.board[fromAt] = [];
                state.board[toAt] = generalStack;
                let threatened = false;
                for (let at = 0; at < size && !threatened; at++) {
                    const stack = state.board[at];
                    if (!stack.length || stack[stack.length - 1].owner !== engine.otherSide(side)) continue;
                    const attacker = { x: at % engine.COLS, y: Math.floor(at / engine.COLS) };
                    if (!canReachGeneral(attacker, stack, destination)) continue;
                    for (const move of engine.legalMoves(state, attacker, engine.otherSide(side))) {
                        if (move.x === destination.x && move.y === destination.y && move.options.includes('capture')) {
                            threatened = true;
                            break;
                        }
                    }
                }
                state.board[fromAt] = generalStack;
                state.board[toAt] = displaced;
                if (!threatened) safe++;
            }
            if (safeGeneralMoveCache.size > 40_000) safeGeneralMoveCache.clear();
            safeGeneralMoveCache.set(key, safe);
            return safe;
        }

        function allowsImmediateGeneralCapture(state, action) {
            const old = make(state, action);
            let unsafe = false;
            if (!old.capturedGeneral && !isDraw(state) && engine.hasLegalMove(state, state.turn)) {
                unsafe = hasGeneralCapture(state, state.turn, engine.otherSide(state.turn));
            }
            unmake(state, action, old);
            return unsafe;
        }

        function allowsForcedGeneralThreat(state, action) {
            const defendingSide = state.turn;
            const old = make(state, action);
            if (old.capturedGeneral || isDraw(state) || !engine.hasLegalMove(state, state.turn)) {
                unmake(state, action, old);
                return false;
            }
            const attackingSide = state.turn;
            for (const reply of generate(state)) {
                const replyOld = make(state, reply);
                let unsafe = replyOld.capturedGeneral;
                if (!unsafe && !isDraw(state)) {
                    unsafe = hasGeneralCapture(state, attackingSide, defendingSide);
                    if (!unsafe && noMoveLoses && !engine.hasLegalMove(state, state.turn)) unsafe = true;
                    if (unsafe && !replyOld.capturedGeneral) {
                        let hasSafeReply = false;
                        for (const defense of generate(state)) {
                            const defenseOld = make(state, defense);
                            let stillLosing = !isDraw(state)
                                && hasGeneralCapture(state, attackingSide, defendingSide);
                            if (stillLosing && noMoveLoses && !engine.hasLegalMove(state, state.turn)) stillLosing = false;
                            unmake(state, defense, defenseOld);
                            if (!stillLosing) { hasSafeReply = true; break; }
                        }
                        unsafe = !hasSafeReply;
                    }
                }
                unmake(state, reply, replyOld);
                if (unsafe) {
                    unmake(state, action, old);
                    return true;
                }
            }
            unmake(state, action, old);
            return false;
        }

        function staticRootScore(state, action) {
            const old = make(state, action);
            let score;
            if (captureGeneralWins && old.capturedGeneral) score = MATE - 1;
            else if (isDraw(state)) score = 0;
            else score = -evaluate(state);
            unmake(state, action, old);
            return score;
        }

        function quiescence(state, alpha, beta, ply, remaining, legalActions, checkExtensions = 2) {
            if (checkTime()) return evaluate(state);
            if (isDraw(state)) return 0;
            const inCheck = captureGeneralWins && hasGeneralCapture(state, engine.otherSide(state.turn), state.turn);
            if (remaining <= 0 && !inCheck) {
                if (captureGeneralWins && hasGeneralCapture(state, state.turn, engine.otherSide(state.turn))) return MATE - ply;
                if (!engine.hasLegalMove(state, state.turn)) return noMoveLoses ? -MATE + ply : 0;
                return evaluate(state);
            }

            const actions = legalActions || generate(state);
            if (!actions.length) return noMoveLoses ? -MATE + ply : 0;
            if (captureGeneralWins && actions.some(action => {
                if (action.kind !== 'capture') return false;
                return state.board[engine.index(action.to.x, action.to.y)].some(piece => engine.generalTypes.has(piece.typeId));
            })) return MATE - ply;

            if (inCheck && checkExtensions <= 0) return evaluate(state) - 1200;
            let best = inCheck ? -Infinity : evaluate(state);
            if (!inCheck && best >= beta) return best;
            if (!inCheck && best > alpha) alpha = best;

            const candidates = ordered(state, inCheck ? actions : actions.filter(action => action.kind === 'capture'), null, ply);
            for (const action of candidates) {
                const old = make(state, action);
                let score;
                if (captureGeneralWins && old.capturedGeneral) score = MATE - (ply + 1);
                else if (isDraw(state)) score = 0;
                else score = -quiescence(state, -beta, -alpha, ply + 1, inCheck ? remaining : remaining - 1, undefined, inCheck ? checkExtensions - 1 : checkExtensions);
                unmake(state, action, old);
                if (score > best) best = score;
                if (score > alpha) alpha = score;
                if (alpha >= beta || stopped) break;
            }
            return best;
        }

        function negamax(state, depth, alpha, beta, ply) {
            if (checkTime()) return evaluate(state);
            if (depth <= 0) {
                if (isDraw(state)) return 0;
                // General threats are extended explicitly below. Avoid a
                // full noisy-capture tree at every leaf on this large board;
                // it consumes the clock before the bot can compare replies.
                return quiescence(state, alpha, beta, ply, 0);
            }
            const actions = generate(state);
            if (!actions.length) return noMoveLoses ? -MATE + ply : 0;
            if (isDraw(state)) return 0;

            const key = transpositionKey(state);
            const entry = table.get(key);
            const originalAlpha = alpha, originalBeta = beta;
            if (entry && entry.depth >= depth) {
                tableHits++;
                const entryScore = scoreFromTable(entry.score, ply);
                if (entry.flag === 'exact') return entryScore;
                if (entry.flag === 'lower') alpha = Math.max(alpha, entryScore);
                else if (entry.flag === 'upper') beta = Math.min(beta, entryScore);
                if (alpha >= beta) return entryScore;
            }
            let bestScore = -Infinity, bestAction = null;
            let actionIndex = 0;
            for (const action of ordered(state, actions, entry?.action, ply)) {
                const old = make(state, action);
                let score;
                if (captureGeneralWins && old.capturedGeneral) score = MATE - (ply + 1);
                else if (isDraw(state)) score = 0;
                else if (actionIndex === 0) {
                    score = -negamax(state, depth - 1, -beta, -alpha, ply + 1);
                } else {
                    // Principal-variation search: most ordered moves are
                    // expected to fail low, so test them with a null window
                    // and spend a full window only when one improves alpha.
                    score = -negamax(state, depth - 1, -alpha - 1, -alpha, ply + 1);
                    if (!stopped && score > alpha && score < beta) {
                        score = -negamax(state, depth - 1, -beta, -alpha, ply + 1);
                    }
                }
                unmake(state, action, old);
                actionIndex++;
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
                const flag = bestScore <= originalAlpha ? 'upper' : bestScore >= originalBeta ? 'lower' : 'exact';
                if (table.size > 100000) table.clear();
                const previous = table.get(key);
                if (!previous || depth >= previous.depth || (flag === 'exact' && previous.flag !== 'exact')) {
                    table.set(key, { depth, score: scoreToTable(bestScore, ply), flag, action: bestAction });
                }
            }
            return bestScore;
        }

        function choose(journal, cursor = journal?.length, thinkingMs = 1000, suppliedState = null) {
            const restored = suppliedState || (Array.isArray(journal) ? engine.replay(journal, cursor) : null);
            if (!restored || restored.result || !Array.isArray(restored.board) || restored.board.length !== size || !Array.isArray(restored.buildings)) return { action: null, depth: 0, nodes: 0, score: null };
            const root = makeState(restored), rootActions = generate(root);
            if (!rootActions.length) return { action: null, depth: 0, nodes: 0, score: -MATE };
            if (generalCaptureCache.size > 40_000) generalCaptureCache.clear();
            if (evaluationCache.size > 40_000) evaluationCache.clear();
            const budget = Math.max(100, Math.min(4000, Number(thinkingMs) || 1000));
            deadline = Date.now() + Math.max(80, budget - Math.min(25, budget * 0.04));
            nodes = 0; tableHits = 0; stopped = false; killers = new Map();
            // Calculate line-blocking stack bonuses when a direct General
            // threat makes defense urgent. Otherwise skip this optional scan
            // and spend the budget on the actual search.
            const generalThreat = captureGeneralWins
                && hasGeneralCapture(root, engine.otherSide(root.turn), root.turn);
            rootDefenseBonuses = generalThreat ? defensiveStackBonuses(root, rootActions) : new Map();
            const rootOrder = ordered(root, rootActions, null, 0);
            // Keep a fast, ordered fallback. Root-wide static scoring used to
            // spend the whole time limit before iterative deepening could run.
            let bestAction = rootOrder[0], bestScore = staticRootScore(root, bestAction), completedDepth = 0;
            for (let depth = 1; depth <= 16 && !stopped; depth++) {
                const alpha = depth > 1 ? bestScore - 80 : -Infinity;
                const beta = depth > 1 ? bestScore + 80 : Infinity;
                let windowScore = -Infinity, windowAction = null, a = alpha;
                const pvOrder = prioritizeMove(rootOrder, table.get(transpositionKey(root))?.action);
                const iterationOrder = prioritizeMove(pvOrder, bestAction);
                // At deeper iterations, search the best ordered root moves
                // first. Keep the previous iteration's best move in the
                // window, and search every legal defense when the General is
                // already under direct attack.
                const rootMoveLimit = depth >= 3 && !generalThreat ? 60 : iterationOrder.length;
                const rootSearchOrder = iterationOrder.slice(0, rootMoveLimit);
                let rootIndex = 0;
                for (const action of rootSearchOrder) {
                    const targetBefore = root.board[engine.index(action.to.x, action.to.y)];
                    const targetGeneral = targetBefore.some(piece => engine.generalTypes.has(piece.typeId));
                    const old = make(root, action);
                    let score;
                    if (captureGeneralWins && old.capturedGeneral) score = MATE - 1;
                    else if (isDraw(root)) score = 0;
                    else {
                        const reduce = depth >= 2 && !generalThreat && rootIndex >= 4 && !targetGeneral;
                        if (reduce) {
                            score = -negamax(root, depth - 2, -a - 1, -a, 1);
                            if (!stopped && score > a) {
                                score = -negamax(root, depth - 1, -a - 1, -a, 1);
                                if (!stopped && score > a && score < beta) {
                                    score = -negamax(root, depth - 1, -beta, -a, 1);
                                }
                            }
                        } else if (rootIndex === 0) {
                            score = -negamax(root, depth - 1, -beta, -a, 1);
                        } else {
                            score = -negamax(root, depth - 1, -a - 1, -a, 1);
                            if (!stopped && score > a && score < beta) {
                                score = -negamax(root, depth - 1, -beta, -a, 1);
                            }
                        }
                    }
                    unmake(root, action, old);
                    rootIndex++;
                    if (stopped) break;
                    if (score > windowScore) { windowScore = score; windowAction = action; }
                    if (score > a) a = score;
                }
                // An interrupted iteration has not compared every root move.
                // Keep the last fully completed iteration's result.
                if (stopped) break;
                if (windowScore <= alpha || windowScore >= beta) {
                    const full = searchRootWindow(root, rootSearchOrder, depth, -Infinity, Infinity, rootSearchOrder);
                    if (!full || stopped) break;
                    windowScore = full.score; windowAction = full.action;
                }
                if (windowAction) { bestAction = windowAction; bestScore = windowScore; completedDepth = depth; }
                if (Math.abs(bestScore) >= MATE - 32) break;
            }

            // A shallow or interrupted search can miss a one-move General
            // loss. Repair that blunder when any legal move avoids it.
            let avoidedImmediateGeneralLoss = false;
            let avoidedPreparedGeneralThreat = false;
            const selectedAllowsImmediateLoss = captureGeneralWins && rootActions.length > 1
                && allowsImmediateGeneralCapture(root, bestAction);
            if (selectedAllowsImmediateLoss) {
                for (const action of rootOrder) {
                    if (sameAction(action, bestAction)) continue;
                    if (allowsImmediateGeneralCapture(root, action)) continue;
                    bestAction = action;
                    bestScore = staticRootScore(root, action);
                    avoidedImmediateGeneralLoss = true;
                    break;
                }
            }
            const selectedAllowsThreatSetup = !selectedAllowsImmediateLoss && captureGeneralWins
                && !generalThreat && completedDepth < 2 && allowsForcedGeneralThreat(root, bestAction);
            if (selectedAllowsThreatSetup) {
                // If search could not finish depth two, reject a move that
                // allows a forced General capture after one opponent reply.
                // Limit extra safety work so a rare repair cannot stall a turn.
                const repairDeadline = Date.now() + Math.min(1_000, Math.max(250, budget * 0.5));
                for (const action of rootOrder.slice(0, 96)) {
                    if (Date.now() >= repairDeadline) break;
                    if (sameAction(action, bestAction)) continue;
                    if (allowsImmediateGeneralCapture(root, action)
                        || allowsForcedGeneralThreat(root, action)) continue;
                    bestAction = action;
                    bestScore = staticRootScore(root, action);
                    avoidedPreparedGeneralThreat = true;
                    break;
                }
            }
            return { action: bestAction, depth: completedDepth, nodes, tableHits, tableSize: table.size, score: bestScore, avoidedImmediateGeneralLoss, avoidedPreparedGeneralThreat, selectedAllowsImmediateLoss, selectedAllowsThreatSetup };
        }

        function searchRootWindow(root, actions, depth, alpha, beta, rootOrder) {
            let best = -Infinity, bestAction = null, a = alpha;
            let actionIndex = 0;
            for (const action of rootOrder) {
                const old = make(root, action);
                let score;
                if (captureGeneralWins && old.capturedGeneral) score = MATE - 1;
                else if (isDraw(root)) score = 0;
                else if (actionIndex === 0) score = -negamax(root, depth - 1, -beta, -a, 1);
                else {
                    score = -negamax(root, depth - 1, -a - 1, -a, 1);
                    if (!stopped && score > a && score < beta) {
                        score = -negamax(root, depth - 1, -beta, -a, 1);
                    }
                }
                unmake(root, action, old);
                actionIndex++;
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
