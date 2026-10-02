// Stereo input 9/10: one linked L/R channel strip fed by a laptop's 3.5 mm out.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CABLES, DEVICE_TYPES, analyzeRig, checkConnection, channelPortRef, plugFitsJack } from "../js/connection-model.js";
import { CHANNEL_COUNT, CHANNEL_LAYOUT, MixerStore, computeMix, createMixerState, levelToDb, dbToLevel, HEADROOM_DB } from "../js/mixer-state.js";
import { SKINS, globalPhantomState } from "../js/mixer-models.js";
import { SOURCES_BY_ID, STEMS, LOOP_ASSETS, PRESHOW } from "../audio/source-manifest.js";
import { SCENARIOS_BY_ID, buildScenarioState, defaultCableFor, nominalGainDb, sourceDeviceId } from "../js/scenarios.js";

const LAPTOP = "src-preshow/out";
const IN = "mixer/ch9-10";
const preshow = SOURCES_BY_ID.preshow;
const freePlay = () => buildScenarioState(SCENARIOS_BY_ID["free-play"]);
const patchPreshow = (state) => {
  if (state.rig.cables.some((c) => c.from === LAPTOP)) return state;
  state.rig.cables.push({ id: "pre", from: LAPTOP, to: IN, cable: "mini-dual-ts" });
  return state;
};

describe("stereo input model", () => {
  it("9/10 is one stereo channel strip, not two mono channels", () => {
    assert.equal(CHANNEL_COUNT, 9);
    assert.equal(CHANNEL_LAYOUT[8].stereo, true);
    assert.equal(CHANNEL_LAYOUT[8].label, "9/10");
    const ports = DEVICE_TYPES.mixer.ports.filter((p) => p.role === "channel-input" && p.stereo);
    assert.equal(ports.length, 1);
    assert.equal(channelPortRef(8), IN);
    assert.equal(channelPortRef(0), "mixer/ch1");
    const s = createMixerState();
    assert.equal(s.channels.length, 9);
    assert.equal(s.channels[8].stereo, true);
    assert.equal(s.channels.filter((c) => c.stereo).length, 1);
  });

  it("the laptop's 3.5 mm stereo line out and the 9/10 jack carry connector metadata", () => {
    const out = DEVICE_TYPES["stereo-laptop"].ports[0];
    assert.deepEqual([out.jack, out.level, out.stereo], ["mini", "line", true]);
    assert.equal(preshow.connector, "trs35");
    assert.equal(preshow.asset, "preshow");
    assert.equal(LOOP_ASSETS.preshow, PRESHOW);
    assert.equal(PRESHOW.file, "audio/preshow/joth-bossa-nova.mp3");
  });

  it("only the breakout cable joins the laptop to 9/10", () => {
    const rig = freePlay().rig;
    rig.cables = rig.cables.filter((c) => c.from !== LAPTOP); // Free play ships it patched
    assert.equal(checkConnection(rig, LAPTOP, IN, "mini-dual-ts").ok, true);
    for (const cable of Object.keys(CABLES).filter((c) => c !== "mini-dual-ts")) assert.equal(checkConnection(rig, LAPTOP, IN, cable).ok, false, cable);
    assert.equal(defaultCableFor(preshow), "mini-dual-ts");
  });

  it("the breakout does not fit the mono combo inputs, and mono sources do not fit 9/10", () => {
    const rig = freePlay().rig;
    assert.equal(plugFitsJack("dualts14", "combo"), false);
    assert.equal(checkConnection(rig, LAPTOP, "mixer/ch1", "mini-dual-ts").ok, false);
    assert.equal(checkConnection(rig, "src-keys/out", IN, "ts").ok, false);
    assert.equal(checkConnection(rig, "src-lead-vocal/out", IN, "xlr").ok, false);
  });

  it("analyzeRig reports a stereo line input with no pad", () => {
    const s = patchPreshow(freePlay());
    const info = analyzeRig(s.rig, s.channels, SOURCES_BY_ID).channels[8];
    assert.equal(info.connected, true);
    assert.equal(info.stereo, true);
    assert.equal(info.path, "line");
    assert.equal(info.padDb, 0);
    assert.equal(info.signal, true);
    assert.equal(info.status, "ok");
  });
});

