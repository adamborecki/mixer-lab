// Source manifest — the one place that knows about audio files and what each
// band input represents. Edit this (not the app code) to rename, reorder,
// re-map or swap stems. Measurements come from tools/make-excerpts.sh.
//
// Three songs, three bands (SONGS). One is "current" at a time: STEM_SET, STEMS,
// SOURCES and SOURCES_BY_ID below are live bindings that useSong() swaps, so
// every module that imports them sees the current band. Sources that do the
// same job in both bands share an id (drums, bass, guitars, backing-vocals,
// lead-vocal) and sit on the same input number, so a scenario written for
// those works with either song.

// ---------- Persephone (Giovanna): delivery assets ----------

const PERSEPHONE_SET = {
  id: "persephone",
  title: "Persephone",
  artist: "Giovanna",
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
  // 8-bar loops from other parts of the song, so the scenarios don't all play
  // the same 28 seconds. Each starts on the same bar grid as the excerpt
  // (downbeat 158.204 s, bar 3.550625 s, loop starting 0.234 s before the
  // downbeat) and is the same length, so it loops just as cleanly. The app
  // stitches it from the full-song segments. "excerpt" is the original loop
  // file. `start`: song time of the loop start. `plays`: stems heard in
  // (nearly) every bar; `partly`: stems heard in some bars. Measured per bar
  // from the segments (RMS above −48 dBFS).
  sections: [
    { id: "bars-5", bars: "5–12", start: 15.945, label: "Verse, no drums yet", plays: ["bass", "guitars", "piano", "lead-vocals"], partly: [] },
    { id: "bars-17", bars: "17–24", start: 58.553, label: "Band in, no keys", plays: ["drums", "bass", "guitars", "lead-vocals"], partly: ["backing-vocals"] },
    { id: "bars-25", bars: "25–32", start: 86.958, label: "Band with keys", plays: ["drums", "bass", "guitars", "piano", "lead-vocals"], partly: ["backing-vocals"] },
    { id: "bars-37", bars: "37–44", start: 129.565, label: "Harmonies, no keys", plays: ["drums", "bass", "guitars", "backing-vocals", "lead-vocals"], partly: [] },
    { id: "excerpt", bars: "45–52", start: 157.97, label: "Everyone, trumpets too", plays: ["drums", "bass", "guitars", "piano", "trumpets", "backing-vocals", "lead-vocals"], partly: [] },
    { id: "bars-53", bars: "53–60", start: 186.375, label: "Everyone but trumpets", plays: ["drums", "bass", "guitars", "piano", "backing-vocals", "lead-vocals"], partly: [] },
  ],
};

