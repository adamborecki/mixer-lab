// Which destination is the student listening to? Main L/R, a monitor bus
// (Aux 1 / Aux 2), or the engineer's headphones (PFL). Main and the auxes are
// heard only through the speakers they validly reach; PFL needs no speakers.

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
      const order = ["main", "aux1", "aux2", "pfl"];
      const i = order.indexOf(b.dataset.dest);
      const next = order[(i + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : order.length - 1)) % order.length];
      store.setListen(next);
      root.querySelector(`[data-dest="${next}"]`).focus();
    });
    this.render();
  }

  render() {
    const t = this.getSkin().terms;
    const btn = (dest, label) =>
      `<button type="button" role="radio" class="listen-btn" data-dest="${dest}"><strong>${esc(label)}</strong><small class="listen-sub"></small></button>`;
    this.root.innerHTML = `
      <div class="listen-group" role="radiogroup" aria-label="Listen to">
        <span class="listen-label" aria-hidden="true">Listen</span>
        ${btn("main", "Main L/R")}${btn("aux1", t.aux1)}${btn("aux2", t.aux2)}${btn("pfl", "PFL")}
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
    this.lastMsg = null;
  }

  update(mix, { playing, ready, loadingText, buffering }) {
    const state = this.store.state;
    const t = this.getSkin().terms;
    const devices = new Map(state.rig.devices.map((d) => [d.id, d]));
    const short = (e) => devices.get(e.deviceId)?.short || devices.get(e.deviceId)?.label || e.deviceId;
    const reaching = (ports) => mix.rig.endpoints.filter((e) => e.valid && ports.includes(e.output));
    const ends = { main: reaching(["main-l", "main-r"]), aux1: reaching(["aux1"]), aux2: reaching(["aux2"]) };
    const pfls = state.channels.filter((c) => c.pfl).map((c) => c.index + 1);
    const names = (eps) => eps.map(short).join(" + ");
    const subs = {
      main: ends.main.length ? `✓ ${names(ends.main)}` : "✕ no working speaker",
      aux1: ends.aux1.length ? `✓ ${names(ends.aux1)}` : "✕ no working speaker",
      aux2: ends.aux2.length ? `✓ ${names(ends.aux2)}` : "✕ no working speaker",
      pfl: pfls.length ? `Phones: Ch ${pfls.join(", ")}` : "Phones: no PFL",
    };
    for (const btn of this.root.querySelectorAll("[data-dest]")) {
      const d = btn.dataset.dest;
      const on = state.listen === d;
      btn.setAttribute("aria-checked", String(on));
      btn.tabIndex = on ? 0 : -1;
      btn.classList.toggle("active", on);
      btn.querySelector(".listen-sub").textContent = subs[d];
      btn.classList.toggle("is-dead", d === "pfl" ? !pfls.length : !ends[d].length);
    }

    const dest = state.listen;
    const busName = { main: "Main L/R", aux1: t.aux1, aux2: t.aux2 }[dest];
    let msg;
    if (!ready) msg = loadingText || "Loading…";
    else if (!playing) msg = "Playback stopped.";
    else if (buffering) msg = "Buffering the next part of the song…";
    else if (dest === "pfl") msg = pfls.length ? `Engineer's headphones: PFL on Ch ${pfls.join(", ")} (before the ${t.levelShort.toLowerCase()}).` : "Headphones are quiet: press PFL on a channel to hear it here.";
    else if (ends[dest].length) msg = `Hearing ${busName} through the ${names(ends[dest])}.`;
    else msg = `Silence: ${busName} doesn't reach a working speaker. Check the Outputs.`;
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
