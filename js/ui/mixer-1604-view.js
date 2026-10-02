// Draws the Mackie CR1604-VLZ surface for MixerView (js/ui/mixer-view.js):
// sixteen channel strips laid out like the real board, and its output section.
// Every control writes through MixerStore; nothing here knows about audio nodes.
// The strip and master layouts follow the owner's manual (docs/CR1604.md).

import { RangeControl, LitButton } from "./controls.js";
import * as CR from "../cr1604.js";
import { formatDb, formatPan } from "../levels.js";

const FADER_MARKS = [10, 5, 0, -5, -10, -20, -30, -50].map((db) => ({ value: CR.LAWS.fader.toPos(db), label: db === 0 ? "U" : db > 0 ? `+${db}` : `${db}` }));
FADER_MARKS.push({ value: 0, label: "∞" });

const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });
const eqFormat = (v) => (Math.abs(v) < 0.25 ? "0 dB" : `${v > 0 ? "+" : "−"}${Math.abs(v)} dB`);
// Two significant figures, like the knob's printed scale: "1 kHz", "2.4 kHz", "160 Hz".
const hzFormat = (hz) => {
  const r = Number(hz.toPrecision(2));
  return r >= 1000 ? `${r / 1000} kHz` : `${r} Hz`;
};

// The two 12-LED columns: Mackie's scale is dBu (0 = 0 dBu). The lab puts
// 0 dBu at −18 dBFS, like the analog skin's meter.
const LEDS = [-30, -20, -10, -7, -4, -2, 0, 2, 4, 7, 10, "CLIP"];
const DBU_TO_DBFS = -18;
const ledDb = (l) => (l === "CLIP" ? CR.OL_DB : l + DBU_TO_DBFS);
const SIGNAL_DBFS = -20 + DBU_TO_DBFS; // the channel "−20" LED
const RELEASE_DB_PER_S = 24;

export function render1604(view) {
  const surface = document.createElement("div");
  surface.className = "mixer-surface";
  const strips = document.createElement("div");
  strips.className = "mixer-strips";
  strips.setAttribute("role", "group");
  strips.setAttribute("aria-label", "Channels 1 to 16");
  for (let i = 0; i < CR.CHANNELS; i++) strips.appendChild(buildStrip(view, i));
  surface.append(strips, buildMaster(view));
  view.root.appendChild(surface);
}

// ---------- helpers ----------

function knob(view, opts, get) {
  return view.bind(new RangeControl({ kind: "knob", dragAxis: "vertical", step: 0.005, keyStepMul: 2, min: 0, max: 1, size: "xs", ...opts }), get).el;
}

function button(view, { label, tone, onPress, get, aria, small = true }) {
  const b = new LitButton({ label, tone, small, onPress });
  view.bindings.push({ kind: "button", control: b, get: (s) => [get(s), aria(s)] });
  return b.el;
}

function fader(view, { label, sheetLabel, get, onInput }) {
  const ctl = new RangeControl({ kind: "fader", label, sheetLabel, min: 0, max: 1, step: 0.005, keyStepMul: 2, defaultValue: 0.75, marks: FADER_MARKS, format: lawFormat(CR.LAWS.fader), onInput });
  return view.bind(ctl, get).el;
}

function row(className, ...els) {
  const d = document.createElement("div");
  d.className = className;
  d.append(...els);
  return d;
}

function led(cls, label) {
  const d = document.createElement("span");
  d.className = `c16-led ${cls}`;
  d.innerHTML = `<i aria-hidden="true"></i><small>${label}</small>`;
  return d;
}

// ---------- channel strip ----------

