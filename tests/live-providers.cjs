const { streamReply } = require('../desktop/ai.cjs')

const checks = [
  { provider: 'ollama', variable: 'LONEX_OLLAMA_MODEL' },
  { provider: 'openai', variable: 'LONEX_OPENAI_MODEL', credential: 'OPENAI_API_KEY' }
]

async function check({ provider, variable, credential }) {
  const missing = [variable, credential].filter(name => name && !process.env[name]?.trim())
  if (missing.length) {
    console.error(provider + ': missing ' + missing.join(', '))
    return false
  }

  let output = ''
  try {
    await streamReply(provider, process.env[variable].trim(),
      [{ role: 'user', content: 'Reply with the single word Ready.' }],
      delta => { output += delta }, AbortSignal.timeout(60000))
    if (!output.trim()) throw new Error('Provider returned no text.')
    console.log(provider + ': streamed text and completed successfully.')
    return true
  } catch (error) {
    console.error(provider + ': ' + error.message)
    return false
  }
}

async function main() {
  const results = []
  for (const configuration of checks) results.push(await check(configuration))
  if (results.some(passed => !passed)) process.exitCode = 1
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
