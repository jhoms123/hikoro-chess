alter table public.hikoro_profiles
 add column favorite_games text[] not null default '{}'
 check (favorite_games <@ array['hikoro','shodansho','shavari','hikoruka','go','academy']::text[] and cardinality(favorite_games)<=6),
 add column tutorial_progress jsonb not null default '{}' check(octet_length(tutorial_progress::text)<=8192);
create table public.hikoro_annotations (
 user_id uuid not null references auth.users(id) on delete cascade,
 match_id text not null check(length(match_id) between 1 and 100),
 notes jsonb not null check(octet_length(notes::text)<=32768),
 updated_at timestamptz not null default now(), primary key(user_id,match_id)
);
alter table public.hikoro_annotations enable row level security;
create policy own_annotations on public.hikoro_annotations for all to authenticated
 using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update,delete on public.hikoro_annotations to authenticated;
create table public.hikoro_shared_records (
 token uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 match_id text not null check(length(match_id) between 1 and 100),
 record jsonb not null check(octet_length(record::text)<=2097152),
 notes jsonb not null default '{}' check(octet_length(notes::text)<=32768),
 created_at timestamptz not null default now(), unique(user_id,match_id)
);
alter table public.hikoro_shared_records enable row level security;
create policy own_shared_records on public.hikoro_shared_records for all to authenticated
 using(auth.uid()=user_id) with check(auth.uid()=user_id);
grant select,insert,update,delete on public.hikoro_shared_records to authenticated;
-- A random link exposes exactly one opted-in snapshot, never its owner's private journal.
create function public.hikoro_shared_record(share_token uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('record',record,'notes',notes)
 from public.hikoro_shared_records where token=share_token;
$$;
revoke all on function public.hikoro_shared_record(uuid) from public;
grant execute on function public.hikoro_shared_record(uuid) to anon,authenticated;
