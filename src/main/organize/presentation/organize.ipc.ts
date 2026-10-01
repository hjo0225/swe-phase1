import { IpcChannels } from '../../../shared/ipc/channels';
import { ImportNoteRequest, OrganizeApplyRequest, OrganizeFolderRequest, PlaceNoteRequest } from '../../../shared/ipc/schemas';
import { createIpcHandler } from '../../platform/ipc/handler';
import type { IpcHandlerMap } from '../../platform/ipc/register';
import type { OrganizeService } from '../application/organize-service';

export function organizeIpcHandlers(organize: OrganizeService): IpcHandlerMap {
  return {
    [IpcChannels.organizePreview]: createIpcHandler(OrganizeFolderRequest, (r) => organize.preview(r.folder)),
    [IpcChannels.organizeApply]: createIpcHandler(OrganizeApplyRequest, (r) => organize.apply(r)),
    [IpcChannels.organizePlace]: createIpcHandler(PlaceNoteRequest, (r) => organize.place(r.id)),
    [IpcChannels.organizeImport]: createIpcHandler(ImportNoteRequest, (r) => organize.importFile(r)),
  };
}
