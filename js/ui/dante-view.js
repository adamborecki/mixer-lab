// The laptop's two windows for a virtual soundcheck (js/dante.js):
//   DAW               each track's output: a Dante Virtual Soundcard channel
//   DANTE CONTROLLER  the routing grid: transmitters across (the laptop's DVS
//                     channels), receivers down (the console's Dante RX
//                     channels); a dot subscribes a receiver to a transmitter.
// Settings go through MixerStore.setDevice, so they behave like any other patch.

import { DANTE, DAW_TRACKS, dvsChannelNames } from "../dante.js";
import { sourceName, sourceShort } from "../names.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const RX_PAGE = 16;

export class DanteView {
  constructor({ store, manifest }) {
    this.store = store;
    this.manifest = manifest;
    this.tab = "daw";
    this.rxPage = 0;
    this.el = document.createElement("dialog");
    this.el.className = "patch-dialog dante-dialog";
    this.el.setAttribute("aria-labelledby", "dante-title");
    document.body.appendChild(this.el);
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) return this.el.close();
      const b = e.target.closest("[data-dante]");
      if (!b) return;
      const act = b.dataset.dante;
      if (act === "close") this.el.close();
      else if (act === "tab") {
        this.tab = b.dataset.tab;
        this.render();
      } else if (act === "page") {
        this.rxPage = Number(b.dataset.page);
        this.render();
      } else if (act === "sub") {
        const m = Number(b.dataset.rx);
        const k = Number(b.dataset.tx);
        // A receive channel takes one transmit channel: clicking its dot again clears it.
        this.store.setDevice("mixer", `danteRx.${m}`, this.mixer.danteRx[m] === k ? 0 : k);
      }
    });
    this.el.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-daw-out]");
      if (sel) this.store.setDevice(this.daw.id, `outs.${sel.dataset.dawOut}`, Number(sel.value));
    });
  }

  get daw() {
    return this.store.state.rig.devices.find((d) => d.type === "daw-dvs") || null;
  }

  get mixer() {
    return this.store.state.rig.devices.find((d) => d.id === "mixer");
  }

  get isOpen() {
    return this.el.open;
  }

  open(tab = "daw") {
    this.tab = tab;
    this.render();
    if (!this.el.open) this.el.showModal();
  }

  sync() {
    if (this.el.open) this.render();
  }

  render() {
    const daw = this.daw;
    const mixer = this.mixer;
    if (!daw || !mixer?.danteRx) {
      this.el.innerHTML = `<div class="dialog-body"><p>No Dante devices in this rig.</p><button type="button" class="btn" data-dante="close">Close</button></div>`;
      return;
    }
    const tab = (id, label) => `<button type="button" role="tab" class="chip ${this.tab === id ? "active" : ""}" aria-selected="${this.tab === id}" data-dante="tab" data-tab="${id}">${label}</button>`;
    this.el.innerHTML = `
      <div class="dialog-body dante-body">
        <div class="dante-head">
          <h2 id="dante-title">Laptop · ${this.tab === "daw" ? "DAW" : "Dante Controller"}</h2>
          <button type="button" class="btn" data-dante="close" aria-label="Close">Close</button>
        </div>
        <div class="dante-tabs" role="tablist">${tab("daw", "DAW (track outputs)")}${tab("controller", "Dante Controller (routing)")}</div>
        ${this.tab === "daw" ? this.dawHtml(daw) : this.controllerHtml(mixer)}
      </div>`;
  }

  dawHtml(daw) {
    const { SOURCES_BY_ID } = this.manifest;
    const opts = (k) => [`<option value="0" ${k === 0 ? "selected" : ""}>No output</option>`, ...Array.from({ length: DANTE.dvsChannels }, (_, i) => `<option value="${i + 1}" ${k === i + 1 ? "selected" : ""}>DVS ${String(i + 1).padStart(2, "0")}</option>`)].join("");
    const rows = DAW_TRACKS.map(
      (sid, t) => `<tr>
        <td class="daw-num">${t + 1}</td>
        <td class="daw-name">${esc(sourceName(SOURCES_BY_ID[sid]) || sid)}</td>
        <td class="daw-clip" aria-hidden="true"><span></span></td>
        <td><select data-daw-out="${t}" aria-label="Track ${t + 1} output">${opts(daw.outs[t])}</select></td>
      </tr>`,
    ).join("");
    return `
      <p class="dante-note">Each track plays one stem. Its output is a Dante Virtual Soundcard channel: what the laptop transmits on the network. Give every track its own output, in order.</p>
      <table class="daw-table"><thead><tr><th>#</th><th>Track</th><th></th><th>Output</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  controllerHtml(mixer) {
    const { SOURCES_BY_ID } = this.manifest;
    const names = dvsChannelNames(this.store.state.rig, Object.fromEntries(DAW_TRACKS.map((s) => [s, sourceShort(SOURCES_BY_ID[s]) || s])));
    const rx = mixer.danteRx.length;
    const first = this.rxPage * RX_PAGE;
    const pages = Math.ceil(rx / RX_PAGE);
    const head = Array.from({ length: DANTE.dvsChannels }, (_, k) => `<th scope="col" class="dc-tx"><span>${String(k + 1).padStart(2, "0")}</span><small>${esc(names[k] || "")}</small></th>`).join("");
    const body = Array.from({ length: Math.min(RX_PAGE, rx - first) }, (_, r) => {
      const m = first + r;
      const cells = Array.from({ length: DANTE.dvsChannels }, (_, k) => {
        const on = mixer.danteRx[m] === k + 1;
        return `<td><button type="button" class="dc-cell ${on ? "on" : ""}" data-dante="sub" data-rx="${m}" data-tx="${k + 1}" aria-pressed="${on}" aria-label="CL3 RX ${m + 1} ${on ? "subscribed to" : "subscribe to"} DVS ${k + 1}">${on ? "✓" : ""}</button></td>`;
      }).join("");
      return `<tr><th scope="row" class="dc-rx">${String(m + 1).padStart(2, "0")}</th>${cells}</tr>`;
    }).join("");
    const pager = pages > 1 ? `<div class="dante-tabs">${Array.from({ length: pages }, (_, p) => `<button type="button" class="chip ${p === this.rxPage ? "active" : ""}" data-dante="page" data-page="${p}">RX ${p * RX_PAGE + 1}–${Math.min(rx, (p + 1) * RX_PAGE)}</button>`).join("")}</div>` : "";
    return `
      <p class="dante-note">Transmitters across (the laptop's DVS channels, named by what the DAW sends there), receivers down (the CL3's Dante RX channels; RX n feeds channel n). Click a square to subscribe a receiver to a transmitter.</p>
      ${pager}
      <div class="dc-wrap"><table class="dc-grid">
        <thead><tr><th class="dc-corner">CL3 RX ↓ · DVS TX →</th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table></div>`;
  }
}
