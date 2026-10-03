// Draws a compact mixer (js/compact-defs.js) for MixerView: each strip from the
// definition's layout list, and the master section from what the mixer has.
// Every control writes through MixerStore; nothing here knows about audio nodes.

import { RangeControl, LitButton } from "./controls.js";
import { EQ_FOR, LAWS, OL_DB, fxPreset, reverbSetting, tapeIndex } from "../compact.js";
import { formatDb, formatPan } from "../levels.js";

const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });
const eqFormat = (v) => (Math.abs(v) < 0.25 ? "0 dB" : `${v > 0 ? "+" : "−"}${Math.abs(v)} dB`);
const RELEASE_DB_PER_S = 24;
const FADER_MARKS = [10, 5, 0, -5, -10, -20, -30, -50].map((db) => ({ value: LAWS.level.toPos(db), label: db === 0 ? "U" : db > 0 ? `+${db}` : `${db}` }));

function row(className, ...els) {
  const d = document.createElement("div");
  d.className = className;
  d.append(...els.filter(Boolean));
  return d;
}

function led(cls, label) {
  const d = document.createElement("span");
  d.className = `c16-led ${cls}`;
  d.innerHTML = `<i aria-hidden="true"></i><small>${label}</small>`;
  return d;
}

export function renderCompact(view, def) {
  view.leds = [];
  view.compLeds = [];
  view.fxLeds = null;
  view.paths = [];
  view.pathKey = "";
  view.def = def;
  const surface = document.createElement("div");
  surface.className = "mixer-surface";
  const strips = document.createElement("div");
  strips.className = "mixer-strips";
  strips.setAttribute("role", "group");
  strips.setAttribute("aria-label", "Channels");
  def.channels.forEach((_, i) => strips.appendChild(buildStrip(view, def, i)));
  surface.append(strips, buildMaster(view, def));
  view.root.appendChild(surface);
}

function knob(view, opts, get) {
  return view.bind(new RangeControl({ kind: "knob", dragAxis: "vertical", step: 0.005, keyStepMul: 2, min: 0, max: 1, size: "xs", ...opts }), get).el;
}

// A channel or master fader (Xenyx), on the channel LEVEL law.
function fader(view, { label, sheetLabel, get, onInput }) {
  return view.bind(new RangeControl({ kind: "fader", label, sheetLabel, min: 0, max: 1, step: 0.005, keyStepMul: 2, defaultValue: 0.75, marks: FADER_MARKS, format: lawFormat(LAWS.level), onInput }), get).el;
}

function button(view, { label, tone = "assign", small = true, get, onPress, aria }) {
  const b = new LitButton({ label, tone, small, onPress });
  view.bindings.push({ kind: "button", control: b, get: (s) => [get(s), aria(s)] });
  return b.el;
}

// ---------- channel strip ----------

