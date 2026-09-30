import { useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { NoteSearchHit } from '../../../../shared/ipc/notes';
import { linkTargetFor } from '../../../../shared/notes/wiki-link';
import { useDebouncedValue } from '../../../shared/hooks/use-debounced-value';
import { formatRelativeTime } from '../../../shared/lib/relative-time';
import { useActiveEditor } from '../../editor/ActiveEditorContext';
import { fetchNotePreview, useNoteList, useNoteSearch } from '../api/note-queries';
import { sanitizeImportedContent } from '../model/sanitize-imported-content';
import { NotePreviewPane } from './NotePreviewPane';
import styles from './SearchPalette.module.css';

const SEARCH_DEBOUNCE_MS = 200;

/** Major 2: 과거 노트 검색 → 열기 / 연결 / 내용 가져오기 (docs/frontend/data-flow.md 흐름 3). */
export function SearchPalette({ onClose }: { onClose(): void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const { active } = useActiveEditor();
  const { data: hits = [], isFetching, isError } = useNoteSearch(debounced, active?.noteId);
  const { data: allNotes = [] } = useNoteList();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setSelected(0), [hits]);

  const open = (hit: NoteSearchHit) => {
    onClose();
    void navigate(`/notes/${hit.id}`);
  };

  // 편집기는 포커스를 잃어도 선택 위치를 기억한다 → 팔레트를 열기 전 커서에 삽입된다.
  const insert = (content: JSONContent[]) => {
    if (!active) return;
    const { editor } = active;
    editor.chain().focus().insertContentAt(editor.state.selection.to, sanitizeImportedContent(content)).run();
    onClose();
  };

  // 옵시디언처럼 이름만으로 구분되면 `[[이름]]`, 같은 이름이 여럿이면 경로를 적는다.
  const link = (hit: NoteSearchHit) => {
    const target = linkTargetFor(
      hit.path,
      allNotes.map((n) => n.path),
    );
    active?.editor.chain().focus().insertNoteLink({ target, label: '' }).run();
    onClose();
  };

  const importAll = async (id: string) => {
    if (!active) return;
    const note = await fetchNotePreview(queryClient, id);
    const doc = active.editor.markdown?.parse(note.content);
    insert((doc?.content ?? []) as JSONContent[]);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown') setSelected((i) => Math.min(i + 1, hits.length - 1));
    else if (event.key === 'ArrowUp') setSelected((i) => Math.max(i - 1, 0));
    else if (event.key === 'Enter' && hits[selected]) open(hits[selected]);
    else return;
    event.preventDefault();
  };

  const keywords = debounced.trim().split(/\s+/).filter(Boolean);

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="노트 검색" className={`glass-elevated ${styles.palette}`} onKeyDown={onKeyDown}>
        <label className={styles.inputRow}>
          <Search size={18} strokeWidth={1.75} aria-hidden />
          <input
            ref={inputRef}
            type="search"
            aria-label="노트 검색어"
            placeholder="제목이나 본문으로 노트 찾기"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isFetching && <span className={styles.spinner} aria-hidden />}
        </label>

        <div className={styles.body}>
          <div className={styles.results}>
            {keywords.length === 0 && <p className={styles.hint}>검색어를 입력하세요. ↑↓로 이동, Enter로 엽니다.</p>}
            {isError && <p className={styles.hint}>검색하지 못했습니다. 다시 입력해 보세요.</p>}
            {keywords.length > 0 && !isFetching && hits.length === 0 && !isError && (
              <p className={styles.hint}>일치하는 노트가 없습니다</p>
            )}
            {hits.map((hit, index) => (
              <article
                key={hit.id}
                aria-label={hit.title}
                className={styles.hit}
                data-selected={index === selected}
                onMouseEnter={() => setSelected(index)}
              >
                <div className={styles.hitHeader}>
                  <span className={styles.hitTitle}>{hit.title}</span>
                  <span className={styles.hitTime}>{formatRelativeTime(hit.updatedAt)}</span>
                </div>
                {hit.snippet && <p className={styles.snippet}>{highlight(hit.snippet, keywords)}</p>}
                <div className={styles.actions}>
                  <button type="button" onClick={() => open(hit)}>
                    열기
                  </button>
                  {active && (
                    <>
                      <button type="button" onClick={() => link(hit)}>
                        연결
                      </button>
                      <button type="button" onClick={() => void importAll(hit.id)}>
                        내용 가져오기
                      </button>
                      <button
                        type="button"
                        aria-pressed={previewId === hit.id}
                        onClick={() => setPreviewId((id) => (id === hit.id ? null : hit.id))}
                      >
                        미리보기
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          {previewId && active && (
            <NotePreviewPane noteId={previewId} onImportAll={() => void importAll(previewId)} onImportSelection={insert} />
          )}
        </div>
      </div>
    </div>
  );
}

function highlight(text: string, keywords: string[]) {
  if (keywords.length === 0) return text;
  const pattern = new RegExp(`(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(pattern).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
}
