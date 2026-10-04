// Which destination is the student listening to? Main L/R, a monitor bus
// (Aux 1 / Aux 2), or the engineer's headphones (PFL), shown as where you
// stand. Main and the auxes are heard only through the speakers they validly
// reach; PFL needs no speakers.
// On the CR1604-VLZ the list follows the patch: Main, every aux or subgroup
// with a speaker on it, and the C-R/PHONES (SOURCE matrix, or SOLO).

import { MeterView } from "../meters.js";
import { listenDestinations, listenGroupOf, modelOf } from "../mixer-state.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const GENERIC = ["main", "aux1", "aux2", "pfl"];
const SOURCE_NAMES = { main: "MAIN MIX", subs12: "SUBS 1-2", subs34: "SUBS 3-4", tape: "TAPE", alt: "ALT 3-4" };
const ALWAYS = ["main", "aux1", "aux2", "alt", "monitor", "phones"];

// Where your ears are: a small map of the venue (stage and wedges, the house,
// the desk) with a figure at the spot you're listening from. Tap a spot to move.
// Each spot is a listening destination; its place comes from the speakers that
// destination actually reaches (a wedge on stage, the house, the lobby, a camera)
// or the desk (headphones). `places` is shared with the Stage & patch diagram.
const MAP_W = 280;
const MAP_H = 70;

// A stick figure standing at (x, y = feet); `phones` adds headphones.
export function figureSvg(x, y, { scale = 1, phones = false, cls = "ear-figure" } = {}) {
  const s = scale;
  const head = y - 34 * s;
  return `<g class="${cls}">
    <circle cx="${x}" cy="${head}" r="${5.5 * s}"/>
    <path d="M${x} ${head + 5.5 * s}v${15 * s}M${x - 8 * s} ${head + 11 * s}l${8 * s} ${3 * s}l${8 * s} -${3 * s}M${x} ${head + 20.5 * s}l-${6 * s} ${13.5 * s}M${x} ${head + 20.5 * s}l${6 * s} ${13.5 * s}"/>
    ${phones ? `<path class="ear-phones" d="M${x - 7 * s} ${head + 1 * s}a${7 * s} ${7 * s} 0 0 1 ${14 * s} 0"/><rect class="ear-cup" x="${x - 8.5 * s}" y="${head - 0.5 * s}" width="${3.5 * s}" height="${5 * s}" rx="1"/><rect class="ear-cup" x="${x + 5 * s}" y="${head - 0.5 * s}" width="${3.5 * s}" height="${5 * s}" rx="1"/>` : ""}
  </g>`;
}

