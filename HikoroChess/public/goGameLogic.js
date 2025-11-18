/**
 * goGameLogic.js
 *
 * MONOLITHIC PORT of the C# Go-Variant Bot.
 * This file contains the complete, high-level game logic (GameState)
 * and the MCTS/PUCT bot logic (BotManager, MctsNode).
 *
 * This file REPLACES the old, simpler goGameLogic.js.
 */

// --- C# Port: BotConfig (default values) ---
const BotConfig = {
    PuctC: 1.41,
    ScoreScalingFactor: 15.0,
};

// --- C# Port: MoveDefinition.cs ---
class Move {
    constructor(type = null, at = null, from = null, moveType = null) {
        this.type = type;     // "place", "move", "chainshield", "pass"
        this.at = at;       // {x, y} - Used for "place" and "chainshield"
        this.from = from;     // {x, y} - Used for "move"
        this.moveType = moveType; // "jump" or "move"
    }

    toString() {
        if (this.type === "pass") return "Pass";
        if (this.type === "place") return `Place at ${this.at.x},${this.at.y}`;
        if (this.type === "chainshield") return `Stop & Shield at ${this.at.x},${this.at.y}`;
        if (this.type === "move") return `Move from ${this.from.x},${this.from.y} to ${this.at.x},${this.at.y} (${this.moveType})`;
        return "Invalid Move";
    }

    // Used for logging and as a key in dictionaries/maps
    toLogFormat() {
        if (this.type === "pass") return "pass";
        if (this.type === "place") return `place;${this.at.x};${this.at.y}`;
        if (this.type === "chainshield") return `chainshield;${this.at.x};${this.at.y}`;
        if (this.type === "move") return `move;${this.from.x};${this.from.y};${this.at.x};${this.at.y};${this.moveType}`;
        return "invalid";
    }

    // Static constructors
    static Place(at) { return new Move("place", at, null, null); }
    static ChainShield(at) { return new Move("chainshield", at, null, null); }
    static CreateMove(from, to, moveType) { return new Move("move", to, from, moveType); }
    static Pass() { return new Move("pass", null, null, null); }
}

// --- C# Port: GameState.cs ---
class GameState {
    // --- C# Constants ---
    static Empty = 0;
    static Black = 1;
    static White = 2;
    static BlackShield = 3;
    static WhiteShield = 4;
    static MaxStones = 100;
    static Komi = 4.0;
    static EdgePenalty = 2.0;
    static ShieldValue = 1.5;
    static AliveGroupBonus = 2.0;
    static UnsettledGroupBonus = 1.0;
    static DeadGroupPenalty = 0.1;
    static InfluenceBonus = 0.2;
    static SemeaiBonus = 10.0;

    constructor(boardSize = 9) {
        this.boardSize = boardSize;
        this.board = Array(boardSize).fill(0).map(() => Array(boardSize).fill(GameState.Empty));
        this.currentPlayer = GameState.Black;
        this.pendingChainCapture = null; // {x, y}
        this.blackPiecesLost = 0;
        this.whitePiecesLost = 0;
        this.lastMove = null; // {x, y}
        this.turn = 0;
        this.blackStonesRemaining = GameState.MaxStones;
        this.whiteStonesRemaining = GameState.MaxStones;
    }

