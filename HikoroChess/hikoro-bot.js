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
const MAX_SEARCH_CONTEXTS = 16;
const searchContexts = new Map();
const positionHashCache = new WeakMap();
const metadataHashCache = new WeakMap();
const zobristTokenCache = new Map();
const ZOBRIST_MASK = (1n << 64n) - 1n;
const ZOBRIST_SEED = 0x6a09e667f3bcc909n;
const EVAL_WEIGHT_NAMES = [
    'material', 'reserve', 'royalRoute', 'center', 'promotion',
    'protection', 'sanctuaryThreat', 'royalAttack', 'mobility', 'lastRoyal'
];
const DEFAULT_EVAL_WEIGHTS = Object.freeze(Object.fromEntries(EVAL_WEIGHT_NAMES.map(name => [name, 1])));

const opposite = color => color === 'white' ? 'black' : 'white';
const turn = game => game?.isWhiteTurn ? 'white' : 'black';
const signFor = (color, perspective) => color === perspective ? 1 : -1;
const isSanctuary = (x, y) => sanctuarySet.has(`${x},${y}`);
const inside = (x, y) => x >= 0 && x < rules.BOARD_WIDTH && y >= 0 && y < rules.BOARD_HEIGHT;

function legalMoves(game) {
    if (!game?.boardState || game.gameOver) return [];
    const color = turn(game), moves = [];
    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
            if (game.boardState[y]?.[x]?.color !== color) continue;
            for (const to of rules.getValidMoves(game, {square: {x, y}})) {
                moves.push({type: 'board', from: {x, y}, to: {x: to.x, y: to.y}});
            }
        }
    }

    // A bonus action is restricted to its designated board piece; Hikoro does
    // not allow a hand drop until that action has been completed.
    if (!game.bonusMoveInfo) {
        const handTypes = new Set((game[`${color}Captured`] || []).map(piece => piece.type));
        for (const type of handTypes) {
            if (royalTypes.has(type)) continue;
            for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
                for (let x = 0; x < rules.BOARD_WIDTH; x++) {
                    if (rules.isPositionValid(x, y) && !game.boardState[y]?.[x]) {
                        moves.push({type: 'drop', piece: {type}, to: {x, y}});
                    }
                }
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
    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
            const piece = game.boardState[y]?.[x];
            if (!piece || piece.color !== color || !royalTypes.has(piece.type)) continue;
            for (const to of pieceMoves(game, color, x, y)) {
                if (isSanctuary(to.x, to.y)) targets.set(`${to.x},${to.y}`, {x: to.x, y: to.y});
            }
        }
    }
    return targets;
}

function royalCaptureThreats(game, victimColor, onlyLastRoyal = true) {
    const targets = new Map();
    const royals = [];
    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
            const piece = game.boardState[y]?.[x];
            if (piece?.color === victimColor && royalTypes.has(piece.type)) royals.push({x, y});
        }
    }
    if (!royals.length || (onlyLastRoyal && royals.length !== 1)) return targets;
    const attacker = opposite(victimColor);
    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
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

function getSearchContext(sessionId, color, weightKey) {
    const namespace = sessionId === undefined || sessionId === null ? 'shared' : String(sessionId);
    const key = `${namespace}:${color}:${weightKey}`;
    let context = searchContexts.get(key);
    if (!context) {
        context = {
            table: new Map(), evalCache: new Map(), threatCache: new Map(),
            history: new Map(), killers: [], uses: 0
        };
        if (searchContexts.size >= MAX_SEARCH_CONTEXTS) searchContexts.delete(searchContexts.keys().next().value);
    } else {
        searchContexts.delete(key);
    }
    context.uses++;
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

function positionKey(game) {
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
        `|${Number(game.turnCount) || 0}|${game.whitePrinceOnBoard === false ? 0 : 1}` +
        `${game.blackPrinceOnBoard === false ? 0 : 1}|${game.gameOver ? game.winner || 'over' : '-'}`;
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
    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
            const piece = game.boardState[y]?.[x];
            if (piece && royalTypes.has(piece.type)) {
                allRoyals.push({x, y, color: piece.color});
                if (piece.color === enemy) royals.push({x, y});
            }
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

function orderMoves(game, moves, preferredKey, killers, history, ply) {
    const enemy = opposite(turn(game));
    const enemyRoyals = [];
    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
            const piece = game.boardState[y]?.[x];
            if (piece?.color === enemy && royalTypes.has(piece.type)) enemyRoyals.push({x, y});
        }
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
            if (target) score += 10000 + (values[target.type] || 100) * 12 - (values[piece?.type] || 100);
            if (target && royalTypes.has(target.type)) score += 120000;
            if (piece) score += centerValue(move.to.x, move.to.y) - centerValue(move.from.x, move.from.y);
            if (piece && royalTypes.has(piece.type)) {
                score += (distanceToSanctuary(move.from.x, move.from.y) - distanceToSanctuary(move.to.x, move.to.y)) * 700;
                if (isSanctuary(move.to.x, move.to.y)) score += 500000;
            }
            if (isPromotionCandidate(game, move)) score += 12000;
            if (piece && ['greathorsegeneral', 'cthulhu'].includes(piece.type) && !target) score += 1600;
        }
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
    const result = rules.makeMoveForSearch(game, move, color);
    if (result.success) {
        positionHashCache.set(result.updatedGame, updateSearchHash(game, move, result.updatedGame, beforeHash));
    }
    return result;
}

