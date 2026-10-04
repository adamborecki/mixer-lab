// Draws the Yamaha CL3 (js/compact-defs.js `cl3`) the way the console is laid
// out (CL5/CL3/CL1 Reference Manual):
//   - the SELECTED CHANNEL section left of the touch screen: GAIN, HPF, PAN,
//     the 4-band EQ's Q / FREQUENCY / GAIN and the compressor's THRESHOLD for
//     whichever channel's [SEL] was pressed last;
//   - the touch screen: OVERVIEW (the eight Centralogic channels, each with
//     its gain, EQ curve and dynamics), SELECTED CHANNEL VIEW (everything
//     about one channel, with the EQ and DYNAMICS ON buttons), OUTPUT PATCH
//     (what each Rio output carries) and SCENE;
//   - the INPUT section: 16 faders with SEL, CUE and ON (lit = on), banked
//     CH 1-16, CH 17-32, ST IN;
//   - Centralogic: 8 faders under the screen, loaded by the Bank Select keys
//     with channels, DCAs, MIX masters or matrices;
//   - the master section: STEREO, SENDS ON FADER, and USER DEFINED keys set
//     up as the 8 mute group masters.
// Strips and panels are shared with the X32 (js/ui/mixer-x32-view.js); the
// desk's words come from def.surface.terms. Page, banks and selection are the
// view's own (view.cl).

import { DYN, PEQ_BANDS, PEQ_Q, compIsOn, eqIsOn, hpfHz } from "../compact.js";
import { formatPan } from "../levels.js";
import { button, buildSelPanel, el, knob, row } from "./mixer-digital-view.js";
import { busPanel, channelStrip, emptyStrip, fxReturnStrip, groupSlots, groupStrip, layerBar, mainPanel, mainStrip, matrixPanel, routingPage, scenesPage, termsOf } from "./mixer-x32-view.js";
import { compGraph, eqGraph } from "./viz.js";

