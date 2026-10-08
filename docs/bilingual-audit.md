# English and Cuban Spanish update and website audit

Audit date: October 8, 2026. Repository: jhoms123/hikoro-chess. Production: https://www.hikorochess.org/.

## Language support

Every page has an English / Español (Cuba) selector. The es-CU choice is saved on the device, survives navigation, and synchronizes with other open tabs. `?lang=es-CU` or `?lang=en` opens a page in that language. Switching only changes presentation: moves, clocks, selected pieces, form values, comments, player names, imported records and notation retain their data.

The catalog covers all 13 HTML pages, game rules, piece guides, all six interactive introductions and their knowledge checks, account access/profile/settings, invitations and rematches, connection/errors, mobile/accessibility controls, history, replay, private annotations, sharing and credits. Game brands, artwork attribution names, notation and user content are preserved. Spanish uses Cuban regional language conventions, tú, computadora and natural everyday phrasing without forced slang. The language identifier and document language are es-CU.

Maintain `HikoroChess/public/locales/es-CU.json` and `es-CU-patterns.json`; regenerate the shipped synchronous catalog with `node scripts/build-locales.js` from HikoroChess. The catalog does not depend on an external translation API. HTML coverage and generated-catalog tests prevent missing static translations or stale generated files.

## Fixes from the audit

- Password-reset Settings selection uses the stable tab identifier instead of an English button label.
- Captured-piece selection uses piece data instead of translated image alt text. Highlight hints retain the original accessibility label for clean language reversals.
- Player identities, user match titles and freeform comments are protected from interface translation.
- Socket.IO verifies allowed browser origins for both polling and WebSocket handshakes. Explicit ALLOWED_ORIGINS and Render's RENDER_EXTERNAL_URL support the approved deployment hosts. Origin-less nonbrowser clients remain supported; origin checks supplement private seat tokens and account binding.
- Responses include nosniff, strict-origin referrer policy, disabled camera/microphone/geolocation, and CSP base-uri/object/frame restrictions. Existing game assets, audio, scripts and Supabase authentication remain permitted.
- Migration `20261008180000_journal_policy_performance.sql` caches auth.uid() per statement in journal annotation/share ownership policies. No ownership or grants change. Applied to production through Supabase on October 8; both performance warnings cleared. The ALTER POLICY statements are safe to repeat when the GitHub integration records the checked-in migration.

## Connections and privacy verified

| Area | Evidence | Result |
| --- | --- | --- |
| GitHub | main commit a0ac3c7; repository and branch access | Accessible; isolated change branch |
| Render | live service, application error logs, public health requests | Service healthy, no recent application errors; durable rooms |
| Domains | browser visit to hikorochess.org redirects to www.hikorochess.org | Working redirect and HTTPS |
| Online transport | production browser shows Connected · Ready to play | Working browser connection |
| Supabase | production config and live public API requests | Correct project; publishable key only in browser configuration |
| Account providers | production configuration | GitHub and username/password enabled; email signup disabled |
| Private data | all nine public hikoro tables have RLS; ownership policies and anonymous API requests | Private saves, results, matches, notes, room snapshots and username directory not readable anonymously |
| Sharing | SECURITY DEFINER function source and invalid-token request | Returns only the exact explicitly shared snapshot; invalid token returns null |
| Leaderboard | function source and live public call | Only opted-in display identity and totals; 50-row pagination; no account identifiers |
| Room persistence | six real-server replacement tests, transaction rollback and seat isolation tests | Accepted moves survive replacement; private seats required; storage failure does not announce acceptance |
| Rematches | unanimous seated consent and rotation tests | Outsiders rejected; all players must accept and reconnect |
| Resources | all authored local HTML links/scripts/styles/images checked | All resolve to shipped files or defined routes |
| Dependencies | npm audit --omit=dev | Zero reported production vulnerabilities |

Anonymous requests to notes/share tables returned zero rows, and restricted save/result/match/room/login/throttle endpoints returned permission errors. One profile request timed out; its isolation was checked from live SQL policies. No production accounts were created, no user records were altered, and no secrets were exported. Shell transport attempts were limited by the execution network; the actual browser confirmed the production connection.

## Remaining setup and audit limits

1. SMTP and a verified sending domain are still required for public email signup and password recovery. Username-only accounts cannot recover a forgotten password without an email. The existing disabled-signup message accurately describes this. A real mail delivery test cannot pass until mail is connected.
2. Leaked-password protection remains disabled on the existing Supabase Free plan. Supabase makes that feature available on Pro and above: https://supabase.com/docs/guides/auth/password-security. No paid plan or billing change was made.
3. SECURITY DEFINER advisor notices for leaderboard and exact-token sharing are intentional public endpoints with fixed empty search_path and limited output. The three no-policy notices are intentional denial for service-only room/login/throttle tables. An unused result index is informational and was retained for future standings traffic.
4. Actual GitHub OAuth completion, real-account password recovery, authenticated production portrait uploads and two-real-account mail/score flows were not exercised with user credentials. Automated account, isolation, upload, score validation and recovery-tab tests cover their implementation; they do not substitute for a real provider callback or mail delivery.
5. The application uses one Render server instance. Multiple active instances would need database leases before horizontally scaling durable snapshots. Audit verification did not restart the live production server or interrupt user matches.

## Review and rollout

The isolated hosted review uses SITE_REVIEW_MODE=true and has no production database keys. Its account journal and standings are sample data; online games are guest practice. Review translated desktop and phone pages before merging this localization branch. Once approved, merge and deploy main to the existing production Render service; do not enable review mode in production. Check /health, a browser connection, both language choices, a local move and a resumed online seat after rollout.

Validation: 132 automated tests pass, including all authored page text/accessibility coverage, generated rulebook/audio/credit translations, local-state preservation, cross-tab language changes and origin rejection. Hosted phone review also verified English restoration without clearing selection.

Final verification includes the garden’s generated keyboard controls, hand labels, and canvas error messages.
