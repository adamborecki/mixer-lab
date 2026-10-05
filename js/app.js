// Mixer Lab bootstrap: wires the semantic store, the audio engine, the
// scenario checker and the views together. No audio exists until the
// student presses Start Audio.

import * as manifest from "../audio/source-manifest.js";
import { DEVICE_TYPES, cableAt, channelPortRef, mixerOf, portRef } from "./connection-model.js";
import { AudioEngine } from "./audio-engine.js";
import { PREVIEW, liveUrl, storageKey } from "./deploy-context.js";
import { DEFAULT_SKIN, SKINS } from "./mixer-models.js";
import { MixerStore, computeMix, createMixerState } from "./mixer-state.js";
import { ALL_BOARD_SCENARIOS, SCENARIOS, SCENARIOS_BY_ID, buildScenarioState, captureBaseline, evaluateScenario, scenarioFor, scenariosFor } from "./scenarios.js";
import { Progress, numberedScenarios } from "./progress.js";
import { pickSection, sittingOut, stageFor, stageNote } from "./music.js";
import { nameMode, setNameMode, setStandIns } from "./names.js";
import { renderFlow } from "./ui/flow.js";
import { ListenBar } from "./ui/listen-bar.js";
import { MixerView } from "./ui/mixer-view.js";
import { PatchView } from "./ui/patch-view.js";
import { MissionView, StartScreen, ThemeDrawer } from "./ui/mission-view.js";
import { SCENARIO_BY_ID, THEMES_BY_ID, consoleOf, mixerEntry, nextInTheme, nextOnMixer, skinOf } from "./themes.js";
import { ASSIGNMENTS_BY_ID, CURRENT_ASSIGNMENT, assignmentProgress, nextTopic } from "./assignments.js";
import { BugLog } from "./bugs.js";
import { BugView } from "./ui/bug-view.js";
import { SubmissionView } from "./ui/submission-view.js";
import { RecorderView } from "./ui/recorder-view.js";
import { DanteView } from "./ui/dante-view.js";
import { StageView } from "./ui/stage-view.js";

const M = { STEM_SET: manifest.STEM_SET, STEMS: manifest.STEMS, SOURCES_BY_ID: manifest.SOURCES_BY_ID, LOOP_ASSETS: manifest.LOOP_ASSETS, VOICES: manifest.VOICES };
const $ = (sel) => document.querySelector(sel);

let skin = SKINS[DEFAULT_SKIN];
// Three ways in: "topic" (the scenario picks the console), "mixer" (you pick
// the console, then work through its scenarios) or "free" (any console, no goals).
let mode = "topic";
// Which mixer hardware the current skin draws ("generic" for the generic analog mixer).
const hardwareOf = (sk) => sk.hardware || "generic";

const store = new MixerStore(createMixerState(hardwareOf(skin)));
// Every scenario's progress is remembered: the Canvas export (js/export.js) reports all of it.
const progress = new Progress([...numberedScenarios(SCENARIOS), ...ALL_BOARD_SCENARIOS].map((s) => s.id), undefined, [...SCENARIOS, ...ALL_BOARD_SCENARIOS].map((s) => s.id));
const engine = new AudioEngine(store, M);

let current = { def: SCENARIOS_BY_ID["free-play"], baseline: {}, session: { listened: new Set() } };
// Free play picks the music: any 8-bar section (STEM_SET.sections id) or "full".
// The scenarios each get a section of their own (js/music.js).
let musicMode = "excerpt";
let ready = false;
let loadingText = "Press Start Audio to begin.";
let lastEval = "";
let lastMix = null;
let lastListen = null;
let buffering = false;
const pending = { any: false, patch: false };

// ---------- views ----------

const toast = makeToast($("#toast"));

const patchView = new PatchView({
  sourcesRoot: $("#sources"),
  outputsRoot: $("#outputs"),
  store,
  manifest: M,
  toast,
  getTerms: () => skin.terms,
  onOpenRecorder: (id) => recorderView.open(id),
  onOpenDante: (tab) => danteView.open(tab),
  getRecorder: (id) => engine.recorder(id),
});

