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
// stereo       true: a linked L/R source for a stereo channel strip. It has no `stem`;
//              it names a looping `asset` (LOOP_ASSETS) that plays on its own timeline,
//              independent of the band's transport. `peakDb` is its measured stereo peak.
// reference    false: not part of the pre-patched "reference" rig (student patches it)
// The band scenarios (everything but the preshow one). Each source lists the ones it appears in.
const BAND = ["free-play", "build-rig", "find-amp", "more-vocal", "drummer-wedge", "more-piano", "monitor-quiet", "foh-vocal", "missing-guitar", "drummer-mix"];
const without = (...ids) => BAND.filter((id) => !ids.includes(id));
const only = (...ids) => ["free-play", ...ids];

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
    scenarios: without("more-vocal"),
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
    scenarios: BAND,
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
    scenarios: only("more-vocal", "missing-guitar", "drummer-mix"),
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
    scenarios: without("missing-guitar"),
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
    scenarios: only("monitor-quiet"),
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
    scenarios: BAND,
  },
  {
    id: "preshow",
    order: 9, // stereo channel strip "9/10"
    name: "Preshow music",
    shortName: "MUSIC",
    device: "Laptop — Preshow Music",
    category: "Playback",
    deviceType: "stereo-laptop",
    signalLevel: "line",
    connector: "trs35",
    phantom: "none",
    outputDb: -10, // consumer-level laptop output, a little under pro line level
    stereo: true,
    asset: "preshow",
    peakDb: -1.1, // louder side of the stereo file; no mono fold-down
    mixDb: -6,
    pan: 0,
    reference: false,
    scenarios: ["free-play", "preshow"],
    note: "A laptop's 3.5 mm headphone jack is a stereo line output. It needs a 3.5 mm → dual 1/4\" breakout cable into the mixer's stereo input 9/10, which is one stereo channel with one level control.",
  },
];

export const SOURCES_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

// ---------- preshow music ----------

// Feeds the "Laptop — Preshow Music" source on stereo input 9/10 (3.5 mm TRS →
// breakout → L/R), looping on its OWN timeline, independent of the band.
// Stereo, 44.1 kHz, 160 kb/s, 59.6 s.
export const PRESHOW = {
  id: "preshow",
  title: "Bossa Nova",
  artist: "Joth",
  file: "audio/preshow/joth-bossa-nova.mp3",
  originalFilename: "8bit Bossa.mp3",
  duration: 59.61,
  license: "CC0",
  source: "https://opengameart.org/content/bossa-nova",
};

// Looping stereo assets, keyed by a source's `asset` field.
export const LOOP_ASSETS = { preshow: PRESHOW };

// ---------- credits (shown in the app's Credits dialog and the docs) ----------

export const CREDITS = [
  {
    title: "Persephone",
    lines: [
      ["Music and lyrics", "Giovanna"],
      ["Guitars", "Caiden Craig"],
      ["Bass", "Tyler Fraser"],
      ["Background vocals", "Jake Flaa and Victoria Nguyen"],
      ["Drums", "Eli Furie"],
      ["Trumpets", "Kaizo Hall and Takazo Hall"],
      ["Piano", "Julian Berger"],
      ["Recording engineers", "Braedon Martin and Julian Berger"],
      ["Mixing and mastering", "Eli Furie"],
    ],
    note: "Used with permission for this educational project.",
  },
  {
    title: "Preshow music",
    lines: [
      ["“Bossa Nova”", "Joth"],
      ["Source", "OpenGameArt — opengameart.org/content/bossa-nova"],
      ["License", "CC0 (public domain dedication); credited with thanks"],
      ["Original file", "8bit Bossa.mp3"],
    ],
  },
];

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
