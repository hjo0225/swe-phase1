import { EXPORT_FONT_FAMILY, embeddedFontCss } from './embed-fonts';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVG → Canvas(배율) → PNG 바이트 (docs/frontend/data-flow.md 흐름 5).
 * 이미지로 불러온 SVG는 문서의 웹 폰트를 쓸 수 없으므로, 쓰인 글자의 Pretendard 조각을 SVG 안에 내장한다.
 * 내장에 실패하면 테마 글꼴 목록의 OS 한글 글꼴로 그려진다.
 */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Uint8Array> {
  const width = Number(svg.getAttribute('width'));
  const height = Number(svg.getAttribute('height'));
  const markup = new XMLSerializer().serializeToString(await prepareSvgForExport(svg));
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(url);
    await image.decode().catch(() => undefined); // 내장 폰트까지 해석된 뒤 그린다
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is not available');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    );
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the SVG image'));
    image.src = url;
  });
}

/** 원본은 그대로 두고, 쓰인 글자의 폰트 조각을 내장한 복사본을 만든다. */
export async function prepareSvgForExport(svg: SVGSVGElement): Promise<SVGSVGElement> {
  const css = await embeddedFontCss(svg.textContent ?? '');
  const copy = svg.cloneNode(true) as SVGSVGElement;
  if (!css) return copy;
  const style = document.createElementNS(SVG_NS, 'style');
  style.textContent = css;
  copy.insertBefore(style, copy.firstChild);
  copy.setAttribute('font-family', `'${EXPORT_FONT_FAMILY}', ${svg.getAttribute('font-family') ?? 'sans-serif'}`);
  return copy;
}
