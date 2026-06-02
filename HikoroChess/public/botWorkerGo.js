/**
 * botWorkerGo.js
 * A Web Worker to run a Monte Carlo Tree Search (MCTS) bot for the Go Varianta
 */

try {
    importScripts('goGameLogic.js');
} catch (e) {
    console.error("Failed to import goGameLogic.js", e);
    postMessage({ error: "Failed to load goGameLogic.js" });
}

// MCTS Parameters
const ITERATIONS = 3500; // Increased slightly for better depth
const MAX_SIMULATION_DEPTH = 80;
const UCB1_CONSTANT = Math.sqrt(2);

class Node {
    constructor(state, parent = null, move = null) {
        this.state = state; 
        this.parent = parent;
        this.move = move;   
        this.children = [];
        this.wins = 0;
        this.visits = 0;
        this.untriedMoves = null; 
    }

    getUntriedMoves() {
        if (this.untriedMoves === null) {
            this.untriedMoves = getAllPossibleMoves(this.state);
        }
        return this.untriedMoves;
    }

    selectChild() {
        let bestScore = -Infinity;
        let bestChild = null;

        for (const child of this.children) {
            if (child.visits === 0) return child;

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

    expand() {
        const moves = this.getUntriedMoves();
        if (moves.length === 0) return null; // Terminal

        const move = moves.pop(); 
        const playerColor = this.state.isWhiteTurn ? 'white' : 'black';

        // Deep copy state
        const stateCopy = structuredClone(this.state);

        const result = goGameLogic.makeGoMove(stateCopy, move, playerColor);

        if (!result.success) {
            // Move failed (e.g. suicide rule), skip and try next expansion next time
            return null; 
        }

        const childNode = new Node(result.updatedGame, this, move);
        this.children.push(childNode);
        return childNode;
    }
}

function runMCTS(rootState) {
    const rootNode = new Node(rootState);
    const botPlayer = rootState.isWhiteTurn ? 2 : 1; 

    for (let i = 0; i < ITERATIONS; i++) {
        let node = rootNode;
        let stateToSimulate = rootNode.state;

        // 1. Selection
        while (node.getUntriedMoves().length === 0 && node.children.length > 0) {
            node = node.selectChild();
            stateToSimulate = node.state;
        }

        // 2. Expansion
        if (node.getUntriedMoves().length > 0) {
            const newNode = node.expand();
            if (newNode) {
                node = newNode;
                stateToSimulate = newNode.state;
            }
        }

        // 3. Simulation
        const result = simulateRandomGame(stateToSimulate, botPlayer);

        // 4. Backpropagation
        while (node) {
            node.visits++;
            // Logic: If the node's parent (who made the move) is the bot, 
            // and the bot won, that's good.
            const nodePlayer = node.state.isWhiteTurn ? 1 : 2; // Player to move at this node
            const parentPlayer = node.parent ? (node.parent.state.isWhiteTurn ? 2 : 1) : null; 

            if (parentPlayer === botPlayer) {
                if (result === 1) node.wins++;
            } else {
                if (result === -1) node.wins++; // Opponent lost, good for bot
            }
            if (result === 0) node.wins += 0.5;
            
            node = node.parent;
        }
    }

    // Select best move (highest visits)
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

function simulateRandomGame(state, botPlayer) {
    let currentState = structuredClone(state);
    let passCount = 0;

    for (let d = 0; d < MAX_SIMULATION_DEPTH; d++) {
        const allMoves = getAllPossibleMoves(currentState);
        
        if (allMoves.length === 0) break; 

        const randomMove = allMoves[Math.floor(Math.random() * allMoves.length)];

        if (randomMove.type === 'pass') passCount++;
        else passCount = 0;

        if (passCount >= 2) break; 

        const playerColor = currentState.isWhiteTurn ? 'white' : 'black';
        const result = goGameLogic.makeGoMove(currentState, randomMove, playerColor);

        if (result.success) {
            currentState = result.updatedGame;
            // Reset pass count if chain capture occurs (technically turn didn't end)
            if (currentState.pendingChainCapture || currentState.mustShieldAt) {
                passCount = 0;
            }
        }
    }

    const score = goGameLogic.calculateScore(
        currentState.boardState,
        currentState.blackPiecesLost,
        currentState.whitePiecesLost
    );
    
    const botScore = (botPlayer === 1) ? score.black : score.white;
    const oppScore = (botPlayer === 1) ? score.white : score.black;

    if (botScore > oppScore) return 1;
    if (botScore < oppScore) return -1;
    return 0;
}

/**
 * Returns all legally valid moves based on strict game state.
 */
function getAllPossibleMoves(gameState) {
    // 1. Mandatory Shield Logic
    if (gameState.mustShieldAt) {
        return [{ 
            type: 'shield', 
            at: { x: gameState.mustShieldAt.x, y: gameState.mustShieldAt.y } 
        }];
    }

    // 2. Pending Chain Logic
    if (gameState.pendingChainCapture) {
        const moves = [];
        const chainMoves = goGameLogic.getValidMoves(gameState, gameState.pendingChainCapture);
        
        // Only Jumps allowed
        for (const move of chainMoves) {
            if (move.type === 'jump') {
                moves.push({
                    type: 'move',
                    from: gameState.pendingChainCapture,
                    to: { x: move.x, y: move.y }
                });
            }
        }
        // Pass is allowed to end chain
        moves.push({ type: 'pass' });
        return moves;
    }

    // 3. Standard Turn Logic
    const moves = [];
    moves.push({ type: 'pass' }); 

    const boardSize = gameState.boardState.length;
    const player = gameState.isWhiteTurn ? 2 : 1;

    for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
            const piece = gameState.boardState[y][x];

            if (piece === 0) {
                // Place Stone
                moves.push({ type: 'place', to: { x, y } });
            } else if (piece === player) {
                // Move Normal Stone (Jump only)
                const validMoves = goGameLogic.getValidMoves(gameState, {x, y});
                for (const move of validMoves) {
                    moves.push({
                        type: 'move',
                        from: { x, y },
                        to: { x: move.x, y: move.y }
                    });
                }
                // NOTE: Voluntary "Turn to Shield" is NOT allowed in standard rules
                // unless triggered by capture, which handles itself via 'mustShieldAt'.
            } else if (piece === player + 2) {
                // Move Shield Stone (1 step)
                const validMoves = goGameLogic.getValidMoves(gameState, {x, y});
                for (const move of validMoves) {
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

self.onmessage = function(e) {
    const { gameState } = e.data;

    if (!goGameLogic) {
        postMessage({ error: "Game logic not loaded" });
        return;
    }

    //console.log("GoBot: Thinking...");
    const bestNode = runMCTS(gameState);

    if (bestNode && bestNode.move) {
        //console.log("GoBot: Move found", bestNode.move);
        postMessage(bestNode.move);
    } else {
        postMessage({ type: 'pass' });
    }
};