const test = require('node:test');
const assert = require('node:assert/strict');
const {
    collectSelfPlay, trainEvaluationWeights, splitByGame, trainEvaluationCandidate
} = require('../tools/hikoro-selfplay-trainer');

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

test('weight candidates use game-level holdout data and stay explicitly gated', () => {
    const samples = [
        {game: 1, features: {material: 1200}, target: 1},
        {game: 1, features: {material: 900}, target: 1},
        {game: 2, features: {material: -1200}, target: 0},
        {game: 2, features: {material: -900}, target: 0},
        {game: 3, features: {material: 100}, target: 0.5},
        {game: 4, features: {material: -100}, target: 0.5}
    ];
    const split = splitByGame(samples, {validationFraction: 0.25, seed: 19});
    const trainingGames = new Set(split.training.map(row => row.game));
    const validationGames = new Set(split.validation.map(row => row.game));
    assert.ok(split.training.length > 0 && split.validation.length > 0);
    assert.equal([...trainingGames].some(game => validationGames.has(game)), false);

    const candidate = trainEvaluationCandidate(samples, {
        validationFraction: 0.25, epochs: 80, seed: 19
    });
    assert.equal(candidate.validationLevel, 'held-out games');
    assert.ok(Number.isFinite(candidate.validationLoss));
    assert.ok(Number.isFinite(candidate.baselineValidationLoss));
    assert.match(candidate.candidateRecommendation, /paired bot tournament|keep the candidate disabled/);
});
