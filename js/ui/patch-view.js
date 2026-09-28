// Sources and Outputs panels plus the patch dialog. Patching is tap-based:
// tap a port → pick a cable → pick where the other end goes. Every result is
// shown in words (not just colour) on both ends of the cable.

import {
  CABLES,
  DEVICE_TYPES,
  JACKS,
  PLUGS,
  SIGNAL_LEVELS,
  cableAt,
  cableEndFor,
  cablesForPort,
  checkConnection,
  getPort,
  listPorts,
  plugFitsJack,
} from "../connection-model.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const CABLE_HUES = [195, 145, 45, 330, 265, 20, 170, 290];
const cableHue = (id) => CABLE_HUES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % CABLE_HUES.length];

const LEVEL_SHORT = { mic: "Mic level", instrument: "Instrument level", line: "Line level", speaker: "Speaker level", "mic-or-line": "Mic (XLR) or line (¼″)" };

export function portLabel(rig, ref, { short = false } = {}) {
  const p = getPort(rig, ref);
  if (!p) return ref;
  if (p.device.type === "mixer") return short ? p.name.replace(" input", "").replace(" out", "") : `Mixer · ${p.name}`;
  const dev = p.device.label || DEVICE_TYPES[p.device.type].name;
  return short ? dev : `${dev} · ${p.name}`;
}

