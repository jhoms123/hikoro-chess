const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const Shavari = require('../public/shavari-engine');

test('the integrated v1.3.2 Shavari worker returns a rules-legal action', () => {
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
