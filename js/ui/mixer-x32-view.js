// Draws the Behringer X32 consoles (js/compact-defs.js `x32c` and `x32`) the
// way they are laid out (X32 / X32 COMPACT user manuals, chapter 1):
//   - the channel strip on the left edits the one selected strip (SEL):
//     a channel, a MIX bus, MAIN LR, a MATRIX or M/C;
//   - the input section: a bank of faders on layers (def.surface.inputLayers);
//   - the main display in the middle: HOME, ROUTING (laid out as the X32's
//     own: BLOCK → INPUT, AES A, AES B, CARD, XLR, and PATCH POINTS → OUT,
//     AUX, P16, USER) and, on the full X32, SCENES;
//   - the group section: 8 faders on layers (DCA, BUS 1-8, BUS 9-16, MATRIX),
//     the MAIN LR fader and the 6 mute group buttons;
//   - SENDS ON FADERS turns the input faders into sends to the selected MIX,
//     or the bus faders into the selected channel's sends.
// DCA and mute group assignment work as on the desk: put a DCA (its SEL) or a
// mute group (MUTE GRP, then the group) into assign mode, then press the
// channels' SEL buttons. The page state is the view's own (view.x32).

import { LAWS, levelLaw, matrixSources } from "../compact.js";
import { AES50_BLOCKS, BLOCK_SOURCES, AES_OUT_START, CARD_OUT_START, DEVICE_TYPES, aesOffset } from "../connection-model.js";
import { formatDb, formatPan } from "../levels.js";
import { button, buildSelPanel, el, fader, knob, meterBar, row } from "./mixer-digital-view.js";
import { compGraph, eqGraph } from "./viz.js";

const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The desk's words: the X32's by default, a Yamaha's from def.surface.terms.
export const termsOf = (def) => ({ onKey: false, solo: "SOLO", main: "MAIN LR", mainL: "MAIN L", mainR: "MAIN R", lr: "MAIN LR", sof: "SENDS ON FADERS", inputs: "INPUT CHANNELS", groups: "GROUP / BUS CHANNELS", display: "MAIN DISPLAY", ...(def.surface?.terms || {}) });

// A channel's or bus's on/off key: MUTE (lit = muted) on the X32, ON (lit = on) on a Yamaha.
export function muteKey(view, def, name, muted, setMuted, note = "") {
  const T = termsOf(def);
  return T.onKey
    ? button(view, { label: "ON", tone: "assign", small: false, get: (s) => !muted(s), onPress: () => setMuted(!muted(view.store.state)), aria: (s) => `${name} ON key: ${muted(s) ? `off${note}` : "on"}` })
    : button(view, { label: "MUTE", tone: "mute", small: false, get: muted, onPress: () => setMuted(!muted(view.store.state)), aria: (s) => `${name} MUTE: ${muted(s) ? `on${note}` : "off"}` });
}

// SENDS ON FADERS: a lit key plus a line saying what the faders are right now.
// The X32 has it in the group/bus section beside the layer keys; the CL3 in MASTER.
export function sofKey(def, ui, rerender) {
  const key = el("button", `lit-btn x32-sof${ui.sof ? " lit" : ""}`);
  key.type = "button";
  key.setAttribute("aria-pressed", String(ui.sof));
  key.append(el("span", "lit-led"), el("span", "lit-text", termsOf(def).sof));
  key.addEventListener("click", () => {
    ui.sof = !ui.sof;
    rerender();
  });
  const sel = ui.sel;
  const mix = sel.kind === "bus" && !def.buses[sel.b]?.fx ? def.buses[sel.b].label : null;
  const ch = sel.kind === "ch" ? def.channels[sel.i].label : null;
  const what = !ui.sof
    ? mix
      ? `Press it: the input faders become each channel's send to ${mix}.`
      : "SEL a MIX, then press it: the input faders become each channel's send to that MIX."
    : mix
      ? `On: the input faders are each channel's send to ${mix}. Press again for channel levels.`
      : ch
        ? `On: the MIX faders are channel ${ch}'s sends to each MIX. SEL a MIX to put its sends on the input faders.`
        : "On: SEL a MIX to put its sends on the input faders.";
  const note = el("p", `x32-sof-note${ui.sof ? " on" : ""}`, what);
  note.setAttribute("aria-live", "polite");
  return row("x32-sof-box", key, note);
}

// An input section's title, plus what its faders are while SENDS ON FADERS shows a MIX.
export const sofTitle = (title, def, ui) => (ui.sof && ui.sel.kind === "bus" && !def.buses[ui.sel.b]?.fx ? `${title} · SENDS TO ${def.buses[ui.sel.b].label}` : title);

