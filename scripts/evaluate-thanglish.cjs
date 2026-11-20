const fs = require('node:fs/promises')
const path = require('node:path')
const { streamReply } = require('../desktop/ai.cjs')
const { languageInstruction } = require('../desktop/language.cjs')
const seed = require('../training/thanglish/seed.json')
const models = ['qwen2.5:0.5b', 'qwen2.5-coder:0.5b', 'gemma3:1b', 'gemma3:4b', 'qwen3:4b-instruct']
async function main() {
  const folder = path.resolve(__dirname, '../training/thanglish')
  const system = 'You are Raju, the Lone X local assistant. This test has no file or PC action tools. ' + languageInstruction('Thanglish la sollunga', { preference: 'thanglish' })
  await fs.writeFile(path.join(folder, 'train.jsonl'), seed.train.map(([user, assistant]) => JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }, { role: 'assistant', content: assistant }] })).join('\n') + '\n')
  await fs.writeFile(path.join(folder, 'evaluation.jsonl'), seed.evaluation.map(item => JSON.stringify(item)).join('\n') + '\n')
  if (!process.argv.includes('--live')) { console.log('Prepared 24 original synthetic training records; no weights trained.'); return }
  const inventory = await (await fetch('http://127.0.0.1:11434/api/tags')).json()
  const installed = new Set(inventory.models?.map(item => item.name))
  const output = path.resolve(__dirname, '../test-artifacts/thanglish-adaptation-results.json')
  const examplesOnly = process.argv.includes('--examples-only')
  const results = examplesOnly ? JSON.parse(await fs.readFile(output, 'utf8')).results.filter(item => item.mode === 'baseline') : []
  await fs.mkdir(path.dirname(output), { recursive: true })
  for (const model of models) {
    for (const mode of examplesOnly ? ['examples'] : ['baseline', 'examples']) {
      for (const item of seed.evaluation) {
        let response = '', error = null
        const topics = { routine: [1, 15, 14], explanation: [3, 4, 19], literal: [9, 10, 11] }
        const examples = mode === 'examples' ? topics[item.id].map(index => seed.train[index]).flatMap(([user, assistant]) => [{ role: 'user', content: user }, { role: 'assistant', content: assistant }]) : []
        if (!installed.has(model)) error = 'Model is not installed'
        else try {
          await streamReply(model, [{ role: 'system', content: system }, ...examples, { role: 'user', content: item.prompt }], delta => { response += delta }, AbortSignal.timeout(90000), fetch, 'http://127.0.0.1:11434', undefined, 160, 0.2)
        } catch (failure) { error = failure.message }
        results.push({ model, mode, id: item.id, prompt: item.prompt, response, error, nonempty: !!response.trim(), latinScript: !/[\u0b80-\u0bff]/u.test(response), review: item.review })
        await fs.writeFile(output, JSON.stringify({ method: 'in-context examples only; no weight training', humanReviewRequired: true, results }, null, 2))
        console.log(JSON.stringify({ model, mode, id: item.id, error, nonempty: !!response.trim() }))
      }
    }
  }
  console.log('Completed all five models. Fluency and correctness require review: ' + output)
  if (results.some(item => item.error)) process.exitCode = 1
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
