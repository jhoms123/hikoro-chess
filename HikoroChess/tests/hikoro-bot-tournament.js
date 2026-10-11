#!/usr/bin/env node
// Paired Hikoro bot match runner. Example:
// node tests/hikoro-bot-tournament.js ./tests/fixtures/old-bot.js ./hikoro-bot.js --games 40 --budget-ms 500 --max-moves-per-side 300 --seed 20261010
const path = require('node:path');
const fs = require('node:fs');
const rules = require('../gamelogic');
const defaultBot = require('../hikoro-bot');

function option(name, fallback) {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function loadBot(value, fallback) {
    if (!value) return fallback;
    return require(path.resolve(process.cwd(), value));
}

function loadWeights(filename) {
    if (!filename) return null;
    const model = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filename), 'utf8'));
    return model.weights || model;
}

function initialGame() {
    return {
        boardState: rules.getInitialBoard(), isWhiteTurn: true, turnCount: 0, gameOver: false,
        whiteCaptured: [], blackCaptured: [], whitePrinceOnBoard: true, blackPrinceOnBoard: true,
        moveList: [], actionJournal: []
    };
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function withoutRuleChatter(action) {
    const log = console.log, warn = console.warn;
    console.log = () => {};
    console.warn = () => {};
    try {
        return action();
    } finally {
        console.log = log;
        console.warn = warn;
    }
}

function openingPosition(seed, openingActions) {
    const random = seededRandom(seed);
    let game = initialGame();
    for (let action = 0; action < openingActions && !game.gameOver; action++) {
        const moves = defaultBot.legalMoves(game);
        if (!moves.length) break;
        const move = moves[Math.floor(random() * moves.length)];
        const result = withoutRuleChatter(() => rules.makeMove(game, move, game.isWhiteTurn ? 'white' : 'black'));
        if (!result.success) throw new Error(`Opening move rejected for seed ${seed}`);
        game = result.updatedGame;
    }
    return game;
}

function runGame(whiteBot, blackBot, start, budgetMs, maxActions, maxMovesPerSide = null,
    searchSessionPrefix = 'tournament', whiteEvalWeights = null, blackEvalWeights = null) {
    let game = structuredClone(start), actions = 0;
    const movesBySide = {white: 0, black: 0};
    const engineStats = {
        white: {moves: 0, milliseconds: 0, nodes: 0, completedDepth: 0, ttHits: 0, pvsResearches: 0},
        black: {moves: 0, milliseconds: 0, nodes: 0, completedDepth: 0, ttHits: 0, pvsResearches: 0}
    };
    while (!game.gameOver && actions < maxActions &&
        (!maxMovesPerSide || (movesBySide.white < maxMovesPerSide && movesBySide.black < maxMovesPerSide))) {
        const color = game.isWhiteTurn ? 'white' : 'black';
        const engine = color === 'white' ? whiteBot : blackBot;
        const stats = {};
        const started = Date.now();
        const width = Math.max(10, Math.min(24, Math.round(8 + budgetMs / 500)));
        const rootWidth = Math.max(12, Math.min(24, Math.round(10 + budgetMs / 500)));
        const move = withoutRuleChatter(() => engine.chooseMove(game, {
            budgetMs, width, rootWidth, maxDepth: 14, quiescenceDepth: 1,
            searchSessionId: `${searchSessionPrefix}:${color}`,
            evaluationWeights: color === 'white' ? whiteEvalWeights : blackEvalWeights,
            searchStats: stats
        }));
        engineStats[color].moves++;
        engineStats[color].milliseconds += Date.now() - started;
        engineStats[color].nodes += stats.nodes || 0;
        engineStats[color].completedDepth += stats.completedDepth || 0;
        engineStats[color].ttHits += stats.ttHits || 0;
        engineStats[color].pvsResearches += stats.pvsResearches || 0;
        if (!move) return {winner: 'draw', reason: 'no legal move', actions, movesBySide, engineStats};
        const result = withoutRuleChatter(() => rules.makeMove(game, move, color));
        if (!result.success) throw new Error(`Bot returned illegal ${color} move: ${JSON.stringify(move)}`);
        game = result.updatedGame;
        actions++;
        movesBySide[color]++;
    }
    if (game.gameOver) return {winner: game.winner, reason: game.reason, actions, movesBySide, engineStats};
    const moveCapReached = maxMovesPerSide &&
        (movesBySide.white >= maxMovesPerSide || movesBySide.black >= maxMovesPerSide);
    return {
        winner: 'draw',
        reason: moveCapReached ? `${maxMovesPerSide} move cap per side` : 'action limit',
        actions, movesBySide, engineStats
    };
}

function runTournament(botA, botB, options = {}) {
    const games = options.games ?? 20;
    const budgetMs = options.budgetMs ?? 500;
    const maxMovesPerSide = options.maxMovesPerSide ?? null;
    const maxActions = options.maxActions ?? (maxMovesPerSide ? maxMovesPerSide * 2 : 160);
    const openingActions = options.openingActions ?? 4;
    const seed = Number(options.seed ?? 20261010) >>> 0;
    const onGameComplete = options.onGameComplete;
    if (games < 2 || games % 2 !== 0) throw new Error('Use an even game count so each bot gets both colors.');
    const summary = {
        games, budgetMs, maxActions, maxMovesPerSide, openingActions, seed,
        A: {wins: 0, losses: 0, draws: 0, whiteWins: 0, blackWins: 0},
        B: {wins: 0, losses: 0, draws: 0, whiteWins: 0, blackWins: 0},
        endings: {sanctuary: 0, royaltyCapture: 0, moveCap: 0, actionLimit: 0, noLegalMove: 0, other: 0},
        pairedScoreRate95: null,
        gamesDetail: []
    };
    for (let index = 0; index < games; index++) {
        const pair = Math.floor(index / 2);
        const aIsWhite = index % 2 === 0;
        const openingSeed = (seed + pair * 7919) >>> 0;
        const start = openingPosition(openingSeed, openingActions);
        const result = runGame(
            aIsWhite ? botA : botB,
            aIsWhite ? botB : botA,
            start, budgetMs, maxActions, maxMovesPerSide, `pair-${pair}-game-${index + 1}`,
            aIsWhite ? options.evaluationWeightsA : options.evaluationWeightsB,
            aIsWhite ? options.evaluationWeightsB : options.evaluationWeightsA
        );
        const botAColor = aIsWhite ? 'white' : 'black';
        const botBColor = aIsWhite ? 'black' : 'white';
        const winnerName = result.winner === 'draw' ? 'draw' : result.winner === botAColor ? 'A' : 'B';
        if (winnerName === 'draw') {
            summary.A.draws++;
            summary.B.draws++;
        } else {
            const winner = summary[winnerName], loser = summary[winnerName === 'A' ? 'B' : 'A'];
            winner.wins++;
            loser.losses++;
            winner[result.winner === 'white' ? 'whiteWins' : 'blackWins']++;
        }
        const detail = {
            game: index + 1, openingSeed,
            AColor: botAColor, winner: winnerName, reason: result.reason,
            actions: result.actions, movesBySide: result.movesBySide,
            engineStats: result.engineStats
        };
        const reason = String(result.reason || '').toLowerCase();
        if (reason.includes('sanctuary')) summary.endings.sanctuary++;
        else if (reason.includes('royalty')) summary.endings.royaltyCapture++;
        else if (reason.includes('move cap')) summary.endings.moveCap++;
        else if (reason.includes('action limit')) summary.endings.actionLimit++;
        else if (reason.includes('no legal move')) summary.endings.noLegalMove++;
        else summary.endings.other++;
        summary.gamesDetail.push(detail);
        if (typeof onGameComplete === 'function') onGameComplete(detail, summary);
    }
    const pairScores = [];
    for (let i = 0; i < summary.gamesDetail.length; i += 2) {
        const points = summary.gamesDetail.slice(i, i + 2).map(game =>
            game.winner === 'A' ? 1 : game.winner === 'B' ? 0 : 0.5);
        pairScores.push(points.reduce((sum, score) => sum + score, 0) / points.length);
    }
    const mean = pairScores.reduce((sum, score) => sum + score, 0) / pairScores.length;
    const variance = pairScores.length > 1
        ? pairScores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / (pairScores.length - 1)
        : 0.25;
    const margin = 1.96 * Math.sqrt(variance / Math.max(1, pairScores.length));
    summary.pairedScoreRate95 = {
        A: [Math.max(0, mean - margin), Math.min(1, mean + margin)],
        B: [Math.max(0, 1 - mean - margin), Math.min(1, 1 - mean + margin)],
        method: 'Approximate 95% interval over paired-opening average scores'
    };
    return summary;
}

if (require.main === module) {
    try {
        const botA = loadBot(process.argv[2], defaultBot);
        const botB = loadBot(process.argv[3], defaultBot);
        const moveCapOption = option('--max-moves-per-side', null);
        const maxMovesPerSide = moveCapOption === null ? null : Number(moveCapOption);
        if (maxMovesPerSide !== null && (!Number.isInteger(maxMovesPerSide) || maxMovesPerSide < 1)) {
            throw new Error('--max-moves-per-side must be a positive integer.');
        }
        const summary = runTournament(botA, botB, {
            games: Number(option('--games', 20)),
            budgetMs: Number(option('--budget-ms', 500)),
            maxActions: Number(option('--max-actions', maxMovesPerSide ? maxMovesPerSide * 2 : 160)),
            maxMovesPerSide,
            openingActions: Number(option('--opening-actions', 4)),
            seed: Number(option('--seed', 20261010)),
            evaluationWeightsA: loadWeights(option('--weights-a', null)),
            evaluationWeightsB: loadWeights(option('--weights-b', null)),
            onGameComplete: detail => {
                process.stderr.write(
                    `Game ${detail.game}: ${detail.winner} (${detail.reason}), ` +
                    `${detail.actions} actions [W ${detail.movesBySide.white} / B ${detail.movesBySide.black}]\n`
                );
            }
        });
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${error?.stack || error}\n`);
        process.exitCode = 1;
    }
}

module.exports = {initialGame, openingPosition, runGame, runTournament};
