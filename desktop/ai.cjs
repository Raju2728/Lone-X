const { DatabaseSync } = require('node:sqlite')
const { fileURLToPath } = require('node:url')
const path = require('node:path')
const { ipcMain } = require('electron')

const ollama = 'http://127.0.0.1:11434'
const openAI = 'https://api.openai.com/v1/responses'

async function* readLines(body) {
  const decoder = new TextDecoder()
  let pending = ''
  for await (const chunk of body) {
    pending += decoder.decode(chunk, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop()
    for (const line of lines) yield line.trimEnd()
  }
  pending += decoder.decode()
  if (pending.trim()) yield pending.trimEnd()
}

async function streamReply(provider, model, messages, onDelta, signal, request = fetch) {
  const cloud = provider === 'openai'
  const key = process.env.OPENAI_API_KEY
  if (cloud && !key) throw new Error('Set OPENAI_API_KEY before launching Lone X to use OpenAI.')
  const headers = { 'Content-Type': 'application/json' }
  if (cloud) headers.Authorization = 'Bearer ' + key
  const response = await request(cloud ? openAI : ollama + '/api/chat', {
    method: 'POST', headers, signal, redirect: 'error',
    body: JSON.stringify(cloud
      ? { model, input: messages, stream: true, store: false, max_output_tokens: 4096 }
      : { model, messages, stream: true, options: { num_predict: 4096 } })
  }).catch(() => { throw new Error(cloud ? 'Could not reach OpenAI.' : 'Could not reach Ollama. Start it on this PC and try again.') })
  if (!response.ok || !response.body) throw new Error((cloud ? 'OpenAI' : 'Ollama') + ' returned HTTP ' + response.status + '. Check the selected model and provider settings.')
  let complete = false
  for await (const line of readLines(response.body)) {
    if (!line || (cloud && !line.startsWith('data:'))) continue
    const data = cloud ? line.slice(5).trim() : line
    if (data === '[DONE]') break
    const event = JSON.parse(data)
    if (event.error || ['error', 'response.failed', 'response.incomplete'].includes(event.type)) {
      throw new Error('The AI provider could not finish its response.')
    }
    const delta = cloud ? (event.type === 'response.output_text.delta' ? event.delta : '') : event.message?.content
    if (typeof delta === 'string' && delta) onDelta(delta)
    if (cloud ? event.type === 'response.completed' : event.done === true) {
      complete = true
      break
    }
  }
  if (!complete) throw new Error('The response stream ended before completion.')
}

function registerAI(app, rendererPath) {
  const db = new DatabaseSync(path.join(app.getPath('userData'), 'conversation.sqlite'))
  db.exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL)')
  const list = db.prepare('SELECT role, content FROM messages ORDER BY id')
  const recent = db.prepare('SELECT role, content FROM (SELECT * FROM messages ORDER BY id DESC LIMIT 30) ORDER BY id')
  const insert = db.prepare('INSERT INTO messages(role, content) VALUES (?, ?)')
  let active = false

  function handle(channel, action) {
    ipcMain.handle('ai:' + channel, (event, input) => {
      const url = new URL(event.senderFrame?.url || 'about:blank')
      if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
        throw new Error('Invalid AI request origin.')
      }
      return action(event, input)
    })
  }

  handle('history', () => list.all())
  handle('models', async () => {
    try {
      const response = await fetch(ollama + '/api/tags', { redirect: 'error', signal: AbortSignal.timeout(4000) })
      if (!response.ok) throw new Error()
      const { models } = await response.json()
      return models.map(model => model.name).filter(name => typeof name === 'string')
    } catch {
      throw new Error('Ollama is unavailable. Start it locally and refresh the model list.')
    }
  })

  handle('send', async (event, input) => {
    const { provider, model, text } = input ?? {}
    if (!['ollama', 'openai'].includes(provider) || typeof model !== 'string' || !model.trim() || model.length > 200 ||
        typeof text !== 'string' || !text.trim() || text.length > 16000) throw new Error('Enter a model and an instruction of up to 16,000 characters.')
    if (active) throw new Error('Wait for the current response.')
    active = true
    const messages = [...recent.all(), { role: 'user', content: text }]
    let reply = ''
    try {
      await streamReply(provider, model.trim(), messages, delta => {
        reply += delta
        if (!event.sender.isDestroyed()) event.sender.send('ai:delta', delta)
      }, AbortSignal.timeout(180000))
      if (!reply.trim()) throw new Error('The selected model returned no text.')
      db.exec('BEGIN')
      try {
        insert.run('user', text)
        insert.run('assistant', reply)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return [{ role: 'user', content: text }, { role: 'assistant', content: reply }]
    } finally {
      active = false
    }
  })
}

module.exports = { registerAI, streamReply }
