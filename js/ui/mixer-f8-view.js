// Draws the Zoom F8n Pro (js/compact-defs.js `f8n`) the way the recorder is
// laid out (F8n Pro Operation Manual, "Functions of parts"):
//   - the LCD, here with three screens: MIXER (all eight tracks at a glance),
//     INPUT (one track's TRIM, +48V, HPF, phase, pan, Stereo Link) and OUTPUT
//     (MAIN OUT routing and Output Level, SUB OUT level);
//   - eight track columns: LED meter, track knob (the track's fader into the
//     L/R mix), track key (lit red: the input is on and recording) and PFL;
//   - the HEADPHONE volume knob.
// On the real F8n everything but the knobs and keys is in the menu (MENU,
// then the selection encoder); here the screens are tabs.
// The selected track and the screen are the view's own (view.f8).

import { LAWS, hpfHz, linkOf } from "../compact.js";
import { formatDb, formatPan } from "../levels.js";
import { button, el, knob, meterBar, row } from "./mixer-digital-view.js";

const lawFormat = (law) => (v) => formatDb(law.toDb(v), { unity: true });
const SCREENS = [
  ["mixer", "MIXER"],
  ["input", "INPUT"],
  ["output", "OUTPUT"],
];
const OUTS = [
  ["out1", "bus1", "MAIN OUT 1"],
  ["out2", "bus2", "MAIN OUT 2"],
];

export function renderF8(view, def) {
  if (!view.f8 || view.f8.id !== def.id) view.f8 = { id: def.id, sel: 5, page: "mixer" };
  const ui = view.f8;
  const rerender = () => view.render();
  view.def = def;
  view.dgMeters = [];
  view.dgHeads = [];
  view.dgGr = null;
  view.paths = [];
  view.pathKey = "";
  const surface = el("div", "mixer-surface f8-surface");
  // Track columns first, so the names (from the patch) exist for the screen.
  const tracks = trackSection(view, def, ui, rerender);
  surface.append(lcd(view, def, ui, rerender), tracks);
  view.root.appendChild(surface);
}

const nameOf = (view, i) => view.dgHeads[i]?.querySelector(".strip-name")?.textContent || "";
const mixerDev = (s) => s.rig.devices.find((d) => d.id === "mixer");

// ---------- the LCD ----------

function lcd(view, def, ui, rerender) {
  const box = el("section", "f8-lcd");
  box.setAttribute("aria-label", "Display");
  const tabs = el("div", "f8-tabs");
  tabs.setAttribute("role", "tablist");
  for (const [id, label] of SCREENS) {
    const b = el("button", `f8-tab${ui.page === id ? " on" : ""}`, label);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(ui.page === id));
    b.addEventListener("click", () => ((ui.page = id), rerender()));
    tabs.appendChild(b);
  }
  box.appendChild(tabs);
  if (ui.page === "input") box.appendChild(inputScreen(view, def, ui, rerender));
  else if (ui.page === "output") box.appendChild(outputScreen(view, def));
  else box.appendChild(mixerScreen(view, def, ui, rerender));
  return box;
}

// MIXER: every track's trim, pan and fader, and what's switched on.
function mixerScreen(view, def, ui, rerender) {
  const grid = el("div", "f8-mixer");
  const fader = LAWS[def.levelLaw];
  def.channels.forEach((c, i) => {
    const col = el("button", `f8-mixcol${ui.sel === i ? " is-sel" : ""}`);
    col.type = "button";
    col.setAttribute("aria-label", `Track ${c.label}: open its INPUT settings`);
    col.addEventListener("click", () => {
      ui.sel = i;
      ui.page = "input";
      rerender();
    });
    view.bindings.push({
      kind: "fn",
      run: (s) => {
        const ch = s.channels[i];
        const linked = !!linkOf(def, s, i)?.follower;
        col.classList.toggle("is-off", !ch.enabled);
        col.classList.toggle("is-pfl", !!ch.solo);
        const fdb = fader.toDb(ch.level);
        col.innerHTML = `<b>${c.label}</b><span class="f8-name">${nameOf(view, i) || "—"}</span><span>TRIM ${Math.round(ch.gainDb)}</span><span>${linked ? "LINK" : formatPan(ch.pan)}</span><span>${fdb === -Infinity ? "MUTE" : `${fdb > 0 ? "+" : ""}${fdb.toFixed(0)} dB`}</span><span class="f8-flags">${[ch.phantom ? "48V" : "", hpfHz(c, ch.hpf) ? "HPF" : "", ch.polarity ? "Ø" : ""].filter(Boolean).join(" ") || "&nbsp;"}</span>`;
      },
    });
    grid.appendChild(col);
  });
  const note = el("p", "f8-note");
  view.bindings.push({
    kind: "fn",
    run: (s) => {
      const pfl = s.channels.filter((c) => c.solo).map((c) => c.label);
      note.textContent = pfl.length ? `PFL: the headphones hear track ${pfl.join(", ")} alone, before its fader.` : "Track knobs set each track's level in the L/R mix. They don't change what each track records.";
    },
  });
  const wrap = el("div", "f8-screen");
  wrap.append(grid, note);
  return wrap;
}

