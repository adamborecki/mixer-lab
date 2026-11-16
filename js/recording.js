// Recording into Logic over Dante (Vocal Jazz v2 in Salmon): the X32's X-DANTE
// card → Dante Controller → Dante Virtual Soundcard on the FOH Mac mini →
// Logic's tracks. Pure JS, no audio: what each Logic track would record.
//
// What reaches Logic input n, hop by hop (each one a fault a scenario breaks):
//   1. a Cat5e from the X32's CARD (X-DANTE) to the Mac mini's Ethernet
//   2. Dante Virtual Soundcard running                               mac.dvs (1 = running)
//   3. Logic's input device: Dante Virtual Soundcard, not the SSL 2+  mac.logicIn (0 = DVS, 1 = SSL 2+)
//   4. Dante Controller: Mac RX n subscribed to X32 TX k              mac.macRx[n - 1] = k (0 = none)
//   5. the X32's card output k: ROUTING → CARD, block ⌊(k−1)/8⌋      mixer.cardOut ("local3", "aesa3", …)
//      Local m is whatever is plugged into the X32's own input m; AES50 A m is S32 IN m (over the link).
//      The card records an input, not a channel: CH 25-32 can listen to the S32 while
//      card outputs 25-32 still carry the X32's own LOCAL 25-32.
//   6. that input's preamp: its GAIN and +48 V. On the X32 those belong to the input
//      (a local preamp, or the S32's), not the channel. The lab keeps them on the
//      channel strip, so a local input uses the channel with its number, and an S32
//      input the channel routed to it (or the one with its number when none is).
// Each Logic track: an input (1–32, 0 = none) and record-enable (`tracks[t]`).

import { CARD_OUT_START, DEVICE_TYPES, aesBlockOf, aesOffset, analyzeChannelInput, getPort, mixerOf } from "./connection-model.js";
import { COMPACT, channelGainDb } from "./compact.js";
import { HEADROOM_DB } from "./levels.js";
import { sourcePeakDb } from "./mixer-state.js";

export const LOGIC = { inputs: 32, sslInputs: 2 };

// A Mac mini that records: `tracks` holds Logic's input per track (1-based inputs).
export const createLogic = (inputs) => ({ dvs: 1, logicIn: 0, macRx: Array.from({ length: LOGIC.inputs }, (_, i) => i + 1), tracks: inputs.map((n) => ({ in: n, arm: 1 })) });

export const isRecordingMac = (d) => d.type === "foh-mac" && Array.isArray(d.tracks);
export const recordingMac = (rig) => rig.devices.find(isRecordingMac) || null;

// The X32 jack a card output carries: { kind: "local" | "aes", n } (1-based), or null for a block the lab doesn't record.
export function cardSource(rig, k) {
  const mixer = mixerOf(rig);
  const block = (Array.isArray(mixer?.cardOut) ? mixer.cardOut : CARD_OUT_START)[Math.floor((k - 1) / 8)];
  const m = /^(local|aesa)(\d)$/.exec(block || "");
  if (!m) return null;
  return { kind: m[1] === "local" ? "local" : "aes", n: Number(m[2]) * 8 + ((k - 1) % 8) + 1 };
}

// "LOCAL 29" / "S32 IN 25".
export const jackName = (src) => (src.kind === "local" ? `LOCAL ${src.n}` : `S32 IN ${src.n}`);

// Is the Mac mini cabled to the X32's Dante card?
export const macOnCard = (rig, mac) => rig.cables.some((c) => [c.from, c.to].includes("mixer/card-dante") && [c.from, c.to].includes(`${mac.id}/dante`));

// What each Logic track records: { track, in, arm, sourceId, jack, peakDb, ok, buzz, why }.
export function logicTracks(state, sourcesById, stems) {
  const rig = state.rig;
  const mac = recordingMac(rig);
  if (!mac) return [];
  const mixer = mixerOf(rig);
  const def = COMPACT[mixer.type];
  const onCard = macOnCard(rig, mac);
  const byTo = new Map(rig.cables.map((c) => [c.to, c]));
  const box = rig.devices.find((d) => DEVICE_TYPES[d.type]?.network === "aes50" && aesOffset(rig, d, mixer) === 0) || rig.devices.find((d) => d.type === "s32") || null;
  const boxLinked = !!box && aesOffset(rig, box, mixer) !== null;
  // The channel whose AES50 jack hears S32 IN n (0-based), or null.
  const routedTo = (n) => {
    for (let c = 0; c < state.channels.length; c++) {
      const k = aesBlockOf(mixer.inSource, Math.floor(c / 8));
      if (k !== null && k * 8 + (c % 8) === n - 1) return c;
    }
    return null;
  };
  return mac.tracks.map((t, track) => {
    const r = { track, in: t.in, arm: !!t.arm, sourceId: null, jack: null, peakDb: -Infinity, ok: false, buzz: false, why: "" };
    const why = (text) => Object.assign(r, { why: text });
    if (!t.in) return why("No input");
    if (!onCard) return why("No Cat5e from the X32's CARD (X-DANTE) to the Mac mini");
    if (mac.dvs === 0) return why("Dante Virtual Soundcard is stopped");
    if (mac.logicIn === 1) return why(t.in > LOGIC.sslInputs ? "Logic's input device is the SSL 2+: it has only two inputs" : "Logic's input device is the SSL 2+: nothing is plugged into it");
    const k = mac.macRx?.[t.in - 1] || 0;
    if (!k) return why(`Dante Controller: the Mac mini's RX ${t.in} isn't subscribed to the X32`);
    const src = cardSource(rig, k);
    if (!src) return why(`CARD output ${k} carries a block that isn't an input`);
    r.jack = jackName(src);
    let cable;
    let ch;
    let port;
    if (src.kind === "local") {
      port = getPort(rig, `mixer/ch${src.n}-mic`);
      cable = byTo.get(`mixer/ch${src.n}-mic`);
      ch = state.channels[src.n - 1];
    } else {
      if (!box) return why(`No stage box for ${r.jack}`);
      if (!boxLinked) return why(`No AES50 link: ${r.jack} never reaches the X32`);
      port = getPort(rig, `${box.id}/in${src.n}`);
      cable = byTo.get(`${box.id}/in${src.n}`);
      ch = state.channels[routedTo(src.n) ?? src.n - 1];
      r.buzz = !!box.buzz;
    }
    if (!cable || !port || !ch) return why(`Nothing is plugged into ${r.jack}`);
    const info = analyzeChannelInput(rig, cable, ch, sourcesById, port);
    r.sourceId = info.sourceId;
    const source = info.sourceId ? sourcesById[info.sourceId] : null;
    const stemPeak = sourcePeakDb(source, stems);
    if (!info.signal || !source || stemPeak === null) return why(info.messages[0] || `No signal on ${r.jack}`);
    r.peakDb = stemPeak + (info.trimDb ?? 0) + source.outputDb + channelGainDb(def, ch, info) + HEADROOM_DB;
    if (r.peakDb < -60) return why(`${r.jack}: almost nothing (its GAIN is far too low)`);
    r.ok = true;
    return r;
  });
}
