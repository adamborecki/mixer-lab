// Source manifest — the one place that knows about audio files and what each
// band input represents. Edit this (not the app code) to rename, reorder,
// re-map or swap stems. Measurements come from tools/make-excerpts.sh.
//
// Five songs by four groups, plus four gigs that reuse them (SONGS). One is "current" at a time: STEM_SET, STEMS,
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

// ---------- the Vocal Jazz Ensemble, live: two pieces, eleven singers ----------

// Chapman's Vocal Jazz Ensemble in concert (2026-10-23), from the board's
// multitrack: eleven wireless handhelds, track n = the nth singer in the
// program. No piano track: the piano (Celine You) is only heard faintly
// through the vocal mics. Every track of both pieces got the same +10 dB
// (the masters peaked at -11 to -21 dBFS), so each singer's level is their
// own and the loudest peak sits near -1 dBFS. Mono files (`channels: 1`).
//
// Live, with no drummer, the tempo drifts, so every loop runs from one
// breath to another where all eleven are silent, and each section has its
// own `length` (seconds) instead of the song's loop length. Song time 0 is
// SONG_START in tools/make-excerpts.sh: the dead air before the first note
// and the applause after the last are cut. Bar numbers count from the first
// bar in tempo; the downbeats were found by beat tracking, not by ear.
// Who sings where: per bar, each mic's RMS above -50 dBFS on the master.
const VJ_SINGERS = [
  ["allie", "Allie Hulbert"],
  ["karmyn", "Karmyn Trufant"],
  ["magnolia", "Magnolia Bycott"],
  ["abbey", "Abbey Sourov"],
  ["nina", "Nina Brown"],
  ["shayne", "Shayne Sayre"],
  ["paola", "Paola Morales"],
  ["jessica", "Jessica Kaber"],
  ["brandon", "Brandon Borlaza"],
  ["michael", "Michael Rogachefsky"],
  ["silas", "Silas Arora"],
];
const ALL_SINGERS = VJ_SINGERS.map(([id]) => id);
const allBut = (...ids) => ALL_SINGERS.filter((id) => !ids.includes(id));
const ENSEMBLE = "Vocal Jazz Ensemble";

// "Almost Like Being in Love": a rubato intro, then swing at about 124 bpm
// (bar 1 at 40.30 s song time). Loops are 8 bars, the intro's two phrases;
// the excerpt, which the Salmon scenarios play, is about 30 s.
const ALMOST_SET = {
  id: "almost-like",
  title: "Almost Like Being in Love",
  artist: ENSEMBLE,
  basePath: "audio/almost-like/",
  loop: { start: 0.5, end: 29.99 },
  excerpt: { originalStart: 160.41, duration: 30.99 },
  full: { basePath: "audio/almost-like/full/", segmentSeconds: 20, overlap: 0.5, duration: 222.5, segments: 12, trimDb: 0 },
  sections: [
    { id: "intro", bars: "intro", start: 0.65, length: 16.85, label: "Rubato intro, before the beat", plays: allBut("karmyn", "silas"), partly: ["karmyn", "silas"] },
    { id: "bars-15", bars: "15–22", start: 65.98, length: 15.55, label: "First chorus in tempo, everyone", plays: allBut("nina"), partly: ["nina"] },
    { id: "bars-45", bars: "45–52", start: 124.06, length: 15.59, label: "Soli: five voices carry the tune", plays: ["nina", "shayne", "paola", "brandon", "silas"], partly: allBut("nina", "shayne", "paola", "brandon", "silas") },
    { id: "bars-53", bars: "53–60", start: 139.6, length: 15.51, label: "The soli goes on", plays: ["nina", "shayne", "paola", "brandon", "silas"], partly: allBut("nina", "shayne", "paola", "brandon", "silas") },
    { id: "excerpt", bars: "64–78", start: 160.91, label: "Everyone, full out", plays: ALL_SINGERS, partly: [] },
  ],
};

// "Love Me or Leave Me": swing at about 177 bpm (bar 1 at -0.87 s song time,
// in the piano's intro). Loops are 16 bars; the excerpt, which COB and the
// Salmon scenarios play, is a whole 32-bar chorus.
const LOVE_ME_SET = {
  id: "love-me",
  title: "Love Me or Leave Me",
  artist: ENSEMBLE,
  basePath: "audio/love-me/",
  loop: { start: 0.5, end: 44.3 },
  excerpt: { originalStart: 49.98, duration: 45.3 },
  full: { basePath: "audio/love-me/full/", segmentSeconds: 20, overlap: 0.5, duration: 224, segments: 12, trimDb: 0 },
  sections: [
    { id: "bars-3", bars: "3–18", start: 1.81, length: 21.47, label: "Abbey's solo, then the ensemble", plays: ["abbey"], partly: allBut("abbey") },
    { id: "excerpt", bars: "40–71", start: 50.48, label: "Everyone, a whole chorus", plays: ALL_SINGERS, partly: [] },
    { id: "bars-72", bars: "72–87", start: 94.28, length: 21.67, label: "Silas's solo, the others resting", plays: ["silas"], partly: [] },
    { id: "bars-88", bars: "88–103", start: 116.47, length: 21.61, label: "Silas's solo over the ensemble", plays: ["silas"], partly: allBut("silas") },
    { id: "bars-119", bars: "119–134", start: 159, length: 21.88, label: "Everyone, in short bursts", plays: [], partly: ALL_SINGERS },
    { id: "bars-150", bars: "150–165", start: 200.9, length: 21.63, label: "The ending, everyone", plays: ALL_SINGERS, partly: [] },
  ],
};

