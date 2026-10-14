const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../public/shavari-go-engine');
const Bot = require('../public/shavari-go-bot');
const Records = require('../public/match-record');
const root = path.join(__dirname, '../public');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function opening() {
  let state = B.initial(13);
  for (const [owner, to] of [
    [1, { x: 2, y: 2 }], [2, { x: 10, y: 2 }],
    [1, { x: 2, y: 10 }], [2, { x: 10, y: 10 }]
  ]) {
    assert.equal(state.player, owner);
    state = B.apply(state, { type: 'place', rank: 'keep', to });
    assert.ok(state);
  }
  return state;
}

function activeGame() {
  const state = B.initial(13);
  state.keepOpening = false;
  state.keepPlacements = { 1: 2, 2: 2 };
  return state;
}

test('13×13 opening alternates two freely placed Crownholds per side', () => {
  let state = B.initial(13);
  assert.equal(state.size, 13);
  assert.equal(B.SIZES.length, 1);
  assert.equal(state.keepOpening, true);
  assert.equal(B.legalKeepPlacements(state).length, 169);
  for (const [owner, to] of [
    [1, { x: 0, y: 0 }], [2, { x: 12, y: 0 }],
    [1, { x: 0, y: 12 }], [2, { x: 12, y: 12 }]
  ]) {
    assert.equal(state.player, owner);
    state = B.apply(state, { type: 'place', rank: 'keep', to });
    assert.ok(state);
  }
  assert.equal(state.keepOpening, false);
  assert.equal(state.player, 1);
  assert.equal(state.history.length, 4);
  assert.equal(B.initial(19), null);
});

test('Standard-Bearer and Crossbowman rays extend until the first occupied point', () => {
  const state = B.initial(13);
  state.keepOpening = false;
  state.keepPlacements = { 1: 2, 2: 2 };
  state.board[5][2] = { owner: 1, rank: 'banneret' };
  state.board[5][11] = { owner: 2, rank: 'levy' };
  state.board[2][2] = { owner: 1, rank: 'arbalist' };
  const targets = new Set(B.placementTargets(state, 1).map(({ to }) => `${to.x},${to.y}`));
  assert.ok(targets.has('10,5'));
  assert.ok(!targets.has('12,5'));
  assert.ok(targets.has('8,8'));
  assert.equal(B.canPlace(state, 'levy', { x: 8, y: 8 }, 1, { kind: 'arbalist', at: { x: 2, y: 2 } }), true);
  assert.equal(B.canPlace(state, 'levy', { x: 8, y: 8 }, 1, { kind: 'banneret', at: { x: 2, y: 5 } }), false);
  assert.equal(B.apply(state, { type: 'move', from: { x: 2, y: 2 }, to: { x: 3, y: 3 } }), null);
  assert.equal(B.apply(state, { type: 'place', rank: 'levy', to: { x: 2, y: 2 } }), null);
});

test('Marshal can siege a connected Royal Guard group by touching another member', () => {
  const state = B.initial(13);
  state.keepOpening = false;
  state.keepPlacements = { 1: 2, 2: 2 };
  state.player = 2;
  state.board[6][6] = { owner: 1, rank: 'warden' };
  state.board[7][6] = { owner: 1, rank: 'levy' };
  state.board[6][5] = { owner: 2, rank: 'levy' };
  state.board[6][7] = { owner: 2, rank: 'levy' };
  state.board[7][5] = { owner: 2, rank: 'marshal' }; // adjacent to the Squire, not the Guard
  state.board[7][7] = { owner: 2, rank: 'levy' };
  state.board[8][6] = { owner: 2, rank: 'levy' };
  state.board[4][6] = { owner: 2, rank: 'levy' }; // gives the finishing placement a legal route
  const group = B.groupAt(state.board, 13, { x: 6, y: 6 });
  assert.equal(B.liberties(state.board, 13, group).size, 1);
  assert.equal(B.captureReady(state.board, 13, group, 2), true);
  const next = B.apply(state, { type: 'place', rank: 'levy', to: { x: 6, y: 5 } });
  assert.ok(next);
  assert.equal(next.board[6][6], null);
  assert.equal(next.board[7][6], null);
  assert.equal(next.captured[2], 2);
  assert.equal(next.reserves[1].warden, B.RESERVE.warden + 1);
  assert.equal(next.reserves[1].levy, B.reservesForSize(13).levy + 1);
});

