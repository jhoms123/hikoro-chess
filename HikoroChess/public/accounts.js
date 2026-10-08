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
            if(config.review){client=await window.ReviewAccountClient();session=(await client.auth.getSession()).data.session;return;}
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
                queueMicrotask(async () => { if(session)try{await readProfile();}catch{}refreshButton(); if (panel?.open) renderAccount(); });
            });
        } catch { config = { enabled: false }; }
    })();
    function message(text) { document.getElementById('account-message').textContent = text; }
    function refreshButton() {
        const button = document.getElementById('account-open');
        if(button){button.replaceChildren();const image=element('img'),text=element('span',session?profile?.display_name||'My player journal':'Player account');image.src=PlayerIdentity.portrait(profile||{},config?.url);image.alt='';button.append(image,text);button.setAttribute('aria-label',session?'Open player journal for '+(profile?.display_name||'your account'):'Sign in or open player account');}
        const name=document.getElementById('player-name');if(name&&session&&profile){name.value=profile.display_name;name.readOnly=true;name.title='Change your player name in your profile.';}else if(name){name.readOnly=false;}
        paintSeats();
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
    async function usernameRequest(action, username, password) {
        const response = await fetch('/api/account/username/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(20000) });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || 'Account access is temporarily unavailable.');
        if (result.session) {
            check(await client.auth.setSession({ access_token: result.session.access_token, refresh_token: result.session.refresh_token }));
            session = result.session;
        }
        return result;
    }
    function drawSignIn(body) {
        const methods = element('div', '', 'auth-methods');
        for (const provider of config.providers) methods.append(button('Continue with ' + (provider === 'github' ? 'GitHub' : 'Google'), async () => {
            check(await client.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + '/?account=1' } }));
        }));
        body.append(methods);
        const tabs = element('nav', '', 'journal-tabs'); tabs.setAttribute('aria-label', 'Account access method');
        const content = element('section', '', 'journal-card'); body.append(tabs, content);
        function draw(mode, signup = false) {
            for (const tab of tabs.children) tab.setAttribute('aria-pressed', String(tab.dataset.method === mode));
            content.replaceChildren(element('h3', signup ? 'Take your place in the hall' : 'Welcome back'));
            const username = mode === 'username';
            if (username) content.append(element('p', 'No email needed. Your login username stays fixed; you can choose a different name for the board in Profile.'),
                element('small', 'Without an email, a forgotten password cannot be recovered. Keep your username and password somewhere safe.'));
            else content.append(element('p', 'Use your email for sign-in and password recovery.'));
            const form = element('form', '', 'account-access-form');
            form.innerHTML = username
                ? '<label>Username<input name="identifier" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="24" pattern="[A-Za-z][A-Za-z0-9_]{2,23}" required></label><small>3–24 letters, numbers or underscores. Start with a letter. Capitalization does not matter.</small>'
                : '<label>Email<input name="identifier" type="email" autocomplete="username" required maxlength="254"></label>';
            const label = element('label', 'Password'), password = element('input'); password.name = 'password'; password.type = 'password';
            password.autocomplete = signup ? 'new-password' : 'current-password'; password.minLength = signup || username ? 8 : 6; password.maxLength = 128; password.required = true; label.append(password); form.append(label);
            if (signup) { const confirm = element('label', 'Confirm password'), field = element('input'); field.name = 'confirm'; field.type = 'password'; field.autocomplete = 'new-password'; field.required = true; field.maxLength = 128; confirm.append(field); form.append(confirm); }
            const submit = element('button', signup ? 'Create ' + (username ? 'username' : 'email') + ' account' : 'Sign in'); submit.type = 'submit';
            if (signup && !username && !config.emailSignup) submit.disabled = true;
            form.append(submit);
            form.onsubmit = event => { event.preventDefault(); run(async () => {
                const data = new FormData(form), identifier = data.get('identifier'), secret = data.get('password');
                if (signup && secret !== data.get('confirm')) throw Error('The passwords do not match.');
                if (username) {
                    const result = await usernameRequest(signup ? 'signup' : 'signin', identifier, secret);
                    form.reset();
                    if (!result.session) { draw(mode); message('Account created. Sign in with your username and password.'); return; }
                } else if (signup) {
                    if (!config.emailSignup) throw Error('Email signup is waiting for email delivery to be configured. You can create a username account without email.');
                    const result = check(await client.auth.signUp({ email: identifier, password: secret, options: { emailRedirectTo: location.origin + '/?account=1' } }));
                    form.reset(); if (!result.session) { draw(mode); message('Check your email to confirm your account, then sign in.'); return; }
                } else { check(await client.auth.signInWithPassword({ email: identifier, password: secret })); form.reset(); }
                await renderAccount();
            }); };
            content.append(form);
            if (!signup && !username) content.append(button('Forgot password?', async () => {
                const field = form.elements.identifier;
                if (!field.value || !field.checkValidity()) throw Error('Enter your email address first.');
                check(await client.auth.resetPasswordForEmail(field.value, { redirectTo: location.origin + '/player.html?reset=1' }));
                message('If an account exists, check your email for the reset link.');
            }));
            content.append(button(signup ? 'I already have an account' : 'Create an account', async () => draw(mode, !signup)));
            if (!username && !config.emailSignup) content.append(element('small', 'New email accounts and email recovery need production email delivery. Username accounts and GitHub sign-in are available without it.'));
        }
        for (const [mode, title] of [...(config.usernameSignup ? [['username', 'Username · no email']] : []), ['email', 'Email & password']]) {
            const tab = element('button', title); tab.type = 'button'; tab.dataset.method = mode; tab.onclick = () => { message(''); draw(mode); }; tabs.append(tab);
        }
        draw(config.usernameSignup ? 'username' : 'email');
    }
    async function archiveRecord(record){await ready;if(!client||!session)return false;check(await client.from('hikoro_matches').upsert({user_id:session.user.id,match_id:record.id,game_type:record.game,record,verified:false},{onConflict:'user_id,match_id',ignoreDuplicates:true}));return true;}
    async function listRecords(offset=0,game=''){await ready;if(!client||!session)return null;let query=client.from('hikoro_matches').select('*').eq('user_id',session.user.id).order('recorded_at',{ascending:false}).order('match_id',{ascending:false});if(game)query=query.eq('game_type',game);return check(await query.range(offset,offset+49));}
    async function annotations(){await ready;if(!client||!session)return null;return check(await client.from('hikoro_annotations').select('match_id,notes').eq('user_id',session.user.id));}
    async function saveNotes(id,notes){await ready;if(!client||!session)return false;check(await client.from('hikoro_annotations').upsert({user_id:session.user.id,match_id:id,notes,updated_at:new Date().toISOString()}));return true;}
    async function shareRecord(record,notes){await ready;if(!client||!session)throw Error('Sign in to share a replay.');return check(await client.from('hikoro_shared_records').upsert({user_id:session.user.id,match_id:record.id,record,notes},{onConflict:'user_id,match_id'}).select('token').single()).token;}
    async function unshareRecord(id){await ready;if(!client||!session)throw Error('Sign in to revoke a shared replay.');check(await client.from('hikoro_shared_records').delete().eq('user_id',session.user.id).eq('match_id',id));}
    async function sharedRecord(token){await ready;if(!client)throw Error('Shared replays are unavailable.');return check(await client.rpc('hikoro_shared_record',{share_token:token}));}
    async function completeTutorial(type){await ready;if(!client||!session)return false;await readProfile();const progress={...profile.tutorial_progress,[type]:{completed:true,at:new Date().toISOString()}};check(await client.from('hikoro_profiles').update({tutorial_progress:progress}).eq('user_id',session.user.id));profile.tutorial_progress=progress;return true;}
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
            drawSignIn(body);
            return;
        }
        body.append(element('p', 'Loading your journal…'));
        try {
            await readProfile();
            const userId = session.user.id;
            const saves = check(await client.from('hikoro_saves').select('game_type,revision,updated_at').eq('user_id', userId));
            const results = check(await client.from('hikoro_results').select('game_type,outcome,reason,completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(1000));
            if (!session || session.user.id !== userId) return;
            const totals=client.rpc?check(await client.rpc('hikoro_my_totals')):null;
            if(session?.user?.id!==userId)return;
            const matches=await listRecords(0);if(session?.user?.id!==userId)return;drawDashboard(body,saves,results,totals,matches);
        } catch (error) { body.replaceChildren(element('p', 'Your player journal could not load.')); message(error.message); }
    }
    function link(text,href){const a=element('a',text);a.href=href;return a;}
    function card(parent,title){const box=element('section','','journal-card');box.append(element('h3',title));parent.append(box);return box;}
    function drawDashboard(body,saves,results,totals,matches=[]){
        body.replaceChildren();refreshButton();
        const hero=element('div','','profile-hero'),photo=element('img'),copy=element('div');photo.src=PlayerIdentity.portrait(profile,config.url);photo.alt='Your player portrait';copy.append(element('small','YOUR PLACE IN THE STRATEGY HALL'),element('h3',profile.display_name),element('p',profile.leaderboard_visible?'Public standings enabled':'Your journal is private · standings hidden'));hero.append(photo,copy);body.append(hero);
        const tabbar=element('nav','','journal-tabs');tabbar.setAttribute('aria-label','Player journal sections');body.append(tabbar);const panels={};
        for(const [key,title]of [['overview','Overview'],['profile','Profile'],['tables','Saved tables'],['settings','Settings']]){
            const section=element('div','','journal-panel');section.id='journal-'+key;section.hidden=key!=='overview';panels[key]=section;
            const tab=element('button',title);tab.type='button';tab.setAttribute('aria-controls',section.id);tab.setAttribute('aria-pressed',String(key==='overview'));tab.onclick=()=>{for(const [name,area]of Object.entries(panels))area.hidden=name!==key;for(const b of tabbar.children)b.setAttribute('aria-pressed',String(b===tab));};tabbar.append(tab);body.append(section);
        }
        const stats=element('div','','journal-stats');const values=totals?['wins','losses','draws'].map(key=>totals.reduce((n,r)=>n+Number(r[key]),0)):['win','loss','draw'].map(outcome=>results.filter(r=>r.outcome===outcome).length);
        values.forEach((n,i)=>{const box=element('div');box.append(element('strong',String(n)),element('span',['Wins','Losses','Draws'][i]));stats.append(box);});panels.overview.append(stats);
        const next=card(panels.overview,'Your next match');next.append(link('Choose a table →','/'),link('Match history & replay records →','/history.html'),link('The wins leaderboard →','/leaderboard.html'));recordTools(next);
        const records=card(panels.overview,'Your record at every table'),recordGrid=element('div','','game-record-grid');
        for(const game of Object.keys(titles)){const total=totals?.find(r=>r.game_type===game),all=results.filter(r=>r.game_type===game),entry=element('div');entry.append(link(titles[game],paths[game]),element('p',total?`${total.wins} wins · ${total.losses} losses · ${total.draws} draws`:`${all.filter(r=>r.outcome==='win').length} wins · ${all.filter(r=>r.outcome==='loss').length} losses · ${all.filter(r=>r.outcome==='draw').length} draws`));recordGrid.append(entry);}records.append(recordGrid);
        const achievements=card(panels.overview,'Learning milestones');for(const game of Object.keys(titles)){let local;try{local=JSON.parse(localStorage.getItem('hikoro-tutorials-v1')||'{}')[game];}catch{}const completed=profile.tutorial_progress?.[game]?.completed||local?.completed;achievements.append(element('p',(completed?'✓ ':'○ ')+titles[game]+(completed?' · Introduction completed':' · Introduction ready')),link('Open '+titles[game]+' lesson →',paths[game]+(game==='hikoro'?'?tutorial=hikoro':'?tutorial=1')));}achievements.append(element('small','Learning milestones are practice achievements and never count as match wins.'));
        const recent=card(panels.overview,'Recent online results');recent.append(element('small','Only server-confirmed games between distinct signed-in players count toward standings.'));
        if(!results.length)recent.append(element('p','Your first verified match will start your story here.'));
        for(const result of results.slice(0,5)){const row=element('div','','account-save');row.append(element('span',titles[result.game_type]),element('strong',result.outcome.toUpperCase()));recent.append(row);}
        if(!config.verifiedResults)recent.append(element('p','Online scores will start recording when server configuration is complete.'));
        if(!totals&&results.length===1000)recent.append(element('small','Totals currently show the most recent 1,000 results. Apply the Player Hall migration for all-time totals.'));
        const matchCard=card(panels.overview,'Recent match journals');for(const row of (matches||[]).slice(0,5)){const entry=element('div','','account-save');entry.append(element('span',titles[row.game_type]+' · '+new Date(row.recorded_at).toLocaleDateString()),button('Replay',async()=>{sessionStorage.setItem('hikoro-replay-record',JSON.stringify(row.record));location.href='/replay.html';}));matchCard.append(entry);}if(!matches?.length)matchCard.append(element('p','Complete or save a match to begin your replay library.'));
        const profileBox=card(panels.profile,'Your table identity'),form=element('form'),label=element('label','Player name'),input=element('input');input.name='display_name';input.value=profile.display_name;input.required=true;input.maxLength=30;input.autocomplete='nickname';label.append(input);
        const visible=element('label','','visibility-choice'),checkbox=element('input');checkbox.type='checkbox';checkbox.name='leaderboard_visible';checkbox.checked=Boolean(profile.leaderboard_visible);visible.append(checkbox,document.createTextNode(' Show my name and portrait on the public leaderboard'));
        const submit=element('button','Save profile');submit.type='submit';form.append(label,visible,element('small','Your chosen name and portrait appear to players at your online table. Standings reveal only your chosen identity and verified totals.'),submit);form.onsubmit=e=>{e.preventDefault();run(async()=>{const name=PlayerIdentity.cleanName(input.value,'');if(!name)throw Error('Choose a player name.');check(await client.from('hikoro_profiles').update({display_name:name,leaderboard_visible:checkbox.checked}).eq('user_id',session.user.id));profile.display_name=name;profile.leaderboard_visible=checkbox.checked;identityChanged();hero.querySelector('h3').textContent=name;hero.querySelector('p').textContent=checkbox.checked?'Public standings enabled':'Your journal is private · standings hidden';message('Profile saved. Your table identity has been updated.');});};profileBox.append(form);
        const favorites=card(panels.profile,'Your favorite tables'),favoriteForm=element('form');const choices=[];
        for(const game of Object.keys(titles)){const label=element('label','','favorite-choice'),input=element('input');input.type='checkbox';input.value=game;input.checked=(profile.favorite_games||[]).includes(game);choices.push(input);label.append(input,document.createTextNode(titles[game]));favoriteForm.append(label);}
        const favoriteSave=element('button','Save favorite tables');favoriteSave.type='submit';favoriteForm.append(favoriteSave);favoriteForm.onsubmit=e=>{e.preventDefault();run(async()=>{const favorite_games=choices.filter(c=>c.checked).map(c=>c.value);check(await client.from('hikoro_profiles').update({favorite_games}).eq('user_id',session.user.id));profile.favorite_games=favorite_games;message('Favorite tables saved.');});};favorites.append(favoriteForm);
        const favoriteLinks=card(panels.overview,'Your favorite tables');for(const game of profile.favorite_games||[])favoriteLinks.append(link(titles[game]+' →',paths[game]));if(!(profile.favorite_games||[]).length)favoriteLinks.append(element('p','Choose your favorites in Profile for a shortcut to your next table.'));
        const portraits=card(panels.profile,'Choose your portrait');const grid=element('div','','avatar-picker');
        for(const icon of PlayerIdentity.icons){const choose=button(titles[icon],async()=>{await changePortrait(icon,null);await renderAccount();message('Collection portrait selected.');}),image=element('img');image.src='/assets/collection/icons/'+icon+'.svg';image.alt='';choose.prepend(image);choose.setAttribute('aria-pressed',String(!profile.avatar_path&&profile.avatar_icon===icon));grid.append(choose);}portraits.append(grid);
        const uploadLabel=element('label','Or upload a profile picture'),upload=element('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.id='avatar-upload';uploadLabel.append(upload);portraits.append(uploadLabel,element('small','Choose a JPG, PNG or WebP up to 5 MB. It is cropped to a square portrait. Uploaded portraits are public images; use a picture you are comfortable sharing.'),link('Collection artwork & artist credits','/credits.html'));
        upload.onchange=()=>{const file=upload.files[0];if(file)run(async()=>{await uploadPortrait(file);await renderAccount();message('Profile picture saved.');});};if(profile.avatar_path)portraits.append(button('Remove uploaded picture',async()=>{await changePortrait(profile.avatar_icon,null);await renderAccount();message('Uploaded picture removed.');}));
        const tables=card(panels.tables,'Continue a saved table');if(adapter)tables.append(button('Save this table to my account',saveCurrent));if(!saves.length)tables.append(element('p','Open a local game and save it to continue here on any device.'));
        for(const save of saves){const row=element('div','','account-save');row.append(element('span',titles[save.game_type]+' · '+new Date(save.updated_at).toLocaleDateString()),button('Resume',async()=>{const data=check(await client.from('hikoro_saves').select('payload').eq('user_id',session.user.id).eq('game_type',save.game_type).single());if(!window.confirm('Open this saved table? It replaces the current local table for this game.'))return;sessionStorage.setItem('hikoro-cloud-restore',JSON.stringify({game_type:save.game_type,payload:data.payload}));location.href=paths[save.game_type];}));tables.append(row);}tables.append(link('Browse completed matches →','/history.html'));
        const practice=card(panels.tables,'Academy progress');const lessons=Object.entries(profile.academy_progress||{});practice.append(element('p',lessons.length?lessons.map(([lesson,count])=>lesson+': '+count+' practice moves').join(' · '):'Save an Academy lesson to record your progress.'),link('Return to the learning table →','/academy.html'));
        const prefs=card(panels.settings,'Your device preferences');prefs.append(button('Save device preferences',async()=>{const preferences={};for(const key of ['hikoro-preferences','hikoro-audio-v1','hikoro-accessibility-v1'])try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value&&typeof value==='object')preferences[key]=value;}catch{}check(await client.from('hikoro_profiles').update({preferences}).eq('user_id',session.user.id));message('Device preferences saved to your account.');}),button('Use saved preferences on this device',async()=>{await readProfile();if(!window.confirm('Replace this device’s game and audio preferences with your account preferences?'))return;for(const key of ['hikoro-preferences','hikoro-audio-v1','hikoro-accessibility-v1'])if(profile.preferences[key])localStorage.setItem(key,JSON.stringify(profile.preferences[key]));message('Preferences restored. They take effect on your next page visit.');}));
        const auth=card(panels.settings,'Account access');auth.append(element('p','Passwords and sign-in are managed by Supabase. Your match journals remain attached to your account.'),button('Sign out',async()=>{check(await client.auth.signOut());session=null;profile=null;refreshButton();await renderAccount();message('Signed out. Account-bound online seats require the same account to reconnect.');}));
        if (session.user.app_metadata?.hikoro_username_only) {
            auth.prepend(element('p', 'Login username: ' + session.user.app_metadata.hikoro_username), element('small', 'This account has no email. A forgotten password cannot be reset. Your board name is separate from your login username.'));
            const change = element('form'); change.innerHTML = '<label>Current password<input name="current" type="password" autocomplete="current-password" required maxlength="128"></label><label>New password<input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label><label>Confirm new password<input name="confirm" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label><button type="submit">Change password</button>';
            change.onsubmit = e => { e.preventDefault(); run(async () => { const data = new FormData(change); if (data.get('password') !== data.get('confirm')) throw Error('The passwords do not match.');
                await usernameRequest('signin', session.user.app_metadata.hikoro_username, data.get('current'));
                check(await client.auth.updateUser({ password: data.get('password') })); change.reset(); message('Password changed. Keep your new password safe.'); }); }; auth.append(change);
        }
        if(new URLSearchParams(location.search).get('reset')==='1'){const reset=card(panels.settings,'Set a new password'),f=element('form');f.innerHTML='<label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="8" required></label><button type="submit">Update password</button>';f.onsubmit=e=>{e.preventDefault();run(async()=>{const data=new FormData(f);if(data.get('password')!==data.get('confirm'))throw Error('The passwords do not match.');check(await client.auth.updateUser({password:data.get('password')}));f.reset();history.replaceState(null,'','/player.html');message('Password updated.');});};reset.append(f);[...tabbar.children].find(b=>b.textContent==='Settings').click();}
    }
    function identityChanged(){refreshButton();for(const socket of sockets)if(socket.connected)socket.emit('refreshPlayerIdentity',{token:session?.access_token});window.dispatchEvent(new Event('account-changed'));}
    async function changePortrait(icon,path){const userId=session?.user?.id;if(!userId)throw Error('Sign in first.');const previous=profile.avatar_path;check(await client.from('hikoro_profiles').update({avatar_icon:icon,avatar_path:path}).eq('user_id',userId));if(session?.user?.id!==userId)throw Error('Your account changed.');profile.avatar_icon=icon;profile.avatar_path=path;identityChanged();if(previous&&previous!==path)try{await client.storage.from('hikoro-avatars').remove([previous]);}catch{}}
    async function uploadPortrait(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose a JPG, PNG or WebP no larger than 5 MB.');const userId=session?.user?.id;if(!userId)throw Error('Sign in to upload a portrait.');const bitmap=await createImageBitmap(file);try{if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error('This picture is too large. Choose a smaller image.');const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d'),size=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,256,256);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(!blob||blob.type!=='image/webp'||blob.size>262144)throw Error('This browser could not prepare your portrait. Try a smaller picture.');if(session?.user?.id!==userId)throw Error('Your account changed.');const path=userId+'/'+crypto.randomUUID()+'.webp';check(await client.storage.from('hikoro-avatars').upload(path,blob,{contentType:'image/webp',upsert:false}));try{if(session?.user?.id!==userId)throw Error('Your account changed.');await changePortrait(profile.avatar_icon,path);}catch(error){await client.storage.from('hikoro-avatars').remove([path]);throw error;}}finally{bitmap.close();}}
    let seats=[],activeGameId=null,localTable=false;
    function paintSeats(){for(let i=0;i<seats.length;i++){const area=document.querySelector('[data-player-seat="'+(i+1)+'"]');if(!area)continue;const identity=localTable&&i===0&&session&&profile?profile:seats[i]||{},image=element('img'),copy=element('div');image.src=PlayerIdentity.portrait(identity,config?.url);image.alt='';copy.append(element('strong',PlayerIdentity.cleanName(identity.display_name,'Player '+(i+1))),element('small',area.dataset.army||'Player '+(i+1)));area.replaceChildren(image,copy);}}
    function tablePlayers(players,localLabels=[],gameId=null){activeGameId=gameId;localTable=!Array.isArray(players)||!players.length;seats=Array.isArray(players)&&players.length?[...players,...localLabels.slice(players.length).map((name,i)=>({display_name:name,avatar_icon:adapter?.type||'hikoro'}))]:localLabels.map((name,i)=>i===0&&session&&profile?profile:{display_name:name,avatar_icon:adapter?.type||'hikoro'});paintSeats();}
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
    window.SiteAccounts = { ready, tablePlayers, playerName:(seat,fallback)=>PlayerIdentity.cleanName(localTable&&seat===1&&session&&profile?profile.display_name:seats[seat-1]?.display_name,fallback), leaderboard:async(offset=0,game='')=>{await ready;if(!client)return null;return check(await client.rpc('hikoro_leaderboard',{game_filter:game||null,page_offset:offset}));}, portrait:identity=>PlayerIdentity.portrait(identity,config?.url), register, archiveRecord, listRecords, annotations, notesScope:()=>session?.user?.id||'device', saveNotes, shareRecord, unshareRecord, sharedRecord, completeTutorial, tableSnapshot:()=>adapter?{type:adapter.type,payload:adapter.recordCapture()}:null, socket: () => {
        const socket = io({ auth: callback => {
            ready.then(async () => { const current = client && await client.auth.getSession(); callback({ token: current?.data?.session?.access_token || null }); }).catch(() => callback({}));
        } });
        socket.on('playerIdentities',data=>{if(data.gameId===activeGameId)tablePlayers(data.players,[],data.gameId);});sockets.add(socket);window.TableCompanion?.attach(socket); return socket;
    } };
    document.addEventListener('DOMContentLoaded', async () => {
        const hub=document.getElementById('account-dialog');
        const open=button('Player account',async()=>{panel.showModal();await renderAccount();});open.id='account-open';open.className='account-open';
        const header=element('header','','player-appbar'),brand=link('HIKORO','/');brand.className='player-brand';const seal=element('img');seal.src='/assets/collection/icons/compass.svg';seal.alt='';brand.prepend(seal);const nav=element('nav');nav.setAttribute('aria-label','Main navigation');for(const [title,url]of [['Tables','/'],['My journal','/player.html'],['History','/history.html'],['Standings','/leaderboard.html']]){const a=link(title,url);if(location.pathname===url)a.setAttribute('aria-current','page');nav.append(a);}header.append(brand,nav,open);document.body.prepend(header);
        if(hub){panel=hub;panel.open=true;panel.showModal=()=>{panel.scrollIntoView?.({block:'start'});};panel.close=()=>{};}
        else{panel=element('dialog','','account-journal');panel.id='account-dialog';panel.setAttribute('aria-labelledby','account-title');panel.innerHTML='<div class="account-heading"><div><small>THE PLAYER HALL</small><h2 id="account-title">Your player journal</h2></div><button type="button" id="account-close" aria-label="Close player journal">Close</button></div><p id="account-message" role="status" aria-live="polite"></p><div id="account-body"></div>';document.body.append(panel);document.getElementById('account-close').onclick=()=>panel.close();}
        await ready;if(config?.review){const banner=element('p','REVIEW PREVIEW · Sample journal and standings. Live accounts and results are untouched.','review-banner');document.body.prepend(banner);}if(session)try{await readProfile();}catch{}refreshButton();if(hub)await renderAccount();
        if (new URLSearchParams(location.search).get('account') === '1') { panel.showModal(); await renderAccount(); }
    });
})();
