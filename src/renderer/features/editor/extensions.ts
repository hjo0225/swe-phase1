import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import type { Extensions } from '@tiptap/react';
import { AiPending } from '../assist/editor/ai-pending';
import { CommitGlow } from '../assist/editor/commit-glow';
import { NoteLink } from '../notes/editor/note-link';
import { Infographic } from '../visualization/editor/infographic-node';

/**
 * 편집기 스키마 조립 지점 (docs/frontend/feature-map.md "편집기와 feature의 관계").
 * 각 feature의 확장(noteLink, aiPending, infographic)은 해당 feature 폴더에 두고 여기서 조립한다.
 */
export function createEditorExtensions(options: { placeholder?: string } = {}): Extensions {
  return [
    StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
    Placeholder.configure({ placeholder: options.placeholder ?? '생각을 적어 보세요' }),
    // AI 결과(Markdown)를 편집기 스키마로 파싱한다. HTML로 직접 넣지 않는다.
    Markdown,
    NoteLink,
    AiPending,
    CommitGlow,
    Infographic,
  ];
}
