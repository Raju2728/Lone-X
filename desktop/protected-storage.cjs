const { safeStorage } = require('electron')

async function available() {
  return await safeStorage.isAsyncEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
}

async function encrypt(text) {
  if (!await available()) throw new Error('Protected storage is unavailable.')
  return safeStorage.encryptStringAsync(text)
}

async function decrypt(bytes) {
  if (!await available()) throw new Error('Protected storage is unavailable.')
  const value = await safeStorage.decryptStringAsync(Buffer.from(bytes))
  return { text: value.result, replacement: value.shouldReEncrypt ? await encrypt(value.result) : null }
}

module.exports = { available, encrypt, decrypt }
