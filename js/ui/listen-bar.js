// Where is the student standing? House (Main L/R), stage (the monitor bus),
// or wearing the engineer's headphones (PFL). Only valid speaker chains make
// sound in the house or on stage; PFL needs no speakers.

import { MeterView } from "../meters.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export class ListenBar {
  constructor(root, { store, getSkin, onTransport }) {
    this.root = root;
    this.store = store;
    this.getSkin = getSkin;
    this.onTransport = onTransport;
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dest]");
      if (b) store.setListen(b.dataset.dest);
      if (e.target.closest(".transport")) this.onTransport();
    });
    root.addEventListener("keydown", (e) => {
      const b = e.target.closest("[data-dest]");
      if (!b || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const order = ["main", "aux1", "pfl"];
      const i = order.indexOf(b.dataset.dest);
      const next = order[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 2)) % 3];
      store.setListen(next);
      root.querySelector(`[data-dest="${next}"]`).focus();
    });
    this.render();
  }

  render() {
    const skin = this.getSkin();
    this.root.innerHTML = `
      <div class="listen-group" role="radiogroup" aria-label="Listen to">
        <span class="listen-label" aria-hidden="true">Listen</span>
        <button type="button" role="radio" class="listen-btn" data-dest="main"><strong>Main L/R</strong><small class="listen-sub"></small></button>
        <button type="button" role="radio" class="listen-btn" data-dest="aux1"><strong>${esc(skin.terms.aux)}</strong><small class="listen-sub"></small></button>
        <button type="button" role="radio" class="listen-btn" data-dest="pfl"><strong>PFL</strong><small class="listen-sub"></small></button>
      </div>
      <div class="listen-now">
        <p class="listen-msg" aria-live="polite"></p>
      </div>
      <button type="button" class="transport btn" disabled>…</button>`;
    this.meter = new MeterView({ orientation: "horizontal", label: "What you hear", showText: false });
    this.meter.el.classList.add("listen-meter");
    this.root.querySelector(".listen-now").prepend(this.meter.el);
    this.msg = this.root.querySelector(".listen-msg");
    this.transport = this.root.querySelector(".transport");
  }

  update(mix, { playing, ready, loadingText }) {
    const state = this.store.state;
    const skin = this.getSkin();
    const rig = state.rig;
    const label = (id) => rig.devices.find((d) => d.id === id)?.label || id;
    const bus = (port) => ({ "main-l": "Main L", "main-r": "Main R", aux1: skin.terms.aux })[port];
    const zone = (z) => mix.rig.endpoints.filter((e) => e.valid && e.zone === z);
    const house = zone("foh");
    const stage = zone("stage");
    const pfls = state.channels.filter((c) => c.pfl).map((c) => c.index + 1);
    const feeds = (eps) => [...new Set(eps.map((e) => bus(e.output)))].join(" + ");
    const subs = {
      main: house.length ? `House: ✓ ${feeds(house)}` : "House: ✕ no working speaker",
      aux1: stage.length ? `Stage: ✓ ${feeds(stage)}` : "Stage: ✕ no working wedge",
      pfl: pfls.length ? `Phones: Ch ${pfls.join(", ")}` : "Phones: no PFL pressed",
    };
    for (const btn of this.root.querySelectorAll("[data-dest]")) {
      const d = btn.dataset.dest;
      const on = state.listen === d;
      btn.setAttribute("aria-checked", String(on));
      btn.tabIndex = on ? 0 : -1;
      btn.classList.toggle("active", on);
      btn.querySelector(".listen-sub").textContent = subs[d];
      btn.classList.toggle("is-dead", d === "main" ? !house.length : d === "aux1" ? !stage.length : !pfls.length);
    }

    let msg;
    if (!ready) msg = loadingText || "Loading…";
    else if (!playing) msg = "Playback stopped.";
    else if (state.listen === "main") msg = house.length ? `You're in the audience, hearing ${house.map((e) => label(e.deviceId)).join(" and ")}.` : "Silence in the house: nothing on Main reaches a working speaker.";
    else if (state.listen === "aux1") msg = stage.length ? `You're on stage, hearing ${stage.map((e) => label(e.deviceId)).join(" and ")}.` : `Silence on stage: ${skin.terms.aux} isn't reaching a working wedge.`;
    else msg = pfls.length ? `Engineer's headphones: PFL on Ch ${pfls.join(", ")} (before the ${skin.terms.levelShort.toLowerCase()}).` : "Headphones are quiet: press PFL on a channel to solo it here.";
    if (msg !== this.lastMsg) {
      this.msg.textContent = msg;
      this.lastMsg = msg;
    }
    this.transport.disabled = !ready;
    this.transport.textContent = playing ? "■ Stop" : "▶ Play";
    this.transport.setAttribute("aria-label", playing ? "Stop the band" : "Play the band");
    this.transport.classList.toggle("btn-start", !playing);
    this.transport.classList.toggle("btn-stop", playing);
  }

  updateMeter(reading, now) {
    this.meter.update(reading, now);
  }
}
