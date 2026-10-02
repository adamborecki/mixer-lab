// Mixer skins: how a generic mixer *presents* the shared semantic state.
// A skin decides words, control types, placement and display logic. It never
// owns behaviour — both skins call the same MixerStore actions and hear the
// same audio graph. See docs/MIXER_MODEL_SCHEMA.md.

export const SKINS = {
  analog: {
    id: "analog",
    name: "Mixer A",
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
};

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
