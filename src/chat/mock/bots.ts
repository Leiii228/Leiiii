import type { Member, Message } from '../types';

// 示範模式的機器人網友：隨機進來、離開、聊天、按表情、傳圖片、編輯或收回自己的訊息。

export interface BotProfile {
  userId: string;
  nickname: string;
}

export const BOTS: BotProfile[] = [
  { userId: 'bot-cat', nickname: '路過的貓' },
  { userId: 'bot-owl', nickname: '夜貓子' },
  { userId: 'bot-hua', nickname: '阿華' },
  { userId: 'bot-rain', nickname: '小雨' },
];

const LINES = [
  '剛剛下了一場大雨',
  '有人也在追那部新劇嗎？',
  '今天捷運好擠',
  '晚餐吃了牛肉麵，好滿足',
  '我家的貓又把杯子推下桌了',
  '週末有人要去看展嗎',
  '咖啡喝太多，現在心跳好快',
  '終於把報告交出去了！',
  '外面的風好大',
  '有推薦的歌單嗎？想找讀書時聽的',
  '剛剛看到一隻好可愛的柴犬',
  '好想放假喔',
];

const REPLIES = ['真的！', '哈哈哈', '同意', '好耶', '我也是這樣想', '+1', '有道理欸', '原來如此'];
const EMOJIS = ['👍', '❤️', '😂', '😮', '🥹', '🙏', '🔥'];
const IMAGE_CAPTIONS = ['剛拍的', '今天的天空', '路上看到的', ''];

/** 機器人需要假伺服器提供的動作 */
export interface BotHost {
  botOnline(bot: BotProfile): void;
  botAway(userId: string): void;
  botBack(userId: string): void;
  botLeave(userId: string): void;
  botSay(bot: BotProfile, text: string, withImage?: boolean): Promise<Message | null>;
  botEdit(messageId: string, text: string): void;
  botRetract(messageId: string): void;
  botReact(bot: BotProfile, messageId: string, emoji: string): void;
  recentMessages(): Message[];
}

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const between = (min: number, max: number) => min + Math.random() * (max - min);

type BotState = 'online' | 'away' | 'gone';

export class BotDirector {
  private readonly host: BotHost;
  private readonly state = new Map<string, BotState>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;

  constructor(host: BotHost) {
    this.host = host;
    for (const bot of BOTS) this.state.set(bot.userId, 'gone');
  }

  /** 一開始有 3 個在線上（假伺服器已經先把它們放進名單），阿華晚一點才進來 */
  start(): void {
    for (const bot of this.initiallyOnline()) this.state.set(bot.userId, 'online');
    this.later(between(20_000, 30_000), () => this.comeBack(BOTS[2]));
    this.scheduleTick();
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  initiallyOnline(): BotProfile[] {
    return BOTS.filter((b) => b.userId !== 'bot-hua');
  }

  /** 有人進來時，機器人打個招呼 */
  onHumanJoined(member: Member): void {
    this.later(between(1500, 3000), () => {
      const bot = this.randomOnline();
      if (bot) void this.host.botSay(bot, `歡迎 ${member.nickname}～`);
    });
  }

  /** 有人說話時，機器人可能按表情或回一句 */
  onHumanMessage(message: Message): void {
    if (Math.random() < 0.6) {
      this.later(between(1500, 4000), () => {
        const bot = this.randomOnline();
        if (bot) this.host.botReact(bot, message.id, pick(EMOJIS));
      });
    }
    if (Math.random() < 0.35) {
      this.later(between(3000, 6000), () => {
        const bot = this.randomOnline();
        if (bot) void this.host.botSay(bot, pick(REPLIES));
      });
    }
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.stopped) fn();
    }, ms);
    this.timers.add(t);
  }

  private online(): BotProfile[] {
    return BOTS.filter((b) => this.state.get(b.userId) === 'online');
  }

  private randomOnline(): BotProfile | null {
    const xs = this.online();
    return xs.length ? pick(xs) : null;
  }

  private scheduleTick(): void {
    this.later(between(7000, 15_000), () => {
      this.tick();
      this.scheduleTick();
    });
  }

  private tick(): void {
    const bot = this.randomOnline();
    if (!bot) return;
    const roll = Math.random();
    if (roll < 0.45) void this.host.botSay(bot, pick(LINES));
    else if (roll < 0.7) this.reactSomewhere(bot);
    else if (roll < 0.77) void this.host.botSay(bot, pick(IMAGE_CAPTIONS), true);
    else if (roll < 0.83) void this.sayThenEdit(bot);
    else if (roll < 0.87) void this.sayThenRetract(bot);
    else this.awayCycle(bot);
  }

  private reactSomewhere(bot: BotProfile): void {
    const candidates = this.host
      .recentMessages()
      .filter((m) => !m.retracted && m.userId !== bot.userId)
      .slice(-8);
    if (candidates.length) this.host.botReact(bot, pick(candidates).id, pick(EMOJIS));
  }

  private async sayThenEdit(bot: BotProfile): Promise<void> {
    const m = await this.host.botSay(bot, '今天好冷喔');
    if (m) this.later(between(4000, 8000), () => this.host.botEdit(m.id, '今天好冷喔，大家記得多穿一點'));
  }

  private async sayThenRetract(bot: BotProfile): Promise<void> {
    const m = await this.host.botSay(bot, '欸我剛剛是不是打錯群組了');
    if (m) this.later(between(4000, 7000), () => this.host.botRetract(m.id));
  }

  /** 暫時離開：一半是 30 秒內就回來（不該有提示），一半超過 1 分鐘（會出現離開提示） */
  private awayCycle(bot: BotProfile): void {
    if (this.online().length <= 2) return;
    const long = Math.random() < 0.5;
    this.state.set(bot.userId, 'away');
    this.host.botAway(bot.userId);
    if (long) {
      this.later(60_000, () => {
        this.state.set(bot.userId, 'gone');
        this.host.botLeave(bot.userId);
      });
      this.later(between(80_000, 120_000), () => this.comeBack(bot));
    } else {
      this.later(between(20_000, 35_000), () => {
        this.state.set(bot.userId, 'online');
        this.host.botBack(bot.userId);
      });
    }
  }

  private comeBack(bot: BotProfile): void {
    if (this.state.get(bot.userId) === 'online') return;
    this.state.set(bot.userId, 'online');
    this.host.botOnline(bot);
  }
}
