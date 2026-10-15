const test = require('node:test');
const assert = require('node:assert/strict');
const { create: createBot } = require('../public/shavari-city-battle-bot.js');
const { create: createEngine } = require('../public/shavari-city-battle-engine.js');
const setup = require('../public/shavari-city-battle-setup.json');

function smallSetup(units, blockedSquares = []) {
    const scout = { id: 'scout', name: 'Scout', movement: { steps: [{ dx: 1, dy: 0, capture: true }], jumps: [], rays: [] } };
    const general = { id: 'lotus-general', name: 'Lotus General', movement: { steps: [], jumps: [], rays: [] } };
    return {
        metadata: { board: { columns: 5, rows: 4, files: ['A', 'B', 'C', 'D', 'E'] } },
        orientation: { oppositeCourtTransform: 'rank-flip' },
        settings: { stacking: { enabled: true, maxHeight: 3 }, victory: { captureGeneral: true, noLegalMoveLoses: true } },
        pieceTypes: [scout, general],
        position: { units, blockedSquares }
    };
}

const unit = (id, typeId, side, x, y) => ({ id, typeId, side, x, y });

test('City Battle bot finds an immediate Lotus General capture', () => {
    const scenario = smallSetup([
        unit('attacker', 'scout', 'carnelian', 1, 2),
        unit('target-general', 'lotus-general', 'turquoise', 2, 2),
        unit('other', 'scout', 'turquoise', 4, 0)
    ]);
    const result = createBot(scenario).choose([], 0, 250);
    assert.deepEqual(result.action, { from: { x: 1, y: 2 }, to: { x: 2, y: 2 }, kind: 'capture' });
});

test('City Battle bot returns a move accepted by the setup rules engine', () => {
    const scenario = smallSetup([
        unit('attacker', 'scout', 'carnelian', 1, 2),
        unit('target', 'scout', 'turquoise', 2, 2),
        unit('other', 'scout', 'turquoise', 4, 0)
    ], [{ x: 2, y: 1 }]);
    const engine = createEngine(scenario), state = engine.initial();
    const result = createBot(scenario).choose([], 0, 250);
    assert.ok(result.action, 'bot should choose a move');
    assert.ok(engine.apply(state, result.action), 'chosen move should be legal under City Battle rules');
});

test('bot prevents an immediate reply that would capture its Lotus General', () => {
    const scenario = smallSetup([
        unit('rescuer', 'scout', 'carnelian', 0, 2),
        unit('general', 'lotus-general', 'carnelian', 2, 2),
        unit('threat', 'scout', 'turquoise', 1, 2)
    ]);
    const result = createBot(scenario).choose([], 0, 300);
    assert.deepEqual(result.action, { from: { x: 0, y: 2 }, to: { x: 1, y: 2 }, kind: 'capture' });
});

test('bot sees a forced General capture created by a quiet move at shallow search depth', () => {
    const scenario = {
        metadata: { board: { columns: 5, rows: 4, files: ['A', 'B', 'C', 'D', 'E'] } },
        orientation: { oppositeCourtTransform: 'rank-flip' },
        settings: { stacking: { enabled: true, maxHeight: 2 }, victory: { captureGeneral: true, noLegalMoveLoses: true } },
        pieceTypes: [
            { id: 'threatener', name: 'Threatener', movement: { steps: [{ dx: 1, dy: 0, capture: false }], jumps: [{ dx: 2, dy: 0, capture: true }], rays: [] } },
            { id: 'lotus-general', name: 'Lotus General', movement: { steps: [], jumps: [], rays: [] } },
            { id: 'helper', name: 'Helper', movement: { steps: [{ dx: -1, dy: 0, capture: false }, { dx: 1, dy: 0, capture: false }], jumps: [], rays: [] } }
        ],
        position: { units: [
            unit('threatener', 'threatener', 'turquoise', 0, 0),
            unit('carnelian-general', 'lotus-general', 'carnelian', 3, 0),
            unit('helper', 'helper', 'carnelian', 4, 3),
            unit('turquoise-general', 'lotus-general', 'turquoise', 4, 0)
        ], blockedSquares: [] }
    };
    const engine = createEngine(scenario), state = engine.initial();
    state.turn = 'turquoise';
    state.positionHash = engine.hashPosition(state);
    state.positionHashCounts = { [engine.hashKey(state.positionHash)]: 1 };

    const result = createBot(scenario).choose([], 0, 500, state);
    assert.deepEqual(result.action, { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, kind: 'move' });
    assert.ok(result.score >= 499_000, 'the bot should recognize the forced Lotus General capture');
});

