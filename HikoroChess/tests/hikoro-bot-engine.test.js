const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../gamelogic');
const bot = require('../hikoro-bot');

function makeGame(pieces, options = {}) {
    const boardState = Array.from({length: rules.BOARD_HEIGHT}, () => Array(rules.BOARD_WIDTH).fill(null));
    for (const {x, y, type, color} of pieces) {
        assert.equal(rules.isPositionValid(x, y), true, `${x},${y} must be a valid Hikoro square`);
        assert.equal(boardState[y][x], null, `${x},${y} must not be occupied twice`);
        boardState[y][x] = {type, color};
    }
    const has = (color, type) => boardState.some(row => row.some(piece => piece?.color === color && piece.type === type));
    return {
        boardState,
        isWhiteTurn: options.isWhiteTurn !== false,
        turnCount: options.turnCount ?? 8,
        gameOver: false,
        whiteCaptured: structuredClone(options.whiteCaptured || []),
        blackCaptured: structuredClone(options.blackCaptured || []),
        whitePrinceOnBoard: options.whitePrinceOnBoard ?? has('white', 'prince'),
        blackPrinceOnBoard: options.blackPrinceOnBoard ?? has('black', 'prince'),
        bonusMoveInfo: options.bonusMoveInfo ? structuredClone(options.bonusMoveInfo) : null,
        moveList: [],
        actionJournal: []
    };
}

function minimalRoyalLineup(extra = [], options = {}) {
    const extraWhitePrince = extra.some(piece => piece.color === 'white' && piece.type === 'prince');
    const extraBlackPrince = extra.some(piece => piece.color === 'black' && piece.type === 'prince');
    const extraWhiteLupa = extra.some(piece => piece.color === 'white' && piece.type === 'lupa');
    const extraBlackLupa = extra.some(piece => piece.color === 'black' && piece.type === 'lupa');
    const pieces = [];
    if (!extraWhiteLupa) pieces.push({x: 4, y: 0, type: 'lupa', color: 'white'});
    if (!extraBlackLupa) pieces.push({x: 4, y: 15, type: 'lupa', color: 'black'});
    if (!extraWhitePrince && options.whitePrinceOnBoard !== false) pieces.push({x: 5, y: 0, type: 'prince', color: 'white'});
    if (!extraBlackPrince && options.blackPrinceOnBoard !== false) pieces.push({x: 5, y: 15, type: 'prince', color: 'black'});
    return makeGame([...pieces, ...extra], options);
}

test('bot takes an immediate Hikoro sanctuary win', () => {
    const game = minimalRoyalLineup([{x: 2, y: 7, type: 'prince', color: 'white'}]);
    const before = JSON.stringify(game);
    const move = bot.chooseMove(game, {budgetMs: 300});
    assert.deepEqual(move, {type: 'board', from: {x: 2, y: 7}, to: {x: 1, y: 8}});
    const applied = rules.makeMove(game, move, 'white');
    assert.equal(applied.success, true);
    assert.equal(applied.updatedGame.gameOver, true);
    assert.equal(applied.updatedGame.winner, 'white');
    assert.equal(JSON.stringify(game), before, 'search must leave the source position unchanged');
});

test('bot prevents an opponent prince from winning on its next move', () => {
    const game = minimalRoyalLineup([
        {x: 1, y: 9, type: 'zur', color: 'white'},
        {x: 0, y: 9, type: 'prince', color: 'black'}
    ]);
    const move = bot.chooseMove(game, {budgetMs: 900, width: 20});
    assert.deepEqual(move, {type: 'board', from: {x: 1, y: 9}, to: {x: 0, y: 9}});
    const applied = rules.makeMove(game, move, 'white');
    assert.equal(applied.success, true);
    assert.equal(applied.updatedGame.boardState[9][0].type, 'zur');
    assert.equal(bot.legalMoves(applied.updatedGame).some(action =>
        action.from?.x === 0 && action.from?.y === 9 && action.to.x === 0 && action.to.y === 8), false);
});

test('bot sees a capture that removes the opponent\'s last royal', () => {
    const game = minimalRoyalLineup([
        {x: 1, y: 10, type: 'zur', color: 'white'},
        {x: 5, y: 10, type: 'lupa', color: 'black'}
    ], {blackPrinceOnBoard: false});
    const move = bot.chooseMove(game, {budgetMs: 300});
    assert.deepEqual(move, {type: 'board', from: {x: 1, y: 10}, to: {x: 5, y: 10}});
    const applied = rules.makeMove(game, move, 'white');
    assert.equal(applied.updatedGame.gameOver, true);
    assert.equal(applied.updatedGame.winner, 'white');
});

test('bot moves or protects its last royal when a capture would end the game', () => {
    const game = makeGame([
        {x: 4, y: 7, type: 'prince', color: 'white'},
        {x: 4, y: 10, type: 'zur', color: 'black'},
        {x: 4, y: 15, type: 'lupa', color: 'black'},
        {x: 5, y: 15, type: 'prince', color: 'black'}
    ]);
    const move = bot.chooseMove(game, {budgetMs: 600, width: 18});
    assert.ok(move);
    const applied = rules.makeMove(game, move, 'white');
    assert.equal(applied.success, true);
    assert.equal(applied.updatedGame.gameOver, false);
    const royalSquare = applied.updatedGame.boardState.flatMap((row, y) =>
        row.map((piece, x) => piece?.color === 'white' && piece.type === 'prince' ? {x, y} : null).filter(Boolean))[0];
    assert.ok(royalSquare);
    const zurMoves = rules.getValidMovesForPiece(
        applied.updatedGame.boardState[10][4], 4, 10, applied.updatedGame.boardState, false
    );
    assert.equal(zurMoves.some(target => target.x === royalSquare.x && target.y === royalSquare.y), false);
});

