const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { EventEmitter } = require('node:events')
const processes = require('node:child_process')

test('a configured local model folder is used by an owned loopback runtime without the default model store', async () => {
  const base = await fs.realpath(os.tmpdir())
  const root = await fs.mkdtemp(path.join(base, 'lone-x-runtime-'))
  const saved = { LOCALAPPDATA: process.env.LOCALAPPDATA, LONEX_OLLAMA_MODEL_DIR: process.env.LONEX_OLLAMA_MODEL_DIR }
  const originalSpawn = processes.spawn
  const originalFetch = global.fetch
  const modulePath = require.resolve('../desktop/ollama-runtime.cjs')
  try {
    const installed = path.join(root, 'Programs/Ollama/ollama.exe')
    await fs.mkdir(path.dirname(installed), { recursive: true })
    await fs.writeFile(installed, 'fixture binary — never executed')
    process.env.LOCALAPPDATA = root
    process.env.LONEX_OLLAMA_MODEL_DIR = path.join(root, 'models-on-test-drive')
    let launch, killed = false
    processes.spawn = (binary, args, options) => {
      launch = { binary, args, options }
      const child = new EventEmitter()
      child.exitCode = null
      child.kill = () => { killed = true; child.exitCode = 0; child.emit('exit', 0) }
      return child
    }
    global.fetch = async url => {
      assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/api\/version$/)
      return Response.json({ version: 'fixture' })
    }
    delete require.cache[modulePath]
    const { localRuntime } = require(modulePath)
    const app = new EventEmitter()
    const runtime = localRuntime(app)
    assert.match(await runtime(), /^http:\/\/127\.0\.0\.1:\d+$/)
    assert.equal(launch.binary, installed)
    assert.deepEqual(launch.args, ['serve'])
    assert.equal(launch.options.env.OLLAMA_MODELS, process.env.LONEX_OLLAMA_MODEL_DIR)
    assert.equal(launch.options.env.OLLAMA_NO_CLOUD, '1')
    assert.match(launch.options.env.OLLAMA_HOST, /^127\.0\.0\.1:\d+$/)
    app.emit('will-quit')
    assert.equal(killed, true)
    process.env.LONEX_OLLAMA_MODEL_DIR = 'relative-model-folder'
    assert.throws(() => localRuntime(new EventEmitter()), /absolute local model folder/)
  } finally {
    processes.spawn = originalSpawn
    global.fetch = originalFetch
    delete require.cache[modulePath]
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    assert.equal(path.dirname(root), base)
    await fs.rm(root, { recursive: true, force: true })
  }
})