function buildStrip(view, i) {
  const store = view.store;
  const n = i + 1;
  const ch = (s) => s.channels[i];
  const set = (key) => (v) => store.setChannel(i, key, v);
  const toggle = (key, get) => () => store.setChannel(i, key, !get(store.state));
  const onOff = (b) => (b ? "on" : "off");

  const el = document.createElement("section");
  el.className = "strip c16-strip";
  el.dataset.channel = String(n);
  el.setAttribute("aria-label", `Channel ${n}`);

  const head = document.createElement("button");
  head.type = "button";
  head.className = "strip-head";
  head.addEventListener("click", () => view.onPatchChannel(i));
  view.bindings.push({ kind: "head", el: head, index: i });

  view.paths = view.paths || [];
  const trim = knob(
    view,
    {
      label: "TRIM",
      sheetLabel: `Ch ${n} TRIM`,
      min: CR.GAIN_MIN_DB,
      max: CR.GAIN_MAX_DB,
      step: 0.5,
      defaultValue: CR.GAIN_MIN_DB,
      size: undefined,
      tone: "gain",
      // MIC: +10…+60 dB. LINE is padded 20 dB, so the same knob reads −10…+40.
      format: (v) => (view.paths[i] === "line" ? `${formatDb(v - 20)} line` : `+${Math.round(v)} dB`),
      onInput: set("gainDb"),
    },
    (s) => ch(s).gainDb,
  );

  const send = (k, label, tone) =>
    knob(view, { label, sheetLabel: `Ch ${n} ${label} send`, defaultValue: 0, tone, format: lawFormat(CR.LAWS.send), onInput: (v) => store.setSend(i, k, v) }, (s) => ch(s).auxSends[k]);
  const eqKnob = (k, label) =>
    knob(view, { label, sheetLabel: `Ch ${n} ${label} EQ`, min: -CR.EQ_RANGE_DB, max: CR.EQ_RANGE_DB, step: 0.5, defaultValue: 0, bipolar: true, tone: "eq", format: eqFormat, onInput: set(`eq.${k}`) }, (s) => ch(s).eq[k]);

  const pre = button(view, {
    label: "PRE",
    tone: "pfl",
    get: (s) => ch(s).pre,
    onPress: toggle("pre", (s) => ch(s).pre),
    aria: (s) => `PRE, channel ${n}: AUX 1 and 2 are ${ch(s).pre ? "pre-fader (before EQ, MUTE and fader)" : "post-fader"}`,
  });
  const shift = button(view, {
    label: "5/6 SHIFT",
    tone: "pfl",
    get: (s) => ch(s).shift,
    onPress: toggle("shift", (s) => ch(s).shift),
    aria: (s) => `5/6 SHIFT, channel ${n}: AUX 3 and 4 knobs feed AUX SENDS ${ch(s).shift ? "5 and 6" : "3 and 4"}`,
  });
  const freq = knob(
    view,
    {
      label: "FREQ",
      sheetLabel: `Ch ${n} MID frequency`,
      defaultValue: CR.midFreqToPos(1000),
      tone: "eq",
      format: (v) => hzFormat(CR.posToMidFreq(v)),
      onInput: (v) => store.setChannel(i, "eq.freq", CR.posToMidFreq(v)),
    },
    (s) => CR.midFreqToPos(ch(s).eq.freq),
  );
  const lowCut = button(view, {
    label: "LOW CUT",
    tone: "lowcut",
    get: (s) => ch(s).lowCut,
    onPress: toggle("lowCut", (s) => ch(s).lowCut),
    aria: (s) => `LOW CUT 75 Hz, channel ${n}: ${onOff(ch(s).lowCut)}`,
  });
  const pan = knob(view, { label: "PAN", sheetLabel: `Ch ${n} PAN`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: set("pan") }, (s) => ch(s).pan);
  const mute = button(view, {
    label: "MUTE",
    tone: "mute",
    small: false,
    get: (s) => !ch(s).enabled,
    onPress: () => store.setChannel(i, "enabled", !ch(store.state).enabled),
    aria: (s) => `MUTE channel ${n}: ${ch(s).enabled ? "off" : "on, cut from L-R, subgroups and post sends"}`,
  });
  const ol = led("led-ol", "OL");
  const sig = led("led-sig", "−20");
  view.leds.push({ index: i, ol: ol.querySelector("i"), sig: sig.querySelector("i"), olUntil: 0 });

  const assign = (k, label) =>
    button(view, {
      label,
      tone: "assign",
      get: (s) => ch(s).assign[k],
      onPress: () => store.setChannel(i, `assign.${k}`, !ch(store.state).assign[k]),
      aria: (s) => `Channel ${n} assigned to ${label}: ${onOff(ch(s).assign[k])}`,
    });
  const solo = button(view, {
    label: "SOLO",
    tone: "pfl",
    get: (s) => ch(s).solo,
    onPress: toggle("solo", (s) => ch(s).solo),
    aria: (s) => `SOLO channel ${n}: ${onOff(ch(s).solo)}`,
  });
  const level = fader(view, { label: "", sheetLabel: `Ch ${n} fader`, get: (s) => ch(s).level, onInput: set("level") });

  const status = document.createElement("p");
  status.className = "strip-status";
  status.setAttribute("aria-live", "polite");
  view.bindings.push({ kind: "text", el: status, get: (s) => [ch(s).enabled ? "" : "MUTE", ch(s).solo ? "SOLO" : ""].filter(Boolean).join(" · ") });
  view.bindings.push({ kind: "fn", run: (s) => el.classList.toggle("is-muted", !ch(s).enabled) });

  el.append(
    head,
    row("c16-sec c16-trim", trim),
    row("c16-sec c16-aux", row("c16-pair", send("aux1", "AUX 1", "aux1"), send("aux2", "AUX 2", "aux2")), pre, row("c16-pair", send("aux3", "3 / 5", "aux3"), send("aux4", "4 / 6", "aux4")), shift),
    row("c16-sec c16-eq", eqKnob("high", "HI"), eqKnob("mid", "MID"), freq, eqKnob("low", "LOW"), lowCut),
    row("c16-sec c16-pan", pan),
    row("c16-sec c16-mute", mute, row("c16-leds", ol, sig)),
    row("c16-sec c16-fader", level, row("c16-assign", solo, assign("s12", "1-2"), assign("s34", "3-4"), assign("lr", "L-R"))),
    status,
  );
  return el;
}

