// Larger, shaded connector drawings for the patch dialog: plugs seen from the
// side (cable on the left, the business end on the right) and jacks seen on
// their panel. Pictures only, like icons.js: what fits what is decided by
// js/connection-model.js. Pure string builders (no DOM), so they run under node.
//
//   plugArt("xlr", { into: "in" })      an XLR plug that goes into an input (male)
//   jackArt("combo", "in")              an XLR / 1/4" combo jack on a panel

let n = 0;
const uid = (p) => `${p}${++n}`;

// Shading: a horizontal cylinder lit from above.
const metal = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d939f"/><stop offset=".22" stop-color="#f4f6fa"/><stop offset=".5" stop-color="#b9bfca"/><stop offset=".78" stop-color="#5d636f"/><stop offset="1" stop-color="#a3a9b4"/></linearGradient>`;
const plastic = (id, c = "#2b2f39") => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a505e"/><stop offset=".3" stop-color="${c}"/><stop offset=".75" stop-color="#101217"/><stop offset="1" stop-color="#262a33"/></linearGradient>`;
const gold = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a6a22"/><stop offset=".3" stop-color="#ffe7a3"/><stop offset=".7" stop-color="#b8892c"/><stop offset="1" stop-color="#6e5216"/></linearGradient>`;
const face = (id) => `<radialGradient id="${id}" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#3a3f4c"/><stop offset="1" stop-color="#0d0f14"/></radialGradient>`;
const nut = (id) => `<radialGradient id="${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f1f3f7"/><stop offset=".55" stop-color="#9aa1ad"/><stop offset="1" stop-color="#4b505b"/></radialGradient>`;

const svg = (w, h, defs, body, label) =>
  `<svg class="conn-art" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"'}><defs>${defs}</defs>${body}</svg>`;

// The cable and its strain relief, coming in from the left.
function tail(y, { thick = 9, boot = 46, h = 20, plasticId, heavy = false }) {
  const t = heavy ? thick + 4 : thick;
  return `<path d="M0 ${y}C10 ${y} 14 ${y} 24 ${y}" stroke="#111318" stroke-width="${t + 2}" fill="none"/>
    <path d="M0 ${y}C10 ${y} 14 ${y} 24 ${y}" stroke="#2f3440" stroke-width="${t}" fill="none"/>
    ${heavy ? `<path d="M0 ${y}H24" stroke="#5b4a2a" stroke-width="1.4"/>` : ""}
    <path d="M22 ${y - t / 2 - 1}L${boot} ${y - h / 2}V${y + h / 2}L22 ${y + t / 2 + 1}Z" fill="url(#${plasticId})"/>
    ${[30, 35, 40].map((x) => `<path d="M${x} ${y - (t / 2 + (x - 22) * 0.18)}V${y + t / 2 + (x - 22) * 0.18}" stroke="#0b0d11" stroke-width="1"/>`).join("")}`;
}

// A 1/4" or 3.5 mm phone plug: body, sleeve, ring(s), tip.
function phonePlug({ mini = false, rings = 2, heavy = false } = {}) {
  const [M, P] = [uid("m"), uid("p")];
  const y = 40;
  const bh = mini ? 18 : 28; // body height
  const sh = mini ? 7 : 12; // shaft height
  const x0 = 46;
  const x1 = mini ? 92 : 104; // body end
  const len = mini ? 42 : 58; // shaft length
  const ringW = mini ? 3 : 4;
  const tipAt = x1 + len - (mini ? 9 : 13);
  const ringXs = rings === 2 ? [tipAt - (mini ? 12 : 18), tipAt - 1] : [tipAt - 1];
  const body = `<rect x="${x0}" y="${y - bh / 2}" width="${x1 - x0}" height="${bh}" rx="${bh / 3}" fill="url(#${heavy ? P : M})" stroke="#0b0d11"/>
    ${heavy ? "" : `<rect x="${x0 + 6}" y="${y - bh / 2}" width="${(x1 - x0) * 0.35}" height="${bh}" fill="url(#${P})" opacity=".85"/>`}
    <rect x="${x1 - 4}" y="${y - sh / 2 - 3}" width="7" height="${sh + 6}" rx="2" fill="url(#${M})" stroke="#0b0d11"/>`;
  const shaft = `<rect x="${x1 + 3}" y="${y - sh / 2}" width="${len - 4}" height="${sh}" fill="url(#${M})" stroke="#2b2f39" stroke-width=".6"/>
    ${ringXs.map((rx) => `<rect x="${rx}" y="${y - sh / 2 - 0.4}" width="${ringW}" height="${sh + 0.8}" fill="#111"/>`).join("")}
    <path d="M${x1 + len - 1} ${y - sh / 2}Q${x1 + len + (mini ? 6 : 9)} ${y} ${x1 + len - 1} ${y + sh / 2}Z" fill="url(#${M})" stroke="#2b2f39" stroke-width=".6"/>`;
  return svg(170, 80, metal(M) + plastic(P, heavy ? "#7a5a1e" : "#2b2f39"), tail(y, { h: bh - 6, plasticId: P, heavy, thick: mini ? 6 : 9 }) + body + shaft);
}

