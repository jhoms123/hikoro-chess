// Hikoro bot search. The rules engine remains authoritative for every move;
// this module adds a time-bounded, bonus-aware search and Hikoro-specific eval.
const rules = require('./gamelogic');

const values = {
    pawn: 100, sult: 200, pilut: 200, kota: 250, fin: 250, yoli: 300,
    chair: 300, zur: 400, kor: 450, jotu: 500, cope: 350,
    greatshield: 500, finor: 500, greathorsegeneral: 800,
    mermaid: 700, neptune: 900, cthulhu: 1000, prince: 10000, lupa: 10000
};
const pieceTypes = Object.keys(values);
const pieceCode = Object.fromEntries(pieceTypes.map((type, index) => [type, index + 1]));
const royalTypes = new Set(['prince', 'lupa']);
const promotableTypes = new Set(['pawn', 'sult', 'pilut']);
const validSquares = Object.freeze(Array.from({length: rules.BOARD_HEIGHT}, (_, y) =>
    Array.from({length: rules.BOARD_WIDTH}, (_, x) => rules.isPositionValid(x, y) ? {x, y} : null)
).flat().filter(Boolean));
const sanctuarySquares = [
    {x: 0, y: 7}, {x: 1, y: 7}, {x: 8, y: 7}, {x: 9, y: 7},
    {x: 0, y: 8}, {x: 1, y: 8}, {x: 8, y: 8}, {x: 9, y: 8}
];
const sanctuarySet = new Set(sanctuarySquares.map(({x, y}) => `${x},${y}`));
const MATE = 1_000_000;
const INF = 1_100_000;
const MAX_TABLE_ENTRIES = 50000;
const MAX_EVAL_ENTRIES = 25000;
const MAX_THREAT_ENTRIES = 16000;
const MAX_MOVE_CACHE_REFERENCES = 10000;
const TT_REPLACEMENT_SAMPLE = 64;
const MAX_SEARCH_CONTEXTS = 16;
const MAX_ROOT_HISTORY = 512;
const MAX_CAPTURE_HISTORY_ENTRIES = 40000;
const MAX_CAPTURE_HISTORY_SCORE = 16000;
const searchContexts = new Map();
const positionHashCache = new WeakMap();
const metadataHashCache = new WeakMap();
const zobristTokenCache = new Map();
const ZOBRIST_MASK = (1n << 64n) - 1n;
const ZOBRIST_SEED = 0x6a09e667f3bcc909n;
const EVAL_WEIGHT_NAMES = [
    'material', 'reserve', 'royalRoute', 'center', 'promotion',
    'protection', 'sanctuaryThreat', 'royalAttack', 'mobility', 'lastRoyal', 'castle'
];
const DEFAULT_EVAL_WEIGHTS = Object.freeze(Object.fromEntries(EVAL_WEIGHT_NAMES.map(name => [name, 1])));
const PIECE_SQUARE_PROFILES = Object.freeze({
    pawn: {center: 0.55, advance: 0.02, gate: 0.28},
    pilut: {center: 0.50, advance: 0.03, gate: 0.30},
    sult: {center: 0.70, advance: 0.04, gate: 0.32},
    kota: {center: 0.80, advance: 0.08, gate: 0.22},
    fin: {center: 0.85, advance: 0.05, gate: 0.22},
    yoli: {center: 0.90, advance: 0.06, gate: 0.28},
    chair: {center: 0.95, advance: 0.04, gate: 0.36},
    zur: {center: 0.90, advance: 0.03, gate: 0.42},
    kor: {center: 0.85, advance: 0.06, gate: 0.30},
    jotu: {center: 0.80, advance: 0.05, gate: 0.34},
    cope: {center: 0.75, advance: 0.06, gate: 0.28},
    greatshield: {center: 0.45, advance: 0.02, gate: 0.42},
    finor: {center: 0.90, advance: 0.03, gate: 0.38},
    greathorsegeneral: {center: 0.72, advance: 0.06, gate: 0.45},
    mermaid: {center: 0.82, advance: 0.06, gate: 0.35},
    neptune: {center: 0.82, advance: 0.03, gate: 0.40},
    cthulhu: {center: 0.78, advance: 0.05, gate: 0.45}
});

const opposite = color => color === 'white' ? 'black' : 'white';
const turn = game => game?.isWhiteTurn ? 'white' : 'black';
const signFor = (color, perspective) => color === perspective ? 1 : -1;
const isSanctuary = (x, y) => sanctuarySet.has(`${x},${y}`);
const inside = (x, y) => x >= 0 && x < rules.BOARD_WIDTH && y >= 0 && y < rules.BOARD_HEIGHT;

function legalMoves(game) {
    if (!game?.boardState || game.gameOver) return [];
    const color = turn(game), moves = [];
    for (const {x, y} of validSquares) {
        if (game.boardState[y]?.[x]?.color !== color) continue;
        for (const to of rules.getValidMoves(game, {square: {x, y}})) {
            moves.push({type: 'board', from: {x, y}, to: {x: to.x, y: to.y}});
        }
    }

    // A bonus action is restricted to its designated board piece; Hikoro does
    // not allow a hand drop until that action has been completed.
    if (!game.bonusMoveInfo) {
        const handTypes = new Set((game[`${color}Captured`] || []).map(piece => piece.type));
        for (const type of handTypes) {
            if (royalTypes.has(type)) continue;
            for (const {x, y} of validSquares) {
                if (!game.boardState[y]?.[x]) moves.push({type: 'drop', piece: {type}, to: {x, y}});
            }
        }
    }
    return moves;
}

function distanceToSanctuary(x, y) {
    let best = Infinity;
    for (const square of sanctuarySquares) {
        best = Math.min(best, Math.max(Math.abs(square.x - x), Math.abs(square.y - y)));
    }
    return best;
}

function pieceMoves(game, color, x, y) {
    const piece = game.boardState[y][x];
    if (!piece) return [];
    const bonus = game.bonusMoveInfo;
    if (bonus && color === turn(game)) {
        if (bonus.pieceX !== x || bonus.pieceY !== y) return [];
        return rules.getValidMoves(game, {square: {x, y}});
    }
    return rules.getValidMovesForPiece(piece, x, y, game.boardState, false);
}

function sanctuaryThreats(game, color) {
    const targets = new Map();
    if (!game?.boardState || game.gameOver) return targets;
    for (const {x, y} of validSquares) {
        const piece = game.boardState[y]?.[x];
        if (!piece || piece.color !== color || !royalTypes.has(piece.type)) continue;
        for (const to of pieceMoves(game, color, x, y)) {
            if (isSanctuary(to.x, to.y)) targets.set(`${to.x},${to.y}`, {x: to.x, y: to.y});
        }
    }
    return targets;
}

function royalCaptureThreats(game, victimColor, onlyLastRoyal = true) {
    const targets = new Map();
    const royals = [];
    for (const {x, y} of validSquares) {
        const piece = game.boardState[y]?.[x];
        if (piece?.color === victimColor && royalTypes.has(piece.type)) royals.push({x, y});
    }
    if (!royals.length || (onlyLastRoyal && royals.length !== 1)) return targets;
    const attacker = opposite(victimColor);
    for (const {x, y} of validSquares) {
        const piece = game.boardState[y]?.[x];
        if (!piece || piece.color !== attacker) continue;
        const moves = pieceMoves(game, attacker, x, y);
        for (const target of royals) {
            if (moves.some(move => move.x === target.x && move.y === target.y)) {
                targets.set(`${target.x},${target.y}`, {
                    x: target.x, y: target.y, kind: 'capture', lastRoyal: royals.length === 1
                });
            }
        }
    }
    return targets;
}

