const { BrowserWindow, dialog, ipcMain } = require('electron')
const { open, opendir } = require('node:fs/promises')
const { fileURLToPath } = require('node:url')
const path = require('node:path')

function registerProjects(rendererPath) {
  const pending = new Set()
  const handle = (channel, action) => ipcMain.handle(channel, async event => {
    const url = new URL(event.senderFrame?.url || 'about:blank')
    if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) {
      throw new Error('Invalid project request origin.')
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || pending.has(window)) return null
    pending.add(window)
    try {
      return await action(window)
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
      return { name: path.basename(selected), text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    } finally {
      await file.close()
    }
  })
}

module.exports = { registerProjects }
