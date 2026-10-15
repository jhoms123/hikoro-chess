const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../public/shavari-city-battle-engine.js');
const setup = require('../public/shavari-city-battle-setup.json');

function scenario({ columns = 5, rows = 5, movement, units, buildings = [], extraTypes = [], victory = {}, stacking = {}, stackGroup }) {
    const files = Array.from({ length: columns }, (_, i) => String.fromCharCode(65 + i));
    const scout = { id: 'scout', name: 'Scout', mark: 'SC', basePiece: false, movement, ...(stackGroup ? { stackGroup } : {}) };
    return {
        format: 'shavari-city-battle-setup',
        metadata: { board: { columns, rows, files } },
        orientation: { movementVectorsDefinedFor: 'carnelian-south', oppositeCourtTransform: 'rank-flip' },
        settings: {
            orientationTransform: 'rank-flip',
            stacking: { enabled: true, maxHeight: 3, generalCannotStack: true, tallerCanJumpShorter: true, tallerCanCoverShorter: true, ...stacking },
            victory: { captureGeneral: true, noLegalMoveLoses: true, ...victory }
        },
        pieceTypes: [scout, ...extraTypes],
        position: { units, blockedSquares: buildings }
    };
}

function unit(id, typeId, side, x, y) { return { id, typeId, side, x, y }; }
function moves(engine, state, x, y, side) { return engine.legalMoves(state, { x, y }, side); }
function at(list, x, y) { return list.find(move => move.x === x && move.y === y); }

test('loads the supplied 16 by 17 opening with mirrored armies and city blocks', () => {
    const game = create(setup), state = game.initial();
    assert.equal(game.COLS, 16);
    assert.equal(game.ROWS, 17);
    assert.equal(state.board.length, 272);
    assert.equal(state.board.flat().length, 150);
    assert.equal(state.buildings.filter(Boolean).length, 30);
    assert.equal(state.turn, 'carnelian');
});

test('City Battle defines only the four requested stack families and one-character Chinese marks', () => {
    const groups = {
        lancers: ['Camel Lancer', 'Lancer Knight', 'Lancer Pawn'],
        elephants: ['Elephant Cannon', 'Elephant Soldier'],
        carts: ['Cart Runner', 'Cannon Cart'],
        'city-units': ['Scarab Pawn', 'City Pawn', 'Fighting Dog', 'City Soldier']
    };
    const game = create(setup);
    const pieces = new Map(setup.pieceTypes.map(piece => [piece.name, piece]));
    assert.equal(game.maxHeight, 2);
    for (const [group, names] of Object.entries(groups)) {
        for (const name of names) assert.equal(pieces.get(name)?.stackGroup, group, `${name} belongs to ${group}`);
    }
    for (const piece of setup.pieceTypes) {
        assert.equal(Array.from(piece.hanzi || '').length, 1, `${piece.name} has exactly one Han character`);
        assert.match(piece.hanzi, /^\p{Script=Han}$/u, `${piece.name} label is a Han character`);
        if (!Object.values(groups).flat().includes(piece.name)) assert.equal(piece.stackGroup, undefined, `${piece.name} stays unstacked`);
    }
});

