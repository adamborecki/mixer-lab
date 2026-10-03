// Draws the Yamaha DM2000 (js/compact-defs.js `dm2000`) the way the console
// is laid out (DM2000 V2 Quick Start Guide):
//   - the analog INPUT section along the top: GAIN, PAD and +48V for inputs 1–24;
//   - the SELECTED CHANNEL section: every knob for one channel at once (EQ with
//     EQ ON, COMP with COMP ON, PAN, AUX SEND with BANK, ROUTING keys 1–8 and STEREO);
//   - the LCD with DISPLAY ACCESS keys: EQ, DYNAMICS, AUX SEND, ROUTING (BUS TO
//     ST), MATRIX, OUTPUT PATCH, GROUP (fader and mute groups), SCENE;
//   - 24 channel strips, each with an ENCODER (PAN or an AUX send: ENCODER
//     MODE), SEL, SOLO, ON (lit = on) and a fader (level, or an AUX send in
//     FADER MODE AUX), on LAYERs 1-24, 73-96 (effects returns, 2TR IN) and MASTER;
//   - the STEREO fader.
// Fader groups and mute groups work the Yamaha way: no masters; moving one
// member's fader moves the others, pressing one member's ON key switches the
// others. That linking lives here, on the surface: the model just stores
// each channel's groups (ch.fgrp, ch.mgrp).
// Layer, modes, page, bank and selection are the view's own (view.dm).

import { DYN, LAWS, PEQ_BANDS, PEQ_Q, compIsOn, eqIsOn, levelLaw } from "../compact.js";
import { formatDb, formatPan } from "../levels.js";
import { button, el, fader, knob, meterBar, procOn, row } from "./mixer-digital-view.js";
import { matrixPanel, routingPage, scenesPage } from "./mixer-x32-view.js";
import { compGraph, eqGraph } from "./viz.js";

