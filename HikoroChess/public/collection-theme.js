/* Appearance and navigation only. All game rules remain in their existing engines. */
document.addEventListener('DOMContentLoaded',()=>{
    const body=document.body, theme=body.dataset.audioTheme;
    const icons={rules:'rules',undo:'undo',save:'save',play:'play',leave:'leave',seed:'seed',compass:'compass',crown:'crown'};
    function decorate(root=document){
        root.querySelectorAll('button,a.quiet-button,a.collection-link,a.atlas-primary,a.atlas-secondary,details.collection-audio>summary').forEach(b=>{
            if(b.matches('.game-choice,.mini-cell,.intersection,.reserve-flower'))return;
            b.classList.add('material-control');
            const id=b.id,text=b.textContent.trim();let icon=null;
            if(/rules|close-rules/.test(id)||b.classList.contains('header-rules'))icon='rules';
            else if(/undo|redo|flip/.test(id))icon='undo';
            else if(/save|kifu|replay/.test(id))icon='save';
            else if(/resign|main-menu|lobby-link/.test(id)||b.classList.contains('collection-link'))icon='compass';
            else if(/create-game|single-player|new-button|reset-lesson|accept-confirm/.test(id)||b.classList.contains('atlas-primary'))icon='play';
            else if(/pickup|shield/.test(id))icon=theme==='shodansho'?'seed':'crown';
            const primary=icon==='play'||b.classList.contains('primary-button');
            if(primary)b.dataset.primary='true';
            let material={lobby:'wood',shodansho:'parchment',shavari:'jade',hikoruka:'wood',go:'stone',academy:'parchment'}[theme]||'wood';
            if(b.closest('#hikoro-game-wrapper,#turn-indicator-container')||body.classList.contains('game-active'))material='pearl';
            if(icon==='rules'||icon==='save'||b.classList.contains('atlas-secondary'))material='parchment';
            if(/resign|reset|accept-confirm/.test(id))material='seal';
            if(primary)material=theme==='shavari'?'jade':theme==='go'?'stone':theme==='academy'?'pearl':'wood';
            b.dataset.material=material;
            if(icon){b.dataset.actionIcon=icon;b.style.setProperty('--action-icon',`url('assets/collection/icons/${icons[icon]}.svg')`);}
        });
    }
    decorate();
    let decorationScheduled=false;
    new MutationObserver(()=>{if(decorationScheduled)return;decorationScheduled=true;requestAnimationFrame(()=>{decorationScheduled=false;decorate();});}).observe(body,{childList:true,subtree:true});
    const attribution=document.createElement('div');attribution.className='artwork-attribution';
    attribution.innerHTML='Action emblems by <a href="https://game-icons.net/about.html" target="_blank" rel="noopener">Lorc &amp; Delapouite</a> · CC BY 3.0 · Materials by Kenney, cron &amp; Poly Haven artists · <a href="credits.html">All artists &amp; licenses</a>';
    document.querySelector('footer')?.after(attribution);
    if(theme!=='lobby')return;
    const worlds={
        hikoro:{name:'Hikoro Chess',description:'An ocean kingdom of captures, promotions, and royal sanctuaries.',guide:'academy.html',guideLabel:'Learn the ocean pieces in Academy →'},
        shodansho:{name:'Sho Dan Sho',description:'Cultivate harmony with seven flower types on a circular garden board.',guide:'shodansho.html?showRules=1',guideLabel:'Explore the garden rules →'},
        shavari:{name:'Shavari chess',description:'Build formations, combine movements, and command the lotus court.',guide:'shavari.html?showRules=1',guideLabel:'Read the court’s rules →'},
        hikoruka:{name:'Hikorüka chess',description:'Five heraldic roles. Eight pieces. Protect your Sovereign on a compact board.',guide:'hikoruka.html?showRules=1',guideLabel:'Meet the citadel’s company →'},
        go:{name:'Shield Go',description:'Place, leap, shield, and surround on a wooden 9 × 9 or 13 × 13 table.',guide:'go.html?showRules=1',guideLabel:'Learn stones, shields, and territory →'},
        academy:{name:'Hikoro Academy',description:'Learn real Hikoro movements in guided practice, then teach a friend on 8 × 8.',guide:'academy.html',guideLabel:'Begin guided practice →'}
    };
    const selector=document.getElementById('game-type-select');
    function update(){const game=selector.value,w=worlds[game];if(!w)return;
        document.getElementById('selected-table-art').src=`assets/collection/matches/${game}.webp`;
        document.getElementById('selected-table-name').textContent=w.name;
        document.getElementById('selected-table-description').textContent=w.description;
        const guide=document.getElementById('selected-table-guide');guide.href=w.guide;guide.textContent=w.guideLabel;
        document.querySelectorAll('.card-select>span:first-child').forEach(el=>el.textContent=el.closest('[data-game]').dataset.game===game?'Selected · set up below':'Choose this table');
    }
    selector.addEventListener('change',update);update();
    document.getElementById('single-player-btn').addEventListener('click',()=>requestAnimationFrame(()=>decorate()));
    document.querySelectorAll('.game-choice').forEach(b=>b.addEventListener('click',()=>{
        if(matchMedia('(max-width:700px)').matches)document.getElementById('game-setup').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
    }));
    const resume=document.createElement('nav');resume.className='resume-table';resume.setAttribute('aria-label','Continue saved games');resume.hidden=true;
    for(const [game,key]of [['academy','hikoro-academy-local-v3'],['hikoruka','hikoruka-local-v1'],['shavari','shavari-local-v3'],['go','shield-go-local-v1']]){
        try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Number.isInteger(saved.cursor)&&saved.cursor>0&&Array.isArray(saved.journal)&&saved.cursor<=saved.journal.length){const link=document.createElement('a');link.href=game+'.html';link.textContent='Continue '+worlds[game].name+' →';resume.append(link);resume.hidden=false;}}catch{}
    }
    document.querySelector('.hero-copy').append(resume);
});