const hz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`);
const logPos = (f, lo, hi) => Math.log(f / lo) / Math.log(hi / lo);
const logFreq = (p, lo, hi) => lo * Math.pow(hi / lo, p);
const PAGES = [
  ["overview", "OVERVIEW"],
  ["sel", "SELECTED CHANNEL"],
  ["inpatch", "INPUT PATCH"],
  ["routing", "OUTPUT PATCH"],
  ["scenes", "SCENE"],
];

export function renderCL(view, def) {
  const sf = def.surface;
  if (!view.cl || view.cl.id !== def.id) view.cl = { id: def.id, layer: sf.inputLayers[0].id, glayer: sf.groupLayers[0].id, sel: { kind: "ch", i: 6 }, sof: false, assign: null, mgrpEdit: false, page: "overview" };
  const ui = view.cl;
  const rerender = () => view.render();
  const T = termsOf(def);
  view.def = def;
  view.dgMeters = [];
  view.dgHeads = [];
  view.dgGr = null;
  view.paths = [];
  view.pathKey = "";
  const surface = el("div", "mixer-surface x32-surface x32-full cl-surface");

  // Built before the screen so the channel names (from the patch) are there.
  const inLayer = sf.inputLayers.find((l) => l.id === ui.layer) || sf.inputLayers[0];
  const inBank = el("div", "mixer-strips x32-bank");
  inBank.setAttribute("role", "group");
  inBank.setAttribute("aria-label", `INPUT faders: ${inLayer.label}`);
  const slots = [...(inLayer.channels || []).map((i) => channelStrip(view, def, i, ui, rerender)), ...(inLayer.fx || []).map((b) => fxReturnStrip(view, def, b)), ...(inLayer.buses || []).map((b) => groupStrip(view, def, b, ui, rerender))];
  while (slots.length < sf.bank) slots.push(emptyStrip());
  inBank.append(...slots);
  const inputs = row("x32-section x32-inputs", el("h4", "x32-title", "INPUT"), layerBar(sf.inputLayers, ui.layer, (id) => ((ui.layer = id), rerender()), "INPUT section bank"), inBank);

  const gLayer = sf.groupLayers.find((l) => l.id === ui.glayer) || sf.groupLayers[0];
  const cBank = el("div", "mixer-strips x32-bank");
  cBank.setAttribute("role", "group");
  cBank.setAttribute("aria-label", `Centralogic: ${gLayer.label}`);
  cBank.append(...groupSlots(view, def, gLayer, ui, rerender));
  const centralogic = row("x32-section cl-centralogic", el("h4", "x32-title", "CENTRALOGIC"), layerBar(sf.groupLayers, gLayer.id, (id) => ((ui.glayer = id), rerender()), "Centralogic Bank Select"), cBank);

  // ---------- master section ----------
  const sof = el("button", `x32-sof${ui.sof ? " on" : ""}`, T.sof);
  sof.type = "button";
  sof.setAttribute("aria-pressed", String(ui.sof));
  sof.addEventListener("click", () => ((ui.sof = !ui.sof), rerender()));
  const udk = el("div", "cl-udk");
  udk.setAttribute("role", "group");
  udk.setAttribute("aria-label", "USER DEFINED keys: mute group masters");
  for (let k = 1; k <= def.muteGroups; k++) {
    const g = `g${k}`;
    udk.appendChild(button(view, { label: `MUTE ${k}`, tone: "mute", get: (s) => s.mgrp[g], onPress: () => view.store.setBus("mgrp", g, !view.store.state.mgrp[g]), aria: (s) => `USER DEFINED key: mute group ${k} ${s.mgrp[g] ? "on, muting its channels" : "off"}` }));
  }
  const master = row("x32-section cl-master", el("h4", "x32-title", "MASTER"), mainStrip(view, def, ui, rerender), sof, el("p", "dg-note", "USER DEFINED KEYS"), udk);

  // ---------- touch screen ----------
  const screen = el("section", "cl-screen");
  screen.setAttribute("aria-label", "Touch screen");
  const sel = ui.sel;
  const selName = sel.kind === "ch" ? `CH ${def.channels[sel.i].label}` : sel.kind === "main" ? T.main : sel.kind === "mtx" ? `MATRIX ${sel.b.slice(3)}` : def.buses[sel.b].label;
  const access = row("cl-access", el("span", "cl-selname", selName));
  access.appendChild(layerBar(PAGES.map(([id, label]) => ({ id, label })), ui.page, (id) => ((ui.page = id), rerender()), "Screen"));
  screen.appendChild(access);
  if (ui.page === "inpatch") screen.appendChild(inputPatchPage(view, def));
  else if (ui.page === "routing") screen.appendChild(routingPage(view, def, "OUTPUT PATCH: what each Rio stage-box output carries over Dante."));
  else if (ui.page === "scenes") screen.appendChild(scenesPage(view, def));
  else if (ui.page === "sel") screen.appendChild(selectedView(view, def, ui, rerender));
  else screen.appendChild(overview(view, def, ui, gLayer, rerender));

  surface.append(row("cl-top", selectedChannelSection(view, def, ui), screen), row("x32-desk cl-desk", inputs, centralogic, master));
  view.root.appendChild(surface);
}

// INPUT PATCH: each channel takes its Rio input (the stage) or its Dante RX
// (Dante Controller decides what arrives there, e.g. a DAW for a virtual soundcheck).
function inputPatchPage(view, def) {
  const store = view.store;
  const box = el("div", "cl-inpatch");
  box.appendChild(el("p", "dg-note", "INPUT PATCH: RIO = the stage box input with its preamp; DANTE = Dante RX n, whatever Dante Controller subscribes to it."));
  const all = (v) => {
    const b = el("button", "x32-layer", v ? "ALL 1–32 → DANTE" : "ALL 1–32 → RIO");
    b.type = "button";
    b.addEventListener("click", () => {
      for (let m = 0; m < def.dante.rx; m++) store.setDevice("mixer", `inPatch.${m}`, v);
    });
    return b;
  };
  box.appendChild(row("y96-row", all(0), all(1)));
  const grid = el("div", "cl-inpatch-grid");
  for (let m = 0; m < def.dante.rx; m++) {
    const cell = el("div", "cl-inpatch-ch");
    const name = el("span", "cl-inpatch-name");
    view.bindings.push({ kind: "fn", run: () => (name.textContent = `CH ${m + 1}`) });
    const pick = (v, label) =>
      button(view, {
        label,
        tone: "assign",
        get: (s) => (s.rig.devices.find((d) => d.id === "mixer").inPatch?.[m] ?? 0) === v,
        onPress: () => store.setDevice("mixer", `inPatch.${m}`, v),
        aria: (s) => `Channel ${m + 1} input: ${label}${(s.rig.devices.find((d) => d.id === "mixer").inPatch?.[m] ?? 0) === v ? " (selected)" : ""}`,
      });
    cell.append(name, pick(0, "RIO"), pick(1, "DANTE"));
    grid.appendChild(cell);
  }
  box.appendChild(grid);
  return box;
}

// ---------- SELECTED CHANNEL section (the knobs left of the screen) ----------

function selectedChannelSection(view, def, ui) {
  const box = el("section", "cl-selch");
  box.setAttribute("aria-label", "SELECTED CHANNEL section");
  box.appendChild(el("h4", "x32-title", "SELECTED CHANNEL"));
  if (ui.sel.kind !== "ch") {
    box.appendChild(el("p", "dg-note", "SEL an input channel: these knobs then set its gain, filter, EQ and compressor."));
    return box;
  }
  const store = view.store;
  const i = ui.sel.i;
  const c = def.channels[i];
  const ch = (s) => s.channels[i];
  const name = `Ch ${c.label}`;
  box.appendChild(
    row(
      "cl-selch-row",
      knob(view, { label: "GAIN", sheetLabel: `${name} gain`, min: c.gain.min, max: c.gain.max, step: 0.5, defaultValue: c.gain.min, tone: "gain", format: (v) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`, onInput: (v) => store.setChannel(i, "gainDb", v) }, (s) => ch(s).gainDb),
      c.hpf ? knob(view, { label: "HPF", sheetLabel: `${name} HPF`, defaultValue: 0, tone: "eq", format: (v) => (v <= 0.02 ? "off" : `${hz(hpfHz(c, v))} Hz`), onInput: (v) => store.setChannel(i, "hpf", v) }, (s) => ch(s).hpf) : null,
      knob(view, { label: c.kind === "stereo" ? "BAL" : "PAN", sheetLabel: `${name} pan`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: (v) => store.setChannel(i, "pan", v) }, (s) => ch(s).pan),
      c.dyn ? knob(view, { label: "DYN THR", sheetLabel: `${name} compressor threshold`, min: DYN.threshold[0], max: DYN.threshold[1], step: 0.5, defaultValue: 0, tone: "gain", format: (v) => (v >= 0 ? "0 dB" : `${v} dB`), onInput: (v) => store.setChannel(i, "dyn.threshold", v) }, (s) => ch(s).dyn.threshold) : null,
    ),
  );
  if (c.peq) {
    const grid = el("div", "cl-eqknobs");
    for (const b of PEQ_BANDS.slice().reverse()) {
      grid.appendChild(
        row(
          "cl-eqband",
          el("span", "dg-band-name", b.label),
          b.type === "peaking" ? knob(view, { label: "Q", sheetLabel: `${name} ${b.label} Q`, min: PEQ_Q.min, max: PEQ_Q.max, step: 0.05, defaultValue: 0.7, tone: "eq", format: (v) => v.toFixed(1), onInput: (v) => store.setChannel(i, `peq.${b.id}.q`, v) }, (s) => ch(s).peq[b.id].q) : el("span", "dg-q-blank", b.type === "lowshelf" ? "L.SHELF" : "H.SHELF"),
          knob(view, { label: "FREQ", sheetLabel: `${name} ${b.label} frequency`, defaultValue: logPos(b.freq, b.min, b.max), tone: "eq", format: (v) => `${hz(logFreq(v, b.min, b.max))}`, onInput: (v) => store.setChannel(i, `peq.${b.id}.freq`, logFreq(v, b.min, b.max)) }, (s) => logPos(ch(s).peq[b.id].freq, b.min, b.max)),
          knob(view, { label: "GAIN", sheetLabel: `${name} ${b.label} gain`, min: -15, max: 15, step: 0.5, defaultValue: 0, bipolar: true, tone: "eq", format: (v) => `${v > 0 ? "+" : ""}${v}`, onInput: (v) => store.setChannel(i, `peq.${b.id}.gain`, v) }, (s) => ch(s).peq[b.id].gain),
        ),
      );
    }
    box.appendChild(grid);
    // The knobs move the EQ even while it's switched off: say so where you turn them.
    const warn = el("p", "cl-warn");
    view.bindings.push({ kind: "fn", run: (s) => (warn.textContent = [!eqIsOn(ch(s)) ? "EQ is OFF" : "", c.dyn && !compIsOn(ch(s)) && ch(s).dyn.threshold < 0 ? "DYNAMICS is OFF" : ""].filter(Boolean).join(" · ")) });
    box.appendChild(warn);
  }
  return box;
}

