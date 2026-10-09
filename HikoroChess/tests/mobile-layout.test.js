const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('mobile game boards allow vertical page scrolling through the board area', () => {
    const css = fs.readFileSync(path.join(__dirname, '../public/mobile-table.css'), 'utf8');
    assert.match(css, /\.mobile-board-viewport\s*\{[^}]*touch-action:pan-x pan-y pinch-zoom/s);
    assert.match(css, /\.mobile-board-viewport\.is-detailed\s*\{[^}]*max-height:none/s);
    assert.doesNotMatch(css, /\.mobile-board-viewport\.is-detailed\s*\{[^}]*max-height:65svh/s);
});
