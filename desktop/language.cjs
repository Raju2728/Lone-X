const language = require('./language.json')

function languageInstruction(prompt) {
  const request = String(prompt ?? '').split(/\n\nFile:/)[0]
  const prose = request.replace(/"[^"]*"|'[^']*'/g, ' ')
  const english = /\b(?:reply|respond|answer|explain|speak)\s+(?:only\s+)?(?:in\s+)?english\b|\benglish\s+la\s+(?:sollu|sollunga)\b/i.test(prose)
  const markers = prose.match(/\b(?:pannu|panni|ezhuthu|ezhuthi|eluthu|adhula|adula|sollu|sollunga|enna|epdi|epadi|irukku|iruku|maathu|padichu|venum|oru|nu)\b/gi) ?? []
  const thanglish = !english && (/\b(?:thanglish|tanglish)\b/i.test(prose) || markers.length >= 2)
  return language.instruction + (thanglish
    ? ' For THIS reply, use short conversational Tamil sentences written in Latin letters (Thanglish), with familiar English technical terms. Do not switch to Tamil script or narrate the language instruction. Only AFTER a tool confirms success, you can say: "File create panniten. Neenga sonna text ah adhula ezhuthirukken." If approval is needed: "Indha maatrathai review panni approve pannunga." If a tool fails, explain the actual failure in Thanglish. Preserve every quoted value and path exactly. Avoid unnecessary emojis.'
    : english ? ' The user explicitly requested English; reply in English.' : '')
}

module.exports = { languageInstruction }