// ---------- screen pages ----------

function selectedView(view, def, ui, rerender) {
  let panel;
  if (ui.sel.kind === "ch")
    panel = buildSelPanel(
      view,
      def,
      {
        get sel() {
          return ui.sel.i;
        },
        set sel(i) {
          ui.sel = { kind: "ch", i };
        },
      },
      rerender,
    );
  else if (ui.sel.kind === "bus") panel = busPanel(view, def, ui.sel.b);
  else if (ui.sel.kind === "main") panel = mainPanel(view, def);
  else panel = matrixPanel(view, def, ui.sel.b);
  panel.classList.add("cl-selview");
  return panel;
}

// The eight channels on Centralogic, side by side: what the CL's OVERVIEW shows.
function overview(view, def, ui, gLayer, rerender) {
  const box = el("div", "cl-overview");
  if (!gLayer.channels) {
    box.appendChild(el("p", "dg-note", `Centralogic shows ${gLayer.label}. Pick a CH bank (CH 1-8, 9-16, 17-24) to see those channels here.`));
    return box;
  }
  const T = termsOf(def);
  for (const i of gLayer.channels) {
    const c = def.channels[i];
    const ch = (s) => s.channels[i];
    const col = el("div", `cl-ovch${ui.sel.kind === "ch" && ui.sel.i === i ? " is-sel" : ""}`);
    const open = el("button", "cl-ovname");
    open.type = "button";
    open.setAttribute("aria-label", `Open channel ${c.label} in SELECTED CHANNEL VIEW`);
    open.addEventListener("click", () => {
      ui.sel = { kind: "ch", i };
      ui.page = "sel";
      rerender();
    });
    view.bindings.push({ kind: "fn", run: () => (open.textContent = `${c.label} ${view.dgHeads[i]?.querySelector(".strip-name")?.textContent || ""}`) });
    const info = el("p", "cl-ovinfo");
    view.bindings.push({
      kind: "fn",
      run: (s) => {
        const x = ch(s);
        info.textContent = `${x.gainDb > 0 ? "+" : ""}${Math.round(x.gainDb)} dB${x.phantom ? " · +48V" : ""}${x.lr === false ? "" : ` · ${T.lr}`}`;
        col.classList.toggle("is-off", !x.enabled);
      },
    });
    col.append(open, info);
    if (c.dyn) col.appendChild(compGraph(view, def, i, { theme: "cl", small: true }));
    if (c.peq) col.appendChild(eqGraph(view, def, i, { theme: "cl", small: true }));
    box.appendChild(col);
  }
  return box;
}
