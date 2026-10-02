// The Zoom F8 panel: eight tracks (meter, TRIM, 48V, arm), LINK for each pair,
// DUAL CHANNEL REC for inputs 1–4, the card, transport and takes. Settings go
// through MixerStore.setDevice; recording and playback through the engine's
// recorder runtime (js/outboard-audio.js).

import { RangeControl, LitButton } from "./controls.js";
import { MeterView } from "../meters.js";
import { F8, cardStats, trackInputs } from "../devices.js";
import { encodeWav } from "../wav.js";
import { formatDb } from "../levels.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const MARKS = [
  { db: -40, label: "−40" },
  { db: -20, label: "−20" },
  { db: -12, label: "−12" },
  { db: -6, label: "−6" },
  { db: 0, label: "0" },
];
const clock = (sec) => `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const hours = (sec) => (Number.isFinite(sec) ? `${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")} min` : "—");

export class RecorderView {
  constructor({ store, getRuntime, getMix, toast }) {
    this.store = store;
    this.getRuntime = getRuntime;
    this.getMix = getMix;
    this.toast = toast;
    this.id = null;
    this.el = document.createElement("dialog");
    this.el.className = "patch-dialog rec-dialog";
    this.el.setAttribute("aria-labelledby", "rec-title");
    document.body.appendChild(this.el);
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) return this.el.close();
      const b = e.target.closest("[data-rec]");
      if (!b) return;
      const act = b.dataset.rec;
      if (act === "close") this.el.close();
      else if (act === "rec") this.record();
      else if (act === "stop") this.rt()?.stop();
      else if (act === "play") this.rt()?.play(b.dataset.take);
      else if (act === "download") this.download(b.dataset.take);
    });
  }

  get dev() {
    return this.store.state.rig.devices.find((d) => d.id === this.id) || null;
  }

  rt() {
    return this.id ? this.getRuntime(this.id) : null;
  }

  get isOpen() {
    return this.el.open;
  }

  open(id) {
    this.id = id;
    this.render();
    if (!this.el.open) this.el.showModal();
  }

  async record() {
    const rt = this.rt();
    if (!rt) return this.toast("Press Start Audio first: the recorder needs the audio engine.", "bad");
    const r = await rt.record();
    if (!r.ok) this.toast(r.reason, "bad");
    else this.recStart = performance.now();
  }

  download(takeId) {
    const take = this.rt()?.takes.find((t) => t.id === takeId);
    if (!take || !take.data) return;
    const blob = new Blob([encodeWav(take.data, take.rate)], { type: "audio/wav" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${take.name}.WAV`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  render() {
    const dev = this.dev;
    if (!dev) return;
    const store = this.store;
    this.bindings = [];
    this.meters = [];
    this.el.innerHTML = `<div class="patch-inner rec-inner">
      <header class="patch-head">
        <p class="patch-kicker">Field recorder</p>
        <h2 id="rec-title">${esc(dev.label)}</h2>
        <p class="patch-sub rec-status" aria-live="polite"></p>
        <button type="button" class="patch-x" data-rec="close" aria-label="Close">✕</button>
      </header>
      <p class="rec-card"></p>
      <div class="rec-links"></div>
      <div class="rec-tracks" role="group" aria-label="Tracks"></div>
      <div class="rec-transport">
        <button type="button" class="btn rec-btn" data-rec="rec">● REC</button>
        <button type="button" class="btn" data-rec="stop">■ STOP</button>
        <span class="rec-hp"></span>
      </div>
      <h3 class="group-title">Takes on the card</h3>
      <ol class="rec-takes"></ol>
      <p class="rec-note">Listen with RECORDER on the Listen bar. Downloads are 16-bit poly WAVs (one file, one channel per armed track); the real F8 writes ${F8.bitDepth}-bit / ${F8.sampleRate / 1000} kHz.</p>
    </div>`;

    // LINK: one switch per pair.
    const links = this.el.querySelector(".rec-links");
    for (let p = 0; p < 4; p++) {
      const b = new LitButton({ label: `LINK ${p * 2 + 1}/${p * 2 + 2}`, tone: "assign", small: true, onPress: () => store.setDevice(this.id, `link.${p}`, !this.dev.link[p]) });
      this.bindings.push(() => b.setLit(this.dev.link[p], `Link tracks ${p * 2 + 1} and ${p * 2 + 2} as a stereo pair: ${this.dev.link[p] ? "on" : "off"}`));
      links.appendChild(b.el);
    }

    const grid = this.el.querySelector(".rec-tracks");
    for (let t = 0; t < F8.tracks; t++) {
      const col = document.createElement("section");
      col.className = "rec-track";
      col.setAttribute("aria-label", `Track ${t + 1}`);
      col.innerHTML = `<p class="rec-num">${t + 1}</p><p class="rec-src"></p>`;
      const meter = new MeterView({ marks: MARKS, orientation: "vertical", label: `Track ${t + 1}`, showText: false });
      meter.el.classList.add("rec-meter");
      this.meters[t] = meter;
      const trim = new RangeControl({
        kind: "knob",
        label: "TRIM",
        sheetLabel: `Track ${t + 1} TRIM`,
        min: F8.gainMin,
        max: F8.gainMax,
        step: 0.5,
        keyStepMul: 2,
        defaultValue: 30,
        size: "xs",
        tone: "gain",
        format: (v) => (this.paths?.[trackInputs(this.dev)[t]] === "line" ? `${formatDb(v - 20)} line` : `+${Math.round(v)} dB`),
        onInput: (v) => store.setDevice(this.id, `tracks.${t}.trimDb`, v),
      });
      this.bindings.push(() => trim.setValue(this.dev.tracks[t].trimDb, true));
      this.trims = this.trims || [];
      this.trims[t] = trim;
      const p48 = new LitButton({ label: "48V", tone: "phantom", small: true, onPress: () => store.setDevice(this.id, `tracks.${t}.phantom`, !this.dev.tracks[t].phantom) });
      this.bindings.push(() => p48.setLit(this.dev.tracks[t].phantom, `Track ${t + 1} phantom power: ${this.dev.tracks[t].phantom ? "on" : "off"}`));
      const arm = new LitButton({ label: "REC", tone: "mute", small: true, onPress: () => store.setDevice(this.id, `tracks.${t}.arm`, !this.dev.tracks[t].arm) });
      this.bindings.push(() => arm.setLit(this.dev.tracks[t].arm, `Track ${t + 1} armed: ${this.dev.tracks[t].arm ? "yes" : "no"}`));
      col.append(meter.el, trim.el, p48.el, arm.el);
      if (t < 4) {
        const dual = new LitButton({ label: `DUAL→${t + 5}`, tone: "assign", small: true, onPress: () => store.setDevice(this.id, `dual.${t}`, !this.dev.dual[t]) });
        this.bindings.push(() => dual.setLit(this.dev.dual[t], `Dual channel recording: input ${t + 1} also on track ${t + 5}: ${this.dev.dual[t] ? "on" : "off"}`));
        col.appendChild(dual.el);
      }
      grid.appendChild(col);
    }

    const hp = new RangeControl({
      kind: "knob",
      label: "HP VOL",
      sheetLabel: "Recorder headphone volume",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.6,
      size: "xs",
      tone: "phones",
      format: (v) => `${Math.round(v * 10)}`,
      onInput: (v) => store.setDevice(this.id, "hpLevel", v),
    });
    this.bindings.push(() => hp.setValue(this.dev.hpLevel, true));
    this.el.querySelector(".rec-hp").appendChild(hp.el);
    this.takesKey = "";
    this.sync();
  }

  // After any state change, and on recorder events.
  sync() {
    if (!this.el.open && !this.bindings) return;
    const dev = this.dev;
    if (!dev || !this.bindings) return;
    for (const b of this.bindings) b();
    const mix = this.getMix();
    const inputs = mix?.rig.recorders?.[this.id] || [];
    const paths = inputs.map((i) => i && i.path);
    if (paths.join() !== (this.paths || []).join()) {
      this.paths = paths;
      for (const tr of this.trims || []) tr.render();
    }
    const map = trackInputs(dev);
    const rig = this.store.state.rig;
    this.el.querySelectorAll(".rec-track").forEach((col, t) => {
      const src = map[t];
      const inp = inputs[src];
      let text;
      if (src !== t) text = `← input ${src + 1} (dual)`;
      else if (!inp || !inp.connected) text = "—";
      else {
        const cable = rig.cables.find((c) => c.to === `${this.id}/in${t + 1}`);
        const from = cable ? cable.from.split("/") : [];
        const fromDev = rig.devices.find((d) => d.id === from[0]);
        text = `${inp.path === "mic" ? "XLR" : "TRS"} · ${fromDev ? (fromDev.type === "cr1604" ? from[1].toUpperCase() : inp.sourceId ? inp.sourceId.replace("room-", "room ") : fromDev.label) : "?"}`;
      }
      const warn = inp && inp.connected && inp.status !== "ok" && src === t ? inp.messages[0] : "";
      const el = col.querySelector(".rec-src");
      el.textContent = text;
      el.title = warn || text;
      col.classList.toggle("warn", !!warn);
      col.classList.toggle("is-dual", src !== t);
      col.classList.toggle("is-linked", dev.link[Math.floor(t / 2)]);
    });
    this.syncTransport();
  }

  syncTransport() {
    const dev = this.dev;
    const rt = this.rt();
    if (!dev) return;
    const card = cardStats(dev, rt ? rt.usedBytes : 0);
    this.el.querySelector(".rec-card").textContent = `SD card ${F8.cardGB} GB · ${(card.free / 1e9).toFixed(1)} GB free · ${card.armed ? `${hours(card.secondsLeft)} left for ${card.armed} track${card.armed > 1 ? "s" : ""} at ${F8.sampleRate / 1000} kHz / ${F8.bitDepth}-bit` : "arm a track to see the time left"}`;
    const status = this.el.querySelector(".rec-status");
    const recording = rt && rt.recording;
    status.textContent = !rt ? "Press Start Audio to use the recorder." : recording ? `● REC ${clock((performance.now() - (this.recStart || performance.now())) / 1000)}` : rt.playing ? "▶ PLAY" : rt.error || "■ STOP";
    status.classList.toggle("is-rec", !!recording);
    this.el.querySelector('[data-rec="rec"]').classList.toggle("lit", !!recording);
    const takes = rt ? rt.takes : [];
    const key = takes.map((t) => `${t.id}:${!!t.data}`).join() + (rt?.playing?.takeId || "");
    if (key === this.takesKey) return;
    this.takesKey = key;
    this.el.querySelector(".rec-takes").innerHTML = takes.length
      ? takes
          .map(
            (t) => `<li><strong>${esc(t.name)}</strong> <span>${clock(t.seconds)} · tracks ${t.tracks.map((x) => x + 1).join(", ")}</span>
              ${t.data ? `<button type="button" class="chip" data-rec="play" data-take="${t.id}">${rt.playing?.takeId === t.id ? "▶ playing" : "▶ Play"}</button><button type="button" class="chip" data-rec="download" data-take="${t.id}">Download WAV</button>` : `<small>(audio not kept: only the three newest takes stay in the lab's memory)</small>`}</li>`,
          )
          .join("")
      : '<li class="rec-empty">No takes yet. Arm tracks, then press REC.</li>';
  }

  updateMeters(readings, now) {
    if (!this.el.open || !this.meters) return;
    const r = readings?.recorders?.[this.id];
    if (!r) return;
    this.meters.forEach((m, t) => m.update(r[t], now));
    if (this.rt()?.recording) this.syncTransport();
  }
}