// Measured over the whole song (after the cut) by tools/make-excerpts.sh.
const vjStems = (song, levels) => Object.fromEntries(VJ_SINGERS.map(([id], i) => [id, { file: `${song}-${String(i + 1).padStart(2, "0")}-${id}.mp3`, channels: 1, treatment: "sum", monoPeakDb: levels[i][0], monoRmsDb: levels[i][1], normalizeDb: 10 }]));
const ALMOST_STEMS = vjStems("almost-like", [[-4.02, -28.27], [-2.68, -26.95], [-8.29, -28.05], [-6.3, -26.33], [-10.94, -32.82], [-7.73, -28.44], [-3.66, -27.76], [-4.07, -26.3], [-1.9, -25.95], [-4.8, -24.5], [-7.28, -30.21]]);
const LOVE_ME_STEMS = vjStems("love-me", [[-4.67, -28.63], [-3.47, -26.06], [-4.52, -27.32], [-2.73, -24.69], [-6.11, -30.3], [-7.54, -28.94], [-2.46, -26.9], [-1.21, -25.48], [-1.41, -24.12], [-1.07, -21.29], [-7.65, -27.72]]);

// Mic n is singer n, on receiver channel n. The handhelds are alike: the
// differences between the meters are the singers' own. `color` names the
// mic the way Salmon's crew does (its windscreen and ring).
const handheld = (n, color) => {
  const [stem, musician] = VJ_SINGERS[n - 1];
  const first = musician.split(" ")[0];
  return {
    id: `vj-${n}`,
    order: n,
    name: `Mic ${n}${color ? ` (${color})` : ""} · ${first}`,
    shortName: `MIC ${n}`,
    musician,
    musicianShort: first.toUpperCase(),
    device: `Wireless handheld ${n}${color ? `, ${color}` : ""} (receiver channel ${n})`,
    category: "Vocals",
    deviceType: "wireless-handheld",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: -30,
    stem,
    mixDb: 0,
    pan: 0,
    scenarios: ANY_SCENARIO,
  };
};
const JAZZ_SOURCES = VJ_SINGERS.map((_, i) => handheld(i + 1));

// ---------- COB in Irvine: the Vocal Jazz Ensemble as the cast ----------

// The Chapman on Broadway (COB) gig in Irvine: performers on wireless headsets
// singing to backing tracks from a laptop (the MUS 248 COB Gig Checklist).
// The Vocal Jazz Ensemble's "Love Me or Leave Me" stands in for the cast:
// eleven singers on headsets A–K (the same files and loops). Their recording
// has no accompaniment, so the laptop plays silence (tools/make-silent-track.sh):
// its meter stays dark, but the level model keeps the NOSTRADAMUS backing
// track's numbers, so its gain, routing and sends still count as at the gig.
// The sections are love-me's: the track isn't heard in any of them.
const COB_SET = { ...LOVE_ME_SET, id: "cob", title: "COB in Irvine", artist: `${ENSEMBLE} as the cast` };
const COB_STEMS = {
  ...LOVE_ME_STEMS,
  track: { file: "cob-track-silent.mp3", channels: 1, treatment: "stereo", peakDb: -1.09, monoPeakDb: -2.42, monoRmsDb: -18.05, normalizeDb: 0 },
};

// Eleven headsets, lettered A–K like the bodypacks and the receiver channels
// (three VocoPro Digital-Quad receivers, four channels each; L is spare).
// Headset n is the ensemble's singer n. A receiver channel's XLR out is mic
// level and needs no phantom power. Each performer sits a little differently
// on their headset, and each voice is their own, so each needs its own gain.
const HEADSET_LEVELS = { a: -44, b: -42, c: -40, d: -46, e: -41, f: -44, g: -38, h: -45, i: -43, j: -39, k: -47 };
const headset = (letter, i) => {
  const L = letter.toUpperCase();
  const [stem, musician] = VJ_SINGERS[i];
  const first = musician.split(" ")[0];
  return {
    id: `hs-${letter}`,
    order: i + 1,
    name: `Headset ${L} · ${first}`,
    shortName: `HS ${L}`,
    musician,
    musicianShort: first.toUpperCase(),
    device: `Wireless headset ${L} (receiver channel ${L})`,
    category: "Vocals",
    deviceType: "wireless-headset",
    signalLevel: "mic",
    connector: "xlr",
    phantom: "none",
    outputDb: HEADSET_LEVELS[letter],
    stem,
    mixDb: 0,
    pan: 0,
    scenarios: ANY_SCENARIO,
  };
};
const COB_SOURCES = [
  ..."abcdefghijk".split("").map(headset),
  {
    id: "track",
    order: 13,
    name: "Backing track",
    shortName: "TRACK",
    musician: "Silent laptop",
    musicianShort: "SILENT",
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
    note: "The show's backing tracks, in stereo: the laptop's 3.5 mm headphone out → a dual 1/4\" breakout → AUX IN 1 (left) and 2 (right). In the lab it plays silence: the ensemble standing in for the cast was recorded without an accompaniment track. Its meter stays dark; its routing and sends still count.",
  },
];

// ---------- Karaoke in BH 109: NOSTRADAMUS as a karaoke track ----------

