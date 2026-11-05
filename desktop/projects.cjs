const { BrowserWindow, dialog, ipcMain } = require('electron')
const { lstat, mkdtemp, open, opendir, realpath, rename, rm, rmdir, writeFile } = require('node:fs/promises')
const { fileURLToPath } = require('node:url')
const path = require('node:path')
const { inspectNpm, runNpm } = require('./project-npm.cjs')

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

async function replaceWithBackup(folder, filename, original, replacement, verify) {
  const backupFolder = await mkdtemp(path.join(folder, 'lone-x-repair-'))
  const name = path.basename(filename)
  const temporary = path.join(backupFolder, 'replacement.tmp')
  try {
    await writeFile(path.join(backupFolder, name), original, { flag: 'wx', flush: true })
    await writeFile(temporary, replacement, { flag: 'wx', flush: true })
    await verify()
    await rename(temporary, filename)
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
  }
  return path.join(path.basename(backupFolder), name)
}

function registerProjects(rendererPath, requireAccount, proposeFix) {
  const pending = new Set()
  const previews = new WeakMap()
  const starters = new WeakMap()
  const reviews = new WeakMap()
  const selectedFolders = new WeakMap()
  const running = new WeakMap()
  const failedTests = new WeakMap()
  const handle = (channel, action, allowWhilePending = false) => ipcMain.handle(channel, async (event, input) => {
    const url = new URL(event.senderFrame?.url || 'about:blank')
    if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
      throw new Error('Invalid project request origin.')
    }
    requireAccount(event.sender)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    if (allowWhilePending) return action(window, input)
    if (pending.has(window)) return null
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

    const folder = await realpath(result.filePaths[0])
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
    failedTests.delete(window)
    selectedFolders.set(window, folder)
    return { name: path.basename(folder) || folder, entries, truncated }
  })

  handle('projects:inspect-npm', async window => {
    const folder = selectedFolders.get(window)
    if (!folder) throw new Error('Choose a project folder first.')
    return (await inspectNpm(folder))?.commands ?? []
  })

  handle('projects:run-npm', async (window, action) => {
    const folder = selectedFolders.get(window)
    if (!folder) throw new Error('Choose a project folder first.')
    const inspected = await inspectNpm(folder)
    const command = inspected?.commands.find(item => item.action === action)
    if (!command) throw new Error('The selected npm action is unavailable in this project.')
    const confirm = await dialog.showMessageBox(window, {
      type: 'warning', buttons: ['Cancel', 'Run'], defaultId: 0, cancelId: 0,
      message: 'Run ' + command.command + '?',
      detail: folder + '\n\n' + (command.script
        ? 'Script: ' + command.script + '\n\nThis runs project code with your Windows account permissions. Continue only for a project you trust.'
        : 'This installs dependencies from package-lock.json and replaces the project’s existing node_modules. Package lifecycle scripts are disabled.')
    })
    if (confirm.response !== 1 || window.isDestroyed()) return null
    requireAccount(window.webContents)
    const latest = await inspectNpm(folder)
    if (!latest || !latest.manifest.equals(inspected.manifest) ||
        (action === 'install' && !latest.lock?.equals(inspected.lock))) {
      throw new Error('Project configuration changed after review. Inspect the commands again.')
    }
    if (window.isDestroyed()) return null
    const controller = new AbortController()
    const stop = () => controller.abort()
    running.set(window, controller)
    window.once('closed', stop)
    try {
      const result = await runNpm(folder, action, controller.signal, chunk => {
        if (!window.isDestroyed()) window.webContents.send('projects:npm-output', chunk)
      })
      if (action === 'test') {
        if (result.outcome === 'Failed' && result.output.trim()) failedTests.set(window, result.output.slice(-6000))
        else failedTests.delete(window)
      }
      return result
    } finally {
      window.removeListener('closed', stop)
      running.delete(window)
    }
  })

  handle('projects:stop-npm', window => running.get(window)?.abort(), true)

  handle('projects:propose-fix', async window => {
    const preview = previews.get(window)
    const output = failedTests.get(window)
    if (!output || !preview?.folder || preview.folder !== selectedFolders.get(window)) {
      throw new Error('Run a failing test and preview the related source file in this project first.')
    }
    const { bytes, text } = await readTextFile(preview.filename)
    if (await realpath(preview.filename) !== preview.filename || !bytes.equals(preview.bytes)) {
      throw new Error('The source changed after preview. Preview it again first.')
    }
    if (text.length > 6000) throw new Error('Choose a source file with up to 6,000 characters for diagnosis.')
    const controller = new AbortController()
    const stop = () => controller.abort()
    running.set(window, controller)
    window.once('closed', stop)
    try {
      return await proposeFix({ filename: path.basename(preview.filename), source: text, testOutput: output }, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return null
      throw error
    } finally {
      window.removeListener('closed', stop)
      running.delete(window)
    }
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
    const filename = await realpath(selected)
    const folder = selectedFolders.get(window)
    const relative = folder && path.relative(folder, filename)
    const canApply = Boolean(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
    previews.set(window, { bytes, filename, folder: canApply ? folder : undefined })
    return { name: path.basename(selected), text, canApply }
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
      selectedFolders.delete(window)
      failedTests.delete(window)
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
    const backup = await replaceWithBackup(current.folder, current.filename, current.bytes, current.expected, async () => {
      const latest = await changedStarterFile(window, name)
      if (!latest.bytes.equals(review.bytes)) throw new Error('The file changed during repair. Review it again before restoring.')
    })
    reviews.delete(window)
    return { backup, checks: await checkStarter(current.folder) }
  })

  async function saveNewCopy(window, contents, title, defaultPath) {
    const result = await dialog.showSaveDialog(window, { title, defaultPath })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, contents, { flag: 'wx' })
    return path.basename(result.filePath)
  }

  handle('projects:save-copy', async (window, editedText) => {
    const preview = previews.get(window)
    if (!preview) throw new Error('Preview a text file first.')
    if (editedText !== undefined && (typeof editedText !== 'string' || editedText.includes('\0') || Buffer.byteLength(editedText) > 128 * 1024)) {
      throw new Error('The edited text must be UTF-8 and at most 128 KB.')
    }
    return saveNewCopy(window, editedText ?? preview.bytes, 'Save a new copy of the preview', 'preview-copy.txt')
  })

  handle('projects:apply-source-edit', async (window, editedText) => {
    const preview = previews.get(window)
    if (!preview?.folder || preview.folder !== selectedFolders.get(window)) throw new Error('Preview a file in the selected project first.')
    if (typeof editedText !== 'string' || editedText.includes('\0') || Buffer.byteLength(editedText) > 128 * 1024) {
      throw new Error('The edited text must be UTF-8 and at most 128 KB.')
    }
    const replacement = Buffer.from(editedText)
    if (replacement.equals(preview.bytes)) throw new Error('Make an edit before applying changes.')
    const confirm = await dialog.showMessageBox(window, {
      type: 'warning', buttons: ['Cancel', 'Apply edit'], defaultId: 0, cancelId: 0,
      message: 'Apply the reviewed edit to ' + path.basename(preview.filename) + '?',
      detail: preview.filename + '\n\nThe original will be saved in a backup folder in this project.'
    })
    if (confirm.response !== 1 || window.isDestroyed()) return null
    requireAccount(window.webContents)
    async function verify() {
      if (await realpath(preview.folder) !== preview.folder || await realpath(preview.filename) !== preview.filename ||
          !(await readTextFile(preview.filename)).bytes.equals(preview.bytes)) {
        throw new Error('The file changed after preview. Open it again before applying an edit.')
      }
    }
    await verify()
    const backup = await replaceWithBackup(preview.folder, preview.filename, preview.bytes, replacement, verify)
    previews.set(window, { ...preview, bytes: replacement })
    return backup
  })
}

module.exports = { registerProjects }
