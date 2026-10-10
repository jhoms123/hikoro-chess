const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../public/go-engine.js');
const Candidate = require('../public/go-bot-0.5.1.js');
const FullScoring = require('./fixtures/go-bot-0.5.1-full.js');

test('0.5.1 returns legal seeded moves without mutating input positions', () => {
  const options = {
    maxIterations: 40,
    timeMs: 10000,
    rolloutDepth: 4,
    rolloutPlacementLimit: 10,
    rootPlacementLimit: 20,
    treePlacementLimit: 14,
    seed: 202605
  };

  for (const size of [9, 13]) {
    const state = Engine.initial(size);
    const before = JSON.stringify(state);
    const candidate = Candidate.analyze(state, options);

    assert.ok(candidate.action, `${size}x${size} search should find a move`);
    assert.equal(JSON.stringify(state), before, 'analysis must not mutate its input');
    assert.ok(Engine.apply(state, candidate.action), `${size}x${size} action must be legal`);
  }
});

test('0.5.1 bounds the 9x9 root placement set by default', () => {
  const state = Engine.initial(9);
  const result = Candidate.analyze(state, {
    maxIterations: 1,
    timeMs: 10000,
    rolloutDepth: 1,
    rolloutPlacementLimit: 8,
    treePlacementLimit: 8,
    seed: 901
  });

  assert.equal(result.stats.rootLegal, 57); // 56 placements plus pass.
  assert.ok(Engine.apply(state, result.action));
});

test('0.5.1 cached static evaluations preserve full-scoring priors and search choices', () => {
  const opening = Engine.initial(9);
  const ranked = bot => bot.rankActions(opening, { placementLimit: 56, seed: 1601 })
    .map(row => ({ action: row.action, score: row.score, prior: row.prior }));
  assert.deepEqual(ranked(Candidate), ranked(FullScoring));

  const options = {
    maxIterations: 24,
    timeMs: 10000,
    rolloutDepth: 4,
    rolloutPlacementLimit: 10,
    rootPlacementLimit: 56,
    treePlacementLimit: 40,
    seed: 1602
  };
  const full = FullScoring.analyze(Engine.initial(9), options);
  const cached = Candidate.analyze(Engine.initial(9), options);

  assert.deepEqual(cached.action, full.action);
  assert.deepEqual(cached.values.map(row => [row.action, row.visits]),
    full.values.map(row => [row.action, row.visits]));
  assert.ok(cached.stats.cachedNodeEvaluations > 0, JSON.stringify(cached.stats));
});

test('0.5.1 passes once a dense board is settled and no move scores points', () => {
  const state = Engine.initial(9);
  for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) {
    if (!((x === 3 && y === 3) || (x === 5 && y === 3))) state.board[y][x] = 1;
  }

  const options = { maxIterations: 8, timeMs: 10000, seed: 8101 };
  const first = Candidate.analyze(state, options);
  assert.deepEqual(first.action, { type: 'pass' });
  assert.equal(first.stats.settledPass, true);

  const afterFirstPass = Engine.apply(state, first.action);
  assert.equal(afterFirstPass.passes, 1);
  const second = Candidate.analyze(afterFirstPass, options);
  assert.deepEqual(second.action, { type: 'pass' });
  assert.equal(second.stats.settledPass, true);
  assert.equal(Engine.apply(afterFirstPass, second.action).result.reason, 'Two consecutive passes');
});

test('0.5.1 keeps playing when an unsettled group can be captured', () => {
  const state = Engine.initial(9);
  for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) {
    if (x !== 4 || y !== 4) state.board[y][x] = 1;
  }
  state.player = 2;

  const result = Candidate.analyze(state, { maxIterations: 0, timeMs: 10000, seed: 8102 });
  assert.equal(result.stats.settledPass, false);
  assert.notDeepEqual(result.action, { type: 'pass' });
  assert.ok(Engine.apply(state, result.action));
});

