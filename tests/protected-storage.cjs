const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

test('async protected storage preserves plaintext for callers and supports key rotation without fallback', async () => {
  const load = Module._load
  const filename = require.resolve('../desktop/protected-storage.cjs')
  let available = true
  let rotate = false
  const safeStorage = {
    isAsyncEncryptionAvailable: async () => available,
    getSelectedStorageBackend: () => 'test',
    encryptStringAsync: async value => Buffer.from('protected:' + value),
    decryptStringAsync: async bytes => ({ result: bytes.toString().slice(10), shouldReEncrypt: rotate })
  }
  try {
    Module._load = function (name, ...args) { return name === 'electron' ? { safeStorage } : load.call(this, name, ...args) }
    delete require.cache[filename]
    const storage = require(filename)
    const bytes = await storage.encrypt('receipt')
    assert.deepEqual(await storage.decrypt(bytes), { text: 'receipt', replacement: null })
    rotate = true
    assert.deepEqual(await storage.decrypt(bytes), { text: 'receipt', replacement: bytes })
    available = false
    await assert.rejects(storage.encrypt('secret'), /unavailable/)
    await assert.rejects(storage.decrypt(bytes), /unavailable/)
  } finally { Module._load = load; delete require.cache[filename] }
})
