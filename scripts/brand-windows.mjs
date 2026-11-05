import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as ResEdit from 'resedit'
const iconBytes = item => Buffer.from(item.isRaw() ? item.bin : item.generate())

export async function verifyWindowsIcon(executable, iconPath) {
  const image = ResEdit.NtExecutable.from(await fs.readFile(executable), { ignoreCert: true })
  const resources = ResEdit.NtExecutableResource.from(image)
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries)
  const expected = ResEdit.Data.IconFile.from(await fs.readFile(iconPath)).icons.map(item => iconBytes(item.data))
  if (!groups.length || expected.length < 6) throw new Error('Multi-resolution application icon is missing.')
  for (const group of groups) {
    const actual = group.getIconItemsFromEntries(resources.entries)
    if (actual.length !== expected.length || actual.some((item, index) => !iconBytes(item).equals(expected[index]))) throw new Error('Executable icon does not match the Lone X logo.')
  }
  return { groups: groups.length, sizes: ResEdit.Data.IconFile.from(await fs.readFile(iconPath)).icons.map(item => item.width || item.data.width) }
}

export async function brandWindowsExecutable(source, destination, iconPath) {
  if (path.resolve(source) === path.resolve(destination)) throw new Error('Keep the source Electron executable unchanged.')
  const image = ResEdit.NtExecutable.from(await fs.readFile(source), { ignoreCert: true })
  const resources = ResEdit.NtExecutableResource.from(image)
  const icon = ResEdit.Data.IconFile.from(await fs.readFile(iconPath))
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries)
  for (const group of groups.length ? groups : [{ id: 1, lang: 1033 }]) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icon.icons.map(item => item.data))
  }
  for (const version of ResEdit.Resource.VersionInfo.fromEntries(resources.entries)) {
    for (const language of version.getAllLanguagesForStringValues()) version.setStringValues(language, {
      FileDescription: 'Lone X (Beta)', ProductName: 'Lone X', InternalName: 'Lone X', OriginalFilename: 'Lone X.exe'
    })
    version.outputToResourceEntries(resources.entries)
  }
  resources.outputResource(image)
  await fs.writeFile(destination, Buffer.from(image.generate()))
  return verifyWindowsIcon(destination, iconPath)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [source, destination, icon] = process.argv.slice(2)
  if (!source || !destination || !icon) throw new Error('Usage: brand-windows.mjs source.exe destination.exe logo.ico')
  console.log('Embedded Lone X icon:', await brandWindowsExecutable(source, destination, icon))
}
