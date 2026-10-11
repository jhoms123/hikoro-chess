const test = require('node:test');
const assert = require('node:assert/strict');
const {collectSelfPlay, trainEvaluationWeights} = require('../tools/hikoro-selfplay-trainer');

test('self-play trainer moves material weight toward features associated with wins', () => {
    const zeros = {
        material: 0, reserve: 0, royalRoute: 0, center: 0, promotion: 0,
        protection: 0, sanctuaryThreat: 0, royalAttack: 0, mobility: 0, lastRoyal: 0
    };
    const samples = [
        {features: {...zeros, material: 1800}, target: 1},
        {features: {...zeros, material: 1300}, target: 1},
        {features: {...zeros, material: -1500}, target: 0},
        {features: {...zeros, material: -900}, target: 0}
    ];
    const trained = trainEvaluationWeights(samples, {epochs: 100, seed: 7});
    assert.ok(trained.trainingLoss < trained.initialLoss);
    assert.ok(trained.weights.material > 1);
    for (const value of Object.values(trained.weights)) assert.ok(Number.isFinite(value));
});

test('self-play collector records outcome-labeled Hikoro positions', () => {
    const result = collectSelfPlay({
        games: 2, budgetMs: 25, maxMovesPerSide: 1,
        openingActions: 0, sampleEvery: 1, seed: 17
    });
    assert.equal(result.gamesDetail.length, 2);
    assert.ok(result.samples.length > 0);
    assert.ok(result.samples.every(sample => sample.target >= 0 && sample.target <= 1));
});
