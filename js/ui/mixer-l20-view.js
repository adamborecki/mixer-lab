// Draws the Zoom LiveTrak L-20 (js/compact-defs.js `l20`) the way its top panel
// is laid out (L-20 Operation Manual, "Names and functions of parts"):
//   - FADER MODE: MASTER, or A–F. The channel faders, the EFX RTN fader and
//     the right-hand fader belong to the mix picked there; every mix has its
//     own fader positions, so MONITOR A is a different mix from the MASTER.
//   - 18 channel strips: GAIN with PAD (3–16) or Hi-Z (1–2), COMP, SEL,
//     fader with its level meter, MUTE and SOLO. 48V is in groups of four.
//   - one CHANNEL STRIP section for the selected channel: LOW CUT, the 3-band
//     EQ with MID FREQ and EQ OFF, Φ, PAN and the two SEND EFX knobs.
//   - the output section: MONITOR OUT A–F (a switch for MASTER or the jack's
//     own mix, PHONES/SPEAKER, a volume knob) and the PHONES volume.
// The mode and the selection are the view's own (view.l20), not mixer state.
// Every control writes through MixerStore; nothing here knows about audio nodes.

import { LAWS, eqIsOn, hpfHz, levelLaw, peqBands } from "../compact.js";
import { formatDb, formatPan } from "../levels.js";
import { eqGraph } from "./viz.js";
import { button, el, fader, knob, meterBar, row } from "./mixer-digital-view.js";

const MODES = ["MASTER", "A", "B", "C", "D", "E", "F"];
const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });
const hz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`);
const logPos = (f, lo, hi) => Math.log(f / lo) / Math.log(hi / lo);
const logFreq = (p, lo, hi) => lo * Math.pow(hi / lo, p);
const mixerDev = (s) => s.rig.devices.find((d) => d.id === "mixer");

export function renderL20(view, def) {
  if (!view.l20 || view.l20.id !== def.id) view.l20 = { id: def.id, mode: "MASTER", sel: 0 };
  const ui = view.l20;
  const rerender = () => view.render();
  view.def = def;
  view.dgMeters = [];
  view.dgHeads = [];
  view.dgGr = null;
  view.paths = [];
  view.pathKey = "";
  const surface = el("div", "mixer-surface dg-surface l20-surface");

  // ---------- FADER MODE ----------
  const bar = el("div", "dg-bar l20-mode");
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "FADER MODE: which mix the faders control");
  bar.appendChild(el("span", "dg-note", "FADER MODE"));
  for (const m of MODES) {
    const b = el("button", `dg-tab${m === "MASTER" ? "" : " is-aux"}`, m);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(ui.mode === m));
    b.addEventListener("click", () => {
      if (ui.mode === m) return;
      ui.mode = m;
      rerender();
    });
    bar.appendChild(b);
  }
  const hint = el(
    "p",
    "dg-hint",
    ui.mode === "MASTER"
      ? "Faders: each channel's level in the MASTER mix (the MASTER OUT jacks). MUTE and the EFX sends belong to this mix."
      : `Faders: each channel's level in MONITOR ${ui.mode}. It is its own mix: the MASTER faders don't change it, MUTE still silences the channel in it. Send it to a jack with that jack's switch (set to ${ui.mode}) below.`,
  );

  // ---------- phantom power: four channels at a time ----------
  const phantom = row("l20-phantom", el("span", "dg-note", def.phantom.label));
  for (const g of def.phantom.groups) {
    const on = (s) => g.every((i) => s.channels[i].phantom);
    phantom.appendChild(
      button(view, {
        label: `${g[0] + 1}–${g[g.length - 1] + 1}`,
        tone: "phantom",
        get: on,
        onPress: () => {
          const want = !on(view.store.state);
          g.forEach((i) => view.store.setChannel(i, "phantom", want));
        },
        aria: (s) => `48V for inputs ${g[0] + 1} to ${g[g.length - 1] + 1}: ${on(s) ? "on" : "off"}`,
      }),
    );
  }

  // ---------- the faders ----------
  const bank = el("div", "mixer-strips dg-bank l20-bank");
  bank.setAttribute("role", "group");
  bank.setAttribute("aria-label", `Channels: ${ui.mode === "MASTER" ? "MASTER" : `MONITOR ${ui.mode}`}`);
  def.channels.forEach((_, i) => bank.appendChild(buildStrip(view, def, i, ui, rerender)));
  for (const b of ["fx1", "fx2"]) bank.appendChild(buildEfxStrip(view, def, b, ui));
  bank.appendChild(buildMasterStrip(view, def, ui));

  const left = row("dg-left", bar, hint, phantom, bank);
  surface.append(left, buildSidePanel(view, def, ui, rerender));
  view.root.appendChild(surface);
}

