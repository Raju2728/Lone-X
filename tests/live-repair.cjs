// Real-model acceptance check. Only disposable source is edited; tests are immutable.
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { proposeSourceFix } = require('../desktop/ai.cjs')
const { createWorkspace } = require('../desktop/chat-agent.cjs')
const { runAgent } = require('../desktop/chat-agent.cjs')
const { tokenLimits } = require('../desktop/token-limits.cjs')
const { DatabaseSync } = require('node:sqlite')
const run = promisify(execFile)

async function main() {
  if (process.env.LONEX_REPAIR_LIVE !== '1') throw new Error('Set LONEX_REPAIR_LIVE=1 to test the installed Qwen3 model.')
  const base = path.resolve(__dirname, '../test-artifacts')
  const root = await fs.mkdtemp(path.join(base, 'repair-live-'))
  const source = 'exports.double = value => value + 2;\n'
  const test = "const {test} = require('node:test'); const assert = require('node:assert/strict'); const {double} = require('./index.cjs'); test('double(3) must equal 6',()=>assert.equal(double(3), 6)); test('double(5) must equal 10',()=>assert.equal(double(5), 10));\n"
  await fs.writeFile(path.join(root, 'index.cjs'), source)
  await fs.writeFile(path.join(root, 'check.cjs'), test)
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'lonex-disposable-repair', private: true, scripts: { test: 'node check.cjs' } }))
  let failed
  try { await run(process.execPath, ['check.cjs'], { cwd: root, windowsHide: true }) }
  catch (error) { failed = error.stdout + error.stderr }
  assert.ok(failed, 'Fixture must fail before repair')
  if (process.env.LONEX_REPAIR_MODE === 'agent') {
    const signal = AbortSignal.timeout(180000)
    const db = new DatabaseSync(':memory:')
    const receipts = []
    const execute = createWorkspace(root, { signal, approve: async review => review.kind === 'command'
      ? review.after.includes('npm') && review.after.includes('test')
      : review.kind === 'edit' && review.path === 'index.cjs' && /^exports\.double\s*=\s*value\s*=>\s*[\w\s+*\/();-]+$/.test(review.after),
      trash: async () => { throw new Error('Not allowed') }, onActivity: receipt => receipts.push(receipt) })
    try {
      await runAgent({ messages: [{ role: 'user', content: 'Fix the double function in index.cjs. Read check.cjs to understand the required behavior. Run the tests, inspect the failure, edit only index.cjs, then run tests again to verify. Do not modify tests or package.json.' }],
        endpoint: 'http://127.0.0.1:11434', signal, budget: tokenLimits(db), workspace: root,
        execute: (name, args) => {
          if (name === 'run_npm' && args.action !== 'test') throw new Error('Only tests are approved in this fixture')
          if (['write_file', 'recycle_file', 'create_directory'].includes(name) && (name !== 'write_file' || args.path !== 'index.cjs')) throw new Error('Only index.cjs edits are approved')
          return execute(name, args)
        }, onDelta: text => process.stdout.write(text) })
      assert.equal(await fs.readFile(path.join(root, 'check.cjs'), 'utf8'), test)
      assert.ok(receipts.some(item => item.outcome === 'File edited' && item.backup))
      const checked = await run(process.execPath, ['check.cjs'], { cwd: root, windowsHide: true })
      assert.match(checked.stdout, /# pass 2/)
      await fs.writeFile(path.join(base, 'repair-agent-live-results.json'), JSON.stringify({ model: 'qwen3:4b-instruct', result: 'PASS', fixture: root, receipts }, null, 2))
      console.log('\nLive coding-agent repair and independent tests PASSED.')
    } finally { db.close() }
    return
  }
  const proposal = await proposeSourceFix('qwen3:4b-instruct', { source, testOutput: failed, filename: 'index.cjs' }, AbortSignal.timeout(180000))
  assert.ok(proposal.replacement, 'Model did not produce an exact applicable repair')
  const execute = createWorkspace(root, { signal: AbortSignal.timeout(10000), approve: async review => review.kind === 'edit' && review.path === 'index.cjs' && review.before === source && review.after === proposal.replacement, trash: async () => { throw new Error('Not allowed') } })
  await execute('read_file', { path: 'index.cjs' })
  const receipt = await execute('write_file', { path: 'index.cjs', content: proposal.replacement })
  assert.ok(receipt.backup)
  assert.equal(await fs.readFile(path.join(root, 'check.cjs'), 'utf8'), test)
  const rerun = await run(process.execPath, ['check.cjs'], { cwd: root, windowsHide: true })
  assert.match(rerun.stdout, /# pass 2/)
  const result = { model: 'qwen3:4b-instruct', diagnosis: proposal.diagnosis, before: source, after: proposal.replacement, receipt, result: 'PASS: real failed test, reviewed model edit with backup, unchanged tests, successful rerun', fixture: root }
  await fs.writeFile(path.join(base, 'repair-live-results.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