test('bot can drop a pilut to protect its last royal from a final capture', () => {
    const game = makeGame([
        {x: 4, y: 7, type: 'prince', color: 'white'},
        {x: 4, y: 10, type: 'zur', color: 'black'},
        {x: 4, y: 15, type: 'lupa', color: 'black'},
        {x: 5, y: 15, type: 'prince', color: 'black'}
    ], {whiteCaptured: [{type: 'pilut'}]});
    const move = bot.chooseMove(game, {budgetMs: 700, width: 16});
    assert.ok(move);
    const applied = rules.makeMove(game, move, 'white');
    assert.equal(applied.success, true);
    const blackMoves = bot.legalMoves(applied.updatedGame);
    const instantRoyalWins = blackMoves.filter(action => action.type === 'board' &&
        ['prince', 'lupa'].includes(applied.updatedGame.boardState[action.to.y][action.to.x]?.type))
        .some(action => {
            const result = rules.makeMove(applied.updatedGame, action, 'black');
            return result.success && result.updatedGame.gameOver && result.updatedGame.winner === 'black';
        });
    assert.equal(instantRoyalWins, false);
});

test('bonus action stays with the same player and cannot be replaced by a drop', () => {
    const game = minimalRoyalLineup([{x: 4, y: 6, type: 'greathorsegeneral', color: 'white'}], {
        whiteCaptured: [{type: 'chair'}]
    });
    const first = bot.legalMoves(game).find(move => move.type === 'board' && move.from.x === 4 && move.from.y === 6 &&
        !game.boardState[move.to.y][move.to.x]);
    assert.ok(first);
    const afterFirst = rules.makeMove(game, first, 'white').updatedGame;
    assert.equal(afterFirst.bonusMoveInfo.pieceX, first.to.x);
    assert.equal(afterFirst.bonusMoveInfo.pieceY, first.to.y);
    assert.equal(afterFirst.isWhiteTurn, true);

    const continuation = bot.chooseMove(afterFirst, {budgetMs: 400});
    assert.equal(continuation.type, 'board');
    assert.deepEqual(continuation.from, afterFirst.bonusMoveInfo && {
        x: afterFirst.bonusMoveInfo.pieceX, y: afterFirst.bonusMoveInfo.pieceY
    });
    const afterBonus = rules.makeMove(afterFirst, continuation, 'white');
    assert.equal(afterBonus.success, true);
    assert.equal(afterBonus.updatedGame.bonusMoveInfo, null);
    assert.equal(afterBonus.updatedGame.isWhiteTurn, false);
});

test('hand drops match the rules engine and reserve count is part of the search key', () => {
    const game = minimalRoyalLineup([], {whiteCaptured: [{type: 'chair'}, {type: 'chair'}]});
    const drops = bot.legalMoves(game).filter(move => move.type === 'drop' && move.piece.type === 'chair');
    assert.ok(drops.length > 0);
    const result = rules.makeMove(game, drops[0], 'white');
    assert.equal(result.success, true);
    assert.equal(result.updatedGame.whiteCaptured.length, 1);
    assert.equal(result.updatedGame.boardState[drops[0].to.y][drops[0].to.x].type, 'chair');
    assert.notEqual(bot.positionKey(game), bot.positionKey(result.updatedGame));
});

test('evaluation rewards promotion and a royal route toward sanctuary', () => {
    const promotion = minimalRoyalLineup([{x: 4, y: 8, type: 'sult', color: 'white'}]);
    const promote = {type: 'board', from: {x: 4, y: 8}, to: {x: 4, y: 9}};
    const after = rules.makeMove(promotion, promote, 'white').updatedGame;
    assert.equal(after.boardState[9][4].type, 'chair');
    assert.ok(bot.evaluate(after, 'white') > bot.evaluate(promotion, 'white'));

    const far = minimalRoyalLineup([{x: 4, y: 7, type: 'prince', color: 'white'}]);
    const near = minimalRoyalLineup([{x: 7, y: 7, type: 'prince', color: 'white'}]);
    assert.ok(bot.evaluate(near, 'white') > bot.evaluate(far, 'white'));
});

test('short budget always returns a move accepted by the authoritative rules', () => {
    const game = {
        boardState: rules.getInitialBoard(), isWhiteTurn: true, turnCount: 0, gameOver: false,
        whiteCaptured: [], blackCaptured: [], whitePrinceOnBoard: true, blackPrinceOnBoard: true,
        moveList: [], actionJournal: []
    };
    const stats = {};
    const move = bot.chooseMove(game, {budgetMs: 100, width: 14, searchStats: stats});
    assert.ok(move);
    assert.equal(rules.makeMove(game, move, 'white').success, true);
    assert.ok(stats.nodes > 0);
    assert.ok(stats.elapsedMs <= 120);
});
