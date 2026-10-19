// Dante in the lab: a laptop running a DAW and Dante Virtual Soundcard (DVS),
// and a Dante-equipped console (the CL3). Pure JS, no audio.
//
// Three hops, each set by the student, as in a real virtual soundcheck:
//   0. Dante Virtual Soundcard itself must be running (daw.dvs, 1 = on):
//      stopped, the laptop isn't on the network at all
//   1. the DAW: each track's output (DVS channel 1–16, or none)   daw.outs[t]
//   2. Dante Controller: each console receive channel subscribes
//      to one DVS transmit channel (or none)                         mixer.danteRx[m]
//   3. the console's INPUT PATCH: channel m takes Rio IN m or Dante RX m   mixer.inPatch[m] (0 = Rio, 1 = Dante)
// No cables are involved: the network carries the audio. danteLinks() turns the
// two settings into cable-like links (DAW track → channel's Dante input), so the
// rig analysis and the audio engine treat them like any other patch.

export const DANTE = {
  dvsChannels: 16, // Dante Virtual Soundcard: up to 64 in the real thing
  // DAW playback arrives at the level it was recorded at (after the preamp):
  // the stage box's GAIN isn't in its path.
  levelDb: 0,
};

// The DAW session: one track per band stem, in the band's input-list order.
export const DAW_TRACKS = ["drums", "bass", "guitars", "keys", "trumpets", "backing-vocals", "lead-vocal"];

export const createDaw = (over = {}) => ({ dvs: 1, outs: DAW_TRACKS.map(() => 0), ...over });

// Is the laptop transmitting? Stopped DVS = no transmitter in Dante Controller.
// (Rigs saved before `dvs` existed have no field: running.)
export const dvsRunning = (daw) => !!daw && daw.dvs !== 0;

const isDaw = (d) => d.type === "daw-dvs";

// Cable-like links for every working Dante route. A console RX channel takes
// one TX channel; if two DAW tracks share an output, the later track wins (a
// DAW would sum them; the lab asks for one track per output).
export function danteLinks(rig) {
  const daw = rig.devices.find(isDaw);
  const mixer = rig.devices.find((d) => d.id === "mixer");
  if (!dvsRunning(daw) || !mixer || !Array.isArray(mixer.danteRx)) return [];
  const trackOn = {}; // DVS channel → DAW track index
  daw.outs.forEach((k, t) => k > 0 && (trackOn[k] = t));
  const links = [];
  mixer.danteRx.forEach((k, m) => {
    const t = trackOn[k];
    if (k > 0 && t !== undefined) links.push({ id: `dante-${m + 1}`, from: `${daw.id}/trk${t + 1}`, to: `mixer/ch${m + 1}-dante`, cable: "dante", dante: true });
  });
  return links;
}

// Dante Controller's one-to-one route (Ctrl-click where the two devices meet):
// RX n subscribes to TX n for every channel both devices have.
export const oneToOne = (rx) => Array.from({ length: Math.min(rx, DANTE.dvsChannels) }, (_, m) => [`danteRx.${m}`, m + 1]);

// What the DVS transmits on channel k (the DAW track names), for Dante Controller's labels.
export function dvsChannelNames(rig, names = {}) {
  const daw = rig.devices.find(isDaw);
  return Array.from({ length: DANTE.dvsChannels }, (_, i) => {
    const tracks = daw ? daw.outs.map((k, t) => (k === i + 1 ? names[DAW_TRACKS[t]] || DAW_TRACKS[t] : null)).filter(Boolean) : [];
    return tracks.join(" + ");
  });
}
