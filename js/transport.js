// Plays the band's stems in lockstep. No DOM; owned by the audio engine.
//
// Every active source gets a persistent output node, and every output node is
// wired (at zero gain) to the destination. That keeps each stem *pulled* by the
// browser from the moment it starts: Chrome doesn't advance a source that
// nothing downstream is listening to, so an unpatched stem would otherwise
// freeze and come back late when it's plugged in.
//
// Two modes:
//   "excerpt"  one short synchronized loop per stem (AudioBufferSourceNode
//              loop points), fully decoded up front. Used by the scenarios.
//              Which 8 bars: `section` (STEM_SET.sections). "excerpt" is the
//              original loop file; any other section is stitched from the
//              full-song segments into a buffer laid out like that file.
//   "full"     the whole song, streamed in segments: each segment is decoded
//              just before it's needed and joined to the next with a short
//              crossfade, so a phone never holds all seven full-length stems.

const XF = 0.02; // crossfade between full-song segments (s)
const EDGE_FADE = 0.008; // fade at a fresh start, a seek, or the song's end (s)
const LOOKAHEAD = 8; // schedule the next segment this far ahead (s)
const TICK_MS = 250;
const LOOP_XF = 0.03; // baked crossfade at a stitched section's loop point (s)

export class StemTransport {
  constructor(ctx, manifest, emit) {
    this.ctx = ctx;
    this.m = manifest; // { STEM_SET, STEMS, SOURCES_BY_ID }
    this.emit = emit;
    this.keepAlive = ctx.createGain();
    this.keepAlive.gain.value = 0;
    this.keepAlive.connect(ctx.destination);
    this.outs = new Map(); // sourceId → GainNode
    // sourceId → GainNode between the players and the output: a scenario's
    // "who's on stage" mutes a stem here. The players keep running (and stay
    // in lockstep); only this gain changes.
    this.gates = new Map();
    this.muted = new Set();
    this.sourceIds = [];
    this.mode = "excerpt";
    this.playing = false;
    this.buffering = false;
    this.excerpt = new Map(); // stemId → mono AudioBuffer
    this.section = "excerpt";
    this.windows = new Map(); // "sectionId|stemId" → mono AudioBuffer (current section only)
    this.segments = new Map(); // segment index → { ready, promise, buffers: Map<stemId, AudioBuffer> }
    this.segmentStems = "";
    this.errors = new Map();
    this.scheduled = []; // { src, gain, endCtx, k, cycle }
    this.anchor = { ctx: 0, song: 0 }; // song time `song` plays at context time `ctx`
    this.resumeAt = 0;
    this.token = 0;
  }

  // ---------- sources ----------

  // Creates/removes output nodes for the active sources (synchronous, so the
  // engine can patch them into channels right away).
  prepare(sourceIds) {
    const want = new Set(sourceIds);
    for (const [id, g] of this.outs) {
      if (want.has(id)) continue;
      g.disconnect();
      this.gates.get(id).disconnect();
      this.outs.delete(id);
      this.gates.delete(id);
    }
    for (const id of sourceIds) {
      if (this.outs.has(id)) continue;
      const g = this.ctx.createGain();
      g.connect(this.keepAlive);
      this.outs.set(id, g);
      const gate = this.ctx.createGain();
      gate.gain.value = this.muted.has(id) ? 0 : 1;
      gate.connect(g);
      this.gates.set(id, gate);
    }
    this.sourceIds = [...sourceIds];
  }

  // Silences these sources' stems (and un-silences the rest) with a short fade.
  setMuted(ids) {
    this.muted = new Set(ids);
    const t = this.ctx.currentTime;
    for (const [id, gate] of this.gates) {
      gate.gain.cancelScheduledValues(t);
      gate.gain.setValueAtTime(gate.gain.value, t);
      gate.gain.linearRampToValueAtTime(this.muted.has(id) ? 0 : 1, t + 0.05);
    }
  }

