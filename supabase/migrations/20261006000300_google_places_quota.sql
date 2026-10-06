begin;

create table public.google_places_quota_config (
  id smallint primary key default 1 check (id = 1),
  monthly_request_limit integer not null default 4000 check (monthly_request_limit > 0),
  user_request_limit integer not null default 20 check (user_request_limit > 0),
  user_window_seconds integer not null default 60 check (user_window_seconds > 0),
  updated_at timestamptz not null default now()
);

insert into public.google_places_quota_config (id)
values (1)
on conflict (id) do nothing;

create table public.google_places_monthly_usage (
  month_start date primary key,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create table public.google_places_user_rate_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.google_places_quota_config enable row level security;
alter table public.google_places_monthly_usage enable row level security;
alter table public.google_places_user_rate_usage enable row level security;

revoke all on public.google_places_quota_config from public, anon, authenticated;
revoke all on public.google_places_monthly_usage from public, anon, authenticated;
revoke all on public.google_places_user_rate_usage from public, anon, authenticated;

create or replace function public.reserve_google_places_search(
  p_user_id uuid,
  p_trip_id uuid
)
returns table (
  allowed boolean,
  reason text,
  monthly_remaining integer,
  user_remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $reserve_google_places$
declare
  quota_config public.google_places_quota_config%rowtype;
  trip_owner_id uuid;
  trip_co_worker_ids uuid[];
  current_time_utc timestamptz := clock_timestamp();
  current_month_start date;
  next_month_start timestamptz;
  monthly_count integer;
  rate_window_start timestamptz;
  rate_count integer;
  rate_window_end timestamptz;
  wait_seconds integer;
begin
  if p_user_id is null or p_trip_id is null then
    raise exception 'User and Trip are required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from auth.users u
    join auth.identities i on i.user_id = u.id
    where u.id = p_user_id
      and u.email_confirmed_at is not null
      and i.provider = 'google'
  ) then
    raise exception 'A verified Google account is required' using errcode = '42501';
  end if;

  select t.owner_id, t.co_worker_ids
  into trip_owner_id, trip_co_worker_ids
  from public.trips t
  where t.id = p_trip_id;
  if not found then
    raise exception 'Trip not found' using errcode = 'P0002';
  end if;
  if p_user_id <> trip_owner_id and not (p_user_id = any(trip_co_worker_ids)) then
    raise exception 'Trip Owner or Co-Worker membership is required' using errcode = '42501';
  end if;

  select * into quota_config
  from public.google_places_quota_config
  where id = 1
  for share;
  if not found then
    raise exception 'Google Places quota configuration is missing' using errcode = '55000';
  end if;

  current_month_start := date_trunc('month', current_time_utc at time zone 'UTC')::date;
  next_month_start := (current_month_start + interval '1 month')::timestamp at time zone 'UTC';

  insert into public.google_places_monthly_usage(month_start, request_count)
  values (current_month_start, 0)
  on conflict (month_start) do nothing;

  select usage.request_count into monthly_count
  from public.google_places_monthly_usage usage
  where usage.month_start = current_month_start
  for update;

  insert into public.google_places_user_rate_usage(user_id, window_started_at, request_count)
  values (p_user_id, current_time_utc, 0)
  on conflict (user_id) do nothing;

  select usage.window_started_at, usage.request_count
  into rate_window_start, rate_count
  from public.google_places_user_rate_usage usage
  where usage.user_id = p_user_id
  for update;

  if monthly_count >= quota_config.monthly_request_limit then
    wait_seconds := greatest(1, ceil(extract(epoch from (next_month_start - current_time_utc)))::integer);
    return query select
      false,
      'project_monthly_limit'::text,
      0,
      greatest(0, quota_config.user_request_limit - rate_count),
      wait_seconds;
    return;
  end if;

  rate_window_end := rate_window_start + make_interval(secs => quota_config.user_window_seconds);
  if current_time_utc >= rate_window_end then
    rate_window_start := current_time_utc;
    rate_count := 0;
  elsif rate_count >= quota_config.user_request_limit then
    wait_seconds := greatest(1, ceil(extract(epoch from (rate_window_end - current_time_utc)))::integer);
    return query select
      false,
      'user_rate_limit'::text,
      quota_config.monthly_request_limit - monthly_count,
      0,
      wait_seconds;
    return;
  end if;

  update public.google_places_user_rate_usage usage
  set window_started_at = rate_window_start,
      request_count = rate_count + 1,
      updated_at = current_time_utc
  where usage.user_id = p_user_id;

  update public.google_places_monthly_usage usage
  set request_count = monthly_count + 1,
      updated_at = current_time_utc
  where usage.month_start = current_month_start;

  return query select
    true,
    null::text,
    quota_config.monthly_request_limit - monthly_count - 1,
    quota_config.user_request_limit - rate_count - 1,
    0;
end;
$reserve_google_places$;

revoke all on function public.reserve_google_places_search(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_google_places_search(uuid, uuid) to service_role;

commit;