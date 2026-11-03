const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('loneXAI', {
  history: id => ipcRenderer.invoke('ai:history', id),
  models: () => ipcRenderer.invoke('ai:models'),
  conversations: () => ipcRenderer.invoke('ai:conversations'),
  stop: () => ipcRenderer.invoke('ai:stop'),
  send: input => ipcRenderer.invoke('ai:send', input),
  onDelta: callback => {
    const listener = (_event, delta) => callback(delta)
    ipcRenderer.on('ai:delta', listener)
    return () => ipcRenderer.removeListener('ai:delta', listener)
  }
})

contextBridge.exposeInMainWorld('loneXProjects', {
  open: () => ipcRenderer.invoke('projects:open'),
  preview: () => ipcRenderer.invoke('projects:preview'),
  saveCopy: () => ipcRenderer.invoke('projects:save-copy')
})

contextBridge.exposeInMainWorld('loneXAccount', {
  status: () => ipcRenderer.invoke('account:status'),
  create: input => ipcRenderer.invoke('account:create', input),
  login: input => ipcRenderer.invoke('account:login', input),
  requestReset: email => ipcRenderer.invoke('account:request-reset', email),
  reset: input => ipcRenderer.invoke('account:reset', input)
})
