// Canvas Submission dialog: progress list, name + reflection, generated text,
// and a Copy button. Report text comes from js/submission.js; nothing is sent
// anywhere and the name and reflection are never stored.

import { MAX_NAME, MAX_REFLECTION, REFLECTION_PROMPT, buildSubmission, duration, summarize, validate } from "../submission.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export class SubmissionView {
  constructor(dialog, { scenarios, progress, getUrl }) {
    this.dialog = dialog;
    this.scenarios = scenarios;
    this.progress = progress;
    this.getUrl = getUrl;
    this.showErrors = false;
    dialog.innerHTML = `<div class="patch-inner canvas-inner">
      <header class="patch-head"><h2 id="canvas-title">Canvas Submission</h2>
        <button type="button" class="patch-x" data-close-canvas aria-label="Close">✕</button></header>
      <p class="canvas-count" aria-live="polite"></p>
      <p class="canvas-note">Time counts only while this page is open and you're actively working. "Actions" are changes you make to the mixer or patch.</p>
      <ul class="canvas-list"></ul>
      <p class="canvas-note">Partial submissions are fine: hand in what you've solved so far. Your progress is saved in this browser only, so it survives a refresh but not clearing site data or switching browsers or devices.
        <button type="button" class="linkish" data-canvas-reset>Clear my progress</button></p>
      <label class="canvas-field">Your name
        <input type="text" class="canvas-name" maxlength="${MAX_NAME}" autocomplete="name" required />
        <span class="canvas-error" data-err="name" role="alert"></span></label>
      <label class="canvas-field">${esc(REFLECTION_PROMPT)}
        <textarea class="canvas-reflection" rows="3" maxlength="${MAX_REFLECTION}" required></textarea>
        <span class="canvas-error" data-err="reflection" role="alert"></span></label>
      <label class="canvas-field">What will be pasted into Canvas
        <textarea class="canvas-preview" rows="12" readonly spellcheck="false"></textarea></label>
      <button type="button" class="btn btn-start canvas-copy" data-canvas-copy>Copy for Canvas</button>
      <p class="canvas-status" role="status" aria-live="polite"></p>
      <p class="canvas-note">Your name and reflection are not saved or sent anywhere; they stay in this dialog until you close the page.</p>
    </div>`;
    this.$ = (s) => dialog.querySelector(s);
    dialog.addEventListener("input", () => this.renderPreview());
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog || e.target.closest("[data-close-canvas]")) dialog.close();
      else if (e.target.closest("[data-canvas-copy]")) this.copy();
      else if (e.target.closest("[data-canvas-reset]") && confirm("Clear your saved scenario progress in this browser?")) {
        this.progress.clear();
        this.open();
      }
    });
  }

  open() {
    this.renderList();
    this.status("");
    this.renderPreview();
    if (!this.dialog.open) this.dialog.showModal();
  }

  summary() {
    return summarize(this.scenarios, (id) => this.progress.has(id), (id) => this.progress.statsFor(id));
  }

  renderList() {
    const s = this.summary();
    this.$(".canvas-count").textContent = `Completed: ${s.done} / ${s.total}`;
    this.$(".canvas-list").innerHTML = s.rows
      .map((r) => `<li class="${r.done ? "done" : ""}"><span class="canvas-mark" aria-hidden="true">${r.done ? "✓" : ""}</span>${r.number}. ${esc(r.title)}<span class="visually-hidden">${r.done ? " — solved" : " — not solved yet"}</span><small class="canvas-stat">${duration(r.sec)} · ${r.actions} actions</small></li>`)
      .join("");
  }

  values() {
    return { name: this.$(".canvas-name").value, reflection: this.$(".canvas-reflection").value };
  }

  build() {
    return buildSubmission({ ...this.values(), summary: this.summary(), url: this.getUrl() });
  }

  renderPreview() {
    const errors = this.showErrors ? validate(this.values()) : {};
    for (const el of this.dialog.querySelectorAll("[data-err]")) el.textContent = errors[el.dataset.err] || "";
    this.$(".canvas-name").setAttribute("aria-invalid", String(!!errors.name));
    this.$(".canvas-reflection").setAttribute("aria-invalid", String(!!errors.reflection));
    this.$(".canvas-preview").value = this.build();
  }

  status(msg, tone = "") {
    const el = this.$(".canvas-status");
    el.textContent = msg;
    el.dataset.tone = tone;
  }

  async copy() {
    this.showErrors = true;
    const errors = validate(this.values());
    this.renderPreview();
    if (errors.name || errors.reflection) {
      this.status("Fill in both fields first.", "bad");
      this.$(errors.name ? ".canvas-name" : ".canvas-reflection").focus();
      return;
    }
    const preview = this.$(".canvas-preview");
    const text = preview.value;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (e) {
      // Clipboard API missing or blocked (http, old Safari, iframe): fall back to a selection copy.
      preview.focus();
      preview.select();
      preview.setSelectionRange(0, text.length);
      try {
        ok = document.execCommand("copy");
      } catch (e2) {
        ok = false;
      }
    }
    if (ok) this.status("Copied. Paste it into the Canvas assignment.", "ok");
    else {
      preview.focus();
      preview.select();
      this.status("Couldn't copy automatically. The text is selected: press Ctrl/⌘+C, then paste into Canvas.", "warn");
    }
  }
}