// An XLR plug, three-quarter view: the shell, its face, and pins (male) or holes (female).
function xlrPlug(male, { text = true } = {}) {
  const [M, P, F, G] = [uid("m"), uid("p"), uid("f"), uid("g")];
  const y = 40;
  const r = 19;
  const fx = 128; // the face
  const shell = `<path d="M50 ${y - r}H${fx}V${y + r}H50Q44 ${y + r} 44 ${y + r - 6}V${y - r + 6}Q44 ${y - r} 50 ${y - r}Z" fill="url(#${M})" stroke="#0b0d11"/>
    <rect x="58" y="${y - r}" width="26" height="${2 * r}" fill="url(#${P})"/>
    ${male ? "" : `<rect x="100" y="${y - r - 4}" width="14" height="6" rx="2" fill="#1c1f26" stroke="#0b0d11"/>${text ? `<text x="107" y="${y - r - 7}" font-size="6" fill="#9aa1b0" text-anchor="middle" font-family="sans-serif">PUSH</text>` : ""}`}`;
  // The shell's open end, seen three-quarter on. A male plug has its three pins recessed inside the
  // shell (the shell guards them); a female plug has three holes, and the latch on top.
  const faceE = `<ellipse cx="${fx}" cy="${y}" rx="11" ry="${r}" fill="url(#${M})" stroke="#0b0d11"/><ellipse cx="${fx + 1.5}" cy="${y}" rx="8.5" ry="${r - 3}" fill="url(#${F})"/>`;
  // Pin 1 on top, 2 and 3 below it: the same triangle as the jack's face.
  const pinYs = [y - 10, y + 5, y + 10];
  const pinXs = [fx + 2, fx - 1, fx + 4];
  const ends = male
    ? `<path d="M${fx - 10} ${y - r + 3}h10" stroke="#0b0d11" stroke-width="3" opacity=".0"/>` +
      pinYs.map((py, i) => `<ellipse cx="${pinXs[i]}" cy="${py}" rx="3" ry="3.6" fill="url(#${G})" stroke="#5a4310" stroke-width=".5"/><ellipse cx="${pinXs[i] - 0.6}" cy="${py - 1.2}" rx="0.9" ry="1.2" fill="#fff" opacity=".55"/>`).join("")
    : pinYs.map((py, i) => `<ellipse cx="${pinXs[i]}" cy="${py}" rx="2.4" ry="3.2" fill="#000" stroke="#555b68" stroke-width=".4"/>`).join("");
  return svg(170, 80, metal(M) + plastic(P) + face(F) + gold(G), tail(y, { h: 22, plasticId: P }) + shell + faceE + ends);
}

// An RCA plug: shell, coloured band, centre pin.
function rcaPlug(color = "#d33") {
  const [M, P] = [uid("m"), uid("p")];
  const y = 40;
  return svg(
    170,
    80,
    metal(M) + plastic(P),
    tail(y, { h: 16, plasticId: P, thick: 7 }) +
      `<rect x="46" y="${y - 11}" width="54" height="22" rx="6" fill="url(#${P})" stroke="#0b0d11"/>
      <rect x="62" y="${y - 11}" width="10" height="22" fill="${color}" opacity=".9"/>
      <path d="M100 ${y - 9}H128L131 ${y - 6}V${y + 6}L128 ${y + 9}H100Z" fill="url(#${M})" stroke="#2b2f39"/>
      ${[0, 1, 2].map((k) => `<path d="M${108 + k * 7} ${y - 9}V${y + 9}" stroke="#20232b" stroke-width="1.2"/>`).join("")}
      <rect x="128" y="${y - 2}" width="16" height="4" rx="2" fill="url(#${M})" stroke="#2b2f39" stroke-width=".6"/>`,
  );
}