test('bot blocks the C3 cannon line in the uploaded City Battle loss', () => {
    const journal = [
        { from: { x: 4, y: 14 }, to: { x: 3, y: 12 }, kind: 'stack' },
        { from: { x: 3, y: 1 }, to: { x: 2, y: 2 }, kind: 'stack' }
    ];
    const engine = createEngine(setup);
    const state = engine.replay(journal, journal.length);
    const result = createBot(setup).choose(journal, journal.length, 500, state);

    const afterBlock = engine.apply(state, result.action);
    assert.ok(afterBlock, 'the block should be a legal move');

    let canCaptureGeneral = false;
    for (let at = 0; at < afterBlock.board.length; at++) {
        const stack = afterBlock.board[at];
        if (!stack.length || stack[stack.length - 1].owner !== 'turquoise') continue;
        const from = { x: at % engine.COLS, y: Math.floor(at / engine.COLS) };
        for (const destination of engine.legalMoves(afterBlock, from, 'turquoise')) {
            const target = afterBlock.board[engine.index(destination.x, destination.y)];
            if (destination.options.includes('capture') && target.some(piece => engine.generalTypes.has(piece.typeId))) {
                canCaptureGeneral = true;
            }
        }
    }
    assert.equal(canCaptureGeneral, false, 'the C11 stack must stop the cannon line to the General');
});

test('bot keeps the General safe in the recorded 1-second timeout blunder', () => {
    const journal = [
        ['E16','D16','stack'], ['D2','E2','stack'], ['D16','D5','capture'], ['E6','F5','stack'],
        ['D5','A5','capture'], ['G6','H7','stack'], ['A5','A1','capture'], ['E3','D1','stack'],
        ['E15','D15','stack'], ['P7','P11','capture'], ['H12','H11','stack'], ['C1','F2','move'],
        ['O12','P11','capture'], ['J6','I7','stack'], ['D15','D7','capture'], ['L2','M2','stack'],
        ['M16','L16','stack'], ['F6','F7','stack'], ['J12','I11','stack'], ['M2','M17','capture'],
        ['L16','M17','capture'], ['M1','J2','stack'], ['D11','E10','stack']
    ].map(([from, to, kind]) => ({
        from: { x: from.charCodeAt(0) - 65, y: Number(from.slice(1)) - 1 },
        to: { x: to.charCodeAt(0) - 65, y: Number(to.slice(1)) - 1 },
        kind
    }));
    const engine = createEngine(setup), state = engine.replay(journal, journal.length);
    assert.equal(state.turn, 'turquoise');

    const result = createBot(setup).choose(journal, journal.length, 1000, state);
    const after = engine.apply(state, result.action);
    assert.ok(after, 'the selected move should remain legal');

    let canCaptureGeneral = false;
    for (let at = 0; at < after.board.length; at++) {
        const stack = after.board[at];
        if (!stack.length || stack[stack.length - 1].owner !== 'carnelian') continue;
        const from = { x: at % engine.COLS, y: Math.floor(at / engine.COLS) };
        for (const destination of engine.legalMoves(after, from, 'carnelian')) {
            const target = after.board[engine.index(destination.x, destination.y)];
            if (destination.options.includes('capture') && target.some(piece => engine.generalTypes.has(piece.typeId))) {
                canCaptureGeneral = true;
            }
        }
    }
    assert.equal(canCaptureGeneral, false, 'an available safe move must be chosen instead of allowing the immediate General capture');
});

