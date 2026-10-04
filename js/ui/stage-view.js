// The Stage & patch diagram: every box on stage, the console's rear panel and
// the speakers, with real cables between real jacks. Positions come from
// stage-layout.js; what is connected and whether it works come from the rig
// and its analysis (connection-model.js). The picture never decides anything.
//
//   tap a jack                  the patch dialog (pick a cable, then the far end)
//   drag jack → jack            plug a cable between them (pick one if several fit)
//   drag a plugged jack         move that cable's end to another jack
//   tap a box                   its details (status, settings) below the diagram

import { CABLES, DEVICE_TYPES, JACKS, SIGNAL_LEVELS, cableAt, getPort, isMixer, mixerOf } from "../connection-model.js";
import { deviceIconName, icon, jackIconName } from "./icons.js";
import { JACK, layoutStage } from "./stage-layout.js";
import { cableHue, portLabel } from "./patch-view.js";
import { figureSvg } from "./listen-bar.js";
import { listenGroupOf } from "../mixer-state.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const DIR = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
const PLUG_LEN = 15;

// The plug a cable has on the end that goes into this jack (for drawing only).
function plugKind(cableId, jack) {
  const c = CABLES[cableId];
  if (!c) return "xlr";
  if (c.kind === "network") return "ethercon";
  if (jack === "xlr" || jack === "combo") return c.ends.includes("xlr") && (jack === "xlr" || c.id === "xlr" || c.ends[0] === "xlr") ? "xlr" : "quarter";
  return { quarter: "quarter", linepair: "quarter", rca: "rca", rcapair: "rca", mini: "mini", ethercon: "ethercon" }[jack] || "quarter";
}

