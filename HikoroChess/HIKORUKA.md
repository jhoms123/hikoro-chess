# Hikorüka chess

Integrates the user's mini Hikoro variant as a fourth game in the collection, at `/hikoruka.html`. Display names preserve the ü; URLs and protocol names use `hikoruka`.

## Rules

The supplied setup is preserved: each court has two Strikers, two Infiltrators, one Hikoro commander, one Ninja, and two Vanguards on a 5 × 5 board. Coral moves first. Commander moves like a king; Striker slides orthogonally; Infiltrator slides diagonally; Ninja makes 2 + 1 knight jumps; Vanguard advances one into empty space and captures diagonally forward. Sliding pieces stop at the first occupied square. Original starting sides define Vanguard direction, regardless of board orientation.

Victory is commander capture. There is no check, checkmate, castling, double pawn advance, promotion, or captured-piece drops. The far-edge Vanguard stays a Vanguard and cannot move further forward. No legal moves, threefold repetition, and a 1,000-ply bound draw.

Unlike the pasted prototype, winning freezes and displays the final position rather than showing an alert and immediately resetting. The winner, captured pieces, and record remain available until a confirmed new match.

## Modes and presentation

Local two-player play shares a device. Bot mode plays Deepwater against the human Coral court. Online two-player rooms use the existing lobby and authenticated seats. The table is untimed.

The board has its own ocean palette, framed tiles, coordinates, capture highlights, court strips, captured-piece trays, selected-piece explanation, illustrated guide, and move chronicle. Artwork reuses the existing Hikoro sprite assets: commander `lupa`, striker `jotu`, infiltrator `chair`, ninja `cope`, and vanguard `pawn`. The guide explains this variant's own rules; the artwork does not import full Hikoro special mechanics.

Layouts support desktop, tablet, and phone widths. Actual square buttons support keyboard arrow navigation, Enter/Space, Escape, and roving focus. Board flipping preserves coordinates and forward direction. Native rules and confirmation dialogs provide keyboard focus handling. Movement animations inherit reduced-motion support from the shared collection CSS.

## Reliability and bot

The deterministic engine is shared between the browser and server. Online moves, turns, resignations, and seat restoration are server verified. Old sockets lose their seats after authenticated replacement. Online undo and bot settings are disabled. The existing in-memory room lifetime and restart behavior remain.

Local matches save compact move journals, mode, orientation, and undo cursor. Refresh replays legal actions rather than trusting a stored board. Undo in bot mode returns to the preceding human turn; redo restores the recorded reply. A new human move branches the journal. Records download as human-readable UTF-8 text, not import files. Storage failure announces that automatic saving is unavailable without blocking play.

The supplied one-move greedy bot is replaced with a small deterministic two-ply bot that scores captures, position, and the opponent's best immediate reply. This avoids an available immediate commander loss and takes commander captures. It is a lightweight opponent, not a tournament-strength bot. Pending replies are canceled by reset, undo, mode changes, and dialogs; the human cannot play the bot's turn. A revision guard prevents stale callbacks from modifying a replaced position.

## Validation

`npm test`: **29 passing tests**. Nine Hikorüka tests cover the exact initial armies and piece patterns, ray blocking, knight jumping, owner-relative Vanguard rules and far-edge behavior, lack of check enforcement, final commander capture, invalid actions, replay, repetition and immobility draws, bot tactics, 200 bot/random plies with piece conservation, and online authorization/synchronization/replacement/resignation. All 20 existing game tests remain green.

Real Chromium checks passed for collection selection and launch, 25 squares/16 pieces, highlights and capture trays, local undo/redo and refresh recovery, rules and keyboard controls, flipping, record download, mode-change cancellation, bot input lock, canceled pending bot reply after reset, bot-aware undo/redo, terminal position persistence, two-client online moves/captures/refresh/resignation, and 1440/900/390-pixel layouts without horizontal overflow. No page errors occurred.

## Deployment

Merge and deploy `main` on the existing Render service: root `HikoroChess`, build `npm ci`, start `npm start`, health path `/health`. No dependency or environment changes. Online rooms clear on service restart; local browser journals persist.
