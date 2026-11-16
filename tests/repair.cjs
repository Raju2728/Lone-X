const { test } = require('node:test')
const assert = require('node:assert/strict')
const { proposeSourceFix } = require('../desktop/ai.cjs')
test('repair proposals reject missing, ambiguous, unchanged and invalid source edits', async () => {
  const saved = global.fetch
  const input = { source: 'exports.double = value => value + 2;\n', testOutput: 'assertion failed' }
  try {
    for (const [before, after, expected] of [['', '', null], ['missing', 'other', null], ['value + 2', ' value + 2 ', null], ['value + 2', '```code```', null], ['value + 2', 'value * 2', 'exports.double = value => value * 2;\n']]) {
      global.fetch = async () => new Response(JSON.stringify({ message: { content: JSON.stringify({ diagnosis: 'Fixture diagnosis', before, after }) }, done: true }))
      assert.equal((await proposeSourceFix('qwen3:4b-instruct', input, AbortSignal.timeout(1000))).replacement, expected)
    }
    global.fetch = async () => new Response(JSON.stringify({ message: { content: JSON.stringify({ diagnosis: 'Fixture', before: 'value', after: 'other' }) }, done: true }))
    assert.equal((await proposeSourceFix('qwen3:4b-instruct', { source: 'value + value' }, AbortSignal.timeout(1000))).replacement, null)
    for (const invalid of [{ diagnosis: '', before: 'x', after: 'y' }, { diagnosis: 'x', before: 'x', after: 42 }, { diagnosis: 'x', before: 'x', after: 'y'.repeat(6001) }, { diagnosis: 'x', before: 'x', after: 'y\0' }]) {
      global.fetch = async () => new Response(JSON.stringify({ message: { content: JSON.stringify(invalid) }, done: true }))
      await assert.rejects(proposeSourceFix('qwen3:4b-instruct', input, AbortSignal.timeout(1000)), /usable diagnosis/)
    }
  } finally { global.fetch = saved }
})