  stemOf(sourceId) {
    return this.m.SOURCES_BY_ID[sourceId].stem;
  }

  stems() {
    return [...new Set(this.sourceIds.map((id) => this.stemOf(id)))];
  }

  // Loads what `mode` needs before anything plays. Resolves false if a newer
  // request replaced this one.
  async load(mode, section = "excerpt") {
    const token = ++this.token;
    this.stopNodes();
    this.playing = false;
    this.mode = mode;
    this.section = section;
    const stems = this.stems();
    if (mode === "excerpt" && section !== "excerpt") {
      await this.loadSection(section, stems, token);
    } else if (mode === "excerpt") {
      const missing = stems.filter((s) => !this.excerpt.has(s));
      let done = stems.length - missing.length;
      if (missing.length) this.emit({ type: "loading", done, total: stems.length });
      await Promise.all(
        missing.map(async (s) => {
          const { STEM_SET, STEMS } = this.m;
          this.excerpt.set(s, await this.fetchStem(STEM_SET.basePath + STEMS[s].file, s, 0, STEM_SET.loop.end + 1));
          done++;
          if (token === this.token) this.emit({ type: "loading", done, total: stems.length });
        }),
      );
    } else {
      this.resumeAt = 0;
      this.emit({ type: "loading", done: 0, total: 1, what: "the first 20 seconds of the song" });
      await this.segment(0).promise;
    }
    if (token !== this.token) return false;
    this.emit({ type: "ready", errors: [...this.errors.entries()] });
    return true;
  }

  // Builds each stem's loop for a section from the 2–3 full-song segments
  // under it: 0.5 s pre-roll, the 8 bars, 1 s post-roll, like the excerpt
  // file, so the same loop points work.
  async loadSection(id, stems, token) {
    const { STEM_SET } = this.m;
    const sec = STEM_SET.sections.find((s) => s.id === id);
    if (!sec) throw new Error(`Unknown section ${id}`);
    for (const key of [...this.windows.keys()]) if (!key.startsWith(id + "|")) this.windows.delete(key);
    const missing = stems.filter((s) => !this.windows.has(`${id}|${s}`));
    if (!missing.length) return;
    const F = STEM_SET.full;
    const { start: pre, end } = STEM_SET.loop;
    const from = sec.start - pre;
    const length = end + 1;
    const ks = segmentsUnder(from, length, F);
    let done = 0;
    const total = missing.length * ks.length;
    this.emit({ type: "loading", done, total, what: `bars ${sec.bars} of the song` });
    await Promise.all(
      missing.map(async (s) => {
        const pieces = await Promise.all(
          ks.map(async (k) => {
            const buffer = await this.fetchStem(this.segmentUrl(s, k), s, F.trimDb, F.segmentSeconds + 2 * F.overlap);
            done++;
            if (token === this.token) this.emit({ type: "loading", done, total, what: `bars ${sec.bars} of the song` });
            return { start: Math.max(0, k * F.segmentSeconds - F.overlap), boundary: k * F.segmentSeconds, data: buffer.getChannelData(0) };
          }),
        );
        const sr = this.ctx.sampleRate;
        const data = stitch(pieces, from, Math.ceil(length * sr), sr, XF);
        bakeLoop(data, Math.round(pre * sr), Math.round((end - pre) * sr), Math.round(LOOP_XF * sr));
        const buf = this.ctx.createBuffer(1, data.length, sr);
        buf.getChannelData(0).set(data);
        if (this.section === id) this.windows.set(`${id}|${s}`, buf);
      }),
    );
  }

  loopBuffer(stemId) {
    return this.section === "excerpt" ? this.excerpt.get(stemId) : this.windows.get(`${this.section}|${stemId}`);
  }