// The field recorder's own panel (opened from its card in Outputs).
const firstRecorderId = () => store.state.rig.devices.find((d) => d.type === "zoom-f8")?.id;
const recorderView = new RecorderView({ store, getRuntime: (id) => engine.recorder(id), getMix: () => lastMix, toast });
const danteView = new DanteView({ store, manifest: M });

// The Stage & patch diagram (cables between jacks); its inspector reuses the patch panel's cards.
const stageView = new StageView($("#stage"), { store, manifest: M, patchView, getSkin: () => skin, onOpenDante: (tab) => danteView.open(tab), canAddGear: () => current.def.id === "free-play", getPlaces: () => listenBar.places });

const mixerView = new MixerView($("#mixer"), {
  store,
  skin,
  manifest: M,
  onPatchChannel: (i) => patchView.openPort(channelPatchPort(i)),
});

// The jack to open for a channel: the one in use, else its first (MIC) jack.
function channelPatchPort(i) {
  const rig = store.state.rig;
  const mixer = mixerOf(rig);
  const refs = DEVICE_TYPES[mixer.type].ports.filter((p) => p.role === "channel-input" && p.channel === i).map((p) => portRef(mixer.id, p.id));
  return refs.find((r) => cableAt(rig, r)) || channelPortRef(i, { plug: "xlr", mixerType: mixer.type });
}

const missionView = new MissionView($("#mission"), {
  dock: $("#mission-dock"),
  progress,
  getTerms: () => skin.terms,
  onSelect: (id) => openScenario(id, { by: mode }),
  onReset: () => selectScenario(current.def.id),
  onClear: () => {
    for (const c of [...store.state.rig.cables]) store.disconnect(c.id);
    toast("Everything unplugged. Rebuild it!", "");
  },
  getMusic: () => {
    const m = musicFor(current.def);
    const ids = rigSourceIds();
    // Who's on stage in this scenario: muted players aren't "sitting out" in the song, they're not playing at all.
    const free = current.def.id === "free-play";
    const stage = free ? { muted: [] } : stageFor(current.def, ids, manifest.SOURCES_BY_ID);
    const out = m.section ? sittingOut(m.section, ids, manifest.SOURCES_BY_ID).filter((s) => !stage.muted.includes(s.id)) : [];
    return { mode: musicMode, started: engine.started, sections: manifest.STEM_SET.sections, section: m.section, out, silent: !free && !!current.def.stage?.silent, stageNote: free ? "" : stageNote(current.def, manifest.SOURCES_BY_ID, manifest.VOICES) };
  },
  onMusicMode: (m) => {
    if (m === musicMode) return;
    musicMode = m;
    missionView.renderMusic();
    if (engine.started) loadSources();
  },
  onSeek: (t) => engine.seek(t),
  onFreeConsole: (id) => openFree(id),
  onMixer: (model) => openMixer(model),
  onOpenDrawer: (tab) => drawer.open(current.def.id, tab),
  onUndo: () => undoLast(),
  canUndo: () => undo.stack.length > 0,
});

const drawer = new ThemeDrawer($("#drawer"), {
  progress,
  onSelect: (id, by) => openScenario(id, { by }),
  onTopic: (themeId) => openScenario(nextInTheme(themeId, (id) => progress.has(id)).id),
  onFree: (skinId) => openFree(skinId),
  onHome: () => showStart(),
});

const listenBar = new ListenBar($("#listen-bar"), {
  store,
  getSkin: () => skin,
  onTransport: () => (engine.playing ? engine.stop() : engine.play()),
  getRecorder: () => (firstRecorderId() ? engine.recorder(firstRecorderId()) : null),
});

renderFlow($("#flow"), skin);

// ---------- state changes ----------

