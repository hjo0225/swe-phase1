import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import styles from './FormattingToolbar.module.css';

const MOD = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl+';

interface Tool {
  key: string;
  label: string;
  icon: LucideIcon;
  keys?: string;
  /** 켜짐 상태를 알리는 도구만 (되돌리기·링크 열기는 제외) */
  pressed?: (e: Editor) => boolean;
  disabled?: (e: Editor) => boolean;
  run: (e: Editor) => void;
}

const TOOLS: Tool[] = [
  { key: 'heading', label: 'Heading', icon: Heading2, keys: '##', pressed: (e) => e.isActive('heading', { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { key: 'bold', label: 'Bold', icon: Bold, keys: `${MOD}B`, pressed: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { key: 'italic', label: 'Italic', icon: Italic, keys: `${MOD}I`, pressed: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { key: 'strike', label: 'Strikethrough', icon: Strikethrough, keys: `${MOD}Shift+S`, pressed: (e) => e.isActive('strike'), run: (e) => e.chain().focus().toggleStrike().run() },
  { key: 'code', label: 'Code', icon: Code, keys: `${MOD}E`, pressed: (e) => e.isActive('code'), run: (e) => e.chain().focus().toggleCode().run() },
  { key: 'bullet', label: 'Bulleted list', icon: List, keys: '-', pressed: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
  { key: 'ordered', label: 'Numbered list', icon: ListOrdered, keys: '1.', pressed: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { key: 'quote', label: 'Quote', icon: Quote, keys: '>', pressed: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
];

const HISTORY: Tool[] = [
  { key: 'undo', label: 'Undo', icon: Undo2, keys: `${MOD}Z`, disabled: (e) => !e.can().undo(), run: (e) => e.chain().focus().undo().run() },
  { key: 'redo', label: 'Redo', icon: Redo2, keys: `${MOD}Shift+Z`, disabled: (e) => !e.can().redo(), run: (e) => e.chain().focus().redo().run() },
];

/**
 * 서식 도구막대 — 21st.dev Rich Text Editor(uvain)의 구조를 Blink 디자인으로 옮겼다.
 * 도구막대 전체가 Tab 한 번이고 안에서는 방향키로 움직인다. 버튼은 켜짐 상태(aria-pressed)와 단축키 툴팁을 가진다.
 * 링크는 브라우저 prompt 대신 도구막대 아래 주소 칸에서 넣는다 (Enter 적용, Escape 취소).
 */
export function FormattingToolbar({ editor }: { editor: Editor }) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');

  // 선택·문서가 바뀔 때마다 버튼 상태만 다시 읽는다 (편집기 전체를 다시 그리지 않는다).
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      pressed: Object.fromEntries(TOOLS.map((t) => [t.key, t.pressed?.(e) ?? false])),
      disabled: Object.fromEntries(HISTORY.map((t) => [t.key, t.disabled?.(e) ?? false])),
      link: e.isActive('link'),
    }),
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...(toolbarRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons.forEach((b, i) => (b.tabIndex = i === next ? 0 : -1));
    buttons[next]?.focus();
    event.preventDefault();
  };

  const toggleLink = () => {
    if (state.link) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    setLinkUrl('https://');
    setLinkOpen(true);
  };

  const closeLink = () => {
    setLinkOpen(false);
    editor.commands.focus();
  };

  let first = true;
  const button = (tool: Tool, options: { pressed?: boolean; disabled?: boolean; onClick?: () => void; label?: string } = {}) => {
    const tabIndex = first ? 0 : -1;
    first = false;
    const label = options.label ?? tool.label;
    const Icon = tool.icon;
    return (
      <button
        key={tool.key}
        type="button"
        className={styles.button}
        tabIndex={tabIndex}
        aria-label={label}
        aria-pressed={options.pressed}
        disabled={options.disabled}
        data-tip={tool.keys ? `${label}  ${tool.keys}` : label}
        // 편집기의 선택을 잃지 않도록 포커스를 가져오지 않는다.
        onMouseDown={(e) => e.preventDefault()}
        onClick={options.onClick ?? (() => tool.run(editor))}
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden />
      </button>
    );
  };

  return (
    <div className={styles.wrap}>
      <div ref={toolbarRef} role="toolbar" aria-label="Formatting" className={styles.toolbar} onKeyDown={onKeyDown}>
        {TOOLS.slice(0, 5).map((t) => button(t, { pressed: state.pressed[t.key] }))}
        <span className={styles.divider} aria-hidden />
        {TOOLS.slice(5).map((t) => button(t, { pressed: state.pressed[t.key] }))}
        {button(
          { key: 'link', label: 'Link', icon: Link2, keys: `${MOD}K`, run: toggleLink },
          { label: state.link ? 'Remove link' : 'Link', onClick: toggleLink },
        )}
        <span className={styles.divider} aria-hidden />
        {HISTORY.map((t) => button(t, { disabled: state.disabled[t.key] }))}
      </div>
      {linkOpen && (
        <form
          className={styles.linkForm}
          onSubmit={(event) => {
            event.preventDefault();
            const url = linkUrl.trim();
            if (url && url !== 'https://') editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
            setLinkOpen(false);
          }}
        >
          <input
            autoFocus
            aria-label="Link URL"
            className={styles.linkInput}
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeLink();
              }
            }}
          />
          <button type="submit" className="button-secondary">
            Add link
          </button>
        </form>
      )}
    </div>
  );
}