  async fetchStem(url, stemId, trimDb, fallbackSeconds) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const decoded = await this.ctx.decodeAudioData(await res.arrayBuffer());
      return toMono(this.ctx, decoded, this.m.STEMS[stemId].treatment, trimDb);
    } catch (err) {
      this.errors.set(url, `${url.split("/").pop()}: ${err.message || err}`);
      return testTone(this.ctx, fallbackSeconds, stemId);
    }
  }

  // ---------- full-song segments ----------

  segmentUrl(stemId, k) {
    const { STEM_SET, STEMS } = this.m;
    return `${STEM_SET.full.basePath}${STEMS[stemId].file.replace(/\.mp3$/, "")}-${String(k).padStart(2, "0")}.mp3`;
  }

  segment(k) {
    const stems = this.stems();
    const key = stems.join(",");
    if (key !== this.segmentStems) {
      this.segments.clear();
      this.segmentStems = key;
    }
    let entry = this.segments.get(k);
    if (entry) return entry;
    const F = this.m.STEM_SET.full;
    entry = { ready: false, buffers: null };
    entry.promise = Promise.all(stems.map(async (s) => [s, await this.fetchStem(this.segmentUrl(s, k), s, F.trimDb, F.segmentSeconds + 2 * F.overlap)])).then((pairs) => {
      entry.buffers = new Map(pairs);
      entry.ready = true;
      return entry;
    });
    this.segments.set(k, entry);
    return entry;
  }

  // ---------- transport ----------

  async ensureRunning() {
    if (this.ctx.state === "running") return;
    try {
      await this.ctx.resume();
    } catch (e) {
      /* the next user gesture will resume it */
    }
  }

  // Every play/stop/load takes a new token; async work that finds the token
  // changed under it just stops.
  async play(from = null) {
    const token = ++this.token;
    await this.ensureRunning();
    if (token !== this.token) return;
    this.stopNodes();
    this.playing = true;
    if (this.mode === "excerpt") this.playExcerpt();
    else await this.playFull(from ?? this.resumeAt, token);
    if (token !== this.token) return;
    this.emit({ type: "transport", playing: true });
  }

  stop() {
    this.token++;
    if (this.mode === "full" && this.playing) this.resumeAt = this.position().t;
    this.stopNodes();
    this.playing = false;
    this.setBuffering(false);
    this.emit({ type: "transport", playing: false });
  }

  seek(t) {
    if (this.mode !== "full") return;
    if (this.playing) this.play(t);
    else {
      this.resumeAt = t;
      this.emit({ type: "transport", playing: false });
    }
  }

  playExcerpt() {
    const { start: ls, end: le } = this.m.STEM_SET.loop;
    const when = this.ctx.currentTime + 0.1;
    for (const id of this.sourceIds) {
      const buffer = this.loopBuffer(this.stemOf(id));
      if (!buffer) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = ls;
      src.loopEnd = le;
      const gain = this.envelope(when, EDGE_FADE, Infinity, 0);
      src.connect(gain).connect(this.gates.get(id));
      // Same start time, same offset, same loop points → sample-locked stems.
      src.start(when, ls);
      this.scheduled.push({ src, gain, endCtx: Infinity });
    }
    this.anchor = { ctx: when, song: 0 };
  }

  async playFull(from, token) {
    const F = this.m.STEM_SET.full;
    const t = Math.min(Math.max(0, from), F.duration - 0.05);
    const k = Math.floor(t / F.segmentSeconds);
    const entry = this.segment(k);
    if (!entry.ready) {
      this.resumeAt = t;
      this.setBuffering(true);
      await entry.promise;
      if (token !== this.token) return;
    }
    this.setBuffering(false);
    this.anchor = { ctx: this.ctx.currentTime + 0.12, song: t };
    this.scheduleSegment(k, 0, t);
    this.segment((k + 1) % F.segments); // start fetching the next one now
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  // Schedules segment k (of song cycle `cycle`) for every stem. `freshFrom`
  // (absolute song time) starts playback mid-segment after a seek/start;
  // otherwise the segment starts at its boundary, crossfading with the last.
  scheduleSegment(k, cycle, freshFrom = null) {
    const F = this.m.STEM_SET.full;
    const D = F.duration;
    const S = F.segmentSeconds;
    const base = cycle * D;
    const segStart = base + k * S;
    const segEnd = base + Math.min((k + 1) * S, D);
    const fileStart = base + Math.max(0, k * S - F.overlap); // song time at buffer t = 0
    const fresh = freshFrom !== null;
    const xfIn = !fresh && k > 0;
    const xfOut = (k + 1) * S < D;
    const startAbs = fresh ? freshFrom : xfIn ? segStart - XF / 2 : segStart;
    const endAbs = xfOut ? segEnd + XF / 2 : segEnd;
    const now = this.ctx.currentTime;
    const when = this.anchor.ctx + (startAbs - this.anchor.song);
    // If we're late (a busy main thread), start now but skip ahead by the same
    // amount so this segment stays aligned with the song clock.
    const late = Math.max(0, now + 0.005 - when);
    const entry = this.segments.get(k);
    for (const id of this.sourceIds) {
      const buffer = entry.buffers.get(this.stemOf(id));
      if (!buffer) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = this.envelope(when, xfIn ? XF : EDGE_FADE, endAbs - startAbs, xfOut ? XF : EDGE_FADE);
      src.connect(gain).connect(this.gates.get(id));
      src.start(when + late, startAbs - fileStart + late, endAbs - startAbs - late);
      this.scheduled.push({ src, gain, endCtx: when + (endAbs - startAbs), k, cycle });
    }
    this.last = { k, cycle, endAbs: segEnd };
  }

  // A gain node that fades in at `when` and out at the end of `dur`.
  envelope(when, fadeIn, dur, fadeOut) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(1, when + fadeIn);
    if (Number.isFinite(dur)) {
      g.gain.setValueAtTime(1, when + dur - fadeOut);
      g.gain.linearRampToValueAtTime(0, when + dur);
    }
    return g;
  }

  tick() {
    if (!this.playing || this.mode !== "full" || !this.last) return;
    const F = this.m.STEM_SET.full;
    const now = this.ctx.currentTime;
    const songNow = this.anchor.song + (now - this.anchor.ctx);
    let nk = this.last.k + 1;
    let nc = this.last.cycle;
    if (nk >= F.segments) {
      nk = 0;
      nc++;
    }
    const nextStart = nc * F.duration + nk * F.segmentSeconds;
    const entry = this.segment(nk);
    if (nextStart - songNow < LOOKAHEAD) {
      if (entry.ready) this.scheduleSegment(nk, nc);
      else if (nextStart - songNow < 0.05 && !this.buffering) this.waitFor(nk, nc, nextStart);
    }
    // Drop finished nodes and segments that are no longer needed.
    this.scheduled = this.scheduled.filter((n) => {
      if (n.endCtx > now - 0.5) return true;
      n.gain.disconnect();
      return false;
    });
    const keep = new Set(this.scheduled.map((n) => n.k).concat(nk));
    for (const k of this.segments.keys()) if (!keep.has(k)) this.segments.delete(k);
  }

  // The network fell behind: go quiet until segment nk is decoded, then carry
  // on from its start.
  async waitFor(nk, nc, nextStart) {
    const token = this.token;
    this.resumeAt = nextStart % this.m.STEM_SET.full.duration;
    this.setBuffering(true);
    await this.segment(nk).promise;
    if (token !== this.token) return;
    this.setBuffering(false);
    this.anchor = { ctx: this.ctx.currentTime + 0.1, song: nextStart };
    this.scheduleSegment(nk, nc, nextStart);
  }

  setBuffering(on) {
    if (this.buffering === on) return;
    this.buffering = on;
    this.emit({ type: "buffering", on });
  }

  stopNodes() {
    clearInterval(this.timer);
    this.timer = null;
    for (const n of this.scheduled) {
      try {
        n.src.stop();
      } catch (e) {
        /* never started */
      }
      n.gain.disconnect();
    }
    this.scheduled = [];
    this.last = null;
  }

  // Where the band is: seconds into the loop (excerpt) or the song (full).
  position() {
    if (this.mode === "excerpt") {
      const { start, end } = this.m.STEM_SET.loop;
      const t = this.playing ? Math.max(0, this.ctx.currentTime - this.anchor.ctx) % (end - start) : 0;
      return { t, duration: end - start };
    }
    const D = this.m.STEM_SET.full.duration;
    if (!this.playing || this.buffering) return { t: this.resumeAt, duration: D };
    const song = this.anchor.song + (this.ctx.currentTime - this.anchor.ctx);
    return { t: Math.max(0, song) % D, duration: D };
  }
}

