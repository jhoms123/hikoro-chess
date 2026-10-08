const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const Identity = require('./public/player-identity');
const { installUsernameAuth } = require('./username-auth');

const GAME_TYPES = ['hikoro', 'shodansho', 'shavari', 'hikoruka', 'go', 'academy'];
function accountConfig(env = process.env) {
    const url = env.SUPABASE_URL || '';
    const key = env.SUPABASE_PUBLISHABLE_KEY || '';
    // A secret key must never reach the public configuration endpoint.
    const publicKey = key.startsWith('sb_publishable_') || (() => {
        try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role === 'anon'; } catch { return false; }
    })();
    const enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && publicKey;
    const providers = (env.ACCOUNT_PROVIDERS || '').split(',').filter(p => ['google', 'github'].includes(p));
    return { enabled, url: enabled ? url : '', key: enabled ? key : '', providers,
        emailSignup: env.ACCOUNT_EMAIL_SIGNUP === 'true',
        usernameSignup: Boolean(enabled && env.SUPABASE_SECRET_KEY && env.ACCOUNT_USERNAME_SIGNUP === 'true') };
}
function installAccounts(app, io, { env = process.env, clientFactory = createClient } = {}) {
    const config = accountConfig(env);
    const client = config.enabled ? clientFactory(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
    const writer = config.enabled && env.SUPABASE_SECRET_KEY ? clientFactory(config.url, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
    installUsernameAuth(app, { config, writer, clientFactory, env });
    app.get('/api/account-config', (_req, res) => res.json({ ...config, verifiedResults: Boolean(writer) }));
    app.get('/vendor/supabase.js', (_req, res) => res.sendFile(path.join(path.dirname(require.resolve('@supabase/supabase-js/package.json')), 'dist/umd/supabase.js')));
    const profileReaders=new WeakMap();
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(); // Guest play stays available.
        if (!client || typeof token !== 'string' || token.length > 8192) return next(new Error('Account sign-in is unavailable.'));
        try {
            const { data, error } = await client.auth.getUser(token);
            if (error || !data?.user || data.user.is_anonymous) return next(new Error('Please sign in again before opening a table.'));
            socket.data.accountId = data.user.id;
            if(client.from)try{
                const reader=clientFactory(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});profileReaders.set(socket,reader);
                const {data:row}=await reader.from('hikoro_profiles').select('display_name,avatar_icon,avatar_path').eq('user_id',data.user.id).maybeSingle();
                socket.data.playerIdentity=Identity.publicIdentity(row,'Player');
            }catch{socket.data.playerIdentity=Identity.publicIdentity(null,'Player');}
            next();
        } catch { next(new Error('Account verification is temporarily unavailable.')); }
    });
    const recorded = new Set();
    async function recordResult(game, accountIds, result, record) {
        if (!writer || !game.started || game.isSinglePlayer || !game.gameOver || recorded.has(game.id) || !GAME_TYPES.includes(game.gameType)) return;
        // Archive signed-in players' matches, including guest opponents. Only distinct signed-in opponents count for scores.
        const ranked = accountIds.length === game.maxPlayers && accountIds.every(Boolean) && new Set(accountIds).size === accountIds.length;
        if (!Number.isInteger(result.winner) || result.winner < 0 || result.winner > accountIds.length) return;
        if(!ranked&&!record)return;
        recorded.add(game.id);
        const rows = accountIds.map((user_id, index) => ({ user_id, game_id: game.id, game_type: game.gameType,
            outcome: result.winner === 0 ? 'draw' : result.winner === index + 1 ? 'win' : 'loss',
            reason: String(result.reason || 'Match completed').slice(0, 160) }));
        try {
            if(record){
                const history=[...new Set(accountIds.filter(Boolean))].map(user_id=>({user_id,match_id:game.id,game_type:game.gameType,record,verified:true}));
                if(history.length){const {error}=await writer.from('hikoro_matches').upsert(history,{onConflict:'user_id,match_id'});if(error)throw error;}
            }
            if(!ranked)return;
            // Composite PK makes retries idempotent; no client request can supply these results.
            const { error } = await writer.from('hikoro_results').upsert(rows, { onConflict: 'user_id,game_id', ignoreDuplicates: true });
            if (error) throw error;
        } catch {
            recorded.delete(game.id);
            console.error('Verified match record could not be saved.');
        }
    }
    async function refreshIdentity(socket,token){
        if(!socket.data.accountId||!profileReaders.has(socket))return socket.data.playerIdentity;
        if(token){
            if(typeof token!=='string'||token.length>8192)throw Error('Invalid token');
            const {data,error}=await client.auth.getUser(token);if(error||data?.user?.id!==socket.data.accountId)throw Error('Account changed');
            profileReaders.set(socket,clientFactory(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}}));
        }
        const {data,error}=await profileReaders.get(socket).from('hikoro_profiles').select('display_name,avatar_icon,avatar_path').eq('user_id',socket.data.accountId).maybeSingle();
        if(error)throw error;socket.data.playerIdentity=Identity.publicIdentity(data,'Player');return socket.data.playerIdentity;
    }
    return { recordResult, refreshIdentity, forget: id => recorded.delete(id) };
}
module.exports = { accountConfig, installAccounts };
