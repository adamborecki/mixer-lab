// Compact analog mixers as data: the Mackie Mix8, Mackie 1202-VLZ, Yamaha
// MG10/2 and Yamaha STAGEPAS 400BT. One definition per mixer: its channels
// and jacks, gain stage, EQ, sends and where they tap, buses, returns, tape,
// phones and outputs. js/compact.js (state and level model), js/graph-compact.js
// (audio) and js/ui/mixer-compact-view.js (surface) read only this. No imports,
// so js/connection-model.js can build the rear panels from it.
// Sources: each maker's owner's manual / spec sheet (docs/COMPACT_MIXERS.md).

// EQ sets, top to bottom as printed on the strip.
export const EQ = {
  mackie3: [
    { id: "high", label: "HI", type: "highshelf", hz: 12000 },
    { id: "mid", label: "MID", type: "peaking", hz: 2500 },
    { id: "low", label: "LOW", type: "lowshelf", hz: 80 },
  ],
  yamaha3: [
    { id: "high", label: "HIGH", type: "highshelf", hz: 10000 },
    { id: "mid", label: "MID", type: "peaking", hz: 2500 },
    { id: "low", label: "LOW", type: "lowshelf", hz: 100 },
  ],
  stagepas2: [
    { id: "high", label: "HIGH", type: "highshelf", hz: 8000 },
    { id: "low", label: "LOW", type: "lowshelf", hz: 100 },
  ],
};

// Channel kinds:
//   mono    MIC (XLR) and/or LINE (1/4") jacks, a gain stage, one strip
//   stereo  L (MONO) + R line inputs (patched as a pair or L alone), one strip with BAL
// `jacks` lists the input jacks: mic, line, combo, linePair (L+R breakout),
// lineMono (L (MONO) alone), rcaPair, miniPair. One input per channel at a time.
// `gain`: { min, max, linePad } trim knob, or { switch: { mic, line } } (MIC/LINE
// switch, fixed gain), or { fixed } dB for line-only stereo channels.
// `insert`: where the INSERT jack taps, used as a send: "trim" (after the gain,
// before LOW CUT; Mackie) or "eq" (after the EQ, before the level; Yamaha).
// `sends`: ids of the def's `sends` this channel has. `mic` on a stereo channel:
// an XLR whose signal goes to the L side (MG10/2 3/4, 5/6).

