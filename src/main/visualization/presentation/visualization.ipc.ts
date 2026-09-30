import { IpcChannels } from '../../../shared/ipc/channels';
import { SavePngRequest } from '../../../shared/ipc/schemas';
import { createIpcHandler } from '../../platform/ipc/handler';
import type { IpcHandlerMap } from '../../platform/ipc/register';
import type { ExportInfographicPng } from '../application/export-infographic-png';

export function visualizationIpcHandlers(exportPng: ExportInfographicPng): IpcHandlerMap {
  return {
    [IpcChannels.visualizationSavePng]: createIpcHandler(SavePngRequest, (r) => exportPng.execute(r)),
  };
}
