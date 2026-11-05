const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DatabaseSync } = require('node:sqlite')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { tokenLimits, windows } = require('../desktop/token-limits.cjs')
const { streamReply } = require('../desktop/ai.cjs')

test('independent windows start on first request and survive restarts', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'lone-x-limits-'))
  const filename = path.join(folder, 'usage.sqlite')
  let db = new DatabaseSync(filename)
  let now = 1000000
  try {
    let budget = tokenLimits(db, () => now)
    assert.ok(budget.status().every(item => item.resetsAt === null && item.used === 0))
    const settle = budget.begin()
    settle(100000)
    settle(900000) // A single request must never be charged twice.
    assert.throws(() => budget.begin(), /Token limit reached/)
    db.close()
    db = new DatabaseSync(filename)
    budget = tokenLimits(db, () => now)
    assert.equal(budget.status()[0].used, 100000)
    now += windows[0].duration
    assert.equal(budget.status()[0].used, 0)
    assert.equal(budget.status()[1].used, 100000)
    budget.begin()(900000)
    assert.throws(() => budget.begin(), /Token limit reached/)
    now += windows[0].duration
    assert.throws(() => budget.begin(), /Token limit reached/)
    now = 1000000 + windows[1].duration
    assert.ok(budget.status().every(item => item.used === 0 && item.resetsAt === null))
    budget.begin()(10)
    assert.ok(budget.status().every(item => item.used === 10))
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }) }
})

test('late completion is attributed to its original windows', () => {
  const db = new DatabaseSync(':memory:')
  let now = 1000000
  try {
    const budget = tokenLimits(db, () => now)
    const original = budget.begin()
    now += windows[0].duration
    budget.begin()(20)
    original(30, true)
    assert.equal(budget.status()[0].used, 20)
    assert.equal(budget.status()[1].used, 50)
    assert.equal(budget.status()[1].estimated, true)
  } finally { db.close() }
})

const messages = [{ role: 'user', content: 'Hello' }]
const response = events => async () => new Response(events.map(event => typeof event === 'string' ? event : JSON.stringify(event)).join('\n'))
const run = (budget, request, onDelta = () => {}) => streamReply('qwen2.5:0.5b', messages, onDelta,
  new AbortController().signal, request, 'http://fixture', undefined, 384, undefined, budget)

test('reported input and output count together; exhaustion blocks the provider call', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const budget = tokenLimits(db)
    const result = await run(budget, response([{ message: { content: 'Hi' }, done: true, prompt_eval_count: 99999, eval_count: 2 }]))
    assert.equal(result, 100001)
    assert.equal(budget.status()[0].used, 100001)
    assert.equal(budget.status()[0].remaining, 0)
    await assert.rejects(run(budget, () => { throw new Error('Provider must not run') }), /Token limit reached/)
  } finally { db.close() }
})

test('interrupted, malformed and uncounted streams retain conservative usage', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const budget = tokenLimits(db)
    await assert.rejects(run(budget, response([{ message: { content: 'partial' } }])), /ended before completion/)
    const afterInterrupted = budget.status()[0].used
    assert.ok(afterInterrupted > 7)
    assert.equal(budget.status()[0].estimated, true)
    await assert.rejects(run(budget, response(['not-json'])), SyntaxError)
    assert.ok(budget.status()[0].used > afterInterrupted)
    const uncounted = await run(budget, response([{ message: { content: 'Hi' }, done: true }]))
    assert.ok(uncounted > 2)
    const beforeCancel = budget.status()[0].used
    await assert.rejects(run(budget, response([{ message: { content: 'cancelled' } }]), () => { throw new Error('cancel') }), /cancel/)
    assert.ok(budget.status()[0].used > beforeCancel)
  } finally { db.close() }
})

test('connection and HTTP failures do not consume tokens', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    const budget = tokenLimits(db)
    await assert.rejects(run(budget, async () => { throw new Error('offline') }), /Could not reach/)
    await assert.rejects(run(budget, async () => new Response('', { status: 500 })), /HTTP 500/)
    assert.ok(budget.status().every(item => item.used === 0))
  } finally { db.close() }
})
