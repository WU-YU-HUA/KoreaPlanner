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

「搜尋地點」會同時搜尋 Kakao 與 Google，將兩個標準化陣列以 `kakaoResults.concat(googleResults)` 合併，在同一個可捲動清單顯示。清單只顯示名稱與地址，不標示來源；Kakao 結果在前、Google 結果在後；清單 key 包含 provider，以免跨來源相同 ID 衝突。一個服務失敗時仍顯示另一個的結果，另顯示失敗訊息；Kakao 等待上限為 15 秒。Google 使用目前 Supabase Google 登入 session 與 Trip ID 呼叫 `search-places`，需要 Trip Owner／Co-Worker 權限；每次允許的搜尋消耗一筆 Google quota。合併結果都可直接點擊選取，再按「確認此地點」加入行程，不開啟外部頁面。Place 支援 manual／kakao／naver／google。地圖顯示使用應用程式設定的韓國範圍（緯度 32–39、經度 124–132）；這不是官方精確涵蓋邊界，也不是全球有效座標範圍。範圍外地點仍可確認及儲存，只不移動地圖或畫標記；地圖畫點失敗不影響選取。Google quota／登入／權限錯誤會顯示對應訊息，不自動重試。Google API key 只放在 Edge Function secret，不放前端。詳細設定及測試見 `supabase/functions/search-places/README.md`。

## 經緯度標記函式

`src/services/kakaoPointParser.ts` 可綁定已建立的 Kakao 地圖與 SDK，取得只接受 `(經度, 緯度, 名稱)` 的函式：

```ts
import { createKakaoPointParser } from './services/kakaoPointParser';

const plotPoint = createKakaoPointParser(map, sdk);
const point = plotPoint(126.978, 37.5665, '我的地點');
// 需要移除時：point.remove();
```

呼叫後會移動地圖中心、畫出座標標記與純文字名稱標籤，不需搜尋對應地標。座標必須為有效數字，經度範圍 -180 至 180、緯度範圍 -90 至 90，名稱不可空白。每次呼叫新增一組標記；呼叫者可透過 `remove()` 移除。現有 `KakaoMap` 元件已使用此函式，更新座標或卸載時會清除舊標記與標籤。