test('Crownhold groups require a Marshal beside each Crownhold', () => {
  const board = Array.from({ length: 13 }, () => Array(13).fill(null));
  const group = [{ x: 6, y: 6 }, { x: 6, y: 7 }];
  board[6][6] = { owner: 1, rank: 'keep' };
  board[7][6] = { owner: 1, rank: 'keep' };
  board[5][6] = { owner: 2, rank: 'marshal' };
  assert.equal(B.captureReady(board, 13, group, 2), false);
  board[8][6] = { owner: 2, rank: 'marshal' };
  assert.equal(B.captureReady(board, 13, group, 2), true);
});

test('Sapper breaches exactly one enemy and lands on the first empty point', () => {
  const state = activeGame();
  state.board[6][2] = { owner: 1, rank: 'banneret' };
  state.board[6][5] = { owner: 2, rank: 'levy' };
  const targets = B.placementTargets(state, 1, 'sapper');
  assert.ok(targets.some(move => move.to.x === 6 && move.to.y === 6 && move.via.over.x === 5));
  assert.ok(!targets.some(move => move.to.x === 7 && move.to.y === 6));
  assert.ok(!targets.some(move => move.to.x === 4 && move.to.y === 6));
  const placed = B.apply(state, { type: 'place', rank: 'sapper', to: { x: 6, y: 6 }, via: targets.find(move => move.to.x === 6 && move.to.y === 6).via });
  assert.equal(placed.board[6][6].rank, 'sapper');
  assert.equal(placed.reserves[1].sapper, 1);
  assert.equal(B.canPlace(state, 'sapper', { x: 3, y: 6 }, 1, { kind: 'adjacent', at: { x: 2, y: 6 } }), false);

  state.board[6][6] = { owner: 2, rank: 'levy' };
  assert.ok(!B.placementTargets(state, 1, 'sapper').some(move => move.to.x === 7 && move.to.y === 6));
  state.board[6][6] = null;
  state.board[5][2] = { owner: 2, rank: 'sentry' };
  assert.ok(!B.placementTargets(state, 1, 'sapper').some(move => move.to.x === 6 && move.to.y === 6));
});

test('Cavalier can place at a knight leap over occupied points', () => {
  const state = activeGame();
  state.board[2][2] = { owner: 1, rank: 'levy' };
  state.board[2][3] = { owner: 2, rank: 'marshal' };
  const to = { x: 4, y: 3 };
  const routes = B.routeOptions(state, to, 1, 'cavalier');
  assert.ok(routes.some(route => route.kind === 'cavalier' && route.at.x === 2 && route.at.y === 2));
  assert.equal(B.canPlace(state, 'cavalier', to, 1, { kind: 'cavalier', at: { x: 2, y: 2 } }), true);
  assert.equal(B.canPlace(state, 'levy', to, 1, { kind: 'cavalier', at: { x: 2, y: 2 } }), false);
  const next = B.apply(state, { type: 'place', rank: 'cavalier', to, via: { kind: 'cavalier', at: { x: 2, y: 2 } } });
  assert.ok(next);
  assert.equal(next.board[to.y][to.x].rank, 'cavalier');
});

test('Sentry suppresses adjacent enemy projection lines but not ordinary adjacency', () => {
  const state = activeGame();
  state.board[6][5] = { owner: 1, rank: 'banneret' };
  state.board[6][6] = { owner: 2, rank: 'sentry' };
  assert.equal(B.lineActive(state, { x: 5, y: 6 }, 1), false);
  let targets = B.placementTargets(state, 1, 'levy');
  assert.ok(!targets.some(move => move.to.x === 5 && move.to.y === 2));
  assert.ok(targets.some(move => move.to.x === 4 && move.to.y === 6 && move.via.kind === 'adjacent'));
  state.board[6][6] = null;
  assert.equal(B.lineActive(state, { x: 5, y: 6 }, 1), true);
  targets = B.placementTargets(state, 1, 'levy');
  assert.ok(targets.some(move => move.to.x === 5 && move.to.y === 2));
});

test('territory scoring excludes occupied pieces', () => {
  const state = activeGame();
  state.board[0][0] = { owner: 2, rank: 'keep' };
  for (let y = 5; y <= 7; y++) for (let x = 5; x <= 7; x++) {
    if (x !== 6 || y !== 6) state.board[y][x] = { owner: 1, rank: 'levy' };
  }
  const score = B.score(state);
  assert.equal(B.KOMI, 3.5);
  assert.equal(score[1].occupied, 8);
  assert.equal(score[1].territory, 1);
  assert.equal(score[1].total, 1);
  assert.equal(score[2].occupied, 1);
  assert.equal(score[2].territory, 0);
  assert.equal(score[2].total, B.KOMI);
});

