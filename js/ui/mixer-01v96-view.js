// Draws the Yamaha 01V96i (js/compact-defs.js `yam01v96`) the way the console
// is laid out (01V96i Reference Manual, "Control Surface & Rear Panel"):
//   - the analog INPUT row: GAIN for inputs 1–16, PAD on 1–12;
//   - the SELECTED CHANNEL section: PAN, one EQ band at a time (HIGH,
//     HIGH-MID, LOW-MID, LOW) with Q, FREQUENCY and GAIN;
//   - the display, paged with the DISPLAY ACCESS buttons (STATUS, PAN/ROUTING,
//     EQ, DYNAMICS, AUX, AUX SETUP, PATCH): the "central screen";
//   - 16 channel faders with SEL, SOLO and ON (lit = on), showing the LAYER
//     (1–16, MASTER) in the FADER MODE (HOME, or AUX 1–8: the aux sends);
//   - ST IN 1–2 (the effects returns), the STEREO fader and its ON;
//   - the rear panel's PHANTOM +48V switches (CH1–4, 5–8, 9–12) and 2TR IN.
// Page, layer, mode, band and selection are the view's own (view.y96).

import { DYN, LAWS, PEQ_BANDS, PEQ_Q, levelLaw } from "../compact.js";
import { formatDb, formatPan } from "../levels.js";
import { button, el, fader, knob, meterBar, procOn, row } from "./mixer-digital-view.js";
import { compGraph, eqGraph } from "./viz.js";

