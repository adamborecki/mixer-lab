// Scenario picker, prompt, live checklist, progressive hints and completion.
// Success is decided by js/scenarios.js from state — this only displays it.

import { fillTerms, shortTitle } from "../scenarios.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export class ScenarioView {
  constructor(root, { scenarios, getScenarios, getMixerName, progress, onSelect, onReset, onClear, getTerms, getMusic, onMusicMode, onSeek }) {
    this.root = root;
    this.scenarios = scenarios;
    // The scenarios the current mixer can run (all of them on Mixer A and B).
    this.getScenarios = getScenarios || (() => scenarios);
    this.getMixerName = getMixerName || (() => "");
    this.onSelect = onSelect;
    this.onReset = onReset;
    this.onClear = onClear;
    this.getTerms = getTerms;
    this.getMusic = getMusic;
    this.onMusicMode = onMusicMode;
    this.onSeek = onSeek;
    this.progress = progress;
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "select") this.onSelect(b.dataset.id);
      else if (act === "hint") this.showHint();
      else if (act === "reset") this.onReset();
      else if (act === "clear") this.onClear();
      else if (act === "next") this.onSelect(b.dataset.id);
      else if (act === "music") this.onMusicMode(b.dataset.mode);
    });
    // Seek on release, not on every drag step; show the target time while dragging.
    root.addEventListener("input", (e) => {
      if (!e.target.matches(".seek")) return;
      this.seeking = true;
      this.showTime(Number(e.target.value), Number(e.target.max));
    });
    root.addEventListener("change", (e) => {
      if (!e.target.matches(".seek")) return;
      this.seeking = false;
      this.onSeek(Number(e.target.value));
    });
  }

  // Full render when the scenario (or skin wording) changes.
  render(def, result) {
    this.def = def;
    this.hints = this.hints && this.hintsFor === def.id ? this.hints : 0;
    this.hintsFor = def.id;
    const t = this.getTerms();
    const available = this.getScenarios();
    const ordered = [...available].sort((a, b) => (a.number || 99) - (b.number || 99));
    const picker = ordered
      .filter((s) => s.number > 0)
      .concat(ordered.filter((s) => s.number === 0))
      .map(
        (s) => `<button type="button" class="chip scenario-chip ${s.id === def.id ? "active" : ""}" data-act="select" data-id="${s.id}" aria-pressed="${s.id === def.id}">
          ${s.number ? `<span class="chip-num">${s.number}</span>` : ""}${esc(shortTitle(s))}${this.progress.has(s.id) ? ' <span class="chip-done" aria-label="completed">✓</span>' : ""}
        </button>`,
      )
      .join("")
      .concat('<button type="button" class="chip scenario-chip canvas-chip" data-open-canvas>Canvas Submission</button>');

    const isFree = !def.conditions.length;
    const onlyFree = available.every((s) => s.number === 0);
    const practice = available.some((s) => s.board);
    this.root.innerHTML = `
      <nav class="scenario-picker" aria-label="Choose a scenario">${picker}</nav>
      ${onlyFree ? `<p class="scenario-note">The numbered scenarios run on Mixer A and Mixer B. Scenarios for the ${esc(this.getMixerName())} are still being written, so it opens in Free play.</p>` : ""}
      ${practice ? `<p class="scenario-note">Practice scenarios for the ${esc(this.getMixerName())}, easiest first. They're extra: the Canvas Submission counts the ten scenarios on Mixer A and Mixer B.</p>` : ""}
      <article class="scenario-card">
        <p class="kicker">${def.number ? `${def.board ? `${esc(this.getMixerName())} · ` : ""}Scenario ${def.number}` : "Sandbox"}${def.who ? ` · ${esc(def.who)}` : ""}</p>
        <h2>${esc(def.title)}</h2>
        <p class="scenario-prompt">${esc(fillTerms(def.prompt, t))}</p>
        <p class="scenario-goal"><strong>${isFree ? "Try" : "Goal"}:</strong> ${esc(fillTerms(def.goal, t))}</p>
        ${isFree ? "" : `<ul class="checklist" aria-label="Progress"></ul>`}
        <div class="complete-banner" hidden></div>
        ${
          def.hints.length
            ? `<div class="hints"><ol class="hint-list"></ol><button type="button" class="chip hint-btn" data-act="hint"></button></div>`
            : ""
        }
        <div class="scenario-actions">
          <button type="button" class="chip" data-act="reset">${isFree ? "Reset the band" : "Start over"}</button>
          ${isFree ? `<button type="button" class="chip" data-act="clear">Unplug everything</button>` : ""}
          <button type="button" class="linkish credits-link" data-open-credits>Credits</button>
        </div>
        ${isFree ? `<section class="music" aria-label="Band audio"></section>` : ""}
      </article>`;
    this.renderMusic();
    this.renderHints();
    if (result) this.update(result);
  }

  renderHints() {
    const def = this.def;
    if (!def.hints.length) return;
    const t = this.getTerms();
    const list = this.root.querySelector(".hint-list");
    list.innerHTML = def.hints
      .slice(0, this.hints)
      .map((h, i) => `<li><span class="hint-num">Hint ${i + 1}</span> ${esc(fillTerms(h, t))}</li>`)
      .join("");
    const btn = this.root.querySelector(".hint-btn");
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

  // Cheap update on every state change.
  update(result) {
    const list = this.root.querySelector(".checklist");
    if (!list) return;
    list.innerHTML = result.items
      .map(
        (i) => `<li class="check ${i.met ? "met" : "unmet"} kind-${i.kind}">
          <span class="check-box" aria-hidden="true">${i.met ? "✓" : i.kind === "keep" ? "!" : ""}</span>
          <span class="check-text">${i.kind === "keep" ? "<em>Keep:</em> " : ""}${esc(fillTerms(i.label, this.getTerms()))}
            <span class="visually-hidden">${i.met ? "— done" : "— not yet"}</span>
            ${i.detail && !i.met ? `<small>${esc(i.detail)}</small>` : ""}
          </span>
        </li>`,
      )
      .join("");
    // Once solved, the banner stays (the checklist keeps updating live), so a
    // student who keeps experimenting doesn't lose the completion message.
    const banner = this.root.querySelector(".complete-banner");
    if (result.complete) this.solved = this.def.id;
    if (this.solved === this.def.id) {
      const t = this.getTerms();
      const next = this.nextScenario();
      banner.hidden = false;
      const still = result.complete ? "" : `<p class="complete-note">You've changed things since — the checklist shows what's true right now.</p>`;
      banner.innerHTML = `<p class="complete-title">Solved ✓</p><p>${esc(fillTerms(this.def.complete, t))}</p>${still}
        ${next ? `<button type="button" class="btn btn-start" data-act="next" data-id="${next.id}">Next: ${esc(shortTitle(next))} →</button>` : ""}`;
      if (result.complete) {
        const chip = this.root.querySelector(`.scenario-chip[data-id="${this.def.id}"]`);
        if (chip && !chip.querySelector(".chip-done")) chip.insertAdjacentHTML("beforeend", ' <span class="chip-done" aria-label="completed">✓</span>');
      }
    } else {
      banner.hidden = true;
    }
  }

  // Free play only: choose the 8-bar loop or the whole song, and scrub the song.
  renderMusic() {
    const box = this.root.querySelector(".music");
    if (!box) return;
    const { mode } = this.getMusic();
    const opt = (m, label, sub) =>
      `<button type="button" role="radio" class="chip music-chip ${mode === m ? "active" : ""}" aria-checked="${mode === m}" data-act="music" data-mode="${m}">${label} <small>${sub}</small></button>`;
    box.innerHTML = `
      <p class="music-title">Band audio</p>
      <div class="music-modes" role="radiogroup" aria-label="Band audio">
        ${opt("excerpt", "8-bar loop", "28 s")}${opt("full", "Full song", "3:58")}
      </div>
      <div class="music-pos" ${mode === "full" ? "" : "hidden"}>
        <input type="range" class="seek" min="0" max="238" step="0.5" value="0" aria-label="Song position" />
        <span class="music-time" aria-hidden="true">0:00 / 3:58</span>
      </div>
      <p class="music-note">${
        mode === "full"
          ? "The whole song streams about 20 seconds ahead (~18 MB in total). Drag to jump to any part."
          : "The scenarios use this loop: 8 bars where the whole band, trumpets included, is playing."
      }</p>`;
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

  // The next one on this mixer's list (Free play after the last).
  nextScenario() {
    const n = this.def.number;
    const list = this.getScenarios();
    return list.find((s) => s.number === n + 1) || list.find((s) => s.number === 0);
  }
}

const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
