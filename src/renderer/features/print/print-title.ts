/** ATX `# 제목` 또는 Setext `제목\n===` 으로 시작하는가 (앞의 빈 줄은 건너뜀) */
const TOP_LEVEL_HEADING = /^(?:[ \t]{0,3}#[ \t]+\S|[^\n]*\S[^\n]*\n[ \t]{0,3}=+[ \t]*(?:\n|$))/;

/** 본문이 이미 맨 위 제목(# …)으로 시작하면 인쇄 화면은 노트 제목을 따로 찍지 않는다 — 제목이 두 번 나오지 않게. */
export function startsWithTopLevelHeading(markdown: string): boolean {
  return TOP_LEVEL_HEADING.test(markdown.replace(/^(?:[ \t]*\r?\n)+/, ''));
}
