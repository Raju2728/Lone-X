const language = require('./language.json')

function proseOnly(prompt) {
  return String(prompt ?? '').split(/\n\nFile:/)[0]
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/`[^`\r\n]*`|"[^"\r\n]*"|(?<!\w)'[^'\r\n]*'(?!\w)/g, ' ')
    .replace(/[a-z]:[\\/][^\s]+|\b[\w-]+\.(?:txt|md|json|[cm]?[jt]sx?|py|html?|css|csv|ya?ml|log|xml)\b/gi, ' ')
}

function requestLanguage(prose) {
  prose = prose.replace(/\b(?:do not|don't|dont)\s+(?:reply|respond|answer|explain|speak|use)\s+(?:in\s+)?(?:english|thanglish|tanglish)\b/gi, ' ')
  prose = prose.replace(/\b(?:english|thanglish|tanglish)\s+(?:la\s+)?(?:illama|vendam|venam)\b/gi, ' ')
  if (/\b(?:use|prefer|switch to)\s+english\b/i.test(prose)) return 'english'
  if (/\b(?:use|prefer|switch to)\s+(?:thanglish|tanglish)\b/i.test(prose)) return 'thanglish'
  if (/^english[.!?\s]*$/i.test(prose) || /\benglish\s+(?:la|le)\b/i.test(prose)) return 'english'
  if (/^(?:thanglish|tanglish)[.!?\s]*$/i.test(prose) || /\b(?:thanglish|tanglish)\s+(?:la|le)\b/i.test(prose)) return 'thanglish'
  if (/\b(?:reply|respond|answer|explain|speak)\s+(?:only\s+)?(?:in\s+)?english\b|\benglish\s+(?:la\s+)?(?:sollu|sollunga|please)\b/i.test(prose)) return 'english'
  if (/\b(?:reply|respond|answer|explain|speak)\s+(?:only\s+)?(?:in\s+)?(?:thanglish|tanglish)\b|\b(?:thanglish|tanglish)\s+(?:la\s+)?(?:sollu|sollunga|please)\b/i.test(prose)) return 'thanglish'
  return null
}

function isThanglish(prose) {
  if (new RegExp('\\b(?:' + language.strongMarkers + ')\\b', 'i').test(prose)) return true
  const weak = prose.toLowerCase().match(new RegExp('\\b(?:' + language.weakMarkers + ')\\b', 'g')) ?? []
  return new Set(weak).size >= 2
}

function responseLanguage(prompt, { history = [], preference = 'auto' } = {}) {
  const prose = proseOnly(prompt)
  const explicit = requestLanguage(prose)
  if (explicit) return explicit
  if (preference === 'thanglish' || preference === 'english') return preference
  if (isThanglish(prose)) return 'thanglish'
  const users = history.filter(message => message.role === 'user').slice(-30).reverse()
  // Only user instructions can set a lasting preference, not file/tool/assistant text.
  for (const message of users) {
    const previous = requestLanguage(proseOnly(message.content))
    if (previous) return previous
  }
  const neutral = /^(?:ok(?:ay)?|yes|no|sure|continue|next|go on|thanks|thank you|explain more|more|why|how|example|another example|hmm)[\s.!?]*$/i.test(prose.trim())
  if (neutral) {
    const previous = users.find(message => {
      const value = proseOnly(message.content).trim()
      return value && !/^(?:ok(?:ay)?|yes|no|sure|continue|next|go on|thanks|thank you|explain more|more|why|how|example|another example|hmm)[\s.!?]*$/i.test(value)
    })
    if (previous && isThanglish(proseOnly(previous.content))) return 'thanglish'
  }
  return 'auto'
}

function languageInstruction(prompt, options) {
  const selected = responseLanguage(prompt, options)
  return language.instruction + (selected === 'thanglish'
    ? ' For THIS reply, write natural conversational Tamil in Latin letters (Thanglish). Do not switch to Tamil script. Use Tamil sentence structure with familiar English technical terms. Answer the actual question directly and helpfully; do not translate the prompt instead of answering it. Keep each explanation in Thanglish rather than adding separate English and Tamil sections. Avoid canned phrases, unrelated questions, repeated introductions, exaggerated slang and emojis. Be warm and respectful, with short clear sentences. Preserve every quoted value and path exactly. Code syntax stays unchanged, and code blocks contain only actual code.'
    : selected === 'english' ? ' The user explicitly requested English; reply in English.' : '')
}

module.exports = { languageInstruction, responseLanguage }