// ---------- output section ----------

function buildMaster(view) {
  const store = view.store;
  const L = CR.LAWS;
  const el = document.createElement("section");
  el.className = "master c16-master";
  el.setAttribute("aria-label", "Output section");

  const block = (title, ...els) => {
    const b = document.createElement("div");
    b.className = "c16-block";
    b.innerHTML = `<h4>${title}</h4>`;
    b.append(...els);
    return b;
  };
  const busKnob = (bus, label, law, key = "level") =>
    knob(view, { label, sheetLabel: label, defaultValue: 0.5, tone: "level", format: lawFormat(law), onInput: (v) => store.setBus(bus, key, v) }, (s) => s[bus][key]);
  const busButton = (bus, key, label, aria, tone = "assign") =>
    button(view, { label, tone, get: (s) => s[bus][key], onPress: () => store.setBus(bus, key, !store.state[bus][key]), aria: (s) => `${aria}: ${s[bus][key] ? "on" : "off"}` });

  // AUX SENDS masters (1 and 2 only) with their solo switches.
  const auxes = block(
    "AUX SENDS",
    row("c16-pair", busKnob("aux1", "1", L.master), busKnob("aux2", "2", L.master)),
    row("c16-pair", busButton("aux1", "solo", "SOLO", "AUX SEND 1 solo", "pfl"), busButton("aux2", "solo", "SOLO", "AUX SEND 2 solo", "pfl")),
  );
  auxes.insertAdjacentHTML("beforeend", `<p class="c16-note">3–6: no master, out at unity</p>`);

  // TAPE IN: the stereo strip. Its jack can be patched from here.
  const tapeHead = document.createElement("button");
  tapeHead.type = "button";
  tapeHead.className = "strip-head c16-tape-head";
  tapeHead.addEventListener("click", () => view.onPatchChannel(CR.TAPE));
  view.bindings.push({ kind: "head", el: tapeHead, index: CR.TAPE });
  const tapeLevel = knob(view, { label: "TAPE IN", sheetLabel: "TAPE IN level", defaultValue: 0.5, tone: "level", format: lawFormat(L.tape), onInput: (v) => store.setChannel(CR.TAPE, "level", v) }, (s) => s.channels[CR.TAPE].level);
  const tapeToMain = button(view, {
    label: "TAPE TO MAIN MIX",
    tone: "assign",
    get: (s) => s.channels[CR.TAPE].toMain,
    onPress: () => store.setChannel(CR.TAPE, "toMain", !store.state.channels[CR.TAPE].toMain),
    aria: (s) => `TAPE TO MAIN MIX: ${s.channels[CR.TAPE].toMain ? "on" : "off"}`,
  });
  const tape = block("TAPE", tapeHead, tapeLevel, tapeToMain);

  // C-R/PHONES SOURCE matrix and level.
  const cr = block(
    "C-R / PHONES",
    row(
      "c16-matrix",
      busButton("cr", "main", "MAIN MIX", "SOURCE MAIN MIX"),
      busButton("cr", "subs12", "SUBS 1-2", "SOURCE SUBS 1-2"),
      busButton("cr", "subs34", "SUBS 3-4", "SOURCE SUBS 3-4"),
      busButton("cr", "tape", "TAPE", "SOURCE TAPE"),
    ),
    busKnob("cr", "C-R/PHONES", L.master),
  );

  // SOLO: level, MODE, LEVEL SET LED, RUDE SOLO LIGHT.
  const mode = button(view, {
    label: "LEVEL SET (PFL)",
    tone: "pfl",
    get: (s) => s.soloBus.mode === "pfl",
    onPress: () => store.setBus("soloBus", "mode", store.state.soloBus.mode === "pfl" ? "afl" : "pfl"),
    aria: (s) => `Solo MODE: ${s.soloBus.mode === "pfl" ? "LEVEL SET (PFL), before the fader" : "NORMAL (AFL), after fader and pan"}`,
  });
  const rude = led("led-rude", "RUDE SOLO");
  const levelSet = led("led-levelset", "LEVEL SET");
  view.soloLeds = { rude: rude.querySelector("i"), levelSet: levelSet.querySelector("i") };
  const solo = block("SOLO", busKnob("soloBus", "SOLO", L.master), mode, row("c16-leds", levelSet, rude));

  // Meters: two columns of twelve LEDs.
  const meters = document.createElement("div");
  meters.className = "c16-meters";
  meters.setAttribute("role", "img");
  meters.setAttribute("aria-label", "Output meters: the C-R/PHONES source, or solo");
  view.ledMeters = ["L", "R"].map((side) => {
    const col = document.createElement("div");
    col.className = "c16-meter";
    col.innerHTML = LEDS.slice()
      .reverse()
      .map((l) => `<span class="seg ${l === "CLIP" ? "seg-clip" : typeof l === "number" && l > 0 ? "seg-hot" : ""}" data-db="${ledDb(l)}"><i></i><small>${l === "CLIP" ? "CLIP" : l > 0 ? `+${l}` : l}</small></span>`)
      .join("");
    col.insertAdjacentHTML("beforeend", `<b>${side === "L" ? "LEFT" : "RIGHT"}</b>`);
    meters.appendChild(col);
    return { side, segs: [...col.querySelectorAll(".seg")].map((s) => ({ el: s, db: Number(s.dataset.db) })), level: -Infinity, lastT: 0 };
  });

  // Rear-panel controls that matter for sound: one PHANTOM switch, MONO LEVEL.
  const phantom = button(view, {
    label: "PHANTOM",
    tone: "phantom",
    get: (s) => s.channels.some((c) => !c.tape && c.phantom),
    onPress: () => store.setAllPhantom(!store.state.channels.some((c) => !c.tape && c.phantom)),
    aria: (s) => `PHANTOM power, all 16 MIC inputs: ${s.channels.some((c) => !c.tape && c.phantom) ? "on" : "off"}`,
  });
  const rear = block("REAR PANEL", phantom, busKnob("mono", "MONO", L.mono));

  // Faders: SUB 1–4 with ASSIGN TO MAIN MIX, then MAIN L-R MIX.
  const faders = document.createElement("div");
  faders.className = "c16-faders";
  const subs = document.createElement("div");
  subs.className = "c16-subs";
  subs.innerHTML = `<p class="c16-subs-title">ASSIGN TO MAIN MIX <small>L · R</small></p>`;
  const subFaders = document.createElement("div");
  subFaders.className = "c16-sub-faders";
  subs.appendChild(subFaders);
  faders.appendChild(subs);
  for (const sub of CR.SUBS) {
    const n = sub.slice(3);
    subFaders.appendChild(
      row(
        "c16-sub",
        row("c16-assign c16-tomain", busButton(sub, "toMainL", "L", `SUB ${n} ASSIGN TO MAIN MIX, LEFT`), busButton(sub, "toMainR", "R", `SUB ${n} ASSIGN TO MAIN MIX, RIGHT`)),
        fader(view, { label: `SUB ${n}`, sheetLabel: `SUB ${n} fader`, get: (s) => s[sub].level, onInput: (v) => store.setBus(sub, "level", v) }),
      ),
    );
  }
  faders.appendChild(row("c16-sub c16-main", fader(view, { label: "MAIN L-R", sheetLabel: "MAIN L-R MIX fader", get: (s) => s.main.level, onInput: (v) => store.setBus("main", "level", v) })));

  el.append(row("c16-master-top", meters, auxes, tape, cr, solo, rear), faders);
  return el;
}