// A karaoke night in BH 109, the choir room (MUS 248's BH 109 Karaoke Gig
// Checklist): singers on SM58s and a laptop playing the karaoke track into a
// Behringer Xenyx, with one more SM58 through a Zoom V3 vocal processor. COB's
// backing track (NOSTRADAMUS's instruments summed) is the karaoke track, and
// NOSTRADAMUS's three vocal parts are the singers. Same timeline as
// NOSTRADAMUS, so the same loops and segments.
const KARAOKE_SET = { ...NOSTRADAMUS_SET, id: "karaoke", title: "Karaoke in BH 109", artist: "NOSTRADAMUS (Will Tulip) as a karaoke track" };
// The backing track plays in every bar; the vocals as in NOSTRADAMUS.
const VOX = ["vox-main", "vox-harmony", "vox-bgv"];
const KARAOKE_LABELS = { "bars-2": "Verse: two singers over the track", excerpt: "Instrumental break, the V3 singer now and then", "bars-18": "Second verse", "bars-26": "Bridge: the lead singer alone", "bars-35": "Outro: the track, the V3 singer now and then" };
KARAOKE_SET.sections = NOSTRADAMUS_SET.sections.map((s) => ({ ...s, label: KARAOKE_LABELS[s.id], plays: ["track", ...s.plays.filter((st) => VOX.includes(st))], partly: s.partly.filter((st) => VOX.includes(st)) }));
// track: NOSTRADAMUS's instruments summed (tools/make-backing-track.sh),
// measured over the whole song; normalizeDb is the stems' own −0.9 plus the sum's −6.63.
const KARAOKE_STEMS = {
  track: { file: "nostradamus-backing-track.mp3", channels: 2, treatment: "stereo", peakDb: -1.09, monoPeakDb: -2.42, monoRmsDb: -18.05, normalizeDb: -7.53 },
  "vox-main": NOSTRADAMUS_STEMS["vox-main"],
  "vox-harmony": NOSTRADAMUS_STEMS["vox-harmony"],
  "vox-bgv": NOSTRADAMUS_STEMS["vox-bgv"],
};
const karaokeSinger = (id, order, name, shortName, device, deviceType, stem, extra) => ({
  id,
  order,
  name,
  shortName,
  musician: "Will Tulip",
  musicianShort: "WILL",
  device,
  category: "Vocals",
  deviceType,
  signalLevel: deviceType === "dynamic-mic" ? "mic" : "line",
  connector: deviceType === "dynamic-mic" ? "xlr" : "ts14",
  phantom: "none",
  stem,
  pan: 0,
  scenarios: ANY_SCENARIO,
  ...extra,
});
const KARAOKE_SOURCES = [
  karaokeSinger("ky-mic1", 1, "SM58 1 · lead singer", "MIC 1", "Shure SM58 (dynamic)", "dynamic-mic", "vox-main", { outputDb: -43, mixDb: 0 }),
  karaokeSinger("ky-mic2", 2, "SM58 2 · harmony", "MIC 2", "Shure SM58 (dynamic)", "dynamic-mic", "vox-harmony", { outputDb: -46, mixDb: -3 }),
  karaokeSinger("ky-v3", 4, "Zoom V3 · third singer", "V3", "SM58 → Zoom V3 vocal processor, OUTPUT L", "line-source", "vox-bgv", {
    outputDb: -10,
    mixDb: -8,
    note: "An SM58 into the V3's MIC IN; its OUTPUT L (consumer level, about −10) on a 1/4\" TS cable into 7/8 L (MONO). The V3's own effects aren't modelled: what comes out is the singer's voice.",
  }),
  {
    id: "ky-track",
    order: 3,
    name: "Karaoke track (laptop)",
    shortName: "TRACK",
    musician: "Will Tulip",
    musicianShort: "WILL",
    device: "Laptop — karaoke videos",
    category: "Playback",
    deviceType: "stereo-laptop",
    signalLevel: "line",
    connector: "trs35",
    phantom: "none",
    outputDb: -10,
    stereo: true,
    stem: "track",
    mixDb: -4,
    pan: 0,
    scenarios: ANY_SCENARIO,
    note: "The karaoke video's audio, in stereo: the laptop's headphone out → a 3.5 mm to dual 1/4\" cable → LINE IN 5/6, L and R.",
  },
];

// ---------- Vocal Jazz in Salmon: the ensemble's own recording ----------

// Vocal Jazz in Salmon Recital Hall (MUS 248's Vocal Jazz Gig Checklist): the
// singers on wireless handhelds into the hall's full-size X32. The ensemble's
// own two pieces (the same files and loops), eleven singers on eleven
// handhelds; the scenarios take turns, so one plays "Almost Like Being in
// Love" (`vj`) and the next "Love Me or Leave Me" (`vj-love`). Mic n is
// receiver channel n is X32 input n.
const VJ_SET = { ...ALMOST_SET, id: "vj", title: "Vocal Jazz in Salmon", artist: `${ENSEMBLE}, “Almost Like Being in Love”` };
const VJ_LOVE_SET = { ...LOVE_ME_SET, id: "vj-love", title: "Vocal Jazz in Salmon", artist: `${ENSEMBLE}, “Love Me or Leave Me”` };

