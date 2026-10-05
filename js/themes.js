// Themes (shown to students as "Topics"): the lab's scenarios grouped by what
// they teach, not by console. The other way in is by mixer (MIXERS below): a
// student standing at a real desk picks it and works through its scenarios.
// A theme is one concept (phantom power, aux sends, EQ…) practised first on the
// generic analog mixer and then on real consoles, simplest first, so the idea
// carries over from desk to desk. The scenario picks its console.
//
// Pure data and functions (no DOM), tested in tests/themes.test.mjs: every
// scenario sits in exactly one theme.

import { ALL_BOARD_SCENARIOS, MIXER_ORDER, SCENARIOS, scenariosFor } from "./scenarios.js";

// In teaching order: the system and the signal path first, then gain, the
// house and monitor mixes, processing, then the bigger-console workflows.
export const THEMES = [
  {
    id: "system",
    title: "Speakers and amps",
    question: "Where is the amplifier?",
    concept: "Powered speakers have the amp inside and take line level; passive speakers need a power amp in between. A speaker that fits the cable can still be silent.",
    ids: ["find-amp", "drummer-wedge", "b207mp3-amp", "stagepas400bt-speakers", "stagepas400bt-sub"],
  },
  {
    id: "patch",
    title: "Plugging in",
    question: "Which jack, which cable?",
    concept: "Mics, instruments, laptops and players each have their own level and connector. Get each one into an input that suits it, and into the house.",
    ids: ["preshow", "build-rig", "missing-guitar", "b207mp3-doors", "mix8-doors", "mix8-guest", "stagepas400bt-doors", "stagepas400bt-mono", "mg102-doors", "mg102-2tr", "vlz1202-doors", "x1204usb-doors", "x1204usb-minus10", "x1204usb-cdtape", "cr1604-doors", "ui16-doors", "l20-doors", "yam01v96-doors", "x32c-doors", "dm2000-doors", "x32-doors", "cl3-doors"],
  },
  {
    id: "phantom",
    title: "Phantom power",
    question: "Why is the condenser silent?",
    concept: "Condenser mics need +48 V from the mixer, and it only travels over an XLR into the mic input. Every console puts the switch somewhere different.",
    ids: ["b207mp3-phantom", "mix8-overhead", "stagepas400bt-overhead", "mg102-phantom", "x1204usb-overhead", "cr1604-phantom", "ui16-48v", "x32c-48v", "yam01v96-phantom", "dm2000-48v", "x32-room", "cl3-48v", "sd442-phantom", "f8n-room"],
  },
  {
    id: "gain",
    title: "Gain staging",
    question: "Too hot, too quiet, or just right?",
    concept: "Set each input's GAIN (or TRIM) first, so the meter sits in the healthy band. Faders come after. Too hot clips; too low is noisy.",
    ids: ["b207mp3-quiet-singer", "mix8-ol", "stagepas400bt-micline", "mg102-peak", "vlz1202-trim", "vlz1202-pad", "ui16-gain", "l20-gain", "l20-pad", "x32c-gain", "yam01v96-pad", "dm2000-pad", "cl3-gain", "sd442-hot-vocal", "sd442-master", "sd442-line", "f8n-trim"],
  },
  {
    id: "solo",
    title: "Headphones and solo",
    question: "Can you hear one thing on its own?",
    concept: "PFL / SOLO puts one channel in the engineer's headphones without touching the house. It's how you check an input and set its gain.",
    ids: ["mix8-phones", "mix8-speech", "vlz1202-pfl", "vlz1202-tape", "x1204usb-pfl", "cr1604-levelset", "f8n-pfl"],
  },
  {
    id: "main",
    title: "The house mix",
    question: "What does the audience hear?",
    concept: "Faders, pan, MUTE / ON and the routing to the main mix decide the audience's balance. Change only what's wrong.",
    ids: ["foh-vocal", "b207mp3-small-room", "mix8-pan", "cr1604-assign", "yam01v96-on", "yam01v96-to-st", "x32c-lr", "dm2000-on", "dm2000-to-st", "cl3-on", "f8n-balance", "f8n-link"],
  },
  {
    id: "monitors",
    title: "Monitor mixes",
    question: "What does the band hear?",
    concept: "Each wedge has its own mix from aux (MIX) sends. Pre-fader sends ignore the house faders; post-fader sends follow them. A wedge's master moves it all at once.",
    ids: ["more-vocal", "more-piano", "monitor-quiet", "drummer-mix", "b207mp3-wedge", "b207mp3-wedge-quiet", "mix8-keys-wedge", "mix8-wedge-loud", "mix8-ballad", "stagepas400bt-monitor", "stagepas400bt-feedback", "mg102-less-drums", "mg102-one-knob", "vlz1202-wedge-quiet", "vlz1202-prefader", "x1204usb-wedge", "x1204usb-pre", "cr1604-mute-pre", "cr1604-drummer-quiet", "cr1604-shift", "ui16-more-keys", "ui16-out-of-house", "l20-keys-wedge", "l20-less-guitar", "l20-out-of-house", "l20-wedge-quiet", "l20-switch", "ui16-post", "ui16-guitar-mix", "x32c-drummer-quiet", "x32c-bus-mute", "x32c-out-of-house", "x32c-new-mix", "yam01v96-master", "yam01v96-pre-point", "yam01v96-new-mix", "dm2000-new-mix", "x32-bus9"],
  },
  {
    id: "filters",
    title: "Low cut and high-pass",
    question: "Where's the rumble coming from?",
    concept: "A high-pass filter (LOW CUT, HPF) removes the low rumble a voice doesn't need. Leave it off the kick and bass.",
    ids: ["mg102-rumble", "vlz1202-lowcut", "cr1604-lowcut", "ui16-hpf", "l20-lowcut", "x32c-lowcut", "sd442-hpf", "f8n-hpf"],
  },
  {
    id: "eq",
    title: "EQ",
    question: "Boomy, muddy, honky or harsh?",
    concept: "Name the problem, find its frequency, cut rather than boost. On a digital desk the EQ also has to be switched ON.",
    ids: ["b207mp3-speech", "mix8-boomy", "stagepas400bt-speech", "mg102-thin-bass", "vlz1202-nasal", "cr1604-sweep", "ui16-mud", "ui16-harsh", "ui16-eq-on", "l20-mud", "l20-eq-on", "x32c-mud", "x32c-eq-on", "yam01v96-mud", "yam01v96-eq", "yam01v96-eq-on", "dm2000-mud", "dm2000-eq-on", "x32-mud", "x32-eq-on", "cl3-mud", "cl3-eq-on"],
  },
  {
    id: "dynamics",
    title: "Compression",
    question: "Why does it jump in and out?",
    concept: "A compressor turns loud moments down: THRESHOLD says where, RATIO how much. Watch the gain-reduction meter to see it working.",
    ids: ["x1204usb-comp", "ui16-comp", "ui16-comp-on", "x32c-comp-on", "yam01v96-comp", "yam01v96-comp-on", "dm2000-comp-on", "x32-comp-on", "cl3-comp-on"],
  },
  {
    id: "effects",
    title: "Effects",
    question: "Reverb on what, and how much?",
    concept: "Effects are fed by a send (post-fader) and come back on a return. The send picks what gets the effect; the return sets how much you hear.",
    ids: ["stagepas400bt-reverb", "stagepas400bt-hall", "mg102-reverb-loud", "vlz1202-reverb", "vlz1202-efx", "x1204usb-fx", "x1204usb-slapback", "x1204usb-ret-mon", "cr1604-reverb", "cr1604-efx-mon", "ui16-trumpet-reverb", "l20-reverb", "l20-efx-mon", "ui16-delay", "x32c-reverb", "yam01v96-reverb", "dm2000-reverb", "x32-fx", "cl3-fx"],
  },
  {
    id: "groups",
    title: "Groups",
    question: "One fader for the whole rhythm section?",
    concept: "Subgroups carry audio; DCAs and fader groups only move faders; mute groups switch many channels at once. Pick the one that does the job.",
    ids: ["vlz1202-alt", "x1204usb-alt", "cr1604-subgroup", "x32c-dca", "x32c-mute-group", "dm2000-subgroup", "dm2000-bus-to-st", "dm2000-fader-group", "dm2000-mute-group", "x32-subgroup", "cl3-dca", "cl3-mute-group"],
  },
  {
    id: "outputs",
    title: "Outputs and routing",
    question: "What comes out of that jack?",
    concept: "On a digital desk an output carries whatever its routing says. Mono, matrix and centre buses feed fills and lobbies from the mixes you already have.",
    ids: ["cr1604-mono", "x32-routing-house", "x32-routing-wedge", "x32-mc", "x32-matrix", "dm2000-output-patch", "dm2000-matrix", "cl3-routing-house", "cl3-routing-wedge", "cl3-matrix"],
  },
  {
    id: "digital",
    title: "Digital workflows",
    question: "Where did that control go?",
    concept: "Layers, sends on faders, encoders and scenes: the same jobs as an analog desk, reached through pages and modes.",
    ids: ["yam01v96-fader-mode", "x32c-sof", "dm2000-fader-mode", "dm2000-encoder", "dm2000-scene-recall", "x32-scene-recall", "x32-scene-store", "cl3-sof", "cl3-scene-recall", "cl3-scene-store"],
  },
  {
    id: "stagebox",
    title: "Snakes and stage boxes",
    question: "How does the stage reach the console?",
    concept: "A snake bundles mic lines to FOH; a digital stage box puts the preamps on stage and sends everything down one network cable. The console still has to be told where to listen.",
    ids: ["cr1604-snake", "cr1604-snake-return", "x32c-stagebox", "x32-stagebox", "x32-stagebox-link", "x32-stagebox-out", "cl3-dante", "cl3-dante-back", "cl3-dante-fix"],
  },
  {
    id: "recording",
    title: "Recording and cameras",
    question: "Is the camera getting the right level?",
    concept: "Recorders and cameras take mic or line level and say so with a switch. Direct outs and isolated feeds send single sources; tone lines everything up.",
    ids: ["cr1604-direct", "cr1604-room", "sd442-camera", "sd442-tone", "sd442-mono", "sd442-iso", "f8n-track", "f8n-camera", "f8n-dslr", "f8n-iso-safety"],
  },
];