export class ListenBar {
  constructor(root, { store, getSkin, onTransport, getRecorder = () => null }) {
    this.root = root;
    this.getRecorder = getRecorder; // the recorder's runtime (take playback), if one is on stage
    this.store = store;
    this.getSkin = getSkin;
    this.onTransport = onTransport;
    this.dests = GENERIC;
    this.places = [];
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dest]");
      if (b) store.setListen(b.dataset.dest);
      if (e.target.closest(".transport")) this.onTransport();
    });
    root.addEventListener("keydown", (e) => {
      const b = e.target.closest("[data-dest]");
      if (!b) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        return store.setListen(b.dataset.dest);
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const order = this.places.map((p) => p.dest);
      const i = order.indexOf(b.dataset.dest);
      const next = order[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : order.length - 1)) % order.length];
      store.setListen(next);
      this.root.querySelector(`[data-dest="${next}"]`)?.focus();
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

  render() {
    this.root.innerHTML = `
      <div class="ears">
        <span class="listen-label" aria-hidden="true">Your ears</span>
        <svg class="ears-map" viewBox="0 0 ${MAP_W} ${MAP_H}" role="radiogroup" aria-label="Where are you listening from?"></svg>
      </div>
      <div class="listen-now">
        <p class="ears-where"></p>
        <p class="listen-msg" aria-live="polite"></p>
      </div>
      <button type="button" class="transport btn" disabled>…</button>`;
    this.meter = new MeterView({ orientation: "horizontal", label: "What you hear", showText: false });
    this.meter.el.classList.add("listen-meter");
    this.root.querySelector(".ears-where").after(this.meter.el);
    this.map = this.root.querySelector(".ears-map");
    this.where = this.root.querySelector(".ears-where");
    this.msg = this.root.querySelector(".listen-msg");
    this.transport = this.root.querySelector(".transport");
    this.lastMsg = null;
    this.mapKey = "";
  }

  // Each destination's place in the venue, from the speakers it reaches.
  placesFor(dests, ends, patchedEnds, devices, sub, dead) {
    const name = (id) => devices.get(id)?.short || devices.get(id)?.label || id;
    const where = (d) => {
      if (d === "pfl" || d === "phones") return { kind: "desk", place: "Engineer's headphones" };
      if (d === "rec") return { kind: "desk", place: "Recorder headphones" };
      const eps = ends[d]?.length ? ends[d] : patchedEnds[d] || [];
      if (!eps.length) return { kind: "nowhere", place: `${this.label(d)}: no speaker` };
      const zone = eps[0].zone;
      const pan = eps.reduce((a, e) => a + (e.pan || 0), 0) / eps.length;
      if (d === "main") return { kind: "audience", place: "In the audience", pan };
      if (zone === "stage") return { kind: "stage", place: `At the ${eps.map((e) => name(e.deviceId)).join(" + ")}`, pan };
      if (zone === "cam") return { kind: "side", place: `At the ${name(eps[0].deviceId)}`, pan };
      if (zone === "lobby") return { kind: "side", place: "In the lobby", pan };
      return { kind: "front", place: `Near the ${name(eps[0].deviceId)}`, pan };
    };
    const places = dests.map((d) => ({ dest: d, label: this.label(d), sub: sub(d), dead: dead(d), ...where(d), deviceIds: (ends[d] || []).map((e) => e.deviceId) }));
    // Spread the spots of each kind so two wedges never stand on each other.
    const spread = (kind, x0, x1, y) => {
      const ps = places.filter((p) => p.kind === kind).sort((a, b) => (a.pan || 0) - (b.pan || 0));
      ps.forEach((p, k) => Object.assign(p, { x: x0 + ((k + 0.5) * (x1 - x0)) / ps.length, y }));
    };
    spread("stage", 70, 210, 26);
    spread("audience", 140, 140, 52);
    spread("front", 92, 188, 44);
    spread("side", 250, 274, 0);
    places.filter((p) => p.kind === "side").forEach((p, k) => (p.y = 26 + k * 26));
    places.filter((p) => p.kind === "desk").forEach((p, k) => Object.assign(p, { x: 196 + k * 18, y: 68 }));
    places.filter((p) => p.kind === "nowhere").forEach((p, k) => Object.assign(p, { x: 10 + (k % 2) * 16, y: 48 + Math.floor(k / 2) * 18 }));
    return places;
  }

  drawMap(state, mix) {
    const devices = new Map(state.rig.devices.map((d) => [d.id, d]));
    // House speakers and wedges as scenery, where they stand.
    const scenery = mix.rig.endpoints
      .map((e) => {
        const d = devices.get(e.deviceId);
        if (!d) return "";
        if (e.zone === "stage") {
          const p = this.places.find((pl) => pl.deviceIds.includes(e.deviceId));
          const x = p ? p.x : 140 + (e.pan || 0) * 60;
          return `<path class="map-wedge ${e.valid ? "" : "off"}" d="M${x - 9} 27l3 -6h12l3 6z"/>`;
        }
        if (e.zone === "foh") {
          const x = (e.pan || 0) < 0 ? 52 : (e.pan || 0) > 0 ? 228 : 140;
          return (e.pan || 0) === 0 ? "" : `<rect class="map-spk ${e.valid ? "" : "off"}" x="${x - 5}" y="4" width="10" height="16" rx="2"/>`;
        }
        return "";
      })
      .join("");
    const spots = this.places
      .map((p) => {
        const on = state.listen === p.dest;
        const aria = `${p.place} (${p.label})${p.dead ? ", silent" : ""}`;
        return `<g class="ear-spot kind-${p.kind} ${on ? "on" : ""} ${p.dead ? "dead" : ""}" data-dest="${esc(p.dest)}" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" aria-label="${esc(aria)}">
          <title>${esc(aria)}</title>
          <circle class="spot-hit" cx="${p.x}" cy="${p.y - 10}" r="12"/>
          ${on ? figureSvg(p.x, p.y, { scale: 0.62, phones: p.kind === "desk" }) : `<circle class="spot-dot" cx="${p.x}" cy="${p.y - 8}" r="4.5"/>`}
        </g>`;
      })
      .join("");
    this.map.innerHTML = `
      <rect class="map-stage" x="40" y="2" width="200" height="27" rx="4"/><text class="map-word" x="140" y="9" text-anchor="middle">STAGE</text>
      <text class="map-word" x="140" y="${MAP_H - 2}" text-anchor="middle">AUDIENCE</text>
      <rect class="map-desk" x="182" y="58" width="44" height="10" rx="2"/><text class="map-word" x="230" y="66">DESK</text>
      ${this.places.some((p) => p.kind === "nowhere") ? `<text class="map-word" x="2" y="36">SILENT</text>` : ""}
      ${scenery}${spots}`;
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
    const patchedEnds = {};
    const patched = new Set();
    for (const e of mix.rig.endpoints) {
      if (!e.output) continue;
      const g = listenGroupOf(state, e.output);
      patched.add(g);
      (patchedEnds[g] ||= []).push(e);
      if (e.valid) (ends[g] ||= []).push(e);
    }

    // The spots follow the mixer (and, on the 1604, the patch): the main mix,
    // the first two auxes, ALT, MONITOR and the phones the mixer has; any other
    // output once a speaker is patched to it.
    const recDev = state.rig.devices.find((d) => d.type === "zoom-f8");
    const wanted = real ? listenDestinations(state).filter((d) => (d === "rec" ? !!recDev : ALWAYS.includes(d) || patched.has(d) || d === state.listen)) : GENERIC;
    this.dests = wanted;

    const pfls = state.channels.filter((c) => c.pfl).map((c) => c.index + 1);
    const phones = real ? mix.phones : null;
    const phonesText = () => {
      if (phones.selector && !phones.solo) return `HEADPHONE: ${phones.selector}`;
      if (phones.solo) {
        const what = [...phones.soloed.map((n) => `Ch ${n}`), ...phones.auxSolo.map((b) => t[b])].join(", ");
        return `SOLO: ${what}`;
      }
      return phones.sources.length ? `C-R: ${phones.sources.map((s) => SOURCE_NAMES[s]).join(" + ")}` : "C-R: no SOURCE";
    };
    const rec = recDev ? recorderText(recDev, this.getRecorder(), mix.rig.recorders?.[recDev.id]) : null;
    const sub = (d) => {
      if (d === "pfl") return pfls.length ? `Ch ${pfls.join(", ")}` : "no PFL pressed";
      if (d === "phones") return phonesText();
      if (d === "rec") return rec.sub;
      return ends[d]?.length ? names(ends[d]) : "no working speaker";
    };
    const dead = (d) => (d === "pfl" ? !pfls.length : d === "phones" ? !phones.solo && (phones.selector ? phones.selector === "OFF" : !phones.sources.length) : d === "rec" ? rec.dead : !ends[d]?.length);

    this.places = this.placesFor(wanted, ends, patchedEnds, devices, sub, dead);
    const key = JSON.stringify([state.listen, this.places.map((p) => [p.dest, p.x, p.y, p.dead, p.deviceIds]), mix.rig.endpoints.map((e) => [e.deviceId, e.valid])]);
    if (key !== this.mapKey) {
      this.mapKey = key;
      this.drawMap(state, mix);
    }

    const dest = state.listen;
    const here = this.places.find((p) => p.dest === dest);
    const whereText = here ? `${here.place} · ${here.label}${here.dead ? " (silent)" : ""}` : this.label(dest);
    if (this.where.textContent !== whereText) this.where.textContent = whereText;

    const busName = dest === "main" ? (real ? "the MAIN mix" : "Main L/R") : t[dest] || dest;
    let msg;
    if (dest === "rec" && this.getRecorder()?.playing) msg = rec.msg; // a take plays even with the band stopped
    else if (!ready) msg = loadingText || "Loading…";
    else if (!playing) msg = "Playback stopped.";
    else if (buffering) msg = "Buffering the next part of the song…";
    else if (dest === "pfl") msg = pfls.length ? `Engineer's headphones: PFL on Ch ${pfls.join(", ")} (before the ${t.levelShort.toLowerCase()}).` : "Headphones are quiet: press PFL on a channel to hear it here.";
    else if (dest === "phones") msg = phonesMessage(phones, t);
    else if (dest === "rec") msg = rec.msg;
    else if (ends[dest]?.length) {
      msg = `Hearing ${busName} through the ${names(ends[dest])}.`;
      // A camera input whose MIC/LINE switch doesn't match what it's fed.
      for (const e of ends[dest].filter((e) => e.camera && e.status !== "ok")) msg += ` ${short(e)}: ${e.status === "hot" ? "distorting, its MIC input is fed line level" : "too quiet, its LINE input is fed mic level"}.`;
    }
    else msg = `Silence: ${busName} doesn't reach a working speaker. Check Stage & patch.`;
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

const SELECTOR_TEXT = {
  L: "the left output in both ears",
  R: "the right output in both ears",
  M: "left + right summed to mono in both ears (the way to hear a phase problem)",
  ST: "the stereo mix, left in the left ear",
};

function phonesMessage(p, t) {
  if (p.selector && !p.solo) {
    if (p.selector === "OFF") return "Headphones are quiet: the HEADPHONE selector is OFF.";
    return `Engineer's headphones: ${SELECTOR_TEXT[p.selector]}${p.tone ? ". TONE is on, 20 dB down in the headphones" : ""}.`;
  }
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
