const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('loneXAI', {
  history: () => ipcRenderer.invoke('ai:history'),
  models: () => ipcRenderer.invoke('ai:models'),
  send: input => ipcRenderer.invoke('ai:send', input),
  onDelta: callback => {
    const listener = (_event, delta) => callback(delta)
    ipcRenderer.on('ai:delta', listener)
    return () => ipcRenderer.removeListener('ai:delta', listener)
  }
})

contextBridge.exposeInMainWorld('loneXProjects', {
  open: () => ipcRenderer.invoke('projects:open'),
  preview: () => ipcRenderer.invoke('projects:preview')
})
