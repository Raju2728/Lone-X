const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('loneXStorage', {
  scan: () => ipcRenderer.invoke('storage:scan'),
  stop: () => ipcRenderer.invoke('storage:stop'),
  trash: id => ipcRenderer.invoke('storage:trash', id)
})

contextBridge.exposeInMainWorld('loneXBrowser', {
  navigate: action => ipcRenderer.invoke('browser:navigate', action),
  open: url => ipcRenderer.invoke('browser:open', url),
  status: () => ipcRenderer.invoke('browser:status'),
  stop: () => ipcRenderer.invoke('browser:stop'),
  close: () => ipcRenderer.invoke('browser:close')
})

contextBridge.exposeInMainWorld('loneXAutomation', {
  status: () => ipcRenderer.invoke('automation:status'),
  launch: id => ipcRenderer.invoke('automation:launch', id),
  cancel: () => ipcRenderer.invoke('automation:cancel')
})

contextBridge.exposeInMainWorld('loneXSoftware', {
  inventory: () => ipcRenderer.invoke('software:inventory'),
  plan: id => ipcRenderer.invoke('software:plan', id),
  install: id => ipcRenderer.invoke('software:install', id)
})

contextBridge.exposeInMainWorld('loneXLegal', {
  status: () => ipcRenderer.invoke('legal:status'),
  accept: input => ipcRenderer.invoke('legal:accept', input)
})

contextBridge.exposeInMainWorld('loneXResources', {
  list: () => ipcRenderer.invoke('resources:list'),
  download: input => ipcRenderer.invoke('resources:download', input),
  stop: () => ipcRenderer.invoke('resources:stop')
})

contextBridge.exposeInMainWorld('loneXAI', {
  chooseAgentFolder: target => ipcRenderer.invoke('ai:agent-folder', target),
  disconnectAgent: () => ipcRenderer.invoke('ai:agent-disconnect'),
  reviewAgent: input => ipcRenderer.invoke('ai:agent-review', input),
  onAgentReview: callback => {
    const listener = (_event, review) => callback(review)
    ipcRenderer.on('ai:agent-review', listener)
    return () => ipcRenderer.removeListener('ai:agent-review', listener)
  },
  history: id => ipcRenderer.invoke('ai:history', id),
  models: () => ipcRenderer.invoke('ai:models'),
  modelInventory: () => ipcRenderer.invoke('ai:model-inventory'),
  stopModel: () => ipcRenderer.invoke('ai:stop-model'),
  onModelProgress: callback => {
    const listener = (_event, progress) => callback(progress)
    ipcRenderer.on('ai:model-progress', listener)
    return () => ipcRenderer.removeListener('ai:model-progress', listener)
  },
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
  inspectNpm: () => ipcRenderer.invoke('projects:inspect-npm'),
  proposeFix: () => ipcRenderer.invoke('projects:propose-fix'),
  runNpm: action => ipcRenderer.invoke('projects:run-npm', action),
  stopNpm: () => ipcRenderer.invoke('projects:stop-npm'),
  onNpmOutput: callback => {
    const listener = (_event, chunk) => callback(chunk)
    ipcRenderer.on('projects:npm-output', listener)
    return () => ipcRenderer.removeListener('projects:npm-output', listener)
  },
  open: () => ipcRenderer.invoke('projects:open'),
  preview: () => ipcRenderer.invoke('projects:preview'),
  saveCopy: text => ipcRenderer.invoke('projects:save-copy', text),
  applySourceEdit: text => ipcRenderer.invoke('projects:apply-source-edit', text),
  createStarter: () => ipcRenderer.invoke('projects:create-starter'),
  checkStarter: () => ipcRenderer.invoke('projects:check-starter'),
  repairStarter: () => ipcRenderer.invoke('projects:repair-starter'),
  reviewStarterFile: name => ipcRenderer.invoke('projects:review-starter-file', name),
  saveStarterRepair: name => ipcRenderer.invoke('projects:save-starter-repair', name),
  applyStarterRepair: name => ipcRenderer.invoke('projects:apply-starter-repair', name),
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
