# Korea Planner — Database SPEC v0.2

## 規格權威與模型

本文件是 database schema、CRUD 與 frontend mapping 的 source of truth，搭配 FRONTEND_SPEC.md。採用最新 Trip / Schedule / Place JSONB 決策，取代舊版 trips / itinerary_items 與拆開的地點欄位。Provider 為 Supabase PostgreSQL，MVP 仍僅有 public.trips、public.schedules 兩張 application table。Owner/Co-Worker 存在 Trip，帳號使用 Supabase 內建 auth.users，不新增 User/profiles/trip_members table。

Trip 1:N Schedule。刪除 Trip 必須由 PostgreSQL ON DELETE CASCADE 自動刪除所有 Schedule；刪除 Schedule 不影響 Trip。前端不得逐筆清除 children。

## 欄位

### trips

| Column | PostgreSQL type | Nullable | Default / meaning |
|---|---|---|---|
| id | uuid | NO | PK, gen_random_uuid() |
| owner_id | uuid | NO | FK auth.users.id，default auth.uid()，不可轉移 |
| co_worker_ids | uuid[] | NO | default 空陣列，多位協作者 UUID |
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
  provider: 'manual' | 'kakao' | 'naver' | 'google';
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

以下是新專案的一次性初始 migration，不是重複執行腳本。若已存在舊 schema，先檢查並另寫資料保留 migration；不得自動 DROP table。核心 SQL 完成後須依下方 v0.2 授權規格另實作 migration（grants/policies/triggers/RPC），才能開放 browser 正式讀寫。不可只执行核心 SQL 就宣稱 Auth 已完成。

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
     or (p->>'provider') not in ('manual', 'kakao', 'naver', 'google')
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
| Trip create | 登入者 insert name/start_date/end_date/co_worker_ids；owner_id 自動生成 |
| Trip list | order by start_date desc, created_at, id |
| Trip get | 依 id，找不到回傳 null |
| Trip update | 僅 Owner 改 name/start_date/end_date/co_worker_ids，回傳 row |
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
| Trip.ownerId | trips.owner_id |
| Trip.coWorkerIds | trips.co_worker_ids |
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

Google Auth 與旅程協作已定案，依下方 v0.2 規格實作。公開匿名只有 SELECT，不開放匿名寫入。保留 RLS，並檢查／移除舊的廣泛 policy，避免 permissive policy OR 合併造成越權。

## Database acceptance test

在可寫的隔離測試環境／transaction 驗證，最後 rollback 或清理測試資料，不刪真實使用者資料。

1. 建立 Trip，新增三筆 Schedule（含一筆 manual 無 placeId）：一個 Trip、三個 child。
2. 更新 Schedule 並清空 optional time/comment；值確實成為 NULL。
3. 刪除一筆 Schedule：Trip 仍存在，其餘兩筆保留。
4. 刪除 Trip：剩餘兩筆 Schedule 自動刪除，無 orphan。
5. 無效 FK、end_date < start_date、end_time <= start_time、空名稱、缺少／越界／字串座標均被拒絕。
6. 只有 start_time、只有 end_time、兩者都 NULL 均可存；重疊行程可存。
7. 更新兩表時 updated_at 更新；用不同 transaction 驗證 now()，勿要求同一 transaction 內時間必須變大。
8. migration 在全新 DB 執行成功；另確認 RLS 已啟用，匿名只有 SELECT policy，沒有匿名寫入。

以上 SQL 是實作規格；產出本文件不代表已建立遠端 Supabase tables 或驗證過 migration。


## v0.2 授權與一致性規格

本節是必須實作的 migration requirements，不得只靠 UI 達成。Supabase Auth 管理 auth.users；Google 登入後帳號存在且有 Google identity。owner_id 使用真實 FK；co_worker_ids 採 uuid[] 符合「Co-Worker 存於 Trip」的需求，array 元素無直接 FK，必須用受控 validation trigger 補上檢查。

### Trip 與 Schedule 不變條件

