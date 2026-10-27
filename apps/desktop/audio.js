// Audio capture + transcription pipeline: mic -> 'you', system audio -> 'interviewer'.
// Each source is buffered as 16 kHz mono s16le and sent to whisper every WINDOW_MS.
const { spawn } = require('node:child_process');
const { toMono16k, rms, SAMPLE_RATE } = require('@revelio/transcriber');

let portAudio = null;
try { portAudio = require('naudiodon'); } catch {} // optional native dep (needs node-gyp); falls back to SoX

const WINDOW_MS = 3000;
const SILENCE_RMS = 0.005; // whisper invents text on silence, so quiet windows are skipped
// shortcut: naudiodon's bundled PortAudio has no WASAPI loopback API, so system audio needs a loopback-style
// input device ("Stereo Mix" or a virtual cable). Upgrade to Electron's desktopCapturer loopback (docs/architecture.md) if that's not enough.
const LOOPBACK = /loopback|stereo mix|what u hear|wave out|cable output/i;
const SOURCES = [['mic', 'you'], ['system', 'interviewer']];

function openPortAudio(source, onData, onError) {
  let dev = { id: -1, defaultSampleRate: SAMPLE_RATE, maxInputChannels: 1 }; // default input; MME resamples to 16 kHz
  if (source === 'system') {
    const inputs = portAudio.getDevices().filter((d) => d.maxInputChannels > 0 && LOOPBACK.test(d.name));
    dev = inputs.find((d) => d.hostAPIName === 'MME') || inputs[0];
    if (!dev) throw new Error('no loopback input device — enable "Stereo Mix" in Windows Sound settings');
  }
  const rate = dev.defaultSampleRate;
  const channels = Math.min(2, dev.maxInputChannels);
  const io = new portAudio.AudioIO({
    inOptions: { deviceId: dev.id, sampleRate: rate, channelCount: channels, sampleFormat: portAudio.SampleFormat16Bit, closeOnError: true },
  });
  io.on('data', (buf) => onData(toMono16k(buf, rate, channels)));
  io.on('error', onError);
  io.start();
  return { stop: () => io.quit() };
}

function openSox(source, onData, onError) {
  const device = source === 'mic' ? 'default' : 'Stereo Mix';
  const proc = spawn('sox', ['-q', '-t', 'waveaudio', device, '-t', 'raw', '-r', String(SAMPLE_RATE), '-c', '1', '-b', '16', '-e', 'signed-integer', '-'], { windowsHide: true });
  let err = '';
  proc.stdout.on('data', onData);
  proc.stderr.on('data', (d) => { err += d; });
  proc.on('error', (e) => onError(e.code === 'ENOENT' ? new Error('naudiodon not installed and sox not on PATH') : e));
  proc.on('exit', (code) => code && onError(new Error(`sox (${device}) exited ${code}: ${err.trim()}`)));
  return { stop: () => proc.kill() };
}

function createPipeline({ transcriber, onTranscript, onStatus, open = portAudio ? openPortAudio : openSox }) {
  let status = { state: 'idle', backend: portAudio ? 'naudiodon' : 'sox', mic: null, system: null, message: '' };
  let streams = [];
  let timer = null;

  const set = (patch) => {
    status = { ...status, ...patch };
    const problems = ['mic', 'system'].filter((s) => status[s] && status[s] !== 'ok').map((s) => `${s}: ${status[s]}`);
    if (!patch.message && status.state !== 'error') status.message = problems.join(' · ');
    onStatus(status);
    return status;
  };

  const flush = (s) => {
    const buf = Buffer.concat(s.chunks);
    const at = s.since;
    s.chunks = [];
    s.since = new Date();
    if (rms(buf) < SILENCE_RMS) return;
    // shortcut: fixed 3 s windows can split a word at the boundary; upgrade to VAD-segmented chunks if accuracy suffers.
    transcriber.transcribe(buf)
      .then((text) => text && onTranscript({ speaker: s.speaker, text, timestamp: at.toISOString() }))
      .catch((err) => console.warn(`[audio] ${s.source} chunk failed:`, err.message));
  };

  async function start() {
    if (status.state === 'recording' || status.state === 'starting') return status;
    set({ state: 'starting', mic: null, system: null, message: '' });
    try {
      await transcriber.start();
    } catch (err) {
      return set({ state: 'error', message: err.message });
    }
    if (status.state !== 'starting') return status; // stopped while whisper was loading
    const result = {};
    for (const [source, speaker] of SOURCES) {
      const s = { source, speaker, chunks: [], since: new Date() };
      const fail = (err) => {
        if (!streams.includes(s)) return; // late error from a stream we already stopped
        streams =streams.filter((x) => x !== s);
        set(streams.length ? { [source]: err.message } : { state: 'error', [source]: err.message, message: err.message });
        if (!streams.length) stop();
      };
      try {
        s.handle = open(source, (buf) => s.chunks.push(buf), fail);
        streams.push(s);
        result[source] = 'ok';
      } catch (err) {
        result[source] = err.message;
      }
    }
    if (!streams.length) return set({ state: 'error', ...result, message: `no audio source could start — ${result.mic}` });
    timer = setInterval(() => streams.forEach(flush), WINDOW_MS);
    return set({ state: 'recording', ...result });
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    for (const s of streams) {
      flush(s); // keep the last partial window
      try { s.handle.stop(); } catch {}
    }
    streams = [];
    return status.state === 'error' ? status : set({ state: 'idle', mic: null, system: null, message: '' });
  }

  function fail(err) {
    stop();
    set({ state: 'error', message: err.message });
  }

  return { start, stop, fail, status: () => status };
}

module.exports = { createPipeline };
