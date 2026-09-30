import { DomainError } from '../../platform/errors';

/** 편집기가 만든 ProseMirror JSON. note 도메인은 `text`, `noteLink`, `hardBreak` 외의 노드를 해석하지 않는다. */
export type ProseMirrorDoc = { type: 'doc'; content?: unknown[] } & Record<string, unknown>;

const MAX_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PmNode {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
}

/** 본문 JSON과 그로부터 파생되는 검색용 텍스트·참조 노트 집합 (docs/backend/note/domain-model.md). */
export class NoteContent {
  private constructor(
    readonly doc: ProseMirrorDoc,
    readonly serialized: string,
    readonly plainText: string,
    readonly referencedNoteIds: ReadonlySet<string>,
  ) {}

  static from(json: unknown): NoteContent {
    if (!isDoc(json)) {
      throw new DomainError('NOTE_CONTENT_INVALID', 'Content root must be a ProseMirror doc');
    }
    const serialized = JSON.stringify(json);
    if (new TextEncoder().encode(serialized).byteLength > MAX_BYTES) {
      throw new DomainError('NOTE_CONTENT_TOO_LARGE', 'Content exceeds 2 MB', { maxBytes: MAX_BYTES });
    }
    const { plainText, referencedNoteIds } = derive(json);
    return new NoteContent(json, serialized, plainText, referencedNoteIds);
  }

  /** 저장된 파생값을 신뢰해 복원한다 (재계산하지 않음). */
  static restore(serialized: string, plainText: string): NoteContent {
    const doc = JSON.parse(serialized) as ProseMirrorDoc;
    return new NoteContent(doc, serialized, plainText, derive(doc).referencedNoteIds);
  }

  static empty(): NoteContent {
    return NoteContent.from({ type: 'doc', content: [{ type: 'paragraph' }] });
  }

  equals(other: NoteContent): boolean {
    return this.serialized === other.serialized;
  }
}

function isDoc(value: unknown): value is ProseMirrorDoc {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as PmNode).type === 'doc';
}

function derive(doc: ProseMirrorDoc): { plainText: string; referencedNoteIds: Set<string> } {
  const parts: string[] = [];
  const referencedNoteIds = new Set<string>();

  const visit = (node: PmNode, isRoot: boolean) => {
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text);
      return;
    }
    if (node.type === 'noteLink') {
      const { noteId, label } = node.attrs ?? {};
      if (typeof label === 'string') parts.push(label);
      if (typeof noteId === 'string' && UUID.test(noteId)) referencedNoteIds.add(noteId.toLowerCase());
      return;
    }
    if (node.type === 'hardBreak') {
      parts.push('\n');
      return;
    }
    if (!Array.isArray(node.content)) return; // infographic 등 불투명한 atom 노드
    for (const child of node.content) {
      if (typeof child === 'object' && child !== null) visit(child as PmNode, false);
    }
    if (!isRoot) parts.push('\n'); // 블록 경계
  };

  visit(doc, true);
  const plainText = parts.join('').replace(/\n{2,}/g, '\n').trim();
  return { plainText, referencedNoteIds };
}
