// Opt-in real website check. Uses disposable E:-resident browser data, no saved accounts.
const { app, BrowserWindow, dialog } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const base = path.resolve(__dirname, '../test-artifacts')
const profile = path.join(base, 'browser-live-' + Date.now())
app.setPath('userData', profile)
app.commandLine.appendSwitch('disable-gpu')
app.whenReady().then(async () => {
  if (process.env.LONEX_BROWSER_LIVE !== '1') throw new Error('Set LONEX_BROWSER_LIVE=1 for the Google/YouTube navigation check.')
  const renderer = path.join(profile, 'fixture.html')
  await fs.mkdir(profile, { recursive: true })
  await fs.writeFile(renderer, '<!doctype html><title>Browser live check</title>')
  const owner = new BrowserWindow({ show: false, webPreferences: { preload: path.resolve(__dirname, '../desktop/preload.cjs'), contextIsolation: true, sandbox: true } })
  // Approval is automated only in this opt-in harness for these two public sites.
  dialog.showMessageBox = async (_window, options) => {
    assert.match(options.detail, /^https:\/\/(google|youtube)\.com\//)
    return { response: 1 }
  }
  require('../desktop/browser.cjs').registerBrowser(renderer, () => {})
  await owner.loadFile(renderer)
  const results = []
  for (const domain of ['google.com', 'youtube.com']) {
    let result = await owner.webContents.executeJavaScript('window.loneXBrowser.open(' + JSON.stringify(domain) + ')')
    const deadline = Date.now() + 20000
    while (result.status === 'Loading' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 250))
      result = await owner.webContents.executeJavaScript('window.loneXBrowser.status()')
    }
    const browser = BrowserWindow.getAllWindows().find(window => window !== owner)
    const title = await browser.webContents.executeJavaScript('document.title')
    results.push({ domain, ...result, title })
    await owner.webContents.executeJavaScript('window.loneXBrowser.close()')
  }
  await fs.writeFile(path.join(base, 'browser-live-results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
  assert.ok(results.every(item => item.status === 'Ready' && item.title.trim()), 'A website did not finish loading; see browser-live-results.json')
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
setTimeout(() => { console.error('Live browser check exceeded 90 seconds.'); app.exit(1) }, 90000).unref()
