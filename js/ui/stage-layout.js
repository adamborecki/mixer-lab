// Where everything sits in the Stage & patch diagram. Pure geometry from the
// rig (no DOM), so it runs under node --test.
//
// Signal flows left to right, and each column is a place in the venue:
//
//   ON STAGE        STAGE BOX        FRONT OF HOUSE         AMP RACK /      SPEAKERS
//   sources    →    (snake, Rio,  →  the console's     →    outboard   →    house & stage
//                   S32, SD8)        rear panel
//
// Every physical jack in the model gets a position and the side its cable
// leaves from. Network-only ports (Dante RX, AES50 channels) are not jacks:
// their audio rides one network cable, drawn between the boxes' network ports.

import { DEVICE_TYPES, isMixer } from "../connection-model.js";

export const JACK = 30; // one jack's cell (px in the diagram's own units)
const PAD = 12;
const GAP = 14; // between boxes in a column
const COL_GAP = 78; // between columns: room for the cables to bend
const TOP = 46; // below the column headings
const HEAD = 30; // a box's title bar

// Ports that are a socket you can plug a cable into.
export const isPhysical = (p) => p.jack !== "dante" && p.jack !== "aes50";

// Which column a device belongs in.
export function columnOf(device) {
  const type = DEVICE_TYPES[device.type];
  if (!type) return null;
  if (isMixer(device)) return "foh";
  if (type.stagebox) return "box";
  if (type.source) return "stage";
  if (type.endpoint) return "speakers";
  return "rack"; // amps, effects units, recorders
}

const COLUMNS = [
  { id: "stage", label: "On stage", sub: "sources" },
  { id: "box", label: "Stage box", sub: "one cable to FOH" },
  { id: "foh", label: "Front of house", sub: "console rear panel" },
  { id: "rack", label: "Amp rack & outboard", sub: "" },
  { id: "speakers", label: "Speakers & cameras", sub: "stage and house" },
];

