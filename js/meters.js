// Meter display. Levels come from real audio (AnalyserNode peak/RMS read by
// the audio engine); this module only adds ballistics and draws them.

import { inputBand } from "./mixer-state.js";

const FLOOR_DB = -48;
const RELEASE_DB_PER_S = 24; // fall rate of the bar
const HOLD_MS = 1000; // peak-hold tick
const CLIP_LATCH_MS = 1500; // clip LED stays lit this long
const TEXT_EVERY_MS = 180;

export const dbToFrac = (db) => (db <= FLOOR_DB ? 0 : db >= 0 ? 1 : (db - FLOOR_DB) / -FLOOR_DB);

export class MeterView {
  // opts: { marks: [{db,label}], orientation: "vertical"|"horizontal", label, showText, showBand }
  constructor(opts) {
    this.opts = { orientation: "vertical", showText: true, showBand: false, ...opts };
    const o = this.opts;
    this.el = document.createElement("div");
    this.el.className = `meter meter-${o.orientation}`;
    this.el.setAttribute("role", "img");
    this.el.setAttribute("aria-label", `${o.label || "Level"} meter`);
    const marks = (o.marks || [])
      .map((m) => `<span class="meter-mark${m.db >= 0 ? " is-clip" : ""}" style="--pos:${dbToFrac(m.db)}">${m.label}</span>`)
      .join("");
    this.el.innerHTML = `
      <div class="meter-body">
        <div class="meter-track"><div class="meter-fill"></div><div class="meter-cover"></div><div class="meter-hold"></div></div>
        <div class="meter-marks" aria-hidden="true">${marks}</div>
      </div>
      <div class="meter-foot">
        <span class="meter-clip" aria-hidden="true">CLIP</span>
        ${o.showText ? `<span class="meter-text">−∞</span>` : ""}
      </div>`;
    this.cover = this.el.querySelector(".meter-cover");
    this.hold = this.el.querySelector(".meter-hold");
    this.clipEl = this.el.querySelector(".meter-clip");
    this.textEl = this.el.querySelector(".meter-text");
    this.level = FLOOR_DB;
    this.holdDb = FLOOR_DB;
    this.holdUntil = 0;
    this.clipUntil = 0;
    this.lastT = 0;
    this.lastText = 0;
    this.drawnFrac = -1;
  }

  update(reading, now = performance.now()) {
    const peak = reading ? reading.peakDb : -Infinity;
    const dt = this.lastT ? (now - this.lastT) / 1000 : 0;
    this.lastT = now;
    // instant attack, steady release
    this.level = Math.max(peak, this.level - RELEASE_DB_PER_S * dt, FLOOR_DB);
    if (peak >= this.holdDb || now > this.holdUntil) {
      this.holdDb = Math.max(peak, FLOOR_DB);
      this.holdUntil = now + HOLD_MS;
    }
    if (peak >= -0.05) this.clipUntil = now + CLIP_LATCH_MS;

    const frac = dbToFrac(this.level);
    if (Math.abs(frac - this.drawnFrac) > 0.002) {
      this.drawnFrac = frac;
      this.cover.style.transform = this.opts.orientation === "vertical" ? `scaleY(${1 - frac})` : `scaleX(${1 - frac})`;
    }
    const hf = dbToFrac(this.holdDb);
    this.hold.style.setProperty("--pos", hf);
    this.hold.classList.toggle("off", hf <= 0);
    const clipping = now < this.clipUntil;
    if (clipping !== this.clipping) {
      this.clipping = clipping;
      this.el.classList.toggle("clipping", clipping);
    }
    if (this.textEl && now - this.lastText > TEXT_EVERY_MS) {
      this.lastText = now;
      const shown = this.holdDb;
      this.textEl.textContent = clipping ? "CLIP" : shown <= FLOOR_DB + 0.5 ? "−∞" : `${Math.round(shown)}`;
      if (this.opts.showBand) this.el.dataset.band = inputBand(shown <= FLOOR_DB + 0.5 ? -Infinity : shown);
    }
  }

  reset() {
    this.level = FLOOR_DB;
    this.holdDb = FLOOR_DB;
    this.update(null);
  }
}
