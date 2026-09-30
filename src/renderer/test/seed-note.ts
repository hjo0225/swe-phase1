import { getBlink } from '../shared/api/blink';

/** 테스트용: 이름·Markdown 본문·폴더로 노트를 만든다 (보관함 방식에서 제목 = 파일 이름). */
export async function seedNote(title: string, content = '', folder?: string) {
  const blink = getBlink();
  if (folder) {
    let parent = '';
    for (const name of folder.split('/')) {
      await blink.folders.create({ parent: parent || undefined, name }).catch(() => undefined);
      parent = parent ? `${parent}/${name}` : name;
    }
  }
  const created = await blink.notes.create(folder ? { folder } : {});
  const renamed = title ? (await blink.notes.rename({ id: created.id, title })).note : null;
  if (content) await blink.notes.update({ id: created.id, content });
  return { id: created.id, title: renamed?.title ?? created.title, path: renamed?.path ?? created.path };
}