    /**
     * Creates a deep clone of the game state.
     */
    clone() {
        const newState = new GameState(this.boardSize);
        // Deep copy the board
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                newState.board[y][x] = this.board[y][x];
            }
        }
        newState.currentPlayer = this.currentPlayer;
        newState.pendingChainCapture = this.pendingChainCapture ? { ...this.pendingChainCapture } : null;
        newState.blackPiecesLost = this.blackPiecesLost;
        newState.whitePiecesLost = this.whitePiecesLost;
        newState.lastMove = this.lastMove ? { ...this.lastMove } : null;
        newState.turn = this.turn;
        newState.blackStonesRemaining = this.blackStonesRemaining;
        newState.whiteStonesRemaining = this.whiteStonesRemaining;
        return newState;
    }

    /**
     * Generates a unique string key for the current board state and player.
     * Used for transposition and repetition tables.
     */
    getStateKey() {
        // A simple string builder
        let key = "";
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                key += this.board[y][x];
            }
        }
        key += this.currentPlayer;
        return key;
    }

    makeMove(move) {
        let isChain = false;
        let moveLandedAt = null;

        const hasStones = (this.currentPlayer === GameState.Black) ? this.blackStonesRemaining > 0 : this.whiteStonesRemaining > 0;
        if (move.type === "place" && !hasStones) {
            return false;
        }

        switch (move.type) {
            case "place":
                if (this.board[move.at.y][move.at.x] !== GameState.Empty) return false;
                this.board[move.at.y][move.at.x] = this.currentPlayer;
                if (!this.processCapturesAndSuicide(move.at)) {
                    this.board[move.at.y][move.at.x] = GameState.Empty; // Revert suicide
                    return false;
                }
                moveLandedAt = move.at;
                if (this.currentPlayer === GameState.Black) this.blackStonesRemaining--;
                else this.whiteStonesRemaining--;
                break;

            case "move":
                const piece = this.board[move.from.y][move.from.x];
                if (move.moveType === "jump") {
                    const midX = move.from.x + (move.at.x - move.from.x) / 2;
                    const midY = move.from.y + (move.at.y - move.from.y) / 2;
                    const jumpedState = this.board[midY][midX];
                    this.board[midY][midX] = GameState.Empty;
                    if (jumpedState === GameState.Black || jumpedState === GameState.BlackShield) this.blackPiecesLost++;
                    else if (jumpedState === GameState.White || jumpedState === GameState.WhiteShield) this.whitePiecesLost++;
                }
                this.board[move.from.y][move.from.x] = GameState.Empty;
                this.board[move.at.y][move.at.x] = piece;

                if (!this.processCapturesAndSuicide(move.at)) {
                    this.board[move.from.y][move.from.x] = piece; // Revert
                    this.board[move.at.y][move.at.x] = GameState.Empty;
                    return false;
                }
                moveLandedAt = move.at;

                if (move.moveType === "jump") {
                    const newJumps = this.getValidMovesForGoPiece(move.at, piece)
                        .filter(m => m.moveType === "jump");
                    if (newJumps.length > 0) {
                        isChain = true;
                        this.pendingChainCapture = move.at;
                    } else {
                        this.board[move.at.y][move.at.x] = (piece === GameState.Black) ? GameState.BlackShield : GameState.WhiteShield;
                        isChain = false;
                    }
                } else {
                    isChain = false;
                }
                break;

            case "chainshield":
                if (!this.pendingChainCapture || move.at.x !== this.pendingChainCapture.x || move.at.y !== this.pendingChainCapture.y) {
                    return false;
                }
                const currentPiece = this.board[move.at.y][move.at.x];
                this.board[move.at.y][move.at.x] = (currentPiece === GameState.Black) ? GameState.BlackShield : GameState.WhiteShield;
                moveLandedAt = move.at;
                isChain = false;
                break;

            case "pass":
                break;
        }

        if (!isChain) {
            this.currentPlayer = (this.currentPlayer === GameState.Black) ? GameState.White : GameState.Black;
            this.pendingChainCapture = null;
            this.turn++;
        }
        this.lastMove = moveLandedAt;
        return true;
    }

    getAllPossibleMoves() {
        const moves = [];
        if (this.pendingChainCapture) {
            const p = this.pendingChainCapture;
            const piece = this.board[p.y][p.x];
            moves.push(...this.getValidMovesForGoPiece(p, piece).filter(m => m.moveType === "jump"));
            moves.push(Move.ChainShield(p));
            return moves;
        }

        const hasStones = (this.currentPlayer === GameState.Black) ? this.blackStonesRemaining > 0 : this.whiteStonesRemaining > 0;

        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                const piece = this.board[y][x];
                const at = { x, y };
                if (piece === GameState.Empty && hasStones) {
                    moves.push(Move.Place(at));
                } else if (piece === this.currentPlayer || piece === this.currentPlayer + 2) {
                    moves.push(...this.getValidMovesForGoPiece(at, piece));
                }
            }
        }
        moves.push(Move.Pass());
        return moves;
    }

    getValidMovesForGoPiece(p, piece) {
        const validMoves = [];
        const player = (piece === GameState.Black || piece === GameState.BlackShield) ? GameState.Black : GameState.White;
        const enemyPlayer = (player === GameState.Black) ? GameState.White : GameState.Black;

        if (piece === player) { // Normal Stone
            const jumps = [{ x: 0, y: -2 }, { x: 0, y: 2 }, { x: -2, y: 0 }, { x: 2, y: 0 }];
            for (const jump of jumps) {
                const land = { x: p.x + jump.x, y: p.y + jump.y };
                const mid = { x: p.x + jump.x / 2, y: p.y + jump.y / 2 };
                if (this.isValid(land) && this.board[land.y][land.x] === GameState.Empty) {
                    if (this.isValid(mid) && this.board[mid.y][mid.x] === enemyPlayer) {
                        validMoves.push(Move.CreateMove(p, land, "jump"));
                    }
                }
            }
        } else if (piece === player + 2) { // Shield Stone
            const potentialMoves = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
            for (const moveOffset of potentialMoves) {
                const land = { x: p.x + moveOffset.x, y: p.y + moveOffset.y };
                if (this.isValid(land) && this.board[land.y][land.x] === GameState.Empty) {
                    validMoves.push(Move.CreateMove(p, land, "move"));
                }
            }
        }
        return validMoves;
    }

    processCapturesAndSuicide(p) {
        const playerType = this.board[p.y][p.x];
        if (playerType === GameState.Empty) return true;
        const isBlackTeam = (playerType === GameState.Black || playerType === GameState.BlackShield);
        let capturedStones = false;

        for (const n of this.getNeighbors(p)) {
            const state = this.board[n.y][n.x];
            if (state > GameState.Empty) {
                const isNeighborBlackTeam = (state === GameState.Black || state === GameState.BlackShield);
                if (isBlackTeam !== isNeighborBlackTeam) {
                    const group = this.findGroup(n);
                    if (group && group.liberties.size === 0) {
                        capturedStones = true;
                        const isCapturedBlack = (state === GameState.Black || state === GameState.BlackShield);
                        for (const stone of group.stones) {
                            this.board[stone.y][stone.x] = GameState.Empty;
                            if (isCapturedBlack) this.blackPiecesLost++; else this.whitePiecesLost++;
                        }
                    }
                }
            }
        }

        const myGroup = this.findGroup(p);
        return !(myGroup && myGroup.liberties.size === 0 && !capturedStones);
    }

    findGroup(start) {
        const pieceType = this.board[start.y][start.x];
        if (pieceType === GameState.Empty) return null;
        const isBlackTeam = (pieceType === GameState.Black || pieceType === GameState.BlackShield);
        const player = isBlackTeam ? GameState.Black : GameState.White;

        const queue = [start];
        // JS Sets don't handle object identity well. Use string keys.
        const visited = new Set([`${start.x},${start.y}`]);
        const stones = [];
        const liberties = new Set(); // Use string keys "x,y"

        while (queue.length > 0) {
            const p = queue.shift();
            stones.push(p);

            for (const n of this.getNeighbors(p)) {
                const key = `${n.x},${n.y}`;
                if (visited.has(key)) continue;
                const state = this.board[n.y][n.x];

                if (state === GameState.Empty) {
                    liberties.add(key);
                } else {
                    const isNeighborBlackTeam = (state === GameState.Black || state === GameState.BlackShield);
                    if (isBlackTeam === isNeighborBlackTeam) {
                        visited.add(key);
                        queue.push(n);
                    }
                }
            }
        }
        return { stones, liberties, player };
    }

    getNeighbors(p) {
        const neighbors = [];
        if (this.isValidPos(p.x, p.y - 1)) neighbors.push({ x: p.x, y: p.y - 1 });
        if (this.isValidPos(p.x, p.y + 1)) neighbors.push({ x: p.x, y: p.y + 1 });
        if (this.isValidPos(p.x - 1, p.y)) neighbors.push({ x: p.x - 1, y: p.y });
        if (this.isValidPos(p.x + 1, p.y)) neighbors.push({ x: p.x + 1, y: p.y });
        return neighbors;
    }

    isValid(p) { return p.x >= 0 && p.x < this.boardSize && p.y >= 0 && p.y < this.boardSize; }
    isValidPos(x, y) { return x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize; }

    isGameOver() {
        return this.turn > (this.boardSize * this.boardSize) * 1.5 ||
            this.blackStonesRemaining === 0 ||
            this.whiteStonesRemaining === 0;
    }

    countEyes(group) {
        let eyeCount = 0;
        if (!group) return 0;
        for (const libertyKey of group.liberties) {
            const [x, y] = libertyKey.split(',').map(Number);
            const libertyPos = { x, y };
            let isRealEye = true;
            for (const neighbor of this.getNeighbors(libertyPos)) {
                const piece = this.board[neighbor.y][neighbor.x];
                if (piece !== group.player && piece !== (group.player + 2)) {
                    isRealEye = false;
                    break;
                }
            }
            if (isRealEye) {
                eyeCount++;
            }
        }
        return eyeCount;
    }

    getPlayoutScore() {
        let blackScore = 0, whiteScore = 0;
        whiteScore += GameState.Komi;
        blackScore += this.whitePiecesLost;
        whiteScore += this.blackPiecesLost;

        const visitedGroups = new Set(); // Use string keys "x,y"
        const visitedEmpty = new Set(); // Use string keys "x,y"
        const unsettledGroups = [];

        // Part 1: Value Groups (Life and Death)
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                const p = { x, y };
                const key = `${x},${y}`;
                if (visitedGroups.has(key)) continue;
                const piece = this.board[y][x];
                if (piece === GameState.Empty) continue;

                const group = this.findGroup(p);
                if (!group) continue;

                group.stones.forEach(stone => visitedGroups.add(`${stone.x},${stone.y}`));
                const eyeCount = this.countEyes(group);
                let groupValue = 0;
                const basePieceValue = (piece === GameState.BlackShield || piece === GameState.WhiteShield) ? GameState.ShieldValue : 1.0;

                if (eyeCount >= 2) {
                    groupValue = (group.stones.length * basePieceValue) * GameState.AliveGroupBonus;
                } else if (eyeCount === 1) {
                    groupValue = (group.stones.length * basePieceValue) * GameState.UnsettledGroupBonus;
                    unsettledGroups.push(group);
                } else { // eyeCount == 0
                    if (group.liberties.size < 3) {
                        groupValue = (group.stones.length * basePieceValue) * GameState.DeadGroupPenalty;
                    } else {
                        groupValue = (group.stones.length * basePieceValue) * GameState.UnsettledGroupBonus;
                    }
                    unsettledGroups.push(group);
                }

                let edgePenalty = 0;
                group.stones.forEach(stone => {
                    if (stone.x === 0 || stone.x === (this.boardSize - 1) || stone.y === 0 || stone.y === (this.boardSize - 1)) {
                        edgePenalty += GameState.EdgePenalty;
                    }
                });
                groupValue -= edgePenalty;

                if (group.player === GameState.Black) blackScore += groupValue;
                else whiteScore += groupValue;
            }
        }

        // Part 1.5: Value Capturing Races (Semeai)
        const visitedSemeai = new Set(); // Set of Group objects
        for (const friendlyGroup of unsettledGroups) {
            if (visitedSemeai.has(friendlyGroup)) continue;

            const adjacentEnemyGroups = new Map(); // Use Map to store unique groups
            const visitedEnemyStones = new Set(); // "x,y" keys
            for (const stone of friendlyGroup.stones) {
                for (const n of this.getNeighbors(stone)) {
                    if (visitedEnemyStones.has(`${n.x},${n.y}`)) continue;
                    const piece = this.board[n.y][n.x];
                    const isEnemy = (friendlyGroup.player === GameState.Black) ? (piece === GameState.White || piece === GameState.WhiteShield) : (piece === GameState.Black || piece === GameState.BlackShield);

                    if (isEnemy) {
                        const enemyGroup = this.findGroup(n);
                        if (enemyGroup) {
                            enemyGroup.stones.forEach(es => visitedEnemyStones.add(`${es.x},${es.y}`));
                            if (this.countEyes(enemyGroup) < 2) {
                                // Use first stone's key as group ID
                                adjacentEnemyGroups.set(`${enemyGroup.stones[0].x},${enemyGroup.stones[0].y}`, enemyGroup);
                            }
                        }
                    }
                }
            }

            if (adjacentEnemyGroups.size === 0) continue;
            visitedSemeai.add(friendlyGroup);
            let totalSemeaiValue = 0.0;

            for (const enemyGroupToFight of adjacentEnemyGroups.values()) {
                visitedSemeai.add(enemyGroupToFight);
                const friendlyLibs = friendlyGroup.liberties.size;
                const enemyLibs = enemyGroupToFight.liberties.size;
                let semeaiValue = 0.0;

                if (friendlyLibs > enemyLibs) {
                    semeaiValue = (enemyGroupToFight.stones.length * 1.0) + GameState.SemeaiBonus;
                } else if (enemyLibs > friendlyLibs) {
                    semeaiValue = -((friendlyGroup.stones.length * 1.0) + GameState.SemeaiBonus);
                    totalSemeaiValue = semeaiValue; // Loss is catastrophic
                    break;
                }
                totalSemeaiValue += semeaiValue;
            }
            if (friendlyGroup.player === GameState.Black) blackScore += totalSemeaiValue;
            else whiteScore += totalSemeaiValue;
        }

        // Part 2: Value Secured Territory
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                const p = { x, y };
                const key = `${x},${y}`;
                if (this.board[y][x] === GameState.Empty && !visitedEmpty.has(key)) {
                    const { emptyStones, borderColors } = this.findEmptyGroup(p);
                    emptyStones.forEach(stone => visitedEmpty.add(`${stone.x},${stone.y}`));
                    if (borderColors.size === 1) {
                        if (borderColors.has(GameState.Black)) blackScore += emptyStones.length;
                        else if (borderColors.has(GameState.White)) whiteScore += emptyStones.length;
                    }
                }
            }
        }

        // Part 3: Value Influence (Moyo)
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                const p = { x, y };
                const key = `${x},${y}`;
                if (this.board[y][x] === GameState.Empty && !visitedEmpty.has(key)) {
                    let friendlyInfluence = 0;
                    let enemyInfluence = 0;
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            if (dx === 0 && dy === 0) continue;
                            const checkPos = { x: x + dx, y: y + dy };
                            if (!this.isValid(checkPos)) continue;
                            const piece = this.board[checkPos.y][checkPos.x];
                            if (piece === GameState.Black || piece === GameState.BlackShield) friendlyInfluence++;
                            else if (piece === GameState.White || piece === GameState.WhiteShield) enemyInfluence++;
                        }
                    }
                    if (friendlyInfluence > enemyInfluence) blackScore += GameState.InfluenceBonus;
                    else if (enemyInfluence > friendlyInfluence) whiteScore += GameState.InfluenceBonus;
                }
            }
        }
        return blackScore - whiteScore;
    }

    findEmptyGroup(start) {
        const visited = new Set([`${start.x},${start.y}`]);
        const queue = [start];
        const emptyStones = [];
        const borderColors = new Set();

        while (queue.length > 0) {
            const p = queue.shift();
            emptyStones.push(p);
            for (const n of this.getNeighbors(p)) {
                const piece = this.board[n.y][n.x];
                if (piece === GameState.Empty) {
                    const key = `${n.x},${n.y}`;
                    if (!visited.has(key)) {
                        visited.add(key);
                        queue.push(n);
                    }
                } else {
                    if (piece === GameState.Black || piece === GameState.BlackShield) borderColors.add(GameState.Black);
                    else if (piece === GameState.White || piece === GameState.WhiteShield) borderColors.add(GameState.White);
                }
            }
        }
        return { emptyStones, borderColors };
    }

    getFinalTerritoryScore() {
        let blackScore = 0, whiteScore = 0;
        whiteScore += GameState.Komi;
        blackScore += this.whitePiecesLost;
        whiteScore += this.blackPiecesLost;

        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                const piece = this.board[y][x];
                if (piece === GameState.Black) blackScore += 1.0;
                else if (piece === GameState.BlackShield) blackScore += GameState.ShieldValue;
                else if (piece === GameState.White) whiteScore += 1.0;
                else if (piece === GameState.WhiteShield) whiteScore += GameState.ShieldValue;
            }
        }

        const visitedEmptyGroups = new Set();
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                const p = { x, y };
                const key = `${x},${y}`;
                if (this.board[y][x] === GameState.Empty && !visitedEmptyGroups.has(key)) {
                    const { emptyStones, borderColors } = this.findEmptyGroup(p);
                    emptyStones.forEach(stone => visitedEmptyGroups.add(`${stone.x},${stone.y}`));
                    if (borderColors.size === 1) {
                        if (borderColors.has(GameState.Black)) blackScore += emptyStones.length;
                        else if (borderColors.has(GameState.White)) whiteScore += emptyStones.length;
                    }
                }
            }
        }
        return blackScore - whiteScore;
    }
}

