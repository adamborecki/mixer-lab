// Draws the Behringer X32 consoles (js/compact-defs.js `x32c` and `x32`) the
// way they are laid out (X32 / X32 COMPACT user manuals, chapter 1):
//   - the channel strip on the left edits the one selected strip (SEL):
//     a channel, a MIX bus, MAIN LR, a MATRIX or M/C;
//   - the input section: a bank of faders on layers (def.surface.inputLayers);
//   - the main display in the middle: HOME, and on the full X32 the ROUTING
//     and SCENES pages;
//   - the group section: 8 faders on layers (DCA, BUS 1-8, BUS 9-16, MATRIX),
//     the MAIN LR fader and the 6 mute group buttons;
//   - SENDS ON FADERS turns the input faders into sends to the selected MIX,
//     or the bus faders into the selected channel's sends.
// DCA and mute group assignment work as on the desk: put a DCA (its SEL) or a
// mute group (MUTE GRP, then the group) into assign mode, then press the
// channels' SEL buttons. The page state is the view's own (view.x32).

import { LAWS, levelLaw, matrixSources } from "../compact.js";
import { formatDb, formatPan } from "../levels.js";
import { button, buildSelPanel, el, fader, knob, meterBar, row } from "./mixer-digital-view.js";
import { compGraph, eqGraph } from "./viz.js";

const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

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
    el("h4", "x32-title", "INPUT CHANNELS"),
    layerBar(sf.inputLayers, ui.layer, (id) => {
      ui.layer = id;
      rerender();
    }, "Input fader layer"),
    inBank,
  );

  // ---------- main display ----------
  const display = el("section", "x32-display");
  display.setAttribute("aria-label", "Main display");
  const pages = [["home", "HOME"], ...(def.routing ? [["routing", "ROUTING"]] : []), ...(def.scenes ? [["scenes", "SCENES"]] : [])];
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
  if (ui.page === "routing" && def.routing) display.appendChild(routingPage(view, def));
  else if (ui.page === "scenes" && def.scenes) display.appendChild(scenesPage(view, def));
  else {
    // A selected channel's DYN and EQ, as the X32's HOME screen draws them.
    if (ui.sel.kind === "ch" && def.channels[ui.sel.i].peq) display.appendChild(row("x32-viz", compGraph(view, def, ui.sel.i, { theme: "x32", small: true }), eqGraph(view, def, ui.sel.i, { theme: "x32", small: true })));
    const lines = el("div", "x32-lines");
    lines.setAttribute("aria-live", "polite");
    view.bindings.push({ kind: "fn", run: (s) => (lines.innerHTML = homeText(def, s, ui, view)) });
    display.appendChild(lines);
  }
  const sof = el("button", `x32-sof${ui.sof ? " on" : ""}`, "SENDS ON FADERS");
  sof.type = "button";
  sof.setAttribute("aria-pressed", String(ui.sof));
  sof.addEventListener("click", () => {
    ui.sof = !ui.sof;
    rerender();
  });
  display.prepend(el("h4", "x32-title", "MAIN DISPLAY"));
  display.appendChild(sof);

  // ---------- group / bus section ----------
  const gLayer = sf.groupLayers.find((l) => l.id === ui.glayer) || sf.groupLayers[0];
  const grBank = el("div", "mixer-strips x32-bank");
  if (gLayer.id === "dca") for (let k = 1; k <= 8; k++) grBank.appendChild(dcaStrip(view, def, k, ui, rerender));
  else for (let k = 0; k < 8; k++) grBank.appendChild(gLayer.buses[k] ? groupStrip(view, def, gLayer.buses[k], ui, rerender) : emptyStrip());
  grBank.appendChild(mainStrip(view, def, ui, rerender));
  const groups = row(
    "x32-section x32-groups",
    el("h4", "x32-title", "GROUP / BUS CHANNELS"),
    layerBar(sf.groupLayers, gLayer.id, (id) => {
      ui.glayer = id;
      rerender();
    }, "Group fader layer"),
    grBank,
    muteGroupBar(view, def, ui, rerender),
  );

  surface.append(panel, row("x32-desk", inputs, display, groups));
  view.root.appendChild(surface);
}

