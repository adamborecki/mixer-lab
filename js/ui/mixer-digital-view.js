// Draws a digital mixer (the Soundcraft Ui16, js/compact-defs.js `digital: true`)
// the way its tablet app does. Two ideas a console doesn't have:
//   - The MIX BAR picks what the faders do: MIX (channel levels into the
//     master), GAIN (input gain), AUX 1–4 or an effect (each channel's send
//     into that mix: "sends on faders"). The fader on the right is that mix's master.
//   - SEL picks one channel; the panel beside the faders shows everything
//     about it: input, HPF, EQ, dynamics, pan and every send.
// The page and the selection are the view's own (view.digital), not mixer state.
// Every control writes through MixerStore; nothing here knows about audio nodes.

import { RangeControl, LitButton } from "./controls.js";
import { DYN, LAWS, OL_DB, PEQ_BANDS, PEQ_Q, levelLaw } from "../compact.js";
import { formatDb, formatPan } from "../levels.js";

const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });
export const FADER_MARKS = [10, 5, 0, -5, -10, -20, -30, -50].map((db) => ({ value: LAWS.level.toPos(db), label: db === 0 ? "U" : db > 0 ? `+${db}` : `${db}` }));
const RELEASE_DB_PER_S = 24;
const hz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`);
// Frequency knobs turn on a log scale.
const logPos = (f, lo, hi) => Math.log(f / lo) / Math.log(hi / lo);
const logFreq = (p, lo, hi) => lo * Math.pow(hi / lo, p);

export function el(tag, className, text) {
  const d = document.createElement(tag);
  if (className) d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

export function row(className, ...els) {
  const d = el("div", className);
  d.append(...els.filter(Boolean));
  return d;
}

// The pages of the mix bar: MIX, GAIN, then every aux and effect bus.
function pagesOf(def) {
  return [
    { id: "mix", label: "MIX" },
    { id: "gain", label: "GAIN" },
    ...Object.entries(def.buses).map(([id, b]) => ({ id, label: b.label, fx: !!b.fx })),
  ];
}

export function renderDigital(view, def) {
  if (!view.digital || view.digital.id !== def.id) view.digital = { id: def.id, page: "mix", sel: 0 };
  const ui = view.digital;
  const rerender = () => view.render();
  view.def = def;
  view.dgMeters = [];
  view.dgHeads = [];
  view.paths = [];
  view.pathKey = "";

  const surface = el("div", "mixer-surface dg-surface");

  // ---------- mix bar ----------
  const bar = el("div", "dg-bar");
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "What the faders control");
  for (const p of pagesOf(def)) {
    const b = el("button", `dg-tab${p.fx ? " is-fx" : ""}${p.id.startsWith("aux") ? " is-aux" : ""}`, p.label);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(ui.page === p.id));
    b.addEventListener("click", () => {
      if (ui.page === p.id) return;
      ui.page = p.id;
      rerender();
    });
    bar.appendChild(b);
  }
  const page = pagesOf(def).find((p) => p.id === ui.page);
  const hint = el(
    "p",
    "dg-hint",
    ui.page === "mix"
      ? "Faders: each channel's level in the MASTER mix."
      : ui.page === "gain"
        ? "Faders: each input's GAIN (the preamp). Set it so the meters sit in the middle, then mix on the MIX page."
        : page.fx
          ? `Faders: how much of each channel goes into the ${page.label}. The fader on the right is the ${page.label} return in the MASTER mix.`
          : `Faders: how much of each channel goes into ${page.label}, not the MASTER mix. PRE sends ignore the MIX faders; POST sends follow them.`,
  );

  // ---------- fader bank ----------
  const bank = el("div", "mixer-strips dg-bank");
  bank.setAttribute("role", "group");
  bank.setAttribute("aria-label", `Channels: ${page.label}`);
  def.channels.forEach((_, i) => bank.appendChild(buildStrip(view, def, i, ui, rerender)));
  bank.appendChild(buildMasterStrip(view, def, ui));

  const left = row("dg-left", bar, hint, bank);
  surface.append(left, buildSelPanel(view, def, ui, rerender));
  view.root.appendChild(surface);
}

export function fader(view, { label, sheetLabel, min = 0, max = 1, step = 0.005, defaultValue = 0.75, marks = FADER_MARKS, format, get, onInput, tone }) {
  return view.bind(new RangeControl({ kind: "fader", label, sheetLabel, min, max, step, keyStepMul: 2, defaultValue, marks, format, onInput, tone }), get).el;
}

export function knob(view, opts, get) {
  return view.bind(new RangeControl({ kind: "knob", dragAxis: "vertical", step: 0.005, keyStepMul: 2, min: 0, max: 1, size: "xs", ...opts }), get).el;
}

export function button(view, { label, tone = "assign", small = true, get, onPress, aria }) {
  const b = new LitButton({ label, tone, small, onPress });
  view.bindings.push({ kind: "button", control: b, get: (s) => [get(s), aria(s)] });
  return b.el;
}

export function meterBar(view, index) {
  const m = el("div", "dg-meter");
  m.setAttribute("aria-hidden", "true");
  const fill = el("i");
  const peak = el("b");
  m.append(fill, peak);
  view.dgMeters.push({ index, fill, peak, level: -Infinity, lastT: 0, peakUntil: 0 });
  return m;
}

// ---------- one channel ----------

function buildStrip(view, def, i, ui, rerender) {
  const store = view.store;
  const c = def.channels[i];
  const n = c.label;
  const ch = (s) => s.channels[i];
  const flip = (key) => () => store.setChannel(i, key, !ch(store.state)[key]);
  const strip = el("section", `strip dg-strip${c.kind === "stereo" ? " is-stereo" : ""}${ui.sel === i ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", `Channel ${n}`);

  const head = el("button", "strip-head");
  head.type = "button";
  head.addEventListener("click", () => view.onPatchChannel(i));
  view.bindings.push({ kind: "head", el: head, index: i });
  view.dgHeads[i] = head;

  const sel = el("button", `dg-sel${ui.sel === i ? " on" : ""}`, "SEL");
  sel.type = "button";
  sel.setAttribute("aria-pressed", String(ui.sel === i));
  sel.setAttribute("aria-label", `Select channel ${n} to edit it`);
  sel.addEventListener("click", () => {
    if (ui.sel === i) return;
    ui.sel = i;
    rerender();
  });

  let control;
  let extra = null;
  if (ui.page === "mix") {
    control = fader(view, { label: "", sheetLabel: `Ch ${n} fader`, format: lawFormat(levelLaw(def)), get: (s) => ch(s).level, onInput: (v) => store.setChannel(i, "level", v) });
  } else if (ui.page === "gain") {
    control = fader(view, {
      label: "",
      sheetLabel: `Ch ${n} gain`,
      min: c.gain.min,
      max: c.gain.max,
      step: 0.5,
      defaultValue: c.gain.min,
      marks: [c.gain.max, 40, 20, 0, c.gain.min].filter((v, k, a) => v <= c.gain.max && v >= c.gain.min && a.indexOf(v) === k).map((v) => ({ value: v, label: `${v > 0 ? "+" : ""}${v}` })),
      tone: "gain",
      format: (v) => (view.paths[i] === "line" ? `${formatDb(v + (c.gain.linePad || 0))} line` : `${v > 0 ? "+" : ""}${Math.round(v)} dB`),
      get: (s) => ch(s).gainDb,
      onInput: (v) => store.setChannel(i, "gainDb", v),
    });
    extra = def.phantom.channels.includes(i) ? button(view, { label: def.phantom.label, tone: "phantom", get: (s) => ch(s).phantom, onPress: flip("phantom"), aria: (s) => `Channel ${n} 48V: ${ch(s).phantom ? "on" : "off"}` }) : null;
  } else {
    const sid = ui.page; // the send into this bus has the same id on the Ui16
    const send = def.sends[sid];
    control = fader(view, { label: "", sheetLabel: `Ch ${n} ${send.label} send`, defaultValue: 0, format: lawFormat(LAWS[send.law]), tone: def.buses[sid].fx ? "eq" : "aux1", get: (s) => ch(s).sends[sid], onInput: (v) => store.setChannel(i, `sends.${sid}`, v) });
    if (send.tap === "each")
      extra = button(view, {
        label: "PRE",
        tone: "pfl",
        get: (s) => ch(s).pres[sid],
        onPress: () => store.setChannel(i, `pres.${sid}`, !ch(store.state).pres[sid]),
        aria: (s) => `Channel ${n} ${send.label} send: ${ch(s).pres[sid] ? "PRE, ignores the MIX fader" : "POST, follows the MIX fader"}`,
      });
  }

  const mute = button(view, { label: "MUTE", tone: "mute", small: false, get: (s) => !ch(s).enabled, onPress: () => store.setChannel(i, "enabled", !ch(store.state).enabled), aria: (s) => `Channel ${n} MUTE: ${ch(s).enabled ? "off" : "on, out of every mix"}` });
  const solo = button(view, { label: "SOLO", tone: "pfl", get: (s) => ch(s).solo, onPress: flip("solo"), aria: (s) => `Channel ${n} SOLO: ${ch(s).solo ? "on, in the PHONES" : "off"}` });
  view.bindings.push({ kind: "fn", run: (s) => strip.classList.toggle("is-muted", !ch(s).enabled) });

  strip.append(head, sel, row("dg-extra", extra), row("dg-fader", control, meterBar(view, i)), row("dg-btns", mute, solo));
  return strip;
}

