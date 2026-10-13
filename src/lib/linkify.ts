import { isSafeHttpUrl } from './validation';

export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

// 只有 http:// 和 https:// 開頭的才變成連結；結尾的標點不算在網址裡
const URL_RE = /https?:\/\/[^\s<>"'`）」』】]+/g;
const TRAILING = /[.,!?;:，。！？；：、)\]]+$/;

/** 把訊息文字切成「一般文字」和「連結」，畫面一律當純文字顯示，不會執行任何原始碼 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    let url = match[0];
    const trailing = url.match(TRAILING)?.[0] ?? '';
    if (trailing) url = url.slice(0, -trailing.length);
    const start = match.index ?? 0;
    if (!isSafeHttpUrl(url)) continue;
    if (start > last) parts.push({ kind: 'text', text: text.slice(last, start) });
    parts.push({ kind: 'link', text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}
