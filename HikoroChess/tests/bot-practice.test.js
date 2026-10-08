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