test('formations stack only inside their named family and never exceed two pieces', () => {
    const movement = { steps: [{ dx: 1, dy: 0, capture: true }], jumps: [], rays: [] };
    const noMoves = { noLegalMoveLoses: false };
    const lancer = { id: 'lancer', name: 'Lancer', stackGroup: 'lancers', movement: { steps: [], jumps: [], rays: [] } };
    const city = { id: 'city', name: 'City unit', stackGroup: 'city-units', movement: { steps: [], jumps: [], rays: [] } };
    const allowed = create(scenario({
        movement, stackGroup: 'lancers', stacking: { maxHeight: 2 }, extraTypes: [lancer],
        units: [unit('mover', 'scout', 'carnelian', 1, 2), unit('ally', 'lancer', 'carnelian', 2, 2)], victory: noMoves
    }));
    const allowedState = allowed.initial();
    assert.deepEqual(at(moves(allowed, allowedState, 1, 2), 2, 2)?.options, ['stack']);
    const stacked = allowed.apply(allowedState, { from: { x: 1, y: 2 }, to: { x: 2, y: 2 }, kind: 'stack' });
    assert.equal(stacked.board[2 * allowed.COLS + 2].length, 2);

    const blocked = create(scenario({
        movement, stackGroup: 'lancers', stacking: { maxHeight: 2 }, extraTypes: [city],
        units: [unit('mover', 'scout', 'carnelian', 1, 2), unit('ally', 'city', 'carnelian', 2, 2)], victory: noMoves
    }));
    assert.equal(at(moves(blocked, blocked.initial(), 1, 2), 2, 2), undefined, 'a different family cannot share the square');

    const capped = create(scenario({
        movement, stackGroup: 'lancers', stacking: { maxHeight: 2 }, extraTypes: [lancer],
        units: [unit('base', 'scout', 'carnelian', 1, 2), unit('top', 'scout', 'carnelian', 1, 2), unit('target', 'lancer', 'carnelian', 2, 2)], victory: noMoves
    }));
    assert.equal(at(moves(capped, capped.initial(), 1, 2), 2, 2), undefined, 'a third member is rejected');
});

test('mirrors movement vectors for the northern Turquoise court', () => {
    const game = create(scenario({
        movement: { steps: [{ dx: 0, dy: -1, capture: true }], jumps: [], rays: [] },
        units: [unit('red', 'scout', 'carnelian', 2, 3), unit('blue', 'scout', 'turquoise', 2, 1)]
    }));
    const state = game.initial();
    assert.ok(at(moves(game, state, 2, 3, 'carnelian'), 2, 2));
    assert.ok(at(moves(game, state, 2, 1, 'turquoise'), 2, 2));
});

test('steps require a clear path; jumps may pass over pieces and buildings but cannot land on a building', () => {
    const base = {
        steps: [{ dx: 0, dy: -2, capture: true }],
        jumps: [{ dx: 0, dy: -2, capture: true }, { dx: -1, dy: -2, capture: true }],
        rays: []
    };
    const game = create(scenario({
        movement: base,
        units: [unit('mover', 'scout', 'carnelian', 2, 4), unit('screen', 'scout', 'turquoise', 2, 3)],
        buildings: [{ x: 1, y: 2 }]
    }));
    const state = game.initial();
    const available = moves(game, state, 2, 4);
    assert.ok(at(available, 2, 2)?.options.includes('move'), 'jump clears the occupied middle square');
    assert.equal(at(available, 1, 2), undefined, 'a jump cannot land on a building');

    const stepOnly = create(scenario({
        movement: { steps: base.steps, jumps: [], rays: [] },
        units: [unit('mover', 'scout', 'carnelian', 2, 4), unit('screen', 'scout', 'turquoise', 2, 3)]
    }));
    assert.equal(at(moves(stepOnly, stepOnly.initial(), 2, 4), 2, 2), undefined, 'step path is blocked by the middle unit');
});

test('capture flags govern enemy landings', () => {
    const noCapture = create(scenario({
        movement: { steps: [{ dx: 1, dy: 0, capture: false }], jumps: [], rays: [] },
        units: [unit('mover', 'scout', 'carnelian', 1, 2), unit('target', 'scout', 'turquoise', 2, 2)]
    }));
    assert.equal(at(moves(noCapture, noCapture.initial(), 1, 2), 2, 2), undefined);

    const capture = create(scenario({
        movement: { steps: [{ dx: 1, dy: 0, capture: true }], jumps: [], rays: [] },
        units: [unit('mover', 'scout', 'carnelian', 1, 2), unit('target', 'scout', 'turquoise', 2, 2)]
    }));
    assert.deepEqual(at(moves(capture, capture.initial(), 1, 2), 2, 2).options, ['capture']);
});

