const { BrowserWindow, dialog, ipcMain } = require('electron')
const { execFile } = require('node:child_process')
const { DatabaseSync } = require('node:sqlite')
const { fileURLToPath } = require('node:url')
const path = require('node:path')

const catalog = [
  { id: 'node', name: 'Node.js LTS', packageId: 'OpenJS.NodeJS.LTS', parts: ['nodejs', 'node.exe'], purpose: 'Runs npm projects and their tests' },
  { id: 'git', name: 'Git', packageId: 'Git.Git', parts: ['Git', 'cmd', 'git.exe'], purpose: 'Version control for development projects' }
]
const installArgs = item => ['install', '--id', item.packageId, '--exact', '--source', 'winget', '--interactive', '--disable-interactivity', '--no-upgrade']
function processIsRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code !== 'ESRCH' }
}

function registerSoftware(app, rendererPath, requireAccount) {
  const winget = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Microsoft/WindowsApps/winget.exe')
  const binaryFor = item => path.join(process.env.ProgramFiles || 'C:/Program Files', ...item.parts)
  let active
  const db = new DatabaseSync(path.join(app.getPath('userData'), 'software.sqlite'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS installation (
      id INTEGER PRIMARY KEY, tool TEXT NOT NULL, started_at INTEGER NOT NULL,
      finished_at INTEGER, outcome TEXT NOT NULL, owner_pid INTEGER
    );
  `)
  if (!db.prepare('PRAGMA table_info(installation)').all().some(column => column.name === 'owner_pid')) {
    db.exec('ALTER TABLE installation ADD COLUMN owner_pid INTEGER')
  }
  const incomplete = db.prepare("SELECT id, owner_pid AS ownerPid FROM installation WHERE outcome = 'Running'")
  const markUnverified = db.prepare("UPDATE installation SET outcome = 'Verification required' WHERE id = ? AND outcome = 'Running'")
  for (const attempt of incomplete.all()) {
    if (!processIsRunning(attempt.ownerPid)) markUnverified.run(attempt.id)
  }
  const latestAttempt = db.prepare('SELECT id, started_at AS startedAt, finished_at AS finishedAt, outcome FROM installation WHERE tool = ? ORDER BY id DESC LIMIT 1')
  const recordAttempt = db.prepare("INSERT INTO installation(tool, started_at, outcome, owner_pid) VALUES (?, ?, 'Running', ?)")
  const finishAttempt = db.prepare('UPDATE installation SET outcome = ?, finished_at = ? WHERE id = ?')

  function execute(binary, args, options = {}) {
    return new Promise(resolve => {
      execFile(binary, args, { windowsHide: true, timeout: 10000, maxBuffer: 64000, ...options },
        (error, stdout, stderr) => resolve({ code: error ? error.code : 0, output: [stdout?.trim(), stderr?.trim()].filter(Boolean).join('\n') }))
    })
  }

  async function inventory() {
    const manager = await execute(winget, ['--version'])
    const tools = await Promise.all(catalog.map(async item => {
      const result = await execute(binaryFor(item), ['--version'])
      let lastAttempt = latestAttempt.get(item.id) ?? null
      if (lastAttempt?.outcome === 'Verification required' && result.code === 0) {
        finishAttempt.run('Detected after restart', Date.now(), lastAttempt.id)
        lastAttempt = latestAttempt.get(item.id)
      }
      return { id: item.id, name: item.name, packageId: item.packageId, purpose: item.purpose,
        installed: result.code === 0, version: result.code === 0 ? result.output.slice(0, 100) : null, lastAttempt }
    }))
    return { wingetAvailable: manager.code === 0, tools }
  }

  function handle(name, action) {
    ipcMain.handle('software:' + name, (event, input) => {
      const url = new URL(event.senderFrame?.url || 'about:blank')
      if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
        throw new Error('Invalid software request origin.')
      }
      requireAccount(event.sender)
      return action(event.sender, input)
    })
  }

  handle('inventory', inventory)
  handle('plan', async (_sender, id) => {
    const item = catalog.find(tool => tool.id === id)
    if (!item) throw new Error('Choose a supported software package.')
    const state = await inventory()
    if (!state.wingetAvailable) throw new Error('WinGet is unavailable. Install or repair Windows App Installer first.')
    if (state.tools.find(tool => tool.id === id)?.installed) throw new Error('This tool is already installed.')
    return { id: item.id, name: item.name, packageId: item.packageId, command: 'winget ' + installArgs(item).join(' '),
      verification: path.basename(binaryFor(item)) + ' --version' }
  })

  handle('install', async (sender, id) => {
    const item = catalog.find(tool => tool.id === id)
    if (!item) throw new Error('Choose a supported software package.')
    if (active) throw new Error('Wait for the current software installation.')
    active = true
    let attempt
    try {
      const state = await inventory()
      if (!state.wingetAvailable) throw new Error('WinGet is unavailable. Install or repair Windows App Installer first.')
      if (state.tools.find(tool => tool.id === id)?.installed) return { outcome: 'Already installed', output: '', inventory: state }
      const confirmation = await dialog.showMessageBox(BrowserWindow.fromWebContents(sender), {
        type: 'question', buttons: ['Cancel', 'Launch installer'], defaultId: 0, cancelId: 0,
        message: 'Install ' + item.name + ' from the WinGet repository?',
        detail: 'Package: ' + item.packageId + '\nCommand: winget ' + installArgs(item).join(' ') +
          '\n\nThe publisher installer may open a license or Windows approval screen. Review it before continuing. WinGet checks the installer hash. Additional source or package agreements may require completion through WinGet.'
      })
      if (confirmation.response !== 1 || sender.isDestroyed()) return null
      requireAccount(sender)
      db.exec('BEGIN IMMEDIATE')
      try {
        const running = incomplete.all()
        if (running.some(entry => processIsRunning(entry.ownerPid))) throw new Error('Another Lone X instance is installing software. Wait for it to finish.')
        for (const entry of running) markUnverified.run(entry.id)
        attempt = recordAttempt.run(item.id, Date.now(), process.pid).lastInsertRowid
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        attempt = undefined
        throw error
      }
      const result = await execute(winget, installArgs(item), { timeout: 15 * 60 * 1000 })
      const verified = await inventory()
      const installed = verified.tools.find(tool => tool.id === id)?.installed
      const outcome = result.code === 0 && installed ? 'Installed and verified' : installed ? 'Installed, review installer result' : 'Installation incomplete'
      finishAttempt.run(outcome, Date.now(), attempt)
      const tool = verified.tools.find(tool => tool.id === id)
      if (tool) tool.lastAttempt = latestAttempt.get(item.id)
      return {
        outcome,
        output: result.output || (result.code === 0 ? '' : 'WinGet could not complete the installation. Review any license or source agreement in WinGet and retry.'),
        inventory: verified
      }
    } catch (error) {
      if (attempt !== undefined) finishAttempt.run('Installation failed', Date.now(), attempt)
      throw error
    } finally {
      active = false
    }
  })
}

module.exports = { registerSoftware }
