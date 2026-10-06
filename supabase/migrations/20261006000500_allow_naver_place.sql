begin;

do $allow_naver_place$
declare
  definition text;
  provider_name text;
begin
  select pg_get_functiondef(to_regprocedure('public.planner_valid_place(jsonb)')) into definition;
  if definition is null then
    raise exception 'planner_valid_place(jsonb) is missing';
  end if;
  if strpos(definition, '(p->>''provider'') not in (''kakao'', ''google'', ''manual'')') > 0 then
    execute replace(definition,
      '(p->>''provider'') not in (''kakao'', ''google'', ''manual'')',
      '(p->>''provider'') not in (''manual'', ''kakao'', ''naver'', ''google'')');
  elsif strpos(definition, '(p->>''provider'') not in (''manual'', ''kakao'', ''naver'', ''google'')') = 0 then
    raise exception 'Unexpected provider validation; inspect before changing it';
  end if;
  foreach provider_name in array array['manual', 'kakao', 'naver', 'google'] loop
    if not public.planner_valid_place(jsonb_build_object(
      'provider', provider_name, 'name', 'Test', 'latitude', 22.7, 'longitude', 120.4)) then
      raise exception 'Provider validation failed: %', provider_name;
    end if;
  end loop;
  if public.planner_valid_place('{"provider":"naver","name":"Test","latitude":91,"longitude":120.4}'::jsonb)
     or public.planner_valid_place('{"provider":"naver","name":"","latitude":22.7,"longitude":120.4}'::jsonb) then
    raise exception 'Place field validation assertions failed';
  end if;
end;
$allow_naver_place$;

commit;
