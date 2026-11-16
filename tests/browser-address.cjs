const { test } = require('node:test')
const assert = require('node:assert/strict')
const { approvedAddress, approvedOrigins } = require('../desktop/browser-address.cjs')

test('domain inputs use HTTPS without allowing credentials or other schemes', () => {
  assert.equal(approvedAddress(' google.com ').href, 'https://google.com/')
  assert.equal(approvedAddress('youtube.com/watch?v=test').hostname, 'youtube.com')
  for (const input of ['http://google.com', 'javascript:alert(1)', 'file:///C:/Windows', 'https://user:password@google.com', 'localhost', '']) {
    assert.throws(() => approvedAddress(input))
  }
})

test('an approved host pair cannot expand through www chains, ports or lookalike domains', () => {
  const origins = approvedOrigins(approvedAddress('google.com'))
  assert.deepEqual(origins, ['https://google.com', 'https://www.google.com'])
  for (const origin of ['https://www.www.google.com', 'https://google.com.attacker.test', 'https://accounts.google.com', 'http://www.google.com', 'https://www.google.com:444']) assert.equal(origins.includes(origin), false)
  assert.deepEqual(approvedOrigins(approvedAddress('https://www.google.com')), ['https://www.google.com', 'https://google.com'])
  assert.deepEqual(approvedOrigins(approvedAddress('https://127.0.0.1')), ['https://127.0.0.1'])
})
