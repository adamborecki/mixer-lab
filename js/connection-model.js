// Physical connection model: connectors, cables, signal levels, device ports,
// and the rules that decide whether a patch makes sound. Pure data + pure
// functions — no DOM, no Web Audio — so it runs under `node --test`.
//
// Two separate questions are answered for every cable:
//   1. Does it physically fit?  (plug ↔ jack)
//   2. Does the signal make sense?  (mic / instrument / line / speaker level)
// A plug that fits is not proof that the connection is right.

import { DANTE, DAW_TRACKS, danteLinks } from "./dante.js";
import { COMPACT, compactPorts } from "./compact-defs.js";

// ---------- signal levels ----------

// nominalDb is relative to pro line level (+4 dBu = 0 dB). Used for teaching
// copy and for rough "is this source hot enough" arithmetic, not electrical
// simulation.
export const SIGNAL_LEVELS = {
  mic: { id: "mic", name: "Mic level", nominalDb: -45, blurb: "Very weak. Needs a preamp (lots of gain)." },
  instrument: { id: "instrument", name: "Instrument level", nominalDb: -20, blurb: "Weak, high-impedance. Needs a DI or instrument input." },
  line: { id: "line", name: "Line level", nominalDb: 0, blurb: "Strong. What mixers and powered speakers pass around." },
  speaker: { id: "speaker", name: "Speaker level", nominalDb: 30, blurb: "Amplified power that moves a speaker cone. Never into an input." },
  // Radio from the antennas, on BNC coax: it only ever goes into a receiver or an antenna distribution unit.
  rf: { id: "rf", name: "RF (antenna)", nominalDb: -80, blurb: "Radio from an antenna, on coax. Not audio: it goes into a wireless receiver, never a mixer." },
};

// ---------- connectors ----------

// Plugs are what's on the end of a cable; jacks are what's on the device.
export const PLUGS = {
  xlr: { id: "xlr", name: "XLR", family: "xlr" },
  trs14: { id: "trs14", name: '1/4" TRS', family: "quarter" },
  ts14: { id: "ts14", name: '1/4" TS', family: "quarter" },
  rca: { id: "rca", name: "RCA", family: "rca" },
  trs35: { id: "trs35", name: "3.5 mm TRS", family: "mini" },
  // Two 1/4" TS plugs (left + right) on one breakout tail: the far end of a stereo Y cable.
  dualts14: { id: "dualts14", name: '2× 1/4" TS (L + R)', family: "quarter-pair" },
  // A locking RJ45 in a round XLR-sized shell: digital stage boxes (AES50, Dante).
  ethercon: { id: "ethercon", name: "etherCON (RJ45)", family: "ethercon" },
  // The twist-lock speaker plug (Neutrik speakON NL4): speaker level only.
  speakon: { id: "speakon", name: "speakON", family: "speakon" },
  // The bayonet plug on antenna coax: a quarter turn locks it.
  bnc: { id: "bnc", name: "BNC", family: "bnc" },
};

export const JACKS = {
  xlr: { id: "xlr", name: "XLR", accepts: ["xlr"] },
  combo: { id: "combo", name: 'XLR / 1/4" combo', accepts: ["xlr", "quarter"] },
  quarter: { id: "quarter", name: '1/4"', accepts: ["quarter"] },
  rca: { id: "rca", name: "RCA", accepts: ["rca"] },
  mini: { id: "mini", name: "3.5 mm", accepts: ["mini"] },
  // A stereo line input made of a left and right 1/4" jack side by side, patched as one.
  linepair: { id: "linepair", name: '1/4" L/R pair', accepts: ["quarter-pair"] },
  // A left and right RCA jack side by side (a tape/CD input), patched as one.
  rcapair: { id: "rcapair", name: "RCA L/R pair", accepts: ["rca"] },
  ethercon: { id: "ethercon", name: "etherCON", accepts: ["ethercon"] },
  speakon: { id: "speakon", name: "speakON", accepts: ["speakon"] },
  // Neutrik's speakON/1/4" combo jack (on most of Salmon's passive wedges): a speakON plug or a 1/4" plug.
  "speakon-quarter": { id: "speakon-quarter", name: 'speakON / 1/4" combo', accepts: ["speakon", "quarter"] },
  bnc: { id: "bnc", name: "BNC", accepts: ["bnc"] },
};

export function plugFitsJack(plugId, jackId) {
  const plug = PLUGS[plugId];
  const jack = JACKS[jackId];
  return !!plug && !!jack && jack.accepts.includes(plug.family);
}

// ---------- cables ----------

// `ends` are [plug, plug]. A cable may be used in either direction.
// `kind: "speaker"` = heavy unshielded wire for amp → passive speaker.
export const CABLES = {
  xlr: { id: "xlr", name: "XLR cable", ends: ["xlr", "xlr"], kind: "signal", balanced: true, blurb: "Balanced mic/line cable." },
  trs: { id: "trs", name: '1/4" TRS cable', ends: ["trs14", "trs14"], kind: "signal", balanced: true, blurb: "Balanced line cable. Looks like a guitar cable, has an extra ring." },
  ts: { id: "ts", name: '1/4" TS instrument cable', ends: ["ts14", "ts14"], kind: "signal", balanced: false, blurb: "Unbalanced guitar/keyboard cable." },
  "xlr-trs": { id: "xlr-trs", name: 'XLR ↔ 1/4" TRS cable', ends: ["xlr", "trs14"], kind: "signal", balanced: true, blurb: "Balanced adapter cable." },
  "xlr-ts": { id: "xlr-ts", name: 'XLR ↔ 1/4" TS cable', ends: ["xlr", "ts14"], kind: "signal", balanced: false, blurb: "A balanced XLR output into an unbalanced 1/4\" line input." },
  speaker: { id: "speaker", name: '1/4" speaker cable', ends: ["ts14", "ts14"], kind: "speaker", balanced: false, blurb: "Heavy, unshielded. Same plug as a guitar cable — different job." },
  rca: { id: "rca", name: "RCA cable", ends: ["rca", "rca"], kind: "signal", balanced: false, blurb: "Consumer gear: turntables, DJ players, record outs." },
  "rca-ts": { id: "rca-ts", name: 'RCA ↔ 1/4" TS cable', ends: ["rca", "ts14"], kind: "signal", balanced: false, blurb: "Consumer gear into a mixer line input." },
  "mini-rca": { id: "mini-rca", name: "3.5 mm ↔ RCA (Y) cable", ends: ["trs35", "rca"], kind: "signal", balanced: false, blurb: "Phone/laptop headphone out to RCA." },
  "mini-dual-ts": { id: "mini-dual-ts", name: '3.5 mm ↔ dual 1/4" (breakout) cable', ends: ["trs35", "dualts14"], kind: "signal", balanced: false, stereo: true, blurb: "Stereo Y: laptop headphone out to a left + right pair of 1/4\" line inputs." },
  mini: { id: "mini", name: "3.5 mm aux cable", ends: ["trs35", "trs35"], kind: "signal", balanced: false, blurb: "Phone/laptop aux cable." },
  speakon: { id: "speakon", name: "speakON speaker cable", ends: ["speakon", "speakon"], kind: "speaker", balanced: false, blurb: "Heavy speaker cable with twist-lock plugs: push in, twist until it clicks. Speaker level only." },
  cat5: { id: "cat5", name: "Cat5e cable (etherCON)", ends: ["ethercon", "ethercon"], kind: "network", balanced: false, blurb: "Shielded network cable. One of these carries every channel between a digital stage box and the console, both ways." },
  // Antenna coax (RG-58) with BNC plugs: radio from an antenna to a distribution unit or a receiver.
  bnc: { id: "bnc", name: "BNC antenna cable (coax)", ends: ["bnc", "bnc"], kind: "rf", balanced: false, blurb: "Antenna coax: carries radio, not audio. A quarter turn locks it." },
  // Two 1/4" TRS cables taped together: an interface's L/R outs into a stereo input's L/R jacks.
  "pair-trs": { id: "pair-trs", name: '1/4" TRS pair (L + R)', ends: ["dualts14", "dualts14"], kind: "signal", balanced: true, stereo: true, blurb: "Two balanced 1/4\" cables, left and right: an audio interface's outputs into a stereo line input." },
};

// The plug on the far end if `plugAtPort` goes into the near port, or null.
export function cableEndFor(cableId, jackId) {
  const cable = CABLES[cableId];
  if (!cable) return null;
  const [a, b] = cable.ends;
  if (plugFitsJack(a, jackId)) return { near: a, far: b };
  if (plugFitsJack(b, jackId)) return { near: b, far: a };
  return null;
}

export function cableFitsPort(cableId, port) {
  return !!cableEndFor(cableId, port.jack);
}

// ---------- device types ----------

