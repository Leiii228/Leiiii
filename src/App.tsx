import { DemoBanner } from './components/DemoBanner';
import { ChatScreen } from './screens/ChatScreen';
import { NicknameScreen } from './screens/NicknameScreen';
import { useChatState } from './state/ChatContext';

export function App() {
  const { phase, demo } = useChatState();

  return (
    <div className="app">
      {demo.enabled && <DemoBanner />}
      {phase === 'starting' && <div className="starting">連線中…</div>}
      {phase === 'nickname' && <NicknameScreen />}
      {phase === 'chat' && <ChatScreen />}
    </div>
  );
}
