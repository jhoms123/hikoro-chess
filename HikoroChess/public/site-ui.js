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
        const sds = selector.value === 'shodansho', shavari = selector.value === 'shavari', mini = selector.value === 'hikoruka';
        document.querySelectorAll('.game-choice').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.game === selector.value)));
        ['time-control', 'byoyomi-control'].forEach(id => {
            const el = document.getElementById(id); el.disabled = sds || shavari || mini; el.parentElement.hidden = sds || shavari || mini;
        });
        document.getElementById('setup-hint').textContent = sds ? 'Sho Dan Sho is untimed. Choose 2–4 players, then open an online room or share this device.' : shavari ? 'Shavari chess is untimed. Share this device with saved progress, or open a two-player online table.' : mini ? 'Hikorüka is untimed. Play locally with a friend or the bot, or open a two-player online table.' : 'Online rooms need a second player. Local play shares this device.';
    }
    preferences.forEach(id => document.getElementById(id).addEventListener('change', () => {
        try { localStorage.setItem('hikoro-preferences', JSON.stringify(Object.fromEntries(preferences.map(id => [id, document.getElementById(id).value])))); } catch {}
    }));
    selector.addEventListener('change', updateChoice);
    document.querySelectorAll('.game-choice').forEach(b => b.addEventListener('click', () => { selector.value = b.dataset.game; selector.dispatchEvent(new Event('change')); }));
    selector.dispatchEvent(new Event('change'));
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