// A short name printed next to a jack on a crowded panel.
export function shortLabel(p) {
  let n = p.name.replace(/\s*\(.*?\)\s*/g, " ").trim().toUpperCase();
  n = n
    .replace(/^(XLR|RIO) OUT /, "OUT ")
    .replace(/\b(MASTER|MAIN) OUT\b/, "MAIN")
    .replace(/\bSTEREO OUT\b/, "ST")
    .replace(/(?!^)\b(OUTPUT|OUT|SEND)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (n || p.name.toUpperCase()).slice(0, 8);
}

// An amp's or effect's jack: IN A / SPEAKER OUT A, INPUT L / OUTPUT R, recorder INPUT 1.
function rackWord(p) {
  if (p.pair) return p.dir === "in" ? `LINE IN ${p.pair.toUpperCase()}` : `SPEAKER OUT ${p.pair.toUpperCase()}`;
  return p.name.replace(/\s*\(.*?\)\s*/g, " ").trim().toUpperCase();
}

// The tiny word under a jack in a channel column.
function pathWord(p) {
  if (p.role === "bus-out") return /INSERT/i.test(p.name) ? "INS" : /DIRECT/i.test(p.name) ? "DIR" : "OUT";
  if (p.stereo) return p.jack === "rcapair" ? "RCA" : p.jack === "mini" ? "3.5" : "L/R";
  if (p.monoIn) return "L/MONO";
  if (p.path === "mic" || p.jack === "xlr") return "MIC";
  if (p.path === "line") return "LINE";
  return ""; // a combo jack: the plug decides
}

// The side a cable leaves a jack from: sources out to the right, amp and
// speaker inputs from the left, panel jacks downward (cables drape).
function sideFor(col, p) {
  if (col === "foh" || col === "box") return "down";
  if (col === "stage") return "right";
  return p.dir === "in" ? "left" : "right";
}

// Lays out the rig. `order(device)` sorts the sources (band input-list order);
// `channelLabels[i]` names mixer channel i ("01", "9/10", "TAPE").
export function layoutStage(rig, { order = () => 0, channelLabels = [], mixerName = "" } = {}) {
  const boxes = [];
  const jacks = new Map();
  const net = []; // network ports: { boxId, x, y, kind }
  const cols = Object.fromEntries(COLUMNS.map((c) => [c.id, []]));
  for (const d of rig.devices) {
    const c = columnOf(d);
    if (c) cols[c].push(d);
  }
  cols.stage.sort((a, b) => order(a) - order(b));
  const zoneRank = { foh: 0, lobby: 1, stage: 2, cam: 3 };
  cols.speakers.sort((a, b) => (zoneRank[a.zone] ?? 1) - (zoneRank[b.zone] ?? 1) || (a.pan ?? 0) - (b.pan ?? 0));
  const mixer = rig.devices.find(isMixer);
  // Mixer ports that physically live in a stage box (the CL3's Rio): drawn there.
  const mixerType = mixer ? DEVICE_TYPES[mixer.type] : null;
  const panels = mixerType?.panels || {};

  // ---- measure each box (width, height, jack offsets) ----
  const measured = { stage: [], box: [], foh: [], rack: [], speakers: [] };

  for (const d of cols.stage) measured.stage.push(simpleBox(d, "stage"));
  for (const [id, panel] of Object.entries(panels)) measured.box.push(panelBox(mixer, id, panel, channelLabels));
  if (mixer) measured.foh.push(consoleBox(mixer, channelLabels, mixerName));
  // A snake is two boxes: its stage end, and the fan of tails at FOH (under the console).
  const multicores = [];
  for (const d of cols.box) {
    const type = DEVICE_TYPES[d.type];
    if (type.passthrough) {
      measured.box.push(stageBoxBox(d, (p) => p.end === "stage", [["INPUTS", (p) => p.dir === "in"], ["RETURNS", (p) => p.dir === "out"]]));
      measured.foh.push(stageBoxBox(d, (p) => p.end === "foh", [["TAILS (to the console)", (p) => p.dir === "out"], ["RETURN SENDS", (p) => p.dir === "in"]], { id: `${d.id}-fan`, title: "Snake fan-out at FOH" }));
      multicores.push([d.id, `${d.id}-fan`]);
    } else measured.box.push(stageBoxBox(d));
  }
  for (const d of cols.rack) measured.rack.push(rackBox(d));
  for (const d of cols.speakers) measured.speakers.push(simpleBox(d, "speakers"));

  // ---- place the columns ----
  const used = COLUMNS.filter((c) => measured[c.id].length);
  let x = 16;
  const columns = [];
  // Every column is centred on the tallest, so cables run mostly sideways.
  const colH = (id) => measured[id].reduce((h, b) => h + b.h + GAP, -GAP);
  const tallest = Math.max(...used.map((c) => colH(c.id)));
  let height = 0;
  for (const c of used) {
    const w = Math.max(...measured[c.id].map((b) => b.w));
    let y = TOP + Math.max(0, (tallest - colH(c.id)) / 2);
    for (const b of measured[c.id]) {
      const bx = x + (c.id === "foh" ? 0 : (w - b.w) / 2);
      boxes.push({ ...b.box, x: bx, y, w: b.w, h: b.h, column: c.id });
      for (const j of b.jacks) jacks.set(j.ref, { ...j, x: bx + j.dx, y: y + j.dy, column: c.id, boxId: b.box.id });
      for (const n of b.net || []) net.push({ ...n, x: bx + n.dx, y: y + n.dy, boxId: b.box.id });
      y += b.h + GAP;
    }
    height = Math.max(height, y);
    columns.push({ ...c, x, w });
    x += w + COL_GAP;
  }
  // The multicore: from the stage end's bottom to the fan-out's left edge.
  const links = multicores.map(([a, b]) => {
    const A = boxes.find((x) => x.id === a);
    const B = boxes.find((x) => x.id === b);
    return { kind: "multicore", a: { x: A.x + A.w / 2, y: A.y + A.h, side: "down" }, b: { x: B.x, y: B.y + 40, side: "left" } };
  });
  // +44: room right of the last column for the listening figure.
  return { width: x - COL_GAP + 16 + 44, height: height + 8, columns, boxes, jacks, net, links };
}

// A stage box channel's number or letter ("IN 12" → "12", "Return B" → "B").
const jackNum = (p) => (/(\d+)$/.exec(p.id) || /-([a-z])$/.exec(p.id) || [, shortLabel(p)])[1].toUpperCase();

// A source or speaker: icon, name, and its jacks on one edge.
function simpleBox(d, col) {
  const type = DEVICE_TYPES[d.type];
  const ports = type.ports.filter(isPhysical);
  const w = 216;
  const rows = Math.max(1, ports.length);
  const h = Math.max(62, HEAD + 8 + rows * JACK);
  const jx = col === "stage" ? w - 20 : 20;
  const jacks = ports.map((p, i) => ({
    ref: `${d.id}/${p.id}`,
    dx: jx,
    dy: (ports.length > 1 ? HEAD + 10 + i * JACK + JACK / 2 : h - 22),
    side: sideFor(col, p),
    port: p,
    word: ports.length > 1 ? p.name.split(" ")[0].toUpperCase() : "",
    wordSide: col === "stage" ? "left" : "right",
  }));
  // The DAW laptop has no jacks: one network port to the Dante switch.
  const net = type.dante ? [{ dx: w - 20, dy: h / 2 + 6, kind: "dante" }] : [];
  return { box: { id: d.id, deviceId: d.id, kind: col === "stage" ? "source" : "endpoint" }, w, h, jacks, net };
}

// An amp, effects unit or recorder: inputs down the left edge, outputs down the right.
function rackBox(d) {
  const type = DEVICE_TYPES[d.type];
  const ins = type.ports.filter((p) => p.dir === "in" && isPhysical(p));
  const outs = type.ports.filter((p) => p.dir === "out" && isPhysical(p));
  const w = 216;
  const rows = Math.max(ins.length, outs.length, 1);
  const h = HEAD + 14 + rows * JACK;
  const jacks = [
    ...ins.map((p, i) => ({ ref: `${d.id}/${p.id}`, dx: 20, dy: HEAD + 10 + i * JACK + JACK / 2, side: "left", port: p, word: rackWord(p), wordSide: "right" })),
    ...outs.map((p, i) => ({ ref: `${d.id}/${p.id}`, dx: w - 20, dy: HEAD + 10 + i * JACK + JACK / 2, side: "right", port: p, word: rackWord(p), wordSide: "left" })),
  ];
  return { box: { id: d.id, deviceId: d.id, kind: "rack" }, w, h, jacks };
}

// A grid of jacks inside a panel: `cells` are columns of ports with a heading.
// Returns the jacks (relative to the panel) and the grid's size.
function grid(deviceId, cells, { x0, y0, perRow, cellW = JACK, col = "foh" }) {
  const jacks = [];
  const tall = Math.max(1, ...cells.map((c) => c.ports.length));
  const rowH = 14 + tall * (JACK + 6);
  cells.forEach((c, k) => {
    const r = Math.floor(k / perRow);
    const cx = x0 + (k % perRow) * cellW + cellW / 2;
    const cy = y0 + r * rowH;
    c.ports.forEach((p, i) => {
      jacks.push({ ref: `${deviceId}/${p.id}`, dx: cx, dy: cy + 14 + i * (JACK + 6) + JACK / 2, side: sideFor(col, p), port: p, word: c.words === false ? "" : pathWord(p), head: i === 0 ? c.label : "" });
    });
  });
  const rows = Math.ceil(cells.length / perRow) || 0;
  return { jacks, w: Math.min(cells.length, perRow) * cellW, h: rows * rowH };
}

// The console's rear panel: inputs (one column per channel, its jacks stacked),
// returns, then outputs.
function consoleBox(mixer, channelLabels, mixerName) {
  const type = DEVICE_TYPES[mixer.type];
  const onConsole = (p) => isPhysical(p) && !p.panel;
  const ports = type.ports.filter(onConsole);
  const byChannel = new Map();
  for (const p of ports.filter((p) => p.role === "channel-input" || (p.role === "bus-out" && p.channel !== undefined))) {
    if (!byChannel.has(p.channel)) byChannel.set(p.channel, []);
    byChannel.get(p.channel).push(p);
  }
  const inputs = [...byChannel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ch, ps]) => ({ label: channelLabels[ch] ?? String(ch + 1), ports: ps.sort((a, b) => (a.role === "bus-out") - (b.role === "bus-out")) }));
  const rets = new Map();
  for (const p of ports.filter((p) => p.role === "return-in")) {
    if (!rets.has(p.ret)) rets.set(p.ret, []);
    rets.get(p.ret).push(p);
  }
  const outs = ports.filter((p) => p.role === "bus-out" && p.channel === undefined);
  const net = [];

  const perRow = Math.min(16, Math.max(8, inputs.length > 17 ? 16 : inputs.length));
  // A small mixer's panel gets roomier jacks.
  const cw = inputs.length <= 12 ? 40 : JACK;
  let y = HEAD + 18;
  const sections = [];
  const jacks = [];
  const add = (title, cells, opts = {}) => {
    if (!cells.length) return;
    const g = grid(mixer.id, cells, { x0: PAD, y0: y + 8, perRow: opts.perRow || perRow, cellW: opts.cellW || JACK });
    sections.push({ title, y, w: g.w });
    jacks.push(...g.jacks);
    y += g.h + 26;
  };
  add("INPUTS", inputs, { cellW: cw });
  add("RETURNS", [...rets.entries()].map(([n, ps]) => ({ label: `RET ${n}`, ports: ps })), { perRow, cellW: cw });
  add("OUTPUTS", outs.map((p) => ({ label: shortLabel(p), ports: [p], words: false })), { perRow: Math.max(4, Math.floor((perRow * cw) / 44)), cellW: 44 });
  const w = Math.max(320, PAD * 2 + Math.max(...sections.map((s) => s.w), 0));
  // Network ports on the rear panel: Dante (CL3, drawn only) and AES50 (X32, a real jack).
  if (type.ports.some((p) => p.jack === "dante")) net.push({ dx: w - 26, dy: y + 6, kind: "dante" });
  ports.filter((p) => p.network).forEach((p, i) => jacks.push({ ref: `${mixer.id}/${p.id}`, dx: w - 26 - i * 44, dy: y + 8, side: "down", port: p, word: shortLabel(p), wordSide: "left" }));
  if (net.length || ports.some((p) => p.network)) y += 32;
  return { box: { id: mixer.id, deviceId: mixer.id, kind: "console", title: `${mixerName || type.name} · rear panel`, sections }, w, h: y + 4, jacks, net };
}

