// WAV files from recorded tracks. Pure: takes Int16 sample arrays, returns bytes.

// A poly WAV: one file, the tracks interleaved as channels (16-bit PCM).
export function encodeWav(tracks, sampleRate) {
  const channels = tracks.length;
  const frames = channels ? tracks[0].length : 0;
  const dataBytes = frames * channels * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const text = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      v.setInt16(o, tracks[c][i], true);
      o += 2;
    }
  }
  return buf;
}
