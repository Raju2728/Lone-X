const { BrowserWindow, dialog, ipcMain } = require('electron')
const { lstat, mkdtemp, open, opendir, realpath, rename, rm, rmdir, writeFile } = require('node:fs/promises')
const { fileURLToPath } = require('node:url')
const path = require('node:path')

const starterFiles = new Map([
  ['index.html', '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Lone X starter</title>\n<link rel="stylesheet" href="styles.css">\n<main><h1>Your starter project is ready.</h1></main>\n</html>\n'],
  ['styles.css', 'body { font-family: system-ui, sans-serif; margin: 3rem; }\n'],
  ['README.md', '# Lone X starter\n\nOpen index.html in a browser to preview the project.\n']
])

async function readTextFile(filename) {
  const file = await open(filename, 'r')
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
    return { bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } finally {
    await file.close()
  }
}

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
  const reviews = new WeakMap()
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
    reviews.delete(window)
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
    const { bytes, text } = await readTextFile(selected)
    previews.set(window, bytes)
    return { name: path.basename(selected), text }
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
      reviews.delete(window)
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

  async function changedStarterFile(window, name) {
    const folder = starters.get(window)
    if (!folder || !starterFiles.has(name)) throw new Error('Choose a file from the generated starter.')
    if (await realpath(folder) !== folder) throw new Error('The starter folder has moved or been redirected.')
    const filename = path.join(folder, name)
    if (!(await lstat(filename)).isFile() || await realpath(filename) !== filename) {
      throw new Error('The starter file must be a regular file inside the project.')
    }
    const { bytes, text: current } = await readTextFile(filename)
    const expected = starterFiles.get(name)
    if (bytes.equals(Buffer.from(expected))) throw new Error('This file already matches the starter template.')
    return { folder, filename, name, current, expected, bytes }
  }

  handle('projects:review-starter-file', async (window, name) => {
    const review = await changedStarterFile(window, name)
    reviews.set(window, review)
    return { name: review.name, current: review.current, expected: review.expected }
  })
  handle('projects:save-starter-repair', async (window, name) => {
    const { expected } = await changedStarterFile(window, name)
    return saveNewCopy(window, expected, 'Save repaired starter copy', 'repaired-' + name)
  })

  handle('projects:apply-starter-repair', async (window, name) => {
    const review = reviews.get(window)
    if (!review || review.name !== name || review.folder !== starters.get(window)) throw new Error('Review the changed file first.')
    const confirm = await dialog.showMessageBox(window, {
      type: 'warning', buttons: ['Cancel', 'Restore template'], defaultId: 0, cancelId: 0,
      message: 'Restore the starter template for ' + name + '?',
      detail: 'Lone X will save the current file in a backup folder inside the starter project before replacing it.'
    })
    if (confirm.response !== 1) return null
    const current = await changedStarterFile(window, name)
    if (!current.bytes.equals(review.bytes)) throw new Error('The file changed after review. Review it again before restoring.')
    const backupFolder = await mkdtemp(path.join(current.folder, 'lone-x-repair-'))
    const backup = path.join(backupFolder, name)
    const replacement = path.join(backupFolder, 'replacement.tmp')
    try {
      await writeFile(backup, current.bytes, { flag: 'wx', flush: true })
      await writeFile(replacement, current.expected, { flag: 'wx', flush: true })
      const latest = await changedStarterFile(window, name)
      if (!latest.bytes.equals(review.bytes)) throw new Error('The file changed during repair. Review it again before restoring.')
      await rename(replacement, current.filename)
    } finally {
      await rm(replacement, { force: true }).catch(() => {})
    }
    reviews.delete(window)
    return { backup: path.join(path.basename(backupFolder), name), checks: await checkStarter(current.folder) }
  })

  async function saveNewCopy(window, contents, title, defaultPath) {
    const result = await dialog.showSaveDialog(window, { title, defaultPath })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, contents, { flag: 'wx' })
    return path.basename(result.filePath)
  }

  handle('projects:save-copy', async (window, editedText) => {
    const bytes = previews.get(window)
    if (!bytes) throw new Error('Preview a text file first.')
    if (editedText !== undefined && (typeof editedText !== 'string' || editedText.includes('\0') || Buffer.byteLength(editedText) > 128 * 1024)) {
      throw new Error('The edited text must be UTF-8 and at most 128 KB.')
    }
    return saveNewCopy(window, editedText ?? bytes, 'Save a new copy of the preview', 'preview-copy.txt')
  })
}

module.exports = { registerProjects }
