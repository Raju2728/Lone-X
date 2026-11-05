const { ipcMain } = require('electron')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const { saveVerifiedDownload } = require('./verified-download.cjs')

const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
const validVersion = value => typeof value === 'string' && value.length <= 64 && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9][a-z0-9.-]*)?$/.test(value)

function resourceMetadata(input) {
  const { id, version, filename, size, sha256 } = input ?? {}
  if (!validId(id) || !validVersion(version) ||
      typeof filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}\.[a-zA-Z0-9]{1,8}$/.test(filename) ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(filename) ||
      typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256) ||
      !Number.isSafeInteger(size) || size < 1 || size > 2 * 1024 ** 3) {
    throw new Error('The resource service returned invalid metadata.')
  }
  return { id, version, filename, size, sha256 }
}

function registerResources(app, rendererPath, requireAccount) {
  let origin
  try {
    const url = new URL(process.env.LONEX_RESOURCE_API_URL)
    const loopback = url.protocol === 'http:' && url.hostname === '127.0.0.1'
    if ((url.protocol === 'https:' || loopback) && !url.username && !url.password &&
        url.pathname === '/' && !url.search && !url.hash) origin = url.origin
  } catch {}
  const token = process.env.LONEX_RESOURCE_READ_TOKEN
  const configured = Boolean(origin && token && /^[^\s]{32,512}$/.test(token))
  let active
  app.once('before-quit', () => active?.controller.abort())

  function handle(channel, action) {
    ipcMain.handle('resources:' + channel, (event, input) => {
      const url = new URL(event.senderFrame?.url || 'about:blank')
      if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
        throw new Error('Invalid resource request origin.')
      }
      requireAccount(event.sender)
      return action(event.sender, input)
    })
  }

  async function request(endpoint, signal) {
    if (!configured) throw new Error('The resource service is not configured.')
    const response = await fetch(origin + endpoint, {
      headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal
    }).catch(() => { throw new Error('Could not reach the resource service.') })
    if (response.ok && response.body) return response
    await response.body?.cancel().catch(() => {})
    if (response.status === 401 || response.status === 403) throw new Error('The resource service rejected the reader token.')
    if (response.status === 404) throw new Error('This resource version is no longer available.')
    if (response.status === 410) throw new Error('This resource version has been withdrawn. Refresh the catalog to see available versions.')
    throw new Error('The resource service is temporarily unavailable.')
  }

  async function metadata(endpoint, signal) {
    const response = await request(endpoint, signal)
    const chunks = []
    let length = 0
    for await (const chunk of response.body) {
      length += chunk.length
      if (length > 128 * 1024) throw new Error('The resource service returned too much metadata.')
      chunks.push(chunk)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
      throw new Error('The resource service returned invalid metadata.')
    }
  }

  handle('list', async () => {
    if (!configured) return { configured: false, resources: [] }
    const rows = await metadata('/v1/resources', AbortSignal.timeout(10000))
    if (!Array.isArray(rows) || rows.length > 100) throw new Error('The resource service returned invalid metadata.')
    return { configured: true, resources: rows.map(resourceMetadata) }
  })

  handle('stop', sender => {
    if (active?.sender === sender) active.controller.abort()
  })

  handle('download', async (sender, input) => {
    const { id, version } = input ?? {}
    if (!validId(id) || !validVersion(version)) throw new Error('Choose a valid resource version.')
    if (active) throw new Error('Wait for the current resource download to finish.')
    const controller = new AbortController()
    const stop = () => controller.abort()
    active = { sender, controller }
    sender.once('destroyed', stop)
    try {
      const endpoint = '/v1/resources/' + id + '/' + version
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(900000)])
      const row = resourceMetadata(await metadata(endpoint, AbortSignal.any([signal, AbortSignal.timeout(10000)])))
      if (row.id !== id || row.version !== version) throw new Error('The resource service returned a different version.')
      const response = await request(endpoint + '/download', signal)
      return await saveVerifiedDownload({
        body: response.body, parent: path.join(app.getPath('downloads'), 'Lone X Resources'), prefix: row.id + '-',
        name: row.filename, size: row.size, sha256: row.sha256, signal,
        mismatch: 'The resource did not match its registered size or SHA-256.',
        oversized: 'The resource exceeded its registered size.'
      })
    } catch (error) {
      if (controller.signal.aborted) return null
      throw error
    } finally {
      sender.removeListener('destroyed', stop)
      active = undefined
    }
  })
}

module.exports = { registerResources }