// Full-song segment indices covering song time [from, from + length).
export function segmentsUnder(from, length, F) {
  const first = Math.max(0, Math.floor(from / F.segmentSeconds));
  const last = Math.min(F.segments - 1, Math.floor((from + length) / F.segmentSeconds));
  const ks = [];
  for (let k = first; k <= last; k++) ks.push(k);
  return ks;
}

// Joins segment buffers into one: `n` samples starting at song time `from`.
// pieces: [{ start (song time of data[0]), boundary (song time where this
// piece takes over from the previous one), data }], in song order. Pieces
// overlap; each takes over with a linear crossfade `xf` s wide centred on its
// boundary, as the full-song player does.
export function stitch(pieces, from, n, sr, xf) {
  const out = new Float32Array(n);
  pieces.forEach((p, idx) => {
    const off = Math.round((p.start - from) * sr); // out index of data[0]
    const fadeFrom = idx === 0 ? -Infinity : Math.round((p.boundary - xf / 2 - from) * sr);
    const fadeLen = Math.max(1, Math.round(xf * sr));
    const i0 = Math.max(0, off, idx === 0 ? 0 : fadeFrom);
    const i1 = Math.min(n, off + p.data.length);
    for (let i = i0; i < i1; i++) {
      const w = idx === 0 ? 1 : Math.min(1, (i - fadeFrom) / fadeLen);
      out[i] = out[i] * (1 - w) + p.data[i - off] * w;
    }
  });
  return out;
}

