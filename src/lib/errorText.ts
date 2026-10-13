import type { ChatErrorCode } from '../chat/types';

/** 錯誤代碼 → 畫面上的文字 */
export function errorText(code: ChatErrorCode, waitSeconds?: number): string {
  switch (code) {
    case 'NICKNAME_TAKEN':
      return '這個代號有人在用了，請換一個';
    case 'NICKNAME_TAKEN_WHILE_AWAY':
      return '你的代號在你離開時被使用了，請換一個';
    case 'NICKNAME_INVALID':
      return '代號要 1～20 個字';
    case 'RATE_LIMITED':
      return waitSeconds ? `請慢一點，${waitSeconds} 秒後可以再送出` : '請慢一點';
    case 'TOO_LONG':
      return '訊息太長了，最多 20,000 字';
    case 'EMPTY':
      return '沒有可以送出的內容';
    case 'TOO_MANY_IMAGES':
      return '一則最多 9 張，只收了前 9 張';
    case 'IMAGE_TOO_LARGE':
      return '有圖片太大了（壓縮後仍超過 5 MB），已略過';
    case 'IMAGE_UNSUPPORTED':
      return '只能傳 JPEG、PNG、WebP、GIF 或 HEIC 圖片，其他檔案已略過';
    case 'UPLOAD_FAILED':
    case 'SEND_FAILED':
      return '傳送失敗';
    case 'NOT_OWNER':
      return '只能修改自己的訊息';
    case 'OFFLINE':
      return '連線中斷，請等重新連線後再試';
  }
}