// Port fields:
//   dir       "out" | "in"
//   jack      key of JACKS
//   level     out ports: the level they emit. in ports: the level they expect.
//   phantom   in ports that can supply +48 V on XLR
//   role      what the port means to the chain analysis
//   stereo    a linked L/R pair carried on one cable (out) or one channel strip (in)
//   pad       in ports: false = no 1/4" pad in front of the preamp (dedicated line input)
//   path      in ports with their own jack per path: "mic" | "line" (a combo jack
//             decides by the plug instead). Several ports may feed one `channel`.
//   sourceId  out ports of a device with several sources (a stereo mic pair): which one
// Port roles beyond the channel inputs and bus outputs:
//   return-in a mixer's aux return jack (`ret`, `side` L/R)
//   proc-in / proc-out   an effects unit's inputs and outputs
//   rec-in    a recorder input (`track`, 0-based)
// Device flags:
//   mixer     a mixer (every rig has exactly one, with id "mixer")
//   processor an outboard effects unit; recorder: a field recorder
//   source    a virtual sound source (plays a stem)
//   endpoint  makes sound in a room; `amp: "internal"` (powered) or "none" (passive)
export const DEVICE_TYPES = {
  // A laptop with a DAW and Dante Virtual Soundcard (js/dante.js): one track
  // per band stem. Its tracks reach a console over the network, not cables.
  "daw-dvs": {
    name: "Laptop · DAW + Dante Virtual Soundcard",
    source: true,
    dante: true,
    ports: DAW_TRACKS.map((sourceId, t) => ({ id: `trk${t + 1}`, dir: "out", jack: "dante", level: "line", digital: true, sourceId, name: `DAW track ${t + 1}` })),
    blurb: "Plays the multitrack stems. Each track goes out on a Dante Virtual Soundcard channel.",
  },
  "dynamic-mic": {
    name: "Dynamic mic",
    source: true,
    ports: [{ id: "out", dir: "out", jack: "xlr", level: "mic", name: "XLR out" }],
    blurb: "Rugged, needs no power. Mic level.",
  },
  "condenser-mic": {
    name: "Condenser mic",
    source: true,
    needsPhantom: true,
    ports: [{ id: "out", dir: "out", jack: "xlr", level: "mic", name: "XLR out" }],
    blurb: "Sensitive; needs +48 V phantom power from the mixer.",
  },
  "di-box": {
    name: "DI box",
    source: true,
    ports: [{ id: "out", dir: "out", jack: "xlr", level: "mic", name: "XLR out" }],
    blurb: "Turns an instrument-level signal into a balanced mic-level signal.",
  },
  // A headset mic on a bodypack transmitter: what reaches the console is its
  // receiver channel's XLR out (mic level, no phantom power needed).
  "wireless-headset": {
    name: "Wireless headset (receiver channel)",
    source: true,
    ports: [{ id: "out", dir: "out", jack: "xlr", level: "mic", name: "Receiver XLR out" }],
    blurb: "A headset mic on a bodypack. Its receiver channel's XLR out is mic level and needs no phantom power.",
  },
  // A handheld mic with its transmitter in the handle: the console gets its
  // receiver channel's XLR out, mic level, no phantom power needed.
  "wireless-handheld": {
    name: "Wireless handheld (receiver channel)",
    source: true,
    ports: [{ id: "out", dir: "out", jack: "xlr", level: "mic", name: "Receiver XLR out" }],
    blurb: "A handheld mic with the transmitter in its handle. Its receiver channel's XLR out is mic level and needs no phantom power.",
  },
  "line-source": {
    name: "Line-level instrument",
    source: true,
    ports: [{ id: "out", dir: "out", jack: "quarter", level: "line", name: '1/4" line out' }],
    blurb: "Keyboard or playback device with a line output.",
  },
  "stereo-laptop": {
    name: "Laptop (stereo playback)",
    source: true,
    stereo: true,
    ports: [{ id: "out", dir: "out", jack: "mini", level: "line", stereo: true, name: "3.5 mm headphone / line out" }],
    blurb: "Stereo line-level output on a 3.5 mm jack.",
  },
  mixer: {
    name: "Mixer",
    mixer: true,
    ports: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `ch${i + 1}`,
        dir: "in",
        jack: "combo",
        level: "mic-or-line",
        phantom: true,
        role: "channel-input",
        channel: i,
        name: `Ch ${i + 1} input`,
      })),
      // Stereo line input 9/10: ONE channel strip (channel index 8) fed by a linked L/R pair.
      { id: "ch9-10", dir: "in", jack: "linepair", level: "line", stereo: true, pad: false, role: "channel-input", channel: 8, name: "Ch 9/10 stereo line input" },
      { id: "main-l", dir: "out", jack: "xlr", level: "line", role: "bus-out", bus: "main", side: "L", name: "Main L out" },
      { id: "main-r", dir: "out", jack: "xlr", level: "line", role: "bus-out", bus: "main", side: "R", name: "Main R out" },
      { id: "aux1", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "aux1", side: "M", name: "Aux 1 out" },
      { id: "aux2", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "aux2", side: "M", name: "Aux 2 out" },
    ],
  },
  // Mackie CR1604-VLZ rear panel: separate MIC (XLR) and LINE (1/4") jacks on
  // every channel, RCA tape in, and 1/4" outputs. Inserts, direct outs and the
  // aux returns are left out until the lab has outboard gear and recorders.
  cr1604: {
    name: "Mackie CR1604-VLZ",
    mixer: true,
    ports: [
      ...Array.from({ length: 16 }, (_, i) => [
        { id: `ch${i + 1}-mic`, dir: "in", jack: "xlr", level: "mic", phantom: true, path: "mic", role: "channel-input", channel: i, name: `Ch ${i + 1} MIC` },
        { id: `ch${i + 1}-line`, dir: "in", jack: "quarter", level: "line", path: "line", role: "channel-input", channel: i, name: `Ch ${i + 1} LINE` },
      ]).flat(),
      { id: "tape-in", dir: "in", jack: "rcapair", level: "line", stereo: true, pad: false, path: "line", role: "channel-input", channel: 16, name: "TAPE INPUT (L/R)" },
      // STEREO AUX RETURNS 1–4: a mono effect goes into L only and appears on both sides.
      ...Array.from({ length: 4 }, (_, i) =>
        ["L", "R"].map((side) => ({ id: `ret${i + 1}-${side.toLowerCase()}`, dir: "in", jack: "quarter", level: "line", role: "return-in", ret: i + 1, side, name: `AUX RETURN ${i + 1} ${side === "L" ? "L (MONO)" : "R"}` })),
      ).flat(),
      { id: "main-l", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "main", side: "L", name: "MAIN OUT L" },
      { id: "main-r", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "main", side: "R", name: "MAIN OUT R" },
      { id: "mono", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "main", side: "M", name: "MONO OUT" },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `aux${i + 1}`, dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: `aux${i + 1}`, side: "M", name: `AUX SEND ${i + 1}` })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `sub${i + 1}`, dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: `sub${i + 1}`, side: "M", name: `SUB OUT ${i + 1}` })),
      { id: "cr-l", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "cr", side: "L", name: "C-R OUT L" },
      { id: "cr-r", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "cr", side: "R", name: "C-R OUT R" },
      { id: "tape-out-l", dir: "out", jack: "rca", level: "line", role: "bus-out", bus: "main", side: "L", name: "TAPE OUTPUT L" },
      { id: "tape-out-r", dir: "out", jack: "rca", level: "line", role: "bus-out", bus: "main", side: "R", name: "TAPE OUTPUT R" },
      // DIRECT OUT (1–8): the end of the channel. INSERT (1–16), used as a send: after TRIM, before LOW CUT and EQ.
      ...Array.from({ length: 8 }, (_, i) => ({ id: `ch${i + 1}-direct`, dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: `direct${i + 1}`, side: "M", channel: i, name: `Ch ${i + 1} DIRECT OUT` })),
      ...Array.from({ length: 16 }, (_, i) => ({ id: `ch${i + 1}-insert`, dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: `insert${i + 1}`, side: "M", channel: i, name: `Ch ${i + 1} INSERT (send)` })),
    ],
  },
  // A stereo reverb: fed from an aux send, returned to the aux returns. It sums
  // its inputs to mono (as the manual recommends: "in mono, return in stereo").
  reverb: {
    name: "Reverb unit",
    processor: true,
    ports: [
      { id: "in-l", dir: "in", jack: "quarter", level: "line", role: "proc-in", side: "L", name: "INPUT L (MONO)" },
      { id: "in-r", dir: "in", jack: "quarter", level: "line", role: "proc-in", side: "R", name: "INPUT R" },
      { id: "out-l", dir: "out", jack: "quarter", level: "line", role: "proc-out", side: "L", name: "OUTPUT L" },
      { id: "out-r", dir: "out", jack: "quarter", level: "line", role: "proc-out", side: "R", name: "OUTPUT R" },
    ],
    blurb: "Takes a line-level send, returns a stereo wet signal.",
  },
  // Zoom F8: eight XLR/TRS combo inputs; XLR → mic preamp with +48 V, TRS → line.
  "zoom-f8": {
    name: "Zoom F8 field recorder",
    recorder: true,
    ports: Array.from({ length: 8 }, (_, i) => ({ id: `in${i + 1}`, dir: "in", jack: "combo", level: "mic-or-line", phantom: true, role: "rec-in", track: i, name: `Input ${i + 1}` })),
    blurb: "Eight-track field recorder. Records each input to its own track.",
  },
  // A stereo bar with two small-diaphragm condensers, for room recording.
  "stereo-mic-pair": {
    name: "Stereo mic pair",
    source: true,
    needsPhantom: true,
    ports: [
      { id: "out-l", dir: "out", jack: "xlr", level: "mic", sourceId: "room-l", name: "Left mic XLR out" },
      { id: "out-r", dir: "out", jack: "xlr", level: "mic", sourceId: "room-r", name: "Right mic XLR out" },
    ],
    blurb: "Two condensers on a stereo bar; their angle and spacing make the stereo image.",
  },
  // A video camera's XLR audio input, with its own MIC/LINE switch (`inputLevel`:
  // 0 = MIC, 1 = LINE). One device per input, so each has its own switch and status.
  // A small camera's 3.5 mm stereo mic input (a DSLR or mirrorless): mic level only.
  "dslr-input": {
    name: "Camera (3.5 mm mic input)",
    endpoint: true,
    camera: true,
    ports: [{ id: "in", dir: "in", jack: "mini", level: "mic", stereo: true, name: "3.5 mm MIC input" }],
    blurb: "A small camera's mic jack: it expects mic level. Anything hotter distorts.",
  },
  "camera-input": {
    name: "Video camera input",
    endpoint: true,
    camera: true,
    ports: [{ id: "in", dir: "in", jack: "xlr", level: "mic-or-line", name: "XLR audio input" }],
    blurb: "Records what it's fed. Its MIC/LINE switch must match the level coming in.",
  },
  "powered-speaker": {
    name: "Powered speaker",
    endpoint: true,
    amp: "internal",
    ports: [{ id: "in", dir: "in", jack: "combo", level: "line", name: "Line in" }],
    blurb: "Power amp is built in. Takes line level.",
  },
  "passive-speaker": {
    name: "Passive speaker",
    endpoint: true,
    amp: "none",
    ports: [{ id: "in", dir: "in", jack: "quarter", level: "speaker", name: 'Speaker in (1/4")' }],
    blurb: "No amp inside. Needs speaker level from a power amp.",
  },
  "power-amp": {
    name: "Power amp",
    poweramp: true,
    ports: [
      { id: "in-a", dir: "in", jack: "combo", level: "line", role: "amp-in", pair: "a", name: "Input A" },
      { id: "in-b", dir: "in", jack: "combo", level: "line", role: "amp-in", pair: "b", name: "Input B" },
      { id: "out-a", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "a", name: "Speaker out A" },
      { id: "out-b", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "b", name: "Speaker out B" },
    ],
    blurb: "Line level in → speaker level out. Two channels.",
  },
  // A Yamaha STAGEPAS 600BT with nothing on its mic channels: the mix arrives
  // finished on stereo line input 5/6, and its built-in amp drives its two
  // passive speakers. Here it is only the amp (its knobs aren't modelled).
  "stagepas-amp": {
    name: "Yamaha STAGEPAS 600BT (as the amp)",
    poweramp: true,
    ports: [
      { id: "in-a", dir: "in", jack: "quarter", level: "line", role: "amp-in", pair: "a", name: "5/6 L (MONO)", short: "5/6 L" },
      { id: "in-b", dir: "in", jack: "quarter", level: "line", role: "amp-in", pair: "b", name: "5/6 R", short: "5/6 R" },
      { id: "out-a", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "a", name: "SPEAKERS L", short: "SPEAKERS L" },
      { id: "out-b", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "b", name: "SPEAKERS R", short: "SPEAKERS R" },
    ],
    blurb: "A powered mixer used as the amp: the finished mix into line input 5/6, its own passive speakers on SPEAKERS L/R.",
  },
  // A Behringer B207MP3 as a wedge: powered, with THRU passing what comes in
  // on to the next one, so one mix feeds a row of wedges (a daisy chain).
  "b207-speaker": {
    name: "Behringer B207MP3 (wedge)",
    endpoint: true,
    amp: "internal",
    ports: [
      { id: "in", dir: "in", jack: "combo", level: "line", name: "MAIN IN" },
      { id: "thru", dir: "out", jack: "xlr", level: "line", role: "thru", through: "in", name: "THRU" },
    ],
    blurb: "A powered speaker. THRU passes its input on to the next one, so one mix can feed a row of them.",
  },
};

// Salmon Recital Hall's monitor rig (Vocal Jazz): a Behringer NX3000 with XLR
// inputs and speakON outputs, and passive wedges with two speakON jacks wired
// together, so a second cable passes the amp's output on to the next wedge.
DEVICE_TYPES.nx3000 = {
  name: "Behringer NX3000 (power amp)",
  poweramp: true,
  ports: [
    { id: "in-a", dir: "in", jack: "xlr", level: "line", role: "amp-in", pair: "a", name: "CH A input (XLR)", short: "CH A IN" },
    { id: "in-b", dir: "in", jack: "xlr", level: "line", role: "amp-in", pair: "b", name: "CH B input (XLR)", short: "CH B IN" },
    { id: "out-a", dir: "out", jack: "speakon", level: "speaker", role: "amp-out", pair: "a", name: "CH A speakON output", short: "CH A OUT" },
    { id: "out-b", dir: "out", jack: "speakon", level: "speaker", role: "amp-out", pair: "b", name: "CH B speakON output", short: "CH B OUT" },
  ],
  blurb: "Line level in on XLR, speaker level out on speakON. Channel A in drives channel A out.",
};
// The two jacks are `parallel`: wired straight together inside, so neither is
// an input or an output. A cable on either one is the same connection, drawn
// either way round (`orient`, and `throughLinks` follows them).
DEVICE_TYPES["passive-wedge"] = {
  name: "Passive wedge (two speakON jacks)",
  endpoint: true,
  amp: "none",
  ports: [
    { id: "in", dir: "in", jack: "speakon", level: "speaker", parallel: true, short: "1", name: "speakON jack 1" },
    { id: "link", dir: "out", jack: "speakon", level: "speaker", parallel: true, short: "2", name: "speakON jack 2" },
  ],
  blurb: "No amp inside. Its two speakON jacks are wired together (in parallel): either one takes the amp, and the other passes it on to the next wedge.",
};

