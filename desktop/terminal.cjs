const { ipcMain } = require('electron')
const { execFile } = require('node:child_process')
const { DatabaseSync } = require('node:sqlite')
const { fileURLToPath } = require('node:url')
const path = require('node:path')
const { checkUpdate, downloadUpdate, upToDate, versionLabel } = require('./update.cjs')
const { launchUninstaller } = require('./uninstall.cjs')

const version = { label: 'PowerShell version', script: '$PSVersionTable.PSVersion.ToString()' }
const memory = { label: 'Available memory', script: 'Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory | Format-List' }
const location = { label: 'Current location', script: 'Get-Location' }
const commands = new Map([
  ['version', version],
  [version.script.toLowerCase(), version],
  ['memory', memory],
  [memory.script.toLowerCase(), memory],
  ['get-date', { label: 'Current date and time', script: 'Get-Date' }],
  ['get-location', location],
  ['pwd', location],
  ['lonex -v', { label: 'Lone X version', action: 'version' }],
  ['lonex -avail', { label: 'Lone X update availability', action: 'avail' }],
  ['lonex -update', { label: 'Lone X update', action: 'update' }],
  ['lonex -uninstall', { label: 'Lone X uninstall', action: 'uninstall' }]
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
    active.controller?.abort()
  }

  app.once('before-quit', stop)
  handle('stop', sender => { if (active?.sender === sender) stop() })
  handle('history', () => history.all())
  handle('run', async (sender, id) => {
    const key = typeof id === 'string' && id.length <= 300
      ? id.trim().toLowerCase().replace(/^lonex\s+-\s*/, 'lonex -')
      : ''
    const command = commands.get(key)
    if (!command) throw new Error('This command is outside the approved command list.')
    if (active) throw new Error('A terminal command is already running.')
    const run = { sender, stopped: false, child: null, controller: null }
    const entry = audit.run(Date.now(), command.label, 'Running').lastInsertRowid
    active = run
    try {
      if (command.action === 'version') {
        finish.run('Completed', entry)
        return { outcome: 'Completed', output: versionLabel }
      }
      if (command.action === 'uninstall') {
        run.controller = new AbortController()
        const output = await launchUninstaller(app, undefined, run.controller.signal)
        finish.run('Uninstaller opened', entry)
        return { outcome: 'Uninstaller opened', output }
      }
      if (command.action === 'avail' || command.action === 'update') {
        run.controller = new AbortController()
        const signal = AbortSignal.any([run.controller.signal, AbortSignal.timeout(15 * 60 * 1000)])
        let output
        if (command.action === 'avail') {
          const update = await checkUpdate(signal)
          output = update ? 'Update available: ' + versionLabel + ', build ' + update.revision.slice(0, 8) : upToDate
        } else {
          output = await downloadUpdate(app.getPath('downloads'), signal)
        }
        finish.run('Completed', entry)
        return { outcome: 'Completed', output }
      }
      const result = await new Promise(resolve => {
        run.child = execFile(binary, ['-NoProfile', '-NonInteractive', '-Command', command.script],
          { windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024 },
          (error, stdout, stderr) => resolve({
            outcome: run.stopped ? 'Stopped' : error ? 'Failed' : 'Completed',
            output: [stdout.trim(), stderr.trim() || (error && !run.stopped ? 'PowerShell did not complete successfully.' : '')].filter(Boolean).join('\n')
          }))
      })
      finish.run(result.outcome, entry)
      return result
    } catch (error) {
      if (run.stopped) {
        finish.run('Stopped', entry)
        return { outcome: 'Stopped', output: '' }
      }
      finish.run('Failed', entry)
      throw error
    } finally {
      active = undefined
    }
  })
}

module.exports = { registerTerminal }
