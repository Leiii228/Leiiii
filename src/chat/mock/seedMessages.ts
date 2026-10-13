import type { Message, Reaction } from '../types';
import { BOTS } from './bots';

// 一進聊天室就看得到的歷史訊息，用來測試「最近 50 則」、日期分隔線、編輯、收回、長訊息、圖片格子。

const LONG_TEXT = [
  '分享一下這週的心得：',
  '第一次自己煮了一整週的晚餐。',
  '星期一煮了番茄蛋，太鹹。',
  '星期二的炒青菜還不錯。',
  '星期三煮麵忘了計時，糊掉了。',
  '星期四學乖了，照食譜一步一步來。',
  '星期五的咖哩真的很好吃！',
  '然後發現市場的阿姨會多送青菜，',
  '早點去還能挑到最新鮮的。',
  '週末買了一個小砂鍋，',
  '燉了一鍋蘿蔔排骨湯，',
  '室友說比外面賣的還好喝（應該是客套）。',
  '下週想挑戰滷肉飯，',
  '有人有推薦的做法嗎？',
  '另外也想問問大家都怎麼備料，',
  '每天下班再切菜真的好累。',
  '以上，謝謝收看。',
].join('\n');

export interface Seed {
  messages: Message[];
  reactions: Reaction[];
  /** 這些訊息的圖片要另外產生 */
  imageCounts: Record<string, number>;
}

export function buildSeed(now: number): Seed {
  const [cat, owl, hua, rain] = BOTS;
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const msg = (
    id: string,
    bot: (typeof BOTS)[number],
    minutesAgo: number,
    text: string,
    extra: Partial<Message> = {},
  ): Message => ({
    id,
    userId: bot.userId,
    nickname: bot.nickname,
    text,
    images: [],
    createdAt: at(minutesAgo),
    editedAt: null,
    retracted: false,
    ...extra,
  });

  const messages: Message[] = [
    msg('seed-01', rain, 23 * 60 + 10, '明天要早起，先睡了，晚安'),
    msg('seed-02', owl, 23 * 60 + 5, '晚安～'),
    msg('seed-03', owl, 50, '有人在嗎～今天好冷'),
    msg('seed-04', owl, 49, '剛買了熱可可，暖到心裡'),
    msg('seed-05', cat, 40, '推薦這家，很適合下雨天窩著 https://example.com/cafe', { editedAt: at(38) }),
    msg('seed-06', hua, 30, '', { retracted: true }),
    msg('seed-07', rain, 25, LONG_TEXT),
    msg('seed-08', cat, 20, '今天的晚霞'),
    msg('seed-09', owl, 5, '等等要去吃東西，有人有推薦嗎？'),
  ];

  const react = (messageId: string, bot: (typeof BOTS)[number], emoji: string): Reaction => ({
    messageId,
    userId: bot.userId,
    nickname: bot.nickname,
    emoji,
  });

  const reactions: Reaction[] = [
    react('seed-01', owl, '🌙'),
    react('seed-01', cat, '🌙'),
    react('seed-04', rain, '👍'),
    react('seed-04', cat, '👍'),
    react('seed-04', hua, '❤️'),
    react('seed-07', owl, '😂'),
    react('seed-08', owl, '😮'),
  ];

  return { messages, reactions, imageCounts: { 'seed-08': 2 } };
}