function criticalThreats(game, defenderColor) {
    const threats = new Map();
    for (const [key, square] of sanctuaryThreats(game, opposite(defenderColor))) {
        threats.set(key, {...square, kind: 'sanctuary'});
    }
    for (const [key, square] of royalCaptureThreats(game, defenderColor)) threats.set(key, square);
    return threats;
}

function moveKey(move) {
    if (!move) return '';
    if (move.type === 'drop') return `d:${move.piece?.type || ''}:${move.to.x},${move.to.y}`;
    return `b:${move.from.x},${move.from.y}:${move.to.x},${move.to.y}`;
}

// Shogi engines use capture history because piece value alone is a poor guide
// to which captures are actually productive. Hikoro has a large and uneven
// piece roster, so learn the useful attacker/victim/destination patterns.
function captureHistoryKey(game, move) {
    if (move?.type !== 'board' || !move.from || !move.to) return '';
    const attacker = game.boardState[move.from.y]?.[move.from.x];
    const victim = game.boardState[move.to.y]?.[move.to.x];
    if (!attacker || !victim) return '';
    const square = move.to.y * rules.BOARD_WIDTH + move.to.x;
    return `${attacker.type}:${victim.type}:${square}`;
}

function updateCaptureHistory(history, key, bonus) {
    if (!key) return;
    const previous = history.get(key) || 0;
    // Gravity-style updates stop frequently successful pairs from saturating
    // the table and leave room for new information later in a long game.
    const next = Math.max(-MAX_CAPTURE_HISTORY_SCORE, Math.min(MAX_CAPTURE_HISTORY_SCORE,
        previous + bonus - Math.trunc(previous * Math.abs(bonus) / MAX_CAPTURE_HISTORY_SCORE)));
    if (!history.has(key) && history.size >= MAX_CAPTURE_HISTORY_ENTRIES) {
        history.delete(history.keys().next().value);
    }
    history.delete(key);
    history.set(key, next);
}

function recentRootMoveCounts(game) {
    const counts = new Map();
    for (const move of (game.actionJournal || []).slice(-24)) {
        const key = moveKey(move);
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}

function splitmix64(value) {
    let z = (value + 0x9e3779b97f4a7c15n) & ZOBRIST_MASK;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & ZOBRIST_MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & ZOBRIST_MASK;
    return (z ^ (z >> 31n)) & ZOBRIST_MASK;
}

function zobristToken(tag, index) {
    const cacheKey = `${tag}:${index}`;
    if (zobristTokenCache.has(cacheKey)) return zobristTokenCache.get(cacheKey);
    const value = splitmix64(ZOBRIST_SEED ^ (BigInt(tag) << 48n) ^ BigInt.asUintN(48, BigInt(index)));
    zobristTokenCache.set(cacheKey, value);
    return value;
}

function pieceHash(piece, x, y) {
    if (!piece) return 0n;
    const type = pieceCode[piece.type] || 0;
    const color = piece.color === 'black' ? 1 : 0;
    const square = y * rules.BOARD_WIDTH + x;
    return zobristToken(1, (square * (pieceTypes.length + 1) + type) * 2 + color);
}

function handHash(hand, side) {
    const counts = new Map();
    for (const piece of hand || []) counts.set(piece.type, (counts.get(piece.type) || 0) + 1);
    let hash = 0n;
    for (let index = 0; index < pieceTypes.length; index++) {
        const count = counts.get(pieceTypes[index]) || 0;
        hash ^= zobristToken(2, side * pieceTypes.length * 7 + index * 7 + Math.min(6, count));
    }
    return hash;
}

function metadataHash(game) {
    if (metadataHashCache.has(game)) return metadataHashCache.get(game);
    let hash = 0n;
    if (!game.isWhiteTurn) hash ^= zobristToken(3, 1);
    hash ^= handHash(game.whiteCaptured, 0) ^ handHash(game.blackCaptured, 1);
    if (game.bonusMoveInfo) {
        const {pieceX, pieceY} = game.bonusMoveInfo;
        hash ^= zobristToken(4, pieceY * rules.BOARD_WIDTH + pieceX + 1);
    }
    hash ^= zobristToken(5, Math.trunc(Number(game.turnCount) || 0));
    if (game.whitePrinceOnBoard === false) hash ^= zobristToken(6, 1);
    if (game.blackPrinceOnBoard === false) hash ^= zobristToken(6, 2);
    if (game.gameOver) {
        hash ^= zobristToken(7, 1);
        hash ^= zobristToken(8, game.winner === 'white' ? 1 : game.winner === 'black' ? 2 : 3);
    }
    metadataHashCache.set(game, hash);
    return hash;
}

function positionHashSlow(game) {
    if (!game?.boardState) return 0n;
    let hash = metadataHash(game);
    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
            hash ^= pieceHash(game.boardState[y]?.[x], x, y);
        }
    }
    return hash;
}

function searchHash(game) {
    if (!game?.boardState) return 0n;
    if (positionHashCache.has(game)) return positionHashCache.get(game);
    const hash = positionHashSlow(game);
    positionHashCache.set(game, hash);
    return hash;
}

function changedSquaresForMove(game, move) {
    const changed = new Set();
    const add = (x, y) => changed.add(y * rules.BOARD_WIDTH + x);
    if (move?.type === 'drop') {
        add(move.to.x, move.to.y);
    } else if (move?.type === 'board') {
        add(move.from.x, move.from.y);
        add(move.to.x, move.to.y);
        const movingPiece = game.boardState[move.from.y]?.[move.from.x];
        if (movingPiece?.type === 'jotu') {
            const dx = Math.sign(move.to.x - move.from.x);
            const dy = Math.sign(move.to.y - move.from.y);
            let x = move.from.x + dx, y = move.from.y + dy;
            while ((x !== move.to.x || y !== move.to.y) && inside(x, y)) {
                add(x, y);
                x += dx;
                y += dy;
            }
        }
    }
    return changed;
}

function updateSearchHash(game, move, nextGame, parentHash) {
    if (move?.type !== 'board' && move?.type !== 'drop') return positionHashSlow(nextGame);
    let hash = parentHash ^ metadataHash(game) ^ metadataHash(nextGame);
    for (const square of changedSquaresForMove(game, move)) {
        const x = square % rules.BOARD_WIDTH;
        const y = Math.floor(square / rules.BOARD_WIDTH);
        hash ^= pieceHash(game.boardState[y]?.[x], x, y);
        hash ^= pieceHash(nextGame.boardState[y]?.[x], x, y);
    }
    return hash & ZOBRIST_MASK;
}

function boundedSet(map, key, value, limit) {
    if (map.has(key)) map.delete(key);
    else if (map.size >= limit) map.delete(map.keys().next().value);
    map.set(key, value);
}

function ttRetention(entry, generation) {
    const age = Math.max(0, generation - (entry.generation || 0));
    return entry.depth * 4 + (entry.royalCritical ? 24 : 0) - age * 18;
}

function storeTransposition(context, key, value, limit) {
    const table = context.table;
    const next = {...value, generation: context.generation, royalCritical: Boolean(value.royalCritical)};
    const old = table.get(key);
    if (old) {
        if (old.depth > next.depth && ttRetention(old, context.generation) >= ttRetention(next, context.generation)) {
            table.delete(key);
            table.set(key, {...old, generation: context.generation});
            return;
        }
        table.delete(key);
    } else if (table.size >= limit) {
        // Sample the oldest cluster instead of evicting blindly: deeper and
        // royal-critical lines survive, while stale shallow entries turn over.
        let weakestKey = null;
        let weakestScore = Infinity;
        let sampled = 0;
        for (const [candidateKey, candidate] of table) {
            const score = ttRetention(candidate, context.generation);
            if (score < weakestScore) {
                weakestScore = score;
                weakestKey = candidateKey;
            }
            if (++sampled >= TT_REPLACEMENT_SAMPLE) break;
        }
        if (weakestKey === null || ttRetention(next, context.generation) < weakestScore) return;
        table.delete(weakestKey);
    }
    table.set(key, next);
}

