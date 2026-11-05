const { BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { DatabaseSync } = require('node:sqlite')
const { access } = require('node:fs/promises')
const { fileURLToPath } = require('node:url')
const os = require('node:os')
const path = require('node:path')

const apps = [
  { id: 'notepad', name: 'Notepad', filename: 'notepad.exe' },
  { id: 'calculator', name: 'Calculator', filename: 'calc.exe' },
  { id: 'paint', name: 'Paint', filename: 'mspaint.exe' }
]

function registerAutomation(app, rendererPath, requireAccount) {
  const system = path.join(process.env.SystemRoot || 'C:/Windows', 'System32')
  const db = new DatabaseSync(path.join(app.getPath('userData'), 'automation.sqlite'))
  db.exec('CREATE TABLE IF NOT EXISTS launch_audit (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, application TEXT NOT NULL, outcome TEXT NOT NULL)')
  const record = db.prepare('INSERT INTO launch_audit(created_at, application, outcome) VALUES (?, ?, ?)')
  const history = db.prepare('SELECT created_at AS time, application, outcome FROM launch_audit ORDER BY id DESC LIMIT 30')
  let active

  function handle(channel, action) {
    ipcMain.handle('automation:' + channel, (event, input) => {
      const url = new URL(event.senderFrame?.url || 'about:blank')
      if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
        throw new Error('Invalid automation request origin.')
      }
      requireAccount(event.sender)
      return action(event.sender, input)
    })
  }

  handle('status', async () => ({
    memory: { total: os.totalmem(), free: os.freemem() },
    processors: os.cpus().length,
    apps: await Promise.all(apps.map(async item => ({
      id: item.id, name: item.name,
      available: await access(path.join(system, item.filename)).then(() => true, () => false)
    }))),
    history: history.all()
  }))

  handle('cancel', sender => {
    if (active?.sender === sender) active.cancelled = true
  })

  handle('launch', async (sender, id) => {
    const item = apps.find(app => app.id === id)
    if (!item) throw new Error('Choose a supported Windows application.')
    if (active) throw new Error('Finish the current application launch first.')
    const request = { sender, cancelled: false }
    active = request
    try {
      const filename = path.join(system, item.filename)
      await access(filename).catch(() => { throw new Error(item.name + ' is unavailable in the standard Windows location.') })
      const choice = await dialog.showMessageBox(BrowserWindow.fromWebContents(sender), {
        type: 'question', buttons: ['Cancel', 'Open application'], defaultId: 0, cancelId: 0,
        message: 'Open ' + item.name + '?', detail: filename + '\n\nWindows will open the application for you to use.'
      })
      if (request.cancelled || choice.response !== 1 || sender.isDestroyed()) {
        record.run(Date.now(), item.name, 'Cancelled')
        return { outcome: 'Cancelled' }
      }
      requireAccount(sender)
      const error = await shell.openPath(filename)
      const outcome = error ? 'Launch failed' : 'Launch requested'
      record.run(Date.now(), item.name, outcome)
      if (error) throw new Error('Windows could not open ' + item.name + '.')
      return { outcome }
    } finally {
      active = undefined
    }
  })
}

module.exports = { registerAutomation }
