importScripts('/shodansho-bot-core.js?v=20261009-v135-local');
self.onmessage = event => { const { id, state, budget = 900, width = 10 } = event.data || {}; try { self.postMessage({ id, result: globalThis.searchServerBot(state, budget, width) }); } catch (error) { self.postMessage({ id, error: error.stack || error.message }); } };
