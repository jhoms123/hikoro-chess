begin;
create table public.hikoro_matches (
 user_id uuid not null references auth.users(id) on delete cascade,
 match_id text not null check (char_length(match_id) between 1 and 80),
 game_type text not null check (game_type in ('hikoro','shodansho','shavari','hikoruka','go','academy')),
 record jsonb not null check (jsonb_typeof(record)='object' and octet_length(record::text)<=2000000),
 verified boolean not null default false,
 recorded_at timestamptz not null default now(),
 primary key(user_id,match_id)
);
create index hikoro_matches_recent on public.hikoro_matches(user_id,recorded_at desc,match_id);
alter table public.hikoro_matches enable row level security;
revoke all on public.hikoro_matches from anon,authenticated;
grant select,insert on public.hikoro_matches to authenticated;
grant select,insert,update,delete on public.hikoro_matches to service_role;
create policy match_read on public.hikoro_matches for select to authenticated using ((select auth.uid())=user_id);
create policy practice_match_create on public.hikoro_matches for insert to authenticated with check ((select auth.uid())=user_id and verified=false);
commit;