// The crew names a handheld by its windscreen, then its ring: black 1–8, gray
// 9–16, rings red, orange, yellow, green, blue, purple, black, gray (the Salmon
// Simulator's owner-confirmed facts).
const RINGS = ["red", "orange", "yellow", "green", "blue", "purple", "black", "gray"];
// The crew's test music: a laptop at FOH on AUX IN 1/2 plays the preshow
// loop ("Bossa Nova") for the mains test and the monitor test.
const VJ_LAPTOP = {
  ...PRESHOW_SOURCE,
  order: 33, // AUX IN 1/2
  name: "Test music (laptop)",
  device: "Laptop at FOH — test music",
  scenarios: ANY_SCENARIO,
  note: "The crew's test music, from a laptop at FOH into AUX IN 1/2: they play it through the mains, then the wedges, before the singers arrive. A 3.5 mm → dual 1/4\" breakout cable.",
};
const VJ_SOURCES = [...VJ_SINGERS.map((_, i) => handheld(i + 1, `${i < 8 ? "black" : "gray"}/${RINGS[i % 8]}`)), VJ_LAPTOP];

// ---------- the electroacoustic showcase in Salmon: FTW's parts as stand-ins ----------

// The Chapman Faculty Electroacoustic Showcase (2026-10-18), on Salmon's X32
// with the S32 and an SD8 daisy-chained off its AES50 B (the Salmon Simulator's
// showcase signal flow, and MUS 248's Electroacoustic Showcase Gig Checklist).
// The pieces themselves aren't recorded here: FTW's stems stand in, each for a
// source that does a similar job (its woodwinds for the bass clarinet, its
// strings for the piano strings ringing, its vocals for the MalletKAT's
// vocal-chop pads, its synths for the Mac mini's electronics), plus a click on
// FTW's own beat grid (tools/make-click-track.sh), for the performer only.
const EA_STEM_IDS = ["winds", "strings", "guitar", "percussion", "vocals", "synths", "click"];
const EA_SET = { ...FTW_SET, id: "ea", title: "Electroacoustic showcase", artist: "FTW (after juno) as stand-ins, and a click" };
EA_SET.sections = FTW_SET.sections.map((sec) => ({ ...sec, plays: [...sec.plays.filter((st) => EA_STEM_IDS.includes(st)), "click"], partly: sec.partly.filter((st) => EA_STEM_IDS.includes(st)) }));
const EA_STEMS = {
  ...Object.fromEntries(EA_STEM_IDS.filter((id) => id !== "click").map((id) => [id, FTW_STEMS[id]])),
  // A metronome, not a recording: 1600 Hz on each downbeat, 1000 Hz on the other beats.
  click: { file: "ftw-click.mp3", channels: 2, treatment: "sum", monoPeakDb: -1.21, monoRmsDb: -26.78, normalizeDb: 0 },
};
const FTW_BY_STEM = Object.fromEntries(FTW_SOURCES.map((src) => [src.stem, src]));
const eaSource = (id, order, stem, name, shortName, device, deviceType, extra) => ({
  id,
  order,
  name,
  shortName,
  musician: stem === "click" ? "A click" : FTW_BY_STEM[stem].musician,
  musicianShort: stem === "click" ? "CLICK" : FTW_BY_STEM[stem].musicianShort,
  device,
  category: "Showcase",
  deviceType,
  signalLevel: { "condenser-mic": "mic", "dynamic-mic": "mic", "di-box": "mic" }[deviceType] || "line",
  connector: { "line-source": "trs14", "stereo-laptop": "trs35" }[deviceType] || "xlr",
  phantom: deviceType === "condenser-mic" ? "required" : "none",
  stem,
  pan: 0,
  scenarios: ANY_SCENARIO,
  ...extra,
});
const EA_SOURCES = [
  eaSource("ea-click", 1, "click", "Click (Mac mini, SSL 2+ OUT 3)", "CLICK", "Mac mini · SSL 2+ OUT 3: the click", "line-source", { outputDb: -4, mixDb: 0, note: "The performer's click, from the Mac mini at FOH. In Salmon it went into an AUX IN; the lab's X32 has AUX IN 1/2 only, so it comes in on LOCAL 1. It belongs in the performer's mix, never the house." }),
  eaSource("ea-pots", 17, "percussion", "Flower-pot mic (SD8 IN 1)", "POTS", "Flower-pot mic (dynamic), on the SD8", "dynamic-mic", { outputDb: -40, mixDb: -4, note: "Betweenness: one mic over the flower pots. Stand-in audio: FTW's percussion." }),
  eaSource("ea-kat", 18, "vocals", "MalletKAT rig (SD8 IN 2)", "KAT", "MalletKAT · laptop · Scarlett 18i8 line out, on the SD8", "line-source", { outputDb: -6, mixDb: -2, note: "Betweenness: the MalletKAT's pads trigger vocal-chop samples on a laptop; the Scarlett 18i8's line out goes into the SD8. Stand-in audio: FTW's vocals." }),
  eaSource("ea-bcl", 25, "winds", "Bass clarinet mic (S32 IN 25)", "B CLAR", "Bass clarinet mic (condenser), on the S32", "condenser-mic", { outputDb: -36, mixDb: 0, note: "Electrostatic Whale and Blood Memory: one condenser on a stand. Stand-in audio: FTW's woodwinds." }),
  eaSource("ea-piano", 26, "strings", "Piano mic (S32 IN 26)", "PIANO", "Condenser inside the grand piano, on the S32", "condenser-mic", { outputDb: -38, mixDb: -2, note: "I PUNCH PIANOS: two speakers lie on the strings, and this mic hears the strings ringing. Stand-in audio: FTW's strings." }),
  eaSource("ea-guitar", 27, "guitar", "Guitar rig (S32 IN 27)", "GTR", "Guitar → pedals → laptop and interface → DI, on the S32", "di-box", { outputDb: -30, mixDb: -2, note: "Running Spring: the guitarist's own rig, into a DI on the stage box. Stand-in audio: FTW's guitar." }),
  eaSource("ea-track", 33, "synths", "Electronics (Mac mini, SSL 2+ OUT 1/2)", "TRACK", "Mac mini · SSL 2+ OUT 1/2: the electronics", "stereo-laptop", { outputDb: -10, stereo: true, mixDb: -4, note: "The fixed electronics for the bass clarinet pieces, from the Mac mini at FOH into AUX IN 1/2. Stand-in audio: FTW's synths." }),
];

