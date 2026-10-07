# Hikoro Academy — 8×8 learner board

A teaching variant at `/academy.html`, with eight original Hikoro pieces, guided practice, and local or online two-player matches. Hikorüka remains the separate 5×5 game.

## Army and movements

Each court starts with sixteen pieces. The back row is Dumbo Octopus / Big Eye Squid / One Pincer Crab / Kraken / Prince / One Pincer Crab / Big Eye Squid / Dumbo Octopus. Both second ranks are Squid / Fish / Squid / Squid / Squid / Squid / Fish / Squid: six normal Squids with Fish on B and G. Every non-royal starting pair is mirrored across the center. Hermit Crab remains available in guided practice.

| Piece | Notation | Movement |
| --- | --- | --- |
| King Kraken | K | One adjacent square; stays in its palace while its own Prince survives. |
| Kraken Prince | KP | One forward step or one diagonal step in any direction. White advances toward rank 8; Black toward rank 1. |
| Squid | S | One or two forward steps into empty squares; no jumping or captures. Shields the friendly piece directly behind it. |
| Fish | F | One orthogonal step or a two-square diagonal leap. |
| Big Eye Squid | B | Knight leaps plus one orthogonal step. |
| One Pincer Crab | Oc | Diagonal sliding plus a horizontal one-square non-capture step. |
| Dumbo Octopus | Du | Diagonal and vertical sliding. |
| Hermit Crab | H | Horizontal sliding plus one adjacent step. |

All eight movement patterns use the full game's `getValidMovesForPiece`, embedded in the uninterrupted center of its board and clamped to 8×8. Court colors are mapped to preserve forward direction. For Kraken move generation, the adapter suppresses the full board's palace restriction and applies the learner board's own bounds. The full engine still checks Squid shielding for Kraken captures. This leaves the full game's rules unchanged.

## Palaces and victory

White's horizontal 3×2 home palace is C1–E2. Black's is C7–E8. Each Kraken must stay in its palace until its own Prince is captured; then it can roam. Hatched squares mark locked palaces.

Yellow sanctuaries occupy A4/A5 and H4/H5: one column by two central ranks on either edge. Either royal can win by entering either sanctuary. The Prince can do so from the start and remains eligible if its Kraken is captured. Capturing one royal does not win; capturing both opposing royals does. There is no check or checkmate. Threefold repetition, no legal moves, or 1,000 plies draw.

Guided practice allows either color to move and has no terminal result. The Kraken lesson includes its Prince so students can explore confinement and release. The Prince lesson includes a home Kraken. Lessons show moves, captures, and blockers; matches enforce alternating turns. Squids retain their normal shielding of the friendly piece directly behind them. This board omits promotions, bonus turns, and drops.

## Interface and persistence

Eight lessons, original sprites, palace and sanctuary markings, selected-piece explanations, coordinates, captures, history, board flipping, keyboard navigation, undo/redo, and text records. Flipping affects only the view, including palace and sanctuary positions. Online play uses the shared server engine, authenticated seats, refresh recovery, and no undo.

Local journals use `hikoro-academy-local-v3` to avoid interpreting earlier army setups under new setup and victory rules. Earlier saved data remains under its old key. Online rooms clear when the server restarts.

## Verification and deployment

50 collection tests pass, covering both courts' confinement and release, Prince direction, all four sanctuary squares, non-royal exclusion, surviving royalty, random legal play, movement comparisons against full Hikoro, and online synchronization and seat protection. Browser checks cover all lessons, moves, captures, undo/redo, refresh, keyboard and flip controls, mobile/tablet/desktop layouts, and online play.

Preview images are in `docs/academy/`. Deployment uses the existing main branch and Render configuration: root HikoroChess, build npm ci, start npm start, health /health. No new dependencies.