test('bot avoids the recorded move that creates a forced General threat next turn', () => {
    const square = text => ({ x: text.charCodeAt(0) - 65, y: Number(text.slice(1)) - 1 });
    const journal = [
        ['P11','P7','capture'], ['O6','P7','capture'], ['E15','D13','stack'],
        ['D1','G2','stack'], ['D13','D2','capture'], ['L2','M2','stack']
    ].map(([from, to, kind]) => ({ from: square(from), to: square(to), kind }));
    const engine = createEngine(setup), state = engine.replay(journal, journal.length);
    const result = createBot(setup).choose(journal, journal.length, 1000, state);
    const afterMove = engine.apply(state, result.action);
    assert.ok(afterMove, 'the chosen move should be legal');

    function canCaptureGeneral(position, attacker, defender) {
        for (let at = 0; at < position.board.length; at++) {
            const stack = position.board[at];
            if (!stack.length || stack[stack.length - 1].owner !== attacker) continue;
            const from = { x: at % engine.COLS, y: Math.floor(at / engine.COLS) };
            for (const destination of engine.legalMoves(position, from, attacker)) {
                const target = position.board[engine.index(destination.x, destination.y)];
                if (destination.options.includes('capture') && target.some(piece =>
                    piece.owner === defender && engine.generalTypes.has(piece.typeId))) return true;
            }
        }
        return false;
    }

    for (let at = 0; at < afterMove.board.length; at++) {
        const stack = afterMove.board[at];
        if (!stack.length || stack[stack.length - 1].owner !== 'turquoise') continue;
        const from = { x: at % engine.COLS, y: Math.floor(at / engine.COLS) };
        for (const destination of engine.legalMoves(afterMove, from, 'turquoise')) {
            for (const kind of destination.options) {
                const afterReply = engine.apply(afterMove, { from, to: { x: destination.x, y: destination.y }, kind });
                if (!afterReply || afterReply.result || !canCaptureGeneral(afterReply, 'turquoise', 'carnelian')) continue;
                let safeDefense = false;
                for (let defenseAt = 0; defenseAt < afterReply.board.length && !safeDefense; defenseAt++) {
                    const defenders = afterReply.board[defenseAt];
                    if (!defenders.length || defenders[defenders.length - 1].owner !== 'carnelian') continue;
                    const defenseFrom = { x: defenseAt % engine.COLS, y: Math.floor(defenseAt / engine.COLS) };
                    for (const defense of engine.legalMoves(afterReply, defenseFrom, 'carnelian')) {
                        for (const defenseKind of defense.options) {
                            const next = engine.apply(afterReply, {
                                from: defenseFrom, to: { x: defense.x, y: defense.y }, kind: defenseKind
                            });
                            if (next && (next.result?.winner === 'carnelian' || next.result?.winner === null
                                || !canCaptureGeneral(next, 'turquoise', 'carnelian'))) {
                                safeDefense = true;
                                break;
                            }
                        }
                        if (safeDefense) break;
                    }
                }
                assert.ok(safeDefense, `Turquoise reply ${engine.coord(from)}→${engine.coord(destination)} must leave a safe defense`);
            }
        }
    }
});

test('bot loads the supplied city opening and returns an engine-legal action', () => {
    const engine = createEngine(setup), state = engine.initial();
    const result = createBot(setup).choose([], 0, 120);
    assert.ok(result.action, 'bot should provide a fallback move within a short budget');
    assert.ok(engine.apply(state, result.action), 'opening move must pass the game engine');
});

test('bot accepts the live position directly without replaying the move journal', () => {
    const engine = createEngine(setup), state = engine.initial();
    const first = createBot(setup).choose([], 0, 120);
    const afterFirst = engine.apply(state, first.action);
    const snapshot = {
        board: afterFirst.board,
        buildings: afterFirst.buildings,
        turn: afterFirst.turn,
        ply: afterFirst.ply,
        noCapturePlies: afterFirst.noCapturePlies,
        positionHash: afterFirst.positionHash,
        positionHashCounts: afterFirst.positionHashCounts
    };
    const result = createBot(setup).choose(null, 0, 120, snapshot);
    assert.ok(result.action, 'a worker snapshot should be enough to choose a reply');
    assert.ok(engine.apply(afterFirst, result.action), 'the direct-state reply must be legal');
});

test('bot reuses transposition results across searches in the same worker', () => {
    const scenario = smallSetup([
        unit('red-scout', 'scout', 'carnelian', 0, 2),
        unit('blue-scout', 'scout', 'turquoise', 3, 1),
        unit('red-general', 'lotus-general', 'carnelian', 4, 3),
        unit('blue-general', 'lotus-general', 'turquoise', 0, 0)
    ]);
    const engine = createEngine(scenario), state = engine.initial(), bot = createBot(scenario);
    const first = bot.choose([], 0, 250, state);
    const second = bot.choose([], 0, 250, state);
    assert.ok(first.action && second.action, 'both searches should return a legal move');
    assert.ok(second.tableHits > 0, 'the second search should reuse cached positions');
});
