/**
 * SVG → Canvas(배율) → PNG 바이트 (docs/frontend/data-flow.md 흐름 5).
 * SVG를 이미지로 불러오면 문서의 웹 폰트를 쓸 수 없으므로, 테마의 글꼴 목록에 OS 기본 한글 글꼴을 함께 둔다.
 */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Uint8Array> {
  const width = Number(svg.getAttribute('width'));
  const height = Number(svg.getAttribute('height'));
  const markup = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(url);
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
