const { spawn, execFile } = require('node:child_process')
const { lstat, realpath, readFile } = require('node:fs/promises')
const path = require('node:path')

const actions = {
  install: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
  start: ['run', 'start', '--ignore-scripts'],
  test: ['run', 'test', '--ignore-scripts']
}

async function projectFile(folder, name, limit) {
  const filename = path.join(folder, name)
  const stat = await lstat(filename).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })
  if (!stat) return null
  if (!stat.isFile() || stat.size > limit || await realpath(filename) !== filename) throw new Error('Invalid project file: ' + name)
  const file = await readFile(filename)
  if (file.length > limit) throw new Error('Project file exceeds the size limit: ' + name)
  return file
}

async function inspectNpm(folder) {
  if (await realpath(folder) !== folder) throw new Error('The selected project folder has moved or been redirected.')
  const manifest = await projectFile(folder, 'package.json', 128 * 1024)
  if (!manifest) return null
  const { scripts } = JSON.parse(manifest.toString('utf8').replace(/^\uFEFF/, ''))
  const lock = await projectFile(folder, 'package-lock.json', 8 * 1024 * 1024)
  const commands = Object.entries(actions).flatMap(([action, args]) => {
    const script = action === 'install' ? null : scripts?.[action]
    if (action === 'install' ? !lock : typeof script !== 'string' || !script.trim()) return []
    return [{ action, command: 'npm ' + args.join(' '), script }]
  })
  return { manifest, lock, commands }
}

function runNpm(folder, action, signal, onOutput) {
  const nodeFolder = path.join(process.env.ProgramFiles || 'C:/Program Files', 'nodejs')
  const node = path.join(nodeFolder, 'node.exe')
  const npm = path.join(nodeFolder, 'node_modules/npm/bin/npm-cli.js')
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(systemroot|windir|comspec|path|pathext|userprofile|appdata|localappdata|temp|tmp|homedrive|homepath|programfiles|programfiles\(x86\)|programdata)$/i.test(key)))
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const child = spawn(node, [npm, ...actions[action]], { cwd: folder, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let stopping
    const stop = outcome => {
      if (stopping || !child.pid || child.exitCode !== null) return
      stopping = outcome
      const taskkill = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/taskkill.exe')
      execFile(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, error => {
        if (error) child.kill()
      })
    }
    const cancel = () => stop('Stopped')
    signal.addEventListener('abort', cancel, { once: true })
    const timeout = setTimeout(() => stop('Timed out'), 120000)
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', chunk => {
        output = (output + chunk).slice(-64000)
        onOutput(chunk.slice(-64000))
      })
    }
    child.once('error', error => {
      if (error.code === 'ENOENT') reject(new Error('Install Node.js and npm in the standard Windows location before running this project.'))
      else reject(error)
    })
    child.once('close', code => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', cancel)
      resolve({ outcome: stopping || (code === 0 ? 'Completed' : 'Failed'), code, output })
    })
  })
}

module.exports = { inspectNpm, runNpm }
