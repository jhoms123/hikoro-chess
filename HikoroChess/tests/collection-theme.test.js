const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('shared theme leaves City Battle grid cells at board sizing', () => {
    const source = fs.readFileSync(require.resolve('../public/collection-theme.js'), 'utf8');
    const cells = [fakeButton('city-square stone-light'), fakeButton('primary-button', 'new-game')];
    let ready;
    const document = {
        body: { dataset: { audioTheme: 'shavari' }, classList: { contains: () => false } },
        addEventListener: (name, callback) => { if (name === 'DOMContentLoaded') ready = callback; },
        createElement: () => ({ setAttribute() {}, classList: { add() {} }, style: { setProperty() {} } }),
        querySelectorAll: () => cells,
        querySelector: () => null
    };
    class MutationObserver { observe() {} }

    vm.runInNewContext(source, { document, MutationObserver });
    ready();

    assert.equal(cells[0].classList.contains('material-control'), false, 'board squares do not get button padding or minimum height');
    assert.equal(cells[1].classList.contains('material-control'), true, 'play controls still receive the shared theme');
});

function fakeButton(classNames, id = '') {
    const classes = new Set(classNames.split(/\s+/).filter(Boolean));
    return {
        id,
        textContent: 'New match',
        dataset: {},
        style: { setProperty() {} },
        classList: {
            add: name => classes.add(name),
            contains: name => classes.has(name)
        },
        matches: selector => selector.split(',').some(part => part.trim().slice(1) === 'city-square' && classes.has('city-square')),
        closest: () => null
    };
}
