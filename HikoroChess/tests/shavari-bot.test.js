const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const Shavari = require('../public/shavari-engine');

test('the integrated v1.3.3 Shavari worker returns a rules-legal action', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/shavari-bot-worker.js'), 'utf8');
    const messages = [];
    const sandbox = { performance, postMessage: message => messages.push(message), console };
    sandbox.self = sandbox;
    vm.runInNewContext(source, sandbox, { timeout: 5000 });
    sandbox.onmessage({ data: { id: 1, journal: [], ms: 70 } });
    assert.equal(messages[0].id, 1);
    assert.ok(messages[0].action, messages[0].error || 'bot returned no action');
    assert.ok(Shavari.apply(Shavari.initial(), messages[0].action));
});

test('the bot enforces non-stackable Generals and adjudicates no-move losses', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/shavari-bot-worker.js'), 'utf8');
    const sandbox = { performance, postMessage: () => {}, console }; sandbox.self = sandbox;
    vm.runInNewContext(source, sandbox, { timeout: 5000 });
    const S = sandbox.ShavariLab;
    const board = Array.from({ length: 81 }, () => []);
    board[8 * 9 + 2] = [(1 << 2) + 2]; board[8 * 9 + 4] = [(1 << 2) + 0];
    const generalStack = S.generate(board, 1).some(m => m.from === 8 * 9 + 2 && m.to === 8 * 9 + 4 && m.kind === 1);
    assert.equal(generalStack, false);
    const blocked = Array.from({ length: 81 }, () => [5, 5, 5]); blocked[9] = [5, 5, 11];
    const state = { board: blocked, player: 2, ply: 0, result: null, history: [], noCapturePlies: 0, repetitions: {} };
    const action = S.generate(blocked, 2).find(m => m.from === 9 && m.to === 0 && m.count === 1 && m.kind === 2);
    assert.ok(action);
    const next = S.apply(state, action);
    assert.equal(next.result.winner, 2); assert.equal(next.result.reason, 'No legal moves');
});