export function renderX32(view, def) {
  const sf = def.surface;
  if (!view.x32 || view.x32.id !== def.id) view.x32 = { id: def.id, layer: sf.inputLayers[0].id, glayer: "bus", sel: { kind: "ch", i: 6 }, sof: false, assign: null, mgrpEdit: false, page: "home" };
  const ui = view.x32;
  const rerender = () => view.render();
  view.def = def;
  view.dgMeters = [];
  view.dgHeads = [];
  view.dgGr = null;
  view.paths = [];
  view.pathKey = "";

  const surface = el("div", `mixer-surface x32-surface${sf.bank > 8 ? " x32-full" : ""}`);

  // ---------- channel strip (whatever is selected) ----------
  const panel =
    ui.sel.kind === "ch"
      ? buildSelPanel(
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
        )
      : ui.sel.kind === "bus"
        ? busPanel(view, def, ui.sel.b)
        : ui.sel.kind === "main"
          ? mainPanel(view, def)
          : ui.sel.kind === "mtx"
            ? matrixPanel(view, def, ui.sel.b)
            : mcPanel(view, def);
  panel.classList.add("x32-chstrip");

  // ---------- input section ----------
  const inLayer = sf.inputLayers.find((l) => l.id === ui.layer) || sf.inputLayers[0];
  const inBank = el("div", "mixer-strips x32-bank");
  inBank.setAttribute("role", "group");
  inBank.setAttribute("aria-label", `Input faders: ${inLayer.label}`);
  const slots = [...(inLayer.channels || []).map((i) => channelStrip(view, def, i, ui, rerender)), ...(inLayer.fx || []).map((b) => fxReturnStrip(view, def, b)), ...(inLayer.buses || []).map((b) => groupStrip(view, def, b, ui, rerender))];
  while (slots.length < sf.bank) slots.push(emptyStrip());
  inBank.append(...slots);
  const inputs = row(
    "x32-section x32-inputs",
    el("h4", "x32-title", sofTitle("INPUT CHANNELS", def, ui)),
    layerBar(sf.inputLayers, ui.layer, (id) => {
      ui.layer = id;
      rerender();
    }, "Input fader layer"),
    inBank,
  );

  // ---------- main display ----------
  const display = el("section", "x32-display");
  display.setAttribute("aria-label", "Main display");
  const pages = [["home", "HOME"], ...(def.routing || def.aes50 ? [["routing", "ROUTING"]] : []), ...(def.scenes ? [["scenes", "SCENES"]] : [])];
  if (pages.length > 1)
    display.appendChild(
      layerBar(
        pages.map(([id, label]) => ({ id, label })),
        ui.page,
        (id) => {
          ui.page = id;
          rerender();
        },
        "Display page",
      ),
    );
  if (ui.page === "routing" && (def.routing || def.aes50)) {
    display.classList.add("x32-display-wide");
    display.appendChild(routingScreen(view, def, ui, rerender));
  }
  else if (ui.page === "scenes" && def.scenes) display.appendChild(scenesPage(view, def));
  else {
    // A selected channel's DYN and EQ, as the X32's HOME screen draws them.
    if (ui.sel.kind === "ch" && def.channels[ui.sel.i].peq) display.appendChild(row("x32-viz", compGraph(view, def, ui.sel.i, { theme: "x32", small: true }), eqGraph(view, def, ui.sel.i, { theme: "x32", small: true })));
    const lines = el("div", "x32-lines");
    lines.setAttribute("aria-live", "polite");
    view.bindings.push({ kind: "fn", run: (s) => (lines.innerHTML = homeText(def, s, ui, view)) });
    display.appendChild(lines);
  }
  display.prepend(el("h4", "x32-title", "MAIN DISPLAY"));

  // ---------- group / bus section ----------
  const gLayer = sf.groupLayers.find((l) => l.id === ui.glayer) || sf.groupLayers[0];
  const grBank = el("div", "mixer-strips x32-bank");
  grBank.append(...groupSlots(view, def, gLayer, ui, rerender));
  grBank.appendChild(mainStrip(view, def, ui, rerender));
  const groups = row(
    "x32-section x32-groups",
    el("h4", "x32-title", "GROUP / BUS CHANNELS"),
    layerBar(sf.groupLayers, gLayer.id, (id) => {
      ui.glayer = id;
      rerender();
    }, "Group fader layer"),
    sofKey(def, ui, rerender),
    grBank,
    muteGroupBar(view, def, ui, rerender),
  );

  surface.append(panel, row("x32-desk", inputs, display, groups));
  view.root.appendChild(surface);
}

// The strips of a group-section layer: DCAs, channels or buses, padded to the bank.
export function groupSlots(view, def, gLayer, ui, rerender) {
  const n = def.surface.groupBank || 8;
  const slots = gLayer.channels
    ? gLayer.channels.map((i) => channelStrip(view, def, i, ui, rerender))
    : gLayer.dcas || gLayer.id === "dca"
      ? (gLayer.dcas || [1, 2, 3, 4, 5, 6, 7, 8]).map((k) => dcaStrip(view, def, k, ui, rerender))
      : gLayer.buses.map((b) => groupStrip(view, def, b, ui, rerender));
  while (slots.length < n) slots.push(emptyStrip());
  return slots;
}

export function layerBar(layers, active, onPick, label) {
  const bar = el("div", "x32-layers");
  bar.setAttribute("role", "radiogroup");
  bar.setAttribute("aria-label", label);
  for (const l of layers) {
    const b = el("button", `x32-layer${active === l.id ? " on" : ""}`, l.label);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(active === l.id));
    b.addEventListener("click", () => active !== l.id && onPick(l.id));
    bar.appendChild(b);
  }
  return bar;
}

export const emptyStrip = () => {
  const s = el("section", "strip dg-strip x32-empty");
  s.setAttribute("aria-hidden", "true");
  return s;
};

function selButton({ lit, label, onPress }) {
  const b = el("button", `dg-sel${lit ? " on" : ""}`, "SEL");
  b.type = "button";
  b.setAttribute("aria-pressed", String(lit));
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onPress);
  return b;
}

const isSel = (ui, kind, key) => ui.sel.kind === kind && (kind === "ch" ? ui.sel.i === key : kind === "main" || kind === "mc" ? true : ui.sel.b === key);

// Which XLR outputs carry a bus (routed consoles) or its fixed jack.
function outsOf(def, s, id) {
  if (!def.routing) return id.startsWith("mix") ? `XLR OUT ${id.slice(3)}` : "";
  const outs = def.routing.outputs.filter((o) => s.routing[o] === id || (id === "main" && /^main-/.test(s.routing[o]))).map((o) => o.slice(3));
  return outs.length ? `OUT ${outs.join(", ")}` : "not routed";
}
const outName = (def, o) => def.routing.names?.[o] || `XLR OUT ${o.slice(3)}`;

// ---------- strips ----------

