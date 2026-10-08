(() => {
    'use strict';
    const titles = { hikoro: 'Hikoro Chess', shodansho: 'Sho Dan Sho', shavari: 'Shavari', hikoruka: 'Hikorüka', go: 'Shield Go', academy: 'Academy' };
    const paths = { hikoro: '/', shodansho: '/shodansho.html', shavari: '/shavari.html', hikoruka: '/hikoruka.html', go: '/go.html', academy: '/academy.html' };
    let config, client, session, profile, adapter, panel, busy = false;
    const sockets = new Set();
    const ready = (async () => {
        try {
            const response = await fetch('/api/account-config', { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error();
            config = await response.json();
            if (!config.enabled) return;
            client = supabase.createClient(config.url, config.key, { auth: { flowType: 'pkce', detectSessionInUrl: true } });
            const result = await client.auth.getSession();
            if (result.error) throw result.error;
            session = result.data.session;
            client.auth.onAuthStateChange((_event, next) => {
                const changed = session?.user?.id !== next?.user?.id;
                session = next;
                if (changed) {
                    profile = null;
                    queueMicrotask(()=>window.dispatchEvent(new Event('account-changed')));
                    for (const socket of sockets) { socket.disconnect(); socket.connect(); }
                }
                queueMicrotask(() => { refreshButton(); if (panel?.open) renderAccount(); });
            });
        } catch { config = { enabled: false }; }
    })();
    function message(text) { document.getElementById('account-message').textContent = text; }
    function refreshButton() {
        const button = document.getElementById('account-open');
        if (button) button.textContent = session ? 'My player journal' : 'Player account';
    }
    function element(tag, text, cls) { const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; }
    function button(text, action) { const el = element('button', text); el.type = 'button'; el.addEventListener('click', () => run(action)); return el; }
    async function run(action) {
        if (busy) return;
        busy = true; panel.setAttribute('aria-busy', 'true');
        try { message(''); await action(); }
        catch (error) { message(error?.message || 'The account service could not be reached. Your local game is still available.'); }
        finally { busy = false; panel.removeAttribute('aria-busy'); }
    }
    function check(result) { if (result.error) throw result.error; return result.data; }
    async function archiveRecord(record){await ready;if(!client||!session)return false;check(await client.from('hikoro_matches').upsert({user_id:session.user.id,match_id:record.id,game_type:record.game,record,verified:false},{onConflict:'user_id,match_id',ignoreDuplicates:true}));return true;}
    async function listRecords(offset=0,game=''){await ready;if(!client||!session)return null;let query=client.from('hikoro_matches').select('*').eq('user_id',session.user.id).order('recorded_at',{ascending:false}).order('match_id',{ascending:false});if(game)query=query.eq('game_type',game);return check(await query.range(offset,offset+49));}
    function recordTools(body){
        const link=element('a','Match history & replay records');link.href='/history.html';body.append(link);
        if(!adapter)return;
        body.append(button('Save replay record',async()=>{
            const payload=adapter.recordCapture();if(!payload)throw Error('Open a table first.');
            const record=MatchRecord.create(adapter.type,payload,payload.result||null,{id:payload.recordId||payload.gameId||SiteRecords.id(adapter.type)});
            SiteRecords.remember(record);SiteRecords.download(record);
            if(!payload.gameId)await archiveRecord(record);
            message('Replay record saved and downloaded. Open Match history to replay it.');
        }));
    }
    async function readProfile() {
        const userId = session?.user?.id;
        if (!userId) throw new Error('Please sign in to open your journal.');
        let row = check(await client.from('hikoro_profiles').select('*').eq('user_id', userId).maybeSingle());
        if (!row) {
            row = check(await client.from('hikoro_profiles').upsert({ user_id: userId, display_name: 'Player' }, { onConflict: 'user_id', ignoreDuplicates: true }).select().maybeSingle());
            if (!row) row = check(await client.from('hikoro_profiles').select('*').eq('user_id', userId).single());
        }
        if (session?.user?.id !== userId) throw new Error('Your account changed. Reopen the journal.');
        profile = row;
        return profile;
    }
    async function renderAccount() {
        await ready;
        const body = document.getElementById('account-body'); body.replaceChildren();
        refreshButton();
        if (!client) { body.append(element('p', 'Player accounts are being prepared. You can keep playing as a guest.'));recordTools(body); return; }
        if (!session) {
            recordTools(body);
            body.append(element('p', 'Keep your player name, saved tables, and learning progress across devices. Guest play stays available.'));
            for (const provider of config.providers) body.append(button('Continue with ' + (provider === 'github' ? 'GitHub' : 'Google'), async () => {
                check(await client.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + '/?account=1' } }));
            }));
            const form = element('form');
            form.innerHTML = '<label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required minlength="6"></label><button type="submit">Sign in</button>';
            form.addEventListener('submit', event => { event.preventDefault(); run(async () => {
                const data = new FormData(form);
                check(await client.auth.signInWithPassword({ email: data.get('email'), password: data.get('password') }));
                form.reset(); await renderAccount();
            }); });
            body.append(form);
            if (config.emailSignup) body.append(button('Create an email account', async () => {
                if (!form.reportValidity()) return;
                const data = new FormData(form);
                const result = check(await client.auth.signUp({ email: data.get('email'), password: data.get('password'), options: { emailRedirectTo: location.origin + '/?account=1' } }));
                form.reset();
                if (result.session) await renderAccount(); else message('Check your email to confirm your account, then sign in.');
            }));
            else body.append(element('small', 'Email sign-in is for existing accounts. New email accounts open when email delivery is configured.'));
            return;
        }
        body.append(element('p', 'Loading your journal…'));
        try {
            await readProfile();
            const userId = session.user.id;
            const saves = check(await client.from('hikoro_saves').select('game_type,revision,updated_at').eq('user_id', userId));
            const results = check(await client.from('hikoro_results').select('game_type,outcome,reason,completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(1000));
            if (!session || session.user.id !== userId) return;
            body.replaceChildren();
            recordTools(body);
            const form = element('form'), label = element('label', 'Player name'), input = element('input');
            input.value = profile.display_name; input.required = true; input.maxLength = 30; label.append(input);
            const submit = element('button', 'Save player name'); submit.type = 'submit'; form.append(label, submit);
            form.addEventListener('submit', event => { event.preventDefault(); run(async () => {
                const name = input.value.trim(); if (!name) throw new Error('Choose a player name.');
                check(await client.from('hikoro_profiles').update({ display_name: name }).eq('user_id', session.user.id));
                profile.display_name = name; message('Player name saved.');
            }); }); body.append(form);
            const actions = element('div', '', 'account-actions');
            if (adapter) actions.append(button('Save this table to my account', saveCurrent));
            actions.append(button('Save device preferences', async () => {
                const preferences = {};
                for (const key of ['hikoro-preferences', 'hikoro-audio-v1']) {
                    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); if (value && typeof value === 'object') preferences[key] = value; } catch {}
                }
                check(await client.from('hikoro_profiles').update({ preferences }).eq('user_id', session.user.id));
                message('Device preferences saved to your account.');
            }));
            actions.append(button('Use saved preferences on this device', async () => {
                await readProfile();
                if (!window.confirm('Replace this device’s game and audio preferences with your account preferences?')) return;
                for (const key of ['hikoro-preferences', 'hikoro-audio-v1']) if (profile.preferences[key]) localStorage.setItem(key, JSON.stringify(profile.preferences[key]));
                message('Preferences restored. They take effect on your next page visit.');
            })); body.append(actions);
            body.append(element('h3', 'Saved tables'));
            if (!saves.length) body.append(element('p', 'No cloud saves yet. Open a local game, then save it through your player journal.'));
            for (const save of saves) {
                const row = element('div', '', 'account-save');
                row.append(element('span', titles[save.game_type] + ' · ' + new Date(save.updated_at).toLocaleDateString()));
                row.append(button('Resume', async () => {
                    const record = check(await client.from('hikoro_saves').select('payload').eq('user_id', session.user.id).eq('game_type', save.game_type).single());
                    if (!window.confirm('Open this saved table? It replaces the current local table for this game.')) return;
                    sessionStorage.setItem('hikoro-cloud-restore', JSON.stringify({ game_type: save.game_type, payload: record.payload }));
                    location.href = paths[save.game_type];
                })); body.append(row);
            }
            body.append(element('h3', 'Verified online results'));
            const wins = results.filter(r => r.outcome === 'win').length, losses = results.filter(r => r.outcome === 'loss').length, draws = results.filter(r => r.outcome === 'draw').length;
            body.append(element('p', `${wins} wins · ${losses} losses · ${draws} draws${results.length === 1000 ? ' · most recent 1,000 matches' : ''}`));
            body.append(element('small', 'Only server-confirmed matches between distinct signed-in players count. Guest games, local games, and bots are practice.'));
            if (!config.verifiedResults) body.append(element('p', 'Online result recording is awaiting server configuration.'));
            for (const result of results.slice(0, 5)) body.append(element('p', `${titles[result.game_type]} · ${result.outcome} · ${result.reason}`));
            body.append(element('h3', 'Academy practice'));
            const lessons = Object.entries(profile.academy_progress || {});
            body.append(element('p', lessons.length ? lessons.map(([lesson, count]) => `${lesson}: ${count} practice moves`).join(' · ') : 'Save an Academy practice table to record your learning progress.'));
            body.append(button('Sign out', async () => {
                check(await client.auth.signOut()); profile = null; await renderAccount();
                message('Signed out. Online seats linked to your account require the same account to reconnect.');
            }));
        } catch (error) { body.replaceChildren(element('p', 'Your player journal could not load.')); message(error.message); }
    }
    async function saveCurrent() {
        const payload = adapter.capture();
        if (!payload) throw new Error('Open a local table first. Online games are recorded by the server when they finish.');
        if (new TextEncoder().encode(JSON.stringify(payload)).length > 500000) throw new Error('This table is too large for a cloud save. Download its move record instead.');
        if (adapter.type === 'hikoro' && new TextEncoder().encode(JSON.stringify({journal:payload.journal})).length > 30000)
            throw new Error('This Hikoro table exceeds the restore limit. Download its Kifu record instead.');
        if (adapter.type === 'shodansho' && payload.journal.length > 1000)
            throw new Error('This garden table exceeds the 1,000-action restore limit.');
        const user_id = session.user.id, game_type = adapter.type;
        const previous = check(await client.from('hikoro_saves').select('revision').eq('user_id', user_id).eq('game_type', game_type).maybeSingle());
        if (previous && !window.confirm('Replace your previous ' + titles[game_type] + ' cloud save with this table?')) return;
        const row = { user_id, game_type, payload, revision: (previous?.revision || 0) + 1, updated_at: new Date().toISOString() };
        const written = previous ? check(await client.from('hikoro_saves').update(row).eq('user_id', user_id).eq('game_type', game_type).eq('revision', previous.revision).select('revision'))
            : check(await client.from('hikoro_saves').insert(row).select('revision'));
        if (!written.length) throw new Error('This save changed on another device. Reopen the journal before replacing it.');
        if (game_type === 'academy' && payload.mode === 'lesson') {
            await readProfile();
            const progress = { ...profile.academy_progress, [payload.lesson]: Math.max(Number(profile.academy_progress[payload.lesson]) || 0, payload.cursor) };
            check(await client.from('hikoro_profiles').update({ academy_progress: progress }).eq('user_id', user_id));
        }
        await renderAccount(); message('Table saved to your account.');
    }
    function register(type, capture, restore, recordCapture=capture) {
        adapter = { type, capture, recordCapture };
        try {
            const raw = sessionStorage.getItem('hikoro-cloud-restore');
            const pending = raw && JSON.parse(raw);
            if (pending?.game_type === type) {
                sessionStorage.removeItem('hikoro-cloud-restore');
                Promise.resolve(restore(pending.payload)).catch(() => window.alert('This saved table cannot be restored under the current rules. Your previous local table is unchanged.'));
            }
        } catch { window.alert('The saved table could not be restored.'); }
    }
    window.SiteAccounts = { ready, register, archiveRecord, listRecords, socket: () => {
        const socket = io({ auth: callback => {
            ready.then(async () => { const current = client && await client.auth.getSession(); callback({ token: current?.data?.session?.access_token || null }); }).catch(() => callback({}));
        } });
        sockets.add(socket); return socket;
    } };
    document.addEventListener('DOMContentLoaded', async () => {
        const open = button('Player account', async () => { panel.showModal(); await renderAccount(); }); open.id = 'account-open'; open.className = 'account-open';
        panel = element('dialog', '', 'account-journal'); panel.id = 'account-dialog'; panel.setAttribute('aria-labelledby', 'account-title');
        panel.innerHTML = '<div class="account-heading"><h2 id="account-title">Your player journal</h2><button type="button" id="account-close" aria-label="Close player journal">Close</button></div><p id="account-message" role="status" aria-live="polite"></p><div id="account-body"></div>';
        document.body.append(open, panel); document.getElementById('account-close').addEventListener('click', () => panel.close());
        await ready; refreshButton();
        if (new URLSearchParams(location.search).get('account') === '1') { panel.showModal(); await renderAccount(); }
    });
})();
