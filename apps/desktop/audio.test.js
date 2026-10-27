// node --test apps/desktop/audio.test.js — fake capture + fake whisper.
const test = require('node:test');
const assert = require('node:assert');
const { createPipeline } = require('./audio');

test('loud windows are transcribed per speaker, silent ones skipped', async () => {
  const feeds = {};
  const entries = [];
  const p = createPipeline({
    transcriber: { start: async () => {}, transcribe: async (buf) => `${buf.length} bytes` },
    onTranscript: (e) => entries.push(e),
    onStatus: () => {},
    open: (source, onData) => { feeds[source] = onData; return { stop() {} }; },
  });
  assert.strictEqual((await p.start({ sourceId: 'window:1' })).state, 'recording');
  feeds.mic(Buffer.alloc(3200, 0x40));   // loud
  feeds.system(Buffer.alloc(3200));      // silence
  assert.strictEqual(p.stop().state, 'idle'); // stop flushes the partial window
  await new Promise((r) => setImmediate(r));
  assert.deepStrictEqual(entries.map(({ speaker, text }) => ({ speaker, text })), [{ speaker: 'you', text: '3200 bytes' }]);
  assert.ok(!Number.isNaN(Date.parse(entries[0].timestamp)));
});

test('whisper failing to start reports an error state', async () => {
  const p = createPipeline({
    transcriber: { start: async () => { throw new Error('bin missing'); } },
    onTranscript: () => {}, onStatus: () => {}, open: () => assert.fail('should not open'),
  });
  assert.deepStrictEqual([(await p.start()).state, p.status().message], ['error', 'bin missing']);
});

test('without a meeting window only the mic runs; renderer audio arrives via feed()', async () => {
  const entries = [];
  const p = createPipeline({
    transcriber: { start: async () => {}, transcribe: async () => 'hello' },
    onTranscript: (e) => entries.push(e),
    onStatus: () => {},
  });
  const s = await p.start();
  assert.deepStrictEqual([s.state, s.system], ['recording', 'no meeting window selected']);
  if (s.renderer.includes('mic')) { // no naudiodon/sox on this machine: mic comes from the renderer
    p.feed('mic', new Uint8Array(3200).fill(0x40));
    p.stop();
    await new Promise((r) => setImmediate(r));
    assert.deepStrictEqual(entries.map((e) => e.speaker), ['you']);
  } else p.stop();
});
