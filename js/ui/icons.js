// Original SVG icon library for gear, connectors and signal types. Pure string
// builders (no DOM), so it runs under node --test.
//
// These are pictures only. Whether a plug fits a jack, or a signal makes sense,
// is decided by js/connection-model.js; nothing here reads or affects that.
// Style: 48×48, 2 px strokes in currentColor, soft fill on solid shapes. Shape
// carries the meaning (never colour alone): active speakers have a power badge
// and an amp module, passive ones have speaker terminals and no power mark.
//
//   icon("passive-wedge")                       decorative (aria-hidden): nearby text names it
//   icon("xlr-m", { label: "XLR male plug" })   meaningful on its own (role="img")

const F = ' fill="currentColor" fill-opacity=".18"'; // soft fill
const S = ' fill="currentColor" stroke="none"'; // solid
const ACC = ' class="acc"'; // accent stroke (CSS)

// ----- shared pieces -----

const powerBadge = (cx, cy) =>
  `<g class="ico-power"><circle cx="${cx}" cy="${cy}" r="6" class="badge"/><path d="M${cx + 1} ${cy - 4} l-3.5 4.6 h3 l-1 3.4 l3.6 -4.8 h-3 z"${S}/></g>`;
const terminals = (cx, cy) => `<g class="ico-terminals"><circle cx="${cx - 4}" cy="${cy}" r="1.7"${S}/><circle cx="${cx + 4}" cy="${cy}" r="1.7"${S}/></g>`;
const ampModule = (x, y, w) => `<rect class="ico-amp" x="${x}" y="${y}" width="${w}" height="5" rx="1" stroke-dasharray="2 2" stroke-width="1.5"/>`;
// Plug seen from the side, pointing right. `rings` insulator bands (TS 1, TRS 2).
function plug({ y = 24, h = 12, sh = 8, x0 = 3, xs = 22, xt = 38, rings = 2 }) {
  const top = y - h / 2;
  const s = y - sh / 2;
  const bands = [xt - 9, xt - 5].slice(2 - rings).map((x) => `<rect x="${x}" y="${s}" width="2" height="${sh}"${S}/>`).join("");
  return `<rect x="${x0}" y="${top}" width="${xs - x0}" height="${h}" rx="1.5"${F}/><rect x="${xs}" y="${s}" width="${xt - xs}" height="${sh}"/>${bands}<path d="M${xt} ${s} L${xt + 7} ${y} L${xt} ${s + sh} Z"${F}/>`;
}
const wave = (x, y, amp, cycles, len, sw) => {
  const step = len / (cycles * 2);
  let d = `M${x} ${y}`;
  for (let i = 0; i < cycles * 2; i++) d += ` q${step / 2} ${i % 2 ? amp : -amp} ${step} 0`;
  return `<path d="${d}" stroke-width="${sw}"/>`;
};

// ----- registry: name → { label, body } -----

