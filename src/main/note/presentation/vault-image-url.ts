/** 노트 속 이미지 주소: `blink-vault://image/<noteId>/<원래 경로>` (둘 다 encodeURIComponent). Renderer의 note-image.ts가 만든다. */
export const VAULT_IMAGE_SCHEME = 'blink-vault';

export function parseVaultImageUrl(raw: string): { noteId: string; src: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${VAULT_IMAGE_SCHEME}:` || url.hostname !== 'image') return null;
  const [noteId, src, ...rest] = url.pathname.split('/').filter(Boolean);
  if (!noteId || !src || rest.length > 0) return null;
  try {
    return { noteId: decodeURIComponent(noteId), src: decodeURIComponent(src) };
  } catch {
    return null;
  }
}
