const { BrowserWindow, dialog, ipcMain } = require('electron')
const { lstat, mkdtemp, open, opendir, realpath, rm, rmdir, writeFile } = require('node:fs/promises')
const { fileURLToPath } = require('node:url')
const path = require('node:path')

const starterFiles = new Map([
  ['index.html', '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Lone X starter</title>\n<link rel="stylesheet" href="styles.css">\n<main><h1>Your starter project is ready.</h1></main>\n</html>\n'],
  ['styles.css', 'body { font-family: system-ui, sans-serif; margin: 3rem; }\n'],
  ['README.md', '# Lone X starter\n\nOpen index.html in a browser to preview the project.\n']
])

async function checkStarter(folder) {
  if (await realpath(folder) !== folder) throw new Error('The starter folder has moved or been redirected.')
  return Promise.all([...starterFiles].map(async ([name, expected]) => {
    const filename = path.join(folder, name)
    const stat = await lstat(filename).catch(error => {
      if (error.code !== 'ENOENT') throw error
    })
    if (!stat) return { name, status: 'Missing' }
    if (!stat.isFile() || stat.size !== Buffer.byteLength(expected)) return { name, status: 'Changed' }
    const file = await open(filename, 'r')
    try {
      const bytes = Buffer.alloc(stat.size + 1)
      const { bytesRead } = await file.read(bytes)
      return { name, status: bytes.subarray(0, bytesRead).equals(Buffer.from(expected)) ? 'Passed' : 'Changed' }
    } finally {
      await file.close()
    }
  }))
}

function registerProjects(rendererPath, requireAccount) {
  const pending = new Set()
  const previews = new WeakMap()
  const starters = new WeakMap()
  const handle = (channel, action) => ipcMain.handle(channel, async (event, input) => {
    const url = new URL(event.senderFrame?.url || 'about:blank')
    if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
      throw new Error('Invalid project request origin.')
    }
    requireAccount(event.sender)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || pending.has(window)) return null
    pending.add(window)
    try {
      return await action(window, input)
    } finally {
      pending.delete(window)
    }
  })

  handle('projects:open', async window => {
    const result = await dialog.showOpenDialog(window, { title: 'Choose a project folder to inspect', properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null

    const folder = result.filePaths[0]
    const entries = []
    const directory = await opendir(folder)
    let truncated = false
    for await (const entry of directory) {
      if (entries.length === 500) {
        truncated = true
        break
      }
      entries.push({
        name: entry.name,
        kind: entry.isDirectory() ? 'Folder' : entry.isFile() ? 'File' : 'Other'
      })
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    starters.delete(window)
    return { name: path.basename(folder) || folder, entries, truncated }
  })

  handle('projects:preview', async window => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose a text file to preview',
      properties: ['openFile'],
      filters: [{ name: 'Text and source files', extensions: ['txt', 'md', 'json', 'csv', 'js', 'ts', 'tsx', 'css', 'html', 'py'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const selected = result.filePaths[0]
    const file = await open(selected, 'r')
    try {
      const limit = 128 * 1024
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > limit) throw new Error('Select a text file up to 128 KB.')
      const buffer = Buffer.alloc(limit + 1)
      let length = 0
      while (length <= limit) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
        if (!bytesRead) break
        length += bytesRead
      }
      const bytes = buffer.subarray(0, length)
      if (length > limit || bytes.includes(0)) throw new Error('Select a UTF-8 text file up to 128 KB.')
      const preview = { name: path.basename(selected), text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      previews.set(window, bytes)
      return preview
    } finally {
      await file.close()
    }
  })

  handle('projects:create-starter', async window => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose where to create a new HTML starter project',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const folder = await mkdtemp(path.join(result.filePaths[0], 'lone-x-starter-'))
    const created = []
    try {
      for (const [name, content] of starterFiles) {
        const filename = path.join(folder, name)
        const file = await open(filename, 'wx')
        created.push(filename)
        try { await file.writeFile(content, 'utf8') } finally { await file.close() }
      }
      starters.set(window, await realpath(folder))
      return { name: path.basename(folder), entries: [...starterFiles.keys()].map(name => ({ name, kind: 'File' })), truncated: false, starter: true }
    } catch (error) {
      await Promise.allSettled(created.map(filename => rm(filename, { force: true })))
      await rmdir(folder).catch(() => {})
      throw error
    }
  })

  handle('projects:check-starter', async window => {
    const folder = starters.get(window)
    if (!folder) throw new Error('Create an HTML starter first.')
    return checkStarter(folder)
  })

  handle('projects:repair-starter', async window => {
    const folder = starters.get(window)
    if (!folder) throw new Error('Create an HTML starter first.')
    const checks = await checkStarter(folder)
    for (const { name, status } of checks) {
      if (status !== 'Missing') continue
      await writeFile(path.join(folder, name), starterFiles.get(name), { flag: 'wx' }).catch(error => {
        if (error.code !== 'EEXIST') throw error
      })
    }
    return checkStarter(folder)
  })

  handle('projects:preview-starter', async window => {
    const folder = starters.get(window)
    if (!folder) throw new Error('Create an HTML starter first.')
    if ((await checkStarter(folder)).some(check => check.status !== 'Passed')) {
      throw new Error('Run the starter checks and resolve missing or changed files before previewing.')
    }
    const html = starterFiles.get('index.html').replace('<link rel="stylesheet" href="styles.css">', '<style>' + starterFiles.get('styles.css') + '</style>')
    const preview = new BrowserWindow({
      parent: window, title: 'Lone X starter preview', width: 740, height: 520, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, devTools: false }
    })
    preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    preview.webContents.on('will-navigate', event => event.preventDefault())
    try {
      await preview.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      preview.show()
      return true
    } catch (error) {
      preview.destroy()
      throw error
    }
  })

  handle('projects:save-copy', async (window, editedText) => {
    const bytes = previews.get(window)
    if (!bytes) throw new Error('Preview a text file first.')
    if (editedText !== undefined && (typeof editedText !== 'string' || editedText.includes('\0') || Buffer.byteLength(editedText) > 128 * 1024)) {
      throw new Error('The edited text must be UTF-8 and at most 128 KB.')
    }
    const result = await dialog.showSaveDialog(window, {
      title: 'Save a new copy of the preview',
      defaultPath: 'preview-copy.txt'
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, editedText ?? bytes, { flag: 'wx' })
    return path.basename(result.filePath)
  })
}

module.exports = { registerProjects }