// --- C# Port: Heuristic/PatternDataManager Helpers ---
// We don't port the full classes, just the static helpers the bot needs.
// The main thread is responsible for loading/passing the data.

const MctsHelpers = {
    // From HeuristicDataManager.cs
    MAX_OPENING_DEPTH: 12,
    buildMoveKey: (history, nextMove) => {
        let key = "";
        for (let i = 0; i < history.length; i++) {
            key += MctsHelpers.getPlayerPrefix(i) + history[i].toLogFormat() + "|";
        }
        key += MctsHelpers.getPlayerPrefix(history.length) + nextMove.toLogFormat() + "|";
        return key;
    },
    getPlayerPrefix: (moveIndex) => (moveIndex % 2 === 0) ? "B;" : "W;",

    // From PatternDataManager.cs
    buildPatternKey: (state, midX, midY) => {
        let key = "";
        for (let y = midY - 2; y <= midY + 2; y++) {
            for (let x = midX - 2; x <= midX + 2; x++) {
                key += state.board[y][x];
            }
        }
        key += state.currentPlayer;
        return key;
    }
};

// --- C# Port: BotLogic.cs (MctsNode) ---
class MctsNode {
    constructor(state, config, parent = null, move = null) {
        this.state = state;
        this.config = config;
        this.parent = parent;
        this.move = move;

        this.wins = 0.0;
        this.visits = 0;

        this.policyPrior = 0.0; // P(s,a)
        this.children = new Map(); // Map<string, MctsNode> (using move.toLogFormat() as key)
        this.untriedMoves = state.getAllPossibleMoves().sort(() => Math.random() - 0.5); // Shuffled
        
        this.policyPriors = new Map(); // Map<string, double> (move.toLogFormat() as key)
        this.priorsInitialized = false;
    }

