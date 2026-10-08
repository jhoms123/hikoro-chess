# Mobile tables and readable material surfaces

All six games have a phone action tray, board-focused view, fit/zoom controls (100–300%), two-finger pinch zoom and drag panning when enlarged. Focus mode keeps game panels and reserves accessible below the board, and Options returns to the game settings/actions. Rules and required game actions are mirrored from the original controls; game validation remains in the existing engines. Zoom gestures suppress accidental board actions. Desktop boards, Hikoro artwork and Academy sprites remain unchanged.

Parchment panels, dialogs, Academy lesson copy, Sho Dan Sho rules and reserve labels now use dark text. Dark wooden/stone panels retain light text.

Validation: 57 engine/socket tests; 16 desktop/phone page checks without overflow, broken images, HTTP failures or JavaScript errors; 18 focused mobile checks across six games at 390×844, 320×740 and 740×390. The focused checks include zoom, pinch/pan, game control delegation, mandatory shield handling, and pale-text regression checks on paper panels and dialogs. Run `tools/mobile-table-check.cjs` with Playwright available through NODE_PATH and CHROMIUM_EXECUTABLE pointing to Chromium.

## Storage for future features

- Card demonstrations, rules introductions, lore pages and button animation need no database: ship curated legal move journals and lesson definitions alongside the source.
- Tutorial progress and device preferences can use browser storage. Current local journals already use localStorage. A larger match archive belongs in IndexedDB, with export/import of a versioned JSON record. Browser storage is device/browser-specific and can be cleared; exported records are the backup.
- Durable online rooms need a server database. Render Postgres fits the existing Node/Socket.IO server. Store match ID, game/rules version, setup, canonical state, move sequence, turn/chain phase, reserves, clocks, result, activity dates and hashed seat credentials. Write accepted actions and new state transactionally before broadcasting/acknowledging; restore rooms on startup.
- Cross-device personal archives and synced learning progress require optional accounts to associate those records with a person. Guest local play and guest online seat access can remain available. Authentication must be verified on the server.

Recommended order: versioned portable match records and tutorial progress first; durable online match persistence next; optional account-based synchronization last. Do not place database credentials in browser code. Hosting a persistent database requires a separate configured service; this mobile change does not create one.

Sources: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria · https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API · https://render.com/docs/postgresql · https://render.com/docs/disks
