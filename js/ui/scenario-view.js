// Scenario picker, prompt, live checklist, progressive hints and completion.
// Success is decided by js/scenarios.js from state — this only displays it.

import { fillTerms } from "../scenarios.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export class ScenarioView {
  constructor(root, { scenarios, onSelect, onReset, onClear, getTerms }) {
    this.root = root;
    this.scenarios = scenarios;
    this.onSelect = onSelect;
    this.onReset = onReset;
    this.onClear = onClear;
    this.getTerms = getTerms;
    this.completed = new Set();
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "select") this.onSelect(b.dataset.id);
      else if (act === "hint") this.showHint();
      else if (act === "reset") this.onReset();
      else if (act === "clear") this.onClear();
      else if (act === "next") this.onSelect(b.dataset.id);
    });
  }

  // Full render when the scenario (or skin wording) changes.
  render(def, result) {
    this.def = def;
    this.hints = this.hints && this.hintsFor === def.id ? this.hints : 0;
    this.hintsFor = def.id;
    const t = this.getTerms();
    const ordered = [...this.scenarios].sort((a, b) => (a.number || 99) - (b.number || 99));
    const picker = ordered
      .filter((s) => s.number > 0)
      .concat(ordered.filter((s) => s.number === 0))
      .map(
        (s) => `<button type="button" class="chip scenario-chip ${s.id === def.id ? "active" : ""}" data-act="select" data-id="${s.id}" aria-pressed="${s.id === def.id}">
          ${s.number ? `<span class="chip-num">${s.number}</span>` : ""}${esc(shortTitle(s))}${this.completed.has(s.id) ? ' <span class="chip-done" aria-label="completed">✓</span>' : ""}
        </button>`,
      )
      .join("");

    const isFree = !def.conditions.length;
    this.root.innerHTML = `
      <nav class="scenario-picker" aria-label="Choose a scenario">${picker}</nav>
      <article class="scenario-card">
        <p class="kicker">${def.number ? `Scenario ${def.number}` : "Sandbox"}${def.who ? ` · ${esc(def.who)}` : ""}</p>
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
        </div>
      </article>`;
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
          <span class="check-text">${i.kind === "keep" ? "<em>Keep:</em> " : ""}${esc(i.label)}
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
      if (!this.completed.has(this.def.id)) {
        this.completed.add(this.def.id);
        const chip = this.root.querySelector(`.scenario-chip[data-id="${this.def.id}"]`);
        if (chip) chip.insertAdjacentHTML("beforeend", ' <span class="chip-done" aria-label="completed">✓</span>');
      }
    } else {
      banner.hidden = true;
    }
  }

  nextScenario() {
    const n = this.def.number;
    return this.scenarios.find((s) => s.number === n + 1) || this.scenarios.find((s) => s.number === 0);
  }
}

function shortTitle(s) {
  return { "build-rig": "Build the rig", "more-vocal": "More vocal", "monitor-quiet": "Quiet wedge", "free-play": "Free play" }[s.id] || s.title;
}