export const THEMES_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));

// Every scenario by id: the Canvas ones on the generic mixer, and every real console's.
const ALL = [...SCENARIOS.filter((s) => s.number > 0), ...ALL_BOARD_SCENARIOS];
export const SCENARIO_BY_ID = Object.fromEntries(ALL.map((s) => [s.id, s]));

// The console a scenario runs on ("generic" = the generic analog mixer).
export const consoleOf = (s) => s.board || "generic";

// The skin that draws a console.
export function skinOf(consoleId) {
  if (consoleId === "generic") return "analog";
  return MIXER_ORDER.find((m) => m.model === consoleId)?.skin || consoleId;
}

// Generic first, then the real consoles from simplest to most complex.
const consoleRank = (c) => (c === "generic" ? -1 : MIXER_ORDER.findIndex((m) => m.model === c));

// A theme's scenarios in the order to do them.
export function themeScenarios(theme) {
  const t = typeof theme === "string" ? THEMES_BY_ID[theme] : theme;
  const listed = t.ids.map((id, i) => ({ s: SCENARIO_BY_ID[id], i })).filter((x) => x.s);
  return listed.sort((a, b) => consoleRank(consoleOf(a.s)) - consoleRank(consoleOf(b.s)) || a.i - b.i).map((x) => x.s);
}

