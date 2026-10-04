/**
 * 기술 스택 글 찾기 (Task 7 층 구조). 층 규칙은 기술 이름에 버전을 붙여 쌓은 글(예: "react 19.3", "electron 44.4 on node.js 24")에만
 * 지시문에 덧붙인다. 모든 글에 붙이면 버전 없이 구성요소와 흐름을 말하는 비슷한 글까지 모델이 층으로 바꿨다(실제 API에서 재현).
 */

/** 이름 + 버전 ("react 19.3", "node.js 24", "sdk 7", "v2") */
const VERSIONED = /\b([a-z][a-z0-9+#-]*(?:\.js)?)\s+v?(\d+(?:\.\d+)*)(?![\w.])/gi;

/** 버전이 아니라 번호·개수를 붙이는 말 */
const NOT_TECH = new Set([
  'port',
  'ports',
  'zone',
  'zones',
  'subnet',
  'step',
  'steps',
  'page',
  'part',
  'phase',
  'region',
  'az',
  'room',
  'floor',
  'day',
  'days',
  'week',
  'weeks',
  'month',
  'months',
  'year',
  'years',
  'minute',
  'minutes',
  'hour',
  'hours',
  'second',
  'seconds',
  'times',
  'run',
  'version',
  'server',
  'servers',
  'instance',
  'instances',
  'node',
  'nodes',
  'user',
  'users',
  'web',
  'was',
  'db',
  'top',
  'under',
  'over',
  'about',
  'and',
  'or',
  'to',
  'in',
  'of',
]);

/** 버전을 붙인 기술 이름이 셋 이상이면 기술 스택 글이다 */
export function isTechStackText(text: string): boolean {
  const names = new Set<string>();
  for (const match of text.matchAll(VERSIONED)) {
    const name = match[1]!.toLowerCase();
    if (!NOT_TECH.has(name)) names.add(name);
  }
  return names.size >= 3;
}
