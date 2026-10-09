const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const RoomDiscovery = require('../public/room-discovery');
const { createSdsValidator, applySdsAction } = require('../sds-validator');
const { createSdsBotRunner } = require('../sds-bot-runner');
const { createServer } = require('../server');
const { io: connect } = require('socket.io-client');

const publicDir = path.join(__dirname, '../public');
const read = file => fs.readFileSync(path.join(publicDir, file), 'utf8');

test('online setup lets the host choose a valid number of v13.5.1 bot seats', () => {
    const dom = new JSDOM(read('index.html'));
    const page = dom.window.document;
    assert.deepEqual([...page.querySelector('#sds-player-count').options].map(option => option.value), ['2', '3', '4']);
    assert.deepEqual([...page.querySelector('#sds-bot-count').options].map(option => option.value), ['0', '1', '2', '3']);
    assert.match(page.querySelector('#sds-bot-hint').textContent, /Adaptive Gumbel Guide v13\.5\.1/);
    const script = read('script.js');
    assert.match(script, /updateSdsBotOptions/);
    assert.match(script, /sdsBotCount/);
    dom.window.close();
});

test('room discovery counts human capacity separately from bot seats', () => {
    const dom = new JSDOM('<section class="rooms-section"><div id="rooms"></div></section>');
    const host = dom.window.document.querySelector('#rooms');
    const room = { gameType: 'shodansho', currentPlayers: 1, maxPlayers: 4, humanCapacity: 2, botCount: 2, timeControl: { main: -1 } };
    const visible = RoomDiscovery.filter({ open: room, full: { ...room, currentPlayers: 2 } });
    assert.deepEqual(visible.map(([id]) => id), ['open']);
    const ui = RoomDiscovery.mount(host, { join() {}, formatTime: () => 'Unlimited' });
    ui.update({ open: room });
    assert.equal(host.querySelector('small').textContent, 'Unlimited · 1 / 2 humans · 2 bots');
    dom.window.close();
});

test('server worker uses the v13.5.1 bot path and returns a rules-legal move for two to four seats', async () => {
    const runner = createSdsBotRunner();
    try {
        for (const playerCount of [2, 3, 4]) {
            const engine = createSdsValidator(playerCount);
            const result = await runner.search(engine, { budgetMs: 140, width: 5 });
            assert.equal(result.engine, 'Adaptive Gumbel Guide v13.5.1');
            assert.ok(result.action, `${playerCount}-seat search returns an action`);
            const action = result.action.type === 'drop'
                ? { type: 'dropSelectedHand', kind: result.action.kind, key: result.action.dst }
                : result.action.type === 'move'
                    ? { type: 'applyMove', move: { pieceId: result.action.pieceId, dst: result.action.dst } }
                    : { type: 'pickupSelectedSun', pieceId: result.action.pieceId };
            assert.ok(applySdsAction(engine, action), `${playerCount}-seat action is accepted by the site rules engine`);
        }
    } finally {
        runner.close();
    }
});

test('Sho Dan Sho local play carries player and bot seat choices into the official table', () => {
    const script = read('script.js'), page = read('shodansho.html');
    assert.match(script, /shodansho\.html\?players=\$\{players\}&bots=\$\{bots\}/);
    assert.match(script, /sdsPlayerCount - sdsBotCount <= 1/);
    assert.match(page, /localBotSeatCount/);
    assert.match(page, /shodansho-local-bot-worker\.js/);
});

test('server rejects one-human bot rooms so they start as local matches', async t => {
    const { server, io } = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const socket = connect(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], forceNew: true });
    t.after(async () => { socket.disconnect(); await new Promise(resolve => io.close(resolve)); });
    await new Promise(resolve => socket.once('connect', resolve));
    const rejected = new Promise(resolve => socket.once('errorMsg', resolve));
    socket.emit('createGame', { gameType: 'shodansho', sdsPlayerCount: 2, sdsBotCount: 1 });
    assert.match(await rejected, /locally/i);
});
