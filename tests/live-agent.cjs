const fs = require('node:fs/promises')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { createWorkspace, runAgent } = require('../desktop/chat-agent.cjs')
const { tokenLimits } = require('../desktop/token-limits.cjs')

async function main() {
  if (process.env.LONEX_AGENT_LIVE !== '1') throw new Error('Set LONEX_AGENT_LIVE=1 to run the isolated live-model file-creation check.')
  const base = path.resolve(__dirname, '../node_modules')
  const root = await fs.mkdtemp(path.join(base, '.agent-live-'))
  const desktopCase = process.env.LONEX_AGENT_LIVE_CASE === 'desktop'
  const workspace = desktopCase ? path.join(root, 'Desktop') : root
  if (desktopCase) await fs.mkdir(workspace)
  const db = new DatabaseSync(':memory:')
  const signal = AbortSignal.timeout(5 * 60 * 1000)
  try {
    let createdFile = 'hello.txt'
    const expected = desktopCase ? 'Welcome to LoneX' : 'Hello from Lone X'
    const execute = createWorkspace(workspace, { signal, desktop: desktopCase, approve: async review => {
      const accepted = review.kind === 'create' && (desktopCase ? /^[\w -]+\.txt$/i.test(review.path) : review.path === 'hello.txt') && review.after.trim() === expected
      if (accepted) createdFile = review.path
      return accepted
    }, trash: async () => { throw new Error('Recycling is not allowed in this live check') } })
    const tokens = await runAgent({ messages: [{ role: 'user', content: desktopCase ? 'Create A New text file in Desktop and write "Welcome to LoneX" in it.' : 'Create hello.txt containing exactly Hello from Lone X. Read the file back to verify the content and report the result. Use the file tools, not code blocks.' }],
      endpoint: 'http://127.0.0.1:11434', signal, budget: tokenLimits(db), execute, workspace, desktop: desktopCase,
      onDelta: text => process.stdout.write(text)
    })
    if ((await fs.readFile(path.join(workspace, createdFile), 'utf8')).trim() !== expected) throw new Error('Live model did not create the expected file.')
    console.log('\nLive Qwen3 agent created the approved file. Tokens: ' + tokens)
  } finally {
    db.close()
    if (path.dirname(root) !== base) throw new Error('Invalid live-test cleanup path.')
    await fs.rm(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
