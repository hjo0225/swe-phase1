const PREVIEW_LENGTH = 120;
const SNIPPET_BEFORE = 30;
const SNIPPET_AFTER = 90;

/** BR-NOTE-07: 가장 앞선 매칭 위치의 앞 30자 ~ 뒤 90자. 본문 매칭이 없으면 미리보기. */
export function snippetOf(plainText: string, keywords: readonly string[]): string {
  const text = plainText.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const positions = keywords.map((k) => lower.indexOf(k.toLowerCase())).filter((i) => i >= 0);
  if (positions.length === 0) return previewOf(plainText);

  const at = Math.min(...positions);
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(text.length, at + SNIPPET_AFTER);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/** BR-NOTE-05: 공백을 정규화한 plainText 앞 120자. */
export function previewOf(plainText: string): string {
  return plainText.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH);
}
