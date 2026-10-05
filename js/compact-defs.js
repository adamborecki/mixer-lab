// Compact analog mixers as data: the Mackie Mix8, Mackie 1202-VLZ, Yamaha
// MG10/2, Yamaha STAGEPAS 400BT, Behringer Xenyx X1204USB, the Sound Devices
// 442 field mixer and the Soundcraft Ui16 digital mixer (`digital: true`, drawn
// by js/ui/mixer-digital-view.js). One definition per mixer: its channels and jacks, gain stage, EQ, sends and where they tap, buses, returns, tape,
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
  xenyx3: [
    { id: "high", label: "HI", type: "highshelf", hz: 12000 },
    { id: "mid", label: "MID", type: "peaking", hz: 2500 },
    { id: "low", label: "LOW", type: "lowshelf", hz: 80 },
  ],
  stagepas2: [
    { id: "high", label: "HIGH", type: "highshelf", hz: 8000 },
    { id: "low", label: "LOW", type: "lowshelf", hz: 100 },
  ],
  // B207MP3: one EQ for the whole box (MAIN EQ), ±15 dB.
  b207: [
    { id: "high", label: "HIGH", type: "highshelf", hz: 12000 },
    { id: "mid", label: "MID", type: "peaking", hz: 2500 },
    { id: "low", label: "LOW", type: "lowshelf", hz: 100 },
  ],
};