// Makes the jump from loop end back to loop start seamless: the last `fade`
// samples before the loop end blend into the audio just before the loop start
// (the pre-roll), so the waveform is continuous when it wraps.
export function bakeLoop(data, start, len, fade) {
  const end = start + len;
  for (let j = 0; j < fade; j++) {
    const i = end - fade + j;
    const w = (j + 1) / fade;
    data[i] = data[i] * (1 - w) + data[i - len] * w;
  }
  return data;
}

// Folds a decoded stereo buffer into the mono signal a live-sound input
// channel would see. "sum" averages L and R (no level jump for centred
// material, no clipping); "left"/"right" pick one side for stems whose sides
// would cancel. `gainDb` restores level trimmed at encoding time.
export function toMono(ctx, buffer, treatment = "sum", gainDb = 0) {
  const k = Math.pow(10, gainDb / 20);
  const out = ctx.createBuffer(1, buffer.length, buffer.sampleRate);
  const dst = out.getChannelData(0);
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  if (treatment === "left") for (let i = 0; i < dst.length; i++) dst[i] = k * L[i];
  else if (treatment === "right") for (let i = 0; i < dst.length; i++) dst[i] = k * R[i];
  else for (let i = 0; i < dst.length; i++) dst[i] = 0.5 * k * (L[i] + R[i]);
  return out;
}

// Development fallback only: a plain tone so routing can still be tested if
// a stem fails to load. Never used as "music".
function testTone(ctx, seconds, seed) {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = buf.getChannelData(0);
  const freq = 220 * Math.pow(2, (seed.length % 7) / 12);
  for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / ctx.sampleRate);
  return buf;
}
