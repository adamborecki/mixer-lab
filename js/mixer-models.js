// Mixer skins: how a generic mixer *presents* the shared semantic state.
// A skin decides words, control types, placement and display logic. It never
// owns behaviour — both skins call the same MixerStore actions and hear the
// same audio graph. See docs/MIXER_MODEL_SCHEMA.md.

export const SKINS = {
  analog: {
    id: "analog",
    name: "Generic analog mixer",
    subtitle: "Analog-style console",
    blurb: "Long faders, MUTE buttons, AUX sends.",
    terms: {
      gain: "GAIN",
      pan: "PAN",
      aux1: "AUX 1",
      aux2: "AUX 2",
      aux1Master: "AUX 1 master",
      aux2Master: "AUX 2 master",
      enabled: "MUTE",
      level: "fader",
      levelShort: "FADER",
      main: "MAIN L/R master",
      mainShort: "MAIN",
      pfl: "PFL",
      phantom: "48V",
      lowCut: "LOW CUT",
      phones: "PHONES",
      stereo: "STEREO",
    },
    // MUTE is lit when the channel is NOT enabled.
    enabledControl: { label: "MUTE", litWhenEnabled: false, litText: "Muted", unlitText: "" },
    levelControl: "fader",
    phantomControl: "per-channel",
    layout: "console",
    // Channel strip, top to bottom. Each section is a block; each row is a
    // list of controls (a lone control needs no wrapper). Parts: phantom,
    // gain, aux1, aux2, pan, pfl, meter, enabled, level, and optionally lowCut.
    strip: [
      { className: "strip-top", rows: [{ parts: ["phantom", "lowCut"], className: "strip-row strip-switches" }, ["gain"], ["aux1"], ["aux2"], ["pan"], ["pfl"]] },
      { className: "strip-bottom", rows: [["enabled"], { parts: ["meter", "level"], className: "fader-row" }] },
    ],
    // A stereo input is still ONE strip. Same skin, but it drops the parts that
    // don't apply to a linked L/R line input (phantom, pan). A skin could instead
    // draw a stereo pair as two meters or a balance knob by changing this data.
    stereoStrip: [
      { className: "strip-top", rows: [["gain"], ["aux1"], ["aux2"], ["pfl"]] },
      { className: "strip-bottom", rows: [["enabled"], { parts: ["meter", "level"], className: "fader-row" }] },
    ],
    // Analog-style meter: 0 = nominal (−18 dBFS), with CLIP at the top.
    meter: {
      style: "ladder",
      orientation: "vertical",
      marks: [
        { db: -38, label: "−20" },
        { db: -28, label: "−10" },
        { db: -18, label: "0" },
        { db: -12, label: "+6" },
        { db: -6, label: "+12" },
        { db: 0, label: "CLIP" },
      ],
    },
    dragAxis: "vertical",
  },
  compact: {
    id: "compact",
    name: "Mixer B",
    subtitle: "Compact mixer",
    blurb: "Rotary levels, ON buttons, MON sends.",
    terms: {
      gain: "GAIN",
      pan: "PAN",
      aux1: "MON 1",
      aux2: "MON 2",
      aux1Master: "MON 1 master",
      aux2Master: "MON 2 master",
      enabled: "ON",
      level: "LEVEL knob",
      levelShort: "LEVEL",
      main: "MAIN level",
      mainShort: "MAIN",
      pfl: "PFL",
      phantom: "+48V",
      phones: "PHONES",
      stereo: "STEREO",
    },
    // ON is lit when the channel IS enabled.
    enabledControl: { label: "ON", litWhenEnabled: true, litText: "", unlitText: "Off" },
    levelControl: "knob",
    phantomControl: "global", // one +48V switch in the master section
    layout: "tiles",
    strip: [
      {
        className: "tile-body",
        rows: [
          ["enabled"],
          { parts: ["meter"], className: "tile-meter" },
          { parts: ["gain", "pan"], className: "tile-row tile-knobs" },
          { parts: ["aux1", "aux2"], className: "tile-row tile-knobs tile-sends" },
          { parts: ["level"], className: "tile-row tile-knobs tile-level" },
          { parts: ["pfl"], className: "tile-row tile-foot" },
        ],
      },
    ],
    stereoStrip: [
      {
        className: "tile-body",
        rows: [
          ["enabled"],
          { parts: ["meter"], className: "tile-meter" },
          { parts: ["gain"], className: "tile-row tile-knobs" },
          { parts: ["aux1", "aux2"], className: "tile-row tile-knobs tile-sends" },
          { parts: ["level"], className: "tile-row tile-knobs tile-level" },
          { parts: ["pfl"], className: "tile-row tile-foot" },
        ],
      },
    ],
    // Digital-style meter in dBFS.
    meter: {
      style: "leds",
      orientation: "horizontal",
      marks: [
        { db: -36, label: "−36" },
        { db: -18, label: "−18" },
        { db: -10, label: "−10" },
        { db: 0, label: "OL" },
      ],
    },
    dragAxis: "horizontal",
  },
  // The Mackie CR1604-VLZ: its own hardware (js/cr1604.js), drawn by
  // js/ui/mixer-1604-view.js. Words are the ones printed on the board.
  mackie1604: {
    id: "mackie1604",
    hardware: "cr1604",
    name: "Mackie 1604",
    subtitle: "CR1604-VLZ console",
    blurb: "16 channels, 6 aux sends, 4 subgroups, solo.",
    terms: {
      gain: "TRIM",
      pan: "PAN",
      aux1: "AUX 1",
      aux2: "AUX 2",
      aux3: "AUX 3",
      aux4: "AUX 4",
      aux5: "AUX 5",
      aux6: "AUX 6",
      sub1: "SUB 1",
      sub2: "SUB 2",
      sub3: "SUB 3",
      sub4: "SUB 4",
      mono: "MONO",
      ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`direct${i + 1}`, `DIRECT ${i + 1}`])),
      ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`insert${i + 1}`, `INSERT ${i + 1}`])),
      returns: "RETURNS",
      rec: "RECORDER",
      aux1Master: "AUX SEND 1 master",
      aux2Master: "AUX SEND 2 master",
      enabled: "MUTE",
      level: "fader",
      levelShort: "FADER",
      main: "MAIN L-R MIX fader",
      mainShort: "MAIN",
      pfl: "SOLO",
      phantom: "PHANTOM",
      lowCut: "LOW CUT",
      phones: "C-R/PHONES",
      stereo: "TAPE",
    },
    enabledControl: { label: "MUTE", litWhenEnabled: false, litText: "Muted", unlitText: "" },
    levelControl: "fader",
    phantomControl: "global",
    layout: "cr1604",
    dragAxis: "vertical",
  },
  // Compact mixers: their own hardware (js/compact-defs.js), drawn by js/ui/mixer-compact-view.js.
  ...compactSkin("vlz1202", "Mackie 1202-VLZ", "12-channel, MUTE/ALT 3-4", { aux1: "AUX 1", aux2: "AUX 2", alt: "ALT 3-4", phones: "C-R/PHONES", pfl: "SOLO", gain: "TRIM" }),
  ...compactSkin("mix8", "Mackie Mix8", "8-channel, one aux", { aux1: "AUX", phones: "CR/PHONES", pfl: "PFL" }),
  ...compactSkin("mg102", "Yamaha MG10/2", "10-channel, AUX1/AUX2 knob", { aux1: "AUX1", aux2: "AUX2", phones: "C-R/PHONES", pfl: "PFL" }),
  ...compactSkin("x1204usb", "Behringer Xenyx X1204USB", "12-input, COMP, AUX 1 + FX, faders", { aux1: "AUX 1", aux2: "FX", alt: "ALT 3-4", phones: "PHONES/CTRL R", pfl: "SOLO", gain: "TRIM", level: "fader", levelShort: "FADER", main: "MAIN MIX fader" }),
  ...compactSkin("ui16", "Soundcraft Ui16", "digital: SEL + mixes on faders", { aux3: "AUX 3", aux4: "AUX 4", aux1: "AUX 1", aux2: "AUX 2", fx1: "REVERB", fx2: "DELAY", fx3: "CHORUS", phones: "PHONES", pfl: "SOLO", level: "fader", levelShort: "FADER", main: "MASTER fader" }, { layout: "digital", dragAxis: "vertical" }),
  ...compactSkin("x32c", "Behringer X32 Compact", "digital console: layers, SEL, DCAs", { mix1: "MIX 1", mix2: "MIX 2", mix3: "MIX 3", mix4: "MIX 4", mix5: "MIX 5", mix6: "MIX 6", fx1: "FX 1", fx2: "FX 2", phones: "PHONES", pfl: "SOLO", level: "fader", levelShort: "FADER", main: "MAIN LR fader" }, { layout: "x32", dragAxis: "vertical" }),
  ...compactSkin("x32", "Behringer X32", "full console: matrices, routing, scenes", { mix1: "MIX 1", mix2: "MIX 2", mix3: "MIX 3", mix4: "MIX 4", mix5: "MIX 5", mix6: "MIX 6", mix7: "MIX 7", mix8: "MIX 8", mix9: "MIX 9", mix10: "MIX 10", mix11: "MIX 11", mix12: "MIX 12", mix13: "MIX 13", mix14: "MIX 14", mix15: "MIX 15", mix16: "MIX 16", mtx1: "MATRIX 1", mtx2: "MATRIX 2", mtx3: "MATRIX 3", mtx4: "MATRIX 4", mtx5: "MATRIX 5", mtx6: "MATRIX 6", mc: "M/C", phones: "PHONES", pfl: "SOLO", level: "fader", levelShort: "FADER", main: "MAIN LR fader" }, { layout: "x32", dragAxis: "vertical" }),
  ...compactSkin("yam01v96", "Yamaha 01V96i", "digital: layers, FADER MODE, display", { aux1: "AUX 1", aux2: "AUX 2", aux3: "AUX 3", aux4: "AUX 4", aux5: "AUX 5", aux6: "AUX 6", aux7: "AUX 7", aux8: "AUX 8", phones: "PHONES", pfl: "SOLO", enabled: "ON", level: "fader", levelShort: "FADER", main: "STEREO fader" }, { layout: "01v96", dragAxis: "vertical", enabledControl: { label: "ON", litWhenEnabled: true, litText: "", unlitText: "Off" } }),
  ...compactSkin("cl3", "Yamaha CL3", "touring console: Centralogic, touch screen, Rio", { mix1: "MIX 1", mix2: "MIX 2", mix3: "MIX 3", mix4: "MIX 4", mix5: "MIX 5", mix6: "MIX 6", mix7: "MIX 7", mix8: "MIX 8", mix9: "MIX 9", mix10: "MIX 10", mix11: "MIX 11", mix12: "MIX 12", mix13: "MIX 13", mix14: "MIX 14", mix15: "MIX 15", mix16: "MIX 16", mtx1: "MATRIX 1", mtx2: "MATRIX 2", mtx3: "MATRIX 3", mtx4: "MATRIX 4", mtx5: "MATRIX 5", mtx6: "MATRIX 6", mtx7: "MATRIX 7", mtx8: "MATRIX 8", phones: "PHONES", pfl: "CUE", enabled: "ON", level: "fader", levelShort: "FADER", main: "STEREO fader" }, { layout: "cl", dragAxis: "vertical", enabledControl: { label: "ON", litWhenEnabled: true, litText: "", unlitText: "Off" } }),
  ...compactSkin("dm2000", "Yamaha DM2000", "large digital console: encoders, buses, groups", { aux1: "AUX 1", aux2: "AUX 2", aux3: "AUX 3", aux4: "AUX 4", aux5: "AUX 5", aux6: "AUX 6", aux7: "AUX 7", aux8: "AUX 8", bus1: "BUS 1", bus2: "BUS 2", bus3: "BUS 3", bus4: "BUS 4", bus5: "BUS 5", bus6: "BUS 6", bus7: "BUS 7", bus8: "BUS 8", mtx1: "MATRIX 1", mtx2: "MATRIX 2", mtx3: "MATRIX 3", mtx4: "MATRIX 4", phones: "PHONES", pfl: "SOLO", enabled: "ON", level: "fader", levelShort: "FADER", main: "STEREO fader" }, { layout: "dm2000", dragAxis: "vertical", enabledControl: { label: "ON", litWhenEnabled: true, litText: "", unlitText: "Off" } }),
  ...compactSkin("f8n", "Zoom F8n Pro", "field recorder + mixer: isos, L/R mix, camera outs", { phones: "HEADPHONE", pfl: "PFL", phantom: "+48V", enabled: "track key", level: "track knob", levelShort: "KNOB", main: "L/R mix" }, { layout: "f8", dragAxis: "vertical" }),
  ...compactSkin("sd442", "Sound Devices 442", "4-input field mixer", { phones: "HEADPHONE", pfl: "PFL", phantom: "P48", level: "fader", levelShort: "FADER", main: "MASTER" }),
  ...compactSkin("b207mp3", "Behringer EUROLIVE B207MP3", "active speaker with a mixer inside", { thru: "THRU", gain: "LEVEL", phantom: "PHANTOM", main: "MAIN LEVEL", mainShort: "MAIN LEVEL" }),
  ...compactSkin("stagepas400bt", "Yamaha STAGEPAS 400BT", "powered mixer + speakers", { monitor: "MONITOR OUT", pfl: "PFL" }),
};

