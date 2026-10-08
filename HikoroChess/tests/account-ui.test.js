const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
async function until(predicate) {
    for (let i = 0; i < 50; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.fail('UI did not reach the expected state');
}
function setup(type, pending, conflict = false) {
    const dom = new JSDOM(source(type + '.html'), { url: 'http://localhost/' + type + '.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window, rows = { hikoro_profiles: [{ user_id: 'test-player', display_name: 'Test player', preferences: {}, academy_progress: {} }], hikoro_saves: [], hikoro_results: [] };
    let writes = 0;
    if (conflict) rows.hikoro_saves.push({ user_id: 'test-player', game_type: type, revision: 1, updated_at: new Date().toISOString(), payload: {} });
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.matchMedia = () => ({ matches: false }); w.confirm = () => true; w.alert = () => {};
    w.TextEncoder = TextEncoder;
    w.fetch = async () => ({ ok: true, json: async () => ({ enabled: true, url: 'https://example.supabase.co', key: 'sb_publishable_test', providers: [], verifiedResults: true }) });
    const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'test-player' } } } }), onAuthStateChange: () => {} }, from(table) {
        let filters = [], action, value;
        const query = { select: () => query, eq: (key, val) => { filters.push([key, val]); return query; }, order: () => query, limit: () => query,
            update: data => { action = 'update'; value = data; return query; }, insert: data => { action = 'insert'; value = data; return query; },
            maybeSingle: async () => ({ data: rows[table].find(row => filters.every(([k, v]) => row[k] === v)) || null }),
            single: async () => ({ data: rows[table].find(row => filters.every(([k, v]) => row[k] === v)) }),
            then(resolve) {
                let found = rows[table].filter(row => filters.every(([k, v]) => row[k] === v));
                if (action === 'insert') { rows[table].push(value); writes++; found = [value]; }
                if (action === 'update') { if (conflict && table === 'hikoro_saves') found = []; else { found.forEach(row => Object.assign(row, value)); writes++; } }
                return Promise.resolve({ data: found }).then(resolve);
            }
        }; return query;
    } };
    w.supabase = { createClient: () => client };
    w.eval(source('accounts.js'));
    if (type === 'academy') w.eval(fs.readFileSync(path.join(__dirname, '../gamelogic.js'), 'utf8'));
    w.eval(source(type === 'go' ? 'go-engine.js' : type + '-engine.js'));
    if (type === 'academy') w.eval(source('hikoro-artwork.js'));
    if (pending) w.sessionStorage.setItem('hikoro-cloud-restore', JSON.stringify({ game_type: type, payload: pending }));
    w.eval(source(type + '-ui.js'));
    return { dom, rows, writes: () => writes };
}
const fixtures = {
    go: { key: 'shield-go-local-v1', payload: { version: 1, size: 9, journal: [{ type: 'place', to: { x: 0, y: 0 } }], cursor: 1, flipped: false } },
    hikoruka: { key: 'hikoruka-local-v1', payload: { version: 1, journal: [{ from: { r: 4, c: 0 }, to: { r: 3, c: 0 } }], cursor: 1, mode: 'local', flipped: false } },
    shavari: { key: 'shavari-local-v3', payload: { version: 3, journal: [{ from: { x: 0, y: 8 }, to: { x: 2, y: 6 }, mode: 'all' }], cursor: 1, flipped: false } },
    academy: { key: 'hikoro-academy-local-v3', payload: { version: 1, mode: 'lesson', lesson: 'pawn', journal: [], cursor: 0, flipped: false } }
};
for (const [type, fixture] of Object.entries(fixtures)) test(`${type} restores a validated cloud table and captures the table through the journal`, async t => {
    const h = setup(type, fixture.payload); t.after(() => h.dom.window.close()); const w = h.dom.window;
    await until(() => w.document.getElementById('account-open'));
    const restored = JSON.parse(w.localStorage.getItem(fixture.key));
    assert.equal(restored.cursor, fixture.payload.cursor);
    w.document.getElementById('account-open').click();
    await until(() => [...w.document.querySelectorAll('#account-body button')].some(b => b.textContent === 'Save this table to my account'));
    [...w.document.querySelectorAll('#account-body button')].find(b => b.textContent === 'Save this table to my account').click();
    await until(() => w.document.getElementById('account-message').textContent === 'Table saved to your account.');
    assert.equal(h.rows.hikoro_saves[0].game_type, type); assert.equal(h.rows.hikoro_saves[0].payload.cursor, fixture.payload.cursor);
});
test('a save changed on another device produces a conflict message instead of overwriting it', async t => {
    const h = setup('go', null, true); t.after(() => h.dom.window.close()); const w = h.dom.window;
    await until(() => w.document.getElementById('account-open')); w.document.getElementById('account-open').click();
    await until(() => [...w.document.querySelectorAll('#account-body button')].some(b => b.textContent === 'Save this table to my account'));
    [...w.document.querySelectorAll('#account-body button')].find(b => b.textContent === 'Save this table to my account').click();
    await until(() => w.document.getElementById('account-message').textContent.includes('changed on another device'));
    assert.equal(h.rows.hikoro_saves[0].revision, 1); assert.equal(h.writes(), 0);
});
test('malformed Go cloud data is rejected without replacing the local save', async t => {
    const h = setup('go', { version: 1, size: 8, journal: [], cursor: 0 }); t.after(() => h.dom.window.close());
    await until(() => h.dom.window.document.getElementById('account-open'));
    assert.equal(h.dom.window.localStorage.getItem('shield-go-local-v1'), null);
});