// Salmon's mains rack: a small Mackie mixer sits between the S32's OUT 15/16
// (MAIN L/R) and the mains amp. Here it only passes the mix on at line level;
// its knobs, and which of its jacks are used, aren't modelled.
DEVICE_TYPES["line-passthru"] = {
  name: "Mackie mini mixer (passes the mix on)",
  ports: [
    { id: "in-l", dir: "in", jack: "combo", level: "line", short: "IN L", name: "Input L" },
    { id: "in-r", dir: "in", jack: "combo", level: "line", short: "IN R", name: "Input R" },
    { id: "out-l", dir: "out", jack: "xlr", level: "line", role: "thru", through: "in-l", short: "OUT L", name: "Output L" },
    { id: "out-r", dir: "out", jack: "xlr", level: "line", role: "thru", through: "in-r", short: "OUT R", name: "Output R" },
  ],
  blurb: "A small mixer in the mains rack. Here it just passes the mix on: line level in, the same line level out.",
};

// BH 109, the choir room (MUS 248's BH 109 Karaoke Gig Checklist): the room's
// rack as one box. Its AUX AUDIO INPUT jacks (1/4", on an Extron plate) feed the
// Ashly LX-308B line mixer's Ch.1; the Ashly's stereo output drives a Crown
// XLi 2500, wired to the two passive wall speakers. Ch.1 has a Line / Mic
// button (`micSwitch`: the rig device's `ashlyMic`, 0 = LINE, 1 = MIC, +30 dB):
// MIC on a line-level feed distorts (in the room, it fed back). The Ashly's
// other knobs aren't modelled: the room's level is left where the rack sets it.
DEVICE_TYPES["bh109-rack"] = {
  name: "BH 109 rack · Ashly LX-308B Ch.1 → Crown XLi 2500",
  poweramp: true,
  micSwitch: { key: "ashlyMic", gainDb: 30 },
  ports: [
    { id: "in-a", dir: "in", jack: "quarter", level: "line", role: "amp-in", pair: "a", name: 'AUX AUDIO INPUT LEFT (1/4")', short: "AUX AUDIO L" },
    { id: "in-b", dir: "in", jack: "quarter", level: "line", role: "amp-in", pair: "b", name: 'AUX AUDIO INPUT RIGHT (1/4")', short: "AUX AUDIO R" },
    { id: "out-a", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "a", name: "Crown CH 1 (left wall speaker)", short: "CROWN CH 1" },
    { id: "out-b", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "b", name: "Crown CH 2 (right wall speaker)", short: "CROWN CH 2" },
  ],
  blurb: "The room's own rack: line level into AUX AUDIO INPUT, through the Ashly line mixer's Ch.1, and the Crown amp drives the wall speakers. Ch.1 stays on LINE.",
};
// A passive speaker on the wall, driven by the room's amp. `clips`: the audio
// engine puts a clipper in front of it, so a too-hot rack (MIC) is heard.
DEVICE_TYPES["wall-speaker"] = {
  name: "Passive wall speaker",
  endpoint: true,
  amp: "none",
  clips: true,
  ports: [{ id: "in", dir: "in", jack: "quarter", level: "speaker", name: 'Speaker in (1/4")' }],
  blurb: "No amp inside: the room's Crown amp drives it, wired through the wall.",
};

// ---------- stage boxes ----------

// An analog snake: a stage box of XLR inputs, a multicore to FOH, and a fan of
// XLR tails at the console. Returns go the other way (FOH sends → stage box
// outputs). Purely passive: whatever goes in a channel comes out its tail,
// phantom power included. `through` pairs each in with its out.
const SNAKE_CH = 16;
const SNAKE_RET = ["a", "b", "c", "d"];
DEVICE_TYPES.snake = {
  name: `Analog snake (${SNAKE_CH} × ${SNAKE_RET.length})`,
  stagebox: true,
  passthrough: true,
  ports: [
    ...Array.from({ length: SNAKE_CH }, (_, i) => ({ id: `in${i + 1}`, dir: "in", jack: "xlr", level: "any", role: "snake-in", end: "stage", through: `tail${i + 1}`, name: `Snake IN ${i + 1}` })),
    ...Array.from({ length: SNAKE_CH }, (_, i) => ({ id: `tail${i + 1}`, dir: "out", jack: "xlr", level: "any", role: "snake-out", end: "foh", through: `in${i + 1}`, name: `Snake tail ${i + 1} (at FOH)` })),
    ...SNAKE_RET.map((r) => ({ id: `send-${r}`, dir: "in", jack: "xlr", level: "any", role: "snake-in", end: "foh", through: `ret-${r}`, name: `Return ${r.toUpperCase()} send (at FOH)` })),
    ...SNAKE_RET.map((r) => ({ id: `ret-${r}`, dir: "out", jack: "xlr", level: "any", role: "snake-out", end: "stage", through: `send-${r}`, name: `Snake RETURN ${r.toUpperCase()}` })),
  ],
  blurb: "Sixteen mic lines and four returns in one multicore: plug in on stage, the tails come out at FOH.",
};

// Digital stage boxes on AES50 (Behringer S32, SD8): remote mic preamps on
// stage (the console's GAIN and 48V control them) and outputs, all on one
// Cat5 cable to the console's AES50 A port. Input n arrives as AES50-A n;
// output n carries the console's output n (its AES50-A output blocks are left
// on OUT 1–8 / 9–16, the factory routing). A second box can hang off the
// first one's AES50 B (a daisy chain): its inputs come after the first box's
// (an SD8 behind an S32 arrives as AES50-A 33–40), and its outputs carry the
// AES50 block its output-bank switch picks (`bank`; rig device `outBank`).
function aes50Box(name, ins, outs, blurb, { bank = false } = {}) {
  return {
    name,
    stagebox: true,
    network: "aes50",
    ports: [
      ...Array.from({ length: ins }, (_, i) => ({ id: `in${i + 1}`, dir: "in", jack: "xlr", level: "mic-or-line", phantom: true, role: "sb-in", index: i, name: `${name.split(" ").pop()} IN ${i + 1}` })),
      ...Array.from({ length: outs }, (_, i) => ({ id: `out${i + 1}`, dir: "out", jack: "xlr", level: "line", role: "sb-out", index: i, name: `${name.split(" ").pop()} OUT ${i + 1}` })),
      { id: "aes50a", dir: "out", jack: "ethercon", level: "line", role: "net", network: "aes50", name: "AES50 A" },
      { id: "aes50b", dir: "in", jack: "ethercon", level: "line", role: "net", network: "aes50", chain: true, name: "AES50 B (to the next box)" },
    ],
    ins,
    ...(bank ? { bank: true } : {}),
    blurb,
  };
}
DEVICE_TYPES.s32 = aes50Box("Behringer S32", 32, 16, "32 remote mic preamps and 16 outputs on stage, on one Cat5 cable to the console's AES50 A.");
DEVICE_TYPES.sd8 = aes50Box("Behringer SD8", 8, 8, "8 remote mic preamps and 8 outputs: a small stage box for a drum riser or a side stage. Its OUTPUT switch picks which 8 AES50 channels its outputs carry.", { bank: true });

// The SD8's output-bank switch: which AES50 channels its 8 outputs carry.
export const SD8_BANKS = ["1-8", "9-16", "17-24"];

// ---------- knobs on the gear (CME in Salmon) ----------

// A volume knob on a piece of gear, 0 to 10 as printed on most of them: at
// `unity` it passes the signal at its own level, below that it turns it down,
// above it adds a few dB, and 0 is off. An amp's knob has its unity at the
// top (it only attenuates). A device's `knobs` list them; each one with a
// `pair` acts on that amp channel only, the rest on everything through it.
// The value lives on the rig device (`device[key]`, else `start`).
export function knobDb(pos, unity = 10) {
  return pos > 0 ? 40 * Math.log10(pos / unity) : -Infinity;
}
export const knobPos = (device, k) => device?.[k.key] ?? k.start;
export function knobsDb(device, pair) {
  const knobs = DEVICE_TYPES[device?.type]?.knobs || [];
  return knobs.filter((k) => !k.select && k.path !== false && (!k.pair || k.pair === pair)).reduce((db, k) => db + knobPartDb(device, k, pair), 0);
}
// One knob's part: a BAL knob (`balance`, centered at its unity) turns the
// other side down as it moves toward one side; `pair` "a" is left, "b" right.
function knobPartDb(device, k, pair) {
  const pos = knobPos(device, k);
  if (!k.balance) return knobDb(pos, k.unity);
  const away = pair === "a" ? pos - k.unity : k.unity - pos;
  return away > 0 ? knobDb(k.unity - away, k.unity) : 0;
}
// Every knob on the way from a mixer output to one speaker: the amp channel's, and a
// small mixer's that the signal passes through on the way (the Mix5, on its L or R side).
export function chainKnobs(rig, ampDevice, pair, link) {
  const parts = [[ampDevice, pair]];
  const via = link?.via && getDevice(rig, link.via);
  if (via && DEVICE_TYPES[via.type].knobs && link.viaPort) parts.push([via, DEVICE_TYPES[via.type].ports.find((p) => p.id === link.viaPort)?.side]);
  return parts;
}

// What a source's own gear does to it before the mixer (rig device settings):
// a wireless handheld's one button (`mic`: 0 on, 1 muted by a tap, 2 switched
// off by a press and hold), or the volume knob on the amp or instrument in
// front of the mic or DI (`source.volumeKnob`, value `vol`).
export const MIC_STATES = ["ON", "MUTED", "OFF"];
export function sourceTrimDb(device, source) {
  if (device?.mic || device?.dead) return -Infinity;
  const k = source?.volumeKnob;
  return k ? knobDb(device?.vol ?? k.start, k.unity) : 0;
}
// Everything a source's own gear does to it, with the rig: its button or
// knob, its power (a guitar amp switched off), and a radio handheld's
// receiver channel (the rack's power, the antennas, the channel's VOL).
export function sourceGearDb(rig, device, source) {
  if (!powered(rig, device)) return -Infinity;
  return sourceTrimDb(device, source) + (DEVICE_TYPES[device?.type]?.rf ? wirelessDb(rig, device.sourceId) : 0);
}