const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });
const hz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`);
const logPos = (f, lo, hi) => Math.log(f / lo) / Math.log(hi / lo);
const logFreq = (p, lo, hi) => lo * Math.pow(hi / lo, p);
const BAND_KEYS = [
  ["HIGH", "high"],
  ["HIGH-MID", "hiMid"],
  ["LOW-MID", "lowMid"],
  ["LOW", "low"],
];
const PAGES = [
  ["home", "STATUS"],
  ["routing", "PAN/ROUTING"],
  ["eq", "EQ"],
  ["dyn", "DYNAMICS"],
  ["aux", "AUX"],
  ["setup", "AUX SETUP"],
  ["patch", "PATCH"],
];
const AUXES = ["aux1", "aux2", "aux3", "aux4", "aux5", "aux6", "aux7", "aux8"];

export function render01v96(view, def) {
  if (!view.y96 || view.y96.id !== def.id) view.y96 = { id: def.id, layer: "1-16", mode: "home", sel: 6, band: "hiMid", page: "home" };
  const ui = view.y96;
  const rerender = () => view.render();
  view.def = def;
  view.dgMeters = [];
  view.dgHeads = [];
  view.dgGr = null;
  view.paths = [];
  view.pathKey = "";
  const surface = el("div", "mixer-surface y96-surface");

  const top = row("y96-top", inputRow(view, def), rearPanel(view, def));
  const mid = row("y96-mid", selectedChannel(view, def, ui, rerender), display(view, def, ui, rerender), controlKeys(ui, rerender));
  const bottom = row("y96-bottom", faderBank(view, def, ui, rerender), stInSection(view, def), stereoSection(view, def));
  surface.append(top, mid, bottom);
  view.root.appendChild(surface);
}

// ---------- analog INPUT row ----------

function inputRow(view, def) {
  const store = view.store;
  const box = el("section", "y96-box y96-inputs");
  box.setAttribute("aria-label", "Analog inputs: GAIN and PAD");
  box.appendChild(el("h4", "x32-title", "INPUT"));
  const strips = el("div", "y96-gains");
  def.channels.forEach((c, i) => {
    const s = el("div", "y96-gain");
    s.appendChild(
      knob(
        view,
        { label: c.label, sheetLabel: `Input ${c.label} GAIN`, min: c.gain.min, max: c.gain.max, step: 0.5, defaultValue: c.gain.min, tone: "gain", format: (v) => `${Math.round(v)} dB${store.state.channels[i].pad ? " −20" : ""}`, onInput: (v) => store.setChannel(i, "gainDb", v) },
        (st) => st.channels[i].gainDb,
      ),
    );
    if (c.gain.pad) s.appendChild(button(view, { label: "PAD", tone: "lowcut", get: (st) => !!st.channels[i].pad, onPress: () => store.setChannel(i, "pad", !store.state.channels[i].pad), aria: (st) => `Input ${c.label} 20 dB PAD: ${st.channels[i].pad ? "on" : "off"}` }));
    strips.appendChild(s);
  });
  box.appendChild(strips);
  return box;
}

function rearPanel(view, def) {
  const store = view.store;
  const box = el("section", "y96-box y96-rear");
  box.setAttribute("aria-label", "Rear panel");
  box.appendChild(el("h4", "x32-title", "REAR PANEL"));
  const groups = def.phantom.groups.map((g) => {
    const label = `CH${g[0] + 1}–${g.at(-1) + 1}`;
    return button(view, {
      label,
      tone: "phantom",
      get: (s) => g.every((i) => s.channels[i].phantom),
      onPress: () => {
        const on = !g.every((i) => store.state.channels[i].phantom);
        for (const i of g) store.setChannel(i, "phantom", on);
      },
      aria: (s) => `PHANTOM +48V ${label}: ${g.every((i) => s.channels[i].phantom) ? "on" : "off"}`,
    });
  });
  const t = def.channels.length;
  const tape = button(view, { label: "AD 15/16", tone: "assign", get: (s) => !!s.channels[t].toMain, onPress: () => store.setChannel(t, "toMain", !store.state.channels[t].toMain), aria: (s) => `2TR IN to AD 15/16 (into the mix): ${s.channels[t].toMain ? "on" : "off"}` });
  const head = el("button", "strip-head c16-tape-head");
  head.type = "button";
  head.addEventListener("click", () => view.onPatchChannel(t));
  view.bindings.push({ kind: "head", el: head, index: t });
  box.append(el("p", "dg-note", "PHANTOM +48V"), row("y96-row", ...groups), el("p", "dg-note", "2TR IN"), row("y96-row", head, tape));
  return box;
}

// ---------- SELECTED CHANNEL ----------

function selectedChannel(view, def, ui, rerender) {
  const store = view.store;
  const i = ui.sel;
  const c = def.channels[i];
  const box = el("section", "y96-box y96-selch");
  box.setAttribute("aria-label", `Selected channel ${c.label}`);
  box.appendChild(el("h4", "x32-title", `SELECTED CHANNEL · CH ${c.label}`));
  const bands = row(
    "y96-row",
    ...BAND_KEYS.map(([label, id]) => {
      const b = el("button", `x32-layer${ui.band === id ? " on" : ""}`, label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(ui.band === id));
      b.addEventListener("click", () => {
        ui.band = id;
        rerender();
      });
      return b;
    }),
  );
  const band = PEQ_BANDS.find((b) => b.id === ui.band);
  const peq = (s) => s.channels[i].peq[ui.band];
  const knobs = row(
    "y96-row",
    knob(view, { label: "PAN", sheetLabel: `Ch ${c.label} pan`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", size: undefined, format: formatPan, onInput: (v) => store.setChannel(i, "pan", v) }, (s) => s.channels[i].pan),
    band.type === "peaking"
      ? knob(view, { label: "Q", sheetLabel: `Ch ${c.label} ${band.label} Q`, min: PEQ_Q.min, max: PEQ_Q.max, step: 0.05, defaultValue: 0.7, tone: "eq", size: undefined, format: (v) => v.toFixed(1), onInput: (v) => store.setChannel(i, `peq.${ui.band}.q`, v) }, (s) => peq(s).q)
      : el("span", "dg-q-blank", "shelf"),
    knob(view, { label: "FREQUENCY", sheetLabel: `Ch ${c.label} ${band.label} frequency`, defaultValue: logPos(band.freq, band.min, band.max), tone: "eq", size: undefined, format: (v) => `${hz(logFreq(v, band.min, band.max))} Hz`, onInput: (v) => store.setChannel(i, `peq.${ui.band}.freq`, logFreq(v, band.min, band.max)) }, (s) => logPos(peq(s).freq, band.min, band.max)),
    knob(view, { label: "GAIN", sheetLabel: `Ch ${c.label} ${band.label} gain`, min: -15, max: 15, step: 0.5, defaultValue: 0, bipolar: true, tone: "eq", size: undefined, format: (v) => `${v > 0 ? "+" : ""}${v} dB`, onInput: (v) => store.setChannel(i, `peq.${ui.band}.gain`, v) }, (s) => peq(s).gain),
  );
  box.append(bands, knobs);
  return box;
}

// ---------- the display ----------

function display(view, def, ui, rerender) {
  const store = view.store;
  const i = ui.sel;
  const c = def.channels[i];
  const ch = (s) => s.channels[i];
  const box = el("section", "y96-lcd");
  box.setAttribute("aria-label", "Display");
  const title = el("p", "y96-lcd-title");
  view.bindings.push({
    kind: "fn",
    run: () => (title.textContent = `${PAGES.find((p) => p[0] === ui.page)[1]} · CH${c.label} ${view.dgHeads[i]?.querySelector(".strip-name")?.textContent || ""}`),
  });
  box.appendChild(title);
  const body = el("div", "y96-lcd-body");
  if (ui.page === "home") {
    const t = el("div", "x32-lines");
    view.bindings.push({
      kind: "fn",
      run: (s) =>
        (t.innerHTML = `<p>LAYER ${ui.layer} · FADER MODE ${ui.mode === "home" ? "HOME (channel levels)" : `${ui.mode.toUpperCase().replace("AUX", "AUX ")} (sends)`}</p>
          <p>STEREO ${s.main.mute ? "OFF" : "ON"} · PRE POINT ${s.auxSetup.prePoint === "preOn" ? "PRE ON" : "POST ON"}</p>
          <p>${s.channels.filter((x) => !x.tape && x.enabled === false).map((x) => `CH${x.label}`).join(" ") || "All channels ON"}${s.channels.some((x) => !x.tape && x.enabled === false) ? " OFF" : ""}</p>`),
    });
    body.appendChild(t);
  } else if (page(ui, "routing")) {
    body.append(
      row(
        "y96-row",
        button(view, { label: "TO ST", tone: "assign", get: (s) => ch(s).lr !== false, onPress: () => store.setChannel(i, "lr", ch(store.state).lr === false), aria: (s) => `Ch ${c.label} routed to the stereo bus: ${ch(s).lr !== false ? "on" : "off"}` }),
        button(view, { label: "Ø", get: (s) => !!ch(s).polarity, onPress: () => store.setChannel(i, "polarity", !ch(store.state).polarity), aria: (s) => `Ch ${c.label} phase: ${ch(s).polarity ? "reversed" : "normal"}` }),
        knob(view, { label: "PAN", sheetLabel: `Ch ${c.label} pan`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: (v) => store.setChannel(i, "pan", v) }, (s) => ch(s).pan),
      ),
    );
  } else if (page(ui, "eq")) {
    const t = el("div", "x32-lines");
    view.bindings.push({ kind: "fn", run: (s) => (t.innerHTML = PEQ_BANDS.slice().reverse().map((b) => { const v = ch(s).peq[b.id]; return `<p>${b.label}: ${v.gain > 0 ? "+" : ""}${v.gain} dB @ ${hz(v.freq)} Hz${b.type === "peaking" ? ` Q ${v.q.toFixed(1)}` : ""}</p>`; }).join("")) });
    body.append(row("y96-row", procOn(view, def, i, "eqOn", "EQ ON", "EQ"), el("p", "dg-note", "Edit with the SELECTED CHANNEL knobs: pick a band, then Q, FREQUENCY, GAIN.")), eqGraph(view, def, i, { theme: "lcd", band: () => ui.band }), t);
  } else if (page(ui, "dyn")) {
    const gr = el("span", "c16-led led-comp");
    gr.innerHTML = '<i aria-hidden="true"></i><small>GR</small>';
    view.dgGr = { index: i, el: gr.querySelector("i") };
    body.appendChild(
      row(
        "y96-row",
        procOn(view, def, i, "compOn", "DYNAMICS ON", "compressor"),
        compGraph(view, def, i, { theme: "lcd" }),
        knob(view, { label: "THRESHOLD", sheetLabel: `Ch ${c.label} compressor threshold`, min: DYN.threshold[0], max: DYN.threshold[1], step: 0.5, defaultValue: 0, tone: "gain", format: (v) => (v >= 0 ? "off" : `${v} dB`), onInput: (v) => store.setChannel(i, "dyn.threshold", v) }, (s) => ch(s).dyn.threshold),
        knob(view, { label: "RATIO", sheetLabel: `Ch ${c.label} compressor ratio`, min: DYN.ratio[0], max: DYN.ratio[1], step: 0.1, defaultValue: 1, tone: "gain", format: (v) => `${v.toFixed(1)}:1`, onInput: (v) => store.setChannel(i, "dyn.ratio", v) }, (s) => ch(s).dyn.ratio),
        knob(view, { label: "OUT GAIN", sheetLabel: `Ch ${c.label} compressor out gain`, min: DYN.makeup[0], max: DYN.makeup[1], step: 0.5, defaultValue: 0, tone: "gain", format: (v) => `+${v} dB`, onInput: (v) => store.setChannel(i, "dyn.makeup", v) }, (s) => ch(s).dyn.makeup),
        gr,
      ),
    );
  } else if (page(ui, "aux")) {
    body.appendChild(
      row(
        "y96-row y96-aux",
        ...AUXES.map((sid) =>
          row(
            "dg-send",
            knob(view, { label: def.sends[sid].label, sheetLabel: `Ch ${c.label} ${def.sends[sid].label} send`, defaultValue: 0, tone: def.buses[sid].fx ? "eq" : "aux1", format: lawFormat(LAWS[def.sends[sid].law]), onInput: (v) => store.setChannel(i, `sends.${sid}`, v) }, (s) => ch(s).sends[sid]),
            button(view, { label: "PRE", tone: "pfl", get: (s) => ch(s).pres[sid], onPress: () => store.setChannel(i, `pres.${sid}`, !ch(store.state).pres[sid]), aria: (s) => `Ch ${c.label} ${def.sends[sid].label}: ${ch(s).pres[sid] ? "PRE (pre-fader)" : "POST (post-fader)"}` }),
          ),
        ),
      ),
    );
  } else if (page(ui, "setup")) {
    body.append(
      el("p", "", "PRE POINT: where pre-fader aux sends are taken."),
      row(
        "y96-row",
        button(view, { label: "PRE ON", tone: "pfl", get: (s) => s.auxSetup.prePoint === "preOn", onPress: () => store.setBus("auxSetup", "prePoint", "preOn"), aria: (s) => `PRE POINT PRE ON (before the ON key): ${s.auxSetup.prePoint === "preOn" ? "selected" : "not selected"}` }),
        button(view, { label: "POST ON", tone: "pfl", get: (s) => s.auxSetup.prePoint === "postOn", onPress: () => store.setBus("auxSetup", "prePoint", "postOn"), aria: (s) => `PRE POINT POST ON (after the ON key): ${s.auxSetup.prePoint === "postOn" ? "selected" : "not selected"}` }),
      ),
      el("p", "dg-note", "PRE ON: a channel switched OFF still feeds its pre-fader aux sends. POST ON: OFF cuts them too."),
    );
  } else if (page(ui, "patch")) {
    body.appendChild(el("div", "x32-lines")).innerHTML = "<p>OMNI OUT 1–4 ← AUX 1–4</p><p>STEREO OUT L/R ← STEREO</p><p>AUX 7 → FX 1 (reverb) → ST IN 1</p><p>AUX 8 → FX 2 (delay) → ST IN 2</p><p>2TR IN → AD 15/16 (selector)</p>";
  }
  box.appendChild(body);
  return box;
}

const page = (ui, p) => ui.page === p;

// DISPLAY ACCESS, LAYER and FADER MODE keys.
function controlKeys(ui, rerender) {
  const box = el("section", "y96-box y96-keys");
  const key = (label, on, onPress, aria) => {
    const b = el("button", `x32-layer${on ? " on" : ""}`, label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(on));
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("click", () => {
      onPress();
      rerender();
    });
    return b;
  };
  box.append(
    el("h4", "x32-title", "DISPLAY ACCESS"),
    row("y96-row", ...PAGES.map(([id, label]) => key(label, ui.page === id, () => (ui.page = id), `Display page ${label}`))),
    el("h4", "x32-title", "LAYER"),
    row("y96-row", key("1–16", ui.layer === "1-16", () => (ui.layer = "1-16")), key("MASTER", ui.layer === "master", () => (ui.layer = "master"))),
    el("h4", "x32-title", "FADER MODE"),
    row("y96-row", key("HOME", ui.mode === "home", () => (ui.mode = "home")), ...AUXES.map((a, k) => key(`AUX ${k + 1}`, ui.mode === a, () => (ui.mode = a), `FADER MODE AUX ${k + 1}: the faders become AUX ${k + 1} sends`))),
  );
  return box;
}

// ---------- faders ----------

function faderBank(view, def, ui, rerender) {
  const box = el("section", "y96-box y96-faders");
  const bank = el("div", "mixer-strips x32-bank");
  if (ui.layer === "master") {
    for (const b of ["aux1", "aux2", "aux3", "aux4", "aux5", "aux6"]) bank.appendChild(auxMasterStrip(view, def, b));
  } else def.channels.forEach((_, i) => bank.appendChild(channelStrip(view, def, i, ui, rerender)));
  box.append(el("h4", "x32-title", ui.layer === "master" ? "MASTER LAYER · AUX 1–6" : `CHANNELS 1–16 · ${ui.mode === "home" ? "HOME" : ui.mode.toUpperCase().replace("AUX", "AUX ")}`), bank);
  return box;
}

function channelStrip(view, def, i, ui, rerender) {
  const store = view.store;
  const c = def.channels[i];
  const ch = (s) => s.channels[i];
  const strip = el("section", `strip dg-strip x32-strip${ui.sel === i ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", `Channel ${c.label}`);
  const head = el("button", "strip-head");
  head.type = "button";
  head.addEventListener("click", () => view.onPatchChannel(i));
  view.bindings.push({ kind: "head", el: head, index: i });
  view.dgHeads[i] = head;
  const sel = el("button", `dg-sel${ui.sel === i ? " on" : ""}`, "SEL");
  sel.type = "button";
  sel.setAttribute("aria-pressed", String(ui.sel === i));
  sel.setAttribute("aria-label", `Select channel ${c.label}`);
  sel.addEventListener("click", () => {
    ui.sel = i;
    rerender();
  });
  const sid = ui.mode !== "home" ? ui.mode : null;
  const control = sid
    ? fader(view, { label: "", sheetLabel: `Ch ${c.label} ${def.sends[sid].label} send`, defaultValue: 0, tone: def.buses[sid].fx ? "eq" : "aux1", format: lawFormat(LAWS[def.sends[sid].law]), get: (s) => ch(s).sends[sid], onInput: (v) => store.setChannel(i, `sends.${sid}`, v) })
    : fader(view, { label: "", sheetLabel: `Ch ${c.label} fader`, format: lawFormat(levelLaw(def)), get: (s) => ch(s).level, onInput: (v) => store.setChannel(i, "level", v) });
  const solo = button(view, { label: "SOLO", tone: "pfl", get: (s) => ch(s).solo, onPress: () => store.setChannel(i, "solo", !ch(store.state).solo), aria: (s) => `Channel ${c.label} SOLO: ${ch(s).solo ? "on" : "off"}` });
  // ON is lit while the channel is on: the opposite of a MUTE key.
  const onKey = button(view, { label: "ON", tone: "on", small: false, get: (s) => ch(s).enabled, onPress: () => store.setChannel(i, "enabled", !ch(store.state).enabled), aria: (s) => `Channel ${c.label} ON: ${ch(s).enabled ? "lit, the channel is on" : "dark, the channel is off"}` });
  view.bindings.push({ kind: "fn", run: (s) => strip.classList.toggle("is-muted", !ch(s).enabled) });
  strip.append(head, sel, row("dg-btns", solo), row("dg-fader", control, meterBar(view, i)), row("dg-btns", onKey));
  return strip;
}