// A skin for a compact mixer: the words come from the board.
function compactSkin(id, name, subtitle, words, over = {}) {
  return {
    [id]: {
      id,
      hardware: id,
      name,
      subtitle,
      terms: {
        gain: "GAIN",
        pan: "PAN",
        aux1Master: "AUX master",
        aux2Master: "AUX 2 master",
        enabled: "MUTE",
        level: "LEVEL knob",
        levelShort: "LEVEL",
        main: "MAIN",
        mainShort: "MAIN",
        phantom: "48V",
        stereo: "STEREO",
        rec: "RECORDER",
        ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`insert${i + 1}`, `INSERT ${i + 1}`])),
        ...words,
      },
      enabledControl: { label: "MUTE", litWhenEnabled: false, litText: "Muted", unlitText: "" },
      levelControl: "knob",
      phantomControl: "global",
      layout: "compact",
      dragAxis: "vertical",
      ...over,
    },
  };
}

export const SKIN_IDS = Object.keys(SKINS);
export const DEFAULT_SKIN = "analog";

// ---------- mappings (semantic ↔ presentation) ----------

// Is the skin's enable button lit for this semantic state?
export function enabledLit(skin, enabled) {
  return skin.enabledControl.litWhenEnabled === !!enabled;
}

// Semantic value after the student presses the skin's enable button.
// Pressing MUTE or ON always toggles `enabled` — the inversion is only in
// what "lit" means.
export function enabledAfterPress(skin, enabled) {
  return !enabled;
}

// Words for the enable state that don't rely on colour.
export function enabledStatusText(skin, enabled) {
  const c = skin.enabledControl;
  return enabledLit(skin, enabled) ? c.litText : c.unlitText;
}

// A global phantom switch shows the combined state of every channel.
export function globalPhantomState(channels) {
  const mics = channels.filter((c) => !c.stereo); // stereo line inputs have no phantom power
  const on = mics.filter((c) => c.phantom).length;
  if (on === 0) return "off";
  return on === mics.length ? "on" : "mixed";
}