export const COMPACT = {
  mix8: {
    id: "mix8",
    name: "Mackie Mix8",
    blurb: "2 mic channels, 2 stereo line channels, 1 aux (post-fader).",
    phantom: { label: "48V", channels: [0, 1] },
    channels: [
      { label: "1", kind: "mono", jacks: ["mic", "line"], gain: { min: 0, max: 50, linePad: -20 }, eq: "mackie3", sends: ["aux"], peak: true },
      { label: "2", kind: "mono", jacks: ["mic", "line"], gain: { min: 0, max: 50, linePad: -20 }, eq: "mackie3", sends: ["aux"], peak: true },
      { label: "3/4", kind: "stereo", jacks: ["lineMono", "linePair"], gain: { fixed: 0 }, eq: "mackie3", sends: ["aux"], peak: true },
      { label: "5/6", kind: "stereo", jacks: ["lineMono", "linePair"], gain: { fixed: 0 }, eq: "mackie3", sends: ["aux"], peak: true },
    ],
    // The Mix8's one AUX is after the channel LEVEL (post-fader).
    sends: { aux: { label: "AUX", bus: "aux1", tap: "post", law: "send15" } },
    buses: { aux1: { label: "AUX", master: { label: "AUX MASTER", law: "send15" } } },
    returns: [{ id: "ret1", label: "AUX RETURN", fixedDb: 0 }],
    tape: { level: null, routing: "toMainOrCr" }, // TAPE IN: one switch, TO MAIN or TO CR/PHONES
    main: { label: "MAIN MIX", law: "level" },
    phones: { label: "CR / PHONES", sources: null },
    meter: [-20, 0, 6, "OL"],
    outputs: ["main", "cr", "aux1", "tapeOut"],
    layout: { strip: ["head", "gain", "eq", "aux", "pan", "peak", "level"] },
  },

  vlz1202: {
    id: "vlz1202",
    name: "Mackie 1202-VLZ",
    blurb: "4 mic channels, 4 stereo line channels, 2 aux, MUTE/ALT 3-4, solo.",
    phantom: { label: "PHANTOM", channels: [0, 1, 2, 3] },
    channels: [
      ...[1, 2, 3, 4].map((n) => ({ label: String(n), kind: "mono", jacks: ["mic", "line"], gain: { min: 10, max: 60, linePad: -20 }, lowCut: { hz: 75, order: 3 }, insert: "trim", eq: "mackie3", sends: ["aux1", "aux2"], mute: "alt", solo: true, peak: true })),
      ...["5/6", "7/8", "9/10", "11/12"].map((label) => ({ label, kind: "stereo", jacks: ["lineMono", "linePair"], gain: { fixed: 0 }, eq: "mackie3", sends: ["aux1", "aux2"], mute: "alt", solo: true, peak: true })),
    ],
    // AUX 1 is pre- or post-fader for every channel at once (the PRE switch by its master).
    sends: {
      aux1: { label: "AUX 1", bus: "aux1", tap: "switch", law: "send15" },
      aux2: { label: "AUX 2", bus: "aux2", tap: "post", law: "send15" },
    },
    buses: {
      aux1: { label: "AUX 1", master: { label: "AUX 1 MASTER", law: "send15" }, preSwitch: true },
      aux2: { label: "AUX 2" },
    },
    returns: [
      { id: "ret1", label: "AUX RETURN 1", law: "ret20" },
      { id: "ret2", label: "AUX RETURN 2", law: "ret20", efxToMonitor: "aux1" },
    ],
    tape: { level: null, routing: "crOnly" },
    alt: { label: "ALT 3-4", assignToMain: true },
    main: { label: "MAIN MIX", law: "level" },
    phones: { label: "C-R / PHONES", sources: ["main", "alt", "tape"] },
    solo: { mode: "pfl" },
    xlrPad: true,
    meter: [-20, -10, -7, -4, -2, 0, 2, 4, 7, 10, 20, "CLIP"],
    outputs: ["mainXlr", "main", "alt", "cr", "aux1", "aux2", "tapeOut", "inserts"],
    layout: { strip: ["head", "gain", "lowCut", "aux1", "aux2", "eq", "pan", "mute", "peak", "solo", "level"] },
  },

  mg102: {
    id: "mg102",
    name: "Yamaha MG10/2",
    blurb: "2 mono + 4 stereo channels, one AUX knob: AUX1 pre / AUX2 post.",
    phantom: { label: "PHANTOM +48V", channels: [0, 1, 2, 3] },
    channels: [
      { label: "1", kind: "mono", jacks: ["mic", "line"], gain: { min: 16, max: 60, linePad: -26 }, lowCut: { hz: 80, order: 2, label: "80" }, insert: "eq", eq: "yamaha3", sends: ["auxPan"], peak: true },
      { label: "2", kind: "mono", jacks: ["mic", "line"], gain: { min: 16, max: 60, linePad: -26 }, lowCut: { hz: 80, order: 2, label: "80" }, insert: "eq", eq: "yamaha3", sends: ["auxPan"], peak: true },
      // Stereo channels with an XLR too: the mic feeds the L side; the HPF only acts on the mic.
      { label: "3/4", kind: "stereo", jacks: ["mic", "lineMono", "linePair"], gain: { min: 16, max: 60, linePad: -26 }, lowCut: { hz: 80, order: 2, label: "80", micOnly: true }, eq: "yamaha3", sends: ["auxPan"], peak: true },
      { label: "5/6", kind: "stereo", jacks: ["mic", "lineMono", "linePair"], gain: { min: 16, max: 60, linePad: -26 }, lowCut: { hz: 80, order: 2, label: "80", micOnly: true }, eq: "yamaha3", sends: ["auxPan"], peak: true },
      // Line-only stereo channels, 1/4" or RCA, built for −10 dBu gear.
      { label: "7/8", kind: "stereo", jacks: ["lineMono", "linePair", "rcaPair"], gain: { fixed: 14 }, eq: "yamaha3", sends: ["auxPan"], peak: true },
      { label: "9/10", kind: "stereo", jacks: ["lineMono", "linePair", "rcaPair"], gain: { fixed: 14 }, eq: "yamaha3", sends: ["auxPan"], peak: true },
    ],
    // One knob: left of centre feeds AUX1 (pre-fader), right feeds AUX2 (post-fader).
    sends: { auxPan: { label: "AUX", bipolar: { left: { bus: "aux1", tap: "pre" }, right: { bus: "aux2", tap: "post" } }, law: "yamahaAux" } },
    buses: { aux1: { label: "AUX1" }, aux2: { label: "AUX2" } },
    returns: [{ id: "ret1", label: "RETURN", law: "ret20" }],
    tape: { level: "2TR IN", routing: "toMain" }, // 2TR IN feeds the stereo bus
    main: { label: "ST", law: "level" },
    phones: { label: "C-R/PHONES", sources: null },
    meter: [-30, -20, -15, -10, -7, -5, -3, -1, 0, 1, 3, "CLIP"],
    outputs: ["main", "recOut", "cr", "aux1", "aux2", "inserts"],
    layout: { strip: ["head", "gain", "peak", "lowCut", "eq", "auxPan", "pan", "level"] },
  },

  stagepas400bt: {
    id: "stagepas400bt",
    name: "Yamaha STAGEPAS 400BT",
    blurb: "Powered mixer: the amp is inside. 4 mono + 2 stereo channels, reverb.",
    phantom: { label: "PHANTOM (CH1/2)", channels: [0, 1], volts: 30 },
    channels: [
      { label: "1", kind: "mono", jacks: ["mic"], gain: { switch: { mic: 35, line: 12 } }, eq: "stagepas2", sends: ["reverb"], peak: true },
      { label: "2", kind: "mono", jacks: ["mic"], gain: { switch: { mic: 35, line: 12 } }, eq: "stagepas2", sends: ["reverb"], peak: true },
      { label: "3", kind: "mono", jacks: ["combo"], gain: { switch: { mic: 35, line: 12 } }, eq: "stagepas2", sends: ["reverb"], peak: true },
      { label: "4", kind: "mono", jacks: ["combo"], gain: { switch: { mic: 35, line: 12 } }, hiZ: true, eq: "stagepas2", sends: ["reverb"], peak: true },
      { label: "5/6", kind: "stereo", jacks: ["lineMono", "linePair", "rcaPair"], gain: { fixed: 10 }, eq: "stagepas2", stMono: true, peak: true },
      { label: "7/8", kind: "stereo", jacks: ["lineMono", "linePair", "miniPair"], gain: { fixed: 10 }, eq: "stagepas2", stMono: true, peak: true, bluetooth: true },
    ],
    sends: { reverb: { label: "REVERB", bus: "reverb", tap: "post", law: "send15" } },
    buses: {},
    reverb: { types: ["HALL", "PLATE", "ROOM", "ECHO"] },
    monitorOut: { label: "MONITOR OUT" }, // a mix of the channels, not affected by MASTER LEVEL
    main: { label: "MASTER LEVEL", law: "master" },
    masterEq: true, // one knob: SPEECH … MUSIC … bass boost
    feedbackSuppressor: true,
    poweredAmp: { watts: 200, ohms: 4 },
    subOut: { hz: 120 },
    phones: null,
    meter: [-30, -18, -12, -6, 0, "LIMIT"],
    outputs: ["speakers", "monitor", "sub"],
    layout: { strip: ["head", "micLine", "hiZ", "eq", "reverb", "stMono", "peak", "level"] },
  },
};

