begin;

create table public.trip_favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, trip_id)
);

create index trip_favorites_trip_id_idx on public.trip_favorites(trip_id);

alter table public.trip_favorites enable row level security;
revoke all on public.trip_favorites from public, anon, authenticated;
grant select, delete on public.trip_favorites to authenticated;
grant insert (user_id, trip_id) on public.trip_favorites to authenticated;

create policy trip_favorites_own_read
on public.trip_favorites for select to authenticated
using (user_id = (select auth.uid()));

create policy trip_favorites_own_insert
on public.trip_favorites for insert to authenticated
with check (user_id = (select auth.uid()));

create policy trip_favorites_own_delete
on public.trip_favorites for delete to authenticated
using (user_id = (select auth.uid()));

commit;