function buildStrip(view, def, i) {
  const store = view.store;
  const c = def.channels[i];
  const n = c.label;
  const ch = (s) => s.channels[i];
  const set = (key) => (v) => store.setChannel(i, key, v);
  const flip = (key) => () => store.setChannel(i, key, !ch(store.state)[key]);
  const onOff = (b) => (b ? "on" : "off");

  const el = document.createElement("section");
  el.className = `strip c16-strip cm-strip${c.kind === "stereo" ? " is-stereo" : ""}`;
  el.setAttribute("aria-label", `Channel ${n}`);

  const parts = {
    head: () => {
      const head = document.createElement("button");
      head.type = "button";
      head.className = "strip-head";
      head.addEventListener("click", () => view.onPatchChannel(i));
      view.bindings.push({ kind: "head", el: head, index: i });
      return head;
    },
    gain: () =>
      c.gain.min === undefined
        ? null
        : knob(
            view,
            {
              label: def.id.startsWith("vlz") ? "TRIM" : "GAIN",
              sheetLabel: `Ch ${n} gain`,
              min: c.gain.min,
              max: c.gain.max,
              step: 0.5,
              defaultValue: c.gain.min,
              size: undefined,
              tone: "gain",
              format: (v) => (view.paths[i] === "line" ? `${formatDb(v + (c.gain.linePad || 0))} line` : `+${Math.round(v)} dB`),
              onInput: set("gainDb"),
            },
            (s) => ch(s).gainDb,
          ),
    micLine: () =>
      c.gain.switch
        ? button(view, { label: "MIC", tone: "gain", get: (s) => ch(s).micLine === "mic", onPress: () => store.setChannel(i, "micLine", ch(store.state).micLine === "mic" ? "line" : "mic"), aria: (s) => `Channel ${n} MIC/LINE switch: ${ch(s).micLine === "mic" ? "MIC" : "LINE"}` })
        : null,
    comp: () => {
      if (!c.comp) return null;
      const l = led("led-comp", "COMP");
      view.compLeds.push({ index: i, el: l.querySelector("i") });
      return row("cm-comp", knob(view, { label: "COMP", sheetLabel: `Ch ${n} compressor`, defaultValue: 0, tone: "gain", format: (v) => (v <= 0 ? "off" : `${Math.round(v * 10)}`), onInput: set("comp") }, (s) => ch(s).comp), l);
    },
    minus10: () =>
      c.gain.minus10
        ? button(view, { label: "−10 dBV", get: (s) => ch(s).minus10, onPress: flip("minus10"), aria: (s) => `Channel ${n} LEVEL switch: ${ch(s).minus10 ? "−10 dBV (consumer gear, 12 dB more sensitive)" : "+4 dBu (pro line level)"}` })
        : null,
    hiZ: () => (c.hiZ ? button(view, { label: "Hi-Z", get: (s) => ch(s).hiZ, onPress: flip("hiZ"), aria: (s) => `Channel ${n} Hi-Z: ${onOff(ch(s).hiZ)}` }) : null),
    lowCut: () => (c.lowCut ? button(view, { label: c.lowCut.label || "LOW CUT", tone: "lowcut", get: (s) => ch(s).lowCut, onPress: flip("lowCut"), aria: (s) => `Channel ${n} low cut ${c.lowCut.hz} Hz: ${onOff(ch(s).lowCut)}` }) : null),
    eq: () =>
      row(
        "c16-eq cm-eq",
        ...EQ_FOR(c.eq).map((b) =>
          knob(view, { label: b.label, sheetLabel: `Ch ${n} ${b.label} EQ`, min: -15, max: 15, step: 0.5, defaultValue: 0, bipolar: true, tone: "eq", format: eqFormat, onInput: set(`eq.${b.id}`) }, (s) => ch(s).eq[b.id]),
        ),
      ),
    pan: () => knob(view, { label: c.kind === "stereo" ? "BAL" : "PAN", sheetLabel: `Ch ${n} pan`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: set("pan") }, (s) => ch(s).pan),
    stMono: () => (c.stMono ? button(view, { label: "MONO", get: (s) => ch(s).stMono, onPress: flip("stMono"), aria: (s) => `Channel ${n} ST/MONO: ${ch(s).stMono ? "MONO" : "ST"}` }) : null),
    mute: () =>
      c.mute
        ? button(view, { label: c.mute === "alt" ? "MUTE/ALT" : "MUTE", tone: "mute", small: false, get: (s) => !ch(s).enabled, onPress: () => store.setChannel(i, "enabled", !ch(store.state).enabled), aria: (s) => `Channel ${n} ${c.mute === "alt" ? "MUTE / ALT 3-4" : "MUTE"}: ${ch(s).enabled ? "off" : c.mute === "alt" ? "on, sent to ALT 3-4 instead of MAIN" : "on"}` })
        : null,
    solo: () => (c.solo ? button(view, { label: "SOLO", tone: "pfl", get: (s) => ch(s).solo, onPress: flip("solo"), aria: (s) => `Channel ${n} SOLO (PFL): ${onOff(ch(s).solo)}` }) : null),
    peak: () => {
      if (!c.peak) return null;
      const l = led("led-ol", def.peakLabel || "PEAK");
      view.leds.push({ index: i, ol: l.querySelector("i"), olUntil: 0 });
      return l;
    },
    level: () =>
      def.layout.level === "fader"
        ? row("c16-fader cm-fader", fader(view, { label: "", sheetLabel: `Ch ${n} fader`, get: (s) => ch(s).level, onInput: set("level") }))
        : knob(view, { label: "LEVEL", sheetLabel: `Ch ${n} level`, defaultValue: 0.75, size: "big", tone: "level", format: lawFormat(LAWS.level), onInput: set("level") }, (s) => ch(s).level),
  };
  // Sends: one knob each ("aux", "aux1", "reverb", …) or the MG10/2's two-way AUX.
  for (const sid of c.sends || []) {
    const d = def.sends[sid];
    parts[sid] = () =>
      d.bipolar
        ? knob(
            view,
            {
              label: "AUX",
              sheetLabel: `Ch ${n} AUX (left: AUX1 pre, right: AUX2 post)`,
              min: -1,
              max: 1,
              step: 0.01,
              defaultValue: 0,
              bipolar: true,
              tone: "aux1",
              format: (v) => (Math.abs(v) < 0.01 ? "off" : `${v < 0 ? "AUX1" : "AUX2"} ${formatDb(LAWS[d.law].toDb(Math.abs(v)), { unity: true })}`),
              onInput: set(`sends.${sid}`),
            },
            (s) => ch(s).sends[sid],
          )
        : d.tap === "channel"
          ? row(
              "cm-send-pre",
              knob(view, { label: d.label, sheetLabel: `Ch ${n} ${d.label} send`, defaultValue: 0, tone: "aux1", format: lawFormat(LAWS[d.law]), onInput: set(`sends.${sid}`) }, (s) => ch(s).sends[sid]),
              button(view, { label: "PRE", tone: "pfl", get: (s) => ch(s).pre, onPress: flip("pre"), aria: (s) => `Channel ${n} ${d.label} PRE: ${ch(s).pre ? "on, before the fader" : "off, after the fader (and cut by MUTE)"}` }),
            )
          : knob(view, { label: d.label, sheetLabel: `Ch ${n} ${d.label} send`, defaultValue: 0, tone: d.bus === "aux2" ? "aux2" : d.bus === "reverb" ? "eq" : "aux1", format: lawFormat(LAWS[d.law]), onInput: set(`sends.${sid}`) }, (s) => ch(s).sends[sid]);
  }

  for (const key of def.layout.strip) {
    const built = parts[key] ? parts[key]() : null;
    if (built) el.appendChild(key === "head" || (key === "level" && def.layout.level !== "fader") ? built : row(key === "level" ? "c16-sec cm-level" : "c16-sec", built));
  }
  view.bindings.push({ kind: "fn", run: (s) => el.classList.toggle("is-muted", !!c.mute && !ch(s).enabled) });
  return el;
}

