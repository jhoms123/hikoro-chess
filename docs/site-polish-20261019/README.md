# Collection interface polish — October 19, 2026

The collection now has a shared navigation row with consistent Collection, How to play, Options, and Move history entry points wherever those actions exist. Links activate the original rules control or reveal and focus the original settings/history panel, including collapsed mobile disclosures. The mobile game shell keeps rules and exit available and traps keyboard focus inside its options drawer.

Mobile boards use available width and the page can scroll vertically rather than shrinking boards to the remaining screen height. Controls have larger touch targets. City Battle supports readable inspection through its existing larger-board mode; the large board remains contained in its own viewport. Sidebars on desktop follow normal page scrolling. Secondary garden text has stronger contrast. Practice editions share the navigation and typography, and the legacy bot arena no longer overflows narrow screens.

Browser-discovered runtime fixes:

- Fourfold Garden has an audio theme pointing to the existing Sho Dan Sho soundtrack, avoiding the missing-theme exception.
- Fourfold's engine is enclosed in a function scope so its constants coexist with Sho Dan Sho on the replay page. The CommonJS and browser engine exports are preserved.
- The mobile layout adapter only builds Hikoro controls when the Hikoro wrapper exists, avoiding the credits-page exception.

Validation:

- 60 page/viewport checks: 20 routes at 320, 390, and 1440 pixels. Final results have no page-wide overflow or uncaught JavaScript errors. See `layout-validation.json`. Oversized boards intentionally pan within their viewport; the review iframe intentionally embeds a desktop preview.
- Browser interaction checks exercised accepted opening moves in Academy, Hikorüka, Šavari chess, Shield Go, Fourfold Garden, Valley Hunt, City Battle, Sho Dan Sho, full Hikoro, and the four-placement Šavari Go opening. Mobile options opened and closed with Escape; City Battle's enlarged board scrolled within its viewport.
- Final full suite: 307 tests, 288 passed, 19 failed. Untouched starting commit `19d9a99` ran 305 tests, 286 passed, with the same 19 failures. No new failures were introduced. The new navigation and cross-engine replay regression tests pass.
- Existing failures include outdated rule/style assertions, localization catalog coverage, and bot/room checks. This release does not claim those existing checks are fixed or that every endgame has been exhaustively tested.

Artwork and game rules are retained. All changed executable JavaScript passed syntax checks; the diff passed whitespace checks.
