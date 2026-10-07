# Shavari chess

Adds the user-supplied 9x9 line-intersection game to the collection at `/shavari.html`, with local shared-device play and two-player online rooms.

## Rules and deliberate decisions

The upload implements one-step orthogonal movement for General and Pawn, orthogonal sliding for Lance and Cannon, blocked rays, whole-stack capture, friendly stacking up to three pieces, and top-piece detachment. Those rules are preserved, including backwards pawn movement and a cannon that slides without a screen. The **top piece determines a stack's movement**. The upload's explanatory sentence about combining movement was inconsistent with its code; the new rules dialog describes the implemented behavior explicitly.

The upload had no terminal state. Capturing the enemy General now wins, including a General buried beneath other pieces. Threefold repetition, no legal moves, and the 4,000-ply safety limit produce a draw. This is a capture-the-general variant, with no check, checkmate, promotion, or captured-piece drops.

## Presentation and controls

- Original CC0 geometric inlay board with drawn grain, turquoise pattern work, and coordinate labels.
- CC BY 3.0 lotus, camel, elephant-head, and scarab emblems from Game-icons.net, mounted on turquoise and carnelian tokens. Attribution is visible in the footer; `public/assets/shavari/CREDITS.md` lists authors, sources, licenses, and modifications.
- Stack-height rings and badges, legal move/stack/capture highlights, full selected-formation composition, move chronicle, and piece guide.
- Desktop, tablet, and phone layouts; movement-mode controls beside the board on phones.
- Native rules and confirmation dialogs; arrow-key board navigation, Enter/Space activation, Escape deselection, board flipping, focus indicators, and reduced-motion support.

## Local and online state

Local matches save a compact move journal and undo cursor in browser storage. Reload reconstructs the position through the same engine. Undo, redo, and branching after undo are supported. Saving a record downloads human-readable text; it is not an import file. Browser storage failure leaves gameplay available and announces that automatic saving is unavailable.

Online actions are verified by the shared deterministic server engine. The server assigns the player seat, accepts only that seat's legal move on its turn, and sends canonical state. Authenticated session tickets restore the board and move history after refresh; a replacement connection invalidates the old socket's seat. Undo and redo are disabled online. Moves pause while disconnected or awaiting confirmation. Resignation and deliberate departure require confirmation. Online rooms remain in memory and are cleared by server restart, with the existing idle expiry policy unchanged.

No AI opponent was added. Local play is two people on one device; online play is two people in a room. Existing Hikoro and Sho Dan Sho rules and assets are unchanged.

## Validation

`npm test`: 14 tests pass, including seven new Shavari tests for movement, blocking, stacking, splitting, buried-General capture, malformed actions, repetition, journal reconstruction, 500 randomized legal plies, online turn enforcement, ticket restoration, old-seat rejection, and resignation authorization. Existing reliability tests remain green.

Real Chromium checks passed at 1440, 900, and 390 pixels: no horizontal overflow; 20 initial pieces; legal highlights; formation stacking and splitting; local undo/redo and refresh restoration; rules and confirmation dialogs; keyboard navigation; board flipping; record download; lobby local launch; online room creation and joining; two-seat move synchronization; authenticated page refresh; and resignation. No page errors occurred.

## Deployment

Merge this change and deploy `main` on the existing Render service. Service root: `HikoroChess`; build: `npm ci`; start: `npm start`; health path: `/health`. No dependency or environment-variable changes are needed.