export class PatchView {
  constructor({ sourcesRoot, outputsRoot, store, manifest, toast, getTerms }) {
    this.sourcesRoot = sourcesRoot;
    this.outputsRoot = outputsRoot;
    this.store = store;
    this.manifest = manifest;
    this.toast = toast;
    this.getTerms = getTerms;
    this.dialog = new PatchDialog(this);
    for (const root of [sourcesRoot, outputsRoot]) {
      root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-port]");
        if (btn) this.dialog.open(btn.dataset.port);
      });
    }
  }

  openPort(ref) {
    this.dialog.open(ref);
  }

  cableChip(ref, dir) {
    const rig = this.store.state.rig;
    const cable = cableAt(rig, ref);
    if (!cable) return `<span class="port-empty">Not connected</span>`;
    const other = cable.from === ref ? cable.to : cable.from;
    const arrow = dir === "out" ? "→" : "←";
    return `<span class="cable-dot" style="--hue:${cableHue(cable.id)}" aria-hidden="true"></span><span class="port-link">${arrow} ${esc(portLabel(rig, other))}</span><span class="port-cable">${esc(CABLES[cable.cable].name)}</span>`;
  }

  portButton(ref, dir, extraClass = "") {
    const rig = this.store.state.rig;
    const p = getPort(rig, ref);
    const connected = !!cableAt(rig, ref);
    return `<button type="button" class="port-btn ${connected ? "is-connected" : ""} ${extraClass}" data-port="${esc(ref)}">
      <span class="port-name">${esc(p.name)} <small>${esc(JACKS[p.jack].name)} · ${esc(LEVEL_SHORT[p.level] || p.level)}</small></span>
      <span class="port-state">${this.cableChip(ref, dir)}</span>
    </button>`;
  }

  render(mix) {
    this.renderSources(mix);
    this.renderOutputs(mix);
  }

  renderSources(mix) {
    const state = this.store.state;
    const rig = state.rig;
    const { SOURCES_BY_ID } = this.manifest;
    const sources = rig.devices.filter((d) => DEVICE_TYPES[d.type].source).sort((a, b) => SOURCES_BY_ID[a.sourceId].order - SOURCES_BY_ID[b.sourceId].order);
    const cards = sources.map((d) => {
      const src = SOURCES_BY_ID[d.sourceId];
      const ref = `${d.id}/out`;
      const chInfo = mix.channels.find((c) => c.input.sourceDeviceId === d.id);
      const input = chInfo ? chInfo.input : null;
      const status = !input ? "idle" : input.status === "ok" ? "ok" : input.status === "danger" ? "bad" : "warn";
      const msgs = input ? input.messages : [];
      const tags = [
        `<span class="tag tag-level" data-level="${src.signalLevel}">${SIGNAL_LEVELS[src.signalLevel].name}</span>`,
        `<span class="tag">${esc(PLUGS[src.connector] ? PLUGS[src.connector].name : src.connector)} out</span>`,
        src.phantom === "required" ? `<span class="tag tag-phantom">Needs +48 V</span>` : "",
      ].join("");
      return `<li class="source-card status-${status}">
        <div class="source-top">
          <span class="source-order" aria-label="Input list number">${src.order}</span>
          <div class="source-names"><strong>${esc(src.name)}</strong><span>${esc(src.device)}</span></div>
          <span class="status-pill status-${status}">${status === "ok" ? "✓ Signal" : status === "idle" ? "Unpatched" : status === "bad" ? "✕ Danger" : "! Check"}</span>
        </div>
        <div class="tags">${tags}</div>
        ${this.portButton(ref, "out")}
        ${msgs.map((m) => `<p class="port-msg">${esc(m)}</p>`).join("")}
        ${src.note ? `<p class="source-note">${esc(src.note)}</p>` : ""}
      </li>`;
    });
    const empty = mix.channels.filter((c) => !c.input.connected).map((c) => c.index + 1);
    this.sourcesRoot.innerHTML = `
      <ol class="source-list">${cards.join("")}</ol>
      <p class="panel-foot">Free mixer inputs: ${empty.length ? empty.map((n) => `Ch ${n}`).join(", ") : "none"}. Every channel input is an XLR/¼″ combo jack: XLR → mic preamp (+48 V available), ¼″ → line input (padded).</p>`;
  }

  renderOutputs(mix) {
    const state = this.store.state;
    const rig = state.rig;
    const terms = this.getTerms();
    const mixer = rig.devices.find((d) => d.type === "mixer");
    const outs = listPorts(rig, mixer).filter((p) => p.dir === "out");
    const endpoints = new Map(mix.rig.endpoints.map((e) => [e.deviceId, e]));
    const busName = (portId) => ({ "main-l": "Main L", "main-r": "Main R" })[portId] || terms[portId] || portId;

    const outRows = outs
      .map((p) => {
        const reached = mix.rig.buses[p.id] || [];
        const note = reached.length
          ? `<p class="port-msg ok">✓ Sound from: ${reached.map((id) => esc(rig.devices.find((d) => d.id === id).label)).join(", ")}</p>`
          : `<p class="port-msg">No working speaker on this output yet.</p>`;
        const label = terms[p.id] ? `${terms[p.id]} out` : p.name;
        return `<li class="out-row">${this.portButton(p.ref, "out").replace(esc(p.name), esc(label))}${note}</li>`;
      })
      .join("");

    const amps = rig.devices.filter((d) => d.type === "power-amp");
    const ampHtml = amps
      .map(
        (d) => `<li class="device-card">
        <div class="device-top"><strong>${esc(d.label)}</strong><span class="amp-where">Line in → speaker level out</span></div>
        <div class="port-grid">${listPorts(rig, d)
          .map((p) => this.portButton(p.ref, p.dir))
          .join("")}</div>
      </li>`,
      )
      .join("");

    const speakers = rig.devices.filter((d) => DEVICE_TYPES[d.type].endpoint);
    const zoneName = { foh: "House (audience)", stage: "Stage (performers)" };
    const spkHtml = speakers
      .map((d) => {
        const type = DEVICE_TYPES[d.type];
        const ep = endpoints.get(d.id);
        const status = ep.valid ? "ok" : ep.status === "unpatched" ? "idle" : ep.status === "danger" ? "bad" : "warn";
        const statusText = ep.valid ? `✓ Sound: ${busName(ep.output)}${ep.viaAmp ? " via amp" : ""}` : ep.status === "unpatched" ? "Silent" : ep.status === "danger" ? "✕ Danger" : "✕ No sound";
        const amp = type.amp === "internal" ? "Amp: built in (powered)" : "Amp: none inside (passive)";
        return `<li class="device-card status-${status}">
          <div class="device-top">
            <div class="source-names"><strong>${esc(d.label)}</strong><span>${amp} · ${zoneName[d.zone] || ""}</span></div>
            <span class="status-pill status-${status}">${statusText}</span>
          </div>
          ${listPorts(rig, d)
            .map((p) => this.portButton(p.ref, p.dir))
            .join("")}
          ${ep.messages.map((m) => `<p class="port-msg">${esc(m)}</p>`).join("")}
        </li>`;
      })
      .join("");

    this.outputsRoot.innerHTML = `
      <h3 class="group-title">Mixer outputs</h3>
      <ul class="out-list">${outRows}</ul>
      ${amps.length ? `<h3 class="group-title">Amplifier</h3><ul class="device-list">${ampHtml}</ul>` : ""}
      <h3 class="group-title">Speakers — where is the amplifier?</h3>
      <ul class="device-list">${spkHtml}</ul>`;
  }
}

