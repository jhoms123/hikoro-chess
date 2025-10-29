/**
 * botWorkerGo.js
 *
 * A Web Worker to run a Monte Carlo Tree Search (MCTS) bot
 * for the Go Variant game.
 */

// Import the game logic. This file MUST be accessible to the worker.
try {
    importScripts('goGameLogic.js');
} catch (e) {
    console.error("Failed to import goGameLogic.js. Bot will not work.", e);
    // Post a message back to indicate failure
    postMessage({ error: "Failed to load goGameLogic.js" });
}

// MCTS Parameters
const ITERATIONS = 3000; // ~2-3 seconds of thinking. Increase for stronger bot, decrease for faster moves.
const MAX_SIMULATION_DEPTH = 60; // How many moves deep to simulate in a random game.
const UCB1_CONSTANT = Math.sqrt(2); // Exploration constant for MCTS selection.

/**
 * Represents a node in the Monte Carlo Search Tree.
 */
class Node {
    constructor(state, parent = null, move = null) {
        this.state = state; // The full 'game' object state
        this.parent = parent;
        this.move = move;   // The move that led to this state
        this.children = [];
        this.wins = 0;
        this.visits = 0;
        this.untriedMoves = null; // Will be populated by getAllPossibleMoves
    }

    /**
     * Lazily get all valid moves for this node's state.
     */
    getUntriedMoves() {
        if (this.untriedMoves === null) {
            this.untriedMoves = getAllPossibleMoves(this.state);
        }
        return this.untriedMoves;
    }

    /**
     * Selects the best child node using the UCB1 formula.
     */
    selectChild() {
        let bestScore = -Infinity;
        let bestChild = null;

        for (const child of this.children) {
            if (child.visits === 0) {
                // If a child hasn't been visited, it's the top priority
                return child;
            }
            // UCB1 formula
            const score = (child.wins / child.visits) +
                          UCB1_CONSTANT * Math.sqrt(Math.log(this.visits) / child.visits);
            
            if (score > bestScore) {
                bestScore = score;
                bestChild = child;
            }
        }
        return bestChild;
    }

    /**
     * Expands the tree by creating a new child node from an untried move.
     */
    expand() {
        const moves = this.getUntriedMoves();
        if (moves.length === 0) {
            // This is a terminal node (no moves possible)
            return null;
        }

        // Pop a move to try
        const move = moves.pop();
        const playerColor = this.state.isWhiteTurn ? 'white' : 'black';

        // Simulate the move using the imported game logic
        const result = goGameLogic.makeGoMove(this.state, move, playerColor);

        if (!result.success) {
            // This move was illegal (e.g., suicide), try expanding again
            return this.expand();
        }

        const newState = result.updatedGame;
        const childNode = new Node(newState, this, move);
        this.children.push(childNode);
        return childNode;
    }
}

/**
 * Main MCTS function.
 */
function runMCTS(rootState) {
    const rootNode = new Node(rootState);
    const botPlayer = rootState.isWhiteTurn ? 2 : 1; // 1 for Black, 2 for White

    for (let i = 0; i < ITERATIONS; i++) {
        let node = rootNode;
        let stateToSimulate = rootNode.state;

        // 1. Selection
        // Traverse down the tree, picking the best child (UCB1)
        // until we find a leaf node or a node with untried moves.
        while (node.getUntriedMoves().length === 0 && node.children.length > 0) {
            node = node.selectChild();
            stateToSimulate = node.state;
        }

        // 2. Expansion
        // If the node has untried moves, expand it by one child.
        if (node.getUntriedMoves().length > 0) {
            const newNode = node.expand();
            if (newNode) {
                node = newNode; // Move to the new node
                stateToSimulate = newNode.state;
            }
            // If expand returns null, it's a terminal node, just simulate from `node`
        }

        // 3. Simulation (Rollout)
        // Play a random game from the new node's state to a terminal condition.
        const result = simulateRandomGame(stateToSimulate, botPlayer);

        // 4. Backpropagation
        // Update wins/visits from the simulated node back up to the root.
        while (node) {
            node.visits++;
            // The result is from the perspective of botPlayer
            // If the current node's *parent* was the bot's turn, this node is an
            // opponent's move, so we invert the result.
            if (node.parent && node.parent.state.isWhiteTurn !== stateToSimulate.isWhiteTurn) {
                // This check is slightly complex. Let's simplify:
                // `result` is 1 if `botPlayer` won, -1 if they lost.
                // The `wins` for a node should reflect the wins for the player *who made the move to get to that node*.
                // The player who moved to `node` is `!node.state.isWhiteTurn`.
                const nodePlayer = node.state.isWhiteTurn ? 1 : 2; // Player *whose turn it is* at this node
                const parentPlayer = node.parent ? (node.parent.state.isWhiteTurn ? 2 : 1) : null; // Player *who just moved*

                if (parentPlayer === botPlayer) {
                    // Bot made this move. A bot win (1) is a win for this node.
                    if (result === 1) node.wins++;
                } else {
                    // Opponent made this move. A bot loss (-1) is a "win" for this node.
                    if (result === -1) node.wins++;
                }
                // A draw (0) counts as 0.5 wins for both.
                if (result === 0) node.wins += 0.5;

            } else {
                 // Root node or complex case, simple update
                 if (result === 1) node.wins++;
                 if (result === 0) node.wins += 0.5;
            }
            
            node = node.parent; // Move up the tree
        }
    }

    // After all iterations, pick the child with the most visits.
    let bestChild = null;
    let maxVisits = -1;
    for (const child of rootNode.children) {
        if (child.visits > maxVisits) {
            maxVisits = child.visits;
            bestChild = child;
        }
    }

    return bestChild;
}

