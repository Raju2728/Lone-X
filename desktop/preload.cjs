const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('loneXAI', {
  history: id => ipcRenderer.invoke('ai:history', id),
  models: () => ipcRenderer.invoke('ai:models'),
  overview: () => ipcRenderer.invoke('ai:overview'),
  overviewUpdate: () => ipcRenderer.invoke('ai:overview-update'),
  installModel: model => ipcRenderer.invoke('ai:install-model', model),
  conversations: () => ipcRenderer.invoke('ai:conversations'),
  deleteChat: id => ipcRenderer.invoke('ai:delete-chat', id),
  stop: () => ipcRenderer.invoke('ai:stop'),
  dictate: () => ipcRenderer.invoke('ai:dictate'),
  stopDictation: () => ipcRenderer.invoke('ai:stop-dictation'),
  send: input => ipcRenderer.invoke('ai:send', input),
  plan: task => ipcRenderer.invoke('ai:plan', task),
  onDelta: callback => {
    const listener = (_event, delta) => callback(delta)
    ipcRenderer.on('ai:delta', listener)
    return () => ipcRenderer.removeListener('ai:delta', listener)
  }
})

contextBridge.exposeInMainWorld('loneXProjects', {
  open: () => ipcRenderer.invoke('projects:open'),
  preview: () => ipcRenderer.invoke('projects:preview'),
  saveCopy: text => ipcRenderer.invoke('projects:save-copy', text),
  createStarter: () => ipcRenderer.invoke('projects:create-starter'),
  checkStarter: () => ipcRenderer.invoke('projects:check-starter'),
  repairStarter: () => ipcRenderer.invoke('projects:repair-starter'),
  reviewStarterFile: name => ipcRenderer.invoke('projects:review-starter-file', name),
  saveStarterRepair: name => ipcRenderer.invoke('projects:save-starter-repair', name),
  previewStarter: () => ipcRenderer.invoke('projects:preview-starter')
})

contextBridge.exposeInMainWorld('loneXAccount', {
  status: () => ipcRenderer.invoke('account:status'),
  create: input => ipcRenderer.invoke('account:create', input),
  login: input => ipcRenderer.invoke('account:login', input),
  requestReset: email => ipcRenderer.invoke('account:request-reset', email),
  reset: input => ipcRenderer.invoke('account:reset', input)
})

contextBridge.exposeInMainWorld('loneXTerminal', {
  run: id => ipcRenderer.invoke('terminal:run', id),
  stop: () => ipcRenderer.invoke('terminal:stop'),
  history: () => ipcRenderer.invoke('terminal:history')
})
