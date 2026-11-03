const { streamReply } = require('../desktop/ai.cjs')

async function main() {
  const model = process.env.LONEX_OLLAMA_MODEL?.trim()
  if (!model) throw new Error('Set LONEX_OLLAMA_MODEL to an installed model name.')

  let output = ''
  await streamReply(model, [{ role: 'user', content: 'Reply with the single word Ready.' }],
    delta => { output += delta }, AbortSignal.timeout(60000))
  if (!output.trim()) throw new Error('Ollama returned no text.')
  console.log('ollama: streamed text and completed successfully.')
}

main().catch(error => {
  console.error('ollama: ' + error.message)
  process.exitCode = 1
})