// ---------- CME in Salmon: Persephone as the Commercial Music Ensemble ----------

// The Commercial Music Ensemble (CME) in Salmon Recital Hall (MUS 248's CME
// Gig Checklist): a rock band on the hall's X32. Persephone's stems stand in
// for the band. Its stereo stems split into their two sides where CME has two
// of something: the two guitar amps (guitars L and R), the two pencil
// condensers on the grand piano (piano L and R) and two backing singers
// (backing vocals L and R; measured 2026-11-02, the sides correlate 0.35–0.55,
// so they are different parts). The Nord plays the whole piano stem, and the
// mic over the piano (red) carries the lead vocal, for the songs the pianist
// sings: a scenario's stage says who is playing (js/music.js stageFor).
const CME_SET = { ...PERSEPHONE_SET, id: "cme", title: "CME in Salmon", artist: "Persephone (Giovanna) as the band" };
const CME_SPLIT = { guitars: ["gtr-l", "gtr-r"], piano: ["piano", "piano-l", "piano-r"], "backing-vocals": ["bv-l", "bv-r"] };
const cmeStems = (list) => list.flatMap((st) => CME_SPLIT[st] || [st]);
CME_SET.sections = PERSEPHONE_SET.sections.map((s) => ({ ...s, plays: cmeStems(s.plays), partly: cmeStems(s.partly) }));
const side = (stem, treatment, monoPeakDb, monoRmsDb) => ({ ...PERSEPHONE_STEMS[stem], treatment, monoPeakDb, monoRmsDb });
const CME_STEMS = {
  drums: PERSEPHONE_STEMS.drums,
  bass: PERSEPHONE_STEMS.bass,
  "gtr-l": side("guitars", "left", -0.9, -14.3),
  "gtr-r": side("guitars", "right", -1.3, -14.1),
  piano: PERSEPHONE_STEMS.piano,
  "piano-l": side("piano", "left", -1.0, -13.2),
  "piano-r": side("piano", "right", -3.1, -17.0),
  trumpets: PERSEPHONE_STEMS.trumpets,
  "bv-l": side("backing-vocals", "left", -1.2, -15.0),
  "bv-r": side("backing-vocals", "right", -2.8, -16.9),
  "lead-vocals": PERSEPHONE_STEMS["lead-vocals"],
};
const PERSEPHONE_BY_STEM = Object.fromEntries(PERSEPHONE_SOURCES.filter((s) => s.stem).map((s) => [s.stem, s]));
const cmeSource = (id, order, name, shortName, device, deviceType, stem, extra) => {
  const player = PERSEPHONE_BY_STEM[{ "gtr-l": "guitars", "gtr-r": "guitars", "piano-l": "piano", "piano-r": "piano", "bv-l": "backing-vocals", "bv-r": "backing-vocals" }[stem] || stem];
  return {
    id,
    order,
    name,
    shortName,
    musician: player.musician,
    musicianShort: player.musicianShort,
    device,
    category: "CME",
    deviceType,
    signalLevel: "mic",
    connector: "xlr",
    phantom: deviceType === "condenser-mic" ? "required" : "none",
    stem,
    pan: 0,
    mixDb: 0,
    scenarios: ANY_SCENARIO,
    ...extra,
  };
};
// The wireless handhelds go left to right across the stage in ring order:
// red is the mic over the piano, orange the lead singer, yellow and green the
// backing singers, blue the horn player (who always comes in on a wireless).
// They're the no-windscreen set, paired with the third PTU-6000 in the
// wireless rack at FOH (channels 17–24), whose AF OUTs plug into LOCAL 17–24.
// No cable: by radio to the receiver (`rf-handheld`). `outputDb` is the
// receiver's AF OUT with its VOL knob at 9 o'clock, as the rack leaves it.
const cmeHandheld = (id, n, ring, who, stem, extra) => cmeSource(id, 16 + n, `${who} (${ring})`, ring.toUpperCase(), `Wireless handheld, ${ring} ring, no windscreen → receiver 3 CH ${n} (CH ${16 + n})`, "rf-handheld", stem, { outputDb: -30, ...extra });
const CME_SOURCES = [
  cmeHandheld("cme-red", 1, "red", "Piano vocal mic", "lead-vocals", { note: "A handheld on a boom over the grand piano: some songs the pianist sings lead." }),
  cmeHandheld("cme-orange", 2, "orange", "Lead vocal", "lead-vocals"),
  cmeHandheld("cme-yellow", 3, "yellow", "Backing vocal 1", "bv-l", { mixDb: -4, pan: -0.3 }),
  cmeHandheld("cme-green", 4, "green", "Backing vocal 2", "bv-r", { mixDb: -4, pan: 0.3 }),
  cmeHandheld("cme-blue", 5, "blue", "Horn", "trumpets", { mixDb: -6, pan: 0.2, outputDb: -34, note: "The horn player comes in on a wireless handheld too." }),
  // CME in Salmon: Advanced. Each is on stage in one scenario only, and lands
  // on CH 9-10 once ROUTING → INPUT points CH 9-16 at it (Salmon's default has
  // them on LOCAL 9-16, receiver 2). The gig gain-stages those channels for them.
  // A guest singer's headset on a body pack, paired with the PTU-7000's CH 1
  // (`cme-rx-lav` pairs), whose AF OUT 1 is in LOCAL 25: CH 9-16 ← Local 25-32.
  cmeSource("cme-guest", 9, "Guest vocal (headset)", "GUEST", "Headset mic on a wireless body pack → PTU-7000 CH 1 → LOCAL 25", "rf-handheld", "lead-vocals", {
    outputDb: -30,
    scenarios: ["x32-cme-adv-headset"],
    note: "A guest singer on a headset: its body pack is paired with the PTU-7000 (lav and headset packs), whose AF OUT 1 plugs into LOCAL 25.",
  }),
  // The band's own kick and snare mics, more inputs than the sub snake has: straight into
  // S32 IN 9 and 10, so CH 9-16 ← AES50 A9-16.
  cmeSource("cme-kick", 9, "Kick drum (dynamic)", "KICK", "Dynamic mic in the kick drum → S32 IN 9", "dynamic-mic", "drums", { outputDb: -28, mixDb: -4, scenarios: ["x32-cme-adv-inputs"] }),
  cmeSource("cme-snare", 10, "Snare (SM57)", "SNARE", "SM57 on the snare → S32 IN 10", "dynamic-mic", "drums", { outputDb: -32, mixDb: -6, scenarios: ["x32-cme-adv-inputs"] }),
  cmeSource("cme-nord", 25, "Nord (DI)", "NORD", "Nord Stage 4 → DI box, on sub snake 1", "di-box", "piano", {
    outputDb: -32,
    mixDb: -6,
    pan: -0.3,
    volumeKnob: { label: "Nord MASTER LEVEL", unity: 7.5, start: 7.5 },
    gearPower: "The Nord",
    note: "The Nord's output into a DI box, the DI's XLR into sub snake 1. One channel is enough; 26 is free if it ever comes in stereo.",
  }),
  cmeSource("cme-pno-l", 27, "Piano mic L (pencil condenser)", "PNO L", "Pencil condenser in the grand piano, on sub snake 3", "condenser-mic", "piano-l", { outputDb: -40, mixDb: -6, pan: -0.5 }),
  cmeSource("cme-pno-r", 28, "Piano mic R (pencil condenser)", "PNO R", "Pencil condenser in the grand piano, on sub snake 4", "condenser-mic", "piano-r", { outputDb: -40, mixDb: -6, pan: 0.5 }),
  cmeSource("cme-bass", 29, "Bass (DI)", "BASS", "Bass guitar → DI box, on sub snake 5", "di-box", "bass", {
    outputDb: -32,
    mixDb: -3,
    volumeKnob: { label: "Bass guitar VOLUME", unity: 10, start: 10 },
    note: "The DI goes between the bass and its amp: the bass amp is for the player, the DI is for the PA.",
  }),
  cmeSource("cme-gtr1", 30, "Guitar amp 1 (SM57)", "GTR 1", "SM57 on the Boss Katana-50, on sub snake 6", "dynamic-mic", "gtr-l", {
    outputDb: -36,
    mixDb: -5,
    pan: -0.4,
    volumeKnob: { label: "Katana-50 MASTER", unity: 5, start: 5 },
    gearPower: "The Katana-50",
    note: "An SM57 an inch or two from the amp's grille. The mic hears whatever the amp plays, so the amp's own knobs come first.",
  }),
  cmeSource("cme-gtr2", 31, "Guitar amp 2 (SM57)", "GTR 2", "SM57 on a second guitar amp, on sub snake 7", "dynamic-mic", "gtr-r", { outputDb: -36, mixDb: -5, pan: 0.4, volumeKnob: { label: "Amp 2 MASTER", unity: 5, start: 5 }, gearPower: "Guitar amp 2" }),
  cmeSource("cme-oh", 32, "Drum overhead (condenser)", "OH", "Condenser over the drum kit, on sub snake 8", "condenser-mic", "drums", {
    outputDb: -34,
    mixDb: -6,
    note: "Optional: the kit is loud enough in Salmon on its own. The lab has no room sound, so an overhead stands in for it.",
  }),
  {
    ...VJ_LAPTOP,
    name: "Test music (Mac mini · SSL 2+)",
    device: "FOH Mac mini (MUS-BH100-MINI) → SSL 2+",
    deviceType: "foh-mac",
    connector: "trs14",
    note: "The crew's test music, from the FOH Mac mini through its SSL 2+ into AUX IN 1/2 (two 1/4\" TRS cables): through the mains, then each wedge, before anyone plays. The same Mac mini takes the X32's Dante multitrack.",
  },
];

