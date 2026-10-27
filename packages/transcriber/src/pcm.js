// 16-bit PCM helpers. whisper.cpp wants 16 kHz mono s16le.
const SAMPLE_RATE = 16000;

// Downmix interleaved s16le to mono and resample to 16 kHz (linear interpolation).
function toMono16k(buf, rate, channels) {
  if (rate === SAMPLE_RATE && channels === 1) return buf;
  const frames = Math.floor(buf.length / 2 / channels);
  const out = Buffer.alloc(Math.floor((frames * SAMPLE_RATE) / rate) * 2);
  const at = (f) => {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += buf.readInt16LE((f * channels + c) * 2);
    return sum / channels;
  };
  for (let i = 0; i < out.length / 2; i++) {
    const pos = (i * rate) / SAMPLE_RATE;
    const f = Math.floor(pos);
    const next = Math.min(f + 1, frames - 1);
    out.writeInt16LE(Math.round(at(f) + (at(next) - at(f)) * (pos - f)), i * 2);
  }
  return out;
}

// Root-mean-square level, 0..1.
function rms(buf) {
  const n = Math.floor(buf.length / 2);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += buf.readInt16LE(i * 2) ** 2;
  return Math.sqrt(sum / n) / 32768;
}

// 44-byte RIFF header + 16 kHz mono s16le data.
function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24); h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

module.exports = { SAMPLE_RATE, toMono16k, rms, wav };
