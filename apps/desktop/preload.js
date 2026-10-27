const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('revelio', {
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  setPinned: (pinned) => ipcRenderer.send('window:pin', pinned),
  getSources: () => ipcRenderer.invoke('audio:getSources'),
  // sourceId: desktopCapturer id of the meeting window (optional); its audio is transcribed as 'interviewer'.
  startAudio: async (sourceId) => {
    const status = await ipcRenderer.invoke('audio:start', { sourceId });
    if (status.state === 'recording') status.renderer.forEach((source) => capture(source, sourceId));
    return status;
  },
  stopAudio: () => ipcRenderer.invoke('audio:stop'),
  audioStatus: () => ipcRenderer.invoke('audio:status'),
  onTranscript: (cb) => on('transcript:new', cb),
  onAudioStatus: (cb) => on('audio:status', cb),
});

// Returns an unsubscribe function so React effects can clean up.
function on(channel, cb) {
  const listener = (_e, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// Renderer-side capture (main has no getUserMedia): streams 16 kHz mono s16le to main as 'audio:pcm'.
const captures = {};
ipcRenderer.on('audio:status', (_e, s) => {
  if (s.state !== 'recording') for (const source of Object.keys(captures)) captures[source]();
});

async function capture(source, sourceId) {
  captures[source]?.();
  let stopped = false;
  captures[source] = () => { stopped = true; delete captures[source]; };
  try {
    // On Windows, desktop audio is the system mix (Chromium can't isolate one window's audio); the video track
    // is required by the API, so it is kept tiny.
    const stream = await navigator.mediaDevices.getUserMedia(source === 'mic'
      ? { audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }
      : {
          audio: { mandatory: { chromeMediaSource: 'desktop' } },
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxWidth: 320, maxHeight: 180, maxFrameRate: 1 } },
        });
    if (stopped) return stream.getTracks().forEach((t) => t.stop());
    const ctx = new AudioContext({ sampleRate: 16000 }); // Chromium resamples the stream for us
    // shortcut: ScriptProcessorNode is deprecated but needs no separate worklet file; move to AudioWorklet if Chromium drops it.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      const f = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
      ipcRenderer.send('audio:pcm', source, new Uint8Array(pcm.buffer));
    };
    ctx.createMediaStreamSource(stream).connect(node);
    node.connect(ctx.destination); // required for onaudioprocess to fire; the output stays silent
    captures[source] = () => {
      delete captures[source];
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    };
  } catch (err) {
    delete captures[source];
    if (!stopped) ipcRenderer.send('audio:capture-error', source, `${err.name}: ${err.message}`);
  }
}