// ---------- live display ----------

// Channel LEDs: −20 flickers with signal (steady when soloed); OL flashes near
// clipping (steady when muted). Output meters: instant attack, steady release.
export function update1604(view, readings, now) {
  const s = view.store.state;
  for (const l of view.leds) {
    const r = readings.channels[l.index];
    const peak = r ? r.peakDb : -Infinity;
    const ch = s.channels[l.index];
    if (peak >= CR.OL_DB) l.olUntil = now + 150;
    setLed(l.ol, !ch.enabled || now < l.olUntil, !ch.enabled);
    setLed(l.sig, ch.solo || peak >= SIGNAL_DBFS, ch.solo);
  }
  const anySolo = CR.phonesOf(s).solo;
  if (view.soloLeds) {
    setLed(view.soloLeds.rude, anySolo && Math.floor(now / 400) % 2 === 0, false);
    setLed(view.soloLeds.levelSet, s.soloBus.mode === "pfl", true);
  }
  for (const m of view.ledMeters || []) {
    const r = m.side === "L" ? readings.meterL : readings.meterR;
    const peak = r ? r.peakDb : -Infinity;
    const dt = m.lastT ? (now - m.lastT) / 1000 : 0;
    m.lastT = now;
    m.level = Math.max(peak, m.level - RELEASE_DB_PER_S * dt);
    for (const seg of m.segs) seg.el.classList.toggle("on", m.level >= seg.db);
  }
}

function setLed(el, on, steady) {
  el.classList.toggle("on", !!on);
  el.classList.toggle("steady", !!steady);
}
