begin;
-- Login aliases and throttles are server-only; profiles and game privacy stay unchanged.
create table public.hikoro_logins (
  username text primary key check (username ~ '^[a-z][a-z0-9_]{2,23}$'),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  login_email text not null unique check (login_email like '%@username.hikorochess.invalid'),
  created_at timestamptz not null default now()
);
create table public.hikoro_auth_limits (
  attempt_key text primary key check (char_length(attempt_key) <= 80),
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0)
);
alter table public.hikoro_logins enable row level security;
alter table public.hikoro_auth_limits enable row level security;
revoke all on public.hikoro_logins, public.hikoro_auth_limits from anon, authenticated;
grant select, insert, update, delete on public.hikoro_logins, public.hikoro_auth_limits to service_role;
create function public.hikoro_auth_attempt(attempt_keys text[], attempt_limits integer[]) returns boolean
language plpgsql security definer set search_path = '' as $$
declare i integer; count_now integer; allowed boolean := true;
begin
  if cardinality(attempt_keys) not between 1 and 3 or cardinality(attempt_keys) <> cardinality(attempt_limits) then
    raise exception 'Invalid throttle request';
  end if;
  delete from public.hikoro_auth_limits where window_start < now() - interval '1 day';
  for i in 1..cardinality(attempt_keys) loop
    if attempt_limits[i] not between 1 and 100 then raise exception 'Invalid throttle limit'; end if;
    insert into public.hikoro_auth_limits as limits (attempt_key, window_start, attempts)
      values (attempt_keys[i], now(), 1)
    on conflict (attempt_key) do update set
      attempts = case when limits.window_start < now() - interval '15 minutes' then 1 else limits.attempts + 1 end,
      window_start = case when limits.window_start < now() - interval '15 minutes' then now() else limits.window_start end
    returning attempts into count_now;
    allowed := allowed and count_now <= attempt_limits[i];
  end loop;
  return allowed;
end;
$$;
revoke all on function public.hikoro_auth_attempt(text[], integer[]) from public, anon, authenticated;
grant execute on function public.hikoro_auth_attempt(text[], integer[]) to service_role;
commit;
