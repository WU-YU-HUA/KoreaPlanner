# Korea Planner

本機開發環境使用 Vite、React、TypeScript、React Router HashRouter 和 Supabase JS。

## 本機啟動

1. 安裝 Node.js 20.19+ 或 22.12+。
2. 複製 `.env.example` 為 `.env.local`，填入 Supabase Project URL 與 anon/publishable key。不要填入 `service_role` 或 secret key。
3. 執行 `npm install`，再執行 `npm run dev`。
4. 開啟終端機顯示的本機網址。登入 callback 會導回目前網站 origin 與 path，不包含 HashRouter route。

目前 `.env` 與 `.env.local` 為本機既有設定，不會由專案範本覆寫。

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