# Hikoro Academy — 8×8 learner board

A teaching variant at `/academy.html`, with seven original Hikoro pieces, guided practice, and local or online two-player matches. Hikorüka remains the separate 5×5 game.

## Army and movements

Each court starts with thirteen pieces. The back row is Octopus / Squid / Crab / Kraken / Prince / Crab / Squid / Octopus. The second rank contains a Hermit Crab at C and Fish at B, D, E, and G.

| Piece | Notation | Movement |
| --- | --- | --- |
| King Kraken | K | One adjacent square; stays in its palace while its own Prince survives. |
| Kraken Prince | KP | One forward step or one diagonal step in any direction. White advances toward rank 8; Black toward rank 1. |
| Fish | F | One orthogonal step or a two-square diagonal leap. |
| Big Eye Squid | B | Knight leaps plus one orthogonal step. |
| One Pincer Crab | Oc | Diagonal sliding plus a horizontal one-square non-capture step. |
| Dumbo Octopus | Du | Diagonal and vertical sliding. |
| Hermit Crab | H | Horizontal sliding plus one adjacent step. |

The six non-Kraken patterns use the full game's `getValidMovesForPiece`, embedded in the uninterrupted center of its board and clamped to 8×8. Court colors are mapped to preserve forward direction. Kraken steps use the learner board's own palace bounds. This leaves the full game's rules unchanged.

## Palaces and victory

White's horizontal 3×2 home palace is C1–E2. Black's is C7–E8. Each Kraken must stay in its palace until its own Prince is captured; then it can roam. Hatched squares mark locked palaces.

Yellow sanctuaries occupy A4/A5 and H4/H5: one column by two central ranks on either edge. Either royal can win by entering either sanctuary. The Prince can do so from the start and remains eligible if its Kraken is captured. Capturing one royal does not win; capturing both opposing royals does. There is no check or checkmate. Threefold repetition, no legal moves, or 1,000 plies draw.

Guided practice allows either color to move and has no terminal result. The Kraken lesson includes its Prince so students can explore confinement and release. The Prince lesson includes a home Kraken. Lessons show moves, captures, and blockers; matches enforce alternating turns. This board omits shielding, promotions, bonus turns, and drops.

## Interface and persistence

Seven lessons, original sprites, palace and sanctuary markings, selected-piece explanations, coordinates, captures, history, board flipping, keyboard navigation, undo/redo, and text records. Flipping affects only the view, including palace and sanctuary positions. Online play uses the shared server engine, authenticated seats, refresh recovery, and no undo.

Local journals use `hikoro-academy-local-v2` to avoid interpreting earlier six-piece sessions under new setup and victory rules. Earlier saved data remains under its old key. Online rooms clear when the server restarts.

## Verification and deployment

48 collection tests pass, covering both courts' confinement and release, Prince direction, all four sanctuary squares, non-royal exclusion, surviving royalty, random legal play, movement comparisons against full Hikoro, and online synchronization and seat protection. Browser checks cover all lessons, moves, captures, undo/redo, refresh, keyboard and flip controls, mobile/tablet/desktop layouts, and online play.

Preview images are in `docs/academy/`. Deployment uses the existing main branch and Render configuration: root HikoroChess, build npm ci, start npm start, health /health. No new dependencies.