// monoPeakDb / monoRmsDb: the file after the mono fold-down the app performs.
// normalizeDb: gain applied when the excerpt was made (undo it to recover the
// band's recorded balance).
// treatment: how the stereo file becomes a mono channel — "sum" (L+R)/2,
// "left", or "right". Stereo files are kept for future linked-stereo channels.
const PERSEPHONE_STEMS = {
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
// scenarios    where the source is available (ids from js/scenarios.js), or ANY_SCENARIO
// stereo       true: a linked L/R source for a stereo channel strip. Either a band stem
//              whose STEMS entry has `treatment: "stereo"` (it plays in time with the
//              band, e.g. NOSTRADAMUS's pads), or no `stem` and a looping `asset`
//              (LOOP_ASSETS) on its own timeline, independent of the band's
//              transport, with `peakDb` its measured stereo peak (the preshow laptop).
// reference    false: not part of the pre-patched "reference" rig (student patches it)
// musician     who plays it on the recording (from CREDITS), and `musicianShort` for a
//              channel strip: shown instead of `name` / `shortName` when the student
//              switches track names to Musicians (js/names.js)

// The laptop playing preshow music (Persephone's gig; js/scenarios.js "preshow").
const PRESHOW_SOURCE = {
  id: "preshow",
  order: 9, // stereo channel strip "9/10"
  name: "Preshow music",
  shortName: "MUSIC",
  musician: "Joth (“Bossa Nova”)",
  musicianShort: "JOTH",
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
};

// A NOSTRADAMUS source is on stage in every scenario that plays that song.
const ANY_SCENARIO = "*";

// Persephone's band scenarios (everything but the preshow one). Each source lists the ones it appears in.
const BAND = ["free-play", "build-rig", "find-amp", "more-vocal", "drummer-wedge", "more-piano", "monitor-quiet", "foh-vocal", "missing-guitar", "drummer-mix"];
const without = (...ids) => BAND.filter((id) => !ids.includes(id));
const only = (...ids) => ["free-play", ...ids];

const PERSEPHONE_SOURCES = [
  {
    id: "drums",
    order: 1,
    name: "Drums",
    shortName: "DRUMS",
    musician: "Eli Furie",
    musicianShort: "ELI",
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
    musician: "Tyler Fraser",
    musicianShort: "TYLER",
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
    musician: "Caiden Craig",
    musicianShort: "CAIDEN",
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
    musician: "Julian Berger",
    musicianShort: "JULIAN",
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
    musician: "Kaizo Hall and Takazo Hall",
    musicianShort: "KAIZO & TAKAZO",
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
    musician: "Jake Flaa and Victoria Nguyen",
    musicianShort: "JAKE & VICTORIA",
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
    musician: "Giovanna",
    musicianShort: "GIO",
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
  PRESHOW_SOURCE,
];

// ---------- NOSTRADAMUS (Will Tulip): delivery assets ----------

// 94 bpm exactly: bar 1's downbeat is at 0.324 s, a bar is 2.553191 s. The
// masters are 48 kHz. Every stem was peak-normalized over the whole song (no
// 8 bars have everyone: the bridge guitar plays only in bars 26-33), so the
// full-song segments need no trim. Loops start 20 ms before their downbeat.
const NOSTRADAMUS_SET = {
  id: "nostradamus",
  title: "NOSTRADAMUS",
  artist: "Will Tulip",
  basePath: "audio/nostradamus/",
  loop: { start: 0.5, end: 20.925532 },
  excerpt: { originalStart: 22.783, duration: 21.925532 },
  full: { basePath: "audio/nostradamus/full/", segmentSeconds: 20, overlap: 0.5, duration: 109.7872, segments: 6, trimDb: 0 },
  // Measured per bar from the masters (RMS above −48 dBFS), as for Persephone.
  sections: [
    { id: "bars-2", bars: "2–9", start: 2.857, label: "Verse, vocals over bass and drums", plays: ["drums", "bass", "vox-main", "vox-harmony", "pads-fx"], partly: ["guitar-rhythm", "vox-bgv"] },
    { id: "excerpt", bars: "10–17", start: 23.283, label: "Lead guitar over the band", plays: ["drums", "bass", "guitar-lead", "guitar-rhythm", "pads-fx"], partly: ["vox-main", "vox-bgv", "vox-harmony"] },
    { id: "bars-18", bars: "18–25", start: 43.708, label: "Second verse", plays: ["drums", "bass", "vox-main", "vox-harmony"], partly: ["guitar-rhythm", "pads-fx", "vox-bgv"] },
    { id: "bars-26", bars: "26–33", start: 64.134, label: "Bridge: the third guitar, no bass", plays: ["guitar-bridge", "guitar-rhythm", "vox-main"], partly: ["drums", "pads-fx", "vox-harmony"] },
    { id: "bars-35", bars: "35–42", start: 87.112, label: "Outro: guitars and backing vocals", plays: ["bass", "guitar-lead", "guitar-rhythm", "pads-fx"], partly: ["drums", "vox-bgv", "vox-harmony"] },
  ],
};

// Measured over the whole song. "pads-fx" stays stereo: it feeds a stereo
// channel, and its sides are too different to fold (L/R correlation −0.15).
const NOSTRADAMUS_STEMS = {
  drums: { file: "nostradamus-drums.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.01, monoRmsDb: -18.42, normalizeDb: -0.9 },
  bass: { file: "nostradamus-bass.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.7, monoRmsDb: -13.3, normalizeDb: -0.9 },
  "guitar-rhythm": { file: "nostradamus-guitar-rhythm.mp3", channels: 2, treatment: "sum", monoPeakDb: -5.64, monoRmsDb: -25.8, normalizeDb: -0.91 },
  "guitar-lead": { file: "nostradamus-guitar-lead.mp3", channels: 2, treatment: "sum", monoPeakDb: -4.49, monoRmsDb: -21.84, normalizeDb: -0.9 },
  "guitar-bridge": { file: "nostradamus-guitar-bridge.mp3", channels: 2, treatment: "sum", monoPeakDb: -5.46, monoRmsDb: -28.46, normalizeDb: -0.9 },
  "vox-bgv": { file: "nostradamus-vox-bgv.mp3", channels: 2, treatment: "sum", monoPeakDb: -6.06, monoRmsDb: -25.96, normalizeDb: -0.9 },
  "vox-main": { file: "nostradamus-vox-main.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.31, monoRmsDb: -23.31, normalizeDb: -0.94 },
  "vox-harmony": { file: "nostradamus-vox-harmony.mp3", channels: 2, treatment: "sum", monoPeakDb: -3.18, monoRmsDb: -27.22, normalizeDb: -1.0 },
  "pads-fx": { file: "nostradamus-pads-fx.mp3", channels: 2, treatment: "stereo", peakDb: -1.0, monoPeakDb: -7.02, monoRmsDb: -30.47, normalizeDb: -0.91 },
};

// Eight mono inputs and the stereo 9/10: exactly Mixer A and B. The stems
// were normalized alike, so equal faders give the band's own balance.
// A studio recording, not a live band: Will Tulip played, sang and recorded
// every part, produced it and mixed and mastered it, so every channel is his.
const NOSTRADAMUS_SOURCES = [
  {
    id: "drums",
    order: 1,
    name: "Drums",
    shortName: "DRUMS",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Drum overhead (condenser mic)",
    category: "Percussion",
    deviceType: "condenser-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "required",
    outputDb: -34,
    stem: "drums",
    mixDb: -4,
    pan: 0,
    scenarios: ANY_SCENARIO,
    note: "One overhead condenser stands in for the whole kit.",
  },
  {
    id: "bass",
    order: 2,
    name: "Bass",
    shortName: "BASS",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Bass guitar → DI box",
    category: "Rhythm section",
    deviceType: "di-box",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -32,
    stem: "bass",
    mixDb: -4,
    pan: 0,
    scenarios: ANY_SCENARIO,
    note: "The bass is instrument level; the DI box turns it into a balanced mic-level XLR signal.",
  },
  {
    id: "guitars",
    order: 3,
    name: "Rhythm guitar",
    shortName: "RH GTR",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Rhythm guitar amp (dynamic mic)",
    category: "Instruments",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -36,
    stem: "guitar-rhythm",
    mixDb: -4,
    pan: -0.4,
    scenarios: ANY_SCENARIO,
  },
  {
    id: "lead-guitar",
    order: 4,
    name: "Lead guitar",
    shortName: "LD GTR",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Lead guitar amp (dynamic mic)",
    category: "Instruments",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -36,
    stem: "guitar-lead",
    mixDb: -4,
    pan: 0.4,
    scenarios: ANY_SCENARIO,
  },
  {
    id: "bridge-guitar",
    order: 5,
    name: "Bridge guitar",
    shortName: "BRIDGE",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Third guitar amp (dynamic mic)",
    category: "Instruments",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -36,
    stem: "guitar-bridge",
    mixDb: -4,
    pan: 0.2,
    scenarios: ANY_SCENARIO,
    note: "A third guitar part that only plays in the bridge (bars 26–33).",
  },
  {
    id: "backing-vocals",
    order: 6,
    name: "Backing vocals",
    shortName: "BV",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Backing vocal mic (dynamic)",
    category: "Vocals",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -44,
    stem: "vox-bgv",
    mixDb: -4,
    pan: -0.2,
    scenarios: ANY_SCENARIO,
  },
  {
    id: "lead-vocal",
    order: 7,
    name: "Lead vocal",
    shortName: "VOX",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Lead vocal mic (dynamic)",
    category: "Vocals",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -46,
    stem: "vox-main",
    mixDb: -3,
    pan: 0,
    scenarios: ANY_SCENARIO,
  },
  {
    id: "harmony-vocal",
    order: 8,
    name: "Harmony vocal",
    shortName: "HARM",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Harmony vocal mic (dynamic)",
    category: "Vocals",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -44,
    stem: "vox-harmony",
    mixDb: -4,
    pan: 0.2,
    scenarios: ANY_SCENARIO,
  },
  {
    id: "pads",
    order: 9, // stereo channel strip "9/10"
    name: "Pads & FX",
    shortName: "PADS",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Laptop — Pads & FX",
    category: "Playback",
    deviceType: "stereo-laptop",
    signalLevel: "line",
    connector: "trs35",
    phantom: "none",
    outputDb: -10,
    stereo: true,
    stem: "pads-fx",
    mixDb: -4,
    pan: 0,
    scenarios: ANY_SCENARIO,
    note: "Pads and effects (digital and analog recordings with heavy post-production) that play in time with the band, in stereo: a 3.5 mm → dual 1/4\" breakout into stereo input 9/10.",
  },
];

// ---------- FTW (after juno): delivery assets ----------

// 70 bpm 4/4 exactly (bar 3.428571 s), bar 1's downbeat at 1.1216 s; found
// from the drums and checked against the percussion's entries. The drums'
// pattern repeats every 12 beats, so the loops are 6 bars (24 beats, two
// turns of it), each starting 20 ms before its downbeat. The masters are
// 48 kHz and run to 275.4 s, but the song has died away by 256 s, where the
// full song ends. Every stem was normalized and measured over the whole song
// (the brass plays for two bars only).
const FTW_SET = {
  id: "ftw",
  title: "FTW",
  artist: "after juno",
  basePath: "audio/ftw/",
  loop: { start: 0.5, end: 21.071429 },
  excerpt: { originalStart: 134.316, duration: 22.071429 },
  full: { basePath: "audio/ftw/full/", segmentSeconds: 20, overlap: 0.5, duration: 256, segments: 13, trimDb: 0 },
  // Measured per bar from the masters (RMS above −48 dBFS).
  sections: [
    { id: "bars-9", bars: "9–14", start: 28.53, label: "Verse, vocals over bass and synths", plays: ["bass", "synths", "vocals"], partly: ["strings"] },
    { id: "bars-13", bars: "13–18", start: 42.244, label: "Strings in, a brass swell", plays: ["bass", "strings", "synths", "vocals"], partly: ["brass"] },
    { id: "bars-32", bars: "32–37", start: 107.387, label: "Strings and winds, before the drums", plays: ["bass", "percussion", "strings", "synths", "vocals", "winds"], partly: ["guitar"] },
    { id: "excerpt", bars: "40–45", start: 134.816, label: "Everyone but the brass", plays: ["bass", "drums", "guitar", "percussion", "strings", "synths", "vocals", "winds"], partly: [] },
    { id: "bars-46", bars: "46–51", start: 155.387, label: "Full band, the strings dropping out", plays: ["bass", "drums", "guitar", "percussion", "synths", "vocals", "winds"], partly: ["strings"] },
    { id: "bars-58", bars: "58–63", start: 196.53, label: "Outro: vocals, guitar, percussion and winds", plays: ["guitar", "percussion", "vocals", "winds"], partly: ["bass", "synths"] },
  ],
};

// Each stem is a whole instrument group from Caleb Cox's mix. Normalized one by
// one, so each source's `mixDb` puts back the mix's balance: the gain each
// stem got, relative to the drums, below a 3 dB headroom. "synths" stays
// stereo (L/R correlation 0.39); the strings and winds are wide too but fold
// to mono into their section mics.
const FTW_STEMS = {
  drums: { file: "ftw-drums.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.0, monoRmsDb: -28.61, normalizeDb: -0.8 },
  bass: { file: "ftw-bass.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.02, monoRmsDb: -20.64, normalizeDb: -0.46 },
  guitar: { file: "ftw-guitar.mp3", channels: 2, treatment: "sum", monoPeakDb: -3.62, monoRmsDb: -24.13, normalizeDb: 4.14 },
  percussion: { file: "ftw-percussion.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.4, monoRmsDb: -26.58, normalizeDb: 6.32 },
  strings: { file: "ftw-strings.mp3", channels: 2, treatment: "sum", monoPeakDb: -4.84, monoRmsDb: -28.44, normalizeDb: 3.64 },
  winds: { file: "ftw-winds.mp3", channels: 2, treatment: "sum", monoPeakDb: -5.54, monoRmsDb: -24.85, normalizeDb: 20.95 },
  vocals: { file: "ftw-vocals.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.36, monoRmsDb: -21.97, normalizeDb: 6.47 },
  brass: { file: "ftw-brass.mp3", channels: 2, treatment: "sum", monoPeakDb: -4.34, monoRmsDb: -34.0, normalizeDb: 11.98 },
  synths: { file: "ftw-synths.mp3", channels: 2, treatment: "stereo", peakDb: -1.0, monoPeakDb: -1.92, monoRmsDb: -22.17, normalizeDb: 4.63 },
};

// Nine instrument groups, each one section mic or line: eight mono inputs and
// the synths on stereo 9/10, as on Mixer A and B. Drums, bass, guitar and
// vocals share the other bands' ids and inputs. after juno's first single
// (September 2026): Nathan Acupan recorded the drums, Elliot Shneider the bass
// and guitar, and Caleb Cox did everything else in the production (vocals and
// the mostly sampled orchestra, percussion and synths).
const FTW_SOURCES = [
  {
    id: "drums",
    order: 1,
    name: "Drums",
    shortName: "DRUMS",
    musician: "Nathan Acupan",
    musicianShort: "NATHAN",
    device: "Drum overhead (condenser mic)",
    category: "Percussion",
    deviceType: "condenser-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "required",
    outputDb: -34,
    stem: "drums",
    mixDb: -3,
    pan: 0,
    scenarios: ANY_SCENARIO,
    note: "One overhead condenser stands in for the whole kit.",
  },
  {
    id: "bass",
    order: 2,
    name: "Bass",
    shortName: "BASS",
    musician: "Elliot Shneider",
    musicianShort: "ELLIOT",
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
    scenarios: ANY_SCENARIO,
    note: "The bass is instrument level; the DI box turns it into a balanced mic-level XLR signal.",
  },
  {
    id: "guitars",
    order: 3,
    name: "Guitar",
    shortName: "GTR",
    musician: "Elliot Shneider",
    musicianShort: "ELLIOT",
    device: "Guitar amp (dynamic mic)",
    category: "Instruments",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -36,
    stem: "guitar",
    mixDb: -8,
    pan: -0.25,
    scenarios: ANY_SCENARIO,
  },
  {
    id: "percussion",
    order: 4,
    name: "Percussion",
    shortName: "PERC",
    musician: "Caleb Cox",
    musicianShort: "CALEB",
    device: "Percussion overhead (condenser mic)",
    category: "Percussion",
    deviceType: "condenser-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "required",
    outputDb: -36,
    stem: "percussion",
    mixDb: -10,
    pan: 0.25,
    scenarios: ANY_SCENARIO,
  },
  {
    id: "strings",
    order: 5,
    name: "Strings",
    shortName: "STRINGS",
    musician: "Caleb Cox",
    musicianShort: "CALEB",
    device: "String section mic (condenser)",
    category: "Orchestra",
    deviceType: "condenser-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "required",
    outputDb: -40,
    stem: "strings",
    mixDb: -7,
    pan: -0.4,
    scenarios: ANY_SCENARIO,
    note: "One condenser in front of the section stands in for the whole string section.",
  },
  {
    id: "winds",
    order: 6,
    name: "Woodwinds",
    shortName: "WINDS",
    musician: "Caleb Cox",
    musicianShort: "CALEB",
    device: "Woodwind section mic (condenser)",
    category: "Orchestra",
    deviceType: "condenser-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "required",
    outputDb: -42,
    stem: "winds",
    mixDb: -25,
    pan: 0.3,
    scenarios: ANY_SCENARIO,
    note: "Soft instruments a few feet from one mic: they need plenty of gain.",
  },
  {
    id: "lead-vocal",
    order: 7,
    name: "Vocals",
    shortName: "VOX",
    musician: "Caleb Cox",
    musicianShort: "CALEB",
    device: "Vocal mic (dynamic)",
    category: "Vocals",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -46,
    stem: "vocals",
    mixDb: -10,
    pan: 0,
    scenarios: ANY_SCENARIO,
  },
  {
    id: "brass",
    order: 8,
    name: "Brass",
    shortName: "BRASS",
    musician: "Caleb Cox",
    musicianShort: "CALEB",
    device: "Brass section mic (dynamic)",
    category: "Orchestra",
    deviceType: "dynamic-mic",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -38,
    stem: "brass",
    mixDb: -16,
    pan: 0.5,
    scenarios: ANY_SCENARIO,
    note: "The brass only plays two bars, in bars 16–17.",
  },
  {
    id: "synths",
    order: 9, // stereo channel strip "9/10"
    name: "Synths",
    shortName: "SYNTHS",
    musician: "Caleb Cox",
    musicianShort: "CALEB",
    device: "Laptop — Synths",
    category: "Playback",
    deviceType: "stereo-laptop",
    signalLevel: "line",
    connector: "trs35",
    phantom: "none",
    outputDb: -10,
    stereo: true,
    stem: "synths",
    mixDb: -8,
    pan: 0,
    scenarios: ANY_SCENARIO,
    note: "The synth parts, in stereo and in time with the band: a 3.5 mm → dual 1/4\" breakout into stereo input 9/10.",
  },
];

// ---------- COB in Irvine: NOSTRADAMUS as a musical ----------

// The Chapman on Broadway (COB) gig in Irvine: performers on wireless headsets
// singing to backing tracks from a laptop (the MUS 248 COB Gig Checklist).
// NOSTRADAMUS stands in for the show: its instruments summed into one stereo
// backing track (tools/make-backing-track.sh), its three vocal parts on the
// headsets. The same timeline as NOSTRADAMUS, so the same loops and segments;
// the vocal stems are NOSTRADAMUS's own files.
const COB_SET = { ...NOSTRADAMUS_SET, id: "cob", title: "COB in Irvine", artist: "NOSTRADAMUS (Will Tulip) as a musical" };
// The backing track plays in every bar; the vocals as in NOSTRADAMUS.
const VOX = ["vox-main", "vox-harmony", "vox-bgv"];
// The guitars and drums are inside the track now, so the loops are named for the singing.
const COB_LABELS = { "bars-2": "Verse: lead and harmony over the track", excerpt: "Instrumental break, voices now and then", "bars-18": "Second verse", "bars-26": "Bridge: the lead alone over the track", "bars-35": "Outro: the track, the ensemble now and then" };
COB_SET.sections = NOSTRADAMUS_SET.sections.map((s) => ({ ...s, label: COB_LABELS[s.id], plays: ["track", ...s.plays.filter((st) => VOX.includes(st))], partly: s.partly.filter((st) => VOX.includes(st)) }));

// track: measured over the whole song by tools/make-backing-track.sh;
// normalizeDb is the stems' own −0.9 plus the sum's −6.63.
const COB_STEMS = {
  track: { file: "nostradamus-backing-track.mp3", channels: 2, treatment: "stereo", peakDb: -1.09, monoPeakDb: -2.42, monoRmsDb: -18.05, normalizeDb: -7.53 },
  "vox-main": NOSTRADAMUS_STEMS["vox-main"],
  "vox-harmony": NOSTRADAMUS_STEMS["vox-harmony"],
  "vox-bgv": NOSTRADAMUS_STEMS["vox-bgv"],
};

// Twelve headsets, lettered A–L like the bodypacks and the receiver channels
// (three VocoPro Digital-Quad receivers, four channels each). A receiver
// channel's XLR out is mic level and needs no phantom power. Each performer
// sits a little differently on their headset, so each needs its own gain.
// One recording stands in for the ensemble: C–L all carry the backing vocals,
// so each sits low in the mix (ten in-phase copies add up to 20 dB).
const HEADSET_LEVELS = { a: -44, b: -42, c: -40, d: -46, e: -41, f: -44, g: -38, h: -45, i: -43, j: -39, k: -47, l: -42 };
const headset = (letter, i) => {
  const L = letter.toUpperCase();
  const part = letter === "a" ? ["lead", "Lead", "vox-main", 0] : letter === "b" ? ["harmony", "Harmony", "vox-harmony", -4] : ["ensemble", "Ensemble", "vox-bgv", -22];
  return {
    id: `hs-${letter}`,
    order: i + 1,
    name: `Headset ${L} · ${part[0]}`,
    shortName: `HS ${L}`,
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: `Wireless headset ${L} (receiver channel ${L})`,
    category: "Vocals",
    deviceType: "wireless-headset",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: HEADSET_LEVELS[letter],
    stem: part[2],
    mixDb: part[3],
    pan: 0,
    scenarios: ANY_SCENARIO,
    ...(part[0] === "ensemble" ? { note: "One recording stands in for the whole ensemble: headsets C–L all carry the backing vocals." } : {}),
  };
};
const COB_SOURCES = [
  ..."abcdefghijkl".split("").map(headset),
  {
    id: "track",
    order: 13,
    name: "Backing track",
    shortName: "TRACK",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Laptop — Backing tracks",
    category: "Playback",
    deviceType: "stereo-laptop",
    signalLevel: "line",
    connector: "trs35",
    phantom: "none",
    outputDb: -10,
    stereo: true,
    stem: "track",
    mixDb: -6,
    pan: 0,
    scenarios: ANY_SCENARIO,
    note: "The show's backing tracks, in stereo: the laptop's 3.5 mm headphone out → a dual 1/4\" breakout → AUX IN 1 (left) and 2 (right).",
  },
];

// Virtual sources: the two mics of the stereo room pair. Their sound is built
// from the band stems by js/room-mics.js (distance, angle, delay, room reverb).
export const ROOM_SOURCES = [
  { id: "room-l", name: "Room mic L", shortName: "ROOM L", device: "Room pair · left mic", deviceType: "stereo-mic-pair", signalLevel: "mic", connector: "xlr", phantom: "required", outputDb: -38, peakDb: -4, room: true, pan: -1, mixDb: -10 },
  { id: "room-r", name: "Room mic R", shortName: "ROOM R", device: "Room pair · right mic", deviceType: "stereo-mic-pair", signalLevel: "mic", connector: "xlr", phantom: "required", outputDb: -38, peakDb: -4, room: true, pan: 1, mixDb: -10 },
];

// ---------- the current song ----------

export const SONGS = {
  persephone: { id: "persephone", title: "Persephone", artist: "Giovanna", set: PERSEPHONE_SET, stems: PERSEPHONE_STEMS, sources: PERSEPHONE_SOURCES },
  nostradamus: { id: "nostradamus", title: "NOSTRADAMUS", artist: "Will Tulip", set: NOSTRADAMUS_SET, stems: NOSTRADAMUS_STEMS, sources: NOSTRADAMUS_SOURCES },
  ftw: { id: "ftw", title: "FTW", artist: "after juno", set: FTW_SET, stems: FTW_STEMS, sources: FTW_SOURCES },
  // A gig, not just a band: its rig is the X32 Compact's, so it plays on that console only.
  cob: { id: "cob", title: "COB in Irvine", artist: "a musical (NOSTRADAMUS)", set: COB_SET, stems: COB_STEMS, sources: COB_SOURCES, consoles: ["x32c"] },
};
// Can this song play on this console? A gig's song (`consoles`) only on its own.
export const songFits = (id, model) => !SONGS[id]?.consoles || SONGS[id].consoles.includes(model);
export const DEFAULT_SONG = "persephone";

// Live bindings: importers always see the current song's.
export let SONG = DEFAULT_SONG;
export let STEM_SET;
export let STEMS;
export let SOURCES;
// The band's sources plus the room pair and the preshow laptop, so a loop
// player or a room mic is found whichever band is on stage.
export let SOURCES_BY_ID;

// Puts a song's band on stage. Returns true if it changed.
export function useSong(id) {
  const song = SONGS[id] || SONGS[DEFAULT_SONG];
  const changed = STEM_SET !== song.set;
  SONG = song.id;
  STEM_SET = song.set;
  STEMS = song.stems;
  SOURCES = song.sources;
  SOURCES_BY_ID = Object.fromEntries([...SOURCES, ...ROOM_SOURCES, PRESHOW_SOURCE].map((s) => [s.id, s]));
  return changed;
}
useSong(DEFAULT_SONG);

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

// Spoken clips that stand in for a band member's mic (a scenario's
// `stage.voice`): the host making announcements into the singer's mic, for
// example. Levelled so its average matches the sung lead vocal and its peak
// sits at the lead vocal's peak (the level model reads the stem's numbers).
// Looped with a 3 s pause after the speech, restarted when the scenario opens.
export const VOICES = {
  announcement: {
    id: "announcement",
    title: "Announcement",
    speaker: "Adam Borecki",
    speakerShort: "ADAM",
    file: "audio/voice/announcement-adam.mp3",
    originalFilename: "new talking - announcement - adam borecki.m4a",
    duration: 14.71,
    peakDb: -1.9,
  },
};

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
    title: "NOSTRADAMUS",
    lines: [
      ["Music", "Will Tulip"],
      ["Every part, production, mixing and mastering", "Will Tulip"],
    ],
    note: "Used with permission for this educational project.",
  },
  {
    title: "FTW",
    lines: [
      ["Artist", "after juno (their first single, September 2026)"],
      ["Drums", "Nathan Acupan"],
      ["Bass and guitar", "Elliot Shneider"],
      ["Vocals and production", "Caleb Cox"],
      ["Mixing and mastering", "Mitchell Oeth"],
    ],
    note: "Used with permission for this educational project.",
  },
  {
    title: "COB in Irvine",
    lines: [["Music", "NOSTRADAMUS by Will Tulip: the instruments as one backing track, the three vocal parts on the headsets"]],
    note: "Used with permission for this educational project.",
  },
  {
    title: "Announcements",
    lines: [["Voice", "Adam Borecki"]],
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
  return sourcesInFohOrder().filter((s) => s.scenarios === ANY_SCENARIO || s.scenarios.includes(scenarioId));
}

export function stemUrl(stemId) {
  const stem = STEMS[stemId];
  return stem ? STEM_SET.basePath + stem.file : null;
}
