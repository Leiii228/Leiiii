import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { ChatState, ChatStore } from './chatStore';

const StoreContext = createContext<ChatStore | null>(null);

export function ChatProvider({ store, children }: { store: ChatStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useChatStore(): ChatStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useChatStore 必須在 ChatProvider 裡面使用');
  return store;
}

export function useChatState(): ChatState {
  const store = useChatStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