    selectChild() {
        const PUCT_C = this.config.PuctC;
        let bestChild = null;
        let bestPUCT = -Infinity;
        const sqrtParentVisits = Math.sqrt(this.visits);

        for (const child of this.children.values()) {
            let qValue;
            if (child.visits === 0) {
                qValue = 0.0;
            } else {
                qValue = -child.wins / child.visits;
            }
            const uValue = PUCT_C * child.policyPrior * (sqrtParentVisits / (1 + child.visits));
            const puctValue = qValue + uValue;

            if (puctValue > bestPUCT) {
                bestPUCT = puctValue;
                bestChild = child;
            }
        }
        return bestChild;
    }

    /**
     * This is the "Policy" (P) part of PUCT.
     * It's the most expensive part of expansion.
     */
    initializePriors(parentState, boardHistory, openingBook, moveHistory, patternCatalog) {
        if (this.priorsInitialized) return;

        const movesToKeep = [];
        let priorSum = 0.0;

        // Pre-scan and cache all group info
        const friendlyGroupCache = new Map(); // Map<string, {group, eyeCount}>
        const enemyGroupCache = new Map();
        const myTeam = parentState.currentPlayer;
        const enemyTeam = (myTeam === 1) ? 2 : 1;

        for (let y = 0; y < parentState.boardSize; y++) {
            for (let x = 0; x < parentState.boardSize; x++) {
                const p = { x, y };
                const piece = parentState.board[y][x];
                if (piece === 0) continue;

                const isFriendly = (piece === myTeam || piece === myTeam + 2);
                const cache = isFriendly ? friendlyGroupCache : enemyGroupCache;
                if (cache.has(`${x},${y}`)) continue;

                const group = parentState.findGroup(p);
                if (!group) continue;

                const analysis = {
                    group: group,
                    eyeCount: parentState.countEyes(group)
                };
                group.stones.forEach(stone => cache.set(`${stone.x},${stone.y}`, analysis));
            }
        }

        for (const move of this.untriedMoves) {
            // Check legality (suicide, repetition)
            const tempState = parentState.clone();
            if (!tempState.makeMove(move)) {
                continue; // Illegal move (suicide)
            }
            if (boardHistory && !tempState.pendingChainCapture) {
                const newStateKey = tempState.getStateKey();
                if (boardHistory.has(newStateKey) && boardHistory.get(newStateKey) >= 2) {
                    continue; // Repetition
                }
            }

            // Get the "holistic" prior score for this move
            const prior = MctsNode.getHeavyPrior(
                parentState, move, boardHistory, openingBook, moveHistory, patternCatalog,
                friendlyGroupCache, enemyGroupCache
            );

            if (prior >= 0.01) {
                this.policyPriors.set(move.toLogFormat(), prior);
                movesToKeep.push(move);
                priorSum += prior;
            }
        }

        // Normalize priors
        if (priorSum > 0) {
            for (const [key, value] of this.policyPriors.entries()) {
                this.policyPriors.set(key, value / priorSum);
            }
        }

        // Re-sync UntriedMoves
        this.untriedMoves = movesToKeep.sort(() => Math.random() - 0.5);
        this.priorsInitialized = true;
    }

