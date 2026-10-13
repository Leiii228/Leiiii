// 代號、訊息、圖片的規則（docs/architecture.md 第 9 節）。
// 假伺服器和畫面都用這一份；階段二時資料庫會再檢查一次同樣的規則。

export const NICKNAME_MAX = 20;
export const TEXT_MAX = 20_000;
export const IMAGES_MAX = 9;
export const IMAGE_BYTES_MAX = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

// 控制字元、零寬字元、文字方向控制字元：看不見，但可以用來假冒別人的代號
// （用字串建立：U+2028 寫在正規表示式字面值裡，打包工具會把它當成換行而出錯）
const INVISIBLE = new RegExp(
  '[\\u0000-\\u001F\\u007F-\\u009F\\u00AD\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\uFEFF]',
  'g',
);

/** 清掉看不見的字元、統一字元寫法、去掉前後空白（包括全形空白） */
export function cleanNickname(raw: string): string {
  return raw.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/** 用字（而不是位元組）計算長度，表情符號算一個字 */
export function charLength(s: string): number {
  return Array.from(s).length;
}

export function isValidNickname(cleaned: string): boolean {
  const n = charLength(cleaned);
  return n >= 1 && n <= NICKNAME_MAX;
}

/** 比較代號是否重複用：英文不分大小寫，全形半形視為相同 */
export function nicknameKey(nickname: string): string {
  return cleanNickname(nickname).normalize('NFKC').toLowerCase();
}

/** 把輸入框的內容截到最多 20 個字 */
export function clampNicknameInput(raw: string): string {
  return Array.from(raw).slice(0, NICKNAME_MAX).join('');
}

export function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