const THEME_OF = new Map(THEMES.flatMap((t) => t.ids.map((id) => [id, t.id])));
export const themeOf = (scenarioId) => THEMES_BY_ID[THEME_OF.get(scenarioId)] || null;

// The Canvas assignment: the numbered scenarios on the generic analog mixer.
export const CANVAS_SCENARIOS = SCENARIOS.filter((s) => s.number > 0);
export const isCanvas = (s) => !s.board && s.number > 0;

// The scenario to open for a theme: the first one not solved yet (or the first).
export function nextInTheme(theme, solved = () => false) {
  const list = themeScenarios(theme);
  return list.find((s) => !solved(s.id)) || list[0];
}

// ---------- by mixer ----------

// Every console with scenarios, simplest first: the generic analog mixer (its
// scenarios are the Canvas ten), then the real ones in MIXER_ORDER.
export const MIXERS = [
  { model: "generic", skin: "analog", why: "Faders, MUTE and two aux sends: the ideas without any one maker's layout. Assignment 1's ten scenarios ran here." },
  ...MIXER_ORDER,
];
export const mixerEntry = (consoleId) => MIXERS.find((m) => m.model === consoleId) || null;

// A console's scenarios in its own teaching order.
export function mixerScenarios(consoleId) {
  if (consoleId === "generic") return CANVAS_SCENARIOS;
  return scenariosFor(consoleId).filter((s) => s.number > 0);
}

// The scenario to open on a console: the first one not solved yet (or the first).
export function nextOnMixer(consoleId, solved = () => false) {
  const list = mixerScenarios(consoleId);
  return list.find((s) => !solved(s.id)) || list[0];
}
