begin;
alter table public.hikoro_profiles
 add column avatar_icon text not null default 'hikoro' check(avatar_icon in ('hikoro','shodansho','shavari','hikoruka','go','academy')),
 add column avatar_path text check(avatar_path is null or avatar_path ~ ('^' || user_id::text || '/[0-9a-f-]{36}\.webp$')),
 add column leaderboard_visible boolean not null default false;
create index hikoro_results_game on public.hikoro_results(game_type,user_id,outcome);
-- Expose only chosen public identities and aggregate verified results. Private profiles stay private.
create function public.hikoro_leaderboard(game_filter text default null, page_offset integer default 0)
returns table(place bigint, display_name text, avatar_icon text, avatar_path text, wins bigint, losses bigint, draws bigint, matches bigint)
language sql stable security definer set search_path = '' as $$
 with totals as (
 select p.user_id,p.display_name,p.avatar_icon,p.avatar_path,
 count(*) filter(where r.outcome='win') as wins,
 count(*) filter(where r.outcome='loss') as losses,
 count(*) filter(where r.outcome='draw') as draws,count(*) as matches
 from public.hikoro_profiles p join public.hikoro_results r on r.user_id=p.user_id
 where p.leaderboard_visible and (game_filter is null or r.game_type=game_filter)
 group by p.user_id,p.display_name,p.avatar_icon,p.avatar_path
 ), ranked as (select *,dense_rank() over(order by wins desc) as place from totals)
 select place,display_name,avatar_icon,avatar_path,wins,losses,draws,matches from ranked
 order by wins desc,display_name,user_id limit 50 offset greatest(0,page_offset);
$$;
revoke all on function public.hikoro_leaderboard(text,integer) from public;
grant execute on function public.hikoro_leaderboard(text,integer) to anon,authenticated,service_role;
create function public.hikoro_my_totals()
returns table(game_type text,wins bigint,losses bigint,draws bigint,matches bigint)
language sql stable security invoker set search_path = '' as $$
 select r.game_type,count(*) filter(where r.outcome='win'),count(*) filter(where r.outcome='loss'),count(*) filter(where r.outcome='draw'),count(*)
 from public.hikoro_results r where r.user_id=(select auth.uid()) group by r.game_type;
$$;
revoke all on function public.hikoro_my_totals() from public;
grant execute on function public.hikoro_my_totals() to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('hikoro-avatars','hikoro-avatars',true,262144,array['image/webp'])
 on conflict(id) do update set public=true,file_size_limit=262144,allowed_mime_types=array['image/webp'];
create policy avatar_upload on storage.objects for insert to authenticated
 with check(bucket_id='hikoro-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f-]{36}\.webp$'));
create policy avatar_owner_read on storage.objects for select to authenticated
 using(bucket_id='hikoro-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy avatar_owner_delete on storage.objects for delete to authenticated
 using(bucket_id='hikoro-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
