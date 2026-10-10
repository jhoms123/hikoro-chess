/* Server-side Hikoro search: keep bot thinking off the Socket.IO event loop. */
const {parentPort, workerData} = require('node:worker_threads');
const Bot = require('./hikoro-bot');

try {
    const budgetMs = Math.max(500, Math.min(4000, Number(workerData.budgetMs) || 1000));
    const width = Math.min(24, Math.max(10, Math.round(8 + budgetMs / 500)));
    const rootWidth = Math.min(24, Math.max(12, Math.round(10 + budgetMs / 500)));
    const move = Bot.chooseMove(workerData.game, {
        budgetMs,
        width,
        rootWidth,
        maxDepth: 14,
        quiescenceDepth: 1
    });
    parentPort.postMessage({move});
} catch (error) {
    parentPort.postMessage({error: String(error?.stack || error)});
}
