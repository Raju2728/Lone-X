const assert = require('node:assert/strict')
const { app, BrowserWindow, dialog, safeStorage } = require('electron')

const profile = require('node:fs').mkdtempSync(require('node:path').join(__dirname, '../node_modules/.lone-x-smoke-'))
app.setPath('userData', profile)
global.fetch = (url, options) => {
  if (url === 'http://127.0.0.1:11434/api/tags') {
    return Promise.resolve(Response.json({ models: [{ name: 'smoke-model' }] }))
  }
  if (url === 'http://127.0.0.1:11434/api/chat') {
    const payload = JSON.parse(options.body)
    if (payload.format) {
      assert.equal(payload.format.type, 'object')
      const content = payload.messages.at(-1).content === 'Invalid plan fixture'
        ? '{"summary":"Missing steps"}'
        : JSON.stringify({ summary: 'Inspect the project', steps: [{ action: 'List project files', verify: 'Check the expected files appear' }] })
      return Promise.resolve(new Response(JSON.stringify({ message: { content }, done: true })))
    }
    if (JSON.parse(options.body).messages.at(-1).content === 'Retry this instruction') return Promise.resolve(new Response('', { status: 404 }))
    assert.equal(JSON.parse(options.body).model, 'qwen2.5:0.5b')
    const encoder = new TextEncoder()
    return Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        const send = value => controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'))
        setTimeout(() => send({ message: { content: 'Smoke ' } }), 200)
        setTimeout(() => {
          send({ message: { content: 'response' }, done: true })
          controller.close()
        }, 600)
      }
    })))
  }
  throw new Error('Unexpected provider endpoint in smoke test')
}
const { DatabaseSync } = require('node:sqlite')
const dbPath = require('node:path').join(profile, 'conversation.sqlite')
const legacy = new DatabaseSync(dbPath)
legacy.exec("CREATE TABLE messages (id INTEGER PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL); INSERT INTO messages VALUES (1, 'user', 'Legacy message')")
legacy.close()
const projectPath = require('node:path').join(profile, 'sample-project')
require('node:fs').mkdirSync(projectPath)
require('node:fs').writeFileSync(require('node:path').join(projectPath, 'README.md'), 'fixture')
let pickerCount = 0
dialog.showOpenDialog = async (_window, options) => options.properties.includes('openFile')
  ? { canceled: false, filePaths: [require('node:path').join(projectPath, 'README.md')] }
  : ++pickerCount === 1
  ? { canceled: true, filePaths: [] }
  : { canceled: false, filePaths: [projectPath] }
const copyPath = require('node:path').join(projectPath, 'copy.txt')
dialog.showSaveDialog = async () => ({ canceled: false, filePath: copyPath })
const subprocess = require('node:child_process')
const realExecFile = subprocess.execFile
let stopRunningCommand
let runningChild
subprocess.execFile = (binary, args, options, callback) => {
  if (!args.at(-1)?.includes('Win32_OperatingSystem')) return realExecFile(binary, args, options, callback)
  runningChild = realExecFile(binary, [...args.slice(0, -1), 'Start-Sleep -Seconds 30'], options, callback)
  runningChild.once('spawn', () => { void stopRunningCommand() })
  return runningChild
}
require('../desktop/main.cjs')
subprocess.execFile = realExecFile

setTimeout(() => {
  console.error('Desktop smoke test timed out.')
  app.exit(1)
}, 15000).unref()

