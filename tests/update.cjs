const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { checkUpdate, downloadUpdate, upToDate } = require('../desktop/update.cjs')

const current = 'a'.repeat(40), latest = 'b'.repeat(40)
const bytes = Buffer.from('disposable Windows ZIP fixture, not an executable')
const downloadUrl = 'https://github.com/Raju2728/Lone-X/releases/download/desktop-preview/Lone-X-Windows.zip'
const metadata = revision => ({ assets: [{ name: 'Lone-X-Windows.zip', browser_download_url: downloadUrl, label: 'build:' + revision, digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), size: bytes.length }] })

async function fixture(action) {
  const base = path.resolve(__dirname, '../test-artifacts')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'update-check-'))
  const build = path.join(root, 'build-info.json')
  await fs.writeFile(build, JSON.stringify({ revision: current }))
  try { await action(root, build) }
  finally { assert.equal(path.dirname(root), base); await fs.rm(root, { recursive: true, force: true }) }
}

test('unknown build is not reported current or admitted to a download', () => fixture(async (root, build) => {
  await fs.writeFile(build, '{}')
  const request = async () => { throw new Error('Network must not be used') }
  await assert.rejects(checkUpdate(undefined, request, build), /no verified build revision/)
  assert.equal(await checkUpdate(undefined, request, build, true), null)
  await assert.rejects(downloadUpdate(root, AbortSignal.timeout(1000), request, build), /no verified build revision/)
}))

test('same revision is up to date without downloading a ZIP', () => fixture(async (root, build) => {
  let calls = 0
  const request = async (url, options) => { calls++; assert.match(url, /api.github.com/); assert.equal(options.redirect, 'error'); return Response.json(metadata(current)) }
  assert.equal(await downloadUpdate(root, AbortSignal.timeout(1000), request, build), upToDate)
  assert.equal(calls, 1)
  assert.deepEqual(await fs.readdir(root), ['build-info.json'])
}))

test('a different verified revision downloads exact bytes and returns portable-update instructions', () => fixture(async (root, build) => {
  const request = async url => url === downloadUrl ? new Response(bytes) : Response.json(url.includes('/compare/') ? { status: 'ahead' } : metadata(latest))
  const output = await downloadUpdate(root, AbortSignal.timeout(1000), request, build)
  const parent = path.join(root, 'Lone X Updates')
  const folders = await fs.readdir(parent)
  assert.equal(folders.length, 1)
  assert.deepEqual(await fs.readFile(path.join(parent, folders[0], 'Lone-X-Windows.zip')), bytes)
  assert.match(output, /downloaded and verified/)
  assert.match(output, /extract the entire ZIP to a new folder/)
}))

test('invalid release metadata, draft releases and HTTP errors are refused', () => fixture(async (_root, build) => {
  const good = metadata(latest)
  for (const value of [null, { assets: [null] }, { assets: {} }, { ...good, draft: true }, metadata('invalid'), { assets: [{ ...good.assets[0], digest: '' }] }, { assets: [{ ...good.assets[0], size: 0 }] }, { assets: [{ ...good.assets[0], browser_download_url: 'https://untrusted.test/update.zip' }] }]) {
    await assert.rejects(checkUpdate(undefined, async () => Response.json(value), build), /verifiable Windows update/)
  }
  await assert.rejects(checkUpdate(undefined, async () => new Response('', { status: 503 }), build), /could not provide/)
}))

test('corruption, truncation, oversize and cancelled transfers leave no update ZIP or partial file', () => fixture(async (root, build) => {
  for (const data of [Buffer.alloc(bytes.length), bytes.subarray(0, -1), Buffer.concat([bytes, Buffer.from('extra')])]) {
    await assert.rejects(downloadUpdate(root, AbortSignal.timeout(1000), async url => url === downloadUrl ? new Response(data) : Response.json(url.includes('/compare/') ? { status: 'ahead' } : metadata(latest)), build), /checksum|expected size/)
    assert.deepEqual(await fs.readdir(path.join(root, 'Lone X Updates')), [])
  }
  const controller = new AbortController()
  const request = async url => {
    if (url !== downloadUrl) return Response.json(url.includes('/compare/') ? { status: 'ahead' } : metadata(latest))
    return new Response(new ReadableStream({ start(stream) { stream.enqueue(bytes.subarray(0, 1)); controller.abort() } }))
  }
  await assert.rejects(downloadUpdate(root, controller.signal, request, build), { name: 'AbortError' })
  assert.deepEqual(await fs.readdir(path.join(root, 'Lone X Updates')), [])
}))

test('older releases never downgrade the app and unverified ancestry never downloads', () => fixture(async (root, build) => {
  for (const status of ['behind', 'identical', 'diverged', 'unexpected']) {
    const request = async url => {
      assert.notEqual(url, downloadUrl, 'ZIP must not be requested')
      return Response.json(url.includes('/compare/') ? { status } : metadata(latest))
    }
    if (['behind', 'identical'].includes(status)) assert.equal(await downloadUpdate(root, AbortSignal.timeout(1000), request, build), upToDate)
    else await assert.rejects(downloadUpdate(root, AbortSignal.timeout(1000), request, build), /verified upgrade path/)
  }
  await assert.rejects(checkUpdate(undefined, async url => url.includes('/compare/') ? new Response('', { status: 503 }) : Response.json(metadata(latest)), build), /verify the update order/)
}))
