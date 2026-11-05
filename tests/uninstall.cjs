const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { launchUninstaller } = require('../desktop/uninstall.cjs')

test('portable uninstaller validates targets, supports preview, preserves data by default and removes data only when requested', { skip: process.platform !== 'win32' }, async () => {
  const base = path.resolve(__dirname, '../node_modules')
  const temporary = fs.mkdtempSync(path.join(base, '.uninstall-smoke-'))
  const roaming = path.join(temporary, 'Roaming')
  const userData = path.join(roaming, 'Lone X')
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(path.join(userData, 'chat.sqlite'), 'personal data fixture')
  function fixture(name, valid = true) {
    const folder = path.join(temporary, name)
    fs.mkdirSync(path.join(folder, 'resources/app'), { recursive: true })
    fs.writeFileSync(path.join(folder, 'Lone X.exe'), 'dummy executable, never launched')
    fs.writeFileSync(path.join(folder, 'resources/app/package.json'), JSON.stringify({ name: valid ? 'lone-x' : 'other', productName: 'Lone X' }))
    fs.copyFileSync(path.join(__dirname, '../scripts/Uninstall-LoneX.ps1'), path.join(folder, 'Uninstall-LoneX.ps1'))
    fs.copyFileSync(path.join(__dirname, '../scripts/Uninstall-LoneX.cmd'), path.join(folder, 'Uninstall-LoneX.cmd'))
    return folder
  }
  function run(folder, ...args) {
    const script = "'" + path.join(folder, 'Uninstall-LoneX.ps1').replaceAll("'", "''") + "'"
    return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '& ' + script + ' ' + args.join(' ')],
      { cwd: folder, encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, APPDATA: roaming } })
  }
  try {
    const invalid = fixture('invalid', false)
    assert.notEqual(run(invalid, '-WhatIf').status, 0)
    assert.equal(fs.existsSync(invalid), true)
    const app = fixture('Lone X')
    await assert.rejects(launchUninstaller({ isPackaged: false }, () => { throw new Error('Must not launch') }), /Development files will be kept/)
    const packaged = { isPackaged: true, getPath: () => path.join(app, 'Lone X.exe') }
    let launched = 0
    assert.match(await launchUninstaller(packaged, async filename => {
      assert.equal(filename, path.join(app, 'Uninstall-LoneX.cmd'))
      launched++
      return ''
    }), /Uninstaller opened/)
    assert.equal(launched, 1)
    const cancelled = new AbortController()
    cancelled.abort()
    await assert.rejects(launchUninstaller(packaged, () => { throw new Error('Must not launch') }, cancelled.signal), { name: 'AbortError' })
    await assert.rejects(launchUninstaller(packaged, async () => 'Launch failed'), /could not open/)
    assert.equal(fs.existsSync(app), true)
    const preview = run(app, '-WhatIf', '-RemoveUserData')
    assert.equal(preview.status, 0, preview.stderr)
    assert.equal(fs.existsSync(app), true)
    assert.equal(fs.existsSync(userData), true)
    const external = path.join(temporary, 'external')
    fs.mkdirSync(external)
    fs.writeFileSync(path.join(external, 'keep.txt'), 'keep')
    fs.symlinkSync(external, path.join(app, 'linked'), 'junction')
    assert.notEqual(run(app, '-Confirm:$false').status, 0)
    assert.equal(fs.readFileSync(path.join(external, 'keep.txt'), 'utf8'), 'keep')
    fs.unlinkSync(path.join(app, 'linked'))
    const uninstall = run(app, '-Confirm:$false')
    assert.equal(uninstall.status, 0, uninstall.stderr)
    assert.equal(fs.existsSync(app), false)
    assert.equal(fs.existsSync(userData), true)
    const next = fixture('Lone X again')
    const eraseData = run(next, '-RemoveUserData', '-Confirm:$false')
    assert.equal(eraseData.status, 0, eraseData.stderr)
    assert.equal(fs.existsSync(next), false)
    assert.equal(fs.existsSync(userData), false)
    assert.equal(fs.readFileSync(path.join(external, 'keep.txt'), 'utf8'), 'keep')
  } finally {
    assert.equal(path.dirname(path.resolve(temporary)), base)
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})
