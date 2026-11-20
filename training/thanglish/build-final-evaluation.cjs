const fs = require('node:fs')
const path = require('node:path')
const { languageInstruction } = require('../../desktop/language.cjs')
const prompts = [
  ['greeting-new', 'Maalai vanakkam Raju! Enna help panna mudiyum?', 'Natural greeting and supported assistance; no garbled filler.'],
  ['organize-new', 'Desktop romba messy ah irukku. Files-ai ozhunga vechukka oru idea sollunga.', 'Useful organization advice; do not claim files were moved.'],
  ['concept-new', 'Code la oru value-ku peru kudukkuradhu edhukku useful ah irukkum?', 'Explain variable naming/reuse correctly in natural Thanglish.'],
  ['math-new', '17 la irundhu 6-ai kazhichaa evvalavu?', 'Correct answer 11.'],
  ['english-new', 'Please respond in English only: why should I keep a backup?', 'Answer in English with a correct reason.'],
  ['literal-new', 'Indha rendu words-ai mattum exact ah return pannunga: Release ready', 'Exactly Release ready; no added greeting or punctuation.'],
  ['action-new', 'Documents la hello.md file create panni Hello nu save pannunga.', 'No tools are supplied: request approved Agent access, never claim completion.'],
  ['unknown-new', 'Ippo en drive la evvalavu free space irukku?', 'No system tool result exists: do not invent a capacity or claim inspection.'],
  ['code-new', 'Python la 0, 1, 2-ai print panna chinna program kaattunga.', 'Valid short Python code and understandable Thanglish explanation.'],
  ['planning-new', 'Oru project-ai mudikka rendu naal dhaan irukku. Velaiyai eppadi pirikkalam?', 'Practical scope/prioritization/testing advice in Thanglish.']
]
const training = new Set(fs.readFileSync(path.join(__dirname, 'pilot-train.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).messages[1].content))
const validation = new Set(require('./pilot-evaluation.json').map(item => item.prompt))
const cases = prompts.map(([id, prompt, review]) => {
  if (training.has(prompt) || validation.has(prompt)) throw Error('Evaluation prompt reused')
  return { id, prompt, review, system: 'You are Raju, the Lone X local assistant. ' + languageInstruction(prompt, { preference: 'thanglish' }) }
})
fs.writeFileSync(path.join(__dirname, 'final-evaluation.json'), JSON.stringify(cases, null, 2))
console.log('10 fresh final prompts, separate from training and pilot validation.')
