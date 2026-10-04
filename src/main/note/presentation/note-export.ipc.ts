import { IpcChannels } from '../../../shared/ipc/channels';
import { ExportNotePdfRequest } from '../../../shared/ipc/schemas';
import { createIpcHandler } from '../../platform/ipc/handler';
import type { IpcHandlerMap } from '../../platform/ipc/register';
import type { ExportNotePdf } from '../application/export-note-pdf';

/** 노트 내보내기. Renderer는 노트 ID만 보낸다 — 저장 경로는 Main의 Dialog가 정한다. */
export function noteExportIpcHandlers(exportPdf: ExportNotePdf): IpcHandlerMap {
  return {
    [IpcChannels.noteExportPdf]: createIpcHandler(ExportNotePdfRequest, (r) => exportPdf.execute(r)),
  };
}