export function channelStrip(view, def, i, ui, rerender) {
  const T = termsOf(def);
  const store = view.store;
  const c = def.channels[i];
  const n = c.label;
  const ch = (s) => s.channels[i];
  const strip = el("section", `strip dg-strip x32-strip${isSel(ui, "ch", i) ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", `Channel ${n}`);
  const head = el("button", "strip-head");
  head.type = "button";
  head.addEventListener("click", () => view.onPatchChannel(i));
  view.bindings.push({ kind: "head", el: head, index: i });
  view.dgHeads[i] = head;

  // SEL: select the channel, or (in assign mode) add it to / take it out of the DCA or mute group.
  const a = ui.assign;
  const slot = a ? `${a.type === "dca" ? "d" : "g"}${a.n}` : null;
  const member = (s) => (a ? !!(a.type === "dca" ? ch(s).dca : ch(s).mgrp)?.[slot] : false);
  const sel = selButton({
    lit: a ? member(store.state) : isSel(ui, "ch", i),
    label: a ? `Channel ${n}: ${member(store.state) ? "take out of" : "add to"} ${a.type === "dca" ? "DCA" : "mute group"} ${a.n}` : `Select channel ${n}`,
    onPress: () => {
      if (a) store.setChannel(i, `${a.type}.${slot}`, !member(store.state));
      else ui.sel = { kind: "ch", i };
      rerender();
    },
  });
  if (a) sel.classList.add("assigning");

  // The fader: the channel level, or (SENDS ON FADERS with a MIX selected) its send to that MIX.
  const sofBus = ui.sof && ui.sel.kind === "bus" && c.sends?.includes(ui.sel.b) ? ui.sel.b : null;
  const control = sofBus
    ? fader(view, { label: "", sheetLabel: `Ch ${n} send to ${def.buses[sofBus].label}`, defaultValue: 0, tone: "aux1", format: lawFormat(LAWS[def.sends[sofBus].law]), get: (s) => ch(s).sends[sofBus], onInput: (v) => store.setChannel(i, `sends.${sofBus}`, v) })
    : fader(view, { label: "", sheetLabel: `Ch ${n} fader`, format: lawFormat(levelLaw(def)), get: (s) => ch(s).level, onInput: (v) => store.setChannel(i, "level", v) });
  const mute = muteKey(view, def, `Channel ${n}`, (s) => !ch(s).enabled, (m) => store.setChannel(i, "enabled", !m));
  const solo = button(view, { label: T.solo, tone: "pfl", get: (s) => ch(s).solo, onPress: () => store.setChannel(i, "solo", !ch(store.state).solo), aria: (s) => `Channel ${n} ${T.solo}: ${ch(s).solo ? "on" : "off"}` });
  const tag = el("span", "x32-tag");
  view.bindings.push({
    kind: "fn",
    run: (s) => {
      strip.classList.toggle("is-muted", !ch(s).enabled);
      const dcas = Object.entries(ch(s).dca || {}).filter(([, on]) => on).map(([d]) => d.replace("d", "D"));
      const grps = Object.entries(ch(s).mgrp || {}).filter(([, on]) => on).map(([g]) => g.replace("g", "M"));
      tag.textContent = [ch(s).lr === false ? (T.onKey ? "no ST" : "no LR") : "", ...dcas, ...grps].filter(Boolean).join(" ");
    },
  });
  strip.append(head, sel, row("dg-extra", tag), row("dg-fader", control, meterBar(view, i)), row("dg-btns", mute, solo));
  return strip;
}

export function fxReturnStrip(view, def, b) {
  const store = view.store;
  const bus = def.buses[b];
  const strip = el("section", "strip dg-strip x32-strip x32-fxret");
  strip.setAttribute("aria-label", bus.master.label);
  strip.append(
    el("div", "dg-master-name", bus.master.label),
    el("p", "dg-note", bus.fx.name),
    row("dg-fader", fader(view, { label: "", sheetLabel: `${bus.master.label} fader (how much ${bus.fx.name} in the MAIN)`, format: lawFormat(LAWS[bus.master.law]), get: (s) => s[b].level, onInput: (v) => store.setBus(b, "level", v) })),
  );
  return strip;
}

// A strip in the group section (or the BUS MASTER input layer): a MIX, an FX send bus, a MATRIX or M/C.
export function groupStrip(view, def, id, ui, rerender) {
  const T = termsOf(def);
  const store = view.store;
  if (def.buses[id]?.fx) {
    const strip = el("section", "strip dg-strip x32-strip x32-fxret");
    strip.setAttribute("aria-label", `${def.buses[id].label}: feeds ${def.buses[id].fx.name}; its level is ${def.buses[id].master.label} on the FX RETURNS layer`);
    strip.append(el("div", "dg-master-name", def.buses[id].label), el("p", "dg-note", `→ ${def.buses[id].master.label.replace(" RTN", "")}`));
    return strip;
  }
  const kind = id === "mc" ? "mc" : id.startsWith("mtx") ? "mtx" : "bus";
  const label = kind === "mc" ? "M/C" : kind === "mtx" ? `MATRIX ${id.slice(3)}` : def.buses[id].label;
  const selected = isSel(ui, kind, id);
  const strip = el("section", `strip dg-strip x32-strip${selected ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", `${label} master`);
  const sel = selButton({
    lit: selected,
    label: `Select ${label}`,
    onPress: () => {
      ui.sel = kind === "mc" ? { kind } : { kind, b: id };
      ui.assign = null;
      rerender();
    },
  });
  // With a channel selected and SENDS ON FADERS on, a MIX fader is that channel's send to it.
  const sofCh = kind === "bus" && ui.sof && ui.sel.kind === "ch" && def.channels[ui.sel.i].sends?.includes(id) ? ui.sel.i : null;
  const control =
    sofCh !== null
      ? fader(view, { label: "", sheetLabel: `Ch ${def.channels[sofCh].label} send to ${label}`, defaultValue: 0, tone: "aux1", format: lawFormat(LAWS[def.sends[id].law]), get: (s) => s.channels[sofCh].sends[id], onInput: (v) => store.setChannel(sofCh, `sends.${id}`, v) })
      : fader(view, { label: "", sheetLabel: `${label} fader`, format: lawFormat(LAWS.level), get: (s) => s[id].level, onInput: (v) => store.setBus(id, "level", v) });
  const mute = muteKey(view, def, label, (s) => !!s[id].mute, (m) => store.setBus(id, "mute", m));
  const out = el("p", "dg-note");
  view.bindings.push({ kind: "fn", run: (s) => (out.textContent = [outsOf(def, s, id), kind === "bus" && s[id].lr ? (T.onKey ? "→ ST" : "→ LR") : ""].filter(Boolean).join(" · ")) });
  strip.append(el("div", "dg-master-name", label), sel, row("dg-extra", out), row("dg-fader", control), row("dg-btns", mute));
  return strip;
}

export function dcaStrip(view, def, k, ui, rerender) {
  const store = view.store;
  const id = `dca${k}`;
  const assigning = ui.assign?.type === "dca" && ui.assign.n === k;
  const strip = el("section", `strip dg-strip x32-strip x32-dca${assigning ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", `DCA ${k}`);
  const members = el("p", "dg-note");
  view.bindings.push({ kind: "fn", run: (s) => (members.textContent = s.channels.filter((c) => c.dca?.[`d${k}`]).map((c) => c.label).join(" ") || "empty") });
  // A DCA's SEL can't select it (the manual): here it opens and closes its assignment.
  const sel = selButton({
    lit: assigning,
    label: assigning ? `Finish assigning DCA ${k}` : `Assign channels to DCA ${k}`,
    onPress: () => {
      ui.assign = assigning ? null : { type: "dca", n: k };
      rerender();
    },
  });
  const mute = muteKey(view, def, `DCA ${k}`, (s) => s[id].mute, (m) => store.setBus(id, "mute", m), ", its channels are muted");
  strip.append(el("div", "dg-master-name", `DCA ${k}`), sel, row("dg-extra", members), row("dg-fader", fader(view, { label: "", sheetLabel: `DCA ${k} fader`, format: lawFormat(LAWS.level), get: (s) => s[id].level, onInput: (v) => store.setBus(id, "level", v) })), row("dg-btns", mute));
  return strip;
}

export function mainStrip(view, def, ui, rerender) {
  const store = view.store;
  const T = termsOf(def);
  const strip = el("section", `strip dg-strip dg-master x32-main${isSel(ui, "main") ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", T.main);
  const mute = muteKey(view, def, T.main, (s) => !!s.main.mute, (m) => store.setBus("main", "mute", m), ", the house is silent");
  const phones = knob(view, { label: "PHONES", sheetLabel: "Headphone level", defaultValue: 0.5, tone: "level", format: lawFormat(LAWS.master), onInput: (v) => store.setBus("cr", "level", v) }, (s) => s.cr.level);
  const sel = def.matrix
    ? selButton({
        lit: isSel(ui, "main"),
        label: `Select ${T.main}`,
        onPress: () => {
          ui.sel = { kind: "main" };
          rerender();
        },
      })
    : el("div", "dg-extra");
  strip.append(
    el("div", "dg-master-name", T.main),
    sel,
    row("dg-fader", fader(view, { label: "", sheetLabel: `${T.main} fader`, format: lawFormat(LAWS[def.main.law]), get: (s) => s.main.level, onInput: (v) => store.setBus("main", "level", v) }), row("dg-master-meters", meterBar(view, "L"), meterBar(view, "R"))),
    row("dg-btns", mute, phones),
  );
  return strip;
}

// MUTE GRP: off, the six buttons mute their groups; on, they pick a group to assign.
export function muteGroupBar(view, def, ui, rerender) {
  if (!def.muteGroups) return null; // no mute groups on this desk (the generic digital mixer)
  const store = view.store;
  const barEl = el("div", "x32-mgrp");
  const edit = el("button", `x32-layer${ui.mgrpEdit ? " on" : ""}`, "MUTE GRP");
  edit.type = "button";
  edit.setAttribute("aria-pressed", String(ui.mgrpEdit));
  edit.setAttribute("aria-label", ui.mgrpEdit ? "Finish assigning mute groups" : "Assign channels to mute groups");
  edit.addEventListener("click", () => {
    ui.mgrpEdit = !ui.mgrpEdit;
    if (!ui.mgrpEdit && ui.assign?.type === "mgrp") ui.assign = null;
    rerender();
  });
  barEl.appendChild(edit);
  for (let k = 1; k <= def.muteGroups; k++) {
    const g = `g${k}`;
    if (ui.mgrpEdit) {
      const b = el("button", `x32-group${ui.assign?.type === "mgrp" && ui.assign.n === k ? " on" : ""}`, String(k));
      b.type = "button";
      b.setAttribute("aria-label", `Assign channels to mute group ${k}`);
      b.addEventListener("click", () => {
        ui.assign = { type: "mgrp", n: k };
        rerender();
      });
      barEl.appendChild(b);
    } else {
      barEl.appendChild(button(view, { label: String(k), tone: "mute", get: (s) => s.mgrp[g], onPress: () => store.setBus("mgrp", g, !store.state.mgrp[g]), aria: (s) => `Mute group ${k}: ${s.mgrp[g] ? "muting its channels" : "off"}` }));
    }
  }
  return barEl;
}

// ---------- the channel-strip panel for buses, MAIN, matrices and M/C ----------

function panelShell(title, ...sections) {
  const panel = el("section", "dg-panel");
  panel.setAttribute("aria-label", `Selected ${title}`);
  panel.appendChild(row("dg-panel-head", el("h4", "dg-panel-title", title)));
  for (const [name, ...els] of sections) {
    const sec = el("div", "dg-sec");
    sec.appendChild(el("h5", "", name));
    sec.appendChild(row("dg-sec-body", ...els));
    panel.appendChild(sec);
  }
  return panel;
}

// A matrix send knob for one source (MAIN, M/C or a MIX) into each matrix.
const matrixSends = (view, def, src, name) =>
  Array.from({ length: def.matrix || 0 }, (_, k) => {
    const m = `mtx${k + 1}`;
    return knob(view, { label: `MTX ${k + 1}`, sheetLabel: `${name} to MATRIX ${k + 1}`, defaultValue: 0, tone: "aux1", format: lawFormat(LAWS.level), onInput: (v) => view.store.setBus(m, src, v) }, (s) => s[m][src]);
  });

export function busPanel(view, def, b) {
  const T = termsOf(def);
  const store = view.store;
  const bus = def.buses[b];
  const sections = [
    [
      "BUS MASTER",
      knob(view, { label: "LEVEL", sheetLabel: `${bus.label} master`, defaultValue: 0.75, tone: "level", size: undefined, format: lawFormat(LAWS[bus.master.law]), onInput: (v) => store.setBus(b, "level", v) }, (s) => s[b].level),
      muteKey(view, def, bus.label, (s) => !!s[b].mute, (m) => store.setBus(b, "mute", m)),
    ],
  ];
  if (def.busToMain)
    sections.push([
      T.onKey ? "TO STEREO (group)" : "MAIN BUS (subgroup)",
      button(view, { label: T.lr, tone: "assign", get: (s) => !!s[b].lr, onPress: () => store.setBus(b, "lr", !store.state[b].lr), aria: (s) => `${bus.label} to ${T.main}: ${s[b].lr ? "on, it is a subgroup" : "off"}` }),
      knob(view, { label: "PAN", sheetLabel: `${bus.label} pan into ${T.main}`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: (v) => store.setBus(b, "pan", v) }, (s) => s[b].pan),
    ]);
  if (def.matrix) sections.push(["MATRIX SENDS", ...matrixSends(view, def, b, bus.label)]);
  const panel = panelShell(`${bus.label}`, ...sections);
  panel.appendChild(el("p", "dg-hint", `Press ${T.sof}: the input faders become each channel's send to ${bus.label}. Each channel's PRE/POST for it is in that channel's strip.`));
  return panel;
}

export function mainPanel(view, def) {
  const T = termsOf(def);
  return panelShell(T.main, ["MATRIX SENDS (the main mix into each matrix)", ...matrixSends(view, def, "main", T.main)]);
}

export function mcPanel(view, def) {
  const store = view.store;
  return panelShell(
    "M/C (MONO/CENTER)",
    [
      "M/C MASTER",
      knob(view, { label: "LEVEL", sheetLabel: "M/C master", defaultValue: 0.75, tone: "level", size: undefined, format: lawFormat(LAWS.level), onInput: (v) => store.setBus("mc", "level", v) }, (s) => s.mc.level),
      button(view, { label: "MUTE", tone: "mute", get: (s) => s.mc.mute, onPress: () => store.setBus("mc", "mute", !store.state.mc.mute), aria: (s) => `M/C MUTE: ${s.mc.mute ? "on" : "off"}` }),
    ],
    ["MATRIX SENDS", ...matrixSends(view, def, "mc", "M/C")],
    ["HOW TO FEED IT", el("p", "dg-note", "Each channel has an M/C send in its own strip (SEL the channel).")],
  );
}

export function matrixPanel(view, def, m) {
  const store = view.store;
  const k = m.slice(3);
  const label = (src) => (src === "main" ? termsOf(def).main.replace(" LR", "") : src === "mc" ? "M/C" : def.buses[src].label.replace("MIX ", "MIX"));
  return panelShell(
    `MATRIX ${k}`,
    [
      "MATRIX MASTER",
      knob(view, { label: "LEVEL", sheetLabel: `MATRIX ${k} master`, defaultValue: 0.75, tone: "level", size: undefined, format: lawFormat(LAWS.level), onInput: (v) => store.setBus(m, "level", v) }, (s) => s[m].level),
      muteKey(view, def, `MATRIX ${k}`, (s) => s[m].mute, (v) => store.setBus(m, "mute", v)),
    ],
    ["SOURCES (what feeds this matrix)", ...matrixSources(def).map((src) => knob(view, { label: label(src), sheetLabel: `${label(src)} into MATRIX ${k}`, defaultValue: 0, tone: "aux1", format: lawFormat(LAWS.level), onInput: (v) => store.setBus(m, src, v) }, (s) => s[m][src]))],
  );
}

// ---------- display pages ----------

const SOURCE_NAMES = (src, T) => (src === "off" ? "OFF" : src === "main-l" ? T.mainL : src === "main-r" ? T.mainR : src === "mc" ? "M/C" : src.startsWith("mtx") ? `MATRIX ${src.slice(3)}` : `MIX ${src.slice(3)}`);

// ---------- ROUTING, as the X32's own screen ----------
// Firmware 4 (photos of Salmon's X32, 2026-10-20 and 2026-11): a BLOCK row
// (INPUT · AES A · AES B · CARD · XLR) and PATCH POINTS (OUT · AUX · P16 ·
// USER), the connected devices along the top. Each block is a column listing
// what it can take: the filled item is what's connected; tap another to put
// the cursor on it (the yellow box), then press CONNECT under the column, as
// the console's knob does. Items the lab doesn't build are listed, dimmed,
// and say so instead of pretending to work.
const BLOCK_TABS = [["input", "INPUT"], ["aesa", "AES A"], ["aesb", "AES B"], ["card", "CARD"], ["xlr", "XLR"]];
const PATCH_TABS = [["out", "OUT"], ["aux", "AUX"], ["p16", "P16"], ["user", "USER"]];
const span = (n, size = 8) => `${n * size + 1}-${n * size + size}`;
const mixerOfState = (s) => s.rig.devices.find((d) => d.id === "mixer");

export function routingScreen(view, def, ui, rerender) {
  ui.rmode ||= "block";
  ui.rtab ||= "input";
  ui.rcur ||= {};
  const box = el("div", "x32-rscreen");
  box.appendChild(connectedBar(view, def));
  const tabs = ui.rmode === "block" ? BLOCK_TABS : PATCH_TABS;
  const bar = el("div", "x32-rtabs");
  bar.setAttribute("role", "tablist");
  bar.appendChild(el("span", "x32-rmode", ui.rmode === "block" ? "BLOCK" : "PATCH"));
  for (const [id, label] of tabs) {
    const t = el("button", `x32-rtab${ui.rtab === id ? " on" : ""}`, label);
    t.type = "button";
    t.setAttribute("role", "tab");
    t.setAttribute("aria-selected", String(ui.rtab === id));
    t.addEventListener("click", () => {
      ui.rtab = id;
      rerender();
    });
    bar.appendChild(t);
  }
  const flip = el("button", "x32-rflip", ui.rmode === "block" ? "PATCH POINTS" : "BLOCK ROUTING");
  flip.type = "button";
  flip.addEventListener("click", () => {
    ui.rmode = ui.rmode === "block" ? "patch" : "block";
    ui.rtab = ui.rmode === "block" ? "input" : "out";
    rerender();
  });
  bar.appendChild(flip);
  box.appendChild(bar);
  const page = { input: inputBlocks, aesa: aesOutBlocks, aesb: aesBPage, card: cardBlocks, xlr: xlrPage, out: outPatch, aux: notBuilt, p16: notBuilt, user: notBuilt }[ui.rtab] || inputBlocks;
  box.appendChild(page(view, def, ui));
  return box;
}

// Along the top of the screen: what's on AES50 A and B, and the card.
function connectedBar(view, def) {
  const line = el("p", "x32-rconnected");
  view.bindings.push({ kind: "fn", run: (s) => {
    const mixer = mixerOfState(s);
    const onA = s.rig.devices.find((d) => DEVICE_TYPES[d.type]?.network === "aes50" && aesOffset(s.rig, d, mixer) === 0);
    const text = `CONNECTED DEVICES · A: ${onA ? DEVICE_TYPES[onA.type].name.replace(/^Behringer /, "") : "NO DEVICE"} · B: NO DEVICE · C: ${def.card === "x-dante" ? "Dante (X-DANTE)" : "USB card"}`;
    if (line.textContent !== text) line.textContent = text;
  } });
  return line;
}

// Columns of choices, one per block. `items(c)`: [{ id, label, ok }]; `current(s, c)`: the
// connected id; `connect(c, id)`. `note` shows what CONNECT did, or why it didn't.
function blockColumns(view, ui, { key, title, heads, items, current, connect }) {
  const wrap = el("div", "x32-rpage");
  wrap.appendChild(el("h5", "x32-rtitle", title));
  const cols = el("div", "x32-rcols");
  const note = el("p", "x32-rnote");
  note.setAttribute("aria-live", "polite");
  heads.forEach((head, c) => {
    const col = el("div", "x32-rcol");
    col.appendChild(el("h6", "", head));
    const list = el("ul", "x32-rlist");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", `${title}: ${head}`);
    const opts = items(c);
    const cursorKey = `${key}${c}`;
    const lis = opts.map((o) => {
      const li = el("li", `x32-ritem${o.ok ? "" : " off"}`, o.label);
      li.setAttribute("role", "option");
      li.tabIndex = 0;
      li.dataset.id = o.id;
      if (!o.ok) li.title = "Listed as on the X32: not built in the lab";
      const pick = () => {
        ui.rcur[cursorKey] = o.id;
        mark(view.store.state);
      };
      li.addEventListener("click", pick);
      li.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick()));
      return li;
    });
    const mark = (s) => {
      const now = current(s, c);
      const cur = ui.rcur[cursorKey] ?? now;
      for (const li of lis) {
        li.classList.toggle("on", li.dataset.id === now);
        li.classList.toggle("cur", li.dataset.id === cur);
        li.setAttribute("aria-selected", String(li.dataset.id === now));
      }
    };
    view.bindings.push({ kind: "fn", run: mark });
    list.append(...lis);
    const go = el("button", "x32-rconnect", "CONNECT");
    go.type = "button";
    go.setAttribute("aria-label", `Connect the selected source to ${head}`);
    go.addEventListener("click", () => {
      const id = ui.rcur[cursorKey] ?? current(view.store.state, c);
      const o = opts.find((x) => x.id === id);
      delete ui.rcur[cursorKey];
      if (!o?.ok) note.textContent = `${o?.label || "That"} isn't built in the lab yet: ${head} stays as it was.`;
      else {
        connect(c, id);
        note.textContent = `${head} ← ${o.label}`;
      }
      mark(view.store.state);
    });
    col.append(list, go);
    cols.appendChild(col);
  });
  wrap.append(cols, note);
  return wrap;
}

// BLOCK → INPUT, the channel processing block patch: what each block of 8
// channels listens to, and AUX IN (only Aux Ins, its own jacks, is built).
function inputBlocks(view, def, ui) {
  const store = view.store;
  // One column per block of 8 mono channels; the console has as many LOCAL blocks.
  const blocks = Math.ceil(def.channels.filter((c) => c.jacks.includes("mic")).length / 8);
  const local = blocks;
  const options = (b) => [
    ...Array.from({ length: local }, (_, k) => ({ id: k === b ? 0 : 10 + k, label: `Local ${span(k)}`, ok: true })),
    ...Array.from({ length: AES50_BLOCKS }, (_, k) => ({ id: k === b ? 1 : 3 + k, label: `AES50 A${span(k)}`, ok: true })),
    ...Array.from({ length: AES50_BLOCKS }, (_, k) => ({ id: 20 + k, label: `AES50 B${span(k)}`, ok: true })),
    ...Array.from({ length: 4 }, (_, k) => ({ id: k === b ? 2 : 30 + k, label: `Card ${span(k)}`, ok: true })),
  ].map((o) => ({ ...o, id: String(o.id) }));
  const page = blockColumns(view, ui, {
    key: "in",
    title: "CHANNEL PROCESSING BLOCK PATCH",
    heads: [...Array.from({ length: blocks }, (_, b) => span(b)), "AUX IN"],
    items: (c) => (c < blocks ? options(c) : [{ id: "auxins", label: "Aux Ins", ok: true }, ...["Local 1-2", "Local 1-4", "Local 1-6", "AES50 A1-2", "AES50 A1-4", "AES50 A1-6", "AES50 B1-2", "AES50 B1-4", "AES50 B1-6", "Card 1-2", "Card 1-4"].map((l) => ({ id: l, label: l, ok: false }))]),
    current: (s, c) => (c < blocks ? String(mixerOfState(s).inSource?.[c] ?? 0) : "auxins"),
    connect: (c, id) => c < blocks && store.setDevice("mixer", `inSource.${c}`, Number(id)),
  });
  page.appendChild(el("p", "x32-rhelp", "Each block of 8 channels listens to one block of 8 inputs: the rear panel's LOCAL jacks, a stage box on AES50 A (its input n arrives as AES50 A n; a box chained off the first box's AES50 B comes after it, so an SD8 behind an S32 is AES50 A33-40), AES50 B, or the card. Nothing is connected to AES50 B here, and nothing plays back into the lab's card: those blocks go silent."));
  return page;
}

// BLOCK → AES A: what each block of 8 AES50 A output channels carries, so a
// stage box's OUT n. Output 1-8 and 9-16 are the console's XLR OUT 1-16 (set on PATCH POINTS → OUT).
function aesOutBlocks(view, def, ui) {
  const store = view.store;
  const page = blockColumns(view, ui, {
    key: "aesa",
    title: "AES50 A OUTPUTS",
    heads: Array.from({ length: AES50_BLOCKS }, (_, k) => span(k)),
    items: () => BLOCK_SOURCES.map((o) => ({ id: o.id, label: o.label, ok: o.out !== undefined })),
    current: (s, c) => (mixerOfState(s).aesOut || AES_OUT_START)[c],
    connect: (c, id) => store.setDevice("mixer", `aesOut.${c}`, id),
  });
  page.appendChild(el("p", "x32-rhelp", "A stage box's OUT n carries AES50 A output n. Output 1-8 and Output 9-16 are the console's outputs 1-16 (what each one carries is set on PATCH POINTS → OUT), so S32 OUT 9 carries Output 9. Salmon's X32 sends P16 on 33-48. In the lab only Output 1-8 and 9-16 reach a stage box."));
  return page;
}

function aesBPage(view, def, ui) {
  const page = el("div", "x32-rpage");
  page.append(el("h5", "x32-rtitle", "AES50 B OUTPUTS"), el("p", "x32-rhelp", "NO DEVICE: nothing is plugged into the X32's AES50 B port in this rig. (A second stage box chains off the first box's own AES50 B instead: see AES A.) On the console this page sets what AES50 B's 48 output channels carry, block by block, like AES A."));
  return page;
}

// BLOCK → CARD: what the card's 32 outputs carry (Salmon's X-DANTE sends Local 1-32 to a recording).
function cardBlocks(view, def, ui) {
  const store = view.store;
  const page = blockColumns(view, ui, {
    key: "card",
    title: "EXPANSION CARD OUTPUTS",
    heads: Array.from({ length: 4 }, (_, k) => span(k)),
    items: () => BLOCK_SOURCES.map((o) => ({ id: o.id, label: o.label, ok: !!o.card })),
    current: (s, c) => (mixerOfState(s).cardOut || CARD_OUT_START)[c],
    connect: (c, id) => store.setDevice("mixer", `cardOut.${c}`, id),
  });
  page.appendChild(el("p", "x32-rhelp", def.card === "x-dante" ? "CONNECTED DEVICE: X-DANTE, 32 in / 32 out Dante card. Its Dante port goes to the FOH Mac mini (MUS-BH100-MINI), which records the multitrack in Logic through Dante Virtual Soundcard. Local 1-8 … 25-32 on the card's outputs are direct outs of the inputs: card out 1 is input 1. The lab stores this page but records nothing yet." : "CONNECTED DEVICE: a USB card. Local 1-8 … 25-32 on the card's outputs are direct outs of the inputs, for a multitrack recording: card out 1 is input 1. The lab stores this page but records nothing yet."));
  return page;
}

function xlrPage(view, def) {
  const page = el("div", "x32-rpage");
  page.append(el("h5", "x32-rtitle", "XLR OUTPUTS"), el("p", "x32-rhelp", `The rear panel's XLR OUT 1-${def.routing ? 16 : 8} carry the console's outputs: what each one carries is set on PATCH POINTS → OUT. This page's own block choices aren't built in the lab yet.`));
  return page;
}

const NOT_BUILT = {
  aux: ["AUX OUTPUTS", "The rear panel's AUX OUT 1-6 (1/4\"). Not built in the lab yet."],
  p16: ["P16 OUTPUTS", "The P16 (Ultranet) port: sixteen channels for personal monitor mixers. Not built in the lab yet."],
  user: ["USER IN / OUT", "The user patch: hand-picked single channels for the AES50 and card blocks. Not built in the lab yet."],
};
function notBuilt(view, def, ui) {
  const [title, text] = NOT_BUILT[ui.rtab];
  const page = el("div", "x32-rpage");
  page.append(el("h5", "x32-rtitle", title), el("p", "x32-rhelp", text));
  return page;
}

// PATCH POINTS → OUT: pick an output, its CATEGORY and OUT SIGNAL, then ASSIGN
// (the TAP is shown, fixed at Post Fader in the lab).
const CATEGORIES = [
  { id: "off", label: "OFF", signals: [["off", "OFF"]] },
  { id: "main", label: "Main (LRC)", signals: [["main-l", "Main L"], ["main-r", "Main R"], ["mc", "Main C (M/C)"]] },
  { id: "mix", label: "Mix Bus", signals: Array.from({ length: 16 }, (_, k) => [`mix${k + 1}`, `MixBus ${k + 1}`]) },
  { id: "mtx", label: "Matrix", signals: Array.from({ length: 6 }, (_, k) => [`mtx${k + 1}`, `Matrix ${k + 1}`]) },
  { id: "direct", label: "Direct Out", signals: [] },
  { id: "mon", label: "Monitor/TB", signals: [] },
];
const TAPS = ["IN/LC", "IN/LC +M", "PreEQ", "PreEQ +M", "PostEQ", "PostEQ +M", "PreFdr", "PreFdr +M", "Post Fader"];
const categoryOf = (src) => CATEGORIES.find((c) => c.signals.some(([id]) => id === src))?.id || "off";
const signalName = (src) => CATEGORIES.flatMap((c) => c.signals).find(([id]) => id === src)?.[1] || "OFF";

function outPatch(view, def, ui) {
  const page = el("div", "x32-rpage");
  if (!def.routing) {
    page.append(el("h5", "x32-rtitle", "EDIT OUTPUT ASSIGNMENT"), el("p", "x32-rhelp", "On this X32 Compact the lab's outputs are fixed: XLR OUT 1-6 carry MIX 1-6, 7/8 MAIN L/R. Choosing them here isn't built yet."));
    return page;
  }
  const store = view.store;
  const outs = def.routing.outputs;
  ui.rout ||= { o: outs[0] };
  const st = store.state;
  const cur = st.routing[ui.rout.o];
  const cat = ui.rout.cat || categoryOf(cur);
  const sig = ui.rout.sig ?? cur;
  const ok = (src) => def.routing.sources.includes(src);
  const list = (title, items, onPick, cls = "") => {
    const col = el("div", `x32-rcol ${cls}`);
    col.appendChild(el("h6", "", title));
    const ul = el("ul", "x32-rlist");
    ul.setAttribute("role", "listbox");
    ul.setAttribute("aria-label", title);
    for (const it of items) {
      const li = el("li", `x32-ritem${it.on ? " on" : ""}${it.cur ? " cur" : ""}${it.ok === false ? " off" : ""}`, it.label);
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(!!it.on));
      li.tabIndex = 0;
      if (it.ok === false) li.title = "Listed as on the X32: not built in the lab";
      const pick = () => onPick(it);
      li.addEventListener("click", pick);
      li.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick()));
      ul.appendChild(li);
    }
    col.appendChild(ul);
    return col;
  };
  const redraw = () => view.render();
  const outName = (o) => `Output ${o.slice(3)}`;
  const setting = el("div", "x32-rsetting");
  setting.append(el("h6", "", "SETTING"), el("p", "", signalName(cur)), el("p", "", "Post Fader"));
  const assign = el("button", "x32-rconnect", "ASSIGN");
  assign.type = "button";
  const note = el("p", "x32-rnote");
  note.setAttribute("aria-live", "polite");
  assign.addEventListener("click", () => {
    const src = ui.rout.sig ?? cur;
    if (!ok(src)) {
      note.textContent = `${signalName(src)} isn't built in the lab yet: ${outName(ui.rout.o)} stays on ${signalName(cur)}.`;
      return;
    }
    store.setBus("routing", ui.rout.o, src);
    ui.rout = { o: ui.rout.o };
    redraw();
  });
  const catDef = CATEGORIES.find((c) => c.id === cat);
  page.append(
    el("h5", "x32-rtitle", "EDIT OUTPUT ASSIGNMENT"),
    row(
      "x32-rcols x32-outpatch",
      list("ANALOG OUTPUT", outs.map((o) => ({ id: o, label: outName(o), on: o === ui.rout.o })), (it) => {
        ui.rout = { o: it.id };
        redraw();
      }),
      setting,
      list("CATEGORY", CATEGORIES.map((c) => ({ id: c.id, label: c.label, on: c.id === categoryOf(cur), cur: c.id === cat, ok: c.signals.length > 0 })), (it) => {
        ui.rout = { ...ui.rout, cat: it.id, sig: it.id === "off" ? "off" : undefined };
        redraw();
      }),
      list("OUT SIGNAL", catDef.signals.map(([id, label]) => ({ id, label, on: id === cur, cur: id === sig, ok: ok(id) })), (it) => {
        ui.rout = { ...ui.rout, cat, sig: it.id };
        redraw();
      }),
      list("TAP", TAPS.map((t) => ({ id: t, label: t, on: t === "Post Fader", ok: t === "Post Fader" })), () => {}),
    ),
    assign,
    note,
    el("p", "x32-rhelp", `Pick an output, then its CATEGORY and OUT SIGNAL, and press ASSIGN. ${outName(ui.rout.o)} is the rear panel's XLR OUT ${ui.rout.o.slice(3)}, and AES50 A output ${ui.rout.o.slice(3)} (a stage box's OUT ${ui.rout.o.slice(3)}) when AES A sends Output ${Number(ui.rout.o.slice(3)) <= 8 ? "1-8" : "9-16"} there. The lab taps every output Post Fader.`),
  );
  return page;
}

