// Audio capture + transcription pipeline: mic -> 'you', meeting window audio -> 'interviewer'.
// Each source is buffered as 16 kHz mono s16le and sent to whisper every WINDOW_MS.
// Mic: naudiodon, else SoX, else the renderer's getUserMedia. Meeting audio: always the renderer (getUserMedia with a
// desktopCapturer chromeMediaSourceId — main has no getUserMedia), streamed back over IPC into feed().
const { spawn, spawnSync } = require('node:child_process');
const { rms, SAMPLE_RATE } = require('@revelio/transcriber');

let portAudio = null;
try { portAudio = require('naudiodon'); } catch {} // optional native dep (needs node-gyp)
const hasSox = !portAudio && !spawnSync('sox', ['--version'], { windowsHide: true }).error;

const WINDOW_MS = 3000;
const SILENCE_RMS = 0.005; // whisper invents text on silence, so quiet windows are skipped
const SOURCES = [['mic', 'you'], ['system', 'interviewer']];

function openPortAudio(onData, onError) {
  // default input device; MME resamples to 16 kHz mono for us
  const io = new portAudio.AudioIO({
    inOptions: { deviceId: -1, sampleRate: SAMPLE_RATE, channelCount: 1, sampleFormat: portAudio.SampleFormat16Bit, closeOnError: true },
  });
  io.on('data', onData);
  io.on('error', onError);
  io.start();
  return { stop: () => io.quit() };
}

function openSox(onData, onError) {
  const proc = spawn('sox', ['-q', '-t', 'waveaudio', 'default', '-t', 'raw', '-r', String(SAMPLE_RATE), '-c', '1', '-b', '16', '-e', 'signed-integer', '-'], { windowsHide: true });
  let err = '';
  proc.stdout.on('data', onData);
  proc.stderr.on('data', (d) => { err += d; });
  proc.on('error', onError);
  proc.on('exit', (code) => code && onError(new Error(`sox exited ${code}: ${err.trim()}`)));
  return { stop: () => proc.kill() };
}

const nativeMic = portAudio ? openPortAudio : hasSox ? openSox : null;

// Windows/screens the user can pick as the meeting audio source.
async function getSources() {
  const { desktopCapturer } = require('electron');
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 0, height: 0 } });
  return sources.map(({ id, name }) => ({ id, name }));
}

function createPipeline({ transcriber, onTranscript, onStatus, open }) {
  const feeds = {}; // source -> { onData, onError } for audio captured in the renderer
  const openRenderer = (source, onData, onError) => {
    feeds[source] = { onData, onError };
    return { renderer: true, stop: () => { if (feeds[source]?.onData === onData) delete feeds[source]; } };
  };
  open ??= (source, onData, onError) => (source === 'mic' && nativeMic ? nativeMic(onData, onError) : openRenderer(source, onData, onError));

  let status = { state: 'idle', mic: null, system: null, renderer: [], message: '' };
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

  // sourceId: desktopCapturer id of the meeting window/screen; without one only the mic is transcribed.
  async function start({ sourceId } = {}) {
    if (status.state === 'recording' || status.state === 'starting') return status;
    set({ state: 'starting', mic: null, system: null, renderer: [], message: '' });
    try {
      await transcriber.start();
    } catch (err) {
      return set({ state: 'error', message: err.message });
    }
    if (status.state !== 'starting') return status; // stopped while whisper was loading
    const result = { renderer: [] };
    for (const [source, speaker] of SOURCES) {
      if (source === 'system' && !sourceId) { result.system = 'no meeting window selected'; continue; }
      const s = { source, speaker, chunks: [], since: new Date() };
      const fail = (err) => {
        if (!streams.includes(s)) return; // late error from a stream we already stopped
        streams = streams.filter((x) => x !== s);
        set(streams.length ? { [source]: err.message } : { state: 'error', [source]: err.message, message: err.message });
        if (!streams.length) stop();
      };
      try {
        s.handle = open(source, (buf) => s.chunks.push(buf), fail);
        streams.push(s);
        result[source] = 'ok';
        if (s.handle.renderer) result.renderer.push(source);
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
    return status.state === 'error' ? status : set({ state: 'idle', mic: null, system: null, renderer: [], message: '' });
  }

  function fail(err) {
    stop();
    set({ state: 'error', message: err.message });
  }

  // From the renderer: 16 kHz mono s16le PCM, or a capture error.
  const feed = (source, pcm) => feeds[source]?.onData(Buffer.from(pcm));
  const feedError = (source, message) => feeds[source]?.onError(new Error(message));

  return { start, stop, fail, feed, feedError, status: () => status };
}

module.exports = { createPipeline, getSources };