test('0.5.1 shares reserve-placement outcomes through RAVE and supports an ablation', () => {
  const options = {
    maxIterations: 64,
    timeMs: 10000,
    rolloutDepth: 8,
    rolloutPlacementLimit: 16,
    rootPlacementLimit: 56,
    treePlacementLimit: 72,
    seed: 321,
    raveEnabled: true
  };
  const withRave = Candidate.analyze(Engine.initial(9), options);
  assert.ok(withRave.stats.raveUpdates > 0, JSON.stringify(withRave.stats));
  assert.ok(withRave.stats.raveSelections > 0, JSON.stringify(withRave.stats));
  assert.ok(Engine.apply(Engine.initial(9), withRave.action));

  const withoutRave = Candidate.analyze(Engine.initial(9), { ...options, raveEnabled: false });
  assert.equal(withoutRave.stats.raveUpdates, 0);
  assert.equal(withoutRave.stats.raveSelections, 0);
  assert.ok(Engine.apply(Engine.initial(9), withoutRave.action));
});

test('0.5.1 can learn and forget last-good replies inside rollouts, behind an ablation', () => {
  const state = Engine.initial(9);
  const options = {
    maxIterations: 160,
    timeMs: 10000,
    rolloutDepth: 8,
    rolloutPlacementLimit: 16,
    rootPlacementLimit: 56,
    treePlacementLimit: 28,
    seed: 4461,
    lgrEnabled: true
  };
  const withLgr = Candidate.analyze(state, options);
  assert.ok(withLgr.stats.lgrUpdates > 0, JSON.stringify(withLgr.stats));
  assert.ok(withLgr.stats.lgrSelections > 0, JSON.stringify(withLgr.stats));
  assert.ok(Engine.apply(state, withLgr.action));

  const withoutLgr = Candidate.analyze(Engine.initial(9), { ...options, lgrEnabled: false });
  assert.equal(withoutLgr.stats.lgrUpdates, 0);
  assert.equal(withoutLgr.stats.lgrForgets, 0);
  assert.equal(withoutLgr.stats.lgrSelections, 0);
  assert.ok(Engine.apply(Engine.initial(9), withoutLgr.action));
});

test('0.5.1 identifies normal stones exposed to legal jump captures', () => {
  const state = Engine.initial(9);
  state.board[4][0] = 1;
  state.board[4][1] = 2;
  assert.deepEqual(Candidate.jumpThreatExposure(state), { 1: 0, 2: 2.7 });

  state.board[4][2] = 2;
  assert.deepEqual(Candidate.jumpThreatExposure(state), { 1: 0, 2: 0 });

  state.board[4][2] = 0;
  state.remaining[1] = 0;
  assert.deepEqual(Candidate.jumpThreatExposure(state), { 1: 0, 2: 0 });
});

test('0.5.1 recognizes two safe eyes and treats jumpable eyes as vulnerable', () => {
  const state = Engine.initial(9);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) {
    if ((x === 3 && y === 3) || (x === 5 && y === 3)) continue;
    state.board[y][x] = 1;
  }

  const group = Candidate.eyeStatus(state).find(item => item.side === 1 && item.stones === 23);
  assert.ok(group, JSON.stringify(Candidate.eyeStatus(state)));
  assert.equal(group.eyes, 2);
  assert.equal(group.secureEyes, 2);
  assert.equal(group.aliveByTwoEyes, true);

  state.board[3][1] = 2;
  const whiteToMove = { ...state, player: 2 };
  assert.ok(Engine.legalMoves(whiteToMove, { x: 1, y: 3 })
    .some(move => move.type === 'jump' && move.to.x === 3 && move.to.y === 3));
  const threatenedGroup = Candidate.eyeStatus(state).find(item => item.side === 1 && item.stones === 23);
  assert.equal(threatenedGroup.eyes, 2);
  assert.equal(threatenedGroup.secureEyes, 1);
  assert.equal(threatenedGroup.aliveByTwoEyes, false);
});