store.subscribe((state, change) => {
  pending.any = true;
  if (change.type !== "replace") countAction(change);
  if (change.type !== "replace" && change.type !== "listen") noteForUndo(change);
  if (change.type === "listen") current.session.listened.add(state.listen);
  if (change.type === "rig" || change.type === "replace" || change.type === "scene" || (change.type === "bus" && change.bus === "routing") || (change.type === "channel" && change.key === "phantom")) pending.patch = true;
  // Recorder settings show on its Outputs card (the mic pair and reverb update their own readouts);
  // a camera's MIC/LINE switch and the 442's OUTPUT LEVEL change what the camera cards say.
  if (change.type === "device" && (["zoom-f8", "camera-input", "daw-dvs"].includes(state.rig.devices.find((d) => d.id === change.id)?.type) || change.key?.startsWith("danteRx") || change.key?.startsWith("inPatch") || change.key?.startsWith("inSource") || change.key?.endsWith("Level"))) pending.patch = true;
  if (change.type === "device" && change.id === "mixer") pending.patch = true;
});

function refresh() {
  const state = store.state;
  // What Undo goes back to: the state before the next change.
  undo.snap = structuredClone(state);
  const mix = computeMix(state, M.SOURCES_BY_ID, M.STEMS);
  lastMix = mix;
  mixerView.sync(mix);
  listenBar.update(mix, { playing: engine.playing, ready, loadingText, buffering });
  // The diagram's figure follows where you're listening.
  if (pending.patch || store.state.listen !== lastListen) {
    lastListen = store.state.listen;
    if (pending.patch) patchView.render(mix);
    stageView.render(mix);
  }
  if (recorderView.isOpen) recorderView.sync();
  if (danteView.isOpen) danteView.sync();
  if (current.def.conditions.length) {
    const result = evaluateScenario(current.def, state, current.baseline, M.SOURCES_BY_ID, M.STEMS, current.session);
    const key = JSON.stringify(result.items.map((i) => [i.met, i.detail])) + result.complete;
    if (key !== lastEval) {
      const wasComplete = lastEval.endsWith("true");
      lastEval = key;
      if (result.complete) progress.add(current.def.id);
      missionView.update(result);
      updateCanvasCount();
      if (result.complete && !wasComplete) toast(`Solved: ${current.def.title}`, "ok");
    }
  }
  pending.any = false;
  pending.patch = false;
}


function evaluateNow() {
  return current.def.conditions.length ? evaluateScenario(current.def, store.state, current.baseline, M.SOURCES_BY_ID, M.STEMS, current.session) : null;
}

// ---------- undo ----------

// One step per action: a drag of one knob is one step (as in countAction).
const undo = { stack: [], snap: null, key: "", at: 0 };
function noteForUndo(change) {
  const key = `${change.type}:${change.index ?? change.bus ?? change.id ?? ""}:${change.key ?? ""}`;
  const now = performance.now();
  if (undo.snap && !(key === undo.key && now - undo.at < 600)) {
    undo.stack.push(undo.snap);
    if (undo.stack.length > 50) undo.stack.shift();
  }
  undo.key = key;
  undo.at = now;
}
function undoLast() {
  const prev = undo.stack.pop();
  if (!prev) return;
  undo.key = "";
  store.replace(prev);
  lastEval = "";
  toast("Undone", "");
}
function resetUndo() {
  undo.stack = [];
  undo.snap = structuredClone(store.state);
  undo.key = "";
}

// ---------- scenarios ----------

