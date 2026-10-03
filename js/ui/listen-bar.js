// Which destination is the student listening to? Main L/R, a monitor bus
// (Aux 1 / Aux 2), or the engineer's headphones (PFL). Main and the auxes are
// heard only through the speakers they validly reach; PFL needs no speakers.
// On the CR1604-VLZ the list follows the patch: Main, every aux or subgroup
// with a speaker on it, and the C-R/PHONES (SOURCE matrix, or SOLO).

import { MeterView } from "../meters.js";
import { listenDestinations, listenGroupOf, modelOf } from "../mixer-state.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const GENERIC = ["main", "aux1", "aux2", "pfl"];
const SOURCE_NAMES = { main: "MAIN MIX", subs12: "SUBS 1-2", subs34: "SUBS 3-4", tape: "TAPE", alt: "ALT 3-4" };
const ALWAYS = ["main", "aux1", "aux2", "alt", "monitor", "phones"];

export class ListenBar {
  constructor(root, { store, getSkin, onTransport, getRecorder = () => null }) {
    this.root = root;
    this.getRecorder = getRecorder; // the recorder's runtime (take playback), if one is on stage
    this.store = store;
    this.getSkin = getSkin;
    this.onTransport = onTransport;
    this.dests = GENERIC;
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dest]");
      if (b) store.setListen(b.dataset.dest);
      if (e.target.closest(".transport")) this.onTransport();
    });
    root.addEventListener("keydown", (e) => {
      const b = e.target.closest("[data-dest]");
      if (!b || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const order = this.dests;
      const i = order.indexOf(b.dataset.dest);
      const next = order[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : order.length - 1)) % order.length];
      store.setListen(next);
      root.querySelector(`[data-dest="${next}"]`).focus();
    });
    this.render();
  }

  label(dest) {
    const t = this.getSkin().terms;
    if (dest === "main") return modelOf(this.store.state) !== "generic" ? "MAIN" : "Main L/R";
    if (dest === "pfl") return "PFL";
    if (dest === "phones") return "PHONES";
    if (dest === "rec") return "RECORDER";
    return t[dest] || dest;
  }

  render(dests = modelOf(this.store.state) !== "generic" ? listenDestinations(this.store.state).filter((d) => ALWAYS.includes(d)) : GENERIC) {
    this.dests = dests;
    const btn = (dest) =>
      `<button type="button" role="radio" class="listen-btn" data-dest="${dest}"><strong>${esc(this.label(dest))}</strong><small class="listen-sub"></small></button>`;
    this.root.innerHTML = `
      <div class="listen-group${dests.length > 4 ? " many" : ""}" role="radiogroup" aria-label="Listen to">
        <span class="listen-label" aria-hidden="true">Listen</span>
        ${dests.map(btn).join("")}
      </div>
      <div class="listen-now">
        <p class="listen-msg" aria-live="polite"></p>
      </div>
      <button type="button" class="transport btn" disabled>…</button>`;
    this.meter = new MeterView({ orientation: "horizontal", label: "What you hear", showText: false });
    this.meter.el.classList.add("listen-meter");
    this.root.querySelector(".listen-now").prepend(this.meter.el);
    this.msg = this.root.querySelector(".listen-msg");
    this.transport = this.root.querySelector(".transport");
    this.lastMsg = null;
  }

  update(mix, { playing, ready, loadingText, buffering }) {
    const state = this.store.state;
    const t = this.getSkin().terms;
    const real = modelOf(state) !== "generic"; // the 1604 or a compact mixer
    const devices = new Map(state.rig.devices.map((d) => [d.id, d]));
    const short = (e) => devices.get(e.deviceId)?.short || devices.get(e.deviceId)?.label || e.deviceId;
    const names = (eps) => eps.map(short).join(" + ");
    // Speakers by listening group: the working ones, and every one patched at all.
    const ends = {};
    const patched = new Set();
    for (const e of mix.rig.endpoints) {
      if (!e.output) continue;
      const g = listenGroupOf(state, e.output);
      patched.add(g);
      if (e.valid) (ends[g] ||= []).push(e);
    }

    // The buttons follow the mixer (and, on the 1604, the patch).
    const recDev = state.rig.devices.find((d) => d.type === "zoom-f8");
    // Always the main mix, the first two auxes, ALT, MONITOR and the phones the
    // mixer has; any other output only once a speaker is patched to it.
    const wanted = real ? listenDestinations(state).filter((d) => (d === "rec" ? !!recDev : ALWAYS.includes(d) || patched.has(d) || d === state.listen)) : GENERIC;
    if (wanted.join() !== this.dests.join()) this.render(wanted);

    const pfls = state.channels.filter((c) => c.pfl).map((c) => c.index + 1);
    const phones = real ? mix.phones : null;
    const phonesText = () => {
      if (phones.solo) {
        const what = [...phones.soloed.map((n) => `Ch ${n}`), ...phones.auxSolo.map((b) => t[b])].join(", ");
        return `SOLO: ${what}`;
      }
      return phones.sources.length ? `C-R: ${phones.sources.map((s) => SOURCE_NAMES[s]).join(" + ")}` : "C-R: no SOURCE";
    };
    const rec = recDev ? recorderText(recDev, this.getRecorder(), mix.rig.recorders?.[recDev.id]) : null;
    const sub = (d) => {
      if (d === "pfl") return pfls.length ? `Phones: Ch ${pfls.join(", ")}` : "Phones: no PFL";
      if (d === "phones") return phonesText();
      if (d === "rec") return rec.sub;
      return ends[d]?.length ? `✓ ${names(ends[d])}` : "✕ no working speaker";
    };
    const dead = (d) => (d === "pfl" ? !pfls.length : d === "phones" ? !phones.solo && !phones.sources.length : d === "rec" ? rec.dead : !ends[d]?.length);
    for (const btn of this.root.querySelectorAll("[data-dest]")) {
      const d = btn.dataset.dest;
      const on = state.listen === d;
      btn.setAttribute("aria-checked", String(on));
      btn.tabIndex = on ? 0 : -1;
      btn.classList.toggle("active", on);
      btn.querySelector(".listen-sub").textContent = sub(d);
      btn.classList.toggle("is-dead", dead(d));
    }

    const dest = state.listen;
    const busName = dest === "main" ? (real ? "the MAIN mix" : "Main L/R") : t[dest] || dest;
    let msg;
    if (dest === "rec" && this.getRecorder()?.playing) msg = rec.msg; // a take plays even with the band stopped
    else if (!ready) msg = loadingText || "Loading…";
    else if (!playing) msg = "Playback stopped.";
    else if (buffering) msg = "Buffering the next part of the song…";
    else if (dest === "pfl") msg = pfls.length ? `Engineer's headphones: PFL on Ch ${pfls.join(", ")} (before the ${t.levelShort.toLowerCase()}).` : "Headphones are quiet: press PFL on a channel to hear it here.";
    else if (dest === "phones") msg = phonesMessage(phones, t);
    else if (dest === "rec") msg = rec.msg;
    else if (ends[dest]?.length) msg = `Hearing ${busName} through the ${names(ends[dest])}.`;
    else msg = `Silence: ${busName} doesn't reach a working speaker. Check the Outputs.`;
    if (msg !== this.lastMsg) {
      this.msg.textContent = msg;
      this.lastMsg = msg;
    }
    this.transport.disabled = !ready;
    this.transport.textContent = playing ? "■ Stop" : "▶ Play";
    this.transport.setAttribute("aria-label", playing ? "Stop the band" : "Play the band");
    this.transport.classList.toggle("btn-start", !playing);
    this.transport.classList.toggle("btn-stop", playing);
  }

  updateMeter(reading, now) {
    this.meter.update(reading, now);
  }
}

