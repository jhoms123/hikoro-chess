importScripts('/shavari-city-battle-engine.js?v=20261015-rank-captures-v1', '/shavari-city-battle-bot.js?v=20261015-general-threat-v4');

let bot = null;

self.onmessage = event => {
    const { id, setup, journal, cursor, state, ms } = event.data || {};
    try {
        if (!bot) bot = ShavariCityBattleBot.create(setup);
        const result = bot.choose(journal, cursor, ms, state);
        self.postMessage({ id, ...result });
    } catch (error) {
        self.postMessage({ id, error: error?.message || 'The Shavari bot could not calculate a move.' });
    }
};
