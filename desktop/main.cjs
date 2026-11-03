const { app, BrowserWindow, session } = require('electron')
const path = require('node:path')

function createWindow() {
  const window = new BrowserWindow({
    title: 'Lone X',
    width: 1320,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../public/logo.png'),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'workspace' })
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  createWindow()
})
app.on('window-all-closed', () => app.quit())
