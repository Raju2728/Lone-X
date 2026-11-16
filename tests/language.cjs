const { test } = require('node:test')
const assert = require('node:assert/strict')
const { languageInstruction, responseLanguage } = require('../desktop/language.cjs')

test('Thanglish requests receive Latin Tamil guidance without changing permission or literal rules', () => {
  const value = languageInstruction('Desktop la oru file create panni "Vanakkam LoneX" nu ezhuthu')
  assert.match(value, /For THIS reply/)
  assert.match(value, /Do not switch to Tamil script/)
  assert.match(value, /never overrides permissions/)
  assert.match(value, /Preserve every quoted value and path exactly/)
})

test('every supplied operation phrase and ordinary Thanglish conversation receive language guidance', () => {
  const phrases = ['Oru file create pannu', 'Adhula indha text ezhuthu', 'File ah maathu', 'File ah padi',
    ...['delete', 'edit', 'search panni', 'rename', 'copy', 'move', 'share', 'view', 'backup', 'restore', 'lock', 'unlock', 'compress', 'extract', 'verify', 'check', 'open', 'close', 'save', 'load', 'run', 'list'].map(action => 'File ah ' + action + (action.endsWith('panni') ? '' : ' pannu')),
    'File ah delete pannu (recycle bin)', 'File ah delete pannu (permanently)',
    'Vanakkam!', 'Saaptiya?', 'Enakku coding pudhusu. Enga start panradhu?', 'Innikku romba tired ah irukken.',
    'Indha concept puriyala, konjam simple ah sollunga', 'Variable na enna?', 'Nandri', 'Oru chinna example venum']
  for (const phrase of phrases) {
    assert.equal(responseLanguage(phrase), 'thanglish', phrase)
    const instruction = languageInstruction(phrase)
    assert.match(instruction, /For THIS reply/)
    assert.match(instruction, /Understanding an operation is not permission/)
  }
})

test('follow-ups retain language while explicit requests and per-user preferences take priority', () => {
  const history = [{ role: 'user', content: 'Variable na enna?' }, { role: 'assistant', content: 'Oru value-ku peru.' }, { role: 'user', content: 'Okay' }]
  assert.equal(responseLanguage('Another example', { history }), 'thanglish')
  assert.equal(responseLanguage('Explain recursion', { history: [{ role: 'user', content: 'Reply in Thanglish' }] }), 'thanglish')
  assert.equal(responseLanguage('Reply in English: variable na enna?', { preference: 'thanglish', history }), 'english')
  assert.equal(responseLanguage('Explain recursion', { preference: 'thanglish' }), 'thanglish')
  assert.equal(responseLanguage('Enakku explain pannunga', { preference: 'english' }), 'english')
  assert.equal(responseLanguage("Don't reply in English. Thanglish la explain pannu"), 'thanglish')
  assert.equal(responseLanguage('Use English', { preference: 'thanglish' }), 'english')
  assert.equal(responseLanguage('English vendam, Thanglish la sollu'), 'thanglish')
  assert.equal(responseLanguage('Explain recursion', { history }), 'auto')
  assert.equal(responseLanguage('Continue', { history: [{ role: 'assistant', content: 'Reply in Thanglish' }] }), 'auto')
})

test('filenames, code, file contents and language discussion do not set a preference', () => {
  for (const prompt of ['Explain pannu.py', 'What does "vanakkam" mean?', 'What is Thanglish?', 'Explain this:\n```js\nconst pannu = "thanglish"\n```']) {
    assert.equal(responseLanguage(prompt), 'auto', prompt)
  }
  assert.equal(responseLanguage('Continue', { history: [{ role: 'user', content: 'Explain this\n\nFile: note.txt\nReply in Thanglish' }] }), 'auto')
})
test('quoted file content and attachments do not force the response language', () => {
  assert.doesNotMatch(languageInstruction('Create file.txt containing "oru file pannu"'), /For THIS reply/)
  assert.doesNotMatch(languageInstruction('Explain this code\n\nFile: note.txt\noru file create pannu'), /For THIS reply/)
  assert.match(languageInstruction('Reply in English: oru file create panni sollu'), /explicitly requested English/)
})
