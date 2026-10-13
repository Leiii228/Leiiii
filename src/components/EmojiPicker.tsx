import { useEffect, useRef } from 'react';
import { Picker } from 'emoji-picker-element';
import dataSource from 'emoji-picker-element-data/zh-hant/cldr/data.json?url';
import { useLatest } from '../lib/useLatest';
import { Sheet } from './Sheet';

// 表情資料打包在網站裡（繁體中文的搜尋關鍵字），不需要連到其他網站下載
const i18n = {
  categoriesLabel: '分類',
  emojiUnsupportedMessage: '你的瀏覽器不支援彩色表情符號。',
  favoritesLabel: '最近使用',
  loadingMessage: '載入中…',
  networkErrorMessage: '無法載入表情符號。',
  regionLabel: '表情選單',
  searchDescription: '有搜尋結果時，用上下鍵選擇，按 Enter 確定。',
  searchLabel: '搜尋表情',
  searchResultsLabel: '搜尋結果',
  skinToneDescription: '展開後，用上下鍵選擇，按 Enter 確定。',
  skinToneLabel: '選擇膚色（目前是 {skinTone}）',
  skinTonesLabel: '膚色',
  skinTones: ['預設', '淺', '中淺', '中', '中深', '深'],
  categories: {
    custom: '自訂',
    'smileys-emotion': '表情',
    'people-body': '人物',
    'animals-nature': '動物與自然',
    'food-drink': '食物',
    'travel-places': '旅行',
    activities: '活動',
    objects: '物品',
    symbols: '符號',
    flags: '旗幟',
  },
};

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onPick, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onPickRef = useLatest(onPick);

  useEffect(() => {
    const picker = new Picker({ dataSource, locale: 'zh-hant', i18n });
    const onClick = (e: Event) => {
      const unicode = (e as CustomEvent<{ unicode?: string }>).detail.unicode;
      if (unicode) onPickRef.current(unicode);
    };
    picker.addEventListener('emoji-click', onClick);
    hostRef.current?.appendChild(picker);
    return () => {
      picker.removeEventListener('emoji-click', onClick);
      picker.remove();
    };
  }, [onPickRef]);

  return (
    <Sheet title="選擇表情" closeLabel="關閉表情選單" onClose={onClose}>
      <div ref={hostRef} className="emoji-host" />
    </Sheet>
  );
}
