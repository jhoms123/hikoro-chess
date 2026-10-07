# Hikorüka chess

Integrates the user's mini Hikoro variant in the collection, at `/hikoruka.html`. Display names preserve the ü; URLs and protocol names use `hikoruka`.

## Rules

The supplied setup is preserved: each court has two Castellans, two Archers, one Sovereign, one Cavalier, and two Squires on a 5 × 5 board. Ember moves first. Sovereign moves like a king; Castellan slides orthogonally; Archer slides diagonally; Cavalier makes 2 + 1 knight jumps; Squire advances one into empty space and captures diagonally forward. Sliding pieces stop at the first occupied square. Original starting sides define Squire direction, regardless of board orientation.

Victory is Sovereign capture. There is no check, checkmate, castling, double pawn advance, promotion, or captured-piece drops. The far-edge Squire stays a Squire and cannot move further forward. No legal moves, threefold repetition, and a 1,000-ply bound draw.

Unlike the pasted prototype, winning freezes and displays the final position rather than showing an alert and immediately resetting. The winner, captured pieces, and record remain available until a confirmed new match.

## Modes and presentation

Local two-player play shares a device. Bot mode plays Ivory against the human Ember court. Online two-player rooms use the existing lobby and authenticated seats. The table is untimed.

The game name remains **Hikorüka chess**. Its citadel edition replaces the former ocean artwork with Crown/Sovereign, Castle/Castellan, Bow/Archer, Horse/Cavalier, and Shield/Squire emblems from Game-icons.net, mounted on Ember and Ivory tokens. The board and surrounding panels use bronze, wood, and parchment, with the existing CC0 timber/parchment/ornament assets. CC BY 3.0 authors, sources, and modifications are recorded in `public/assets/hikoruka/CREDITS.md` and linked in the footer.

Internal piece IDs H/S/I/N/V, setup, movement, local autosave version, bot, and online protocol remain compatible. Old journals replay with the new display names. Captured trays, selected-piece text, guides, rules, history, and downloaded records all use the new emblems and names. No full Hikoro mechanics are imported into the mini game.

Layouts support desktop, tablet, and phone widths. Actual square buttons support keyboard arrow navigation, Enter/Space, Escape, and roving focus. Board flipping preserves coordinates and forward direction. Native rules and confirmation dialogs provide keyboard focus handling. Movement animations inherit reduced-motion support from the shared collection CSS.

## Reliability and bot

The deterministic engine is shared between the browser and server. Online moves, turns, resignations, and seat restoration are server verified. Old sockets lose their seats after authenticated replacement. Online undo and bot settings are disabled. The existing in-memory room lifetime and restart behavior remain.

Local matches save compact move journals, mode, orientation, and undo cursor. Refresh replays legal actions rather than trusting a stored board. Undo in bot mode returns to the preceding human turn; redo restores the recorded reply. A new human move branches the journal. Records download as human-readable UTF-8 text, not import files. Storage failure announces that automatic saving is unavailable without blocking play.

The supplied one-move greedy bot is replaced with a small deterministic two-ply bot that scores captures, position, and the opponent's best immediate reply. This avoids an available immediate Sovereign loss and takes Sovereign captures. It is a lightweight opponent, not a tournament-strength bot. Pending replies are canceled by reset, undo, mode changes, and dialogs; the human cannot play the bot's turn. A revision guard prevents stale callbacks from modifying a replaced position.

## Validation

`npm test`: **44 passing tests across the collection**. Nine Hikorüka tests cover the exact initial armies and piece patterns, ray blocking, knight jumping, owner-relative Squire rules and far-edge behavior, lack of check enforcement, final Sovereign capture, invalid actions, replay, repetition and immobility draws, bot tactics, 200 bot/random plies with piece conservation, and online authorization/synchronization/replacement/resignation. All 20 existing game tests remain green.

Real Chromium checks passed for collection selection and launch, 25 squares/16 pieces, highlights and capture trays, local undo/redo and refresh recovery, rules and keyboard controls, flipping, record download, mode-change cancellation, bot input lock, canceled pending bot reply after reset, bot-aware undo/redo, terminal position persistence, two-client online moves/captures/refresh/resignation, and 1440/900/390-pixel layouts without horizontal overflow. No page errors occurred.

## Deployment

Merge and deploy `main` on the existing Render service: root `HikoroChess`, build `npm ci`, start `npm start`, health path `/health`. No dependency or environment changes. Online rooms clear on service restart; local browser journals persist.
