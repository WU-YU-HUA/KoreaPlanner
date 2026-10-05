# Korea Planner — Frontend SPEC v0.2

## 規格權威與範圍

本文件是前端實作的 source of truth；資料庫以同目錄 `DATABASE_SPEC.md` 為準。兩份文件採用最新的 Trip / Schedule 模型，取代舊版 itinerary_items、displayName、note 與拆開的地點欄位。不得自行新增 backend、資料表或未列出的功能。

目標：私人韓國旅行規劃 MVP。使用者建立旅程、依日期管理行程、搜尋並確認 Kakao 地點，或貼上 Google Maps 完整網址解析座標，再直接透過 Supabase Repository 讀寫資料。

技術：Vite、React、TypeScript、React Router、Supabase JavaScript client、Kakao Maps JavaScript SDK。不要加入 Redux / Zustand。正式資料來源為 Supabase；mock 僅用於測試或隔離 UI 開發，不得默默切換成 localStorage 正式儲存。

## Domain models

```ts
export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Place extends Coordinates {
  provider: 'kakao' | 'manual';
  placeId?: string;
  name: string;
  address?: string;
  roadAddress?: string;
  category?: string;
}

export interface Trip {
  id: string;
  name: string;
  ownerId: string;
  coWorkerIds: string[];
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD, inclusive
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

export interface Schedule {
  id: string;
  tripId: string;
  name: string; // 使用者設定的中文／自訂名稱
  comment?: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm, 24-hour
  endTime?: string;
  place: Place; // normalized object, never raw Kakao response
  createdAt: string;
  updatedAt: string;
}

export type CreateTripInput = Pick<Trip, 'name' | 'startDate' | 'endDate' | 'coWorkerIds'>;
export type UpdateTripInput = CreateTripInput;
export type CreateScheduleInput = Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>;
// 完整表單替換；未填的 optional 欄位必須在 DB 清成 NULL。
export type UpdateScheduleInput = Omit<CreateScheduleInput, 'tripId'>;
```

所有座標使用 latitude / longitude。Kakao 的 x / y 只存在於 adapter，x 轉 longitude、y 轉 latitude，字串轉有限數字。placeId 可省略，手動地點不需 Kakao ID。Schedule.name 和 Place.name 必須分開保存；若相同，UI 可只顯示一次。

## Routes 與畫面

| Route | 畫面 | 必要功能 |
|---|---|---|
| `/login` | Google Login | Google 登入、取消／失敗處理、訪客入口 |
| `/` | Trip List | 列出旅程、建立、編輯、刪除旅程 |
| `/trips/:tripId` | Trip Detail | 名稱、起訖日、含首尾的每日日期入口 |
| `/trips/:tripId/days/:date` | Daily Planner | 日期、行程列表、新增、編輯、刪除、地圖連結 |

GitHub Pages 使用 HashRouter，確保重新整理深層 route 能載入；Vite base 依 repository path 設定。不存在的 trip、無效日期或超出旅程範圍的 route 顯示可理解的錯誤與返回入口。

Trip 表單：名稱、開始日期、結束日期、多位 Co-Worker（Gmail 搜尋、加入、移除）。日期按日曆日生成，避免用 UTC timestamp 轉換造成跨日。列表按 startDate 降冪，同日以 createdAt、id 作穩定排序。刪除旅程前確認並告知所有底下行程會一起刪除；只呼叫 deleteTrip，cascade 由 DB 處理。

修改旅程日期時先讀取其所有 Schedule。若有既有行程超出新日期範圍，MVP 拒絕修改並指出受影響日期，不自動刪除／搬移行程。

Daily Planner 按 startTime 升冪，沒有 startTime 的排最後；再按 createdAt、id。新增表單預設 route 日期，編輯可改至同旅程其他日期。表單包含地點搜尋字串、行程名稱、optional start/end time、optional comment、地點確認區。刪除單一 Schedule 前確認，不影響 Trip。

## 地點搜尋與確認

```ts
export interface PlaceSearchService {
  search(query: string): Promise<Place[]>;
}
export interface TranslationService {
  translateToKorean(query: string): Promise<string>;
}
```

1. 對 trim 後原始 query 呼叫 Kakao search。
2. 若有結果，直接顯示，不自動翻譯。
3. 只有成功搜尋但結果為空，才呼叫注入的 TranslationService，再用韓文搜尋。
4. 網路／SDK／權限錯誤不是 empty result，顯示錯誤與重試，不自動翻譯。
5. Translation provider 尚未指定：保留 interface 與 injection point，未配置時明確顯示「尚未設定翻譯服務」，允許改用韓文搜尋或 Google Maps URL 座標輸入；不要假造翻譯或寫死 provider。

