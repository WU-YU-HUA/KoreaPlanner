
請檢查專案根目錄的 AGENTS.md。
不存在就建立；已存在就整合以下規則，保留既有內容：

預設可以：

- 讀取、搜尋與修改本機專案檔案。
- 執行本機測試、typecheck、build。
- 啟動本機開發服務。
- 產生 migration 檔案。

除非我在當次任務明確授權，否則不要：

- git commit、push、merge 或建立 tag。
- 部署到 GitHub Pages、Supabase 或其他遠端環境。
- 執行遠端 SQL、套用 migration 或 db push。
- 修改遠端資料、schema 或 secrets。

需要上述操作時，先完成本機實作與驗證，
整理要執行的具體變更後，再詢問我。
已明確授權的操作，不要重複詢問。

不得輸出或提交 API key、token、密碼及 .env 內容。

本次只建立或更新 AGENTS.md，不要 commit 或 push。
