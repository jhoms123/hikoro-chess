const express = require('express');
const crypto = require('node:crypto');

function normalizeUsername(value) {
    return typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{2,23}$/.test(value.trim()) ? value.trim().toLowerCase() : null;
}

function installUsernameAuth(app, { config, writer, clientFactory, env }) {
    if (!config.usernameSignup) return;
    const origins = new Set((env.ACCOUNT_SITE_ORIGINS || 'https://hikorochess.org,https://www.hikorochess.org').split(','));
    const parse = express.json({ limit: '4kb', strict: true });
    async function guard(req, res, next) {
        res.set('Cache-Control', 'no-store');
        if (!origins.has(req.get('origin')) || !req.is('application/json')) return res.status(403).json({ error: 'Open account access on the Hikoro website.' });
        const username = normalizeUsername(req.body?.username);
        const password = req.body?.password;
        if (!username || typeof password !== 'string' || password.length < 8 || password.length > 128)
            return res.status(400).json({ error: 'Use a username of 3–24 letters, numbers or underscores, starting with a letter, and a password of 8–128 characters.' });
        try {
            // Render adds the client address to the proxy chain. The server trusts one proxy only.
            const digest = value => crypto.createHmac('sha256', env.SUPABASE_SECRET_KEY).update(value).digest('hex');
            const signup = req.path.endsWith('/signup');
            const { data, error } = await writer.rpc('hikoro_auth_attempt', {
                attempt_keys: ['ip:' + digest(req.ip || req.socket.remoteAddress), 'name:' + digest(username), ...(signup ? ['signup-global'] : [])],
                attempt_limits: [signup ? 6 : 30, signup ? 6 : 10, ...(signup ? [100] : [])]
            });
            if (error) throw error;
            if (!data) { res.set('Retry-After', '900'); return res.status(429).json({ error: 'Too many account attempts. Please wait 15 minutes and try again.' }); }
            req.hikoroUsername = username;
            next();
        } catch { res.status(503).json({ error: 'Account access is temporarily unavailable. Please try again later.' }); }
    }
    const sessionClient = () => clientFactory(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
    app.post('/api/account/username/signin', parse, guard, async (req, res) => {
        try {
            const { data: login, error } = await writer.from('hikoro_logins').select('login_email').eq('username', req.hikoroUsername).maybeSingle();
            if (error) throw error;
            // Make a real Auth attempt even for missing usernames; never expose the directory.
            const email = login?.login_email || crypto.randomUUID() + '@username.hikorochess.invalid';
            const result = await sessionClient().auth.signInWithPassword({ email, password: req.body.password });
            if (result.error || !login || !result.data?.session) return res.status(401).json({ error: 'The username or password is incorrect.' });
            res.json({ session: result.data.session });
        } catch { res.status(503).json({ error: 'Account access is temporarily unavailable. Please try again later.' }); }
    });
    app.post('/api/account/username/signup', parse, guard, async (req, res) => {
        let createdUser;
        let reserved = false;
        try {
            const { data: existing, error: lookupError } = await writer.from('hikoro_logins').select('username').eq('username', req.hikoroUsername).maybeSingle();
            if (lookupError) throw lookupError;
            if (existing) return res.status(409).json({ error: 'That username is unavailable. Choose another.' });
            // The opaque .invalid identifier is internal, never a claimed/verified personal email.
            // Supabase stores and hashes the password; our database stores no passwords.
            const email = crypto.randomUUID() + '@username.hikorochess.invalid';
            const created = await writer.auth.admin.createUser({ email, password: req.body.password, email_confirm: true,
                app_metadata: { hikoro_username: req.hikoroUsername, hikoro_username_only: true } });
            if (created.error || !created.data?.user) throw created.error || Error('Account creation unavailable');
            createdUser = created.data.user.id;
            const claimed = await writer.from('hikoro_logins').insert({ username: req.hikoroUsername, user_id: createdUser, login_email: email });
            if (claimed.error) {
                await writer.auth.admin.deleteUser(createdUser); createdUser = null;
                if (claimed.error.code === '23505') return res.status(409).json({ error: 'That username is unavailable. Choose another.' });
                throw claimed.error;
            }
            reserved = true;
            const profile = await writer.from('hikoro_profiles').upsert({ user_id: createdUser, display_name: req.body.username.trim() }, { onConflict: 'user_id', ignoreDuplicates: true });
            if (profile.error) throw profile.error;
            const signed = await sessionClient().auth.signInWithPassword({ email, password: req.body.password });
            if (signed.error || !signed.data?.session) return res.status(201).json({ created: true });
            res.status(201).json({ session: signed.data.session });
        } catch {
            // Once reserved, preserve the account so it can be signed into normally.
            if (createdUser && !reserved) try { await writer.auth.admin.deleteUser(createdUser); } catch {}
            res.status(503).json({ error: reserved ? 'Your account was created. Please sign in with your username and password.' : 'Account creation is temporarily unavailable. Please try again later.' });
        }
    });
}
module.exports = { normalizeUsername, installUsernameAuth };