// Behringer KM750 (two in Salmon's monitor amp rack): one channel per wedge,
// each with its own level knob. The wedges at CME take a 1/4" speaker cable.
DEVICE_TYPES.km750 = {
  name: "Behringer KM750 (power amp)",
  poweramp: true,
  ports: [
    { id: "in-a", dir: "in", jack: "combo", level: "line", role: "amp-in", pair: "a", name: "CH A input (XLR / 1/4\")", short: "CH A IN" },
    { id: "in-b", dir: "in", jack: "combo", level: "line", role: "amp-in", pair: "b", name: "CH B input (XLR / 1/4\")", short: "CH B IN" },
    { id: "out-a", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "a", name: "CH A speaker output (1/4\")", short: "CH A OUT" },
    { id: "out-b", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "b", name: "CH B speaker output (1/4\")", short: "CH B OUT" },
  ],
  knobs: [
    { key: "volA", label: "CH A level", pair: "a", unity: 10, start: 7 },
    { key: "volB", label: "CH B level", pair: "b", unity: 10, start: 7 },
  ],
  blurb: "Line level in, speaker level out, a level knob on each channel. Channel A in drives channel A out.",
};
// The KM750 as photographed at the mariachi gig (2026-11-06): speakON outputs
// (and binding posts, not modelled), the wedges on speakON cables. The `km750`
// above, from CME's notes, has 1/4" outputs instead; which is right for CME
// isn't checked yet (open item in docs/HANDOFF.md).
DEVICE_TYPES["km750-nl4"] = {
  ...DEVICE_TYPES.km750,
  ports: [
    ...DEVICE_TYPES.km750.ports.filter((p) => p.dir === "in"),
    { id: "out-a", dir: "out", jack: "speakon", level: "speaker", role: "amp-out", pair: "a", name: "CH A speakON output", short: "CH A OUT" },
    { id: "out-b", dir: "out", jack: "speakon", level: "speaker", role: "amp-out", pair: "b", name: "CH B speakON output", short: "CH B OUT" },
  ],
  blurb: "Line level in, speaker level out on speakON, a level knob on each channel. Channel A in drives channel A out.",
};
// Salmon's Behringer passive wedges come in two kinds (the instructor, 2026-11-10):
// three take a speakON or a 1/4" speaker cable in one combo jack, two take 1/4" only.
DEVICE_TYPES["passive-wedge-combo"] = {
  name: "Passive wedge (speakON or 1/4\")",
  endpoint: true,
  amp: "none",
  ports: [{ id: "in", dir: "in", jack: "speakon-quarter", level: "speaker", name: 'Speaker in (speakON / 1/4" combo)' }],
  blurb: "No amp inside. Its one jack takes a speakON plug or a 1/4\" speaker plug: either kind of speaker cable.",
};
// The Crown in the separate amp rack: 1/4" in and 1/4" out on each channel,
// and the long 1/4" speaker cable to the far side of the stage.
DEVICE_TYPES["crown-amp"] = {
  name: "Crown amp (1/4\" in and out)",
  poweramp: true,
  ports: [
    { id: "in-a", dir: "in", jack: "quarter", level: "line", role: "amp-in", pair: "a", name: "CH 1 input (1/4\")", short: "CH 1 IN" },
    { id: "in-b", dir: "in", jack: "quarter", level: "line", role: "amp-in", pair: "b", name: "CH 2 input (1/4\")", short: "CH 2 IN" },
    { id: "out-a", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "a", name: "CH 1 speaker output (1/4\")", short: "CH 1 OUT" },
    { id: "out-b", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "b", name: "CH 2 speaker output (1/4\")", short: "CH 2 OUT" },
  ],
  knobs: [
    { key: "volA", label: "CH 1 level", pair: "a", unity: 10, start: 8 },
    { key: "volB", label: "CH 2 level", pair: "b", unity: 10, start: 8 },
  ],
  blurb: "Line level in on 1/4\" jacks, speaker level out on 1/4\" jacks, a level knob on each channel.",
};
// Salmon's hall mains rack (permanent): the Mackie Mix5 sits on top, rack
// power below it, and a Crown inside that drives the hall's installed
// speakers. S32 OUT 15/16 (MAIN L/R) come in on the Mix5's LINE IN 4/5 (1/4"
// cables); its MAIN OUT feeds the Crown on cables that stay put (`fixed`).
// It's a console of its own in the lab (`console`: the Console: Mix5 view):
// 4/5 BAL and LEVEL and MAIN MIX change what the hall's speakers play
// (`path`); the other knobs are there to see and turn, with nothing plugged
// into them. Turning 4/5 LEVEL down, not MAIN MIX, takes the X32 off the hall's
// speakers and leaves the 3.5 mm input working for a phone.
const MIX5_KNOBS = [
  { key: "ch1Gain", label: "CH 1 GAIN", unity: 5, start: 5, path: false, unit: "gain" },
  { key: "ch1High", label: "CH 1 HIGH 12kHz", unity: 5, start: 5, path: false, unit: "eq" },
  { key: "ch1Low", label: "CH 1 LOW 80Hz", unity: 5, start: 5, path: false, unit: "eq" },
  { key: "ch1Pan", label: "CH 1 PAN", unity: 5, start: 5, path: false, unit: "pan" },
  { key: "ch1Level", label: "CH 1 LEVEL", unity: 7.5, start: 0, path: false },
  { key: "bal23", label: "2/3 BAL", unity: 5, start: 5, path: false, unit: "pan" },
  { key: "lvl23", label: "2/3 LEVEL", unity: 7.5, start: 7.5, path: false },
  { key: "bal45", label: "4/5 BAL", unity: 5, start: 5, balance: true },
  { key: "lvl45", label: "4/5 LEVEL", unity: 7.5, start: 7.5 },
  { key: "tapePhones", label: "TAPE TO PHONES", select: ["Up", "Down"], start: 0, path: false },
  { key: "tapeMain", label: "TAPE TO MAIN", select: ["Up", "Down"], start: 0, path: false },
  { key: "phones", label: "PHONES", unity: 7.5, start: 3, path: false },
  { key: "main", label: "MAIN MIX", unity: 7.5, start: 7.5 },
];
DEVICE_TYPES.mix5 = {
  name: "Mackie Mix5",
  console: true,
  ports: [
    { id: "in-l", dir: "in", jack: "quarter", level: "line", side: "a", short: "LINE IN 4", name: "LINE IN 4/5 · L (4)" },
    { id: "in-r", dir: "in", jack: "quarter", level: "line", side: "b", short: "LINE IN 5", name: "LINE IN 4/5 · R (5)" },
    { id: "out-l", dir: "out", jack: "quarter", level: "line", role: "thru", through: "in-l", side: "a", short: "MAIN OUT L", name: "MAIN OUT L" },
    { id: "out-r", dir: "out", jack: "quarter", level: "line", role: "thru", through: "in-r", side: "b", short: "MAIN OUT R", name: "MAIN OUT R" },
  ],
  knobs: MIX5_KNOBS,
  blurb: "A five-channel Mackie on top of the hall's mains rack. S32 OUT 15/16 come in on LINE IN 4/5; MAIN OUT feeds the Crown in the rack.",
};
// The rack's power, between the Mix5 and the Crown. Nothing to patch.
DEVICE_TYPES["rack-power"] = { name: "Rack power", decor: true, ports: [], blurb: "The rack's power: always on in Salmon." };
// The Crown inside the hall's mains rack: wired to the Mix5 and, through the
// wall, to the installed speakers. Its knobs aren't touched.
DEVICE_TYPES["hall-crown"] = {
  name: "Crown amp (the hall's mains rack)",
  poweramp: true,
  ports: [
    { id: "in-a", dir: "in", jack: "quarter", level: "line", role: "amp-in", pair: "a", name: "CH 1 input", short: "CH 1 IN" },
    { id: "in-b", dir: "in", jack: "quarter", level: "line", role: "amp-in", pair: "b", name: "CH 2 input", short: "CH 2 IN" },
    { id: "out-a", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "a", name: "CH 1 output (hall speaker L)", short: "CH 1 OUT" },
    { id: "out-b", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "b", name: "CH 2 output (hall speaker R)", short: "CH 2 OUT" },
  ],
  blurb: "Inside the hall's mains rack: the Mix5's MAIN OUT in, the hall's installed speakers out. Its cables stay where they are.",
};
// A powered wedge with its own volume knob and an IEC power cable (its power:
// `plugged`, `on`). No power, no sound, however good the signal.
DEVICE_TYPES["active-wedge"] = {
  name: "Active wedge (powered)",
  endpoint: true,
  amp: "internal",
  ports: [{ id: "in", dir: "in", jack: "combo", level: "line", name: "INPUT (XLR / 1/4\")" }],
  knobs: [
    { key: "vol", label: "VOLUME", unity: 7.5, start: 7.5 },
  ],
  blurb: "The amp is inside: line level in, its own VOLUME knob, and an IEC power cable to plug in.",
};

// ---------- the wireless rack at FOH (Salmon) ----------

// Salmon's wireless rack sits at FOH next to the X32 (the salmon repo's device
// reference and photos; the instructor, 2026-11-03). Top to bottom: a Furman
// (the rack's power: off, everything in it is dark), three Phenyx Pro
// PTU-6000 receivers (8 channels each, a VOL knob per channel, set to 9
// o'clock), a PTU-7000 (4 channels: lav and headset packs), and two PAS-225
// antenna distribution units. The two antennas are on the outside of the rack
// and go into the PAS-225; it feeds several receivers and, daisy-chained, the
// PAS-225X, which feeds the rest. Each receiver needs both antennas (A and B).
// A receiver channel's XLR AF OUT carries the handheld it's paired with
// (rig device `pairs`: { out3: sourceId }).
DEVICE_TYPES["rack-furman"] = {
  name: "Furman (rack power)",
  rackPower: true,
  ports: [],
  power: { plug: "power cord" },
  blurb: "The rack's power switch. Off, and everything in the rack is dark.",
};
DEVICE_TYPES.antenna = {
  name: "Antenna",
  ports: [{ id: "out", dir: "out", jack: "bnc", level: "rf", name: "BNC (to the antenna distribution)", short: "BNC" }],
  blurb: "Picks up the handhelds' radio. Its coax goes into the antenna distribution's ANT A or B input.",
};
// An antenna distribution unit: ANT A and B in, four pairs of A/B outs (each
// passes on its own letter), its own POWER button. The output pair count is
// the lab's assumption (open item: not checked on the unit).
const pas = (name) => ({
  name,
  rfSplit: true,
  ports: [
    { id: "ant-a", dir: "in", jack: "bnc", level: "rf", side: "a", name: "ANT A input", short: "ANT A IN" },
    { id: "ant-b", dir: "in", jack: "bnc", level: "rf", side: "b", name: "ANT B input", short: "ANT B IN" },
    ...[1, 2, 3, 4].flatMap((n) => ["a", "b"].map((x) => ({ id: `out${n}${x}`, dir: "out", jack: "bnc", level: "rf", side: x, name: `OUT ${n} ${x.toUpperCase()}`, short: `${n}${x.toUpperCase()}` }))),
  ],
  blurb: "Splits two antennas (A and B) to several receivers, and on to the next distribution unit.",
});
DEVICE_TYPES.pas225 = pas("Phenyx Pro PAS-225 (antenna distribution)");
DEVICE_TYPES.pas225x = pas("Phenyx Pro PAS-225X (antenna distribution)");
// A wireless receiver: ANT A and B in (diversity: one is enough to work, both
// is right), an XLR AF OUT and a VOL knob per channel (9 o'clock = 2 on the
// lab's 0–10, the level everything else here is set for).
const receiver = (name, channels) => ({
  name,
  receiver: true,
  channels,
  ports: [
    { id: "ant-a", dir: "in", jack: "bnc", level: "rf", side: "a", name: "ANT A", short: "ANT A" },
    { id: "ant-b", dir: "in", jack: "bnc", level: "rf", side: "b", name: "ANT B", short: "ANT B" },
    ...Array.from({ length: channels }, (_, i) => ({ id: `out${i + 1}`, dir: "out", jack: "xlr", level: "line", name: `AF OUT ${i + 1} (CH ${i + 1})`, short: `OUT ${i + 1}` })),
  ],
  knobs: Array.from({ length: channels }, (_, i) => ({ key: `vol${i + 1}`, label: `CH ${i + 1} VOL`, unity: 2, start: 2 })),
  blurb: `${channels} wireless channels. Each channel's XLR AF OUT carries the mic it's paired with; its VOL knob sets how hot.`,
});
DEVICE_TYPES.ptu6000 = receiver("Phenyx Pro PTU-6000 (8-channel receiver)", 8);
DEVICE_TYPES.ptu7000 = receiver("Phenyx Pro PTU-7000 (4-channel receiver: lav and headset packs)", 4);
// The IEM transmitters (in the rack's drawer): four inputs, not in use (no bodypacks are on).
DEVICE_TYPES["iem-tx"] = {
  name: "IEM transmitters",
  sink: true,
  ports: [1, 2, 3, 4].map((n) => ({ id: `in${n}`, dir: "in", jack: "combo", level: "line", name: `IEM ${n} input`, short: `IN ${n}` })),
  blurb: "In-ear monitor transmitters. Not in use: nobody is wearing a bodypack. Whatever the outputs they're plugged into carry would go to them.",
};
// A handheld that reaches the console by radio: no cable. What it sends comes
// out of the receiver channel paired with it.
DEVICE_TYPES["rf-handheld"] = {
  name: "Wireless handheld",
  source: true,
  rf: true,
  ports: [],
  blurb: "A handheld with its transmitter in the handle. No cable: it reaches its receiver channel at FOH by radio.",
};
// The FOH Mac mini (MUS-BH100-MINI) with its SSL 2+ interface: test music out
// of the SSL 2+'s 1/4" outs, and Ethernet for Dante (the X32's X-DANTE card).
DEVICE_TYPES["foh-mac"] = {
  name: "Mac mini + SSL 2+ (FOH)",
  source: true,
  foh: true, // drawn at FOH, under the console, not on stage
  stereo: true,
  ports: [
    { id: "out", dir: "out", jack: "linepair", level: "line", stereo: true, name: 'SSL 2+ OUT L/R (1/4")', short: "SSL OUT" },
    { id: "dante", dir: "in", jack: "ethercon", level: "line", role: "net", network: "dante", name: "Ethernet (Dante)", short: "DANTE" },
  ],
  blurb: "The FOH computer: test music through its SSL 2+, and the Dante multitrack from the X32's card into Logic.",
};

