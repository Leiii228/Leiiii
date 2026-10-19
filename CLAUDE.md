# CLAUDE.md

不用登入的匿名即時聊天室：前端放在 GitHub Pages，即時傳訊使用 Supabase。

## 開始任何工作前

先讀 `docs/architecture.md`。所有技術決定、通訊約定、畫面清單和驗證清單都在這份文件裡，需求來源是 `docs/requirements.md`。

## 目前進度：階段二

- 前端已經接上 Supabase（專案 `chuiwkcwznetmifzyeba`，東京）。有 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY` 時使用 `SupabaseChatService`，沒有時或網址加上 `?mock=1` 時使用 `MockChatService`（示範模式）。
- 畫面層和狀態層不可以直接使用 Supabase。Supabase 的程式只能放在 `src/chat/supabase/`。
- 不使用 Supabase CLI。資料庫設定在 `supabase/migrations/`、清理程式在 `supabase/functions/cleanup/`，都是在 Supabase 網頁上貼上執行或部署。改了這些檔案，要請使用者在網頁上重新執行或部署。

## 金鑰

- **不可以把金鑰檔案 commit 進 git**，包括 `.env`、`.env.local` 和其他 `.env.*`（`.env.example` 除外，而且裡面只能放欄位名稱，不能放值）。
- 程式碼裡不可以寫任何金鑰的值，一律從環境變數讀取。
- `VITE_` 開頭的環境變數會被打包進網頁，只能放可以公開的值。Supabase 的 secret key 絕對不可以用 `VITE_` 開頭。
- commit 之前用 `git status` 確認沒有金鑰檔案被加進去。
