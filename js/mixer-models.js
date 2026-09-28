// Mixer skins: how a generic mixer *presents* the shared semantic state.
// A skin decides words, control types, placement and display logic. It never
// owns behaviour — both skins call the same MixerStore actions and hear the
// same audio graph. See docs/MIXER_MODEL_SCHEMA.md.

export const SKINS = {
  analog: {
    id: "analog",
    name: "Console A",
    subtitle: "Analog-style console",
    blurb: "Long faders, MUTE buttons, AUX sends.",
    terms: {
      gain: "GAIN",
      pan: "PAN",
      aux: "AUX 1",
      auxMaster: "AUX 1 master",
      enabled: "MUTE",
      level: "fader",
      levelShort: "FADER",
      main: "MAIN L/R master",
      mainShort: "MAIN",
      pfl: "PFL",
      phantom: "48V",
      phones: "PHONES",
    },
    // MUTE is lit when the channel is NOT enabled.
    enabledControl: { label: "MUTE", litWhenEnabled: false, litText: "Muted", unlitText: "" },
    levelControl: "fader",
    phantomControl: "per-channel",
    layout: "console",
    // Channel strip, top to bottom. Each section is a block; each row is a
    // list of controls (a lone control needs no wrapper). Parts: phantom,
    // gain, aux, pan, pfl, meter, enabled, level.
    strip: [
      { className: "strip-top", rows: [["phantom"], ["gain"], ["aux"], ["pan"], ["pfl"]] },
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
      aux: "MON",
      auxMaster: "MON master",
      enabled: "ON",
      level: "LEVEL knob",
      levelShort: "LEVEL",
      main: "MAIN level",
      mainShort: "MAIN",
      pfl: "PFL",
      phantom: "+48V",
      phones: "PHONES",
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
          { parts: ["level", "aux"], className: "tile-row tile-knobs tile-level" },
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
        { db: -6, label: "−6" },
        { db: 0, label: "OL" },
      ],
    },
    dragAxis: "horizontal",
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
  const on = channels.filter((c) => c.phantom).length;
  if (on === 0) return "off";
  return on === channels.length ? "on" : "mixed";
}
