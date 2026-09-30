/** Preload가 노출할 수 있는 채널 화이트리스트. */
export const IpcChannels = {
  appGetInfo: 'app:get-info',
  appReadyToClose: 'app:ready-to-close',
  vaultGetCurrent: 'vault:get-current',
  vaultChoose: 'vault:choose',
  vaultOpen: 'vault:open',
  vaultListRecent: 'vault:list-recent',
  noteTree: 'note:tree',
  noteCreate: 'note:create',
  noteGet: 'note:get',
  noteUpdate: 'note:update',
  noteRename: 'note:rename',
  noteMove: 'note:move',
  noteDelete: 'note:delete',
  noteSearch: 'note:search',
  noteLinkList: 'note-link:list',
  folderCreate: 'folder:create',
  folderRename: 'folder:rename',
  folderDelete: 'folder:delete',
  settingsGetProvider: 'settings:get-provider',
  settingsUpdateProvider: 'settings:update-provider',
  settingsTestProvider: 'settings:test-provider',
  aiCreateJob: 'ai:create-job',
  aiGetJob: 'ai:get-job',
  aiListJobs: 'ai:list-jobs',
  aiRetryJob: 'ai:retry-job',
  visualizationSavePng: 'visualization:save-png',
} as const;

/** Main → Renderer 푸시 이벤트. */
export const IpcEvents = {
  appWillClose: 'app:will-close',
  aiJobUpdated: 'ai:job-updated',
  vaultChanged: 'vault:changed',
} as const;