/**
 * Simulates a random game (rollout) from a given state.
 * Returns 1 if botPlayer wins, -1 if they lose, 0 for a draw.
 */
function simulateRandomGame(state, botPlayer) {
    let currentState = JSON.parse(JSON.stringify(state)); // Deep copy
    let passCount = 0;

    for (let d = 0; d < MAX_SIMULATION_DEPTH; d++) {
        const allMoves = getAllPossibleMoves(currentState);
        
        if (allMoves.length === 0) {
            break; // No moves possible (game over)
        }

        const randomMove = allMoves[Math.floor(Math.random() * allMoves.length)];

        if (randomMove.type === 'pass') {
            passCount++;
        } else {
            passCount = 0;
        }

        if (passCount === 2) {
            break; // Game over by two consecutive passes
        }

        const playerColor = currentState.isWhiteTurn ? 'white' : 'black';
        const result = goGameLogic.makeGoMove(currentState, randomMove, playerColor);

        if (result.success) {
            currentState = result.updatedGame;
            // If it was a chain capture, reset pass count
            if (currentState.pendingChainCapture) {
                passCount = 0;
            }
        }
        // If !result.success (e.g., illegal suicide), the loop continues
        // and will try a *different* random move from the *same* state.
    }

    // Simulation over. Calculate score.
    const score = goGameLogic.calculateScore(
        currentState.boardState,
        currentState.blackPiecesLost,
        currentState.whitePiecesLost
    );
    
    const botScore = (botPlayer === 1) ? score.black : score.white;
    const oppScore = (botPlayer === 1) ? score.white : score.black;

    if (botScore > oppScore) return 1;
    if (botScore < oppScore) return -1;
    return 0; // Draw
}

/**
 * Gets ALL possible legal moves from a given game state.
 * This is the most critical function for this specific game variant.
 */
function getAllPossibleMoves(gameState) {
    // structuredClone is faster than JSON.parse(stringify) if available
    const state = typeof structuredClone === 'function' 
        ? structuredClone(gameState) 
        : JSON.parse(JSON.stringify(gameState));

    const boardSize = state.boardState.length;
    const player = state.isWhiteTurn ? 2 : 1;
    const moves = [];

    // --- 1. Handle Pending Chain Captures ---
    if (state.pendingChainCapture) {
        // If a chain is pending, ONLY jump moves from that piece are allowed.
        const chainMoves = goGameLogic.getValidMoves(state, state.pendingChainCapture);
        
        for (const move of chainMoves) {
            moves.push({
                type: 'move',
                from: state.pendingChainCapture,
                to: { x: move.x, y: move.y }
            });
        }
        // *Always* allow passing to end a chain capture
        moves.push({ type: 'pass' });
        return moves;
    }

    // --- 2. No Chain Capture: Find all moves ---
    moves.push({ type: 'pass' }); // Passing is always an option

    for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
            const piece = state.boardState[y][x];

            if (piece === 0) {
                // --- A. Place Moves ---
                // Add placing a stone on any empty square as a possible move.
                // The simulation/expansion phase will handle validation (e.g., suicide).
                moves.push({ type: 'place', to: { x, y } });

            } else if (piece === player) {
                // --- B. Normal Stone Moves (Shield or Jump) ---
                
                // B1: Turn to Shield
                moves.push({ type: 'shield', at: { x, y } });

                // B2: Jumps (getValidMoves only returns jumps for normal stones)
                const jumpMoves = goGameLogic.getValidMoves(state, { x, y });
                for (const move of jumpMoves) {
                    moves.push({
                        type: 'move',
                        from: { x, y },
                        to: { x: move.x, y: move.y }
                    });
                }
            } else if (piece === player + 2) {
                // --- C. Shield Stone Moves (Move 1 square) ---
                // (getValidMoves only returns 1-sq moves for shields)
                const moveMoves = goGameLogic.getValidMoves(state, { x, y });
                for (const move of moveMoves) {
                    moves.push({
                        type: 'move',
                        from: { x, y },
                        to: { x: move.x, y: move.y }
                    });
                }
            }
        }
    }
    return moves;
}


// --- Worker Main Message Handler ---
self.onmessage = function(e) {
    const { gameState } = e.data;

    if (!goGameLogic) {
        console.error("Bot worker received message but goGameLogic is not loaded.");
        postMessage(null); // Send back nothing
        return;
    }

    console.log("GoBot Worker: Received game state. Starting MCTS...");
    
    // Run the MCTS to find the best move
    const bestNode = runMCTS(gameState);

    if (bestNode && bestNode.move) {
        console.log("GoBot Worker: MCTS complete. Best move:", bestNode.move, "Visits:", bestNode.visits, "Win%:", (bestNode.wins / bestNode.visits * 100).toFixed(1));
        postMessage(bestNode.move);
    } else {
        console.log("GoBot Worker: MCTS found no valid moves. Passing.");
        postMessage({ type: 'pass' }); // Default to passing if no move is found
    }
};