const ICONS = {
  // ---- devices ----
  "pa-speaker-active": {
    label: "Powered speaker (amplifier built in)",
    body: `<path d="M12 5h24l3 38H9z"${F}/><circle cx="24" cy="13" r="3.5"/><circle cx="24" cy="27" r="8"/><circle cx="24" cy="27" r="3"${S}/>${ampModule(15, 37, 18)}${powerBadge(38, 9)}`,
  },
  "pa-speaker-passive": {
    label: "Passive speaker (no amplifier inside)",
    body: `<path d="M12 5h24l3 38H9z"${F}/><circle cx="24" cy="13" r="3.5"/><circle cx="24" cy="27" r="8"/><circle cx="24" cy="27" r="3"${S}/>${terminals(24, 39.5)}`,
  },
  "wedge-active": {
    label: "Powered wedge monitor (amplifier built in)",
    body: `<path d="M5 37L12 14h24l7 23z"${F}/><rect x="19" y="17" width="10" height="4" rx="1"/><circle cx="24" cy="26.5" r="5"/><circle cx="24" cy="26.5" r="2"${S}/>${ampModule(15, 32, 18)}${powerBadge(39, 12)}<path d="M3 41h42" stroke-width="1.5"/>`,
  },
  "wedge-passive": {
    label: "Passive wedge monitor (no amplifier inside)",
    body: `<path d="M5 37L12 14h24l7 23z"${F}/><rect x="19" y="17" width="10" height="4" rx="1"/><circle cx="24" cy="26.5" r="5"/><circle cx="24" cy="26.5" r="2"${S}/>${terminals(24, 34.5)}<path d="M3 41h42" stroke-width="1.5"/>`,
  },
  "power-amp": {
    label: "Rack power amplifier: line level in, speaker level out",
    body: `<rect x="3" y="10" width="42" height="20" rx="2"${F}/><circle cx="6" cy="14" r="1.1"${S}/><circle cx="6" cy="26" r="1.1"${S}/><circle cx="42" cy="14" r="1.1"${S}/><circle cx="42" cy="26" r="1.1"${S}/><circle cx="12" cy="16" r="2.4"/><circle cx="12" cy="24" r="2.4"/><path d="M19 15h10M19 20h10M19 25h10" stroke-width="1.5"/><rect x="34" y="14" width="5" height="4" rx="1" stroke-width="2.6"/><rect x="34" y="22" width="5" height="4" rx="1" stroke-width="2.6"/>${wave(5, 40, 2, 1.5, 12, 1.5)}<path d="M20 40h5m-2 -2 l2 2 l-2 2" stroke-width="1.5"/>${wave(30, 40, 4.5, 1.5, 15, 3)}`,
  },
  laptop: {
    label: "Laptop playback source",
    body: `<rect x="9" y="8" width="30" height="21" rx="2"${F}/><path d="M22 23a2 2 0 1 1 2-2v-8l6 1.5" stroke-width="1.8"/><path d="M4 33h40l-3 5H7z"${F}/>`,
  },
  camera: {
    label: "Video camera with XLR audio inputs",
    body: `<rect x="5" y="16" width="27" height="19" rx="2"${F}/><path d="M32 22l11-6v19l-11-6z"${F}/><circle cx="14" cy="25.5" r="4.5" stroke-width="1.6"/><path d="M9 16v-5h16v5M21 11v-3h5" stroke-width="1.6"/>`,
  },
  mic: {
    label: "Dynamic microphone",
    body: `<circle cx="24" cy="13" r="8"${F}/><path d="M17 12h14M18 16h12" stroke-width="1.4"/><path d="M19.5 21l2 22h5l2-22"${F}/>`,
  },
  "mic-condenser": {
    label: "Condenser microphone (needs +48 V)",
    body: `<rect x="16" y="4" width="16" height="22" rx="8"${F}/><path d="M16 11h16M16 15h16M16 19h16" stroke-width="1.4"/><path d="M13 24q0 7 11 7t11-7" stroke-width="1.6"/><path d="M21 31l1 12h4l1-12"${F}/>`,
  },
  "di-box": {
    label: "DI box",
    body: `<rect x="6" y="12" width="36" height="22" rx="3"${F}/><circle cx="16" cy="23" r="4.5"/><circle cx="16" cy="23" r="1.6"${S}/><circle cx="33" cy="23" r="5"/><circle cx="31" cy="21.5" r="1"${S}/><circle cx="35" cy="21.5" r="1"${S}/><circle cx="33" cy="26" r="1"${S}/>`,
  },
  keyboard: {
    label: "Keyboard",
    body: `<rect x="3" y="14" width="42" height="20" rx="2"${F}/><path d="M9.8 24v10M16.6 24v10M23.4 24v10M30.2 24v10M37 24v10M3 24h42" stroke-width="1.4"/><rect x="8" y="17" width="3.5" height="7"${S}/><rect x="14.8" y="17" width="3.5" height="7"${S}/><rect x="28.4" y="17" width="3.5" height="7"${S}/><rect x="35.2" y="17" width="3.5" height="7"${S}/>`,
  },
  mixer: {
    label: "Mixer",
    body: `<rect x="4" y="7" width="40" height="34" rx="3"${F}/><circle cx="12" cy="13" r="2"/><circle cx="20" cy="13" r="2"/><circle cx="28" cy="13" r="2"/><circle cx="36" cy="13" r="2"/><path d="M12 19v16M20 19v16M28 19v16M36 19v16" stroke-width="1.4"/><rect x="9.5" y="27" width="5" height="3.4" rx="1"${S}/><rect x="17.5" y="22" width="5" height="3.4" rx="1"${S}/><rect x="25.5" y="30" width="5" height="3.4" rx="1"${S}/><rect x="33.5" y="24" width="5" height="3.4" rx="1"${S}/>`,
  },

  "stage-box": {
    label: "Stage box: a row of XLR inputs that all travel to the console on one cable",
    body: `<rect x="4" y="10" width="40" height="22" rx="2"${F}/><circle cx="11" cy="17" r="2.6"/><circle cx="19" cy="17" r="2.6"/><circle cx="27" cy="17" r="2.6"/><circle cx="35" cy="17" r="2.6"/><circle cx="11" cy="25" r="2.6"/><circle cx="19" cy="25" r="2.6"/><circle cx="27" cy="25" r="2.6"/><circle cx="35" cy="25" r="2.6"/><path d="M24 32v5q0 5 6 5h14" stroke-width="3.4"/>`,
  },

  // ---- connectors: XLR and SpeakON/IEC are end-on views, the rest side views ----
  "xlr-m": {
    label: "XLR male plug",
    body: `<circle cx="24" cy="25" r="17"${F}/><path d="M21 8V4h6v4"/><circle cx="24" cy="25" r="12" stroke-width="1.4"/><circle cx="24" cy="18" r="2.6"${S}/><circle cx="17.5" cy="29.5" r="2.6"${S}/><circle cx="30.5" cy="29.5" r="2.6"${S}/>`,
  },
  "xlr-f": {
    label: "XLR female plug",
    body: `<circle cx="24" cy="25" r="17"${F}/><path d="M21 8V4h6v4"/><circle cx="24" cy="25" r="12" stroke-width="1.4"/><circle cx="24" cy="18" r="3.2"/><circle cx="17.5" cy="29.5" r="3.2"/><circle cx="30.5" cy="29.5" r="3.2"/><path d="M20 42h8" stroke-width="3"/>`,
  },
  trs14: { label: '1/4 inch TRS plug (tip, ring, sleeve)', body: plug({ rings: 2 }) },
  ts14: { label: '1/4 inch TS plug (tip, sleeve)', body: plug({ rings: 1 }) },
  trs35: { label: "3.5 mm TRS plug (headphone jack)", body: plug({ h: 9, sh: 5, xs: 20, xt: 37, rings: 2 }) },
  rca: {
    label: "RCA plug",
    body: `<rect x="3" y="17" width="16" height="14" rx="2"${F}/><path d="M19 19h14v10H19M29 19v-2M29 29v2M33 19v2M33 29v-2" stroke-width="1.6"/><path d="M33 24h11" stroke-width="3"/>`,
  },
  "ts-pair": {
    label: "Breakout: two 1/4 inch TS plugs (left and right)",
    body: `<path d="M3 24h6l4-9h4M9 24l4 9h4" stroke-width="2.4"/><g transform="translate(0 -9) scale(.7)">${plug({ x0: 20, xs: 33, xt: 47, rings: 1, y: 36 })}</g><g transform="translate(0 9) scale(.7)">${plug({ x0: 20, xs: 33, xt: 47, rings: 1, y: 36 })}</g>`,
  },
  speakon: {
    label: "SpeakON speaker connector (twist-lock)",
    body: `<circle cx="24" cy="24" r="18"${F}/><circle cx="24" cy="24" r="12" stroke-width="1.4"/><circle cx="17" cy="17" r="2.6"${S}/><circle cx="31" cy="17" r="2.6"${S}/><circle cx="17" cy="31" r="2.6"${S}/><circle cx="31" cy="31" r="2.6"${S}/><path d="M22 6h4M22 42h4" stroke-width="3"/><path d="M8 27a17 17 0 0 0 4 8m0 0l-4.5-.3m4.5.3l.3-4.6" stroke-width="1.4"/>`,
  },
  ethercon: {
    label: "etherCON plug: a network (RJ45) plug in a locking round shell",
    body: `<circle cx="24" cy="24" r="17"${F}/><path d="M21 7V4h6v3"/><rect x="15" y="17" width="18" height="14" rx="1.5"/><path d="M18 31v-4M21 31v-4M24 31v-4M27 31v-4M30 31v-4" stroke-width="1.2"/><path d="M20 17v-3h8v3" stroke-width="1.6"/>`,
  },
  iec: {
    label: "IEC power cable end (AC power, not a signal cable)",
    body: `<path d="M8 8h32v20l-7 12H15L8 28z"${F}/><rect x="14" y="14" width="5" height="11" rx="1"/><rect x="29" y="14" width="5" height="11" rx="1"/><rect x="21.5" y="26" width="5" height="9" rx="1"/>`,
  },

  // ---- jacks (the sockets on gear), end-on ----
  "jack-combo": {
    label: 'XLR and 1/4 inch combo jack',
    body: `<circle cx="24" cy="24" r="17"${F}/><path d="M21 7V4h6v3"/><circle cx="24" cy="24" r="6"/><circle cx="24" cy="24" r="2"${S}/><circle cx="24" cy="12.5" r="1.6"${S}/><circle cx="14.5" cy="30" r="1.6"${S}/><circle cx="33.5" cy="30" r="1.6"${S}/>`,
  },
  "jack-quarter": { label: '1/4 inch jack', body: `<circle cx="24" cy="24" r="15"${F}/><circle cx="24" cy="24" r="8"/><circle cx="24" cy="24" r="3"${S}/>` },
  "jack-mini": { label: "3.5 mm jack", body: `<circle cx="24" cy="24" r="10"${F}/><circle cx="24" cy="24" r="5"/><circle cx="24" cy="24" r="2"${S}/>` },
  "jack-rca": { label: "RCA jack", body: `<circle cx="24" cy="24" r="14"${F}/><circle cx="24" cy="24" r="9" stroke-dasharray="5 3"/><circle cx="24" cy="24" r="3"${S}/>` },
  "jack-ethercon": { label: "etherCON jack (network)", body: `<circle cx="24" cy="24" r="17"${F}/><rect x="15" y="16" width="18" height="15" rx="1.5"/><rect x="20" y="31" width="8" height="3"${S}/><path d="M18 20h12" stroke-width="1.2"/>` },
  "jack-pair": { label: 'Left and right 1/4 inch jacks', body: `<circle cx="13" cy="24" r="10"${F}/><circle cx="13" cy="24" r="5"/><circle cx="13" cy="24" r="1.8"${S}/><circle cx="35" cy="24" r="10"${F}/><circle cx="35" cy="24" r="5"/><circle cx="35" cy="24" r="1.8"${S}/>` },

  // ---- signal and cable kinds (shape and weight differ, not just colour) ----
  "level-line": { label: "Line level: small, thin signal", body: `${wave(4, 24, 3.5, 2, 40, 1.6)}` },
  "level-speaker": { label: "Speaker level: large, heavy, amplified", body: `${wave(4, 24, 11, 2, 40, 3.6)}<path d="M22 6l-3 5h4l-3 5" stroke-width="1.6"/>` },
  "cable-signal": { label: "Signal cable", body: `<circle cx="7" cy="24" r="3"${S}/><circle cx="41" cy="24" r="3"${S}/><path d="M10 24h28" stroke-width="2"/>` },
  "cable-speaker": { label: "Speaker cable (heavy, unshielded)", body: `<circle cx="7" cy="24" r="3"${S}/><circle cx="41" cy="24" r="3"${S}/><path d="M10 21.5h28M10 26.5h28" stroke-width="3"/>` },
  "cable-network": { label: "Network cable (many channels on one cable)", body: `<rect x="2" y="19" width="8" height="10" rx="2"${F}/><rect x="38" y="19" width="8" height="10" rx="2"${F}/><path d="M10 24h28" stroke-width="2.6"/><path d="M14 24h2M19 24h2M24 24h2M29 24h2M34 24h1" stroke-width="5" stroke-opacity=".5"/>` },
  "cable-power": { label: "Power cable (AC)", body: `<path d="M4 24h22" stroke-width="3" stroke-dasharray="6 3"/><rect x="26" y="17" width="10" height="14" rx="2"${F}/><path d="M36 20h7M36 28h7" stroke-width="2.4"/>` },
  "role-source": { label: "Source: sends signal out", body: `<circle cx="14" cy="24" r="7"${F}/><path d="M22 24h20m-6 -6l6 6l-6 6" stroke-width="2.4"/>` },
  "role-destination": { label: "Destination: receives signal", body: `<path d="M6 24h20m-6 -6l6 6l-6 6" stroke-width="2.4"/><path d="M34 12v24" stroke-width="4"/><path d="M40 16v16" stroke-width="2"/>` },
};

