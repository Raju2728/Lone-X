const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

async function freePort() {
  const socket = net.createServer()
  await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve))
  const { port } = socket.address()
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
  return port
}

function localRuntime(app) {
  const bundle = path.join(__dirname, '../ollama')
  const binary = path.join(bundle, 'ollama.exe')
  if (!existsSync(binary)) return async () => 'http://127.0.0.1:11434'

  let child
  let starting
  let stopped = false
  app.once('will-quit', () => {
    stopped = true
    child?.kill()
  })

  async function start() {
    const port = await freePort()
    if (stopped) throw new Error('Lone X is closing.')
    const host = '127.0.0.1:' + port
    const server = spawn(binary, ['serve'], {
      windowsHide: true, stdio: 'ignore',
      env: { ...process.env, OLLAMA_HOST: host, OLLAMA_MODELS: path.join(bundle, 'models'), OLLAMA_NO_CLOUD: '1' }
    })
    child = server
    let failure
    server.on('error', error => { failure = error })
    server.once('exit', () => {
      if (child === server) {
        child = undefined
        starting = undefined
      }
    })
    const endpoint = 'http://' + host
    for (let attempt = 0; attempt < 80; attempt++) {
      if (stopped || failure || server.exitCode !== null) break
      const ready = await fetch(endpoint + '/api/version', { redirect: 'error', signal: AbortSignal.timeout(500) })
        .then(response => response.ok, () => false)
      if (ready) return endpoint
      await delay(250)
    }
    server.kill()
    throw new Error('The bundled Ollama runtime could not start. Extract the entire ZIP and try again.')
  }

  return () => starting ??= start().catch(error => {
    starting = undefined
    throw error
  })
}

module.exports = { localRuntime }
