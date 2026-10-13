# 匿名聊天室

不用登入的匿名即時聊天室。設計與架構請看 `docs/`：

- `docs/requirements.md`：需求
- `docs/architecture.md`：架構（技術選擇、通訊約定、畫面清單、驗證清單）
- `docs/design.md`：畫面設計

目前在**階段一**：還沒接 Supabase，網站使用示範模式（假伺服器加上機器人網友）。

## 在自己的電腦上執行

需要先安裝 [Node.js](https://nodejs.org/)（22 版以上）。

```bash
npm install      # 第一次才需要：安裝套件
npm run dev      # 啟動本機預覽，打開 http://localhost:5173/Leiiii/
npm run build    # 檢查型別並打包到 dist/
npm run preview  # 預覽打包好的版本
```

## 部署

push 到 `main` 之後，GitHub Actions 會自動打包並部署到
<https://leiii228.github.io/Leiiii/>。

第一次要先到 repo 的 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。

## 金鑰

不要把 `.env`、`.env.local` 這類檔案 commit 進 git。需要哪些設定請看 `.env.example`。
