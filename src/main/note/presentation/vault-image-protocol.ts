import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import { parseVaultImageUrl, VAULT_IMAGE_SCHEME } from './vault-image-url';

/** app ready 전에 불러야 한다 — 표준 스킴이어야 <img src>로 쓸 수 있다. */
export function registerVaultImageScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: VAULT_IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

/** 노트 속 이미지 요청을 보관함 안의 파일로만 답한다. 찾지 못하거나 허용하지 않으면 404. */
export function handleVaultImages(resolve: (noteId: string, src: string) => { path: string; type: string } | null): void {
  protocol.handle(VAULT_IMAGE_SCHEME, async (request) => {
    const parsed = parseVaultImageUrl(request.url);
    let found: { path: string; type: string } | null = null;
    try {
      found = parsed ? resolve(parsed.noteId, parsed.src) : null;
    } catch {
      found = null; // 열린 보관함이 없을 때 등
    }
    if (!found) return new Response(null, { status: 404 });
    const file = await net.fetch(pathToFileURL(found.path).toString());
    return new Response(file.body, { headers: { 'content-type': found.type, 'cache-control': 'no-cache' } });
  });
}