export const ICON_NAMES = Object.keys(ICONS);
export const iconLabel = (name) => (ICONS[name] ? ICONS[name].label : "");

// Returns an <svg> string. Pass `label: true` to use the icon's own description,
// or a string to override it; otherwise it is decorative (hidden from screen readers).
export function icon(name, { label = false, size = 40, cls = "" } = {}) {
  const def = ICONS[name];
  if (!def) throw new Error(`Unknown icon: ${name}`);
  const text = label === true ? def.label : label;
  const a11y = text ? `role="img" aria-label="${text.replace(/"/g, "&quot;")}"` : `aria-hidden="true" focusable="false"`;
  return `<svg class="ico ico-${name} ${cls}" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${def.body}</svg>`;
}

// ----- mapping the model onto pictures (presentation only) -----

const TYPE_ICONS = {
  "dynamic-mic": "mic",
  "condenser-mic": "mic-condenser",
  "di-box": "di-box",
  "line-source": "keyboard",
  "stereo-laptop": "laptop",
  mixer: "mixer",
  cr1604: "mixer",
  "power-amp": "power-amp",
  "camera-input": "camera",
  "dslr-input": "camera",
  snake: "stage-box",
  s32: "stage-box",
  sd8: "stage-box",
};

// A device's icon. Speakers depend on powered/passive and on where they sit (stage = wedge).
export function deviceIconName(device, type) {
  if (TYPE_ICONS[device.type]) return TYPE_ICONS[device.type];
  if (device.id === "mixer") return "mixer"; // every real mixer (compact ones included)
  const active = device.type === "powered-speaker";
  if (device.zone === "stage") return active ? "wedge-active" : "wedge-passive";
  return active ? "pa-speaker-active" : "pa-speaker-passive";
}