// The recorder's headphone out: its input tracks, or a take playing back.
function recorderText(dev, rt, inputs = []) {
  const live = inputs.map((inp, i) => (inp && inp.connected ? i + 1 : 0)).filter(Boolean);
  if (rt && rt.playing) {
    const take = rt.takes.find((t) => t.id === rt.playing.takeId);
    return { sub: `▶ ${take ? take.name : "take"}`, dead: false, msg: `Recorder headphones: playing back ${take ? take.name : "a take"} from the card.` };
  }
  const recording = rt && rt.recording ? " ● REC" : "";
  if (!live.length) return { sub: `No inputs${recording}`, dead: true, msg: "Recorder headphones are quiet: nothing is plugged into the recorder." };
  return { sub: `Inputs ${live.join(", ")}${recording}`, dead: false, msg: `Recorder headphones: what inputs ${live.join(", ")} are hearing${recording ? ", while recording" : ""}.` };
}

function phonesMessage(p, t) {
  if (p.solo) {
    const what = [...p.soloed.map((n) => `Ch ${n}`), ...p.auxSolo.map((b) => t[b])].join(", ");
    if (p.modeText) return `Engineer's headphones: SOLO ${what}, ${p.modeText}.`;
    return p.mode === "pfl"
      ? `Engineer's headphones: SOLO ${what} in LEVEL SET (PFL), before the fader. The left meter shows its level.`
      : `Engineer's headphones: SOLO ${what} in NORMAL (AFL), after the fader and pan.`;
  }
  if (!p.sources.length) return "Headphones are quiet: pick a C-R/PHONES SOURCE, or press SOLO on a channel.";
  return `Engineer's headphones: the C-R SOURCE ${p.sources.map((s) => SOURCE_NAMES[s]).join(" + ")}.`;
}