// ---------- rear panels (used by js/connection-model.js) ----------

const out = (id, jack, name, extra = {}) => ({ id, dir: "out", jack, level: "line", role: "bus-out", side: "M", name, ...extra });

// The input and output ports of a compact mixer, from its definition.
export function compactPorts(def) {
  const ports = [];
  def.channels.forEach((ch, i) => {
    const n = ch.label;
    const base = { dir: "in", role: "channel-input", channel: i };
    const phantom = def.phantom.channels.includes(i);
    for (const j of ch.jacks) {
      if (j === "mic") ports.push({ ...base, id: `ch${i + 1}-mic`, jack: "xlr", level: "mic", path: "mic", phantom, name: `Ch ${n} MIC` });
      if (j === "line") ports.push({ ...base, id: `ch${i + 1}-line`, jack: "quarter", level: "line", path: "line", name: `Ch ${n} LINE` });
      if (j === "combo") ports.push({ ...base, id: `ch${i + 1}-in`, jack: "combo", level: "mic-or-line", phantom, name: `Ch ${n} input` });
      if (j === "lineMono") ports.push({ ...base, id: `ch${i + 1}-l`, jack: "quarter", level: "line", path: "line", pad: false, monoIn: true, name: `Ch ${n} L (MONO)` });
      if (j === "linePair") ports.push({ ...base, id: `ch${i + 1}-lr`, jack: "linepair", level: "line", path: "line", pad: false, stereo: true, name: `Ch ${n} L+R (1/4")` });
      if (j === "rcaPair") ports.push({ ...base, id: `ch${i + 1}-rca`, jack: "rcapair", level: "line", path: "line", pad: false, stereo: true, name: `Ch ${n} RCA L/R` });
      if (j === "miniPair") ports.push({ ...base, id: `ch${i + 1}-mini`, jack: "mini", level: "line", path: "line", pad: false, stereo: true, name: `Ch ${n} stereo mini` });
    }
  });
  // An effects return is a lone L (MONO) jack plus R; the reverb's outputs patch into them.
  for (const r of def.returns || []) {
    ports.push({ id: `${r.id}-l`, dir: "in", jack: "quarter", level: "line", role: "return-in", ret: Number(r.id.slice(3)), side: "L", name: `${r.label} L (MONO)` });
    ports.push({ id: `${r.id}-r`, dir: "in", jack: "quarter", level: "line", role: "return-in", ret: Number(r.id.slice(3)), side: "R", name: `${r.label} R` });
  }
  if (def.tape) ports.push({ id: "tape-in", dir: "in", jack: "rcapair", level: "line", stereo: true, pad: false, path: "line", role: "channel-input", channel: def.channels.length, name: def.tape.level === "2TR IN" ? "2TR IN (L/R)" : "TAPE IN (L/R)" });

  const o = def.outputs;
  const mainName = def.id === "mg102" ? "ST OUT" : "MAIN OUT";
  if (o.includes("mainXlr")) {
    ports.push(out("main-l", "xlr", `${mainName} L (XLR)`, { bus: "main", side: "L" }), out("main-r", "xlr", `${mainName} R (XLR)`, { bus: "main", side: "R" }));
    ports.push(out("line-l", "quarter", "LINE OUT L", { bus: "main", side: "L" }), out("line-r", "quarter", "LINE OUT R", { bus: "main", side: "R" }));
  } else if (o.includes("main")) {
    ports.push(out("main-l", "quarter", `${mainName} L`, { bus: "main", side: "L" }), out("main-r", "quarter", `${mainName} R`, { bus: "main", side: "R" }));
  }
  if (o.includes("alt")) ports.push(out("alt-l", "quarter", "ALT OUT L", { bus: "alt", side: "L" }), out("alt-r", "quarter", "ALT OUT R", { bus: "alt", side: "R" }));
  if (o.includes("cr")) ports.push(out("cr-l", "quarter", "C-R OUT L", { bus: "cr", side: "L" }), out("cr-r", "quarter", "C-R OUT R", { bus: "cr", side: "R" }));
  for (const b of ["aux1", "aux2"]) if (o.includes(b)) ports.push(out(b, "quarter", def.id === "mg102" ? `${def.buses[b].label} SEND` : `${def.buses[b].label} SEND`, { bus: b }));
  if (o.includes("tapeOut")) ports.push(out("tape-out-l", "rca", "TAPE OUT L", { bus: "main", side: "L" }), out("tape-out-r", "rca", "TAPE OUT R", { bus: "main", side: "R" }));
  if (o.includes("recOut")) ports.push(out("rec-out-l", "rca", "REC OUT L", { bus: "main", side: "L" }), out("rec-out-r", "rca", "REC OUT R", { bus: "main", side: "R" }));
  if (o.includes("inserts")) def.channels.forEach((ch, i) => ch.insert && ports.push(out(`ch${i + 1}-insert`, "quarter", `Ch ${ch.label} INSERT (send)`, { bus: `insert${i + 1}`, channel: i })));
  // STAGEPAS: the amp is inside, so its speaker jacks carry speaker level.
  if (o.includes("speakers")) ports.push(out("spk-l", "quarter", "SPEAKERS L", { level: "speaker", bus: "main", side: "L" }), out("spk-r", "quarter", "SPEAKERS R", { level: "speaker", bus: "main", side: "R" }));
  if (o.includes("monitor")) ports.push(out("mon-l", "quarter", "MONITOR OUT L (MONO)", { bus: "monitor", side: "L" }), out("mon-r", "quarter", "MONITOR OUT R", { bus: "monitor", side: "R" }));
  if (o.includes("sub")) ports.push(out("sub-out", "quarter", "SUBWOOFER OUT", { bus: "main", side: "M" }));
  return ports;
}
