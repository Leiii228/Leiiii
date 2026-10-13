import { Info } from 'lucide-react';
import { useChatState, useChatStore } from '../state/ChatContext';

/** 示範模式提示條，加上兩個測試用的開關 */
export function DemoBanner() {
  const store = useChatStore();
  const { demo, phase } = useChatState();

  return (
    <div className="demo-banner" role="note">
      <span className="demo-banner__text">
        <Info size={16} aria-hidden="true" />
        示範模式：其他人是模擬的，訊息不會被保存
      </span>
      {phase === 'chat' && (
        <span className="demo-banner__controls">
          <button
            type="button"
            className="demo-toggle"
            aria-pressed={demo.offline}
            onClick={() => store.setDemoOffline(!demo.offline)}
          >
            模擬斷線
          </button>
          <button
            type="button"
            className="demo-toggle"
            aria-pressed={demo.failNext}
            onClick={() => store.setDemoFailNext(!demo.failNext)}
          >
            下一則傳送失敗
          </button>
        </span>
      )}
    </div>
  );
}
