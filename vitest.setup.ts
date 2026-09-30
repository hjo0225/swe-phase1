import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom은 레이아웃을 계산하지 않아 ProseMirror가 스크롤·좌표 계산에 쓰는 API가 없다.
if (typeof document !== 'undefined') {
  const emptyRect = (): DOMRect =>
    ({ x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) }) as DOMRect;
  const emptyRectList = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;

  Range.prototype.getBoundingClientRect = emptyRect;
  Range.prototype.getClientRects = emptyRectList;
  for (const proto of [Text.prototype, Element.prototype] as unknown as { getClientRects?: () => DOMRectList }[]) {
    proto.getClientRects ??= emptyRectList;
  }
  document.elementFromPoint ??= () => null;
}
