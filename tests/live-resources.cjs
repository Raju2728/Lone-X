const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')

async function verifyLiveResource() {
  const {
    LONEX_RESOURCE_API_URL: api, LONEX_RESOURCE_READ_TOKEN: token,
    LONEX_RESOURCE_TEST_ID: id, LONEX_RESOURCE_TEST_VERSION: version
  } = process.env
  if (!api || !token || !id || !version) {
    throw new Error('Set the resource API URL, reader token, test resource ID, and test resource version.')
  }
  const url = new URL(api)
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Set the API URL to an HTTPS origin or a local 127.0.0.1 HTTP origin.')
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || version.length > 64 || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9][a-z0-9.-]*)?$/.test(version)) {
    throw new Error('Set a valid registered test resource ID and version.')
  }
  const endpoint = url.origin + '/v1/resources/' + id + '/' + version
  const get = (target, timeout, authenticated = true) => fetch(target, {
    headers: authenticated ? { Authorization: 'Bearer ' + token } : {},
    signal: AbortSignal.timeout(timeout), redirect: 'error'
  })
  const anonymous = await get(endpoint, 10000, false)
  await anonymous.body?.cancel()
  assert.equal(anonymous.status, 401, 'Unauthenticated access must be rejected.')
  const response = await get(endpoint, 10000)
  if (!response.ok) throw new Error('Metadata request failed with HTTP ' + response.status + '.')
  const metadata = await response.json()
  assert.equal(metadata.id, id)
  assert.equal(metadata.version, version)
  assert.ok(Number.isSafeInteger(metadata.size) && metadata.size > 0 && metadata.size <= 2 * 1024 ** 3)
  assert.match(metadata.sha256, /^[a-f0-9]{64}$/)
  const download = await get(endpoint + '/download', 900000)
  if (!download.ok || !download.body) throw new Error('Download request failed with HTTP ' + download.status + '.')
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of download.body) {
    size += chunk.length
    if (size > metadata.size) throw new Error('Download exceeds the registered size.')
    hash.update(chunk)
  }
  assert.equal(size, metadata.size, 'Download size does not match the registry.')
  assert.equal(hash.digest('hex'), metadata.sha256, 'Download SHA-256 does not match the registry.')
  console.log('Authenticated resource ' + id + ' ' + version + ' verified (' + size + ' bytes).')
}

verifyLiveResource().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