export function routingPage(view, def, note = "Analog out: what each rear-panel XLR OUT carries.") {
  const store = view.store;
  const T = termsOf(def);
  const box = el("div", "x32-routing");
  box.appendChild(el("p", "dg-note", note));
  for (const o of def.routing.outputs) {
    const lab = el("label", "x32-route");
    lab.append(el("span", "", outName(def, o)));
    const sel = el("select");
    sel.setAttribute("aria-label", `${outName(def, o)} source`);
    for (const src of def.routing.sources) {
      const opt = el("option", "", SOURCE_NAMES(src, T));
      opt.value = src;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => store.setBus("routing", o, sel.value));
    view.bindings.push({ kind: "fn", run: (s) => sel.value !== s.routing[o] && (sel.value = s.routing[o]) });
    lab.appendChild(sel);
    box.appendChild(lab);
  }
  return box;
}

export function scenesPage(view, def) {
  const store = view.store;
  const box = el("div", "x32-scenes");
  box.appendChild(el("p", "dg-note", "RECALL loads a scene's settings (not the cables). STORE saves the current mix into the slot."));
  for (let n = 0; n < def.scenes; n++) {
    const line = el("div", "x32-scene");
    const name = el("span", "x32-scene-name");
    view.bindings.push({ kind: "fn", run: (s) => (name.textContent = `${String(n + 1).padStart(2, "0")} ${s.scenes[n]?.name || "—"}`) });
    const recall = el("button", "x32-layer", "RECALL");
    recall.type = "button";
    recall.setAttribute("aria-label", `Recall scene ${n + 1}`);
    recall.addEventListener("click", () => store.recallScene(n));
    view.bindings.push({ kind: "fn", run: (s) => (recall.disabled = !s.scenes[n]) });
    const save = el("button", "x32-layer", "STORE");
    save.type = "button";
    save.setAttribute("aria-label", `Store the current mix as scene ${n + 1}`);
    save.addEventListener("click", () => {
      const current = store.state.scenes[n]?.name;
      const typed = globalThis.prompt ? globalThis.prompt(`Name for scene ${n + 1}`, current || `Scene ${n + 1}`) : null;
      store.storeScene(n, typed || current || `Scene ${n + 1}`);
    });
    line.append(name, recall, save);
    box.appendChild(line);
  }
  return box;
}