// Channel kinds:
//   mono    MIC (XLR) and/or LINE (1/4") jacks, a gain stage, one strip
//   stereo  L (MONO) + R line inputs (patched as a pair or L alone), one strip with BAL
// `jacks` lists the input jacks: mic, line, combo, linePair (L+R breakout),
// lineMono (L (MONO) alone), rcaPair, miniPair, xlrMicLine (one XLR for mic or
// line, 442). One input per channel at a time.
// `gain`: { min, max, linePad } trim knob (`lineSwitch`: the dB a MIC/LINE
// switch takes off at LINE, 442), or { switch: { mic, line } } (MIC/LINE
// switch, fixed gain), or { fixed } dB for line-only stereo channels
// (`minus10`: the dB a +4 dBu / −10 dBV LEVEL switch adds at −10, Xenyx).
// `comp`: a one-knob compressor after the low cut (Xenyx). `hpf`: a sweepable
// high-pass, off at the detent; `limiter`: an input limiter; `polarity`: a Ø
// switch (442). `peq`: a 4-band parametric EQ; `dyn`: a compressor with
// THRESHOLD, RATIO and GAIN (Ui16).
// `insert`: where the INSERT jack taps, used as a send: "trim" (after the gain,
// before LOW CUT; Mackie) or "eq" (after the EQ, before the level; Yamaha).
// `sends`: ids of the def's `sends` this channel has. `mic` on a stereo channel:
// an XLR whose signal goes to the L side (MG10/2 3/4, 5/6).
// Send taps: "pre" (after the EQ), "post" (after LEVEL and MUTE), "switch"
// (one PRE switch for the bus), "channel" (a PRE switch on each channel, after
// MUTE when post), "fader" (after LEVEL, before MUTE: the Xenyx FX send),
// "each" (PRE or POST per channel and per send, PRE to start: Ui16 auxes).
// A bus with `fx` is an internal effects unit: its master is the return level
// into the main mix, and it has no output jack (Ui16 REVERB, DELAY, CHORUS).

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
    peakLabel: "OL",
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

  // An active speaker with the mixer and the amp inside it: no speaker jacks,
  // because the box itself is the speaker. Each channel's LEVEL is its only
  // gain control (input trim, −∞ … +30 dB); one 3-band EQ and MAIN LEVEL shape
  // the box. THRU passes the mix on (before MAIN LEVEL and the EQ) to another
  // speaker. Not modelled: the MP3 player (USB), MAIN IN (another speaker's THRU).
  b207mp3: {
    id: "b207mp3",
    name: "Behringer EUROLIVE B207MP3",
    blurb: "An active speaker with a 4-channel mixer inside: the amp and the speaker are the same box.",
    phantom: { label: "PHANTOM", channels: [0, 1, 2] },
    channels: [
      { label: "1", kind: "mono", jacks: ["combo"], gain: { fixed: 16 } },
      { label: "2", kind: "mono", jacks: ["combo"], gain: { fixed: 16 }, hiZ: { label: "INSTRUMENT" } },
      { label: "3", kind: "mono", jacks: ["combo"], gain: { fixed: 16 } },
      // CD INPUT: an RCA pair summed into the one speaker; −10 dBu sensitivity.
      { label: "4", kind: "stereo", jacks: ["rcaPair"], gain: { fixed: -16 }, portName: "CD INPUT (RCA L/R)" },
    ],
    // LEVEL 1–4: the input trim and the channel level in one knob.
    levelLaw: "trim30",
    levelLabel: "LEVEL",
    levelIsGain: true,
    mono: true, // one speaker: no PAN, everything summed
    sends: {},
    buses: {},
    thru: { label: "THRU" },
    main: { label: "MAIN LEVEL", law: "master" },
    mainEq: "b207",
    poweredAmp: { watts: 150, ohms: 6, single: true },
    builtInSpeaker: { name: 'Built-in 6.5" speaker', zone: "foh" },
    phones: null,
    meter: null, // no meter: a power LED and the limiter
    outputs: ["builtIn", "thru"],
    layout: { strip: ["head", "hiZ", "level"] },
  },

  x1204usb: {
    id: "x1204usb",
    name: "Behringer Xenyx X1204USB",
    blurb: "4 mic channels with COMP, 2 stereo, AUX 1 (PRE) + FX into built-in effects, faders.",
    phantom: { label: "+48V", channels: [0, 1, 2, 3] },
    channels: [
      ...[1, 2, 3, 4].map((n) => ({ label: String(n), kind: "mono", jacks: ["mic", "line"], gain: { min: 10, max: 60, linePad: -20 }, lowCut: { hz: 75, order: 3 }, comp: true, eq: "xenyx3", sends: ["aux1", "fx"], mute: "alt", solo: true, peak: true })),
      ...["5/6", "7/8"].map((label) => ({ label, kind: "stereo", jacks: ["lineMono", "linePair"], gain: { fixed: 0, minus10: 12 }, eq: "xenyx3", sends: ["aux1", "fx"], mute: "alt", solo: true, peak: true })),
    ],
    // AUX 1 has a PRE switch on every channel; FX (AUX 2) is post-fader but
    // MUTE/ALT 3-4 doesn't cut it (owner's manual, 2.1.3).
    sends: {
      aux1: { label: "AUX 1", bus: "aux1", tap: "channel", law: "send15" },
      fx: { label: "FX", bus: "aux2", tap: "fader", law: "send15" },
    },
    buses: {
      aux1: { label: "AUX 1", master: { label: "AUX SEND 1", law: "send15" }, solo: true },
      aux2: { label: "FX", master: { label: "AUX SEND 2 (FX)", law: "send15" }, solo: true },
    },
    // The built-in effects listen to AUX SEND 2 and come back on STEREO AUX
    // RETURN 2, unless something is plugged into the RETURN 2 jacks.
    fx: {
      send: "aux2",
      ret: "ret2",
      presets: [
        { name: "HALL 1", kind: "reverb", seconds: 2.6 },
        { name: "HALL 2", kind: "reverb", seconds: 3.8 },
        { name: "ROOM 1", kind: "reverb", seconds: 0.7 },
        { name: "ROOM 2", kind: "reverb", seconds: 1.2 },
        { name: "PLATE 1", kind: "reverb", seconds: 1.5 },
        { name: "PLATE 2", kind: "reverb", seconds: 2.3 },
        { name: "AMBIENCE", kind: "reverb", seconds: 0.4 },
        { name: "DELAY", kind: "delay", seconds: 0.375, feedback: 0.35 },
        { name: "ECHO", kind: "delay", seconds: 0.5, feedback: 0.55 },
        { name: "SLAPBACK", kind: "delay", seconds: 0.11, feedback: 0 },
        { name: "CHORUS 1", kind: "chorus", rate: 0.8, depth: 0.004 },
        { name: "CHORUS 2", kind: "chorus", rate: 1.6, depth: 0.006 },
        { name: "FLANGER 1", kind: "flanger", rate: 0.25, depth: 0.002 },
        { name: "FLANGER 2", kind: "flanger", rate: 0.6, depth: 0.003 },
        { name: "CHORUS + REVERB", kind: "chorus", rate: 0.8, depth: 0.004, reverb: 2 },
        { name: "DELAY + REVERB", kind: "delay", seconds: 0.375, feedback: 0.3, reverb: 2 },
      ],
    },
    returns: [
      { id: "ret1", label: "STEREO AUX RETURN 1", law: "ret20", toMonitor: { bus: "aux1", label: "MON", law: "ret20" } },
      { id: "ret2", label: "STEREO AUX RETURN 2 (FX)", law: "ret20", toAlt: true },
    ],
    tape: { level: null, routing: "switch", label: "CD/TAPE" }, // CD/TAPE TO MAIN switch; C-R SOURCE TAPE
    alt: { label: "ALT 3-4", fader: true },
    main: { label: "MAIN MIX", law: "level" },
    phones: { label: "PHONES/CTRL R", sources: ["tape", "alt", "main"] },
    solo: { mode: "switch" }, // MODE: PFL (pressed) or SOLO in place
    meter: [-30, -20, -10, -7, -4, -2, 0, 2, 4, 7, 10, "CLIP"],
    peakLabel: "CLIP",
    outputs: ["mainXlrOnly", "alt", "cr", "aux1", "aux2", "tapeOut"],
    layout: { strip: ["head", "gain", "lowCut", "comp", "eq", "aux1", "fx", "minus10", "pan", "peak", "mute", "solo", "level"], level: "fader" },
  },

  sd442: {
    id: "sd442",
    name: "Sound Devices 442",
    blurb: "4-input field mixer: GAIN + fader, sweepable HPF, limiters, MIC/−10/LINE outputs, tone.",
    field: true,
    phantom: { label: "P48", channels: [0, 1, 2, 3], perChannel: true },
    channels: [1, 2, 3, 4].map((n) => ({ label: String(n), kind: "mono", jacks: ["xlrMicLine"], gain: { min: 22, max: 60, lineSwitch: -40 }, hpf: { min: 80, max: 240 }, limiter: true, polarity: n === 2, sends: [], solo: true, peak: true })),
    link: { pair: [0, 1] }, // 1+2 LINK: one stereo pair on channel 1's fader, its PAN a balance
    sends: {},
    buses: {},
    levelLaw: "sdFader", // channel faders: off … 0 (centre) … +15
    main: { label: "MASTER", law: "master6" },
    outputLimiter: { thresholdDb: -3 }, // LIM: OFF, ON (two limiters) or LINK (one stereo limiter)
    tone: { hz: 1000, earSaverDb: -20 }, // 1 kHz at 0 dBu on the outputs; the phones 20 dB down
    outLevel: { labels: ["MIC", "−10", "LINE"], db: [-40, -14, 0] }, // XLR OUTPUT LEVEL switch
    phones: { label: "HEADPHONE", selector: ["OFF", "L", "R", "M", "ST"] },
    solo: { mode: "pfl", label: "PFL" },
    meter: [-40, -30, -24, -20, -16, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12, 16, "LIM"],
    peakLabel: "PEAK",
    outputs: ["xlrSwitched", "tapeMini"],
    layout: { strip: ["head", "micLine", "phantom", "gain", "hpf", "polarity", "limitLed", "peak", "solo", "pan", "level"] },
  },

  ui16: {
    id: "ui16",
    name: "Soundcraft Ui16",
    blurb: "Digital: 12 mic inputs, 4 auxes, 3 effects. Pick a mix, and the faders become its sends; SEL a channel to edit it.",
    digital: true,
    phantom: { label: "48V", channels: Array.from({ length: 12 }, (_, i) => i), perChannel: true },
    channels: [
      ...Array.from({ length: 12 }, (_, i) => ({
        label: String(i + 1),
        kind: "mono",
        jacks: i < 8 ? ["combo"] : ["mic"],
        gain: { min: -6, max: 57, linePad: -20 },
        hpf: { min: 20, max: 600 },
        peq: true,
        dyn: true,
        polarity: true,
        hiZ: i < 2,
        sends: ["aux1", "aux2", "aux3", "aux4", "fx1", "fx2", "fx3"],
        mute: "mute",
        solo: true,
        peak: true,
      })),
      { label: "13/14", kind: "stereo", jacks: ["rcaPair"], gain: { min: -20, max: 20 }, peq: true, dyn: true, sends: ["aux1", "aux2", "aux3", "aux4", "fx1", "fx2", "fx3"], mute: "mute", solo: true, peak: true },
    ],
    sends: {
      ...Object.fromEntries([1, 2, 3, 4].map((n) => [`aux${n}`, { label: `AUX ${n}`, bus: `aux${n}`, tap: "each", law: "level" }])),
      fx1: { label: "REVERB", bus: "fx1", tap: "post", law: "level" },
      fx2: { label: "DELAY", bus: "fx2", tap: "post", law: "level" },
      fx3: { label: "CHORUS", bus: "fx3", tap: "post", law: "level" },
    },
    buses: {
      ...Object.fromEntries([1, 2, 3, 4].map((n) => [`aux${n}`, { label: `AUX ${n}`, master: { label: `AUX ${n}`, law: "level" } }])),
      fx1: { label: "REVERB", master: { label: "REVERB", law: "level" }, fx: { name: "Lexicon reverb", kind: "reverb", seconds: 2.2, number: 1 } },
      fx2: { label: "DELAY", master: { label: "DELAY", law: "level" }, fx: { name: "Delay", kind: "delay", seconds: 0.375, feedback: 0.35, number: 2 } },
      fx3: { label: "CHORUS", master: { label: "CHORUS", law: "level" }, fx: { name: "Chorus", kind: "chorus", rate: 0.8, depth: 0.004, number: 3 } },
    },
    muteCutsPre: true, // a muted channel leaves every mix, its pre-fader aux sends too
    auxOut: "xlr",
    main: { label: "MASTER", law: "level" },
    phones: { label: "PHONES", sources: null },
    solo: { mode: "pfl", label: "SOLO" },
    meter: [-40, -30, -20, -12, -6, -3, 0, "CLIP"],
    peakLabel: "CLIP",
    outputs: ["mainXlrOnly", "aux1", "aux2", "aux3", "aux4"],
    layout: { kind: "digital" },
  },

  // Behringer X32 Compact (user manual): 16 local XLR inputs, 8 XLR outputs
  // (by default mix buses 1–6 on 1–6, Main L/R on 7–8), input faders on layers,
  // a separate bank for DCA groups and bus masters, Sends on Faders, 8 DCAs,
  // 6 mute groups, a Main LR switch on every channel. Drawn by js/ui/mixer-x32-view.js.
  x32c: {
    id: "x32c",
    name: "Behringer X32 Compact",
    blurb: "Digital console: 16 inputs on fader layers, a selected-channel strip, 6 mix buses, 8 DCA groups, 6 mute groups, Sends on Faders.",
    digital: true,
    phantom: { label: "48V", channels: Array.from({ length: 16 }, (_, i) => i), perChannel: true },
    channels: [
      ...Array.from({ length: 16 }, (_, i) => ({
        label: String(i + 1).padStart(2, "0"),
        kind: "mono",
        jacks: ["mic"],
        gain: { min: -12, max: 60 },
        hpf: { min: 20, max: 400 },
        peq: true,
        dyn: true,
        polarity: true,
        sends: ["mix1", "mix2", "mix3", "mix4", "mix5", "mix6", "fx1", "fx2"],
        mute: "mute",
        solo: true,
        peak: true,
      })),
      // AUX IN 1/2 (rear ¼" TRS), on the AUX/FX layer as one stereo strip.
      { label: "AUX 1/2", kind: "stereo", jacks: ["linePair"], gain: { min: -12, max: 20 }, peq: true, dyn: true, sends: ["mix1", "mix2", "mix3", "mix4", "mix5", "mix6", "fx1", "fx2"], mute: "mute", solo: true, peak: true },
    ],
    sends: {
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`mix${n}`, { label: `MIX ${n}`, bus: `mix${n}`, tap: "each", pre: false, law: "level" }])),
      fx1: { label: "FX 1", bus: "fx1", tap: "post", law: "level" },
      fx2: { label: "FX 2", bus: "fx2", tap: "post", law: "level" },
    },
    buses: {
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`mix${n}`, { label: `MIX ${n}`, master: { label: `MIX ${n}`, law: "level" }, mute: true }])),
      fx1: { label: "FX 1", master: { label: "FX 1 RTN", law: "level" }, fx: { name: "Hall reverb", kind: "reverb", seconds: 2.4, number: 1 } },
      fx2: { label: "FX 2", master: { label: "FX 2 RTN", law: "level" }, fx: { name: "Stereo delay", kind: "delay", seconds: 0.375, feedback: 0.35, number: 2 } },
    },
    muteCutsPre: true, // a channel MUTE (or its mute group, or a muted DCA) silences its bus sends too
    lrSwitch: true, // MAIN LR: each channel reaches the main mix only with it on
    dca: 8,
    muteGroups: 6,
    mainMute: true,
    auxOut: "xlr",
    aes50: true, // AES50 A: an SD8 or S32 on Cat5; ROUTING picks LOCAL or AES50-A per block of 8 inputs
    main: { label: "MAIN LR", law: "level" },
    phones: { label: "PHONES", sources: null },
    solo: { mode: "pfl", label: "SOLO" },
    meter: [-54, -48, -42, -36, -30, -24, -18, -12, -6, "CLIP"],
    peakLabel: "CLIP",
    outputs: ["x32Outs"],
    layout: { kind: "x32" },
    surface: {
      inputLayers: [
        { id: "ch1", label: "CH 1-8", channels: [0, 1, 2, 3, 4, 5, 6, 7] },
        { id: "ch9", label: "CH 9-16", channels: [8, 9, 10, 11, 12, 13, 14, 15] },
        { id: "aux", label: "AUX / FX", channels: [16], fx: ["fx1", "fx2"] },
      ],
      groupLayers: [
        { id: "dca", label: "DCA 1-8" },
        { id: "bus", label: "BUS 1-8", buses: ["mix1", "mix2", "mix3", "mix4", "mix5", "mix6"] },
      ],
      bank: 8,
    },
  },

  // Yamaha 01V96i (Reference Manual): INPUT 1–12 (XLR A or TRS B, PAD, GAIN,
  // phantom in groups of four on the rear panel), INPUT 13–16 (line), 2TR IN,
  // 16 faders on LAYERs with ON / SOLO / SEL, FADER MODE (AUX 1–8), the SELECTED
  // CHANNEL section, the display with DISPLAY ACCESS pages, ST IN 1–2 (effects
  // returns), STEREO OUT, OMNI OUT 1–4. Drawn by js/ui/mixer-01v96-view.js.
  yam01v96: {
    id: "yam01v96",
    name: "Yamaha 01V96i",
    blurb: "Digital console: 16 faders on layers, FADER MODE for the aux sends, a SELECTED CHANNEL section and a display you page through.",
    digital: true,
    phantom: { label: "+48V", channels: Array.from({ length: 12 }, (_, i) => i), perChannel: true, groups: [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]] },
    channels: [
      ...Array.from({ length: 12 }, (_, i) => ({
        label: String(i + 1),
        kind: "mono",
        jacks: ["mic", "line"],
        gain: { min: 16, max: 60, linePad: 0, pad: 20 },
        peq: true,
        dyn: true,
        polarity: true,
        sends: ["aux1", "aux2", "aux3", "aux4", "aux5", "aux6", "aux7", "aux8"],
        mute: "on",
        solo: true,
        peak: true,
      })),
      ...Array.from({ length: 4 }, (_, k) => ({
        label: String(13 + k),
        kind: "mono",
        jacks: ["line"],
        gain: { min: -4, max: 26, linePad: 0 },
        peq: true,
        dyn: true,
        polarity: true,
        sends: ["aux1", "aux2", "aux3", "aux4", "aux5", "aux6", "aux7", "aux8"],
        mute: "on",
        solo: true,
        peak: true,
      })),
    ],
    sends: {
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`aux${n}`, { label: `AUX ${n}`, bus: `aux${n}`, tap: "each", pre: false, law: "level" }])),
      aux7: { label: "AUX 7", bus: "aux7", tap: "each", pre: false, law: "level" },
      aux8: { label: "AUX 8", bus: "aux8", tap: "each", pre: false, law: "level" },
    },
    buses: {
      ...Object.fromEntries([1, 2, 3, 4].map((n) => [`aux${n}`, { label: `AUX ${n}`, master: { label: `AUX ${n}`, law: "level" }, mute: true }])),
      ...Object.fromEntries([5, 6].map((n) => [`aux${n}`, { label: `AUX ${n}`, master: { label: `AUX ${n}`, law: "level" }, mute: true, noOut: true }])),
      // AUX 7 and 8 feed effects 1 and 2, which return on ST IN 1 and 2.
      aux7: { label: "AUX 7", master: { label: "ST IN 1", law: "level" }, fx: { name: "Reverb Hall (FX 1)", kind: "reverb", seconds: 2.6, number: 1 } },
      aux8: { label: "AUX 8", master: { label: "ST IN 2", law: "level" }, fx: { name: "Mono Delay (FX 2)", kind: "delay", seconds: 0.4, feedback: 0.3, number: 2 } },
    },
    prePoint: true, // AUX SETUP: PRE POINT, pre-fader sends before (PRE ON) or after (POST ON) the [ON] key
    lrSwitch: true, // ROUTING: TO ST (to the stereo bus)
    mainMute: true, // STEREO [ON]
    tape: { level: null, routing: "switch", label: "2TR" }, // 2TR IN, into AD 15/16 with its selector
    main: { label: "STEREO", law: "level" },
    phones: { label: "PHONES", sources: null },
    solo: { mode: "pfl", label: "SOLO" },
    meter: [-48, -36, -30, -24, -18, -15, -12, -9, -6, -3, 0, "OVER"],
    peakLabel: "PEAK",
    outputs: ["omni"],
    layout: { kind: "01v96" },
  },

  // Zoom F8n Pro (Operation Manual and Menu List): an 8-input field recorder
  // with a mixer inside. Each input records its own track (the isos) and also
  // feeds the L/R mix through its track knob (fader) and pan. MAIN OUT 1/2
  // (TA3) carry L/R, or tracks routed pre- or post-fader; SUB OUT (3.5 mm) the
  // mix for a camera. Used beside a FOH desk it is a submixer: its own mix,
  // its own outputs, and it records everything. Drawn by js/ui/mixer-f8-view.js.
  f8n: {
    id: "f8n",
    name: "Zoom F8n Pro",
    blurb: "Field recorder + mixer: 8 inputs (TRIM, +48V, HPF, phase), track knobs into an L/R mix, MAIN OUT routing, SUB OUT for a camera.",
    field: true,
    phantom: { label: "+48V", channels: [0, 1, 2, 3, 4, 5, 6, 7], perChannel: true },
    channels: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      label: String(n),
      kind: "mono",
      jacks: ["combo"],
      // TRIM: +10 … +75 dB on a mic (XLR); the line (TRS) path is 20 dB lower.
      gain: { min: 10, max: 75, linePad: -20 },
      hpf: { min: 10, max: 240 },
      polarity: true,
      sends: ["bus1", "bus2"],
      mute: "track", // the track key: unlit, the input is off (not in the mix, not recorded)
      solo: true,
      peak: true,
    })),
    sends: {
      // MAIN OUT routing: each track to MAIN OUT 1 and 2, prefader or postfader (or off).
      bus1: { label: "MAIN OUT 1", bus: "bus1", tap: "each", pre: true, law: "assign" },
      bus2: { label: "MAIN OUT 2", bus: "bus2", tap: "each", pre: true, law: "assign" },
    },
    buses: {
      bus1: { label: "MAIN OUT 1 tracks", master: { label: "MAIN OUT 1", law: "level" } },
      bus2: { label: "MAIN OUT 2 tracks", master: { label: "MAIN OUT 2", law: "level" } },
    },
    link: { pair: [6, 7] }, // Stereo Link 7/8 (the lab links one pair)
    levelLaw: "f8Fader",
    routing: {
      outputs: ["out1", "out2"],
      names: { out1: "MAIN OUT 1 (TA3)", out2: "MAIN OUT 2 (TA3)" },
      sources: ["off", "main-l", "main-r", "bus1", "bus2"],
      start: { out1: "main-l", out2: "main-r" },
    },
    // Output Level: MAIN OUT 1/2 LINE (+4 dBu) or NORMAL (−10 dBV); SUB OUT NORMAL or MIC (−40 dBV).
    outSwitches: [
      { key: "mainLevel", ports: ["out1", "out2"], labels: ["LINE +4", "NORMAL −10"], levels: ["line", "tape"], db: [0, -14], start: 0 },
      { key: "subLevel", ports: ["sub-out"], labels: ["NORMAL −10", "MIC −40"], levels: ["tape", "mic"], db: [-14, -40], start: 1 },
    ],
    main: { label: "L/R", law: "level" },
    phones: { label: "HEADPHONE", sources: null },
    solo: { mode: "pfl", label: "PFL" },
    meter: [-48, -36, -24, -18, -12, -6, 0, "CLIP"],
    peakLabel: "CLIP",
    outputs: ["f8"],
    layout: { kind: "f8" },
  },

  // Yamaha DM2000 (DM2000 V2 Quick Start Guide): 96 input channels on layers
  // of 24 faders, 24 analog inputs with GAIN, PAD and +48V on the top panel,
  // 8 buses (ROUTING keys 1–8, BUS TO ST), 12 auxes, 4 matrices, STEREO with
  // its own outputs, OMNI OUT 1–8 set by the OUTPUT PATCH, 8 effects (default
  // AUX → FX → channels 73–88), fader groups A–H and mute groups I–P, 99 scenes.
  // The lab builds the 24 analog inputs, 2TR IN on 89/90, AUX 1–8, BUS 1–8.
  dm2000: {
    id: "dm2000",
    name: "Yamaha DM2000",
    blurb: "A large-format digital console: 24 analog inputs, layers of 24 faders with encoders, a full SELECTED CHANNEL section, 8 buses with BUS TO ST, OUTPUT PATCH, fader and mute groups.",
    digital: true,
    phantom: { label: "+48V", channels: Array.from({ length: 24 }, (_, i) => i), perChannel: true },
    channels: [
      ...Array.from({ length: 24 }, (_, i) => ({
        label: String(i + 1),
        kind: "mono",
        jacks: ["mic", "line"],
        gain: { min: 16, max: 60, linePad: 0, pad: 20 },
        peq: true,
        dyn: true,
        polarity: true,
        sends: ["aux1", "aux2", "aux3", "aux4", "aux5", "aux6", "aux7", "aux8", "bus1", "bus2", "bus3", "bus4", "bus5", "bus6", "bus7", "bus8"],
        mute: "on",
        solo: true,
        peak: true,
      })),
      { label: "89/90", kind: "stereo", jacks: ["linePair"], portName: "2TR IN 1 (CH 89/90)", gain: { min: -6, max: 20 }, peq: true, dyn: true, sends: ["aux1", "aux2", "aux3", "aux4", "aux5", "aux6", "aux7", "aux8", "bus1", "bus2", "bus3", "bus4", "bus5", "bus6", "bus7", "bus8"], mute: "on", solo: true, peak: true },
    ],
    sends: {
      ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`aux${n}`, { label: `AUX ${n}`, bus: `aux${n}`, tap: "each", pre: false, law: "level" }])),
      // ROUTING keys 1–8: the channel goes to the bus at unity, after its fader.
      ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`bus${n}`, { label: `BUS ${n}`, bus: `bus${n}`, tap: "post", law: "assign", routing: true }])),
    },
    buses: {
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`aux${n}`, { label: `AUX ${n}`, master: { label: `AUX ${n}`, law: "level" }, mute: true }])),
      // AUX 7 and 8 feed effects 1 and 2, which return on channels 73/74 and 75/76.
      aux7: { label: "AUX 7", master: { label: "CH 73/74 (FX 1)", law: "level" }, fx: { name: "REV-X Hall (FX 1)", kind: "reverb", seconds: 2.2, number: 1 } },
      aux8: { label: "AUX 8", master: { label: "CH 75/76 (FX 2)", law: "level" }, fx: { name: "Mono Delay (FX 2)", kind: "delay", seconds: 0.4, feedback: 0.3, number: 2 } },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`bus${n}`, { label: `BUS ${n}`, master: { label: `BUS ${n}`, law: "level" }, mute: true }])),
    },
    busToMain: true, // BUS TO ST: a bus into the STEREO bus with its own pan (a subgroup)
    matrix: 4,
    scenes: 8,
    routing: {
      outputs: Array.from({ length: 8 }, (_, k) => `out${k + 1}`),
      names: Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`out${k + 1}`, `OMNI OUT ${k + 1}`])),
      sources: ["off", "main-l", "main-r", ...[1, 2, 3, 4, 5, 6].map((n) => `aux${n}`), ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `bus${n}`), "mtx1", "mtx2", "mtx3", "mtx4"],
      // The lab's patch: AUX 1–6 on OMNI OUT 1–6 (the factory default also puts AUX 7–8 there).
      start: Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`out${n}`, `aux${n}`])),
    },
    muteCutsPre: true,
    lrSwitch: true, // ROUTING: STEREO
    mainMute: true, // STEREO [ON]
    faderGroups: ["a", "b", "c", "d", "e", "f", "g", "h"],
    muteGroups: 8, // shown as I–P; the ON keys of a group's channels are linked (no master)
    main: { label: "STEREO", law: "level" },
    phones: { label: "PHONES", sources: null },
    solo: { mode: "pfl", label: "SOLO" },
    meter: [-60, -48, -36, -24, -18, -12, -6, 0, "OVER"],
    peakLabel: "OVER",
    outputs: ["stereoRouted"],
    layout: { kind: "dm2000" },
    surface: { terms: { onKey: true, main: "STEREO", mainL: "ST L", mainR: "ST R", lr: "STEREO" } }, // words for the shared panels
  },

  // Behringer X32 (full size, user manual): 32 local XLR inputs, 16 input
  // faders on layers, 8 group faders (DCA, BUS 1-8, BUS 9-16, MATRIX), 16 mix
  // buses (each can also feed MAIN LR as a subgroup), the MONO/CENTER bus,
  // 6 matrices, an FX rack on buses 13–16 returning on FX RTN 1–4, output
  // ROUTING for the 16 XLR outs, and SCENES. Drawn by js/ui/mixer-x32-view.js.
  x32: {
    id: "x32",
    name: "Behringer X32",
    blurb: "The full console: 32 inputs, 16 mix buses (also subgroups), MONO/CENTER, 6 matrices, an FX rack, output routing and scenes.",
    digital: true,
    phantom: { label: "48V", channels: Array.from({ length: 32 }, (_, i) => i), perChannel: true },
    channels: [
      ...Array.from({ length: 32 }, (_, i) => ({
        label: String(i + 1).padStart(2, "0"),
        kind: "mono",
        jacks: ["mic"],
        gain: { min: -12, max: 60 },
        hpf: { min: 20, max: 400 },
        peq: true,
        dyn: true,
        polarity: true,
        sends: Array.from({ length: 16 }, (_, k) => `mix${k + 1}`),
        mute: "mute",
        solo: true,
        peak: true,
      })),
      { label: "AUX 1/2", kind: "stereo", jacks: ["linePair"], gain: { min: -12, max: 20 }, peq: true, dyn: true, sends: Array.from({ length: 16 }, (_, k) => `mix${k + 1}`), mute: "mute", solo: true, peak: true },
    ],
    sends: Object.fromEntries(Array.from({ length: 16 }, (_, k) => [`mix${k + 1}`, { label: `MIX ${k + 1}`, bus: `mix${k + 1}`, tap: k < 12 ? "each" : "post", pre: false, law: "level" }])),
    buses: {
      ...Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`mix${k + 1}`, { label: `MIX ${k + 1}`, master: { label: `MIX ${k + 1}`, law: "level" }, mute: true }])),
      // The FX rack: MIX 13–16 feed FX 1–4; their returns (FX RTN 1–4) come back into MAIN LR.
      mix13: { label: "MIX 13", master: { label: "FX 1 RTN", law: "level" }, fx: { name: "Vintage Room (FX 1)", kind: "reverb", seconds: 1.4, number: 1 } },
      mix14: { label: "MIX 14", master: { label: "FX 2 RTN", law: "level" }, fx: { name: "Plate Reverb (FX 2)", kind: "reverb", seconds: 2.4, number: 5 } },
      mix15: { label: "MIX 15", master: { label: "FX 3 RTN", law: "level" }, fx: { name: "Stereo Delay (FX 3)", kind: "delay", seconds: 0.375, feedback: 0.35, number: 8 } },
      mix16: { label: "MIX 16", master: { label: "FX 4 RTN", law: "level" }, fx: { name: "Stereo Chorus (FX 4)", kind: "chorus", rate: 0.8, depth: 0.004, number: 11 } },
    },
    busToMain: true, // a MIX bus master can be assigned to MAIN LR (with its own PAN): a subgroup
    mc: true, // MONO/CENTER bus: a post-fader send per channel, its own fader
    matrix: 6, // MATRIX 1–6: fed from MAIN LR, M/C and MIX 1–12
    scenes: 8,
    routing: {
      outputs: Array.from({ length: 16 }, (_, k) => `out${k + 1}`),
      sources: ["off", "main-l", "main-r", "mc", ...Array.from({ length: 12 }, (_, k) => `mix${k + 1}`), ...Array.from({ length: 6 }, (_, k) => `mtx${k + 1}`)],
      // The lab's starting patch: MIX 1–8 on XLR OUT 1–8, MAIN L/R on 15/16, the rest off.
      start: { ...Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`out${k + 1}`, `mix${k + 1}`])), out15: "main-l", out16: "main-r" },
    },
    muteCutsPre: true,
    lrSwitch: true,
    dca: 8,
    muteGroups: 6,
    mainMute: true,
    // AES50 A on the rear panel: a stage box (S32, SD8) on Cat5. ROUTING picks, per
    // block of 8 channels, LOCAL jacks or AES50-A (rig device `inSource`, 0 / 1).
    aes50: true,
    main: { label: "MAIN LR", law: "level" },
    phones: { label: "PHONES", sources: null },
    solo: { mode: "pfl", label: "SOLO" },
    meter: [-54, -48, -42, -36, -30, -24, -18, -12, -6, "CLIP"],
    peakLabel: "CLIP",
    outputs: ["routed"],
    layout: { kind: "x32" },
    surface: {
      inputLayers: [
        { id: "ch1", label: "CH 1-16", channels: Array.from({ length: 16 }, (_, i) => i) },
        { id: "ch17", label: "CH 17-32", channels: Array.from({ length: 16 }, (_, i) => i + 16) },
        { id: "aux", label: "AUX IN / USB", channels: [32] },
        { id: "fx", label: "FX RETURNS", fx: ["mix13", "mix14", "mix15", "mix16"] },
        { id: "bm", label: "BUS MASTER", buses: Array.from({ length: 16 }, (_, k) => `mix${k + 1}`) },
      ],
      groupLayers: [
        { id: "dca", label: "DCA 1-8" },
        { id: "bus", label: "BUS 1-8", buses: ["mix1", "mix2", "mix3", "mix4", "mix5", "mix6", "mix7", "mix8"] },
        { id: "bus9", label: "BUS 9-16", buses: ["mix9", "mix10", "mix11", "mix12", "mix13", "mix14", "mix15", "mix16"] },
        { id: "mtx", label: "MATRIX", buses: ["mtx1", "mtx2", "mtx3", "mtx4", "mtx5", "mtx6", "mc"] },
      ],
      bank: 16,
    },
  },
  // Yamaha CL3 (CL5/CL3/CL1 Reference Manual): 64 mono + 8 stereo inputs on
  // the real desk, Rio3224-D stage boxes over Dante; the lab uses 32 of them.
  // 16 faders in the INPUT section, 8 in Centralogic, STEREO in the master
  // section. SELECTED CHANNEL knobs left of the touch screen.
  cl3: {
    id: "cl3",
    name: "Yamaha CL3",
    blurb: "A touring console: Rio stage box inputs, Centralogic, a touch screen with OVERVIEW and SELECTED CHANNEL VIEW, 16 DCAs, 8 matrices, scenes.",
    digital: true,
    phantom: { label: "+48V", channels: Array.from({ length: 32 }, (_, i) => i), perChannel: true },
    channels: [
      ...Array.from({ length: 32 }, (_, i) => ({
        label: String(i + 1),
        kind: "mono",
        jacks: ["mic", "dante"],
        portName: `RIO IN ${i + 1} (CH ${i + 1})`,
        gain: { min: -6, max: 66 },
        hpf: { min: 20, max: 600 },
        peq: true,
        dyn: true,
        polarity: true,
        sends: Array.from({ length: 16 }, (_, k) => `mix${k + 1}`),
        mute: "mute",
        solo: true,
        peak: true,
      })),
      { label: "ST IN 1", kind: "stereo", jacks: ["linePair"], portName: "OMNI IN 1/2 (ST IN 1)", gain: { min: -6, max: 20 }, peq: true, dyn: true, sends: Array.from({ length: 16 }, (_, k) => `mix${k + 1}`), mute: "mute", solo: true, peak: true },
    ],
    sends: Object.fromEntries(Array.from({ length: 16 }, (_, k) => [`mix${k + 1}`, { label: `MIX ${k + 1}`, bus: `mix${k + 1}`, tap: k < 12 ? "each" : "post", pre: false, law: "level" }])),
    buses: {
      ...Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`mix${k + 1}`, { label: `MIX ${k + 1}`, master: { label: `MIX ${k + 1}`, law: "level" }, mute: true }])),
      // The virtual rack: MIX 13–16 feed effects 1–4, which return on ST IN 2–5.
      mix13: { label: "MIX 13", master: { label: "ST IN 2 (FX 1)", law: "level" }, fx: { name: "REV-X Hall (FX 1)", kind: "reverb", seconds: 1.8, number: 1 } },
      mix14: { label: "MIX 14", master: { label: "ST IN 3 (FX 2)", law: "level" }, fx: { name: "REV-X Plate (FX 2)", kind: "reverb", seconds: 2.4, number: 2 } },
      mix15: { label: "MIX 15", master: { label: "ST IN 4 (FX 3)", law: "level" }, fx: { name: "Mono Delay (FX 3)", kind: "delay", seconds: 0.375, feedback: 0.35, number: 3 } },
      mix16: { label: "MIX 16", master: { label: "ST IN 5 (FX 4)", law: "level" }, fx: { name: "Chorus (FX 4)", kind: "chorus", rate: 0.8, depth: 0.004, number: 4 } },
    },
    busToMain: true, // a FIXED-type MIX can go to the STEREO bus: a group
    dante: { rx: 32 }, // Dante receive channels 1–32 (Dante Controller subscriptions: rig device `danteRx`)
    // RIO IN 1–32 and RIO OUT 1–16 are on the Rio3224-D on stage, not on the console:
    // it reaches the CL3 over the Dante network (drawn by the Stage & patch diagram).
    rio: { name: "Yamaha Rio3224-D", sub: "stage box · Dante" },
    matrix: 8,
    scenes: 8,
    routing: {
      outputs: Array.from({ length: 16 }, (_, k) => `out${k + 1}`),
      names: Object.fromEntries(Array.from({ length: 16 }, (_, k) => [`out${k + 1}`, `RIO OUT ${k + 1}`])),
      sources: ["off", "main-l", "main-r", ...Array.from({ length: 12 }, (_, k) => `mix${k + 1}`), ...Array.from({ length: 8 }, (_, k) => `mtx${k + 1}`)],
      // The lab's starting patch: MIX 1–8 on RIO OUT 1–8, STEREO L/R on 15/16.
      start: { ...Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`out${k + 1}`, `mix${k + 1}`])), out15: "main-l", out16: "main-r" },
    },
    muteCutsPre: true,
    lrSwitch: true,
    dca: 16,
    muteGroups: 8,
    mainMute: true,
    main: { label: "STEREO", law: "level" },
    phones: { label: "PHONES", sources: null },
    solo: { mode: "pfl", label: "CUE" },
    meter: [-60, -48, -40, -30, -24, -18, -12, -6, 0, "OVER"],
    peakLabel: "OVER",
    outputs: ["routed"],
    layout: { kind: "cl" },
    surface: {
      // Yamaha keys: ON (lit = the channel is on), CUE; TO ST is the channel's switch to the STEREO bus.
      terms: { onKey: true, solo: "CUE", main: "STEREO", mainL: "ST L", mainR: "ST R", lr: "ST/MONO", sof: "SENDS ON FADER", inputs: "INPUT", groups: "CENTRALOGIC", display: "TOUCH SCREEN" },
      inputLayers: [
        { id: "ch1", label: "CH 1-16", channels: Array.from({ length: 16 }, (_, i) => i) },
        { id: "ch17", label: "CH 17-32", channels: Array.from({ length: 16 }, (_, i) => i + 16) },
        { id: "stin", label: "ST IN", channels: [32], fx: ["mix13", "mix14", "mix15", "mix16"] },
      ],
      groupLayers: [
        { id: "c1", label: "CH 1-8", channels: [0, 1, 2, 3, 4, 5, 6, 7] },
        { id: "c9", label: "CH 9-16", channels: [8, 9, 10, 11, 12, 13, 14, 15] },
        { id: "c17", label: "CH 17-24", channels: [16, 17, 18, 19, 20, 21, 22, 23] },
        { id: "dca", label: "DCA 1-8", dcas: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "dca9", label: "DCA 9-16", dcas: [9, 10, 11, 12, 13, 14, 15, 16] },
        { id: "bus", label: "MIX 1-8", buses: ["mix1", "mix2", "mix3", "mix4", "mix5", "mix6", "mix7", "mix8"] },
        { id: "bus9", label: "MIX 9-16", buses: ["mix9", "mix10", "mix11", "mix12", "mix13", "mix14", "mix15", "mix16"] },
        { id: "mtx", label: "MATRIX", buses: ["mtx1", "mtx2", "mtx3", "mtx4", "mtx5", "mtx6", "mtx7", "mtx8"] },
      ],
      bank: 16,
      groupBank: 8,
      selAssign: true, // DCA and mute-group assignment in the SELECTED CHANNEL VIEW
    },
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
      if (j === "mic") ports.push({ ...base, id: `ch${i + 1}-mic`, jack: "xlr", level: "mic", path: "mic", phantom, name: ch.portName || `Ch ${n} MIC`, ...(def.rio ? { panel: "rio" } : {}) });
      // AES50-A n: a stage box's input n (no jack here; it arrives on the AES50 cable).
      if (j === "mic" && def.aes50) ports.push({ ...base, id: `ch${i + 1}-aes`, jack: "aes50", level: "mic-or-line", path: "mic", phantom, remote: i, name: `AES50-A ${i + 1} (CH ${n})` });
      if (j === "line") ports.push({ ...base, id: `ch${i + 1}-line`, jack: "quarter", level: "line", path: "line", name: `Ch ${n} LINE` });
      if (j === "xlrMicLine") ports.push({ ...base, id: `ch${i + 1}-in`, jack: "xlr", level: "mic-or-line", path: "mic", phantom, name: `Ch ${n} input (XLR, MIC/LINE)` });
      // Dante RX n: the channel's network input (js/dante.js). No cable: Dante Controller patches it.
      if (j === "dante") ports.push({ ...base, id: `ch${i + 1}-dante`, jack: "dante", level: "line", path: "line", pad: false, digital: true, name: `Dante RX ${i + 1} (CH ${i + 1})` });
      if (j === "combo") ports.push({ ...base, id: `ch${i + 1}-in`, jack: "combo", level: "mic-or-line", phantom, name: `Ch ${n} input` });
      if (j === "lineMono") ports.push({ ...base, id: `ch${i + 1}-l`, jack: "quarter", level: "line", path: "line", pad: false, monoIn: true, name: `Ch ${n} L (MONO)` });
      if (j === "linePair") ports.push({ ...base, id: `ch${i + 1}-lr`, jack: "linepair", level: "line", path: "line", pad: false, stereo: true, name: ch.portName || `Ch ${n} L+R (1/4")` });
      if (j === "rcaPair") ports.push({ ...base, id: `ch${i + 1}-rca`, jack: "rcapair", level: "line", path: "line", pad: false, stereo: true, name: `Ch ${n} RCA L/R` });
      if (j === "miniPair") ports.push({ ...base, id: `ch${i + 1}-mini`, jack: "mini", level: "line", path: "line", pad: false, stereo: true, name: `Ch ${n} stereo mini` });
    }
  });
  // An effects return is a lone L (MONO) jack plus R; the reverb's outputs patch into them.
  for (const r of def.returns || []) {
    ports.push({ id: `${r.id}-l`, dir: "in", jack: "quarter", level: "line", role: "return-in", ret: Number(r.id.slice(3)), side: "L", name: `${r.label} L (MONO)` });
    ports.push({ id: `${r.id}-r`, dir: "in", jack: "quarter", level: "line", role: "return-in", ret: Number(r.id.slice(3)), side: "R", name: `${r.label} R` });
  }
  if (def.tape) ports.push({ id: "tape-in", dir: "in", jack: "rcapair", level: "line", stereo: true, pad: false, path: "line", role: "channel-input", channel: def.channels.length, name: def.tape.level ? `${def.tape.level} (L/R)` : `${def.tape.label || "TAPE"} IN (L/R)` });

  const o = def.outputs;
  const mainName = def.id === "mg102" ? "ST OUT" : "MAIN OUT";
  if (o.includes("mainXlr")) {
    ports.push(out("main-l", "xlr", `${mainName} L (XLR)`, { bus: "main", side: "L" }), out("main-r", "xlr", `${mainName} R (XLR)`, { bus: "main", side: "R" }));
    ports.push(out("line-l", "quarter", "LINE OUT L", { bus: "main", side: "L" }), out("line-r", "quarter", "LINE OUT R", { bus: "main", side: "R" }));
  } else if (o.includes("xlrSwitched")) {
    // The level these carry is the mixer's OUTPUT LEVEL switch (rig device `outLevel`).
    ports.push(out("main-l", "xlr", "MASTER OUT L (XLR)", { bus: "main", side: "L", levelSwitch: true }), out("main-r", "xlr", "MASTER OUT R (XLR)", { bus: "main", side: "R", levelSwitch: true }));
  } else if (o.includes("f8")) {
    // Zoom F8n: MAIN OUT 1/2 (TA3, shown as XLR here) set by MAIN OUT Routing; SUB OUT a stereo 3.5 mm jack carrying L/R.
    const sw = (id) => def.outSwitches.find((w) => w.ports.includes(id));
    for (const id of def.routing.outputs) ports.push(out(id, "xlr", def.routing.names[id], { routed: true, switchKey: sw(id).key, switchLevels: sw(id).levels }));
    ports.push(out("sub-out", "mini", "SUB OUT (3.5 mm stereo)", { bus: "main", stereo: true, switchKey: sw("sub-out").key, switchLevels: sw("sub-out").levels }));
  } else if (o.includes("stereoRouted")) {
    // DM2000: STEREO OUT has its own jacks; OMNI OUT 1–8 carry whatever the OUTPUT PATCH says.
    ports.push(out("main-l", "xlr", "STEREO OUT L", { bus: "main", side: "L" }), out("main-r", "xlr", "STEREO OUT R", { bus: "main", side: "R" }));
    for (const id of def.routing.outputs) ports.push(out(id, "quarter", def.routing.names?.[id] || id, { routed: true }));
  } else if (o.includes("routed")) {
    // 16 XLR outputs whose source is set on the ROUTING page (state.routing).
    for (const id of def.routing.outputs) ports.push(out(id, "xlr", def.routing.names?.[id] || `XLR OUT ${id.slice(3)}`, { routed: true, ...(def.rio ? { panel: "rio" } : {}) }));
  } else if (o.includes("omni")) {
    // STEREO OUT L/R (XLR) and OMNI OUT 1–4 (XLR), patched to AUX 1–4.
    ports.push(out("main-l", "xlr", "STEREO OUT L", { bus: "main", side: "L" }), out("main-r", "xlr", "STEREO OUT R", { bus: "main", side: "R" }));
    for (const n of [1, 2, 3, 4]) ports.push(out(`aux${n}`, "xlr", `OMNI OUT ${n} (AUX ${n})`, { bus: `aux${n}` }));
  } else if (o.includes("x32Outs")) {
    // XLR OUT 1–6 carry MIX 1–6, XLR OUT 7–8 the MAIN L/R (the factory routing).
    for (const n of [1, 2, 3, 4, 5, 6]) ports.push(out(`mix${n}`, "xlr", `XLR OUT ${n} (MIX ${n})`, { bus: `mix${n}` }));
    ports.push(out("main-l", "xlr", "XLR OUT 7 (MAIN L)", { bus: "main", side: "L" }), out("main-r", "xlr", "XLR OUT 8 (MAIN R)", { bus: "main", side: "R" }));
  } else if (o.includes("mainXlrOnly")) {
    ports.push(out("main-l", "xlr", `${mainName} L (XLR)`, { bus: "main", side: "L" }), out("main-r", "xlr", `${mainName} R (XLR)`, { bus: "main", side: "R" }));
  } else if (o.includes("main")) {
    ports.push(out("main-l", "quarter", `${mainName} L`, { bus: "main", side: "L" }), out("main-r", "quarter", `${mainName} R`, { bus: "main", side: "R" }));
  }
  if (def.aes50) ports.push({ id: "aes50a", dir: "in", jack: "ethercon", level: "line", role: "net", network: "aes50", name: "AES50 A" });
  if (o.includes("alt")) ports.push(out("alt-l", "quarter", "ALT OUT L", { bus: "alt", side: "L" }), out("alt-r", "quarter", "ALT OUT R", { bus: "alt", side: "R" }));
  if (o.includes("cr")) ports.push(out("cr-l", "quarter", "C-R OUT L", { bus: "cr", side: "L" }), out("cr-r", "quarter", "C-R OUT R", { bus: "cr", side: "R" }));
  for (const b of ["aux1", "aux2", "aux3", "aux4"]) if (o.includes(b)) ports.push(out(b, def.auxOut || "quarter", def.auxOut === "xlr" ? `${def.buses[b].label} OUT (XLR)` : `${def.buses[b].label} SEND`, { bus: b }));
  const tapeOut = def.tape?.label ? `${def.tape.label} OUT` : "TAPE OUT";
  if (o.includes("tapeOut")) ports.push(out("tape-out-l", "rca", `${tapeOut} L`, { bus: "main", side: "L" }), out("tape-out-r", "rca", `${tapeOut} R`, { bus: "main", side: "R" }));
  if (o.includes("recOut")) ports.push(out("rec-out-l", "rca", "REC OUT L", { bus: "main", side: "L" }), out("rec-out-r", "rca", "REC OUT R", { bus: "main", side: "R" }));
  if (o.includes("tapeMini")) ports.push(out("tape-mini", "mini", "TAPE OUT (3.5 mm, −10)", { bus: "main", stereo: true }));
  if (o.includes("inserts")) def.channels.forEach((ch, i) => ch.insert && ports.push(out(`ch${i + 1}-insert`, "quarter", `Ch ${ch.label} INSERT (send)`, { bus: `insert${i + 1}`, channel: i })));
  // STAGEPAS: the amp is inside, so its speaker jacks carry speaker level.
  if (o.includes("speakers")) ports.push(out("spk-l", "quarter", "SPEAKERS L", { level: "speaker", bus: "main", side: "L" }), out("spk-r", "quarter", "SPEAKERS R", { level: "speaker", bus: "main", side: "R" }));
  if (o.includes("monitor")) ports.push(out("mon-l", "quarter", "MONITOR OUT L (MONO)", { bus: "monitor", side: "L" }), out("mon-r", "quarter", "MONITOR OUT R", { bus: "monitor", side: "R" }));
  if (o.includes("sub")) ports.push(out("sub-out", "quarter", "SUBWOOFER OUT", { bus: "main", side: "M" }));
  // B207MP3: the speaker is inside the box. No jack (`internal`): nothing can be patched to it.
  if (o.includes("builtIn")) ports.push(out("spk", "internal", def.builtInSpeaker.name, { level: "speaker", bus: "main", side: "M", internal: true }));
  if (o.includes("thru")) ports.push(out("thru", "xlr", "THRU (XLR)", { bus: "thru", side: "M" }));
  return ports;
}
