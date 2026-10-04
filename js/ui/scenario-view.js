// Scenario picker, prompt, live checklist, progressive hints and completion.
// Success is decided by js/scenarios.js from state — this only displays it.

import { MIXER_ORDER, fillTerms, shortTitle } from "../scenarios.js";
import { SKINS } from "../mixer-models.js";

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
      else if (act === "step") {
        const list = this.ordered();
        const next = list[list.findIndex((s) => s.id === this.def.id) + Number(b.dataset.dir)];
        if (next) this.onSelect(next.id);
      }
    });
    root.addEventListener("change", (e) => {
      if (e.target.matches(".scn-select")) this.onSelect(e.target.value);
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
    const ordered = this.ordered();
    const option = (s) => `<option value="${esc(s.id)}" ${s.id === def.id ? "selected" : ""}>${esc(this.optionText(s))}</option>`;
    const numbered = ordered.filter((s) => s.number > 0);
    const picker = `${numbered.length ? `<optgroup label="${esc(this.getMixerName())} · ${numbered.length} scenarios">${numbered.map(option).join("")}</optgroup>` : ""}
      ${ordered.filter((s) => s.number === 0).map(option).join("")}`;
    const i = ordered.findIndex((s) => s.id === def.id);

    const isFree = !def.conditions.length;
    const onlyFree = available.every((s) => s.number === 0);
    const practice = available.some((s) => s.board);
    this.root.innerHTML = `
      <button type="button" class="brief-rail" data-brief-toggle aria-label="Show the scenario brief">
        <span class="rail-arrow" aria-hidden="true">»</span>
        <span class="rail-num">${def.number ? esc(def.number) : "Free"}</span>
        <span class="rail-progress" aria-hidden="true"></span>
        <span class="rail-label">Scenario</span>
      </button>
      <div class="brief">
        <div class="brief-head">
          <div class="scn-nav">
            <button type="button" class="scn-step" data-act="step" data-dir="-1" aria-label="Previous scenario" ${i <= 0 ? "disabled" : ""}>‹</button>
            <label class="scn-pick"><span class="visually-hidden">Choose a scenario</span><select class="scn-select">${picker}</select></label>
            <button type="button" class="scn-step" data-act="step" data-dir="1" aria-label="Next scenario" ${i >= ordered.length - 1 ? "disabled" : ""}>›</button>
          </div>
          <button type="button" class="brief-fold" data-brief-toggle aria-label="Fold the brief away" title="Fold the brief away">«</button>
        </div>
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
          </div>
          <section class="music" aria-label="Band audio"></section>
        </article>
        <footer class="brief-foot">
          ${onlyFree ? `<p class="scenario-note">The numbered scenarios run on Mixer A and Mixer B. Scenarios for the ${esc(this.getMixerName())} are still being written, so it opens in Free play.</p>` : ""}
          ${practice ? `<p class="scenario-note">${this.orderNote(available.find((s) => s.board).board)} Practice only: the Canvas Submission counts the ten scenarios on Mixer A and Mixer B.</p>` : ""}
          <p class="brief-links"><button type="button" class="linkish" data-open-canvas>Canvas Submission</button> · <button type="button" class="linkish" data-open-credits>Credits</button></p>
        </footer>
      </div>`;
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
    const goals = result.items.filter((i) => i.kind === "goal");
    const rail = this.root.querySelector(".rail-progress");
    if (rail) {
      rail.textContent = result.complete ? "✓" : `${goals.filter((i) => i.met).length}/${goals.length}`;
      rail.classList.toggle("done", result.complete);
    }
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
        const opt = [...this.root.querySelectorAll(".scn-select option")].find((o) => o.value === this.def.id);
        if (opt) opt.textContent = this.optionText(this.def);
      }
    } else {
      banner.hidden = true;
    }
  }

  // Which part of the song is playing. Free play: choose an 8-bar section or
  // the whole song, and scrub the song. A scenario: say which section it
  // loops and who sits out, so a silent channel isn't mistaken for a fault.
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
    const opt = (m, label, sub) =>
      `<button type="button" role="radio" class="chip music-chip ${mode === m ? "active" : ""}" aria-checked="${mode === m}" data-act="music" data-mode="${m}">${esc(label)} <small>${esc(sub)}</small></button>`;
    box.innerHTML = `
      <p class="music-title">Band audio</p>
      <div class="music-modes" role="radiogroup" aria-label="Band audio">
        ${sections.map((s) => opt(s.id, s.label, `bars ${s.bars}`)).join("")}${opt("full", "Full song", "3:58")}
      </div>
      <div class="music-pos" ${mode === "full" ? "" : "hidden"}>
        <input type="range" class="seek" min="0" max="238" step="0.5" value="0" aria-label="Song position" />
        <span class="music-time" aria-hidden="true">0:00 / 3:58</span>
      </div>
      <p class="music-note">${
        mode === "full"
          ? "The whole song streams about 20 seconds ahead (~18 MB in total). Drag to jump to any part."
          : `An 8-bar loop from ${clock(section.start)} into the song.${resting} Each scenario loops the part of the song that suits it.`
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

  // Where this mixer sits in the recommended order, and which one comes next.
  orderNote(model) {
    const i = MIXER_ORDER.findIndex((m) => m.model === model);
    if (i < 0) return "";
    const next = MIXER_ORDER[i + 1];
    const n = this.getScenarios().filter((s) => s.number > 0).length;
    return `Mixer ${i + 1} of ${MIXER_ORDER.length} in the recommended order: ${esc(MIXER_ORDER[i].why)} ${n} scenarios, easiest first.${next ? ` Next mixer: ${esc(SKINS[next.skin].name)}.` : ""}`;
  }

  // Numbered scenarios in order, then Free play.
  ordered() {
    const list = [...this.getScenarios()].sort((a, b) => (a.number || 99) - (b.number || 99));
    return list.filter((s) => s.number > 0).concat(list.filter((s) => s.number === 0));
  }

  optionText(s) {
    return `${s.number ? `${s.number} · ` : ""}${shortTitle(s)}${this.progress.has(s.id) ? " ✓" : ""}`;
  }

  // The next one on this mixer's list (Free play after the last).
  nextScenario() {
    const n = this.def.number;
    const list = this.getScenarios();
    return list.find((s) => s.number === n + 1) || list.find((s) => s.number === 0);
  }
}

const listOf = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