function homeText(def, s, ui, view) {
  const lines = [];
  if (ui.sel.kind === "ch") {
    const c = s.channels[ui.sel.i];
    const name = view.dgHeads[ui.sel.i]?.querySelector(".strip-name")?.textContent || "—";
    lines.push(`<p class="x32-big">Ch ${esc(c.label)} · ${esc(name)}</p>`);
  } else lines.push(`<p class="x32-big">${esc(ui.sel.kind === "main" ? termsOf(def).main : ui.sel.kind === "mc" ? "M/C" : ui.sel.kind === "mtx" ? `MATRIX ${ui.sel.b.slice(3)}` : def.buses[ui.sel.b].label)} selected</p>`);
  if (ui.assign) {
    const what = ui.assign.type === "dca" ? `DCA ${ui.assign.n}` : `mute group ${ui.assign.n}`;
    lines.push(`<p class="x32-warn">Assigning ${what}: press SEL on the input channels to add or remove them. ${ui.assign.type === "dca" ? `Press DCA ${ui.assign.n}'s SEL again` : "Switch MUTE GRP off"} to finish.</p>`);
  } else if (ui.sof && ui.sel.kind === "bus") lines.push(`<p class="x32-warn">SENDS ON FADERS: the input faders are each channel's send to ${esc(def.buses[ui.sel.b].label)}.</p>`);
  else if (ui.sof && ui.sel.kind === "ch") lines.push(`<p class="x32-warn">SENDS ON FADERS: on a BUS layer, the bus faders are channel ${esc(s.channels[ui.sel.i].label)}'s sends to each MIX.</p>`);
  else if (ui.sof) lines.push(`<p class="x32-warn">SENDS ON FADERS: select a MIX (or a channel) to see its sends on the faders.</p>`);
  else lines.push(`<p>Input faders: channel levels into ${esc(termsOf(def).main)}.</p>`);
  const dcaUsed = Array.from({ length: def.dca || 0 }, (_, k) => k + 1).filter((k) => s.channels.some((c) => c.dca?.[`d${k}`]));
  if (dcaUsed.length) lines.push(`<p>${dcaUsed.map((k) => `DCA ${k}: ${s.channels.filter((c) => c.dca[`d${k}`]).map((c) => esc(c.label)).join(", ")}${s[`dca${k}`].mute ? " (muted)" : ""}`).join("<br>")}</p>`);
  const groups = Object.keys(s.mgrp || {}).filter((g) => s.channels.some((c) => c.mgrp?.[g]));
  if (groups.length) lines.push(`<p>${groups.map((g) => `Mute group ${g.slice(1)}: ${s.channels.filter((c) => c.mgrp[g]).map((c) => esc(c.label)).join(", ")}${s.mgrp[g] ? " (muted)" : ""}`).join("<br>")}</p>`);
  const subs = Object.keys(def.buses).filter((b) => s[b]?.lr);
  if (subs.length) lines.push(`<p>Subgroups into MAIN LR: ${subs.map((b) => esc(def.buses[b].label)).join(", ")}</p>`);
  return lines.join("");
}
