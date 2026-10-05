// The scenario UI. Three ways in, side by side in the top bar:
//   by topic   (js/themes.js THEMES, shown as "Topics"): one idea, practised on
//              the generic mixer and then on real consoles; the scenario picks the console.
//   by mixer   (MIXERS): the desk in front of you, and its scenarios in order.
//   free play  any console, no goals.
// Views:
//   StartScreen   the first screen: Continue, the Canvas assignment, Free play,
//                 a topic (led by its question) or a mixer. Every card also starts the audio.
//   MissionView   the strip over the rig: where you are · step · console, the title,
//                 the story, the goal, the live checklist, hints, Solved → Next.
//                 When it scrolls away, a slim copy stays pinned under the top bar.
//   ThemeDrawer   Topics or Mixers, each with its scenarios and progress, and the Canvas ten.
// Success is decided by js/scenarios.js from state; this only shows it.

import { fillTerms, shortTitle } from "../scenarios.js";
import { SKINS } from "../mixer-models.js";
import { CANVAS_SCENARIOS, MIXERS, THEMES, consoleOf, isCanvas, mixerScenarios, skinOf, themeOf, themeScenarios } from "../themes.js";
import { nameMode } from "../names.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const consoleName = (s) => SKINS[skinOf(consoleOf(s))]?.name || "";
// The console a scenario id runs on (null for Free play or an unknown id).
const SCENARIO_CONSOLE = (id) => {
  const s = [...CANVAS_SCENARIOS, ...MIXERS.flatMap((m) => mixerScenarios(m.model))].find((x) => x.id === id);
  return s ? consoleOf(s) : null;
};
const listOf = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// The consoles Free play offers, in learning order (the generic one first).
export const FREE_CONSOLES = ["analog", "b207mp3", "mix8", "stagepas400bt", "mg102", "vlz1202", "x1204usb", "mackie1604", "ui16", "x32c", "yam01v96", "dm2000", "x32", "cl3", "sd442", "f8n"].filter((id) => SKINS[id]);

function themeProgress(t, progress) {
  const list = themeScenarios(t);
  return { done: list.filter((s) => progress.has(s.id)).length, total: list.length };
}

function mixerProgress(m, progress) {
  const list = mixerScenarios(m.model);
  return { done: list.filter((s) => progress.has(s.id)).length, total: list.length };
}

const mixerName = (m) => SKINS[m.skin]?.name || m.model;

// A mixer card: its name, what makes it different (to get curious about), progress.
function mixerCard(m, p, attrs) {
  const { done, total } = mixerProgress(m, p);
  return `<button type="button" class="theme-card mixer-card" ${attrs}>
    <strong>${esc(mixerName(m))}</strong>
    <span class="theme-q">${esc(m.why)}</span>
    <span class="theme-meter" aria-label="${done} of ${total} solved"><i style="width:${(100 * done) / total}%"></i></span>
    <small>${done ? `${done} of ${total} solved` : `${total} scenarios`}</small>
  </button>`;
}

// ---------- the first screen ----------

