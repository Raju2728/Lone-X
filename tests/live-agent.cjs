const fs = require('node:fs/promises')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { createWorkspace, runAgent } = require('../desktop/chat-agent.cjs')
const { tokenLimits } = require('../desktop/token-limits.cjs')

async function main() {
  if (process.env.LONEX_AGENT_LIVE !== '1') throw new Error('Set LONEX_AGENT_LIVE=1 to run the isolated live-model file-creation check.')
  const pcCase = process.env.LONEX_AGENT_LIVE_CASE === 'pc'
  const base = path.resolve(__dirname, pcCase ? '..' : '../node_modules')
  const root = await fs.mkdtemp(path.join(base, '.agent-live-'))
  const thanglishCase = process.env.LONEX_AGENT_LIVE_CASE === 'thanglish'
  const desktopCase = process.env.LONEX_AGENT_LIVE_CASE === 'desktop' || thanglishCase
  const workspace = pcCase ? path.join(root, 'Home') : desktopCase ? path.join(root, 'Desktop') : root
  if (desktopCase || pcCase) await fs.mkdir(workspace)
  const outside = path.join(root, 'OtherLocation')
  if (pcCase) await fs.mkdir(outside)
  const pcDestination = path.join(outside, 'PCWelcome.txt')
  const knownFolders = pcCase ? { home: workspace, desktop: outside, documents: outside, downloads: outside } : {}
  const db = new DatabaseSync(':memory:')
  const signal = AbortSignal.timeout(5 * 60 * 1000)
  try {
    let createdFile = 'hello.txt'
    const expected = pcCase ? 'Welcome to LoneX PC' : thanglishCase ? 'Vanakkam LoneX' : desktopCase ? 'Welcome to LoneX' : 'Hello from Lone X'
    const fileTools = createWorkspace(workspace, { signal, pcWide: pcCase, knownFolders, desktop: desktopCase, approve: async review => {
      const accepted = review.kind === 'create' && (pcCase ? review.path === pcDestination : desktopCase ? /^[\w -]+\.txt$/i.test(review.path) : review.path === 'hello.txt') && review.after.trim() === expected
      if (accepted) createdFile = review.path
      return accepted
    }, trash: async () => { throw new Error('Recycling is not allowed in this live check') } })
    const execute = async (name, args) => {
      if (pcCase) {
        if (name === 'list_drives') return fileTools(name, args)
        const parts = typeof args?.path === 'string' ? args.path.split(/[\\/]/) : []
        const alias = knownFolders[parts[0]?.toLowerCase()]
        const candidate = alias ? path.resolve(alias, ...parts.slice(1)) : typeof args?.path === 'string' ? path.resolve(args.path) : ''
        if (!candidate.startsWith(root + path.sep)) throw new Error('This live test permits access only inside its temporary fixture.')
      }
      return fileTools(name, args)
    }
    const prompt = pcCase ? 'Create a text file at ' + JSON.stringify(pcDestination) + ' containing exactly "Welcome to LoneX PC". Use the provided tools to create the file.' : thanglishCase ? 'Desktop la WelcomeThanglish.txt nu oru text file create panni, adhula "Vanakkam LoneX" nu ezhuthu. Mudichadhum Thanglish la sollu.' : desktopCase ? 'Create A New text file in Desktop and write "Welcome to LoneX" in it.' : 'Create hello.txt containing exactly Hello from Lone X. Read the file back to verify the content and report the result. Use the file tools, not code blocks.'
    const tokens = await runAgent({ messages: [{ role: 'user', content: prompt }],
      endpoint: 'http://127.0.0.1:11434', signal, budget: tokenLimits(db), execute, workspace, desktop: desktopCase, pcWide: pcCase, knownFolders,
      onDelta: text => process.stdout.write(text)
    })
    if ((await fs.readFile(pcCase ? createdFile : path.join(workspace, createdFile), 'utf8')).trim() !== expected) throw new Error('Live model did not create the expected file.')
    console.log('\nLive Qwen3 agent created the approved file. Tokens: ' + tokens)
  } finally {
    db.close()
    if (path.dirname(root) !== base) throw new Error('Invalid live-test cleanup path.')
    await fs.rm(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
