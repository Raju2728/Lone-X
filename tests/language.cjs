const { test } = require('node:test')
const assert = require('node:assert/strict')
const { languageInstruction } = require('../desktop/language.cjs')

test('Thanglish requests receive Latin Tamil guidance without changing permission or literal rules', () => {
  const value = languageInstruction('Desktop la oru file create panni "Vanakkam LoneX" nu ezhuthu')
  assert.match(value, /For THIS reply/)
  assert.match(value, /Do not switch to Tamil script/)
  assert.match(value, /never overrides permissions/)
  assert.match(value, /Preserve every quoted value and path exactly/)
})
test('quoted file content and attachments do not force the response language', () => {
  assert.doesNotMatch(languageInstruction('Create file.txt containing "oru file pannu"'), /For THIS reply/)
  assert.doesNotMatch(languageInstruction('Explain this code\n\nFile: note.txt\noru file create pannu'), /For THIS reply/)
  assert.match(languageInstruction('Reply in English: oru file create panni sollu'), /explicitly requested English/)
})