- owner_id 必須是目前建立者 auth.uid()，建立後不可轉移（UPDATE trigger 拒絕變更）。
- co_worker_ids 必須每個 UUID 對應存在且 email 已驗證、有 Google identity 的 auth.users。拒絕不存在、NULL、重複 ID 或 Owner 自己；空陣列有效。用 DB trigger 驗證，不能只做表單驗證。
- owner_id 的 auth.users FK 使用 ON DELETE RESTRICT，不能刪 User 就自動刪其旅程。管理者刪 User 前明確處理其旅程及所有 co_worker_ids；MVP 不開放前端刪帳號。
- Schedule.trip_id 建立後不可更新，用 column privileges 加 trigger 防止搬移至其他 Trip。
- 只授權 client 可寫欄位，不能改 id、created_at、updated_at、owner_id；timestamps 由 DB 管理。

### Grants / RLS

先 revoke anon/authenticated 的預設全表 grants，再只授權下列 operations/columns；兩張表開 RLS，建立相對應 policies。

| Table/operation | grant / policy |
|---|---|
| trips SELECT | anon/authenticated；USING true，所有人同一份資料 |
| trips INSERT | authenticated，只允許 name/start_date/end_date/co_worker_ids；WITH CHECK owner_id=auth.uid() |
| trips UPDATE | authenticated，只允許 name/start_date/end_date/co_worker_ids；USING 舊 owner_id=auth.uid()，WITH CHECK 新 owner_id=auth.uid() |
| trips DELETE | authenticated；USING owner_id=auth.uid() |
| schedules SELECT | anon/authenticated；USING true |
| schedules INSERT | authenticated，只允許 trip_id/name/comment/date/start_time/end_time/place；WITH CHECK 為所屬 Trip Owner 或 Co-Worker |
| schedules UPDATE | authenticated，只允許 name/comment/date/start_time/end_time/place；USING / WITH CHECK 都是所屬 Trip Owner 或 Co-Worker |
| schedules DELETE | authenticated；USING 為所屬 Trip Owner 或 Co-Worker |

Schedule editor 判斷條件：

```sql
exists (
  select 1 from public.trips t
  where t.id = schedules.trip_id
    and (
      t.owner_id = (select auth.uid())
      or (select auth.uid()) = any(t.co_worker_ids)
    )
)
```

Co-Worker 不能透過修改 Trip 將自己升權，不能刪 Trip；只有 Owner 管理整份 co_worker_ids。任何登入者可另建立自己的 Trip，不因此取得其他 Trip 權限。UPDATE/DELETE 因 RLS 可能只回零筆，Repository 需確認 affected row，不能假裝成功。

### Gmail lookup RPC contract

```ts
lookup_google_user(p_email: string, p_trip_id?: string)
// SQL RETURNS TABLE (id uuid, email text)，零筆代表不存在
```

此 RPC 由 migration owner 建立 SECURITY DEFINER、固定 search_path=''，所有表用完整 schema name。撤銷 PUBLIC/anon execute，只授權 authenticated。不提供 auth.users 的一般 SELECT grants。

1. auth.uid() 必須非空且呼叫者已有 Google identity，否則拒絕。
2. p_trip_id 若有值，呼叫者必須是該 Trip Owner；省略代表建立表單的帳號查詢。
3. 僅接受完整 @gmail.com，trim/lowercase 精確比對 auth.users.email，勿用 LIKE/模糊搜尋或接受 arbitrary SQL。
4. 僅返回 email_confirmed_at 非空且 auth.identities.provider='google' 的帳號，最多一筆 id/email；其他 metadata 不返回。
5. 無結果給前端先登入提示，權限／網路錯誤和無結果分開；不建立 User、不發邀請信。
6. 不對 PUBLIC 開放用戶 email 清單。新建時 authenticated 精確查詢仍可推測指定帳號是否存在；MVP 無模糊列舉接口。若擴大公開使用，另外加入 server-side 限流，前端 debounce 不算存取控制。