// ---------- the patch dialog ----------

class PatchDialog {
  constructor(view) {
    this.view = view;
    this.el = document.createElement("dialog");
    this.el.className = "patch-dialog";
    this.el.setAttribute("aria-labelledby", "patch-title");
    document.body.appendChild(this.el);
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) return this.el.close();
      const act = e.target.closest("[data-act]");
      if (!act) return;
      const a = act.dataset.act;
      if (a === "close") this.el.close();
      else if (a === "unplug") this.unplug(act.dataset.cable);
      else if (a === "cable") this.chooseCable(act.dataset.cable);
      else if (a === "back") this.showCables();
      else if (a === "target") this.connect(act.dataset.ref);
    });
  }

  get rig() {
    return this.view.store.state.rig;
  }

  open(ref) {
    this.ref = ref;
    this.cable = null;
    const existing = cableAt(this.rig, ref);
    if (existing) this.showExisting(existing);
    else this.showCables();
    if (!this.el.open) this.el.showModal();
  }

  header(step) {
    const p = getPort(this.rig, this.ref);
    const lvl = SIGNAL_LEVELS[p.level];
    return `<header class="patch-head">
      <p class="patch-kicker">${step}</p>
      <h2 id="patch-title">${esc(portLabel(this.rig, this.ref))}</h2>
      <p class="patch-sub">${p.dir === "out" ? "Output" : "Input"} · ${esc(JACKS[p.jack].name)} jack · ${esc(lvl ? lvl.name : LEVEL_SHORT[p.level] || p.level)}</p>
      <button type="button" class="patch-x" data-act="close" aria-label="Close">✕</button>
    </header>`;
  }

  showExisting(cable) {
    const other = cable.from === this.ref ? cable.to : cable.from;
    this.el.innerHTML = `<div class="patch-inner">
      ${this.header("Connected")}
      <p class="patch-current"><span class="cable-dot" style="--hue:${cableHue(cable.id)}" aria-hidden="true"></span>
        ${esc(CABLES[cable.cable].name)} to <strong>${esc(portLabel(this.rig, other))}</strong></p>
      <div class="patch-actions">
        <button type="button" class="btn btn-stop" data-act="unplug" data-cable="${esc(cable.id)}">Unplug</button>
        <button type="button" class="btn btn-start" data-act="close">Keep it</button>
      </div>
    </div>`;
    this.el.querySelector('[data-act="unplug"]').focus();
  }

  showCables() {
    const p = getPort(this.rig, this.ref);
    const fits = cablesForPort(p);
    const nofit = Object.values(CABLES).filter((c) => !fits.includes(c));
    const card = (c) => {
      const ends = cableEndFor(c.id, p.jack);
      const plugs = ends ? `${PLUGS[ends.near].name} ⟷ ${PLUGS[ends.far].name}` : `${PLUGS[c.ends[0]].name} ⟷ ${PLUGS[c.ends[1]].name}`;
      return `<button type="button" class="cable-card" data-act="cable" data-cable="${c.id}">
        <strong>${esc(c.name)}</strong><span class="cable-plugs">${esc(plugs)}</span><span class="cable-blurb">${esc(c.blurb)}</span>
      </button>`;
    };
    this.el.innerHTML = `<div class="patch-inner">
      ${this.header("Step 1 of 2 · Pick a cable")}
      <div class="cable-grid">${fits.map(card).join("")}</div>
      <details class="nofit"><summary>Cables that don't fit this ${esc(JACKS[p.jack].name)} jack (${nofit.length})</summary>
        <ul>${nofit.map((c) => `<li><strong>${esc(c.name)}</strong> — ${esc(PLUGS[c.ends[0]].name)} ⟷ ${esc(PLUGS[c.ends[1]].name)}</li>`).join("")}</ul>
      </details>
    </div>`;
    const first = this.el.querySelector(".cable-card");
    if (first) first.focus();
  }

  chooseCable(cableId) {
    this.cable = cableId;
    const rig = this.rig;
    const p = getPort(rig, this.ref);
    const ends = cableEndFor(cableId, p.jack);
    const groups = [];
    for (const d of rig.devices) {
      if (d.id === p.device.id) continue;
      const ports = listPorts(rig, d).filter((q) => q.dir !== p.dir && plugFitsJack(ends.far, q.jack));
      if (!ports.length) continue;
      const items = ports.map((q) => {
        const [from, to] = p.dir === "out" ? [this.ref, q.ref] : [q.ref, this.ref];
        const check = checkConnection(rig, from, to, cableId);
        const busy = cableAt(rig, q.ref);
        const why = check.ok ? "" : busy ? `In use → ${portLabel(rig, busy.from === q.ref ? busy.to : busy.from)}` : check.reason;
        const lvl = SIGNAL_LEVELS[q.level];
        return `<button type="button" class="target-btn" data-act="target" data-ref="${esc(q.ref)}" ${check.ok ? "" : "disabled"}>
          <span>${esc(q.name)}</span><small>${esc(lvl ? lvl.name : LEVEL_SHORT[q.level] || "")}${why ? ` · ${esc(why)}` : ""}</small>
        </button>`;
      });
      groups.push(`<div class="target-group"><h3>${esc(d.label || DEVICE_TYPES[d.type].name)}</h3>${items.join("")}</div>`);
    }
    this.el.innerHTML = `<div class="patch-inner">
      ${this.header(`Step 2 of 2 · Plug in the ${PLUGS[ends.far].name} end`)}
      <p class="patch-sub">Using: <strong>${esc(CABLES[cableId].name)}</strong> <button type="button" class="linkish" data-act="back">change cable</button></p>
      ${groups.length ? groups.join("") : `<p class="patch-empty">Nothing here takes a ${esc(PLUGS[ends.far].name)} plug.</p>`}
    </div>`;
    const first = this.el.querySelector(".target-btn:not([disabled])");
    if (first) first.focus();
  }

  connect(targetRef) {
    const p = getPort(this.rig, this.ref);
    const [from, to] = p.dir === "out" ? [this.ref, targetRef] : [targetRef, this.ref];
    const result = this.view.store.connect(from, to, this.cable);
    if (!result.ok) {
      this.view.toast(result.reason, "bad");
      return;
    }
    this.el.close();
    this.view.toast(`Patched: ${portLabel(this.rig, from)} → ${portLabel(this.rig, to)}`, "ok");
  }

  unplug(cableId) {
    this.view.store.disconnect(cableId);
    this.el.close();
    this.view.toast("Unplugged.", "");
  }
}
