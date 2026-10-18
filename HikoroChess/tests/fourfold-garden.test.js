const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { io: connect } = require('socket.io-client');
const { JSDOM } = require('jsdom');
const Garden = require('../public/fourfold-garden');
const Records = require('../public/match-record');
const Rooms = require('../public/room-discovery');
const { createServer } = require('../server');

const publicDir = path.join(__dirname, '../public');
const read = file => fs.readFileSync(path.join(publicDir, file), 'utf8');
const once = (socket, event) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Timed out waiting for ' + event)), 5000);
    socket.once(event, value => { clearTimeout(timer); resolve(value); });
});
const onceWhere = (socket, event, predicate) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(Error('Timed out waiting for matching ' + event)); }, 5000);
    const handler = value => { if (!predicate(value)) return; clearTimeout(timer); socket.off(event, handler); resolve(value); };
    socket.on(event, handler);
});

test('compact game keeps the circular 109-point board, separate reserves, and legal turn sequence', () => {
    let state = Garden.initial();
    assert.equal(state.board.length, 121);
    assert.equal(state.board.filter((_, i) => {
        const x = i % 11 - 5, y = Math.floor(i / 11) - 5;
        return x * x + y * y <= 36;
    }).length, 109);
    assert.equal(state.reserves[0].rose, 1);
    assert.equal(state.reserves[0].bell, 1);

    state = Garden.apply(state, { kind: 'place', type: 'rose', index: 60 });
    assert.equal(state.turnStage, 'bonus');
    assert.equal(state.reserves[0].rose, 0);
    assert.equal(Garden.apply(state, { kind: 'place', type: 'vine', index: 61 }), null, 'a turn cannot place twice');
    state = Garden.apply(state, { kind: 'finish' });
    assert.equal(state.player, 2);
    state = Garden.apply(state, { kind: 'place', type: 'vine', index: 72 });
    assert.equal(state.board[72].owner, 1);
    assert.equal(Garden.apply(state, { kind: 'finish' }).player, 1);
});

test('pickup can return the just-placed piece only when it is your sole board piece', () => {
    let state = Garden.apply(Garden.initial(), { kind: 'place', type: 'rose', index: 60 });
    state = Garden.apply(state, { kind: 'pickup', index: 60 });
    assert.equal(state.reserves[0].rose, 1);
    assert.equal(state.board[60], null);
    state = Garden.initial();
    state = Garden.apply(state, { kind: 'place', type: 'rose', index: 60 });
    state = Garden.apply(state, { kind: 'finish' });
    state = Garden.apply(state, { kind: 'place', type: 'vine', index: 72 });
    state = Garden.apply(state, { kind: 'finish' });
    state = Garden.apply(state, { kind: 'place', type: 'chrysanthemum', index: 61 });
    assert.equal(Garden.apply(state, { kind: 'pickup', index: 61 }), null, 'a newly placed piece is protected while an older one is on the board');
    const oldIndex = state.board.findIndex(piece => piece?.owner === 0);
    assert.ok(Garden.apply(state, { kind: 'pickup', index: oldIndex }));
});

test('four diagonal flower links complete the center ring and win', () => {
    const state = Garden.initial();
    state.board[3 * 11 + 5] = { id: 'p1', type: 'rose', owner: 0, used: false, bridgePair: null, mirrorActive: false, shieldTarget: null };
    state.board[5 * 11 + 7] = { id: 'p2', type: 'vine', owner: 0, used: false, bridgePair: null, mirrorActive: false, shieldTarget: null };
    state.board[7 * 11 + 5] = { id: 'p3', type: 'chrysanthemum', owner: 0, used: false, bridgePair: null, mirrorActive: false, shieldTarget: null };
    state.reserves[0].rose = 0; state.reserves[0].vine = 0; state.reserves[0].chrysanthemum = 0;
    state.reserves[0].bamboo = 1; state.current = 0; state.turnStage = 'place'; state.nextId = 4;
    const won = Garden.apply(state, { kind: 'place', type: 'bamboo', index: 5 * 11 + 3 });
    assert.ok(won);
    assert.equal(won.winner, 0);
    assert.equal(won.result.winner, 1);
    assert.match(won.result.reason, /center/i);
});

