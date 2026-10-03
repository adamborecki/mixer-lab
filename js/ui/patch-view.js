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
  isMixer,
  listPorts,
  mixerOf,
  plugFitsJack,
} from "../connection-model.js";
import { modelOf } from "../mixer-state.js";
import { F8, PAIR, REVERB, TECHNIQUES, cardStats, techniqueOf } from "../devices.js";

import { CONNECTOR_GUIDE, deviceIconName, icon, jackIconName, levelIconName, plugIconName } from "./icons.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const CABLE_HUES = [195, 145, 45, 330, 265, 20, 170, 290];
const cableHue = (id) => CABLE_HUES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % CABLE_HUES.length];

const LEVEL_SHORT = { mic: "Mic level", instrument: "Instrument level", line: "Line level", speaker: "Speaker level", "mic-or-line": "Mic (XLR) or line (¼″)" };

export function portLabel(rig, ref, { short = false } = {}) {
  const p = getPort(rig, ref);
  if (!p) return ref;
  if (isMixer(p.device)) return short ? p.name.replace(" input", "").replace(" out", "") : `Mixer · ${p.name}`;
  const dev = p.device.label || DEVICE_TYPES[p.device.type].name;
  return short ? dev : `${dev} · ${p.name}`;
}

export class PatchView {
  constructor({ sourcesRoot, outputsRoot, store, manifest, toast, getTerms, onOpenRecorder = () => {}, getRecorder = () => null }) {
    this.onOpenRecorder = onOpenRecorder;
    this.getRecorder = getRecorder;
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
        const rec = e.target.closest("[data-open-recorder]");
        if (rec) this.onOpenRecorder(rec.dataset.openRecorder);
      });
      // Device settings (mic pair spacing/angle, reverb decay). The panel isn't
      // redrawn while dragging; only the readouts next to the slider change.
      root.addEventListener("input", (e) => {
        const el = e.target.closest("[data-device-key]");
        if (!el) return;
        this.store.setDevice(el.dataset.device, el.dataset.deviceKey, Number(el.value));
        this.updateDeviceReadouts(root);
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
    const jackIcon = jackIconName(p.jack, p.dir);
    return `<button type="button" class="port-btn ${connected ? "is-connected" : ""} ${extraClass}" data-port="${esc(ref)}">
      ${jackIcon ? `<span class="port-ico">${icon(jackIcon, { size: 30 })}</span>` : ""}
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
    const sources = rig.devices.filter((d) => DEVICE_TYPES[d.type].source && d.sourceId).sort((a, b) => SOURCES_BY_ID[a.sourceId].order - SOURCES_BY_ID[b.sourceId].order);
    const pairs = rig.devices.filter((d) => d.type === "stereo-mic-pair");
    const cards = sources.map((d) => {
      const src = SOURCES_BY_ID[d.sourceId];
      const ref = `${d.id}/out`;
      const chInfo = mix.channels.find((c) => c.input.sourceDeviceId === d.id);
      const input = chInfo ? chInfo.input : null;
      const status = !input ? "idle" : input.status === "ok" ? "ok" : input.status === "danger" ? "bad" : "warn";
      const msgs = input ? input.messages : [];
      const tags = [
        `<span class="tag tag-level" data-level="${src.signalLevel}">${icon(levelIconName(src.signalLevel), { size: 22, cls: "tag-ico" })}${SIGNAL_LEVELS[src.signalLevel].name}</span>`,
        `<span class="tag">${esc(PLUGS[src.connector] ? PLUGS[src.connector].name : src.connector)} out</span>`,
        src.stereo ? `<span class="tag tag-stereo">Stereo L/R</span>` : "",
        src.phantom === "required" ? `<span class="tag tag-phantom">Needs +48 V</span>` : "",
      ].join("");
      // Input-list number: where this source belongs (the CR1604 takes the laptop on TAPE IN).
      const model = modelOf(state);
      // Input-list number: where the source is patched (a compact mixer has fewer channels than the band).
      const listNo = model === "generic" ? state.channels[src.order - 1].label : model === "cr1604" && src.stereo ? "TAPE" : chInfo ? state.channels[chInfo.index].label : "—";
      const note =
        model === "cr1604" && src.stereo
          ? "A laptop's 3.5 mm headphone jack is a stereo line output. On the 1604 it goes into the TAPE INPUT RCA pair with a 3.5 mm ↔ RCA (Y) cable, then TAPE TO MAIN MIX puts it in the house."
          : model !== "generic" && src.stereo
            ? "A laptop's 3.5 mm headphone jack is a stereo line output: a stereo line channel or the tape input takes it, with a breakout, RCA (Y) or 3.5 mm cable to suit the jacks."
            : src.note;
      return `<li class="source-card status-${status}">
        <div class="source-top">
          <span class="source-order" aria-label="Input list number">${esc(listNo)}</span>
          <span class="dev-ico">${icon(deviceIconName(d), { size: 40 })}</span>
          <div class="source-names"><strong>${esc(src.name)}</strong><span>${esc(src.device)}</span></div>
          <span class="status-pill status-${status}">${status === "ok" ? "✓ Signal" : status === "idle" ? "Unpatched" : status === "bad" ? "✕ Danger" : "! Check"}</span>
        </div>
        <div class="tags">${tags}</div>
        ${this.portButton(ref, "out")}
        ${msgs.map((m) => `<p class="port-msg">${esc(m)}</p>`).join("")}
        ${note ? `<p class="source-note">${esc(note)}</p>` : ""}
      </li>`;
    });
    const empty = mix.channels.filter((c) => !c.input.connected).map((c) => state.channels[c.index].label);
    this.sourcesRoot.innerHTML = `
      <p class="role-line">${icon("role-source", { size: 26 })}<span>Sources: the signal starts here and goes out to the mixer.</span></p>
      <ol class="source-list">${cards.join("")}${pairs.map((d) => this.pairCard(d, mix)).join("")}</ol>
      <p class="panel-foot">${modelOf(state) === "cr1604" ? cr1604Foot(empty) : modelOf(state) !== "generic" ? compactFoot(state, empty) : `Free mixer inputs: ${empty.length ? empty.map((n) => `Ch ${n}`).join(", ") : "none"}. Ch 1–8 are XLR/¼″ combo jacks: XLR → mic preamp (+48 V available), ¼″ → line input (padded). Ch 9/10 is one stereo line input (left + right ¼″ pair, no phantom power).`}</p>
      ${connectorGuide()}`;
  }

  // The stereo room pair: two condenser outs, spacing and angle, and which
  // named technique the setting matches.
  pairCard(d, mix) {
    const inputs = [...mix.channels.map((c) => c.input), ...Object.values(mix.rig.recorders || {}).flat()].filter((i) => i && i.sourceDeviceId === d.id);
    const bad = inputs.find((i) => i.status !== "ok");
    const status = !inputs.length ? "idle" : bad ? "warn" : "ok";
    return `<li class="source-card status-${status}" data-device-card="${esc(d.id)}">
      <div class="source-top">
        <span class="source-order">ST</span>
        <span class="dev-ico">${icon(deviceIconName({ type: "condenser-mic" }), { size: 40 })}</span>
        <div class="source-names"><strong>Room pair</strong><span>${esc(d.label)}</span></div>
        <span class="status-pill status-${status}">${status === "ok" ? "✓ Signal" : status === "idle" ? "Unpatched" : "! Check"}</span>
      </div>
      <div class="tags"><span class="tag">2× condenser (cardioid)</span><span class="tag">XLR outs</span><span class="tag tag-phantom">Needs +48 V</span></div>
      ${listPorts(this.store.state.rig, d).map((p) => this.portButton(p.ref, "out")).join("")}
      ${(bad ? bad.messages : []).map((m) => `<p class="port-msg">${esc(m)}</p>`).join("")}
      <div class="dev-settings">
        <label>Spacing <output data-readout="spacingCm">${d.spacingCm} cm</output>
          <input type="range" min="0" max="${PAIR.spacingMax}" step="1" value="${d.spacingCm}" data-device="${esc(d.id)}" data-device-key="spacingCm" /></label>
        <label>Angle between the mics <output data-readout="angleDeg">${d.angleDeg}°</output>
          <input type="range" min="0" max="${PAIR.angleMax}" step="1" value="${d.angleDeg}" data-device="${esc(d.id)}" data-device-key="angleDeg" /></label>
        <p class="dev-technique" data-readout="technique">${techniqueText(d)}</p>
      </div>
    </li>`;
  }

  updateDeviceReadouts(root) {
    for (const card of root.querySelectorAll("[data-device-card]")) {
      const d = this.store.state.rig.devices.find((x) => x.id === card.dataset.deviceCard);
      if (!d) continue;
      const set = (k, v) => {
        const el = card.querySelector(`[data-readout="${k}"]`);
        if (el && el.textContent !== v) el.textContent = v;
      };
      if (d.type === "stereo-mic-pair") {
        set("spacingCm", `${d.spacingCm} cm`);
        set("angleDeg", `${d.angleDeg}°`);
        card.querySelector('[data-readout="technique"]').innerHTML = techniqueText(d);
      }
      if (d.type === "reverb") set("decay", `${d.decay.toFixed(1)} s`);
      if (d.type === "camera-input") set("inputLevel", d.inputLevel === 1 ? "LINE" : "MIC");
    }
  }

  renderOutputs(mix) {
    const state = this.store.state;
    const rig = state.rig;
    const terms = this.getTerms();
    const mixer = mixerOf(rig);
    const outs = listPorts(rig, mixer).filter((p) => p.dir === "out");
    const endpoints = new Map(mix.rig.endpoints.map((e) => [e.deviceId, e]));
    const busName = (portId) => ({ "main-l": "Main L", "main-r": "Main R", "cr-l": "C-R L", "cr-r": "C-R R" })[portId] || terms[portId] || portId;
    const boardNames = modelOf(state) !== "generic"; // real mixers' jacks are named as printed on them

    const outRows = outs
      .map((p) => {
        const reached = mix.rig.buses[p.id] || [];
        const cable = cableAt(rig, p.ref);
        const target = cable ? getPort(rig, cable.to) : null;
        const feeds = target && !DEVICE_TYPES[target.device.type].endpoint && target.device.type !== "power-amp";
        const note = reached.length
          ? `<p class="port-msg ok">✓ Sound from: ${reached.map((id) => esc(rig.devices.find((d) => d.id === id).label)).join(", ")}</p>`
          : feeds
            ? `<p class="port-msg ok">→ Feeds ${esc(portLabel(rig, cable.to))}</p>`
            : `<p class="port-msg">No working speaker on this output yet.</p>`;
        const label = !boardNames && terms[p.id] ? `${terms[p.id]} out` : p.name;
        return { p, html: `<li class="out-row">${this.portButton(p.ref, "out").replace(esc(p.name), esc(label))}${note}</li>` };
      });
    // The 1604 has many outputs: the per-channel ones are folded away.
    const perChannel = (r) => /^ch\d+-(direct|insert)$/.test(r.p.id);
    const outList = boardNames
      ? `<ul class="out-list">${outRows.filter((r) => !perChannel(r)).map((r) => r.html).join("")}</ul>
        <details class="out-more"><summary>DIRECT OUTS (1–8) and INSERT sends (1–16)</summary><ul class="out-list">${outRows.filter(perChannel).map((r) => r.html).join("")}</ul></details>`
      : `<ul class="out-list">${outRows.map((r) => r.html).join("")}</ul>`;

    const reverbs = rig.devices.filter((d) => d.type === "reverb");
    const reverbHtml = reverbs
      .map(
        (d) => `<li class="device-card" data-device-card="${esc(d.id)}">
        <div class="device-top"><span class="dev-ico">${icon("role-source", { size: 40 })}</span><div class="source-names"><strong>${esc(d.label)}</strong><span>Fed from an aux send, back into an aux return</span></div></div>
        ${listPorts(rig, d).map((p) => this.portButton(p.ref, p.dir)).join("")}
        <div class="dev-settings"><label>DECAY <output data-readout="decay">${d.decay.toFixed(1)} s</output>
          <input type="range" min="${REVERB.decayMin}" max="${REVERB.decayMax}" step="0.1" value="${d.decay}" data-device="${esc(d.id)}" data-device-key="decay" /></label></div>
      </li>`,
      )
      .join("");

    const recorders = rig.devices.filter((d) => DEVICE_TYPES[d.type].recorder);
    const recHtml = recorders
      .map((d) => {
        const rt = this.getRecorder(d.id);
        const card = cardStats(d, rt ? rt.usedBytes : 0);
        const armed = d.tracks.map((t, i) => (t.arm ? i + 1 : 0)).filter(Boolean);
        const state = rt && rt.recording ? "● Recording" : rt && rt.playing ? "▶ Playing" : "Stopped";
        return `<li class="device-card">
          <div class="device-top"><span class="dev-ico">${icon("role-destination", { size: 40 })}</span><div class="source-names"><strong>${esc(d.label)}</strong><span>${state} · armed: ${armed.length ? armed.join(", ") : "none"} · ${F8.cardGB} GB card${Number.isFinite(card.secondsLeft) ? `, ${formatHours(card.secondsLeft)} left` : ""}</span></div></div>
          <div class="rec-jacks">${listPorts(rig, d).map((p) => this.portButton(p.ref, p.dir)).join("")}</div>
          <button type="button" class="btn btn-start" data-open-recorder="${esc(d.id)}">Open the recorder</button>
        </li>`;
      })
      .join("");

    const amps = rig.devices.filter((d) => d.type === "power-amp");
    const ampHtml = amps
      .map(
        (d) => `<li class="device-card">
        <div class="device-top"><span class="dev-ico">${icon(deviceIconName(d), { size: 48 })}</span><div class="source-names"><strong>${esc(d.label)}</strong><span class="amp-where">Line level in → speaker level out</span></div></div>
        <div class="amp-sides">
          <div class="amp-side amp-in"><p class="amp-side-title">${icon("level-line", { size: 26 })}<span>Line level IN <small>from the mixer</small></span></p>${listPorts(rig, d)
            .filter((p) => p.dir === "in")
            .map((p) => this.portButton(p.ref, p.dir))
            .join("")}</div>
          <div class="amp-side amp-out"><p class="amp-side-title">${icon("level-speaker", { size: 26 })}<span>Speaker level OUT <small>to passive speakers only</small></span></p>${listPorts(rig, d)
            .filter((p) => p.dir === "out")
            .map((p) => this.portButton(p.ref, p.dir))
            .join("")}</div>
        </div>
      </li>`,
      )
      .join("");

    const speakers = rig.devices.filter((d) => DEVICE_TYPES[d.type].endpoint);
    const zoneName = { foh: "House (audience)", stage: "Stage (performers)" };
    const spkHtml = speakers
      .map((d) => {
        const type = DEVICE_TYPES[d.type];
        const ep = endpoints.get(d.id);
        const status = ep.valid ? (ep.status === "ok" ? "ok" : "warn") : ep.status === "unpatched" ? "idle" : ep.status === "danger" ? "bad" : "warn";
        const statusText = ep.valid ? `${ep.status === "hot" ? "⚠ Distorting" : ep.status === "weak" ? "⚠ Too quiet" : "✓ Sound"}: ${busName(ep.output)}${ep.viaAmp ? " via amp" : ""}` : ep.status === "unpatched" ? "Silent" : ep.status === "danger" ? "✕ Danger" : "✕ No sound";
        const amp = type.camera ? "Records what it's fed" : type.amp === "internal" ? "Amp: built in (powered)" : "Amp: none inside (passive)";
        const settings = type.camera
          ? `<div class="dev-settings"><label>INPUT <output data-readout="inputLevel">${d.inputLevel === 1 ? "LINE" : "MIC"}</output>
              <input type="range" min="0" max="1" step="1" value="${d.inputLevel ?? 0}" data-device="${esc(d.id)}" data-device-key="inputLevel" aria-label="${esc(d.label)} MIC/LINE switch" /></label></div>`
          : "";
        return `<li class="device-card status-${status}" data-device-card="${esc(d.id)}">
          <div class="device-top">
            <span class="dev-ico">${icon(deviceIconName(d), { size: 44 })}</span>
            <div class="source-names"><strong>${esc(d.label)}</strong><span>${amp}${zoneName[d.zone] ? ` · ${zoneName[d.zone]}` : ""}</span></div>
            <span class="status-pill status-${status}">${statusText}</span>
          </div>
          ${listPorts(rig, d)
            .map((p) => this.portButton(p.ref, p.dir))
            .join("")}
          ${settings}
          ${ep.messages.map((m) => `<p class="port-msg">${esc(m)}</p>`).join("")}
        </li>`;
      })
      .join("");

    this.outputsRoot.innerHTML = `
      <h3 class="group-title">${icon("role-source", { size: 22 })}Mixer outputs <small>line level</small></h3>
      ${outList}
      ${reverbs.length ? `<h3 class="group-title">Effects</h3><ul class="device-list">${reverbHtml}</ul>` : ""}
      ${recorders.length ? `<h3 class="group-title">Recorder</h3><ul class="device-list">${recHtml}</ul>` : ""}
      ${amps.length ? `<h3 class="group-title">Amplifier</h3><ul class="device-list">${ampHtml}</ul>` : ""}
      <h3 class="group-title">${icon("role-destination", { size: 22 })}${speakers.every((d) => DEVICE_TYPES[d.type].camera) ? "Camera — does the level match?" : "Speakers — where is the amplifier?"}</h3>
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
      <p class="patch-sub">${icon(jackIconName(p.jack, p.dir), { size: 28 })}${p.dir === "out" ? "Output" : "Input"} · ${esc(JACKS[p.jack].name)} jack · ${esc(lvl ? lvl.name : LEVEL_SHORT[p.level] || p.level)}</p>
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
      const near = ends ? ends.near : c.ends[0];
      const far = ends ? ends.far : c.ends[1];
      const farDir = p.dir === "out" ? "in" : "out";
      const pair = `<span class="cable-art">${icon(plugIconName(near, p.dir), { size: 34 })}${icon(c.kind === "speaker" ? "cable-speaker" : "cable-signal", { size: 30 })}${icon(plugIconName(far, farDir), { size: 34 })}</span>`;
      return `<button type="button" class="cable-card" data-act="cable" data-cable="${c.id}">
        ${pair}<strong>${esc(c.name)}</strong>${c.kind === "speaker" ? '<span class="cable-kind">Speaker cable: speaker level only</span>' : ""}<span class="cable-plugs">${esc(plugs)}</span><span class="cable-blurb">${esc(c.blurb)}</span>
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
        const ji = jackIconName(q.jack, q.dir);
        return `<button type="button" class="target-btn" data-act="target" data-ref="${esc(q.ref)}" ${check.ok ? "" : "disabled"}>
          ${ji ? `<span class="port-ico">${icon(ji, { size: 26 })}</span>` : ""}<span>${esc(q.name)}</span><small>${esc(lvl ? lvl.name : LEVEL_SHORT[q.level] || "")}${why ? ` · ${esc(why)}` : ""}</small>
        </button>`;
      });
      groups.push(`<div class="target-group"><h3>${icon(deviceIconName(d), { size: 26 })}${esc(d.label || DEVICE_TYPES[d.type].name)}</h3>${items.join("")}</div>`);
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

function techniqueText(d) {
  const t = techniqueOf(d);
  if (t) return `✓ This is <strong>${esc(t.name)}</strong> (${t.spacingCm} cm, ${t.angleDeg}°).`;
  return `Custom setting. For reference: ${TECHNIQUES.map((x) => `${esc(x.name)} ${x.spacingCm} cm / ${x.angleDeg}°`).join(" · ")}.`;
}

function formatHours(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

function compactFoot(state, empty) {
  const free = empty.filter((n) => !/TAPE|2TR/.test(n));
  return `Free channels: ${free.length ? free.map((n) => `Ch ${n}`).join(", ") : "none"}. ${free.length ? "" : "This mixer is full: the rest of the band stays unplugged. "}Tap a channel's name on the Mixer to see its jacks; use one input per channel.`;
}

function cr1604Foot(empty) {
  const free = empty.filter((n) => n !== "TAPE");
  return `Free channels: ${free.length ? free.map((n) => `Ch ${n}`).join(", ") : "none"}. Every channel has its own MIC jack (XLR → mic preamp, +48 V from the rear PHANTOM switch) and LINE jack (¼″, padded 20 dB); use one per channel. TAPE INPUT is a stereo RCA pair for a laptop or player.`;
}

// Collapsed reference of every connector in the lab. Pictures only: what fits what
// is decided by the connection model.
function connectorGuide() {
  return `<details class="conn-guide"><summary>Connector guide</summary>
    <ul>${CONNECTOR_GUIDE.map(([name, title, text]) => `<li>${icon(name, { size: 40 })}<span><strong>${esc(title)}</strong> ${esc(text)}</span></li>`).join("")}</ul>
    <p class="conn-guide-note">${icon("cable-signal", { size: 26 })}<span>Signal cable: thin.</span>${icon("cable-speaker", { size: 26 })}<span>Speaker cable: heavy, double line.</span>${icon("cable-power", { size: 26 })}<span>Power cable: dashed, with prongs.</span></p>
  </details>`;
}