test('bot terminal evaluation uses empty territory plus komi, never board-piece count', () => {
  const state = activeGame();
  for (let y = 5; y <= 7; y++) for (let x = 5; x <= 7; x++) {
    if (x !== 6 || y !== 6) state.board[y][x] = { owner: 1, rank: 'levy' };
  }
  const afterBlackPass = B.apply(state, { type: 'pass' });
  const finished = B.apply(afterBlackPass, { type: 'pass' });
  assert.equal(finished.result.reason, 'Two consecutive passes');
  assert.equal(Bot.evaluate(finished, 1), finished.result.score[1].total - finished.result.score[2].total);
});

test('capturing any Crownhold immediately awards the game to its captor', () => {
  const state = activeGame();
  state.player = 2;
  state.board[6][6] = { owner: 1, rank: 'keep' };
  state.board[6][5] = { owner: 2, rank: 'marshal' };
  state.board[6][7] = { owner: 2, rank: 'levy' };
  state.board[5][6] = { owner: 2, rank: 'levy' };
  state.board[8][6] = { owner: 2, rank: 'levy' };
  const next = B.apply(state, { type: 'place', rank: 'levy', to: { x: 6, y: 7 } });
  assert.ok(next);
  assert.equal(next.board[6][6], null);
  assert.equal(next.result.winner, 2);
  assert.equal(next.result.by, 'crownhold');
  assert.match(next.result.reason, /immediate victory/);
  assert.equal(B.apply(next, { type: 'pass' }), null);
  assert.ok(Bot.evaluate(next, 2) > 900);
  assert.ok(Bot.evaluate(next, 1) < -900);
});

test('bot action generation includes Sapper, Cavalier, and Sentry plans', () => {
  const state = activeGame();
  state.board[6][2] = { owner: 1, rank: 'banneret' };
  state.board[6][5] = { owner: 2, rank: 'levy' };
  state.board[2][2] = { owner: 1, rank: 'levy' };
  state.board[2][3] = { owner: 2, rank: 'levy' };
  const ranks = new Set(Bot.legalCandidates(state).map(candidate => candidate.action.rank));
  for (const rank of ['sapper', 'cavalier', 'sentry']) assert.ok(ranks.has(rank), `${rank} should be considered by the bot`);
});

test('bot passes instead of spending a turn and a point filling its own settled territory', () => {
  const state = activeGame();
  state.player = 1;
  state.ply = 60;
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    if (x < 5 || x > 7 || y < 5 || y > 7) state.board[y][x] = { owner: 1, rank: 'levy' };
  }
  state.reserves[1] = { marshal: 0, warden: 1, banneret: 0, arbalist: 0, sapper: 0, cavalier: 0, sentry: 0, levy: 0 };
  assert.equal(B.score(state)[1].territory, 9);
  const choice = Bot.chooseAction(state, { iterations: 24, maxDepth: 3, rootWidth: 12, nodeWidth: 4 });
  assert.equal(choice.action.type, 'pass');
  assert.equal(B.score(B.apply(state, choice.action))[1].territory, 9);
});

test('bot uses a Sapper breach to establish a foothold past one enemy', () => {
  const state = activeGame();
  state.ply = 30;
  state.board[6][2] = { owner: 1, rank: 'banneret' };
  state.board[6][5] = { owner: 2, rank: 'levy' };
  state.reserves[1] = { marshal: 0, warden: 0, banneret: 0, arbalist: 0, sapper: 1, cavalier: 0, sentry: 0, levy: 0 };
  const choice = Bot.chooseAction(state, { iterations: 24, maxDepth: 3, rootWidth: 16, nodeWidth: 8 });
  assert.equal(choice.action.rank, 'sapper');
  assert.equal(choice.action.via.kind, 'sapper');
  assert.deepEqual(choice.action.to, { x: 6, y: 6 });
});

