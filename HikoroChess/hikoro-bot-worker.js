/* Server-side Hikoro search worker. Persistent workers retain search knowledge
 * for the same local match while keeping all search work off the event loop. */
const {parentPort, workerData} = require('node:worker_threads');
const Bot = require('./hikoro-bot');

function findMove(game, budgetValue, searchSessionId) {
    const budgetMs = Math.max(500, Math.min(4000, Number(budgetValue) || 1000));
    const width = Math.min(24, Math.max(10, Math.round(8 + budgetMs / 500)));
    const rootWidth = Math.min(24, Math.max(12, Math.round(10 + budgetMs / 500)));
    const searchStats = {};
    const move = Bot.chooseMove(game, {
        budgetMs,
        width,
        rootWidth,
        maxDepth: 14,
        quiescenceDepth: 1,
        searchSessionId,
        searchStats
    });
    return {move, searchStats};
}

function sendResult(message) {
    try {
        const result = findMove(message.game, message.budgetMs, message.searchSessionId || workerData?.searchSessionId);
        parentPort.postMessage(result);
    } catch (error) {
        parentPort.postMessage({error: String(error?.stack || error)});
    }
}

if (workerData?.persistent) {
    parentPort.on('message', sendResult);
} else {
    const result = findMove(workerData.game, workerData.budgetMs, workerData.searchSessionId);
    parentPort.postMessage(result);
}
