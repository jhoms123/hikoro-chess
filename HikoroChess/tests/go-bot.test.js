const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('../public/go-engine.js');
const Bot = require('../public/go-bot.js');

test('bot returns legal opening actions on both supported board sizes', () => {
  for (const size of [9, 13]) {
    const state = Engine.initial(size);
    assert.equal(Bot.legalActions(state, { seed: size }).length, size * size + 1);
    const action = Bot.chooseAction(state, { maxIterations: 16, timeMs: 40, rolloutDepth: 2, seed: size });
    assert.ok(Engine.apply(state, action), 'bot returned an illegal opening action');
    assert.equal(state.ply, 0, 'analysis mutated the input state');
  }
});

test('bot scores blocks and shields against an immediate jump threat above passing', () => {
  const state = Engine.initial(9);
  state.board[4][0] = 2;
  state.board[4][1] = 1;
  const ranked = Bot.rankActions(state, { seed: 5 });
  const score = predicate => ranked.find(row => predicate(row.action))?.score;
  const block = score(a => a.type === 'place' && a.to.x === 2 && a.to.y === 4);
  const shield = score(a => a.type === 'shield' && a.at.x === 1 && a.at.y === 4);
  const pass = score(a => a.type === 'pass');
  assert.ok(block > pass && shield > pass, JSON.stringify({ block, shield, pass }));
});

test('bot only continues or shields during a chained jump', () => {
  const state = Engine.initial(9);
  state.board[4][3] = 1;
  state.board[4][4] = 2;
  state.board[4][6] = 2;
  const chain = Engine.apply(state, { type: 'move', from: { x: 3, y: 4 }, to: { x: 5, y: 4 } });
  assert.ok(chain?.chain);
  const actions = Bot.legalActions(chain, { seed: 7 });
  assert.deepEqual(actions.map(row => row.action.type).sort(), ['move', 'shield']);
  const action = Bot.chooseAction(chain, { maxIterations: 20, timeMs: 1000, rolloutDepth: 1, seed: 7 });
  assert.ok(Engine.apply(chain, action), 'bot returned an illegal chain action');
  assert.equal(action.type, 'move', 'the bot should take the available second jump before shielding');
});

test('search transitions avoid copying history and never mutate their parent state', () => {
  const initial = Engine.initial(9);
  const first = Engine.apply(initial, { type: 'place', to: { x: 0, y: 0 } });
  const searched = Engine.applySearch(first, { type: 'place', to: { x: 1, y: 0 } });
  assert.ok(searched);
  assert.equal(searched.history.length, 0);
  assert.equal(first.history.length, 1, 'search must not clear or append to the parent history');
  assert.equal(initial.board.flat().filter(Boolean).length, 0);
  assert.equal(first.board.flat().filter(Boolean).length, 1);
  assert.equal(searched.board.flat().filter(Boolean).length, 2);
  const initialPosition = Object.keys(first.positions)[0];
  const continued = Engine.apply(searched, { type: 'pass' });
  assert.equal(continued.positions[initialPosition], 1, 'normal transitions must preserve search repetition history');
});

test('legal move checks do not mutate the supplied board state', () => {
  const state = Engine.initial(9);
  state.board[4][3] = 1;
  state.board[4][4] = 2;
  const before = JSON.stringify(state);
  assert.deepEqual(Engine.legalMoves(state, { x: 3, y: 4 }).map(move => move.type), ['jump']);
  assert.equal(JSON.stringify(state), before);
});

test('capturing move legality checks leave the input board untouched', () => {
  const state = Engine.initial(9);
  state.board[4][4] = 2;
  state.board[4][3] = 1;
  state.board[3][4] = 1;
  state.board[5][4] = 1;
  state.board[3][5] = 3;
  const before = JSON.stringify(state);
  assert.ok(Engine.legalMoves(state, { x: 5, y: 3 }).some(move =>
    move.to.x === 5 && move.to.y === 4
  ));
  assert.equal(JSON.stringify(state), before);
});

test('jump-threat evaluation ignores attackers that have no reserve stones', () => {
  const makePosition = whiteReserve => {
    const state = Engine.initial(9);
    state.board[4][0] = 2;
    state.board[4][1] = 1;
    state.remaining[2] = whiteReserve;
    return state;
  };
  const shieldScore = state => Bot.rankActions(state, { seed: 17 }).find(row =>
    row.action.type === 'shield' && row.action.at.x === 1 && row.action.at.y === 4
  ).score;
  assert.ok(shieldScore(makePosition(100)) > shieldScore(makePosition(0)) + 1.5,
    'a shield should gain tactical value when the opposing jump is actually available');
});

test('rollouts extend through immediate jump tactics after normal depth', () => {
  const state = Engine.initial(9);
  state.board[4][0] = 2;
  state.board[4][1] = 1;
  state.board[4][6] = 1;
  state.board[4][7] = 2;
  const result = Bot.analyze(state, {
    maxIterations: 24,
    timeMs: 10000,
    rolloutDepth: 1,
    tacticalExtension: 2,
    rootPlacementLimit: 12,
    rolloutPlacementLimit: 8,
    seed: 11
  });
  assert.ok(result.stats.tacticalExtensionPlies > 0, JSON.stringify(result.stats));
  assert.ok(Engine.apply(state, result.action), 'tactical search returned an illegal move');
});

test('root search widens enough to examine more than the top handful of legal actions', () => {
  const state = Engine.initial(9);
  const result = Bot.analyze(state, {
    maxIterations: 40,
    timeMs: 10000,
    rolloutDepth: 1,
    seed: 31
  });
  assert.equal(result.stats.iterations, 40);
  assert.ok(result.stats.rootExplored >= 10,
    JSON.stringify({ legal: result.stats.rootLegal, explored: result.stats.rootExplored }));
  assert.ok(result.stats.rootExplored < result.stats.rootLegal);
});

test('worker wrapper returns an analyzed legal move with its request ticket', () => {
  let posted = null;
  let imports = '';
  const context = {
    importScripts: (...files) => { imports = files.join(','); },
    GoVariantBot: Bot,
    self: { postMessage: message => { posted = message; } }
  };
  const source = fs.readFileSync(path.join(__dirname, '../public/go-bot-worker.js'), 'utf8');
  vm.runInNewContext(source, context);
  const state = Engine.initial(9);
  context.self.onmessage({ data: { ticket: 42, state, options: { maxIterations: 8, timeMs: 1000, rolloutDepth: 1, seed: 3 } } });
  assert.equal(imports, 'go-engine.js,go-bot.js');
  assert.equal(posted.ticket, 42);
  assert.ok(Engine.apply(state, posted.action), 'worker returned an illegal action');
  assert.ok(posted.stats.iterations > 0);
});

