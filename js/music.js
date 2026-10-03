// Which part of the song a scenario plays. Pure; no audio.
//
// Most scenarios only care about a few instruments ("put the keys in the
// singer's wedge"), so they don't need the one stretch where the whole band
// plays. Each scenario gets an 8-bar section where every instrument it
// mentions is playing, picked by its id so the choice is stable but differs
// from scenario to scenario. A scenario can force one with `music: "<id>"`.

// Words in a scenario's text → the source they're about.
const WORDS = [
  [/\bdrum|\bkick\b|\bsnare|\bcymbal|\bhi-?hat/i, "drums"],
  [/\bbass\b(?!\s*boost)/i, "bass"],
  [/\bguitar/i, "guitars"],
  [/\bkeys\b|\bkeyboard|\bpiano/i, "keys"],
  [/\btrumpet|\bhorns?\b|\bbrass\b/i, "trumpets"],
  [/\bbacking\b|\bharmon(y|ies)\b|\bBVs?\b/, "backing-vocals"],
  [/\bvocal|\bsinger|\bvox\b|\bvoice\b/i, "lead-vocal"],
];

// Every source id a scenario refers to, in its checks or its words.
export function sourcesNeeded(def) {
  const out = new Set();
  const add = (id) => typeof id === "string" && out.add(id);
  for (const c of def.conditions || []) {
    add(c.source);
    for (const s of c.sources || []) add(s);
    for (const s of c.below || []) add(s);
  }
  for (const m of Object.values(def.baseline || {})) add(m.source);
  const text = [def.title, def.prompt, def.goal, ...(def.hints || [])].filter((t) => typeof t === "string").join(" ");
  for (const [re, id] of WORDS) if (re.test(text)) out.add(id);
  return [...out];
}

// Stems behind those sources (sources without a stem, like the room pair or
// the preshow laptop, don't constrain the choice).
export function stemsNeeded(def, sourcesById) {
  const stems = sourcesNeeded(def)
    .map((id) => sourcesById[id] && sourcesById[id].stem)
    .filter(Boolean);
  return [...new Set(stems)];
}

// The sections a scenario could use: every needed stem plays throughout.
export function sectionsFor(def, sections, sourcesById) {
  if (def.music) return sections.filter((s) => s.id === def.music);
  const need = stemsNeeded(def, sourcesById);
  return sections.filter((s) => need.every((stem) => s.plays.includes(stem)));
}

export function pickSection(def, sections, sourcesById) {
  const fallback = sections.find((s) => s.id === "excerpt") || sections[0];
  if (!def || def.id === "free-play") return fallback;
  const ok = sectionsFor(def, sections, sourcesById);
  if (!ok.length) return fallback;
  return ok[hash(def.id) % ok.length];
}

// Stems a section leaves out, as source names, for the "who's playing" note.
export function sittingOut(section, sourceIds, sourcesById) {
  return sourceIds
    .map((id) => sourcesById[id])
    .filter((s) => s && s.stem && !section.plays.includes(s.stem) && !(section.partly || []).includes(s.stem));
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
