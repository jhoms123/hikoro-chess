# Approved material-themed website design

Review branch: `codex/material-match-preview`, based on `main` at c7c08595415a2bc9ec98774e956cf2962f8918cc. Approved by the repository owner. These screenshots were captured before implementation. The prior icon-card design and replacement ocean pieces are removed from the final diff.

## Design

- Home: dark photographed timber, a torn-parchment introduction, and six real match previews. Hero imagery is also actual board screenshots.
- Hikoro: ocean mineral background, pearl controls, parchment rules and a red resignation seal. Original board, piece sprites and game renderer preserved.
- Sho Dan Sho: garden manuscript, torn-paper controls, wooden flower trays and botanical action emblems.
- Shavari: turquoise mineral plates, carnelian accents and a geometric court frame.
- Hikorüka: timber cabinet, carved wooden controls and ivory piece medallions.
- Shield Go: stone tablets and an existing wooden playing table.
- Academy: parchment lesson pages with original 8 × 8 pieces and sprite rendering retained.

New physical textures are photographed, human-authored materials. No AI-generated artwork is included. Artist names, source links, modifications and licenses are in `credits.html` and `assets/collection/CREDITS.md`. Original Hikoro artwork and supplied garden artwork have no original artist metadata recorded in the repository; no new authorship claim is made.

## Every page

| Page | Desktop | Phone |
| --- | --- | --- |
| Home | [Preview](home-desktop.webp) | [Preview](home-phone.webp) |
| Full Hikoro | [Preview](hikoro-desktop.webp) | [Preview](hikoro-phone.webp) |
| Sho Dan Sho | [Preview](shodansho-desktop.webp) | [Preview](shodansho-phone.webp) |
| Shavari | [Preview](shavari-desktop.webp) | [Preview](shavari-phone.webp) |
| Hikorüka | [Preview](hikoruka-desktop.webp) | [Preview](hikoruka-phone.webp) |
| Shield Go | [Preview](go-desktop.webp) | [Preview](go-phone.webp) |
| Academy | [Preview](academy-desktop.webp) | [Preview](academy-phone.webp) |
| Artist credits | [Preview](credits-desktop.webp) | [Preview](credits-phone.webp) |

## Validation

- 53 existing engine, online, replay, and audio tests pass (`cd HikoroChess && npm test`).
- Full Hikoro `script.js` and Academy `academy-ui.js` are byte-identical to main. No protected sprite files or their existing stylesheets were modified.
- Full Hikoro playing-grid screenshot is pixel-identical to the original at the same viewport and initial state.
- Real match screenshot positions: 4 Hikoro moves, 18 garden drops, 6 Shavari moves, 6 Hikorüka moves, 14 Go placements, 6 Academy moves. The capture process uses existing controls or engine-validated actions. Source positions recorded in `assets/collection/matches/positions.json`.
- Chromium screenshots: 1440 × 1140 desktop and 390 × 844 phone, full-page captures, reduced motion.
- All 16 pages: no horizontal overflow, missing image resources, failed HTTP requests, or uncaught JavaScript errors. See `validation.json`.
- Browser smoke checks: all six cards select the corresponding game and match image; Go placement, undo, and redo work at both sizes.
- Garden delivery assets: 38,657,835 → 782,492 bytes (about 98% smaller), original files retained.
- All boards remain playable; no game rule changes.

Run `tools/visual-preview.cjs` with Playwright installed and `CHROMIUM_EXECUTABLE` set to a Chromium binary (omit for Playwright’s installed Chromium). It starts and closes its own app server. `tools/capture-match-previews.cjs` reproduces the match-card screenshots. Run `python tools/build-preview-assets.py` with Pillow to reproduce garden delivery copies. `python tools/import-sourced-artwork.py` downloads the credited upstream icons and photographed material textures. EB Garamond is supplied unchanged with its SIL OFL license.

## Later work

- Substitute the user’s forthcoming Hikoro and Academy piece artwork only after it is supplied.
- Recover original game-art artist names and source licenses.
- Add a short first-game tutorial and accessible piece legends.
