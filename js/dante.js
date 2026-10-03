// Dante in the lab: a laptop running a DAW and Dante Virtual Soundcard (DVS),
// and a Dante-equipped console (the CL3). Pure JS, no audio.
//
// Three hops, each set by the student, as in a real virtual soundcheck:
//   1. the DAW: each track's output (DVS channel 1–16, or none)   daw.outs[t]
//   2. Dante Controller: each console receive channel subscribes
//      to one DVS transmit channel (or none)                         mixer.danteRx[m]
//   3. the console: channel m's input is Dante RX m (its "dante" jack)
// No cables are involved: the network carries the audio. danteLinks() turns the
// two settings into cable-like links (DAW track → channel's Dante input), so the
// rig analysis and the audio engine treat them like any other patch.

export const DANTE = {
  dvsChannels: 16, // Dante Virtual Soundcard: up to 64 in the real thing
  levelDb: -10, // DAW playback arrives as line-level digital audio, well above a mic
};

// The DAW session: one track per band stem, in the band's input-list order.
export const DAW_TRACKS = ["drums", "bass", "guitars", "keys", "trumpets", "backing-vocals", "lead-vocal"];

export const createDaw = (over = {}) => ({ outs: DAW_TRACKS.map(() => 0), ...over });

const isDaw = (d) => d.type === "daw-dvs";

// Cable-like links for every working Dante route. A console RX channel takes
// one TX channel; if two DAW tracks share an output, the later track wins (a
// DAW would sum them; the lab asks for one track per output).
export function danteLinks(rig) {
  const daw = rig.devices.find(isDaw);
  const mixer = rig.devices.find((d) => d.id === "mixer");
  if (!daw || !mixer || !Array.isArray(mixer.danteRx)) return [];
  const trackOn = {}; // DVS channel → DAW track index
  daw.outs.forEach((k, t) => k > 0 && (trackOn[k] = t));
  const links = [];
  mixer.danteRx.forEach((k, m) => {
    const t = trackOn[k];
    if (k > 0 && t !== undefined) links.push({ id: `dante-${m + 1}`, from: `${daw.id}/trk${t + 1}`, to: `mixer/ch${m + 1}-dante`, cable: "dante", dante: true });
  });
  return links;
}

// What the DVS transmits on channel k (the DAW track names), for Dante Controller's labels.
export function dvsChannelNames(rig, names = {}) {
  const daw = rig.devices.find(isDaw);
  return Array.from({ length: DANTE.dvsChannels }, (_, i) => {
    const tracks = daw ? daw.outs.map((k, t) => (k === i + 1 ? names[DAW_TRACKS[t]] || DAW_TRACKS[t] : null)).filter(Boolean) : [];
    return tracks.join(" + ");
  });
}
