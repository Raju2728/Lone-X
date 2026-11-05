const { ipcMain, safeStorage } = require('electron')
const { DatabaseSync } = require('node:sqlite')
const { fileURLToPath } = require('node:url')
const path = require('node:path')
const policy = require('./legal-documents.json')

function registerLegal(app, rendererPath) {
  const db = new DatabaseSync(path.join(app.getPath('userData'), 'legal.sqlite'))
  db.exec('CREATE TABLE IF NOT EXISTS consent (revision INTEGER PRIMARY KEY, receipt BLOB NOT NULL)')
  const read = db.prepare('SELECT receipt FROM consent WHERE revision = ?')
  const write = db.prepare('INSERT OR REPLACE INTO consent (revision, receipt) VALUES (?, ?)')
  const versions = Object.fromEntries(Object.entries(policy.documents).map(([id, document]) => [id, document.version]))
  const canEncrypt = () => safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')

  function acceptedReceipt() {
    if (!canEncrypt()) return null
    const row = read.get(policy.consentRevision)
    if (!row) return null
    try {
      const receipt = JSON.parse(safeStorage.decryptString(Buffer.from(row.receipt)))
      if (receipt.revision !== policy.consentRevision || !Number.isFinite(Date.parse(receipt.acceptedAt)) ||
          !Object.keys(versions).every(id => receipt.versions?.[id] === versions[id])) return null
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
  handle('accept', input => {
    if (input?.revision !== policy.consentRevision || !Object.keys(versions).every(id =>
      input.versions?.[id] === versions[id] && input.agreements?.[id] === true)) {
      throw new Error('Review and accept the current agreements before continuing.')
    }
    if (!canEncrypt()) throw new Error('Protected storage is unavailable. Lone X could not record your acceptance securely.')
    const existing = acceptedReceipt()
    if (existing) return existing
    const receipt = { revision: policy.consentRevision, versions, acceptedAt: new Date().toISOString() }
    write.run(policy.consentRevision, safeStorage.encryptString(JSON.stringify(receipt)))
    return receipt
  })

  return () => {
    if (!acceptedReceipt()) throw new Error('Accept the Lone X legal agreements first.')
  }
}

module.exports = { registerLegal }