// The fader on the right: the master of whatever mix the bar shows.
function buildMasterStrip(view, def, ui) {
  const store = view.store;
  const strip = el("section", "strip dg-strip dg-master");
  const busId = ui.page === "mix" || ui.page === "gain" ? null : ui.page;
  const name = busId ? def.buses[busId].label : def.main.label;
  strip.setAttribute("aria-label", `${name} master`);
  strip.appendChild(el("div", "dg-master-name", busId && def.buses[busId].fx ? `${name} RTN` : name));
  if (ui.page === "gain") {
    strip.appendChild(el("p", "dg-note", "No master on the GAIN page."));
    return strip;
  }
  const get = busId ? (s) => s[busId].level : (s) => s.main.level;
  const set = busId ? (v) => store.setBus(busId, "level", v) : (v) => store.setBus("main", "level", v);
  const law = LAWS[busId ? def.buses[busId].master.law : def.main.law];
  const meters = row("dg-master-meters", meterBar(view, "L"), meterBar(view, "R"));
  strip.append(el("div", "dg-extra"), row("dg-fader", fader(view, { label: "", sheetLabel: `${name} master fader`, format: lawFormat(law), get, onInput: set }), meters));
  const phones = knob(view, { label: "PHONES", sheetLabel: "Headphone level", defaultValue: 0.5, tone: "level", format: lawFormat(LAWS.master), onInput: (v) => store.setBus("cr", "level", v) }, (s) => s.cr.level);
  strip.appendChild(row("dg-btns", phones));
  return strip;
}

