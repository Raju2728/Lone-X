import fs from 'node:fs/promises'

// Production npm packages are bundled into the renderer or copied as runtime code.
const lock = JSON.parse(await fs.readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const root = new URL('../', import.meta.url)
const sections = ['LONE X THIRD-PARTY NOTICES\n\nThe MIT License for Lone X original code does not relicense the third-party material below.\nElectron/Chromium notices are distributed beside the executable. Ollama and bundled model notices are in resources/app/ollama. Optional models retain their own licenses.']
for (const [location, entry] of Object.entries(lock.packages).sort()) {
  if (!location || entry.dev || entry.devOptional) continue
  const folder = new URL(location + '/', root)
  const metadata = JSON.parse(await fs.readFile(new URL('package.json', folder), 'utf8'))
  const files = (await fs.readdir(folder)).filter(name => /^(?:licen[cs]e|notice)(?:[.-]|$)/i.test(name)).sort()
  if (!files.length) throw new Error('Missing license notice for ' + metadata.name)
  sections.push(`${metadata.name} ${metadata.version}\nDeclared license: ${entry.license || metadata.license || 'See notice'}`)
  for (const file of files) sections.push(await fs.readFile(new URL(file, folder), 'utf8'))
}
sections.push('REACT BITS COMPONENTS — src/react-bits\n\n' + await fs.readFile(new URL('../public/react-bits-LICENSE.md', import.meta.url), 'utf8'))
await fs.writeFile(new URL('../public/THIRD-PARTY-NOTICES.txt', import.meta.url), sections.join('\n\n----------------------------------------\n\n').trimEnd() + '\n')
