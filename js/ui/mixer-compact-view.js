// Draws a compact mixer (js/compact-defs.js) for MixerView: each strip from the
// definition's layout list, and the master section from what the mixer has.
// Every control writes through MixerStore; nothing here knows about audio nodes.

import { RangeControl, LitButton } from "./controls.js";
import { EQ_FOR, LAWS, OL_DB, reverbSetting, tapeIndex } from "../compact.js";
import { formatDb, formatPan } from "../levels.js";

const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });
const eqFormat = (v) => (Math.abs(v) < 0.25 ? "0 dB" : `${v > 0 ? "+" : "−"}${Math.abs(v)} dB`);
const RELEASE_DB_PER_S = 24;

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
      const l = led("led-ol", def.id === "mix8" ? "OL" : "PEAK");
      view.leds.push({ index: i, ol: l.querySelector("i"), olUntil: 0 });
      return l;
    },
    level: () =>
      knob(view, { label: "LEVEL", sheetLabel: `Ch ${n} level`, defaultValue: 0.75, size: "big", tone: "level", format: lawFormat(LAWS.level), onInput: set("level") }, (s) => ch(s).level),
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
        : knob(view, { label: d.label, sheetLabel: `Ch ${n} ${d.label} send`, defaultValue: 0, tone: d.bus === "aux2" ? "aux2" : d.bus === "reverb" ? "eq" : "aux1", format: lawFormat(LAWS[d.law]), onInput: set(`sends.${sid}`) }, (s) => ch(s).sends[sid]);
  }

  for (const key of def.layout.strip) {
    const built = parts[key] ? parts[key]() : null;
    if (built) el.appendChild(key === "head" || key === "level" ? built : row("c16-sec", built));
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
      ),
    );

  // Returns.
  if (def.returns?.length)
    blocks.push(
      block(
        def.returns.length > 1 ? "AUX RETURNS" : def.returns[0].label,
        ...def.returns.map((r) => (r.fixedDb !== undefined ? null : busKnob(r.id, "level", r.label.replace("AUX RETURN", "RET"), LAWS[r.law]))),
        ...def.returns.map((r) => (r.efxToMonitor ? busButton(r.id, "efx", "EFX TO MON", `${r.label} to ${def.buses[r.efxToMonitor].label} (effects to monitor)`) : null)),
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
        def.tape.level || "TAPE IN",
        head,
        def.tape.level ? knob(view, { label: def.tape.level, sheetLabel: `${def.tape.level} level`, defaultValue: 0.5, tone: "level", format: lawFormat(LAWS.ret20), onInput: (v) => store.setChannel(t, "level", v) }, (s) => s.channels[t].level) : null,
        def.tape.routing === "toMainOrCr"
          ? button(view, { label: "TO CR/PHONES", get: (s) => s.channels[t].toCr, onPress: () => store.setChannel(t, "toCr", !store.state.channels[t].toCr), aria: (s) => `TAPE IN goes ${s.channels[t].toCr ? "to the CR/PHONES only" : "to the MAIN mix"}` })
          : null,
        def.tape.routing === "crOnly" ? Object.assign(document.createElement("p"), { className: "c16-note", textContent: "Heard through C-R/PHONES (SOURCE: TAPE)" }) : null,
      ),
    );
  }

  if (def.alt) blocks.push(block("ALT 3-4", busButton("alt", "toMain", "ASSIGN TO MAIN", "ALT 3-4 assigned to the main mix")));

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
    const rude = led("led-rude", "RUDE SOLO");
    view.soloLeds = { rude: rude.querySelector("i") };
    blocks.push(block("SOLO", Object.assign(document.createElement("p"), { className: "c16-note", textContent: "PFL: before the level" }), rude));
  }
  if (def.xlrPad) blocks.push(block("XLR OUT", busButton("xlrPad", "on", "−30 dB PAD", "Main XLR output pad")));

  // Main level last, big.
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
  if (view.soloLeds) view.soloLeds.rude.classList.toggle("on", s.channels.some((c) => c.solo) && Math.floor(now / 400) % 2 === 0);
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
