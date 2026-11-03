// Console: Mix5 — the Mackie Mix5 on top of Salmon's hall mains rack, as its
// own small console (CME in Salmon). Laid out like its top panel: the jacks
// along the top, then CH 1, 2/3, 4/5, TAPE and MAIN. Its knobs are the rig
// device's (DEVICE_TYPES.mix5 `knobs`, set through MixerStore.setDevice):
// 4/5 BAL and LEVEL and MAIN MIX change what the hall's speakers play; the
// rest are there to see and turn, with nothing plugged into them. The meters
// read the console's MAIN through 4/5 and MAIN MIX (0 on the Mix5 taken as
// −18 dBFS on the X32: an estimate, not a measurement).

import { DEVICE_TYPES, cableAt, getPort, knobDb, knobPos, knobsDb, rigLinks } from "../connection-model.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const STRIPS = [
  { title: "1", keys: ["ch1Gain", "ch1High", "ch1Low", "ch1Pan", "ch1Level"] },
  { title: "2/3", keys: ["bal23", "lvl23"] },
  { title: "4/5", keys: ["bal45", "lvl45"] },
  { title: "TAPE", keys: ["tapePhones", "tapeMain"] },
  { title: "MAIN", keys: ["phones", "main"], meter: true },
];
const JACKS = [
  ["MIC / LINE IN 1", []],
  ["LINE IN 2/3", []],
  ["LINE IN 4/5", ["in-l", "in-r"]],
  ["MAIN OUT", ["out-l", "out-r"]],
  ["PHONES", []],
];
const LEDS = [["OL", 18], ["+6", 6], ["0", 0], ["−20", -20]];
const MIX5_ZERO_DBFS = -18; // the Mix5's 0 on its meter, taken as −18 dBFS on the console

// What a knob reads: its position, and what that does on the way to the hall.
function readout(k, pos) {
  if (k.unit === "pan") return pos === k.unity ? "center" : pos < k.unity ? `L ${k.unity - pos}` : `R ${pos - k.unity}`;
  if (k.unit === "eq") return pos === k.unity ? "flat" : `${pos > k.unity ? "+" : "−"}${Math.round(Math.abs(pos - k.unity) * 3)} dB`;
  if (k.balance) return pos === k.unity ? "center" : pos < k.unity ? `L ${k.unity - pos}` : `R ${pos - k.unity}`;
  const db = knobDb(pos, k.unity);
  return `${pos} · ${db === -Infinity ? "off" : Math.abs(db) < 0.5 ? "U" : `${db > 0 ? "+" : "−"}${Math.abs(db).toFixed(0)} dB`}`;
}

export class Mix5View {
  constructor(root, { store }) {
    this.root = root;
    this.store = store;
    this.built = null;
    root.addEventListener("input", (e) => {
      const el = e.target.closest("[data-mix5-key]");
      if (!el) return;
      this.store.setDevice(this.built, el.dataset.mix5Key, Number(el.value));
      this.update();
    });
  }

  device() {
    return this.store.state.rig.devices.find((d) => DEVICE_TYPES[d.type]?.console);
  }

  // Builds the panel for the rig's Mix5 (once per device), then keeps it current.
  sync(mix) {
    this.mix = mix;
    const d = this.device();
    if (!d) {
      this.built = null;
      this.root.innerHTML = "";
      return;
    }
    if (this.built !== d.id || this.rigKey !== this.rigSig(d)) this.build(d);
    this.update();
  }

  rigSig(d) {
    return DEVICE_TYPES[d.type].ports.map((p) => cableAt(this.store.state.rig, `${d.id}/${p.id}`)?.id || "").join();
  }

