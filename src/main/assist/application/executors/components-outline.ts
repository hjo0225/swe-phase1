/**
 * 시각화에 보내기 전 구성요소 목록 다듬기 (정리하기가 만든 "## Components"·"## Flows" 모양).
 * 중첩 목록에서 하위 항목이 있는 항목은 그룹(상자)으로 그려진다. 그런데 그 항목이 연결("A → B")에도 나오면
 * 상자이면서 카드여야 해서, 모델이 카드를 빼고 선을 다른 구성요소로 옮기거나 같은 이름의 카드를 하나 더 만든다.
 * 정리 규칙대로 그런 항목의 하위 항목을 그 항목 옆(같은 단계)으로 올린다. 다만 하위 항목이 모두 어느 연결에도 나오지 않는
 * 한 단계짜리 항목(기술·담긴 데이터, 예: UI 아래 React)이면 올리면 떠 있는 카드가 되므로 그 항목 이름 뒤 괄호에 적는다.
 * 예외는 층(layer)이다: 하위 항목(층을 이루는 기술)이 어느 연결에도 나오지 않고 다른 층과 이어진 항목은
 * 층 상자이고 그 연결은 층 사이 선이므로 그대로 둔다 (예: "User Interface → Application Core: Preload / IPC").
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

/** 연결 줄 "A → B: label"마다 그 줄에 나오는 이름들 (순서대로) */
function flowLines(lines: readonly string[]): string[][] {
  return lines.flatMap((line) => {
    if (!ARROW.test(line)) return [];
    const body = line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '');
    const colon = body.search(/:(?![^(]*\))/); // 라벨 앞의 첫 ':' (괄호 속은 건너뛴다)
    const names = (colon >= 0 ? body.slice(0, colon) : body).split(ARROW).map(nameOf).filter(Boolean);
    return names.length > 0 ? [names] : [];
  });
}

/**
 * 층: 연결에 나오고 하위 항목이 있지만 그 아래 어느 항목도 연결에 나오지 않는 항목(층 후보) 중, 다른 후보와 이어진 것.
 * 다른 후보와 이어지지 않은 후보(예: Main → Job queue인데 Job queue 아래 Worker)는 지금처럼 카드로 본다.
 */
function layerNames(lines: readonly string[], flows: readonly string[][], ends: ReadonlySet<string>): Set<string> {
  const items = lines.map((line) => {
    const m = ARROW.test(line) ? null : ITEM.exec(line);
    return m ? { indent: m[1]!.length, name: nameOf(m[2]!) } : null;
  });
  const candidates = new Set<string>();
  // 층은 목록의 맨 위 단계 항목이다 (층 안 기술이 자기 하위 항목을 가져도 층이 아니다)
  const topIndent = Math.min(...items.map((item) => item?.indent ?? Infinity));
  items.forEach((item, i) => {
    if (!item || item.indent !== topIndent || !ends.has(item.name)) return;
    const below: string[] = [];
    for (let j = i + 1; j < items.length && items[j] && items[j]!.indent > item.indent; j++) below.push(items[j]!.name);
    if (below.length > 0 && below.every((name) => !ends.has(name))) candidates.add(item.name);
  });
  const layers = new Set<string>();
  for (const names of flows) {
    names.forEach((name, i) => {
      if (candidates.has(name) && [names[i - 1], names[i + 1]].some((n) => n !== undefined && candidates.has(n))) layers.add(name);
    });
  }
  return layers;
}

export function unnestFlowComponents(text: string): string {
  const lines = text.split(/\r?\n/);
  const flows = flowLines(lines);
  const ends = new Set(flows.flat());
  if (ends.size === 0) return text;
  const layers = layerNames(lines, flows, ends);
  const indentOf = (line: string) => ITEM.exec(line)?.[1]!.length ?? -1;

  for (let i = 0; i < lines.length; i++) {
    const item = ITEM.exec(lines[i]!);
    if (!item || ARROW.test(lines[i]!) || !ends.has(nameOf(item[2]!)) || layers.has(nameOf(item[2]!))) continue;
    const parent = item[1]!.length;
    // 바로 아래로 이어지는 더 깊은 목록 항목들이 이 항목의 하위 항목이다
    let end = i + 1;
    while (end < lines.length && indentOf(lines[end]!) > parent) end++;
    if (end === i + 1) continue;
    const below = lines.slice(i + 1, end);
    const step = Math.min(...below.map(indentOf)) - parent;
    // 하위 항목이 모두 한 단계짜리이고 어느 연결에도 나오지 않으면(기술·담긴 데이터) 카드로 올리면 떠 있게 된다 →
    // 정리 규칙("기술은 이름 뒤 괄호")대로 이름 뒤 괄호에 적는다
    if (below.every((line) => indentOf(line) === parent + step && !ends.has(nameOf(ITEM.exec(line)![2]!)))) {
      lines.splice(i, below.length + 1, withParts(lines[i]!, below.map((line) => ITEM.exec(line)![2]!.trim())));
      continue;
    }
    for (let j = i + 1; j < end; j++) lines[j] = lines[j]!.slice(step);
  }
  return lines.join('\n');
}

/** "- UI" + [React, Tiptap] → "- UI (React, Tiptap)", 이미 괄호가 있으면 그 안에 더한다 */
function withParts(line: string, parts: readonly string[]): string {
  const trimmed = line.trimEnd();
  return trimmed.endsWith(')') ? `${trimmed.slice(0, -1)}, ${parts.join(', ')})` : `${trimmed} (${parts.join(', ')})`;
}

/** 정리된 목록의 층 이름들 (nameOf 모양). 둘 이상이면 층 구조로 정리된 글이다 */
export function outlineLayers(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const flows = flowLines(lines);
  return [...layerNames(lines, flows, new Set(flows.flat()))];
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
 * 중첩 목록의 그룹을 바깥부터 찾는다. unnestFlowComponents를 거친 글이면 연결에 나오면서 품은 것이 있는 항목은 층뿐이므로
 * 여기서 찾는 그룹은 담기만 하는 것(앱·네트워크·zone)이거나 층이다. 연결 줄은 보지 않는다.
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
