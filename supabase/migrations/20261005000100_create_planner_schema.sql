begin;

create or replace function public.planner_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.planner_valid_place(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key_name text;
  lat_value numeric;
  lon_value numeric;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' then
    return false;
  end if;
  if jsonb_typeof(p->'provider') is distinct from 'string'
     or (p->>'provider') not in ('kakao', 'manual')
     or jsonb_typeof(p->'name') is distinct from 'string'
     or length(btrim(p->>'name')) = 0
     or jsonb_typeof(p->'latitude') is distinct from 'number'
     or jsonb_typeof(p->'longitude') is distinct from 'number' then
    return false;
  end if;
  lat_value := (p->>'latitude')::numeric;
  lon_value := (p->>'longitude')::numeric;
  if lat_value not between -90 and 90 or lon_value not between -180 and 180 then
    return false;
  end if;
  foreach key_name in array array['placeId', 'address', 'roadAddress', 'category'] loop
    if p ? key_name and jsonb_typeof(p->key_name) not in ('string', 'null') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  co_worker_ids uuid[] not null default '{}'::uuid[],
  name text not null check (length(btrim(name)) > 0),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_date_range_check check (end_date >= start_date)
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  comment text,
  date date not null,
  start_time time without time zone,
  end_time time without time zone,
  place jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_trip_fk foreign key (trip_id)
    references public.trips(id) on delete cascade,
  constraint schedules_time_range_check check (
    start_time is null or end_time is null or end_time > start_time
  ),
  constraint schedules_start_minute_check check (
    start_time is null or extract(second from start_time) = 0
  ),
  constraint schedules_end_minute_check check (
    end_time is null or extract(second from end_time) = 0
  ),
  constraint schedules_place_check check (public.planner_valid_place(place))
);

create trigger trips_updated_at
before update on public.trips
for each row execute function public.planner_set_updated_at();

create trigger schedules_updated_at
before update on public.schedules
for each row execute function public.planner_set_updated_at();

create index schedules_trip_date_idx on public.schedules(trip_id, date);

alter table public.trips enable row level security;
alter table public.schedules enable row level security;

commit;