#!/usr/bin/env node
// Collect self-play outcomes and fit bounded linear evaluation multipliers.
// The produced weights are candidates; tournament holdout testing should decide
// whether a candidate is ever used by the site.
const fs = require('node:fs');
const path = require('node:path');
const rules = require('../gamelogic');
const bot = require('../hikoro-bot');
const {openingPosition} = require('../tests/hikoro-bot-tournament');

const featureScale = {
    material: 1000, reserve: 1000, royalRoute: 1000, center: 1000,
    promotion: 500, protection: 1000, sanctuaryThreat: 2000,
    royalAttack: 2400, mobility: 200, lastRoyal: 1000
};

function sigmoid(value) {
    if (value > 20) return 1;
    if (value < -20) return 0;
    return 1 / (1 + Math.exp(-value));
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function collectSelfPlay(options = {}) {
    const games = Math.max(2, Math.floor(options.games ?? 12));
    const budgetMs = Math.max(25, Math.min(4000, Number(options.budgetMs ?? 50)));
    const maxMovesPerSide = Math.max(1, Math.floor(options.maxMovesPerSide ?? 80));
    const openingActions = Math.max(0, Math.floor(options.openingActions ?? 4));
    const sampleEvery = Math.max(1, Math.floor(options.sampleEvery ?? 2));
    const seed = Number(options.seed ?? 20261011) >>> 0;
    const samples = [];
    const gamesDetail = [];

    for (let gameIndex = 0; gameIndex < games; gameIndex++) {
        let game = openingPosition((seed + gameIndex * 104729) >>> 0, openingActions);
        const positions = [];
        const movesBySide = {white: 0, black: 0};
        let ply = 0;
        while (!game.gameOver && movesBySide.white < maxMovesPerSide && movesBySide.black < maxMovesPerSide) {
            const color = game.isWhiteTurn ? 'white' : 'black';
            if (ply % sampleEvery === 0) {
                positions.push({features: bot.evaluateFeatures(game), color, turnCount: game.turnCount});
            }
            const searchStats = {};
            const move = bot.chooseMove(game, {
                budgetMs,
                width: Math.max(10, Math.min(24, Math.round(8 + budgetMs / 500))),
                rootWidth: Math.max(12, Math.min(24, Math.round(10 + budgetMs / 500))),
                maxDepth: 14,
                quiescenceDepth: 1,
                searchSessionId: `selfplay-${gameIndex}-${color}`,
                searchStats
            });
            if (!move) break;
            const result = rules.makeMoveForSearch(game, move, color);
            if (!result.success) throw new Error(`Self-play selected an illegal ${color} move: ${JSON.stringify(move)}`);
            game = result.updatedGame;
            movesBySide[color]++;
            ply++;
        }
        const winner = game.gameOver ? game.winner : 'draw';
        const outcome = winner === 'draw' ? 0.5 : winner === 'white' ? 1 : 0;
        for (const position of positions) {
            samples.push({
                features: position.features,
                target: position.color === 'white' ? outcome : 1 - outcome,
                game: gameIndex + 1,
                color: position.color,
                turnCount: position.turnCount
            });
        }
        gamesDetail.push({
            game: gameIndex + 1, seed: (seed + gameIndex * 104729) >>> 0,
            winner, reason: game.gameOver ? game.reason : 'self-play move cap',
            plies: ply, movesBySide
        });
        if (typeof options.onGameComplete === 'function') options.onGameComplete(gamesDetail[gamesDetail.length - 1]);
    }
    return {games, budgetMs, maxMovesPerSide, openingActions, seed, samples, gamesDetail};
}

function trainEvaluationWeights(samples, options = {}) {
    if (!Array.isArray(samples) || !samples.length) throw new Error('At least one labeled self-play sample is required.');
    const epochs = Math.max(1, Math.floor(options.epochs ?? 300));
    const learningRate = Math.max(0.0001, Math.min(0.05, Number(options.learningRate ?? 0.01)));
    const temperature = Math.max(0.5, Number(options.temperature ?? 3));
    const regularization = Math.max(0, Math.min(0.1, Number(options.regularization ?? 0.005)));
    const random = seededRandom(Number(options.seed ?? 20261011));
    const names = Object.keys(featureScale);
    const weights = Object.fromEntries(names.map(name => [name, 1]));
    const clamp = value => Math.max(0.25, Math.min(1.75, value));
    const xFor = sample => Object.fromEntries(names.map(name => [
        name, (Number(sample.features?.[name]) || 0) / featureScale[name]
    ]));
    const encoded = samples.map(sample => ({x: xFor(sample), target: Math.max(0, Math.min(1, Number(sample.target)))}));
    const probability = x => sigmoid(names.reduce((sum, name) => sum + weights[name] * x[name], 0) / temperature);
    const loss = () => encoded.reduce((sum, sample) => {
        const p = Math.max(1e-6, Math.min(1 - 1e-6, probability(sample.x)));
        return sum - sample.target * Math.log(p) - (1 - sample.target) * Math.log(1 - p);
    }, 0) / encoded.length;
    const initialLoss = loss();

    for (let epoch = 0; epoch < epochs; epoch++) {
        for (let i = encoded.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [encoded[i], encoded[j]] = [encoded[j], encoded[i]];
        }
        for (const sample of encoded) {
            const p = probability(sample.x);
            for (const name of names) {
                const gradient = ((p - sample.target) * sample.x[name] / temperature) + regularization * (weights[name] - 1);
                weights[name] = clamp(weights[name] - learningRate * gradient);
            }
        }
    }

    const multipliers = Object.fromEntries(names.map(name => [name, Number(weights[name].toFixed(4))]));
    return {
        weights: multipliers,
        samples: samples.length,
        epochs,
        initialLoss: Number(initialLoss.toFixed(6)),
        trainingLoss: Number(loss().toFixed(6)),
        featureScale,
        note: 'Candidate weights are trained on self-play outcomes; validate them in a separate paired tournament before deployment.'
    };
}

function splitByGame(samples, options = {}) {
    const validationFraction = Math.max(0.1, Math.min(0.45, Number(options.validationFraction ?? 0.2)));
    const random = seededRandom(Number(options.seed ?? 20261011));
    const groups = new Map();
    samples.forEach((sample, index) => {
        const key = sample.game === undefined ? `sample-${index}` : `game-${sample.game}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(sample);
    });
    const gameKeys = [...groups.keys()];
    if (gameKeys.length < 2) {
        return {training: samples.slice(), validation: [], validationLevel: 'unavailable'};
    }
    for (let i = gameKeys.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [gameKeys[i], gameKeys[j]] = [gameKeys[j], gameKeys[i]];
    }
    const validationCount = Math.max(1, Math.min(gameKeys.length - 1,
        Math.round(gameKeys.length * validationFraction)));
    const validationGames = new Set(gameKeys.slice(0, validationCount));
    const training = [], validation = [];
    for (const [key, rows] of groups) (validationGames.has(key) ? validation : training).push(...rows);
    const usesGameIds = samples.some(sample => sample.game !== undefined);
    return {
        training, validation,
        validationLevel: usesGameIds ? 'held-out games' : 'held-out samples',
        trainingGames: gameKeys.length - validationCount,
        validationGames: validationCount
    };
}

function evaluationLoss(samples, weights, temperature = 3) {
    if (!samples.length) return null;
    return samples.reduce((total, sample) => {
        let score = 0;
        for (const [name, scale] of Object.entries(featureScale)) {
            score += (Number(sample.features?.[name]) || 0) / scale * (Number(weights?.[name]) || 1);
        }
        const p = Math.max(1e-6, Math.min(1 - 1e-6, sigmoid(score / temperature)));
        const target = Math.max(0, Math.min(1, Number(sample.target)));
        return total - target * Math.log(p) - (1 - target) * Math.log(1 - p);
    }, 0) / samples.length;
}

function trainEvaluationCandidate(samples, options = {}) {
    const split = splitByGame(samples, options);
    const baseline = Object.fromEntries(Object.keys(featureScale).map(name => [name, 1]));
    if (!split.validation.length) {
        const trained = trainEvaluationWeights(split.training, options);
        return {...trained, validationLevel: split.validationLevel,
            validationSamples: 0, baselineValidationLoss: null, validationLoss: null,
            candidateRecommendation: 'Collect outcomes from at least two games before judging a candidate.'};
    }
    const trained = trainEvaluationWeights(split.training, options);
    const temperature = Math.max(0.5, Number(options.temperature ?? 3));
    const baselineValidationLoss = evaluationLoss(split.validation, baseline, temperature);
    const validationLoss = evaluationLoss(split.validation, trained.weights, temperature);
    return {
        ...trained,
        trainingSamples: split.training.length,
        validationSamples: split.validation.length,
        trainingGames: split.trainingGames,
        validationGames: split.validationGames,
        validationLevel: split.validationLevel,
        baselineValidationLoss: Number(baselineValidationLoss.toFixed(6)),
        validationLoss: Number(validationLoss.toFixed(6)),
        candidateRecommendation: validationLoss < baselineValidationLoss
            ? 'Validation loss improved; confirm with a separate paired bot tournament before enabling.'
            : 'Validation did not beat default weights; keep the candidate disabled.'
    };
}

function option(name, fallback) {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

if (require.main === module) {
    try {
        const result = collectSelfPlay({
            games: Number(option('--games', 12)),
            budgetMs: Number(option('--budget-ms', 50)),
            maxMovesPerSide: Number(option('--max-moves-per-side', 80)),
            openingActions: Number(option('--opening-actions', 4)),
            sampleEvery: Number(option('--sample-every', 2)),
            seed: Number(option('--seed', 20261011)),
            onGameComplete: game => process.stderr.write(`Self-play ${game.game}: ${game.winner} (${game.reason}), ${game.plies} plies\n`)
        });
        const trained = trainEvaluationCandidate(result.samples, {
            epochs: Number(option('--epochs', 300)), seed: result.seed,
            validationFraction: Number(option('--validation-fraction', 0.2))
        });
        const outputPath = path.resolve(process.cwd(), option('--out', 'hikoro-eval-model.candidate.json'));
        fs.writeFileSync(outputPath, JSON.stringify({
            model: 'linear-evaluation-v1', trainedAt: new Date().toISOString(),
            source: {games: result.gamesDetail, seed: result.seed, budgetMs: result.budgetMs,
                maxMovesPerSide: result.maxMovesPerSide, sampleEvery: Number(option('--sample-every', 2))},
            ...trained
        }, null, 2) + '\n');
        process.stdout.write(JSON.stringify({outputPath, samples: trained.samples, weights: trained.weights,
            initialLoss: trained.initialLoss, trainingLoss: trained.trainingLoss}, null, 2) + '\n');
    } catch (error) {
        process.stderr.write(`${error?.stack || error}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    collectSelfPlay, trainEvaluationWeights, splitByGame,
    evaluationLoss, trainEvaluationCandidate
};
