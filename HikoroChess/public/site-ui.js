document.addEventListener('DOMContentLoaded', () => {
    const selector = document.getElementById('game-type-select');
    const preferences = ['game-type-select', 'sds-player-count', 'time-control', 'byoyomi-control', 'player-name'];
    try {
        const saved = JSON.parse(localStorage.getItem('hikoro-preferences') || '{}');
        preferences.forEach(id => {
            const el = document.getElementById(id);
            if (typeof saved[id] !== 'string') return;
            if (el.tagName !== 'SELECT' || [...el.options].some(o => o.value === saved[id])) el.value = saved[id].slice(0, 30);
        });
    } catch { /* Storage may be disabled. Defaults remain usable. */ }
    function updateChoice() {
        const sds = selector.value === 'shodansho', shavari = selector.value === 'shavari', mini = selector.value === 'hikoruka', go = selector.value === 'go', academy = selector.value === 'academy';
        document.getElementById('go-size-container').hidden = !go;
        document.querySelectorAll('.game-choice').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.game === selector.value)));
        ['time-control', 'byoyomi-control'].forEach(id => {
            const el = document.getElementById(id); el.disabled = sds || shavari || mini || go || academy; el.parentElement.hidden = sds || shavari || mini || go || academy;
        });
        document.getElementById('setup-hint').textContent = sds ? 'Sho Dan Sho is untimed. Choose 2–4 players, then open an online room or share this device.' : shavari ? 'Shavari chess is untimed. Share this device with saved progress, or open a two-player online table.' : mini ? 'Hikorüka is untimed. Play locally with a friend or the bot, or open a two-player online table.' : go ? 'Shield Go is untimed. Choose a board size, then share this device or open an online table for two players.' : academy ? 'Learn eight real Hikoro pieces, royal palaces, and sanctuary wins on 8 × 8. Local play includes guided practice; online rooms use a two-player teaching match.' : 'Online rooms need a second player. Local play shares this device.';
    }
    preferences.forEach(id => document.getElementById(id).addEventListener('change', () => {
        try { localStorage.setItem('hikoro-preferences', JSON.stringify(Object.fromEntries(preferences.map(id => [id, document.getElementById(id).value])))); } catch {}
    }));
    selector.addEventListener('change', updateChoice);
    document.querySelectorAll('.game-choice').forEach(b => b.addEventListener('click', () => { selector.value = b.dataset.game; selector.dispatchEvent(new Event('change')); }));
    selector.dispatchEvent(new Event('change'));

    // Surface one useful local save without forcing the player to inspect every table.
    const saveCandidates = [
        { key:'hikoro-academy-local-v3', title:'Hikoro Academy', detail:'Continue your saved lesson or teaching match.', href:'academy.html' },
        { key:'shavari-local-v3', title:'Shavari chess', detail:'Continue your saved formation battle.', href:'shavari.html' },
        { key:'hikoruka-local-v1', title:'Hikorüka chess', detail:'Return to your saved citadel match.', href:'hikoruka.html' },
        { key:'shield-go-local-v1', title:'Shield Go', detail:'Return to your saved stone-and-shield table.', href:'go.html' }
    ];
    const resumePanel = document.getElementById('resume-panel');
    if (resumePanel) {
        let savedChoice = null;
        for (const candidate of saveCandidates) {
            try {
                const parsed = JSON.parse(localStorage.getItem(candidate.key) || 'null');
                const progress = Number(parsed?.cursor || 0);
                if (progress > 0) { savedChoice = { ...candidate, progress }; break; }
            } catch {}
        }
        if (savedChoice) {
            document.getElementById('resume-title').textContent = savedChoice.title;
            document.getElementById('resume-detail').textContent = savedChoice.detail;
            document.getElementById('resume-link').href = savedChoice.href;
            resumePanel.hidden = false;
        }
    }
    const lobby = document.getElementById('lobby');
    new MutationObserver(() => document.body.classList.toggle('game-active', lobby.style.display === 'none')).observe(lobby, { attributes:true, attributeFilter:['style'] });
    const modal = document.getElementById('rules-modal');
    const close = document.getElementById('close-rules-btn');
    let returnFocus;
    new MutationObserver(() => {
        const open = modal.style.display === 'block';
        modal.setAttribute('aria-hidden', String(!open));
        if (open) { returnFocus = document.activeElement; close.focus(); document.body.style.overflow = 'hidden'; }
        else { document.body.style.overflow = ''; returnFocus?.focus(); }
    }).observe(modal, { attributes:true, attributeFilter:['style'] });
    modal.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); close.click(); }
        if (e.key === 'Tab') { e.preventDefault(); close.focus(); }
    });
    document.addEventListener('keydown', e => {
        if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) || modal.style.display === 'block') return;
        if (e.key === 'ArrowLeft' && document.getElementById('replay-controls').style.display === 'flex') { e.preventDefault(); document.getElementById('replay-prev-btn').click(); }
        if (e.key === 'ArrowRight' && document.getElementById('replay-controls').style.display === 'flex') { e.preventDefault(); document.getElementById('replay-next-btn').click(); }
    });
});
