// whisper.cpp integration: runs whisper-server (bin/whisper.exe) as a child process and POSTs WAV chunks to it.
// Setup: scripts/setup-whisper.ps1. See docs/architecture.md#transcription
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const pcm = require('./pcm');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', process.platform === 'win32' ? 'whisper.exe' : 'whisper');
const MODEL = path.join(ROOT, 'models', 'ggml-tiny.bin');
const MAX_RESTARTS = 5;

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Emits 'error' only when the server keeps crashing (after MAX_RESTARTS); individual chunk failures reject transcribe().
class Transcriber extends EventEmitter {
  constructor({ bin = BIN, args = [], model = MODEL, language = 'en' } = {}) {
    super();
    Object.assign(this, { bin, args, model, language, proc: null, ready: null, stopped: true, restarts: 0 });
  }

  start() {
    if (this.ready) return this.ready;
    for (const f of [this.bin, this.model]) {
      if (!fs.existsSync(f)) return Promise.reject(new Error(`${f} missing — run packages/transcriber/scripts/setup-whisper.ps1`));
    }
    this.stopped = false;
    this.ready = this.#launch();
    const ready = this.ready;
    ready.catch(() => { if (this.ready === ready) this.ready = null; }); // callers see the error; the next call retries
    return this.ready;
  }

  async #launch() {
    const port = await freePort();
    const proc = spawn(this.bin, [...this.args, '-m', this.model, '-l', this.language, '--host', '127.0.0.1', '--port', String(port)], { windowsHide: true });
    this.proc = proc;
    let log = '';
    const keep = (d) => { log = (log + d).slice(-2000); };
    proc.stdout.on('data', keep);
    proc.stderr.on('data', keep);
    let exited = false;
    proc.once('error', (err) => { exited = true; keep(String(err)); });
    proc.once('exit', (code) => {
      exited = true;
      if (this.proc !== proc || this.stopped) return;
      this.proc = null;
      this.ready = null;
      if (++this.restarts > MAX_RESTARTS) {
        this.stopped = true;
        this.emit('error', new Error(`whisper server keeps exiting (code ${code}): ${log.trim().slice(-300)}`));
        return;
      }
      delay(500 * 2 ** this.restarts).then(() => !this.stopped && this.start());
    });

    // Model load can take a while on first CUDA init.
    const url = `http://127.0.0.1:${port}`;
    for (const deadline = Date.now() + 60_000; Date.now() < deadline;) {
      if (exited) throw new Error(`whisper server exited during startup: ${log.trim().slice(-300)}`);
      try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return url; } catch {}
      await delay(250);
    }
    proc.kill();
    throw new Error('whisper server did not become ready within 60 s');
  }

  // pcmBuffer: 16 kHz mono s16le. Resolves to the recognised text ('' for silence/noise).
  async transcribe(pcmBuffer) {
    const url = await this.start();
    const form = new FormData();
    form.append('file', new Blob([pcm.wav(pcmBuffer)], { type: 'audio/wav' }), 'chunk.wav');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    const res = await fetch(`${url}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`whisper server HTTP ${res.status}`);
    const { text = '' } = await res.json();
    this.restarts = 0;
    // whisper marks non-speech as [BLANK_AUDIO], (music), etc.
    return text.replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  }

  stop() {
    this.stopped = true;
    this.ready = null;
    this.proc?.kill();
    this.proc = null;
  }
}

module.exports = { Transcriber, ...pcm };
