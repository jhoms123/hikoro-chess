# Player accounts

The player journal supports private profiles, one explicit cloud save per game,
device preferences, Academy practice progress, and private match history and replayable records for every game.
All six local tables restore through their current rules; Hikoro restores on the
server as an unranked local game. Hikoro journals are limited to 30 KB to respect
the existing socket message limit; larger games should use Kifu export.
Sho Dan Sho restoration is limited to 1,000 actions.
Local saves are never silently replaced by cloud data. Cloud replacement asks the
player first and uses a revision condition to reject concurrent overwrites.

## Deployment

1. Apply all migrations in `supabase/migrations/` in timestamp order. The existing
   GitHub integration uses repository root `.` and production branch `main`, so
   review the migration before merging. No schema change has been applied during
   development. Database preview branches require a paid Supabase plan and are not used.
2. Add these environment variables to the existing Render service:
   - `SUPABASE_URL=https://huujdhunhkaumwvzmbob.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY`: the project publishable (or legacy anon) key.
   - `SUPABASE_SECRET_KEY`: server-only Supabase secret key (or legacy service-role
     key), required to record verified outcomes. Never put this in HTML or GitHub.
   - `ACCOUNT_PROVIDERS=google` or `github` (or both), only after enabling those
     providers in the Supabase dashboard with matching OAuth app credentials.
   - `ACCOUNT_EMAIL_SIGNUP=true` only after configuring production SMTP. Otherwise
     existing email users can sign in but email sign-up stays hidden.
3. In Supabase Authentication URL Configuration, set the site URL to the production
   website origin and allow its exact `/?account=1` return URL. Add the `www` origin
   only if the website actually uses it. OAuth app callbacks must use Supabase's
   displayed auth callback URL, not the website's return URL.
4. Use `npm ci` and `npm start` in `HikoroChess`. The repo pins Node 24.19.0;
   a Render `NODE_VERSION` variable takes precedence and must be compatible.
5. Test real sign-up/sign-in, two-account privacy, all six saves/restores, a signed-in
   online result, reconnecting the same account, and a rejected wrong-account seat.

## Access rules

Anonymous visitors cannot access the account tables. Authenticated players
can read/create/update only their own profile and saves, and read only their own
results. They cannot write results. Scores are produced only by accepted game
engine terminal states on the server, between distinct authenticated accounts.
Local play, bots, guest opponents, and restored games do not count. The journal
shows win/loss/draw totals from the latest 1,000 results; it does not claim an Elo rating.
Passwords and email verification remain with Supabase Auth, never with our tables.

The server validates login tokens with Supabase Auth and binds account IDs to seats.
Changing accounts cannot inherit an existing account-bound seat. A failed result
write is logged without keys or personal data; it currently has no durable retry
queue, so a service outage can lose a match record. Live rooms still live in memory
and do not survive a Render restart; cloud saves persist independently.

## Public sign-up requirement

Supabase's default email sender refuses delivery to addresses outside the project
team and is intended for testing. Public email sign-up requires custom SMTP.
Google or GitHub OAuth can provide public accounts without an email delivery service.
Documentation: https://supabase.com/docs/guides/auth/auth-smtp

## Validation

`npm test` covers the existing engines/socket behavior plus credential exposure,
verified socket identity, result eligibility/idempotency, account-bound reconnect,
legal/invalid Hikoro restore, and DOM integration for four local game adapters,
save conflicts, and malformed data. The record tests cover all six formats and viewer navigation, original asset paths, Go chain/shield reconstruction, illegal imports, and private history pagination. DOM tests use a fake account service and do
not prove live Supabase policies, real OAuth, mobile geometry, or email delivery.
Live policy and deployment tests remain necessary before release.

## Match library and replay records

`/history.html` lists private account records in pages of 50, filters by game, and
shows recent device records. Guest players get device history without signing in.
Device storage keeps up to 50 records within a roughly 3 MB budget; browser storage
can be cleared. Download important records as `.hikoro.json` files for safekeeping.

Every completed table is captured automatically on its game page. Use Save record
or Player journal → Save replay record to keep an unfinished match or lesson.
Account history starts when this feature is deployed; earlier matches cannot be
recovered because their move journals were not stored. Cloud history uses immutable
practice inserts and server-owned verified records. Guest-opponent online matches
are archived for signed-in players but never count for win/loss scores.

`/replay.html` imports records and offers first/previous/next/last, autoplay, a
position slider, notation selection, board flipping, and downloads. All moves run
through the shared rules, including Hikoro drops, garden placement/pickup, Shavari
formations, and Go chains ending with shields. Artwork stays attributed through
the existing credits page. No generated assets were added.

This is a versioned Kifu-style JSON format for the six custom games, not standard
KIF or SGF. It stores initial setup and accepted actions, including unfinished
chains and lessons. Imported endings are descriptive and never affect scores.
The rules version is pinned to this release; incompatible records are rejected
instead of being silently interpreted under different rules. Imports have a
2 MB / 10,000-action limit. Existing Hikoro text Kifu export remains available.

## Player Hall

Accounts are in the top navigation on every game, history, and replay page.
`/player.html` offers Overview, Profile, Saved Tables, and Settings. `/leaderboard.html`
ranks opted-in players by all-time verified wins, across all games or by game;
equal totals share a rank, and pages contain 50 players. Private account totals
also include every recorded result rather than only the most recent 1,000.

Apply `20261008070000_player_hall.sql` after the earlier migrations. It adds
profile portrait and visibility fields, aggregate-only leaderboard RPCs, a
private all-time totals RPC, and an owner-controlled avatar bucket. Existing
profiles start hidden from public standings. Opt-in exposes only the chosen
name, portrait and aggregate scores; preferences, saves and individual private
records remain private. Profiles are read on sockets with the verified user's
Bearer token, and incoming display names cannot override signed-in identities.
The same identities travel with seats, reconnects, lobby listings and match
records. Updating a profile refreshes active tables.

Portraits can use the six already credited game emblems, or a player's own JPG,
PNG or WebP (maximum input 5 MB / 40 million pixels). Uploads crop centrally to
256 × 256 WebP and have a 256 KB server bucket limit. Portrait paths belong to
the uploader; SVG/HTML uploads and arbitrary external image URLs are excluded.
Portrait images are public so opponents can see them; the UI says this before
upload. Replacements delete the previous file after the profile save succeeds.
No AI artwork is created.

Password reset uses Supabase email delivery. Add the exact production
`/player.html?reset=1` URL to Auth redirect URLs and configure SMTP if offering
email recovery/signup publicly. OAuth users sign in with their configured
provider. Neither this migration nor the UI configures OAuth/SMTP/server keys.

Validation includes DOM profile editing, upload validation and central cropping,
all six authenticated seat identities, token-scoped profile reads, filter and
pagination behavior. The migrations were also executed in a local PostgreSQL
runtime with test Auth/Storage schemas: public ranking/ties, profile privacy,
client score-write denial, own-avatar paths/uploads, and own all-time totals
passed. Production Supabase integration and browser layout still require live
verification.
