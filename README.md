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