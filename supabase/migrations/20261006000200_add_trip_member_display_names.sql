begin;

create or replace function public.get_trip_member_display_names(p_trip_id uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      '使用者 ' || left(member.id::text, 8)
    ) as display_name
  from public.trips t
  cross join lateral unnest(array_prepend(t.owner_id, t.co_worker_ids)) as member(id)
  join auth.users u on u.id = member.id
  where t.id = p_trip_id
  order by case when member.id = t.owner_id then 0 else 1 end, member.id;
$$;

revoke all on function public.get_trip_member_display_names(uuid) from public;
grant execute on function public.get_trip_member_display_names(uuid) to anon, authenticated;

commit;