test('0.5.1 avoids filling a protected eye but still fills an eye that stops an immediate jump', () => {
  const state = Engine.initial(9);
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) {
    if ((x === 3 && y === 3) || (x === 5 && y === 3)) continue;
    state.board[y][x] = 1;
  }
  const findScore = (result, x, y) => result.find(row => row.action.type === 'place' &&
    row.action.to.x === x && row.action.to.y === y).score;
  const ordinaryEye = Candidate.rankActions(state, { eyeAware: true, seed: 511 });
  const plainEye = Candidate.rankActions(state, { eyeAware: false, seed: 511 });
  assert.ok(findScore(ordinaryEye, 3, 3) < findScore(plainEye, 3, 3));

  state.board[3][1] = 2;
  const threatenedEye = Candidate.rankActions(state, { eyeAware: true, seed: 512 });
  const plainThreatenedEye = Candidate.rankActions(state, { eyeAware: false, seed: 512 });
  assert.equal(findScore(threatenedEye, 3, 3), findScore(plainThreatenedEye, 3, 3));
});

test('0.5.1 re-roots at a searched opponent reply and keeps its visit statistics', () => {
  const options = {
    maxIterations: 200,
    timeMs: 10000,
    rolloutDepth: 3,
    rootPlacementLimit: Infinity,
    treePlacementLimit: 72,
    seed: 1
  };
  const opening = Engine.initial(9);
  const first = Candidate.analyze(opening, options);
  assert.ok(first.stats.reusableReplyNodes > 0, JSON.stringify(first.stats));

  const afterCandidate = Engine.apply(opening, first.action);
  const likelyReply = Candidate.rankActions(afterCandidate, {
    placementLimit: 72,
    seed: options.seed + 100
  })[0].action;
  const afterReply = Engine.apply(afterCandidate, likelyReply);
  assert.ok(afterReply);

  const next = Candidate.analyze(afterReply, { ...options, maxIterations: 1, seed: 2026 });
  assert.equal(next.stats.treeReused, true, JSON.stringify(next.stats));
  assert.ok(next.stats.reusedRootVisits > 0, JSON.stringify(next.stats));
  assert.ok(Engine.apply(afterReply, next.action));
});

test('0.5.1 reuses a forced same-player jump-chain state and returns legal actions', () => {
  const state = Engine.initial(9);
  state.board[4][3] = 1;
  state.board[4][4] = 2;
  state.board[4][6] = 2;
  const chain = Engine.apply(state, {
    type: 'move', from: { x: 3, y: 4 }, to: { x: 5, y: 4 }
  });
  assert.ok(chain?.chain);

  const result = Candidate.analyze(chain, {
    maxIterations: 16,
    timeMs: 10000,
    rolloutDepth: 2,
    seed: 77
  });
  assert.equal(result.action.type,'move');
  assert.ok(Engine.apply(chain, result.action));
  const continued=Engine.apply(chain,result.action);
  assert.ok(continued?.chain);
  const next=Candidate.analyze(continued,{maxIterations:4,timeMs:10000,rolloutDepth:2,seed:78});
  assert.equal(next.stats.treeReused,true,JSON.stringify(next.stats));
  assert.ok(Engine.apply(continued,next.action));
});

test('threefold repetition ends with the higher score as the winner', () => {
  const state = Engine.initial(9);
  for (const [x, y] of [[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [0, 2], [2, 2]]) {
    state.board[y][x] = 1;
  }
  state.player = 2;
  const repeatedBoard = state.board.map(row => row.slice());
  repeatedBoard[8][8] = 2;
  state.positions[repeatedBoard.flat().join('') + ':1'] = 2;

  const ended = Engine.apply(state, { type: 'place', to: { x: 8, y: 8 } });
  assert.equal(ended.result.reason, 'Threefold repetition; score decides');
  assert.equal(ended.result.winner, 1);
});

test('the website and worker load the integrated 0.5.1 opponent', () => {
  const readPublic = file => fs.readFileSync(path.join(__dirname, '../public', file), 'utf8');
  const page = readPublic('go.html');
  const ui = readPublic('go-ui.js');
  const worker = readPublic('go-bot-worker.js');

  assert.match(page, /go-bot-0\.5\.1\.js\?v=shield-go-settlement-v12/);
  assert.match(ui, /Shield Go bot 0\.5\.1/);
  assert.match(worker, /go-bot-0\.5\.1\.js\?v=shield-go-settlement-v12/);
});