function auxMasterStrip(view, def, b) {
  const store = view.store;
  const bus = def.buses[b];
  const strip = el("section", "strip dg-strip x32-strip");
  strip.setAttribute("aria-label", `${bus.label} master`);
  const onKey = button(view, { label: "ON", tone: "on", small: false, get: (s) => !s[b].mute, onPress: () => store.setBus(b, "mute", !store.state[b].mute), aria: (s) => `${bus.label} ON: ${s[b].mute ? "dark, the aux is off" : "lit"}` });
  strip.append(el("div", "dg-master-name", bus.label), el("p", "dg-note", bus.noOut ? "not patched" : `OMNI ${b.slice(3)}`), row("dg-fader", fader(view, { label: "", sheetLabel: `${bus.label} master`, format: lawFormat(LAWS[bus.master.law]), get: (s) => s[b].level, onInput: (v) => store.setBus(b, "level", v) })), row("dg-btns", onKey));
  return strip;
}

function stInSection(view, def) {
  const store = view.store;
  const box = el("section", "y96-box y96-stin");
  box.appendChild(el("h4", "x32-title", "ST IN"));
  for (const b of ["aux7", "aux8"]) {
    const bus = def.buses[b];
    box.appendChild(row("y96-col", knob(view, { label: bus.master.label, sheetLabel: `${bus.master.label} level (${bus.fx.name} return)`, defaultValue: 0.75, tone: "eq", format: lawFormat(LAWS[bus.master.law]), onInput: (v) => store.setBus(b, "level", v) }, (s) => s[b].level), el("p", "dg-note", bus.fx.name)));
  }
  return box;
}

function stereoSection(view, def) {
  const store = view.store;
  const box = el("section", "y96-box y96-stereo");
  box.setAttribute("aria-label", "STEREO");
  const onKey = button(view, { label: "ON", tone: "on", small: false, get: (s) => !s.main.mute, onPress: () => store.setBus("main", "mute", !store.state.main.mute), aria: (s) => `STEREO ON: ${s.main.mute ? "dark, the house is silent" : "lit"}` });
  const phones = knob(view, { label: "PHONES", sheetLabel: "Phones level", defaultValue: 0.5, tone: "level", format: lawFormat(LAWS.master), onInput: (v) => store.setBus("cr", "level", v) }, (s) => s.cr.level);
  box.append(
    el("h4", "x32-title", "STEREO"),
    row("dg-fader", fader(view, { label: "", sheetLabel: "STEREO fader", format: lawFormat(LAWS[def.main.law]), get: (s) => s.main.level, onInput: (v) => store.setBus("main", "level", v) }), row("dg-master-meters", meterBar(view, "L"), meterBar(view, "R"))),
    row("dg-btns", onKey, phones),
  );
  return box;
}
