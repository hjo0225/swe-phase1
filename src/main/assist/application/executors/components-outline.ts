/**
 * 시각화에 보내기 전 구성요소 목록 다듬기 (정리하기가 만든 "## Components"·"## Flows" 모양).
 * 중첩 목록에서 하위 항목이 있는 항목은 그룹(상자)으로 그려진다. 그런데 그 항목이 연결("A → B")에도 나오면
 * 상자이면서 카드여야 해서, 모델이 카드를 빼고 선을 다른 구성요소로 옮기거나 같은 이름의 카드를 하나 더 만든다.
 * 정리 규칙대로 그런 항목의 하위 항목을 그 항목 옆(같은 단계)으로 올린다 — 줄을 지우거나 바꾸지 않는다.
 */

const ITEM = /^(\s*)[-*+]\s+(.*)$/;
const ARROW = /→|↔/;

/** 이름 비교: 대소문자·괄호 속 기술·여러 칸 공백은 보지 않는다 */
export const nameOf = (text: string) =>
  text
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** 연결 줄 "A → B: label"의 양 끝 이름 */
function flowEnds(lines: readonly string[]): Set<string> {
  const ends = new Set<string>();
  for (const line of lines) {
    if (!ARROW.test(line)) continue;
    const body = line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '');
    const colon = body.search(/:(?![^(]*\))/); // 라벨 앞의 첫 ':' (괄호 속은 건너뛴다)
    for (const part of (colon >= 0 ? body.slice(0, colon) : body).split(ARROW)) {
      const name = nameOf(part);
      if (name) ends.add(name);
    }
  }
  return ends;
}

export function unnestFlowComponents(text: string): string {
  const lines = text.split(/\r?\n/);
  const ends = flowEnds(lines);
  if (ends.size === 0) return text;
  const indentOf = (line: string) => ITEM.exec(line)?.[1]!.length ?? -1;

  for (let i = 0; i < lines.length; i++) {
    const item = ITEM.exec(lines[i]!);
    if (!item || ARROW.test(lines[i]!) || !ends.has(nameOf(item[2]!))) continue;
    const parent = item[1]!.length;
    // 바로 아래로 이어지는 더 깊은 목록 항목들이 이 항목의 하위 항목이다
    let end = i + 1;
    while (end < lines.length && indentOf(lines[end]!) > parent) end++;
    if (end === i + 1) continue;
    const step = Math.min(...lines.slice(i + 1, end).map(indentOf)) - parent;
    for (let j = i + 1; j < end; j++) lines[j] = lines[j]!.slice(step);
  }
  return lines.join('\n');
}

/** 목록에서 다른 항목을 품은 항목(= 그룹) */
export interface OutlineContainer {
  title: string;
  /** 바로 바깥 그룹 */
  parent?: string;
  /** 바로 안에 든 항목 중 다른 것을 품지 않은 것 (= 카드) */
  parts: string[];
}

/**
 * 중첩 목록의 그룹을 바깥부터 찾는다. unnestFlowComponents를 거친 글이면 연결에 나오는 항목은 품은 것이 없으므로
 * 여기서 찾는 그룹은 모두 담기만 하는 것(앱·네트워크·zone)이다. 연결 줄은 보지 않는다.
 */
export function outlineContainers(text: string): OutlineContainer[] {
  const items = text
    .split(/\r?\n/)
    .filter((line) => !ARROW.test(line))
    .map((line) => ITEM.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ indent: m[1]!.length, title: m[2]!.trim() }));
  const containers: OutlineContainer[] = [];
  const stack: { indent: number; title: string }[] = [];
  items.forEach((item, i) => {
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= item.indent) stack.pop();
    const holds = (items[i + 1]?.indent ?? -1) > item.indent;
    const parent = stack[stack.length - 1]?.title;
    if (holds) containers.push({ title: item.title, ...(parent ? { parent } : {}), parts: [] });
    else if (parent) containers.find((c) => c.title === parent)!.parts.push(item.title);
    stack.push(item);
  });
  return containers;
}
