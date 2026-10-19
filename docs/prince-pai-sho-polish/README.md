# Parchment, timber, and Prince Pai Sho

This pass applies the existing parchment texture, dark printed text, and timber surrounds to action controls throughout the collection, including phone toolbars, account controls, practice pages, and journals. Board squares and reserve pieces are excluded from action-button material styling. Inputs, panel text, selected states, and small reserve labels have clearer contrast.

Fourfold Garden is presented as Prince Pai Sho in the homepage, game, room list, journal, records, help, and English/Cuban Spanish catalogs. Internal game IDs, save formats, event names, and the existing URL remain compatible.

Harmony colors form larger peripheral inlays around the existing piece emblems. The inner face remains clear; Ivory and Indigo retain distinct light/dark faces and contrasting symbols. Harmony glow is reduced so it does not wash out the affinity colors.

All ten homepage cards, hero samples, and selected-table images now use captures from the current application after accepted legal actions. Academy shows a teaching match rather than a movement lesson. Sho Dan Sho shows eighteen accepted placements; Prince Pai Sho shows an eight-piece position. The match-capture manifest is in public/assets/collection/matches/current-preview-validation.json, and tools/capture-current-previews.cjs reproduces the captures (Playwright, Chromium, and Pillow required). Existing credited artwork is retained.

Validation: 40 page/viewport checks across 20 pages at 320 and 1440 pixels, with no page-wide overflow or uncaught JavaScript errors; representative 390-pixel pages were inspected as well. Five focused navigation, preview-format, asset-link, and response-security checks passed. The broad run passed 287/307 tests, with the 19 previously known failures plus a socket timing failure under concurrent browser load. The isolated online Hikorüka retry passed. The standalone spectator test now passes with its material textures embedded instead of external CSS/JS references. The Prince Pai Sho gameplay/translation suite has only its pre-existing engraved-icon CSS assertion failure; the new rim explanation and existing mechanics pass.
