const { createHash } = require('node:crypto')
const { createWriteStream } = require('node:fs')
const { mkdir, mkdtemp, rename, rm, rmdir } = require('node:fs/promises')
const path = require('node:path')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')

async function saveVerifiedDownload({ body, parent, prefix, name, size: expectedSize, sha256, signal, mismatch, oversized }) {
  await mkdir(parent, { recursive: true })
  const folder = await mkdtemp(path.join(parent, prefix))
  const partial = path.join(folder, name + '.part')
  const destination = path.join(folder, name)
  try {
    let size = 0
    const hash = createHash('sha256')
    const verify = new Transform({
      transform(chunk, _encoding, done) {
        size += chunk.length
        if (size > expectedSize) return done(new Error(oversized))
        hash.update(chunk)
        done(null, chunk)
      }
    })
    await pipeline(Readable.fromWeb(body), verify, createWriteStream(partial, { flags: 'wx' }), { signal })
    if (size !== expectedSize || hash.digest('hex') !== sha256) throw new Error(mismatch)
    signal.throwIfAborted()
    await rename(partial, destination)
    return destination
  } catch (error) {
    await rm(partial, { force: true }).catch(() => {})
    await rmdir(folder).catch(() => {})
    throw error
  }
}

module.exports = { saveVerifiedDownload }