每次成功搜尋預選第一筆，列表與地圖 marker 同步。選其他結果時 map center 跟著更新。新搜尋須清除舊的 confirmed place；正在搜尋時禁用確認，忽略過期 request 的結果。搜尋結果不得自動加入 Schedule，必須由使用者明確確認。

錯誤地點可以選其他結果、重新搜尋或切換 Google Maps。Kakao Places keyword 零結果時，再嘗試 Kakao 地址 Geocoder。Google Maps 模式只解析使用者貼上的 Google Maps URL 座標或完整 Plus Code，不呼叫 Google API、不保存 URL/Google Place 資料；需填入地點名稱並確認後建立 provider='manual' 的 Place。完整 URL 支援 `@lat,lng`、`q=lat,lng`、`!3dlat!4dlng` 與 Plus Code；不含座標的短網址須明確提示不可解析。沒有 placeId 也必須可儲存。SDK 不可用時顯示錯誤／重試，不得顯示假的地圖。

```ts
export interface KakaoMapProps {
  center: Coordinates;
  marker?: Coordinates;
  onCenterChange?: (coordinates: Coordinates) => void;
  interactive?: boolean;
}
```

KakaoMap 是純地圖 component。SDK script 集中載入，只有一個共享 loading promise，處理 loading / loaded / error 與重試，卸載 component 時清理 listener。adapter normalize place_id、place_name、address_name、road_address_name、category_name、x、y，UI 不得接收 raw response。

Kakao 外部連結由 utility 產生，不存 DB：有 placeId 開 Kakao Place；無 ID 使用座標開 Kakao Map，名稱需 URL encode。實作時查核 Kakao 官方支援的網址格式。外部新分頁使用 rel='noopener noreferrer'。

## Repository 與資料映射

```ts
export interface TripRepository {
  getTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | null>;
  createTrip(input: CreateTripInput): Promise<Trip>;
  updateTrip(id: string, input: UpdateTripInput): Promise<Trip>;
  deleteTrip(id: string): Promise<void>;
}
export interface ScheduleRepository {
  getSchedulesByTrip(tripId: string): Promise<Schedule[]>;
  getSchedulesByDate(tripId: string, date: string): Promise<Schedule[]>;
  createSchedule(input: CreateScheduleInput): Promise<Schedule>;
  updateSchedule(id: string, input: UpdateScheduleInput): Promise<Schedule>;
  deleteSchedule(id: string): Promise<void>;
}
```

實作 SupabaseTripRepository / SupabaseScheduleRepository，統一 export `repositories = { trip, schedule }`。Page 呼叫 repository，禁止在 React component 寫 supabase.from(...)。Repository 負責 snake_case ↔ camelCase、NULL ↔ undefined、TIME ↔ HH:mm、Place JSON 型別驗證與錯誤轉換。update optional 空白欄位明確寫 NULL，不能因 undefined 省略而保留舊值。JSONB keys 採用上述 Place camelCase，勿再轉 snake_case。寫入失敗不可假裝成功；更新／刪除找不到目標也需處理。

## Validation 與時間衝突

- Trip name trim 後非空；日期必填且為有效 YYYY-MM-DD；endDate >= startDate。
- Schedule name trim 後非空；Kakao 搜尋模式 query 必填；Google Maps 模式須成功解析座標、Place 必須經確認且 name 非空。
- Schedule date 必須位於 Trip 日期範圍。
- 時間 optional，有值必須 HH:mm。兩者存在時 endTime > startTime；MVP 不支援跨午夜時間區間。
- latitude / longitude 必須有限數值且分別在 [-90,90] / [-180,180]。
- 同日兩筆都有完整起訖時，用半開區間判斷重疊：a.start < b.end && b.start < a.end；編輯排除自己。端點相接不算衝突。不完整時間不推測區間。
- 時間衝突只顯示 warning，仍可儲存。

Page-specific state 用 useState；日期生成、排序、過濾等 derived state 用 useMemo 或純函式，不重複存一份 state。不建立 global modal manager。

## UX、可及性與環境設定

