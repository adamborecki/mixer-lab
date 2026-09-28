// Mixer Lab bootstrap: wires the semantic store, the audio engine, the
// scenario checker and the views together. No audio exists until the
// student presses Start Audio.

import * as manifest from "../audio/source-manifest.js";
import { AudioEngine } from "./audio-engine.js";
import { DEFAULT_SKIN, SKINS } from "./mixer-models.js";
import { MixerStore, computeMix } from "./mixer-state.js";
import { SCENARIOS, SCENARIOS_BY_ID, buildScenarioState, captureBaseline, evaluateScenario } from "./scenarios.js";
import { renderFlow } from "./ui/flow.js";
import { ListenBar } from "./ui/listen-bar.js";
import { MixerView } from "./ui/mixer-view.js";
import { PatchView } from "./ui/patch-view.js";
import { ScenarioView } from "./ui/scenario-view.js";

const M = { STEM_SET: manifest.STEM_SET, STEMS: manifest.STEMS, SOURCES_BY_ID: manifest.SOURCES_BY_ID };
const $ = (sel) => document.querySelector(sel);

const store = new MixerStore();
const engine = new AudioEngine(store, M);

let skin = SKINS[readPref("mixer-lab-skin")] || SKINS[DEFAULT_SKIN];
let current = { def: SCENARIOS_BY_ID["free-play"], baseline: {} };
let ready = false;
let loadingText = "Press Start Audio to begin.";
let lastEval = "";
let lastMix = null;
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
  onPatchChannel: (i) => patchView.openPort(`mixer/ch${i + 1}`),
});

const scenarioView = new ScenarioView($("#scenario"), {
  scenarios: SCENARIOS,
  getTerms: () => skin.terms,
  onSelect: (id) => selectScenario(id),
  onReset: () => selectScenario(current.def.id),
  onClear: () => {
    for (const c of [...store.state.rig.cables]) store.disconnect(c.id);
    toast("Everything unplugged. Rebuild it!", "");
  },
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
  if (change.type === "rig" || change.type === "replace" || (change.type === "channel" && change.key === "phantom")) pending.patch = true;
});

function refresh() {
  const state = store.state;
  const mix = computeMix(state, M.SOURCES_BY_ID, M.STEMS);
  lastMix = mix;
  mixerView.sync(mix);
  if (pending.patch) patchView.render(mix);
  listenBar.update(mix, { playing: engine.playing, ready, loadingText });
  if (current.def.conditions.length) {
    const result = evaluateScenario(current.def, state, current.baseline, M.SOURCES_BY_ID, M.STEMS);
    const key = JSON.stringify(result.items.map((i) => [i.met, i.detail])) + result.complete;
    if (key !== lastEval) {
      const wasComplete = lastEval.endsWith("true");
      lastEval = key;
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
  return current.def.conditions.length ? evaluateScenario(current.def, store.state, current.baseline, M.SOURCES_BY_ID, M.STEMS) : null;
}

// ---------- scenarios ----------

function selectScenario(id) {
  const def = SCENARIOS_BY_ID[id] || SCENARIOS_BY_ID["free-play"];
  const state = buildScenarioState(def, M.SOURCES_BY_ID);
  store.replace(state);
  current = { def, baseline: captureBaseline(def, state, M.SOURCES_BY_ID, M.STEMS) };
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
  ready = false;
  pending.any = true;
  engine.setSources(ids).catch((err) => {
    loadingText = `Couldn't start audio: ${err.message}`;
    pending.any = true;
  });
}

engine.on((evt) => {
  if (evt.type === "loading") loadingText = `Loading stems ${evt.done}/${evt.total}…`;
  if (evt.type === "ready") {
    ready = true;
    showLoadErrors(evt.errors);
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
});

window.addEventListener("hashchange", () => {
  const id = location.hash.replace(/^#\/?/, "");
  if (SCENARIOS_BY_ID[id] && id !== current.def.id) selectScenario(id);
});

// ---------- frame loop ----------

function frame(now) {
  if (engine.started) {
    const r = engine.readMeters();
    mixerView.updateMeters(r, now);
    listenBar.updateMeter(r.listen, now);
  }
  if (pending.any) refresh();
  requestAnimationFrame(frame);
}

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
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    /* private mode etc. — preference just isn't remembered */
  }
}

// ---------- boot ----------

setSkin(skin.id);
setTab("scenario");
selectScenario(location.hash.replace(/^#\/?/, "") || "free-play");
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has("debug")) {
  window.mixerLab = { store, engine, skins: SKINS, evaluate: evaluateNow, mix: () => lastMix, selectScenario, setSkin };
}