// A cable from a to b, leaving each jack along its side and bending in between.
export function cablePath(a, b) {
  const [ax, ay] = DIR[a.side] || DIR.right;
  const [bx, by] = DIR[b.side] || DIR.left;
  const sx = a.x + ax * PLUG_LEN;
  const sy = a.y + ay * PLUG_LEN;
  const ex = b.x + bx * PLUG_LEN;
  const ey = b.y + by * PLUG_LEN;
  const dist = Math.hypot(ex - sx, ey - sy);
  const k = Math.max(36, Math.min(190, dist * 0.42));
  // Draped cables hang a little lower than they need to.
  const sag = (side) => (side === "down" ? 1.15 : 1);
  return `M${sx.toFixed(1)} ${sy.toFixed(1)} C${(sx + ax * k).toFixed(1)} ${(sy + ay * k * sag(a.side)).toFixed(1)} ${(ex + bx * k).toFixed(1)} ${(ey + by * k * sag(b.side)).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

// The plug body sticking out of a jack along its side.
function plugShape(j, kind, hue) {
  const [dx, dy] = DIR[j.side] || DIR.right;
  const w = kind === "xlr" ? 12 : kind === "ethercon" ? 12 : kind === "mini" ? 6 : 9;
  const len = PLUG_LEN + 2;
  const x = dx === 0 ? j.x - w / 2 : dx > 0 ? j.x + 4 : j.x - 4 - len;
  const y = dy === 0 ? j.y - w / 2 : dy > 0 ? j.y + 4 : j.y - 4 - len;
  const rw = dx === 0 ? w : len;
  const rh = dx === 0 ? len : w;
  // Strain relief: the coloured ring where the cable leaves the plug.
  const rx = dx === 0 ? x : dx > 0 ? x + len - 4 : x;
  const ry = dy === 0 ? y : dy > 0 ? y + len - 4 : y;
  return `<g class="plug plug-${kind}"><rect x="${x}" y="${y}" width="${rw}" height="${rh}" rx="2.5" class="plug-body"/>
    <rect x="${dx === 0 ? x : rx}" y="${dy === 0 ? y : ry}" width="${dx === 0 ? w : 4}" height="${dx === 0 ? 4 : w}" style="fill:hsl(${hue} 75% 58%)"/></g>`;
}

export class StageView {
  constructor(root, { store, manifest, patchView, getSkin, onOpenDante = () => {}, canAddGear = () => false, getPlaces = () => [] }) {
    this.canAddGear = canAddGear;
    this.getPlaces = getPlaces;
    this.root = root;
    this.store = store;
    this.manifest = manifest;
    this.patchView = patchView;
    this.getSkin = getSkin;
    this.onOpenDante = onOpenDante;
    this.selected = null;
    this.drag = null;
    root.innerHTML = `<div class="stage-gear" hidden></div><div class="stage-scroll"><div class="stage-canvas"></div></div>
      <div class="stage-help"><span>Tap a jack to patch it, or drag from one jack to another. Drag a plugged-in jack to move its cable. Tap a box for its details.</span>
        <span class="stage-legend"><i class="lg lg-signal"></i>signal <i class="lg lg-speaker"></i>speaker level <i class="lg lg-network"></i>network</span></div>
      <div class="stage-inspector" aria-live="polite"></div>`;
    this.canvas = root.querySelector(".stage-canvas");
    this.inspector = root.querySelector(".stage-inspector");
    this.gear = root.querySelector(".stage-gear");
    this.gear.addEventListener("click", (e) => {
      const b = e.target.closest("[data-gear]");
      if (!b) return;
      const [act, type] = b.dataset.gear.split(":");
      if (act === "add") {
        this.store.addDevice({ id: type === "snake" ? "snake" : "sb", type, label: DEVICE_TYPES[type].name });
        this.patchView.toast(`${DEVICE_TYPES[type].name} on stage. Patch the band into it, then ${type === "snake" ? "its tails into the console" : "its AES50 A into the console's AES50 A, and set ROUTING"}.`, "");
      } else this.store.removeDevice(type);
    });
    patchView.bindRoot(this.inspector);

    this.canvas.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.canvas.addEventListener("click", (e) => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      const ear = e.target.closest("[data-listen]");
      if (ear) return this.store.setListen(ear.dataset.listen);
      const jack = e.target.closest("[data-port]");
      if (jack) return this.patchView.openPort(jack.dataset.port);
      const wire = e.target.closest(".cable[data-cable]");
      if (wire) {
        const c = this.store.state.rig.cables.find((x) => x.id === wire.dataset.cable);
        if (c) return this.patchView.openPort(c.to);
      }
      const net = e.target.closest("[data-open-dante]");
      if (net) return this.onOpenDante(net.dataset.openDante);
      const box = e.target.closest("[data-box]");
      this.select(box ? box.dataset.box : null);
    });
    this.canvas.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const ear = e.target.closest("[data-listen]");
      if (ear) {
        e.preventDefault();
        return this.store.setListen(ear.dataset.listen);
      }
      const jack = e.target.closest("[data-port]");
      const box = e.target.closest("[data-box]");
      if (!jack && !box) return;
      e.preventDefault();
      if (jack) this.patchView.openPort(jack.dataset.port);
      else this.select(box.dataset.box);
    });
    // Hovering a jack lights its whole cable (and the jack at the other end).
    this.canvas.addEventListener("pointerover", (e) => {
      const el = e.target.closest("[data-port], [data-cable]");
      this.highlight(el ? el.dataset.cable || cableAt(this.store.state.rig, el.dataset.port)?.id : null);
    });
    this.canvas.addEventListener("pointerleave", () => this.highlight(null));
  }

  setPlaying(on) {
    this.root.classList.toggle("playing", !!on);
  }

  select(id) {
    this.selected = id;
    for (const g of this.canvas.querySelectorAll("[data-box]")) g.classList.toggle("selected", g.dataset.box === id);
    this.renderInspector();
  }

  highlight(cableId) {
    if (cableId === this.lit) return;
    this.lit = cableId;
    for (const el of this.canvas.querySelectorAll(".lit")) el.classList.remove("lit");
    if (!cableId) return;
    for (const el of this.canvas.querySelectorAll(`[data-cable="${cableId}"]`)) el.classList.add("lit");
    const c = this.store.state.rig.cables.find((x) => x.id === cableId);
    if (c) for (const ref of [c.from, c.to]) this.canvas.querySelector(`[data-port="${CSS.escape(ref)}"]`)?.classList.add("lit");
  }

  render(mix) {
    this.mix = mix;
    const state = this.store.state;
    const rig = state.rig;
    const { SOURCES_BY_ID } = this.manifest;
    const skin = this.getSkin();
    const L = layoutStage(rig, {
      order: (d) => (d.sourceId ? (SOURCES_BY_ID[d.sourceId]?.order ?? 50) : DEVICE_TYPES[d.type].dante ? -1 : 90),
      channelLabels: state.channels.map((c) => c.label),
      mixerName: skin.name,
    });
    this.layout = L;
    const status = this.statuses(mix);
    const parts = [];

    // Column headings and faint bands.
    for (const c of L.columns) {
      parts.push(`<g class="col col-${c.id}"><rect class="col-band" x="${c.x - 10}" y="4" width="${c.w + 20}" height="${L.height - 4}" rx="14"/>
        <text class="col-label" x="${c.x}" y="22">${esc(c.label.toUpperCase())}</text>${c.sub ? `<text class="col-sub" x="${c.x}" y="36">${esc(c.sub)}</text>` : ""}</g>`);
    }
    for (const b of L.boxes) parts.push(this.boxSvg(b, rig, status));

    // Network links (Dante, AES50) that aren't cables in the model: drawn, not patchable.
    const fixed = this.fixedLinks(L);
    const cables = [];
    for (const f of fixed) cables.push(`<g class="cable cable-network fixed"><path class="cable-shadow" d="${cablePath(f.a, f.b)}"/><path class="cable-core" d="${cablePath(f.a, f.b)}"/></g>`);
    // A snake's multicore: one thick jacket from the stage box to its fan-out at FOH.
    for (const m of L.links || []) cables.push(`<g class="cable cable-multicore fixed"><title>Multicore: every snake channel and return in one cable, stage ↔ FOH</title><path class="cable-shadow" d="${cablePath(m.a, m.b)}"/><path class="cable-core" d="${cablePath(m.a, m.b)}"/></g>`);

    const plugs = [];
    for (const c of rig.cables) {
      const a = L.jacks.get(c.from);
      const b = L.jacks.get(c.to);
      if (!a || !b) continue;
      const def = CABLES[c.cable] || {};
      const hue = cableHue(c.id);
      const st = status.cables.get(c.id) || "ok";
      const d = cablePath(a, b);
      const kind = def.kind === "speaker" ? "speaker" : def.kind === "network" ? "network" : def.kind === "multicore" ? "multicore" : "signal";
      cables.push(`<g class="cable cable-${kind} st-${st}" data-cable="${esc(c.id)}" style="--hue:${hue}">
        <title>${esc(def.name || c.cable)}: ${esc(portLabel(rig, c.from))} → ${esc(portLabel(rig, c.to))}</title>
        <path class="cable-hit" d="${d}"/><path class="cable-shadow" d="${d}"/><path class="cable-core" d="${d}"/>${kind === "speaker" ? `<path class="cable-pair" d="${d}"/>` : ""}<path class="cable-flow" d="${d}"/></g>`);
      plugs.push(`<g data-cable="${esc(c.id)}" class="plugs st-${st}">${plugShape(a, plugKind(c.cable, a.port.jack), hue)}${plugShape(b, plugKind(c.cable, b.port.jack), hue)}${st === "warn" || st === "bad" ? this.badge(b, st) : ""}</g>`);
    }
    const jacks = [...L.jacks.values()].map((j) => this.jackSvg(j, rig));
    const nets = L.net.map((n) => this.netPortSvg(n));

    // Never shrink below ~70 %: a wide rig scrolls sideways in its frame instead.
    this.canvas.innerHTML = `<svg class="stage-svg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" style="min-width:${Math.round(L.width * 0.7)}px" role="group" aria-label="The rig: stage, console rear panel, amps and speakers">
      <defs>
        <linearGradient id="sg-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3044"/><stop offset="1" stop-color="#1b2030"/></linearGradient>
        <linearGradient id="sg-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262b3a"/><stop offset=".5" stop-color="#1e2230"/><stop offset="1" stop-color="#191c28"/></linearGradient>
      </defs>
      ${parts.join("")}
      <g class="layer-cables">${cables.join("")}</g>
      <g class="layer-jacks">${jacks.join("")}${nets.join("")}</g>
      <g class="layer-plugs">${plugs.join("")}</g>
      <g class="layer-ears">${this.earsSvg(L, rig)}</g>
      <path class="drag-cable" d="" hidden/>
    </svg>`;
    this.dragPath = this.canvas.querySelector(".drag-cable");
    this.renderGear(rig);
    if (this.selected && !L.boxes.some((b) => b.id === this.selected)) this.selected = null;
    if (this.selected) this.canvas.querySelector(`[data-box="${CSS.escape(this.selected)}"]`)?.classList.add("selected");
    this.lit = null;
    this.renderInspector();
  }

  // Free play: put a snake or a stage box on stage (or take it away).
  renderGear(rig) {
    const show = this.canAddGear();
    this.gear.hidden = !show;
    if (!show) return;
    const mixer = mixerOf(rig);
    const aes50 = DEVICE_TYPES[mixer.type].ports.some((p) => p.network === "aes50");
    const kinds = ["snake", ...(aes50 ? ["s32", "sd8"] : [])];
    const present = rig.devices.filter((d) => DEVICE_TYPES[d.type].stagebox);
    const btn = (gear, text) => `<button type="button" class="chip" data-gear="${gear}">${esc(text)}</button>`;
    this.gear.innerHTML = `<span class="stage-gear-label">Free play gear:</span>${
      present.length ? present.map((d) => btn(`remove:${d.id}`, `Remove the ${DEVICE_TYPES[d.type].name}`)).join("") : kinds.map((k) => btn(`add:${k}`, `+ ${DEVICE_TYPES[k].name}`)).join("")
    }<span class="stage-gear-note">${present.length ? "" : aes50 ? "A snake, or a digital stage box on AES50." : "Run the band through a 16 × 4 snake."}</span>`;
  }

  // Your ears: the figure stands beside what you're hearing (a speaker, or the
  // desk in headphones); every other speaker and the desk get an ear button.
  earsSvg(L, rig) {
    const state = this.store.state;
    const places = this.getPlaces();
    if (!places.length) return "";
    const spots = [];
    const at = (b) => ({ x: b.x + b.w + 22, y: b.y + b.h / 2 + 16 });
    for (const b of L.boxes.filter((x) => x.kind === "endpoint")) {
      const ep = this.mix.rig.endpoints.find((e) => e.deviceId === b.deviceId);
      const dest = ep?.output ? listenGroupOf(state, ep.output) : null;
      const place = places.find((p) => p.dest === dest);
      if (place) spots.push({ dest, place, deviceId: b.deviceId, ...at(b), heard: place.deviceIds.includes(b.deviceId) });
    }
    const console = L.boxes.find((b) => b.kind === "console");
    if (console) places.filter((p) => p.kind === "desk").forEach((p, k) => spots.push({ dest: p.dest, place: p, x: console.x + console.w + 22 + k * 26, y: console.y + 58, phones: true, heard: true }));
    // One figure: at the first speaker that's actually heard (or the first spot for that destination).
    const mine = spots.find((s) => s.dest === state.listen && s.heard) || spots.find((s) => s.dest === state.listen);
    return spots
      .map((s) => {
        const name = s.phones ? s.place.place : rig.devices.find((d) => d.id === s.deviceId)?.short || s.place.place;
        const label = `Listen here: ${name} (${s.place.label})`;
        if (s === mine) return `<g class="ear-here" aria-label="You are listening here: ${esc(s.place.place)}">${figureSvg(s.x, s.y, { scale: 0.95, phones: !!s.phones })}</g>`;
        return `<g class="ear-btn" data-listen="${esc(s.dest)}" tabindex="0" role="button" aria-label="${esc(label)}"><title>${esc(label)}</title>
          <rect class="ear-btn-hit" x="${s.x - 13}" y="${s.y - 36}" width="26" height="38" rx="8"/>${figureSvg(s.x, s.y, { scale: 0.85, phones: !!s.phones, cls: "ear-figure ear-ghost" })}</g>`;
      })
      .join("");
  }

  // Status of every source, speaker, channel and cable, from the analysis.
  statuses(mix) {
    const rig = this.store.state.rig;
    const devices = new Map();
    const cables = new Map();
    const tone = (s) => (s === "ok" ? "ok" : s === "danger" ? "bad" : s === "empty" || s === "unpatched" ? "idle" : "warn");
    // Sources: what their channels say.
    const inputs = [...mix.channels.map((c) => c.input), ...Object.values(mix.rig.recorders || {}).flat()].filter((i) => i && i.connected);
    for (const d of rig.devices.filter((x) => DEVICE_TYPES[x.type].source)) {
      const mine = inputs.filter((i) => i.sourceDeviceId === d.id);
      const worst = mine.find((i) => i.status === "danger") || mine.find((i) => i.status !== "ok");
      // Plugged in (into a snake or stage box) but no channel hears it.
      const plugged = DEVICE_TYPES[d.type].ports.some((p) => cableAt(rig, `${d.id}/${p.id}`));
      devices.set(d.id, !mine.length ? (plugged ? { tone: "warn", text: "! No channel" } : { tone: "idle", text: "Unpatched" }) : worst ? { tone: tone(worst.status), text: worst.status === "danger" ? "✕ Danger" : "! Check" } : { tone: "ok", text: "✓ Signal" });
    }
    const mixer = mixerOf(rig);
    const mixerPorts = mixer ? DEVICE_TYPES[mixer.type].ports : [];
    for (const c of rig.cables) {
      const to = getPort(rig, c.to);
      if (!to) continue;
      if (isMixer(to.device) && to.role === "channel-input") {
        const info = mix.rig.channels[to.channel];
        cables.set(c.id, !info || info.fromPort !== c.from ? "idle" : tone(info.status));
      }
    }
    // Speakers and cameras: their whole chain.
    const terms = this.getSkin().terms;
    for (const ep of mix.rig.endpoints) {
      // A routed output (X32, CL3, DM2000) is named by what its routing puts on it.
      const routed = this.store.state.routing?.[ep.output];
      const out = routed && routed !== "off" ? routed : ep.output;
      const busName = ({ "main-l": "Main L", "main-r": "Main R" })[out] || terms[out] || (routed ? out.toUpperCase().replace(/^([A-Z]+)(\d+)$/, "$1 $2") : mixerPorts.find((p) => p.id === out)?.name) || out;
      const text = ep.valid ? `${ep.status === "hot" ? "⚠ Hot" : ep.status === "weak" ? "⚠ Weak" : "✓"} ${busName}` : ep.status === "unpatched" ? "Silent" : ep.status === "danger" ? "✕ Danger" : "✕ No sound";
      devices.set(ep.deviceId, { tone: ep.valid ? (ep.status === "ok" ? "ok" : "warn") : tone(ep.status), text });
      const into = rig.cables.find((c) => c.to.startsWith(`${ep.deviceId}/`));
      if (into) cables.set(into.id, ep.valid ? (ep.status === "ok" ? "ok" : "warn") : ep.status === "danger" ? "bad" : "warn");
    }
    return { devices, cables };
  }

  badge(j, st) {
    return `<g class="badge badge-${st}" transform="translate(${j.x + 11} ${j.y - 13})"><circle r="7"/><text y="3.5" text-anchor="middle">${st === "bad" ? "✕" : "!"}</text></g>`;
  }

  boxSvg(b, rig, status) {
    const d = rig.devices.find((x) => x.id === b.deviceId);
    const type = DEVICE_TYPES[d.type];
    const st = b.kind === "source" || b.kind === "endpoint" ? status.devices.get(d.id) : null;
    const title = b.title || d.label || type.name;
    const label = `${title}${st ? `, ${st.text}` : ""}`;
    const parts = [`<rect class="box-bg" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"/>`];
    if (b.kind === "console" || b.kind === "stagebox") {
      parts.push(`<rect class="box-bar" x="${b.x}" y="${b.y}" width="${b.w}" height="26" rx="10"/><rect class="box-bar" x="${b.x}" y="${b.y + 14}" width="${b.w}" height="12"/>`);
      parts.push(`<text class="box-title" x="${b.x + 12}" y="${b.y + 18}">${esc(title)}</text>`);
      if (b.sub) parts.push(`<text class="box-sub" x="${b.x + b.w - 12}" y="${b.y + 18}" text-anchor="end">${esc(b.sub)}</text>`);
      for (const s of b.sections || []) parts.push(`<text class="panel-section" x="${b.x + 12}" y="${b.y + s.y}">${esc(s.title)}</text>`);
      // Screws in the corners: it's a panel.
      for (const [sx, sy] of [[8, 34], [b.w - 8, 34], [8, b.h - 8], [b.w - 8, b.h - 8]]) parts.push(`<circle class="screw" cx="${b.x + sx}" cy="${b.y + sy}" r="2.6"/>`);
    } else {
      const ico = deviceIconName(d);
      const icoX = b.kind === "source" ? b.x + 10 : b.x + b.w - 50;
      parts.push(`<g class="box-ico" transform="translate(${icoX} ${b.y + 8})">${icon(ico, { size: 40 })}</g>`);
      const tx = b.kind === "source" ? b.x + 56 : b.kind === "endpoint" ? b.x + 40 : b.x + 12;
      const short = DEVICE_TYPES[d.type].source && d.sourceId ? this.manifest.SOURCES_BY_ID[d.sourceId]?.name || title : title.replace(/^(Powered|Passive) (speaker|wedge) · /, "");
      const sub = b.kind === "source" ? (d.sourceId ? this.manifest.SOURCES_BY_ID[d.sourceId]?.device || type.name : type.name) : b.kind === "endpoint" ? (type.camera ? "Camera input" : type.amp === "internal" ? "Powered: amp inside" : "Passive: needs an amp") : type.name;
      parts.push(`<text class="box-name" x="${tx}" y="${b.y + 22}">${esc(clip(short, b.kind === "rack" ? 17 : 20))}</text><text class="box-sub" x="${tx}" y="${b.y + 37}">${esc(clip(sub, 26))}</text>`);
      if (st) parts.push(`<g class="pill pill-${st.tone}" transform="translate(${tx} ${b.y + 44})"><rect width="${8 + st.text.length * 6.2}" height="16" rx="8"/><text x="6" y="11.5">${esc(st.text)}</text></g>`);
      if (type.dante) parts.push(`<text class="box-sub" x="${tx}" y="${b.y + b.h - 10}">Tracks go out over Dante</text>`);
    }
    return `<g class="sbox kind-${b.kind} ${st ? `tone-${st.tone}` : ""}" data-box="${esc(b.id)}" tabindex="0" role="button" aria-label="${esc(label)}: show details">${parts.join("")}</g>`;
  }

  jackSvg(j, rig) {
    const p = j.port;
    const cable = cableAt(rig, j.ref);
    const name = jackIconName(p.jack, p.dir);
    const other = cable ? (cable.from === j.ref ? cable.to : cable.from) : null;
    const lvl = SIGNAL_LEVELS[p.level];
    const desc = `${portLabel(rig, j.ref)} (${JACKS[p.jack]?.name || p.jack}${lvl ? `, ${lvl.name.toLowerCase()}` : ""}): ${other ? `connected to ${portLabel(rig, other)}` : "empty"}`;
    const size = p.jack === "mini" ? 16 : p.jack === "rca" ? 18 : 23;
    const art = name ? `<g transform="translate(${j.x - size / 2} ${j.y - size / 2})">${icon(name, { size })}</g>` : `<rect class="jack-ethercon" x="${j.x - 10}" y="${j.y - 9}" width="20" height="18" rx="3"/><rect x="${j.x - 5}" y="${j.y - 4}" width="10" height="7" class="jack-rj"/>`;
    const head = j.head ? `<text class="jack-head" x="${j.x}" y="${j.y - JACK / 2 - 3}" text-anchor="middle">${esc(j.head)}</text>` : "";
    const word = j.word ? `<text class="jack-word" x="${j.wordSide === "right" ? j.x + 16 : j.wordSide === "left" ? j.x - 16 : j.x}" y="${j.wordSide ? j.y + 3 : j.y + JACK / 2 + 3}" text-anchor="${j.wordSide === "right" ? "start" : j.wordSide === "left" ? "end" : "middle"}">${esc(j.word)}</text>` : "";
    return `<g class="sjack ${cable ? "is-on" : ""} jack-${p.dir}" data-port="${esc(j.ref)}" ${cable ? `data-cable="${esc(cable.id)}"` : ""} tabindex="0" role="button" aria-label="${esc(desc)}">
      <title>${esc(desc)}</title>${head}<circle class="jack-hit" cx="${j.x}" cy="${j.y}" r="14"/>${art}${word}</g>`;
  }

  // Network ports drawn on boxes that aren't patchable jacks (Dante on the console and the Rio).
  netPortSvg(n) {
    const what = n.kind === "dante" ? "Dante (primary)" : "AES50";
    return `<g class="netport net-${n.kind}" ${n.kind === "dante" ? 'data-open-dante="controller"' : ""} tabindex="0" role="button" aria-label="${what} network port${n.kind === "dante" ? ": open Dante Controller" : ""}">
      <title>${what}: a network port. One cable carries many channels.${n.kind === "dante" ? " Routes are set in Dante Controller." : ""}</title>
      <rect class="jack-ethercon" x="${n.x - 11}" y="${n.y - 10}" width="22" height="20" rx="4"/><rect x="${n.x - 6}" y="${n.y - 5}" width="12" height="8" class="jack-rj"/>
      <text class="jack-word" x="${n.x - 16}" y="${n.y + 4}" text-anchor="end">${n.kind === "dante" ? "DANTE" : "AES50"}</text></g>`;
  }

  // Network cables that are always there: the Rio and the DAW laptop to the console's Dante port.
  fixedLinks(L) {
    const consoleNet = L.net.find((n) => n.boxId === "mixer" && n.kind === "dante");
    if (!consoleNet) return [];
    return L.net.filter((n) => n.kind === "dante" && n !== consoleNet).map((n) => ({ a: { x: n.x, y: n.y, side: n.boxId.startsWith("panel-") ? "down" : "right" }, b: { x: consoleNet.x, y: consoleNet.y, side: "down" } }));
  }

  renderInspector() {
    const id = this.selected;
    if (!id) {
      this.inspector.innerHTML = "";
      this.inspector.hidden = true;
      return;
    }
    const rig = this.store.state.rig;
    const deviceId = id.startsWith("panel-") ? "mixer" : id;
    const d = rig.devices.find((x) => x.id === deviceId);
    const html = this.patchView.cards.get(deviceId);
    this.inspector.hidden = false;
    const title = isMixer(d) ? `${this.getSkin().name}: outputs` : d.label || DEVICE_TYPES[d.type].name;
    this.inspector.innerHTML = `<div class="insp-head"><h3>${esc(title)}</h3><button type="button" class="patch-x" data-close-insp aria-label="Close details">✕</button></div>
      ${html ? `<ul class="${isMixer(d) ? "" : "source-list device-list"} insp-body">${html}</ul>` : `<p class="insp-empty">Its jacks are on the diagram: tap one to patch it.</p>`}`;
    this.inspector.querySelector("[data-close-insp]").addEventListener("click", () => this.select(null));
  }

  // ---------- dragging a cable ----------

  svgPoint(e) {
    const svg = this.canvas.querySelector("svg");
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  pointerDown(e) {
    const jackEl = e.target.closest("[data-port]");
    if (!jackEl || e.button > 0) return;
    const ref = jackEl.dataset.port;
    const j = this.layout.jacks.get(ref);
    const rig = this.store.state.rig;
    const cable = cableAt(rig, ref);
    // Dragging a plugged jack picks up that cable's end; the far end stays put.
    const anchor = cable ? this.layout.jacks.get(cable.from === ref ? cable.to : cable.from) : j;
    this.drag = { ref, cable, anchor, startX: e.clientX, startY: e.clientY, moved: false, id: e.pointerId };
    const move = (ev) => this.pointerMove(ev);
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      this.pointerUp(ev);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  pointerMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8) return;
    if (!d.moved) {
      d.moved = true;
      this.root.classList.add("dragging");
      if (d.cable) this.canvas.querySelectorAll(`[data-cable="${CSS.escape(d.cable.id)}"]`).forEach((el) => el.classList.add("lifted"));
    }
    e.preventDefault();
    const p = this.svgPoint(e);
    const target = this.dropTarget(e);
    for (const el of this.canvas.querySelectorAll(".drop-ok")) el.classList.remove("drop-ok");
    target?.classList.add("drop-ok");
    const t = target ? this.layout.jacks.get(target.dataset.port) : null;
    const end = t || { x: p.x, y: p.y, side: d.anchor.side === "right" ? "left" : d.anchor.side === "left" ? "right" : "down" };
    this.dragPath.setAttribute("d", cablePath(d.anchor, end));
    this.dragPath.hidden = false;
  }

  dropTarget(e, from = this.drag?.ref) {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-port]");
    return el && el.dataset.port !== from && this.canvas.contains(el) ? el : null;
  }

  pointerUp(e) {
    const d = this.drag;
    this.drag = null;
    this.root.classList.remove("dragging");
    if (!d || !d.moved) return;
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 0);
    this.dragPath.hidden = true;
    for (const el of this.canvas.querySelectorAll(".drop-ok, .lifted")) el.classList.remove("drop-ok", "lifted");
    const target = this.dropTarget(e, d.ref);
    if (!target) return;
    const to = target.dataset.port;
    if (!d.cable) return this.patchView.openBetween(d.ref, to);
    // Move a plugged cable's end: same cable, new jack. Put it back if it doesn't go.
    const keep = d.cable.from === d.ref ? d.cable.to : d.cable.from;
    const keepPort = getPort(this.store.state.rig, keep);
    const [from, into] = keepPort.dir === "out" ? [keep, to] : [to, keep];
    this.store.disconnect(d.cable.id);
    const r = this.store.connect(from, into, d.cable.cable);
    if (!r.ok) {
      const [f0, t0] = [d.cable.from, d.cable.to];
      this.store.connect(f0, t0, d.cable.cable);
      this.patchView.toast(r.reason, "bad");
    } else this.patchView.toast(`Moved: ${portLabel(this.store.state.rig, from)} → ${portLabel(this.store.state.rig, into)}`, "ok");
  }
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
