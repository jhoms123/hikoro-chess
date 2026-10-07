# Shield Go

A browser port of the moving-stone Go variant in the owner's `jhoms123/goGameLocal` and `jhoms123/csharpgogame` repositories. The web version uses the shared movement/liberty rules and the C# version's reserve and final scoring rules. Bot code, workers, trainers, playout heuristics, and AI controls are not included.

## Rules

- Local or authenticated online two-player play, on 9×9 or 13×13 intersections; Black starts.
- Each player begins with 100 reserve stones. Placement and shield transformation consume one. Captures do not replenish reserves.
- Ordinary stones jump orthogonally over one opposing ordinary stone into an empty intersection, capturing the jumped piece. Shields cannot be jumped.
- A jump with further legal jumps keeps the same player's turn and requires that stone to continue, or a pass to end the chain. No placement or shielding during a chain.
- Shield transformation is permanent. Shields move one empty point in any of eight directions.
- Orthogonally connected friendly stones and shields share liberties. Enemy groups without liberties are removed after each placement/movement/transformation. Suicide is rejected atomically, including the jump capture and reserve/capture counts.
- Two consecutive passes, resignation, reserve exhaustion, or threefold repetition finish a match. Final position remains visible. White has 4 komi. Each ordinary stone = 1; shield = 0.5; captured opposing piece = 1; exclusively bordered empty territory = 1 per point. No automatic dead-stone removal.
- Repetition keys contain the board and next player, counted at completed non-pass turns. Chain intermediates do not count. No simple-ko restriction.

The original C# UI's same-player pass tracking could finish after interleaved actions. This port consistently requires two consecutive passes, matching the JavaScript game's intended rule. Only legal non-suicidal continuations keep a jump chain open. The bot's edge penalty and playout move cap are heuristic/training rules and are excluded from human scoring/play.

## Interface and recovery

`go-engine.js` is a pure shared server/browser engine. The UI adds touch and keyboard input, clear shield/ordinary stone silhouettes, legal destinations, board flip, provisional score breakdown, reserves, move history, local undo/redo, record download, and validated autosave journals. Board size/new-match changes ask before replacing saved progress. Online boards get their size from the host's room settings and use private seat tickets; the server validates every action. Refresh/reconnection resumes the seat. Online state remains in memory and is cleared by server restart, as with the other games.

Board grain, grid and stones are CSS/SVG drawn for this project with no remote asset requests or additional image licenses. Board coordinates omit I. No bot dependencies are loaded by this page.

Shavari's floating stack inspector, hover/focus listeners, and inspection toggle are removed. Always-visible member ribbons and the selected formation sidebar remain, as do the intentional Capture/Cover decision controls.

## Validation and deployment

Run `npm test` in `HikoroChess/`. Go coverage includes both sizes, ownership/bounds, capture groups, suicide rollback, shields, chains, pass endings, scoring, repetition, reserves, replay, online turn authorization/state synchronization/seat refresh/stale sockets. Browser checks cover local and online play, 390/900/1440px layouts, keyboard controls, undo/redo, save restore, downloads and popup removal.

Merge into `main` and use the existing Render service configuration: root `HikoroChess`, build `npm ci`, start `npm start`, health `/health`. No dependency or hosting changes are required.
