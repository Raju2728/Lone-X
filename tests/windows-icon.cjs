const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

test('branded Windows executable contains all logo sizes and launches the Electron renderer', { skip: process.platform !== 'win32' }, async () => {
  const { brandWindowsExecutable } = await import('../scripts/brand-windows.mjs')
  const base = path.resolve(__dirname, '../node_modules')
  const temporary = fs.mkdtempSync(path.join(base, '.icon-smoke-'))
  try {
    const runtime = path.join(base, 'electron/dist')
    fs.cpSync(runtime, temporary, { recursive: true })
    const executable = path.join(temporary, 'Lone X.exe')
    const details = await brandWindowsExecutable(path.join(runtime, 'electron.exe'), executable, path.resolve(__dirname, '../public/logo.ico'))
    assert.deepEqual(details.sizes, [16, 24, 32, 48, 64, 128, 256])
    const appFolder = path.join(temporary, 'resources/app')
    fs.mkdirSync(appFolder, { recursive: true })
    fs.mkdirSync(path.join(temporary, 'profile'))
    fs.writeFileSync(path.join(appFolder, 'package.json'), JSON.stringify({ name: 'lone-x-icon-smoke', main: 'smoke.cjs' }))
    const script = path.join(appFolder, 'smoke.cjs')
    fs.writeFileSync(script, `const {app,BrowserWindow}=require('electron'); app.setPath('userData',${JSON.stringify(path.join(temporary, 'profile'))}); app.commandLine.appendSwitch('disable-gpu'); app.whenReady().then(async()=>{const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}); await w.loadURL('data:text/html,<title>Lone X icon smoke</title>'); if(await w.webContents.executeJavaScript('document.title')!=='Lone X icon smoke')throw new Error('Renderer did not load');console.log('Branded renderer loaded');app.exit(0)}).catch(e=>{console.error(e.message);app.exit(1)});setTimeout(()=>app.exit(2),15000).unref();`)
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const result = spawnSync(executable, [], { env, windowsHide: true, encoding: 'utf8', timeout: 25000 })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    assert.match(result.stdout, /Branded renderer loaded/)
  } finally {
    assert.equal(path.dirname(path.resolve(temporary)), base)
    const prefix = "'" + (temporary + path.sep).replaceAll("'", "''") + "'"
    spawnSync('powershell.exe', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith(${prefix}, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { windowsHide: true, timeout: 10000 })
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})
