const fs = require('node:fs/promises')
const path = require('node:path')
const { streamReply } = require('../desktop/ai.cjs')
const { languageInstruction } = require('../desktop/language.cjs')

async function main() {
  if (process.env.LONEX_LANGUAGE_LIVE !== '1') throw new Error('Set LONEX_LANGUAGE_LIVE=1 to evaluate installed local models. No models are downloaded.')
  const supported = ['qwen3:4b-instruct', 'qwen2.5:0.5b', 'qwen2.5-coder:0.5b', 'gemma3:1b', 'gemma3:4b']
  const models = process.env.LONEX_LANGUAGE_MODELS?.split(',') ?? supported.slice(0, 4)
  if (!models.length || models.some(model => !supported.includes(model))) throw new Error('Choose a supported local test model.')
  const endpoint = new URL(process.env.LONEX_OLLAMA_ENDPOINT || 'http://127.0.0.1:11434')
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password || endpoint.pathname !== '/') throw new Error('Use a loopback Ollama test endpoint.')
  const cases = [
    'Enakku coding pudhusu. Variable na enna? Oru simple Python example kudunga.',
    'Naalaikku interview irukku. Konjam bayama irukku; epdi prepare panradhu?'
  ]
  const results = []
  for (const model of models) {
    for (const prompt of cases) {
      let response = ''
      const started = Date.now()
      await streamReply(model, [{ role: 'system', content: 'You are Raju, the Lone X local AI assistant. This is ordinary conversation without PC action tools. ' + languageInstruction(prompt, { preference: 'thanglish' }) }, { role: 'user', content: prompt }],
        delta => { response += delta }, AbortSignal.timeout(180000), fetch, endpoint.origin, undefined, 384, 0.2)
      const result = { model, prompt, response, elapsedMs: Date.now() - started,
        nonempty: !!response.trim(), latinScript: !/[\u0b80-\u0bff\u3400-\u9fff]/u.test(response) }
      results.push(result)
      console.log(JSON.stringify(result))
    }
  }
  const output = path.resolve(__dirname, '../test-artifacts/thanglish-live-results.json')
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, JSON.stringify({ note: 'Human review is required for correctness and fluency; script checks do not certify language quality.', results }, null, 2))
  if (results.some(result => !result.nonempty)) throw new Error('A model returned no answer.')
  console.log('Saved live outputs for human review: ' + output)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
