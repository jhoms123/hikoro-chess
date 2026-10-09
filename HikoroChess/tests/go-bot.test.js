const test = require('node:test');
const assert = require('node:assert/strict');
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
  const action = Bot.chooseAction(chain, { maxIterations: 16, timeMs: 40, rolloutDepth: 2, seed: 7 });
  assert.ok(Engine.apply(chain, action), 'bot returned an illegal chain action');
});