// Builds a scenario on the current console (the skin must already be the right one).
function selectScenario(id) {
  const available = scenariosFor(hardwareOf(skin));
  const def = scenarioFor(available.find((s) => s.id === id) || SCENARIOS_BY_ID["free-play"], hardwareOf(skin));
  const state = buildScenarioState(def, M.SOURCES_BY_ID, hardwareOf(skin));
  store.replace(state);
  resetUndo();
  current = { def, baseline: captureBaseline(def, state, M.SOURCES_BY_ID, M.STEMS), session: { listened: new Set([state.listen]) } };
  lastEval = "";
  missionView.resetHints();
  missionView.render(def, evaluateNow(), { skinId: skin.id, mode });
  const hash = def.id === "free-play" ? `#/free-play/${skin.id}` : mode === "mixer" ? `#/by-mixer/${def.id}` : `#/${def.id}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  if (def.id !== "free-play") writePref("mixer-lab-last", def.id);
  refresh();
  if (engine.started) loadSources();
}

// Opens a scenario on its own console. `by`: step through its topic ("topic")
// or its mixer's list ("mixer").
function openScenario(id, { by = "topic" } = {}) {
  const s = SCENARIO_BY_ID[id];
  if (!s) return openFree();
  mode = by === "mixer" ? "mixer" : "topic";
  writePref("mixer-lab-mode", mode);
  useConsole(skinOf(consoleOf(s)), () => selectScenario(id));
}

// By mixer: the console's first unsolved scenario (by default the console you're on).
function openMixer(model = hardwareOf(skin)) {
  if (!mixerEntry(model)) model = "generic";
  openScenario(nextOnMixer(model, (id) => progress.has(id)).id, { by: "mixer" });
}

// Free play on any console (by default the one you're on).
function openFree(skinId = skin.id) {
  if (!SKINS[skinId]) skinId = DEFAULT_SKIN;
  mode = "free";
  useConsole(skinId, () => selectScenario("free-play"));
}

// The top bar's count: the current assignment's progress.
function updateCanvasCount() {
  const p = assignmentProgress(ASSIGNMENTS_BY_ID[CURRENT_ASSIGNMENT], (id) => progress.has(id));
  const el = document.querySelector(".canvas-count");
  const text = `A${ASSIGNMENTS_BY_ID[CURRENT_ASSIGNMENT].number} ${p.done}/${p.need}`;
  if (el.textContent !== text) el.textContent = text;
}

// Every band source in the rig: plain source devices, and each track of a DAW laptop.
function rigSourceIds() {
  return [...new Set(store.state.rig.devices.flatMap((d) => (d.sourceId ? [d.sourceId] : DEVICE_TYPES[d.type]?.dante ? DEVICE_TYPES[d.type].ports.map((p) => p.sourceId) : [])))];
}

// What the band plays for a scenario: the full song (Free play only) or one
// 8-bar section, looped.
function musicFor(def) {
  const sections = manifest.STEM_SET.sections;
  if (def.id !== "free-play") return { mode: "excerpt", section: pickSection(def, sections, manifest.SOURCES_BY_ID) };
  if (musicMode === "full") return { mode: "full", section: null };
  return { mode: "excerpt", section: sections.find((s) => s.id === musicMode) || sections.find((s) => s.id === "excerpt") };
}

function loadSources() {
  const ids = rigSourceIds();
  const { mode, section } = musicFor(current.def);
  ready = false;
  pending.any = true;
  const stage = current.def.id === "free-play" ? { muted: [], voices: {} } : stageFor(current.def, ids, manifest.SOURCES_BY_ID);
  // Whoever is talking into a mic is the name on it (Musicians names).
  setStandIns(Object.fromEntries(Object.entries(stage.voices).map(([src, v]) => [src, { musician: manifest.VOICES[v].speaker, musicianShort: manifest.VOICES[v].speakerShort }])));
  pending.patch = true;
  engine.setSources(ids, { mode, section: section ? section.id : "excerpt", stage }).catch((err) => {
    loadingText = `Couldn't start audio: ${err.message}`;
    pending.any = true;
  });
}

engine.on((evt) => {
  if (evt.type === "loading") loadingText = evt.what ? `Loading ${evt.what}…` : `Loading stems ${evt.done}/${evt.total}…`;
  if (evt.type === "ready") {
    ready = true;
    showLoadErrors(evt.errors);
  }
  if (evt.type === "load-errors") showLoadErrors(evt.errors);
  if (evt.type === "buffering") {
    buffering = evt.on;
  }
  if (evt.type === "recorder") pending.patch = true;
  pending.any = true;
});