// ---------- power ----------

// Everything that plugs into the wall has a power cable and (almost always) a
// switch, and the two are different faults: `plugged` (0 unplugged) and `on`
// (0 switched off) on the rig device, both 1 unless a scenario says otherwise.
// A device type's `power`: { plug: what the cable is called, noSwitch,
// passiveThru (its THRU jack is wired straight through, so it passes the
// signal on with the box off) }. A source's own gear (the guitar amp in front
// of an SM57, the Nord behind a DI) is the rig device's `gearPower`: its name.
// Gear in a rack with a Furman (`rackPower`) is plugged into the Furman.
export function powerSpec(d) {
  const t = DEVICE_TYPES[d?.type];
  if (t?.power) return t.power;
  return d?.gearPower ? { plug: "power cable", gear: d.gearPower } : null;
}
// "on", "off" (its switch), "unplugged", "no-power" (switched on and plugged
// in, but what it's plugged into is off), or null for gear without power.
export function powerState(rig, d) {
  const spec = powerSpec(d);
  if (!spec) return null;
  if ((d.plugged ?? 1) === 0) return "unplugged";
  if (!spec.noSwitch && (d.on ?? 1) === 0) return "off";
  const strip = d.rack && rig.devices.find((x) => x !== d && x.rack === d.rack && DEVICE_TYPES[x.type]?.rackPower);
  return strip && !powered(rig, strip) ? "no-power" : "on";
}
// Is this device getting power? Gear without a power cable always is.
export function powered(rig, d) {
  const st = powerState(rig, d);
  return st === null || st === "on";
}
// Why a box is dark, in a sentence ("" when it isn't).
export function powerWhy(rig, d) {
  const st = powerState(rig, d);
  if (!st || st === "on") return "";
  const spec = powerSpec(d);
  const name = spec.gear || d.label || DEVICE_TYPES[d.type].name;
  if (st === "unplugged") return `${name}: its ${spec.plug || "power cable"} isn't plugged in.`;
  if (st === "off") return `${name} is switched off.`;
  const strip = rig.devices.find((x) => x !== d && x.rack === d.rack && DEVICE_TYPES[x.type]?.rackPower);
  return `${name} is switched on, but ${strip?.label || "its rack's power"} is off.`;
}
// A device the signal goes through that needs power to pass it (a stage box,
// the Mix5), and doesn't have it. A powered speaker's THRU is wired straight through.
function deadVia(rig, link) {
  const d = link?.via && getDevice(rig, link.via);
  return d && !powerSpec(d)?.passiveThru && !powered(rig, d) ? d : null;
}

// Does radio reach this antenna input? Back along the coax: an antenna, or a
// powered distribution unit whose own input of the same letter has radio.
export function rfAt(rig, ref, depth = 0) {
  const c = rig.cables.find((x) => x.to === ref);
  const p = c && !c.broken && depth < 5 && getPort(rig, c.from);
  if (!p) return false;
  if (p.device.type === "antenna") return true;
  return !!DEVICE_TYPES[p.device.type].rfSplit && powered(rig, p.device) && rfAt(rig, portRef(p.device.id, `ant-${p.side}`), depth + 1);
}
// One receiver channel: on, radio on A and B, the paired mic, and what its VOL knob does.
export function receiverChannel(rig, rx, n) {
  const on = powered(rig, rx);
  const a = on && rfAt(rig, portRef(rx.id, "ant-a"));
  const b = on && rfAt(rig, portRef(rx.id, "ant-b"));
  const k = DEVICE_TYPES[rx.type].knobs.find((x) => x.key === `vol${n}`);
  return { on, a, b, sourceId: rx.pairs?.[`out${n}`] || null, db: on && (a || b) ? knobDb(knobPos(rx, k), k.unity) : -Infinity };
}
// What the wireless path does to a handheld: its receiver channel's, or silence with no receiver.
export function wirelessDb(rig, sourceId) {
  for (const d of rig.devices) {
    const port = DEVICE_TYPES[d.type]?.receiver && Object.keys(d.pairs || {}).find((k) => d.pairs[k] === sourceId);
    if (port) return receiverChannel(rig, d, Number(port.slice(3))).db;
  }
  return -Infinity;
}

// Hosa's Little Bro sub snake (SH-8XO-25): eight XLR inputs in a box on
// stage, eight XLR tails 25 ft away. Passive, so phantom power goes through.
// In Salmon its tails plug into the S32's last eight inputs (IN 25–32).
const SUB_CH = 8;
DEVICE_TYPES.subsnake = {
  name: "Hosa sub snake (8 channels)",
  stagebox: true,
  passthrough: true,
  tailsAsCables: true, // drawn as a multicore splitting into tails, not a box at the far end
  ports: [
    ...Array.from({ length: SUB_CH }, (_, i) => ({ id: `in${i + 1}`, dir: "in", jack: "xlr", level: "any", role: "snake-in", end: "stage", through: `tail${i + 1}`, name: `Sub snake MIC IN ${i + 1}` })),
    ...Array.from({ length: SUB_CH }, (_, i) => ({ id: `tail${i + 1}`, dir: "out", jack: "xlr", level: "any", role: "snake-out", end: "foh", through: `in${i + 1}`, name: `Sub snake tail ${i + 1}` })),
  ],
  blurb: "Eight mic lines in one cable: plug in at the box on stage, and tail n comes out at the stage box rack.",
};

// What a console's input block listens to (rig device `inSource`, per block of
// 8 channels), as the X32's ROUTING → BLOCK → INPUT page offers it:
//   0       LOCAL, the block's own jacks (CH 9-16 ← Local 9-16)
//   10 + k  LOCAL block k (CH 9-16 ← Local 1-8: those jacks feed these channels too)
//   1       AES50-A with the block's own numbers (CH 25-32 ← AES50 A25-32)
//   3 + k   AES50-A block k (CH 17-24 ← AES50 A33-40: an SD8 behind an S32)
//   20 + k  AES50-B block k: nothing on the X32's AES50 B in the lab, so silence
//   2       CARD with the block's own numbers; 30 + k CARD block k: the lab's
//           USB card plays nothing, so silence
// The UI always writes the shortest form (a block's own numbers as 0, 1 or 2).
export const AES50_BLOCKS = 6;
// A block's source as the X32's ROUTING → INPUT page prints it: "Local 1-8",
// "AES50 A33-40", "AES50 B1-8", "Card 1-8".
export function inSourceName(inSource, block) {
  const v = inSource?.[block] ?? 0;
  const range = (n) => `${n * 8 + 1}-${n * 8 + 8}`;
  const a = aesBlockOf(inSource, block);
  const l = localBlockOf(inSource, block);
  return a !== null ? `AES50 A${range(a)}` : l !== null ? `Local ${range(l)}` : v >= 20 && v < 30 ? `AES50 B${range(v - 20)}` : `Card ${range(v === 2 ? block : v - 30)}`;
}
// The AES50-A block a channel block listens to, or null when it isn't on AES50-A.
export function aesBlockOf(inSource, block) {
  const v = inSource?.[block];
  return v === 1 ? block : v >= 3 && v < 10 ? v - 3 : null;
}
// The LOCAL block a channel block listens to, or null.
export function localBlockOf(inSource, block) {
  const v = inSource?.[block] ?? 0;
  return v === 0 ? block : v >= 10 && v < 20 ? v - 10 : null;
}
// Every value `inSource` can hold (the X32 has up to 4 local blocks and 6 AES50 blocks per port).
export const IN_SOURCE_VALUES = [0, 1, 2, ...[0, 1, 2, 3, 4, 5].map((k) => 3 + k), ...[0, 1, 2, 3].map((k) => 10 + k), ...[0, 1, 2, 3, 4, 5].map((k) => 20 + k), ...[0, 1, 2, 3].map((k) => 30 + k)];

// What each block of 8 AES50-A output channels carries (rig device `aesOut`,
// the X32's ROUTING → BLOCK → AES A page). In the lab only "Output 1-8" and
// "Output 9-16" (the console's XLR OUT 1-16) reach a stage box's outputs;
// anything else leaves that block silent. Salmon's X32 (photo, 2026-10-20):
// Output 1-8, Output 9-16, Output 1-8, Output 9-16, P16 1-8, P16 9-16.
export const AES_OUT_START = ["out0", "out1", "out0", "out1", "p16-0", "p16-1"];
// What the card's 4 output blocks carry (`cardOut`, ROUTING → BLOCK → CARD).
// Salmon's: Local 1-8 … Local 25-32 (photo). Stored only: the lab's USB card records nothing.
export const CARD_OUT_START = ["local0", "local1", "local2", "local3"];
// The sources a block of outputs can take, in the X32's order, with what the
// lab does with each (`out`: a block of the console's outputs; `built: false`:
// listed as on the console, not built in the lab).
const span = (n, size = 8) => `${n * size + 1}-${n * size + size}`;
export const BLOCK_SOURCES = [
  ...[0, 1, 2, 3].map((k) => ({ id: `local${k}`, label: `Local ${span(k)}`, card: true })),
  ...[0, 1, 2, 3, 4, 5].map((k) => ({ id: `aesa${k}`, label: `AES50 A${span(k)}`, card: true })),
  ...[0, 1, 2, 3, 4, 5].map((k) => ({ id: `aesb${k}`, label: `AES50 B${span(k)}` })),
  ...[0, 1, 2, 3].map((k) => ({ id: `card${k}`, label: `Card ${span(k)}` })),
  { id: "out0", label: "Output 1-8", out: 0, card: true },
  { id: "out1", label: "Output 9-16", out: 1, card: true },
  { id: "p16-0", label: "P16 1-8" },
  { id: "p16-1", label: "P16 9-16" },
  { id: "aux", label: "Aux 1-6/Mon" },
  { id: "auxin", label: "AuxIn 1-6/TB" },
  ...[0, 1, 2, 3].map((k) => ({ id: `user${k}`, label: `User Out ${span(k)}` })),
];
export const BLOCK_SOURCE_BY_ID = Object.fromEntries(BLOCK_SOURCES.map((x) => [x.id, x]));
// The console's output block an AES50-A output block carries (0 = Output 1-8, 1 = Output 9-16), or null.
export function aesOutBlock(mixer, block) {
  const v = (Array.isArray(mixer?.aesOut) ? mixer.aesOut : AES_OUT_START)[block];
  return BLOCK_SOURCE_BY_ID[v]?.out ?? null;
}

// The compact mixers' rear panels come from their definitions.
// `panels`: jacks that physically live in another box (the CL3's Rio stage box); ports name theirs with `panel`.
for (const def of Object.values(COMPACT)) DEVICE_TYPES[def.id] = { name: def.name, mixer: true, compact: true, ports: compactPorts(def), ...(def.rio ? { panels: { rio: def.rio } } : {}), ...(def.builtInSpeaker ? { builtInSpeaker: def.builtInSpeaker } : {}) };

