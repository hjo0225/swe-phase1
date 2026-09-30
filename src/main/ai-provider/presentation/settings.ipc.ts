import { IpcChannels } from '../../../shared/ipc/channels';
import { EmptyRequest, TestProviderRequest, UpdateProviderRequest } from '../../../shared/ipc/schemas';
import { createIpcHandler } from '../../platform/ipc/handler';
import type { IpcHandlerMap } from '../../platform/ipc/register';
import type { ProviderSettingsService } from '../application/provider-settings-service';

export function settingsIpcHandlers(service: ProviderSettingsService): IpcHandlerMap {
  return {
    [IpcChannels.settingsGetProvider]: createIpcHandler(EmptyRequest, () => service.get()),
    [IpcChannels.settingsUpdateProvider]: createIpcHandler(UpdateProviderRequest, (r) => service.update(r)),
    [IpcChannels.settingsTestProvider]: createIpcHandler(TestProviderRequest, (r) => service.test(r)),
  };
}