function showLoadErrors(errors) {
  const box = $("#load-errors");
  if (!errors.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.innerHTML = `<strong>Some audio didn't load.</strong> Those channels play a plain test tone instead (development fallback):
    <ul>${errors.map(([, msg]) => `<li>${msg.replace(/</g, "&lt;")}</li>`).join("")}</ul>
    <button type="button" class="chip" onclick="this.parentElement.hidden = true">Dismiss</button>`;
}

// ---------- consoles ----------

let booted = false;
// Switches the console, then `build` puts the scenario on it. A different
// mixer has a different state shape, so the state is rebuilt before the
// surface is drawn (the band keeps playing; only the mixer graph is swapped).
function useConsole(id, build) {
  if (!SKINS[id]) id = DEFAULT_SKIN;
  const changed = hardwareOf(SKINS[id]) !== hardwareOf(skin) || !booted;
  if (changed) mixerView.detach();
  skin = SKINS[id];
  booted = true;
  build();
  mixerView.setSkin(skin);
  renderFlow($("#flow"), skin);
  listenBar.render();
  missionView.render(current.def, evaluateNow(), { skinId: skin.id, mode });
  document.body.dataset.skin = id;
  for (const b of document.querySelectorAll(".topbar .mode-btn")) {
    const on = b.dataset.mode === mode;
    b.setAttribute("aria-checked", String(on));
    b.classList.toggle("active", on);
  }
  pending.any = pending.patch = true;
  lastEval = "";
}

document.querySelector(".mode-switch").addEventListener("click", (e) => {
  const b = e.target.closest(".mode-btn");
  if (!b || b.dataset.mode === mode) return;
  if (b.dataset.mode === "free") openFree();
  else if (b.dataset.mode === "mixer") openMixer();
  else openScenario(readPref("mixer-lab-last") || nextInTheme(THEMES_BY_ID.system, (id) => progress.has(id)).id);
});
document.querySelector("[data-open-drawer]").addEventListener("click", () => drawer.open(current.def.id, mode === "mixer" ? "mixer" : "topic"));

// ---------- track names: instruments or the musicians on the recording ----------

function setNames(m) {
  setNameMode(m);
  writePref("mixer-lab-names", nameMode());
  document.body.classList.toggle("names-musicians", nameMode() === "musicians");
  for (const b of document.querySelectorAll("[data-names]")) {
    const on = b.dataset.names === nameMode();
    b.setAttribute("aria-checked", String(on));
    b.classList.toggle("active", on);
  }
  missionView.renderMusic();
  if (danteView.isOpen) danteView.sync();
  pending.any = pending.patch = true;
}
document.querySelector(".names-switch").addEventListener("click", (e) => {
  const b = e.target.closest("[data-names]");
  if (b) setNames(b.dataset.names);
});
setNames(readPref("mixer-lab-names") || "parts");

// ---------- views: the console (front) or the stage and patch (back) ----------

// The scenario strip sits over one of the two views. Phones get the same two as tabs.
const main = $("#main");
function setView(view, { focus = false } = {}) {
  main.dataset.view = view;
  writePref("mixer-lab-view", view);
  for (const b of document.querySelectorAll("[data-view-btn], [data-tab-btn]")) {
    const on = (b.dataset.viewBtn || b.dataset.tabBtn) === view;
    b.setAttribute("aria-selected", String(on));
    b.classList.toggle("active", on);
  }
  if (focus) document.querySelector(`[data-view-btn="${view}"]`).focus();
}
const turnAround = () => setView(main.dataset.view === "console" ? "patch" : "console");
document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab-btn]");
  if (b) setView(b.dataset.tabBtn);
});
document.querySelector(".view-switch").addEventListener("click", (e) => {
  const b = e.target.closest("[data-view-btn]");
  if (b) setView(b.dataset.viewBtn);
});
document.querySelector("[data-turn]").addEventListener("click", turnAround);
// T turns the rig around (Tab itself stays keyboard navigation). Arrow keys
// move between the two view tabs, as in any tab list.
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
  const t = e.target;
  if (t.closest?.("input, select, textarea, [contenteditable], dialog")) return;
  if (e.key === "t" || e.key === "T") {
    e.preventDefault();
    turnAround();
  } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && t.closest?.(".view-switch")) {
    e.preventDefault();
    setView(main.dataset.view === "console" ? "patch" : "console", { focus: true });
  }
});

// ---------- start: choose what to work on ----------