// ---------- Mariachi in Salmon: Mariachi Panteras' own dress rehearsal ----------

// Mariachi Panteras in Salmon Recital Hall (MUS 248's Mariachi Gig Checklist),
// from the X32's multitrack of the dress rehearsal (Logic "261106 Mariachi
// Dress", 2026-11-06; audio/README.md has how the files were cut). Nine
// wireless handhelds, nothing else: four on the violins, one each on the
// guitarrón, the lead vihuela and the lead guitarra, and two up front for
// vocal solos. The trumpets have no mic (they don't need one). Track 3 of the
// session was dead and isn't here. Tracks 06 and 07 were first guessed to be
// trumpets; with no trumpet mic at the gig they are violins 3 and 4 (the file
// names keep the old guess). Song 1 of the eight; its loop is everyone playing,
// the singer on the second vocal mic at its start and end (the first vocal mic
// only hears the band). Mono files, every track +7.5 dB (`normalizeDb`).
const MARIACHI_PARTS = [
  // [stem id, file's track and name, Logic track]
  ["vocal-1", "01-vocal-lead"],
  ["vocal-2", "02-mc"],
  ["violin-1", "04-violin-1"],
  ["violin-2", "05-violin-2"],
  ["violin-3", "06-trumpet-1"],
  ["violin-4", "07-trumpet-2"],
  ["guitarron", "08-guitarron"],
  ["vihuela", "09-vihuela"],
  ["guitarra", "10-guitarra"],
];
// monoPeakDb, monoRmsDb over the whole song (audio/README.md, MARIACHI_LEVELS["mariachi-1"]), in the order above.
const MARIACHI_1_LEVELS = [[-13.92, -34.12], [-2.23, -22.92], [-18.08, -38.29], [-22.17, -39.26], [-14.97, -35.35], [-14.37, -35.64], [-10.64, -28.62], [-5.19, -25.31], [-7.58, -28.57]];
const MARIACHI_STEMS = Object.fromEntries(MARIACHI_PARTS.map(([id, file], i) => [id, { file: `mariachi-1-${file}.mp3`, channels: 1, treatment: "sum", monoPeakDb: MARIACHI_1_LEVELS[i][0], monoRmsDb: MARIACHI_1_LEVELS[i][1], normalizeDb: 7.5 }]));
const MARIACHI_ALL = MARIACHI_PARTS.map(([id]) => id);
const MARIACHI_ENSEMBLE = "Mariachi Panteras";
// ~172 bpm, A minor. The excerpt is song time 64.13 + 37.591 s; its loop 0.5 → 36.591 (the seam within ±12 ms).
const MARIACHI_SET = {
  id: "mariachi",
  title: "Mariachi in Salmon",
  artist: `${MARIACHI_ENSEMBLE}, dress rehearsal`,
  basePath: "audio/mariachi-1/",
  loop: { start: 0.5, end: 36.591 },
  excerpt: { originalStart: 64.13, duration: 37.591 },
  full: { basePath: "audio/mariachi-1/full/", segmentSeconds: 20, overlap: 0.5, duration: 163.08, segments: 9, trimDb: 0 },
  sections: [{ id: "excerpt", bars: "loop", start: 64.63, label: "Everyone playing, a vocal solo at the start and the end", plays: MARIACHI_ALL, partly: [] }],
};
// Left to right across the stage in rainbow order, as the crew hands them out:
// receiver 1 (black windscreens, CH 1-8) for the band, then receiver 2 (gray
// windscreens, CH 9-16) for the two vocal mics. Yellow on receiver 1 isn't
// used. A handheld clipped to a stand for the instruments. `order` is the
// console channel: receiver channel n's AF OUT is in LOCAL n.
const marHandheld = (id, ch, windscreen, ring, name, shortName, stem, extra) => ({
  id,
  order: ch,
  name: `${name} (${windscreen}/${ring})`,
  shortName,
  musician: `${MARIACHI_ENSEMBLE}: ${name.toLowerCase()}`,
  musicianShort: shortName,
  device: `Wireless handheld, ${windscreen} windscreen, ${ring} ring → receiver ${ch > 8 ? 2 : 1} CH ${((ch - 1) % 8) + 1} (CH ${ch})`,
  category: "Mariachi",
  deviceType: "rf-handheld",
  signalLevel: "mic",
  connector: "xlr",
  phantom: "none",
  outputDb: -30,
  stem,
  mixDb: 0,
  pan: 0,
  scenarios: ANY_SCENARIO,
  ...extra,
});
const MARIACHI_SOURCES = [
  marHandheld("mar-vln1", 1, "black", "red", "Violin 1", "VLN 1", "violin-1", { mixDb: -14, pan: -0.6, outputDb: -34 }),
  marHandheld("mar-vln2", 2, "black", "orange", "Violin 2", "VLN 2", "violin-2", { mixDb: -14, pan: -0.5, outputDb: -34 }),
  marHandheld("mar-vln3", 4, "black", "green", "Violin 3", "VLN 3", "violin-3", { mixDb: -14, pan: -0.4, outputDb: -34 }),
  marHandheld("mar-vln4", 5, "black", "blue", "Violin 4", "VLN 4", "violin-4", { mixDb: -14, pan: -0.3, outputDb: -34 }),
  marHandheld("mar-gtrn", 6, "black", "purple", "Guitarrón", "GTRRN", "guitarron", { mixDb: -3, pan: 0, outputDb: -32, note: "The mariachi's bass: a handheld on a stand aimed at its back." }),
  marHandheld("mar-vih", 7, "black", "black", "Vihuela (lead)", "VIHUELA", "vihuela", { mixDb: -6, pan: 0.3, outputDb: -32 }),
  marHandheld("mar-gtra", 8, "black", "gray", "Guitarra (lead)", "GUITARRA", "guitarra", { mixDb: -5, pan: 0.4, outputDb: -32 }),
  marHandheld("mar-vox1", 9, "gray", "red", "Vocal mic 1", "VOX 1", "vocal-1", { note: "Up front, for vocal solos. In this song the band leaks into it; the singer is on vocal mic 2." }),
  marHandheld("mar-vox2", 10, "gray", "orange", "Vocal mic 2", "VOX 2", "vocal-2", { note: "Up front, for vocal solos and talking between songs." }),
  // The spare a player gets when a handheld dies mid-soundcheck: receiver 2's green, on CH 12 (one scenario only).
  marHandheld("mar-spare", 12, "gray", "green", "Spare handheld", "SPARE", "violin-1", { mixDb: -14, pan: -0.6, outputDb: -34, scenarios: ["x32-mariachi-swap"], note: "The spare from the wireless drawer, now on the first violin's stand." }),
  {
    ...VJ_LAPTOP,
    name: "Test music (Mac mini · SSL 2+)",
    device: "FOH Mac mini (MUS-BH100-MINI) → SSL 2+",
    deviceType: "foh-mac",
    connector: "trs14",
    note: "The crew's test music, from the FOH Mac mini through its SSL 2+ into AUX IN 1/2: through the hall's speakers, then each wedge, before anyone plays.",
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
  "almost-like": { id: "almost-like", title: "Almost Like Being in Love", artist: ENSEMBLE, set: ALMOST_SET, stems: ALMOST_STEMS, sources: JAZZ_SOURCES },
  "love-me": { id: "love-me", title: "Love Me or Leave Me", artist: ENSEMBLE, set: LOVE_ME_SET, stems: LOVE_ME_STEMS, sources: JAZZ_SOURCES },
  // A gig, not just a band: its rig is the X32 Compact's, so it plays on that console only.
  cob: { id: "cob", title: "COB in Irvine", artist: "the Vocal Jazz Ensemble as the cast", set: COB_SET, stems: COB_STEMS, sources: COB_SOURCES, consoles: ["x32c"] },
  vj: { id: "vj", title: "Vocal Jazz in Salmon", artist: "the Vocal Jazz Ensemble (“Almost Like Being in Love”)", set: VJ_SET, stems: ALMOST_STEMS, sources: VJ_SOURCES, consoles: ["x32"] },
  "vj-love": { id: "vj-love", title: "Vocal Jazz in Salmon", artist: "the Vocal Jazz Ensemble (“Love Me or Leave Me”)", set: VJ_LOVE_SET, stems: LOVE_ME_STEMS, sources: VJ_SOURCES, consoles: ["x32"] },
  karaoke: { id: "karaoke", title: "Karaoke in BH 109", artist: "a karaoke track (NOSTRADAMUS)", set: KARAOKE_SET, stems: KARAOKE_STEMS, sources: KARAOKE_SOURCES, consoles: ["x1204usb"] },
  ea: { id: "ea", title: "Electroacoustic showcase", artist: "FTW's parts as stand-ins, and a click", set: EA_SET, stems: EA_STEMS, sources: EA_SOURCES, consoles: ["x32"] },
  cme: { id: "cme", title: "CME in Salmon", artist: "Persephone (Giovanna) as the Commercial Music Ensemble", set: CME_SET, stems: CME_STEMS, sources: CME_SOURCES, consoles: ["x32"] },
  mariachi: { id: "mariachi", title: "Mariachi in Salmon", artist: "Mariachi Panteras, from their dress rehearsal", set: MARIACHI_SET, stems: MARIACHI_STEMS, sources: MARIACHI_SOURCES, consoles: ["x32"] },
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
// player or a room mic is found whichever band is on stage. A song's own
// source wins over a shared one with its id (Salmon's test-music laptop).
export let SOURCES_BY_ID;

// Puts a song's band on stage. Returns true if it changed.
export function useSong(id) {
  const song = SONGS[id] || SONGS[DEFAULT_SONG];
  const changed = STEM_SET !== song.set;
  SONG = song.id;
  STEM_SET = song.set;
  STEMS = song.stems;
  SOURCES = song.sources;
  SOURCES_BY_ID = Object.fromEntries([...ROOM_SOURCES, PRESHOW_SOURCE, ...SOURCES].map((s) => [s.id, s]));
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
  ...[
    ["Almost Like Being in Love", "Frederick Loewe and Alan Jay Lerner", "Darmon Meader"],
    ["Love Me or Leave Me", "Walter Donaldson and Gus Kahn", "Rosana Eckert"],
  ].map(([title, writers, arranger]) => ({
    title,
    lines: [
      ["Music and lyrics", writers],
      ["Arrangement", arranger],
      ["Vocal Jazz Ensemble", VJ_SINGERS.map(([, name]) => name).join(", ")],
      ["Director", "Alex Robinson"],
      ["Piano", "Celine You (heard only through the vocal mics)"],
      ["Recorded", "live in concert, October 23, 2026"],
    ],
    note: "Used with permission for this educational project.",
  })),
  {
    title: "COB in Irvine",
    lines: [["Music", "“Love Me or Leave Me” by the Vocal Jazz Ensemble, eleven singers on eleven headsets; the backing-track laptop is silent"]],
    note: "Used with permission for this educational project.",
  },
  {
    title: "Vocal Jazz in Salmon",
    lines: [["Music", "“Almost Like Being in Love” by the Vocal Jazz Ensemble, eleven singers on eleven handhelds"]],
    note: "Used with permission for this educational project.",
  },
  {
    title: "Mariachi in Salmon",
    lines: [
      ["Ensemble", "Mariachi Panteras"],
      ["Recorded", "the X32's multitrack of the dress rehearsal, Salmon Recital Hall, November 6, 2026"],
    ],
    note: "Shared by the course for this educational project; song titles and credits to come.",
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
