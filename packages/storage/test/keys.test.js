const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKeyStore } = require('../src');

// Reversible stand-in for safeStorage.
const crypto = {
  encryptString: (s) => Buffer.from(s).reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString(),
};

test('saves keys independently, encrypted, and reloads them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revelio-keys-'));
  const file = path.join(dir, 'keys.json');
  try {
    const store = createKeyStore(file, crypto);
    assert.deepStrictEqual(store.list(), {});
    assert.deepStrictEqual(store.set('openrouter', '  sk-or-abcd1234 '), { last4: '1234' });
    store.set('openai', 'sk-zzzz9999');
    store.set('openrouter', 'sk-or-new-5678');
    const again = createKeyStore(file, crypto); // fresh instance = app restart
    assert.deepStrictEqual(again.list(), { openrouter: { last4: '5678' }, openai: { last4: '9999' } });
    assert.strictEqual(again.get('openai'), 'sk-zzzz9999');
    assert.strictEqual(again.get('google'), null);
    assert.ok(!fs.readFileSync(file, 'utf8').includes('sk-'), 'stored plaintext');
    for (const [id, key] of [['openai', ''], ['../x', 'k'], ['openai', 42]]) assert.throws(() => store.set(id, key), /invalid key/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
