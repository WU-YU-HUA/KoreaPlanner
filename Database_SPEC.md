# Korea Planner — Database SPEC v0.1

## 規格權威與模型

本文件是 database schema、CRUD 與 frontend mapping 的 source of truth，搭配 FRONTEND_SPEC.md。採用最新 Trip / Schedule / Place JSONB 決策，取代舊版 trips / itinerary_items 與拆開的地點欄位。Provider 為 Supabase PostgreSQL，MVP 僅有 public.trips、public.schedules 兩張 application table，不新增 trip_days、places、members 或其他表。

Trip 1:N Schedule。刪除 Trip 必須由 PostgreSQL ON DELETE CASCADE 自動刪除所有 Schedule；刪除 Schedule 不影響 Trip。前端不得逐筆清除 children。

## 欄位

### trips

| Column | PostgreSQL type | Nullable | Default / meaning |
|---|---|---|---|
| id | uuid | NO | PK, gen_random_uuid() |
| name | text | NO | trim 後非空 |
| start_date | date | NO | 起日，含當日 |
| end_date | date | NO | 迄日，含當日且 >= start_date |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now()，update trigger |

### schedules

| Column | PostgreSQL type | Nullable | Default / meaning |
|---|---|---|---|
| id | uuid | NO | PK, gen_random_uuid() |
| trip_id | uuid | NO | FK trips.id, ON DELETE CASCADE |
| name | text | NO | 使用者自訂行程名，trim 後非空 |
| comment | text | YES | 備註 |
| date | date | NO | 預定日期 |
| start_time | time without time zone | YES | optional 本地時間 |
| end_time | time without time zone | YES | optional 本地時間 |
| place | jsonb | NO | 下方 normalized Place object |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now()，update trigger |

不新增 sort_order；MVP 不含手動排序。行程時間按韓國当地日曆／時間理解，不在 DATE/TIME 進行時區換算。時間以分鐘精度儲存；不支援跨午夜區間。

## Place JSONB contract

```ts
interface Place {
  provider: 'kakao' | 'manual';
  placeId?: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  roadAddress?: string;
  category?: string;
}
```

Place 是 adapter 正規化結果，禁止存完整 Kakao raw response。JSONB 內 key 使用 camelCase；不存 x/y、lat/lng 或產生的 deep-link URL。provider、name、latitude、longitude 必填；placeId 可省略或 NULL。optional 字串可省略／NULL。手動地點使用 provider='manual'，通常省略 placeId；不能要求一定有 Kakao ID。

```json
{
  "provider": "kakao",
  "placeId": "18619500",
  "name": "경복궁",
  "latitude": 37.5796,
  "longitude": 126.977,
  "address": "서울 종로구 세종로 1-1",
  "roadAddress": "서울 종로구 사직로 161"
}
```

Schedule.name 可為「景福宮」，Place.name 為「경복궁」，必須分開。placeId 在 JSON 中是字串。

## Initial migration SQL

以下是新專案的一次性初始 migration，不是重複執行腳本。若已存在舊 schema，先檢查並另寫資料保留 migration；不得自動 DROP table。SQL 不會建立 Auth policy 或公開 CRUD 權限。RLS 預設拒絕 browser 存取，必須另依核准的授權規格配置。

```sql
begin;

create or replace function public.planner_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 檢查 JSON keys/type，缺少必要 key 也會被拒絕。
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
  if lat_value not between -90 and 90
     or lon_value not between -180 and 180 then
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

-- 左側 trip_id prefix 同時支援按 trip 查詢及 cascade lookup。
create index schedules_trip_date_idx on public.schedules(trip_id, date);

alter table public.trips enable row level security;
alter table public.schedules enable row level security;

commit;
```

Schedule.date 在旅程範圍內由前端驗證；MVP 不設跨表 CHECK／trigger。這不是 DB 強制不變條件：直接 SQL 寫入仍可能超出範圍。修改 Trip 範圍時前端查核所有 Schedule，若會超出範圍則拒絕。不對重疊時間加 constraint；重疊只是 UI warning。