    expand(parentState, boardHistory, openingBook, moveHistory, patternCatalog) {
        // 1. Initialize Priors (if not already done)
        if (!this.priorsInitialized) {
            this.initializePriors(parentState, boardHistory, openingBook, moveHistory, patternCatalog);
        }

        // 2. Pop a move
        if (this.untriedMoves.length === 0) return null;
        const move = this.untriedMoves.pop();

        // 3. Create Child
        const newState = parentState.clone();
        newState.makeMove(move);
        const child = new MctsNode(newState, this.config, this, move);

        // 4. Assign Prior (Fast Lookup)
        child.policyPrior = this.policyPriors.get(move.toLogFormat()) || 0.0;
        this.children.set(move.toLogFormat(), child);
        return child;
    }

    /**
     * This is the "Policy Function" (P).
     * It uses heuristics to assign a "prior" probability to moves.
     */
    static getHeavyPrior(
        parentState, move, boardHistory, openingBook, moveHistory, patternCatalog,
        friendlyCache, enemyCache
    ) {
        // --- 1. Check for "pass" during chain ---
        if (parentState.pendingChainCapture && move.type === "pass") {
            return 0.0; // Illegal
        }

        // --- 2. Check Pattern Catalog ---
        let patternPriority = 0.0;
        if (patternCatalog && move.type === "place" && parentState.boardSize > 5 &&
            move.at.x >= 2 && move.at.x <= parentState.boardSize - 3 &&
            move.at.y >= 2 && move.at.y <= parentState.boardSize - 3) {
            
            const key = MctsHelpers.buildPatternKey(parentState, move.at.x, move.at.y);
            if (patternCatalog.has(key)) {
                const moveString = patternCatalog.get(key);
                // We found a match!
                // The saved move is "place;2;3" (relative to 5x5)
                const parts = moveString.split(';');
                if (parts[0] === "place") {
                    const localX = parseInt(parts[1], 10);
                    const localY = parseInt(parts[2], 10);
                    // Translate from 5x5 (0-4) to 9x9
                    // Center of 5x5 (2,2) = our current (x,y)
                    const globalX = move.at.x + (localX - 2);
                    const globalY = move.at.y + (localY - 2);

                    if (globalX === move.at.x && globalY === move.at.y) {
                         patternPriority = 0.9;
                    }
                }
            }
        }

        // --- 3. Check Opening Book ---
        if (openingBook && moveHistory && moveHistory.length < MctsHelpers.MAX_OPENING_DEPTH) {
            if (Math.random() >= 0.10) { // 90% of the time, use the book
                const moveKey = MctsHelpers.buildMoveKey(moveHistory, move);
                if (openingBook.has(moveKey)) {
                    const data = openingBook.get(moveKey); // {blackWins, totalGames}
                    const priorWeight = 10.0;
                    const priorWins = 5.0;
                    const blackWinRate = data.blackWins / data.totalGames;
                    const rawWinRate = (parentState.currentPlayer === 1) ? blackWinRate : (1.0 - blackWinRate);
                    return ((data.totalGames * rawWinRate) + priorWins) / (data.totalGames + priorWeight);
                }
                return 0.5; // Default 50% for unknown opening
            }
        }

        // --- 4. Use Standard Heuristics (Fallback) ---
        return MctsNode.getHeavyPrior_Heuristics(parentState, move, friendlyCache, enemyCache, patternPriority);
    }