function handMobilityFactor(game) {
    let empty = 0;
    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
            if (rules.isPositionValid(x, y) && !game.boardState[y]?.[x]) empty++;
        }
    }
    return 0.42 + 0.3 * Math.min(1, empty / 30);
}

function mobilityForSide(game, color) {
    let total = 0;
    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
            const piece = game.boardState[y]?.[x];
            if (!piece || piece.color !== color) continue;
            const moves = pieceMoves(game, color, x, y);
            total += Math.min(10, moves.length);
            if (total >= 100) return 100;
        }
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

    for (let y = 0; y < rules.BOARD_HEIGHT; y++) {
        for (let x = 0; x < rules.BOARD_WIDTH; x++) {
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
                features.center += side * centerValue(x, y);
                if (promotableTypes.has(piece.type)) {
                    const advance = piece.color === 'white' ? y : 15 - y;
                    features.promotion += side * Math.max(0, advance - 4) * 10;
                }
                if (rules.isProtected(piece, x, y, game.boardState)) features.protection += side * Math.min(60, value * 0.08);
            }
        }
    }

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
    const {table, evalCache, history, killers} = context;
    const ttStartSize = table.size;
    let nodes = 0, ttHits = 0, pvsResearches = 0, lmrReductions = 0, lmrResearches = 0;
    let aspirationResearches = 0, aborted = false, completedDepth = 0, completedScore = 0;

    const rootMoves = legalMoves(game);
    if (!rootMoves.length) return null;
    const rootThreats = criticalThreats(game, rootColor);
    const firstOrder = orderMoves(game, rootMoves, '', killers, history, 0);
    const winning = immediateWinningMove(game, firstOrder, rootColor);
    if (winning) return winning;
    const rootDropContext = createDropTacticalContext(game, enableDropQuiescence);
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

        const moves = legalMoves(position);
        if (!moves.length) return staticFor(position, key, rootColor);
        const current = turn(position), maximizing = current === rootColor;
        const threats = cachedCriticalThreats(position, current, key, context.threatCache);
        const dropContext = createDropTacticalContext(position, enableDropQuiescence);
        const ordered = orderMoves(position, moves, preferred, killers, history, ply);
        const candidates = selectCandidates(position, ordered, width, threats, dropContext);
        let bestScore = maximizing ? -INF : INF;
        let bestKey = '';

        const usePvsAtNode = enablePvs && depth >= 3;
        let searchedMoves = 0;
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
            if ((maximizing && score > bestScore) || (!maximizing && score < bestScore)) {
                bestScore = score;
                bestKey = keyOfMove;
            }
            if (maximizing) alpha = Math.max(alpha, bestScore);
            else beta = Math.min(beta, bestScore);
            if (alpha >= beta) {
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
        if (!aborted) {
            const flag = bestScore <= originalAlpha ? 'upper' : bestScore >= originalBeta ? 'lower' : 'exact';
            boundedSet(table, key, {depth, score: bestScore, flag, move: bestKey}, MAX_TABLE_ENTRIES);
        }
        return bestScore;
    }

    function quiescence(position, alpha, beta, ply, remaining) {
        nodes++;
        if (isExpired()) return 0;
        const end = terminal(position, ply);
        if (end !== null) return end;
        const current = turn(position), maximizing = current === rootColor;
        const key = searchHash(position);
        const moves = legalMoves(position);
        if (!moves.length) return staticFor(position, key, rootColor);

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

        const ordered = orderMoves(position, moves, '', killers, history, ply);
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
        const ordered = orderMoves(game, rootCandidates, preferred, killers, history, 0);
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
                let score;
                if (!usePvsThisDepth || searchedRootMoves === 0) {
                    score = search(result.updatedGame, depth - 1, alpha, betaBound, 1);
                } else {
                    score = search(result.updatedGame, depth - 1, alpha, Math.min(betaBound, alpha + 1), 1);
                    if (!aborted && score > alpha && score < betaBound) {
                        pvsResearches++;
                        score = search(result.updatedGame, depth - 1, alpha, betaBound, 1);
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
            evaluationWeights: {...evaluationWeights},
            score: completedScore, pvsResearches, lmrReductions, lmrResearches,
            aspirationResearches, searchFeatures: {pvs: enablePvs, lmr: enableLmr,
                aspiration: enableAspiration, dropQuiescence: enableDropQuiescence,
                pvsMinimumDepth: 3, aspirationMinimumDepth: 3},
            elapsedMs: Math.max(0, budgetMs - Math.max(0, deadline - Date.now())),
            aborted
        });
    }
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
    positionKey,
    positionHash: game => searchHash(game).toString(16).padStart(16, '0'),
    positionHashSlow: game => positionHashSlow(game).toString(16).padStart(16, '0'),
    applySearchMove: applyMove,
    isForcingMove,
    clearSearchCache
};
