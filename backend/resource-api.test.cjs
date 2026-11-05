const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { execFile } = require('node:child_process')
const { once } = require('node:events')
const path = require('node:path')
const { Readable } = require('node:stream')
const { test } = require('node:test')
const { promisify } = require('node:util')
const { createResourceApi } = require('./resource-api.cjs')

test('authenticates resources, verifies registration, and pins each download to its registered version', async t => {
  const readToken = 'r'.repeat(40)
  const adminToken = 'a'.repeat(40)
  const records = new Map()
  const blobs = new Map()
  let unavailable = false
  const server = createResourceApi({
    readToken, adminToken,
    registry: {
      list: async () => {
        if (unavailable) throw new Error('Private database error')
        return [...records.values()].filter(record => !record.withdrawnAt)
      },
      get: async (id, version) => records.get(id + ':' + version),
      withdraw: async (id, version, at) => {
        const record = records.get(id + ':' + version)
        if (!record) return null
        record.withdrawnAt ??= at
        return record
      },
      insert: async record => {
        const key = record.id + ':' + record.version
        if (records.has(key)) return false
        records.set(key, record)
        return true
      }
    },
    objects: {
      get: async (key, etag) => {
        const blob = blobs.get(key)
        if (!blob || (etag && etag !== blob.etag)) return null
        return { body: Readable.from([blob.bytes]), size: blob.bytes.length, etag: blob.etag }
      }
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = 'http://127.0.0.1:' + server.address().port
  const request = (url, token, options = {}) => fetch(base + url, {
    ...options, headers: token ? { Authorization: 'Bearer ' + token } : {}
  })
  const resources = '/v1/resources'
  const post = (token, body) => request(resources, token, { method: 'POST', body: JSON.stringify(body) })
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
  const bytes = Buffer.from('fixture release')
  const resource = { id: 'fixture', version: '1.0.0', filename: 'fixture.zip', size: bytes.length, sha256: sha256(bytes) }
  const key = 'resources/fixture/1.0.0/fixture.zip'
  blobs.set(key, { bytes, etag: '"fixture-v1"' })
  assert.equal((await request('/health')).status, 200)
  assert.equal((await request(resources)).status, 401)
  assert.equal((await request(resources, 'wrong')).status, 401)
  assert.equal((await post(readToken, resource)).status, 403)
  assert.equal((await post(adminToken, { ...resource, filename: '../fixture.zip' })).status, 400)
  assert.equal((await post(adminToken, { ...resource, sha256: '0'.repeat(64) })).status, 422)
  assert.equal((await post(adminToken, { ...resource, version: '2.0.0' })).status, 422)
  assert.equal((await post(adminToken, resource)).status, 201)
  assert.equal((await post(adminToken, resource)).status, 409)
  blobs.set('resources/fixture/2.0.0/fixture.zip', { bytes, etag: '"fixture-v2"' })
  assert.equal((await post(adminToken, { ...resource, version: '2.0.0' })).status, 201)
  const list = await (await request(resources, readToken)).json()
  assert.deepEqual(list.map(item => item.version), ['1.0.0', '2.0.0'])
  assert.equal(list[0].key, undefined)
  const download = resources + '/fixture/1.0.0/download'
  assert.equal((await request(download)).status, 401)
  const response = await request(download, readToken)
  assert.equal(response.status, 200)
  assert.equal(sha256(Buffer.from(await response.arrayBuffer())), list[0].sha256)
  const check = await promisify(execFile)(process.execPath, [path.join(__dirname, '../tests/live-resources.cjs')], {
    env: { ...process.env, LONEX_RESOURCE_API_URL: base, LONEX_RESOURCE_READ_TOKEN: readToken,
      LONEX_RESOURCE_TEST_ID: resource.id, LONEX_RESOURCE_TEST_VERSION: resource.version },
    timeout: 10000
  })
  assert.match(check.stdout, /Authenticated resource fixture 1\.0\.0 verified/)
  blobs.set(key, { bytes: Buffer.from('different'), etag: '"changed"' })
  assert.equal((await request(download, readToken)).status, 503)
  const withdraw = resources + '/fixture/1.0.0/withdraw'
  assert.equal((await request(withdraw, readToken, { method: 'POST' })).status, 403)
  const withdrawn = await request(withdraw, adminToken, { method: 'POST' })
  assert.equal(withdrawn.status, 200)
  const record = await withdrawn.json()
  assert.ok(record.withdrawnAt)
  assert.equal((await (await request(withdraw, adminToken, { method: 'POST' })).json()).withdrawnAt, record.withdrawnAt)
  assert.equal((await request(download, readToken)).status, 410)
  assert.equal((await request(download, adminToken)).status, 410)
  assert.equal((await request(resources + '/fixture/1.0.0', readToken)).status, 410)
  assert.equal((await (await request(resources + '/fixture/1.0.0', adminToken)).json()).withdrawnAt, record.withdrawnAt)
  assert.deepEqual((await (await request(resources, readToken)).json()).map(item => item.version), ['2.0.0'])
  blobs.set(key, { bytes, etag: '"fixture-v1"' })
  assert.equal((await post(adminToken, resource)).status, 409)
  unavailable = true
  const failure = await request(resources, readToken)
  assert.equal(failure.status, 503)
  assert.deepEqual(await failure.json(), { error: 'Resource storage is temporarily unavailable.' })
})
