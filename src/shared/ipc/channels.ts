/** Preload가 노출할 수 있는 채널 화이트리스트. */
export const IpcChannels = {
  appGetInfo: 'app:get-info',
  appReadyToClose: 'app:ready-to-close',
  noteCreate: 'note:create',
  noteList: 'note:list',
  noteGet: 'note:get',
  noteUpdate: 'note:update',
  noteDelete: 'note:delete',
  noteSearch: 'note:search',
  noteLinkList: 'note-link:list',
  settingsGetProvider: 'settings:get-provider',
  settingsUpdateProvider: 'settings:update-provider',
  settingsTestProvider: 'settings:test-provider',
} as const;

/** Main → Renderer 푸시 이벤트. */
export const IpcEvents = {
  appWillClose: 'app:will-close',
} as const;