export class StartScreen {
  constructor(root, { progress, onChoose }) {
    this.root = root;
    this.progress = progress;
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-choose]");
      if (b) onChoose(b.dataset.choose);
    });
  }

  render({ resume } = {}) {
    const p = this.progress;
    const canvasDone = CANVAS_SCENARIOS.filter((s) => p.has(s.id)).length;
    // A topic leads with its question: something to wonder about, not a chapter title.
    const card = (t, i) => {
      const { done, total } = themeProgress(t, p);
      return `<button type="button" class="theme-card topic-card" data-choose="theme:${t.id}">
        <span class="theme-num">${i + 1}</span>
        <strong>${esc(t.question)}</strong>
        <span class="theme-q">${esc(t.title)}</span>
        <span class="theme-meter" aria-label="${done} of ${total} solved"><i style="width:${(100 * done) / total}%"></i></span>
        <small>${done ? `${done} of ${total} solved` : `${total} scenarios`}</small>
      </button>`;
    };
    this.root.innerHTML = `<div class="start-inner">
      <p class="start-overlay-kicker">Mixer Lab · MUS 248</p>
      <h1>What do you want to work on?</h1>
      <p class="start-overlay-sub">Pick a question you want answered, or the mixer in front of you. Headphones recommended; on iPhone turn off Silent Mode.</p>
      <div class="start-top">
        ${resume ? `<button type="button" class="start-big start-resume" data-choose="resume"><strong>▶ Continue</strong><span>${esc(resume)}</span></button>` : ""}
        <button type="button" class="start-big start-canvas" data-choose="canvas"><strong>Canvas assignment</strong><span>Ten scenarios on the generic analog mixer · ${canvasDone} of 10 solved</span></button>
        <button type="button" class="start-big start-free" data-choose="free"><strong>Free play</strong><span>No goals: any console, the whole band, break things</span></button>
      </div>
      <h2 class="start-h">By topic <small>one question, answered on mixer after mixer</small></h2>
      <div class="theme-grid">${THEMES.map(card).join("")}</div>
      <h2 class="start-h">By mixer <small>standing at one of these? Start with it</small></h2>
      <div class="theme-grid mixer-grid">${MIXERS.map((m) => mixerCard(m, p, `data-choose="mixer:${m.model}"`)).join("")}</div>
      <p class="start-overlay-note">Loads about 4 MB of audio. <button type="button" class="linkish" data-open-credits>Music credits</button></p>
    </div>`;
  }
}

// ---------- the drawer: every topic or mixer and its scenarios ----------

export class ThemeDrawer {
  constructor(dialog, { progress, onSelect, onFree, onHome }) {
    this.el = dialog;
    this.progress = progress;
    this.tab = "topic";
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog || e.target.closest("[data-close-drawer]")) return dialog.close();
      const tab = e.target.closest("[data-drawer-tab]");
      if (tab) return this.open(this.currentId, tab.dataset.drawerTab);
      const s = e.target.closest("[data-scenario]");
      if (s) {
        dialog.close();
        onSelect(s.dataset.scenario, s.dataset.by);
      }
      const free = e.target.closest("[data-free]");
      if (free) {
        dialog.close();
        onFree(free.dataset.free || undefined);
      }
      if (e.target.closest("[data-home]")) {
        dialog.close();
        onHome();
      }
    });
  }

  // `tab`: "topic" or "mixer" (by default the one last shown).
  open(currentId, tab = this.tab) {
    const p = this.progress;
    this.currentId = currentId;
    this.tab = tab;
    const by = tab === "mixer" ? "mixer" : "topic";
    const row = (s, n, { console = true } = {}) => `<li><button type="button" class="drawer-row ${s.id === currentId ? "current" : ""} ${p.has(s.id) ? "done" : ""}" data-scenario="${esc(s.id)}" data-by="${by}" ${s.id === currentId ? 'aria-current="true"' : ""}>
      <span class="dr-tick" aria-hidden="true">${p.has(s.id) ? "✓" : n}</span>
      <span class="dr-title">${esc(shortTitle(s))}${isCanvas(s) ? ' <span class="badge-canvas">Canvas</span>' : ""}</span>
      <span class="dr-console">${console ? esc(consoleName(s)) : esc(themeOf(s.id)?.title || "")}</span>
      ${p.has(s.id) ? '<span class="visually-hidden">solved</span>' : ""}
    </button></li>`;
    const current = themeOf(currentId)?.id;
    const canvasDone = CANVAS_SCENARIOS.filter((s) => p.has(s.id)).length;
    const theme = (t, i) => {
      const { done, total } = themeProgress(t, p);
      return `<details class="drawer-theme" ${t.id === current ? "open" : ""}>
        <summary><span class="theme-num">${i + 1}</span><span class="dt-name"><strong>${esc(t.question)}</strong><small>${esc(t.title)}</small></span><span class="dt-prog">${done}/${total}</span></summary>
        <p class="dt-concept">${esc(t.concept)}</p>
        <ol class="drawer-list">${themeScenarios(t).map((s, k) => row(s, k + 1)).join("")}</ol>
      </details>`;
    };
    const currentConsole = SCENARIO_CONSOLE(currentId);
    const mixer = (m) => {
      const { done, total } = mixerProgress(m, p);
      return `<details class="drawer-theme" ${m.model === currentConsole ? "open" : ""}>
        <summary><span class="dt-name"><strong>${esc(mixerName(m))}</strong><small>${esc(m.why)}</small></span><span class="dt-prog">${done}/${total}</span></summary>
        <ol class="drawer-list">${mixerScenarios(m.model).map((s, k) => row(s, k + 1, { console: false })).join("")}</ol>
        <p class="dt-concept"><button type="button" class="linkish" data-free="${esc(m.skin)}">Free play on the ${esc(mixerName(m))}</button></p>
      </details>`;
    };
    const tabBtn = (id, label) => `<button type="button" role="tab" class="mode-btn ${tab === id ? "active" : ""}" aria-selected="${tab === id}" data-drawer-tab="${id}">${label}</button>`;
    this.el.innerHTML = `<div class="drawer-inner">
      <header class="drawer-head"><h2 id="drawer-title">Scenarios</h2>
        <button type="button" class="chip" data-home>Start screen</button>
        <button type="button" class="chip" data-free>Free play</button>
        <button type="button" class="patch-x" data-close-drawer aria-label="Close">✕</button></header>
      <div class="mode-switch drawer-tabs" role="tablist" aria-label="Group the scenarios">${tabBtn("topic", "By topic")}${tabBtn("mixer", "By mixer")}</div>
      ${
        tab === "mixer"
          ? MIXERS.map(mixer).join("")
          : `<details class="drawer-theme drawer-canvas" ${CANVAS_SCENARIOS.some((s) => s.id === currentId) ? "open" : ""}>
        <summary><span class="theme-num">✎</span><span class="dt-name"><strong>Canvas assignment</strong><small>The ten that count, on the generic analog mixer</small></span><span class="dt-prog">${canvasDone}/10</span></summary>
        <ol class="drawer-list">${CANVAS_SCENARIOS.map((s, k) => row(s, k + 1)).join("")}</ol>
        <p class="dt-concept"><button type="button" class="linkish" data-open-canvas>Open the Canvas Submission</button></p>
      </details>
      ${THEMES.map(theme).join("")}`
      }
    </div>`;
    if (!this.el.open) this.el.showModal();
    this.el.querySelector(".drawer-row.current")?.scrollIntoView({ block: "center" });
  }
}