// etherCON: an XLR-sized locking shell around an RJ45 plug.
function etherconPlug() {
  const [M, P, F] = [uid("m"), uid("p"), uid("f")];
  const y = 40;
  const r = 18;
  return svg(
    170,
    80,
    metal(M) + plastic(P, "#1f3a78") + face(F),
    tail(y, { h: 22, plasticId: P, thick: 8 }) +
      `<path d="M50 ${y - r}H122V${y + r}H50Q44 ${y + r} 44 ${y + r - 6}V${y - r + 6}Q44 ${y - r} 50 ${y - r}Z" fill="url(#${P})" stroke="#0b0d11"/>
      <rect x="96" y="${y - r - 4}" width="16" height="6" rx="2" fill="#11141b" stroke="#0b0d11"/>
      <ellipse cx="122" cy="${y}" rx="6" ry="${r}" fill="url(#${M})" stroke="#0b0d11"/>
      <rect x="122" y="${y - 8}" width="20" height="16" rx="1.5" fill="#d9dde6" fill-opacity=".85" stroke="#8a90a0"/>
      ${[0, 1, 2, 3].map((k) => `<rect x="${126 + k * 4}" y="${y - 7}" width="2" height="5" fill="#c8a24a"/>`).join("")}
      <path d="M132 ${y + 8}l8 5h-6z" fill="#d9dde6" stroke="#8a90a0" stroke-width=".6"/>`,
  );
}

// A stereo breakout: two TS plugs on a Y.
function dualPlug() {
  const one = phonePlug({ rings: 1 });
  const inner = one.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return `<svg class="conn-art" viewBox="0 0 170 80" width="170" height="80" aria-hidden="true" focusable="false">
    <path d="M0 40H18M18 40C26 40 26 22 36 22M18 40C26 40 26 58 36 58" stroke="#2f3440" stroke-width="5" fill="none"/>
    <g transform="translate(24 5) scale(.72 .42)">${inner}</g><g transform="translate(24 41) scale(.72 .42)">${inner}</g>
    <text x="156" y="25" font-size="9" fill="#e6e9f0" font-family="sans-serif" font-weight="700">L</text><text x="156" y="61" font-size="9" fill="#e6e9f0" font-family="sans-serif" font-weight="700">R</text></svg>`;
}

// plugId: the model's plug ids (xlr, trs14, ts14, rca, trs35, dualts14, ethercon).
// `into`: "in" if this end goes into an input jack (an XLR is then male).
// `text: false` leaves out printed words (for a mirrored drawing).
export function plugArt(plugId, { into = "in", speaker = false, text = true } = {}) {
  switch (plugId) {
    case "xlr":
      return xlrPlug(into === "in", { text });
    case "trs14":
      return phonePlug({ rings: 2 });
    case "ts14":
      return phonePlug({ rings: 1, heavy: speaker });
    case "trs35":
      return phonePlug({ mini: true, rings: 2 });
    case "rca":
      return rcaPlug();
    case "dualts14":
      return dualPlug();
    case "ethercon":
      return etherconPlug();
    default:
      return phonePlug({ rings: 1 });
  }
}

// ---------- jacks on a panel ----------

function panel(inner, defs, label) {
  const [B] = [uid("b")];
  return svg(
    120,
    120,
    `<linearGradient id="${B}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#30364a"/><stop offset="1" stop-color="#191c27"/></linearGradient>` + defs,
    `<rect x="2" y="2" width="116" height="116" rx="12" fill="url(#${B})" stroke="#3d4459"/>
    ${[[12, 12], [108, 12], [12, 108], [108, 108]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="#4b5269" stroke="#0e1018"/><path d="M${x - 2} ${y}h4" stroke="#0e1018"/>`).join("")}
    ${inner}`,
    label,
  );
}

function xlrSocket(cx, cy, female, M, F, { combo = false } = {}) {
  const r = 34;
  // A combo jack's XLR holes sit further out, around the 1/4" hole in the middle.
  const o = combo ? 1.35 : 1;
  const pins = [
    [cx, cy - 15 * o],
    [cx - 15 * o, cy + 9 * o],
    [cx + 15 * o, cy + 9 * o],
  ];
  return `<circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="url(#${M})" stroke="#0b0d11"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${F})" stroke="#000"/>
    ${female ? `<rect x="${cx - 7}" y="${cy - r - 9}" width="14" height="8" rx="2" fill="#1c1f26" stroke="#000"/>` : `<rect x="${cx - 4}" y="${cy - r}" width="8" height="7" fill="#000"/>`}
    ${pins.map(([x, y]) => (female ? `<circle cx="${x}" cy="${y}" r="4.6" fill="#000" stroke="#555b68"/>` : `<circle cx="${x}" cy="${y}" r="3.6" fill="#d4b25a" stroke="#6e5216"/>`)).join("")}
    ${combo ? `<circle cx="${cx}" cy="${cy}" r="9.5" fill="url(#${M})" stroke="#000"/><circle cx="${cx}" cy="${cy}" r="6.2" fill="#000"/>` : ""}`;
}

function quarterSocket(cx, cy, N, { r = 20, hole = 7 } = {}) {
  // A hex nut around the hole.
  const hex = Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${hex}" fill="url(#${N})" stroke="#2b2f39"/><circle cx="${cx}" cy="${cy}" r="${hole + 4}" fill="#1a1d24" stroke="#000"/><circle cx="${cx}" cy="${cy}" r="${hole}" fill="#000"/>`;
}

