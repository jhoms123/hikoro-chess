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
