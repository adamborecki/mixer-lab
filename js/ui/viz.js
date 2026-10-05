// The pictures digital desks draw for a channel's processing: the EQ's
// frequency response and the compressor's transfer curve with gain
// reduction. Drawn from mixer state with the same filter maths the Web Audio
// graph uses, so what the curve shows is what you hear. Each graph is an SVG
// that redraws through view.bindings; the GR bar moves in updateViz().

import { compIsOn, eqIsOn, hpfHz, peqBands } from "../compact.js";
import { shelfHz } from "../graph-kit.js";

const SR = 48000;
const F_LO = 20;
const F_HI = 20000;
const EQ_DB = 18; // the curve's ±range
const NS = "http://www.w3.org/2000/svg";

// ---------- maths ----------

// RBJ cookbook biquads as the Web Audio spec defines them (shelves with S = 1,
// high-pass Q in dB). Returns the magnitude response in dB at f.
export function biquadDb(type, f0, gainDb, Q, f, sr = SR) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * Math.min(f0, sr / 2 - 1)) / sr;
  const cs = Math.cos(w0);
  const sn = Math.sin(w0);
  let b0, b1, b2, a0, a1, a2;
  if (type === "peaking") {
    const al = sn / (2 * Q);
    [b0, b1, b2, a0, a1, a2] = [1 + al * A, -2 * cs, 1 - al * A, 1 + al / A, -2 * cs, 1 - al / A];
  } else if (type === "lowshelf" || type === "highshelf") {
    const al = (sn / 2) * Math.SQRT2;
    const k = 2 * Math.sqrt(A) * al;
    if (type === "lowshelf") [b0, b1, b2, a0, a1, a2] = [A * (A + 1 - (A - 1) * cs + k), 2 * A * (A - 1 - (A + 1) * cs), A * (A + 1 - (A - 1) * cs - k), A + 1 + (A - 1) * cs + k, -2 * (A - 1 + (A + 1) * cs), A + 1 + (A - 1) * cs - k];
    else [b0, b1, b2, a0, a1, a2] = [A * (A + 1 + (A - 1) * cs + k), -2 * A * (A - 1 + (A + 1) * cs), A * (A + 1 + (A - 1) * cs - k), A + 1 - (A - 1) * cs + k, 2 * (A - 1 - (A + 1) * cs), A + 1 - (A - 1) * cs - k];
  } else if (type === "highpass") {
    const al = sn / (2 * Math.pow(10, Q / 20));
    [b0, b1, b2, a0, a1, a2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al];
  } else return 0;
  const w = (2 * Math.PI * f) / sr;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2;
  const ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2;
  const di = -(a1 * s1 + a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

// The channel's whole response at f: the high-pass (if it has one and it's
// in) plus the four bands (if the EQ is on).
export function channelEqDb(c, ch, f, def = {}) {
  let db = 0;
  // L-20: EQ OFF bypasses LOW CUT as well.
  const hp = c.hpf && !(def.eqOffBypassesHpf && !eqIsOn(ch)) ? hpfHz(c, ch.hpf) : 0;
  if (hp) db += biquadDb("highpass", hp, 0, 0.6, f);
  if (ch.peq && eqIsOn(ch)) for (const b of peqBands(def)) db += biquadDb(b.type, shelfHz(b.type, ch.peq[b.id].freq), ch.peq[b.id].gain, ch.peq[b.id].q, f);
  return db;
}

// Output level for an input level through the compressor (static curve, no knee).
export function compOutDb(dyn, on, inDb) {
  if (!on || !(dyn.threshold < 0) || !(dyn.ratio > 1)) return inDb;
  const over = inDb - dyn.threshold;
  return (over > 0 ? dyn.threshold + over / dyn.ratio : inDb) + dyn.makeup;
}

// ---------- drawing ----------

function svg(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

const xOfF = (f, W) => (Math.log(f / F_LO) / Math.log(F_HI / F_LO)) * W;
const yOfDb = (db, H) => H / 2 - (Math.max(-EQ_DB, Math.min(EQ_DB, db)) / EQ_DB) * (H / 2 - 4);

// An EQ graph for channel i. opts: { theme: "x32" | "ui16" | "lcd", band:
// () => the selected band id (01V96), small }. Redraws on every state change.
export function eqGraph(view, def, i, opts = {}) {
  const c = def.channels[i];
  const W = opts.small ? 200 : 320;
  const H = opts.small ? 80 : 120;
  const box = document.createElement("figure");
  box.className = `viz viz-eq viz-${opts.theme || "ui16"}${opts.small ? " viz-small" : ""}`;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  box.appendChild(root);
  // Grid: 100 Hz, 1 kHz, 10 kHz; 0 and ±12 dB.
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) svg("line", { x1: xOfF(f, W), x2: xOfF(f, W), y1: 0, y2: H, class: [100, 1000, 10000].includes(f) ? "grid major" : "grid" }, root);
  for (const db of [-12, -6, 0, 6, 12]) svg("line", { x1: 0, x2: W, y1: yOfDb(db, H), y2: yOfDb(db, H), class: db === 0 ? "grid zero" : "grid" }, root);
  if (!opts.small) {
    for (const [f, t] of [[100, "100"], [1000, "1k"], [10000, "10k"]]) svg("text", { x: xOfF(f, W) + 2, y: H - 3, class: "lbl" }, root).textContent = t;
    for (const db of [12, -12]) svg("text", { x: 2, y: yOfDb(db, H) + 3, class: "lbl" }, root).textContent = db > 0 ? `+${db}` : `${db}`;
  }
  const fill = svg("path", { class: "fill" }, root);
  const line = svg("path", { class: "curve" }, root);
  const bands = peqBands(def);
  const dots = bands.map((b, k) => {
    const g = svg("g", { class: "band" }, root);
    svg("circle", { r: opts.small ? 3.5 : 6 }, g);
    if (!opts.small) svg("text", { "text-anchor": "middle", y: 3 }, g).textContent = String(k + 1);
    return g;
  });
  const tag = document.createElement("span");
  tag.className = "viz-tag";
  box.appendChild(tag);
  const N = 120;
  const freqs = Array.from({ length: N + 1 }, (_, k) => F_LO * Math.pow(F_HI / F_LO, k / N));
  view.bindings.push({
    kind: "fn",
    run: (s) => {
      const ch = s.channels[i];
      if (!ch || !ch.peq) return;
      const on = eqIsOn(ch);
      const pts = freqs.map((f) => [xOfF(f, W), yOfDb(channelEqDb(c, ch, f, def), H)]);
      const d = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
      line.setAttribute("d", d);
      fill.setAttribute("d", `${d}L${W} ${yOfDb(0, H)}L0 ${yOfDb(0, H)}Z`);
      bands.forEach((b, k) => {
        const p = ch.peq[b.id];
        dots[k].setAttribute("transform", `translate(${xOfF(p.freq, W).toFixed(1)} ${yOfDb(p.gain, H).toFixed(1)})`);
        dots[k].classList.toggle("sel", !!opts.band && opts.band() === b.id);
      });
      box.classList.toggle("is-off", !on);
      tag.textContent = on ? "" : "EQ OFF";
      root.setAttribute("aria-label", `EQ curve, channel ${c.label}: ${on ? bands.map((b) => `${b.label} ${ch.peq[b.id].gain > 0 ? "+" : ""}${ch.peq[b.id].gain} dB at ${Math.round(ch.peq[b.id].freq)} Hz`).join(", ") : "EQ switched off, flat"}`);
    },
  });
  return box;
}

// A compressor graph for channel i: input level across, output level up, the
// threshold marked, and a gain-reduction bar that moves with the music.
export function compGraph(view, def, i, opts = {}) {
  const c = def.channels[i];
  const S = opts.small ? 70 : 110;
  const LO = -60;
  const box = document.createElement("figure");
  box.className = `viz viz-comp viz-${opts.theme || "ui16"}${opts.small ? " viz-small" : ""}`;
  const root = svg("svg", { viewBox: `0 0 ${S + 16} ${S}`, role: "img" });
  box.appendChild(root);
  const pos = (db) => ((Math.max(LO, Math.min(0, db)) - LO) / -LO) * S;
  for (const db of [-48, -36, -24, -12]) {
    svg("line", { x1: pos(db), x2: pos(db), y1: 0, y2: S, class: "grid" }, root);
    svg("line", { x1: 0, x2: S, y1: S - pos(db), y2: S - pos(db), class: "grid" }, root);
  }
  svg("line", { x1: 0, y1: S, x2: S, y2: 0, class: "grid unity" }, root);
  const thr = svg("line", { y1: 0, y2: S, class: "thr" }, root);
  const line = svg("path", { class: "curve" }, root);
  // GR bar on the right: grows down from the top, 0 … 20 dB.
  svg("rect", { x: S + 4, y: 0, width: 10, height: S, class: "gr-bg" }, root);
  const gr = svg("rect", { x: S + 4, y: 0, width: 10, height: 0, class: "gr" }, root);
  const tag = document.createElement("span");
  tag.className = "viz-tag";
  box.appendChild(tag);
  const readout = document.createElement("figcaption");
  readout.className = "viz-gr";
  box.appendChild(readout);
  view.vizComp = view.vizComp || [];
  view.vizComp.push({ index: i, bar: gr, text: readout, S, level: 0 });
  view.bindings.push({
    kind: "fn",
    run: (s) => {
      const ch = s.channels[i];
      if (!ch || !ch.dyn) return;
      const on = compIsOn(ch);
      const pts = [];
      for (let db = LO; db <= 0; db += 1) pts.push([pos(db), S - pos(compOutDb(ch.dyn, on, db))]);
      line.setAttribute("d", pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(""));
      const active = ch.dyn.threshold < 0;
      thr.setAttribute("x1", pos(ch.dyn.threshold));
      thr.setAttribute("x2", pos(ch.dyn.threshold));
      thr.style.display = active ? "" : "none";
      box.classList.toggle("is-off", !on);
      tag.textContent = on ? "" : "COMP OFF";
      root.setAttribute("aria-label", `Compressor, channel ${c.label}: ${on ? `on, threshold ${ch.dyn.threshold} dB, ratio ${ch.dyn.ratio.toFixed(1)}:1, make-up ${ch.dyn.makeup} dB` : "switched off"}`);
    },
  });
  return box;
}

// Per-frame: the GR bars (readings.comp is each strip's reduction in dB, ≤ 0).
export function updateViz(view, readings) {
  for (const v of view.vizComp || []) {
    const red = Math.max(0, -(readings.comp?.[v.index] || 0));
    v.level = Math.max(red, v.level * 0.9);
    v.bar.setAttribute("height", ((Math.min(20, v.level) / 20) * v.S).toFixed(1));
    v.text.textContent = `GR ${v.level >= 0.5 ? `−${v.level.toFixed(0)}` : "0"} dB`;
  }
}

