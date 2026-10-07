# Hikoro Academy — 8×8 learner's board

An additional collection game at `/academy.html`, designed to teach real Hikoro movements without the full 10×16 board's large army and special actions. Hikorüka remains a separate 5×5 game and keeps its own movement rules.

## Six actual Hikoro pieces

Original names, notation and existing white/black sprites:

| Piece | Type / notation | Movement taught |
| --- | --- | --- |
| King Kraken | lupa / K | One square in any direction. Free to roam because this teaching board has no Prince. |
| Fish | pawn / F | One orthogonal step, or exactly two diagonal squares as a leap. No forward restriction. |
| Big Eye Squid | yoli / B | Eight knight leaps plus one orthogonal step. |
| One Pincer Crab | fin / Oc | Diagonal sliding plus a one-square horizontal **non-capture** step. |
| Dumbo Octopus | chair / Du | Diagonal and vertical sliding. |
| Hermit Crab | kota / H | Horizontal sliding plus one square in any direction. |

`academy-engine.js` calls the full game's `getValidMovesForPiece`; it does not duplicate these movement patterns. An 8×8 array is embedded at x=1..8/y=4..11 in the uninterrupted center of the full engine's board and destinations are clamped to the teaching square. The six chosen types are independent of forward orientation. No Prince or shielding types are present. Directions/rays cannot leave and reenter the rectangular teaching board.

The full game's current Hermit Crab code slides horizontally plus king steps, despite its existing rules text saying rook movement. Academy deliberately teaches the engine's actual movement, and its own description reflects that. No full-game rules are changed here.

## Modes

- **Guided piece practice** is the local default. Choose any of the six lessons. A featured White piece, a friendly Fish blocker and three Black Fish targets demonstrate legal moves, blocking and captures. Green dots are movement; red rings are captures. Either color can move freely, without turn restrictions or a win condition. The selected piece remains selected after a move to show its next paths. Reset, undo/redo, flip, and direct Practice buttons in the guide make teaching easy.
- **Two-player teaching match** starts twelve pieces per side: back row Octopus/Squid/Crab/King/Hermit/Crab/Squid/Octopus, four Fish in the row ahead. White starts. Turns alternate; capture the opposing King to win. No legal moves, threefold repetition, or 1,000 plies draw. The final board persists.
- **Online teaching matches** are available through the lobby, using shared server validation and authenticated seats. Online rooms cannot switch to practice or undo. Refresh/reconnection restores the seat. In-memory rooms clear on server restart, consistent with other games.

This is a movement-learning variant. It omits Prince/palace/sanctuary, shielding, promotions, bonus turns, and captured-piece drops. Fish and One Pincer Crab keep their starting movement after capture, so the six lessons remain stable. The rules dialog explains these differences and links learning back to the full collection. The original full game is unchanged.

## Interface and persistence

Responsive 64-square button board, arrow/Enter/Space/Escape controls, selected-piece explanation, always-visible coordinates, original piece guide, captured trays, history, UTF-8 record download, and board flip. Local mode/lesson/journal/undo cursor/orientation save under `hikoro-academy-local-v1`. Restoring validates and replays the entire journal. Mode/lesson/reset changes confirm before replacing a session with moves. Old Hikorüka saves use a different key and remain intact.

## Validation and deployment

44 Node tests pass. Eight Academy tests cover setup/lessons, actual leaps/non-capture steps/rays, 360 blocker-filled movement comparisons against full Hikoro, wrong turns and malformed actions, King capture, replay, 300 random plies, and online synchronization/seat replacement/stale sockets/resignation. Existing Go, Hikorüka, Shavari, Sho Dan Sho and Hikoro tests remain green.

Real Chromium checks cover six collection cards, all lesson choices, either-color practice, captures, cancellation/reset/undo/redo/refresh, mode switching, original sprite loading, 24-piece teaching match, rules, keyboard/flip/download, phone/tablet/desktop sizing, and online play/reconnection/resignation. Hikorüka's five new SVGs and display names are also checked on desktop and phone.

Merge into main and use the existing Render configuration: root HikoroChess, build npm ci, start npm start, health /health. No new dependencies or hosting changes.
