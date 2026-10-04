/** 의존성 없이 PDF를 확인한다: 페이지 객체(`/Type /Page`, `/Pages`는 제외) 수와 첫 페이지 크기(pt). */
export function pdfPageCount(bytes: Buffer): number {
  return bytes.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
}

export function pdfMediaBox(bytes: Buffer): [number, number] | null {
  const match = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(bytes.toString('latin1'));
  return match ? [Number(match[1]), Number(match[2])] : null;
}
