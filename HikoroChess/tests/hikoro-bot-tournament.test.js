const test = require('node:test');
const assert = require('node:assert/strict');
const bot = require('../hikoro-bot');
const {runTournament} = require('./hikoro-bot-tournament');

test('tournament runner reports color-paired seeds, move-cap endings, and score uncertainty', () => {
    const summary = runTournament(bot, bot, {
        games: 2, budgetMs: 25, maxMovesPerSide: 1, openingActions: 0, seed: 91
    });
    assert.equal(summary.gamesDetail.length, 2);
    assert.equal(summary.gamesDetail[0].openingSeed, summary.gamesDetail[1].openingSeed);
    assert.notEqual(summary.gamesDetail[0].AColor, summary.gamesDetail[1].AColor);
    assert.equal(summary.endings.moveCap, 2);
    assert.deepEqual(summary.pairedScoreRate95.A, [0, 1]);
    assert.deepEqual(summary.pairedScoreRate95.B, [0, 1]);
});

test('tournament runner rejects games without both color assignments', () => {
    assert.throws(() => runTournament(bot, bot, {games: 3}), /even game count/i);
});