test('Fourfold Garden match records replay and describe accepted actions', () => {
    const journal = [
        { kind: 'place', type: 'rose', index: 60 }, { kind: 'finish' },
        { kind: 'place', type: 'vine', index: 72 }, { kind: 'finish' }
    ];
    const record = Records.create('fourfold-garden', { journal }, null, { id: 'garden-record' });
    assert.ok(Records.games.includes('fourfold-garden'));
    assert.equal(Records.replay(record).ply, 2);
    assert.equal(Records.describe('fourfold-garden', journal[0], 0), '1. Place Rose at F6');
    assert.equal(Records.describe('fourfold-garden', journal[1], 1), '2. Finish turn');
});

test('the replay page loads and paints the garden engine without the playable board UI', async () => {
    const dom = new JSDOM(read('replay.html'), { url: 'https://example.test/replay.html', runScripts: 'outside-only' });
    try {
        const w = dom.window;
        w.TextEncoder = TextEncoder;
        w.eval(read('fourfold-garden.js'));
        assert.equal(typeof w.FourfoldGardenEngine?.apply, 'function');
        w.eval(read('match-record.js'));
        assert.ok(w.MatchRecord.games.includes('fourfold-garden'));
        const record = w.MatchRecord.create('fourfold-garden', { journal: [
            { kind: 'place', type: 'rose', index: 60 }, { kind: 'finish' }
        ] });
        assert.equal(w.MatchRecord.replay(record).board[60].type, 'rose');
        w.sessionStorage.setItem('hikoro-replay-record', JSON.stringify(record));
        w.JournalNotes = { read: () => ({ title: '', comments: {}, bookmarks: [] }), clean: () => ({ title: '', comments: {}, bookmarks: [] }), refresh: async () => {}, save: async () => {} };
        w.SiteRecords = { download() {}, remember() {} };
        w.SiteAccounts = {};
        w.eval(read('replay.js'));
        w.dispatchEvent(new w.CustomEvent('replay-seek', { detail: 2 }));
        assert.equal(w.document.querySelectorAll('#replay-board .garden-token').length, 1);
        assert.equal(w.document.querySelectorAll('#replay-board .garden-point:not(.offboard)').length, 109);
        assert.equal(w.document.getElementById('match-analysis').hidden, true);
        const html = read('replay.html');
        assert.ok(html.indexOf('fourfold-garden.js') < html.indexOf('match-record.js'));
    } finally { dom.window.close(); }
});

test('lobby and bilingual game guide expose all ten pieces and full win rules', () => {
    const html = read('fourfold-garden.html');
    assert.match(html, /id="pieceGuideGrid"/);
    assert.match(html, /four-flower Harmony loop enclosing the center wins/);
    assert.match(html, /diagonal links/);
    const translations = JSON.parse(read('locales/es-CU.json'));
    const sourceRules = [
        'Each player starts with 10 pieces: six Flowers and four Tools. On a normal turn, place one reserve piece, then you may use one ability, pick up one of your own older pieces, or finish your turn. A picked-up piece returns to your reserve. If your placement uses your last reserve piece and does not win, you must pick up one of your own pieces before ending that same turn. If your new piece is captured immediately and you have no other piece on the board, that capture already removes it and your turn ends. If you start a turn with no reserve pieces, your whole turn is a mandatory pickup. You normally cannot pick up the piece you just placed; if it is your only piece on the board, you may pick it up to keep the game moving.',
        'Orchid, Wheel, Fan, and Bell each have one active ability use; if a used ability piece is picked up or captured, it remains spent when returned to reserve. Rose, Chrysanthemum, Vine, Bamboo, Peony, and Knotweed have passive effects; Peony and Knotweed do not spend a turn converting links. This compact edition uses ten pieces: Rose, Vine, Chrysanthemum, Bamboo, Orchid, Peony, Knotweed, Wheel, Fan, and Bell. Picking up one of your own blockers can expose or break rays. There are no round counters or temporary range bonuses.',
        'Tool wheel (8 types): Rock → Knotweed → Mirror → Bridge → Boat → Wheel → Fan → Bell → back to Rock.'
    ];
    assert.ok(sourceRules.every(key => typeof translations[key] === 'string'), 'Spanish entries exist for full game rules');
    assert.equal(read('assets/collection/icons/fourfold-garden.svg').includes('<svg'), true);
    assert.match(read('script.js'), /fourfold-garden\.html\?mode=bot-indigo/);
});

