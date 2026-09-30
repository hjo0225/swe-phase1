/** IPC를 보낸 프레임이 앱 자신의 Renderer인지 확인한다 (docs/05-cross-cutting.md). */
export function createSenderValidator(options: { devServerUrl?: string }) {
  const devOrigin = options.devServerUrl ? new URL(options.devServerUrl).origin : undefined;
  return (frameUrl: string | undefined): boolean => {
    if (!frameUrl) return false;
    let url: URL;
    try {
      url = new URL(frameUrl);
    } catch {
      return false;
    }
    return devOrigin ? url.origin === devOrigin : url.protocol === 'file:';
  };
}
