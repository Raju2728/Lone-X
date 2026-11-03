const assert = require('node:assert/strict')
const { app, BrowserWindow } = require('electron')

const profile = require('node:fs').mkdtempSync(require('node:path').join(__dirname, '../node_modules/.lone-x-smoke-'))
app.setPath('userData', profile)
process.env.OPENAI_API_KEY = 'smoke-test-key'
global.fetch = (url, options) => {
  if (url === 'http://127.0.0.1:11434/api/tags') {
    return Promise.resolve(Response.json({ models: [{ name: 'smoke-model' }] }))
  }
  if (url === 'http://127.0.0.1:11434/api/chat') {
    assert.equal(JSON.parse(options.body).model, 'smoke-model')
    return Promise.resolve(new Response([
      JSON.stringify({ message: { content: 'Smoke ' } }),
      JSON.stringify({ message: { content: 'response' }, done: true })
    ].join('\n')))
  }
  if (url === 'https://api.openai.com/v1/responses') {
    const body = JSON.parse(options.body)
    assert.equal(body.store, false)
    assert.equal(options.headers.Authorization, 'Bearer smoke-test-key')
    if (body.model === 'error-model') return Promise.resolve(new Response('', { status: 404 }))
    assert.equal(body.model, 'cloud-model')
    assert.equal(body.input.at(-1).content, 'Cloud instruction')
    return Promise.resolve(new Response([
      'data: {"type":"response.output_text.delta","delta":"Cloud response"}',
      'data: {"type":"response.completed"}'
    ].join('\n\n')))
  }
  throw new Error('Unexpected provider endpoint in smoke test')
}
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
      const input = workspace.querySelector('input')
      const draft = workspace.querySelector('textarea')
      const select = workspace.querySelector('select')
      const fill = (element, text) => {
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, text)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
      const send = async (model, text) => {
        fill(input, model)
        fill(draft, text)
        const button = () => buttons().find(item => item.textContent === 'Send instruction')
        await waitFor(() => button() && !button().disabled)
        button().click()
      }
      buttons().find(button => button.textContent === 'Find models').click()
      await waitFor(() => workspace.querySelector('datalist option[value="smoke-model"]'))
      await send('smoke-model', 'Local instruction')
      await waitFor(() => workspace.textContent.includes('Smoke response') && !draft.value)
      select.value = 'openai'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await waitFor(() => input.placeholder === 'OpenAI model ID')
      await send('error-model', 'Retry this instruction')
      await waitFor(() => workspace.querySelector('[role=alert]')?.textContent.includes('HTTP 404'))
      const retainedDraft = draft.value
      await send('cloud-model', 'Cloud instruction')
      await waitFor(() => workspace.textContent.includes('Cloud response') && !draft.value)
      return { retainedDraft, history: await window.loneXAI.history() }
    })()
  `)
  assert.equal(chat.retainedDraft, 'Retry this instruction')
  assert.deepEqual(chat.history, [
    { role: 'user', content: 'Local instruction' },
    { role: 'assistant', content: 'Smoke response' },
    { role: 'user', content: 'Cloud instruction' },
    { role: 'assistant', content: 'Cloud response' }
  ])
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(require('node:path').join(profile, 'conversation.sqlite'), { readOnly: true })
  try {
    const rows = db.prepare('SELECT role, content FROM messages ORDER BY id').all()
    assert.deepEqual(rows.map(row => ({ ...row })), chat.history)
  } finally {
    db.close()
  }
  console.log('Chat UI provider switching, Ollama discovery, both streams, retry, and SQLite storage passed.')
  console.log('Desktop loaded, theme toggled, seven navigation targets worked, and renderer Node access was absent.')
  app.exit(0)
}).catch(error => {
  console.error(error)
  app.exit(1)
})
