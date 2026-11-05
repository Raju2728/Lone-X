const { BrowserWindow, dialog, ipcMain, session } = require('electron')
const { randomUUID } = require('node:crypto')
const { fileURLToPath } = require('node:url')

function approvedAddress(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter an HTTPS website address.')
  let url
  try { url = new URL(value) } catch { throw new Error('Enter a complete HTTPS website address.') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS address without embedded credentials.')
  return url
}

function registerBrowser(rendererPath, requireAccount) {
  const workspaces = new Map()
  const approvals = new Map()

  function handle(name, action) {
    ipcMain.handle('browser:' + name, (event, input) => {
      const url = new URL(event.senderFrame?.url || 'about:blank')
      if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
        throw new Error('Invalid browser request origin.')
      }
      requireAccount(event.sender)
      return action(event.sender, input)
    })
  }

  function state(sender) {
    const approval = approvals.get(sender)
    if (approval) return { status: approval.cancelled ? 'Stopped' : 'Awaiting approval', url: approval.url }
    const current = workspaces.get(sender)
    const contents = current?.window && !current.window.isDestroyed() ? current.window.webContents : null
    const history = contents?.navigationHistory
    return { status: current?.status ?? 'Closed', url: current?.url ?? '',
      canGoBack: !!history && history.getActiveIndex() > 0,
      canGoForward: !!history && history.getActiveIndex() + 1 < history.length() }
  }

  handle('status', state)
  handle('navigate', (sender, action) => {
    if (!['back', 'forward', 'reload'].includes(action)) throw new Error('Choose Back, Forward or Reload.')
    if (approvals.has(sender)) throw new Error('Finish or cancel the pending browser approval first.')
    const current = workspaces.get(sender)
    if (!current?.window || current.window.isDestroyed()) throw new Error('Open an approved website first.')
    const contents = current.window.webContents
    if (contents.isLoading()) throw new Error('Stop or finish page loading first.')
    const history = contents.navigationHistory
    const offset = action === 'back' ? -1 : action === 'forward' ? 1 : 0
    const index = history.getActiveIndex() + offset
    if (offset && (index < 0 || index >= history.length())) throw new Error('No page is available in that direction.')
    const destination = offset ? history.getEntryAtIndex(index)?.url : contents.getURL()
    if (!destination || approvedAddress(destination).origin !== current.origin) throw new Error('Navigation is outside the approved website.')
    current.cancelled = false
    current.status = 'Loading'
    if (offset) history.goToIndex(index)
    else contents.reload()
    return state(sender)
  })
  handle('stop', sender => {
    const approval = approvals.get(sender)
    if (approval) {
      approval.cancelled = true
      return
    }
    const current = workspaces.get(sender)
    if (!current) return
    current.cancelled = true
    current.status = 'Stopped'
    current.window?.webContents.stop()
  })
  handle('close', sender => {
    const approval = approvals.get(sender)
    if (approval) approval.cancelled = true
    const current = workspaces.get(sender)
    if (current?.window && !current.window.isDestroyed()) current.window.close()
  })

  handle('open', async (sender, value) => {
    const target = approvedAddress(value)
    const previous = workspaces.get(sender)
    if (approvals.has(sender) || previous?.status === 'Loading') {
      throw new Error('Stop or finish the current browser request first.')
    }
    const current = { status: 'Awaiting approval', url: target.href, origin: target.origin, cancelled: false, window: null }
    const parent = BrowserWindow.fromWebContents(sender)
    if (!parent) throw new Error('The desktop window is unavailable.')
    approvals.set(sender, current)
    let choice
    try { choice = await dialog.showMessageBox(parent, {
      type: 'question', buttons: ['Cancel', 'Open website'], defaultId: 0, cancelId: 0,
      message: 'Open this website in the Lone X browser?',
      detail: target.href + '\n\nThe site receives normal browser requests. Navigation stays within ' + target.origin +
        '. Open another origin through this approval screen. Browser data is kept in a separate temporary session.'
    }) } finally { approvals.delete(sender) }
    if (choice.response !== 1 || current.cancelled || sender.isDestroyed()) {
      return { status: 'Cancelled', url: target.href }
    }
    requireAccount(sender)
    if (previous?.window && !previous.window.isDestroyed()) previous.window.close()
    const browserSession = session.fromPartition('lone-x-browser-' + randomUUID(), { cache: false })
    browserSession.setPermissionCheckHandler(() => false)
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    browserSession.on('will-download', event => {
      event.preventDefault()
      current.status = 'Download blocked'
    })
    const title = 'Lone X browser · ' + target.origin
    const browser = new BrowserWindow({
      parent, title, width: 1000, height: 740,
      webPreferences: { session: browserSession, sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false, webSecurity: true, navigateOnDragDrop: false }
    })
    current.window = browser
    current.status = 'Loading'
    workspaces.set(sender, current)
    browser.setMenu(null)
    browser.on('page-title-updated', event => event.preventDefault())
    const contents = browser.webContents
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    function guard(event, destination) {
      let allowed = false
      try { allowed = approvedAddress(destination).origin === target.origin } catch {}
      if (!allowed) {
        event.preventDefault()
        current.status = 'Navigation blocked'
      }
    }
    contents.on('will-navigate', guard)
    contents.on('will-redirect', guard)
    contents.on('will-attach-webview', event => event.preventDefault())
    contents.on('did-start-loading', () => { current.status = 'Loading'; current.cancelled = false; current.responseError = null })
    contents.on('did-navigate', (_event, url, status) => {
      current.url = url
      if (status >= 400) current.responseError = 'Website returned HTTP ' + status
    })
    contents.on('did-navigate-in-page', (_event, url, mainFrame) => {
      if (mainFrame) current.url = url
    })
    contents.on('render-process-gone', () => { current.status = 'Browser process ended. Close and reopen the website.' })
    contents.on('did-finish-load', () => {
      current.url = contents.getURL()
      if (!current.cancelled) current.status = current.responseError ?? 'Ready'
    })
    contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3 && !current.cancelled) current.status = 'Page failed to load'
    })
    const close = () => { if (!browser.isDestroyed()) browser.close() }
    sender.once('destroyed', close)
    browser.on('closed', () => {
      current.status = 'Closed'
      sender.removeListener('destroyed', close)
      void browserSession.clearStorageData().catch(() => {})
      if (workspaces.get(sender) === current) workspaces.delete(sender)
    })
    try {
      await contents.loadURL(target.href)
    } catch {
      if (current.cancelled) current.status = 'Stopped'
      else if (current.status !== 'Navigation blocked') current.status = 'Page failed to load'
    }
    return state(sender)
  })
}

module.exports = { registerBrowser }