const overlay = $("#start-overlay");
const startScreen = new StartScreen(overlay, {
  progress,
  onChoose: (what) => {
    startAudio();
    overlay.classList.add("dismissed");
    overlay.setAttribute("aria-hidden", "true");
    if (what === "resume") openFromHash(resumeHash);
    else if (what.startsWith("assignment:")) {
      // The next scenario in the assignment's first topic that's still short.
      const a = ASSIGNMENTS_BY_ID[what.slice(11)];
      const t = nextTopic(a, (id) => progress.has(id)) || { id: a.topics[0][0] };
      openScenario(nextInTheme(t.id, (id) => progress.has(id)).id);
    }
    else if (what === "free") openFree();
    else if (what.startsWith("theme:")) openScenario(nextInTheme(what.slice(6), (id) => progress.has(id)).id);
    else if (what.startsWith("mixer:")) openMixer(what.slice(6));
  },
});

// Audio needs a gesture: every card on the start screen is one.
function startAudio() {
  if (engine.started) return;
  engine.start(); // synchronous inside the gesture: creates/resumes the AudioContext
  loadingText = "Loading stems…";
  loadSources();
  missionView.renderMusic();
}

let resumeHash = "";
function showStart() {
  const last = readPref("mixer-lab-last");
  const target = resumeHash || (last ? `#/${last}` : "");
  resumeHash = target;
  const s = SCENARIO_BY_ID[target.replace(/^#\/(by-mixer\/)?/, "")];
  const label = target.startsWith("#/free-play") ? `Free play on the ${SKINS[target.split("/")[2]]?.name || "mixer"}` : s ? `${s.title} · ${SKINS[skinOf(consoleOf(s))].name}` : "";
  startScreen.render({ resume: label });
  overlay.classList.remove("dismissed");
  overlay.removeAttribute("aria-hidden");
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-home]")) {
    e.preventDefault();
    resumeHash = location.hash;
    showStart();
  }
});

// "#/x32-stagebox" opens that scenario on its console (by topic);
// "#/by-mixer/x32-stagebox" the same, stepping through the X32's list;
// "#/free-play/x32" Free play.
function openFromHash(hash) {
  const [id, sk] = hash.replace(/^#\/?/, "").split("/");
  if (id === "free-play") openFree(sk);
  else if (id === "by-mixer" && SCENARIO_BY_ID[sk]) openScenario(sk, { by: "mixer" });
  else if (SCENARIO_BY_ID[id]) openScenario(id);
  else openFree();
}

window.addEventListener("hashchange", () => {
  const [id, sk] = location.hash.replace(/^#\/?/, "").split("/");
  if (id === current.def.id && (id !== "free-play" || sk === skin.id) && mode === "topic") return;
  if (id === "by-mixer" && sk === current.def.id && mode === "mixer") return;
  if (id === "free-play" || id === "by-mixer" || SCENARIO_BY_ID[id]) openFromHash(location.hash);
});

// ---------- frame loop ----------

let lastPos = 0;
function frame(now) {
  if (engine.started) {
    const r = engine.readMeters();
    mixerView.updateMeters(r, now);
    listenBar.updateMeter(r.listen, now);
    stageView.setPlaying(engine.playing);
    recorderView.updateMeters(r, now);
    if (now - lastPos > 250) {
      lastPos = now;
      missionView.updatePosition(engine.position(), engine.mode);
    }
  }
  if (pending.any) refresh();
  requestAnimationFrame(frame);
}

// ---------- credits ----------

const creditsDialog = $("#credits");
creditsDialog.innerHTML = `<div class="patch-inner">
  <header class="patch-head"><h2 id="credits-title">Credits</h2>
    <button type="button" class="patch-x" data-close-credits aria-label="Close">✕</button></header>
  ${manifest.CREDITS.map(
    (c) => `<section class="credits-block"><h3>${c.title}</h3><dl>${c.lines.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>${c.note ? `<p class="credits-note">${c.note}</p>` : ""}</section>`,
  ).join("")}
</div>`;
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-credits]")) creditsDialog.showModal();
  else if (e.target.closest("[data-close-credits]") || e.target === creditsDialog) creditsDialog.close();
});

