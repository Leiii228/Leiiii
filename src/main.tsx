import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createChatService } from './chat/createChatService';
import { ChatStore } from './state/chatStore';
import { ChatProvider } from './state/ChatContext';
import './styles/tokens.css';
import './styles/app.css';

const store = new ChatStore(createChatService());
void store.start();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChatProvider store={store}>
      <App />
    </ChatProvider>
  </StrictMode>,
);
