import Image, { type ImageOptions } from '@tiptap/extension-image';

/** Main이 보관함 이미지를 내주는 주소 (src/main의 vault-image-protocol과 같은 모양) */
export const VAULT_IMAGE_SCHEME = 'blink-vault';

/** 화면에 그릴 주소. 원격·data 주소는 그대로 두고, 나머지(보관함 안 경로)는 노트 기준으로 Main에 묻는다. */
export function displaySrc(src: string | null | undefined, noteId: string | undefined): string | null {
  if (!src) return null;
  if (!noteId || /^[a-z][a-z0-9+.-]*:/i.test(src)) return src;
  return `${VAULT_IMAGE_SCHEME}://image/${encodeURIComponent(noteId)}/${encodeURIComponent(src)}`;
}

/**
 * 노트 속 Markdown 이미지 `![alt](path)`. 문단 안에 놓이도록 인라인으로 둔다 — 블록이면 문단 속 이미지를 읽다 문서가 깨진다.
 * 문서·.md에는 원래 경로를 두고, 그릴 때만 blink-vault: 주소로 바꾼다.
 */
export const NoteImage = Image.extend<ImageOptions & { noteId?: string }>({
  addOptions() {
    return { ...this.parent!(), inline: true, allowBase64: false, noteId: undefined };
  },

  renderHTML({ HTMLAttributes }) {
    const { src, ...rest } = HTMLAttributes as { src?: string };
    return ['img', { ...this.options.HTMLAttributes, ...rest, src: displaySrc(src, this.options.noteId), loading: 'lazy' }];
  },
});
