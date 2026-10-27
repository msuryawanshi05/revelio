// node --test packages/transcriber/test/*.test.js — uses a fake whisper-server, no model needed.
const test = require('node:test');
const assert = require('node:assert');
const { Transcriber, toMono16k, rms, wav } = require('../src');

const FAKE = `
const port = +process.argv[process.argv.indexOf('--port') + 1];
if (process.env.CRASH_ONCE && !require('fs').existsSync(process.env.CRASH_ONCE)) { require('fs').writeFileSync(process.env.CRASH_ONCE, ''); process.exit(3); }
require('http').createServer((req, res) => {
  let n = 0;
  req.on('data', (d) => n += d.length).on('end', () => res.end(req.url === '/inference' ? JSON.stringify({ text: ' [BLANK_AUDIO] hello  world (music) ' + n }) : 'ok'));
}).listen(port, '127.0.0.1');`;

const fake = (env = {}) => {
  Object.assign(process.env, env);
  return new Transcriber({ bin: process.execPath, args: ['-e', FAKE, '--'], model: __filename });
};

test('pcm helpers', () => {
  const stereo48k = Buffer.alloc(48000 * 2 * 2); // 1 s
  for (let i = 0; i < 48000; i++) { stereo48k.writeInt16LE(1000, i * 4); stereo48k.writeInt16LE(3000, i * 4 + 2); }
  const mono = toMono16k(stereo48k, 48000, 2);
  assert.strictEqual(mono.length, 16000 * 2);
  assert.strictEqual(mono.readInt16LE(100), 2000);
  assert.ok(Math.abs(rms(mono) - 2000 / 32768) < 1e-6);
  assert.strictEqual(rms(Buffer.alloc(0)), 0);
  const w = wav(mono);
  assert.strictEqual(w.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(w.readUInt32LE(24), 16000);
  assert.strictEqual(w.readUInt32LE(40), mono.length);
});

test('transcribes via the server and strips non-speech tags', async () => {
  const t = fake();
  try {
    const text = await t.transcribe(Buffer.alloc(3200));
    assert.match(text, /^hello world \d+$/);
  } finally { t.stop(); }
});

test('restarts after the server exits', async () => {
  const marker = require('path').join(require('os').tmpdir(), `revelio-crash-${process.pid}`);
  const t = fake({ CRASH_ONCE: marker });
  try {
    await assert.rejects(t.transcribe(Buffer.alloc(3200)), /exited during startup/);
    await new Promise((r) => setTimeout(r, 1500)); // backoff 1 s, then relaunch
    assert.match(await t.transcribe(Buffer.alloc(3200)), /hello world/);
  } finally {
    t.stop();
    require('fs').rmSync(marker, { force: true });
    delete process.env.CRASH_ONCE;
  }
});

test('missing binary rejects with setup hint', async () => {
  await assert.rejects(new Transcriber({ bin: 'nope.exe' }).transcribe(Buffer.alloc(2)), /setup-whisper/);
});