    /**
     * The core heuristic evaluation.
     */
    static getHeavyPrior_Heuristics(parentState, move, friendlyCache, enemyCache, patternPriority) {
        if (move.type === "pass") return 0.05;

        const myTeam = parentState.currentPlayer;
        const enemyTeam = (myTeam === 1) ? 2 : 1;

        let capturePriority = 0.0;
        let defensivePriority = 0.0;
        let eyeMakingPriority = 0.0;
        let connectUnsettledPriority = 0.0;
        let offensivePriority = 0.0;
        let connectionPriority = 0.0;
        let didConnectBonus = 0.0;
        let jumpVulnerabilityPenalty = 0.0;
        let libertyBonus = 0.0;

        const movePos = (move.type === "place" || move.type === "chainshield" || move.type === "move") ? move.at : null;

        if (movePos) {
            // --- 1. CRITICAL FIX - Check for filling a live eye ---
            let isPerfectEye = true;
            const friendlyNeighborGroupsForEye = new Set(); // Set of {group, eyeCount}
            for (const n of parentState.getNeighbors(movePos)) {
                const piece = parentState.board[n.y][n.x];
                if (piece === myTeam || piece === myTeam + 2) {
                    const analysis = friendlyCache.get(`${n.x},${n.y}`);
                    if (analysis) friendlyNeighborGroupsForEye.add(analysis);
                } else {
                    isPerfectEye = false;
                }
            }

            if (isPerfectEye && friendlyNeighborGroupsForEye.size > 0) {
                // ✅ ✅ THE FIX IS HERE ✅ ✅
                // We check >= 1, not >= 2.
                // Do not fill your *only* eye.
                let isAlive = false;
                for (const g of friendlyNeighborGroupsForEye) {
                    if (g.eyeCount >= 1) { // <-- THE FIX
                        isAlive = true;
                        break;
                    }
                }
                if (isAlive) {
                    return 0.01; // Suicidal move. Do not play.
                }
            }
            // --- END CRITICAL FIX ---

            // --- 2. Check for Jump Vulnerability ---
            if (move.type === "place") {
                const neighbors = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }];
                for (const n of neighbors) {
                    const enemyPos = { x: movePos.x + n.x, y: movePos.y + n.y };
                    const enemyLandPos = { x: movePos.x - n.x, y: movePos.y - n.y };
                    if (parentState.isValid(enemyPos) && (parentState.board[enemyPos.y][enemyPos.x] === enemyTeam)) {
                        if (parentState.isValid(enemyLandPos) && parentState.board[enemyLandPos.y][enemyLandPos.x] === 0) {
                            jumpVulnerabilityPenalty = 0.9;
                        }
                    }
                }
            }

            // --- 3. Check Friendly Neighbors ---
            const friendlyGroups = new Set();
            let surroundedByFriends = true;
            let friendlyNeighbors = 0;
            let emptyNeighbors = 0;
            for (const n of parentState.getNeighbors(movePos)) {
                const piece = parentState.board[n.y][n.x];
                if (piece === myTeam || piece === myTeam + 2) {
                    didConnectBonus = 0.1;
                    friendlyNeighbors++;
                    const analysis = friendlyCache.get(`${n.x},${n.y}`);
                    if (analysis) {
                        friendlyGroups.add(analysis);
                        const libs = analysis.group.liberties.size;
                        if (analysis.group.liberties.has(`${movePos.x},${movePos.y}`)) {
                            const sizeBonus = Math.log(analysis.group.stones.length + 1.0);
                            if (libs === 1) defensivePriority = Math.max(defensivePriority, 0.98 * sizeBonus);
                            if (libs === 2) defensivePriority = Math.max(defensivePriority, 0.82 * sizeBonus);
                            if (libs === 3) defensivePriority = Math.max(defensivePriority, 0.80 * sizeBonus);
                        }
                    }
                } else if (piece === 0) {
                    emptyNeighbors++;
                } else {
                    surroundedByFriends = false;
                }
            }

            if (surroundedByFriends && friendlyNeighbors >= 2) {
                let needsEye = false;
                for (const g of friendlyGroups) {
                    if (g.eyeCount < 2) { needsEye = true; break; }
                }
                if (needsEye) eyeMakingPriority = 0.95;
            }

            if (friendlyGroups.size >= 2) {
                let needsConnect = false;
                 for (const g of friendlyGroups) {
                    if (g.eyeCount < 2) { needsConnect = true; break; }
                }
                if(needsConnect) connectUnsettledPriority = 0.70;
            }
            
            for(const analysis of friendlyGroups) {
                if (analysis.group.liberties.size >= 4) {
                    connectionPriority = Math.max(connectionPriority, 0.15);
                }
            }

            // --- 4. Check Enemy Neighbors ---
            for (const n of parentState.getNeighbors(movePos)) {
                const analysis = enemyCache.get(`${n.x},${n.y}`);
                if (analysis) {
                    const libs = analysis.group.liberties.size;
                    const sizeBonus = Math.log(analysis.group.stones.length + 1.0);
                    if (libs === 1 && analysis.group.liberties.has(`${movePos.x},${movePos.y}`)) {
                        capturePriority = Math.max(capturePriority, 0.90 * sizeBonus);
                    } else if (libs === 2 && analysis.group.liberties.has(`${movePos.x},${movePos.y}`)) {
                        offensivePriority = Math.max(offensivePriority, 0.88 * sizeBonus);
                    }
                }
            }

