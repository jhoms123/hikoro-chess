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
