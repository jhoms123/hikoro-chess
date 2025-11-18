/**
 * botWorkerGo.js
 *
 * A Web Worker to run the advanced MCTS/PUCT bot.
 * This file is the new entry point and REPLACES the old botWorkerGo.js.
 * It imports the monolithic 'goGameLogic.js' which contains ALL
 * game and bot logic ported from C#.
 */

// Load the new, advanced logic
try {
    // This file now contains:
    // - GameState (from GameState.cs)
    // - MctsNode, BotManager (from BotLogic.cs)
    // - Move (from MoveDefinition.cs)
    // - MctsHelpers (from Heuristic/Pattern managers)
    importScripts('goGameLogic.js');
} catch (e) {
    console.error("Failed to import goGameLogic.js. Bot will not work.", e);
    postMessage({ error: "Failed to load goGameLogic.js" });
}

/**
 * Main Worker Message Handler
 * This is the "main" function that receives data from your UI thread.
 */
self.onmessage = function(e) {
    // We now expect a much larger data object from the main thread
    const {
        gameStateJSON,   // The current GameState, as a simple object
        botConfig,       // The BotConfig { PuctC, ScoreScalingFactor }
        timeLimitMs,     // e.g., 500
        boardHistoryJSON,// A simple object: { [stateKey]: count }
        moveHistoryJSON, // An array of simple Move objects
        openingBookJSON, // A simple object: { [moveKey]: {blackWins, totalGames} }
        patternCatalogJSON // A simple object: { [patternKey]: moveString }
    } = e.data;

    if (!self.BotManager) {
        console.error("Bot worker received message but logic is not loaded.");
        postMessage(null); // Send back nothing
        return;
    }

    console.log("GoBot Worker: Received game state. Starting advanced MCTS...");

    try {
        // --- 1. Rehydrate Data ---
        // We must convert the plain JSON objects back into our classes
        // and Maps for the bot logic to use.

        // Rehydrate GameState
        const currentState = new GameState(gameStateJSON.boardSize);
        currentState.board = gameStateJSON.board; // Assumes deep copy
        currentState.currentPlayer = gameStateJSON.currentPlayer;
        currentState.pendingChainCapture = gameStateJSON.pendingChainCapture;
        currentState.blackPiecesLost = gameStateJSON.blackPiecesLost;
        currentState.whitePiecesLost = gameStateJSON.whitePiecesLost;
        currentState.lastMove = gameStateJSON.lastMove;
        currentState.turn = gameStateJSON.turn;
        currentState.blackStonesRemaining = gameStateJSON.blackStonesRemaining;
        currentState.whiteStonesRemaining = gameStateJSON.whiteStonesRemaining;

        // Rehydrate Move History (convert plain objects to Move class instances)
        const moveHistory = moveHistoryJSON.map(m => new Move(m.type, m.at, m.from, m.moveType));
        
        // Rehydrate Maps
        const boardHistory = new Map(Object.entries(boardHistoryJSON));
        const openingBook = new Map(Object.entries(openingBookJSON));
        const patternCatalog = new Map(Object.entries(patternCatalogJSON));

        // --- 2. Create Bot and Run Search ---
        const activeBot = new BotManager(botConfig);

        const botData = activeBot.findBestMove(
            currentState,
            timeLimitMs,
            boardHistory,
            openingBook,
            moveHistory,
            patternCatalog
        );

        // --- 3. Post Result ---
        // Post the *full* data object back, as the C# code did.
        // The main thread can use botData.move for the game,
        // and botData.policy/totalVisits for logging.
        // We send a plain object, as class instances can't be posted.
        postMessage({
            move: {
                type: botData.move.type,
                at: botData.move.at,
                from: botData.move.from,
                moveType: botData.move.moveType
            },
            policy: botData.policy,
            totalVisits: botData.totalVisits
        });

    } catch (err) {
        console.error("GoBot Worker: MCTS failed with error:", err);
        // Default to passing if an error occurs
        postMessage({
            move: { type: 'pass', at: null, from: null, moveType: null },
            policy: { "pass": 1.0 },
            totalVisits: 0
        });
    }
};