// INPUT: one track's settings (Menu → INPUT on the real recorder).
function inputScreen(view, def, ui, rerender) {
  const store = view.store;
  const i = ui.sel;
  const c = def.channels[i];
  const ch = (s) => s.channels[i];
  const wrap = el("div", "f8-screen");
  const title = el("p", "f8-title");
  view.bindings.push({ kind: "fn", run: () => (title.textContent = `INPUT · Track ${c.label} ${nameOf(view, i)}`) });
  const step = (d, label) => {
    const b = el("button", "dg-step", d < 0 ? "‹" : "›");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.addEventListener("click", () => ((ui.sel = (i + d + def.channels.length) % def.channels.length), rerender()));
    return b;
  };
  wrap.appendChild(row("f8-head", step(-1, "Previous track"), title, step(1, "Next track")));
  const linkPair = def.link && def.link.pair.includes(i);
  wrap.appendChild(
    row(
      "f8-row",
      knob(view, { label: "TRIM", sheetLabel: `Track ${c.label} trim`, min: c.gain.min, max: c.gain.max, step: 0.5, defaultValue: 30, tone: "gain", format: (v) => `+${Math.round(v)} dB`, onInput: (v) => store.setChannel(i, "gainDb", v) }, (s) => ch(s).gainDb),
      button(view, { label: "+48V", tone: "phantom", get: (s) => !!ch(s).phantom, onPress: () => store.setChannel(i, "phantom", !ch(store.state).phantom), aria: (s) => `Track ${c.label} phantom power: ${ch(s).phantom ? "on" : "off"}` }),
      knob(view, { label: "HPF", sheetLabel: `Track ${c.label} high-pass filter`, defaultValue: 0, tone: "eq", format: (v) => (hpfHz(c, v) ? `${Math.round(hpfHz(c, v))} Hz` : "OFF"), onInput: (v) => store.setChannel(i, "hpf", v) }, (s) => ch(s).hpf),
      button(view, { label: "Ø", get: (s) => !!ch(s).polarity, onPress: () => store.setChannel(i, "polarity", !ch(store.state).polarity), aria: (s) => `Track ${c.label} phase invert: ${ch(s).polarity ? "on" : "off"}` }),
      knob(view, { label: "PAN", sheetLabel: `Track ${c.label} pan`, min: -1, max: 1, step: 0.02, defaultValue: 0, bipolar: true, tone: "pan", format: formatPan, onInput: (v) => store.setChannel(i, "pan", v) }, (s) => ch(s).pan),
      linkPair ? button(view, { label: `LINK ${def.link.pair.map((k) => k + 1).join("/")}`, tone: "assign", get: (s) => s.link?.mode === "on", onPress: () => store.setBus("link", "mode", store.state.link.mode === "on" ? "off" : "on"), aria: (s) => `Stereo Link ${def.link.pair.map((k) => k + 1).join("/")}: ${s.link?.mode === "on" ? "on" : "off"}` }) : null,
    ),
  );
  wrap.appendChild(el("p", "f8-note", "TRIM sets the recording level of this track (its iso). Set it for the loudest moment; the track knob only changes the mix."));
  return wrap;
}

