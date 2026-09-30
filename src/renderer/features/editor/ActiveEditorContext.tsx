import type { Editor } from '@tiptap/react';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface ActiveEditor {
  noteId: string;
  editor: Editor;
}

interface ActiveEditorValue {
  active: ActiveEditor | null;
  setActive(update: (current: ActiveEditor | null) => ActiveEditor | null): void;
}

const ActiveEditorContext = createContext<ActiveEditorValue>({ active: null, setActive: () => undefined });

/**
 * 지금 열린 노트의 편집기. 검색 팔레트(AppShell)가 연결·가져오기 대상을 알기 위해 쓴다.
 * 편집기는 NotePage가 등록하고 해제한다.
 */
export function ActiveEditorProvider({ children }: { children: ReactNode }) {
  const [active, setActiveState] = useState<ActiveEditor | null>(null);
  const value = useMemo(() => ({ active, setActive: setActiveState }), [active]);
  return <ActiveEditorContext.Provider value={value}>{children}</ActiveEditorContext.Provider>;
}

export const useActiveEditor = () => useContext(ActiveEditorContext);
