// "Export to Canvas": the total active time and what it went on, the bug reports waiting
// to go in, name + reflection, the generated text (js/export.js) and Copy.
// Nothing is sent anywhere; the name and reflection are never stored.
// Progress lives in this browser only, so it can be saved to a file and
// merged into another browser's (js/progress.js).
// Assignment 1 (the ten scenarios) is exported from its original version at legacy/.

import { MAX_NAME, MAX_REFLECTION, REFLECTION_PROMPT, validate } from "../submission.js";
import { buildExport, exportSummary } from "../export.js";
import { PREVIEW, legacyHref } from "../deploy-context.js";
import { backupFile, backupFileName, parseBackup } from "../progress.js";
import { contextLine } from "../bugs.js";
import { duration } from "../submission.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export class SubmissionView {
  constructor(dialog, { progress, bugs, getUrl, onReportBug }) {
    this.dialog = dialog;
    this.progress = progress;
    this.bugs = bugs;
    this.getUrl = getUrl;
    this.showErrors = false;
    dialog.innerHTML = `<div class="patch-inner canvas-inner">
      <header class="patch-head"><h2 id="canvas-title">Export to Canvas</h2>
        <button type="button" class="patch-x" data-close-canvas aria-label="Close">✕</button></header>
      <p class="canvas-note">Everything you've done in Mixer Lab goes in, on any topic or mixer, Free play too: paste it into the Canvas assignment you're handing in. Time counts only while you're actively working (you touched something in the last minute; not on the start screen or in this box); "actions" are changes to the mixer or patch.</p>
      <section class="canvas-total" aria-label="Your time so far"></section>
      <section class="canvas-backup" aria-labelledby="canvas-backup-title">
        <p class="ca-head"><strong id="canvas-backup-title">Your progress is saved in this browser only.</strong></p>
        <p class="canvas-note">Switching browser, computer or lab machine? Save a progress file here and load it there: it's added to what that browser already has, and nothing is erased.</p>
        <div class="canvas-backup-btns">
          <button type="button" class="chip" data-backup-save>Save progress file</button>
          <button type="button" class="chip" data-backup-load>Load progress file</button>
          <input type="file" accept=".json,application/json" data-backup-file hidden />
        </div>
        <p class="canvas-status canvas-backup-status" role="status" aria-live="polite"></p>
      </section>
      <p class="canvas-note">Assignment 1 (the ten scenarios) is handed in from <a href="${legacyHref()}">its original version</a>.</p>
      <section class="canvas-bugs" aria-label="Bug reports"></section>
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
      <p class="canvas-note">Your progress and bug reports survive a refresh, not clearing site data (bug reports aren't in the progress file). Your name and reflection aren't saved or sent anywhere.
        <button type="button" class="linkish" data-canvas-reset>Clear my progress</button></p>
    </div>`;
    this.$ = (s) => dialog.querySelector(s);
    dialog.addEventListener("input", () => this.renderPreview());
    this.$("[data-backup-file]").addEventListener("change", (e) => this.loadBackup(e.target));
    dialog.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-bug-remove]");
      if (e.target === dialog || e.target.closest("[data-close-canvas]")) dialog.close();
      else if (e.target.closest("[data-canvas-copy]")) this.copy();
      else if (e.target.closest("[data-report-bug]")) onReportBug();
      else if (e.target.closest("[data-backup-save]")) this.saveBackup();
      else if (e.target.closest("[data-backup-load]")) this.$("[data-backup-file]").click();
      else if (rm && confirm("Remove this bug report?")) {
        this.bugs.remove(Number(rm.dataset.bugRemove));
        this.open();
      } else if (e.target.closest("[data-canvas-reset]") && confirm("Clear your saved scenario progress in this browser? Bug reports stay.")) {
        this.progress.clear();
        this.open();
      }
    });
  }

  get isOpen() {
    return this.dialog.open;
  }

  open() {
    this.renderLists();
    this.status("");
    this.backupStatus("");
    this.renderPreview();
    if (!this.dialog.open) this.dialog.showModal();
  }

  summary() {
    return exportSummary({ isSolved: (id) => this.progress.has(id), statsFor: (id) => this.progress.statsFor(id) });
  }

  renderLists() {
    const s = this.summary();
    const bugs = this.bugs.list();
    const scenarios = s.solved + s.worked;
    this.$(".canvas-total").innerHTML = `<p class="ca-head"><strong>Active time</strong><span>${duration(s.total.sec)}</span></p>
      <p class="canvas-note">${s.total.actions} actions · ${scenarios} scenario${scenarios === 1 ? "" : "s"}${s.free.sec || s.free.actions ? " + Free play" : ""} · ${s.mixers.length} mixer${s.mixers.length === 1 ? "" : "s"}</p>`;
    this.$(".canvas-bugs").innerHTML = `<p class="ca-head"><strong>Bug reports</strong><span>${bugs.length}</span></p>
      ${bugs.length ? `<ol class="canvas-bug-list">${bugs.map((b, i) => `<li><span>${esc(b.text)}</span><small>${esc(contextLine(b))}</small><button type="button" class="linkish" data-bug-remove="${i}">Remove</button></li>`).join("")}</ol>` : ""}
      <button type="button" class="chip" data-report-bug>Report a bug</button>`;
  }

  values() {
    return { name: this.$(".canvas-name").value, reflection: this.$(".canvas-reflection").value };
  }

  build() {
    return buildExport({ ...this.values(), summary: this.summary(), bugs: this.bugs.list(), url: this.getUrl() });
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

  backupStatus(msg, tone = "") {
    const el = this.$(".canvas-backup-status");
    el.textContent = msg;
    el.dataset.tone = tone;
  }

  saveBackup() {
    const now = new Date();
    const blob = new Blob([backupFile(this.progress.snapshot(), { now, preview: PREVIEW })], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: backupFileName({ now, preview: PREVIEW }) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.backupStatus(`Saved ${a.download}. On the other browser, open Export to Canvas and choose “Load progress file”.`, "ok");
  }

  async loadBackup(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch (e) {
      return this.backupStatus("Couldn't read that file. Try choosing it again.", "bad");
    }
    const r = parseBackup(text);
    if (!r.ok) return this.backupStatus(r.reason, "bad");
    // A preview's progress is kept apart from the live site's; mixing them is the student's call.
    if (r.preview !== PREVIEW && !confirm(r.preview ? `This file was saved on a test version of Mixer Lab (${r.preview}), not the real one. Add it to your progress here anyway?` : "This file was saved on the real Mixer Lab, and this is a test version. Add it here anyway?")) return;
    const added = this.progress.merge(r.progress);
    if (added === null) return this.backupStatus("Couldn't save in this browser (private browsing or storage full?). Nothing was changed.", "bad");
    this.renderLists();
    this.renderPreview();
    this.backupStatus(`Loaded. ${added ? `${added} more scenario${added === 1 ? "" : "s"} solved here now` : "No new scenarios solved"}; for each scenario the larger time and action count is kept.`, "ok");
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
    const ok = await copyText(this.$(".canvas-preview"));
    this.status(ok ? "Copied. Paste it into the Canvas assignment." : "Couldn't copy automatically. The text is selected: press Ctrl/⌘+C, then paste into Canvas.", ok ? "ok" : "warn");
  }
}

// Copies a textarea's text; falls back to selecting it (http, old Safari, iframes).
export async function copyText(area) {
  try {
    await navigator.clipboard.writeText(area.value);
    return true;
  } catch (e) {
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
    try {
      return document.execCommand("copy");
    } catch (e2) {
      return false;
    }
  }
}
