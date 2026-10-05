// Mixer Lab bootstrap: wires the semantic store, the audio engine, the
// scenario checker and the views together. No audio exists until the
// student presses Start Audio.

import * as manifest from "../audio/source-manifest.js";
import { channelPortRef } from "./connection-model.js";
import { AudioEngine } from "./audio-engine.js";
import { PREVIEW, liveUrl, storageKey } from "./deploy-context.js";
import { DEFAULT_SKIN, SKINS } from "./mixer-models.js";
import { MixerStore, computeMix } from "./mixer-state.js";
import { SCENARIOS, SCENARIOS_BY_ID, buildScenarioState, captureBaseline, evaluateScenario } from "./scenarios.js";
import { Progress, numberedScenarios } from "./progress.js";
import { renderFlow } from "./ui/flow.js";
import { ListenBar } from "./ui/listen-bar.js";
import { MixerView } from "./ui/mixer-view.js";
import { PatchView } from "./ui/patch-view.js";
import { ScenarioView } from "./ui/scenario-view.js";
import { SubmissionView } from "./ui/submission-view.js";

const M = { STEM_SET: manifest.STEM_SET, STEMS: manifest.STEMS, SOURCES_BY_ID: manifest.SOURCES_BY_ID, LOOP_ASSETS: manifest.LOOP_ASSETS };
const $ = (sel) => document.querySelector(sel);

const store = new MixerStore();
const progress = new Progress(numberedScenarios(SCENARIOS).map((s) => s.id), undefined, SCENARIOS.map((s) => s.id));
const engine = new AudioEngine(store, M);

let skin = SKINS[readPref("mixer-lab-skin")] || SKINS[DEFAULT_SKIN];
let current = { def: SCENARIOS_BY_ID["free-play"], baseline: {}, session: { listened: new Set() } };
// Free play can run the whole song instead of the 8-bar loop.
let musicMode = "excerpt";
let ready = false;
let loadingText = "Press Start Audio to begin.";
let lastEval = "";
let lastMix = null;
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
});

const mixerView = new MixerView($("#mixer"), {
  store,
  skin,
  manifest: M,
  onPatchChannel: (i) => patchView.openPort(channelPortRef(i)),
});

const scenarioView = new ScenarioView($("#scenario"), {
  scenarios: SCENARIOS,
  progress,
  getTerms: () => skin.terms,
  onSelect: (id) => selectScenario(id),
  onReset: () => selectScenario(current.def.id),
  onClear: () => {
    for (const c of [...store.state.rig.cables]) store.disconnect(c.id);
    toast("Everything unplugged. Rebuild it!", "");
  },
  getMusic: () => ({ mode: musicMode, started: engine.started }),
  onMusicMode: (mode) => {
    if (mode === musicMode) return;
    musicMode = mode;
    scenarioView.renderMusic();
    if (engine.started) loadSources();
  },
  onSeek: (t) => engine.seek(t),
});

const listenBar = new ListenBar($("#listen-bar"), {
  store,
  getSkin: () => skin,
  onTransport: () => (engine.playing ? engine.stop() : engine.play()),
});

renderFlow($("#flow"), skin);

// ---------- state changes ----------

store.subscribe((state, change) => {
  pending.any = true;
  if (change.type !== "replace") countAction(change);
  if (change.type === "listen") current.session.listened.add(state.listen);
  if (change.type === "rig" || change.type === "replace" || (change.type === "channel" && change.key === "phantom")) pending.patch = true;
});

function refresh() {
  const state = store.state;
  const mix = computeMix(state, M.SOURCES_BY_ID, M.STEMS);
  lastMix = mix;
  mixerView.sync(mix);
  if (pending.patch) patchView.render(mix);
  listenBar.update(mix, { playing: engine.playing, ready, loadingText, buffering });
  if (current.def.conditions.length) {
    const result = evaluateScenario(current.def, state, current.baseline, M.SOURCES_BY_ID, M.STEMS, current.session);
    const key = JSON.stringify(result.items.map((i) => [i.met, i.detail])) + result.complete;
    if (key !== lastEval) {
      const wasComplete = lastEval.endsWith("true");
      lastEval = key;
      if (result.complete) progress.add(current.def.id);
      scenarioView.update(result);
      const goals = result.items.filter((i) => i.kind === "goal");
      scenarioTab.dataset.progress = result.complete ? "✓" : `${goals.filter((i) => i.met).length}/${goals.length}`;
      if (result.complete && !wasComplete) toast(`Solved: ${current.def.title}`, "ok");
    }
  }
  pending.any = false;
  pending.patch = false;
}

const scenarioTab = document.querySelector('[data-tab-btn="scenario"]');

