# Shavari chess

Adds the user-supplied 9x9 line-intersection game to the collection at `/shavari.html`, with local shared-device play and two-player online rooms.

## Combined movement and elevation rules

Every carried piece contributes its movement, including buried enemy pieces. Camel moves exactly two intersections diagonally in any direction; its intermediate intersection obeys the existing height-blocking rule. Lotus has six king-style steps: the four orthogonal steps and two backward diagonals, excluding both forward diagonals. Forward is defined by each piece’s original owner (Carnelian toward row 9, Turquoise toward row 1), including buried enemy pieces. Pawn still steps orthogonally and Cannon still slides orthogonally. Each carried piece’s pattern is generated independently and combined without duplicate destinations. The top piece's owner controls the formation, independently of the other members' ownership.

Whole stack moves all members. Top piece detaches one. Top two detaches the upper pair. Height comparisons use the moving portion, not the height left at the source. A taller moving portion can pass over shorter formations along its legal movement path. Equal and taller formations block travel beyond them. Friendly landing combines stacks within the three-piece cap.

Enemy landing offers **Capture** or, when legal, **Cover**. Capture removes the enemy-controlled formation. Cover requires the moving portion to be strictly taller and the combined height to be at most three; enemy pieces remain below arriving pieces with their owners and movement intact. Thus two can cover one, while one cannot cover two or one. Ordinary captures remain available separately. Splitting a mixed formation can expose an opponent-owned top piece and return control to that opponent.

Capture of a General wins for the other owner of that General. Covering a General does not capture it. Capturing your own General inside an enemy-controlled formation loses; removing both Generals draws. Threefold repetition, no legal moves, and the 4,000-ply safety limit draw. No check, checkmate, promotion, captured-piece drops, cannon screens, or AI opponent are used.

These rules supersede the original upload's top-only demonstration code, following the user's clarified combined-movement and elevation rules. New local matches use a version-3 storage key so older move journals are not silently reinterpreted under changed rules.

## Presentation and controls

- Original CC0 geometric inlay board with drawn grain, turquoise pattern work, and coordinate labels.
- CC BY 3.0 lotus, camel, elephant-head, and scarab emblems from Game-icons.net, mounted on turquoise and carnelian tokens. Attribution is visible in the footer; `public/assets/shavari/CREDITS.md` lists authors, sources, licenses, and modifications.
- Stack-height rings and badges, owner-colored mini emblems on stacks, legal move/stack/capture/cover highlights, full selected-formation composition, move chronicle, and piece guide.
- Read-only hover/focus stack inspection and a touch inspection toggle. The inspector shows each type, original owner, and base-to-top order without changing the selected formation, board, turn, or saved journal.
- Desktop, tablet, and phone layouts; movement-mode controls beside the board on phones.
- Native rules and confirmation dialogs; arrow-key board navigation, Enter/Space activation, Escape deselection, board flipping, focus indicators, and reduced-motion support.

## Local and online state

Local matches save a compact move journal and undo cursor in browser storage. Reload reconstructs the position through the same engine. Undo, redo, and branching after undo are supported. Saving a record downloads human-readable text; it is not an import file. Browser storage failure leaves gameplay available and announces that automatic saving is unavailable.

Online actions are verified by the shared deterministic server engine. The server assigns the player seat, accepts only that seat's legal move on its turn, and sends canonical state. Authenticated session tickets restore the board and move history after refresh; a replacement connection invalidates the old socket's seat. Undo and redo are disabled online. Moves pause while disconnected or awaiting confirmation. Resignation and deliberate departure require confirmation. Online rooms remain in memory and are cleared by server restart, with the existing idle expiry policy unchanged.

No AI opponent was added. Local play is two people on one device; online play is two people in a room. Existing Hikoro and Sho Dan Sho rules and assets are unchanged.

## Validation

`npm test`: 20 tests pass, including eleven Shavari tests for movement, blocking, stacking, splitting, buried-General capture, malformed actions, repetition, journal reconstruction, 500 randomized legal plies, online turn enforcement, ticket restoration, old-seat rejection, resignation authorization, inherited enemy movement, strict jump heights, explicit cover/capture validation, top-pair splitting, control restoration, and mixed-General capture results. Existing reliability tests remain green.

Real Chromium checks passed at 1440, 900, and 390 pixels: no horizontal overflow; 20 initial pieces; legal highlights; formation stacking and splitting; local undo/redo and refresh restoration; rules and confirmation dialogs; keyboard navigation; board flipping; record download; lobby local launch; online room creation and joining; two-seat move synchronization; authenticated page refresh; and resignation. No page errors occurred.

## Deployment

Merge this change and deploy `main` on the existing Render service. Service root: `HikoroChess`; build: `npm ci`; start: `npm start`; health path: `/health`. No dependency or environment-variable changes are needed.

Follow-up real Chromium checks passed for capture/cover choice and cancellation, mixed-stack inspection without changing selection or journal, top-pair splitting and control restoration, undo/redo and version-3 refresh recovery, responsive layouts, online covering synchronization, and authenticated refresh of mixed formations.

Movement follow-up: 20 tests pass, including exact two-step camel diagonals, intermediate height blockers, owner-relative six-step lotus movement, and mixed-stack pattern union. Chromium verified both changed pieces in local and online games, lotus direction after board flipping, version-3 save recovery, rules text, and mobile layout without page errors.