// ---------- one channel ----------

function buildStrip(view, def, i, ui, rerender) {
  const store = view.store;
  const c = def.channels[i];
  const n = c.label;
  const ch = (s) => s.channels[i];
  const stereo = c.kind === "stereo";
  const strip = el("section", `strip dg-strip${stereo ? " is-stereo" : ""}${ui.sel === i ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", `Channel ${n}`);

  const head = el("button", "strip-head");
  head.type = "button";
  head.addEventListener("click", () => view.onPatchChannel(i));
  view.bindings.push({ kind: "head", el: head, index: i });
  view.dgHeads[i] = head;

  // GAIN, with PAD (inputs 3–16) or Hi-Z (inputs 1–2): the range shifts down. The stereo inputs have no gain.
  const g = c.gain;
  const shown = (v) => {
    const s = store.state.channels[i];
    const eff = v - (g.pad && s.pad ? g.pad : 0) + (g.hiZDb && s.hiZ ? g.hiZDb : 0);
    return `${eff > 0 ? "+" : ""}${Math.round(eff)} dB`;
  };
  const gainKnob =
    g.min !== undefined
      ? knob(view, { label: "GAIN", sheetLabel: `Ch ${n} gain`, min: g.min, max: g.max, step: 0.5, defaultValue: g.min, tone: "gain", format: shown, onInput: (v) => store.setChannel(i, "gainDb", v) }, (s) => ch(s).gainDb)
      : el("span", "dg-note", "LINE");
  const switchBtn = g.pad
    ? button(view, { label: "PAD", tone: "pfl", get: (s) => !!ch(s).pad, onPress: () => store.setChannel(i, "pad", !ch(store.state).pad), aria: (s) => `Channel ${n} PAD: ${ch(s).pad ? "on, 26 dB less gain" : "off"}` })
    : c.hiZ
      ? button(view, { label: "Hi-Z", tone: "pfl", get: (s) => !!ch(s).hiZ, onPress: () => store.setChannel(i, "hiZ", !ch(store.state).hiZ), aria: (s) => `Channel ${n} Hi-Z: ${ch(s).hiZ ? "on" : "off"}` })
      : null;
  const comp = c.comp
    ? knob(view, { label: "COMP", sheetLabel: `Ch ${n} compressor`, defaultValue: 0, tone: "gain", format: (v) => (v <= 0.02 ? "off" : `${Math.round(v * 100)}%`), onInput: (v) => store.setChannel(i, "comp", v) }, (s) => ch(s).comp)
    : el("span", "dg-note", "");

  const sel = el("button", `dg-sel${ui.sel === i ? " on" : ""}`, "SEL");
  sel.type = "button";
  sel.setAttribute("aria-pressed", String(ui.sel === i));
  sel.setAttribute("aria-label", `Select channel ${n}: the CHANNEL STRIP section edits it`);
  sel.addEventListener("click", () => {
    if (ui.sel === i) return;
    ui.sel = i;
    rerender();
  });

  // The fader: this channel's level in the mix FADER MODE shows.
  const mon = ui.mode === "MASTER" ? null : `mon${ui.mode}`;
  const law = mon ? LAWS[def.sends[mon].law] : levelLaw(def);
  const control = fader(view, {
    label: "",
    sheetLabel: mon ? `Ch ${n} fader, MONITOR ${ui.mode}` : `Ch ${n} fader`,
    defaultValue: mon ? 0 : 0.75,
    tone: mon ? "aux1" : undefined,
    format: lawFormat(law),
    get: mon ? (s) => ch(s).sends[mon] : (s) => ch(s).level,
    onInput: (v) => (mon ? store.setChannel(i, `sends.${mon}`, v) : store.setChannel(i, "level", v)),
  });
  const mute = button(view, { label: "MUTE", tone: "mute", small: false, get: (s) => !ch(s).enabled, onPress: () => store.setChannel(i, "enabled", !ch(store.state).enabled), aria: (s) => `Channel ${n} MUTE: ${ch(s).enabled ? "off" : "on, out of the MASTER and every monitor mix"}` });
  const solo = button(view, { label: "SOLO", tone: "pfl", get: (s) => !!ch(s).solo, onPress: () => store.setChannel(i, "solo", !ch(store.state).solo), aria: (s) => `Channel ${n} SOLO: ${ch(s).solo ? "on, in the PHONES" : "off"}` });
  view.bindings.push({ kind: "fn", run: (s) => strip.classList.toggle("is-muted", !ch(s).enabled) });

  strip.append(head, row("dg-extra", gainKnob, switchBtn), row("dg-extra", comp), sel, row("dg-fader", control, meterBar(view, i)), row("dg-btns", mute, solo));
  return strip;
}

// EFX RTN: the effect's return into the mix FADER MODE shows (its own position per mix).
function buildEfxStrip(view, def, b, ui) {
  const store = view.store;
  const bus = def.buses[b];
  const strip = el("section", "strip dg-strip dg-master l20-efx");
  strip.setAttribute("aria-label", `${bus.label} return`);
  strip.appendChild(el("div", "dg-master-name", `${bus.label} RTN`));
  strip.appendChild(el("p", "dg-note", bus.fx.name));
  const key = ui.mode === "MASTER" ? "level" : `ret_mon${ui.mode}`;
  strip.append(
    el("div", "dg-extra"),
    row("dg-fader", fader(view, { label: "", sheetLabel: `${bus.label} RTN fader, ${ui.mode === "MASTER" ? "MASTER" : `MONITOR ${ui.mode}`}`, defaultValue: key === "level" ? LAWS.level.toPos(0) : 0, tone: "eq", format: lawFormat(LAWS[bus.master.law]), get: (s) => s[b][key], onInput: (v) => store.setBus(b, key, v) })),
  );
  return strip;
}

// The right-hand fader: the MASTER, with its MUTE. (A monitor mix has no master fader: its jack's knob is below.)
function buildMasterStrip(view, def, ui) {
  const store = view.store;
  const strip = el("section", "strip dg-strip dg-master");
  strip.setAttribute("aria-label", "MASTER");
  strip.appendChild(el("div", "dg-master-name", "MASTER"));
  const meters = row("dg-master-meters", meterBar(view, "L"), meterBar(view, "R"));
  strip.append(
    el("div", "dg-extra"),
    row("dg-fader", fader(view, { label: "", sheetLabel: "MASTER fader", format: lawFormat(LAWS[def.main.law]), get: (s) => s.main.level, onInput: (v) => store.setBus("main", "level", v) }), meters),
    row("dg-btns", button(view, { label: "MUTE", tone: "mute", small: false, get: (s) => !!s.main.mute, onPress: () => store.setBus("main", "mute", !store.state.main.mute), aria: (s) => `MASTER MUTE: ${s.main.mute ? "on, the MASTER OUT jacks are silent" : "off"}` })),
  );
  if (ui.mode !== "MASTER") strip.appendChild(el("p", "dg-note", "Monitor mixes have no master fader."));
  return strip;
}

// ---------- the CHANNEL STRIP section and the outputs ----------

function buildSidePanel(view, def, ui, rerender) {
  const store = view.store;
  const i = ui.sel;
  const c = def.channels[i];
  const n = c.label;
  const ch = (s) => s.channels[i];
  const set = (key) => (v) => store.setChannel(i, key, v);
  const panel = el("section", "dg-panel l20-panel");
  panel.setAttribute("aria-label", `Selected channel ${n}`);

  const title = el("h4", "dg-panel-title");
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
    s.appendChild(row("dg-sec-body", ...els.filter(Boolean)));
    return s;
  };

  // CHANNEL STRIP: SEND EFX, EQ, PAN, LOW CUT, Φ, EQ OFF.
  const gainDb = (v) => (Math.abs(v) < 0.25 ? "0 dB" : `${v > 0 ? "+" : "−"}${Math.abs(v)} dB`);
  const midBand = peqBands(def).find((b) => b.id === "mid");
  const eqKnob = (id, label, what) => knob(view, { label, sheetLabel: `Ch ${n} EQ ${what}`, min: -15, max: 15, step: 0.5, defaultValue: 0, bipolar: true, tone: "eq", format: gainDb, onInput: set(`peq.${id}.gain`) }, (s) => ch(s).peq[id].gain);
  panel.appendChild(
    section(
      "SEND EFX",
      ...["fx1", "fx2"].map((sid) => knob(view, { label: def.sends[sid].label.replace("SEND ", ""), sheetLabel: `Ch ${n} ${def.sends[sid].label}`, defaultValue: 0, tone: "eq", format: lawFormat(LAWS[def.sends[sid].law]), onInput: set(`sends.${sid}`) }, (s) => ch(s).sends[sid])),
    ),
  );
  panel.appendChild(
    section(
      "EQ",
      knob(view, { label: "HIGH", sheetLabel: `Ch ${n} EQ HIGH (10 kHz shelf)`, min: -15, max: 15, step: 0.5, defaultValue: 0, bipolar: true, tone: "eq", format: gainDb, onInput: set("peq.high.gain") }, (s) => ch(s).peq.high.gain),
      eqKnob("mid", "MID", "MID"),
      knob(view, { label: "MID FREQ", sheetLabel: `Ch ${n} EQ MID FREQ`, defaultValue: logPos(midBand.freq, midBand.min, midBand.max), tone: "eq", format: (v) => `${hz(logFreq(v, midBand.min, midBand.max))} Hz`, onInput: (v) => store.setChannel(i, "peq.mid.freq", logFreq(v, midBand.min, midBand.max)) }, (s) => logPos(ch(s).peq.mid.freq, midBand.min, midBand.max)),
      eqKnob("low", "LOW", "LOW (100 Hz shelf)"),
      button(view, { label: "EQ OFF", tone: "assign", get: (s) => !eqIsOn(ch(s)), onPress: () => store.setChannel(i, "eqOn", !eqIsOn(ch(store.state))), aria: (s) => `Channel ${n} EQ OFF: ${eqIsOn(ch(s)) ? "off, the EQ and LOW CUT are working" : "lit, HIGH, MID, LOW and LOW CUT are bypassed"}` }),
    ),
  );
  panel.lastChild.insertBefore(eqGraph(view, def, i, { theme: "ui16" }), panel.lastChild.lastChild);
  panel.appendChild(
    section(
      "PAN · LOW CUT · Φ",
      knob(view, { label: c.kind === "stereo" ? "BAL" : "PAN", sheetLabel: `Ch ${n} ${c.kind === "stereo" ? "balance" : "pan"}`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: set("pan") }, (s) => ch(s).pan),
      knob(view, { label: "LOW CUT", sheetLabel: `Ch ${n} low cut`, defaultValue: 0, tone: "eq", format: (v) => (v <= 0.02 ? "off" : `${hz(hpfHz(c, v))} Hz`), onInput: set("hpf") }, (s) => ch(s).hpf),
      button(view, { label: "Φ", get: (s) => !!ch(s).polarity, onPress: () => store.setChannel(i, "polarity", !ch(store.state).polarity), aria: (s) => `Channel ${n} polarity: ${ch(s).polarity ? "reversed" : "normal"}` }),
    ),
  );

  // OUTPUT: MONITOR OUT A–F and PHONES.
  const outs = def.routing.outputs.map((o) => {
    const x = o.slice(3);
    const own = `mon${x}`;
    const sw = def.outSwitches.find((w) => w.ports.includes(o));
    return row(
      "l20-out",
      el("span", "f8-outname", `MONITOR OUT ${x}`),
      knob(view, { label: "VOL", sheetLabel: `MONITOR OUT ${x} volume`, defaultValue: def.routing.volume.start, tone: "level", format: lawFormat(LAWS[def.routing.volume.law]), onInput: (v) => store.setBus(o, "level", v) }, (s) => s[o].level),
      ...[[own, x], ["main", "MASTER"]].map(([src, label]) => button(view, { label, tone: "assign", get: (s) => s.routing[o] === src, onPress: () => store.setBus("routing", o, src), aria: (s) => `MONITOR OUT ${x} carries ${src === "main" ? "the MASTER mix" : `its own mix, ${x}`}${s.routing[o] === src ? " (selected)" : ""}` })),
      ...sw.labels.map((l, k) => button(view, { label: l, tone: "pfl", get: (s) => (mixerDev(s)?.[sw.key] ?? 0) === k, onPress: () => store.setDevice("mixer", sw.key, k), aria: (s) => `MONITOR OUT ${x} ${l}${(mixerDev(s)?.[sw.key] ?? 0) === k ? " (selected)" : ""}` })),
    );
  });
  const phones = knob(view, { label: "PHONES", sheetLabel: "PHONES volume", defaultValue: 0.5, tone: "level", format: lawFormat(LAWS.master), onInput: (v) => store.setBus("cr", "level", v) }, (s) => s.cr.level);
  panel.appendChild(section("OUTPUT", ...outs, phones));
  panel.appendChild(el("p", "dg-note", "MONITOR OUT: the A–F switch picks the jack's own mix; MASTER copies the MASTER mix. PHONES/SPEAKER only labels the jack here: the lab has no headphones to plug in."));
  return panel;
}
