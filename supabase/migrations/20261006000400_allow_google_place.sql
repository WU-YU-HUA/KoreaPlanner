begin;

-- Extend only the provider allow-list; retain the existing validator and privileges.
do $allow_google_place$
declare
  definition text;
begin
  select pg_get_functiondef(to_regprocedure('public.planner_valid_place(jsonb)')) into definition;
  if definition is null then
    raise exception 'planner_valid_place(jsonb) is missing';
  end if;
  if strpos(definition, '(p->>''provider'') not in (''kakao'', ''manual'')') > 0 then
    execute replace(definition,
      '(p->>''provider'') not in (''kakao'', ''manual'')',
      '(p->>''provider'') not in (''kakao'', ''google'', ''manual'')');
  elsif strpos(definition, '(p->>''provider'') not in (''kakao'', ''google'', ''manual'')') = 0 then
    raise exception 'Unexpected provider validation; inspect before changing it';
  end if;
  if not public.planner_valid_place('{"provider":"google","name":"Test","latitude":22.7,"longitude":120.4}'::jsonb)
     or public.planner_valid_place('{"provider":"unknown","name":"Test","latitude":22.7,"longitude":120.4}'::jsonb)
     or public.planner_valid_place('{"provider":"google","name":"Test","latitude":91,"longitude":120.4}'::jsonb) then
    raise exception 'Place validation assertions failed';
  end if;
end;
$allow_google_place$;

commit;
