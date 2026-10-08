# Mobile game layouts

The mobile redesign replaces the fixed, duplicated action tray with the original game controls arranged for each game. There is no custom pinch recognizer, transformed board layer, absolute board-height bookkeeping, or board-focus mode. Browser page zoom remains enabled. Boards and piece assets are unchanged.

| Game | Phone adaptation |
| --- | --- |
| Collection | Compact match-preview cards; selecting a game scrolls directly to setup; sound moved into a disclosure. |
| Full Hikoro | Original 10×16 artwork resized through its square-size variables; compact clock/hand panels; nearby rules/menu; move history folded; optional larger board and safe view navigation. |
| Academy | Original 8×8 pieces and board; lesson selector above the board; selected-piece explanation and lesson tip together; setup, history, captures and guides folded. |
| Hikorüka | Naturally fitted 5×5 board with large squares; status above and piece detail below; setup, captures and history folded. No unnecessary zoom toolbar. |
| Shavari | Original stack-mode controls moved above the board and kept sticky while scrolling; selected formation below; optional larger view. |
| Shield Go | Shield/pass/deselect controls above the board and sticky while scrolling; 13×13 starts enlarged; scores/history/setup folded. Jump-chain shielding rules unchanged. |
| Sho Dan Sho | Active flower hand above the garden as a horizontal reserve row; other hands can be revealed; real pick-up/cancel controls beside the table; touch descriptions; pointer activation occurs on completed click/tap rather than mousedown. |

Larger views scroll within the board viewport. **Move view** disables game input and uses native scrolling; **Tap to play** restores selection and movement. **Fit board** restores the overview. No global fixed bottom tray covers board cells. Secondary settings use native details elements and preserve all original controls/listeners. Desktop transitions restore source nodes to their original positions, including lesson controls, hands and audio. Academy/Hikorüka player-strip reorder operations use the viewport boundary so flipping cannot move player strips into the enlarged board.

Controls aim for a 44px minimum height. Dense board locations retain precise geometry; the larger view offers larger targets. Parchment retains dark ink, jade/wood retain light text, and stone buttons have a lighter texture overlay for readable dark labels. Inputs use 16px text on phones.

Validation: `npm test` checks the 57 existing engine/socket tests. `tools/mobile-table-check.cjs` exercises all six games at 390×844, 320×740 and 740×390 using real touch events, legal moves, Shield Go chains, 13×13 setup, stack modes, flower drops, lesson changes, board flipping, view navigation, resize restoration, rules access and horizontal-overflow checks. It writes screenshots and a results JSON to `docs/mobile-redesign`. Chromium/Playwright emulation is not a physical iOS/Android device test.

Design references: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html · https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action

## Storage for future features

- Card demonstrations, rules introductions, lore pages and button animation need no database: ship curated legal move journals and lesson definitions alongside the source.
- Tutorial progress and device preferences can use browser storage. Current local journals already use localStorage. A larger match archive belongs in IndexedDB, with export/import of a versioned JSON record. Browser storage is device/browser-specific and can be cleared; exported records are the backup.
- Durable online rooms need a server database. Render Postgres fits the existing Node/Socket.IO server. Store match ID, game/rules version, setup, canonical state, move sequence, turn/chain phase, reserves, clocks, result, activity dates and hashed seat credentials. Write accepted actions and new state transactionally before broadcasting/acknowledging; restore rooms on startup.
- Cross-device personal archives and synced learning progress require optional accounts to associate those records with a person. Guest local play and guest online seat access can remain available. Authentication must be verified on the server.

Recommended order: versioned portable match records and tutorial progress first; durable online match persistence next; optional account-based synchronization last. Do not place database credentials in browser code. Hosting a persistent database requires a separate configured service; this mobile change does not create one.

Sources: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria · https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API · https://render.com/docs/postgresql · https://render.com/docs/disks
