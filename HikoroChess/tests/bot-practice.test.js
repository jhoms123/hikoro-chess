const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const publicDir = path.join(__dirname, '../public');
const read = file => fs.readFileSync(path.join(publicDir, file), 'utf8');

test('both game pages link to their local bot practice editions', () => {
    for (const [gamePage, botPage, link] of [
        ['shodansho.html', 'shodansho-bot.html', '/shodansho-bot.html'],
        ['shavari.html', 'shavari-bot.html', '/shavari-bot.html']
    ]) {
        const game = new JSDOM(read(gamePage)).window.document;
        const practice = game.querySelector(`a[href="${link}"]`);
        assert.ok(practice, `${gamePage} exposes ${link}`);
        assert.equal(practice.target, '_blank');
        assert.match(practice.rel, /noopener/);
        assert.ok(fs.existsSync(path.join(publicDir, botPage)));
    }
});

test('game pages request the current translation catalog after a catalog update', () => {
    for (const name of fs.readdirSync(publicDir).filter(name => name.endsWith('.html'))) {
        const html = read(name);
        if (html.includes('/i18n-catalog.js?')) {
            assert.match(html, /\/i18n-catalog\.js\?v=20261008-bot-cuban-translations/, name);
        }
    }
});

test('Sho Dan Sho practice starts with the established v13.5.1 bot', () => {
    const dom = new JSDOM(read('shodansho-bot.html'));
    const page = dom.window.document;
    assert.equal(page.querySelector('#engine').value, 'v13-gumbel3');
    assert.match(page.body.textContent, /Adaptive Gumbel Guide v13\.5\.1/);
    assert.equal(page.querySelector('#validation-record'), null);
    assert.ok(fs.statSync(path.join(publicDir, 'shodansho-bot.html')).size < 1_100_000);
    dom.window.close();
});

test('Shavari bot search returns a move accepted by its bundled rules engine', () => {
    const dom = new JSDOM(read('shavari-bot.html'), {
        url: 'https://www.hikorochess.org/shavari-bot.html',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    const engineScript = [...window.document.scripts].find(script =>
        !script.src && script.type !== 'application/json' && script.textContent.includes('function shavariFactory')
    );
    assert.ok(engineScript, 'self-contained Shavari worker engine is present');
    window.eval(engineScript.textContent);
    const engine = window.ShavariLab;
    const initial = engine.initial();
    const result = engine.search(initial, { ms: 150, maxDepth: 3 });
    assert.ok(result.move, 'search returns a move');
    assert.ok(engine.apply(initial, result.move), 'the returned move is legal');
    window.close();
});

test('bot status text and board labels translate into complete Cuban Spanish', () => {
    const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', {
        url: 'https://www.hikorochess.org/shavari-bot.html',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    window.eval(read('i18n-catalog.js'));
    window.eval(read('i18n.js'));
    window.I18n.setLanguage('es-CU');

    for (const [source, translated] of [
        ['Choose one of your formations.', 'Escoge una de tus formaciones.'],
        ['Select a formation to inspect its members.', 'Selecciona una formación para ver sus piezas.'],
        ['AI opponent', 'Rival de IA'],
        ['A9: Turquoise Caravan Lance', 'A9: Turquesa Lanza Caravana'],
        [
            'Current board occurrence: 1/3 · No-capture clock: 0/100 · Backtracks in recent 28 plies: 0',
            'Repetición de la posición: 1/3 · Contador sin capturas: 0/100 · Retrocesos en las últimas 28 medias jugadas: 0'
        ],
        ['Suggested: A1 → B2 (capture, 1 carried).', 'Sugerencia: A1 → B2 (captura, se mueven 1).'],
        ['Choose a flower and drop at a starting gate.', 'Elige una flor y colócala en una puerta inicial.'],
        ['Ready. The bot uses the same legal-move engine as you.', 'Listo. El bot usa el mismo motor de jugadas legales que tú.'],
        ['Bot’s turn · Round 4', 'Le toca jugar al bot · Ronda 4']
    ]) {
        assert.equal(window.I18n.t(source), translated, source);
    }
    window.close();
});
