const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { installUsernameAuth, normalizeUsername } = require('../username-auth');
const { accountConfig } = require('../accounts');

async function harness(t) {
    const logins = new Map(), users = new Map(), deleted = [], attempts = [], clients = [], profiles = [];
    let throttled = false, throttleError = false, race = false;
    const writer = { rpc: async (_name, args) => { attempts.push(args); return throttleError ? { error: Error('offline') } : { data: !throttled }; },
        auth: { admin: { createUser: async data => { const id = 'user-' + users.size; users.set(id, data); return { data: { user: { id } } }; }, deleteUser: async id => { deleted.push(id); users.delete(id); return {}; } } },
        from(table) {
            let name;
            const q = { select: () => q, eq: (_key, value) => { name = value; return q; }, maybeSingle: async () => ({ data: logins.get(name) || null }),
                insert: async row => { if (race || logins.has(row.username)) return { error: { code: '23505' } }; logins.set(row.username, row); return {}; },
                upsert: async row => { profiles.push(row); return {}; } }; return q;
        } };
    const app = express();
    installUsernameAuth(app, { config: { usernameSignup: true, url: 'https://example.supabase.co', key: 'sb_publishable_test' }, writer,
        env: { SUPABASE_SECRET_KEY: 'sb_secret_test', ACCOUNT_SITE_ORIGINS: 'https://hikorochess.org' },
        clientFactory: () => { const marker = {}; clients.push(marker); return { auth: { signInWithPassword: async data => {
            const found = [...users].find(([_id, user]) => user.email === data.email && user.password === data.password);
            return found ? { data: { session: { access_token: 'access-' + found[0], refresh_token: 'refresh', user: { id: found[0], app_metadata: found[1].app_metadata } } } } : { error: Error('invalid login') };
        } } }; } });
    const server = app.listen(0); await new Promise(r => server.once('listening', r)); t.after(() => server.close());
    const url = 'http://127.0.0.1:' + server.address().port;
    async function post(action, data, origin = 'https://hikorochess.org') {
        const response = await fetch(url + '/api/account/username/' + action, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
    }
    return { post, logins, users, deleted, attempts, clients, profiles, throttle: () => { throttled = true; }, offline: () => { throttleError = true; }, race: () => { race = true; } };
}
test('username validation and configuration fail closed', () => {
    assert.equal(normalizeUsername(' Ocean_Player '), 'ocean_player');
    for (const input of ['ab', '1player', 'a@b.com', 'a b c', '<script>', 'éclair', {}, null, 'a'.repeat(25)]) assert.equal(normalizeUsername(input), null);
    assert.equal(accountConfig({ ACCOUNT_USERNAME_SIGNUP: 'true' }).usernameSignup, false);
});
test('no-email signup creates a private opaque Auth alias and signs in case-insensitively', async t => {
    const h = await harness(t), signup = await h.post('signup', { username: 'Ocean_Player', password: 'fixture-password' });
    assert.equal(signup.status, 201); assert.equal(signup.cache, 'no-store'); assert.ok(signup.body.session.access_token);
    const user = [...h.users.values()][0];
    assert.match(user.email, /^[a-f0-9-]+@username\.hikorochess\.invalid$/); assert.equal(user.email_confirm, true);
    assert.equal(user.app_metadata.hikoro_username, 'ocean_player'); assert.equal(user.app_metadata.hikoro_username_only, true);
    assert.equal(h.profiles[0].display_name, 'Ocean_Player'); assert.equal(JSON.stringify([...h.logins.values()]).includes('fixture-password'), false);
    const signed = await h.post('signin', { username: 'OCEAN_PLAYER', password: 'fixture-password' }); assert.equal(signed.status, 200);
    assert.equal(h.clients.length, 2); assert.notEqual(h.clients[0], h.clients[1]);
    assert.ok(h.attempts.every(a => a.attempt_keys.every(k => !k.includes('ocean_player') && !k.includes('127.0.0.1'))));
});
test('cross-origin/invalid signup never reaches privileged creation; throttle outages fail closed', async t => {
    const h = await harness(t), data = { username: 'player', password: 'fixture-password' };
    assert.equal((await h.post('signup', data, 'https://evil.example')).status, 403);
    assert.equal((await h.post('signup', { ...data, username: 'a@b.com' })).status, 400);
    assert.equal((await h.post('signup', { ...data, password: 'short' })).status, 400);
    assert.equal(h.users.size, 0); assert.equal(h.attempts.length, 0);
    h.throttle(); assert.equal((await h.post('signup', data)).status, 429); assert.equal(h.users.size, 0);
});
test('database throttle failure and missing/wrong username do not expose directory data', async t => {
    const h = await harness(t), data = { username: 'player', password: 'fixture-password' };
    await h.post('signup', data);
    const wrong = await h.post('signin', { ...data, password: 'wrong-password' });
    const missing = await h.post('signin', { ...data, username: 'missing' });
    assert.equal(wrong.status, 401); assert.deepEqual(wrong.body, missing.body);
    h.offline(); assert.equal((await h.post('signin', data)).status, 503);
});
test('duplicate and racing username claims preserve existing accounts and clean only a new orphan', async t => {
    const h = await harness(t), data = { username: 'player', password: 'fixture-password' };
    await h.post('signup', data);
    assert.equal((await h.post('signup', { ...data, username: 'PLAYER' })).status, 409); assert.equal(h.users.size, 1); assert.deepEqual(h.deleted, []);
    h.race(); assert.equal((await h.post('signup', { ...data, username: 'another' })).status, 409);
    assert.equal(h.users.size, 1); assert.deepEqual(h.deleted, ['user-1']);
});
