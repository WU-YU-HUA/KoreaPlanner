# Korea Planner

本機開發環境使用 Vite、React、TypeScript、React Router HashRouter 和 Supabase JS。

## 本機啟動

1. 安裝 Node.js 20.19+ 或 22.12+。
2. 複製 `.env.example` 為 `.env.local`，填入 Supabase Project URL 與 anon/publishable key。不要填入 `service_role` 或 secret key。
3. 執行 `npm install`，再執行 `npm run dev`。
4. 開啟終端機顯示的本機網址。登入 callback 會導回目前網站 origin 與 path，不包含 HashRouter route。

目前 `.env` 與 `.env.local` 為本機既有設定，不會由專案範本覆寫。

## API KEYs
- KaKao JavaScript SDK: https://developers.kakao.com/console/app/1597786/config/platform-key/js/5772451
- Supabase: https://supabase.com/dashboard/project/onuwbxczpmfbwehdqwap

## Google Auth 設定

- Supabase Dashboard 的 Authentication > Providers 啟用 Google。
- Google Cloud OAuth Client 的授權重新導向 URI 加入 Supabase 顯示的 Auth callback URL；Client Secret 只放在 Supabase Dashboard。
- Supabase Authentication URL Configuration 將本機 Vite origin 加入 Redirect URLs，並設定 Site URL。
- Kakao JavaScript key 與允許網域只在開始地點功能時需要。

登入狀態由 Supabase Auth 持久化，OAuth code callback 在 HashRouter 啟動前由 Supabase client 還原。登入首頁會顯示目前帳號 email；登出後回到登入頁。

## 檢查

- `npm run typecheck`
- `npm run build`
- `npm test`

Supabase migration 位於 `supabase/migrations/`。套用 migrations、連接遠端 project、部署和 Trip/Schedule/Kakao 功能皆不會由本機啟動流程自動執行。

## GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` 會在預設分支 push 時部署；可在 Actions 手動執行 `Deploy Korea Planner to GitHub Pages`。Repository Settings > Pages 的 Build and deployment source 設為 GitHub Actions，並在 Repository Settings > Secrets and variables > Actions 設定 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_KAKAO_JAVASCRIPT_KEY`。

此 repository 的 Vite base path 是 `/KoreaPlanner/`。Supabase Auth Redirect URLs 需允許實際 Pages origin 加上 `/KoreaPlanner/`；Kakao Developers 的 JavaScript SDK 網域需加入 Pages origin。Build-time `VITE_` 值會公開在前端 bundle，只能使用 Supabase anon/publishable key 和 Kakao JavaScript key，不能放 service_role、OAuth client secret 或其他私密金鑰。

本機 Vite 預設 origin 為 `http://localhost:5173`；請將此 origin（不含 `/KoreaPlanner/` path）加入 Kakao Developers 的 JavaScript SDK 網域。若用 `127.0.0.1` 開啟，該 origin 也需另外加入。

Schedule 的 Google Maps 輸入只解析完整網址中可見的經緯度或 Plus Code，不呼叫 Google API，也不儲存 Google Maps URL/Place 資料。支援含 `@latitude,longitude`、`q=latitude,longitude`、`!3dlatitude!4dlongitude` 或 Plus Code 的完整網址；`maps.app.goo.gl` 等短網址不含座標時無法在純前端解析，請改貼 Google Maps 網址列中的完整網址。Kakao keyword 搜尋零結果時，會再使用 Kakao Maps SDK 的 address geocoder 查詢地址。

「搜尋地點」會同時搜尋 Kakao 與 Google，將兩個標準化陣列以 `kakaoResults.concat(googleResults)` 合併，在同一個可捲動清單顯示。清單只顯示名稱與地址，不標示來源；Kakao 結果在前、Google 結果在後；清單 key 包含 provider，以免跨來源相同 ID 衝突。一個服務失敗時仍顯示另一個的結果，另顯示失敗訊息；Kakao 等待上限為 15 秒。Google 使用目前 Supabase Google 登入 session 與 Trip ID 呼叫 `search-places`，需要 Trip Owner／Co-Worker 權限；每次允許的搜尋消耗一筆 Google quota。合併結果都可直接點擊選取，再按「確認此地點」加入行程，不開啟外部頁面。Place 支援 manual／kakao／naver／google。「搜尋地點」Tab 使用 Leaflet＋OpenStreetMap 全球底圖，表單目前日期的 Schedule 地點以紅色標記顯示，當次列表選取以灰色標記顯示；所有來源（包含 Google）的有效座標結果均依列表點擊更新標記與地圖中心；選取及確認儲存流程維持原樣。Google Maps 網址貼上／解析 Tab 維持原本 Kakao 地圖與韓國顯示範圍；地圖畫點失敗不影響選取。Google quota／登入／權限錯誤會顯示對應訊息，不自動重試。Google API key 只放在 Edge Function secret，不放前端。詳細設定及測試見 `supabase/functions/search-places/README.md`。

