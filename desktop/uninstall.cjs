const { lstat, readFile, realpath } = require('node:fs/promises')
const path = require('node:path')
const { shell } = require('electron')

async function launchUninstaller(app, launch = filename => shell.openPath(filename), signal) {
  signal?.throwIfAborted()
  if (!app.isPackaged) throw new Error('Uninstall is available in the extracted Windows package. Development files will be kept.')
  const root = await realpath(path.dirname(app.getPath('exe')))
  const packageFile = path.join(root, 'resources/app/package.json')
  const packageInfo = JSON.parse(await readFile(packageFile, 'utf8'))
  if (packageInfo.name !== 'lone-x' || packageInfo.productName !== 'Lone X') throw new Error('This is not a recognized Lone X Windows package.')
  for (const name of ['Uninstall-LoneX.cmd', 'Uninstall-LoneX.ps1']) {
    const filename = path.join(root, name)
    const stat = await lstat(filename)
    if (!stat.isFile() || stat.isSymbolicLink() || await realpath(filename) !== filename) throw new Error('The packaged uninstaller is missing or redirected. Extract the full ZIP again.')
  }
  signal?.throwIfAborted()
  const error = await launch(path.join(root, 'Uninstall-LoneX.cmd'))
  if (error) throw new Error('Windows could not open the Lone X uninstaller.')
  return 'Uninstaller opened in PowerShell. Review and confirm the app folder there to uninstall. Local accounts and chats are kept by default.'
}

module.exports = { launchUninstaller }
