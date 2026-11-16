const { ipcMain } = require('electron')
const storage = require('./protected-storage.cjs')
const { DatabaseSync } = require('node:sqlite')
const { fileURLToPath } = require('node:url')
const path = require('node:path')
const policy = require('./legal-documents.json')

async function registerLegal(app, rendererPath) {
  const db = new DatabaseSync(path.join(app.getPath('userData'), 'legal.sqlite'))
  db.exec('CREATE TABLE IF NOT EXISTS consent (revision INTEGER PRIMARY KEY, receipt BLOB NOT NULL)')
  const read = db.prepare('SELECT receipt FROM consent WHERE revision = ?')
  const write = db.prepare('INSERT OR REPLACE INTO consent (revision, receipt) VALUES (?, ?)')
  const versions = Object.fromEntries(Object.entries(policy.documents).map(([id, document]) => [id, document.version]))
  let validated = null

  async function acceptedReceipt() {
    const row = read.get(policy.consentRevision)
    if (!row) { validated = null; return null }
    if (validated && Buffer.from(row.receipt).equals(validated.bytes)) return validated.receipt
    validated = null
    try {
      const decrypted = await storage.decrypt(row.receipt)
      const receipt = JSON.parse(decrypted.text)
      if (receipt.revision !== policy.consentRevision || !Number.isFinite(Date.parse(receipt.acceptedAt)) ||
          !Object.keys(versions).every(id => receipt.versions?.[id] === versions[id])) return null
      const bytes = decrypted.replacement ?? Buffer.from(row.receipt)
      if (decrypted.replacement) write.run(policy.consentRevision, bytes)
      validated = { receipt, bytes }
      return receipt
    } catch {
      return null
    }
  }

  function handle(name, action) {
    ipcMain.handle('legal:' + name, (event, input) => {
      const url = new URL(event.senderFrame?.url || 'about:blank')
      if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
        throw new Error('Invalid legal request origin.')
      }
      return action(input)
    })
  }

  handle('status', acceptedReceipt)
  handle('accept', async input => {
    if (input?.revision !== policy.consentRevision || !Object.keys(versions).every(id =>
      input.versions?.[id] === versions[id] && input.agreements?.[id] === true)) {
      throw new Error('Review and accept the current agreements before continuing.')
    }
    const existing = await acceptedReceipt()
    if (existing) return existing
    const receipt = { revision: policy.consentRevision, versions, acceptedAt: new Date().toISOString() }
    const bytes = await storage.encrypt(JSON.stringify(receipt))
    write.run(policy.consentRevision, bytes)
    validated = { receipt, bytes }
    return receipt
  })

  await acceptedReceipt()
  return () => {
    const row = read.get(policy.consentRevision)
    if (!validated || !row || !Buffer.from(row.receipt).equals(validated.bytes)) throw new Error('Accept the Lone X legal agreements first.')
  }
}

module.exports = { registerLegal }
