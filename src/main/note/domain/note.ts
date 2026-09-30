import type { NoteContent } from './note-content';
import type { NoteTitle } from './note-title';

const PREVIEW_LENGTH = 120;

export interface NoteProps {
  id: string;
  title: NoteTitle;
  content: NoteContent;
  linkedNoteIds: ReadonlySet<string>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 노트 애그리거트. 링크 집합은 본문의 참조에서 파생되며,
 * 존재하는 노트만 남기는 확정(resolveLinks)은 존재 여부를 아는 애플리케이션이 호출한다.
 */
export class Note {
  private constructor(private props: NoteProps) {}

  static create(input: { id: string; title: NoteTitle; content: NoteContent; now: Date }): Note {
    return new Note({
      id: input.id,
      title: input.title,
      content: input.content,
      linkedNoteIds: new Set(),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static restore(props: NoteProps): Note {
    return new Note({ ...props });
  }

  get id() {
    return this.props.id;
  }
  get title() {
    return this.props.title;
  }
  get content() {
    return this.props.content;
  }
  get linkedNoteIds() {
    return this.props.linkedNoteIds;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  /** 저장 전에 존재 여부를 확인해야 하는 참조 후보. */
  get referencedNoteIds() {
    return this.props.content.referencedNoteIds;
  }

  /** @returns 실제로 바뀌었는지 (BR-NOTE-04) */
  rename(title: NoteTitle, now: Date): boolean {
    if (this.props.title.equals(title)) return false;
    this.props = { ...this.props, title, updatedAt: now };
    return true;
  }

  /** @returns 실제로 바뀌었는지 (BR-NOTE-04) */
  replaceContent(content: NoteContent, now: Date): boolean {
    if (this.props.content.equals(content)) return false;
    this.props = { ...this.props, content, updatedAt: now };
    return true;
  }

  /** BR-NOTE-03: 참조 후보 중 존재하는 노트만, 자기 자신은 제외. */
  resolveLinks(existingIds: ReadonlySet<string>): void {
    const linked = new Set<string>();
    for (const id of this.referencedNoteIds) {
      if (id !== this.props.id && existingIds.has(id)) linked.add(id);
    }
    this.props = { ...this.props, linkedNoteIds: linked };
  }

  preview(): string {
    return previewOf(this.props.content.plainText);
  }
}

/** BR-NOTE-05: 공백을 정규화한 plainText 앞 120자. */
export function previewOf(plainText: string): string {
  return plainText.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH);
}
