import type { Page } from 'playwright-core';

/** 제목 = 파일 이름. 입력을 마치면(Enter) 이름이 바뀌고 사이드바 트리에 보인다. */
export async function setTitle(page: Page, title: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Note title' });
  await input.fill(title);
  await input.press('Enter');
  await page.getByRole('region', { name: 'Note list' }).getByRole('link', { name: title, exact: true }).waitFor();
}

/**
 * 실제 편집기(Tiptap) 인스턴스로 텍스트를 선택한다 — 마우스 드래그보다 안정적이다.
 * 위치는 문서를 순회해 텍스트 노드 안에서 찾는다. `textContent.indexOf`는 블록 경계를 세지 않아
 * 여러 문단에서 엉뚱한 범위를 고른다.
 */
export async function selectText(page: Page, target: string): Promise<void> {
  const found = await page.evaluate((text) => {
    type PMNode = { isText: boolean; text?: string };
    const dom = document.querySelector('[aria-label="Note body"]') as HTMLElement & {
      editor: {
        state: { doc: { descendants(f: (node: PMNode, pos: number) => boolean | void): void } };
        commands: { focus(): void; setTextSelection(range: { from: number; to: number }): void };
      };
    };
    let from = -1;
    dom.editor.state.doc.descendants((node, pos) => {
      if (from >= 0) return false;
      const index = node.isText ? (node.text ?? '').indexOf(text) : -1;
      if (index >= 0) from = pos + index;
      return undefined;
    });
    if (from < 0) return false;
    dom.editor.commands.focus();
    dom.editor.commands.setTextSelection({ from, to: from + text.length });
    return true;
  }, target);
  if (!found) throw new Error(`Text not found in editor: ${target}`);
}
