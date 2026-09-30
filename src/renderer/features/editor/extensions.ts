import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import type { Extensions } from '@tiptap/react';

/**
 * 편집기 스키마 조립 지점 (docs/frontend/feature-map.md "편집기와 feature의 관계").
 * 각 feature의 확장(noteLink, aiPending, infographic)은 해당 feature 폴더에 두고 여기서 조립한다.
 */
export function createEditorExtensions(): Extensions {
  return [
    StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
    Placeholder.configure({ placeholder: '생각을 적어 보세요' }),
  ];
}