describe("stereo channel in the mix", () => {
  it("Free play starts with the preshow laptop patched to 9/10 on a muted channel, band unchanged", () => {
    const s = freePlay();
    assert.ok(s.rig.devices.some((d) => d.id === sourceDeviceId("preshow") && d.type === "stereo-laptop"));
    const cable = s.rig.cables.find((c) => c.from === LAPTOP);
    assert.equal(cable.to, IN);
    assert.equal(cable.cable, "mini-dual-ts");
    assert.equal(s.channels[8].enabled, false);
    const mix = computeMix(s, SOURCES_BY_ID, STEMS);
    assert.equal(mix.channels[8].input.connected, true);
    assert.equal(mix.channels[8].input.status, "ok");
    for (let i = 0; i < 8; i++) assert.equal(s.channels[i].enabled, true);
    for (let i = 0; i < 7; i++) assert.equal(mix.channels[i].input.connected, true);
  });

  it("scenarios other than Free play do not include the laptop", () => {
    for (const id of ["build-rig", "find-amp", "more-vocal", "drummer-wedge", "more-piano", "monitor-quiet", "foh-vocal", "missing-guitar", "drummer-mix"]) {
      assert.equal(buildScenarioState(SCENARIOS_BY_ID[id]).rig.devices.some((d) => d.sourceId === "preshow"), false, id);
    }
  });

  it("starting gain lands the stereo source in the Good band", () => {
    const s = patchPreshow(freePlay());
    const mix = computeMix(s, SOURCES_BY_ID, STEMS);
    const c = mix.channels[8];
    assert.equal(s.channels[8].gainDb, nominalGainDb(preshow));
    assert.equal(c.inputPeakDb, preshow.peakDb + preshow.outputDb + s.channels[8].gainDb + HEADROOM_DB);
    assert.equal(c.band, "good");
  });

  it("left goes to Main L and right to Main R at the same level (no pan law)", () => {
    const s = patchPreshow(freePlay());
    s.channels[8].enabled = true; // Free play starts it muted
    const c = computeMix(s, SOURCES_BY_ID, STEMS).channels[8];
    assert.equal(c.mainDb.L, c.mainDb.R);
    assert.equal(c.mainDb.L, c.inputPeakDb + levelToDb(s.channels[8].level) + levelToDb(s.main.level));
    // a mono strip at centre is 3 dB down on each side; the stereo strip is not
    s.channels[8].pan = 1; // ignored on a stereo strip
    assert.equal(computeMix(s, SOURCES_BY_ID, STEMS).channels[8].mainDb.R, c.mainDb.R);
  });

  it("mute, aux sends and PFL work like any other channel", () => {
    const s = patchPreshow(freePlay());
    const store = new MixerStore(s);
    store.setChannel(8, "enabled", false);
    let c = computeMix(store.state, SOURCES_BY_ID, STEMS).channels[8];
    assert.equal(c.heardMainDb, -Infinity);
    store.setSend(8, "aux2", dbToLevel(0));
    store.setChannel(8, "pfl", true);
    c = computeMix(store.state, SOURCES_BY_ID, STEMS).channels[8];
    assert.ok(c.aux.aux2.heardDb > -30, "aux still flows while muted from Main");
    assert.equal(c.pflDb, c.inputPeakDb);
  });

  it("phantom power, pan and low cut do not apply to the stereo strip", () => {
    const store = new MixerStore(freePlay());
    store.setChannel(8, "phantom", true);
    store.setChannel(8, "pan", 0.8);
    store.setChannel(8, "lowCut", true);
    assert.equal(store.state.channels[8].lowCut, false);
    store.setChannel(0, "lowCut", true);
    assert.equal(store.state.channels[0].lowCut, true);
    assert.equal(store.state.channels[8].phantom, false);
    assert.equal(store.state.channels[8].pan, 0);
    store.setAllPhantom(true);
    assert.equal(store.state.channels[8].phantom, false);
    assert.equal(globalPhantomState(store.state.channels), "on"); // judged over the XLR/mic channels only
  });
});

describe("skins and stereo", () => {
  it("every skin offers a stereo strip that keeps the level controls and drops phantom and pan", () => {
    for (const skin of Object.values(SKINS)) {
      const parts = skin.stereoStrip.flatMap((sec) => sec.rows.flatMap((r) => (Array.isArray(r) ? r : r.parts)));
      for (const p of ["gain", "aux1", "aux2", "pfl", "meter", "enabled", "level"]) assert.equal(parts.filter((x) => x === p).length, 1, `${skin.id}: ${p}`);
      assert.equal(parts.includes("phantom"), false);
      assert.equal(parts.includes("pan"), false);
      assert.ok(skin.terms.stereo);
    }
  });
});
