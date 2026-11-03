const { ipcMain, safeStorage } = require('electron')
const { DatabaseSync } = require('node:sqlite')
const { randomBytes, randomInt, scryptSync, timingSafeEqual } = require('node:crypto')
const { fileURLToPath } = require('node:url')
const path = require('node:path')
const { readFileSync } = require('node:fs')
const nodemailer = require('nodemailer')

function registerAccount(app, rendererPath) {
  const db = new DatabaseSync(path.join(app.getPath('userData'), 'account.sqlite'))
  db.exec('CREATE TABLE IF NOT EXISTS account (id INTEGER PRIMARY KEY CHECK (id = 1), email TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL)')
  db.exec('CREATE TABLE IF NOT EXISTS update_notice (revision TEXT PRIMARY KEY)')
  let revision
  try { revision = JSON.parse(readFileSync(path.join(__dirname, '../build-info.json'), 'utf8')).revision } catch {}
  let checking = false
  const read = db.prepare('SELECT email, salt, hash FROM account WHERE id = 1')
  const sessionDuration = 3 * 24 * 60 * 60 * 1000
  db.exec('CREATE TABLE IF NOT EXISTS login_session (id INTEGER PRIMARY KEY CHECK (id = 1), encrypted BLOB NOT NULL)')
  const clearSession = db.prepare('DELETE FROM login_session WHERE id = 1')
  let expiresAt = 0
  const saved = db.prepare('SELECT encrypted FROM login_session WHERE id = 1').get()
  if (saved && read.get() && safeStorage.isEncryptionAvailable()) {
    try {
      const expiry = Number(safeStorage.decryptString(Buffer.from(saved.encrypted)))
      const now = Date.now()
      if (Number.isSafeInteger(expiry) && expiry > now && expiry <= now + sessionDuration) expiresAt = expiry
    } catch {
      // Invalid session data requires a new sign-in.
    }
  }
  if (!expiresAt) clearSession.run()

  function beginSession() {
    expiresAt = Date.now() + sessionDuration
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(String(expiresAt))
      db.prepare('INSERT OR REPLACE INTO login_session VALUES (1, ?)').run(encrypted)
    }
  }
  let reset = null
  let nextAttempt = 0
  let nextReset = 0

  const smtp = process.env.LONEX_SMTP_HOST && process.env.LONEX_SMTP_USER && process.env.LONEX_SMTP_PASSWORD
    ? nodemailer.createTransport({
      host: process.env.LONEX_SMTP_HOST,
      port: Number(process.env.LONEX_SMTP_PORT || 465),
      secure: Number(process.env.LONEX_SMTP_PORT || 465) === 465,
      requireTLS: true,
      auth: { user: process.env.LONEX_SMTP_USER, pass: process.env.LONEX_SMTP_PASSWORD },
      connectionTimeout: 10000,
      socketTimeout: 15000
    })
    : null

  async function mail(to, subject, text) {
    if (!smtp) throw new Error('Email is unavailable. Configure the local SMTP settings first.')
    try {
      await smtp.sendMail({ from: process.env.LONEX_SMTP_FROM || process.env.LONEX_SMTP_USER, to, subject, text })
    } catch {
      throw new Error('Lone X could not send the email. Check the local SMTP settings.')
    }
  }

  async function notifyUpdate(email) {
    if (!smtp || !/^[a-f0-9]{40}$/.test(revision ?? '') || checking) return
    checking = true
    try {
      const response = await fetch('https://api.github.com/repos/Raju2728/Lone-X/releases/tags/desktop-preview', {
        redirect: 'error', signal: AbortSignal.timeout(8000)
      })
      if (!response.ok) return
      const release = await response.json()
      const asset = release.assets?.find(item => item.name === 'Lone-X-Windows.zip')
      const latest = /^build:([a-f0-9]{40})$/.exec(asset?.label ?? '')?.[1]
      if (!latest || latest === revision || db.prepare('SELECT 1 FROM update_notice WHERE revision = ?').get(latest)) return
      await mail(email, 'Lone X update available', 'A newer Windows preview is available at https://lone-x.vercel.app/#download')
      db.prepare('INSERT OR IGNORE INTO update_notice VALUES (?)').run(latest)
    } catch {
      // An unavailable release feed or SMTP server must not block sign-in.
    } finally {
      checking = false
    }
  }

  function handle(action, callback) {
    ipcMain.handle('account:' + action, (event, value) => {
      const url = new URL(event.senderFrame?.url || 'about:blank')
      if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
        throw new Error('Invalid account request origin.')
      }
      return callback(event.sender, value)
    })
  }

  function credentials(input) {
    const { email, password } = input ?? {}
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== 'string' || password.length < 8 || password.length > 256) {
      throw new Error('Enter a valid email and a password of 8 to 256 characters.')
    }
    return { email: email.trim().toLowerCase(), password }
  }

  function derive(password, salt) {
    return scryptSync(password, salt, 64)
  }

  function newPassword(password) {
    const salt = randomBytes(16).toString('hex')
    return [salt, derive(password, salt).toString('hex')]
  }

  handle('status', () => ({ exists: !!read.get(), signedIn: expiresAt > Date.now(), emailReady: !!smtp }))
  handle('create', async (_sender, input) => {
    const { email, password } = credentials(input)
    if (read.get()) throw new Error('This Windows profile already has a Lone X account.')
    db.prepare('INSERT INTO account VALUES (1, ?, ?, ?)').run(email, ...newPassword(password))
    beginSession()
    void notifyUpdate(email)
    if (!smtp) return { emailSent: false }
    try {
      await mail(email, 'Lone X account created', 'Your local Lone X account was created on this PC.')
      return { emailSent: true }
    } catch {
      return { emailSent: false }
    }
  })

  handle('login', (_sender, input) => {
    const { email, password } = credentials(input)
    if (Date.now() < nextAttempt) throw new Error('Wait a moment before trying again.')
    nextAttempt = Date.now() + 1000
    const account = read.get()
    if (!account || account.email !== email || !timingSafeEqual(derive(password, account.salt), Buffer.from(account.hash, 'hex'))) {
      throw new Error('Email or password is incorrect.')
    }
    beginSession()
    void notifyUpdate(email)
  })

  handle('request-reset', async (_sender, input) => {
    const account = read.get()
    if (!account || typeof input !== 'string' || input.trim().toLowerCase() !== account.email) {
      throw new Error('Enter the email used for this local account.')
    }
    if (Date.now() < nextReset) throw new Error('Wait one minute before requesting another code.')
    nextReset = Date.now() + 60000
    reset = null
    const code = String(randomInt(100000, 1000000))
    await mail(account.email, 'Lone X password reset', 'Your password reset code is ' + code + '. It expires in 10 minutes.')
    reset = { code, expires: Date.now() + 600000, attempts: 5 }
  })

  handle('reset', (_sender, input) => {
    const { email, password } = credentials(input)
    if (!reset || reset.expires <= Date.now() || reset.attempts <= 0 || read.get()?.email !== email) {
      throw new Error('Request a new password reset code.')
    }
    reset.attempts--
    if (input.code !== reset.code) throw new Error('Incorrect reset code.')
    clearSession.run()
    expiresAt = 0
    db.prepare('UPDATE account SET salt = ?, hash = ? WHERE id = 1').run(...newPassword(password))
    reset = null
  })

  return () => {
    if (expiresAt <= Date.now()) throw new Error('Sign in to Lone X first.')
  }
}

module.exports = { registerAccount }