// ---------- master section ----------

function buildMaster(view, def) {
  const store = view.store;
  const el = document.createElement("section");
  el.className = "master c16-master cm-master";
  el.setAttribute("aria-label", "Master section");
  const block = (title, ...els) => {
    const b = document.createElement("div");
    b.className = "c16-block";
    b.innerHTML = `<h4>${title}</h4>`;
    b.append(...els.filter(Boolean));
    return b;
  };
  const busKnob = (bus, key, label, law, extra = {}) =>
    knob(view, { label, sheetLabel: label, defaultValue: 0.5, tone: "level", format: lawFormat(law), onInput: (v) => store.setBus(bus, key, v), ...extra }, (s) => s[bus][key]);
  const busButton = (bus, key, label, aria, tone = "assign") =>
    button(view, { label, tone, get: (s) => !!s[bus][key], onPress: () => store.setBus(bus, key, !store.state[bus][key]), aria: (s) => `${aria}: ${s[bus][key] ? "on" : "off"}` });
  const blocks = [];

  // Meters: two LED columns.
  const meters = document.createElement("div");
  meters.className = "c16-meters";
  meters.setAttribute("role", "img");
  meters.setAttribute("aria-label", def.id === "stagepas400bt" ? "Output level meter" : "Main mix meters");
  const ledDb = (l) => (typeof l === "number" ? l - 18 : OL_DB);
  view.ledMeters = ["L", "R"].map((side) => {
    const col = document.createElement("div");
    col.className = "c16-meter";
    col.innerHTML = def.meter
      .slice()
      .reverse()
      .map((l) => `<span class="seg ${typeof l === "string" ? "seg-clip" : l > 0 ? "seg-hot" : ""}" data-db="${ledDb(l)}"><i></i><small>${typeof l === "string" ? l : l > 0 ? `+${l}` : l}</small></span>`)
      .join("");
    col.insertAdjacentHTML("beforeend", `<b>${side}</b>`);
    meters.appendChild(col);
    return { side, segs: [...col.querySelectorAll(".seg")].map((s) => ({ el: s, db: Number(s.dataset.db) })), level: -Infinity, lastT: 0 };
  });
  blocks.push(meters);

  blocks.push(
    block(
      "PHANTOM",
      button(view, {
        label: def.phantom.label,
        tone: "phantom",
        get: (s) => def.phantom.channels.some((i) => s.channels[i].phantom),
        onPress: () => store.setAllPhantom(!def.phantom.channels.some((i) => store.state.channels[i].phantom)),
        aria: (s) => `${def.phantom.label}: ${def.phantom.channels.some((i) => s.channels[i].phantom) ? "on" : "off"} (channels ${def.phantom.channels.map((i) => def.channels[i].label).join(", ")})`,
      }),
    ),
  );

  // Aux masters (and the 1202-VLZ's AUX 1 PRE switch).
  const auxBlocks = Object.entries(def.buses).filter(([, b]) => b.master || b.preSwitch);
  if (auxBlocks.length)
    blocks.push(
      block(
        "AUX SENDS",
        ...auxBlocks.map(([b, bus]) => (bus.master ? busKnob(b, "level", bus.master.label, LAWS[bus.master.law]) : null)),
        ...auxBlocks.map(([b, bus]) => (bus.preSwitch ? busButton(b, "pre", `${bus.label} PRE`, `${bus.label} taken before the channel level (pre-fader)`, "pfl") : null)),
        auxBlocks.some(([, bus]) => bus.solo) ? row("c16-matrix", ...auxBlocks.map(([b, bus]) => (bus.solo ? busButton(b, "solo", `SOLO ${b === "aux1" ? "1" : "2"}`, `SOLO ${bus.master.label}: hear it in the PHONES/CTRL R`, "pfl") : null))) : null,
      ),
    );

  // The Xenyx's built-in effects: PROGRAM and a LEVEL LED.
  if (def.fx) {
    const sig = led("led-sig", "LEVEL");
    const clip = led("led-ol", "CLIP");
    view.fxLeds = { sig: sig.querySelector("i"), clip: clip.querySelector("i"), clipUntil: 0 };
    const name = document.createElement("p");
    name.className = "c16-note cm-fx-name";
    view.bindings.push({ kind: "text", el: name, get: (s) => { const p = fxPreset(def, s.fx.program); return `${String(p.number).padStart(2, "0")} ${p.name}`; } });
    blocks.push(
      block(
        "EFFECTS",
        name,
        knob(view, { label: "PROGRAM", sheetLabel: "Effects PROGRAM", min: 0, max: def.fx.presets.length - 1, step: 1, defaultValue: 0, tone: "eq", format: (v) => fxPreset(def, v).name, onInput: (v) => store.setBus("fx", "program", v) }, (s) => s.fx.program),
        row("c16-leds", sig, clip),
        Object.assign(document.createElement("p"), { className: "c16-note", textContent: "Fed by AUX SEND 2 (FX); back on RETURN 2" }),
      ),
    );
  }

  // Returns.
  if (def.returns?.length)
    blocks.push(
      block(
        def.returns.length > 1 ? "AUX RETURNS" : def.returns[0].label,
        ...def.returns.map((r) => (r.fixedDb !== undefined ? null : busKnob(r.id, "level", def.returns.length > 1 ? r.label.replace(/(STEREO )?AUX RETURN/, "RET").replace(" (FX)", "") : "LEVEL", LAWS[r.law], { sheetLabel: r.label }))),
        ...def.returns.map((r) => (r.efxToMonitor ? busButton(r.id, "efx", "EFX TO MON", `${r.label} to ${def.buses[r.efxToMonitor].label} (effects to monitor)`) : null)),
        ...def.returns.map((r) => (r.toMonitor ? busKnob(r.id, "mon", `${r.toMonitor.label}`, LAWS[r.toMonitor.law], { sheetLabel: `${r.label} into ${def.buses[r.toMonitor.bus].label} (monitor)`, defaultValue: 0 }) : null)),
        ...def.returns.map((r) => (r.toAlt ? busButton(r.id, "toAlt", "RET 2 → ALT 3-4", `${r.label} to ALT 3-4 instead of MAIN MIX`) : null)),
        def.returns.every((r) => r.fixedDb !== undefined) ? Object.assign(document.createElement("p"), { className: "c16-note", textContent: "Into the main mix at unity" }) : null,
      ),
    );

  // Tape / 2TR in.
  if (def.tape) {
    const t = tapeIndex(def);
    const head = document.createElement("button");
    head.type = "button";
    head.className = "strip-head c16-tape-head";
    head.addEventListener("click", () => view.onPatchChannel(t));
    view.bindings.push({ kind: "head", el: head, index: t });
    blocks.push(
      block(
        def.tape.level || (def.tape.label ? `${def.tape.label} IN` : "TAPE IN"),
        head,
        def.tape.level ? knob(view, { label: def.tape.level, sheetLabel: `${def.tape.level} level`, defaultValue: 0.5, tone: "level", format: lawFormat(LAWS.ret20), onInput: (v) => store.setChannel(t, "level", v) }, (s) => s.channels[t].level) : null,
        def.tape.routing === "toMainOrCr"
          ? button(view, { label: "TO CR/PHONES", get: (s) => s.channels[t].toCr, onPress: () => store.setChannel(t, "toCr", !store.state.channels[t].toCr), aria: (s) => `TAPE IN goes ${s.channels[t].toCr ? "to the CR/PHONES only" : "to the MAIN mix"}` })
          : null,
        def.tape.routing === "switch"
          ? button(view, { label: `${def.tape.label} TO MAIN`, get: (s) => s.channels[t].toMain, onPress: () => store.setChannel(t, "toMain", !store.state.channels[t].toMain), aria: (s) => `${def.tape.label} TO MAIN: ${s.channels[t].toMain ? "on, in the main mix" : "off (hear it with the C-R SOURCE TAPE)"}` })
          : null,
        def.tape.routing === "crOnly" ? Object.assign(document.createElement("p"), { className: "c16-note", textContent: "Heard through C-R/PHONES (SOURCE: TAPE)" }) : null,
      ),
    );
  }

  if (def.alt && !def.alt.fader) blocks.push(block("ALT 3-4", busButton("alt", "toMain", "ASSIGN TO MAIN", "ALT 3-4 assigned to the main mix")));

  if (def.reverb) {
    blocks.push(
      block(
        "REVERB",
        busButton("reverb", "on", "REVERB", "REVERB switch", "lowcut"),
        knob(view, { label: "TYPE/TIME", sheetLabel: "Reverb type and time", defaultValue: 0.15, tone: "eq", format: (v) => { const r = reverbSetting(def, v); return `${r.type} ${r.seconds.toFixed(1)} s`; }, onInput: (v) => store.setBus("reverb", "type", v) }, (s) => s.reverb.type),
      ),
    );
  }
  if (def.monitorOut) blocks.push(block("MONITOR OUT", busKnob("monitor", "level", "LEVEL", LAWS.master, { defaultValue: 0 })));
  if (def.masterEq || def.feedbackSuppressor) {
    blocks.push(
      block(
        "MASTER",
        def.masterEq
          ? knob(view, { label: "MASTER EQ", sheetLabel: "Master EQ: speech, music, bass boost", defaultValue: 0.5, tone: "eq", format: (v) => (v < 0.4 ? "SPEECH" : v > 0.9 ? "BASS BOOST" : v > 0.6 ? "MUSIC +" : "MUSIC"), onInput: (v) => store.setBus("masterEq", "pos", v) }, (s) => s.masterEq.pos)
          : null,
        def.feedbackSuppressor ? busButton("fbs", "on", "FEEDBACK SUPP.", "FEEDBACK SUPPRESSOR") : null,
      ),
    );
  }
  if (def.phones) {
    blocks.push(
      block(
        def.phones.label,
        def.phones.sources ? row("c16-matrix", ...def.phones.sources.map((src) => busButton("cr", src, { main: "MAIN", alt: "ALT 3-4", tape: "TAPE" }[src], `C-R/PHONES SOURCE ${src}`))) : null,
        busKnob("cr", "level", "LEVEL", LAWS.master),
      ),
    );
  }
  if (def.solo) {
    const rude = led("led-rude", def.solo.mode === "switch" ? "SOLO" : "RUDE SOLO");
    view.soloLeds = { rude: rude.querySelector("i") };
    const mode =
      def.solo.mode === "switch"
        ? button(view, { label: "MODE: PFL", tone: "pfl", get: (s) => s.soloBus.mode === "pfl", onPress: () => store.setBus("soloBus", "mode", store.state.soloBus.mode === "pfl" ? "sip" : "pfl"), aria: (s) => `Solo MODE: ${s.soloBus.mode === "pfl" ? "PFL, before the fader (mono)" : "SOLO in place, after the fader and pan"}` })
        : Object.assign(document.createElement("p"), { className: "c16-note", textContent: "PFL: before the level" });
    blocks.push(block("SOLO", mode, rude));
  }
  if (def.xlrPad) blocks.push(block("XLR OUT", busButton("xlrPad", "on", "−30 dB PAD", "Main XLR output pad")));

  // Main level last, big (or the ALT 3-4 and MAIN MIX faders).
  if (def.layout.level === "fader") {
    const faders = [];
    if (def.alt?.fader) faders.push(fader(view, { label: "ALT 3-4", sheetLabel: "ALT 3-4 fader", get: (s) => s.alt.level, onInput: (v) => store.setBus("alt", "level", v) }));
    faders.push(fader(view, { label: def.main.label, sheetLabel: `${def.main.label} fader`, get: (s) => s.main.level, onInput: (v) => store.setBus("main", "level", v) }));
    blocks.push(block("MAIN", row("cm-master-faders", ...faders)));
    el.appendChild(row("c16-master-top cm-master-top", ...blocks));
    return el;
  }
  const main = knob(view, { label: def.main.label, sheetLabel: def.main.label, defaultValue: def.main.law === "master" ? 0.5 : 0.75, size: "big", tone: "level", format: lawFormat(LAWS[def.main.law]), onInput: (v) => store.setBus("main", "level", v) }, (s) => s.main.level);
  const limit = def.poweredAmp ? led("led-ol", "LIMITER") : null;
  if (limit) view.limitLed = limit.querySelector("i");
  blocks.push(block(def.poweredAmp ? `AMP ${def.poweredAmp.watts} W + ${def.poweredAmp.watts} W` : "MAIN", main, limit));

  el.appendChild(row("c16-master-top cm-master-top", ...blocks));
  return el;
}

