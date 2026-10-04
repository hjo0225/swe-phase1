import {
  siAnthropic,
  siClaude,
  siDjango,
  siDocker,
  siDrizzle,
  siElectron,
  siJavascript,
  siKubernetes,
  siMarkdown,
  siMoonshotai,
  siNginx,
  siNodedotjs,
  siPnpm,
  siPostgresql,
  siPython,
  siReact,
  siRedis,
  siSqlite,
  siTypescript,
  siVite,
  siVitest,
  siVuedotjs,
  type SimpleIcon,
} from 'simple-icons';

/** 아키텍처 카드에 그리는 기술 로고 (simple-icons, CC0). viewBox 0 0 24 24의 path 하나 */
export interface TechLogo {
  name: string;
  path: string;
  /** 흰 카드에서 보이는 색 */
  color: string;
}

/**
 * 카드 이름의 단어로 기술을 알아본다. 위에서부터 먼저 맞는 것 — 한 이름에 둘이 있으면 더 구체적인 쪽을 위에 둔다
 * (예: "better-sqlite3 / Drizzle ORM" → Drizzle). simple-icons에 없는 것(OpenAI, Tiptap 등)은 기본 아이콘을 쓴다.
 */
const RULES: [RegExp, SimpleIcon][] = [
  [/\btypescript\b/i, siTypescript],
  [/\bjavascript\b/i, siJavascript],
  [/\breact\b/i, siReact],
  [/\bvue(\.js)?\b/i, siVuedotjs],
  [/\belectron\b/i, siElectron],
  [/\bnode(\.js)?\b/i, siNodedotjs],
  [/\bdrizzle\b/i, siDrizzle],
  [/\bsqlite\d*\b|better-sqlite/i, siSqlite],
  [/\bpostgres(ql)?\b/i, siPostgresql],
  [/\bredis\b/i, siRedis],
  [/\bmarkdown\b/i, siMarkdown],
  [/\bdjango\b/i, siDjango],
  [/\bpython\b/i, siPython],
  [/\bdocker\b/i, siDocker],
  [/\bkubernetes\b|\bk8s\b/i, siKubernetes],
  [/\bnginx\b/i, siNginx],
  [/\bvitest\b/i, siVitest],
  [/\bvite\b/i, siVite],
  [/\bpnpm\b/i, siPnpm],
  [/\bkimi\b|\bmoonshot\b/i, siMoonshotai],
  [/\bclaude\b/i, siClaude],
  [/\banthropic\b/i, siAnthropic],
];

/** 흰 카드 위에서 사라질 만큼 밝은 브랜드 색(예: Drizzle 연두)은 어둡게 */
function readable(hex: string): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luminance = (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
  if (luminance <= 0.6) return `#${hex.toUpperCase()}`;
  const dark = (v: number) => Math.round(v * 0.55).toString(16).padStart(2, '0');
  return `#${dark(r!)}${dark(g!)}${dark(b!)}`.toUpperCase();
}

export function techLogoFor(title: string): TechLogo | null {
  const icon = RULES.find(([pattern]) => pattern.test(title))?.[1];
  return icon ? { name: icon.title, path: icon.path, color: readable(icon.hex) } : null;
}
