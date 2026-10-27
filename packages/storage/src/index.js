// Local stores. SQLite + Google Drive sync — Phase 2, see docs/architecture.md#storage.
const fs = require('node:fs');
const path = require('node:path');

// API keys, encrypted per value with `crypto` ({ encryptString, decryptString }, i.e. Electron safeStorage).
// shortcut: a JSON file until the SQLite settings table exists; move into it then.
function createKeyStore(file, crypto) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw err;
    }
  };

  return {
    // { [provider]: { last4 } } — never the keys themselves (they stay in main).
    list() {
      return Object.fromEntries(Object.entries(read()).map(([id, enc]) => [id, { last4: crypto.decryptString(Buffer.from(enc, 'base64')).slice(-4) }]));
    },
    get(id) {
      const enc = read()[id];
      return enc ? crypto.decryptString(Buffer.from(enc, 'base64')) : null;
    },
    // Updates one provider, leaves the others untouched.
    set(id, key) {
      if (!/^[a-z]+$/.test(id) || typeof key !== 'string' || !key.trim() || key.length > 1000) throw new Error('invalid key');
      const all = { ...read(), [id]: crypto.encryptString(key.trim()).toString('base64') };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(all, null, 2));
      fs.renameSync(`${file}.tmp`, file); // atomic, so a crash never leaves a half-written file
      return { last4: key.trim().slice(-4) };
    },
  };
}

module.exports = { createKeyStore };