// What plugs into the wall: every mixer (not the battery field mixers), amp,
// powered speaker, digital stage box, and the racks' gear (powerSpec). A
// powered speaker's THRU is a straight wire, so it passes its input on even
// with the speaker off. The plug's name is what the lab is sure of; the rest
// is "power cable".
{
  const iec = { plug: "IEC power cable" };
  const battery = new Set(["f8n", "sd442"]);
  for (const [id, t] of Object.entries(DEVICE_TYPES)) {
    if (t.power) continue;
    if ((t.mixer && !battery.has(id)) || t.poweramp || ["s32", "sd8", "active-wedge"].includes(id)) t.power = iec;
    else if (t.endpoint && t.amp === "internal") t.power = { ...iec, passiveThru: true };
    else if (["mix5", "line-passthru", "pas225", "pas225x", "ptu6000", "ptu7000", "iem-tx", "foh-mac"].includes(id)) t.power = { plug: "power cable" };
  }
  DEVICE_TYPES["active-wedge"].power = iec; // no THRU jack
}

// ---------- links through stage boxes ----------

// Cable-like links for signal that passes through a stage box: source → mixer
// channel through a snake, mixer output → speaker through a snake return, a
// stage box input → the console's AES50 channel, a console output → a stage box
// output. The physical cables stay in rig.cables; these say where the signal ends up.
export function throughLinks(rig) {
  const links = [];
  const byTo = new Map(rig.cables.map((c) => [c.to, c]));
  const byFrom = new Map(rig.cables.map((c) => [c.from, c]));
  const mixer = rig.devices.find(isMixer);
  // A passive snake's tail in a stage box input (a sub snake into the S32):
  // follow it back to what is plugged in on stage. Null if that end is empty.
  const upstream = (c) => {
    for (let hop = 0; c && hop < 4; hop++) {
      const p = getPort(rig, c.from);
      if (p?.role !== "snake-out" || !DEVICE_TYPES[p.device.type].passthrough) return c;
      const back = byTo.get(portRef(p.device.id, p.through));
      c = back ? { ...c, from: back.from } : null;
    }
    return c;
  };
  for (const d of rig.devices) {
    const type = DEVICE_TYPES[d.type];
    if (!type?.stagebox) continue;
    if (type.passthrough) {
      for (const p of type.ports.filter((q) => q.dir === "in")) {
        const into = byTo.get(portRef(d.id, p.id));
        const outOf = byFrom.get(portRef(d.id, p.through));
        // `plug`: what actually goes into the far jack is the tail's plug (XLR into a combo = the mic path).
        if (into && outOf) links.push({ id: `via-${into.id}-${outOf.id}`, from: into.from, to: outOf.to, cable: outOf.cable, plug: plugAtInput(rig, outOf), via: d.id });
      }
      continue;
    }
    // A digital box only passes audio while its network cable reaches the
    // console, directly or through the box before it in a daisy chain.
    const net = type.ports.find((q) => q.network);
    const offset = mixer ? aesOffset(rig, d, mixer) : null;
    if (offset === null) continue;
    const mixerPorts = DEVICE_TYPES[mixer.type].ports;
    // The console's own XLR outputs, in order: AES50 output channel n carries the
    // nth, and 17–32 repeat 1–16 (Salmon's X32: ROUTING → AES A, 2026-10-20).
    const consoleOuts = mixerPorts.filter((q) => q.role === "bus-out" && q.jack === "xlr" && !q.panel && q.channel === undefined);
    // Input routing: a channel's AES50 jack hears AES50-A channel `remote`, moved
    // by its block's routing (CH 17-24 can listen to AES50 A33-40).
    const remoteOf = (q) => {
      if (!Array.isArray(mixer.inSource)) return q.remote;
      const b = Math.floor(q.channel / 8);
      const k = aesBlockOf(mixer.inSource, b);
      return k === null ? q.remote : k * 8 + (q.channel % 8);
    };
    for (const p of type.ports) {
      if (p.role === "sb-in") {
        const into = upstream(byTo.get(portRef(d.id, p.id)));
        if (!into) continue;
        for (const ch of mixerPorts.filter((q) => q.jack === net.network && remoteOf(q) === offset + p.index)) links.push({ id: `${net.network}-${into.id}-${ch.channel}`, from: into.from, to: portRef(mixer.id, ch.id), cable: into.cable, via: d.id });
      }
      // A box whose outputs have failed (`outsDead`) still passes its inputs.
      if (p.role === "sb-out" && !d.outsDead) {
        const outOf = byFrom.get(portRef(d.id, p.id));
        // The AES50 output channel this jack carries, and what ROUTING → AES A puts on its block of 8.
        const n = (type.bank ? d.outBank || 0 : 0) * 8 + p.index;
        const blk = aesOutBlock(mixer, Math.floor(n / 8));
        const src = blk === null ? null : consoleOuts[blk * 8 + (n % 8)];
        if (outOf && src) links.push({ id: `${net.network}-${outOf.id}`, from: portRef(mixer.id, src.id), to: outOf.to, cable: outOf.cable, via: d.id });
      }
    }
  }
  // A LOCAL block routed from another block's jacks (CH 9-16 ← Local 1-8):
  // whatever is plugged into those jacks reaches these channels too.
  if (mixer && Array.isArray(mixer.inSource)) {
    const local = DEVICE_TYPES[mixer.type].ports.filter((q) => q.role === "channel-input" && !q.stereo && q.jack !== "aes50" && q.jack !== "dante");
    mixer.inSource.forEach((v, b) => {
      const k = localBlockOf(mixer.inSource, b);
      if (k === null || k === b) return;
      for (const q of local.filter((x) => Math.floor(x.channel / 8) === b)) {
        const jack = local.find((x) => x.channel === k * 8 + (q.channel % 8) && x.jack === q.jack && x.path === q.path);
        const into = jack && byTo.get(portRef(mixer.id, jack.id));
        if (into) links.push({ id: `local-${into.id}-${q.channel}`, from: into.from, to: portRef(mixer.id, q.id), cable: into.cable, plug: plugAtInput(rig, into), via: mixer.id, remap: true });
      }
    });
  }
  // THRU (a speaker passing its input on): whatever feeds the speaker also feeds
  // the next one in the chain, however long the chain is.
  const thrus = rig.devices.flatMap((d) => (DEVICE_TYPES[d.type]?.ports || []).filter((p) => p.role === "thru").map((p) => ({ d, p })));
  if (thrus.length) {
    const feeding = new Map([...rig.cables, ...links].map((c) => [c.to, c]));
    for (let pass = 0, added = true; added && pass < thrus.length; pass++) {
      added = false;
      for (const { d, p } of thrus) {
        const into = feeding.get(portRef(d.id, p.through));
        const outOf = byFrom.get(portRef(d.id, p.id));
        if (!into || !outOf || getPort(rig, into.from)?.role === "thru") continue; // wait until the chain above resolves
        const id = `thru-${outOf.id}`;
        if (links.some((l) => l.id === id)) continue;
        const link = { id, from: into.from, to: outOf.to, cable: outOf.cable, via: d.id, viaPort: p.id };
        links.push(link);
        feeding.set(outOf.to, link);
        added = true;
      }
    }
  }
  // Parallel jacks (a passive wedge's two speakONs): every box joined by
  // cables between parallel jacks is one electrical chain, whichever end was
  // plugged first. One output driving the chain feeds every box in it (on its
  // first jack, where analyzeEndpoint looks). Two different outputs on one
  // chain are tied together, which can damage an amp: every box in it gets a
  // `conflict` link instead, and plays nothing.
  const parallelOf = (ref) => getPort(rig, ref)?.parallel;
  const parDevs = rig.devices.filter((d) => (DEVICE_TYPES[d.type]?.ports || []).some((p) => p.parallel));
  if (parDevs.length) {
    const firstJack = (id) => portRef(id, DEVICE_TYPES[getDevice(rig, id).type].ports.find((p) => p.parallel).id);
    const devOf = (ref) => splitRef(ref).deviceId;
    // What reaches each jack: the last route wins, as in analyzeRig's byTo.
    const into = new Map([...rig.cables, ...links].map((c) => [c.to, c]));
    const between = rig.cables.filter((c) => parallelOf(c.from) && parallelOf(c.to) && devOf(c.from) !== devOf(c.to));
    const seen = new Set();
    for (const d of parDevs) {
      if (seen.has(d.id)) continue;
      const group = [d.id];
      seen.add(d.id);
      for (let i = 0; i < group.length; i++) {
        for (const c of between) {
          const [a, b] = [devOf(c.from), devOf(c.to)];
          const next = a === group[i] ? b : b === group[i] ? a : null;
          if (next && !seen.has(next)) {
            seen.add(next);
            group.push(next);
          }
        }
      }
      const drives = [...into.values()].filter((c) => parallelOf(c.to) && !parallelOf(c.from) && group.includes(devOf(c.to)));
      const sources = [...new Set(drives.map((c) => c.from))];
      if (!sources.length) continue;
      for (const id of group) {
        links.push({ id: `par-${id}`, from: sources[0], to: firstJack(id), cable: drives[0].cable, via: id, ...(sources.length > 1 ? { conflict: sources } : {}) });
      }
    }
  }
  return links;
}

// Which way a cable between two jacks runs: [from, to], or null when it can't
// (two inputs, two outputs). A parallel jack is either: it takes the other
// end's direction, and between two parallel jacks the first one is `from`.
export function orient(rig, aRef, bRef) {
  const a = getPort(rig, aRef);
  const b = getPort(rig, bRef);
  if (!a || !b) return null;
  const canIn = (p) => p.dir === "in" || p.parallel;
  const canOut = (p) => p.dir === "out" || p.parallel;
  if (a.parallel && b.parallel) return [aRef, bRef];
  if (a.dir === "out" && !a.parallel && canIn(b)) return [aRef, bRef];
  if (b.dir === "out" && !b.parallel && canIn(a)) return [bRef, aRef];
  if (canOut(a) && b.dir === "in") return [aRef, bRef];
  if (canOut(b) && a.dir === "in") return [bRef, aRef];
  return null;
}

// Where a digital stage box's inputs start on the console's AES50 A port: 0 for
// the box on the console itself, after the previous box's inputs for one on
// that box's AES50 B. null: no link to the console.
export function aesOffset(rig, d, mixer, seen = new Set()) {
  if (seen.has(d.id)) return null;
  seen.add(d.id);
  const type = DEVICE_TYPES[d.type];
  const net = type.ports.find((q) => q.network);
  const cable = rig.cables.find((c) => c.from === portRef(d.id, net.id));
  if (!cable) return null;
  const to = getPort(rig, cable.to);
  if (!to || to.network !== net.network) return null;
  if (to.device.id === mixer.id) return 0;
  if (!to.chain || !DEVICE_TYPES[to.device.type]?.stagebox) return null;
  const up = aesOffset(rig, to.device, mixer, seen);
  return up === null ? null : up + DEVICE_TYPES[to.device.type].ins;
}

// Every route the analysis and the engine follow: cables, Dante subscriptions,
// and signal passing through stage boxes (these last win for the port they reach).
export const rigLinks = (rig) => [...rig.cables, ...danteLinks(rig), ...throughLinks(rig)];

// ---------- rig helpers ----------

export const portRef = (deviceId, portId) => `${deviceId}/${portId}`;

export const isMixer = (device) => !!device && !!DEVICE_TYPES[device.type]?.mixer;
export const mixerOf = (rig) => rig.devices.find(isMixer) || null;

// The mixer input port for channel strip `index` (0-based), e.g. "mixer/ch1" or
// "mixer/ch9-10". Where a channel has a jack per path, `plug` picks it: an XLR
// plug goes to the MIC jack, anything else to LINE.
export function channelPortRef(index, { plug, mixerType = "mixer" } = {}) {
  const ports = DEVICE_TYPES[mixerType].ports.filter((p) => p.role === "channel-input" && p.channel === index);
  const port = ports.find((p) => !p.path || p.path === (plug === "xlr" ? "mic" : "line")) || ports[0];
  return port ? portRef("mixer", port.id) : null;
}

export function splitRef(ref) {
  const i = ref.indexOf("/");
  return { deviceId: ref.slice(0, i), portId: ref.slice(i + 1) };
}

export function getDevice(rig, deviceId) {
  return rig.devices.find((d) => d.id === deviceId) || null;
}