## 外部搜尋資料與地圖顯示流程

搜尋資料解析與地圖標示由不同函式負責：

```text
Kakao SDK → parseKakaoPlaces / parseKakaoAddresses ─┐
                                                  ├→ searchCombinedPlaces → 合併清單
Google search-places → parseSearchPlacesResponse ───┘
合併清單 → 使用者選取 → LeafletMap → 更新灰色選取標記（所有來源），保留當日紅色行程標記
```

兩個搜尋 Parser 都輸出相同欄位的陣列：

```ts
{ name, address, placeId, latitude, provider, longitude }[]
// provider 為 'kakao' 或 'google'；latitude / longitude 為 number。
```

`src/services/kakaoPlaceParser.ts` 與 `src/services/googlePlaceParser.ts` 負責轉換欄位、檢查名稱／座標及過濾無效資料，不操作地圖。`src/services/combinedPlaceSearch.ts` 將兩個結果 concat；`PlacePicker` 顯示清單並處理選取。搜尋 Tab 的 `LeafletMap` 檢查全球有效座標，替換舊標記並以文字 popup 顯示名稱；ResizeObserver 與 visibilitychange 處理尺寸恢復，卸載清除 map／事件／標記，不請求定位。Leaflet CSS 由元件載入，桌面高度 260px、手機 220px，保留 © OpenStreetMap contributors。網址解析 Tab 的 `KakaoMap` 先用 `canDisplayOnKakaoMap` 檢查顯示範圍，再呼叫下面的獨立標記函式。範圍外地點仍可選取及儲存。

## 經緯度標記函式

`src/services/kakaoPointParser.ts` 可綁定已建立的 Kakao 地圖與 SDK，取得只接受 `(經度, 緯度, 名稱)` 的函式：

```ts
import { createKakaoPointParser } from './services/kakaoPointParser';

const plotPoint = createKakaoPointParser(map, sdk);
const point = plotPoint(126.978, 37.5665, '我的地點');
// 需要移除時：point.remove();
```

呼叫後會移動地圖中心、畫出座標標記與純文字名稱標籤，不需搜尋對應地標。座標必須為有效數字，經度範圍 -180 至 180、緯度範圍 -90 至 90，名稱不可空白。每次呼叫新增一組標記；呼叫者可透過 `remove()` 移除。現有 `KakaoMap` 元件已使用此函式，更新座標或卸載時會清除舊標記與標籤。

## Google Places 與非 Google 地圖的限制

本次僅更換搜尋 Tab 的地圖，不修改 Search、Parser、Schedule 儲存、權限或歷史資料。依使用者要求，所有來源的有效座標結果皆可在 Leaflet 畫點與置中，包括 Google Places API 結果；下列條款限制仍存在，此實作不代表取得跨底圖授權。

- [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)（非 EEA 帳單地址適用）：§14.1 允許沒有 Google 地圖的應用使用 Places 資料，§14.2 仍禁止搭配非 Google 地圖；§14.3 僅允許經緯度暫存最多 30 天。§15.1 的非 Google 地圖例外適用於 Places UI Kit，本專案現有的 Places API 搜尋及 Parser 不屬於該產品，不能直接套用例外。EEA 帳單地址有另一份條款，未檢查帳戶帳單地址。
- [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies)：在地圖顯示 API 結果須使用 Google Map；資料保存與無 Google Map 時的 attribution 另有要求。這些限制獨立列出，不以改 Parser、停用儲存或改歷史資料處理。
- [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/)：標準 HTTPS 圖磚只按視窗載入，不預載或離線下載，保留 attribution 與瀏覽器預設快取／Referer。

搜尋地圖接收表單目前 Trip／日期的 Schedule 地點；僅讀取既有資料，不改儲存或權限。紅色行程標記與灰色搜尋標記使用獨立圖層／生命週期；範圍涵蓋全部有效標記，日期切換更新紅點，無效座標跳過。同位置重疊時灰色選取點在上層、紅色外圈仍可見。