test('shared collection styling leaves Fourfold board points under game-specific styling', () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body class="fourfold-garden-page" data-audio-theme="fourfold-garden"><button class="point">intersection</button><button id="rules-button">How to play</button><button id="hidden-game-control" hidden>Hidden control</button></body></html>', { runScripts: 'outside-only' });
    try {
        const w = dom.window;
        const style = w.document.createElement('style');
        style.textContent = read('collection-theme.css') + '\n' + read('fourfold-garden.css');
        w.document.head.append(style);
        w.eval(read('collection-theme.js'));
        w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
        assert.equal(w.document.querySelector('.point').classList.contains('material-control'), false);
        assert.equal(w.document.getElementById('rules-button').classList.contains('material-control'), true);
        assert.equal(w.getComputedStyle(w.document.getElementById('hidden-game-control')).display, 'none', 'shared material controls must respect the hidden attribute');
        const css = read('fourfold-garden.css');
        assert.match(css, /radial-gradient\(ellipse at top,#5361438a,#111d15e8\)/, 'the garden page uses Sho Dan Sho’s forest timber palette');
        assert.match(css, /reserve-flower \.tile-name\{display:none\}/, 'phone reserve buttons use icon-only labels');
    } finally { dom.window.close(); }
});

test('live board, score and all ten piece explanations render in Cuban Spanish', async t => {
    const dom = new JSDOM(read('fourfold-garden.html'), { url: 'https://example.test/fourfold-garden.html?mode=bot-indigo', runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const w = dom.window;
    w.requestAnimationFrame = () => 0;
    w.SiteAccounts = { register() {}, socket() { return null; }, playerName() { return 'Jardinero'; } };
    w.eval(read('i18n-catalog.js'));
    w.eval(read('i18n.js'));
    w.eval(read('fourfold-garden.js'));
    assert.equal(w.document.getElementById('opponentMode').value, 'bot-indigo');
    w.I18n.setLanguage('es-CU');
    await new Promise(resolve => setTimeout(resolve, 25));
    const guides = [...w.document.querySelectorAll('.piece-guide-card')].map(card => card.textContent);
    assert.equal(guides.length, 10);
    assert.ok(guides.some(text => text.startsWith('Rosa')));
    assert.ok(guides.some(text => text.startsWith('Crisantemo')));
    assert.ok(guides.some(text => text.includes('Centidonia')));
    assert.ok(guides.every(text => !/Flower wheel:|Once, |Passive Counterpoint:|Once, pull/.test(text)));
    const orchid = [...w.document.querySelectorAll('.reserve-flower')].find(button => button.getAttribute('aria-label')?.startsWith('Orquídea'));
    const fan = [...w.document.querySelectorAll('.reserve-flower')].find(button => button.getAttribute('aria-label')?.startsWith('Abanico'));
    assert.match(orchid.title, /Se aplican las relaciones de la rueda de Flores/);
    assert.match(fan.title, /Una vez, empuja una fila o columna/);
    assert.match(fan.title, /Habilidades en reserva sin usar: 1; agotadas: 0/);
    assert.doesNotMatch(orchid.title + fan.title, /Flower wheel|Once, push|destination must|Reserve:|ready|spent/);
    assert.match(w.document.querySelector('#log .log-entry').textContent, /Partida nueva\. Marfil comienza colocando una pieza\./);
    w.document.querySelector('.tile-card').click();
    w.document.querySelector('.point[data-index="60"]').click();
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(w.document.querySelectorAll('.point .piece-icon').length, 1);
    assert.match(w.document.querySelector('#statusMain').textContent, /Marfil/);
    assert.match(w.document.querySelector('#harmonyScore').textContent, /se repitió 1\/3 veces/);
    assert.match(w.document.querySelector('#log .log-entry').textContent, /Marfil colocó Rosa en/);
    w.document.getElementById('finishTurnBtn').click();
    assert.match(w.document.querySelector('#log .log-entry').textContent, /Marfil terminó el turno sin una acción adicional/);
});

test('a local bot answers a human placement and finishes its turn', async t => {
    const dom = new JSDOM(read('fourfold-garden.html'), { url: 'https://example.test/fourfold-garden.html?mode=bot-indigo', runScripts: 'outside-only', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const w = dom.window;
    w.requestAnimationFrame = () => 0;
    w.SiteAccounts = { register() {}, socket() { return null; }, playerName() { return 'Player'; } };
    w.eval(read('fourfold-garden.js'));
    w.document.querySelector('.tile-card').click();
    w.document.querySelector('.point[data-index="60"]').click();
    w.document.getElementById('finishTurnBtn').click();
    const deadline = Date.now() + 4000;
    while (!w.document.querySelector('.token.owner1') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(w.document.querySelector('.token.owner1'), 'Indigo bot places a tile');
    const turnDeadline = Date.now() + 4000;
    while (!w.document.querySelector('#statusMain').textContent.includes('Ivory') && Date.now() < turnDeadline) await new Promise(resolve => setTimeout(resolve, 25));
    assert.match(w.document.querySelector('#statusMain').textContent, /Ivory/);
});

test('room discovery lists the online garden table', () => {
    const rooms = { garden: { gameType: 'fourfold-garden', currentPlayers: 1, maxPlayers: 2, timeControl: { main: -1 } } };
    assert.deepEqual(Rooms.filter(rooms).map(([id]) => id), ['garden']);
});

test('online garden rooms validate seats, synchronize actions, resume, and end on resignation', async t => {
    const { server, io } = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const sockets = [];
    t.after(async () => { sockets.forEach(socket => socket.disconnect()); await new Promise(resolve => io.close(resolve)); });
    async function client() {
        const socket = connect(`http://127.0.0.1:${server.address().port}`, { transports: ['websocket'], forceNew: true });
        sockets.push(socket); await once(socket, 'connect'); return socket;
    }
    const ivory = await client(), indigo = await client(), outsider = await client();
    const created = once(ivory, 'gameCreated'), ivorySeat = once(ivory, 'seatAssigned');
    ivory.emit('createGame', { gameType: 'fourfold-garden', timeControl: { main: -1, byoyomiTime: 0 } });
    const [{ gameId }, firstSeat] = await Promise.all([created, ivorySeat]);
    const startA = once(ivory, 'gameStart'), startB = once(indigo, 'gameStart'), indigoSeat = once(indigo, 'seatAssigned');
    const syncA = onceWhere(ivory, 'fourfold-gardenState', data => data.state.started), syncB = onceWhere(indigo, 'fourfold-gardenState', data => data.state.started);
    indigo.emit('joinGame', gameId);
    let [a, b] = await Promise.all([syncA, syncB]);
    await Promise.all([startA, startB, indigoSeat]);
    assert.deepEqual(a.state, b.state);

    const wrongTurn = once(indigo, 'errorMsg');
    indigo.emit('fourfold-gardenAction', { gameId, action: { kind: 'place', type: 'rose', index: 60 } });
    assert.match(await wrongTurn, /turn/i);
    const placedA = once(ivory, 'fourfold-gardenState'), placedB = once(indigo, 'fourfold-gardenState');
    ivory.emit('fourfold-gardenAction', { gameId, action: { kind: 'place', type: 'rose', index: 60 } });
    [a, b] = await Promise.all([placedA, placedB]); assert.deepEqual(a.state, b.state); assert.equal(a.state.turnStage, 'bonus');
    const finishedA = once(ivory, 'fourfold-gardenState'), finishedB = once(indigo, 'fourfold-gardenState');
    ivory.emit('fourfold-gardenAction', { gameId, action: { kind: 'finish' } });
    [a, b] = await Promise.all([finishedA, finishedB]); assert.equal(a.state.player, 2); assert.deepEqual(a.state, b.state);
    const nextA = once(ivory, 'fourfold-gardenState'), nextB = once(indigo, 'fourfold-gardenState');
    indigo.emit('fourfold-gardenAction', { gameId, action: { kind: 'place', type: 'vine', index: 72 } });
    [a, b] = await Promise.all([nextA, nextB]); assert.equal(a.state.turnStage, 'bonus'); assert.deepEqual(a.state, b.state);
    const endA = once(ivory, 'fourfold-gardenState'), endB = once(indigo, 'fourfold-gardenState');
    indigo.emit('fourfold-gardenAction', { gameId, action: { kind: 'finish' } });
    [a, b] = await Promise.all([endA, endB]); assert.equal(a.state.ply, 2); assert.deepEqual(a.state, b.state);

    const restored = await client(), resumed = once(restored, 'fourfold-gardenState');
    restored.emit('joinFourfoldGardenRoom', { gameId, token: firstSeat.token });
    assert.equal((await resumed).state.ply, 2);
    const rejected = once(outsider, 'errorMsg');
    outsider.emit('fourfold-gardenResign', { gameId }); assert.match(await rejected, /seat/i);
    const result = once(indigo, 'fourfold-gardenState');
    restored.emit('fourfold-gardenResign', { gameId });
    assert.equal((await result).state.winner, 1);
});
