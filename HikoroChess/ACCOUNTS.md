# Player accounts

The player journal supports private profiles, one explicit cloud save per game,
device preferences, Academy practice progress, and verified online match history.
All six local tables restore through their current rules; Hikoro restores on the
server as an unranked local game. Hikoro journals are limited to 30 KB to respect
the existing socket message limit; larger games should use Kifu export.
Sho Dan Sho restoration is limited to 1,000 actions.
Local saves are never silently replaced by cloud data. Cloud replacement asks the
player first and uses a revision condition to reject concurrent overwrites.

## Deployment

1. Apply `supabase/migrations/20261008050000_player_accounts.sql` once. The existing
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

Anonymous visitors cannot access any of the three tables. Authenticated players
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
save conflicts, and malformed data. DOM tests use a fake account service and do
not prove live Supabase policies, real OAuth, mobile geometry, or email delivery.
Live policy and deployment tests remain necessary before release.
