const assert = require('node:assert/strict')
const { app, BrowserWindow, dialog, safeStorage, shell, session } = require('electron')
const { once } = require('node:events')
const { Readable } = require('node:stream')
const { createResourceApi } = require('../backend/resource-api.cjs')
app.commandLine.appendSwitch('disable-background-timer-throttling')

const profile = require('node:fs').mkdtempSync(require('node:path').join(__dirname, '../node_modules/.lone-x-smoke-'))
app.setPath('userData', profile)
app.setPath('downloads', profile)
const readerToken = 'desktop-smoke-reader-token-fixture'
const adminToken = 'desktop-smoke-admin-token-fixture-2'
const resourceBytes = Buffer.from('verified resource fixture')
const resource = {
  id: 'fixture', version: '1.0.0', filename: 'fixture.zip', size: resourceBytes.length,
  sha256: require('node:crypto').createHash('sha256').update(resourceBytes).digest('hex')
}
let corruptResource = false
const installedModelNames = new Set(['smoke-model'])
let pullMode = 'success'
let pullRequests = 0
let pcFixturePath
let registeredResource
const resourceServer = createResourceApi({
  readToken: readerToken, adminToken,
  registry: {
    list: async () => registeredResource && !registeredResource.withdrawnAt ? [registeredResource] : [],
    get: async (id, version) => id === resource.id && version === resource.version ? registeredResource : null,
    insert: async record => {
      if (registeredResource) return false
      registeredResource = record
      return true
    },
    withdraw: async (id, version, at) => {
      if (id !== resource.id || version !== resource.version || !registeredResource) return null
      registeredResource.withdrawnAt ??= at
      return registeredResource
    }
  },
  objects: {
    get: async key => {
      if (key !== 'resources/fixture/1.0.0/fixture.zip') return null
      const bytes = corruptResource ? Buffer.alloc(resourceBytes.length, 42) : resourceBytes
      return { body: Readable.from([bytes]), size: bytes.length, etag: '"resource-fixture"' }
    }
  }
})
const networkFetch = global.fetch
global.fetch = (url, options) => {
  if (url.startsWith(process.env.LONEX_RESOURCE_API_URL + '/')) {
    assert.equal(options.headers.Authorization, 'Bearer ' + readerToken)
    assert.equal(options.redirect, 'error')
    return networkFetch(url, options)
  }
  if (url === 'http://127.0.0.1:11434/api/tags') {
    return Promise.resolve(Response.json({ models: [...installedModelNames].map(name => ({ name, size: 397000000 })) }))
  }
  if (url === 'http://127.0.0.1:11434/api/pull') {
    pullRequests++
    const { model, stream } = JSON.parse(options.body)
    assert.ok(['qwen2.5:0.5b', 'qwen2.5-coder:0.5b', 'gemma3:1b', 'qwen3:4b-instruct'].includes(model))
    assert.equal(stream, true)
    const encoder = new TextEncoder()
    return Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        if (pullMode === 'error') {
          controller.enqueue(encoder.encode('{"error":"Fixture transfer failed"}\n'))
          controller.close()
          return
        }
        controller.enqueue(encoder.encode('{"status":"pulling model file","total":100,"completed":40}\n'))
        const timer = setTimeout(() => {
          options.signal.removeEventListener('abort', abort)
          if (pullMode !== 'missing') installedModelNames.add(model)
          controller.enqueue(encoder.encode('{"status":"success"}\n'))
          controller.close()
        }, 180)
        const abort = () => {
          clearTimeout(timer)
          controller.error(new DOMException('Download aborted', 'AbortError'))
        }
        options.signal.addEventListener('abort', abort, { once: true })
      }
    })))
  }
  if (url === 'http://127.0.0.1:11434/api/chat') {
    const payload = JSON.parse(options.body)
    if (payload.tools) {
      assert.equal(payload.model, 'qwen3:4b-instruct')
      const desktopTask = payload.messages.some(message => message.role === 'user' && message.content.includes('Welcome to LoneX'))
      const thanglishTask = payload.messages.some(message => message.role === 'user' && message.content.includes('Vanakkam LoneX'))
      const pcTask = payload.tools.some(item => item.function.name === 'list_drives')
      return Promise.resolve(Response.json({ done: true, prompt_eval_count: 10, eval_count: 5, message: payload.messages.at(-1).role === 'tool'
        ? { role: 'assistant', content: pcTask ? 'Created PC-wide fixture after approval.' : thanglishTask ? 'Thanglish.txt create panniten.' : desktopTask ? 'Created Welcome.txt after approval.' : 'Created hello.txt after approval.' }
        : { role: 'assistant', content: '', tool_calls: [{ function: { name: 'write_file', arguments: { path: pcTask ? pcFixturePath : thanglishTask ? 'Thanglish.txt' : desktopTask ? 'Welcome.txt' : 'hello.txt', content: pcTask ? 'PC-wide fixture' : thanglishTask ? 'Vanakkam LoneX' : desktopTask ? 'Welcome to LoneX' : 'Hello from the agent' } } }] } }))
    }
    if (payload.options.num_predict === 24) {
      return Promise.resolve(new Response(JSON.stringify({ message: { content: 'Desktop Chat Testing' }, done: true, prompt_eval_count: 5, eval_count: 2 })))
    }
    if (payload.messages.at(-1)?.content?.startsWith('Language coverage:')) {
      assert.ok(['qwen2.5:0.5b', 'qwen2.5-coder:0.5b', 'gemma3:1b', 'qwen3:4b-instruct'].includes(payload.model))
      assert.match(payload.messages[0].content, /For THIS reply.*Thanglish/)
      assert.match(payload.messages[0].content, /Preserve every quoted value and path exactly/)
      return Promise.resolve(Response.json({ message: { content: 'Nalla irukken. Ungalukku enna help venum?' }, done: true, prompt_eval_count: 10, eval_count: 5 }))
    }
    if (payload.model === 'gemma3:1b') {
      assert.match(payload.messages[0].content, /Thanglish/)
      assert.deepEqual(payload.messages.at(-1), { role: 'user', content: 'Local Gemma test' })
      return Promise.resolve(new Response(JSON.stringify({ message: { content: 'Gemma reply' }, done: true, prompt_eval_count: 7, eval_count: 3 })))
    }
    if (payload.format) {
      assert.equal(payload.format.type, 'object')
      if (payload.format.properties.diagnosis) {
        const input = JSON.parse(payload.messages.at(-1).content)
        assert.equal(input.filename, 'math.cjs')
        assert.match(input.testOutput, /41 !== 42/)
        assert.equal(input.source, 'module.exports = value => value - 1')
        return Promise.resolve(new Response(JSON.stringify({ message: { content: JSON.stringify({
          diagnosis: 'The function incorrectly subtracts one.', before: 'value - 1', after: 'value'
        }) }, done: true })))
      }
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
const previousSoftware = new DatabaseSync(require('node:path').join(profile, 'software.sqlite'))
previousSoftware.exec("CREATE TABLE installation (id INTEGER PRIMARY KEY, tool TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, outcome TEXT NOT NULL)")
previousSoftware.prepare("INSERT INTO installation(tool, started_at, outcome) VALUES ('git', ?, 'Running')").run(Date.now())
previousSoftware.close()
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
let gitInstalled = false
let sevenZipInstalled = false
let softwareInstalls = 0
let softwareInstallFailure = false
let launchedApps = 0
let failAppLaunch = false
shell.openPath = async filename => {
  assert.equal(filename.toLowerCase(), require('node:path').join(process.env.SystemRoot, 'System32/notepad.exe').toLowerCase())
  launchedApps++
  return failAppLaunch ? 'Fixture launch error' : ''
}
subprocess.execFile = (binary, args, options, callback) => {
  if (binary.toLowerCase().endsWith('winget.exe')) {
    if (args[0] === 'install') {
      assert.ok(['Git.Git', '7zip.7zip'].includes(args[2]))
      assert.deepEqual(args, ['install', '--id', args[2], '--exact', '--source', 'winget', '--interactive', '--disable-interactivity', '--no-upgrade'])
      if (args[2] === '7zip.7zip') sevenZipInstalled = !softwareInstallFailure
      else { softwareInstalls++; gitInstalled = !softwareInstallFailure }
    }
    const failed = args[0] === 'install' && softwareInstallFailure
    queueMicrotask(() => callback(failed ? Object.assign(new Error('Fixture installer cancelled'), { code: 1 }) : null,
      args[0] === 'install' ? failed ? 'Fixture installation interrupted.' : 'Fixture installation completed.' : 'v1.12.0', ''))
    return
  }
  if (binary.replaceAll('\\', '/').toLowerCase().endsWith('/git/cmd/git.exe')) {
    queueMicrotask(() => callback(gitInstalled ? null : Object.assign(new Error('Missing tool'), { code: 'ENOENT' }), gitInstalled ? 'git version 2.52.0' : '', ''))
    return
  }
  if (binary.replaceAll('\\', '/').toLowerCase().endsWith('/7-zip/7z.exe')) {
    assert.deepEqual(args, ['i'])
    queueMicrotask(() => callback(sevenZipInstalled ? null : Object.assign(new Error('Missing tool'), { code: 'ENOENT' }), sevenZipInstalled ? '7-Zip fixture' : '', ''))
    return
  }
  if (!args.at(-1)?.includes('Win32_OperatingSystem')) return realExecFile(binary, args, options, callback)
  runningChild = realExecFile(binary, [...args.slice(0, -1), 'Start-Sleep -Seconds 30'], options, callback)
  runningChild.once('spawn', () => { void stopRunningCommand() })
  return runningChild
}
setTimeout(() => {
  console.error('Desktop smoke test timed out.')
  app.exit(1)
}, 25000).unref()

async function runSmoke() {
  resourceServer.listen(0, '127.0.0.1')
  await once(resourceServer, 'listening')
  process.env.LONEX_RESOURCE_API_URL = 'http://127.0.0.1:' + resourceServer.address().port
  process.env.LONEX_RESOURCE_READ_TOKEN = readerToken
  const registration = await networkFetch(process.env.LONEX_RESOURCE_API_URL + '/v1/resources', {
    method: 'POST', headers: { Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(resource)
  })
  assert.equal(registration.status, 201, await registration.text())
  const browserWindows = []
  app.on('browser-window-created', (_event, browser) => {
    if (browser.webContents.session === session.defaultSession) return
    browserWindows.push(browser)
    browser.webContents.session.protocol.handle('https', request => {
      const pathname = new URL(request.url).pathname
      if (pathname === '/slow') return new Promise(resolve => setTimeout(() => resolve(new Response('Delayed fixture')), 800))
      if (pathname === '/unavailable') return new Response('Service unavailable', { status: 503 })
      return new Response('<!doctype html><title>Browser fixture</title><a id="same" href="/next">Same origin</a><a id="external" href="https://outside.example.test/page">Other origin</a>', {
        headers: { 'Content-Type': 'text/html' }
      })
    })
  })
  require('../desktop/main.cjs')
  subprocess.execFile = realExecFile
  await app.whenReady()
  const window = BrowserWindow.getAllWindows()[0]
  window.webContents.on('console-message', event => { if (event.level === 'error') console.error('Renderer:', event.message) })
  if (window.webContents.isLoading()) {
    await new Promise((resolve, reject) => {
      window.webContents.once('did-finish-load', resolve)
      window.webContents.once('did-fail-load', (_event, _code, description) => reject(new Error(description)))
    })
  }
  await assert.rejects(window.webContents.executeJavaScript('window.loneXAI.history()'), /legal agreements/)
  await assert.rejects(window.webContents.executeJavaScript('window.loneXResources.list()'), /legal agreements/)
  await assert.rejects(window.webContents.executeJavaScript('window.loneXAccount.status()'), /legal agreements/)
  await assert.rejects(window.webContents.executeJavaScript('window.loneXAutomation.status()'), /legal agreements/)
  await assert.rejects(window.webContents.executeJavaScript('window.loneXStorage.scan()'), /legal agreements/)
  await assert.rejects(window.webContents.executeJavaScript('window.loneXBrowser.status()'), /legal agreements/)
  await assert.rejects(window.webContents.executeJavaScript('window.loneXLegal.accept({ revision: 0 })'), /current agreements/)
  window.webContents.openDevTools({ mode: 'detach', activate: false })
  assert.equal(window.webContents.isDevToolsOpened(), false)
  await window.webContents.executeJavaScript(`
    (async () => {
      for (let attempt = 0; attempt < 100 && !document.querySelector('.legal-consent'); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      const gate = document.querySelector('.legal-consent')
      if (!gate || document.querySelector('.account-panel')) throw new Error('Legal consent must precede account access')
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
  await assert.rejects(window.webContents.executeJavaScript("window.loneXAutomation.launch('unknown')"), /supported Windows/)
  const launchDialog = dialog.showMessageBox
  dialog.showMessageBox = async () => ({ response: 0 })
  assert.deepEqual(await window.webContents.executeJavaScript("window.loneXAutomation.launch('notepad')"), { outcome: 'Cancelled' })
  assert.equal(launchedApps, 0)
  dialog.showMessageBox = async () => {
    await window.webContents.executeJavaScript('window.loneXAutomation.cancel()')
    return { response: 1 }
  }
  assert.deepEqual(await window.webContents.executeJavaScript("window.loneXAutomation.launch('notepad')"), { outcome: 'Cancelled' })
  assert.equal(launchedApps, 0)
  dialog.showMessageBox = async () => ({ response: 1 })
  assert.deepEqual(await window.webContents.executeJavaScript("window.loneXAutomation.launch('notepad')"), { outcome: 'Launch requested' })
  failAppLaunch = true
  await assert.rejects(window.webContents.executeJavaScript("window.loneXAutomation.launch('notepad')"), /Windows could not open/)
  dialog.showMessageBox = launchDialog
  const automation = await window.webContents.executeJavaScript('window.loneXAutomation.status()')
  assert.equal(automation.history[0].outcome, 'Launch failed')
  assert.ok(automation.memory.total > 0 && automation.processors > 0)
  for (const url of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'http://example.test', 'https://user:secret@example.test']) {
    await assert.rejects(window.webContents.executeJavaScript('window.loneXBrowser.open(' + JSON.stringify(url) + ')'), /HTTPS/)
  }
  dialog.showMessageBox = async () => ({ response: 0 })
  assert.equal((await window.webContents.executeJavaScript("window.loneXBrowser.open('https://browser.example.test/page')")).status, 'Cancelled')
  assert.equal(browserWindows.length, 0)
  dialog.showMessageBox = async () => ({ response: 1 })
  await assert.rejects(window.webContents.executeJavaScript("window.loneXBrowser.navigate('reload')"), /Open an approved website/)
  await assert.rejects(window.webContents.executeJavaScript("window.loneXBrowser.navigate('https://outside.example.test')"), /Choose Back/)
  assert.equal((await window.webContents.executeJavaScript("window.loneXBrowser.open('https://browser.example.test/page')")).status, 'Ready')
  const browser = browserWindows.at(-1)
  assert.equal((await window.webContents.executeJavaScript('window.loneXBrowser.status()')).canGoBack, false)
  await assert.rejects(window.webContents.executeJavaScript("window.loneXBrowser.navigate('back')"), /No page/)
  assert.equal(await browser.webContents.executeJavaScript('typeof require'), 'undefined')
  assert.equal(await browser.webContents.executeJavaScript('typeof window.loneXAI'), 'undefined')
  const nextPage = once(browser.webContents, 'did-finish-load')
  await browser.webContents.executeJavaScript("document.querySelector('#same').click()")
  await nextPage
  assert.equal(browser.webContents.getURL(), 'https://browser.example.test/next')
  assert.equal((await window.webContents.executeJavaScript('window.loneXBrowser.status()')).canGoBack, true)
  const backPage = once(browser.webContents, 'did-finish-load')
  await window.webContents.executeJavaScript("window.loneXBrowser.navigate('back')")
  await backPage
  assert.equal(browser.webContents.getURL(), 'https://browser.example.test/page')
  assert.equal((await window.webContents.executeJavaScript('window.loneXBrowser.status()')).canGoForward, true)
  const forwardPage = once(browser.webContents, 'did-finish-load')
  await window.webContents.executeJavaScript("window.loneXBrowser.navigate('forward')")
  await forwardPage
  assert.equal(browser.webContents.getURL(), 'https://browser.example.test/next')
  const reloadPage = once(browser.webContents, 'did-finish-load')
  await window.webContents.executeJavaScript("window.loneXBrowser.navigate('reload')")
  await reloadPage
  assert.equal((await window.webContents.executeJavaScript('window.loneXBrowser.status()')).status, 'Ready')
  await browser.webContents.executeJavaScript("document.querySelector('#external').click()")
  assert.equal((await window.webContents.executeJavaScript('window.loneXBrowser.status()')).status, 'Navigation blocked')
  assert.equal(browser.webContents.getURL(), 'https://browser.example.test/next')
  const windowCount = BrowserWindow.getAllWindows().length
  await browser.webContents.executeJavaScript("window.open('https://outside.example.test/page')")
  assert.equal(BrowserWindow.getAllWindows().length, windowCount)
  await window.webContents.executeJavaScript('window.loneXBrowser.close()')
  assert.equal((await window.webContents.executeJavaScript('window.loneXBrowser.status()')).status, 'Closed')
  assert.equal((await window.webContents.executeJavaScript('window.loneXBrowser.status()')).canGoForward, false)
  dialog.showMessageBox = async () => {
    await window.webContents.executeJavaScript('window.loneXBrowser.stop()')
    return { response: 1 }
  }
  assert.equal((await window.webContents.executeJavaScript("window.loneXBrowser.open('https://browser.example.test/page')")).status, 'Cancelled')
  dialog.showMessageBox = async () => ({ response: 1 })
  const slowLoad = window.webContents.executeJavaScript("window.loneXBrowser.open('https://browser.example.test/slow')")
  for (let attempt = 0; attempt < 40; attempt++) {
    const state = await window.webContents.executeJavaScript('window.loneXBrowser.status()')
    if (state.status === 'Loading') break
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  await window.webContents.executeJavaScript('window.loneXBrowser.stop()')
  assert.equal((await slowLoad).status, 'Stopped')
  await window.webContents.executeJavaScript('window.loneXBrowser.close()')
  assert.equal((await window.webContents.executeJavaScript("window.loneXBrowser.open('https://browser.example.test/unavailable')")).status, 'Website returned HTTP 503')
  await window.webContents.executeJavaScript('window.loneXBrowser.close()')
  dialog.showMessageBox = launchDialog
  const recoveredSoftware = await window.webContents.executeJavaScript('window.loneXSoftware.inventory()')
  assert.equal(recoveredSoftware.tools.find(tool => tool.id === 'git').lastAttempt.outcome, 'Verification required')
  await assert.rejects(window.webContents.executeJavaScript("window.loneXSoftware.install('unknown')"), /supported software/)
  const softwarePlan = await window.webContents.executeJavaScript("window.loneXSoftware.plan('git')")
  assert.equal(softwarePlan.packageId, 'Git.Git')
  assert.ok(softwarePlan.command.includes('--source winget'))
  const softwareDialog = dialog.showMessageBox
  dialog.showMessageBox = async () => ({ response: 0 })
  assert.equal(await window.webContents.executeJavaScript("window.loneXSoftware.install('git')"), null)
  assert.equal(softwareInstalls, 0)
  dialog.showMessageBox = async () => ({ response: 1 })
  softwareInstallFailure = true
  const failedInstall = await window.webContents.executeJavaScript("window.loneXSoftware.install('git')")
  assert.equal(failedInstall.outcome, 'Installation incomplete')
  assert.equal(failedInstall.inventory.tools.find(tool => tool.id === 'git').lastAttempt.outcome, 'Installation incomplete')
  softwareInstallFailure = false
  const installedSoftware = await window.webContents.executeJavaScript("window.loneXSoftware.install('git')")
  dialog.showMessageBox = softwareDialog
  assert.equal(installedSoftware.outcome, 'Installed and verified')
  assert.equal(softwareInstalls, 2)
  assert.equal(installedSoftware.inventory.tools.find(tool => tool.id === 'git').installed, true)
  assert.equal(installedSoftware.inventory.tools.find(tool => tool.id === 'git').lastAttempt.outcome, 'Installed and verified')
  const archivePlan = await window.webContents.executeJavaScript("window.loneXSoftware.plan('7zip')")
  assert.equal(archivePlan.packageId, '7zip.7zip')
  assert.equal(archivePlan.verification, '7z.exe i')
  dialog.showMessageBox = async () => ({ response: 1 })
  const archiveInstall = await window.webContents.executeJavaScript("window.loneXSoftware.install('7zip')")
  dialog.showMessageBox = softwareDialog
  assert.equal(archiveInstall.outcome, 'Installed and verified')
  assert.equal(archiveInstall.inventory.tools.find(tool => tool.id === '7zip').installed, true)
  assert.equal(await window.webContents.executeJavaScript('window.loneXAI.installModel(\'qwen2.5-coder:0.5b\')'), true)
  await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.send({ model: 'unapproved', text: 'test' })"))
  assert.equal(await window.webContents.executeJavaScript("window.loneXAI.installModel('gemma3:1b')"), true)
  const pullsAfterInstall = pullRequests
  assert.equal(await window.webContents.executeJavaScript("window.loneXAI.installModel('gemma3:1b')"), true)
  assert.equal(pullRequests, pullsAfterInstall)
  installedModelNames.delete('gemma3:1b')
  pullMode = 'error'
  await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.installModel('gemma3:1b')"), /could not install/)
  pullMode = 'missing'
  await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.installModel('gemma3:1b')"), /local inventory/)
  pullMode = 'success'
  const cancelledModel = await window.webContents.executeJavaScript(`
    (async () => {
      const stop = window.loneXAI.onModelProgress(() => { void window.loneXAI.stopModel() })
      try { return await window.loneXAI.installModel('gemma3:1b') } finally { stop() }
    })()
  `)
  assert.equal(cancelledModel, false)
  assert.equal(installedModelNames.has('gemma3:1b'), false)
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
  assert.equal(usage.tokens, 17)
  assert.ok(usage.elapsedMs >= 0)
  assert.equal(usage.version, 'Lone X (Beta)')
  assert.deepEqual(usage.limits.map(item => ({ limit: item.limit, used: item.used })), [
    { limit: 100000, used: 17 }, { limit: 1000000, used: 17 }
  ])
  assert.ok(usage.limits.every(item => item.resetsAt > Date.now()))
  for (const [index, model] of ['qwen2.5:0.5b', 'qwen2.5-coder:0.5b', 'gemma3:1b', 'qwen3:4b-instruct'].entries()) {
    const result = await window.webContents.executeJavaScript('window.loneXAI.send(' + JSON.stringify({ model, text: 'Language coverage: Enna epdi irukku? Thanglish la sollu.', chatId: 'language-' + index }) + ')')
    assert.match(result.at(-1).content, /Nalla irukken/)
    await window.webContents.executeJavaScript('window.loneXAI.deleteChat(' + JSON.stringify('language-' + index) + ')')
  }
  console.log('Shared Thanglish guidance passed for all four Chat models.')
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
  await assert.rejects(window.webContents.executeJavaScript("window.loneXTerminal.run('LoneX -uninstall')"), /Development files will be kept/)
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
      document.querySelector('.rail-settings').click()
      await waitFor(() => document.querySelector('h1')?.textContent === 'Settings')
      const resourcesLink = [...document.querySelectorAll('.launch-panel button')].find(button => button.querySelector('strong')?.textContent === 'Resources')
      resourcesLink.click()
      await waitFor(() => document.querySelector('[aria-label="Resource catalog"]')?.textContent.includes('fixture.zip'))
      const download = [...document.querySelectorAll('[aria-label="Resource catalog"] button')].find(button => button.textContent === 'Download')
      download.click()
      await waitFor(() => document.querySelector('[aria-label="Resource catalog"]')?.textContent.includes('Verified and saved'))
      document.querySelector('.rail-settings').click()
      await waitFor(() => document.querySelector('h1')?.textContent === 'Settings')
      const modelsLink = [...document.querySelectorAll('.launch-panel button')].find(button => button.querySelector('strong')?.textContent === 'Local models')
      modelsLink.click()
      const modelRow = () => [...document.querySelectorAll('[aria-label="Local model manager"] .launch-row')].find(row => row.querySelector('strong')?.textContent === 'Qwen2.5 0.5B')
      await waitFor(() => modelRow()?.textContent.includes('Download available'))
      modelRow().querySelector('button').click()
      await waitFor(() => modelRow()?.querySelector('progress')?.value === 40)
      await waitFor(() => modelRow()?.textContent.includes('Installed'))
      document.querySelector('.rail-settings').click()
      await waitFor(() => document.querySelector('h1')?.textContent === 'Settings')
      const legalLink = [...document.querySelectorAll('.launch-panel button')].find(button => button.querySelector('strong')?.textContent === 'Legal & Policies')
      legalLink.click()
      await waitFor(() => document.querySelectorAll('.legal-settings details').length === 3 && !!document.querySelector('.legal-settings time'))
      document.querySelector('.rail-settings').click()
      await waitFor(() => document.querySelector('h1')?.textContent === 'Settings')
      const softwareLink = [...document.querySelectorAll('.launch-panel button')].find(button => button.querySelector('strong')?.textContent === 'Software')
      softwareLink.click()
      await waitFor(() => document.querySelector('[aria-label="Software manager"]')?.textContent.includes('git version 2.52.0'))
      document.querySelector('.rail-settings').click()
      await waitFor(() => document.querySelector('h1')?.textContent === 'Settings')
      const automationLink = [...document.querySelectorAll('.launch-panel button')].find(button => button.querySelector('strong')?.textContent === 'Automation')
      automationLink.click()
      await waitFor(() => document.querySelector('[aria-label="Windows automation"]')?.textContent.includes('logical processors'))
      document.querySelector('aside nav button').click()
      await waitFor(() => document.querySelector('h1')?.textContent === 'Overview')
    })()
  `)
  console.log('Typed PowerShell command, console output, and Up-arrow history passed.')
  const resourceDirectory = require('node:path').join(profile, 'Lone X Resources')
  const resourceFolders = require('node:fs').readdirSync(resourceDirectory)
  assert.equal(resourceFolders.length, 1)
  assert.deepEqual(require('node:fs').readFileSync(require('node:path').join(resourceDirectory, resourceFolders[0], resource.filename)), resourceBytes)
  corruptResource = true
  await assert.rejects(window.webContents.executeJavaScript("window.loneXResources.download({ id: 'fixture', version: '1.0.0' })"), /SHA-256/)
  assert.deepEqual(require('node:fs').readdirSync(resourceDirectory), resourceFolders)
  const withdrawal = await networkFetch(process.env.LONEX_RESOURCE_API_URL + '/v1/resources/fixture/1.0.0/withdraw', {
    method: 'POST', headers: { Authorization: 'Bearer ' + adminToken }
  })
  assert.equal(withdrawal.status, 200, await withdrawal.text())
  await assert.rejects(window.webContents.executeJavaScript("window.loneXResources.download({ id: 'fixture', version: '1.0.0' })"), /withdrawn/)
  assert.deepEqual(await window.webContents.executeJavaScript('window.loneXResources.list()'), { configured: true, resources: [] })
  console.log('Resource catalog, authenticated download, checksum rejection, and partial-file cleanup passed.')
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
      const limitsButton = rail.querySelector('button[aria-label="Limits"]')
      if (!limitsButton || document.querySelector('.ai-compose .usage-limits')) throw new Error('Limits were not moved to the sidebar')
      limitsButton.click()
      await wait()
      const limits = document.querySelector('.usage-limits')
      const bars = [...limits.querySelectorAll('[role="progressbar"]')]
      if (bars.length !== 2 || !bars[0].getAttribute('aria-label').includes('Five-hour') || !bars[1].getAttribute('aria-label').includes('Weekly')) throw new Error('Limit bars are not ordered five-hour then weekly')
      if (!limits.textContent.includes('% left') || /100K|1M|tokens left/.test(limits.textContent)) throw new Error('Limits should show percentages without token counts')
      if (!limits.querySelector('.limit-tone-green')) throw new Error('Available allowance should use green')
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await wait()
      if (document.querySelector('.usage-limits') || document.activeElement !== limitsButton) throw new Error('Limits did not dismiss with Escape')
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
    name: 'README.md', text: 'fixture', canApply: true
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
  const fs = require('node:fs')
  const join = require('node:path').join
  const manifest = {
    name: 'lone-x-npm-fixture', version: '1.0.0', private: true,
    scripts: { start: 'node start.cjs', test: 'node check.cjs', pretest: 'node forbidden.cjs' },
    dependencies: { 'local-fixture': 'file:vendor/local-fixture' }
  }
  const dependency = join(projectPath, 'vendor', 'local-fixture')
  fs.mkdirSync(dependency, { recursive: true })
  fs.writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'local-fixture', version: '1.0.0', main: 'index.cjs' }))
  fs.writeFileSync(join(dependency, 'index.cjs'), 'module.exports = 42\n')
  fs.writeFileSync(join(projectPath, 'package.json'), JSON.stringify(manifest))
  fs.writeFileSync(join(projectPath, 'package-lock.json'), JSON.stringify({
    name: manifest.name, version: manifest.version, lockfileVersion: 3,
    packages: {
      '': { name: manifest.name, version: manifest.version, dependencies: manifest.dependencies },
      'node_modules/local-fixture': { resolved: 'vendor/local-fixture', link: true },
      'vendor/local-fixture': { name: 'local-fixture', version: '1.0.0' }
    }
  }))
  fs.writeFileSync(join(projectPath, 'start.cjs'), "console.log('Project started:', require('local-fixture'))")
  fs.writeFileSync(join(projectPath, 'math.cjs'), 'module.exports = value => value - 1')
  fs.writeFileSync(join(projectPath, 'check.cjs'), "require('node:assert/strict').equal(require('./math.cjs')(require('local-fixture')), 42)")
  await window.webContents.executeJavaScript('window.loneXProjects.open()')
  const commands = await window.webContents.executeJavaScript('window.loneXProjects.inspectNpm()')
  assert.deepEqual(commands.map(command => command.action), ['install', 'start', 'test'])
  const runNpm = action => window.webContents.executeJavaScript('window.loneXProjects.runNpm(' + JSON.stringify(action) + ')')
  dialog.showMessageBox = async () => ({ response: 0 })
  assert.equal(await runNpm('install'), null)
  assert.equal(fs.existsSync(join(projectPath, 'node_modules')), false)
  dialog.showMessageBox = async () => ({ response: 1 })
  const installed = await runNpm('install')
  assert.equal(installed.outcome, 'Completed', installed.output)
  const started = await runNpm('start')
  assert.equal(started.outcome, 'Completed', started.output)
  assert.match(started.output, /Project started: 42/)
  const failing = await runNpm('test')
  assert.equal(failing.outcome, 'Failed')
  assert.match(failing.output, /41 !== 42/)
  const originalOpenDialog = dialog.showOpenDialog
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [join(projectPath, 'math.cjs')] })
  const source = await window.webContents.executeJavaScript('window.loneXProjects.preview()')
  dialog.showOpenDialog = originalOpenDialog
  assert.equal(source.canApply, true)
  const proposal = await window.webContents.executeJavaScript('window.loneXProjects.proposeFix()')
  assert.match(proposal.diagnosis, /subtracts one/)
  assert.equal(fs.readFileSync(join(projectPath, 'math.cjs'), 'utf8'), source.text)
  const sourceBackup = await window.webContents.executeJavaScript('window.loneXProjects.applySourceEdit(' + JSON.stringify(proposal.replacement) + ')')
  assert.equal(fs.readFileSync(join(projectPath, sourceBackup), 'utf8'), source.text)
  const passed = await runNpm('test')
  assert.equal(passed.outcome, 'Completed', passed.output)
  fs.writeFileSync(join(projectPath, 'start.cjs'), "console.log('Fixture waiting for stop'); setInterval(() => {}, 1000)")
  const stoppedProject = await window.webContents.executeJavaScript(`
    (async () => {
      const unsubscribe = window.loneXProjects.onNpmOutput(chunk => {
        if (chunk.includes('Fixture waiting for stop')) void window.loneXProjects.stopNpm()
      })
      try { return await window.loneXProjects.runNpm('start') } finally { unsubscribe() }
    })()
  `)
  assert.equal(stoppedProject.outcome, 'Stopped', stoppedProject.output)
  dialog.showMessageBox = originalMessageBox
  console.log('Approved npm installation, start, and failing then repaired test passed.')
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
      await waitFor(() => options().length === 4)
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
  const storageFs = require('node:fs')
  const storagePath = require('node:path')
  const storageFolder = storageFs.mkdtempSync(storagePath.join(__dirname, '../node_modules/.storage-smoke-'))
  const storagePicker = dialog.showOpenDialog
  const storageConfirm = dialog.showMessageBox
  const originalTrash = shell.trashItem
  try {
    storageFs.writeFileSync(storagePath.join(storageFolder, 'large.txt'), Buffer.alloc(1024))
    storageFs.writeFileSync(storagePath.join(storageFolder, 'small.txt'), 'small')
    const outside = storageFs.mkdtempSync(storagePath.join(__dirname, '../node_modules/.storage-outside-'))
    try {
      storageFs.writeFileSync(storagePath.join(outside, 'outside.txt'), 'external')
      storageFs.symlinkSync(outside, storagePath.join(storageFolder, 'linked'), 'junction')
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [storageFolder] })
      const scan = await window.webContents.executeJavaScript('window.loneXStorage.scan()')
      assert.equal(scan.files, 2)
      assert.equal(scan.skipped, 1)
      assert.ok(scan.free >= 0 && scan.capacity > 0)
      assert.deepEqual(scan.largest.map(item => item.name), ['large.txt', 'small.txt'])
      assert.ok(scan.largest.every(item => item.removable))
      await assert.rejects(window.webContents.executeJavaScript("window.loneXStorage.trash('../outside.txt')"), /reviewed file/)
      dialog.showMessageBox = async () => ({ response: 0 })
      assert.equal(await window.webContents.executeJavaScript("window.loneXStorage.trash('0')"), false)
      assert.equal(storageFs.existsSync(storagePath.join(storageFolder, 'large.txt')), true)
      storageFs.writeFileSync(storagePath.join(storageFolder, 'large.txt'), 'changed')
      await assert.rejects(window.webContents.executeJavaScript("window.loneXStorage.trash('0')"), /changed/)
      let trashed = 0
      shell.trashItem = async filename => {
        assert.equal(filename, storagePath.join(storageFolder, 'small.txt'))
        storageFs.renameSync(filename, storagePath.join(storageFolder, 'recycled-fixture.txt'))
        trashed++
      }
      dialog.showMessageBox = async () => ({ response: 1 })
      assert.equal(await window.webContents.executeJavaScript("window.loneXStorage.trash('1')"), true)
      assert.equal(trashed, 1)
      await assert.rejects(window.webContents.executeJavaScript("window.loneXStorage.trash('1')"), /reviewed file/)
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [profile] })
      const protectedScan = await window.webContents.executeJavaScript('window.loneXStorage.scan()')
      assert.ok(protectedScan.largest.every(item => !item.removable))
      await assert.rejects(window.webContents.executeJavaScript("window.loneXStorage.trash('0')"), /cannot be removed/)
      dialog.showOpenDialog = async () => {
        await window.webContents.executeJavaScript('window.loneXStorage.stop()')
        return { canceled: false, filePaths: [storageFolder] }
      }
      assert.equal(await window.webContents.executeJavaScript('window.loneXStorage.scan()'), null)
    } finally {
      storageFs.unlinkSync(storagePath.join(storageFolder, 'linked'))
      storageFs.rmSync(outside, { recursive: true, force: true })
    }
  } finally {
    dialog.showOpenDialog = storagePicker
    dialog.showMessageBox = storageConfirm
    shell.trashItem = originalTrash
    storageFs.rmSync(storageFolder, { recursive: true, force: true })
  }
  console.log('Selected-folder storage scan, linked-path protection, cancellation, stale review and approved recycling passed.')
  const agentFixtureBase = storageFs.realpathSync(require('node:os').tmpdir())
  const agentFolder = storageFs.mkdtempSync(storagePath.join(agentFixtureBase, 'lone-x-agent-ipc-'))
  const agentPicker = dialog.showOpenDialog
  const agentConfirm = dialog.showMessageBox
  const originalDesktop = app.getPath('desktop')
  try {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [agentFolder] })
    const selectedAgentFolder = await window.webContents.executeJavaScript('Promise.resolve().then(() => window.loneXAI.chooseAgentFolder()).catch(error => ({ failure: error.message }))')
    assert.equal(selectedAgentFolder, agentFolder, JSON.stringify(selectedAgentFolder))
    console.log('Agent test folder selected.')
    const agentInstall = await window.webContents.executeJavaScript("Promise.resolve().then(() => window.loneXAI.installModel('qwen3:4b-instruct')).catch(error => ({ failure: error.message }))")
    assert.equal(agentInstall, true, JSON.stringify(agentInstall))
    console.log('Agent test model installed.')
    const agentSend = window.webContents.executeJavaScript("Promise.resolve().then(() => window.loneXAI.send({ model: 'qwen3:4b-instruct', text: 'Create hello.txt', chatId: 'agent-fixture', agent: true })).catch(error => ({ failure: error.message }))")
    const agentReviewResult = await window.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 100; i++) {
        const review = document.querySelector('[aria-label="Review agent action"]')
        if (review) {
          if (!review.textContent.includes('Hello from the agent')) throw new Error('Agent change preview is missing')
          const approveButton = [...review.querySelectorAll('button')].find(button => button.textContent === 'Approve create')
          approveButton.click()
          return { ok: true }
        }
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      throw new Error('Agent approval did not appear')
    })().catch(error => ({ failure: error.message }))`)
    assert.equal(agentReviewResult?.failure, undefined, agentReviewResult?.failure)
    const agentHistory = await agentSend
    assert.ok(Array.isArray(agentHistory), JSON.stringify(agentHistory))
    assert.equal(storageFs.readFileSync(storagePath.join(agentFolder, 'hello.txt'), 'utf8'), 'Hello from the agent')
    assert.match(agentHistory.at(-1).content, /File created/)
    await window.webContents.executeJavaScript('window.loneXAI.disconnectAgent()')
    await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.send({ model: 'qwen3:4b-instruct', text: 'Blocked', chatId: 'agent-fixture', agent: true })"), /choose an agent folder/)
    const desktopFolder = storagePath.join(agentFolder, 'Desktop')
    storageFs.mkdirSync(desktopFolder)
    app.setPath('desktop', desktopFolder)
    dialog.showMessageBox = async () => ({ response: 0 })
    assert.equal(await window.webContents.executeJavaScript("window.loneXAI.chooseAgentFolder('desktop')"), null)
    let desktopApprovals = 0
    dialog.showMessageBox = async (_parent, options) => { assert.match(options.detail, /Desktop/); desktopApprovals++; return { response: 1 } }
    const desktopResult = await window.webContents.executeJavaScript(`(async () => {
      const waitFor = async test => { for (let i=0;i<100;i++) { if(test()) return; await new Promise(resolve=>setTimeout(resolve,20)) } throw new Error('Desktop prompt did not complete') }
      const workspace = document.querySelector('.ai-console')
      const draft = workspace.querySelector('textarea')
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(draft), 'value').set.call(draft, 'Create A New text file in Desktop and write "Welcome to LoneX" in it.')
      draft.dispatchEvent(new Event('input', { bubbles: true }))
      await waitFor(()=>!workspace.querySelector('button[aria-label="Send"]').disabled)
      workspace.querySelector('button[aria-label="Send"]').click()
      await waitFor(()=>!!workspace.querySelector('[aria-label="Review agent action"]'))
      const review = workspace.querySelector('[aria-label="Review agent action"]')
      if (!review.textContent.includes('Welcome to LoneX')) throw new Error('Desktop content was not previewed')
      const approve = [...review.querySelectorAll('button')].find(button=>button.textContent==='Approve create')
      approve.click()
      await waitFor(()=>draft.value === '' && workspace.textContent.includes('Created Welcome.txt'))
      return { agentOn: workspace.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed') }
    })().catch(error=>({failure:error.message}))`)
    assert.equal(desktopResult.failure, undefined, desktopResult.failure)
    assert.equal(desktopResult.agentOn, 'true')
    assert.equal(desktopApprovals, 1)
    assert.equal(storageFs.readFileSync(storagePath.join(desktopFolder, 'Welcome.txt'), 'utf8'), 'Welcome to LoneX')
    const thanglishResult = await window.webContents.executeJavaScript(`(async () => {
      const workspace = document.querySelector('.ai-console')
      const waitFor = async test => { for(let i=0;i<100;i++) { if(test())return; await new Promise(resolve=>setTimeout(resolve,20)) } throw new Error('Thanglish prompt did not complete') }
      const disconnect = [...workspace.querySelectorAll('button')].find(button=>button.textContent==='Disconnect')
      disconnect.click()
      await waitFor(()=>workspace.querySelector('.agent-controls button[aria-pressed]')?.getAttribute('aria-pressed')==='false')
      const draft = workspace.querySelector('textarea')
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(draft), 'value').set.call(draft, 'Desktop la oru text file create panni "Vanakkam LoneX" nu ezhuthu.')
      draft.dispatchEvent(new Event('input', { bubbles: true }))
      await waitFor(()=>!workspace.querySelector('button[aria-label="Send"]').disabled)
      workspace.querySelector('button[aria-label="Send"]').click()
      await waitFor(()=>!!workspace.querySelector('[aria-label="Review agent action"]'))
      const review = workspace.querySelector('[aria-label="Review agent action"]')
      if(!review.textContent.includes('Vanakkam LoneX'))throw new Error('Quoted Thanglish text was changed')
      const approve = [...review.querySelectorAll('button')].find(button=>button.textContent==='Approve create')
      approve.click()
      await waitFor(()=>draft.value==='' && workspace.textContent.includes('create panniten'))
      return { completed: true }
    })().catch(error=>({failure:error.message}))`)
    assert.equal(thanglishResult.failure, undefined, thanglishResult.failure)
    assert.equal(desktopApprovals, 2)
    assert.equal(storageFs.readFileSync(storagePath.join(desktopFolder, 'Thanglish.txt'), 'utf8'), 'Vanakkam LoneX')
    dialog.showMessageBox = async () => ({ response: 0 })
    assert.equal(await window.webContents.executeJavaScript("window.loneXAI.chooseAgentFolder('pc')"), null)
    let pcApprovals = 0
    dialog.showMessageBox = async (_parent, options) => { assert.match(options.message, /across this PC/); pcApprovals++; return { response: 1 } }
    pcFixturePath = storagePath.join(agentFolder, 'outside-home.txt')
    const pcResult = await window.webContents.executeJavaScript(`(async () => {
      const workspace = document.querySelector('.ai-console')
      const waitFor = async test => { for(let i=0;i<100;i++) { if(test()) return; await new Promise(resolve=>setTimeout(resolve,20)) } throw new Error('PC-wide action did not complete') }
      const pcButton = [...workspace.querySelectorAll('button')].find(button=>button.textContent==='PC-wide access')
      pcButton.click()
      await waitFor(()=>pcButton.getAttribute('aria-pressed')==='true')
      const draft = workspace.querySelector('textarea')
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(draft), 'value').set.call(draft, 'Create the PC-wide fixture outside my home folder')
      draft.dispatchEvent(new Event('input', { bubbles: true }))
      await waitFor(()=>!workspace.querySelector('button[aria-label="Send"]').disabled)
      workspace.querySelector('button[aria-label="Send"]').click()
      await waitFor(()=>!!workspace.querySelector('[aria-label="Review agent action"]'))
      const review = workspace.querySelector('[aria-label="Review agent action"]')
      if(!review.textContent.includes('outside-home.txt')) throw new Error('Absolute destination not shown for review')
      const approve = [...review.querySelectorAll('button')].find(button=>button.textContent==='Approve create')
      approve.click()
      await waitFor(()=>draft.value==='' && workspace.textContent.includes('Created PC-wide fixture'))
      const disconnect = [...workspace.querySelectorAll('button')].find(button=>button.textContent==='Disconnect')
      disconnect.click()
      await waitFor(()=>pcButton.getAttribute('aria-pressed')==='false')
      return { completed: true }
    })().catch(error=>({failure:error.message}))`)
    assert.equal(pcResult.failure, undefined, pcResult.failure)
    assert.equal(pcApprovals, 1)
    assert.equal(storageFs.readFileSync(pcFixturePath, 'utf8'), 'PC-wide fixture')
    await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.send({ model: 'qwen3:4b-instruct', text: 'Blocked after disconnect', chatId: 'pc-fixture', agent: true })"), /choose an agent folder/)
  } finally {
    dialog.showOpenDialog = agentPicker
    dialog.showMessageBox = agentConfirm
    app.setPath('desktop', originalDesktop)
    assert.equal(storagePath.dirname(storagePath.resolve(agentFolder)), agentFixtureBase)
    storageFs.rmSync(agentFolder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
  console.log('Qwen3 download, Chat agent tool dispatch, rendered change review and approved file creation passed.')
  const quotaDb = new DatabaseSync(require('node:path').join(profile, 'conversation.sqlite'))
  try {
    quotaDb.prepare("UPDATE token_windows SET used = 100000 WHERE id = 'five-hour'").run()
    await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.send({ model: 'qwen2.5-coder:0.5b', text: 'Blocked', chatId: 'fresh-quota-chat' })"), /Token limit reached/)
    await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.plan('Blocked plan')"), /Token limit reached/)
    await window.webContents.executeJavaScript("window.loneXAI.deleteChat('fresh-quota-chat')")
    assert.equal((await window.webContents.executeJavaScript('window.loneXAI.overview()')).limits[0].remaining, 0)
    quotaDb.prepare("UPDATE token_windows SET started_at = ? WHERE id = 'five-hour'").run(Date.now() - 5 * 3600000)
    const reset = await window.webContents.executeJavaScript('window.loneXAI.overview()')
    assert.equal(reset.limits[0].remaining, 100000)
    assert.ok(reset.limits[1].used > 0)
    quotaDb.prepare("UPDATE token_windows SET used = 1000000 WHERE id = 'weekly'").run()
    await assert.rejects(window.webContents.executeJavaScript("window.loneXAI.plan('Blocked by weekly window')"), /Token limit reached/)
    quotaDb.prepare("UPDATE token_windows SET started_at = ? WHERE id = 'weekly'").run(Date.now() - 7 * 86400000)
    assert.ok((await window.webContents.executeJavaScript('window.loneXAI.overview()')).limits.every(item => item.used === 0))
  } finally { quotaDb.close() }
  console.log('Shared token limits block chat and plans, survive chat deletion, and reset independently.')
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
  assert.equal(window.isMaximized(), true)
  console.log('Desktop loaded, theme toggled, primary navigation worked, and renderer Node access was absent.')
}

runSmoke().then(() => {
  resourceServer.close()
  app.exit(0)
}).catch(error => {
  resourceServer.close()
  console.error(error)
  app.exit(1)
})