app.whenReady().then(async () => {
  const window = BrowserWindow.getAllWindows()[0]
  if (window.webContents.isLoading()) {
    await new Promise((resolve, reject) => {
      window.webContents.once('did-finish-load', resolve)
      window.webContents.once('did-fail-load', (_event, _code, description) => reject(new Error(description)))
    })
  }
  await assert.rejects(window.webContents.executeJavaScript('window.loneXAI.history()'), /Sign in/)
  await window.webContents.executeJavaScript(`
    (async () => {
      for (let attempt = 0; attempt < 100 && !document.querySelector('.account-panel form'); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      const form = document.querySelector('.account-panel form')
      for (const [type, value] of [['email', 'raju@example.test'], ['password', 'smoke-password']]) {
        const input = form.querySelector('input[type=' + type + ']')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      form.requestSubmit()
      for (let attempt = 0; attempt < 100 && !document.querySelector('.shell'); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      if (!document.querySelector('.shell')) throw new Error('Local account form did not unlock the workspace')
    })()
  `)
  stopRunningCommand = () => window.webContents.executeJavaScript('window.loneXTerminal.stop()')
  const plan = await window.webContents.executeJavaScript("window.loneXAI.plan('Inspect project')")
  assert.equal(plan.summary, 'Inspect the project')
  assert.deepEqual(plan.steps, [{ action: 'List project files', verify: 'Check the expected files appear' }])
  await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.plan('Invalid plan fixture')"), /usable plan/)
  console.log('Structured local planning and malformed output rejection passed.')
  dialog.showMessageBox = async () => { throw new Error('Allowlisted commands should run without a dialog') }
  const terminal = await window.webContents.executeJavaScript(`
    (async () => {
      const terminal = window.loneXTerminal
      let invalid = false
      try { await terminal.run('Remove-Item') } catch { invalid = true }
      const completed = await terminal.run('version')
      const stoppedRunning = await terminal.run('memory')
      return { invalid, completed, stoppedRunning, history: await terminal.history() }
    })()
  `)
  assert.equal(terminal.invalid, true)
  assert.equal(terminal.completed.outcome, 'Completed')
  assert.match(terminal.completed.output, /^\d+\./)
  assert.equal(terminal.stoppedRunning.outcome, 'Stopped')
  assert.equal(terminal.stoppedRunning.output, '')
  assert.equal(runningChild.killed, true)
  assert.throws(() => process.kill(runningChild.pid, 0), { code: 'ESRCH' })
  assert.deepEqual(terminal.history.map(entry => entry.outcome), ['Stopped', 'Completed'])
  console.log('PowerShell allowlist, prompt-free execution, emergency stop, and audit passed.')
  await window.webContents.executeJavaScript(`
    (async () => {
      const waitFor = async predicate => {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (predicate()) return
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        throw new Error('PowerShell console did not reach expected state')
      }
      document.querySelector('.rail-settings').click()
      await waitFor(() => !!document.querySelector('.launch-panel button'))
      const terminalLink = [...document.querySelectorAll('.launch-panel button')].find(button => button.querySelector('strong')?.textContent === 'Terminal')
      terminalLink.click()
      const input = document.querySelector('#ps-command')
      await waitFor(() => !input.closest('[hidden]'))
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Get-Date')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await waitFor(() => input.value === 'Get-Date')
      input.form.requestSubmit()
      await waitFor(() => !!document.querySelector('.ps-entry pre') && !input.readOnly)
      if (document.querySelector('.ps-entry .ps-error')) throw new Error('Get-Date failed')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
      await waitFor(() => input.value === 'Get-Date')
      document.querySelector('aside nav button').click()
      await waitFor(() => document.querySelector('h1')?.textContent === 'Overview')
    })()
  `)
  console.log('Typed PowerShell command, console output, and Up-arrow history passed.')
  console.log('Local account creation and locked workspace IPC passed.')
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const heading = () => document.querySelector('h1')?.textContent
      const wait = () => new Promise(resolve => setTimeout(resolve, 75))
      await wait()
      const initial = heading()
      const start = document.documentElement.dataset.theme
      document.querySelector('.rail [role=switch]').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
      await wait()
      const changed = document.documentElement.dataset.theme
      const sections = []
      for (const button of document.querySelectorAll('aside nav button')) {
        button.click()
        await wait()
        sections.push(document.querySelector('[aria-label="AI conversation"]').closest('[hidden]') ? heading() : 'AI workspace')
      }
      const storedTheme = localStorage.getItem('lone-x-theme')
      return { initial, start, changed, storedTheme, sections, nodeExposed: typeof require !== 'undefined' }
    })()
  `)
  assert.equal(result.initial, 'Overview')
  assert.ok(['light', 'dark'].includes(result.start))
  assert.equal(result.changed, result.start === 'light' ? 'dark' : 'light')
  assert.equal(result.storedTheme, result.changed)
  assert.deepEqual(result.sections, ['Overview', 'AI workspace'])
  assert.equal(result.nodeExposed, false)
  const project = await window.webContents.executeJavaScript(`
    (async () => ({
      canceled: await window.loneXProjects.open(),
      selected: await window.loneXProjects.open()
    }))()
  `)
  assert.equal(project.canceled, null)
  assert.deepEqual(project.selected, {
    name: 'sample-project', entries: [{ name: 'README.md', kind: 'File' }], truncated: false
  })
  assert.deepEqual(await window.webContents.executeJavaScript('window.loneXProjects.preview()'), {
    name: 'README.md', text: 'fixture'
  })
  assert.equal(await window.webContents.executeJavaScript('window.loneXProjects.saveCopy()'), 'copy.txt')
  assert.equal(require('node:fs').readFileSync(copyPath, 'utf8'), 'fixture')
  await assert.rejects(window.webContents.executeJavaScript('window.loneXProjects.saveCopy()'))
  assert.equal(require('node:fs').readFileSync(copyPath, 'utf8'), 'fixture')
  console.log('Project picker, read-only preview, and save-copy overwrite protection passed.')
  const retention = new DatabaseSync(dbPath)
  const migrated = retention.prepare('SELECT created_at FROM messages WHERE id = 1').get()
  assert.ok(Date.now() - migrated.created_at < 60000)
  retention.prepare('UPDATE messages SET created_at = ? WHERE id = 1').run(Date.now() - 31 * 24 * 60 * 60 * 1000)
  retention.close()
  assert.deepEqual(await window.webContents.executeJavaScript('window.loneXAI.history()'), [])
  console.log('Legacy history migration and expired message deletion passed.')
  const chat = await window.webContents.executeJavaScript(`
    (async () => {
      const waitFor = async predicate => {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (predicate()) return
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        throw new Error('Chat UI did not reach expected state')
      }
      document.querySelectorAll('aside nav button')[1].click()
      await waitFor(() => !document.querySelector('#draft').closest('[hidden]'))
      const workspace = document.querySelector('[aria-label="AI conversation"]')
      const buttons = () => [...workspace.querySelectorAll('button')]
      const draft = workspace.querySelector('textarea')
      const fill = (element, text) => {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, text)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
      const initialHeight = draft.getBoundingClientRect().height
      fill(draft, ['one', 'two', 'three'].join(String.fromCharCode(10)))
      await waitFor(() => draft.getBoundingClientRect().height > initialHeight)
      const promptBounds = draft.getBoundingClientRect()
      const sendBounds = workspace.querySelector('.prompt-bar__send').getBoundingClientRect()
      if (sendBounds.left < promptBounds.right || sendBounds.top >= promptBounds.bottom) throw new Error('Send button is outside the prompt row')
      if (getComputedStyle(draft).borderTopWidth !== '0px') throw new Error('Prompt border is visible')
      const send = async text => {
        fill(draft, text)
        const button = () => buttons().find(item => item.getAttribute('aria-label') === 'Send')
        await waitFor(() => button() && !button().disabled)
        const bounds = button().getBoundingClientRect()
        const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        if (!button().contains(target)) throw new Error('Send arrow is not clickable at its visible position')
        button().click()
      }
      await send('Local instruction')
      await waitFor(() => workspace.textContent.includes('Waiting for Ollama'))
      await waitFor(() => workspace.textContent.includes('Streaming response'))
      await waitFor(() => workspace.textContent.includes('Smoke response') && !draft.value)
      await send('Retry this instruction')
      await waitFor(() => workspace.querySelector('[role=alert]')?.textContent.includes('HTTP 404'))
      const retainedDraft = draft.value
      await send('Local retry')
      await waitFor(() => workspace.textContent.includes('Smoke response') && !draft.value)
      const history = await window.loneXAI.history()
      buttons().find(button => button.textContent === 'New chat').click()
      await waitFor(() => workspace.textContent.includes('Start a local conversation'))
      const newHistory = await window.loneXAI.history(localStorage.getItem('lone-x-current-chat'))
      const older = [...workspace.querySelectorAll('.ai-history button')].find(button => button.textContent === 'Local instruction')
      if (!older) throw new Error('Saved chat is missing')
      older.click()
      await waitFor(() => workspace.querySelector('.ai-transcript').textContent.includes('Smoke response'))
      window.confirm = () => false
      const remove = workspace.querySelector('.ai-chat-delete')
      remove.click()
      if (!(await window.loneXAI.history()).length) throw new Error('Cancel deleted the chat')
      window.confirm = () => true
      remove.click()
      await waitFor(() => !workspace.querySelector('.ai-chat-delete'))
      return { retainedDraft, history, newHistory }
    })()
  `)
  assert.deepEqual(chat.newHistory, [])
  assert.equal(chat.retainedDraft, 'Retry this instruction')
  assert.deepEqual(chat.history, [
    { role: 'user', content: 'Local instruction' },
    { role: 'assistant', content: 'Smoke response' },
    { role: 'user', content: 'Local retry' },
    { role: 'assistant', content: 'Smoke response' }
  ])

  const db = new DatabaseSync(require('node:path').join(profile, 'conversation.sqlite'), { readOnly: true })
  try {
    const rows = db.prepare('SELECT role, content FROM messages ORDER BY id').all()
    assert.deepEqual(rows, [])
  } finally {
    db.close()
  }
  console.log('Chat UI Ollama discovery, streaming, retry, and SQLite storage passed.')
  const account = new DatabaseSync(require('node:path').join(profile, 'account.sqlite'), { readOnly: true })
  const saved = account.prepare('SELECT encrypted FROM login_session WHERE id = 1').get()
  account.close()
  const expiresAt = Number(safeStorage.decryptString(Buffer.from(saved.encrypted)))
  const remaining = expiresAt - Date.now()
  assert.ok(remaining > 3 * 86400000 - 60000 && remaining <= 3 * 86400000)
  const realNow = Date.now
  try {
    Date.now = () => expiresAt
    const status = await window.webContents.executeJavaScript('window.loneXAccount.status()')
    assert.equal(status.signedIn, false)
    await assert.rejects(window.webContents.executeJavaScript('window.loneXAI.history()'), /Sign in/)
  } finally {
    Date.now = realNow
  }
  console.log('Encrypted three-day session and expiry enforcement passed.')
  console.log('Desktop loaded, theme toggled, primary navigation worked, and renderer Node access was absent.')
  app.exit(0)
}).catch(error => {
  console.error(error)
  app.exit(1)
})
