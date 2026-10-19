import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 網站放在 https://leiii228.github.io/anonymous-chat/，不是網域的根目錄，
// 所以所有檔案路徑都要加上 /anonymous-chat/ 前綴，否則打開會是一片空白。
export default defineConfig({
  base: '/anonymous-chat/',
  plugins: [react()],
});