所有讀寫呈現 loading / empty / error / success。儲存或刪除中禁用重複操作，失敗保留使用者表單內容。Modal 支援 Escape、focus trap、初始 focus 與關閉後 focus 還原；buttons 用 button、欄位有 label、互動卡片支援鍵盤、錯誤有文字，不能只靠顏色。

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_KAKAO_JAVASCRIPT_KEY=
```

提供 .env.example、不提交實際設定。VITE_ 皆公開，絕不可放 service_role 或 translation secret。Kakao key 使用 JavaScript key，開發與正式 origin 須在 Kakao 設定允許 domain。缺少設定應提供明確訊息。

Google Auth 與 Owner/Co-Worker 已納入 MVP。依 DATABASE_SPEC.md 配置 RLS/grants；訪客只讀，登入者只能寫入自己擁有權限的資料，不關閉 RLS。

## 開發順序與驗收

依序完成 Google Auth/session → models/routes → Supabase repositories/RLS/Gmail lookup → Trip CRUD/日期生成 → Schedule CRUD/排序/衝突 warning → Kakao SDK/search → selection/map sync/confirmation → manual picker → injectable translation fallback。DATABASE_SPEC.md 已定義 schema，勿再等待舊版 DB SPEC 或沿用 itinerary_items。

驗收必須涵蓋：

1. 建立旅程後首頁可見，重新載入資料仍存在；日期含首尾、跨月／跨年正確。
2. 行程可新增、改名、改日期／時間／備註、清空 optional 欄位及刪除。
3. 未填時間排最後；重疊僅 warning，不阻擋保存。
4. 原查詢有結果不翻譯；空結果才 fallback；error 不當作空结果。
5. 第一筆預選、切換結果同步地圖；確認前不能寫入；重搜取消舊確認。
6. 無 Kakao ID 的手動地點可以確認、儲存及開地圖。
7. 刪 Schedule 保留 Trip；刪 Trip 由 DB cascade 清除其 Schedule。
8. Repository mapping、日期工具、搜尋 fallback 用有意義的測試驗證；typecheck 和 production build 通過。

Out of scope：額外 backend、AI 排行程、路線／交通計算、drag and drop、預算、圖片、社交分享、其他地圖 provider、待接受邀請／邀請信、Owner 轉移、其他登入方式。Google Auth 與下述旅程協作屬 MVP 範圍。


## Google 登入流程

首次進入且沒有 session 時先顯示 /login，提供「使用 Google 登入」與「先瀏覽」入口；訪客仍可讀全部 Trip/Schedule。新增 Trip 或進行寫入時需登入。登入成功導回首頁或原先安全站內 route，登入失敗／取消可重試。

AuthService 集中使用 Supabase Auth signInWithOAuth({provider: 'google'})、getSession、onAuthStateChange、signOut；管理 initializing/signedOut/signedIn/error，卸載清理 subscription。重整保留 session；登出回 read-only。Google 登入不代表自動取得別人的旅程寫權限。

Supabase Dashboard 啟用 Google Provider，Google Console 設定 OAuth Client、Supabase Auth callback URL；Client Secret 僅放 Supabase Dashboard。設定本地／正式 Site URL 與 Redirect URLs。GitHub Pages redirectTo 使用含 repository path 的 app base URL，勿用 hash route 當 OAuth callback。啟動時先處理 OAuth callback，再初始化 HashRouter，測試 token/code callback、refresh、取消及 session 過期。

使用 Supabase 內建 auth.users，不另建 User/profiles table。前端目前使用者由 Auth API 取得，不能直接查 auth.users 或使用 admin/service_role key。

## Owner / Co-Worker 權限

| 身分（相對於目前 Trip） | 讀全部資料 | 建立自己的 Trip | 更新／刪除目前 Trip | 新增／更新／刪除目前 Schedule |
|---|---|---|---|---|
| 訪客 | 是 | 否 | 否 | 否 |
| 已登入的一般使用者 | 是 | 是 | 否 | 否 |
| Co-Worker | 是 | 是 | 否 | 是 |
| Owner | 是 | 是 | 是 | 是 |

建立 Trip 者自動為 Owner；ownerId 不由表單提交。Owner 可更新 Trip 名稱／日期、管理協作者、刪除 Trip，也可管理 Schedule。Co-Worker 只能管理該 Trip 的 Schedule，不能更新／刪 Trip，不能更改 Owner 或協作者。角色是每個 Trip 各自判斷。

由 session.user.id 與 Trip.ownerId/coWorkerIds 派生 canManageTrip/canManageSchedule，隱藏不允許的操作；資料庫 RLS 必須同樣強制限制，不能只隱藏按鈕。若權限被移除或 session 過期，失敗時保留表單並刷新 Trip/session，轉 read-only。

## 新建 Trip 的 Co-Worker 流程

1. 登入後開建立表單，填名稱、起訖日期。
2. 輸入完整 @gmail.com 地址並按搜尋；trim、lowercase、驗證格式，僅精確比對，不模糊搜尋或列出全部用戶。不要自行移除 Gmail 的點或 +tag。
3. UserDirectoryService 呼叫 lookup_google_user RPC。建立模式不帶 tripId；編輯模式帶 tripId，由 DB 限制只有該 Trip Owner 可查。
4. 查到已驗證、曾用 Google 登入的帳號，顯示 email，按「加入」放入待儲存名單；支援多位、移除、防重複，Owner 不需加入自己。
5. 查無資料顯示「找不到此帳號，請對方先用 Google 登入一次，再重新搜尋。」不自動建立 User、不寄信、不儲存待邀請 email。網路／權限錯誤不能當成查無結果。
6. 加入／移除先只改表單 state；提交時以一次 Trip INSERT 儲存 name/dates/coWorkerIds，owner_id 由 DB auth.uid() 自動生成。失敗保留表單，不能產生部分完成旅程。
7. Owner 編輯 Trip 可修改整份 coWorkerIds；一次 UPDATE 提交。移除 commit 後，對方新的 Schedule 寫請求必須拒絕。

```ts
export interface CoWorkerCandidate { id: string; email: string }
export interface UserDirectoryService {
  lookupGoogleUser(email: string, tripId?: string): Promise<CoWorkerCandidate | null>;
}
```

查詢由 service 封裝 RPC；component 不直接呼叫 Supabase。Trip 儲存 UUID，不儲存 Gmail 清單。所有訪客可看到協作者人數；MVP 編輯既有名單可顯示 UUID 並移除，不為显示 email 新增公開 users API。

## v0.2 驗收與維運

- 首次 Google 登入成功、session 重整保存、登出變成 read-only；訪客可瀏覽全部資料。
- 新建 Trip 自動填 Owner，多位已登入協作者可同時儲存。
- Gmail 查不到顯示先登入，已有帳號可加入，錯誤可重試。
- Co-Worker 可 Schedule CRUD，但直接 API 更新／刪除 Trip 或更改協作者也必須遭拒絕。
- Owner 可 Trip CRUD、Schedule CRUD；一般登入者不能寫他人資料。
- ownerId 和 Schedule.tripId 不可被改動；協作者移除後立即對新請求生效。
- 原版地圖／日期／時間／cascade 驗收繼續適用；RLS 使用真正各角色 session 測，不只用管理者 SQL Editor。
- GitHub Actions 保活依 DATABASE_SPEC.md，使用外部 cron，不用前端 setInterval；不承諾免費方案永不暫停。

## Implementation checkpoint (2026-10-05)

- [x] 建立 Vite + React + TypeScript、HashRouter 與 `/login`、`/`、Trip route anchors。
- [x] Supabase client、Google OAuth sign-in/out、PKCE callback/session 初始化與持久化 wiring。
- [x] 顯示登入者 email，提供登入中、callback/auth 錯誤及登出狀態。
- [x] Google 登入、callback、重新整理保持登入與登出已由使用者手動確認。
- [x] Trip、Schedule、Co-Worker 與 Kakao UI/工作流程式已實作。
- [x] 首頁提供「所有旅程 / 我的旅程」tabs，各有獨立搜尋欄。
- [x] Trip Detail 日期顯示 `yyyy.MM.dd(weekday)`；修正 React StrictMode 下 Schedule dialog 被 cleanup 誤關。
- [x] Schedule 提供 Kakao 與 Naver Map 外部連結；手機使用 Naver `nmap://place` 以座標/名稱標記地點，桌面 fallback 到只以座標置中的 Naver web map，不用 Place 名稱搜尋。
- [x] PlacePicker 提供 Google Maps 完整 URL/Plus Code 座標解析與名稱確認；短網址和無座標 URL 會明確拒絕。
- [x] Kakao keyword 零結果時嘗試 Kakao 地址 geocoder。
- [ ] Kakao 本機 Places 搜尋需將 `http://localhost:5173` 加入 Kakao JavaScript SDK 網域；目前已確認未通過 CORS。
- [x] GitHub Pages workflow、default branch push/手動部署、Secrets build injection 與 `/KoreaPlanner/` Vite base 已設定。
- [x] 使用者已套用 schema/access-control migrations，`public.trips` schema cache 錯誤已清除。
- [ ] Owner/Co-Worker/一般使用者/訪客 DB 權限驗收與實際 Pages 部署仍待執行。
