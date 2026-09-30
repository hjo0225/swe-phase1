import { useSyncExternalStore } from 'react';
import type { ProseMirrorDocDto } from '../../../../shared/ipc/notes';
import { getBlink } from '../../../shared/api/blink';
import { AutosaveRegistry, type SaveStatus } from './save-queue';

export interface NotePayload {
  title: string;
  content: ProseMirrorDocDto;
}

const DEBOUNCE_MS = 700;

let registry: AutosaveRegistry<NotePayload> | undefined;
const savedListeners = new Set<(noteId: string) => void>();

/** 앱 전체에서 하나. React 밖에 있어야 노트를 전환해도 대기 중인 저장이 끝까지 실행된다. */
export function getAutosave(): AutosaveRegistry<NotePayload> {
  registry ??= new AutosaveRegistry<NotePayload>(
    async (id, payload) => {
      await getBlink().notes.update({ id, ...payload });
      for (const listener of savedListeners) listener(id);
    },
    { debounceMs: DEBOUNCE_MS },
  );
  return registry;
}

export function onNoteSaved(listener: (noteId: string) => void): () => void {
  savedListeners.add(listener);
  return () => savedListeners.delete(listener);
}

export function useSaveStatus(noteId: string): SaveStatus {
  const queue = getAutosave().get(noteId);
  return useSyncExternalStore(
    (onChange) => queue.subscribe(onChange),
    () => queue.status,
  );
}

export function resetAutosaveForTests(): void {
  registry = undefined;
  savedListeners.clear();
}