// OUTPUT: MAIN OUT Routing (L/R, or tracks prefader/postfader) and Output Level.
function outputScreen(view, def) {
  const store = view.store;
  const wrap = el("div", "f8-screen");
  const choice = (label, on, onPress, aria) => {
    const b = el("button", `f8-key${on ? " on" : ""}`, label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", aria);
    b.addEventListener("click", onPress);
    return b;
  };
  for (const [o, bus, name] of OUTS) {
    const line = el("div", "f8-out");
    view.bindings.push({
      kind: "fn",
      run: (s) => {
        line.replaceChildren();
        const src = s.routing[o];
        const setRoute = (want) => {
          // L/R and tracks are exclusive: picking one clears the other.
          if (want !== bus) for (let k = 0; k < def.channels.length; k++) if (s.channels[k].sends[bus] >= 0.5) store.setChannel(k, `sends.${bus}`, 0);
          store.setBus("routing", o, want);
        };
        line.append(
          el("span", "f8-outname", name),
          choice("L", src === "main-l", () => setRoute(src === "main-l" ? "off" : "main-l"), `${name}: the L side of the mix`),
          choice("R", src === "main-r", () => setRoute(src === "main-r" ? "off" : "main-r"), `${name}: the R side of the mix`),
          el("span", "f8-sep", "or tracks"),
          ...def.channels.map((c, k) => {
            const ch = s.channels[k];
            const st = ch.sends[bus] >= 0.5 ? (ch.pres[bus] ? "PRE" : "POST") : "OFF";
            return choice(`${c.label}${st === "OFF" ? "" : ` ${st}`}`, st !== "OFF", () => {
              // Each press cycles Prefader → Postfader → Off, as on the recorder.
              if (st === "OFF") {
                store.setChannel(k, `pres.${bus}`, true);
                store.setChannel(k, `sends.${bus}`, 1);
                if (s.routing[o] !== bus) store.setBus("routing", o, bus);
              } else if (st === "PRE") store.setChannel(k, `pres.${bus}`, false);
              else {
                store.setChannel(k, `sends.${bus}`, 0);
                if (!store.state.channels.some((x) => x.sends[bus] >= 0.5)) store.setBus("routing", o, "off");
              }
            }, `${name}: track ${c.label} ${st === "OFF" ? "off" : st === "PRE" ? "prefader" : "postfader"} (press to change)`);
          }),
        );
      },
    });
    wrap.appendChild(line);
  }
  for (const w of def.outSwitches) {
    const label = w.key === "mainLevel" ? "MAIN OUT 1/2 Output Level" : "SUB OUT (L/R mix) Output Level";
    wrap.appendChild(
      row(
        "f8-row",
        el("span", "f8-outname", label),
        ...w.labels.map((l, k) => button(view, { label: l, tone: "assign", get: (s) => (mixerDev(s)?.[w.key] ?? 0) === k, onPress: () => store.setDevice("mixer", w.key, k), aria: (s) => `${label}: ${l}${(mixerDev(s)?.[w.key] ?? 0) === k ? " (selected)" : ""}` })),
      ),
    );
  }
  wrap.appendChild(el("p", "f8-note", "LINE (+4 dBu) suits a camera's LINE input, NORMAL (−10 dBV) a consumer line input, MIC (−40 dBV) a camera's mic jack."));
  return wrap;
}

// ---------- the track columns ----------

function trackSection(view, def, ui, rerender) {
  const store = view.store;
  const box = el("section", "f8-front");
  const strips = el("div", "f8-tracks");
  const fader = LAWS[def.levelLaw];
  def.channels.forEach((c, i) => {
    const ch = (s) => s.channels[i];
    const col = el("section", `strip f8-track${ui.sel === i ? " is-sel" : ""}`);
    col.setAttribute("aria-label", `Track ${c.label}`);
    const head = el("button", "strip-head");
    head.type = "button";
    head.addEventListener("click", () => view.onPatchChannel(i));
    view.bindings.push({ kind: "head", el: head, index: i });
    view.dgHeads[i] = head;
    const trackKey = button(view, { label: c.label, tone: "mute", small: false, get: (s) => ch(s).enabled, onPress: () => store.setChannel(i, "enabled", !ch(store.state).enabled), aria: (s) => `Track ${c.label} key: ${ch(s).enabled ? "lit, the input is on and records" : "dark, the input is off"}` });
    const pfl = button(view, { label: "PFL", tone: "pfl", get: (s) => !!ch(s).solo, onPress: () => store.setChannel(i, "solo", !ch(store.state).solo), aria: (s) => `Track ${c.label} PFL: ${ch(s).solo ? "on" : "off"}` });
    const trackKnob = knob(view, { label: "LEVEL", sheetLabel: `Track ${c.label} knob (fader)`, defaultValue: fader.toPos(0), tone: "level", format: lawFormat(fader), onInput: (v) => store.setChannel(i, "level", v) }, (s) => ch(s).level);
    view.bindings.push({ kind: "fn", run: (s) => col.classList.toggle("is-muted", !ch(s).enabled) });
    col.addEventListener("pointerdown", () => {
      if (ui.sel !== i) {
        ui.sel = i;
        col.closest(".f8-tracks")?.querySelectorAll(".f8-track").forEach((t, k) => t.classList.toggle("is-sel", k === i));
      }
    });
    col.append(head, row("f8-meterrow", meterBar(view, i)), trackKnob, trackKey, pfl);
    strips.appendChild(col);
  });
  const phones = knob(view, { label: "HEADPHONE", sheetLabel: "Headphone volume", defaultValue: 0.5, tone: "level", format: lawFormat(LAWS.master), onInput: (v) => store.setBus("cr", "level", v) }, (s) => s.cr.level);
  box.append(el("h4", "x32-title", "TRACKS 1–8 · track knob · track key (REC) · PFL"), row("f8-front-row", strips, row("f8-master", el("div", "f8-lr", "L/R"), row("dg-master-meters", meterBar(view, "L"), meterBar(view, "R")), phones)));
  return box;
}
