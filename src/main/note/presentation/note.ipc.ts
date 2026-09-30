import { IpcChannels } from '../../../shared/ipc/channels';
import type { ProseMirrorDocDto } from '../../../shared/ipc/notes';
import {
  CreateNoteRequest,
  EmptyRequest,
  NoteIdRequest,
  NoteLinksRequest,
  SearchNotesRequest,
  UpdateNoteRequest,
} from '../../../shared/ipc/schemas';
import { createIpcHandler } from '../../platform/ipc/handler';
import type { IpcHandlerMap } from '../../platform/ipc/register';
import type { NoteService } from '../application/note-service';

// content의 root 형식은 도메인(NoteContent.from)이 검증하므로 여기서는 DTO 타입으로만 넘긴다.
const asDoc = (content: { type: string } | undefined) => content as ProseMirrorDocDto | undefined;

export function noteIpcHandlers(service: NoteService): IpcHandlerMap {
  return {
    [IpcChannels.noteCreate]: createIpcHandler(CreateNoteRequest, (r) =>
      service.create({ title: r.title, content: asDoc(r.content) }),
    ),
    [IpcChannels.noteList]: createIpcHandler(EmptyRequest, () => service.list()),
    [IpcChannels.noteGet]: createIpcHandler(NoteIdRequest, (r) => service.get(r.id)),
    [IpcChannels.noteUpdate]: createIpcHandler(UpdateNoteRequest, (r) =>
      service.update({ id: r.id, title: r.title, content: asDoc(r.content) }),
    ),
    [IpcChannels.noteDelete]: createIpcHandler(NoteIdRequest, (r) => service.delete(r.id)),
    [IpcChannels.noteSearch]: createIpcHandler(SearchNotesRequest, (r) => service.search(r)),
    [IpcChannels.noteLinkList]: createIpcHandler(NoteLinksRequest, (r) => service.listLinks(r.noteId)),
  };
}
