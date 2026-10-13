const BASE_TITLE = '匿名聊天室';

/** 分頁標題：沒有未讀時是「匿名聊天室」，有的話是「(3) 匿名聊天室」 */
export function setUnreadTitle(count: number): void {
  document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
}