function evaluateNow() {
  return current.def.conditions.length ? evaluateScenario(current.def, store.state, current.baseline, M.SOURCES_BY_ID, M.STEMS, current.session) : null;
}

// ---------- scenarios ----------

function selectScenario(id) {
  const def = SCENARIOS_BY_ID[id] || SCENARIOS_BY_ID["free-play"];
  const state = buildScenarioState(def, M.SOURCES_BY_ID);
  store.replace(state);
  current = { def, baseline: captureBaseline(def, state, M.SOURCES_BY_ID, M.STEMS), session: { listened: new Set([state.listen]) } };
  lastEval = "";
  scenarioTab.dataset.progress = "";
  scenarioView.resetHints();
  scenarioView.render(def, evaluateNow());
  if (location.hash !== `#/${def.id}`) history.replaceState(null, "", `#/${def.id}`);
  refresh();
  if (engine.started) loadSources();
}

function loadSources() {
  const ids = store.state.rig.devices.filter((d) => d.sourceId).map((d) => d.sourceId);
  const mode = current.def.id === "free-play" ? musicMode : "excerpt";
  ready = false;
  pending.any = true;
  engine.setSources(ids, { mode }).catch((err) => {
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

// ---------- skins ----------

function setSkin(id) {
  if (!SKINS[id]) return;
  skin = SKINS[id];
  writePref("mixer-lab-skin", id);
  mixerView.setSkin(skin);
  renderFlow($("#flow"), skin);
  listenBar.render();
  scenarioView.render(current.def, evaluateNow());
  document.body.dataset.skin = id;
  for (const b of document.querySelectorAll("[data-skin]")) {
    const on = b.dataset.skin === id;
    b.setAttribute("aria-checked", String(on));
    b.classList.toggle("active", on);
  }
  pending.any = pending.patch = true;
  lastEval = "";
}

document.querySelector(".skin-switch").addEventListener("click", (e) => {
  const b = e.target.closest("[data-skin]");
  if (b) setSkin(b.dataset.skin);
});

// ---------- mobile tabs ----------

const main = $("#main");
function setTab(tab) {
  main.dataset.tab = tab;
  for (const b of document.querySelectorAll("[data-tab-btn]")) {
    const on = b.dataset.tabBtn === tab;
    b.setAttribute("aria-selected", String(on));
    b.classList.toggle("active", on);
  }
}
document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab-btn]");
  if (b) {
    setTab(b.dataset.tabBtn);
    window.scrollTo({ top: 0 });
  }
});

// ---------- start ----------

$("#start-btn").addEventListener("click", () => {
  engine.start(); // synchronous inside the gesture: creates/resumes the AudioContext
  $("#start-overlay").classList.add("dismissed");
  $("#start-overlay").setAttribute("aria-hidden", "true");
  loadingText = "Loading stems…";
  loadSources();
  scenarioView.renderMusic();
});

window.addEventListener("hashchange", () => {
  const id = location.hash.replace(/^#\/?/, "");
  if (SCENARIOS_BY_ID[id] && id !== current.def.id) selectScenario(id);
});

// ---------- frame loop ----------

let lastPos = 0;
function frame(now) {
  if (engine.started) {
    const r = engine.readMeters();
    mixerView.updateMeters(r, now);
    listenBar.updateMeter(r.listen, now);
    if (now - lastPos > 250) {
      lastPos = now;
      scenarioView.updatePosition(engine.position(), engine.mode);
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

const submissionView = new SubmissionView($("#canvas"), {
  scenarios: SCENARIOS,
  progress,
  getUrl: () => location.origin + location.pathname,
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

// The frozen copy of Assignment 1 at /legacy/ (the `legacy` branch) says what
// it is, and where the current lab is. It shares the live site's saved progress.
function showLegacyBanner() {
  if (!/\/legacy\//.test(location.pathname)) return;
  document.title = `Assignment 1 · ${document.title}`;
  document.body.classList.add("is-preview");
  const bar = document.createElement("div");
  bar.className = "preview-banner legacy-banner";
  bar.setAttribute("role", "note");
  const now = document.createElement("a");
  now.href = location.pathname.replace(/legacy\/.*$/, "");
  now.textContent = "Go to the current Mixer Lab";
  bar.append("Assignment 1: the ten scenarios, kept as it was for late submissions · ", now);
  document.body.prepend(bar);
}

// ---------- boot ----------

showPreviewBanner();
showLegacyBanner();

setSkin(skin.id);
setTab("scenario");
selectScenario(location.hash.replace(/^#\/?/, "") || "free-play");
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has("debug")) {
  window.mixerLab = { store, engine, skins: SKINS, evaluate: evaluateNow, mix: () => lastMix, selectScenario, setSkin };
}
