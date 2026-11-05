const { createHash, timingSafeEqual } = require('node:crypto')
const { createServer } = require('node:http')
const { pipeline } = require('node:stream/promises')

const idPattern = /^[a-z0-9][a-z0-9-]{0,63}$/
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9][a-z0-9.-]*)?$/
const maxSize = 2 * 1024 ** 3
const digest = value => createHash('sha256').update(value).digest()

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function publicResource({ id, version, filename, sha256, size, createdAt }) {
  return { id, version, filename, sha256, size, createdAt }
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

async function registration(request) {
  let size = 0
  const chunks = []
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > 8192) throw new ApiError(413, 'Registration is too large.')
    chunks.push(chunk)
  }
  let fields
  try { fields = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
    throw new ApiError(400, 'Expected a JSON registration.')
  }
  const { id, version, filename, sha256, size: expectedSize } = fields ?? {}
  if (typeof id !== 'string' || !idPattern.test(id) ||
      typeof version !== 'string' || version.length > 64 || !versionPattern.test(version) ||
      typeof filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}\.[a-zA-Z0-9]{1,8}$/.test(filename) ||
      typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256) ||
      !Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > maxSize) {
    throw new ApiError(400, 'Invalid resource metadata.')
  }
  return { id, version, filename, sha256, size: expectedSize, key: 'resources/' + id + '/' + version + '/' + filename }
}

async function verifyObject(object, resource) {
  try {
    if (!object.etag || object.size !== resource.size) throw new ApiError(422, 'Object size does not match the registration.')
    const hash = createHash('sha256')
    let size = 0
    for await (const chunk of object.body) {
      size += chunk.length
      if (size > resource.size) throw new ApiError(422, 'Object size does not match the registration.')
      hash.update(chunk)
    }
    if (size !== resource.size || hash.digest('hex') !== resource.sha256) {
      throw new ApiError(422, 'Object checksum does not match the registration.')
    }
  } finally {
    object.body.destroy()
  }
}

function createResourceApi({ registry, objects, readToken, adminToken }) {
  if (typeof readToken !== 'string' || typeof adminToken !== 'string' ||
      readToken.length < 32 || adminToken.length < 32 || readToken === adminToken) {
    throw new Error('Set distinct reader and administrator tokens of at least 32 characters.')
  }
  const reader = digest(readToken)
  const admin = digest(adminToken)
  return createServer(async (request, response) => {
    const disconnect = new AbortController()
    response.once('close', () => disconnect.abort())
    const signal = AbortSignal.any([disconnect.signal, AbortSignal.timeout(120000)])
    try {
      if (request.method === 'GET' && request.url === '/health') return json(response, 200, { status: 'ok' })
      const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '')?.[1]
      if (!token) throw new ApiError(401, 'Authentication required.')
      const candidate = digest(token)
      const isAdmin = timingSafeEqual(candidate, admin)
      if (!isAdmin && !timingSafeEqual(candidate, reader)) throw new ApiError(401, 'Invalid resource token.')

      if (request.url === '/v1/resources') {
        if (request.method === 'GET') return json(response, 200, (await registry.list()).map(publicResource))
        if (request.method === 'POST') {
          if (!isAdmin) throw new ApiError(403, 'Administrator access required.')
          const resource = await registration(request)
          const object = await objects.get(resource.key, undefined, signal)
          if (!object) throw new ApiError(422, 'Upload the resource object before registering it.')
          await verifyObject(object, resource)
          const record = { ...resource, etag: object.etag, createdAt: new Date().toISOString() }
          signal.throwIfAborted()
          if (!await registry.insert(record)) throw new ApiError(409, 'This resource version is already registered.')
          return json(response, 201, publicResource(record))
        }
      }
      const match = /^\/v1\/resources\/([^/]+)\/([^/]+)(?:\/(download|withdraw))?$/.exec(request.url)
      if (!match || !idPattern.test(match[1]) || match[2].length > 64 || !versionPattern.test(match[2])) {
        throw new ApiError(404, 'Resource endpoint not found.')
      }
      const [, id, version, action] = match
      if (action === 'withdraw' && request.method === 'POST') {
        if (!isAdmin) throw new ApiError(403, 'Administrator access required.')
        const withdrawn = await registry.withdraw(id, version, new Date().toISOString())
        if (!withdrawn) throw new ApiError(404, 'Resource version not found.')
        return json(response, 200, { ...publicResource(withdrawn), withdrawnAt: withdrawn.withdrawnAt })
      }
      if (request.method !== 'GET' || action === 'withdraw') throw new ApiError(404, 'Resource endpoint not found.')
      const record = await registry.get(id, version)
      if (!record) throw new ApiError(404, 'Resource version not found.')
      if (record.withdrawnAt) {
        if (isAdmin && !action) return json(response, 200, { ...publicResource(record), withdrawnAt: record.withdrawnAt })
        throw new ApiError(410, 'This resource version has been withdrawn.')
      }
      if (!action) return json(response, 200, publicResource(record))
      const object = await objects.get(record.key, record.etag, signal)
      if (!object || object.etag !== record.etag || object.size !== record.size) {
        object?.body.destroy()
        throw new ApiError(503, 'The registered object is unavailable or has changed.')
      }
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="' + record.filename + '"',
        'Content-Length': record.size,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store'
      })
      await pipeline(object.body, response, { signal })
    } catch (error) {
      if (response.destroyed) return
      if (response.headersSent) return response.destroy()
      if (error instanceof ApiError) return json(response, error.status, { error: error.message })
      json(response, 503, { error: 'Resource storage is temporarily unavailable.' })
    }
  })
}

module.exports = { createResourceApi }
