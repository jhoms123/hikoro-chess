importScripts('/shavari-city-battle-engine.js?v=20261015-city-stacks-hanzi-v1', '/shavari-city-battle-bot.js?v=20261015-city-bot-v1');

self.onmessage = event => {
    const { id, setup, journal, cursor, ms } = event.data || {};
    try {
        const bot = ShavariCityBattleBot.create(setup);
        const result = bot.choose(journal, cursor, ms);
        self.postMessage({ id, ...result });
    } catch (error) {
        self.postMessage({ id, error: error?.message || 'The Shavari bot could not calculate a move.' });
    }
};