// ---------- the SEL panel ----------

export function buildSelPanel(view, def, ui, rerender) {
  const store = view.store;
  const i = ui.sel;
  const c = def.channels[i];
  const n = c.label;
  const ch = (s) => s.channels[i];
  const set = (key) => (v) => store.setChannel(i, key, v);
  const flip = (key) => () => store.setChannel(i, key, !ch(store.state)[key]);
  const panel = el("section", "dg-panel");
  panel.setAttribute("aria-label", `Selected channel ${n}`);

  const title = el("h4", "dg-panel-title");
  // The name comes from the channel's head (filled from the patch just before this runs).
  view.bindings.push({ kind: "fn", run: () => (title.textContent = `CH ${n} · ${view.dgHeads[i]?.querySelector(".strip-name")?.textContent || "—"}`) });
  const prev = el("button", "dg-step", "‹");
  const next = el("button", "dg-step", "›");
  for (const [b, d, label] of [[prev, -1, "Previous channel"], [next, 1, "Next channel"]]) {
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => {
      ui.sel = (ui.sel + d + def.channels.length) % def.channels.length;
      rerender();
    });
  }
  panel.appendChild(row("dg-panel-head", prev, title, next));

  const section = (name, ...els) => {
    const s = el("div", "dg-sec");
    s.appendChild(el("h5", "", name));
    s.appendChild(row("dg-sec-body", ...els));
    return s;
  };

  // Input.
  panel.appendChild(
    section(
      "INPUT",
      knob(view, { label: "GAIN", sheetLabel: `Ch ${n} gain`, min: c.gain.min, max: c.gain.max, step: 0.5, defaultValue: c.gain.min, tone: "gain", size: undefined, format: (v) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`, onInput: set("gainDb") }, (s) => ch(s).gainDb),
      def.phantom.channels.includes(i) ? button(view, { label: def.phantom.label, tone: "phantom", get: (s) => ch(s).phantom, onPress: flip("phantom"), aria: (s) => `Channel ${n} 48V: ${ch(s).phantom ? "on" : "off"}` }) : null,
      c.polarity ? button(view, { label: "Ø", get: (s) => ch(s).polarity, onPress: flip("polarity"), aria: (s) => `Channel ${n} polarity: ${ch(s).polarity ? "reversed" : "normal"}` }) : null,
      c.hiZ ? button(view, { label: "Hi-Z", get: (s) => ch(s).hiZ, onPress: flip("hiZ"), aria: (s) => `Channel ${n} Hi-Z: ${ch(s).hiZ ? "on" : "off"}` }) : null,
      c.hpf ? knob(view, { label: "HPF", sheetLabel: `Ch ${n} high-pass`, defaultValue: 0, tone: "eq", format: (v) => (v <= 0.02 ? "off" : `${hz(c.hpf.min + (c.hpf.max - c.hpf.min) * Math.max(0, (v - 0.05) / 0.95))} Hz`), onInput: set("hpf") }, (s) => ch(s).hpf) : null,
    ),
  );

  // Parametric EQ: GAIN, FREQ and Q per band.
  if (c.peq) {
    const bands = PEQ_BANDS.map((b) =>
      row(
        "dg-band",
        el("span", "dg-band-name", b.label),
        knob(view, { label: "GAIN", sheetLabel: `Ch ${n} EQ ${b.label} gain`, min: -15, max: 15, step: 0.5, defaultValue: 0, bipolar: true, tone: "eq", format: (v) => (Math.abs(v) < 0.25 ? "0 dB" : `${v > 0 ? "+" : "−"}${Math.abs(v)} dB`), onInput: set(`peq.${b.id}.gain`) }, (s) => ch(s).peq[b.id].gain),
        knob(view, { label: "FREQ", sheetLabel: `Ch ${n} EQ ${b.label} frequency`, defaultValue: logPos(b.freq, b.min, b.max), tone: "eq", format: (v) => `${hz(logFreq(v, b.min, b.max))} Hz`, onInput: (v) => store.setChannel(i, `peq.${b.id}.freq`, logFreq(v, b.min, b.max)) }, (s) => logPos(ch(s).peq[b.id].freq, b.min, b.max)),
        b.type === "peaking"
          ? knob(view, { label: "Q", sheetLabel: `Ch ${n} EQ ${b.label} width (Q)`, min: PEQ_Q.min, max: PEQ_Q.max, step: 0.05, defaultValue: 0.7, tone: "eq", format: (v) => v.toFixed(1), onInput: set(`peq.${b.id}.q`) }, (s) => ch(s).peq[b.id].q)
          : el("span", "dg-q-blank", "shelf"),
      ),
    );
    const flat = el("button", "dg-flat", "FLAT");
    flat.type = "button";
    flat.addEventListener("click", () => PEQ_BANDS.forEach((b) => store.setChannel(i, `peq.${b.id}.gain`, 0)));
    panel.appendChild(section("EQ", ...bands, flat));
  }

  // Dynamics.
  if (c.dyn) {
    const gr = el("span", "c16-led led-comp");
    gr.innerHTML = '<i aria-hidden="true"></i><small>GR</small>';
    view.dgGr = { index: i, el: gr.querySelector("i") };
    panel.appendChild(
      section(
        "COMPRESSOR",
        knob(view, { label: "THRESH", sheetLabel: `Ch ${n} compressor threshold`, min: DYN.threshold[0], max: DYN.threshold[1], step: 0.5, defaultValue: 0, tone: "gain", format: (v) => (v >= 0 ? "off" : `${v} dB`), onInput: set("dyn.threshold") }, (s) => ch(s).dyn.threshold),
        knob(view, { label: "RATIO", sheetLabel: `Ch ${n} compressor ratio`, min: DYN.ratio[0], max: DYN.ratio[1], step: 0.1, defaultValue: 1, tone: "gain", format: (v) => `${v.toFixed(1)}:1`, onInput: set("dyn.ratio") }, (s) => ch(s).dyn.ratio),
        knob(view, { label: "GAIN", sheetLabel: `Ch ${n} compressor make-up gain`, min: DYN.makeup[0], max: DYN.makeup[1], step: 0.5, defaultValue: 0, tone: "gain", format: (v) => `+${v} dB`, onInput: set("dyn.makeup") }, (s) => ch(s).dyn.makeup),
        gr,
      ),
    );
  }

  // Pan and every send, so one channel's whole picture is in one place.
  const sendKnobs = (c.sends || []).map((sid) => {
    const d = def.sends[sid];
    return row(
      "dg-send",
      knob(view, { label: d.label, sheetLabel: `Ch ${n} ${d.label} send`, defaultValue: 0, tone: def.buses[sid]?.fx ? "eq" : "aux1", format: lawFormat(LAWS[d.law]), onInput: set(`sends.${sid}`) }, (s) => ch(s).sends[sid]),
      d.tap === "each" ? button(view, { label: "PRE", tone: "pfl", get: (s) => ch(s).pres[sid], onPress: () => store.setChannel(i, `pres.${sid}`, !ch(store.state).pres[sid]), aria: (s) => `Channel ${n} ${d.label}: ${ch(s).pres[sid] ? "PRE" : "POST"}` }) : null,
    );
  });
  panel.appendChild(
    section(
      "PAN & SENDS",
      def.lrSwitch ? button(view, { label: "MAIN LR", tone: "assign", get: (s) => ch(s).lr !== false, onPress: () => store.setChannel(i, "lr", ch(store.state).lr === false), aria: (s) => `Channel ${n} MAIN LR: ${ch(s).lr !== false ? "on, in the main mix" : "off, not in the main mix"}` }) : null,
      knob(view, { label: c.kind === "stereo" ? "BAL" : "PAN", sheetLabel: `Ch ${n} pan`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: set("pan") }, (s) => ch(s).pan),
      ...sendKnobs,
    ),
  );
  return panel;
}

// ---------- live display ----------

export function updateDigital(view, readings, now) {
  const db = (r) => (r ? r.peakDb : -Infinity);
  for (const m of view.dgMeters || []) {
    const peak = m.index === "L" ? db(readings.meterL) : m.index === "R" ? db(readings.meterR) : db(readings.channels[m.index]);
    const dt = m.lastT ? (now - m.lastT) / 1000 : 0;
    m.lastT = now;
    m.level = Math.max(peak, m.level - RELEASE_DB_PER_S * dt);
    // −60 … 0 dBFS fills the bar; red once a peak is within 3 dB of clipping.
    const pct = Math.max(0, Math.min(100, ((m.level + 60) / 60) * 100));
    m.fill.style.height = `${pct}%`;
    if (peak >= OL_DB) m.peakUntil = now + 300;
    m.peak.classList.toggle("on", now < m.peakUntil);
  }
  if (view.dgGr) view.dgGr.el.classList.toggle("on", (readings.comp?.[view.dgGr.index] || 0) < -1);
}