// Mixer jacks that live in a stage box (the CL3's Rio3224-D).
function panelBox(mixer, id, panel, channelLabels) {
  const type = DEVICE_TYPES[mixer.type];
  const ins = type.ports.filter((p) => p.panel === id && p.dir === "in");
  const outs = type.ports.filter((p) => p.panel === id && p.dir === "out");
  const perRow = 8;
  let y = HEAD + 18;
  const sections = [];
  const jacks = [];
  const add = (title, cells) => {
    if (!cells.length) return;
    const g = grid(mixer.id, cells, { x0: PAD, y0: y + 8, perRow, col: "box" });
    sections.push({ title, y, w: g.w });
    jacks.push(...g.jacks);
    y += g.h + 26;
  };
  add("INPUT", ins.map((p) => ({ label: String(p.channel + 1), ports: [p], words: false })));
  add("OUTPUT", outs.map((p) => ({ label: shortLabel(p).replace("OUT ", ""), ports: [p], words: false })));
  const w = PAD * 2 + perRow * JACK;
  const net = [{ dx: w - 26, dy: y + 6, kind: panel.network || "dante" }];
  return { box: { id: `panel-${id}`, deviceId: mixer.id, kind: "stagebox", title: panel.name, sub: panel.sub, sections }, w, h: y + 36, jacks, net };
}

