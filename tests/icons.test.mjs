// The icon library is presentation only: it must cover the model, stay original
// and accessible, and never be what decides whether a connection works.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONNECTOR_GUIDE, ICON_NAMES, deviceIconName, icon, iconLabel, jackIconName, levelIconName, plugIconName } from "../js/ui/icons.js";
import { CABLES, DEVICE_TYPES, JACKS, PLUGS, checkConnection } from "../js/connection-model.js";
import { PLAYBACK_DEVICES } from "../js/scenarios.js";

describe("icon library", () => {
  it("includes every required piece of gear and connector", () => {
    for (const n of ["pa-speaker-active", "wedge-active", "wedge-passive", "power-amp", "laptop", "mic", "mixer", "xlr-m", "xlr-f", "trs14", "ts14", "trs35", "rca", "speakon", "iec"]) {
      assert.ok(ICON_NAMES.includes(n), n);
    }
  });

  it("every icon renders a self-contained SVG with no external or scripted content", () => {
    for (const name of ICON_NAMES) {
      const svg = icon(name);
      assert.match(svg, /^<svg [^>]*viewBox="0 0 48 48"/, name);
      assert.ok(svg.endsWith("</svg>"), name);
      assert.doesNotMatch(svg, /href|<image|<script|<foreignObject|https?:|url\(|on\w+=/i, name);
      assert.doesNotMatch(svg, /[\u{1F000}-\u{1FFFF}☀-➿]/u, `${name}: no emoji`);
      assert.equal((svg.match(/<svg/g) || []).length, 1, name);
    }
  });

  it("is decorative by default and labelled on request", () => {
    assert.match(icon("mixer"), /aria-hidden="true"/);
    assert.doesNotMatch(icon("mixer"), /role="img"/);
    assert.match(icon("mixer", { label: true }), /role="img" aria-label="Mixer"/);
    assert.match(icon("xlr-m", { label: 'A "quoted" name' }), /aria-label="A &quot;quoted&quot; name"/);
    for (const name of ICON_NAMES) assert.ok(iconLabel(name).length > 3, `${name} has a description`);
    assert.throws(() => icon("nope"));
  });

  it("active speakers show a power badge and amp module; passive ones show neither", () => {
    for (const n of ["pa-speaker-active", "wedge-active"]) {
      assert.match(icon(n), /ico-power/);
      assert.match(icon(n), /ico-amp/);
    }
    for (const n of ["pa-speaker-passive", "wedge-passive"]) {
      assert.doesNotMatch(icon(n), /ico-power|ico-amp/);
      assert.match(icon(n), /ico-terminals/);
    }
  });

  it("male and female XLR, and TS and TRS, are different drawings", () => {
    assert.notEqual(icon("xlr-m"), icon("xlr-f"));
    assert.notEqual(icon("trs14"), icon("ts14"));
    assert.notEqual(icon("level-line"), icon("level-speaker"));
    assert.notEqual(icon("cable-signal"), icon("cable-speaker"));
  });
});

describe("mapping the model to pictures", () => {
  it("every device type gets an icon, and speakers pick active/passive and PA/wedge correctly", () => {
    for (const [type, def] of Object.entries(DEVICE_TYPES)) {
      const zone = def.endpoint ? "foh" : undefined;
      assert.ok(ICON_NAMES.includes(deviceIconName({ type, zone })), type);
    }
    for (const [id, d] of Object.entries(PLAYBACK_DEVICES)) {
      const name = deviceIconName({ type: d.type, zone: d.zone });
      assert.ok(ICON_NAMES.includes(name), id);
      assert.equal(name.endsWith("active"), DEVICE_TYPES[d.type].amp === "internal", `${id} active/passive matches the model`);
      assert.equal(name.startsWith("wedge"), d.zone === "stage", `${id} wedge/PA matches its zone`);
    }
  });

  it("every plug and jack in the model has an icon", () => {
    for (const id of Object.keys(PLUGS)) assert.ok(ICON_NAMES.includes(plugIconName(id, "in")), id);
    for (const id of Object.keys(JACKS)) {
      for (const dir of ["in", "out"]) assert.ok(ICON_NAMES.includes(jackIconName(id, dir)), `${id}/${dir}`);
    }
    assert.equal(plugIconName("xlr", "out"), "xlr-f");
    assert.equal(plugIconName("xlr", "in"), "xlr-m");
    assert.equal(jackIconName("xlr", "out"), "xlr-m");
    assert.equal(levelIconName("speaker"), "level-speaker");
    assert.equal(levelIconName("line"), "level-line");
  });

  it("the connector guide only uses real icons", () => {
    for (const [name, title, text] of CONNECTOR_GUIDE) {
      assert.ok(ICON_NAMES.includes(name), name);
      assert.ok(title && text);
    }
  });

  it("appearance never decides compatibility: the model still answers checkConnection", () => {
    const rig = {
      devices: [
        { id: "mixer", type: "mixer" },
        { id: "spk", type: "passive-speaker", zone: "foh" },
      ],
      cables: [],
    };
    // A line-level XLR output plugged straight into a passive speaker still fits physically; the analysis, not the icon, says it is silent.
    assert.equal(checkConnection(rig, "mixer/main-l", "spk/in", "xlr-trs").ok, true);
    assert.ok(CABLES["xlr-trs"]);
  });
});

describe("icons for the real mixers and the camera", () => {
  it("every mixer device draws as a mixer, a camera input as a camera", () => {
    for (const type of ["vlz1202", "mix8", "x1204usb", "sd442", "cr1604"]) assert.equal(deviceIconName({ id: "mixer", type }), "mixer", type);
    assert.equal(deviceIconName({ id: "cam-1", type: "camera-input" }), "camera");
  });
});
