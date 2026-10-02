// Physical connection model: connectors, cables, signal levels, device ports,
// and the rules that decide whether a patch makes sound. Pure data + pure
// functions — no DOM, no Web Audio — so it runs under `node --test`.
//
// Two separate questions are answered for every cable:
//   1. Does it physically fit?  (plug ↔ jack)
//   2. Does the signal make sense?  (mic / instrument / line / speaker level)
// A plug that fits is not proof that the connection is right.

// ---------- signal levels ----------

// nominalDb is relative to pro line level (+4 dBu = 0 dB). Used for teaching
// copy and for rough "is this source hot enough" arithmetic, not electrical
// simulation.
export const SIGNAL_LEVELS = {
  mic: { id: "mic", name: "Mic level", nominalDb: -45, blurb: "Very weak. Needs a preamp (lots of gain)." },
  instrument: { id: "instrument", name: "Instrument level", nominalDb: -20, blurb: "Weak, high-impedance. Needs a DI or instrument input." },
  line: { id: "line", name: "Line level", nominalDb: 0, blurb: "Strong. What mixers and powered speakers pass around." },
  speaker: { id: "speaker", name: "Speaker level", nominalDb: 30, blurb: "Amplified power that moves a speaker cone. Never into an input." },
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
  speaker: { id: "speaker", name: '1/4" speaker cable', ends: ["ts14", "ts14"], kind: "speaker", balanced: false, blurb: "Heavy, unshielded. Same plug as a guitar cable — different job." },
  rca: { id: "rca", name: "RCA cable", ends: ["rca", "rca"], kind: "signal", balanced: false, blurb: "Consumer gear: turntables, DJ players, record outs." },
  "rca-ts": { id: "rca-ts", name: 'RCA ↔ 1/4" TS cable', ends: ["rca", "ts14"], kind: "signal", balanced: false, blurb: "Consumer gear into a mixer line input." },
  "mini-rca": { id: "mini-rca", name: "3.5 mm ↔ RCA (Y) cable", ends: ["trs35", "rca"], kind: "signal", balanced: false, blurb: "Phone/laptop headphone out to RCA." },
  "mini-dual-ts": { id: "mini-dual-ts", name: '3.5 mm ↔ dual 1/4" (breakout) cable', ends: ["trs35", "dualts14"], kind: "signal", balanced: false, stereo: true, blurb: "Stereo Y: laptop headphone out to a left + right pair of 1/4\" line inputs." },
  mini: { id: "mini", name: "3.5 mm aux cable", ends: ["trs35", "trs35"], kind: "signal", balanced: false, blurb: "Phone/laptop aux cable." },
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
// Device flags:
//   mixer     a mixer (every rig has exactly one, with id "mixer")
//   source    a virtual sound source (plays a stem)
//   endpoint  makes sound in a room; `amp: "internal"` (powered) or "none" (passive)
export const DEVICE_TYPES = {
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
      { id: "main-l", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "main", side: "L", name: "MAIN OUT L" },
      { id: "main-r", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "main", side: "R", name: "MAIN OUT R" },
      { id: "mono", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "main", side: "M", name: "MONO OUT" },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `aux${i + 1}`, dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: `aux${i + 1}`, side: "M", name: `AUX SEND ${i + 1}` })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `sub${i + 1}`, dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: `sub${i + 1}`, side: "M", name: `SUB OUT ${i + 1}` })),
      { id: "cr-l", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "cr", side: "L", name: "C-R OUT L" },
      { id: "cr-r", dir: "out", jack: "quarter", level: "line", role: "bus-out", bus: "cr", side: "R", name: "C-R OUT R" },
    ],
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
    ports: [
      { id: "in-a", dir: "in", jack: "combo", level: "line", role: "amp-in", pair: "a", name: "Input A" },
      { id: "in-b", dir: "in", jack: "combo", level: "line", role: "amp-in", pair: "b", name: "Input B" },
      { id: "out-a", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "a", name: "Speaker out A" },
      { id: "out-b", dir: "out", jack: "quarter", level: "speaker", role: "amp-out", pair: "b", name: "Speaker out B" },
    ],
    blurb: "Line level in → speaker level out. Two channels.",
  },
};

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
  if (from.dir !== "out" || to.dir !== "in") return { ok: false, reason: "Cables run from an output to an input." };
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

  if (isMixer(from.device) && isMixer(to.device)) {
    return { ok: false, reason: "Patching the mixer into itself makes a feedback loop." };
  }
  if (from.type.source && !isMixer(to.device)) {
    return { ok: false, reason: "In this lab, sources plug into the mixer first." };
  }
  if (isMixer(to.device) && !from.type.source) {
    return { ok: false, reason: "Only sources go into the mixer's channel inputs here." };
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
  const byTo = new Map(rig.cables.map((c) => [c.to, c]));

  const channelInfo = [];
  const mixer = mixerOf(rig);
  const mixerPorts = mixer ? DEVICE_TYPES[mixer.type].ports : [];
  for (const port of mixerPorts.filter((p) => p.role === "channel-input")) {
    const ref = portRef(mixer.id, port.id);
    const cable = byTo.get(ref);
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

  const buses = {};
  for (const p of mixerPorts.filter((p) => p.role === "bus-out")) {
    buses[p.id] = endpoints.filter((e) => e.valid && e.output === p.id).map((e) => e.deviceId);
  }
  return { channels: channelInfo, endpoints, buses };
}

function analyzeChannelInput(rig, cable, ch, sources, port) {
  if (!cable) return { connected: false, signal: false, status: "empty", messages: [] };
  const from = getPort(rig, cable.from);
  const plug = plugAtInput(rig, cable);
  const path = port.path || (plug === "xlr" ? "mic" : "line");
  const source = sources[from.device.sourceId] || null;
  const info = {
    connected: true,
    sourceDeviceId: from.device.id,
    sourceId: from.device.sourceId || null,
    path,
    stereo: !!port.stereo,
    padDb: path === "line" && port.pad !== false ? LINE_PAD_DB : 0,
    level: from.level,
    cable: cable.cable,
    signal: true,
    status: "ok",
    messages: [],
  };
  const deviceType = DEVICE_TYPES[from.device.type];
  const needsPhantom = deviceType.needsPhantom || (source && source.phantom === "required");

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
  const up = getPort(rig, cable.from);
  result.chain.unshift(cable.from);
  const warnCable = (c, level) => {
    const def = CABLES[c.cable];
    if (level === "speaker" && def.kind !== "speaker") result.messages.push(`${def.name} carrying speaker level: use real speaker cable (thin shielded wire can overheat).`);
    if (level !== "speaker" && def.kind === "speaker") result.messages.push("Speaker cable carrying line level: unshielded, may hum.");
  };
  warnCable(cable, up.level);

  if (type.amp === "internal") {
    if (up.level === "speaker") {
      result.status = "danger";
      result.messages.push("Speaker level into a powered speaker's line input can damage it. A powered speaker already has its amp.");
      return result;
    }
    if (up.role === "bus-out") {
      result.output = up.id;
      result.valid = true;
      result.status = "ok";
      return result;
    }
    result.status = "invalid";
    result.messages.push("This speaker isn't fed from a mixer output.");
    return result;
  }

  // passive speaker
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
    const src = getPort(rig, ampCable.from);
    result.chain.unshift(ampCable.from);
    warnCable(ampCable, src.level);
    if (src.role === "bus-out") {
      result.output = src.id;
      result.valid = true;
      result.status = "ok";
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
