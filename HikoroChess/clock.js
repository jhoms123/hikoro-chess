function remainingTime(game, now = Date.now()) {
    const color = game.isWhiteTurn ? 'white' : 'black';
    const elapsed = game.lastMoveTimestamp === null ? 0 : Math.max(0, (now - game.lastMoveTimestamp) / 1000);
    const main = Math.max(0, game[`${color}TimeLeft`]);
    return { color, main: Math.max(0, main - elapsed),
        display: elapsed < main ? main - elapsed : Math.max(0, game.timeControl.byoyomiTime - (elapsed - main)),
        byoyomi: elapsed >= main, expired: elapsed >= main + game.timeControl.byoyomiTime };
}
function commitClock(game, now = Date.now(), turnComplete = true) {
    if (!turnComplete || game.timeControl.main === -1 || game.lastMoveTimestamp === null) return;
    const time = remainingTime(game, now);
    game[`${time.color}TimeLeft`] = time.main;
    // A forced bonus move is part of the same turn; don't grant fresh byoyomi.
    if (turnComplete) game.lastMoveTimestamp = now;
}
module.exports = { remainingTime, commitClock };