// ---------- the mission strip ----------

export class MissionView {
  // `dock`: the slim copy pinned under the top bar while the strip is scrolled away.
  constructor(root, { dock, progress, getTerms, getMusic, onSelect, onReset, onClear, onMusicMode, onSeek, onFreeConsole, onMixer, onOpenDrawer }) {
    Object.assign(this, { root, dock, progress, getTerms, getMusic, onSelect, onReset, onClear, onMusicMode, onSeek, onFreeConsole, onMixer, onOpenDrawer });
    this.hints = 0;
    this.more = false;
    this.mode = "topic";
    this.result = null;
    const onClick = (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "hint") this.showHint();
      else if (act === "dock-more") this.toggleDock();
      else if (act === "dock-top") {
        this.toggleDock(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      else if (act === "reset") this.onReset();
      else if (act === "clear") this.onClear();
      else if (act === "next" || act === "go") this.onSelect(b.dataset.id);
      else if (act === "music") this.onMusicMode(b.dataset.mode);
      else if (act === "more") this.toggleMore();
      else if (act === "drawer") this.onOpenDrawer(this.mode === "mixer" ? "mixer" : "topic");
    };
    root.addEventListener("click", onClick);
    if (dock) {
      dock.addEventListener("click", onClick);
      // The dock shows once the strip's goals have scrolled up under the top bar.
      let queued = false;
      const check = () => {
        queued = false;
        const mark = root.querySelector(".mission-goalrow, .mission-goal, .mission-head");
        const bar = dock.parentElement.getBoundingClientRect().bottom;
        this.setDocked(!!mark && mark.getBoundingClientRect().top < bar);
      };
      const later = () => {
        if (!queued) requestAnimationFrame(check);
        queued = true;
      };
      window.addEventListener("scroll", later, { passive: true });
      window.addEventListener("resize", later);
      this.recheckDock = later;
    }
    root.addEventListener("change", (e) => {
      if (e.target.matches(".free-console")) this.onFreeConsole(e.target.value);
      if (e.target.matches(".mixer-console")) this.onMixer(e.target.value);
      if (e.target.matches(".seek")) {
        this.seeking = false;
        this.onSeek(Number(e.target.value));
      }
    });
    root.addEventListener("input", (e) => {
      if (!e.target.matches(".seek")) return;
      this.seeking = true;
      this.showTime(Number(e.target.value), Number(e.target.max));
    });
  }

  // Where this scenario sits: its mixer's list (by mixer), the Canvas ten, or its topic's list.
  sequence(def) {
    if (this.mode === "mixer") return { label: consoleName(def), list: mixerScenarios(consoleOf(def)), mixer: true };
    if (isCanvas(def) && this.canvasMode) return { label: "Canvas assignment", list: CANVAS_SCENARIOS };
    const t = themeOf(def.id);
    return t ? { label: t.title, list: themeScenarios(t), theme: t } : { label: "", list: [def] };
  }

  render(def, result, { canvasMode = false, skinId, mode = "topic" } = {}) {
    this.def = def;
    this.canvasMode = canvasMode;
    this.mode = mode;
    this.result = result;
    this.skinId = skinId;
    if (this.hintsFor !== def.id) {
      this.hints = 0;
      this.solved = null;
    }
    this.hintsFor = def.id;
    const t = this.getTerms();
    const free = !def.conditions.length;
    if (free) {
      this.renderFree(def, skinId);
      return this.renderDock();
    }
    const seq = this.sequence(def);
    const i = seq.list.findIndex((s) => s.id === def.id);
    const prev = seq.list[i - 1];
    const next = seq.list[i + 1];
    const step = (s, dir) => (s ? `<button type="button" class="mstep" data-act="go" data-id="${esc(s.id)}" aria-label="${dir}: ${esc(shortTitle(s))}" title="${dir}: ${esc(shortTitle(s))}">${dir === "Previous" ? "‹" : "›"}</button>` : `<button type="button" class="mstep" disabled aria-label="${dir}">${dir === "Previous" ? "‹" : "›"}</button>`);
    // By mixer, the console is yours to choose; by topic, the scenario chooses it.
    const on = seq.mixer
      ? `<label class="mixer-pick">on the <select class="mixer-console" aria-label="Mixer">${MIXERS.map((m) => `<option value="${esc(m.model)}" ${m.model === consoleOf(def) ? "selected" : ""}>${esc(mixerName(m))}</option>`).join("")}</select></label>`
      : `on the <strong>${esc(consoleName(def))}</strong>`;
    this.root.innerHTML = `<div class="mission-inner">
      <div class="mission-head">
        <button type="button" class="mission-theme" data-act="drawer" title="${seq.mixer ? "Every scenario on this mixer" : "Every topic and scenario"}">
          <span class="mt-label">${esc(seq.mixer ? "By mixer" : seq.label)}</span><span class="mt-step">${i + 1} of ${seq.list.length}</span>
        </button>
        <div class="mission-title">
          <h1>${esc(def.title)}</h1>
          <p class="mission-on">${on}${def.who ? ` · ${esc(def.who)}` : ""}${isCanvas(def) ? ' · <span class="badge-canvas">Counts for Canvas</span>' : ""}</p>
        </div>
        <div class="mission-nav">${step(prev, "Previous")}${step(next, "Next")}</div>
      </div>
      <p class="mission-prompt">${esc(fillTerms(def.prompt, t))}</p>
      <div class="mission-goalrow">
        <p class="mission-goal"><strong>Goal:</strong> ${esc(fillTerms(def.goal, t))}</p>
        <ul class="checklist" aria-label="Progress"></ul>
      </div>
      <div class="complete-banner" hidden></div>
      <ol class="hint-list"></ol>
      <div class="mission-actions">
        ${def.hints.length ? `<button type="button" class="chip hint-btn" data-act="hint"></button>` : ""}
        <button type="button" class="chip" data-act="reset">Start over</button>
        <button type="button" class="chip" data-act="more" aria-expanded="${this.more}">${this.more ? "Less" : "About this topic & the music"}</button>
      </div>
      <div class="mission-more" ${this.more ? "" : "hidden"}>
        ${seq.theme ? `<p class="mission-concept"><strong>${esc(seq.theme.title)}:</strong> ${esc(seq.theme.concept)}</p>` : ""}
        <section class="music" aria-label="Band audio"></section>
      </div>
    </div>`;
    this.renderHints();
    this.renderMusic();
    if (result) this.update(result);
    else this.renderDock();
    this.recheckDock?.();
  }

  renderFree(def, skinId) {
    const t = this.getTerms();
    this.root.innerHTML = `<div class="mission-inner mission-free">
      <div class="mission-head">
        <button type="button" class="mission-theme" data-act="drawer" title="Every topic and scenario"><span class="mt-label">Free play</span><span class="mt-step">no goals</span></button>
        <div class="mission-title">
          <label class="free-pick"><span>Console</span>
            <select class="free-console" aria-label="Free play console">${FREE_CONSOLES.map((id) => `<option value="${id}" ${id === skinId ? "selected" : ""}>${esc(SKINS[id].name)}</option>`).join("")}</select></label>
        </div>
        <div class="mission-nav">
          <button type="button" class="chip" data-act="reset">Reset the band</button>
          <button type="button" class="chip" data-act="clear">Unplug everything</button>
        </div>
      </div>
      <p class="mission-prompt">${esc(fillTerms(def.prompt, t))}</p>
      <p class="mission-goal"><strong>Try:</strong> ${esc(fillTerms(def.goal, t))}</p>
      <section class="music" aria-label="Band audio"></section>
    </div>`;
    this.renderMusic();
  }

  toggleMore() {
    this.more = !this.more;
    const box = this.root.querySelector(".mission-more");
    const b = this.root.querySelector('[data-act="more"]');
    if (box) box.hidden = !this.more;
    if (b) {
      b.setAttribute("aria-expanded", String(this.more));
      b.textContent = this.more ? "Less" : "About this topic & the music";
    }
  }

  renderHints() {
    const def = this.def;
    const list = this.root.querySelector(".hint-list");
    const btn = this.root.querySelector(".hint-btn");
    if (!list || !btn) return;
    const t = this.getTerms();
    list.innerHTML = def.hints
      .slice(0, this.hints)
      .map((h, i) => `<li><span class="hint-num">Hint ${i + 1}</span> ${esc(fillTerms(h, t))}</li>`)
      .join("");
    btn.hidden = this.hints >= def.hints.length;
    btn.textContent = this.hints === 0 ? "Need a hint?" : `Another hint (${this.hints + 1} of ${def.hints.length})`;
    this.renderDock();
  }

  showHint() {
    this.hints = Math.min(this.def.hints.length, this.hints + 1);
    this.renderHints();
  }

  resetHints() {
    this.hints = 0;
    this.solved = null;
    if (this.def) this.renderHints();
  }

  update(result) {
    this.result = result;
    this.updateStrip(result);
    this.renderDock();
  }

  updateStrip(result) {
    const list = this.root.querySelector(".checklist");
    if (!list) return;
    const t = this.getTerms();
    list.innerHTML = result.items
      .map(
        (i) => `<li class="check ${i.met ? "met" : "unmet"} kind-${i.kind}">
          <span class="check-box" aria-hidden="true">${i.met ? "✓" : i.kind === "keep" ? "!" : ""}</span>
          <span class="check-text">${i.kind === "keep" ? "<em>Keep:</em> " : ""}${esc(fillTerms(i.label, t))}
            <span class="visually-hidden">${i.met ? "— done" : "— not yet"}</span>
            ${i.detail && !i.met ? `<small>${esc(i.detail)}</small>` : ""}
          </span>
        </li>`,
      )
      .join("");
    // Once solved the banner stays, so experimenting afterwards doesn't lose it.
    const banner = this.root.querySelector(".complete-banner");
    if (result.complete) this.solved = this.def.id;
    this.root.classList.toggle("is-solved", this.solved === this.def.id);
    if (this.solved !== this.def.id) {
      banner.hidden = true;
      return;
    }
    const seq = this.sequence(this.def);
    const i = seq.list.findIndex((s) => s.id === this.def.id);
    const next = seq.list.slice(i + 1).find((s) => !this.progress.has(s.id)) || seq.list[i + 1];
    banner.hidden = false;
    const still = result.complete ? "" : `<p class="complete-note">You've changed things since: the checklist shows what's true right now.</p>`;
    banner.innerHTML = `<div><p class="complete-title">Solved ✓</p><p>${esc(fillTerms(this.def.complete, t))}</p>${still}</div>
      ${next ? `<button type="button" class="btn btn-start" data-act="next" data-id="${esc(next.id)}">Next: ${esc(shortTitle(next))}${consoleOf(next) !== consoleOf(this.def) ? ` <small>on the ${esc(consoleName(next))}</small>` : ""} →</button>` : `<button type="button" class="btn btn-start" data-act="drawer">${esc(seq.label)} done: ${seq.mixer ? "try another mixer" : "pick another topic"} →</button>`}`;
  }

  // ---------- the pinned copy ----------

  setDocked(on) {
    if (!this.dock || on === this.docked) return;
    this.docked = on;
    this.dock.hidden = !on;
    if (!on) this.toggleDock(false);
  }

  toggleDock(open = !this.dockOpen) {
    this.dockOpen = open;
    const more = this.dock?.querySelector(".dock-more");
    if (more) more.hidden = !open;
    this.dock?.querySelector('[data-act="dock-more"]')?.setAttribute("aria-expanded", String(open));
  }

  // Title, the goals as ticks, the next thing to do, and a hint: enough to keep
  // working on the console without scrolling back up.
  renderDock() {
    const dock = this.dock;
    const def = this.def;
    if (!dock || !def) return;
    const t = this.getTerms();
    if (!def.conditions.length) {
      dock.innerHTML = `<div class="dock-inner"><span class="dock-where">Free play</span><strong class="dock-title">${esc(SKINS[this.skinId]?.name || "")}</strong><span class="dock-next">No goals: try anything.</span>
        <button type="button" class="chip dock-btn" data-act="dock-top">Back to the top ↑</button></div>`;
      return;
    }
    const seq = this.sequence(def);
    const i = seq.list.findIndex((s) => s.id === def.id);
    const items = this.result?.items || [];
    const goals = items.filter((x) => x.kind === "goal");
    const broken = items.find((x) => x.kind === "keep" && !x.met);
    const todo = broken || goals.find((x) => !x.met);
    const solved = this.solved === def.id;
    const ticks = goals.map((g) => `<i class="${g.met ? "met" : ""}" aria-hidden="true"></i>`).join("");
    const next = solved ? "Solved ✓" : todo ? `${broken ? "Keep: " : "Next: "}${fillTerms(todo.label, t)}` : "";
    const hintsLeft = this.hints < def.hints.length;
    const nextUp = seq.list.slice(i + 1).find((x) => !this.progress.has(x.id)) || seq.list[i + 1];
    const shown = def.hints.slice(0, this.hints);
    dock.innerHTML = `<div class="dock-inner ${solved ? "is-solved" : ""}">
      <span class="dock-where">${esc(seq.mixer ? "By mixer" : seq.label)} · ${i + 1}/${seq.list.length}</span>
      <strong class="dock-title">${esc(def.title)}</strong>
      <span class="dock-ticks" role="img" aria-label="${goals.filter((g) => g.met).length} of ${goals.length} goals met">${ticks}</span>
      <span class="dock-next ${broken && !solved ? "is-broken" : ""}">${esc(next)}</span>
      <span class="dock-actions">
        ${hintsLeft && !solved ? `<button type="button" class="chip dock-btn" data-act="hint">${this.hints ? "Another hint" : "Hint"}</button>` : ""}
        ${solved && nextUp ? `<button type="button" class="btn btn-start dock-btn" data-act="next" data-id="${esc(nextUp.id)}">Next: ${esc(shortTitle(nextUp))} →</button>` : ""}
        <button type="button" class="chip dock-btn" data-act="dock-more" aria-expanded="${!!this.dockOpen}">Story &amp; goals</button>
      </span>
      <div class="dock-more" ${this.dockOpen ? "" : "hidden"}>
        <p class="mission-prompt">${esc(fillTerms(def.prompt, t))}</p>
        <ul class="checklist">${items.map((x) => `<li class="check ${x.met ? "met" : "unmet"} kind-${x.kind}"><span class="check-box" aria-hidden="true">${x.met ? "✓" : x.kind === "keep" ? "!" : ""}</span><span class="check-text">${x.kind === "keep" ? "<em>Keep:</em> " : ""}${esc(fillTerms(x.label, t))}</span></li>`).join("")}</ul>
        ${shown.length ? `<ol class="hint-list">${shown.map((h, k) => `<li><span class="hint-num">Hint ${k + 1}</span> ${esc(fillTerms(h, t))}</li>`).join("")}</ol>` : ""}
        <button type="button" class="linkish" data-act="dock-top">Back to the full scenario ↑</button>
      </div>
    </div>`;
  }

  // Which part of the song is playing; Free play chooses a section or the whole song.
  renderMusic() {
    const box = this.root.querySelector(".music");
    if (!box) return;
    const { mode, sections, section, out } = this.getMusic();
    const resting = out.length ? ` Sitting out here: ${esc(listOf(out.map((s) => (nameMode() === "musicians" && s.musician ? s.musician : s.name.toLowerCase()))))}.` : "";
    if (!this.def || this.def.id !== "free-play") {
      box.classList.add("music-now");
      box.innerHTML = section ? `<p class="music-note">♪ The band loops bars ${esc(section.bars)} of the song (${clock(section.start)}): ${esc(section.label.toLowerCase())}.${resting}</p>` : "";
      this.seekEl = this.timeEl = null;
      return;
    }
    box.classList.remove("music-now");
    const opt = (m, label, sub) => `<button type="button" role="radio" class="chip music-chip ${mode === m ? "active" : ""}" aria-checked="${mode === m}" data-act="music" data-mode="${m}">${esc(label)} <small>${esc(sub)}</small></button>`;
    box.innerHTML = `
      <div class="music-modes" role="radiogroup" aria-label="Band audio"><span class="music-title">Band audio</span>
        ${sections.map((s) => opt(s.id, s.label, `bars ${s.bars}`)).join("")}${opt("full", "Full song", "3:58")}
      </div>
      <div class="music-pos" ${mode === "full" ? "" : "hidden"}>
        <input type="range" class="seek" min="0" max="238" step="0.5" value="0" aria-label="Song position" />
        <span class="music-time" aria-hidden="true">0:00 / 3:58</span>
      </div>
      <p class="music-note">${mode === "full" ? "The whole song streams about 20 seconds ahead (~18 MB in total). Drag to jump to any part." : `An 8-bar loop from ${clock(section.start)} into the song.${resting}`}</p>`;
    this.seekEl = box.querySelector(".seek");
    this.timeEl = box.querySelector(".music-time");
  }

  updatePosition(pos, mode) {
    if (!this.seekEl || mode !== "full" || this.seeking) return;
    this.seekEl.max = String(Math.round(pos.duration * 2) / 2);
    this.seekEl.value = String(pos.t);
    this.showTime(pos.t, pos.duration);
  }

  showTime(t, duration) {
    if (this.timeEl) this.timeEl.textContent = `${clock(t)} / ${clock(duration)}`;
    if (this.seekEl) this.seekEl.setAttribute("aria-valuetext", clock(t));
  }
}
