# KoreaPlanner 共同支出功能 SPEC

版本：1.0｜日期：2026-10-06

## 1. 目標與現有環境

在現有 Trip 詳細頁新增「共同支出」Tab，記錄每筆由誰先付款、每個人應負擔多少，並顯示累計支出、個人餘額與建議轉帳。

現有架構為 Vite／React／TypeScript 前端、Supabase PostgreSQL／Google Auth／RLS、GitHub Pages；不新增獨立後端。現有資料表為 `trips`、`schedules`。Owner 與 Co-Workers 的實際欄位及取得方式，以專案現有程式與 migrations 為準。

本文件是新增功能規格，不取代既有 FRONTEND_SPEC.md／DATABASE_SPEC.md。Agent 必須先閱讀現有程式與 migrations，再新增增量 migration，不重跑或改寫已套用的初始化 SQL。

## 2. 第一版範圍與規則

- 不新增幣別欄位、匯率或換算。所有金額視為同一計價單位，UI 不顯示特定貨幣符號。
- 金額最多兩位小數，採 `numeric(14,2)` 儲存；計算以整數百分之一單位進行，避免浮點誤差。
- 每筆只有一位實際付款人，其付款金額等於本筆總額。
- 每筆分攤對象預設為建立當下的 Owner＋全部 Co-Workers，去除重複 User ID。
- 每人應付預帶 0，允許部分人不參與該筆費用，即其分攤金額為 0。
- 本筆總額必須大於 0；每人分攤金額必須大於等於 0。
- 可記錄任何當下成員先付款的支出，不要求建立者就是付款人。
- 第一版不處理實際還款紀錄、退款、負數支出、多人共同先付款或已結清狀態。轉帳結果只是建議，不能表示已還款。

## 3. 資料表

### 3.1 `expenses` 支出主表

| 欄位 | 型別／限制 | 用途 |
|---|---|---|
| id | uuid，PK，自動產生 | 支出 ID |
| trip_id | uuid，NOT NULL，FK trips(id)，ON DELETE CASCADE | 所屬旅程 |
| description | text，NOT NULL，去空白後 1–200 字 | 支出項目 |
| paid_by | uuid，NOT NULL，FK auth.users(id)，ON DELETE RESTRICT | 實際付款人 |
| total_amount | numeric(14,2)，NOT NULL，CHECK > 0 | 總額 |
| created_by | uuid，NOT NULL，FK auth.users(id)，ON DELETE RESTRICT | 建立者 |
| created_at | timestamptz，NOT NULL，預設 now() | 建立時間 |
| updated_at | timestamptz，NOT NULL，預設 now() | 更新時間 |

索引至少包含 trip_id，以及旅程列表排序所需的 (trip_id, created_at)。trip_id、created_by、created_at 建立後不可修改；updated_at 由資料庫維護。

### 3.2 `expense_splits` 分攤明細

| 欄位 | 型別／限制 | 用途 |
|---|---|---|
| expense_id | uuid，NOT NULL，FK expenses(id)，ON DELETE CASCADE | 所屬支出 |
| user_id | uuid，NOT NULL，FK auth.users(id)，ON DELETE RESTRICT | 分攤者 |
| amount | numeric(14,2)，NOT NULL，DEFAULT 0，CHECK >= 0 | 此人應負擔金額 |

複合主鍵為 (expense_id, user_id)，另建 user_id 索引。即使 amount 為 0，也保存該筆分攤者。

總額與明細加總是跨列規則，不可假設單一 CHECK constraint 能完成驗證；在受控寫入 RPC 中驗證，並禁止繞過 RPC 直接寫入。

### 3.3 成員歷史與顯示名稱

