importScripts('/shavari-city-battle-engine.js?v=20261015-city-bot-search-v2', '/shavari-city-battle-bot.js?v=20261015-city-bot-search-v2');

self.onmessage = event => {
    const { id, setup, journal, cursor, state, ms } = event.data || {};
    try {
        const bot = ShavariCityBattleBot.create(setup);
        const result = bot.choose(journal, cursor, ms, state);
        self.postMessage({ id, ...result });
    } catch (error) {
        self.postMessage({ id, error: error?.message || 'The Shavari bot could not calculate a move.' });
    }
};
