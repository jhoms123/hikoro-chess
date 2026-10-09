/* Keeps Shield Go search off the UI thread during local bot matches. */
'use strict';

importScripts('go-engine.js', 'go-bot.js');

self.onmessage = event => {
  const request = event.data || {};
  try {
    const result = GoVariantBot.analyze(request.state, request.options || {});
    self.postMessage({ ticket: request.ticket, action: result.action, stats: result.stats });
  } catch (error) {
    self.postMessage({ ticket: request.ticket, error: error && error.message ? error.message : String(error) });
  }
};
