const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { createWorkspace, runAgent, agentModel } = require('../desktop/chat-agent.cjs')
const { tokenLimits } = require('../desktop/token-limits.cjs')

test('workspace actions require review, reject escape paths, detect stale files and retain backups', async () => {
  const base = path.resolve(__dirname, '../node_modules')
  const root = await fs.mkdtemp(path.join(base, '.agent-files-'))
  let allow = true
  const reviews = []
  const controller = new AbortController()
  const execute = createWorkspace(root, { signal: controller.signal, approve: async item => { reviews.push(item); return allow }, trash: file => fs.rename(file, path.join(root, 'recycled.txt')) })
  try {
    for (const file of ['../escape.txt', 'C:\\outside.txt', 'file.txt:secret', '.git/config', '.env', 'folder/../escape', '.lone-x-backups/file', 'NUL.txt']) {
      await assert.rejects(execute('write_file', { path: file, content: 'bad' }))
    }
    const result = await execute('write_file', { path: 'src/main.js', content: 'const answer = 1\n' })
    assert.equal(result.outcome, 'File created')
    assert.equal(reviews[0].kind, 'create')
    allow = false
    await assert.rejects(execute('write_file', { path: 'src/main.js', content: 'not approved' }), /declined/)
    assert.equal(await fs.readFile(path.join(root, 'src/main.js'), 'utf8'), 'const answer = 1\n')
    allow = true
    const directory = await execute('create_directory', { path: 'empty-folder' })
    assert.equal(directory.outcome, 'Directory created')
    assert.equal((await fs.stat(path.join(root, 'empty-folder'))).isDirectory(), true)
    const desktopScope = createWorkspace(root, { desktop: true, signal: controller.signal, approve: async () => true })
    assert.equal((await desktopScope('create_directory', { path: 'Desktop' })).outcome, 'Directory already exists')
    await desktopScope('write_file', { path: 'Desktop/Welcome.txt', content: 'Welcome to LoneX' })
    await assert.rejects(desktopScope('write_file', { path: 'Desktop/../escape.txt', content: 'bad' }), /restricted/)
    assert.equal(await fs.readFile(path.join(root, 'Welcome.txt'), 'utf8'), 'Welcome to LoneX')
    const edit = await execute('write_file', { path: 'src/main.js', content: 'const answer = 2\n' })
    assert.equal(await fs.readFile(path.join(root, edit.backup), 'utf8'), 'const answer = 1\n')
    await fs.writeFile(path.join(root, 'src/main.js'), 'external change')
    await assert.rejects(execute('write_file', { path: 'src/main.js', content: 'overwrite' }), /changed/)
    const changedDuringReview = createWorkspace(root, { signal: controller.signal, approve: async () => { await fs.writeFile(path.join(root, 'src/main.js'), 'new external edit'); return true } })
    await changedDuringReview('read_file', { path: 'src/main.js' })
    await assert.rejects(changedDuringReview('write_file', { path: 'src/main.js', content: 'overwrite' }), /changed/)
    await fs.writeFile(path.join(root, 'src/main.js'), 'external change')
    await execute('read_file', { path: 'src/main.js' })
    const recycle = await execute('recycle_file', { path: 'src/main.js' })
    assert.equal(await fs.readFile(path.join(root, recycle.backup), 'utf8'), 'external change')
    assert.equal(await fs.readFile(path.join(root, 'recycled.txt'), 'utf8'), 'external change')
    const external = await fs.mkdtemp(path.join(base, '.agent-external-'))
    try {
      await fs.symlink(external, path.join(root, 'linked'), 'junction')
      await assert.rejects(execute('write_file', { path: 'linked/escape.txt', content: 'bad' }), /Linked/)
      await fs.unlink(path.join(root, 'linked'))
    } finally { assert.equal(path.dirname(external), base); await fs.rm(external, { recursive: true, force: true }) }
    controller.abort()
    await assert.rejects(execute('write_file', { path: 'stopped.txt', content: 'bad' }), { name: 'AbortError' })
  } finally { assert.equal(path.dirname(root), base); await fs.rm(root, { recursive: true, force: true }) }
})

test('npm checks require a reviewed stable manifest and return real exit status', async () => {
  const base = path.resolve(__dirname, '../node_modules')
  const root = await fs.mkdtemp(path.join(base, '.agent-npm-'))
  try {
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    let calls = 0
    const execute = createWorkspace(root, { signal: new AbortController().signal, approve: async review => { assert.equal(review.kind, 'command'); assert.match(review.before, /node --test/); return true }, run: async (folder, action) => { calls++; assert.equal(folder, root); assert.equal(action, 'test'); return { code: 1, outcome: 'Failed', output: 'assertion failed' } } })
    assert.equal((await execute('run_npm', { action: 'test' })).code, 1)
    assert.equal(calls, 1)
    await assert.rejects(execute('run_npm', { action: 'arbitrary' }), /Only npm/)
    const stale = createWorkspace(root, { signal: new AbortController().signal, approve: async () => { await fs.writeFile(path.join(root, 'package.json'), '{}'); return true }, run: async () => { throw new Error('Must not run') } })
    await assert.rejects(stale('run_npm', { action: 'test' }), /changed after review/)
  } finally { assert.equal(path.dirname(root), base); await fs.rm(root, { recursive: true, force: true }) }
})