// ---------- activity (time and actions per scenario, for the Canvas report) ----------

// Active time only: a second counts when the page is visible and the student
// touched something in the last minute. A drag counts as one action, not one per pixel.
const IDLE_MS = 60000;
let lastActivity = performance.now();
let lastAction = { key: "", at: 0 };
for (const type of ["pointerdown", "keydown", "input"]) document.addEventListener(type, () => (lastActivity = performance.now()), true);

function countAction(change) {
  const key = `${change.type}:${change.index ?? change.bus ?? ""}:${change.key ?? ""}`;
  const now = performance.now();
  lastActivity = now;
  if (key === lastAction.key && now - lastAction.at < 600) {
    lastAction.at = now;
    return;
  }
  lastAction = { key, at: now };
  progress.record(current.def.id, { actions: 1 });
}

setInterval(() => {
  if (!document.hidden && performance.now() - lastActivity < IDLE_MS) progress.record(current.def.id, { sec: 1 });
}, 1000);
setInterval(() => progress.flush(), 5000);
document.addEventListener("visibilitychange", () => progress.flush());
window.addEventListener("pagehide", () => progress.flush());

// ---------- Canvas submission ----------

const bugs = new BugLog();
const submissionView = new SubmissionView($("#canvas"), {
  progress,
  bugs,
  getUrl: () => location.origin + location.pathname,
  onReportBug: () => bugView.open(),
});

// ---------- bug reports ----------

// What the student was doing, attached to their report (state as a snapshot).
const bugView = new BugView($("#bug"), {
  bugs,
  toast,
  getContext: () => ({
    scenario: current.def.id === "free-play" ? `free-play/${skin.id}` : current.def.id,
    title: current.def.id === "free-play" ? "Free play" : current.def.title,
    mixer: skin.name,
    view: main.dataset.view === "patch" ? "Stage & patch" : "Console",
    listen: store.state.listen,
    url: location.href,
    state: store.state,
  }),
  onSaved: () => submissionView.isOpen && submissionView.open(),
});
document.addEventListener("click", (e) => {
  if (e.target.closest(".bug-btn[data-report-bug]")) bugView.open();
});
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-canvas]")) submissionView.open();
});

// ---------- helpers ----------

function makeToast(el) {
  let t = 0;
  return (msg, tone = "") => {
    el.textContent = msg;
    el.className = `toast show ${tone}`;
    clearTimeout(t);
    t = setTimeout(() => (el.className = "toast"), 3200);
  };
}

function readPref(key) {
  try {
    return localStorage.getItem(storageKey(key));
  } catch (e) {
    return null;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(storageKey(key), value);
  } catch (e) {
    /* private mode etc. — preference just isn't remembered */
  }
}

// A branch preview says so on every screen, so it is never mistaken for the
// Canvas assignment.
function showPreviewBanner() {
  if (!PREVIEW) return;
  document.title = `[preview] ${document.title}`;
  document.body.classList.add("is-preview");
  const bar = document.createElement("div");
  bar.className = "preview-banner";
  bar.setAttribute("role", "note");
  const live = document.createElement("a");
  live.href = liveUrl(location.href);
  live.textContent = "Go to the assignment";
  bar.append(`Preview: ${PREVIEW} · not the Canvas assignment · `, live);
  document.body.prepend(bar);
}

// ---------- boot ----------

showPreviewBanner();

// The page behind the start screen is the linked scenario (or Free play), ready to go.
resumeHash = /^#\/[a-z]/.test(location.hash) ? location.hash : "";
openFromHash(resumeHash || `#/free-play/${DEFAULT_SKIN}`);
setView(readPref("mixer-lab-view") === "patch" ? "patch" : "console");
updateCanvasCount();
showStart();
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has("debug")) {
  // setSkin: Free play on that console; selectScenario: any scenario, on its own console.
  window.mixerLab = { store, engine, skins: SKINS, evaluate: evaluateNow, mix: () => lastMix, selectScenario: (id) => (id === "free-play" ? openFree(skin.id) : openScenario(id)), setSkin: (id) => openFree(id), openScenario, openFree };
}