export function getPort(rig, ref) {
  const { deviceId, portId } = splitRef(ref);
  const device = getDevice(rig, deviceId);
  if (!device) return null;
  const type = DEVICE_TYPES[device.type];
  const port = type && type.ports.find((p) => p.id === portId);
  return port ? { ...port, ref, device, type } : null;
}

export function listPorts(rig, device) {
  return DEVICE_TYPES[device.type].ports.map((p) => ({ ...p, ref: portRef(device.id, p.id), device }));
}

export function cableAt(rig, ref) {
  return rig.cables.find((c) => c.from === ref || c.to === ref) || null;
}

// Cables that physically fit a port (for the cable picker).
export function cablesForPort(port) {
  return Object.values(CABLES).filter((c) => cableFitsPort(c.id, port));
}

// Can `cableId` go from an out port to an in port? Returns { ok, reason }.
// Physical fit plus a few hard "don't do that in this lab" rules; signal-level
// mistakes are allowed (and explained by analyzeRig) because making them is
// part of learning.
export function checkConnection(rig, fromRef, toRef, cableId) {
  const from = getPort(rig, fromRef);
  const to = getPort(rig, toRef);
  const cable = CABLES[cableId];
  if (!from || !to || !cable) return { ok: false, reason: "Unknown port or cable." };
  if (!(from.dir === "out" || from.parallel) || !(to.dir === "in" || to.parallel)) return { ok: false, reason: "Cables run from an output to an input." };
  if (from.device.id === to.device.id) return { ok: false, reason: "That would loop a device back into itself." };

  const ends = cableEndFor(cableId, from.jack);
  if (!ends) return { ok: false, reason: `A ${cable.name} doesn't fit the ${JACKS[from.jack].name} jack on ${from.name}.` };
  if (!plugFitsJack(ends.far, to.jack)) {
    // try the cable the other way round before giving up
    const flipped = cableEndFor(cableId, to.jack);
    if (!flipped || !plugFitsJack(flipped.far, from.jack)) {
      return { ok: false, reason: `The other end (${PLUGS[ends.far].name}) doesn't fit the ${JACKS[to.jack].name} jack on ${to.name}.` };
    }
  }
  if (cableAt(rig, fromRef)) return { ok: false, reason: `${from.name} already has a cable.` };
  if (cableAt(rig, toRef)) return { ok: false, reason: `${to.name} already has a cable.` };
  if (to.role === "channel-input") {
    const sibling = to.type.ports.find((p) => p.channel === to.channel && p.id !== to.id && cableAt(rig, portRef(to.device.id, p.id)));
    if (sibling) return { ok: false, reason: `${sibling.name} is already in use. Use one input per channel.` };
  }

  if ((from.level === "rf") !== (to.level === "rf")) {
    return { ok: false, reason: "Antenna coax carries radio, not audio: it goes from an antenna to a distribution unit or a receiver, and nowhere else." };
  }
  if (isMixer(from.device) && isMixer(to.device)) {
    return { ok: false, reason: "Patching the mixer into itself makes a feedback loop." };
  }
  if (from.network || to.network) {
    if (!(from.network && to.network)) return { ok: false, reason: "A network port only talks to another network port." };
    if (from.network !== to.network) return { ok: false, reason: `${from.name} is ${from.network.toUpperCase()}; ${to.name} is ${to.network.toUpperCase()}. They don't talk to each other.` };
  }
  // Stage boxes: mic lines go out to FOH, returns come back to the stage.
  if (to.role === "snake-in" && to.end === "stage" && isMixer(from.device)) {
    return { ok: false, reason: "That snake channel runs back to the console. Send to the stage on a RETURN (A–D)." };
  }
  if (to.role === "snake-in" && to.end === "foh" && from.type.source) {
    return { ok: false, reason: "The returns carry signal from FOH to the stage. Plug sources into the snake's inputs on stage." };
  }
  if ((to.role === "snake-in" || to.role === "sb-in") && from.level === "speaker") {
    return { ok: false, reason: "Speaker level never goes down a snake or into a stage box. Keep the amp near its speakers." };
  }
  if (to.role === "sb-in" && isMixer(from.device)) {
    return { ok: false, reason: "The stage box's inputs come back into the console: a feedback loop." };
  }
  const throughStage = to.role === "snake-in" || to.role === "sb-in";
  if (from.type.source && !isMixer(to.device) && to.role !== "rec-in" && !throughStage) {
    return { ok: false, reason: "In this lab, sources plug into the mixer (or a recorder, or a stage box) first." };
  }
  if (to.role === "channel-input" && !from.type.source && !from.type.receiver && from.role !== "snake-out") {
    return { ok: false, reason: "Only sources (or a wireless receiver's outputs) go into the mixer's channel inputs here (straight, or through a snake)." };
  }
  if (to.role === "return-in" && from.role !== "proc-out") {
    return { ok: false, reason: "The aux returns take an effects unit's outputs." };
  }
  if (to.role === "proc-in" && !(isMixer(from.device) && from.role === "bus-out")) {
    return { ok: false, reason: "Feed the effects unit from a mixer output (usually an aux send)." };
  }
  if (from.role === "amp-out" && to.role === "amp-in") {
    return { ok: false, reason: "Never feed a power amp's speaker output into an input." };
  }
  return { ok: true };
}

// The plug that ends up in `toRef` for a cable (decides mic vs line path on a combo jack).
export function plugAtInput(rig, cable) {
  const from = getPort(rig, cable.from);
  const to = getPort(rig, cable.to);
  if (!from || !to) return null;
  const ends = cableEndFor(cable.cable, from.jack);
  if (ends && plugFitsJack(ends.far, to.jack)) return ends.far;
  const flipped = cableEndFor(cable.cable, to.jack);
  return flipped ? flipped.near : null;
}

// ---------- analysis ----------

const LINE_PAD_DB = -20; // 1/4" side of a combo jack is padded before the preamp

// Analyzes the whole rig against the current mixer state (phantom power lives
// on the mixer channels). Returns:
//   channels[i]  what feeds mixer channel i and whether it makes useful signal
//   endpoints    every speaker: which bus reaches it and whether the chain works
//   buses        per mixer output port: the endpoints it validly reaches
export function analyzeRig(rig, channels = [], sources = {}) {
  // Dante routes count as patches: the network is the cable.
  const byTo = new Map(rigLinks(rig).map((c) => [c.to, c]));

  const channelInfo = [];
  const mixer = mixerOf(rig);
  const mixerPorts = mixer ? DEVICE_TYPES[mixer.type].ports : [];
  for (const port of mixerPorts.filter((p) => p.role === "channel-input")) {
    // INPUT PATCH (CL3): a channel listens to its Rio jack or its Dante RX, never both.
    if (Array.isArray(mixer.inPatch) && port.channel < mixer.inPatch.length && (port.jack === "dante") !== (mixer.inPatch[port.channel] === 1)) {
      channelInfo[port.channel] ||= { connected: false, signal: false, status: "empty", messages: [] };
      continue;
    }
    // Input routing (X32): each block of 8 channels takes its local jacks, AES50-A
    // (a stage box) or the CARD (USB from a computer: nothing plays here, so silence).
    const blockNo = Math.floor(port.channel / 8);
    const block = Array.isArray(mixer.inSource) ? mixer.inSource[blockNo] : undefined;
    // AES50 B and the card play nothing here: neither kind of jack is listened to.
    const listens = block === undefined || (port.jack === "aes50" ? aesBlockOf(mixer.inSource, blockNo) !== null : localBlockOf(mixer.inSource, blockNo) !== null);
    if (!listens) {
      channelInfo[port.channel] ||= { connected: false, signal: false, status: "empty", messages: [] };
      continue;
    }
    const ref = portRef(mixer.id, port.id);
    let cable = byTo.get(ref);
    // A LOCAL block patched from another block's jacks hears those (a `remap` link), not its own.
    if (block !== undefined && port.jack !== "aes50" && localBlockOf(mixer.inSource, blockNo) !== blockNo && !cable?.remap) cable = undefined;
    if (!cable && channelInfo[port.channel]) continue; // a channel with two jacks: the one in use wins
    const ch = channels[port.channel] || {};
    channelInfo[port.channel] = analyzeChannelInput(rig, cable, ch, sources, port);
  }

  const endpoints = [];
  for (const device of rig.devices) {
    const type = DEVICE_TYPES[device.type];
    if (!type || !type.endpoint) continue;
    endpoints.push(analyzeEndpoint(rig, device, byTo));
  }
  // A mixer that is also the speaker (B207MP3): its own amp drives its own
  // speaker, so the main mix always reaches a working endpoint (the box itself).
  const builtIn = mixer && DEVICE_TYPES[mixer.type].builtInSpeaker;
  if (builtIn) {
    const port = mixerPorts.find((p) => p.internal && p.role === "bus-out");
    endpoints.push({ deviceId: mixer.id, zone: mixer.zone || builtIn.zone || "foh", pan: 0, output: port.id, valid: true, status: "ok", messages: [], chain: [portRef(mixer.id, port.id)], viaAmp: null, builtIn: true });
  }

  // A console that's off passes nothing: no channel hears its input, no output carries anything.
  if (mixer && !powered(rig, mixer)) {
    const why = `No power: ${powerWhy(rig, mixer)}`;
    for (const info of channelInfo) if (info?.connected) Object.assign(info, { signal: false, status: "no-power", messages: [why] });
    for (const e of endpoints) if (e.output && (e.valid || e.status === "off")) Object.assign(e, { valid: false, status: "no-power", messages: [why] });
  }

  const buses = {};
  for (const p of mixerPorts.filter((p) => p.role === "bus-out")) {
    // A speaker turned all the way down (a knob at 0) doesn't count as reaching anyone.
    buses[p.id] = endpoints.filter((e) => e.valid && e.output === p.id && e.gainDb !== -Infinity).map((e) => e.deviceId);
  }

  // Aux returns: which jacks are in use (a lone L is normalled to both sides).
  const returns = {};
  for (const p of mixerPorts.filter((p) => p.role === "return-in")) {
    const r = (returns[`ret${p.ret}`] ||= { L: false, R: false });
    r[p.side] = byTo.has(portRef(mixer.id, p.id));
  }

  // Recorder inputs, analysed like mixer inputs (phantom is the recorder's own).
  const recorders = {};
  for (const device of rig.devices) {
    const type = DEVICE_TYPES[device.type];
    if (!type || !type.recorder) continue;
    recorders[device.id] = type.ports
      .filter((p) => p.role === "rec-in")
      .map((p) => analyzeChannelInput(rig, byTo.get(portRef(device.id, p.id)), { phantom: !!device.tracks?.[p.track]?.phantom }, sources, p));
  }
  return { channels: channelInfo, endpoints, buses, returns, recorders };
}