test('sliding rays stop at equal stacks and taller formations may pass a shorter stack', () => {
    const movement = { steps: [], jumps: [], rays: [{ dx: 1, dy: 0, capture: true, maxDistance: 0 }] };
    const single = create(scenario({
        movement,
        units: [unit('mover', 'scout', 'carnelian', 0, 2), unit('blocker', 'scout', 'turquoise', 2, 2)]
    }));
    const singleState = single.initial();
    assert.ok(at(moves(single, singleState, 0, 2), 2, 2)?.options.includes('capture'));
    assert.equal(at(moves(single, singleState, 0, 2), 3, 2), undefined);

    const tall = create(scenario({
        movement,
        units: [unit('base', 'scout', 'carnelian', 0, 2), unit('top', 'scout', 'carnelian', 0, 2), unit('blocker', 'scout', 'turquoise', 2, 2)]
    }));
    assert.ok(at(moves(tall, tall.initial(), 0, 2), 3, 2), 'the two-piece formation slides beyond the one-piece obstacle');

    const cityWall = create(scenario({
        movement,
        units: [unit('mover', 'scout', 'carnelian', 0, 2)],
        buildings: [{ x: 2, y: 2 }]
    }));
    const wallMoves = moves(cityWall, cityWall.initial(), 0, 2);
    assert.ok(at(wallMoves, 1, 2));
    assert.equal(at(wallMoves, 2, 2), undefined);
    assert.equal(at(wallMoves, 3, 2), undefined);
});

test('capture, cover, and General victory use the selected setup rules', () => {
    const general = { id: 'lotus-general', name: 'Lotus General', basePiece: true, movement: { steps: [], jumps: [], rays: [] } };
    const game = create(scenario({
        movement: { steps: [{ dx: 1, dy: 0, capture: true }], jumps: [], rays: [] },
        extraTypes: [general],
        units: [unit('base', 'scout', 'carnelian', 1, 2), unit('top', 'scout', 'carnelian', 1, 2), unit('target', 'lotus-general', 'turquoise', 2, 2)]
    }));
    const state = game.initial();
    const destination = at(moves(game, state, 1, 2), 2, 2);
    assert.ok(destination.options.includes('capture'));
    assert.ok(!destination.options.includes('cover'), 'a General cannot be covered');
    const next = game.apply(state, { from: { x: 1, y: 2 }, to: { x: 2, y: 2 }, kind: 'capture' });
    assert.equal(next.result.winner, 'carnelian');
    assert.equal(next.result.reason, 'Lotus General captured');
});

test('a taller formation can cover a shorter non-General enemy stack', () => {
    const game = create(scenario({
        movement: { steps: [{ dx: 1, dy: 0, capture: true }], jumps: [], rays: [] },
        units: [unit('base', 'scout', 'carnelian', 1, 2), unit('top', 'scout', 'carnelian', 1, 2), unit('target', 'scout', 'turquoise', 2, 2)]
    }));
    const destination = at(moves(game, game.initial(), 1, 2), 2, 2);
    assert.deepEqual(destination.options, ['capture', 'cover']);
    const next = game.apply(game.initial(), { from: { x: 1, y: 2 }, to: { x: 2, y: 2 }, kind: 'cover' });
    assert.equal(next.board[2 * game.COLS + 2].length, 3);
    assert.equal(next.board[2 * game.COLS + 2][0].owner, 'turquoise');
});

test('no-legal-move loss ends the game for the side that made the last move', () => {
    const game = create(scenario({
        columns: 2,
        rows: 1,
        movement: { steps: [{ dx: 1, dy: 0, capture: true }], jumps: [], rays: [] },
        units: [unit('mover', 'scout', 'carnelian', 0, 0), unit('trapped', 'scout', 'turquoise', 1, 0)]
    }));
    const next = game.apply(game.initial(), { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, kind: 'capture' });
    assert.equal(next.result.winner, 'carnelian');
    assert.equal(next.result.reason, 'No legal moves');
});

test('journals replay and reject illegal actions', () => {
    const game = create(scenario({
        movement: { steps: [{ dx: 1, dy: 0, capture: false }], jumps: [], rays: [] },
        units: [unit('mover', 'scout', 'carnelian', 1, 2)]
    }));
    const action = { from: { x: 1, y: 2 }, to: { x: 2, y: 2 }, kind: 'move' };
    const replayed = game.replay([action], 1);
    assert.equal(replayed.turn, 'turquoise');
    assert.equal(replayed.board[2 * game.COLS + 2][0].id, 'mover');
    assert.equal(game.replay([{ ...action, to: { x: 4, y: 4 } }], 1), null);
});