// A stage box in the rig: a snake's stage end or FOH fan, or a digital box
// (S32, SD8) with its inputs, outputs and network jack.
function stageBoxBox(d, keep = () => true, groups = [["INPUTS", (p) => p.dir === "in"], ["OUTPUTS", (p) => p.dir === "out"]], { id = d.id, title } = {}) {
  const type = DEVICE_TYPES[d.type];
  const ports = type.ports.filter((p) => isPhysical(p) && keep(p));
  const perRow = 8;
  let y = HEAD + 18;
  const sections = [];
  const jacks = [];
  for (const [name, test] of groups) {
    const list = ports.filter((p) => !p.network && test(p));
    if (!list.length) continue;
    const g = grid(d.id, list.map((p) => ({ label: jackNum(p), ports: [p], words: false })), { x0: PAD, y0: y + 8, perRow, col: "box" });
    sections.push({ title: name, y, w: g.w });
    jacks.push(...g.jacks);
    y += g.h + 26;
  }
  const w = PAD * 2 + perRow * JACK;
  const netPorts = ports.filter((p) => p.network);
  netPorts.forEach((p, i) => jacks.push({ ref: `${d.id}/${p.id}`, dx: w - 26 - i * 44, dy: y + 8, side: "down", port: p, word: shortLabel(p), wordSide: "left" }));
  if (netPorts.length) y += 32;
  return { box: { id, deviceId: d.id, kind: "stagebox", title: title || d.label || type.name, sections }, w, h: y + 4, jacks };
}
