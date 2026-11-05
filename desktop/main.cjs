const { app, BrowserWindow, session } = require('electron')
const path = require('node:path')
const { registerAI } = require('./ai.cjs')
const { registerProjects } = require('./projects.cjs')
const { registerAccount } = require('./account.cjs')
const { registerTerminal } = require('./terminal.cjs')
const { registerResources } = require('./resources.cjs')
const { registerSoftware } = require('./software.cjs')
const { registerAutomation } = require('./automation.cjs')
const { registerBrowser } = require('./browser.cjs')
const { registerStorage } = require('./storage.cjs')
const { registerLegal } = require('./legal.cjs')
const rendererPath = path.join(__dirname, '../dist/index.html')
if (process.platform === 'win32') app.setAppUserModelId('LoneX.Desktop')

function createWindow() {
  const window = new BrowserWindow({
    title: 'Lone X',
    show: false,
    width: 1320,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../public/logo.ico'),
    webPreferences: { devTools: false, sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.cjs') }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.once('ready-to-show', () => { window.maximize(); window.show() })
  window.loadFile(rendererPath, { hash: 'workspace' })
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  const requireConsent = registerLegal(app, rendererPath)
  const requireAccount = registerAccount(app, rendererPath, requireConsent)
  const proposeFix = registerAI(app, rendererPath, requireAccount)
  registerProjects(rendererPath, requireAccount, proposeFix)
  registerTerminal(app, rendererPath, requireAccount)
  registerResources(app, rendererPath, requireAccount)
  registerSoftware(app, rendererPath, requireAccount)
  registerAutomation(app, rendererPath, requireAccount)
  registerBrowser(rendererPath, requireAccount)
  registerStorage(app, rendererPath, requireAccount)
  createWindow()
})
app.on('window-all-closed', () => app.quit())