            // --- 5. Self-Atari Heuristic / Liberty Bonus ---
            if (capturePriority === 0.0 && defensivePriority === 0.0) {
                if (emptyNeighbors === 0 && didConnectBonus === 0.0) libertyBonus = -0.9;
                else if (emptyNeighbors === 1 && didConnectBonus === 0.0) libertyBonus = -0.5;
                else if (emptyNeighbors === 2) libertyBonus = 0.1;
                else if (emptyNeighbors === 3) libertyBonus = 0.2;
                else if (emptyNeighbors === 4) libertyBonus = 0.3;
            }
        }

        // --- 6. Global Strategy & Invasion Heuristics ---
        let globalStrategyBonus = 0.0;
        let invasionBonus = 0.0;
        if (move.type === "place") {
            const x = move.at.x, y = move.at.y;
            const size = parentState.boardSize, turn = parentState.turn;
            const isCorner = (x < 3 || x >= size - 3) && (y < 3 || y >= size - 3);
            const isSide = (x < 2 || x >= size - 2 || y < 2 || y >= size - 2) && !isCorner;

            if (turn < (size * size * 0.15) && isCorner) globalStrategyBonus = 0.1;
            else if (turn < (size * size * 0.40) && isSide) globalStrategyBonus = 0.1;
            else if (turn >= (size * size * 0.40) && !isCorner && !isSide) globalStrategyBonus = 0.1;

            let friendlyInfluence = 0, enemyInfluence = 0;
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const checkPos = { x: x + dx, y: y + dy };
                    if (!parentState.isValid(checkPos)) continue;
                    const piece = parentState.board[checkPos.y][checkPos.x];
                    if (piece === myTeam || piece === myTeam + 2) friendlyInfluence++;
                    else if (piece === enemyTeam || piece === enemyTeam + 2) enemyInfluence++;
                }
            }
            if (enemyInfluence > friendlyInfluence && enemyInfluence >= 4) invasionBonus = 0.75;
        }

        // --- 7. HOLISTIC SCORING MODEL ---
        let finalPriority = 0.1;
        finalPriority += capturePriority;
        finalPriority += defensivePriority;
        finalPriority += eyeMakingPriority;
        finalPriority += connectUnsettledPriority;
        finalPriority += offensivePriority;
        finalPriority += patternPriority;
        finalPriority += invasionBonus;
        finalPriority += connectionPriority;
        finalPriority += didConnectBonus;
        finalPriority += globalStrategyBonus;
        finalPriority += libertyBonus;
        finalPriority *= (1.0 - jumpVulnerabilityPenalty);
        return Math.max(0.01, finalPriority);
    }
}

// --- C# Port: BotLogic.cs (BotManager) ---
class BotManager {
    constructor(config) {
        this.config = config;
        this.transpositionTable = new Map(); // Map<string, {wins, visits}>
    }

    updateUctStats(node, winsDelta, visitsDelta) {
        node.visits += visitsDelta;
        node.wins += winsDelta;
    }

    /**
     * This is the main MCTS loop, ported from C#
     * It runs for a fixed time, not a fixed number of iterations.
     */
    runMctsLoop(rootNode, timeLimitMs, boardHistory, openingBook, moveHistory, patternCatalog) {
        const startTime = performance.now();
        const path = [];
        const VirtualLossAmount = 1.0;
        const tt = this.transpositionTable;

        while (performance.now() - startTime < timeLimitMs) {
            let node = rootNode;
            path.length = 0; // Clear the array

            // 1. SELECTION
            while (node.untriedMoves.length === 0 && node.children.size > 0) {
                node = node.selectChild();
                if (!node) break;

                // Transposition Table Check
                const stateKey = node.state.getStateKey();
                const entry = tt.get(stateKey);
                if (entry && entry.visits > 10) {
                    let winsToAdd = (node.state.currentPlayer === 1) ? entry.wins : -entry.wins;
                    let ttBackPropNode = node;
                    while (ttBackPropNode) {
                        this.updateUctStats(ttBackPropNode, winsToAdd, entry.visits);
                        winsToAdd = -winsToAdd;
                        ttBackPropNode = ttBackPropNode.parent;
                    }
                    node = null; // Signal to restart
                    break;
                }

                path.push(node);
                this.updateUctStats(node, -VirtualLossAmount, 1); // Virtual loss
            }

            if (!node) continue; // Restart loop (from TT hit)

            let uctResult;
            let visitsResult = 1;

            // 2. CHECK FOR TERMINAL
            if (node.state.isGameOver()) {
                const rawScore = node.state.getFinalTerritoryScore(); // Black's perspective
                const squashedScore = Math.tanh(rawScore / this.config.ScoreScalingFactor);
                uctResult = (node.state.currentPlayer === 1) ? squashedScore : -squashedScore;
            } else {
                // 3. EXPANSION
                if (node.untriedMoves.length > 0) {
                    // Pass the raw data, not the managers
                    const expandedNode = node.expand(
                        node.state, boardHistory, openingBook, moveHistory, patternCatalog
                    );
                    if (expandedNode) {
                        node = expandedNode;
                        path.push(node);
                        this.updateUctStats(node, -VirtualLossAmount, 1); // Virtual loss
                    }
                }

                // 4. EVALUATION (replaces SIMULATION)
                const rawScore = node.state.getPlayoutScore();
                const squashedScore = Math.tanh(rawScore / this.config.ScoreScalingFactor);
                uctResult = (node.state.currentPlayer === 1) ? squashedScore : -squashedScore;
            }

            // Store Terminal/Evaluated nodes in TT
            const leafKey = node.state.getStateKey();
            const rawUctResult = (node.state.currentPlayer === 1) ? uctResult : -uctResult;
            const oldEntry = tt.get(leafKey);
            if (oldEntry) {
                tt.set(leafKey, {
                    wins: oldEntry.wins + rawUctResult,
                    visits: oldEntry.visits + 1
                });
            } else {
                tt.set(leafKey, { wins: rawUctResult, visits: 1 });
            }

            // 5. BACKPROPAGATION
            for (const visitedNode of path) {
                this.updateUctStats(visitedNode, VirtualLossAmount, -1); // Remove virtual loss
            }

            let backPropNode = node;
            while (backPropNode) {
                this.updateUctStats(backPropNode, uctResult, visitsResult);

                // Update TT on the way up
                if (backPropNode.parent) { // Don't store root
                    const stateKey = backPropNode.state.getStateKey();
                    const winsForBlack = (backPropNode.state.currentPlayer === 1) ? backPropNode.wins : -backPropNode.wins;
                    // Overwrite with the more accurate, fully-explored value
                    tt.set(stateKey, { wins: winsForBlack, visits: backPropNode.visits });
                }

                uctResult = -uctResult; // Flip perspective
                backPropNode = backPropNode.parent;
            }
        } // End while(time)
    }

