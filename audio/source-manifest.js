// Source manifest — the one place that knows about audio files and what each
// band input represents. Edit this (not the app code) to rename, reorder,
// re-map or swap stems. Measurements come from tools/make-excerpts.sh.

// ---------- delivery assets ----------

export const STEM_SET = {
  id: "persephone",
  title: "Persephone",
  basePath: "audio/persephone/",
  // Every file is the same excerpt of the same timeline, so one pair of loop
  // points (seconds, within each file) serves them all. The files include
  // 0.5 s of pre-roll and 1 s of post-roll around the loop.
  loop: { start: 0.5, end: 28.905 },
  excerpt: { originalStart: 157.47, duration: 29.905 },
  // The whole song, for Free play's "Full song" option. Each stem is split into
  // 20 s segments (+0.5 s overlap each side for crossfades) that stream one
  // segment ahead, so a phone never holds the whole song in memory. Segment
  // files are named "<stem file without .mp3>-NN.mp3". They are encoded trimDb
  // quieter than the excerpt (the full song peaks hotter); the app adds it back
  // so levels and gain staging match the loop exactly.
  full: { basePath: "audio/persephone/full/", segmentSeconds: 20, overlap: 0.5, duration: 238.2222, segments: 12, trimDb: 2 },
};

// monoPeakDb / monoRmsDb: the file after the mono fold-down the app performs.
// normalizeDb: gain applied when the excerpt was made (undo it to recover the
// band's recorded balance).
// treatment: how the stereo file becomes a mono channel — "sum" (L+R)/2,
// "left", or "right". Stereo files are kept for future linked-stereo channels.
export const STEMS = {
  drums: { file: "persephone-drums.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.07, monoRmsDb: -19.4, normalizeDb: 6.56 },
  bass: { file: "persephone-bass.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.0, monoRmsDb: -17.81, normalizeDb: 10.15 },
  guitars: { file: "persephone-guitars.mp3", channels: 2, treatment: "sum", monoPeakDb: -2.52, monoRmsDb: -15.42, normalizeDb: 10.49 },
  piano: { file: "persephone-piano.mp3", channels: 2, treatment: "sum", monoPeakDb: -3.04, monoRmsDb: -15.92, normalizeDb: 18.71 },
  trumpets: { file: "persephone-trumpets.mp3", channels: 2, treatment: "sum", monoPeakDb: -4.6, monoRmsDb: -22.71, normalizeDb: 15.05 },
  "backing-vocals": { file: "persephone-backing-vocals.mp3", channels: 2, treatment: "sum", monoPeakDb: -2.8, monoRmsDb: -17.58, normalizeDb: 10.34 },
  "lead-vocals": { file: "persephone-lead-vocals-doubles.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.73, monoRmsDb: -14.26, normalizeDb: 9.75 },
};

// ---------- virtual sources (what the student patches) ----------

// order        FOH input-list order (channel number in the reference patch)
// deviceType   key of DEVICE_TYPES in js/connection-model.js
// signalLevel  what comes out of the source
// connector    the jack on the source (teaching label; the port lives on the device type)
// outputDb     how hot this particular source is, relative to +4 dBu line level.
//              Decides how much preamp gain it needs.
// phantom      "required" | "none"
// mixDb        a sensible starting fader offset for the band mix (0 = unity)
// pan          reference pan (-1 … 1)
// scenarios    where the source is available (ids from js/scenarios.js)
const ALL = ["free-play", "build-rig", "more-vocal", "monitor-quiet"];

export const SOURCES = [
  {
    id: "drums",
    order: 1,
    name: "Drums",
    shortName: "DRUMS",
    device: "Drum overhead (condenser mic)",
    category: "Percussion",
    deviceType: "condenser-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "required",
    outputDb: -34,
    stem: "drums",
    mixDb: -1,
    pan: 0,
    scenarios: ["free-play", "build-rig", "monitor-quiet"],
    note: "One overhead condenser stands in for the whole kit.",
  },
  {
    id: "bass",
    order: 2,
    name: "Bass",
    shortName: "BASS",
    device: "Bass guitar → DI box",
    category: "Rhythm section",
    deviceType: "di-box",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -32,
    stem: "bass",
    mixDb: -3,
    pan: 0,
    scenarios: ALL,
    note: "The bass is instrument level; the DI box turns it into a balanced mic-level XLR signal.",
  },
  {
    id: "guitars",
    order: 3,
    name: "Guitars",
    shortName: "GTR",
    device: "Guitar amp (dynamic mic)",
    category: "Instruments",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -36,
    stem: "guitars",
    mixDb: -4,
    pan: -0.35,
    scenarios: ["free-play", "more-vocal"],
  },
  {
    id: "keys",
    order: 4,
    name: "Piano / keys",
    shortName: "KEYS",
    device: "Stage piano (line out)",
    category: "Instruments",
    deviceType: "line-source",
    signalLevel: "line",
    connector: "ts14",
    phantom: "none",
    outputDb: -10,
    stem: "piano",
    mixDb: -7,
    pan: 0.35,
    scenarios: ALL,
    note: "A keyboard's 1/4\" output is already line level: it belongs on the 1/4\" line input, not the XLR mic input.",
  },
  {
    id: "trumpets",
    order: 5,
    name: "Trumpets",
    shortName: "TPT",
    device: "Horn mic (dynamic)",
    category: "Horns",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -38,
    stem: "trumpets",
    mixDb: -6,
    pan: 0.2,
    scenarios: ["free-play"],
  },
  {
    id: "backing-vocals",
    order: 6,
    name: "Backing vocals + doubles",
    shortName: "BV",
    device: "Backing vocal mic (dynamic)",
    category: "Vocals",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -44,
    stem: "backing-vocals",
    mixDb: -4,
    pan: -0.2,
    scenarios: ["free-play", "monitor-quiet"],
  },
  {
    id: "lead-vocal",
    order: 7,
    name: "Lead vocal",
    shortName: "VOX",
    device: "Lead vocal mic (dynamic)",
    category: "Vocals",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -46,
    stem: "lead-vocals",
    mixDb: 0,
    pan: 0,
    scenarios: ALL,
  },
];

export const SOURCES_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

export function sourcesInFohOrder() {
  return [...SOURCES].sort((a, b) => a.order - b.order);
}

export function sourcesForScenario(scenarioId) {
  return sourcesInFohOrder().filter((s) => s.scenarios.includes(scenarioId));
}

export function stemUrl(stemId) {
  const stem = STEMS[stemId];
  return stem ? STEM_SET.basePath + stem.file : null;
}
