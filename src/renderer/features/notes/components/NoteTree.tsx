import { ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { NavLink, useParams } from 'react-router';
import { BlinkIpcError } from '../../../../shared/ipc/errors';
import type { NoteSummary, VaultTree } from '../../../../shared/ipc/notes';
import { isUnsortedFolder } from '../../../../shared/notes/default-names';
import { useImportNotes } from '../../organize/api/organize-queries';
import { OrganizeDialog } from '../../organize/components/OrganizeDialog';
import { useCreateNote, useMoveNote, useNoteTree } from '../api/note-queries';
import { FolderDialog, type FolderDialogState } from './FolderDialogs';
import styles from './NoteTree.module.css';

const EXPANDED_KEY = 'blink.expandedFolders';
const DRAG_TYPE = 'application/x-blink-note';
/** 한 단계 들여쓰기 폭 (안내선 간격과 같다) */
const INDENT = 16;
const IMPORT_ERRORS: Partial<Record<string, string>> = {
  NOTE_IMPORT_LOCKED: 'The file is open in another program. Close it and drop it again',
  NOTE_IMPORT_INVALID: 'This file can\'t be imported',
  // 가져온 뒤 자동 배치에 임베딩이 필요하다 — 파일은 놓은 폴더에 들어가 있다
  AI_PROVIDER_NOT_CONFIGURED: 'Connect OpenAI in Settings',
  AI_CAPABILITY_UNSUPPORTED: 'Your current AI setup can\'t auto-organize. Connect OpenAI in Settings',
  ORGANIZE_EMBEDDING_FAILED: 'Couldn\'t read the note titles, so auto-organize didn\'t run',
  VAULT_BUSY: 'AI is organizing folders. Drop it again when it finishes',
};

interface FolderNode {
  path: string;
  name: string;
  folders: FolderNode[];
  notes: NoteSummary[];
  /** 하위 폴더까지 포함한 노트 수 */
  count: number;
}

/** 화면에 보이는 한 줄 (펼친 폴더 안쪽만 포함). 21st Tree View처럼 평평한 목록으로 키보드 이동을 계산한다. */
type Row =
  | { key: string; kind: 'folder'; level: number; parent: string | null; label: string; folder: FolderNode }
  | { key: string; kind: 'note'; level: number; parent: string | null; label: string; note: NoteSummary };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ko');
const folderKey = (path: string) => `folder:${path}`;
const noteKey = (id: string) => `note:${id}`;

function buildTree(tree: VaultTree): FolderNode {
  const root: FolderNode = { path: '', name: '', folders: [], notes: [], count: 0 };
  const nodes = new Map<string, FolderNode>([['', root]]);
  const ensure = (path: string): FolderNode => {
    const existing = nodes.get(path);
    if (existing) return existing;
    const cut = path.lastIndexOf('/');
    const node: FolderNode = { path, name: path.slice(cut + 1), folders: [], notes: [], count: 0 };
    nodes.set(path, node);
    ensure(cut < 0 ? '' : path.slice(0, cut)).folders.push(node);
    return node;
  };
  for (const folder of tree.folders) ensure(folder);
  for (const note of tree.notes) ensure(note.folder).notes.push(note);
  const finish = (node: FolderNode): number => {
    node.folders.sort(byName);
    node.notes.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    node.count = node.notes.length + node.folders.reduce((n, f) => n + finish(f), 0);
    return node.count;
  };
  finish(root);
  return root;
}

function visibleRows(root: FolderNode, open: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const walk = (node: FolderNode, level: number, parent: string | null) => {
    for (const folder of node.folders) {
      const key = folderKey(folder.path);
      rows.push({ key, kind: 'folder', level, parent, label: folder.name, folder });
      if (open.has(folder.path)) walk(folder, level + 1, key);
    }
    for (const note of node.notes) rows.push({ key: noteKey(note.id), kind: 'note', level, parent, label: note.title, note });
  };
  walk(root, 1, null);
  return rows;
}

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

interface NoteTreeProps {
  selectedFolder: string;
  onSelectFolder(path: string): void;
}

/**
 * 보관함의 폴더·노트 (UC-FOLDER) — 21st.dev Tree View(uvain)의 키보드 모델을 옮겼다.
 * 트리 전체가 Tab 한 번이고, ↑↓ 이동 · →← 펼치기/접기/부모로 · Home/End · 글자로 찾기. 폴더 옆에는 노트 수, 깊이마다 안내선.
 * 폴더를 누르면 펼치고 선택한다 — 새 노트·새 폴더는 선택한 폴더에 생긴다. 폴더 메뉴는 ⋯ 버튼·오른쪽 클릭·Shift+F10.
 */
export function NoteTree({ selectedFolder, onSelectFolder }: NoteTreeProps) {
  const { data: tree, isPending, isError, refetch } = useNoteTree();
  const { noteId } = useParams();
  const root = useMemo(() => (tree ? buildTree(tree) : null), [tree]);
  const [expanded, setExpanded] = useState(loadExpanded);
  const rows = useMemo(() => (root ? visibleRows(root, expanded) : []), [root, expanded]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dialog, setDialog] = useState<FolderDialogState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState<string | null>(null);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  const moveNote = useMoveNote();
  const importNotes = useImportNotes();
  const createNote = useCreateNote();
  const targets = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      // 저장하지 못해도 이번 실행 동안은 펼침 상태를 기억한다.
    }
  }, [expanded]);

  // Tab 순서에 남길 한 항목: 지금 포커스 → 열린 노트 → 맨 위
  const tabKey =
    (focusKey && rows.some((r) => r.key === focusKey) && focusKey) ||
    (noteId && rows.some((r) => r.key === noteKey(noteId)) && noteKey(noteId)) ||
    rows[0]?.key;

  const setOpen = (path: string, open: boolean) =>
    setExpanded((current) => {
      if (current.has(path) === open) return current;
      const next = new Set(current);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });

  const focus = (key: string | null | undefined) => {
    if (!key) return;
    setFocusKey(key);
    targets.current.get(key)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const index = rows.findIndex((r) => targets.current.get(r.key) === document.activeElement);
    const row = rows[index];
    if (!row) return;
    const isFolder = row.kind === 'folder';
    const isOpen = isFolder && expanded.has(row.folder.path);
    switch (event.key) {
      case 'ArrowDown':
        focus(rows[index + 1]?.key);
        break;
      case 'ArrowUp':
        focus(rows[index - 1]?.key);
        break;
      case 'ArrowRight':
        if (isFolder && !isOpen) setOpen(row.folder.path, true);
        else if (isFolder && rows[index + 1]?.parent === row.key) focus(rows[index + 1]!.key);
        break;
      case 'ArrowLeft':
        if (isOpen) setOpen(row.folder.path, false);
        else focus(row.parent);
        break;
      case 'Home':
        focus(rows[0]?.key);
        break;
      case 'End':
        focus(rows.at(-1)?.key);
        break;
      case 'F10':
        if (!event.shiftKey || !isFolder) return;
        setMenuFor(row.folder.path);
        break;
      case 'ContextMenu':
        if (!isFolder) return;
        setMenuFor(row.folder.path);
        break;
      default: {
        // 글자 하나: 다음에 그 글자로 시작하는 항목으로 (한글은 첫 글자 그대로 비교)
        if (event.key.length !== 1 || !/\S/.test(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
        const letter = event.key.toLowerCase();
        const after = [...rows.slice(index + 1), ...rows.slice(0, index)];
        focus(after.find((r) => r.label.toLowerCase().startsWith(letter))?.key);
      }
    }
    event.preventDefault();
  };

  const dropProps = (folder: string) => ({
    onDragOver: (event: DragEvent) => {
      const types = event.dataTransfer.types;
      if (!types.includes(DRAG_TYPE) && !types.includes('Files')) return;
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(folder);
    },
    onDragLeave: () => setDropTarget((current) => (current === folder ? null : current)),
    onDrop: (event: DragEvent) => {
      setDropTarget(null);
      const files = [...event.dataTransfer.files];
      if (files.length > 0) {
        // 바깥 파일: .md만 놓은 폴더로 가져와 자동 배치
        event.preventDefault();
        event.stopPropagation();
        const markdown = files.filter((file) => /\.md$/i.test(file.name));
        setDropMessage(markdown.length < files.length ? 'Only .md files can be added' : null);
        if (markdown.length > 0) importNotes.mutate({ files: markdown, folder });
        return;
      }
      const id = event.dataTransfer.getData(DRAG_TYPE);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      const note = tree?.notes.find((n) => n.id === id);
      if (note && note.folder !== folder) moveNote.mutate({ id, folder });
    },
  });

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) targets.current.set(key, el);
    else targets.current.delete(key);
  };

  const indent = (level: number) => 6 + (level - 1) * INDENT;
  const guides = (level: number) => (
    // 깊이마다 세로 안내선 (21st File Tree)
    <span data-guides="" aria-hidden className={styles.guides} style={{ width: (level - 1) * INDENT }} />
  );

  return (
    <section className={styles.tree} aria-label="Note list" data-dropping={dropTarget === ''} {...dropProps('')}>
      {isPending && <div className={styles.skeleton} aria-hidden />}
      {isError && (
        <button type="button" className={styles.message} onClick={() => void refetch()}>
          Couldn't load the list · Try again
        </button>
      )}
      {root && rows.length === 0 && <p className={styles.message}>No notes yet</p>}
      {root && rows.length > 0 && (
        <div role="tree" aria-label="Vault" className={styles.root} onKeyDown={onKeyDown}>
          {rows.map((row) => {
            const tabIndex = row.key === tabKey ? 0 : -1;
            if (row.kind === 'note') {
              return (
                <div key={row.key} role="treeitem" aria-label={row.label} aria-level={row.level} className={styles.row}>
                  {guides(row.level)}
                  <NavLink
                    ref={register(row.key)}
                    data-tree-key={row.key}
                    to={`/notes/${row.note.id}`}
                    tabIndex={tabIndex}
                    className={styles.note}
                    style={{ paddingLeft: indent(row.level) + 18 }}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DRAG_TYPE, row.note.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onFocus={() => setFocusKey(row.key)}
                    onClick={() => onSelectFolder(row.note.folder)}
                  >
                    <FileText size={14} strokeWidth={1.75} aria-hidden className={styles.icon} />
                    <span className={styles.title}>{row.label}</span>
                  </NavLink>
                </div>
              );
            }
            const { folder } = row;
            const open = expanded.has(folder.path);
            const menuOpen = menuFor === folder.path;
            return (
              <div
                key={row.key}
                role="treeitem"
                aria-label={row.label}
                aria-level={row.level}
                aria-expanded={open}
                className={styles.row}
              >
                {guides(row.level)}
                <div
                  className={styles.folderRow}
                  data-selected={selectedFolder === folder.path}
                  data-dropping={dropTarget === folder.path}
                  data-menu-open={menuOpen || undefined}
                  {...dropProps(folder.path)}
                >
                  <button
                    ref={register(row.key)}
                    data-tree-key={row.key}
                    type="button"
                    tabIndex={tabIndex}
                    className={styles.folder}
                    style={{ paddingLeft: indent(row.level) }}
                    onFocus={() => setFocusKey(row.key)}
                    onClick={() => {
                      setOpen(folder.path, !open);
                      onSelectFolder(folder.path);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenuFor(folder.path);
                    }}
                  >
                    <ChevronRight size={14} strokeWidth={1.75} aria-hidden className={styles.chevron} data-open={open} />
                    {open ? (
                      <FolderOpen size={14} strokeWidth={1.75} aria-hidden className={styles.icon} />
                    ) : (
                      <Folder size={14} strokeWidth={1.75} aria-hidden className={styles.icon} />
                    )}
                    <span className={styles.title}>{row.label}</span>
                    {/* 버튼 이름은 폴더 이름만 — 수는 눈으로만 본다 */}
                    <span className={styles.count} aria-hidden title={`${folder.count} ${folder.count === 1 ? 'note' : 'notes'}`}>
                      {folder.count}
                    </span>
                  </button>
                  <FolderMenu
                    folder={folder}
                    open={menuOpen}
                    onOpenChange={(next) => {
                      setMenuFor(next ? folder.path : null);
                      if (!next) targets.current.get(row.key)?.focus();
                    }}
                    onCreateNote={() => createNote.mutate(folder.path)}
                    onDialog={setDialog}
                    onOrganize={() => setOrganizing(folder.path)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {dialog && <FolderDialog state={dialog} onClose={() => setDialog(null)} />}
      {organizing !== null && <OrganizeDialog folder={organizing} onClose={() => setOrganizing(null)} />}
      {dropMessage && (
        <p role="alert" className={styles.message}>
          {dropMessage}
        </p>
      )}
      {importNotes.isError && (
        <p role="alert" className={styles.message}>
          {(importNotes.error instanceof BlinkIpcError && IMPORT_ERRORS[importNotes.error.code]) || 'Couldn\'t import the file'}
        </p>
      )}
      {dialog === null && moveNote.isError && <p role="alert" className={styles.message}>A note with the same name exists, so it wasn't moved</p>}
    </section>
  );
}

interface FolderMenuProps {
  folder: FolderNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  onCreateNote(): void;
  onDialog(state: FolderDialogState): void;
  onOrganize(): void;
}

function FolderMenu({ folder, open, onOpenChange, onCreateNote, onDialog, onOrganize }: FolderMenuProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // 열릴 때 한 번: 첫 항목에 포커스, 바깥을 누르면 닫기
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) onOpenChangeRef.current(false);
    };
    document.addEventListener('mousedown', close);
    anchorRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const act = (run: () => void) => () => {
    onOpenChange(false);
    run();
  };

  return (
    <div
      ref={anchorRef}
      className={styles.menuAnchor}
      onKeyDown={(event) => {
        // 메뉴 안의 키는 트리로 올려 보내지 않는다
        event.stopPropagation();
        if (event.key === 'Escape') onOpenChange(false);
      }}
    >
      <button
        type="button"
        tabIndex={-1}
        className={styles.menuButton}
        aria-label={`${folder.name} folder menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <MoreHorizontal size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <div role="menu" className={`glass-elevated ${styles.menu}`}>
          <button type="button" role="menuitem" onClick={act(onCreateNote)}>
            New note
          </button>
          <button type="button" role="menuitem" onClick={act(() => onDialog({ kind: 'create', parent: folder.path }))}>
            New folder
          </button>
          {!isUnsortedFolder(folder.name) && (
            <button type="button" role="menuitem" onClick={act(onOrganize)}>
              Organize
            </button>
          )}
          <button type="button" role="menuitem" onClick={act(() => onDialog({ kind: 'rename', path: folder.path }))}>
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.danger}
            onClick={act(() => onDialog({ kind: 'delete', path: folder.path, noteCount: folder.count }))}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