Google 登入 Provider 限 Google；若開發環境有其他登入方式，額外限制 create/write policy 為 Google identity 使用者，不能讓 UI 限 Google、DB 卻接受其他未授權帳號。

### 已存在 v0.1 資料的 upgrade

若已執行舊版 SQL，另寫 ALTER migration：先增加 nullable owner_id 與 co_worker_ids，管理者明確指定所有既有 Trip 的 Owner，完成 backfill 後再 NOT NULL/default/FK。禁止 DROP 重建或任意把所有舊 Trip 指派給第一個登入者。新專案直接用本文件核心 SQL 加上述授權 migration。

## v0.2 權限驗收

使用真正 anon、Owner A、Co-Worker B、其他帳號 C 的 API session 測試：

1. 所有人讀同樣 Trip/Schedule；anon 不能寫入。
2. A 建立 Trip 的 Owner 為 A，多位協作者一次儲存，資料庫拒絕無效 UUID／NULL／自己／重複。
3. A 可改／刪 Trip，B/C 不可；直接 API 修改 Owner/協作者不能繞過限制。
4. A/B 可其 Schedule CRUD；C 不可；Schedule 不能改 trip_id。
5. A 移除 B 並 commit 後，B 新的寫請求被拒絕；不承諾撤銷已執行中的 transaction。
6. Gmail lookup 無結果與錯誤分開，anon 禁用、編輯模式非 Owner 禁用，精確查詢不洩漏整份 users。
7. Owner 刪 Trip cascade 清 Schedule；Co-Worker 不能以刪 Trip 清除其他人資料。
8. 不以 SQL Editor 的 postgres bypass 權限測試取代 RLS 測試。

## GitHub Actions 保活規格

在專案建立 .github/workflows/supabase-keepalive.yml，外部 schedule 每天三次真正 SELECT public.trips 的 id limit=1。只讀、不新增保活資料／table、不使用 service_role。不依賴前端 setInterval，也不能只 ping 網站 HTML/Auth endpoint。

```yaml
name: Supabase keepalive
on:
  schedule:
    - cron: '17 1,9,17 * * *'
  workflow_dispatch:
permissions:
  contents: read
jobs:
  keepalive:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Query database
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
        run: |
          test -n "$SUPABASE_URL"
          test -n "$SUPABASE_PUBLISHABLE_KEY"
          curl --fail --silent --show-error \
            --connect-timeout 10 --max-time 30 --retry 2 \
            --header "apikey: $SUPABASE_PUBLISHABLE_KEY" \
            --output /dev/null \
            "$SUPABASE_URL/rest/v1/trips?select=id&limit=1"
```

使用新版 sb_publishable_... key 的 apikey header。Repo Secrets 設定 SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY，不在 logs 印 keys/資料，前端和 Actions 分別設定。空結果 [] 仍代表已成功查 DB。只使用 schedule/workflow_dispatch、不透過 PR 執行；workflow 需在 default branch。手動觸發驗證成功／缺 secrets 失敗／API 失敗與通知後，再啟用 schedule。

免費保活只能降低暫停機率，不保證永不暫停；已暫停仍需 Dashboard Resume。GitHub 排程可能延遲或丟失；公開 repo 60 天沒 repository activity 時 scheduled workflow 自動停用，排程自行執行不應視為可解除此限制，需定期查核 active 狀態，不自動製造無意義 commit。

官方參考：
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/database/postgres/row-level-security

本次產出為 SPEC，不代表已配置 Google OAuth、執行遠端 migrations 或啟用 GitHub Actions。

## Implementation checkpoint (2026-10-05)

- [x] 已建立全新專案 schema migration 與 v0.2 grants/RLS/triggers/lookup RPC migration；使用者已確認兩份 migration 套用成功且 schema cache 錯誤已清除。
- [ ] 尚待使用 anon、Owner、Co-Worker、一般使用者 session 完成 RLS 權限驗收。
- [ ] GitHub Actions keepalive 未設定，依本次範圍暫緩。