function getSearchContext(sessionId, color, weightKey) {
    const namespace = sessionId === undefined || sessionId === null ? 'shared' : String(sessionId);
    const key = `${namespace}:${color}:${weightKey}`;
    let context = searchContexts.get(key);
    if (!context) {
        context = {
            table: new Map(), evalCache: new Map(), threatCache: new Map(),
            moveCache: new Map(), moveCacheReferences: 0,
            history: new Map(), captureHistory: new Map(), killers: [], uses: 0, generation: 0,
            rootPositions: new Map(), rootHistory: [], rootProgress: null
        };
        if (searchContexts.size >= MAX_SEARCH_CONTEXTS) searchContexts.delete(searchContexts.keys().next().value);
    } else {
        searchContexts.delete(key);
    }
    context.uses++;
    context.generation++;
    searchContexts.set(key, context);
    return context;
}

function cachedCriticalThreats(game, color, hash, cache) {
    const key = `${hash.toString(16)}:${color}`;
    if (cache.has(key)) return cache.get(key);
    const threats = criticalThreats(game, color);
    boundedSet(cache, key, threats, MAX_THREAT_ENTRIES);
    return threats;
}

function boardAndHandKey(game, includeTurnCount) {
    const cells = [];
    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
            const piece = game.boardState[y]?.[x];
            if (!piece) {
                cells.push('.');
                continue;
            }
            const code = pieceCode[piece.type] || 0;
            cells.push(String.fromCharCode(65 + code * 2 + (piece.color === 'black' ? 1 : 0)));
        }
    }
    const handKey = hand => {
        const counts = new Map();
        for (const piece of hand || []) counts.set(piece.type, (counts.get(piece.type) || 0) + 1);
        return [...counts].sort((a, b) => (pieceCode[a[0]] || 0) - (pieceCode[b[0]] || 0))
            .map(([type, count]) => `${pieceCode[type] || 0}=${count}`).join(',');
    };
    const bonus = game.bonusMoveInfo
        ? `${game.bonusMoveInfo.pieceX},${game.bonusMoveInfo.pieceY}` : '-';
    return `${cells.join('')}|${game.isWhiteTurn ? 'w' : 'b'}|${bonus}` +
        `|${handKey(game.whiteCaptured)}|${handKey(game.blackCaptured)}` +
        `${includeTurnCount ? `|${Number(game.turnCount) || 0}` : ''}` +
        `|${game.whitePrinceOnBoard === false ? 0 : 1}` +
        `${game.blackPrinceOnBoard === false ? 0 : 1}` +
        `${includeTurnCount ? `|${game.gameOver ? game.winner || 'over' : '-'}` : ''}`;
}

function positionKey(game) {
    return boardAndHandKey(game, true);
}

// Repetition identity ignores the move counter and terminal bookkeeping.
// The board, side to move, reserves, royal state, and pending bonus action
// determine whether the same playable position has returned.
function repetitionKey(game) {
    return boardAndHandKey(game, false);
}

