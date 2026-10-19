# 匿名聊天室

不用登入的匿名即時聊天室。設計與架構請看 `docs/`：

- `docs/requirements.md`：需求
- `docs/architecture.md`：架構（技術選擇、通訊約定、畫面清單、驗證清單）
- `docs/design.md`：畫面設計

目前在**階段二**：已經接上 Supabase。沒有設定 Supabase，或網址加上 `?mock=1` 時，會使用示範模式（假伺服器加上機器人網友）。

## 功能

### 基本功能
- 不用註冊：輸入 1～20 字的代號就能進入，同一時間在線上的代號不能重複
- 所有人在同一個聊天室，訊息即時送達（Supabase Realtime）
- 線上名單：有人進來或離開時，聊天室裡會出現提示
  - 按「離開」：其他人馬上看到「○○ 離開了」
  - 關掉分頁、手機切到別的 App：先顯示「暫離」，超過 60 秒才算離開，60 秒內回來不會出現任何提示
- 進來時看得到最近 50 則訊息（24 小時內）
- 電腦和手機都能用（手機版線上名單收在上方的「👥」按鈕）

### 新增功能

| 功能 | 怎麼試 | 程式位置 |
|---|---|---|
| **表情回應**，可以看到是誰按的 | 每則訊息下面的「＋😊」→ 選一個表情。電腦上滑鼠移到「👍 1」上、手機上長按，會列出按的人 | `src/components/ReactionBar.tsx`、`src/components/EmojiPicker.tsx`；資料表 `reactions`（`supabase/migrations/0001_init.sql`） |
| **編輯、收回自己的訊息** | 自己訊息旁的「⋯」→「編輯」或「收回」。編輯過的會顯示「(已編輯)」，收回後大家看到「○○ 收回了一則訊息」 | `src/components/MessageBubble.tsx`、`src/components/Composer.tsx`（編輯模式）；權限與觸發器在 `0001_init.sql` |
| **傳送圖片**（Supabase Storage） | 輸入框左邊的 📎 → 一次最多選 9 張，可以附文字。圖片會先在你的裝置上壓縮再上傳 | `src/components/Composer.tsx`、`src/lib/compressImage.ts`、`src/components/ImageGrid.tsx`；bucket `chat-images`（`0001_init.sql`） |
| **圖片放大檢視** | 點訊息裡的圖片 → 全螢幕顯示。電腦用左右鍵、手機左右滑換張。按 ✕、Esc 或往下滑關閉 | `src/components/Lightbox.tsx` |
| **網址自動變成可以點的連結** | 傳一則含有 `https://example.com` 的訊息 → 網址變成連結，點了用新分頁打開。只有 http/https 會變成連結 | `src/lib/linkify.ts`、`src/components/MessageText.tsx` |
| **分頁標題顯示未讀數** | 切到別的分頁，等別人傳訊息 → 分頁標題變成「(3) 匿名聊天室」，切回來就清除 | `src/lib/unreadTitle.ts`、`src/state/chatStore.ts`（`countUnread`） |
| **「有新訊息 ↓」按鈕** | 往上捲看舊訊息時有人傳訊息 → 不會被強迫捲到底，右下角出現「有 N 則新訊息 ↓」 | `src/components/MessageList.tsx` |
| **長訊息自動折疊** | 傳一則超過 15 行的訊息 → 先折起來，下面有「顯示全部」 | `src/components/MessageText.tsx` |
| **個人封鎖** | 線上名單某人旁邊的「⋯」→「封鎖」。只影響自己的畫面：看不到對方的訊息、表情和進出提示 | `src/components/MemberList.tsx`、`src/state/chatStore.ts`（`block`／`unblock`）、`src/components/MessageList.tsx`（過濾） |
| **伺服器端的發送頻率限制與欄位檢查** | 10 秒內送超過 5 則 → 出現「請慢一點」。由資料庫強制執行，繞過網頁也一樣會被擋 | `supabase/migrations/0001_init.sql`（觸發器 `messages_before_insert` 等）；前端 `src/lib/rateLimit.ts`、`src/lib/validation.ts` |
| **24 小時自動清除**（Edge Function + pg_cron） | 每小時自動刪掉 24 小時前的訊息、圖片，以及 7 天前的匿名身分 | `supabase/functions/cleanup/index.ts`、`supabase/migrations/0002_schedule.sql` |
| **主動離開馬上通知，斷線有 60 秒寬限** | 按「離開」→ 其他人馬上看到「離開了」。關分頁 → 先顯示「暫離」，60 秒後才算離開 | `src/chat/supabase/SupabaseChatService.ts`（`leave`、`onPeerLeft`、`onPresenceSync`） |
| **斷線重連** | 網路斷掉時上方出現「連線中斷，正在重新連線…」，送出按鈕不能按，打到一半的字會保留。重新連上後自動補上漏掉的訊息 | `src/components/TopBar.tsx`、`src/chat/supabase/SupabaseChatService.ts`（`onReconnected`） |
| **示範模式** | 網址後面加上 `?mock=1`，例如 <https://leiii228.github.io/anonymous-chat/?mock=1> → 改用機器人網友，不連 Supabase | `src/chat/mock/`、`src/chat/createChatService.ts` |

## 在自己的電腦上執行

需要先安裝 [Node.js](https://nodejs.org/)（22 版以上）。

```bash
npm install      # 第一次才需要：安裝套件
npm run dev      # 啟動本機預覽，打開 http://localhost:5173/anonymous-chat/
npm run build    # 檢查型別並打包到 dist/
npm run preview  # 預覽打包好的版本
```

## 部署

push 到 `main` 之後，GitHub Actions 會自動打包並部署到
<https://leiii228.github.io/anonymous-chat/>。

第一次要先到 repo 的 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。

## 金鑰

不要把 `.env`、`.env.local` 這類檔案 commit 進 git。需要哪些設定請看 `.env.example`。
