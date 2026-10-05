// "Report a bug": the student says what's weird; the app adds where they were
// (scenario, mixer, view, listening spot, browser) and, if they agree, a
// compressed snapshot of the mixer and rig. Saved for the Canvas export; a
// copyable report and a prefilled GitHub issue are smaller extras.

import { MAX_TEXT, contextLine, issueUrl, reportText } from "../bugs.js";
import { copyText } from "./submission-view.js";

export class BugView {
  // `getContext()`: { scenario, title, mixer, view, listen, url, state }
  constructor(dialog, { bugs, getContext, toast, onSaved }) {
    Object.assign(this, { dialog, bugs, getContext, toast, onSaved });
    dialog.innerHTML = `<div class="patch-inner canvas-inner bug-inner">
      <header class="patch-head"><h2 id="bug-title">Report a bug</h2>
        <button type="button" class="patch-x" data-close-bug aria-label="Close">✕</button></header>
      <p class="canvas-note">Something weird, wrong or confusing? Say what you did and what happened. It's saved with what you were working on and goes into your Canvas export.</p>
      <p class="bug-where"></p>
      <label class="canvas-field">What happened?
        <textarea class="bug-text" rows="4" maxlength="${MAX_TEXT}" placeholder="I turned up AUX 1 on the vocal, but the wedge stayed silent…"></textarea></label>
      <label class="bug-snap"><input type="checkbox" class="bug-snapshot" checked /> Include a snapshot of the mixer and cables (helps fix it)</label>
      <button type="button" class="btn btn-start" data-bug-save>Save for my Canvas export</button>
      <p class="canvas-status" role="status" aria-live="polite"></p>
      <p class="bug-extras">Also: <button type="button" class="linkish" data-bug-copy>Copy the report</button> · <button type="button" class="linkish" data-bug-github>Open a GitHub issue</button> <small>(needs a GitHub account; the issue is public)</small></p>
      <textarea class="bug-copy-area" aria-hidden="true" tabindex="-1" readonly></textarea>
    </div>`;
    this.$ = (s) => dialog.querySelector(s);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog || e.target.closest("[data-close-bug]")) dialog.close();
      else if (e.target.closest("[data-bug-save]")) this.save();
      else if (e.target.closest("[data-bug-copy]")) this.copy();
      else if (e.target.closest("[data-bug-github]")) this.github();
    });
  }

  open() {
    this.ctx = this.getContext();
    this.$(".bug-where").textContent = `Where you are: ${contextLine({ ...this.ctx, at: "" }) || "the start screen"}`;
    this.$(".bug-text").value = "";
    this.status("");
    if (!this.dialog.open) this.dialog.showModal();
    this.$(".bug-text").focus();
  }

  async report() {
    const ctx = this.ctx || this.getContext();
    const { state, ...where } = ctx;
    const snapshot = this.$(".bug-snapshot").checked && state ? await compress(state) : "";
    return { ...where, text: this.$(".bug-text").value, at: new Date().toISOString(), browser: browserName(), snapshot };
  }

  async save() {
    if (!this.$(".bug-text").value.trim()) return this.status("Say what happened first.", "bad");
    this.bugs.add(await this.report());
    this.dialog.close();
    this.toast("Bug report saved. It'll be in your Canvas export.", "ok");
    this.onSaved?.();
  }

  async copy() {
    if (!this.$(".bug-text").value.trim()) return this.status("Say what happened first.", "bad");
    const area = this.$(".bug-copy-area");
    area.value = reportText(await this.report());
    this.status((await copyText(area)) ? "Report copied." : "Couldn't copy automatically.", "ok");
  }

  async github() {
    if (!this.$(".bug-text").value.trim()) return this.status("Say what happened first.", "bad");
    window.open(issueUrl(await this.report()), "_blank", "noopener");
  }

  status(msg, tone = "") {
    const el = this.$(".canvas-status");
    el.textContent = msg;
    el.dataset.tone = tone;
  }
}

// deflate + base64 of the state's JSON (tools/decode-snapshot.mjs reverses it).
async function compress(value) {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch (e) {
    return ""; // no CompressionStream (old browser): the report goes without a snapshot
  }
}

function browserName() {
  const ua = navigator.userAgent;
  const m = /(Edg|OPR|Firefox|CriOS|Chrome|Version)\/(\d+)/.exec(ua);
  const name = m ? { Edg: "Edge", OPR: "Opera", CriOS: "Chrome iOS", Version: "Safari" }[m[1]] || m[1] : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "macOS" : /Win/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return `${name} ${m ? m[2] : ""}${os ? ` on ${os}` : ""}`.trim();
}