function rootProgressSnapshot(game, color) {
    const counts = new Map();
    const add = (piece, side) => {
        const key = `${side}:${piece.type}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    };
    for (const row of game.boardState) {
        for (const piece of row) if (piece) add(piece, piece.color);
    }
    for (const side of ['white', 'black']) {
        for (const piece of game[`${side}Captured`] || []) add(piece, side);
    }
    const inventory = [...counts].sort(([a], [b]) => a.localeCompare(b))
        .map(([piece, count]) => `${piece}=${count}`).join(',');
    let nearestRoyal = Infinity;
    for (const {x, y} of validSquares) {
        const piece = game.boardState[y]?.[x];
        if (piece?.color === color && royalTypes.has(piece.type)) {
            nearestRoyal = Math.min(nearestRoyal, distanceToSanctuary(x, y));
        }
    }
    return {inventory, nearestRoyal};
}

function observeRootProgress(context, game, color) {
    const snapshot = rootProgressSnapshot(game, color);
    const previous = context.rootProgress;
    if (!previous) {
        context.rootProgress = {
            inventory: snapshot.inventory,
            bestRoyalDistance: snapshot.nearestRoyal,
            quietDecisions: 0
        };
        return 0;
    }
    const improvedRoyalRoute = snapshot.nearestRoyal < previous.bestRoyalDistance;
    const madeMaterialProgress = snapshot.inventory !== previous.inventory;
    const quietDecisions = madeMaterialProgress || improvedRoyalRoute ? 0 : previous.quietDecisions + 1;
    context.rootProgress = {
        inventory: snapshot.inventory,
        bestRoyalDistance: madeMaterialProgress ? snapshot.nearestRoyal :
            Math.min(previous.bestRoyalDistance, snapshot.nearestRoyal),
        quietDecisions
    };
    return quietDecisions;
}

function recordRootDecision(context, key, move) {
    if (!move) return;
    const keyOfMove = moveKey(move);
    let position = context.rootPositions.get(key);
    if (!position) {
        position = {visits: 0, moves: new Map()};
        context.rootPositions.set(key, position);
    }
    position.visits++;
    position.moves.set(keyOfMove, (position.moves.get(keyOfMove) || 0) + 1);
    context.rootHistory.push({key, move: keyOfMove});
    if (context.rootHistory.length > MAX_ROOT_HISTORY) {
        const expired = context.rootHistory.shift();
        const oldPosition = context.rootPositions.get(expired.key);
        if (oldPosition) {
            oldPosition.visits--;
            const moveCount = (oldPosition.moves.get(expired.move) || 0) - 1;
            if (moveCount > 0) oldPosition.moves.set(expired.move, moveCount);
            else oldPosition.moves.delete(expired.move);
            if (oldPosition.visits <= 0) context.rootPositions.delete(expired.key);
        }
    }
}

function cachedLegalMoves(game, context, stats, hash = searchHash(game)) {
    const key = hash.toString(16);
    const cached = context.moveCache.get(key);
    if (cached) {
        context.moveCache.delete(key);
        context.moveCache.set(key, cached);
        if (stats) stats.legalMoveCacheHits++;
        return cached.moves;
    }
    if (stats) stats.legalMoveCacheMisses++;
    const moves = legalMoves(game);
    if (moves.length > 0 && moves.length <= MAX_MOVE_CACHE_REFERENCES) {
        while (context.moveCache.size &&
            context.moveCacheReferences + moves.length > MAX_MOVE_CACHE_REFERENCES) {
            const oldestKey = context.moveCache.keys().next().value;
            const oldest = context.moveCache.get(oldestKey);
            context.moveCache.delete(oldestKey);
            context.moveCacheReferences -= oldest?.count || 0;
        }
        context.moveCache.set(key, {moves, count: moves.length});
        context.moveCacheReferences += moves.length;
    }
    return moves;
}

function isHighImpactMove(game, move) {
    if (!move || move.type !== 'board') return false;
    const piece = game.boardState[move.from.y]?.[move.from.x];
    const target = game.boardState[move.to.y]?.[move.to.x];
    return Boolean(piece && (royalTypes.has(piece.type) || values[piece.type] >= 700) ||
        target && (royalTypes.has(target.type) || values[target.type] >= 700));
}

function isPromotionCandidate(game, move) {
    if (move.type !== 'board') return false;
    const piece = game.boardState[move.from.y]?.[move.from.x];
    if (!piece) return false;
    const target = game.boardState[move.to.y]?.[move.to.x];
    if (target && ['fin', 'greathorsegeneral', 'mermaid'].includes(piece.type)) return true;
    if (!promotableTypes.has(piece.type)) return false;
    return piece.color === 'white' ? move.to.y > 8 : move.to.y < 7;
}

const longRangeDropTypes = new Set([
    'kota', 'zur', 'fin', 'chair', 'jotu', 'finor',
    'greathorsegeneral', 'neptune', 'cthulhu'
]);

function createDropTacticalContext(game, allowCheckingDrops = true) {
    const enemy = opposite(turn(game));
    const royals = [];
    const allRoyals = [];
    for (const {x, y} of validSquares) {
        const piece = game.boardState[y]?.[x];
        if (piece && royalTypes.has(piece.type)) {
            allRoyals.push({x, y, color: piece.color});
            if (piece.color === enemy) royals.push({x, y});
        }
    }
    return {
        royal: allowCheckingDrops && royals.length === 1 ? royals[0] : null,
        allRoyals, cache: new Map()
    };
}

function dropAttacksLastRoyal(game, move, context) {
    if (move.type !== 'drop' || game.bonusMoveInfo || !context?.royal) return false;
    const {x, y} = move.to;
    const cacheKey = `${move.piece?.type}:${x},${y}`;
    if (context.cache.has(cacheKey)) return context.cache.get(cacheKey);
    const royal = context.royal;
    const dx = Math.abs(royal.x - x), dy = Math.abs(royal.y - y);
    const aligned = dx === 0 || dy === 0 || dx === dy;
    const plausible = Math.max(dx, dy) <= 3 || (longRangeDropTypes.has(move.piece.type) && aligned);
    if (!plausible || game.boardState[y]?.[x]) {
        context.cache.set(cacheKey, false);
        return false;
    }

    // Drops are rare in a tactical extension. Test on a shallow scratch board
    // and use the authoritative move generator, including Hikoro protection,
    // blockers, directional movement, and palace restrictions.
    const board = game.boardState.slice();
    board[y] = game.boardState[y].slice();
    const droppedPiece = {type: move.piece.type, color: turn(game)};
    board[y][x] = droppedPiece;
    const attacks = rules.getValidMovesForPiece(droppedPiece, x, y, board, false)
        .some(destination => destination.x === royal.x && destination.y === royal.y);
    context.cache.set(cacheKey, attacks);
    return attacks;
}

function isForcingMove(game, move, dropContext = null) {
    if (move.type === 'drop') return dropAttacksLastRoyal(game, move, dropContext || createDropTacticalContext(game));
    const piece = game.boardState[move.from.y]?.[move.from.x];
    if (!piece) return false;
    const target = game.boardState[move.to.y]?.[move.to.x];
    if (target || isPromotionCandidate(game, move)) return true;
    if (royalTypes.has(piece.type) && isSanctuary(move.to.x, move.to.y)) return true;
    if (!game.bonusMoveInfo && ['greathorsegeneral', 'cthulhu'].includes(piece.type)) return true;
    return false;
}

function nearCriticalArea(game, move, dropContext) {
    const piece = move.type === 'board' ? game.boardState[move.from.y]?.[move.from.x] : null;
    if (piece && royalTypes.has(piece.type)) return true;
    const squares = move.type === 'drop' ? [move.to] : [move.from, move.to];
    for (const square of squares) {
        if (distanceToSanctuary(square.x, square.y) <= 2) return true;
        if ((dropContext?.allRoyals || []).some(royal =>
            Math.max(Math.abs(royal.x - square.x), Math.abs(royal.y - square.y)) <= 2)) return true;
    }
    return false;
}

function lateMoveReduction(game, move, moveIndex, depth, threats, dropContext, preferred) {
    if (depth < 3 || game.bonusMoveInfo || threats.size || moveKey(move) === preferred) return 0;
    if (isForcingMove(game, move, dropContext) || nearCriticalArea(game, move, dropContext)) return 0;
    if (move.type === 'drop') {
        if (depth < 4 || moveIndex < 8) return 0;
        return depth >= 8 && moveIndex >= 24 ? 2 : 1;
    }
    if (moveIndex < 3) return 0;
    return depth >= 8 && moveIndex >= 12 ? 2 : 1;
}

function centerValue(x, y) {
    return Math.max(0, 6 - Math.abs(x - 4.5) - Math.abs(y - 7.5)) * 5;
}

function pieceSquareValue(piece, x, y) {
    const profile = PIECE_SQUARE_PROFILES[piece.type] || {center: 0.7, advance: 0.04, gate: 0.3};
    const progress = piece.color === 'white' ? y : rules.BOARD_HEIGHT - 1 - y;
    const gatePressure = Math.max(0, 5 - distanceToSanctuary(x, y));
    return centerValue(x, y) * profile.center +
        Math.max(0, progress - 3) * profile.advance + gatePressure * profile.gate;
}

function royalCastleValue(game, color, sideRoyals) {
    if (!sideRoyals.length) return 0;
    const enemyDirection = color === 'white' ? 1 : -1;
    const routeScale = distance => Math.min(1, 0.25 + distance * 0.15);
    let score = 0;

    for (const {piece, x, y} of sideRoyals) {
        const scale = routeScale(distanceToSanctuary(x, y)) * (sideRoyals.length === 1 ? 1.2 : 1);
        const allyAt = (dx, dy) => {
            const ally = game.boardState[y + dy]?.[x + dx];
            return ally?.color === color && !royalTypes.has(ally.type) ? ally : null;
        };
        const frontLeft = allyAt(-1, enemyDirection);
        const frontRight = allyAt(1, enemyDirection);
        const frontCenter = allyAt(0, enemyDirection);
        const leftGuard = allyAt(-1, 0);
        const rightGuard = allyAt(1, 0);
        let formation = 0;

        // Hikoro's front-gate shell: two guards flank the royal's approach
        // side; a Greatshield in the center completes the protected screen.
        if (frontLeft && frontRight) formation += 42;
        else if (frontLeft || frontRight) formation += 10;
        if (frontCenter?.type === 'greatshield' && rules.isProtected(piece, x, y, game.boardState)) {
            formation += 34;
        }

        // Side guards form a compact palace wall without rewarding a pile of
        // nearby pieces or blocking the royal's route to the sanctuary.
        if (leftGuard && rightGuard) formation += 22;
        if (rules.isProtected(piece, x, y, game.boardState)) formation += 12;
        score += Math.min(82, formation) * scale;
    }

    const lupa = sideRoyals.find(royal => royal.piece.type === 'lupa');
    const prince = sideRoyals.find(royal => royal.piece.type === 'prince');
    if (lupa && prince) {
        const separation = Math.max(Math.abs(lupa.x - prince.x), Math.abs(lupa.y - prince.y));
        if (separation <= 2) {
            const routeDistance = Math.min(distanceToSanctuary(lupa.x, lupa.y), distanceToSanctuary(prince.x, prince.y));
            score += (separation === 1 ? 26 : 16) * routeScale(routeDistance);
        }
    }
    return score;
}

function orderMoves(game, moves, preferredKey, killers, history, ply, adjustScore = null, captureHistory = null) {
    const enemy = opposite(turn(game));
    const enemyRoyals = [];
    for (const {x, y} of validSquares) {
        const piece = game.boardState[y]?.[x];
        if (piece?.color === enemy && royalTypes.has(piece.type)) enemyRoyals.push({x, y});
    }
    return moves.map(move => {
        const key = moveKey(move);
        let score = key === preferredKey ? 1_000_000 : 0;
        const killerList = killers[ply] || [];
        if (killerList.includes(key)) score += 50000;
        score += history.get(key) || 0;
        if (move.type === 'drop') {
            const typeValue = values[move.piece.type] || 100;
            let nearRoyal = 0;
            for (const royal of enemyRoyals) {
                nearRoyal = Math.max(nearRoyal, 8 - distanceToSanctuary(move.to.x, move.to.y) -
                    Math.max(Math.abs(royal.x - move.to.x), Math.abs(royal.y - move.to.y)));
            }
            score += 80 + typeValue * 0.08 + centerValue(move.to.x, move.to.y) + Math.max(0, nearRoyal) * 6;
            if (isSanctuary(move.to.x, move.to.y)) score += 90;
        } else {
            const piece = game.boardState[move.from.y]?.[move.from.x];
            const target = game.boardState[move.to.y]?.[move.to.x];
            if (target) {
                score += 10000 + (values[target.type] || 100) * 12 - (values[piece?.type] || 100);
                score += captureHistory?.get(captureHistoryKey(game, move)) || 0;
            }
            if (target && royalTypes.has(target.type)) score += 120000;
            if (piece) score += centerValue(move.to.x, move.to.y) - centerValue(move.from.x, move.from.y);
            if (piece && royalTypes.has(piece.type)) {
                score += (distanceToSanctuary(move.from.x, move.from.y) - distanceToSanctuary(move.to.x, move.to.y)) * 700;
                if (isSanctuary(move.to.x, move.to.y)) score += 500000;
            }
            if (isPromotionCandidate(game, move)) score += 12000;
            if (piece && ['greathorsegeneral', 'cthulhu'].includes(piece.type) && !target) score += 1600;
        }
        if (adjustScore) score += adjustScore(move);
        return {move, key, score};
    }).sort((a, b) => b.score - a.score).map(entry => entry.move);
}

function selectCandidates(game, ordered, width, emergencyTargets = null, suppliedDropContext = null) {
    const selected = [], seen = new Set();
    const dropContext = suppliedDropContext || createDropTacticalContext(game);
    const forcingCache = new Map();
    const isForcing = move => {
        const key = moveKey(move);
        if (!forcingCache.has(key)) forcingCache.set(key, isForcingMove(game, move, dropContext));
        return forcingCache.get(key);
    };
    const include = move => {
        const key = moveKey(move);
        if (!seen.has(key)) {
            seen.add(key);
            selected.push(move);
        }
    };
    const threatened = emergencyTargets?.size > 0;

    if (threatened || game.bonusMoveInfo) {
        for (const move of ordered) {
            if (move.type === 'board') {
                include(move);
                continue;
            }
            if (move.type !== 'drop') continue;
            for (const target of emergencyTargets?.values?.() || []) {
                const dx = Math.abs(move.to.x - target.x), dy = Math.abs(move.to.y - target.y);
                const exactSanctuaryBlock = target.kind === 'sanctuary' && dx === 0 && dy === 0;
                const adjacentShield = target.kind === 'capture' && move.piece.type === 'greatshield' && dx <= 1 && dy <= 1 && (dx || dy);
                const color = turn(game);
                const pilutGuard = target.kind === 'capture' && move.piece.type === 'pilut' && dx === 0 &&
                    move.to.y === target.y + (color === 'white' ? 1 : -1);
                if (exactSanctuaryBlock || adjacentShield || pilutGuard) {
                    include(move);
                    break;
                }
            }
        }
        return selected;
    }

    const forcingKeys = new Set();
    for (const move of ordered) if (isForcing(move)) forcingKeys.add(moveKey(move));
    const bonusCandidates = new Map();
    const bonusLimit = Math.max(1, Math.min(4, Math.ceil(width / 12)));
    for (const move of ordered) {
        if (!forcingKeys.has(moveKey(move))) continue;
        const piece = move.type === 'board' ? game.boardState[move.from.y]?.[move.from.x] : null;
        const quietBonus = !game.bonusMoveInfo && !game.boardState[move.to.y]?.[move.to.x] &&
            ['greathorsegeneral', 'cthulhu'].includes(piece?.type);
        if (quietBonus) {
            const source = `${move.from.x},${move.from.y}`;
            const count = bonusCandidates.get(source) || 0;
            if (count >= bonusLimit) continue;
            bonusCandidates.set(source, count + 1);
        }
        include(move);
    }
    let quietCount = 0;
    for (const move of ordered) {
        if (seen.has(moveKey(move)) || forcingKeys.has(moveKey(move))) continue;
        if (quietCount++ >= width) break;
        include(move);
    }
    return selected;
}

// The shared rules engine logs promotions/captures while applying moves. Bot
// search may apply thousands of valid hypothetical moves, so keep that internal
// search chatter out of the server log and restore the logger immediately.
function applyMove(game, move, color) {
    const beforeHash = searchHash(game);
    let result;
    if (typeof rules.makeMoveForSearch === 'function') {
        result = rules.makeMoveForSearch(game, move, color);
    } else {
        // The current website rules export makeMove only. It clones positions,
        // so it is safe for search; silence its legacy event logs during this
        // synchronous hypothetical move and restore the loggers immediately.
        const log = console.log, warn = console.warn;
        console.log = () => {};
        console.warn = () => {};
        try {
            result = rules.makeMove(game, move, color);
        } finally {
            console.log = log;
            console.warn = warn;
        }
    }
    if (result.success) {
        positionHashCache.set(result.updatedGame, updateSearchHash(game, move, result.updatedGame, beforeHash));
    }
    return result;
}

function handMobilityFactor(game) {
    let empty = 0;
    for (const {x, y} of validSquares) if (!game.boardState[y]?.[x]) empty++;
    return 0.42 + 0.3 * Math.min(1, empty / 30);
}

function mobilityForSide(game, color) {
    let total = 0;
    for (const {x, y} of validSquares) {
        const piece = game.boardState[y]?.[x];
        if (!piece || piece.color !== color) continue;
        const moves = pieceMoves(game, color, x, y);
        total += Math.min(10, moves.length);
        if (total >= 100) return 100;
    }
    return total;
}

function normalizeEvalWeights(weights = null) {
    const normalized = {};
    for (const name of EVAL_WEIGHT_NAMES) {
        const value = Number(weights?.[name]);
        normalized[name] = Number.isFinite(value) ? Math.max(0.25, Math.min(1.75, value)) : 1;
    }
    return normalized;
}

function evalWeightKey(weights) {
    return EVAL_WEIGHT_NAMES.map(name => weights[name].toFixed(3)).join(',');
}

function evaluateFeatures(game) {
    const features = Object.fromEntries(EVAL_WEIGHT_NAMES.map(name => [name, 0]));
    if (!game?.boardState || game.gameOver) return features;
    const handFactor = handMobilityFactor(game);
    const royals = {white: [], black: []};

    for (const {x, y} of validSquares) {
            const piece = game.boardState[y]?.[x];
            if (!piece) continue;
            const side = piece.color === 'white' ? 1 : -1;
            const value = values[piece.type] || 100;
            features.material += side * value;
            if (royalTypes.has(piece.type)) {
                royals[piece.color].push({piece, x, y});
                const distance = distanceToSanctuary(x, y);
                features.royalRoute += side * (260 / (distance + 1));
                const moves = pieceMoves(game, piece.color, x, y);
                const bestDistance = moves.reduce((best, move) => Math.min(best,
                    distanceToSanctuary(move.x, move.y)), distance);
                features.royalRoute += side * Math.max(0, distance - bestDistance) * 45;
                if (moves.some(move => isSanctuary(move.x, move.y))) features.royalRoute += side * 1200;
                if (rules.isProtected(piece, x, y, game.boardState)) features.protection += side * 110;
                let nearbyFriends = 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const neighbor = game.boardState[y + dy]?.[x + dx];
                    if (neighbor?.color === piece.color) nearbyFriends++;
                }
                features.protection += side * Math.min(nearbyFriends, 4) * 18;
            } else {
                features.center += side * pieceSquareValue(piece, x, y);
                if (promotableTypes.has(piece.type)) {
                    const advance = piece.color === 'white' ? y : 15 - y;
                    features.promotion += side * Math.max(0, advance - 4) * 10;
                }
                if (rules.isProtected(piece, x, y, game.boardState)) features.protection += side * Math.min(60, value * 0.08);
            }
    }

    features.castle = royalCastleValue(game, 'white', royals.white) -
        royalCastleValue(game, 'black', royals.black);

    for (const side of ['white', 'black']) {
        const sign = side === 'white' ? 1 : -1;
        for (const piece of game[`${side}Captured`] || []) features.reserve += sign * (values[piece.type] || 100) * handFactor;
    }

    const whiteThreats = sanctuaryThreats(game, 'white').size;
    const blackThreats = sanctuaryThreats(game, 'black').size;
    features.sanctuaryThreat += (whiteThreats - blackThreats) * 850;
    const whiteRoyalCaptureThreat = royalCaptureThreats(game, 'white').size;
    const blackRoyalCaptureThreat = royalCaptureThreats(game, 'black').size;
    features.royalAttack += (blackRoyalCaptureThreat - whiteRoyalCaptureThreat) * 2400;
    features.mobility += (mobilityForSide(game, 'white') - mobilityForSide(game, 'black')) * 2;

    // A lone surviving royal is much closer to a capture-based loss.
    for (const side of ['white', 'black']) {
        const onBoard = royals[side].length;
        if (onBoard === 1) features.lastRoyal += (side === 'white' ? 1 : -1) * -360;
        else if (onBoard === 0 && game[`${side}PrinceOnBoard`] === false) {
            features.lastRoyal += side === 'white' ? -MATE : MATE;
        }
    }
    return features;
}

function evaluateWhite(game, weights = DEFAULT_EVAL_WEIGHTS) {
    if (game?.gameOver) {
        if (game.winner === 'draw') return 0;
        return game.winner === 'white' ? MATE : -MATE;
    }
    const features = evaluateFeatures(game);
    return EVAL_WEIGHT_NAMES.reduce((score, name) => score + features[name] * weights[name], 0);
}

function evaluate(game, color = turn(game), weights = DEFAULT_EVAL_WEIGHTS) {
    const score = evaluateWhite(game, normalizeEvalWeights(weights));
    return color === 'white' ? score : -score;
}

function immediateWinningMove(game, moves, color) {
    for (const move of moves) {
        if (move.type !== 'board') continue;
        const piece = game.boardState[move.from.y]?.[move.from.x];
        if (!piece) continue;
        if (royalTypes.has(piece.type) && isSanctuary(move.to.x, move.to.y)) return move;
        const target = game.boardState[move.to.y]?.[move.to.x];
        if (!target || !royalTypes.has(target.type)) continue;
        const result = applyMove(game, move, color);
        if (result.success && result.updatedGame.gameOver && result.updatedGame.winner === color) return move;
    }
    return null;
}

function chooseMove(game, options = {}) {
    if (!game?.boardState || game.gameOver) return null;
    const budgetMs = Math.max(25, Math.min(4000, Number(options.budgetMs) || 1000));
    const width = Math.max(10, Math.min(32, Number(options.width) || Math.round(8 + budgetMs / 500)));
    const rootWidth = Math.max(12, Math.min(32, Number(options.rootWidth) || Math.round(10 + budgetMs / 500)));
    const maxDepth = Math.max(1, Math.min(16, Number(options.maxDepth) || 12));
    const qDepth = Math.max(1, Math.min(8, Number(options.quiescenceDepth) || 1));
    const enablePvs = options.enablePvs !== false;
    const enableLmr = options.enableLmr !== false;
    const enableAspiration = options.enableAspiration !== false;
    const enableDropQuiescence = options.enableDropQuiescence !== false;
    const requestedAspirationWindow = Number(options.aspirationWindow);
    const aspirationBaseWindow = Number.isFinite(requestedAspirationWindow) && requestedAspirationWindow > 0
        ? Math.min(INF, requestedAspirationWindow) : null;
    const deadline = Date.now() + budgetMs;
    const rootColor = turn(game);
    const evaluationWeights = normalizeEvalWeights(options.evaluationWeights);
    const weightKey = evalWeightKey(evaluationWeights);
    const context = getSearchContext(options.searchSessionId, rootColor, weightKey);
    const {table, evalCache, history, captureHistory, killers} = context;
    const repetitionAware = options.searchSessionId !== undefined && options.searchSessionId !== null;
    const rootRepetitionKey = repetitionKey(game);
    const priorRootPosition = repetitionAware ? context.rootPositions.get(rootRepetitionKey) : null;
    const rootPositionVisits = priorRootPosition?.visits || 0;
    const quietRootDecisions = repetitionAware ? observeRootProgress(context, game, rootColor) : 0;
    const searchPath = new Set([rootRepetitionKey]);
    if (repetitionAware) {
        for (const position of context.rootHistory) searchPath.add(position.key);
    }
    const ttStartSize = table.size;
    const moveCacheStats = {legalMoveCacheHits: 0, legalMoveCacheMisses: 0};
    let nodes = 0, ttHits = 0, pvsResearches = 0, lmrReductions = 0, lmrResearches = 0;
    let aspirationResearches = 0, aborted = false, completedDepth = 0, completedScore = 0;
    let repetitionPathHits = 0, ttStoresSkippedForRepetition = 0, rootCyclePenaltyMax = 0;

    const rootMoves = cachedLegalMoves(game, context, moveCacheStats, searchHash(game));
    if (!rootMoves.length) return null;
    const rootThreats = criticalThreats(game, rootColor);
    const rootDropContext = createDropTacticalContext(game, enableDropQuiescence);
    const journalMoveCounts = recentRootMoveCounts(game);
    const rootCyclePenalty = move => {
        if (rootThreats.size) return 0;
        if (move.type === 'board') {
            const piece = game.boardState[move.from.y]?.[move.from.x];
            const target = game.boardState[move.to.y]?.[move.to.x];
            if (target || isPromotionCandidate(game, move)) return 0;
            if (piece && royalTypes.has(piece.type)) {
                if (isSanctuary(move.to.x, move.to.y) ||
                    distanceToSanctuary(move.to.x, move.to.y) < distanceToSanctuary(move.from.x, move.from.y)) return 0;
            }
        } else if (isForcingMove(game, move, rootDropContext)) {
            return 0;
        }
        const key = moveKey(move);
        const journalPenalty = Math.min(1000, (journalMoveCounts.get(key) || 0) * 300);
        const priorSelections = repetitionAware && priorRootPosition
            ? priorRootPosition.moves.get(key) || 0 : 0;
        const searchPenalty = priorSelections
            ? priorSelections * 160 + Math.min(250, quietRootDecisions * 2) +
                Math.max(0, rootPositionVisits - 1) * 40
            : 0;
        const boundedPenalty = Math.min(1600, journalPenalty + searchPenalty);
        rootCyclePenaltyMax = Math.max(rootCyclePenaltyMax, boundedPenalty);
        return boundedPenalty;
    };
    const recordRootChoice = move => {
        if (repetitionAware) recordRootDecision(context, rootRepetitionKey, move);
    };
    const firstOrder = orderMoves(game, rootMoves, '', killers, history, 0,
        move => -rootCyclePenalty(move), captureHistory);
    const winning = immediateWinningMove(game, firstOrder, rootColor);
    if (winning) {
        recordRootChoice(winning);
        return winning;
    }
    const rootCandidates = selectCandidates(game, firstOrder, rootWidth, rootThreats, rootDropContext);
    let bestCompleted = rootCandidates[0] || firstOrder[0];

    function isExpired() {
        if ((nodes & 15) === 0 && Date.now() >= deadline) aborted = true;
        return aborted;
    }

    function cachedEval(position, key) {
        if (evalCache.has(key)) return evalCache.get(key);
        const score = evaluateWhite(position, evaluationWeights);
        boundedSet(evalCache, key, score, MAX_EVAL_ENTRIES);
        return score;
    }

    function staticFor(position, key, perspective) {
        const whiteScore = cachedEval(position, key);
        return perspective === 'white' ? whiteScore : -whiteScore;
    }

    function terminal(position, ply) {
        if (!position.gameOver) return null;
        if (position.winner === 'draw') return 0;
        return position.winner === rootColor ? MATE : -MATE;
    }

    function search(position, depth, alpha, beta, ply) {
        nodes++;
        if (isExpired()) return 0;
        const end = terminal(position, ply);
        if (end !== null) return end;
        if (depth <= 0) return quiescence(position, alpha, beta, ply, qDepth);
        const repeatKey = repetitionKey(position);
        if (searchPath.has(repeatKey)) {
            repetitionPathHits++;
            return 0;
        }
        searchPath.add(repeatKey);
        try {
            return searchBody(position, depth, alpha, beta, ply);
        } finally {
            searchPath.delete(repeatKey);
        }
    }

    function searchBody(position, depth, alpha, beta, ply) {
        const repetitionHitsAtEntry = repetitionPathHits;

        const key = searchHash(position);
        const originalAlpha = alpha, originalBeta = beta;
        const cached = table.get(key);
        let preferred = '';
        if (cached) {
            ttHits++;
            preferred = cached.move || '';
            if (cached.depth >= depth) {
                if (cached.flag === 'exact') return cached.score;
                if (cached.flag === 'lower') alpha = Math.max(alpha, cached.score);
                else if (cached.flag === 'upper') beta = Math.min(beta, cached.score);
                if (alpha >= beta) return cached.score;
            }
        }

        const moves = cachedLegalMoves(position, context, moveCacheStats, key);
        // A forced Cope / great-piece bonus action can leave its owner with no
        // legal continuation. The match runner and live UI cannot complete that
        // action, so search it as a draw instead of crediting a static advantage.
        if (!moves.length) return position.bonusMoveInfo ? 0 : staticFor(position, key, rootColor);
        const current = turn(position), maximizing = current === rootColor;
        const threats = cachedCriticalThreats(position, current, key, context.threatCache);
        const dropContext = createDropTacticalContext(position, enableDropQuiescence);
        const ordered = orderMoves(position, moves, preferred, killers, history, ply, null, captureHistory);
        const candidates = selectCandidates(position, ordered, width, threats, dropContext);
        let bestScore = maximizing ? -INF : INF;
        let bestKey = '';
        let bestMove = null;

        const usePvsAtNode = enablePvs && depth >= 3;
        let searchedMoves = 0;
        const searchedCaptureKeys = [];
        for (const move of candidates) {
            if (isExpired()) return 0;
            const result = applyMove(position, move, current);
            if (!result.success) continue;
            const reduction = enableLmr
                ? lateMoveReduction(position, move, searchedMoves, depth, threats, dropContext, preferred)
                : 0;
            let score;
            if (searchedMoves === 0) {
                score = search(result.updatedGame, depth - 1, alpha, beta, ply + 1);
            } else {
                const nullAlpha = !usePvsAtNode ? alpha : maximizing ? alpha : Math.max(alpha, beta - 1);
                const nullBeta = !usePvsAtNode ? beta : maximizing ? Math.min(beta, alpha + 1) : beta;
                const reducedDepth = Math.max(0, depth - 1 - reduction);
                if (reduction) lmrReductions++;
                score = search(result.updatedGame, reducedDepth, nullAlpha, nullBeta, ply + 1);

                // Hikoro's wide drop tree makes reductions useful, but every
                // promising late move is restored to full depth before it can
                // raise alpha or lower beta.
                const improvesWindow = maximizing ? score > alpha : score < beta;
                if (reduction && !aborted && improvesWindow) {
                    lmrResearches++;
                    score = search(result.updatedGame, depth - 1, nullAlpha, nullBeta, ply + 1);
                }
                const needsFullWindow = maximizing
                    ? score > alpha && score < beta
                    : score < beta && score > alpha;
                if (usePvsAtNode && !aborted && needsFullWindow) {
                    pvsResearches++;
                    score = search(result.updatedGame, depth - 1, alpha, beta, ply + 1);
                }
            }
            if (aborted) return 0;
            searchedMoves++;
            const keyOfMove = moveKey(move);
            const thisCaptureKey = captureHistoryKey(position, move);
            if (thisCaptureKey) searchedCaptureKeys.push(thisCaptureKey);
            if ((maximizing && score > bestScore) || (!maximizing && score < bestScore)) {
                bestScore = score;
                bestKey = keyOfMove;
                bestMove = move;
            }
            if (maximizing) alpha = Math.max(alpha, bestScore);
            else beta = Math.min(beta, bestScore);
            if (alpha >= beta) {
                if (thisCaptureKey) {
                    const reward = depth * depth * 20;
                    updateCaptureHistory(captureHistory, thisCaptureKey, reward);
                    for (const failedKey of searchedCaptureKeys) {
                        if (failedKey !== thisCaptureKey) updateCaptureHistory(captureHistory, failedKey, -Math.max(1, Math.floor(reward / 3)));
                    }
                }
                if (!isForcingMove(position, move, dropContext)) {
                    const list = killers[ply] || (killers[ply] = []);
                    if (!list.includes(keyOfMove)) list.unshift(keyOfMove);
                    if (list.length > 2) list.length = 2;
                    history.set(keyOfMove, Math.min(100000, (history.get(keyOfMove) || 0) + depth * depth * 12));
                }
                break;
            }
        }

        if (!Number.isFinite(bestScore)) bestScore = staticFor(position, key, rootColor);
        if (!aborted && repetitionPathHits === repetitionHitsAtEntry) {
            const flag = bestScore <= originalAlpha ? 'upper' : bestScore >= originalBeta ? 'lower' : 'exact';
            storeTransposition(context, key, {
                depth, score: bestScore, flag, move: bestKey,
                royalCritical: threats.size > 0 || isHighImpactMove(position, bestMove)
            }, MAX_TABLE_ENTRIES);
        } else if (!aborted && repetitionPathHits !== repetitionHitsAtEntry) ttStoresSkippedForRepetition++;
        return bestScore;
    }

    function quiescence(position, alpha, beta, ply, remaining) {
        nodes++;
        if (isExpired()) return 0;
        const end = terminal(position, ply);
        if (end !== null) return end;
        const repeatKey = repetitionKey(position);
        if (searchPath.has(repeatKey)) {
            repetitionPathHits++;
            return 0;
        }
        searchPath.add(repeatKey);
        try {
            return quiescenceBody(position, alpha, beta, ply, remaining);
        } finally {
            searchPath.delete(repeatKey);
        }
    }

    function quiescenceBody(position, alpha, beta, ply, remaining) {
        const current = turn(position), maximizing = current === rootColor;
        const key = searchHash(position);
        const moves = cachedLegalMoves(position, context, moveCacheStats, key);
        if (!moves.length) return position.bonusMoveInfo ? 0 : staticFor(position, key, rootColor);

        const winningMove = immediateWinningMove(position, moves, current);
        if (winningMove) return signFor(current, rootColor) * MATE;
        const threats = cachedCriticalThreats(position, current, key, context.threatCache);
        const threatened = threats.size > 0;
        const mandatoryBonus = Boolean(position.bonusMoveInfo);
        const forced = threatened || mandatoryBonus;
        const standPat = staticFor(position, key, rootColor);
    // Do not call an attacked royal lost just because the quiescence
    // horizon was reached: the side to move may still respond or evade.
    // Extend forced royal-safety replies for up to two extra plies, then use
    // the ordinary threat-aware evaluation.
        if (remaining <= -2 || (remaining <= 0 && !threatened)) return standPat;

        if (!forced) {
            if (maximizing) {
                if (standPat >= beta) return standPat;
                alpha = Math.max(alpha, standPat);
            } else {
                if (standPat <= alpha) return standPat;
                beta = Math.min(beta, standPat);
            }
        }

        const ordered = orderMoves(position, moves, '', killers, history, ply, null, captureHistory);
        const dropContext = createDropTacticalContext(position, enableDropQuiescence);
        const forcingDropContext = dropContext;
        const candidates = forced
            ? selectCandidates(position, ordered, width, threatened ? threats : new Map(), dropContext)
            : ordered.filter(move => isForcingMove(position, move, forcingDropContext));
        if (!candidates.length) {
            return threatened ? signFor(opposite(current), rootColor) * MATE : standPat;
        }

        let bestScore = forced ? (maximizing ? -INF : INF) : standPat;
        let searched = false;
        for (const move of candidates) {
            if (isExpired()) return 0;
            const result = applyMove(position, move, current);
            if (!result.success) continue;
            searched = true;
            const score = quiescence(result.updatedGame, alpha, beta, ply + 1, remaining - 1);
            if (aborted) return 0;
            if (maximizing) {
                bestScore = Math.max(bestScore, score);
                alpha = Math.max(alpha, bestScore);
            } else {
                bestScore = Math.min(bestScore, score);
                beta = Math.min(beta, bestScore);
            }
            if (alpha >= beta) break;
        }
        if (!searched && threatened) return signFor(opposite(current), rootColor) * MATE;
        return bestScore;
    }

    let previousScore = null;
    for (let depth = 1; depth <= maxDepth; depth++) {
        if (Date.now() >= deadline) break;
        const preferred = moveKey(bestCompleted);
        const ordered = orderMoves(game, rootCandidates, preferred, killers, history, 0,
            move => -rootCyclePenalty(move), captureHistory);
        const useAspirationThisDepth = enableAspiration && depth >= 3;
        const usePvsThisDepth = enablePvs && depth >= 3;
        let window = previousScore === null || !useAspirationThisDepth
            ? INF
            : aspirationBaseWindow ?? Math.max(160, Math.min(900, 120 + Math.abs(previousScore) * 0.08));
        let alphaBound = previousScore === null || !useAspirationThisDepth
            ? -INF : Math.max(-INF, previousScore - window);
        let betaBound = previousScore === null || !useAspirationThisDepth
            ? INF : Math.min(INF, previousScore + window);
        let iterationComplete = false;
        let aspirationAttempts = 0;

        while (!iterationComplete && !aborted) {
            let iterationBest = null;
            let iterationScore = -INF;
            let alpha = alphaBound;
            let searchedRootMoves = 0;

            for (const move of ordered) {
                if (Date.now() >= deadline) {
                    aborted = true;
                    break;
                }
                const result = applyMove(game, move, rootColor);
                if (!result.success) continue;
                const cyclePenalty = rootCyclePenalty(move);
                const moveAlpha = alpha + cyclePenalty;
                const moveBeta = betaBound + cyclePenalty;
                let score;
                if (!usePvsThisDepth || searchedRootMoves === 0) {
                    score = search(result.updatedGame, depth - 1, moveAlpha, moveBeta, 1) - cyclePenalty;
                } else {
                    score = search(result.updatedGame, depth - 1, moveAlpha,
                        Math.min(betaBound, alpha + 1) + cyclePenalty, 1) - cyclePenalty;
                    if (!aborted && score > alpha && score < betaBound) {
                        pvsResearches++;
                        score = search(result.updatedGame, depth - 1, moveAlpha, moveBeta, 1) - cyclePenalty;
                    }
                }
                if (aborted) break;
                searchedRootMoves++;
                if (score > iterationScore) {
                    iterationScore = score;
                    iterationBest = move;
                }
                alpha = Math.max(alpha, iterationScore);
            }

            // Preserve the last fully completed depth if a time budget expires
            // during an aspiration retry or a PVS re-search.
            if (aborted || !iterationBest) break;
            const failedLow = iterationScore <= alphaBound && alphaBound > -INF;
            const failedHigh = iterationScore >= betaBound && betaBound < INF;
            if (useAspirationThisDepth && (failedLow || failedHigh)) {
                aspirationResearches++;
                aspirationAttempts++;
                window = Math.min(INF, window * 2);
                if (aspirationAttempts >= 4 || window >= INF / 2) {
                    alphaBound = -INF;
                    betaBound = INF;
                } else {
                    alphaBound = Math.max(-INF, previousScore - window);
                    betaBound = Math.min(INF, previousScore + window);
                }
                continue;
            }

            bestCompleted = iterationBest;
            completedScore = iterationScore;
            previousScore = iterationScore;
            completedDepth = depth;
            iterationComplete = true;
            if (iterationScore >= MATE - 100) break;
        }
        if (aborted) break;
        if (completedScore >= MATE - 100) break;
    }

    if (options.searchStats && typeof options.searchStats === 'object') {
        Object.assign(options.searchStats, {
            nodes, ttHits, completedDepth, rootMoveCount: rootMoves.length, rootCandidateCount: rootCandidates.length,
            ttEntries: table.size, ttEntriesBefore: ttStartSize, searchContextUses: context.uses,
            captureHistoryEntries: captureHistory.size,
            repetitionAware, repetitionPathHits, ttStoresSkippedForRepetition,
            rootPositionVisits, quietRootDecisions, rootCyclePenaltyMax,
            ...moveCacheStats,
            evaluationWeights: {...evaluationWeights},
            score: completedScore, pvsResearches, lmrReductions, lmrResearches,
            aspirationResearches, searchFeatures: {pvs: enablePvs, lmr: enableLmr,
                aspiration: enableAspiration, dropQuiescence: enableDropQuiescence,
                pvsMinimumDepth: 3, aspirationMinimumDepth: 3},
            elapsedMs: Math.max(0, budgetMs - Math.max(0, deadline - Date.now())),
            aborted
        });
    }
    recordRootChoice(bestCompleted);
    return bestCompleted;
}

function clearSearchCache(sessionId = null) {
    if (sessionId === null) searchContexts.clear();
    else {
        const prefix = `${String(sessionId)}:`;
        for (const key of searchContexts.keys()) if (key.startsWith(prefix)) searchContexts.delete(key);
    }
}

module.exports = {
    chooseMove, legalMoves, evaluate, evaluateFeatures, defaultEvalWeights: DEFAULT_EVAL_WEIGHTS,
    positionKey, repetitionKey,
    positionHash: game => searchHash(game).toString(16).padStart(16, '0'),
    positionHashSlow: game => positionHashSlow(game).toString(16).padStart(16, '0'),
    applySearchMove: applyMove,
    isForcingMove,
    clearSearchCache
};
