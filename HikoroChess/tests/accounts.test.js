const test = require('node:test');
const assert = require('node:assert/strict');
const { accountConfig, installAccounts } = require('../accounts');
const { createServer } = require('../server');
const { io } = require('socket.io-client');
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test' };
function harness() {
    const writes = [], routes = {}; let middleware;
    const api = installAccounts({ get: (path, fn) => routes[path] = fn }, { use: fn => middleware = fn }, {
        env, clientFactory: (_url, key) => key.startsWith('sb_secret') ? { from: () => ({ upsert: async rows => { writes.push(rows); return {}; } }) }
            : { auth: { getUser: async token => token === 'valid' ? { data: { user: { id: 'verified' } } } : { error: new Error('invalid') } } }
    });
    return { api, writes, routes, middleware };
}
test('public config refuses secret/service role keys and only advertises configured login methods', () => {
    assert.equal(accountConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' }).enabled, false);
    const token = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    assert.equal(accountConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: 'x.' + token + '.x' }).enabled, false);
    assert.deepEqual(accountConfig({ ...env, ACCOUNT_PROVIDERS: 'google,github,evil' }).providers, ['google', 'github']);
    const h = harness(); let json;
    h.routes['/api/account-config']({}, { json: data => json = data });
    assert.equal(JSON.stringify(json).includes('sb_secret'), false);
});
test('socket accounts come from verified Auth user data, never client-provided identifiers', async () => {
    const h = harness();
    const guest = { handshake: { auth: { userId: 'forged' } }, data: {} };
    await h.middleware(guest, error => assert.equal(error, undefined)); assert.equal(guest.data.accountId, undefined);
    const bad = { handshake: { auth: { token: 'invalid', userId: 'forged' } }, data: {} };
    await h.middleware(bad, error => assert.ok(error)); assert.equal(bad.data.accountId, undefined);
    const valid = { handshake: { auth: { token: 'valid', userId: 'forged' } }, data: {} };
    await h.middleware(valid, error => assert.equal(error, undefined)); assert.equal(valid.data.accountId, 'verified');
});
test('only distinct signed-in opponents count; terminal server results are idempotent', async () => {
    const h = harness(), game = { id: 'game_1', started: true, gameOver: true, maxPlayers: 2, gameType: 'go' };
    await h.api.recordResult(game, ['a', null], { winner: 1 });
    await h.api.recordResult(game, ['a', 'a'], { winner: 1 });
    await h.api.recordResult({ ...game, isSinglePlayer: true }, ['a', 'b'], { winner: 1 });
    await h.api.recordResult(game, ['a', 'b'], { winner: 4 });
    assert.equal(h.writes.length, 0);
    await h.api.recordResult(game, ['a', 'b'], { winner: 2, reason: 'Resignation' });
    await h.api.recordResult(game, ['a', 'b'], { winner: 2 });
    assert.equal(h.writes.length, 1); assert.deepEqual(h.writes[0].map(r => r.outcome), ['loss', 'win']);
});
const event = (socket, name) => new Promise(resolve => socket.once(name, resolve));
test('cloud Hikoro restore replays legal moves in an unranked local game and rejects forged moves', async t => {
    const { server } = createServer(); await new Promise(resolve => server.listen(0, resolve));
    const socket = io('http://localhost:' + server.address().port, { transports: ['websocket'] });
    t.after(() => { socket.disconnect(); server.close(); }); await event(socket, 'connect');
    const restored = event(socket, 'gameStart'); socket.emit('restoreHikoroSave', { journal: [] });
    const game = await restored; assert.equal(game.isSinglePlayer, true); assert.deepEqual(game.actionJournal, []);
    const logic = require('../gamelogic'); let move;
    for (let y=0; y<16 && !move; y++) for (let x=0; x<10 && !move; x++) {
        if(game.boardState[y][x]?.color !== 'white') continue;
        const legal=logic.getValidMoves(game,{square:{x,y}});
        if(legal.length)move={type:'board',from:{x,y},to:legal[0]};
    }
    assert.ok(move);
    const legalRestore=event(socket,'gameStart');socket.emit('restoreHikoroSave',{journal:[move]});
    const resumed=await legalRestore;assert.deepEqual(resumed.actionJournal,[move]);assert.notDeepEqual(resumed.boardState,game.boardState);
    const failure = event(socket, 'errorMsg'); socket.emit('restoreHikoroSave', { journal: [{ type: 'board', from: { x: -1, y: 0 }, to: { x: 0, y: 0 } }] });
    assert.match(await failure, /not valid/);
});
test('online resignation writes verified account outcomes and another account cannot resume the seat', async t => {
    const writes=[];
    const {server}=createServer({accountOptions:{env,clientFactory:(_url,key)=>key.startsWith('sb_secret')?{from:()=>({upsert:async rows=>{writes.push(rows);return {};}})}
        :{auth:{getUser:async token=>({data:{user:{id:token}}})}}}});
    await new Promise(resolve=>server.listen(0,resolve));const url='http://localhost:'+server.address().port;
    const a=io(url,{transports:['websocket'],auth:{token:'account-a'}}),b=io(url,{transports:['websocket'],auth:{token:'account-b'}});
    t.after(()=>{a.disconnect();b.disconnect();server.close();});await Promise.all([event(a,'connect'),event(b,'connect')]);
    const seat=event(a,'seatAssigned'),created=event(a,'gameCreated');a.emit('createGame',{gameType:'go'});
    const {gameId}=await created,assigned=await seat,start=event(b,'gameStart');b.emit('joinGame',gameId);await start;
    const denied=event(b,'errorMsg');b.emit('joinGoRoom',{gameId,token:assigned.token});assert.match(await denied,/account that opened/);
    const closed=event(a,'roomClosed');a.emit('goResign',{gameId});await closed;
    for(let i=0;i<20&&!writes.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(writes.length,1);assert.deepEqual(writes[0].map(r=>[r.user_id,r.outcome]),[['account-a','loss'],['account-b','win']]);
});
