begin;
create table public.hikoro_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 30),
  preferences jsonb not null default '{}' check (jsonb_typeof(preferences) = 'object' and octet_length(preferences::text) <= 8192),
  academy_progress jsonb not null default '{}' check (jsonb_typeof(academy_progress) = 'object' and octet_length(academy_progress::text) <= 8192)
);
create table public.hikoro_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_type text not null check (game_type in ('hikoro','shodansho','shavari','hikoruka','go','academy')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 524288),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_type)
);
create table public.hikoro_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null check (char_length(game_id) <= 64),
  game_type text not null check (game_type in ('hikoro','shodansho','shavari','hikoruka','go','academy')),
  outcome text not null check (outcome in ('win','loss','draw')),
  reason text not null check (char_length(reason) <= 160),
  completed_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index hikoro_results_recent on public.hikoro_results (user_id, completed_at desc);
alter table public.hikoro_profiles enable row level security;
alter table public.hikoro_saves enable row level security;
alter table public.hikoro_results enable row level security;
revoke all on public.hikoro_profiles, public.hikoro_saves, public.hikoro_results from anon, authenticated;
grant select, insert, update on public.hikoro_profiles, public.hikoro_saves to authenticated;
grant select on public.hikoro_results to authenticated;
grant select, insert, update, delete on public.hikoro_profiles, public.hikoro_saves, public.hikoro_results to service_role;
create policy profile_read on public.hikoro_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profile_create on public.hikoro_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profile_update on public.hikoro_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy save_read on public.hikoro_saves for select to authenticated using ((select auth.uid()) = user_id);
create policy save_create on public.hikoro_saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy save_update on public.hikoro_saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy result_read on public.hikoro_results for select to authenticated using ((select auth.uid()) = user_id);
commit;