test('bot places a Sentry where it silences an active Crossbowman line', () => {
  const state = activeGame();
  state.ply = 30;
  state.board[6][8] = { owner: 1, rank: 'levy' };
  state.board[8][8] = { owner: 2, rank: 'arbalist' };
  state.reserves[1] = { marshal: 0, warden: 0, banneret: 0, arbalist: 0, sapper: 0, cavalier: 0, sentry: 1, levy: 0 };
  const choice = Bot.chooseAction(state, { iterations: 24, maxDepth: 3, rootWidth: 16, nodeWidth: 8 });
  assert.equal(choice.action.rank, 'sentry');
  assert.deepEqual(choice.action.to, { x: 8, y: 7 });
  assert.equal(B.lineActive(B.apply(state, choice.action), { x: 8, y: 8 }, 2), false);
});

test('bot values a Cavalier leap that breaks enemy territory', () => {
  const state = activeGame();
  state.ply = 30;
  for (let y = 4; y <= 8; y++) for (let x = 4; x <= 8; x++) {
    if (x === 4 || x === 8 || y === 4 || y === 8) state.board[y][x] = { owner: 2, rank: 'levy' };
  }
  state.board[5][3] = { owner: 1, rank: 'levy' };
  state.reserves[1] = { marshal: 0, warden: 0, banneret: 0, arbalist: 0, sapper: 0, cavalier: 1, sentry: 0, levy: 0 };
  assert.equal(B.score(state)[2].territory, 9);
  const choice = Bot.chooseAction(state, { iterations: 24, maxDepth: 3, rootWidth: 16, nodeWidth: 8 });
  assert.equal(choice.action.rank, 'cavalier');
  assert.equal(choice.action.via.kind, 'cavalier');
  assert.deepEqual(choice.action.to, { x: 5, y: 6 });
});

test('bot selects legal opening and midgame actions', () => {
  const first = B.initial(13);
  const keep = Bot.chooseAction(first);
  assert.equal(keep.action.rank, 'keep');
  assert.ok(B.apply(first, keep.action));
  const state = opening();
  const choice = Bot.chooseAction(state, { iterations: 8, maxDepth: 3, rootWidth: 6, nodeWidth: 3 });
  assert.ok(choice.action);
  assert.equal(choice.iterations, 8);
  assert.ok(B.apply(state, choice.action));
});

test('Shavari Go records validate and replay opening actions on a 13×13 board', () => {
  const actions = opening().history.map(turn => turn.action);
  const record = Records.create('shavari-go', { size: 13, journal: actions, cursor: actions.length });
  const replayed = Records.replay(record);
  assert.equal(replayed.size, 13);
  assert.equal(replayed.keepOpening, false);
  assert.equal(Records.describe('shavari-go', actions[0], 0), '1. Place Crownhold at C11');
  assert.throws(() => Records.create('shavari-go', { size: 19, journal: [] }));
});

