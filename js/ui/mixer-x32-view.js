// Draws the Behringer X32 Compact (js/compact-defs.js `x32c`) the way the
// console is laid out (X32 COMPACT user manual, chapter 1):
//   - the channel strip on the left edits the one selected channel (SEL);
//   - the input section: 8 faders, switched between layers (CH 1-8, CH 9-16, AUX/FX);
//   - the main display in the middle says what the faders are doing;
//   - the group section: 8 faders, switched between DCA 1-8 and BUS 1-8
//     (mix bus masters), plus the MAIN LR fader and the 6 mute group buttons;
//   - SENDS ON FADERS turns the input faders into sends to the selected MIX,
//     or the bus faders into the selected channel's sends.
// DCA and mute group assignment work as on the desk: put a DCA (its SEL) or a
// mute group (MUTE GRP, then the group) into assign mode, then press the
// channels' SEL buttons. The page state is the view's own (view.x32).

import { LAWS, levelLaw } from "../compact.js";
import { formatDb } from "../levels.js";
import { button, buildSelPanel, el, fader, knob, meterBar, row } from "./mixer-digital-view.js";

const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });

const INPUT_LAYERS = [
  { id: "ch1", label: "CH 1-8" },
  { id: "ch9", label: "CH 9-16" },
  { id: "aux", label: "AUX / FX" },
];
const GROUP_LAYERS = [
  { id: "dca", label: "DCA 1-8" },
  { id: "bus", label: "BUS 1-8" },
];
const MIXES = ["mix1", "mix2", "mix3", "mix4", "mix5", "mix6"];

export function renderX32(view, def) {
  if (!view.x32 || view.x32.id !== def.id) view.x32 = { id: def.id, layer: "ch1", glayer: "bus", sel: { kind: "ch", i: 6 }, sof: false, assign: null, mgrpEdit: false };
  const ui = view.x32;
  const rerender = () => view.render();
  view.def = def;
  view.dgMeters = [];
  view.dgHeads = [];
  view.dgGr = null;
  view.paths = [];
  view.pathKey = "";

  const surface = el("div", "mixer-surface x32-surface");
  const selCh = ui.sel.kind === "ch" ? ui.sel.i : null;
  const selBus = ui.sel.kind === "bus" ? ui.sel.b : null;

  // ---------- channel strip (the selected channel) ----------
  const stripPanel =
    selCh !== null
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
      : busPanel(view, def, selBus);
  stripPanel.classList.add("x32-chstrip");

  // ---------- input section ----------
  const inLayers = layerBar(INPUT_LAYERS, ui.layer, (id) => {
    ui.layer = id;
    rerender();
  }, "Input fader layer");
  const inBank = el("div", "mixer-strips x32-bank");
  inBank.setAttribute("role", "group");
  for (const slot of inputSlots(def, ui.layer)) inBank.appendChild(slot === null ? emptyStrip() : slot.fx ? fxReturnStrip(view, def, slot.fx) : channelStrip(view, def, slot.i, ui, rerender));
  const inputs = row("x32-section x32-inputs", el("h4", "x32-title", "INPUT CHANNELS"), inLayers, inBank);

  // ---------- main display ----------
  const display = el("section", "x32-display");
  display.setAttribute("aria-label", "Main display");
  display.setAttribute("aria-live", "polite");
  const sof = el("button", `x32-sof${ui.sof ? " on" : ""}`, "SENDS ON FADERS");
  sof.type = "button";
  sof.setAttribute("aria-pressed", String(ui.sof));
  sof.addEventListener("click", () => {
    ui.sof = !ui.sof;
    rerender();
  });
  const lines = el("div", "x32-lines");
  view.bindings.push({ kind: "fn", run: (s) => (lines.innerHTML = displayText(def, s, ui, view)) });
  display.append(el("h4", "x32-title", "MAIN DISPLAY"), lines, sof);

  // ---------- group / bus section ----------
  const grLayers = layerBar(GROUP_LAYERS, ui.glayer, (id) => {
    ui.glayer = id;
    rerender();
  }, "Group fader layer");
  const grBank = el("div", "mixer-strips x32-bank");
  if (ui.glayer === "dca") for (let k = 1; k <= 8; k++) grBank.appendChild(dcaStrip(view, def, k, ui, rerender));
  else for (let k = 0; k < 8; k++) grBank.appendChild(MIXES[k] ? busStrip(view, def, MIXES[k], ui, rerender) : emptyStrip());
  grBank.appendChild(mainStrip(view, def));
  const groups = row("x32-section x32-groups", el("h4", "x32-title", "GROUP / BUS CHANNELS"), grLayers, grBank, muteGroupBar(view, def, ui, rerender));

  surface.append(stripPanel, row("x32-desk", inputs, display, groups));
  view.root.appendChild(surface);
}