function rcaSocket(cx, cy, M, color) {
  return `<circle cx="${cx}" cy="${cy}" r="17" fill="url(#${M})" stroke="#0b0d11"/><circle cx="${cx}" cy="${cy}" r="11" fill="${color}"/><circle cx="${cx}" cy="${cy}" r="7" fill="url(#${M})"/><circle cx="${cx}" cy="${cy}" r="2.6" fill="#000"/>`;
}

// jackId: the model's jack ids (xlr, combo, quarter, rca, mini, linepair, rcapair, ethercon). dir: the port's direction.
export function jackArt(jackId, dir = "in") {
  const [M, F, N] = [uid("m"), uid("f"), uid("n")];
  const defs = metal(M) + face(F) + nut(N);
  const label = (t) => `<text x="60" y="112" font-size="8.5" fill="#aeb5cc" text-anchor="middle" font-family="sans-serif" font-weight="700" letter-spacing=".08em">${t}</text>`;
  switch (jackId) {
    case "xlr":
      return panel(xlrSocket(60, 56, dir === "in", M, F) + label(dir === "in" ? "XLR IN (female)" : "XLR OUT (male)"), defs);
    case "combo":
      return panel(xlrSocket(60, 56, true, M, F, { combo: true }) + label("XLR + 1/4\""), defs);
    case "quarter":
      return panel(quarterSocket(60, 56, N, { r: 26, hole: 8 }) + label('1/4" JACK'), defs);
    case "mini":
      return panel(quarterSocket(60, 56, N, { r: 15, hole: 4 }) + label("3.5 mm"), defs);
    case "rca":
      return panel(rcaSocket(60, 56, M, "#d8d8d8") + label("RCA"), defs);
    case "rcapair":
      return panel(rcaSocket(38, 56, M, "#e8e8e8") + rcaSocket(82, 56, M, "#d33") + `<text x="38" y="88" font-size="9" fill="#e6e9f0" text-anchor="middle" font-family="sans-serif">L</text><text x="82" y="88" font-size="9" fill="#e6e9f0" text-anchor="middle" font-family="sans-serif">R</text>` + label("RCA L / R"), defs);
    case "linepair":
      return panel(quarterSocket(38, 54, N, { r: 17, hole: 6 }) + quarterSocket(82, 54, N, { r: 17, hole: 6 }) + `<text x="38" y="86" font-size="9" fill="#e6e9f0" text-anchor="middle" font-family="sans-serif">L</text><text x="82" y="86" font-size="9" fill="#e6e9f0" text-anchor="middle" font-family="sans-serif">R</text>` + label('1/4" L / R'), defs);
    case "ethercon":
      return panel(`<circle cx="60" cy="56" r="38" fill="url(#${M})" stroke="#0b0d11"/><circle cx="60" cy="56" r="32" fill="url(#${F})"/><rect x="45" y="44" width="30" height="24" rx="2" fill="#0a0b0f" stroke="#555b68"/><rect x="54" y="68" width="12" height="5" fill="#0a0b0f" stroke="#555b68"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<rect x="${48 + k * 3.2}" y="46" width="1.6" height="6" fill="#c8a24a"/>`).join("")}` + label("etherCON"), defs);
    default:
      return panel(quarterSocket(60, 56, N) + label(jackId.toUpperCase()), defs);
  }
}
