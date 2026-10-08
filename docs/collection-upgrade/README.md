# Collection upgrade review

This branch adds restart-safe online rooms, invite links and unanimous rematches; all-six-game guided introductions; improved mobile precision controls; private replay titles, bookmarks and move comments; explicit revocable replay sharing; favorite games, per-game records and learning milestones; and display/accessibility preferences.

Boards, supplied sprites, 8×8 starting positions, artist credits and the Shield Go mandatory shield rule are preserved.

## Review service

Run `SITE_REVIEW_MODE=true npm start` inside HikoroChess for an isolated preview. The banner identifies sample journals/standings. Sample profiles, notes and share links are stored in this preview browser only. The service has no production database credentials; all actual online preview matches are guest practice. This mode refuses database writes even if keys are accidentally supplied.

Review the home collection, all six tables, Player Hall, history, replay and standings on desktop and mobile. Each table has a guided introduction and Display & access controls. The dense boards retain Fit / Larger / Move view controls with Find selection. Garden text controls use the same legal vertex-selection methods as its canvas.

## Production rollout after approval

1. Merge this branch only after the page previews are approved.
2. Let the existing Supabase GitHub integration apply `20261008150000_collection_rooms.sql` and `20261008160000_collection_journals.sql`. Confirm both migrations exist before deploying the server. No new account provider or paid database is required.
3. Deploy main to the existing Render service. Keep the existing Supabase public/server keys and account-origin allowlist. Do not enable `SITE_REVIEW_MODE` in production.
4. `/health` reports `rooms: durable`; the service rejects socket connections until private rooms load. Verify a two-player table, disconnect/resume, a server restart, a rematch, private journal notes and explicit share/revoke on the live host.

Old in-memory tables cannot survive the first deployment of this change. Later deployments restore durably committed rooms. Waiting tables expire after 30 minutes, active tables after 6 hours without activity, finished tables after 1 hour. Clocks continue during disconnects/server downtime. Accepted actions are announced only after the room transaction succeeds. Storage failure restores the previous board and asks the player to retry. Supabase free-tier capacity still bounds total storage.

Verified terminal result writes retry on restoration (their existing composite primary key keeps retries idempotent). Private seat tokens/account bindings live in a service-role-only table and never appear in public game state. The server runs one command at a time; do not run multiple active server instances against these room snapshots without adding per-room database leases first.

Notes are stored separately from immutable match actions/results. Anonymous replay access requires an explicitly created random token and returns only that one shared snapshot. Revocation prevents future loads; already downloaded records cannot be recalled. Practice milestones, imported records and shared records never affect standings.

## Email delivery

Existing username/password (no email) and GitHub accounts remain available. Public email signup and password-recovery mail still need a connected email provider and a verified sending domain. Do not enable ACCOUNT_EMAIL_SIGNUP until SMTP has been configured and verified. Username-only users cannot recover a forgotten password without an email.

## Validation

Run `npm test` inside HikoroChess. Restart tests replace the actual server for all six engines, then restore a private seat and accepted journal. Storage-failure tests verify rollback before acceptance. Guided introduction tests require an accepted board action rather than a pass/resignation, followed by three gated checks covering captures, special rules and winning conditions. Incorrect answers show rule-specific feedback; milestones wait for all four objectives. Hikorüka lessons use the current Sovereign, Castellan, Archer, Cavalier and Squire names. Replay and identity tests retain original assets, private account ownership and score validation.

The two SQL migrations were executed with Postgres/PGlite; owner isolation, room grants, transactional rollback, anonymous exact-token access and share revocation were verified. Production migrations have not been applied during preview review.