## CRUD 與排序

| 操作 | 行為 |
|---|---|
| Trip create | insert name, start_date, end_date，回傳新 row |
| Trip list | order by start_date desc, created_at, id |
| Trip get | 依 id，找不到回傳 null |
| Trip update | 可改 name/start_date/end_date，回傳更新 row |
| Trip delete | 只 delete trips where id=...，DB cascade 清 children |
| Schedule create | insert trip_id/name/comment/date/start_time/end_time/place |
| Schedule by trip | where trip_id=... order by date, start_time nulls last, created_at, id |
| Schedule by date | where trip_id=... and date=... order by start_time nulls last, created_at, id |
| Schedule update | 可改 name/comment/date/start_time/end_time/place；不搬移 trip_id |
| Schedule delete | 只 delete schedules where id=...，保留 Trip |

所有寫入處理 Supabase error；update/delete 應辨識沒有匹配 row，不能無條件顯示成功。Repository interface、完整 update input 以 FRONTEND_SPEC.md 為準。ID 與 timestamps 由 DB 生成，不從使用者表單填入。

## Frontend ↔ DB mapping

| Domain | DB |
|---|---|
| Trip.startDate | trips.start_date |
| Trip.endDate | trips.end_date |
| Schedule.tripId | schedules.trip_id |
| Schedule.startTime | schedules.start_time |
| Schedule.endTime | schedules.end_time |
| createdAt / updatedAt | created_at / updated_at |
| Schedule.name / comment / date / place | schedules 同名欄位 |
| Place.placeId / roadAddress | JSONB 同名 camelCase keys |

Repository 將 TIME `09:00:00` 轉 `09:00`；寫入 HH:mm。optional SQL NULL 映射 undefined；完整 update 表單的空值明確映射 NULL，以便清除舊時間／備註。Place 是完整 JSON object 替換，不對其單一 key 進行未定義的 patch。UI 不使用 DB snake_case row。

## Access control 與環境

Browser 直接連 Supabase，只使用公開 project URL 與 anon/publishable client key。既定 env 名称：VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY。不得把 service_role、secret key 或管理連線字串放入 VITE_、git 或前端 bundle。

本版本尚未定義使用者／ownership／共享規則，故 migration 只啟用 RLS，不建立 policy。不以匿名全表 INSERT/UPDATE/DELETE policy 或關閉 RLS 讓公開網站讀寫。SQL Editor／受信任管理連線可測 schema；此測試不能代表 browser 已有權限。正式 browser CRUD 與公開部署前須另提供 Auth/RLS 規格，agent 明確回報此待定依賴，不自行新增 user_id、members 或登入流程。

## Database acceptance test

在可寫的隔離測試環境／transaction 驗證，最後 rollback 或清理測試資料，不刪真實使用者資料。

1. 建立 Trip，新增三筆 Schedule（含一筆 manual 無 placeId）：一個 Trip、三個 child。
2. 更新 Schedule 並清空 optional time/comment；值確實成為 NULL。
3. 刪除一筆 Schedule：Trip 仍存在，其餘兩筆保留。
4. 刪除 Trip：剩餘兩筆 Schedule 自動刪除，無 orphan。
5. 無效 FK、end_date < start_date、end_time <= start_time、空名稱、缺少／越界／字串座標均被拒絕。
6. 只有 start_time、只有 end_time、兩者都 NULL 均可存；重疊行程可存。
7. 更新兩表時 updated_at 更新；用不同 transaction 驗證 now()，勿要求同一 transaction 內時間必須變大。
8. migration 在全新 DB 執行成功；另確認 RLS 已啟用且沒有自動開放匿名 policy。

以上 SQL 是實作規格；產出本文件不代表已建立遠端 Supabase tables 或驗證過 migration。
