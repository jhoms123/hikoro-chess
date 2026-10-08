-- Private restart-safe online rooms. All writes use the trusted game server.
create table public.hikoro_rooms (
 id text primary key check (id ~ '^(game|sp)_[a-f0-9]{16}$'),
 snapshot jsonb not null check (octet_length(snapshot::text) <= 4194304),
 expires_at timestamptz not null,
 updated_at timestamptz not null default now()
);
create index hikoro_rooms_expiry on public.hikoro_rooms(expires_at);
alter table public.hikoro_rooms enable row level security;
revoke all on public.hikoro_rooms from anon, authenticated;
grant all on public.hikoro_rooms to service_role;
create function public.hikoro_commit_rooms(room_rows jsonb, removed_ids text[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
 delete from public.hikoro_rooms where id = any(removed_ids) or expires_at < now();
 insert into public.hikoro_rooms(id,snapshot,expires_at)
 select r->>'id',r->'snapshot',(r->>'expires_at')::timestamptz
 from jsonb_array_elements(room_rows) r
 on conflict(id) do update set snapshot=excluded.snapshot,expires_at=excluded.expires_at,updated_at=now();
end; $$;
revoke all on function public.hikoro_commit_rooms(jsonb,text[]) from public, anon, authenticated;
grant execute on function public.hikoro_commit_rooms(jsonb,text[]) to service_role;