test('game page supports local play, undo, pass scoring and device history', t => {
  const dom = new JSDOM(read('shavari-go.html'), { url: 'http://localhost/shavari-go.html', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  const context = {
    clearRect() {}, createLinearGradient() { return { addColorStop() {} }; }, fillRect() {},
    save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
    lineTo() {}, bezierCurveTo() {}, roundRect() {}, closePath() {}, setLineDash() {}, fillText() {}, drawImage() {}
  };
  w.HTMLCanvasElement.prototype.getContext = () => context;
  w.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });
  w.HTMLElement.prototype.scrollIntoView = function() {};
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  w.HTMLDialogElement.prototype.close = function() { this.open = false; };
  w.crypto.randomUUID = () => 'test-match-id';
  w.eval(read('shavari-go-engine.js'));
  w.eval(read('shavari-go-bot.js'));
  w.eval(read('match-record.js'));
  w.eval(read('record-library.js'));
  w.eval(read('shavari-go-ui.js'));
  const $ = id => w.document.getElementById(id);
  assert.deepEqual([...$('icon-style').options].map(option => option.value), ['royal', 'chess']);
  assert.equal($('icon-style').value, 'royal');
  assert.match($('piece-tray').querySelector('[data-rank="keep"] img').getAttribute('src'), /assets\/shavari-go\/crownhold\.svg/);
  for (const emblem of ['lotus', 'elephant-head', 'camel', 'gold-scarab']) {
    assert.ok(fs.existsSync(path.join(root, `assets/shavari/${emblem}.svg`)), `${emblem} Shavari Chess emblem should exist`);
  }
  $('icon-style').value = 'chess';
  $('icon-style').dispatchEvent(new w.Event('change'));
  assert.equal(w.localStorage.getItem('shavari-go-icon-style-v1'), 'chess');
  assert.match($('piece-tray').querySelector('[data-rank="keep"] img').getAttribute('src'), /assets\/shavari\/lotus\.svg/);
  assert.match($('piece-tray').querySelector('[data-rank="marshal"] img').getAttribute('src'), /assets\/shavari\/elephant-head\.svg/);
  assert.match($('piece-tray').querySelector('[data-rank="cavalier"] img').getAttribute('src'), /assets\/shavari\/camel\.svg/);
  assert.match($('piece-tray').querySelector('[data-rank="levy"] img').getAttribute('src'), /assets\/shavari\/gold-scarab\.svg/);
  assert.match($('piece-guide').querySelector('.roster-symbol.keep img').getAttribute('src'), /assets\/shavari\/lotus\.svg/);
  $('icon-style').value = 'royal';
  $('icon-style').dispatchEvent(new w.Event('change'));
  assert.match($('piece-tray').querySelector('[data-rank="keep"] img').getAttribute('src'), /assets\/shavari-go\/crownhold\.svg/);
  const selectableRanks = [...$('piece-select').options].map(option => option.value);
  for (const rank of ['sapper', 'cavalier', 'sentry']) assert.ok(selectableRanks.includes(rank));
  for (const name of ['Sapper', 'Cavalier', 'Sentry']) assert.ok($('piece-guide').textContent.includes(name));
  for (const icon of ['crownhold', 'marshal', 'guard', 'standard', 'crossbow', 'sapper', 'cavalier', 'sentry', 'squire']) {
    assert.ok(fs.existsSync(path.join(root, `assets/shavari-go/${icon}.svg`)), `${icon} token icon should exist`);
  }
  $('play-mode').value = 'local';
  $('play-mode').dispatchEvent(new w.Event('change'));
  $('start-match').click();
  const clickPoint = (x, y) => {
    const step = (1000 - 2 * 67) / 12;
    $('board').dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 67 + x * step, clientY: 67 + y * step }));
  };
  for (const [x, y] of [[2, 2], [10, 2], [2, 10], [10, 10]]) clickPoint(x, y);
  assert.equal($('ply-label').textContent, '4 actions');
  assert.equal($('human-controls').hidden, false);
  $('piece-select').value = 'banneret';
  $('piece-select').dispatchEvent(new w.Event('change'));
  clickPoint(3, 2);
  assert.equal($('ply-label').textContent, '5 actions');
  $('undo-button').click();
  assert.equal($('ply-label').textContent, '4 actions');
  $('pass-button').click();
  $('pass-button').click();
  assert.match($('reason').textContent, /Two consecutive passes/);
  assert.equal(w.SiteRecords.read().length, 1);
  assert.equal(w.SiteRecords.read()[0].game, 'shavari-go');
});

test('collection replaces the old Bastion table with the 13×13 Shavari Go route', t => {
  const dom = new JSDOM(read('index.html'), { url: 'http://localhost/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.matchMedia = () => ({ matches: false });
  w.requestAnimationFrame = () => 0;
  w.eval(read('site-ui.js'));
  w.eval(read('collection-theme.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const selector = w.document.getElementById('game-type-select');
  selector.value = 'shavari-go';
  selector.dispatchEvent(new w.Event('change'));
  assert.equal(w.document.querySelector('[data-game="shavari-go"] strong').textContent, 'Shavari Go');
  assert.equal(w.document.querySelector('[data-game="bastion"]'), null);
  assert.equal(w.document.querySelector('[value="bastion"]'), null);
  assert.equal(w.document.getElementById('bastion-size-container'), null);
  assert.equal(w.document.getElementById('selected-table-name').textContent, 'Shavari Go');
  assert.match(w.document.getElementById('selected-table-art').getAttribute('src'), /shavari-go\.svg$/);
  assert.match(w.document.getElementById('setup-hint').textContent, /13 × 13.*friend.*bot/i);
  const preview = fs.readFileSync(path.join(__dirname, '../public/assets/collection/matches/shavari-go.svg'), 'utf8');
  for (const role of ['keep', 'marshal', 'warden', 'banneret', 'arbalist', 'levy', 'sapper', 'cavalier', 'sentry']) {
    assert.match(preview, new RegExp(`<symbol id="icon-${role}"`), `${role} should be represented in the collection preview`);
  }
  for (const [, asset] of preview.matchAll(/href="([^"]+)"/g)) if (!asset.startsWith('data:') && !asset.startsWith('#')) assert.ok(fs.existsSync(path.join(__dirname, '../public/assets/collection/matches', asset)), asset);
});