test('PC-wide mode works outside the initial folder and retains protected-write and review checks', { skip: process.platform !== 'win32' }, async () => {
  const base = path.resolve(__dirname, '..')
  const container = await fs.mkdtemp(path.join(base, '.pc-agent-'))
  const home = path.join(container, 'home')
  const other = path.join(container, 'other')
  const protectedFolder = path.join(container, 'protected')
  await Promise.all([home, other, protectedFolder].map(folder => fs.mkdir(folder)))
  const reviews = []
  let allow = true
  const execute = createWorkspace(home, { pcWide: true, knownFolders: { desktop: other }, protectedWrites: [protectedFolder], signal: new AbortController().signal,
    approve: async item => { reviews.push(item); return allow }, trash: file => fs.rename(file, path.join(container, 'recycled.txt')) })
  try {
    const file = path.join(other, 'Welcome.txt')
    const created = await execute('write_file', { path: 'Desktop/Welcome.txt', content: 'Welcome to LoneX' })
    assert.equal(created.path, file)
    assert.equal(reviews[0].path, file)
    assert.equal(await fs.readFile(file, 'utf8'), 'Welcome to LoneX')
    const edit = await execute('write_file', { path: file, content: 'Edited across folders' })
    assert.equal(path.isAbsolute(edit.backup), true)
    assert.equal(await fs.readFile(edit.backup, 'utf8'), 'Welcome to LoneX')
    const listing = await execute('list_files', { path: other })
    assert.ok(listing.entries.some(item => item.name === 'Welcome.txt'))
    await execute('create_directory', { path: path.join(other, 'new-folder') })
    for (const input of ['relative.txt', 'Desktop/../escape.txt', '\\\\server\\share\\file.txt', '\\\\?\\C:\\escape.txt', file + ':stream', path.join(other, '.env')]) {
      await assert.rejects(execute('write_file', { path: input, content: 'bad' }))
    }
    await fs.writeFile(path.join(protectedFolder, 'system.txt'), 'protected fixture')
    assert.equal((await execute('read_file', { path: path.join(protectedFolder, 'system.txt') })).content, 'protected fixture')
    await assert.rejects(execute('write_file', { path: path.join(protectedFolder, 'system.txt'), content: 'bad' }), /protected/)
    allow = false
    await assert.rejects(execute('write_file', { path: path.join(other, 'declined.txt'), content: 'bad' }), /declined/)
    allow = true
    await execute('recycle_file', { path: file })
    assert.equal(await fs.readFile(path.join(container, 'recycled.txt'), 'utf8'), 'Edited across folders')
    const narrow = createWorkspace(home, { signal: new AbortController().signal, approve: async () => true })
    await assert.rejects(narrow('read_file', { path: file }), /relative/)
  } finally { assert.equal(path.dirname(container), base); await fs.rm(container, { recursive: true, force: true }) }
})

test('agent loop dispatches only tools and shares token windows across requests', async () => {
  const db = new DatabaseSync(':memory:')
  const log = []
  let requests = 0
  let executed = 0
  try {
    const tokens = await runAgent({ messages: [{ role: 'user', content: 'Create a file' }], endpoint: 'http://fixture', signal: new AbortController().signal,
      budget: tokenLimits(db), onDelta: text => log.push(text),
      execute: async (name, args) => { executed++; assert.equal(name, 'write_file'); assert.equal(args.path, 'hello.txt'); return { outcome: 'File created' } },
      request: async (_url, options) => {
        const body = JSON.parse(options.body)
        assert.equal(body.model, agentModel)
        assert.equal(body.think, false)
        assert.equal(body.tools.length, 6)
        requests++
        if (requests === 2) assert.equal(body.messages.at(-1).role, 'tool')
        return Response.json({ done: true, prompt_eval_count: 10, eval_count: 5, message: requests === 1
          ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'write_file', arguments: { path: 'hello.txt', content: 'Hello' } } }] }
          : { role: 'assistant', content: 'Created hello.txt.' } })
      }
    })
    assert.equal(tokens, 30)
    assert.equal(executed, 1)
    assert.equal(tokenLimits(db).status()[0].used, 30)
    assert.match(log.join(''), /File created/)
  } finally { db.close() }
})

test('cancelled provider work retains estimated usage and truncated output is rejected', async () => {
  const db = new DatabaseSync(':memory:')
  const budget = tokenLimits(db)
  const controller = new AbortController()
  const config = { messages: [{ role: 'user', content: 'Create a file' }], endpoint: 'http://fixture', signal: controller.signal, budget, execute: async () => { throw new Error('Must not execute') }, onDelta: () => {} }
  try {
    await assert.rejects(runAgent({ ...config, request: async () => { controller.abort(); throw controller.signal.reason } }), { name: 'AbortError' })
    assert.ok(budget.status()[0].used > 0)
    assert.equal(budget.status()[0].estimated, true)
    await assert.rejects(runAgent({ ...config, signal: new AbortController().signal, request: async () => Response.json({ done: true, done_reason: 'length', prompt_eval_count: 10, eval_count: 1024, message: { role: 'assistant', content: 'unfinished' } }) }), /response limit/)
  } finally { db.close() }
})