function analyzeChannelInput(rig, cable, ch, sources, port) {
  if (!cable) return { connected: false, signal: false, status: "empty", messages: [] };
  const from = getPort(rig, cable.from);
  const plug = cable.plug || plugAtInput(rig, cable);
  const path = port.path || (plug === "xlr" ? "mic" : "line");
  // A receiver channel carries the handheld paired with it.
  const rxChannel = from.type.receiver ? receiverChannel(rig, from.device, Number(from.id.slice(3))) : null;
  const sourceId = from.sourceId || from.device.sourceId || rxChannel?.sourceId || null;
  const source = sources[sourceId] || null;
  const txDevice = rxChannel ? rig.devices.find((d) => d.sourceId === sourceId) : from.device;
  const info = {
    connected: true,
    sourceDeviceId: from.device.id,
    sourceId,
    fromPort: cable.from,
    path,
    stereo: !!port.stereo,
    monoIn: !!port.monoIn, // a mono source into a stereo channel's L (MONO) jack
    padDb: path === "line" && port.pad !== false ? LINE_PAD_DB : 0,
    level: from.level,
    cable: cable.cable,
    dante: !!cable.dante,
    // Digital playback (Dante): arrives at DANTE.levelDb, not at the stem's mic level.
    digital: !!from.digital,
    digitalDb: from.digital && source ? DANTE.levelDb - source.outputDb : 0,
    signal: true,
    status: "ok",
    messages: [],
    // The source's own gear: its button, volume knob or power (a muted handheld, a guitar amp
    // turned down or off), and a handheld's receiver channel.
    trimDb: sourceGearDb(rig, txDevice, source) + (rxChannel && !DEVICE_TYPES[txDevice?.type]?.rf ? rxChannel.db : 0),
  };
  if (txDevice && !powered(rig, txDevice)) info.messages.push(`No sound: ${powerWhy(rig, txDevice)}`);
  // A box on the way with no power (a stage box), or a receiver that's off: nothing comes out of it.
  const dark = deadVia(rig, cable) || (!from.type.source && !powered(rig, from.device) ? from.device : null);
  if (dark) {
    Object.assign(info, { signal: false, status: "no-power" });
    info.messages.push(`No power: ${powerWhy(rig, dark)}`);
    return info;
  }
  const deviceType = DEVICE_TYPES[from.device.type];
  // Playback over Dante is already audio: no mic, so no phantom power to need.
  const needsPhantom = !from.digital && (deviceType.needsPhantom || (source && source.phantom === "required"));

  if (from.level === "speaker") {
    info.signal = false;
    info.status = "danger";
    info.messages.push("Speaker level into a mixer input can damage it. Unplug this!");
    return info;
  }
  if (needsPhantom && path !== "mic") {
    info.signal = false;
    info.status = "no-phantom";
    info.messages.push("A condenser mic needs +48 V, which only travels over an XLR into the mic input.");
  } else if (needsPhantom && !ch.phantom) {
    info.signal = false;
    info.status = "no-phantom";
    info.messages.push("Condenser mic, no +48 V: it's plugged in but silent. Turn on phantom power.");
  }
  // A receiver's AF OUT is line level, turned down at its VOL knob (9 o'clock): fine into a mic preamp.
  if (from.level === "line" && path === "mic" && !from.type.source && !from.type.receiver) {
    if (info.status === "ok") info.status = "hot";
    info.messages.push("Line level into a mic preamp: far too hot, even with the gain all the way down. Use a 1/4\" cable into the line input.");
  }
  if (from.level === "mic" && path === "line") {
    if (info.status === "ok") info.status = "weak";
    info.messages.push("Mic level on the 1/4\" line input skips the mic preamp's range — very quiet. Use XLR into the mic input.");
  }
  if (from.level === "instrument" && path === "mic") {
    if (info.status === "ok") info.status = "weak";
    info.messages.push("Instrument level wants a DI box or Hi-Z input.");
  }
  const cableDef = CABLES[cable.cable];
  if (cableDef && cableDef.kind === "speaker") {
    info.messages.push("Speaker cable is unshielded — expect hum on a mic or line signal. Use an instrument or balanced cable.");
  }
  return info;
}

// The level an output port carries: fixed, or (442 XLR outs) the mixer's OUTPUT LEVEL switch.
export const OUT_LEVELS = ["mic", "tape", "line"];
export function outputLevelOf(port) {
  if (port.switchKey) return port.switchLevels[port.device[port.switchKey] ?? 0];
  return port.levelSwitch ? OUT_LEVELS[port.device.outLevel ?? 2] : port.level;
}

// A camera input records whatever arrives; the question is whether its MIC/LINE
// switch matches. `gainDb` is the camera's own input gain (MIC adds 40 dB).
function analyzeCamera(result, device, up) {
  if (up.level === "speaker") {
    result.status = "danger";
    result.messages.push("Speaker level into a camera input can damage it. Cameras take mic or line level.");
    return result;
  }
  if (up.role !== "bus-out") {
    result.status = "invalid";
    result.messages.push("This camera input isn't fed from a mixer output.");
    return result;
  }
  const level = outputLevelOf(up);
  const input = device.inputLevel === 1 ? "line" : "mic";
  // A 3.5 mm camera input has no LINE setting: only the output can change.
  if (DEVICE_TYPES[device.type].ports[0].jack === "mini" && level !== "mic") {
    Object.assign(result, { output: up.id, valid: true, camera: true, gainDb: 40, status: "hot" });
    result.messages.push(`${level === "line" ? "Line" : "−10"} level into the camera's 3.5 mm MIC input: ${level === "line" ? "about 40" : "about 26"} dB too hot, so it distorts. It has no LINE setting: set the output feeding it to MIC level.`);
    return result;
  }
  Object.assign(result, { output: up.id, valid: true, status: "ok", camera: true, gainDb: input === "mic" ? 40 : 0 });
  if (input === "mic" && level !== "mic") {
    result.status = "hot";
    result.messages.push(`${level === "line" ? "Line" : "−10 (tape)"} level into the camera's MIC input: ${level === "line" ? "about 40" : "about 26"} dB too hot, so it distorts. Set the camera to LINE, or the mixer's OUTPUT LEVEL to MIC.`);
  } else if (input === "line" && level === "mic") {
    result.status = "weak";
    result.messages.push("Mic level into the camera's LINE input: about 40 dB too quiet, so it records mostly noise. Set the camera to MIC, or the mixer's OUTPUT LEVEL to LINE.");
  } else if (input === "line" && level === "tape") {
    result.messages.push("−10 (tape) level into a LINE input: 14 dB low. It works, with less headroom above the noise.");
  }
  return result;
}

// The knobs between the mixer and a speaker (an amp's level, a small mixer
// on the way, an active wedge's VOLUME): `gainDb` is what they do to the
// level (the engine applies it), and a speaker turned right down says which
// knob. `parts`: [device, pair or side] for each piece of gear on the way.
function quietIf(result, parts) {
  const knobs = parts.flatMap(([d, pair]) => (DEVICE_TYPES[d.type].knobs || []).filter((k) => !k.select && k.path !== false && (!k.pair || k.pair === pair)).map((k) => ({ d, k, db: knobPartDb(d, k, pair) })));
  result.gainDb = knobs.reduce((db, x) => db + x.db, 0);
  if (!knobs.length || result.gainDb > -18) return;
  const low = knobs.sort((a, b) => a.db - b.db)[0];
  // All the way down is a setting, not a fault (CME turns the hall's speakers off at the Mix5): `off`.
  result.status = result.gainDb === -Infinity ? "off" : "weak";
  const name = `${low.d.label || DEVICE_TYPES[low.d.type].name}: ${low.k.label}`;
  result.messages.push(result.gainDb === -Infinity ? `Turned down: ${name} is all the way down, so this speaker plays nothing. The chain to it works.` : `Very quiet: ${name} is at ${knobPos(low.d, low.k)} (${Math.round(result.gainDb)} dB).`);
}

// Walks upstream from a speaker to the mixer output that feeds it.
function analyzeEndpoint(rig, device, byTo) {
  const type = DEVICE_TYPES[device.type];
  const inPort = type.ports.find((p) => p.dir === "in");
  const inRef = portRef(device.id, inPort.id);
  const result = {
    deviceId: device.id,
    zone: device.zone || "foh",
    pan: device.pan ?? 0,
    output: null, // mixer output port id that reaches this speaker
    valid: false,
    status: "unpatched",
    messages: [],
    chain: [inRef],
    viaAmp: null,
  };
  const cable = byTo.get(inRef);
  if (!cable) {
    result.messages.push(type.amp === "none" ? "Nothing connected. A passive speaker needs a power amp." : "Nothing connected.");
    return result;
  }
  if (cable.conflict) {
    result.status = "danger";
    result.messages.push(`Two amp outputs are tied together through the speakers' parallel jacks (${cable.conflict.map((r) => { const q = getPort(rig, r); return q ? `${q.device.label || q.type.name} · ${q.name}` : r; }).join(" and ")}). That can damage the amp: one amp channel per chain.`);
    return result;
  }
  const up = getPort(rig, cable.from);
  result.chain.unshift(cable.from);
  // A cable that has failed inside (`broken`): every jack on the way is right, and nothing gets through.
  const broken = (c) => {
    if (!c?.broken) return false;
    result.status = "invalid";
    result.messages.push("Everything on the way is plugged into the right jack, but nothing gets through. What's left is a cable itself.");
    return true;
  };
  if (broken(cable)) return result;
  // Gear that needs power to pass the signal on (a stage box, the Mix5), or the amp itself.
  const noPower = (d) => {
    result.status = "no-power";
    result.messages.push(`No power: ${powerWhy(rig, d)}`);
    return result;
  };
  if (deadVia(rig, cable)) return noPower(deadVia(rig, cable));
  const warnCable = (c, level) => {
    const def = CABLES[c.cable];
    // Still plays, but it's the wrong cable: `cableWarn` flags it on the speaker's box and card.
    if (level === "speaker" && def.kind !== "speaker") {
      result.cableWarn = true;
      result.messages.push(`${def.name} carrying speaker level: use real speaker cable (thin shielded wire can overheat).`);
    }
    if (level !== "speaker" && def.kind === "speaker") result.messages.push("Speaker cable carrying line level: unshielded, may hum.");
  };
  warnCable(cable, up.level);

  if (type.camera) return analyzeCamera(result, device, up);

  if (type.amp === "internal") {
    if (up.level === "speaker") {
      result.status = "danger";
      result.messages.push("Speaker level into a powered speaker's line input can damage it. A powered speaker already has its amp.");
      return result;
    }
    if (up.role === "bus-out") {
      // Its own power: the amp is inside (CME's active wedge: an IEC cable and a switch).
      if (!powered(rig, device)) return noPower(device);
      result.output = up.id;
      result.valid = true;
      result.status = "ok";
      if (type.knobs) quietIf(result, [[device]]);
      return result;
    }
    result.status = "invalid";
    result.messages.push("This speaker isn't fed from a mixer output.");
    return result;
  }

  // passive speaker
  // A powered mixer (STAGEPAS) has its amp inside: its SPEAKERS jacks carry speaker level.
  if (up.role === "bus-out" && up.level === "speaker") {
    result.output = up.id;
    result.valid = true;
    result.status = "ok";
    return result;
  }
  if (up.role === "bus-out") {
    result.output = up.id;
    result.status = "no-amp";
    result.messages.push("Line level can't drive a passive speaker — there's no amplifier. Put a power amp in between, or use a powered speaker.");
    return result;
  }
  if (up.role === "amp-out") {
    result.viaAmp = up.device.id;
    const ampInRef = portRef(up.device.id, `in-${up.pair}`);
    const ampCable = byTo.get(ampInRef);
    result.chain.unshift(ampInRef);
    if (!ampCable) {
      result.status = "amp-no-input";
      result.messages.push(`The amp's Input ${up.pair.toUpperCase()} has nothing plugged in.`);
      return result;
    }
    if (broken(ampCable)) return result;
    if (!powered(rig, up.device)) return noPower(up.device);
    if (deadVia(rig, ampCable)) return noPower(deadVia(rig, ampCable));
    const src = getPort(rig, ampCable.from);
    result.chain.unshift(ampCable.from);
    warnCable(ampCable, src.level);
    if (src.role === "bus-out") {
      result.output = src.id;
      result.valid = true;
      result.status = "ok";
      // The amp's level knobs (and a rack's mixer knobs in front of it).
      const parts = chainKnobs(rig, up.device, up.pair, ampCable);
      if (parts.some(([d]) => DEVICE_TYPES[d.type].knobs)) quietIf(result, parts);
      // A line mixer in front of the amp (BH 109's Ashly) with its MIC button in.
      const sw = DEVICE_TYPES[up.device.type].micSwitch;
      if (sw) {
        result.gainDb = up.device[sw.key] === 1 ? sw.gainDb : 0;
        if (result.gainDb) {
          result.status = "hot";
          result.hotWhy = "the rack's line mixer is set to MIC";
          result.messages.push(`Line level into the rack's line mixer set to MIC: ${sw.gainDb} dB too hot, so it distorts (in a room, it feeds back). Set it to LINE.`);
        }
      }
      return result;
    }
    result.status = "invalid";
    result.messages.push("The amp isn't fed from a mixer output.");
    return result;
  }
  result.status = "invalid";
  result.messages.push("This speaker isn't fed from a mixer output.");
  return result;
}