function layerBar(layers, active, onPick, label) {
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

const emptyStrip = () => {
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

// ---------- strips ----------

function channelStrip(view, def, i, ui, rerender) {
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
  const mute = button(view, { label: "MUTE", tone: "mute", small: false, get: (s) => !ch(s).enabled, onPress: () => store.setChannel(i, "enabled", !ch(store.state).enabled), aria: (s) => `Channel ${n} MUTE: ${ch(s).enabled ? "off" : "on"}` });
  const solo = button(view, { label: "SOLO", tone: "pfl", get: (s) => ch(s).solo, onPress: () => store.setChannel(i, "solo", !ch(store.state).solo), aria: (s) => `Channel ${n} SOLO: ${ch(s).solo ? "on" : "off"}` });
  const tag = el("span", "x32-tag");
  view.bindings.push({
    kind: "fn",
    run: (s) => {
      strip.classList.toggle("is-muted", !ch(s).enabled);
      const dcas = Object.entries(ch(s).dca || {}).filter(([, on]) => on).map(([d]) => d.replace("d", "D"));
      const grps = Object.entries(ch(s).mgrp || {}).filter(([, on]) => on).map(([g]) => g.replace("g", "M"));
      tag.textContent = [ch(s).lr === false ? "no LR" : "", ...dcas, ...grps].filter(Boolean).join(" ");
    },
  });
  strip.append(head, sel, row("dg-extra", tag), row("dg-fader", control, meterBar(view, i)), row("dg-btns", mute, solo));
  return strip;
}

function fxReturnStrip(view, def, b) {
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
function groupStrip(view, def, id, ui, rerender) {
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
  const mute = button(view, { label: "MUTE", tone: "mute", small: false, get: (s) => !!s[id].mute, onPress: () => store.setBus(id, "mute", !store.state[id].mute), aria: (s) => `${label} MUTE: ${s[id].mute ? "on" : "off"}` });
  const out = el("p", "dg-note");
  view.bindings.push({ kind: "fn", run: (s) => (out.textContent = [outsOf(def, s, id), kind === "bus" && s[id].lr ? "→ LR" : ""].filter(Boolean).join(" · ")) });
  strip.append(el("div", "dg-master-name", label), sel, row("dg-extra", out), row("dg-fader", control), row("dg-btns", mute));
  return strip;
}

function dcaStrip(view, def, k, ui, rerender) {
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
  const mute = button(view, { label: "MUTE", tone: "mute", small: false, get: (s) => s[id].mute, onPress: () => store.setBus(id, "mute", !store.state[id].mute), aria: (s) => `DCA ${k} MUTE: ${s[id].mute ? "on, its channels are muted" : "off"}` });
  strip.append(el("div", "dg-master-name", `DCA ${k}`), sel, row("dg-extra", members), row("dg-fader", fader(view, { label: "", sheetLabel: `DCA ${k} fader`, format: lawFormat(LAWS.level), get: (s) => s[id].level, onInput: (v) => store.setBus(id, "level", v) })), row("dg-btns", mute));
  return strip;
}

function mainStrip(view, def, ui, rerender) {
  const store = view.store;
  const strip = el("section", `strip dg-strip dg-master x32-main${isSel(ui, "main") ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", "MAIN LR");
  const mute = button(view, { label: "MUTE", tone: "mute", small: false, get: (s) => !!s.main.mute, onPress: () => store.setBus("main", "mute", !store.state.main.mute), aria: (s) => `MAIN LR MUTE: ${s.main.mute ? "on, the house is silent" : "off"}` });
  const phones = knob(view, { label: "PHONES", sheetLabel: "Headphone level", defaultValue: 0.5, tone: "level", format: lawFormat(LAWS.master), onInput: (v) => store.setBus("cr", "level", v) }, (s) => s.cr.level);
  const sel = def.matrix
    ? selButton({
        lit: isSel(ui, "main"),
        label: "Select MAIN LR",
        onPress: () => {
          ui.sel = { kind: "main" };
          rerender();
        },
      })
    : el("div", "dg-extra");
  strip.append(
    el("div", "dg-master-name", "MAIN LR"),
    sel,
    row("dg-fader", fader(view, { label: "", sheetLabel: "MAIN LR fader", format: lawFormat(LAWS[def.main.law]), get: (s) => s.main.level, onInput: (v) => store.setBus("main", "level", v) }), row("dg-master-meters", meterBar(view, "L"), meterBar(view, "R"))),
    row("dg-btns", mute, phones),
  );
  return strip;
}

// MUTE GRP: off, the six buttons mute their groups; on, they pick a group to assign.
function muteGroupBar(view, def, ui, rerender) {
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

function busPanel(view, def, b) {
  const store = view.store;
  const bus = def.buses[b];
  const sections = [
    [
      "BUS MASTER",
      knob(view, { label: "LEVEL", sheetLabel: `${bus.label} master`, defaultValue: 0.75, tone: "level", size: undefined, format: lawFormat(LAWS[bus.master.law]), onInput: (v) => store.setBus(b, "level", v) }, (s) => s[b].level),
      button(view, { label: "MUTE", tone: "mute", get: (s) => !!s[b].mute, onPress: () => store.setBus(b, "mute", !store.state[b].mute), aria: (s) => `${bus.label} MUTE: ${s[b].mute ? "on" : "off"}` }),
    ],
  ];
  if (def.busToMain)
    sections.push([
      "MAIN BUS (subgroup)",
      button(view, { label: "MAIN LR", tone: "assign", get: (s) => !!s[b].lr, onPress: () => store.setBus(b, "lr", !store.state[b].lr), aria: (s) => `${bus.label} to MAIN LR: ${s[b].lr ? "on, it is a subgroup" : "off"}` }),
      knob(view, { label: "PAN", sheetLabel: `${bus.label} pan into MAIN LR`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: (v) => store.setBus(b, "pan", v) }, (s) => s[b].pan),
    ]);
  if (def.matrix) sections.push(["MATRIX SENDS", ...matrixSends(view, def, b, bus.label)]);
  const panel = panelShell(`${bus.label}`, ...sections);
  panel.appendChild(el("p", "dg-hint", `Press SENDS ON FADERS: the input faders become each channel's send to ${bus.label}. Each channel's PRE/POST for it is in that channel's strip.`));
  return panel;
}

function mainPanel(view, def) {
  return panelShell("MAIN LR", ["MATRIX SENDS (the main mix into each matrix)", ...matrixSends(view, def, "main", "MAIN LR")]);
}

function mcPanel(view, def) {
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

function matrixPanel(view, def, m) {
  const store = view.store;
  const k = m.slice(3);
  const label = (src) => (src === "main" ? "MAIN" : src === "mc" ? "M/C" : def.buses[src].label.replace("MIX ", "MIX"));
  return panelShell(
    `MATRIX ${k}`,
    [
      "MATRIX MASTER",
      knob(view, { label: "LEVEL", sheetLabel: `MATRIX ${k} master`, defaultValue: 0.75, tone: "level", size: undefined, format: lawFormat(LAWS.level), onInput: (v) => store.setBus(m, "level", v) }, (s) => s[m].level),
      button(view, { label: "MUTE", tone: "mute", get: (s) => s[m].mute, onPress: () => store.setBus(m, "mute", !store.state[m].mute), aria: (s) => `MATRIX ${k} MUTE: ${s[m].mute ? "on" : "off"}` }),
    ],
    ["SOURCES (what feeds this matrix)", ...matrixSources(def).map((src) => knob(view, { label: label(src), sheetLabel: `${label(src)} into MATRIX ${k}`, defaultValue: 0, tone: "aux1", format: lawFormat(LAWS.level), onInput: (v) => store.setBus(m, src, v) }, (s) => s[m][src]))],
  );
}

// ---------- display pages ----------

const SOURCE_NAMES = (src) => (src === "off" ? "OFF" : src === "main-l" ? "MAIN L" : src === "main-r" ? "MAIN R" : src === "mc" ? "M/C" : src.startsWith("mtx") ? `MATRIX ${src.slice(3)}` : `MIX ${src.slice(3)}`);

function routingPage(view, def) {
  const store = view.store;
  const box = el("div", "x32-routing");
  box.appendChild(el("p", "dg-note", "Analog out: what each rear-panel XLR OUT carries."));
  for (const o of def.routing.outputs) {
    const lab = el("label", "x32-route");
    lab.append(el("span", "", `XLR OUT ${o.slice(3)}`));
    const sel = el("select");
    sel.setAttribute("aria-label", `XLR OUT ${o.slice(3)} source`);
    for (const src of def.routing.sources) {
      const opt = el("option", "", SOURCE_NAMES(src));
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

function scenesPage(view, def) {
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
  } else lines.push(`<p class="x32-big">${esc(ui.sel.kind === "main" ? "MAIN LR" : ui.sel.kind === "mc" ? "M/C" : ui.sel.kind === "mtx" ? `MATRIX ${ui.sel.b.slice(3)}` : def.buses[ui.sel.b].label)} selected</p>`);
  if (ui.assign) {
    const what = ui.assign.type === "dca" ? `DCA ${ui.assign.n}` : `mute group ${ui.assign.n}`;
    lines.push(`<p class="x32-warn">Assigning ${what}: press SEL on the input channels to add or remove them. ${ui.assign.type === "dca" ? `Press DCA ${ui.assign.n}'s SEL again` : "Switch MUTE GRP off"} to finish.</p>`);
  } else if (ui.sof && ui.sel.kind === "bus") lines.push(`<p class="x32-warn">SENDS ON FADERS: the input faders are each channel's send to ${esc(def.buses[ui.sel.b].label)}.</p>`);
  else if (ui.sof && ui.sel.kind === "ch") lines.push(`<p class="x32-warn">SENDS ON FADERS: on a BUS layer, the bus faders are channel ${esc(s.channels[ui.sel.i].label)}'s sends to each MIX.</p>`);
  else if (ui.sof) lines.push(`<p class="x32-warn">SENDS ON FADERS: select a MIX (or a channel) to see its sends on the faders.</p>`);
  else lines.push(`<p>Input faders: channel levels into MAIN LR.</p>`);
  const dcaUsed = [1, 2, 3, 4, 5, 6, 7, 8].filter((k) => s.channels.some((c) => c.dca?.[`d${k}`]));
  if (dcaUsed.length) lines.push(`<p>${dcaUsed.map((k) => `DCA ${k}: ${s.channels.filter((c) => c.dca[`d${k}`]).map((c) => esc(c.label)).join(", ")}${s[`dca${k}`].mute ? " (muted)" : ""}`).join("<br>")}</p>`);
  const groups = Object.keys(s.mgrp).filter((g) => s.channels.some((c) => c.mgrp?.[g]));
  if (groups.length) lines.push(`<p>${groups.map((g) => `Mute group ${g.slice(1)}: ${s.channels.filter((c) => c.mgrp[g]).map((c) => esc(c.label)).join(", ")}${s.mgrp[g] ? " (muted)" : ""}`).join("<br>")}</p>`);
  const subs = Object.keys(def.buses).filter((b) => s[b]?.lr);
  if (subs.length) lines.push(`<p>Subgroups into MAIN LR: ${subs.map((b) => esc(def.buses[b].label)).join(", ")}</p>`);
  return lines.join("");
}