// Which strips an input layer shows: channel indexes, FX returns, or empty slots.
function inputSlots(def, layer) {
  if (layer === "ch1") return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ i }));
  if (layer === "ch9") return [8, 9, 10, 11, 12, 13, 14, 15].map((i) => ({ i }));
  const fx = Object.entries(def.buses).filter(([, b]) => b.fx).map(([b]) => ({ fx: b }));
  const slots = [{ i: 16 }, ...fx];
  while (slots.length < 8) slots.push(null);
  return slots;
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

// ---------- strips ----------

function channelStrip(view, def, i, ui, rerender) {
  const store = view.store;
  const c = def.channels[i];
  const n = c.label;
  const ch = (s) => s.channels[i];
  const strip = el("section", `strip dg-strip x32-strip${ui.sel.kind === "ch" && ui.sel.i === i ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", `Channel ${n}`);
  const head = el("button", "strip-head");
  head.type = "button";
  head.addEventListener("click", () => view.onPatchChannel(i));
  view.bindings.push({ kind: "head", el: head, index: i });
  view.dgHeads[i] = head;

  // SEL: select the channel, or (in assign mode) add it to / take it out of the DCA or mute group.
  const a = ui.assign;
  const key = a ? `${a.type}.${a.type === "dca" ? `d${a.n}` : `g${a.n}`}` : null;
  const member = (s) => (a ? !!(a.type === "dca" ? ch(s).dca : ch(s).mgrp)?.[`${a.type === "dca" ? "d" : "g"}${a.n}`] : false);
  const sel = selButton({
    lit: a ? member(store.state) : ui.sel.kind === "ch" && ui.sel.i === i,
    label: a ? `Channel ${n}: ${member(store.state) ? "take out of" : "add to"} ${a.type === "dca" ? "DCA" : "mute group"} ${a.n}` : `Select channel ${n}`,
    onPress: () => {
      if (a) store.setChannel(i, key, !member(store.state));
      else ui.sel = { kind: "ch", i };
      rerender();
    },
  });
  if (a) sel.classList.add("assigning");

  // The fader: the channel level, or (SENDS ON FADERS with a MIX selected) its send to that MIX.
  const sofBus = ui.sof && ui.sel.kind === "bus" ? ui.sel.b : null;
  const law = levelLaw(def);
  const control = sofBus
    ? fader(view, { label: "", sheetLabel: `Ch ${n} send to ${def.buses[sofBus].label}`, defaultValue: 0, tone: "aux1", format: lawFormat(LAWS[def.sends[sofBus].law]), get: (s) => ch(s).sends[sofBus], onInput: (v) => store.setChannel(i, `sends.${sofBus}`, v) })
    : fader(view, { label: "", sheetLabel: `Ch ${n} fader`, format: lawFormat(law), get: (s) => ch(s).level, onInput: (v) => store.setChannel(i, "level", v) });
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
  strip.setAttribute("aria-label", `${bus.master.label}`);
  strip.append(
    el("div", "dg-master-name", bus.master.label),
    el("p", "dg-note", bus.fx.name),
    row("dg-fader", fader(view, { label: "", sheetLabel: `${bus.master.label} fader (how much ${bus.fx.name.toLowerCase()} in the MAIN)`, format: lawFormat(LAWS[bus.master.law]), get: (s) => s[b].level, onInput: (v) => store.setBus(b, "level", v) })),
  );
  return strip;
}

function dcaStrip(view, def, k, ui, rerender) {
  const store = view.store;
  const id = `dca${k}`;
  const strip = el("section", `strip dg-strip x32-strip x32-dca${ui.assign?.type === "dca" && ui.assign.n === k ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", `DCA ${k}`);
  const name = el("div", "dg-master-name", `DCA ${k}`);
  const members = el("p", "dg-note");
  view.bindings.push({ kind: "fn", run: (s) => (members.textContent = s.channels.filter((c) => c.dca?.[`d${k}`]).map((c) => c.label).join(" ") || "empty") });
  // A DCA's SEL can't select it (the manual): here it opens and closes its assignment.
  const assigning = ui.assign?.type === "dca" && ui.assign.n === k;
  const sel = selButton({
    lit: assigning,
    label: assigning ? `Finish assigning DCA ${k}` : `Assign channels to DCA ${k}`,
    onPress: () => {
      ui.assign = assigning ? null : { type: "dca", n: k };
      rerender();
    },
  });
  const mute = button(view, { label: "MUTE", tone: "mute", small: false, get: (s) => s[id].mute, onPress: () => store.setBus(id, "mute", !store.state[id].mute), aria: (s) => `DCA ${k} MUTE: ${s[id].mute ? "on, its channels are muted" : "off"}` });
  strip.append(name, sel, row("dg-extra", members), row("dg-fader", fader(view, { label: "", sheetLabel: `DCA ${k} fader`, format: lawFormat(LAWS.level), get: (s) => s[id].level, onInput: (v) => store.setBus(id, "level", v) })), row("dg-btns", mute));
  return strip;
}

function busStrip(view, def, b, ui, rerender) {
  const store = view.store;
  const bus = def.buses[b];
  const selected = ui.sel.kind === "bus" && ui.sel.b === b;
  const strip = el("section", `strip dg-strip x32-strip${selected ? " is-sel" : ""}`);
  strip.setAttribute("aria-label", `${bus.label} master`);
  const sel = selButton({
    lit: selected,
    label: `Select ${bus.label}`,
    onPress: () => {
      ui.sel = { kind: "bus", b };
      ui.assign = null;
      rerender();
    },
  });
  // With a channel selected and SENDS ON FADERS on, this fader is that channel's send to the MIX.
  const sofCh = ui.sof && ui.sel.kind === "ch" && def.channels[ui.sel.i].sends?.includes(b) ? ui.sel.i : null;
  const control =
    sofCh !== null
      ? fader(view, { label: "", sheetLabel: `Ch ${def.channels[sofCh].label} send to ${bus.label}`, defaultValue: 0, tone: "aux1", format: lawFormat(LAWS[def.sends[b].law]), get: (s) => s.channels[sofCh].sends[b], onInput: (v) => store.setChannel(sofCh, `sends.${b}`, v) })
      : fader(view, { label: "", sheetLabel: `${bus.label} master fader`, format: lawFormat(LAWS[bus.master.law]), get: (s) => s[b].level, onInput: (v) => store.setBus(b, "level", v) });
  const mute = button(view, { label: "MUTE", tone: "mute", small: false, get: (s) => !!s[b].mute, onPress: () => store.setBus(b, "mute", !store.state[b].mute), aria: (s) => `${bus.label} MUTE: ${s[b].mute ? "on" : "off"}` });
  const out = el("p", "dg-note", `XLR OUT ${b.slice(3)}`);
  strip.append(el("div", "dg-master-name", bus.label), sel, row("dg-extra", out), row("dg-fader", control), row("dg-btns", mute));
  return strip;
}

function mainStrip(view, def) {
  const store = view.store;
  const strip = el("section", "strip dg-strip dg-master x32-main");
  strip.setAttribute("aria-label", "MAIN LR");
  const mute = button(view, { label: "MUTE", tone: "mute", small: false, get: (s) => !!s.main.mute, onPress: () => store.setBus("main", "mute", !store.state.main.mute), aria: (s) => `MAIN LR MUTE: ${s.main.mute ? "on, the house is silent" : "off"}` });
  const phones = knob(view, { label: "PHONES", sheetLabel: "Headphone level", defaultValue: 0.5, tone: "level", format: lawFormat(LAWS.master), onInput: (v) => store.setBus("cr", "level", v) }, (s) => s.cr.level);
  strip.append(
    el("div", "dg-master-name", "MAIN LR"),
    el("div", "dg-extra"),
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

// The left-hand channel strip when a MIX is selected.
function busPanel(view, def, b) {
  const store = view.store;
  const bus = def.buses[b];
  const panel = el("section", "dg-panel");
  panel.setAttribute("aria-label", `Selected ${bus.label}`);
  panel.appendChild(row("dg-panel-head", el("h4", "dg-panel-title", `${bus.label} · XLR OUT ${b.slice(3)}`)));
  const sec = el("div", "dg-sec");
  sec.appendChild(el("h5", "", "BUS MASTER"));
  sec.appendChild(
    row(
      "dg-sec-body",
      knob(view, { label: "LEVEL", sheetLabel: `${bus.label} master`, defaultValue: 0.75, tone: "level", size: undefined, format: lawFormat(LAWS[bus.master.law]), onInput: (v) => store.setBus(b, "level", v) }, (s) => s[b].level),
      button(view, { label: "MUTE", tone: "mute", get: (s) => !!s[b].mute, onPress: () => store.setBus(b, "mute", !store.state[b].mute), aria: (s) => `${bus.label} MUTE: ${s[b].mute ? "on" : "off"}` }),
    ),
  );
  panel.appendChild(sec);
  panel.appendChild(el("p", "dg-hint", `Press SENDS ON FADERS: the input faders become each channel's send to ${bus.label}. Each channel's PRE/POST for ${bus.label} is in its own strip (SEL the channel).`));
  return panel;
}

function displayText(def, s, ui, view) {
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const lines = [];
  if (ui.sel.kind === "ch") {
    const c = s.channels[ui.sel.i];
    const name = view.dgHeads[ui.sel.i]?.querySelector(".strip-name")?.textContent || "—";
    lines.push(`<p class="x32-big">Ch ${esc(c.label)} · ${esc(name)}</p>`);
  } else lines.push(`<p class="x32-big">${esc(def.buses[ui.sel.b].label)} selected</p>`);
  if (ui.assign) {
    const what = ui.assign.type === "dca" ? `DCA ${ui.assign.n}` : `mute group ${ui.assign.n}`;
    lines.push(`<p class="x32-warn">Assigning ${what}: press SEL on the input channels to add or remove them. ${ui.assign.type === "dca" ? `Press DCA ${ui.assign.n}'s SEL again` : "Switch MUTE GRP off"} to finish.</p>`);
  } else if (ui.sof && ui.sel.kind === "bus") lines.push(`<p class="x32-warn">SENDS ON FADERS: the input faders are each channel's send to ${esc(def.buses[ui.sel.b].label)}.</p>`);
  else if (ui.sof && ui.sel.kind === "ch") lines.push(`<p class="x32-warn">SENDS ON FADERS: on the BUS 1-8 layer, the bus faders are channel ${esc(s.channels[ui.sel.i].label)}'s sends to each MIX.</p>`);
  else if (ui.sof) lines.push(`<p class="x32-warn">SENDS ON FADERS: select a MIX (or a channel) to see its sends on the faders.</p>`);
  else lines.push(`<p>Input faders: channel levels into MAIN LR.</p>`);
  const dcaUsed = [1, 2, 3, 4, 5, 6, 7, 8].filter((k) => s.channels.some((c) => c.dca?.[`d${k}`]));
  if (dcaUsed.length) lines.push(`<p>${dcaUsed.map((k) => `DCA ${k}: ${s.channels.filter((c) => c.dca[`d${k}`]).map((c) => esc(c.label)).join(", ")}${s[`dca${k}`].mute ? " (muted)" : ""}`).join("<br>")}</p>`);
  const groups = Object.keys(s.mgrp).filter((g) => s.channels.some((c) => c.mgrp?.[g]));
  if (groups.length) lines.push(`<p>${groups.map((g) => `Mute group ${g.slice(1)}: ${s.channels.filter((c) => c.mgrp[g]).map((c) => esc(c.label)).join(", ")}${s.mgrp[g] ? " (muted)" : ""}`).join("<br>")}</p>`);
  return lines.join("");
}
