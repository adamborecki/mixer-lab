// The scenario UI, organised by theme (js/themes.js):
//   StartScreen   the first screen: choose what to work on (a theme, the Canvas
//                 assignment, or Free play). Pressing a card also starts the audio.
//   MissionView   the strip over the rig: theme · step · console, the title, the
//                 story, the goal, the live checklist, hints, Solved → Next.
//   ThemeDrawer   every theme and its scenarios with progress, the Canvas ten, Free play.
// Success is decided by js/scenarios.js from state; this only shows it.

import { fillTerms, shortTitle } from "../scenarios.js";
import { SKINS } from "../mixer-models.js";
import { CANVAS_SCENARIOS, THEMES, consoleOf, isCanvas, skinOf, themeOf, themeScenarios } from "../themes.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const consoleName = (s) => SKINS[skinOf(consoleOf(s))]?.name || "";
const listOf = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// The consoles Free play offers, in learning order (the generic one first).
export const FREE_CONSOLES = ["analog", "mix8", "stagepas400bt", "mg102", "vlz1202", "x1204usb", "mackie1604", "ui16", "x32c", "yam01v96", "dm2000", "x32", "cl3", "sd442", "f8n"].filter((id) => SKINS[id]);

function themeProgress(t, progress) {
  const list = themeScenarios(t);
  return { done: list.filter((s) => progress.has(s.id)).length, total: list.length };
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
    const card = (t, i) => {
      const { done, total } = themeProgress(t, p);
      return `<button type="button" class="theme-card" data-choose="theme:${t.id}">
        <span class="theme-num">${i + 1}</span>
        <strong>${esc(t.title)}</strong>
        <span class="theme-q">${esc(t.question)}</span>
        <span class="theme-meter" aria-label="${done} of ${total} solved"><i style="width:${(100 * done) / total}%"></i></span>
        <small>${done ? `${done} of ${total} solved` : `${total} scenarios`}</small>
      </button>`;
    };
    this.root.innerHTML = `<div class="start-inner">
      <p class="start-overlay-kicker">Mixer Lab · MUS 248</p>
      <h1>What do you want to work on?</h1>
      <p class="start-overlay-sub">Each theme is one idea, practised on the generic analog mixer first and then on real consoles, simplest first. The scenario picks the console. Headphones recommended; on iPhone turn off Silent Mode.</p>
      <div class="start-top">
        ${resume ? `<button type="button" class="start-big start-resume" data-choose="resume"><strong>▶ Continue</strong><span>${esc(resume)}</span></button>` : ""}
        <button type="button" class="start-big start-canvas" data-choose="canvas"><strong>Canvas assignment</strong><span>Ten scenarios on the generic analog mixer · ${canvasDone} of 10 solved</span></button>
        <button type="button" class="start-big start-free" data-choose="free"><strong>Free play</strong><span>No goals: any console, the whole band, break things</span></button>
      </div>
      <h2 class="start-h">Themes</h2>
      <div class="theme-grid">${THEMES.map(card).join("")}</div>
      <p class="start-overlay-note">Loads about 4 MB of audio. <button type="button" class="linkish" data-open-credits>Music credits</button></p>
    </div>`;
  }
}

// ---------- the drawer: every theme and scenario ----------

export class ThemeDrawer {
  constructor(dialog, { progress, onSelect, onFree, onHome }) {
    this.el = dialog;
    this.progress = progress;
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog || e.target.closest("[data-close-drawer]")) return dialog.close();
      const s = e.target.closest("[data-scenario]");
      if (s) {
        dialog.close();
        onSelect(s.dataset.scenario);
      }
      if (e.target.closest("[data-free]")) {
        dialog.close();
        onFree();
      }
      if (e.target.closest("[data-home]")) {
        dialog.close();
        onHome();
      }
    });
  }

  open(currentId) {
    const p = this.progress;
    const row = (s, n) => `<li><button type="button" class="drawer-row ${s.id === currentId ? "current" : ""} ${p.has(s.id) ? "done" : ""}" data-scenario="${esc(s.id)}" ${s.id === currentId ? 'aria-current="true"' : ""}>
      <span class="dr-tick" aria-hidden="true">${p.has(s.id) ? "✓" : n}</span>
      <span class="dr-title">${esc(shortTitle(s))}${isCanvas(s) ? ' <span class="badge-canvas">Canvas</span>' : ""}</span>
      <span class="dr-console">${esc(consoleName(s))}</span>
      ${p.has(s.id) ? '<span class="visually-hidden">solved</span>' : ""}
    </button></li>`;
    const current = themeOf(currentId)?.id;
    const canvasDone = CANVAS_SCENARIOS.filter((s) => p.has(s.id)).length;
    const theme = (t, i) => {
      const { done, total } = themeProgress(t, p);
      return `<details class="drawer-theme" ${t.id === current ? "open" : ""}>
        <summary><span class="theme-num">${i + 1}</span><span class="dt-name"><strong>${esc(t.title)}</strong><small>${esc(t.question)}</small></span><span class="dt-prog">${done}/${total}</span></summary>
        <p class="dt-concept">${esc(t.concept)}</p>
        <ol class="drawer-list">${themeScenarios(t).map((s, k) => row(s, k + 1)).join("")}</ol>
      </details>`;
    };
    this.el.innerHTML = `<div class="drawer-inner">
      <header class="drawer-head"><h2 id="drawer-title">Themes</h2>
        <button type="button" class="chip" data-home>All themes</button>
        <button type="button" class="chip" data-free>Free play</button>
        <button type="button" class="patch-x" data-close-drawer aria-label="Close">✕</button></header>
      <details class="drawer-theme drawer-canvas" ${CANVAS_SCENARIOS.some((s) => s.id === currentId) ? "open" : ""}>
        <summary><span class="theme-num">✎</span><span class="dt-name"><strong>Canvas assignment</strong><small>The ten that count, on the generic analog mixer</small></span><span class="dt-prog">${canvasDone}/10</span></summary>
        <ol class="drawer-list">${CANVAS_SCENARIOS.map((s, k) => row(s, k + 1)).join("")}</ol>
        <p class="dt-concept"><button type="button" class="linkish" data-open-canvas>Open the Canvas Submission</button></p>
      </details>
      ${THEMES.map(theme).join("")}
    </div>`;
    this.el.showModal();
    this.el.querySelector(".drawer-row.current")?.scrollIntoView({ block: "center" });
  }
}

