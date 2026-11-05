// Lone X defaults, independent of OpenAI subscription allowances.
const windows = [
  { id: 'five-hour', label: 'Five-hour', duration: 5 * 60 * 60 * 1000, limit: 100000 },
  { id: 'weekly', label: 'Weekly', duration: 7 * 24 * 60 * 60 * 1000, limit: 1000000 }
]

function tokenLimits(db, clock = Date.now) {
  db.exec(`CREATE TABLE IF NOT EXISTS token_windows (
    id TEXT PRIMARY KEY, started_at INTEGER, used INTEGER NOT NULL DEFAULT 0,
    estimated INTEGER NOT NULL DEFAULT 0
  )`)
  for (const window of windows) db.prepare('INSERT OR IGNORE INTO token_windows(id) VALUES (?)').run(window.id)
  const read = db.prepare('SELECT * FROM token_windows WHERE id = ?')
  const reset = db.prepare('UPDATE token_windows SET started_at = NULL, used = 0, estimated = 0 WHERE id = ?')
  const start = db.prepare('UPDATE token_windows SET started_at = ? WHERE id = ?')
  const add = db.prepare('UPDATE token_windows SET used = used + ?, estimated = estimated + ? WHERE id = ? AND started_at = ?')
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE')
    try { const result = action(); db.exec('COMMIT'); return result }
    catch (error) { db.exec('ROLLBACK'); throw error }
  }
  function current(now) {
    return windows.map(window => {
      let row = read.get(window.id)
      if (row.started_at !== null && now >= row.started_at + window.duration) {
        reset.run(window.id)
        row = read.get(window.id)
      }
      return { id: window.id, label: window.label, limit: window.limit, used: row.used,
        remaining: Math.max(0, window.limit - row.used), estimated: row.estimated > 0,
        resetsAt: row.started_at === null ? null : row.started_at + window.duration }
    })
  }
  return {
    status: () => transaction(() => current(clock())),
    begin() {
      const slots = transaction(() => {
        const now = clock()
        const state = current(now)
        const exhausted = state.filter(window => window.remaining === 0)
        if (exhausted.length) {
          const resetAt = Math.max(...exhausted.map(window => window.resetsAt))
          throw new Error('Token limit reached. AI requests resume after ' + new Date(resetAt).toISOString() + '.')
        }
        return state.map(window => {
          const startedAt = window.resetsAt === null ? now : window.resetsAt - windows.find(item => item.id === window.id).duration
          if (window.resetsAt === null) start.run(startedAt, window.id)
          return { id: window.id, startedAt }
        })
      })
      let settled = false
      return (tokens, estimated = false) => {
        if (settled) return
        if (!Number.isSafeInteger(tokens) || tokens < 0) throw new Error('Invalid token usage.')
        transaction(() => {
          for (const slot of slots) add.run(tokens, estimated ? 1 : 0, slot.id, slot.startedAt)
        })
        settled = true
      }
    }
  }
}

module.exports = { tokenLimits, windows }