    /**
     * This replaces the C# "FindBestMoveParallelAsync".
     * It is single-threaded and runs in the worker.
     */
    findBestMove(currentState, timeLimitMs, boardHistory, openingBook, moveHistory, patternCatalog) {
        
        // Clear the TT for a new move
        this.transpositionTable.clear();

        const rootNode = new MctsNode(currentState.clone(), this.config);

        // Pre-initialize root node's priors (this is the expensive part)
        // This is done *inside* the first expand call, but we can do it here.
        rootNode.initializePriors(rootNode.state, boardHistory, openingBook, moveHistory, patternCatalog);

        if (rootNode.untriedMoves.length === 0 && rootNode.children.size === 0) {
            console.debug("[Bot Manager] No valid moves found! Passing.");
            const emptyPolicy = { "pass": 1.0 };
            return { move: Move.Pass(), policy: emptyPolicy, totalVisits: 0 };
        }
        
        // Run the single-threaded MCTS loop
        this.runMctsLoop(
            rootNode, timeLimitMs, boardHistory, openingBook, moveHistory, patternCatalog
        );

        // --- Tally Results ---
        let bestChildOverall = null;
        let bestChildNoPass = null;
        let maxVisitsOverall = -1;
        let maxVisitsNoPass = -1;

        for (const child of rootNode.children.values()) {
            if (child.visits > maxVisitsOverall) {
                maxVisitsOverall = child.visits;
                bestChildOverall = child;
            }
            if (move.type !== "pass" && child.visits > maxVisitsNoPass) {
                maxVisitsNoPass = child.visits;
                bestChildNoPass = child;
            }
        }

        const totalIterations = rootNode.visits;
        if (!bestChildOverall) {
            console.debug("[Bot Manager] No valid moves found at all. Passing.");
            const emptyPolicy = { "pass": 1.0 };
            return { move: Move.Pass(), policy: emptyPolicy, totalVisits: totalIterations };
        }

        // --- Pass & Resign Logic ---
        let passWinRate = -2.0;
        if (bestChildOverall.move.type === "pass") {
            passWinRate = (bestChildOverall.visits > 0) ? (bestChildOverall.wins / bestChildOverall.visits) : 0.0;
        }
        
        let bestPlayWinRate = -2.0;
        if (bestChildNoPass) {
            bestPlayWinRate = (bestChildNoPass.visits > 0) ? (bestChildNoPass.wins / bestChildNoPass.visits) : 0.0;
        }

        const bestPlayWinRatePercent = (bestPlayWinRate + 1.0) / 2.0;
        let winningMove = bestChildNoPass ? bestChildNoPass.move : Move.Pass();
        
        if (currentState.turn > 50 && bestPlayWinRatePercent < 0.01 && bestChildNoPass && bestChildNoPass.visits > 1000) {
             console.debug(`[Bot Manager] Resigning. Best play WR ${bestPlayWinRatePercent * 100}%. Passing.`);
        } else if (bestChildOverall.move.type === "pass" && passWinRate > bestPlayWinRate) {
             console.debug(`[Bot Manager] Passing. (Pass WR: ${passWinRate} vs Play WR: ${bestPlayWinRate})`);
        } else if (winningMove.type !== "pass" && bestChildOverall.move.type === "pass") {
             console.debug(`[Bot Manager] Forcing non-pass move. (Pass WR: ${passWinRate} vs Play WR: ${bestPlayWinRate})`);
        }

        // --- Create Policy Vector for NN Training ---
        const policyVector = {};
        if (totalIterations > 0) {
            for (const child of rootNode.children.values()) {
                policyVector[child.move.toLogFormat()] = child.visits / totalIterations;
            }
        }
        if (!policyVector["pass"]) {
            policyVector["pass"] = 0.0;
        }

        // --- Debug Logging ---
        const sortedChildren = [...rootNode.children.values()].sort((a, b) => b.visits - a.visits);
        for (let i = 0; i < Math.min(5, sortedChildren.length); i++) {
            const child = sortedChildren[i];
            const winRate = (child.visits > 0) ? (child.wins / child.visits) : 0.0;
            const winRatePercent = (winRate + 1.0) / 2.0 * 100.0;
            const policy = (child.visits > 0) ? (child.policyPrior * 100) : 0.0;
            console.debug(`  > Move: ${child.move.toString()} | Visits: ${child.visits} | Win% (Bot): ${winRatePercent.toFixed(1)}% | Policy: ${policy.toFixed(1)}%`);
        }
        console.debug(`[Bot Manager] Selected move: ${winningMove.toString()} (Total Iterations: ${totalIterations})`);

        return { move: winningMove, policy: policyVector, totalVisits: totalIterations };
    }
}