// ---------- live display ----------

export function updateCompact(view, readings, now) {
  const s = view.store.state;
  for (const l of view.leds || []) {
    const r = readings.channels[l.index];
    if ((r ? r.peakDb : -Infinity) >= OL_DB) l.olUntil = now + 150;
    const on = now < l.olUntil;
    l.ol.classList.toggle("on", on);
  }
  for (const l of view.compLeds || []) l.el.classList.toggle("on", (readings.comp?.[l.index] || 0) < -1);
  if (view.fxLeds && readings.fx) {
    const f = view.fxLeds;
    if (readings.fx.peakDb >= OL_DB) f.clipUntil = now + 150;
    f.sig.classList.toggle("on", readings.fx.peakDb > -40);
    f.clip.classList.toggle("on", now < f.clipUntil);
  }
  const soloOn = s.channels.some((c) => !c.tape && c.solo) || ["aux1", "aux2"].some((b) => s[b]?.solo);
  if (view.soloLeds) view.soloLeds.rude.classList.toggle("on", soloOn && (view.def.solo.mode === "switch" || Math.floor(now / 400) % 2 === 0));
  let top = -Infinity;
  for (const m of view.ledMeters || []) {
    const r = m.side === "L" ? readings.meterL : readings.meterR;
    const peak = r ? r.peakDb : -Infinity;
    top = Math.max(top, peak);
    const dt = m.lastT ? (now - m.lastT) / 1000 : 0;
    m.lastT = now;
    m.level = Math.max(peak, m.level - RELEASE_DB_PER_S * dt);
    for (const seg of m.segs) seg.el.classList.toggle("on", m.level >= seg.db);
  }
  if (view.limitLed) view.limitLed.classList.toggle("on", top >= OL_DB);
}