  build(d) {
    const type = DEVICE_TYPES[d.type];
    const rig = this.store.state.rig;
    this.built = d.id;
    this.rigKey = this.rigSig(d);
    const knob = (key) => type.knobs.find((k) => k.key === key);
    const control = (k) =>
      k.select
        ? `<label class="m5-switch"><span>${esc(k.label.replace(/^TAPE /, ""))}</span><select data-mix5-key="${k.key}" aria-label="Mix5 ${esc(k.label)}">${k.select.map((t, i) => `<option value="${i}">${esc(t)}</option>`).join("")}</select></label>`
        : `<label class="m5-knob${k.path === false ? "" : " m5-live"}"><span>${esc(k.label.replace(/^CH 1 |^2\/3 |^4\/5 /, ""))}</span><input type="range" min="0" max="10" step="0.5" data-mix5-key="${k.key}" aria-label="Mix5 ${esc(k.label)}" /><output data-mix5-readout="${k.key}"></output></label>`;
    // Each jack group and what's plugged into it ("← S32 · stage-side rack: S32 OUT 15 + S32 OUT 16").
    const jack = ([name, ports]) => {
      const ends = ports.map((id) => cableAt(rig, `${d.id}/${id}`)).filter(Boolean).map((c) => getPort(rig, c.from.startsWith(`${d.id}/`) ? c.to : c.from));
      const arrow = ports[0]?.startsWith("out") ? "→" : "←";
      const what = ends.length ? `${arrow} ${ends[0].device.label || DEVICE_TYPES[ends[0].device.type].name}: ${ends.map((p) => p.name).join(" + ")}` : "nothing plugged in";
      return `<li class="m5-jack${ends.length ? " is-plugged" : ""}"><strong>${esc(name)}</strong><small>${esc(what)}</small></li>`;
    };
    this.root.innerHTML = `
      <div class="m5-face">
        <div class="m5-brand"><strong>MIX5</strong><span>5-channel compact mixer · the hall's mains rack</span></div>
        <ul class="m5-jacks">${JACKS.map(jack).join("")}</ul>
        <div class="m5-strips">${STRIPS.map((s) => `<section class="m5-strip m5-strip-${s.title === "2/3" ? "23" : s.title === "4/5" ? "45" : s.title.toLowerCase()}">
          <h4>${esc(s.title)}</h4>
          ${s.meter ? `<div class="m5-power"><span class="m5-led m5-on" aria-hidden="true"></span>POWER</div><div class="m5-meter" role="img" aria-label="Main meters">${["L", "R"].map((side) => `<div class="m5-meter-col">${LEDS.map(([t]) => `<span class="m5-led" data-led="${side}${t}"></span>`).join("")}<small>${side === "L" ? "LEFT" : "RIGHT"}</small></div>`).join("")}<div class="m5-meter-scale">${LEDS.map(([t]) => `<small>${t}</small>`).join("")}</div></div>` : ""}
          ${s.keys.map((k) => control(knob(k))).join("")}
        </section>`).join("")}</div>
        <p class="m5-note">Its MAIN OUT feeds the Crown inside this rack, which drives the hall's installed speakers. The highlighted knobs are the ones on that path: 4/5 BAL and LEVEL (S32 OUT 15/16) and MAIN MIX. To take the X32 off the hall's speakers, turn 4/5 LEVEL down, not MAIN MIX: then a phone in the 3.5 mm input still works.</p>
      </div>`;
  }

  update() {
    const d = this.device();
    if (!d || !this.built) return;
    const type = DEVICE_TYPES[d.type];
    for (const k of type.knobs) {
      const el = this.root.querySelector(`[data-mix5-key="${k.key}"]`);
      const pos = knobPos(d, k);
      if (el && document.activeElement !== el && Number(el.value) !== pos) el.value = String(pos);
      const out = this.root.querySelector(`[data-mix5-readout="${k.key}"]`);
      if (out) out.textContent = readout(k, pos);
    }
    // The meters: what comes in on 4/5 from the console, through 4/5 and MAIN MIX.
    const rig = this.store.state.rig;
    const links = rigLinks(rig).filter((l) => l.via === d.id);
    for (const [side, pair, port] of [["L", "a", "out-l"], ["R", "b", "out-r"]]) {
      const link = links.find((l) => l.viaPort === port);
      const bus = link && this.store.state.routing?.[getPort(rig, link.from)?.id];
      const peak = bus && this.mix?.outputs?.[bus]?.peakDb;
      const db = Number.isFinite(peak) ? peak - MIX5_ZERO_DBFS + knobsDb(d, pair) : -Infinity;
      for (const [t, at] of LEDS) this.root.querySelector(`[data-led="${side}${t}"]`)?.classList.toggle("m5-on", db >= at);
    }
  }
}