const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });
const hz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${Math.round(f)}`);
const logPos = (f, lo, hi) => Math.log(f / lo) / Math.log(hi / lo);
const logFreq = (p, lo, hi) => lo * Math.pow(hi / lo, p);
const AUXES = ["aux1", "aux2", "aux3", "aux4", "aux5", "aux6", "aux7", "aux8"];
const BUSES = ["bus1", "bus2", "bus3", "bus4", "bus5", "bus6", "bus7", "bus8"];
const PAGES = [
  ["eq", "EQUALIZER"],
  ["dyn", "DYNAMICS"],
  ["aux", "AUX SEND"],
  ["routing", "ROUTING"],
  ["matrix", "MATRIX"],
  ["patch", "OUTPUT PATCH"],
  ["group", "GROUP"],
  ["scene", "SCENE"],
];
// Mute groups are lettered I–P on the DM2000 (stored g1–g8); fader groups A–H.
const MUTE_LETTER = (g) => "IJKLMNOP"[Number(g.slice(1)) - 1];

export function renderDM2000(view, def) {
  if (!view.dm || view.dm.id !== def.id) view.dm = { id: def.id, layer: "1-24", emode: "pan", fmode: "fader", aux: "aux1", sel: 6, page: "eq", bank: 0, mtx: "mtx1", assign: null };
  const ui = view.dm;
  const rerender = () => view.render();
  view.def = def;
  view.dgMeters = [];
  view.dgHeads = [];
  view.dgGr = null;
  view.paths = [];
  view.pathKey = "";
  const surface = el("div", "mixer-surface y96-surface dm-surface");
  // The fader bank first, so the channel names exist for the screen.
  const bank = faderBank(view, def, ui, rerender);
  surface.append(
    inputSection(view, def),
    row("y96-mid dm-mid", selectedChannel(view, def, ui, rerender), display(view, def, ui, rerender)),
    controlKeys(ui, rerender),
    row("y96-bottom", bank, stereoSection(view, def)),
  );
  view.root.appendChild(surface);
}

// ---------- the linked groups ----------

const sharing = (s, i, key) => {
  const mine = Object.entries(s.channels[i][key] || {}).filter(([, on]) => on).map(([g]) => g);
  return s.channels.map((c, j) => j).filter((j) => j !== i && mine.some((g) => s.channels[j][key]?.[g]));
};

// ON: every channel sharing a mute group with i follows.
function setOn(view, i, on) {
  const st = view.store;
  for (const j of [i, ...sharing(st.state, i, "mgrp")]) st.setChannel(j, "enabled", on);
}

// Fader: every channel sharing a fader group with i moves by the same amount.
function setLevel(view, i, v) {
  const st = view.store;
  const d = v - st.state.channels[i].level;
  st.setChannel(i, "level", v);
  for (const j of sharing(st.state, i, "fgrp")) st.setChannel(j, "level", Math.min(1, Math.max(0, st.state.channels[j].level + d)));
}

// ---------- analog INPUT section ----------

function inputSection(view, def) {
  const store = view.store;
  const box = el("section", "y96-box y96-inputs dm-inputs");
  box.setAttribute("aria-label", "Analog inputs 1–24: GAIN, PAD and +48V");
  box.appendChild(el("h4", "x32-title", "INPUT 1–24"));
  const strips = el("div", "y96-gains");
  def.channels.forEach((c, i) => {
    if (c.kind === "stereo") return;
    const s = el("div", "y96-gain");
    s.append(
      knob(view, { label: c.label, sheetLabel: `Input ${c.label} GAIN`, min: c.gain.min, max: c.gain.max, step: 0.5, defaultValue: c.gain.min, tone: "gain", format: (v) => `${Math.round(v)} dB${store.state.channels[i].pad ? " −20" : ""}`, onInput: (v) => store.setChannel(i, "gainDb", v) }, (st) => st.channels[i].gainDb),
      button(view, { label: "PAD", tone: "lowcut", get: (st) => !!st.channels[i].pad, onPress: () => store.setChannel(i, "pad", !store.state.channels[i].pad), aria: (st) => `Input ${c.label} 20 dB PAD: ${st.channels[i].pad ? "on" : "off"}` }),
      button(view, { label: "+48V", tone: "phantom", get: (st) => !!st.channels[i].phantom, onPress: () => store.setChannel(i, "phantom", !store.state.channels[i].phantom), aria: (st) => `Input ${c.label} +48V: ${st.channels[i].phantom ? "on" : "off"}` }),
    );
    strips.appendChild(s);
  });
  box.appendChild(strips);
  return box;
}

// ---------- SELECTED CHANNEL ----------

function selectedChannel(view, def, ui, rerender) {
  const store = view.store;
  const i = ui.sel;
  const c = def.channels[i];
  const ch = (s) => s.channels[i];
  const name = `Ch ${c.label}`;
  const box = el("section", "y96-box dm-selch");
  box.setAttribute("aria-label", `SELECTED CHANNEL: channel ${c.label}`);
  const title = el("h4", "x32-title");
  view.bindings.push({ kind: "fn", run: () => (title.textContent = `SELECTED CHANNEL · CH ${c.label} ${view.dgHeads[i]?.querySelector(".strip-name")?.textContent || ""}`) });
  box.appendChild(title);
  const block = (label, ...els) => {
    const b = el("div", "dm-block");
    b.append(el("h5", "", label), row("dm-block-body", ...els.filter(Boolean)));
    return b;
  };

  // EQUALIZER: four bands side by side, HIGH on the left as on the panel.
  const eqBands = PEQ_BANDS.slice()
    .reverse()
    .map((b) =>
      row(
        "dm-band",
        el("span", "dg-band-name", b.label),
        b.type === "peaking" ? knob(view, { label: "Q", sheetLabel: `${name} ${b.label} Q`, min: PEQ_Q.min, max: PEQ_Q.max, step: 0.05, defaultValue: 0.7, tone: "eq", format: (v) => v.toFixed(1), onInput: (v) => store.setChannel(i, `peq.${b.id}.q`, v) }, (s) => ch(s).peq[b.id].q) : el("span", "dg-q-blank", b.type === "lowshelf" ? "L.SHELF" : "H.SHELF"),
        knob(view, { label: "F", sheetLabel: `${name} ${b.label} frequency`, defaultValue: logPos(b.freq, b.min, b.max), tone: "eq", format: (v) => hz(logFreq(v, b.min, b.max)), onInput: (v) => store.setChannel(i, `peq.${b.id}.freq`, logFreq(v, b.min, b.max)) }, (s) => logPos(ch(s).peq[b.id].freq, b.min, b.max)),
        knob(view, { label: "G", sheetLabel: `${name} ${b.label} gain`, min: -15, max: 15, step: 0.5, defaultValue: 0, bipolar: true, tone: "eq", format: (v) => `${v > 0 ? "+" : ""}${v}`, onInput: (v) => store.setChannel(i, `peq.${b.id}.gain`, v) }, (s) => ch(s).peq[b.id].gain),
      ),
    );
  box.appendChild(block("EQUALIZER", procOn(view, def, i, "eqOn", "EQ ON", "EQ"), ...eqBands));

  box.appendChild(
    block(
      "DYNAMICS",
      procOn(view, def, i, "compOn", "COMP ON", "compressor"),
      knob(view, { label: "THRESH", sheetLabel: `${name} compressor threshold`, min: DYN.threshold[0], max: DYN.threshold[1], step: 0.5, defaultValue: 0, tone: "gain", format: (v) => `${v} dB`, onInput: (v) => store.setChannel(i, "dyn.threshold", v) }, (s) => ch(s).dyn.threshold),
      knob(view, { label: "RATIO", sheetLabel: `${name} compressor ratio`, min: DYN.ratio[0], max: DYN.ratio[1], step: 0.1, defaultValue: 1, tone: "gain", format: (v) => `${v.toFixed(1)}:1`, onInput: (v) => store.setChannel(i, "dyn.ratio", v) }, (s) => ch(s).dyn.ratio),
      knob(view, { label: "GAIN", sheetLabel: `${name} compressor gain`, min: DYN.makeup[0], max: DYN.makeup[1], step: 0.5, defaultValue: 0, tone: "gain", format: (v) => `+${v} dB`, onInput: (v) => store.setChannel(i, "dyn.makeup", v) }, (s) => ch(s).dyn.makeup),
    ),
  );

  // AUX SEND: four encoders, BANK picks AUX 1–4 or 5–8.
  const bankKeys = ["1–4", "5–8"].map((label, k) => {
    const b = el("button", `x32-layer${ui.bank === k ? " on" : ""}`, label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(ui.bank === k));
    b.setAttribute("aria-label", `AUX SEND bank ${label}`);
    b.addEventListener("click", () => ((ui.bank = k), rerender()));
    return b;
  });
  const sends = AUXES.slice(ui.bank * 4, ui.bank * 4 + 4).map((sid) =>
    row(
      "dg-send",
      knob(view, { label: def.sends[sid].label, sheetLabel: `${name} ${def.sends[sid].label} send`, defaultValue: 0, tone: def.buses[sid].fx ? "eq" : "aux1", format: lawFormat(LAWS.level), onInput: (v) => store.setChannel(i, `sends.${sid}`, v) }, (s) => ch(s).sends[sid]),
      button(view, { label: "PRE", tone: "pfl", get: (s) => !!ch(s).pres[sid], onPress: () => store.setChannel(i, `pres.${sid}`, !ch(store.state).pres[sid]), aria: (s) => `${name} ${def.sends[sid].label}: ${ch(s).pres[sid] ? "PRE" : "POST"}` }),
    ),
  );
  box.appendChild(block("AUX SEND", row("dm-bank", el("span", "dg-note", "BANK"), ...bankKeys), ...sends));

  // PAN and ROUTING: the channel to STEREO and/or any of BUS 1–8.
  const routeKeys = BUSES.map((b, k) => button(view, { label: String(k + 1), tone: "assign", get: (s) => ch(s).sends[b] >= 0.5, onPress: () => store.setChannel(i, `sends.${b}`, ch(store.state).sends[b] >= 0.5 ? 0 : 1), aria: (s) => `${name} to BUS ${k + 1}: ${ch(s).sends[b] >= 0.5 ? "on" : "off"}` }));
  box.appendChild(
    block(
      "PAN · ROUTING",
      knob(view, { label: c.kind === "stereo" ? "BAL" : "PAN", sheetLabel: `${name} pan`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: (v) => store.setChannel(i, "pan", v) }, (s) => ch(s).pan),
      c.polarity ? button(view, { label: "Ø", get: (s) => !!ch(s).polarity, onPress: () => store.setChannel(i, "polarity", !ch(store.state).polarity), aria: (s) => `${name} phase: ${ch(s).polarity ? "reversed" : "normal"}` }) : null,
      button(view, { label: "STEREO", tone: "assign", get: (s) => ch(s).lr !== false, onPress: () => store.setChannel(i, "lr", ch(store.state).lr === false), aria: (s) => `${name} to STEREO: ${ch(s).lr !== false ? "on" : "off"}` }),
      row("dm-route", ...routeKeys),
    ),
  );
  return box;
}

// ---------- the display ----------

function display(view, def, ui, rerender) {
  const store = view.store;
  const i = ui.sel;
  const c = def.channels[i];
  const ch = (s) => s.channels[i];
  const box = el("section", "y96-lcd dm-lcd");
  box.setAttribute("aria-label", "Display");
  const title = el("p", "y96-lcd-title");
  view.bindings.push({ kind: "fn", run: () => (title.textContent = `${PAGES.find((p) => p[0] === ui.page)[1]} · CH${c.label} ${view.dgHeads[i]?.querySelector(".strip-name")?.textContent || ""}`) });
  box.appendChild(title);
  const body = el("div", "y96-lcd-body");
  if (ui.page === "eq") {
    const t = el("div", "x32-lines");
    view.bindings.push({ kind: "fn", run: (s) => (t.innerHTML = `<p>${eqIsOn(ch(s)) ? "EQ ON" : "EQ OFF: the knobs move, nothing changes"}</p>`) });
    body.append(row("y96-row", procOn(view, def, i, "eqOn", "EQ ON", "EQ")), eqGraph(view, def, i, { theme: "dm" }), t);
  } else if (ui.page === "dyn") {
    const t = el("div", "x32-lines");
    view.bindings.push({ kind: "fn", run: (s) => (t.innerHTML = `<p>COMP ${compIsOn(ch(s)) ? "ON" : "OFF"} · THRESHOLD ${ch(s).dyn.threshold} dB · RATIO ${ch(s).dyn.ratio.toFixed(1)}:1 · GAIN +${ch(s).dyn.makeup} dB</p>`) });
    body.append(row("y96-row", procOn(view, def, i, "compOn", "COMP ON", "compressor"), compGraph(view, def, i, { theme: "dm" })), t);
  } else if (ui.page === "aux") {
    body.appendChild(
      row(
        "y96-row y96-aux",
        ...AUXES.map((sid) =>
          row(
            "dg-send",
            knob(view, { label: def.sends[sid].label, sheetLabel: `Ch ${c.label} ${def.sends[sid].label} send`, defaultValue: 0, tone: def.buses[sid].fx ? "eq" : "aux1", format: lawFormat(LAWS.level), onInput: (v) => store.setChannel(i, `sends.${sid}`, v) }, (s) => ch(s).sends[sid]),
            button(view, { label: "PRE", tone: "pfl", get: (s) => !!ch(s).pres[sid], onPress: () => store.setChannel(i, `pres.${sid}`, !ch(store.state).pres[sid]), aria: (s) => `Ch ${c.label} ${def.sends[sid].label}: ${ch(s).pres[sid] ? "PRE" : "POST"}` }),
          ),
        ),
      ),
    );
  } else if (ui.page === "routing") {
    body.appendChild(el("p", "dg-note", "BUS TO ST: a bus reaches the house only when it's routed to the STEREO bus."));
    for (const b of BUSES) {
      const members = el("span", "dg-note");
      view.bindings.push({ kind: "fn", run: (s) => (members.textContent = s.channels.filter((x) => x.sends?.[b] >= 0.5).map((x) => x.label).join(" ") || "—") });
      body.appendChild(
        row(
          "dm-bus2st",
          el("span", "x32-scene-name", def.buses[b].label),
          button(view, { label: "TO ST", tone: "assign", get: (s) => !!s[b].lr, onPress: () => store.setBus(b, "lr", !store.state[b].lr), aria: (s) => `${def.buses[b].label} to STEREO: ${s[b].lr ? "on" : "off"}` }),
          knob(view, { label: "PAN", sheetLabel: `${def.buses[b].label} pan into STEREO`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: (v) => store.setBus(b, "pan", v) }, (s) => s[b].pan),
          members,
        ),
      );
    }
  } else if (ui.page === "matrix") {
    const keys = ["mtx1", "mtx2", "mtx3", "mtx4"].map((m, k) => {
      const b = el("button", `x32-layer${ui.mtx === m ? " on" : ""}`, `MATRIX ${k + 1}`);
      b.type = "button";
      b.addEventListener("click", () => ((ui.mtx = m), rerender()));
      return b;
    });
    body.append(row("y96-row", ...keys), matrixPanel(view, def, ui.mtx));
  } else if (ui.page === "patch") {
    body.appendChild(routingPage(view, def, "OUTPUT PATCH: STEREO OUT has its own jacks; OMNI OUT 1–8 carry whatever is patched here."));
  } else if (ui.page === "group") {
    body.appendChild(groupPage(view, def, ui, rerender));
  } else {
    body.appendChild(scenesPage(view, def));
  }
  box.appendChild(body);
  return box;
}

// FADER GROUP A–H and MUTE GROUP I–P: pick a group, then press SEL on its channels.
function groupPage(view, def, ui, rerender) {
  const box = el("div", "dm-groups");
  const pick = (type, g, label) => {
    const on = ui.assign?.type === type && ui.assign.g === g;
    const b = el("button", `x32-group${on ? " on" : ""}`, label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", `${type === "fgrp" ? "Fader" : "Mute"} group ${label}: ${on ? "assigning, press SEL on its channels" : "pick to assign"}`);
    b.addEventListener("click", () => ((ui.assign = on ? null : { type, g, label }), rerender()));
    return b;
  };
  const members = (type, g) => {
    const p = el("span", "dg-note");
    view.bindings.push({ kind: "fn", run: (s) => (p.textContent = s.channels.filter((c) => c[type]?.[g]).map((c) => c.label).join(" ") || "—") });
    return p;
  };
  box.append(
    el("p", "dg-note", ui.assign ? `Assigning ${ui.assign.type === "fgrp" ? "fader" : "mute"} group ${ui.assign.label}: press SEL on its channels. Press ${ui.assign.label} again to finish.` : "Pick a group, then press SEL on the channels that belong to it."),
    el("h5", "", "FADER GROUP (move one fader, the rest follow)"),
    ...def.faderGroups.map((g) => row("dm-grp", pick("fgrp", g, g.toUpperCase()), members("fgrp", g))),
    el("h5", "", "MUTE GROUP (press one ON key, the rest follow)"),
    ...Object.keys(view.store.state.mgrp).map((g) => row("dm-grp", pick("mgrp", g, MUTE_LETTER(g)), members("mgrp", g))),
  );
  return box;
}

// ---------- keys: LAYER, ENCODER MODE, FADER MODE, AUX SELECT, DISPLAY ACCESS ----------

function controlKeys(ui, rerender) {
  const box = el("section", "y96-box y96-keys dm-keys");
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
  const group = (title, ...keys) => row("dm-keygroup", el("h4", "x32-title", title), row("y96-row", ...keys));
  box.append(
    group("DISPLAY ACCESS", ...PAGES.map(([id, label]) => key(label, ui.page === id, () => (ui.page = id), `Display page ${label}`))),
    group("LAYER", ...[["1-24", "1–24"], ["73-96", "73–96"], ["master", "MASTER"]].map(([id, label]) => key(label, ui.layer === id, () => (ui.layer = id), `Fader layer ${label}`))),
    group("ENCODER MODE", key("PAN", ui.emode === "pan", () => (ui.emode = "pan"), "Encoders: PAN"), key("AUX", ui.emode === "aux", () => (ui.emode = "aux"), "Encoders: the selected AUX send")),
    group("FADER MODE", key("FADER", ui.fmode === "fader", () => (ui.fmode = "fader"), "Faders: channel levels"), key("AUX", ui.fmode === "aux", () => (ui.fmode = "aux"), "Faders: the selected AUX send")),
    group("AUX SELECT", ...AUXES.map((a, k) => key(String(k + 1), ui.aux === a, () => (ui.aux = a), `AUX SELECT ${k + 1}`))),
  );
  return box;
}

// ---------- faders ----------

function faderBank(view, def, ui, rerender) {
  const box = el("section", "y96-box y96-faders dm-faders");
  const bank = el("div", "mixer-strips x32-bank");
  const auxLabel = def.sends[ui.aux].label;
  let title;
  if (ui.layer === "master") {
    title = "MASTER LAYER · BUS 1–8 · AUX 1–8 · MATRIX 1–4";
    for (const b of [...BUSES, ...AUXES, "mtx1", "mtx2", "mtx3", "mtx4"]) bank.appendChild(masterStrip(view, def, b));
  } else if (ui.layer === "73-96") {
    title = "CHANNELS 73–96 · effects returns and 2TR IN";
    for (const b of ["aux7", "aux8"]) bank.appendChild(fxReturnStrip(view, def, b));
    def.channels.forEach((c, i) => c.kind === "stereo" && bank.appendChild(channelStrip(view, def, i, ui, rerender)));
  } else {
    title = `CHANNELS 1–24 · FADER MODE ${ui.fmode === "aux" ? auxLabel : "FADER"} · ENCODER ${ui.emode === "aux" ? auxLabel : "PAN"}`;
    def.channels.forEach((c, i) => c.kind !== "stereo" && bank.appendChild(channelStrip(view, def, i, ui, rerender)));
  }
  box.append(el("h4", "x32-title", title), bank);
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

  // SEL: select the channel, or (assigning on the GROUP page) add it to / take it out of the group.
  const a = ui.assign;
  const member = (s) => (a ? !!ch(s)[a.type]?.[a.g] : false);
  const sel = el("button", `dg-sel${(a ? member(store.state) : ui.sel === i) ? " on" : ""}${a ? " assigning" : ""}`, "SEL");
  sel.type = "button";
  sel.setAttribute("aria-label", a ? `Channel ${c.label}: ${member(store.state) ? "take out of" : "add to"} ${a.type === "fgrp" ? "fader" : "mute"} group ${a.label}` : `Select channel ${c.label}`);
  sel.addEventListener("click", () => {
    if (a) {
      const join = !member(store.state);
      // A channel belongs to one fader group at most.
      if (join && a.type === "fgrp") for (const g of def.faderGroups) if (g !== a.g && ch(store.state).fgrp[g]) store.setChannel(i, `fgrp.${g}`, false);
      store.setChannel(i, `${a.type}.${a.g}`, join);
    } else ui.sel = i;
    rerender();
  });

  // The encoder: PAN or the selected AUX send.
  const enc =
    ui.emode === "aux"
      ? knob(view, { label: def.sends[ui.aux].label, sheetLabel: `Ch ${c.label} ${def.sends[ui.aux].label} send (encoder)`, defaultValue: 0, tone: "aux1", format: lawFormat(LAWS.level), onInput: (v) => store.setChannel(i, `sends.${ui.aux}`, v) }, (s) => ch(s).sends[ui.aux])
      : knob(view, { label: c.kind === "stereo" ? "BAL" : "PAN", sheetLabel: `Ch ${c.label} pan (encoder)`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: (v) => store.setChannel(i, "pan", v) }, (s) => ch(s).pan);
  const control =
    ui.fmode === "aux"
      ? fader(view, { label: "", sheetLabel: `Ch ${c.label} ${def.sends[ui.aux].label} send`, defaultValue: 0, tone: "aux1", format: lawFormat(LAWS.level), get: (s) => ch(s).sends[ui.aux], onInput: (v) => store.setChannel(i, `sends.${ui.aux}`, v) })
      : fader(view, { label: "", sheetLabel: `Ch ${c.label} fader`, format: lawFormat(levelLaw(def)), get: (s) => ch(s).level, onInput: (v) => setLevel(view, i, v) });
  const solo = button(view, { label: "SOLO", tone: "pfl", get: (s) => ch(s).solo, onPress: () => store.setChannel(i, "solo", !ch(store.state).solo), aria: (s) => `Channel ${c.label} SOLO: ${ch(s).solo ? "on" : "off"}` });
  // ON is lit while the channel is on. Its mute group's ON keys follow it.
  const onKey = button(view, { label: "ON", tone: "on", small: false, get: (s) => ch(s).enabled, onPress: () => setOn(view, i, !ch(store.state).enabled), aria: (s) => `Channel ${c.label} ON: ${ch(s).enabled ? "lit, the channel is on" : "dark, the channel is off"}` });
  // The fluorescent display: routing and groups.
  const tag = el("span", "x32-tag");
  view.bindings.push({
    kind: "fn",
    run: (s) => {
      strip.classList.toggle("is-muted", !ch(s).enabled);
      const buses = BUSES.filter((b) => ch(s).sends[b] >= 0.5).map((b) => b.slice(3));
      const fg = Object.entries(ch(s).fgrp || {}).filter(([, on]) => on).map(([g]) => g.toUpperCase());
      const mg = Object.entries(ch(s).mgrp || {}).filter(([, on]) => on).map(([g]) => MUTE_LETTER(g));
      tag.textContent = [ch(s).lr === false ? "no ST" : "", buses.length ? `B${buses.join("")}` : "", ...fg, ...mg].filter(Boolean).join(" ");
    },
  });
  strip.append(head, row("dg-extra", enc), sel, row("dg-btns", solo), row("dg-fader", control, meterBar(view, i)), row("dg-btns", onKey), row("dg-extra", tag));
  return strip;
}

function fxReturnStrip(view, def, b) {
  const bus = def.buses[b];
  const strip = el("section", "strip dg-strip x32-strip x32-fxret");
  strip.setAttribute("aria-label", bus.master.label);
  strip.append(el("div", "dg-master-name", bus.master.label), el("p", "dg-note", bus.fx.name), row("dg-fader", fader(view, { label: "", sheetLabel: `${bus.master.label} fader (${bus.fx.name} in the STEREO mix)`, format: lawFormat(LAWS[bus.master.law]), get: (s) => s[b].level, onInput: (v) => view.store.setBus(b, "level", v) })));
  return strip;
}

// A BUS, AUX or MATRIX master on the MASTER layer.
function masterStrip(view, def, b) {
  const store = view.store;
  const isMtx = b.startsWith("mtx");
  const label = isMtx ? `MATRIX ${b.slice(3)}` : def.buses[b].label;
  if (!isMtx && def.buses[b].fx) {
    const strip = el("section", "strip dg-strip x32-strip x32-fxret");
    strip.append(el("div", "dg-master-name", label), el("p", "dg-note", `→ ${def.buses[b].fx.name}`));
    return strip;
  }
  const strip = el("section", "strip dg-strip x32-strip");
  strip.setAttribute("aria-label", `${label} master`);
  const where = el("p", "dg-note");
  view.bindings.push({
    kind: "fn",
    run: (s) => {
      const outs = def.routing.outputs.filter((o) => s.routing[o] === b).map((o) => o.slice(3));
      where.textContent = [outs.length ? `OMNI ${outs.join(",")}` : "", s[b].lr ? "→ ST" : ""].filter(Boolean).join(" · ") || "not patched";
    },
  });
  const onKey = button(view, { label: "ON", tone: "on", small: false, get: (s) => !s[b].mute, onPress: () => store.setBus(b, "mute", !store.state[b].mute), aria: (s) => `${label} ON: ${s[b].mute ? "dark, off" : "lit"}` });
  strip.append(el("div", "dg-master-name", label), row("dg-extra", where), row("dg-fader", fader(view, { label: "", sheetLabel: `${label} master`, format: lawFormat(LAWS.level), get: (s) => s[b].level, onInput: (v) => store.setBus(b, "level", v) })), row("dg-btns", onKey));
  return strip;
}

function stereoSection(view, def) {
  const store = view.store;
  const box = el("section", "y96-box y96-stereo");
  box.setAttribute("aria-label", "STEREO");
  const onKey = button(view, { label: "ON", tone: "on", small: false, get: (s) => !s.main.mute, onPress: () => store.setBus("main", "mute", !store.state.main.mute), aria: (s) => `STEREO ON: ${s.main.mute ? "dark, the house is silent" : "lit"}` });
  const phones = knob(view, { label: "PHONES", sheetLabel: "Phones level", defaultValue: 0.5, tone: "level", format: lawFormat(LAWS.master), onInput: (v) => store.setBus("cr", "level", v) }, (s) => s.cr.level);
  box.append(el("h4", "x32-title", "STEREO"), row("dg-fader", fader(view, { label: "", sheetLabel: "STEREO fader", format: lawFormat(LAWS[def.main.law]), get: (s) => s.main.level, onInput: (v) => store.setBus("main", "level", v) }), row("dg-master-meters", meterBar(view, "L"), meterBar(view, "R"))), row("dg-btns", onKey, phones));
  return box;
}
