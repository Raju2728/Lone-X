const { BrowserWindow, dialog, ipcMain } = require('electron')
const { execFile } = require('node:child_process')
const { DatabaseSync } = require('node:sqlite')
const { fileURLToPath } = require('node:url')
const path = require('node:path')

const commands = new Map([
  ['version', { label: 'PowerShell version', script: '$PSVersionTable.PSVersion.ToString()' }],
  ['memory', { label: 'Available memory', script: 'Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory | Format-List' }]
])

function registerTerminal(app, rendererPath, requireAccount) {
  const db = new DatabaseSync(path.join(app.getPath('userData'), 'terminal-audit.sqlite'))
  db.exec('CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, time INTEGER NOT NULL, command TEXT NOT NULL, outcome TEXT NOT NULL)')
  const audit = db.prepare('INSERT INTO audit(time, command, outcome) VALUES (?, ?, ?)')
  const finish = db.prepare('UPDATE audit SET outcome = ? WHERE id = ?')
  const history = db.prepare('SELECT time, command, outcome FROM audit ORDER BY id DESC LIMIT 30')
  const binary = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  let active

  function handle(name, action) {
    ipcMain.handle('terminal:' + name, (event, input) => {
      const url = new URL(event.senderFrame?.url || 'about:blank')
      if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
        throw new Error('Invalid terminal request origin.')
      }
      requireAccount(event.sender)
      return action(event.sender, input)
    })
  }

  function stop() {
    if (!active) return
    active.stopped = true
    active.child?.kill()
  }

  app.once('before-quit', stop)
  handle('stop', sender => { if (active?.sender === sender) stop() })
  handle('history', () => history.all())
  handle('run', async (sender, id) => {
    const command = commands.get(id)
    if (!command) throw new Error('This command is outside the approved command list.')
    if (active) throw new Error('A terminal command is already pending.')
    const run = { sender, stopped: false, child: null }
    const entry = audit.run(Date.now(), command.label, 'Pending').lastInsertRowid
    active = run
    try {
      const approval = await dialog.showMessageBox(BrowserWindow.fromWebContents(sender), {
        type: 'question', title: 'Approve local PowerShell command',
        message: command.label, detail: command.script,
        buttons: ['Cancel', 'Run once'], defaultId: 0, cancelId: 0, noLink: true
      })
      if (run.stopped || approval.response !== 1) {
        const outcome = run.stopped ? 'Stopped' : 'Declined'
        finish.run(outcome, entry)
        return { outcome, output: '' }
      }
      requireAccount(sender)
      const result = await new Promise(resolve => {
        run.child = execFile(binary, ['-NoProfile', '-NonInteractive', '-Command', command.script],
          { windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024 },
          (error, stdout, stderr) => resolve({
            outcome: run.stopped ? 'Stopped' : error ? 'Failed' : 'Completed',
            output: [stdout.trim(), stderr.trim() || (error ? 'PowerShell did not complete successfully.' : '')].filter(Boolean).join('\n')
          }))
      })
      finish.run(result.outcome, entry)
      return result
    } catch (error) {
      finish.run('Failed', entry)
      throw error
    } finally {
      active = undefined
    }
  })
}

module.exports = { registerTerminal }
