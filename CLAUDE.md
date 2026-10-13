# CLAUDE.md

不用登入的匿名即時聊天室：前端放在 GitHub Pages，即時傳訊使用 Supabase。

## 開始任何工作前

先讀 `docs/architecture.md`。所有技術決定、通訊約定、畫面清單和驗證清單都在這份文件裡，需求來源是 `docs/requirements.md`。

## 目前進度：階段一

- 只做前端。連線用 `MockChatService`（假伺服器），**還不要接 Supabase**。
- 畫面層和狀態層不可以直接使用 Supabase。Supabase 的程式只能放在 `src/chat/supabase/`（階段二才會建立）。

## 金鑰

- **不可以把金鑰檔案 commit 進 git**，包括 `.env`、`.env.local` 和其他 `.env.*`（`.env.example` 除外，而且裡面只能放欄位名稱，不能放值）。
- 程式碼裡不可以寫任何金鑰的值，一律從環境變數讀取。
- `VITE_` 開頭的環境變數會被打包進網頁，只能放可以公開的值。Supabase 的 secret key 絕對不可以用 `VITE_` 開頭。
- commit 之前用 `git status` 確認沒有金鑰檔案被加進去。
