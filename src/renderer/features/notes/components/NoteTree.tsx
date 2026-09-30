import { ChevronRight, FileText, Folder, FolderOpen, MoreHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { NavLink } from 'react-router';
import type { NoteSummary, VaultTree } from '../../../../shared/ipc/notes';
import { useCreateNote, useMoveNote, useNoteTree } from '../api/note-queries';
import { FolderDialog, type FolderDialogState } from './FolderDialogs';
import styles from './NoteTree.module.css';

const EXPANDED_KEY = 'blink.expandedFolders';
const DRAG_TYPE = 'application/x-blink-note';

interface FolderNode {
  path: string;
  name: string;
  folders: FolderNode[];
  notes: NoteSummary[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ko');

function buildTree(tree: VaultTree): FolderNode {
  const root: FolderNode = { path: '', name: '', folders: [], notes: [] };
  const nodes = new Map<string, FolderNode>([['', root]]);
  const ensure = (path: string): FolderNode => {
    const existing = nodes.get(path);
    if (existing) return existing;
    const cut = path.lastIndexOf('/');
    const node: FolderNode = { path, name: path.slice(cut + 1), folders: [], notes: [] };
    nodes.set(path, node);
    ensure(cut < 0 ? '' : path.slice(0, cut)).folders.push(node);
    return node;
  };
  for (const folder of tree.folders) ensure(folder);
  for (const note of tree.notes) ensure(note.folder).notes.push(note);
  for (const node of nodes.values()) {
    node.folders.sort(byName);
    node.notes.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  }
  return root;
}

const countNotes = (node: FolderNode): number => node.notes.length + node.folders.reduce((n, f) => n + countNotes(f), 0);

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

/** 보관함의 폴더·노트 (UC-FOLDER). 폴더를 누르면 펼치고 선택한다 — 새 노트·새 폴더는 선택한 폴더에 생긴다. */
export function NoteTree({ selectedFolder, onSelectFolder }: NoteTreeProps) {
  const { data: tree, isPending, isError, refetch } = useNoteTree();
  const root = useMemo(() => (tree ? buildTree(tree) : null), [tree]);
  const [expanded, setExpanded] = useState(loadExpanded);
  const [dialog, setDialog] = useState<FolderDialogState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const moveNote = useMoveNote();

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      // 저장하지 못해도 이번 실행 동안은 펼침 상태를 기억한다.
    }
  }, [expanded]);

  const toggle = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const dropProps = (folder: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(folder);
    },
    onDragLeave: () => setDropTarget((current) => (current === folder ? null : current)),
    onDrop: (event: DragEvent) => {
      const id = event.dataTransfer.getData(DRAG_TYPE);
      setDropTarget(null);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      const note = tree?.notes.find((n) => n.id === id);
      if (note && note.folder !== folder) moveNote.mutate({ id, folder });
    },
  });

  const renderFolder = (node: FolderNode, depth: number) => {
    const open = expanded.has(node.path);
    return (
      <li key={`folder:${node.path}`} role="treeitem" aria-expanded={open} aria-label={node.name}>
        <FolderRow
          node={node}
          depth={depth}
          open={open}
          selected={selectedFolder === node.path}
          dropping={dropTarget === node.path}
          dropProps={dropProps(node.path)}
          onClick={() => {
            toggle(node.path);
            onSelectFolder(node.path);
          }}
          onDialog={setDialog}
        />
        {open && (
          <ul role="group" className={styles.group}>
            {renderItems(node, depth + 1)}
          </ul>
        )}
      </li>
    );
  };

  const renderItems = (node: FolderNode, depth: number) => [
    ...node.folders.map((folder) => renderFolder(folder, depth)),
    ...node.notes.map((note) => (
        <li key={note.id} role="treeitem" aria-label={note.title}>
          <NavLink
            to={`/notes/${note.id}`}
            className={styles.note}
            style={{ paddingLeft: 12 + depth * 14 }}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_TYPE, note.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onClick={() => onSelectFolder(note.folder)}
          >
            <FileText size={14} strokeWidth={1.75} aria-hidden className={styles.icon} />
            <span className={styles.title}>{note.title}</span>
          </NavLink>
        </li>
      )),
  ];

  return (
    <section
      className={styles.tree}
      aria-label="노트 목록"
      data-dropping={dropTarget === ''}
      {...dropProps('')}
    >
      {isPending && <div className={styles.skeleton} aria-hidden />}
      {isError && (
        <button type="button" className={styles.message} onClick={() => void refetch()}>
          목록을 불러오지 못했습니다 · 다시 시도
        </button>
      )}
      {root && root.folders.length === 0 && root.notes.length === 0 && <p className={styles.message}>아직 노트가 없습니다</p>}
      {root && (
        <ul role="tree" aria-label="보관함" className={styles.root}>
          {renderItems(root, 0)}
        </ul>
      )}
      {dialog && <FolderDialog state={dialog} onClose={() => setDialog(null)} />}
      {dialog === null && moveNote.isError && <p role="alert" className={styles.message}>같은 이름의 노트가 있어 옮기지 못했습니다</p>}
    </section>
  );
}

interface FolderRowProps {
  node: FolderNode;
  depth: number;
  open: boolean;
  selected: boolean;
  dropping: boolean;
  dropProps: Record<string, unknown>;
  onClick(): void;
  onDialog(state: FolderDialogState): void;
}

function FolderRow({ node, depth, open, selected, dropping, dropProps, onClick, onDialog }: FolderRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const createNote = useCreateNote();

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const act = (run: () => void) => () => {
    setMenuOpen(false);
    run();
  };

  return (
    <div className={styles.folderRow} data-selected={selected} data-dropping={dropping} {...dropProps}>
      <button type="button" className={styles.folder} style={{ paddingLeft: 6 + depth * 14 }} onClick={onClick}>
        <ChevronRight size={14} strokeWidth={1.75} aria-hidden className={styles.chevron} data-open={open} />
        {open ? (
          <FolderOpen size={14} strokeWidth={1.75} aria-hidden className={styles.icon} />
        ) : (
          <Folder size={14} strokeWidth={1.75} aria-hidden className={styles.icon} />
        )}
        <span className={styles.title}>{node.name}</span>
      </button>
      <div ref={menuRef} className={styles.menuAnchor}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={`${node.name} 폴더 메뉴`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={14} strokeWidth={1.75} />
        </button>
        {menuOpen && (
          <div role="menu" className={`glass-elevated ${styles.menu}`}>
            <button type="button" role="menuitem" onClick={act(() => createNote.mutate(node.path))}>
              새 노트
            </button>
            <button type="button" role="menuitem" onClick={act(() => onDialog({ kind: 'create', parent: node.path }))}>
              새 폴더
            </button>
            <button type="button" role="menuitem" onClick={act(() => onDialog({ kind: 'rename', path: node.path }))}>
              이름 바꾸기
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.danger}
              onClick={act(() => onDialog({ kind: 'delete', path: node.path, noteCount: countNotes(node) }))}
            >
              삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
