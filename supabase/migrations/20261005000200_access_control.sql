begin;

create or replace function public.planner_is_google_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.identities i
    where i.user_id = (select auth.uid()) and i.provider = 'google'
  );
$$;

create or replace function public.planner_can_manage_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (t.owner_id = (select auth.uid()) or (select auth.uid()) = any(t.co_worker_ids))
  );
$$;

create or replace function public.planner_validate_trip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_id uuid;
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'Trip owner cannot be changed' using errcode = '42501';
  end if;
  if new.co_worker_ids is null then
    raise exception 'Co-worker list cannot be null' using errcode = '23502';
  end if;
  if cardinality(new.co_worker_ids) <> (
    select count(distinct listed.id)::integer from unnest(new.co_worker_ids) as listed(id)
  ) then
    raise exception 'Co-worker list cannot contain null or duplicate IDs' using errcode = '23514';
  end if;
  foreach worker_id in array new.co_worker_ids loop
    if worker_id is null or worker_id = new.owner_id then
      raise exception 'Owner cannot be listed as a co-worker' using errcode = '23514';
    end if;
    if not exists (
      select 1 from auth.users u
      where u.id = worker_id
        and u.email_confirmed_at is not null
        and exists (
          select 1 from auth.identities i
          where i.user_id = u.id and i.provider = 'google'
        )
    ) then
      raise exception 'Co-worker must have a verified Google account' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.planner_prevent_schedule_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trip_id is distinct from old.trip_id then
    raise exception 'Schedule cannot be moved to another Trip' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trips_validate_owner_and_co_workers
before insert or update on public.trips
for each row execute function public.planner_validate_trip();

create trigger schedules_prevent_trip_move
before update on public.schedules
for each row execute function public.planner_prevent_schedule_move();

revoke all on public.trips from public, anon, authenticated;
revoke all on public.schedules from public, anon, authenticated;
grant select on public.trips to anon, authenticated;
grant insert (name, start_date, end_date, co_worker_ids) on public.trips to authenticated;
grant update (name, start_date, end_date, co_worker_ids) on public.trips to authenticated;
grant delete on public.trips to authenticated;
grant select on public.schedules to anon, authenticated;
grant insert (trip_id, name, comment, date, start_time, end_time, place)
  on public.schedules to authenticated;
grant update (name, comment, date, start_time, end_time, place)
  on public.schedules to authenticated;
grant delete on public.schedules to authenticated;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('trips', 'schedules')
  loop
    execute format('drop policy %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end;
$$;

create policy trips_public_read
on public.trips for select to anon, authenticated
using (true);

create policy trips_google_owner_insert
on public.trips for insert to authenticated
with check (owner_id = (select auth.uid()) and (select public.planner_is_google_user()));

create policy trips_owner_update
on public.trips for update to authenticated
using (owner_id = (select auth.uid()) and (select public.planner_is_google_user()))
with check (owner_id = (select auth.uid()) and (select public.planner_is_google_user()));

create policy trips_owner_delete
on public.trips for delete to authenticated
using (owner_id = (select auth.uid()) and (select public.planner_is_google_user()));

create policy schedules_public_read
on public.schedules for select to anon, authenticated
using (true);

create policy schedules_editor_insert
on public.schedules for insert to authenticated
with check (
  (select public.planner_is_google_user())
  and (select public.planner_can_manage_trip(trip_id))
);

create policy schedules_editor_update
on public.schedules for update to authenticated
using (
  (select public.planner_is_google_user())
  and (select public.planner_can_manage_trip(trip_id))
)
with check (
  (select public.planner_is_google_user())
  and (select public.planner_can_manage_trip(trip_id))
);

create policy schedules_editor_delete
on public.schedules for delete to authenticated
using (
  (select public.planner_is_google_user())
  and (select public.planner_can_manage_trip(trip_id))
);

create or replace function public.lookup_google_user(p_email text, p_trip_id uuid default null)
returns table (id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
begin
  if (select auth.uid()) is null or not (select public.planner_is_google_user()) then
    raise exception 'Google authentication is required' using errcode = '42501';
  end if;
  if normalized_email is null or normalized_email !~ '^[^[:space:]@]+@gmail[.]com$' then
    raise exception 'A complete @gmail.com address is required' using errcode = '22023';
  end if;
  if p_trip_id is not null and not exists (
    select 1 from public.trips t
    where t.id = p_trip_id and t.owner_id = (select auth.uid())
  ) then
    raise exception 'Only the Trip owner can look up co-workers while editing' using errcode = '42501';
  end if;
  return query
  select u.id, u.email::text
  from auth.users u
  where lower(u.email) = normalized_email
    and u.email_confirmed_at is not null
    and exists (
      select 1 from auth.identities i
      where i.user_id = u.id and i.provider = 'google'
    )
  limit 1;
end;
$$;

revoke all on function public.planner_is_google_user() from public;
revoke all on function public.planner_can_manage_trip(uuid) from public;
revoke all on function public.lookup_google_user(text, uuid) from public, anon;
grant execute on function public.planner_is_google_user() to anon, authenticated;
grant execute on function public.planner_can_manage_trip(uuid) to anon, authenticated;
grant execute on function public.lookup_google_user(text, uuid) to authenticated;

commit;