// ---------- the mission strip ----------

export class MissionView {
  constructor(root, { progress, getTerms, getMusic, onSelect, onReset, onClear, onMusicMode, onSeek, onFreeConsole, onOpenDrawer }) {
    Object.assign(this, { root, progress, getTerms, getMusic, onSelect, onReset, onClear, onMusicMode, onSeek, onFreeConsole, onOpenDrawer });
    this.hints = 0;
    this.more = false;
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "hint") this.showHint();
      else if (act === "reset") this.onReset();
      else if (act === "clear") this.onClear();
      else if (act === "next" || act === "go") this.onSelect(b.dataset.id);
      else if (act === "music") this.onMusicMode(b.dataset.mode);
      else if (act === "more") this.toggleMore();
      else if (act === "drawer") this.onOpenDrawer();
    });
    root.addEventListener("change", (e) => {
      if (e.target.matches(".free-console")) this.onFreeConsole(e.target.value);
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

  // Where this scenario sits: its theme's list (or the Canvas ten).
  sequence(def) {
    if (isCanvas(def) && this.canvasMode) return { label: "Canvas assignment", list: CANVAS_SCENARIOS };
    const t = themeOf(def.id);
    return t ? { label: t.title, list: themeScenarios(t), theme: t } : { label: "", list: [def] };
  }

  render(def, result, { canvasMode = false, skinId } = {}) {
    this.def = def;
    this.canvasMode = canvasMode;
    if (this.hintsFor !== def.id) {
      this.hints = 0;
      this.solved = null;
    }
    this.hintsFor = def.id;
    const t = this.getTerms();
    const free = !def.conditions.length;
    if (free) return this.renderFree(def, skinId);
    const seq = this.sequence(def);
    const i = seq.list.findIndex((s) => s.id === def.id);
    const prev = seq.list[i - 1];
    const next = seq.list[i + 1];
    const step = (s, dir) => (s ? `<button type="button" class="mstep" data-act="go" data-id="${esc(s.id)}" aria-label="${dir}: ${esc(shortTitle(s))}" title="${dir}: ${esc(shortTitle(s))}">${dir === "Previous" ? "‹" : "›"}</button>` : `<button type="button" class="mstep" disabled aria-label="${dir}">${dir === "Previous" ? "‹" : "›"}</button>`);
    this.root.innerHTML = `<div class="mission-inner">
      <div class="mission-head">
        <button type="button" class="mission-theme" data-act="drawer" title="All themes and scenarios">
          <span class="mt-label">${esc(seq.label)}</span><span class="mt-step">${i + 1} of ${seq.list.length}</span>
        </button>
        <div class="mission-title">
          <h1>${esc(def.title)}</h1>
          <p class="mission-on">on the <strong>${esc(consoleName(def))}</strong>${def.who ? ` · ${esc(def.who)}` : ""}${isCanvas(def) ? ' · <span class="badge-canvas">Counts for Canvas</span>' : ""}</p>
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
        <button type="button" class="chip" data-act="more" aria-expanded="${this.more}">${this.more ? "Less" : "About this theme & the music"}</button>
      </div>
      <div class="mission-more" ${this.more ? "" : "hidden"}>
        ${seq.theme ? `<p class="mission-concept"><strong>${esc(seq.theme.title)}:</strong> ${esc(seq.theme.concept)}</p>` : ""}
        <section class="music" aria-label="Band audio"></section>
      </div>
    </div>`;
    this.renderHints();
    this.renderMusic();
    if (result) this.update(result);
  }

  renderFree(def, skinId) {
    const t = this.getTerms();
    this.root.innerHTML = `<div class="mission-inner mission-free">
      <div class="mission-head">
        <button type="button" class="mission-theme" data-act="drawer" title="All themes and scenarios"><span class="mt-label">Free play</span><span class="mt-step">no goals</span></button>
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
      b.textContent = this.more ? "Less" : "About this theme & the music";
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
      ${next ? `<button type="button" class="btn btn-start" data-act="next" data-id="${esc(next.id)}">Next: ${esc(shortTitle(next))}${consoleOf(next) !== consoleOf(this.def) ? ` <small>on the ${esc(consoleName(next))}</small>` : ""} →</button>` : `<button type="button" class="btn btn-start" data-act="drawer">${esc(seq.label)} done: pick another theme →</button>`}`;
  }

  // Which part of the song is playing; Free play chooses a section or the whole song.
  renderMusic() {
    const box = this.root.querySelector(".music");
    if (!box) return;
    const { mode, sections, section, out } = this.getMusic();
    const resting = out.length ? ` Sitting out here: ${esc(listOf(out.map((s) => s.name.toLowerCase())))}.` : "";
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