// An XLR plug into an output jack is female; into an input jack it is male.
export function plugIconName(plugId, intoDir = "in") {
  if (plugId === "xlr") return intoDir === "out" ? "xlr-f" : "xlr-m";
  return { trs14: "trs14", ts14: "ts14", rca: "rca", trs35: "trs35", dualts14: "ts-pair", ethercon: "ethercon" }[plugId] || null;
}

// A port's jack (the socket on the gear). XLR on an output is male, on an input female.
export function jackIconName(jackId, dir = "in") {
  return { xlr: dir === "out" ? "xlr-m" : "xlr-f", combo: "jack-combo", quarter: "jack-quarter", rca: "jack-rca", mini: "jack-mini", linepair: "jack-pair", rcapair: "jack-rca", ethercon: "jack-ethercon" }[jackId] || null;
}

export const levelIconName = (level) => (level === "speaker" ? "level-speaker" : "level-line");

// Guide shown under the Sources panel: every connector students meet in the lab.
export const CONNECTOR_GUIDE = [
  ["xlr-m", "XLR male", "Mic and line cables. Mixer XLR outputs are male; mic-preamp inputs are female."],
  ["xlr-f", "XLR female", "The other end of an XLR cable, or the mixer's mic input."],
  ["trs14", '1/4″ TRS', "Two bands: tip, ring, sleeve. Balanced line level."],
  ["ts14", '1/4″ TS', "One band: tip and sleeve. Guitar cable, and also speaker cable. Same plug, different job."],
  ["trs35", "3.5 mm TRS", "Headphone jack size: phones and laptops. Stereo."],
  ["rca", "RCA", "Consumer gear: players and record outputs."],
  ["speakon", "SpeakON", "Twist-lock speaker connector. Speaker level only."],
  ["ethercon", "etherCON", "A network plug in a locking shell. One Cat5 cable carries every channel of a digital stage box (AES50, Dante)."],
  ["iec", "IEC power", "AC power cord for amps and powered speakers. Carries power, not audio."],
];