- 保存每筆 split 的 User ID；現有支出不可因 Trip 成員加入或移除而自動增加／刪除 split 或重算金額。
- 編輯既有支出保留原 split 名單；付款人可維持原值，或改成目前 Trip 成員。分攤名單變更不在第一版範圍。
- 新成員只出现在新支出的預設名單；被移除成員仍出現在歷史支出和結算，其寫入權限立即失效。
- 不將 auth.users 開放給前端直接查詢，也不公開列出 email。沿用現有可用的安全名稱取得方式；如果不存在，新增受控顯示名稱快照，保存在主表的 payer_display_name 與明細的 user_display_name。快照由 RPC 根據 Auth metadata 取得，僅儲存顯示名稱，不接受前端提供 email 作為公開標籤。
- 名稱缺失時用「使用者」加短 ID 區分；結算彙總永遠以 User ID 合併，不以顯示名稱合併。

## 4. RLS、權限與原子寫入

- 兩表啟用 RLS。
- 延續現有公開讀取需求：anon 與 authenticated 可 SELECT 支出及分攤資料。
- 只有該 Trip 目前 Owner／Co-Workers 可新增、修改、刪除支出；非成員、訪客一律禁止。
- 使用受控 RPC 做新增／編輯／刪除，主表與所有明細在同一 transaction 完成；任一驗證失敗全部 rollback。
- 撤銷 anon／authenticated 對兩表的直接 INSERT／UPDATE／DELETE 權限；只授予 authenticated 必要寫入 RPC 的 EXECUTE。不要因此破壞現有 trips／schedules 的 grants。
- RPC 若使用 SECURITY DEFINER，固定安全 search_path、使用完整限定名稱、撤銷 PUBLIC／anon EXECUTE，並在函式內明確驗證 auth.uid() 與目前成員資格，不依賴被繞過的 RLS。
- 以鎖定 Trip 列的方式，將成員資格確認與支出寫入序列化，避免移除 Co-Worker 與寫入競爭。

建議介面（可依現有命名規範調整並保持前端一致）：

`save_trip_expense(p_trip_id uuid, p_expense_id uuid nullable, p_description text, p_paid_by uuid, p_total_amount numeric, p_splits jsonb) → expense_id uuid`

`delete_trip_expense(p_expense_id uuid) → void`

儲存 RPC 必須驗證：

1. 已登入，且目前有該 Trip 的寫入權限。
2. 編輯時支出屬於指定 Trip，禁止搬移到其他 Trip。
3. description、金額、精度與型別合法；超過兩位小數直接拒絕，不靜默四捨五入。
4. splits 不為空、User ID 不重複，金額不能為 null、負數或非數字。
5. 新增時 splits 名單精確等於目前 Owner＋Co-Workers；paid_by 必須在該名單。
6. 編輯時 splits 名單精確等於該筆原有名單；paid_by 可維持原付款人，否則必須是目前成員。
7. splits.amount 的總和精確等於 total_amount。
8. created_by 只能由 auth.uid() 設定，時間由資料庫設定，不信任前端傳值。

同時編輯第一版採最後成功儲存者覆蓋；每次儲存後重新讀取資料。錯誤不得讓 UI 假裝儲存成功。

## 5. Trip 頁面與表單

新增「共同支出」Tab，不影響既有行程 Tab。Tab 下方、支出列表上方的中間主要區塊放結算資訊：總支出、每人已付款／應負擔／應收或應付、建議轉帳。

新增／編輯表單包含：

- 支出項目 textbox。
- 實際付款人選單，預設目前使用者（新增時）。
- 上方「總共應付」數字 textbox，旁邊「平均」按鈕。
- 下方每位分攤者的名稱與「應付」數字欄位，新增時全部預帶 0。
- 儲存與取消。

### 5.1 總額與明細互動

- 上方總額可先輸入待分配數字，不立即修改明細。
- 按「平均」將上方總額分配給該筆全部分攤者，包含原本金額為 0 的人，覆蓋各人金額。
- 任一個人金額被手動調整後，上方總額自動改為下方全部金額的加總。
- 表單維護總額 draft 與明細；初始或修改總額後若兩者不一致，顯示「尚未分配完成」與差額，禁止儲存。
- 儲存條件為有效項目、付款人、正總額、合法明細且總和一致。
- 清空輸入時允許暫時的空字串狀態，該欄計算暫視為 0，但驗證完成前不可送出；拒絕負數、科學記號、非有限值及超過兩位小數。
- 編輯載入原值，不自動平均。取消不改資料。

