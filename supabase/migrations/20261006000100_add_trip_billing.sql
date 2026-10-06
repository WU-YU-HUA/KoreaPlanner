begin;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  description text not null,
  paid_by uuid not null references auth.users(id) on delete restrict,
  payer_display_name text not null,
  total_amount numeric(14,2) not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_description_check check (
    length(btrim(description)) between 1 and 200 and description = btrim(description)
  ),
  constraint expenses_total_amount_check check (total_amount > 0)
);

create table public.expense_splits (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  user_display_name text not null,
  amount numeric(14,2) not null default 0,
  primary key (expense_id, user_id),
  constraint expense_splits_amount_check check (amount >= 0)
);

create index expenses_trip_id_idx on public.expenses(trip_id);
create index expenses_trip_created_at_idx on public.expenses(trip_id, created_at desc);
create index expense_splits_user_id_idx on public.expense_splits(user_id);

create trigger expenses_updated_at
before update on public.expenses
for each row execute function public.planner_set_updated_at();

alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;

revoke all on public.expenses from public, anon, authenticated;
revoke all on public.expense_splits from public, anon, authenticated;
grant select on public.expenses to anon, authenticated;
grant select on public.expense_splits to anon, authenticated;

create policy expenses_public_read
on public.expenses for select to anon, authenticated
using (true);

create policy expense_splits_public_read
on public.expense_splits for select to anon, authenticated
using (true);

create or replace function public.planner_billing_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    '使用者 ' || left(u.id::text, 8)
  )
  from auth.users u
  where u.id = p_user_id;
$$;

create or replace function public.save_trip_expense(
  p_trip_id uuid,
  p_expense_id uuid,
  p_description text,
  p_paid_by uuid,
  p_total_amount numeric,
  p_splits jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  trip_row public.trips%rowtype;
  expense_row public.expenses%rowtype;
  member_ids uuid[];
  original_split_ids uuid[];
  supplied_split_ids uuid[];
  split_row record;
  split_total numeric := 0;
  result_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into trip_row from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'Trip not found' using errcode = 'P0002';
  end if;
  if caller_id <> trip_row.owner_id and not (caller_id = any(trip_row.co_worker_ids)) then
    raise exception 'Trip membership is required' using errcode = '42501';
  end if;

  member_ids := array(
    select distinct member_id
    from unnest(array_prepend(trip_row.owner_id, trip_row.co_worker_ids)) member_id
    order by member_id
  );

  if p_description is null or length(btrim(p_description)) not between 1 and 200 then
    raise exception 'Description must contain 1 to 200 characters' using errcode = '22023';
  end if;
  if p_total_amount is null or p_total_amount <= 0 or scale(p_total_amount) > 2 then
    raise exception 'Total amount must be positive with at most two decimal places' using errcode = '22023';
  end if;
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'Splits must be a non-empty array' using errcode = '22023';
  end if;

  create temporary table billing_split_input (
    user_id uuid primary key,
    amount numeric not null
  ) on commit drop;

  begin
    insert into billing_split_input(user_id, amount)
    select
      case when jsonb_typeof(item -> 'userId') = 'string' then (item ->> 'userId')::uuid else null end,
      case when jsonb_typeof(item -> 'amount') = 'number' then (item ->> 'amount')::numeric else null end
    from jsonb_array_elements(p_splits) item;
  exception
    when unique_violation then
      raise exception 'Split user IDs must be unique' using errcode = '22023';
    when others then
      raise exception 'Every split requires a valid userId and numeric amount' using errcode = '22023';
  end;

  if (select count(*) from billing_split_input) <> jsonb_array_length(p_splits)
     or exists (select 1 from billing_split_input where amount < 0 or scale(amount) > 2) then
    raise exception 'Split amounts must be non-negative with at most two decimal places' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0), array_agg(user_id order by user_id)
  into split_total, supplied_split_ids
  from billing_split_input;
  if split_total <> p_total_amount then
    raise exception 'Split total must equal expense total' using errcode = '22023';
  end if;

  if p_expense_id is null then
    if supplied_split_ids is distinct from member_ids then
      raise exception 'New expense splits must exactly match current Trip members' using errcode = '22023';
    end if;
    if not (p_paid_by = any(member_ids)) then
      raise exception 'Payer must be a current Trip member' using errcode = '22023';
    end if;
    insert into public.expenses (
      trip_id, description, paid_by, payer_display_name, total_amount, created_by
    ) values (
      p_trip_id, btrim(p_description), p_paid_by,
      public.planner_billing_display_name(p_paid_by), p_total_amount, caller_id
    ) returning id into result_id;
  else
    select * into expense_row
    from public.expenses
    where id = p_expense_id
    for update;
    if not found or expense_row.trip_id <> p_trip_id then
      raise exception 'Expense does not belong to the specified Trip' using errcode = '42501';
    end if;
    select array_agg(user_id order by user_id) into original_split_ids
    from public.expense_splits where expense_id = p_expense_id;
    if supplied_split_ids is distinct from original_split_ids then
      raise exception 'Existing expense split members cannot be changed' using errcode = '22023';
    end if;
    if p_paid_by <> expense_row.paid_by and not (p_paid_by = any(member_ids)) then
      raise exception 'A changed payer must be a current Trip member' using errcode = '22023';
    end if;
    update public.expenses set
      description = btrim(p_description),
      paid_by = p_paid_by,
      payer_display_name = public.planner_billing_display_name(p_paid_by),
      total_amount = p_total_amount
    where id = p_expense_id;
    result_id := p_expense_id;
  end if;

  for split_row in select user_id, amount from billing_split_input loop
    insert into public.expense_splits(expense_id, user_id, user_display_name, amount)
    values (
      result_id, split_row.user_id,
      public.planner_billing_display_name(split_row.user_id), split_row.amount
    )
    on conflict (expense_id, user_id) do update set amount = excluded.amount;
  end loop;

  return result_id;
end;
$$;

create or replace function public.delete_trip_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  expense_trip_id uuid;
  trip_row public.trips%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  select trip_id into expense_trip_id
  from public.expenses where id = p_expense_id;
  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  select * into trip_row from public.trips where id = expense_trip_id for update;
  if caller_id <> trip_row.owner_id and not (caller_id = any(trip_row.co_worker_ids)) then
    raise exception 'Trip membership is required' using errcode = '42501';
  end if;
  perform 1 from public.expenses
  where id = p_expense_id and trip_id = expense_trip_id
  for update;
  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  delete from public.expenses where id = p_expense_id;
end;
$$;

revoke all on function public.planner_billing_display_name(uuid) from public, anon, authenticated;
revoke all on function public.save_trip_expense(uuid, uuid, text, uuid, numeric, jsonb) from public, anon;
revoke all on function public.delete_trip_expense(uuid) from public, anon;
grant execute on function public.save_trip_expense(uuid, uuid, text, uuid, numeric, jsonb) to authenticated;
grant execute on function public.delete_trip_expense(uuid) to authenticated;

commit;
