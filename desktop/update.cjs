const { readFile } = require('node:fs/promises')
const path = require('node:path')
const { saveVerifiedDownload } = require('./verified-download.cjs')

const releaseUrl = 'https://api.github.com/repos/Raju2728/Lone-X/releases/tags/desktop-preview'
const name = 'Lone-X-Windows.zip'
const downloadUrl = 'https://github.com/Raju2728/Lone-X/releases/download/desktop-preview/' + name
const upToDate = 'LoneX is Up-To-Date'
const versionLabel = 'Lone X (Beta)'
const maxSize = 2 * 1024 * 1024 * 1024

async function checkUpdate(signal, request = fetch, buildInfo = path.join(__dirname, '../build-info.json'), requireCurrentBuild = false) {
  const current = await readFile(buildInfo, 'utf8').then(JSON.parse).catch(() => ({}))
  if (requireCurrentBuild && !/^[a-f0-9]{40}$/.test(current.revision ?? '')) return null
  const release = await request(releaseUrl, { signal, redirect: 'error' })
  if (!release.ok) throw new Error('GitHub could not provide the Windows preview release.')
  const { assets } = await release.json()
  const asset = assets?.find(item => item.name === name && item.browser_download_url === downloadUrl)
  const revision = /^build:([a-f0-9]{40})$/.exec(asset?.label ?? '')?.[1]
  const digest = /^sha256:([a-f0-9]{64})$/.exec(asset?.digest ?? '')?.[1]
  if (!revision || !digest || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maxSize) {
    throw new Error('GitHub did not provide a verifiable Windows update.')
  }
  return revision === current.revision ? null : { revision, digest, size: asset.size }
}

async function downloadUpdate(downloads, signal, request = fetch, buildInfo) {
  const update = await checkUpdate(signal, request, buildInfo)
  if (!update) return upToDate

  const response = await request(downloadUrl, { signal })
  if (!response.ok || !response.body) throw new Error('GitHub could not provide the Windows update ZIP.')
  const destination = await saveVerifiedDownload({
    body: response.body, parent: path.join(downloads, 'Lone X Updates'), prefix: 'preview-', name,
    size: update.size, sha256: update.digest, signal,
    mismatch: 'The update ZIP did not match GitHub’s checksum.',
    oversized: 'The update exceeded its expected size.'
  })
  return 'Windows update downloaded and verified.\n' + destination +
    '\nClose Lone X, extract the entire ZIP to a new folder, and open Lone X.exe from that folder.'
}

module.exports = { checkUpdate, downloadUpdate, upToDate, versionLabel }
