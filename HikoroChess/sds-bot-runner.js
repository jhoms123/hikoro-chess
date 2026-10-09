const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const { performance } = require('node:perf_hooks');

function engineState(engine) {
    return {
        playerCount: engine.playerCount,
        players: engine.players.map(player => ({
            hand: { ...player.hand },
            captured: { ...player.captured },
            eliminated: Boolean(player.eliminated)
        })),
        pieces: [...engine.pieces].map(([id, piece]) => [id, { ...piece }]),
        currentPlayer: engine.currentPlayer,
        turnNumber: engine.turnNumber,
        nextPieceId: engine.nextPieceId,
        phase: engine.phase,
        winner: engine.winner,
        ruleHistory: []
    };
}

if (!isMainThread) {
    const corePath = path.join(__dirname, 'public', 'shodansho-bot-core.js');
    const core = fs.readFileSync(corePath, 'utf8');
    if (!core.includes('globalThis.searchServerBot')) throw Error('The Sho Dan Sho v13.5.1 worker core is missing.');
    const program = new vm.Script(core, { filename: 'shodansho-bot-core.js' });
    const context = vm.createContext({ performance, postMessage() {}, onmessage: null });
    program.runInContext(context, { timeout: 15000 });
    const invoke = new vm.Script('globalThis.searchServerBot(input, budget, width)');
    parentPort.on('message', request => {
        try {
            context.input = request.state;
            context.budget = request.budget;
            context.width = request.width;
            const result = invoke.runInContext(context, {
                timeout: Math.max(2000, Math.min(20000, request.timeoutMs || 5000))
            });
            parentPort.postMessage({ id: request.id, result });
        } catch (error) {
            parentPort.postMessage({ id: request.id, error: error.stack || error.message });
        }
    });
} else {
    class SdsBotRunner {
        constructor() {
            this.worker = null;
            this.pending = new Map();
            this.nextId = 0;
        }

        startWorker() {
            if (this.worker) return;
            const worker = new Worker(__filename);
            worker.unref();
            worker.on('message', message => {
                const task = this.pending.get(message.id);
                if (!task) return;
                this.pending.delete(message.id);
                if (message.error) task.reject(Error(message.error));
                else task.resolve(message.result);
            });
            const failed = error => {
                if (this.worker !== worker) return;
                this.worker = null;
                for (const task of this.pending.values()) task.reject(error);
                this.pending.clear();
            };
            worker.on('error', failed);
            worker.on('exit', code => {
                if (code !== 0) failed(Error('Sho Dan Sho bot worker exited with code ' + code));
                else if (this.worker === worker) this.worker = null;
            });
            this.worker = worker;
        }

        search(engine, { budgetMs = 900, width = 10 } = {}) {
            this.startWorker();
            const id = ++this.nextId;
            const budget = Math.max(100, Math.min(3000, Number(budgetMs) || 900));
            return new Promise((resolve, reject) => {
                this.pending.set(id, { resolve, reject });
                this.worker.postMessage({
                    id,
                    state: engineState(engine),
                    budget,
                    width: Math.max(3, Math.min(12, Number(width) || 10)),
                    timeoutMs: budget + 2500
                });
            });
        }

        close() {
            const worker = this.worker;
            this.worker = null;
            if (worker) void worker.terminate();
            for (const task of this.pending.values()) task.reject(Error('Sho Dan Sho bot runner closed.'));
            this.pending.clear();
        }
    }

    module.exports = { createSdsBotRunner: () => new SdsBotRunner() };
}