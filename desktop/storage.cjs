const { BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { lstat, opendir, realpath, statfs } = require('node:fs/promises')
const { fileURLToPath } = require('node:url')
const path = require('node:path')

const within = (root, filename) => {
  const relative = path.relative(root, filename)
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)
}

function registerStorage(app, rendererPath, requireAccount) {
  const scans = new WeakMap()
  const reviews = new WeakMap()
  const busy = new WeakSet()
  const protectedRoots = [process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'],
    process.env.ProgramData, app.getPath('userData'), path.dirname(process.execPath)].filter(Boolean).map(root => path.resolve(root))
  const protectedFile = filename => protectedRoots.some(root => filename.toLowerCase() === root.toLowerCase() || within(root, filename))

  function handle(name, action) {
    ipcMain.handle('storage:' + name, (event, input) => {
      const url = new URL(event.senderFrame?.url || 'about:blank')
      if (event.senderFrame !== event.sender.mainFrame || url.protocol !== 'file:' || fileURLToPath(url) !== rendererPath) throw new Error('Invalid storage request origin.')
      requireAccount(event.sender)
      return action(event.sender, input)
    })
  }

  handle('stop', sender => { const scan = scans.get(sender); if (scan) scan.stopped = true })
  handle('scan', async sender => {
    if (busy.has(sender)) throw new Error('Finish the current storage operation first.')
    busy.add(sender)
    reviews.delete(sender)
    const scan = { stopped: false }
    scans.set(sender, scan)
    const stop = () => { scan.stopped = true }
    sender.once('destroyed', stop)
    try {
      const choice = await dialog.showOpenDialog(BrowserWindow.fromWebContents(sender), {
        title: 'Choose a folder to review storage usage', properties: ['openDirectory']
      })
      if (choice.canceled || !choice.filePaths[0] || scan.stopped || sender.isDestroyed()) return null
      requireAccount(sender)
      const root = await realpath(choice.filePaths[0])
      const volume = await statfs(root)
      const files = new Map()
      const pending = [root]
      let entries = 0, skipped = 0, bytes = 0
      while (pending.length && entries < 5000 && !scan.stopped) {
        const folder = pending.pop()
        try {
          if (await realpath(folder) !== folder || (await lstat(folder)).isSymbolicLink()) { skipped++; continue }
          const directory = await opendir(folder)
          for await (const entry of directory) {
            if (scan.stopped || entries >= 5000) break
            entries++
            const filename = path.join(folder, entry.name)
            try {
              const stat = await lstat(filename)
              if (stat.isSymbolicLink()) { skipped++; continue }
              if (stat.isDirectory()) pending.push(filename)
              else if (stat.isFile()) {
                bytes += stat.size
                files.set(filename, { size: stat.size, mtimeMs: stat.mtimeMs, dev: stat.dev, ino: stat.ino })
              } else skipped++
            } catch { skipped++ }
          }
        } catch { skipped++ }
      }
      if (scan.stopped || sender.isDestroyed()) return null
      const largest = [...files].sort((a, b) => b[1].size - a[1].size).slice(0, 30)
      const candidates = new Map(largest.map(([filename, stat], index) => [String(index), { filename, ...stat }]))
      reviews.set(sender, { root, candidates })
      return { folder: root, bytes, files: files.size, entries, skipped, partial: entries >= 5000,
        capacity: volume.blocks * volume.bsize, free: volume.bavail * volume.bsize,
        largest: [...candidates].map(([id, item]) => ({ id, name: path.relative(root, item.filename), bytes: item.size, removable: !protectedFile(item.filename) })) }
    } finally {
      busy.delete(sender)
      scans.delete(sender)
      sender.removeListener('destroyed', stop)
    }
  })

  handle('trash', async (sender, id) => {
    if (busy.has(sender)) throw new Error('Finish the current storage operation first.')
    const review = reviews.get(sender)
    const file = typeof id === 'string' ? review?.candidates.get(id) : null
    if (!file) throw new Error('Scan the folder and choose a reviewed file first.')
    if (protectedFile(file.filename)) throw new Error('System and Lone X application files cannot be removed here.')
    busy.add(sender)
    try {
      const verify = async () => {
        if (await realpath(review.root) !== review.root || !within(review.root, file.filename) || await realpath(file.filename) !== file.filename) throw new Error('The reviewed file path has changed. Scan again.')
        const stat = await lstat(file.filename)
        if (!stat.isFile() || stat.isSymbolicLink() || ['size', 'mtimeMs', 'dev', 'ino'].some(key => stat[key] !== file[key])) throw new Error('The reviewed file has changed. Scan again.')
      }
      await verify()
      const choice = await dialog.showMessageBox(BrowserWindow.fromWebContents(sender), {
        type: 'warning', buttons: ['Cancel', 'Move to Recycle Bin'], defaultId: 0, cancelId: 0,
        message: 'Move this file to the Windows Recycle Bin?', detail: file.filename + '\n\nSize: ' + file.size.toLocaleString() + ' bytes. Restore it from the Recycle Bin if needed. No folder or permanent deletion is requested.'
      })
      if (choice.response !== 1 || sender.isDestroyed()) return false
      requireAccount(sender)
      await verify()
      await shell.trashItem(file.filename)
      review.candidates.delete(id)
      return true
    } finally { busy.delete(sender) }
  })
}

module.exports = { registerStorage, within }
