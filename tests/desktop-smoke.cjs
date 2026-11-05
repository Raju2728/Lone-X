const assert = require('node:assert/strict')
const { app, BrowserWindow, dialog, safeStorage } = require('electron')
app.commandLine.appendSwitch('disable-background-timer-throttling')

const profile = require('node:fs').mkdtempSync(require('node:path').join(__dirname, '../node_modules/.lone-x-smoke-'))
app.setPath('userData', profile)
global.fetch = (url, options) => {
  if (url === 'http://127.0.0.1:11434/api/tags') {
    return Promise.resolve(Response.json({ models: [{ name: 'smoke-model' }] }))
  }
  if (url === 'http://127.0.0.1:11434/api/pull') {
    const { model, stream } = JSON.parse(options.body)
    assert.ok(['qwen2.5-coder:0.5b', 'gemma3:1b'].includes(model))
    assert.equal(stream, false)
    return Promise.resolve(Response.json({ status: 'success' }))
  }
  if (url === 'http://127.0.0.1:11434/api/chat') {
    const payload = JSON.parse(options.body)
    if (payload.options.num_predict === 24) {
      return Promise.resolve(new Response(JSON.stringify({ message: { content: 'Desktop Chat Testing' }, done: true })))
    }
    if (payload.model === 'gemma3:1b') {
      assert.deepEqual(payload.messages, [{ role: 'user', content: 'Local Gemma test' }])
      return Promise.resolve(new Response(JSON.stringify({ message: { content: 'Gemma reply' }, done: true, prompt_eval_count: 7, eval_count: 3 })))
    }
    if (payload.format) {
      assert.equal(payload.format.type, 'object')
      const content = payload.messages.at(-1).content === 'Invalid plan fixture'
        ? '{"summary":"Missing steps"}'
        : JSON.stringify({ summary: 'Inspect the project', steps: [{ action: 'List project files', verify: 'Check the expected files appear', tool: payload.messages.at(-1).content === 'Unknown tool fixture' ? 'remove-item' : 'version' }] })
      return Promise.resolve(new Response(JSON.stringify({ message: { content }, done: true })))
    }
    if (JSON.parse(options.body).messages.at(-1).content === 'Retry this instruction') return Promise.resolve(new Response('', { status: 404 }))
    if (payload.messages.at(-1).content.startsWith('Local instruction')) {
      assert.equal(payload.options.num_predict, 1024)
      assert.equal(payload.messages.at(-1).content, 'Local instruction\n\nFile: notes.txt\nAttachment fixture')
    }
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
  await assert.rejects(window.webContents.executeJavaScript('window.loneXAI.history()'), /legal agreements/)
  await assert.rejects(window.webContents.executeJavaScript('window.loneXAccount.status()'), /legal agreements/)
  await assert.rejects(window.webContents.executeJavaScript('window.loneXLegal.accept({ revision: 0 })'), /current agreements/)
  window.webContents.openDevTools({ mode: 'detach', activate: false })
  assert.equal(window.webContents.isDevToolsOpened(), false)
  await window.webContents.executeJavaScript(`
    (async () => {
      for (let attempt = 0; attempt < 160 && !document.querySelector('.legal-consent'); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      const gate = document.querySelector('.legal-consent')
      if (!gate || document.querySelector('.account-panel')) throw new Error('Legal consent must precede account access: ' + document.body.textContent.slice(0, 350))
      const choices = [...gate.querySelectorAll('input[type=checkbox]')]
      const submit = gate.querySelector('button[type=submit]')
      if (choices.length !== 3 || choices.some(input => input.checked) || !submit.disabled) throw new Error('Consent defaults are invalid')
      const documents = [...gate.querySelectorAll('details')]
      if (documents.length !== 3 || documents.some(item => !item.querySelector('.legal-copy p'))) throw new Error('Complete documents are missing')
      choices.slice(0, 2).forEach(input => input.click())
      if (!submit.disabled) throw new Error('Partial acceptance unlocked the app')
      choices[2].click()
      for (let attempt = 0; attempt < 20 && submit.disabled; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      submit.click()
      for (let attempt = 0; attempt < 100 && !document.querySelector('.account-panel form'); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      if (!document.querySelector('.account-panel form')) throw new Error('Acceptance did not unlock account access')
    })()
  `)
  const accepted = await window.webContents.executeJavaScript('window.loneXLegal.status()')
  const legalDb = new DatabaseSync(require('node:path').join(profile, 'legal.sqlite'))
  const receipt = legalDb.prepare('SELECT receipt FROM consent WHERE revision = ?').get(accepted.revision)
  assert.deepEqual(JSON.parse(safeStorage.decryptString(Buffer.from(receipt.receipt))), accepted)
  assert.ok(Number.isFinite(Date.parse(accepted.acceptedAt)))
  legalDb.prepare('DELETE FROM consent WHERE revision = ?').run(accepted.revision)
  legalDb.prepare('INSERT INTO consent VALUES (?, ?)').run(accepted.revision + 1, receipt.receipt)
  assert.equal(await window.webContents.executeJavaScript('window.loneXLegal.status()'), null)
  await assert.rejects(window.webContents.executeJavaScript('window.loneXAccount.status()'), /legal agreements/)
  legalDb.prepare('INSERT INTO consent VALUES (?, ?)').run(accepted.revision, receipt.receipt)
  legalDb.close()
  await window.loadFile(require('node:path').join(__dirname, '../dist/index.html'), { hash: 'workspace' })
  assert.deepEqual(await window.webContents.executeJavaScript('window.loneXLegal.status()'), accepted)
  await assert.rejects(window.webContents.executeJavaScript('window.loneXAI.history()'), /Sign in/)
  await window.webContents.executeJavaScript(`
    (async () => {
      for (let attempt = 0; attempt < 100 && !document.querySelector('.account-panel form'); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      const form = document.querySelector('.account-panel form')
      if (document.querySelector('.legal-consent')) throw new Error('Legal consent was requested again')
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
  assert.equal(await window.webContents.executeJavaScript('window.loneXAI.installModel(\'qwen2.5-coder:0.5b\')'), true)
  await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.send({ model: 'unapproved', text: 'test' })"))
  assert.equal(await window.webContents.executeJavaScript("window.loneXAI.installModel('gemma3:1b')"), true)
  await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.installModel('unapproved')"), /supported model/)
  const gemma = await window.webContents.executeJavaScript(`
    (async () => {
      const history = await window.loneXAI.send({ model: 'gemma3:1b', text: 'Local Gemma test', chatId: 'gemma-test' })
      await window.loneXAI.deleteChat('gemma-test')
      return history
    })()
  `)
  assert.deepEqual(gemma, [{ role: 'user', content: 'Local Gemma test' }, { role: 'assistant', content: 'Gemma reply' }])
  const usage = await window.webContents.executeJavaScript('window.loneXAI.overview()')
  assert.equal(usage.completed, 1)
  assert.equal(usage.tokens, 10)
  assert.ok(usage.elapsedMs >= 0)
  assert.equal(usage.version, 'Lone X (Beta)')
  console.log('Gemma 3 local Ollama streaming passed.')
  console.log('Fixed Qwen Coder download and model allowlist passed.')
  const plan = await window.webContents.executeJavaScript("window.loneXAI.plan('Inspect project')")
  assert.equal(plan.summary, 'Inspect the project')
  assert.deepEqual(plan.steps, [{ action: 'List project files', verify: 'Check the expected files appear', tool: 'version' }])
  const unknown = await window.webContents.executeJavaScript("window.loneXAI.plan('Unknown tool fixture')")
  assert.equal(unknown.steps[0].tool, undefined)
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
  assert.equal((await window.webContents.executeJavaScript("window.loneXTerminal.run('LoneX -v')")).output, 'Lone X (Beta)')
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
      document.querySelector('.rail-settings').click()
      await waitFor(() => document.querySelector('h1')?.textContent === 'Settings')
      const activityLink = [...document.querySelectorAll('.launch-panel button')].find(button => button.querySelector('strong')?.textContent === 'Activity')
      activityLink.click()
      await waitFor(() => document.querySelector('.activity-log')?.textContent.includes('Current date and time'))
      if (!document.querySelector('.overview-activity')) throw new Error('Activity summary is missing')
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
      const work = document.querySelector('.work')
      const railTop = document.querySelector('.rail').getBoundingClientRect().top
      const spacer = document.createElement('div')
      spacer.style.height = '200vh'
      work.append(spacer)
      work.scrollTop = 100
      if (work.scrollTop !== 100 || window.scrollY !== 0 || document.querySelector('.rail').getBoundingClientRect().top !== railTop) throw new Error('Sidebar moved with page content')
      spacer.remove()
      work.scrollTop = 0
      if (![...document.querySelectorAll('[aria-labelledby=launch-heading] strong')].some(label => label.textContent === 'Chat')) throw new Error('Quick Access is missing Chat')
      const overviewWidth = document.querySelector('.rail').getBoundingClientRect().width
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
      const rail = document.querySelector('.rail')
      const chatWidth = rail.getBoundingClientRect().width
      const chatButton = rail.querySelector('button[aria-label=Chat]')
      const compactChat = chatWidth < overviewWidth && getComputedStyle(chatButton.querySelector('span')).display === 'none'
      rail.querySelector('button[aria-label=Overview]').click()
      await wait()
      const expandedOverview = rail.getBoundingClientRect().width === overviewWidth
      const overviewPanel = document.querySelector('.overview-activity')
      if (!overviewPanel?.textContent.includes('Lone X (Beta)') || !overviewPanel.textContent.includes('smoke-model')) throw new Error('Overview metrics or installed models are missing')
      if (overviewPanel.querySelector('.overview-update')) throw new Error('Overview shows an unverified update')
      return { initial, start, changed, storedTheme, sections, compactChat, expandedOverview, nodeExposed: typeof require !== 'undefined' }
    })()
  `)
  assert.equal(result.initial, 'Overview')
  assert.ok(['light', 'dark'].includes(result.start))
  assert.equal(result.changed, result.start === 'light' ? 'dark' : 'light')
  assert.equal(result.storedTheme, result.changed)
  assert.deepEqual(result.sections, ['Overview', 'AI workspace'])
  assert.equal(result.compactChat, true)
  assert.equal(result.expandedOverview, true)
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
  const editedPath = require('node:path').join(projectPath, 'edited.txt')
  const originalSaveDialog = dialog.showSaveDialog
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: editedPath })
  assert.equal(await window.webContents.executeJavaScript("window.loneXProjects.saveCopy('edited fixture')"), 'edited.txt')
  dialog.showSaveDialog = originalSaveDialog
  assert.equal(require('node:fs').readFileSync(editedPath, 'utf8'), 'edited fixture')
  assert.equal(require('node:fs').readFileSync(require('node:path').join(projectPath, 'README.md'), 'utf8'), 'fixture')
  await assert.rejects(window.webContents.executeJavaScript('window.loneXProjects.saveCopy()'))
  assert.equal(require('node:fs').readFileSync(copyPath, 'utf8'), 'fixture')
  const starter = await window.webContents.executeJavaScript('window.loneXProjects.createStarter()')
  assert.match(starter.name, /^lone-x-starter-/)
  assert.deepEqual(starter.entries.map(entry => entry.name), ['index.html', 'styles.css', 'README.md'])
  assert.match(require('node:fs').readFileSync(require('node:path').join(projectPath, starter.name, 'index.html'), 'utf8'), /Your starter project is ready/)
  const styles = require('node:path').join(projectPath, starter.name, 'styles.css')
  const originalStyles = require('node:fs').readFileSync(styles, 'utf8')
  require('node:fs').writeFileSync(styles, 'body { color: red; }')
  const changed = await window.webContents.executeJavaScript('window.loneXProjects.repairStarter()')
  assert.equal(changed.find(check => check.name === 'styles.css').status, 'Changed')
  assert.deepEqual(await window.webContents.executeJavaScript("window.loneXProjects.reviewStarterFile('styles.css')"), {
    name: 'styles.css', current: 'body { color: red; }', expected: originalStyles
  })
  await assert.rejects(window.webContents.executeJavaScript("window.loneXProjects.reviewStarterFile('../README.md')"), /generated starter/)
  const repairPath = require('node:path').join(projectPath, 'repaired-styles.css')
  dialog.showSaveDialog = async () => ({ canceled: false, filePaths: [], filePath: repairPath })
  assert.equal(await window.webContents.executeJavaScript("window.loneXProjects.saveStarterRepair('styles.css')"), 'repaired-styles.css')
  dialog.showSaveDialog = originalSaveDialog
  assert.equal(require('node:fs').readFileSync(repairPath, 'utf8'), originalStyles)
  assert.equal(require('node:fs').readFileSync(styles, 'utf8'), 'body { color: red; }')
  const originalMessageBox = dialog.showMessageBox
  dialog.showMessageBox = async () => ({ response: 0 })
  const applyRepair = () => window.webContents.executeJavaScript("window.loneXProjects.applyStarterRepair('styles.css')")
  assert.equal(await applyRepair(), null)
  assert.equal(require('node:fs').readFileSync(styles, 'utf8'), 'body { color: red; }')
  dialog.showMessageBox = async () => ({ response: 1 })
  require('node:fs').writeFileSync(styles, 'body { color: blue; }')
  await assert.rejects(applyRepair(), /changed after review/)
  await window.webContents.executeJavaScript("window.loneXProjects.reviewStarterFile('styles.css')")
  const applied = await applyRepair()
  dialog.showMessageBox = originalMessageBox
  assert.ok(applied.checks.every(check => check.status === 'Passed'))
  assert.equal(require('node:fs').readFileSync(styles, 'utf8'), originalStyles)
  assert.equal(require('node:fs').readFileSync(require('node:path').join(projectPath, starter.name, applied.backup), 'utf8'), 'body { color: blue; }')
  require('node:fs').unlinkSync(styles)
  const missing = await window.webContents.executeJavaScript('window.loneXProjects.checkStarter()')
  assert.equal(missing.find(check => check.name === 'styles.css').status, 'Missing')
  await assert.rejects(window.webContents.executeJavaScript('window.loneXProjects.previewStarter()'), /resolve missing or changed files/)
  const repaired = await window.webContents.executeJavaScript('window.loneXProjects.repairStarter()')
  assert.deepEqual(repaired.map(check => check.status), ['Passed', 'Passed', 'Passed'])
  assert.equal(require('node:fs').readFileSync(styles, 'utf8'), originalStyles)
  assert.equal(await window.webContents.executeJavaScript('window.loneXProjects.previewStarter()'), true)
  const starterWindow = BrowserWindow.getAllWindows().find(candidate => candidate.getParentWindow() === window)
  assert.equal(starterWindow.webContents.getTitle(), 'Lone X starter')
  starterWindow.destroy()
  console.log('Approved HTML starter creation and file contents passed.')
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
        throw new Error('Chat UI did not reach expected state: ' + predicate.toString() + ' | ' + document.querySelector('.ai-compose')?.textContent)
      }
      document.querySelectorAll('aside nav button')[1].click()
      await waitFor(() => !document.querySelector('#draft').closest('[hidden]'))
      const workspace = document.querySelector('[aria-label="AI conversation"]')
      const buttons = () => [...workspace.querySelectorAll('button')]
      const picker = workspace.querySelector('.prompt-bar button[aria-label="Choose model"]')
      picker.click()
      await waitFor(() => !!workspace.querySelector('.prompt-bar [data-kind=model]'))
      const options = () => [...workspace.querySelectorAll('.prompt-bar [role=option]')]
      options().find(option => option.textContent.includes('Gemma 3 1B')).click()
      await waitFor(() => picker.textContent.includes('Gemma 3 1B') && workspace.querySelector('.ai-model-actions')?.textContent.includes('Download Gemma 3 1B'))
      picker.click()
      await waitFor(() => options().length === 3)
      if (!options().find(option => option.textContent.includes('Gemma 3 1B')).matches('[aria-selected=true]')) throw new Error('Selected model was not marked')
      options().find(option => option.textContent.includes('Qwen2.5 0.5B')).click()
      await waitFor(() => picker.textContent.includes('Qwen2.5 0.5B'))
      const draft = workspace.querySelector('textarea')
      const fill = (element, text) => {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, text)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
      const initialHeight = draft.getBoundingClientRect().height
      if (draft.placeholder !== 'Ask Anything') throw new Error('Prompt placeholder is incorrect')
      for (const label of ['Add files and sources', 'Choose effort', 'Dictate']) {
        if (!buttons().some(button => button.getAttribute('aria-label') === label)) throw new Error('Missing composer control: ' + label)
      }
      fill(draft, 'Single line')
      await waitFor(() => localStorage.getItem('lone-x-draft') === 'Single line')
      if (workspace.textContent.includes('Draft saved locally')) throw new Error('Draft layout is incorrect')
      fill(draft, ['one', 'two', 'three'].join(String.fromCharCode(10)))
      await waitFor(() => draft.getBoundingClientRect().height > initialHeight)
      const promptBounds = draft.getBoundingClientRect()
      const sendBounds = workspace.querySelector('.prompt-bar__send').getBoundingClientRect()
      if (sendBounds.top < promptBounds.bottom) throw new Error('Prompt tools should sit below the text field')
      if (getComputedStyle(draft).borderTopWidth !== '0px') throw new Error('Prompt border is visible')
      if (parseFloat(getComputedStyle(draft.closest('.prompt-bar__field')).borderTopLeftRadius) < 20) throw new Error('Prompt bar is missing its rounded frame')
      const send = async text => {
        fill(draft, text)
        const button = () => buttons().find(item => item.getAttribute('aria-label') === 'Send')
        await waitFor(() => button() && !button().disabled)
        const bounds = button().getBoundingClientRect()
        const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        if (!button().contains(target)) throw new Error('Send arrow is not clickable at its visible position')
        button().click()
      }
      const originalClick = HTMLInputElement.prototype.click
      HTMLInputElement.prototype.click = function () {
        if (this.type !== 'file') return originalClick.call(this)
        const selection = new DataTransfer()
        selection.items.add(new File(['Attachment fixture'], 'notes.txt', { type: 'text/plain' }))
        this.files = selection.files
        this.dispatchEvent(new Event('change'))
      }
      buttons().find(button => button.getAttribute('aria-label') === 'Add files and sources').click()
      await waitFor(() => options().some(option => option.textContent.includes('Add files')))
      options().find(option => option.textContent.includes('Add files')).click()
      await waitFor(() => workspace.querySelector('.prompt-bar__chip-name')?.textContent === 'notes.txt')
      HTMLInputElement.prototype.click = originalClick
      await send('Local instruction')
      await waitFor(() => /Thinking|Yosichufying/.test(workspace.querySelector('.ai-thinking')?.textContent ?? ''))
      const loader = workspace.querySelector('.ai-thinking')
      const author = loader.parentElement.querySelector('strong').getBoundingClientRect()
      const loaderBounds = loader.getBoundingClientRect()
      if (loaderBounds.top < author.bottom || Math.abs(loaderBounds.left - author.left) > 1) throw new Error('Loader is not aligned below Raju')
      await waitFor(() => workspace.textContent.includes('Smoke response') && !draft.value)
      if (workspace.textContent.includes('Response saved locally')) throw new Error('Response-saved label is still visible')
      await send('Retry this instruction')
      await waitFor(() => workspace.querySelector('[role=alert]')?.textContent.includes('HTTP 404'))
      const retainedDraft = draft.value
      await send('Local retry')
      await waitFor(() => workspace.textContent.includes('Smoke response') && !draft.value)
      const history = await window.loneXAI.history()
      const newChat = workspace.querySelector('.ai-history-heading button[aria-label="New Chat"]')
      if (!newChat || newChat.textContent.trim() || !newChat.title.includes('New Chat')) throw new Error('New Chat icon or tooltip is missing')
      newChat.click()
      await waitFor(() => workspace.textContent.includes('Start a local conversation'))
      const previousId = localStorage.getItem('lone-x-current-chat')
      workspace.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'O', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
      await waitFor(() => localStorage.getItem('lone-x-current-chat') !== previousId)
      const newHistory = await window.loneXAI.history(localStorage.getItem('lone-x-current-chat'))
      const older = [...workspace.querySelectorAll('.ai-history button')].find(button => button.textContent === 'Desktop Chat Testing')
      if (!older) throw new Error('Saved chat is missing')
      older.click()
      await waitFor(() => workspace.querySelector('.ai-transcript').textContent.includes('Smoke response'))
      if (workspace.querySelector('.ai-chat-delete')) throw new Error('Delete is visible before opening More')
      workspace.querySelector('.ai-chat-more').click()
      await waitFor(() => !!workspace.querySelector('.ai-chat-delete'))
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
    { role: 'user', content: 'Local instruction\n\nFile: notes.txt\nAttachment fixture' },
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
