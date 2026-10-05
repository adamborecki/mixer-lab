// Plays a spoken clip (js: VOICES in the manifest) in place of a band member's
// stem: the host talking into the singer's mic. No DOM; owned by the audio engine.
//
// Like LoopPlayer it is separate from the band's transport and never touches
// it. Unlike the preshow loop it starts from the top whenever a scenario
// that uses it opens (an announcement heard from the middle makes no sense),
// and it follows the Play/Stop button.

export class VoicePlayer {
  constructor(ctx, { url, errors, emit }) {
    this.ctx = ctx;
    this.url = url;
    this.errors = errors; // shared Map: url → message
    this.emit = emit;
    this.out = ctx.createGain();
    this.buffer = null;
    this.loading = null;
    this.source = null;
    this.token = 0;
  }

  load() {
    this.loading ||= (async () => {
      try {
        const res = await fetch(this.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (err) {
        this.errors.set(this.url, `${this.url.split("/").pop()}: ${err.message || err}`);
        this.emit({ type: "load-errors", errors: [...this.errors.entries()] });
      }
    })();
    return this.loading;
  }

  // From the top, looping (the file ends with a pause before it repeats).
  async start() {
    const token = ++this.token;
    this.stopSource();
    await this.load();
    if (token !== this.token || !this.buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(this.out);
    src.start(this.ctx.currentTime + 0.05);
    this.source = src;
  }

  stop() {
    this.token++;
    this.stopSource();
  }

  stopSource() {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch (e) {
      /* already stopped */
    }
    this.source.disconnect();
    this.source = null;
  }
}
