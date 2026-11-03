const { DatabaseSync } = require('node:sqlite')
const { fileURLToPath } = require('node:url')
const path = require('node:path')
const { ipcMain } = require('electron')
const { localRuntime } = require('./ollama-runtime.cjs')

const retentionMs = 30 * 24 * 60 * 60 * 1000
const ollama = 'http://127.0.0.1:11434'

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

async function streamReply(model, messages, onDelta, signal, request = fetch, endpoint = ollama) {
  const response = await request(endpoint + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, redirect: 'error',
    body: JSON.stringify({ model, messages, stream: true, options: { num_predict: 4096 } })
  }).catch(() => { throw new Error('Could not reach Ollama. Start it on this PC and try again.') })
  if (!response.ok || !response.body) throw new Error('Ollama returned HTTP ' + response.status + '. Check the selected model.')
  let complete = false
  for await (const line of readLines(response.body)) {
    if (!line) continue
    const event = JSON.parse(line)
    if (event.error) throw new Error('Ollama could not finish its response.')
    const delta = event.message?.content
    if (typeof delta === 'string' && delta) onDelta(delta)
    if (event.done === true) {
      complete = true
      break
    }
  }
  if (!complete) throw new Error('The response stream ended before completion.')
}

function registerAI(app, rendererPath, requireAccount) {
  const runtime = localRuntime(app)
  const db = new DatabaseSync(path.join(app.getPath('userData'), 'conversation.sqlite'))
  db.exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)')
  db.exec('BEGIN IMMEDIATE')
  try {
    if (!db.prepare('PRAGMA table_info(messages)').all().some(column => column.name === 'created_at')) {
      db.exec('ALTER TABLE messages ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0')
      db.prepare('UPDATE messages SET created_at = ?').run(Date.now())
    }
    if (!db.prepare('PRAGMA table_info(messages)').all().some(column => column.name === 'chat_id')) {
      db.exec("ALTER TABLE messages ADD COLUMN chat_id TEXT NOT NULL DEFAULT 'default'")
    }
    db.exec('CREATE INDEX IF NOT EXISTS messages_created_at ON messages(created_at)')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  const deleteExpired = db.prepare('DELETE FROM messages WHERE created_at <= ?')
  const prune = () => deleteExpired.run(Date.now() - retentionMs)
  prune()
  const cleanup = setInterval(prune, 60 * 60 * 1000)
  cleanup.unref()
  app.once('will-quit', () => {
    clearInterval(cleanup)
  })

  const list = db.prepare('SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id')
  const recent = db.prepare('SELECT role, content FROM (SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 30) ORDER BY id')
  const insert = db.prepare('INSERT INTO messages(role, content, created_at, chat_id) VALUES (?, ?, ?, ?)')
  const conversations = db.prepare(`
    SELECT first.chat_id AS id, substr(first.content, 1, 100) AS title, last.updated_at AS updatedAt
    FROM (SELECT chat_id, min(id) AS first_id, max(created_at) AS updated_at
      FROM messages WHERE role = 'user' GROUP BY chat_id) last
    JOIN messages first ON first.id = last.first_id
    ORDER BY last.updated_at DESC, first.id DESC
  `)
  let active


  function handle(channel, action) {
    ipcMain.handle('ai:' + channel, (event, input) => {
      const url = new URL(event.senderFrame?.url || 'about:blank')
      if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
        throw new Error('Invalid AI request origin.')
      }
      requireAccount(event.sender)
      return action(event, input)
    })
  }

  function chatId(id = 'default') {
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id)) throw new Error('Invalid chat ID.')
    return id
  }

  handle('history', (_event, id) => {
    prune()
    return list.all(chatId(id))
  })
  handle('conversations', () => {
    prune()
    return conversations.all()
  })
  handle('stop', event => {
    if (active?.sender === event.sender) active.controller.abort()
  })
  handle('models', async () => {
    try {
      const response = await fetch((await runtime()) + '/api/tags', { redirect: 'error', signal: AbortSignal.timeout(4000) })
      if (!response.ok) throw new Error()
      const { models } = await response.json()
      return models.map(model => model.name).filter(name => typeof name === 'string')
    } catch {
      throw new Error('Ollama is unavailable. Start it locally and refresh the model list.')
    }
  })

  handle('send', async (event, input) => {
    const { model, text } = input ?? {}
    const id = chatId(input?.chatId)
    if (typeof model !== 'string' || !model.trim() || model.length > 200 ||
        typeof text !== 'string' || !text.trim() || text.length > 16000) throw new Error('Enter a model and an instruction of up to 16,000 characters.')
    if (active) throw new Error('Wait for the current response.')
    prune()
    const controller = new AbortController()
    active = { sender: event.sender, controller }
    const messages = [...recent.all(id), { role: 'user', content: text }]
    let reply = ''
    try {
      const endpoint = await runtime()
      controller.signal.throwIfAborted()
      await streamReply(model.trim(), messages, delta => {
        reply += delta
        if (!event.sender.isDestroyed()) event.sender.send('ai:delta', delta)
      }, AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]), fetch, endpoint)
      controller.signal.throwIfAborted()
      if (!reply.trim()) throw new Error('The selected model returned no text.')
      db.exec('BEGIN')
      try {
        const now = Date.now()
        insert.run('user', text, now, id)
        insert.run('assistant', reply, now, id)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return list.all(id)
    } catch (error) {
      if (controller.signal.aborted) return null
      throw error
    } finally {
      active = undefined
    }
  })
}

module.exports = { registerAI, streamReply }
