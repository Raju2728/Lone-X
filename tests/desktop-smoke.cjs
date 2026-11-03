const assert = require('node:assert/strict')
const { app, BrowserWindow } = require('electron')

const profile = require('node:path').join(__dirname, '../node_modules/.lone-x-smoke')
require('node:fs').mkdirSync(profile, { recursive: true })
app.setPath('userData', profile)
require('../desktop/main.cjs')

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
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const heading = () => document.querySelector('h1')?.textContent
      const wait = () => new Promise(resolve => setTimeout(resolve, 75))
      await wait()
      const initial = heading()
      const start = document.documentElement.dataset.theme
      document.querySelector('.work [role=switch]').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
      await wait()
      const changed = document.documentElement.dataset.theme
      const sections = []
      for (const button of document.querySelectorAll('aside nav button')) {
        button.click()
        await wait()
        sections.push(heading())
      }
      const storedTheme = localStorage.getItem('lone-x-theme')
      return { initial, start, changed, storedTheme, sections, nodeExposed: typeof require !== 'undefined' }
    })()
  `)
  assert.equal(result.initial, 'Overview')
  assert.ok(['light', 'dark'].includes(result.start))
  assert.equal(result.changed, result.start === 'light' ? 'dark' : 'light')
  assert.equal(result.storedTheme, result.changed)
  assert.deepEqual(result.sections, ['Overview', 'AI workspace', 'Projects', 'Task monitor', 'Terminal', 'Activity', 'Settings'])
  assert.equal(result.nodeExposed, false)
  console.log('Desktop loaded, theme toggled, seven navigation targets worked, and renderer Node access was absent.')
  app.exit(0)
}).catch(error => {
  console.error(error)
  app.exit(1)
})