### 5.2 平均餘數

金額轉為整數百分之一單位後，商數分配給每人，餘數依 User ID 升冪每人加一個最小單位，確保穩定且總額完全相符。例如 100／3 → 33.34、33.33、33.33。顯示順序可以 Owner 優先，但餘數算法不可因畫面排序而改變。

### 5.3 列表與畫面狀態

- 列表顯示項目、付款人、總額、建立時間；展開顯示每人分攤。
- 最新建立的支出在前；儲存／刪除成功後更新列表與結算。
- Owner／Co-Workers 才顯示新增、編輯、刪除；刪除需要確認。
- 訪客與非成員可讀取，無寫入按鈕；資料庫仍是權限最終依據。
- 處理載入、錯誤、空列表、送出中、刪除中；避免重複提交。空列表總額為 0、沒有轉帳建議。
- 桌面與手機可用，結算區塊在列表上方；金額欄位支援小數鍵盤。

## 6. 結算算法

對每個目前或歷史出現的 User ID：

`已付款 = sum(expenses.total_amount where paid_by = user_id)`

`應負擔 = sum(expense_splits.amount where user_id = user_id)`

`餘額 = 已付款 − 應負擔`

正數顯示應收、負數顯示應付、0 顯示已平衡。所有餘額總和必须等於 0。被移除成員仍納入結算，可標示「已離開旅程」。

轉帳建議用整數最小單位計算：將應付者與應收者分別按金額絕對值降冪排序，同額按 User ID；逐一匹配，轉帳金額取兩邊剩餘額較小值，扣除後移動到下一位，直到全部歸零。結果需穩定、不含零額或自己轉給自己；不要求全域最少交易次數。

例：Owner 已付 900、A 已付 300、B 已付 0；各自應負擔 400。Owner 應收 500，A 應付 100，B 應付 400；建議 B → Owner 400、A → Owner 100。

僅顯示「依目前支出計算的轉帳建議，未記錄實際還款」，不要把餘額為 0 命名為已付款完成。

## 7. 驗收

1. 新增表單列出 Owner＋Co-Workers、預帶 0；未分配總額不可儲存。
2. 平均 100／3 精確等於 100；調整個人值後總額立即更新。
3. 儲存後重新整理仍保留主表與全部明細；取消不儲存。
4. 可替其他目前成員記錄先付款，不混淆建立者與付款人。
5. 結算示例正確，所有餘額及建議轉帳能完全平衡。
6. 移除 Co-Worker 不改歷史分攤，但立即禁止其寫入；新增成員不參與舊支出。
7. 偽造跨 Trip expense_id、付款人、分攤名單、總額不符、重複 ID、負數／超精度皆遭拒，且無部分寫入。
8. Owner／Co-Workers 可 CRUD；訪客／非成員即使直接呼叫 RPC 也無法寫入；直接表寫入遭拒。
9. 刪除支出連帶刪 splits，不刪 Trip；刪除 Trip 連帶刪支出與 splits。
10. 現有旅程、行程、Google 登入與部署不受影響；前端 build 成功。

Agent 應提供金額分配與結算的必要單元測試，以及 RPC／權限的可重現驗證步驟；未連線的遠端檢查不得宣稱已通過。

## 8. Agent 交付要求

- 實作前先核對現有 schema、RLS、前端服務層与使用者名稱來源。
- 交付新 migration、RPC、前端服務／型別、共同支出 Tab、結算與金額算法及必要測試。
- 不使用 service_role key 於前端，不提交 .env.local。
- 說明變更檔案、驗證結果、migration 套用順序與手動測試方式。
- 現有 migrations 曾由 Dashboard 手動執行；勿假設 CLI migration history 已同步，不要盲目 db push 重播舊 migration。
- 本次先完成實作與本機檢查；不自動執行遠端 SQL、不 commit／push，回報新增 migration 供使用者套用。
