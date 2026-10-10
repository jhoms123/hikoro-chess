#!/usr/bin/env node
// Paired Hikoro bot match runner. Example:
// node tests/hikoro-bot-tournament.js ./tests/fixtures/old-bot.js ./hikoro-bot.js --games 20 --budget-ms 500
const path = require('node:path');
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

function runGame(whiteBot, blackBot, start, budgetMs, maxActions) {
    let game = structuredClone(start), actions = 0;
    const engineStats = {white: {moves: 0, milliseconds: 0, nodes: 0}, black: {moves: 0, milliseconds: 0, nodes: 0}};
    while (!game.gameOver && actions < maxActions) {
        const color = game.isWhiteTurn ? 'white' : 'black';
        const engine = color === 'white' ? whiteBot : blackBot;
        const stats = {};
        const started = Date.now();
        const width = Math.max(10, Math.min(24, Math.round(8 + budgetMs / 500)));
        const rootWidth = Math.max(12, Math.min(24, Math.round(10 + budgetMs / 500)));
        const move = withoutRuleChatter(() => engine.chooseMove(game, {budgetMs, width, rootWidth, maxDepth: 14, quiescenceDepth: 1, searchStats: stats}));
        engineStats[color].moves++;
        engineStats[color].milliseconds += Date.now() - started;
        engineStats[color].nodes += stats.nodes || 0;
        if (!move) return {winner: 'draw', reason: 'no legal move', actions, engineStats};
        const result = withoutRuleChatter(() => rules.makeMove(game, move, color));
        if (!result.success) throw new Error(`Bot returned illegal ${color} move: ${JSON.stringify(move)}`);
        game = result.updatedGame;
        actions++;
    }
    if (game.gameOver) return {winner: game.winner, reason: game.reason, actions, engineStats};
    return {winner: 'draw', reason: 'action limit', actions, engineStats};
}

function runTournament(botA, botB, {games = 20, budgetMs = 500, maxActions = 160, openingActions = 4} = {}) {
    if (games < 2 || games % 2 !== 0) throw new Error('Use an even game count so each bot gets both colors.');
    const summary = {
        games, budgetMs, maxActions, openingActions,
        A: {wins: 0, losses: 0, draws: 0, whiteWins: 0, blackWins: 0},
        B: {wins: 0, losses: 0, draws: 0, whiteWins: 0, blackWins: 0},
        gamesDetail: []
    };
    for (let index = 0; index < games; index++) {
        const pair = Math.floor(index / 2);
        const aIsWhite = index % 2 === 0;
        const start = openingPosition(20261010 + pair * 7919, openingActions);
        const result = runGame(aIsWhite ? botA : botB, aIsWhite ? botB : botA, start, budgetMs, maxActions);
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
        summary.gamesDetail.push({
            game: index + 1, openingSeed: 20261010 + pair * 7919,
            AColor: botAColor, winner: winnerName, reason: result.reason,
            actions: result.actions, engineStats: result.engineStats
        });
    }
    return summary;
}

if (require.main === module) {
    try {
        const botA = loadBot(process.argv[2], defaultBot);
        const botB = loadBot(process.argv[3], defaultBot);
        const summary = runTournament(botA, botB, {
            games: Number(option('--games', 20)),
            budgetMs: Number(option('--budget-ms', 500)),
            maxActions: Number(option('--max-actions', 160)),
            openingActions: Number(option('--opening-actions', 4))
        });
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${error?.stack || error}\n`);
        process.exitCode = 1;
    }
}

module.exports = {initialGame, openingPosition, runGame, runTournament};
