// Pure-logic tests for the connection model, level law, computed mix and store.
// Run with `npm test` (node --test tests/). No DOM, no Web Audio.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PLUGS, JACKS, CABLES, SIGNAL_LEVELS, DEVICE_TYPES, plugFitsJack, checkConnection, plugAtInput, analyzeRig } from "../js/connection-model.js";
import { createMixerState, MixerStore, computeMix, levelToDb, dbToLevel, panGains, HEADROOM_DB } from "../js/mixer-state.js";
import { SOURCES, SOURCES_BY_ID, STEMS } from "../audio/source-manifest.js";

// ---------- helpers ----------

const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);

const SPK_L = { id: "spk-l", type: "powered-speaker", zone: "foh", pan: -1 };
const SPK_R = { id: "spk-r", type: "powered-speaker", zone: "foh", pan: 1 };
const PSPK_L = { id: "pspk-l", type: "passive-speaker", zone: "foh", pan: -1 };
const WEDGE = { id: "wedge", type: "powered-speaker", zone: "stage", pan: 0 };
const AMP = { id: "amp", type: "power-amp" };
const src = (sourceId, type) => ({ id: `src-${sourceId}`, type, sourceId });

function rigState(...devices) {
  const state = createMixerState();
  state.rig.devices.push(...devices);
  return state;
}
let seq = 0;
function patch(state, from, to, cable) {
  state.rig.cables.push({ id: `t${++seq}`, from, to, cable });
  return state;
}
const analyze = (state) => analyzeRig(state.rig, state.channels, SOURCES_BY_ID);
const chIndex = (sourceId) => SOURCES_BY_ID[sourceId].order - 1;

// ---------- connectors vs signal levels ----------

describe("connectors and signal levels", () => {
  it("a speaker cable and an instrument cable share plugs but differ in kind", () => {
    assert.deepEqual(CABLES.speaker.ends, CABLES.ts.ends);
    assert.equal(CABLES.ts.kind, "signal");
    assert.equal(CABLES.speaker.kind, "speaker");
  });

  it("signal levels are not connectors, and one jack shape carries different levels", () => {
    assert.deepEqual(Object.keys(SIGNAL_LEVELS), ["mic", "instrument", "line", "speaker"]);
    for (const level of Object.keys(SIGNAL_LEVELS)) assert.ok(!(level in PLUGS) && !(level in JACKS));
    const lineOut = DEVICE_TYPES["line-source"].ports[0];
    const speakerIn = DEVICE_TYPES["passive-speaker"].ports[0];
    assert.equal(lineOut.jack, speakerIn.jack); // both 1/4"
    assert.notEqual(lineOut.level, speakerIn.level); // line vs speaker
  });

  const FIT = {
    xlr: { xlr: true, combo: true, quarter: false, rca: false, mini: false },
    trs14: { xlr: false, combo: true, quarter: true, rca: false, mini: false },
    ts14: { xlr: false, combo: true, quarter: true, rca: false, mini: false },
    rca: { xlr: false, combo: false, quarter: false, rca: true, mini: false },
    trs35: { xlr: false, combo: false, quarter: false, rca: false, mini: true },
  };
  for (const [plug, row] of Object.entries(FIT)) {
    it(`plugFitsJack: ${PLUGS[plug].name} plug`, () => {
      for (const [jack, fits] of Object.entries(row)) assert.equal(plugFitsJack(plug, jack), fits, `${plug} → ${jack}`);
    });
  }

  it("plugFitsJack is false for unknown ids", () => {
    assert.equal(plugFitsJack("nope", "xlr"), false);
    assert.equal(plugFitsJack("xlr", "nope"), false);
  });
});

// ---------- checkConnection ----------

describe("checkConnection", () => {
  const state = () => rigState(src("lead-vocal", "dynamic-mic"), src("keys", "line-source"), src("bass", "di-box"), SPK_L, PSPK_L, AMP);

  it("accepts a mic on XLR into a channel", () => {
    assert.deepEqual(checkConnection(state().rig, "src-lead-vocal/out", "mixer/ch1", "xlr"), { ok: true });
  });

  it("rejects cables that do not physically fit", () => {
    const { rig } = state();
    assert.equal(checkConnection(rig, "src-lead-vocal/out", "mixer/ch1", "ts").ok, false); // 1/4" cable, XLR mic
    assert.equal(checkConnection(rig, "src-lead-vocal/out", "mixer/ch1", "rca").ok, false);
    assert.equal(checkConnection(rig, "src-keys/out", "mixer/ch1", "xlr").ok, false); // XLR cable, 1/4" keyboard
    assert.equal(checkConnection(rig, "src-keys/out", "mixer/ch1", "mini").ok, false);
    assert.equal(checkConnection(rig, "mixer/main-l", "pspk-l/in", "xlr").ok, false); // far XLR end won't fit a 1/4" jack
  });

  it("rejects unknown ports and cables", () => {
    const { rig } = state();
    assert.equal(checkConnection(rig, "src-lead-vocal/out", "mixer/ch99", "xlr").ok, false);
    assert.equal(checkConnection(rig, "src-lead-vocal/out", "mixer/ch1", "laser").ok, false);
  });

  it("rejects input → output direction", () => {
    const { rig } = state();
    assert.equal(checkConnection(rig, "mixer/ch1", "src-lead-vocal/out", "xlr").ok, false);
    assert.equal(checkConnection(rig, "spk-l/in", "mixer/main-l", "xlr").ok, false);
  });

  it("rejects patching a port that already has a cable", () => {
    const s = patch(state(), "src-lead-vocal/out", "mixer/ch1", "xlr");
    assert.match(checkConnection(s.rig, "src-lead-vocal/out", "mixer/ch2", "xlr").reason, /already has a cable/); // output taken
    assert.match(checkConnection(s.rig, "src-bass/out", "mixer/ch1", "xlr").reason, /already has a cable/); // input taken
  });

  it("rejects source → speaker directly, and non-sources into the mixer", () => {
    const { rig } = state();
    assert.equal(checkConnection(rig, "src-lead-vocal/out", "spk-l/in", "xlr").ok, false);
    assert.equal(checkConnection(rig, "src-keys/out", "pspk-l/in", "ts").ok, false);
    assert.equal(checkConnection(rig, "amp/out-a", "mixer/ch1", "speaker").ok, false);
  });
});

// ---------- channel input analysis ----------

describe("channel input analysis", () => {
  it("dynamic mic on XLR = mic path, ok", () => {
    const s = patch(rigState(src("lead-vocal", "dynamic-mic")), "src-lead-vocal/out", "mixer/ch1", "xlr");
    const ch = analyze(s).channels[0];
    assert.equal(plugAtInput(s.rig, s.rig.cables[0]), "xlr");
    assert.equal(ch.path, "mic");
    assert.equal(ch.status, "ok");
    assert.equal(ch.signal, true);
    assert.equal(ch.padDb, 0);
  });

  it("the same mic via the XLR↔TRS cable lands on the 1/4\" side = line path, weak", () => {
    const s = patch(rigState(src("lead-vocal", "dynamic-mic")), "src-lead-vocal/out", "mixer/ch1", "xlr-trs");
    const ch = analyze(s).channels[0];
    assert.equal(plugAtInput(s.rig, s.rig.cables[0]), "trs14");
    assert.equal(ch.path, "line");
    assert.equal(ch.status, "weak");
    assert.equal(ch.padDb, -20);
  });

  it("condenser mic needs phantom power on the mic (XLR) path", () => {
    const s = patch(rigState(src("drums", "condenser-mic")), "src-drums/out", "mixer/ch1", "xlr");
    assert.equal(SOURCES_BY_ID.drums.deviceType, "condenser-mic");
    let ch = analyze(s).channels[0];
    assert.equal(ch.signal, false);
    assert.equal(ch.status, "no-phantom");
    s.channels[0].phantom = true;
    ch = analyze(s).channels[0];
    assert.equal(ch.signal, true);
    assert.equal(ch.status, "ok");
  });

  it("condenser mic stays silent on the 1/4\" side even with phantom on", () => {
    const s = patch(rigState(src("drums", "condenser-mic")), "src-drums/out", "mixer/ch1", "xlr-trs");
    s.channels[0].phantom = true;
    const ch = analyze(s).channels[0];
    assert.equal(ch.signal, false);
    assert.equal(ch.status, "no-phantom");
  });

  it("line-level keyboard on a TS cable = line path, ok; empty channels are 'empty'", () => {
    const s = patch(rigState(src("keys", "line-source")), "src-keys/out", "mixer/ch4", "ts");
    const info = analyze(s).channels;
    assert.equal(info[3].path, "line");
    assert.equal(info[3].status, "ok");
    assert.deepEqual([info[0].connected, info[0].signal, info[0].status], [false, false, "empty"]);
  });

  it("speaker level patched into an input is flagged as danger with no signal", () => {
    const s = rigState(AMP);
    patch(s, "amp/out-a", "mixer/ch1", "speaker"); // bypasses checkConnection on purpose
    const ch = analyze(s).channels[0];
    assert.equal(ch.status, "danger");
    assert.equal(ch.signal, false);
  });
});

// ---------- playback chains ----------

describe("speaker chains", () => {
  const ep = (state, id) => analyze(state).endpoints.find((e) => e.deviceId === id);

  it("mixer Main → powered speaker is a valid endpoint", () => {
    const s = patch(rigState(SPK_L), "mixer/main-l", "spk-l/in", "xlr");
    const a = analyze(s);
    assert.deepEqual([ep(s, "spk-l").valid, ep(s, "spk-l").status, ep(s, "spk-l").output], [true, "ok", "main-l"]);
    assert.deepEqual(a.buses["main-l"], ["spk-l"]);
  });

  it("an unpatched speaker is 'unpatched' and not on any bus", () => {
    const a = analyze(rigState(SPK_L));
    assert.equal(a.endpoints[0].status, "unpatched");
    assert.deepEqual(Object.values(a.buses).flat(), []);
  });

  it("mixer Main → passive speaker directly is 'no-amp' and not valid", () => {
    const s = patch(rigState(PSPK_L), "mixer/main-l", "pspk-l/in", "xlr-trs");
    assert.equal(ep(s, "pspk-l").valid, false);
    assert.equal(ep(s, "pspk-l").status, "no-amp");
    assert.deepEqual(analyze(s).buses["main-l"], []);
  });

  it("mixer → power amp in-a → amp out-a → passive speaker is valid", () => {
    const s = rigState(PSPK_L, AMP);
    patch(s, "mixer/main-l", "amp/in-a", "xlr");
    patch(s, "amp/out-a", "pspk-l/in", "speaker");
    const e = ep(s, "pspk-l");
    assert.deepEqual([e.valid, e.status, e.output, e.viaAmp], [true, "ok", "main-l", "amp"]);
    assert.deepEqual(analyze(s).buses["main-l"], ["pspk-l"]);
  });

  it("amp output patched but amp input empty = 'amp-no-input'", () => {
    const s = patch(rigState(PSPK_L, AMP), "amp/out-a", "pspk-l/in", "speaker");
    assert.deepEqual([ep(s, "pspk-l").valid, ep(s, "pspk-l").status], [false, "amp-no-input"]);
  });

  it("amp speaker output into a powered speaker is 'danger'; Aux 1 → wedge is on the aux1 bus", () => {
    const s = rigState(SPK_L, AMP, WEDGE);
    patch(s, "amp/out-a", "spk-l/in", "speaker");
    patch(s, "mixer/aux1", "wedge/in", "trs");
    assert.equal(ep(s, "spk-l").status, "danger");
    assert.equal(ep(s, "spk-l").valid, false);
    assert.deepEqual(analyze(s).buses.aux1, ["wedge"]);
  });
});

// ---------- level law ----------

describe("level law", () => {
  it("has fixed anchor points", () => {
    assert.equal(levelToDb(0.75), 0);
    assert.equal(levelToDb(0), -Infinity);
    assert.equal(levelToDb(1), 10);
    assert.equal(levelToDb(0.5), -10);
    assert.equal(levelToDb(2), 10); // clamped
    assert.equal(levelToDb(-1), -Infinity);
  });

  it("is monotonic", () => {
    let prev = -Infinity;
    for (let p = 0.01; p <= 1; p += 0.01) {
      const db = levelToDb(p);
      assert.ok(db > prev, `levelToDb not increasing at ${p}`);
      prev = db;
    }
  });

  it("dbToLevel inverts levelToDb", () => {
    for (const x of [0.01, 0.05, 0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1]) approx(dbToLevel(levelToDb(x)), x, 1e-9);
    assert.equal(dbToLevel(-Infinity), 0);
    assert.equal(dbToLevel(25), 1);
  });

  it("panGains is equal-power: -3 dB in the centre, hard pans are 0 / silent", () => {
    const c = panGains(0);
    approx(c.L, c.R);
    approx(20 * Math.log10(c.L), -3.0103, 0.001);
    assert.deepEqual(panGains(-1), { L: 1, R: 0 });
    approx(panGains(1).R, 1);
    approx(panGains(1).L, 0, 1e-12);
  });
});

// ---------- computeMix ----------

describe("computeMix", () => {
  // Lead vocal (ch7) and bass DI (ch2) → Main L/R powered speakers + Aux 1 wedge.
  function fixture() {
    const s = rigState(src("lead-vocal", "dynamic-mic"), src("bass", "di-box"), SPK_L, SPK_R, WEDGE);
    patch(s, "src-lead-vocal/out", "mixer/ch7", "xlr");
    patch(s, "src-bass/out", "mixer/ch2", "xlr");
    patch(s, "mixer/main-l", "spk-l/in", "xlr");
    patch(s, "mixer/main-r", "spk-r/in", "xlr");
    patch(s, "mixer/aux1", "wedge/in", "trs");
    for (const id of ["lead-vocal", "bass"]) {
      const ch = s.channels[chIndex(id)];
      Object.assign(ch, { gainDb: 40, level: 0.5, pfl: true });
      ch.auxSends.aux1 = 0.5;
    }
    return s;
  }
  const mix = (s) => computeMix(s, SOURCES_BY_ID, STEMS);
  const vox = (s) => mix(s).channels[chIndex("lead-vocal")];

  it("input peak follows stem peak + source output + gain + headroom", () => {
    const s = fixture();
    const source = SOURCES_BY_ID["lead-vocal"];
    approx(vox(s).inputPeakDb, STEMS[source.stem].monoPeakDb + source.outputDb + 40 + HEADROOM_DB);
  });

  it("gain raises the input peak (and PFL, Main, monitor) dB-for-dB", () => {
    const s = fixture();
    const before = vox(s);
    s.channels[6].gainDb += 6;
    const after = vox(s);
    approx(after.inputPeakDb - before.inputPeakDb, 6);
    approx(after.pflDb - before.pflDb, 6);
    approx(after.mainDb.L - before.mainDb.L, 6);
    approx(after.monitorDb - before.monitorDb, 6);
  });

  it("channel level moves Main only; Aux 1 is pre-fader", () => {
    const s = fixture();
    const before = vox(s);
    s.channels[6].level = 0.75;
    const after = vox(s);
    approx(after.mainDb.L - before.mainDb.L, 10);
    assert.equal(after.monitorDb, before.monitorDb);
    assert.equal(after.pflDb, before.pflDb);
  });

  it("enabled=false silences Main but not the monitor or PFL taps", () => {
    const s = fixture();
    const before = vox(s);
    assert.ok(Number.isFinite(before.monitorDb) && Number.isFinite(before.pflDb) && Number.isFinite(before.heardMainDb));
    s.channels[6].enabled = false;
    const after = vox(s);
    assert.deepEqual([after.mainDb.L, after.mainDb.R, after.heardMainDb], [-Infinity, -Infinity, -Infinity]);
    assert.equal(after.monitorDb, before.monitorDb);
    assert.equal(after.pflDb, before.pflDb);
  });

  it("an aux send changes that channel's monitorDb only", () => {
    const s = fixture();
    const before = mix(s).channels;
    s.channels[6].auxSends.aux1 = dbToLevel(levelToDb(0.5) + 6);
    const after = mix(s).channels;
    approx(after[6].monitorDb - before[6].monitorDb, 6);
    assert.equal(after[6].mainDb.L, before[6].mainDb.L);
    assert.equal(after[1].monitorDb, before[1].monitorDb); // other channels untouched
  });

  it("the Aux 1 master shifts every channel's monitorDb equally and leaves Main alone", () => {
    const s = fixture();
    const before = mix(s).channels;
    s.aux1.level = dbToLevel(-6); // was unity
    const after = mix(s).channels;
    for (const i of [1, 6]) {
      approx(after[i].monitorDb - before[i].monitorDb, -6);
      assert.equal(after[i].mainDb.L, before[i].mainDb.L);
    }
  });

  it("pan places the channel between Main L and Main R", () => {
    const s = fixture();
    const at = (pan) => {
      s.channels[6].pan = pan;
      return vox(s).mainDb;
    };
    const centre = at(0);
    approx(centre.L, centre.R);
    const left = at(-1);
    assert.ok(left.L > centre.L && left.R === -Infinity);
    approx(left.L - centre.L, 3.0103, 0.001);
    const right = at(1);
    assert.ok(right.R > centre.R && right.L < -100); // cos(π/2) is ~6e-17, effectively silent
  });

  it("heardMainDb is -Infinity unless a valid Main speaker chain exists", () => {
    const s = fixture();
    assert.ok(Number.isFinite(vox(s).heardMainDb));
    const dropMain = () => (s.rig.cables = s.rig.cables.filter((c) => !c.from.startsWith("mixer/main")));
    dropMain();
    assert.equal(vox(s).heardMainDb, -Infinity);
    assert.ok(Number.isFinite(vox(s).mainDb.L)); // still on the bus, just not heard
    // a passive speaker straight off Main L is not a chain either
    s.rig.devices.push(PSPK_L);
    patch(s, "mixer/main-l", "pspk-l/in", "xlr-trs");
    assert.equal(vox(s).heardMainDb, -Infinity);
  });

  it("heardMonitorDb needs a valid Aux 1 chain; PFL needs no speaker", () => {
    const s = fixture();
    s.rig.cables = s.rig.cables.filter((c) => c.from !== "mixer/aux1");
    const c = vox(s);
    assert.equal(c.heardMonitorDb, -Infinity);
    assert.ok(Number.isFinite(c.monitorDb) && Number.isFinite(c.pflDb));
    s.channels[6].pfl = false;
    assert.equal(vox(s).pflDb, -Infinity);
  });

  it("unpatched and silent (condenser without 48 V) channels have no signal", () => {
    const s = fixture();
    assert.equal(mix(s).channels[0].inputPeakDb, -Infinity);
    s.rig.devices.push(src("drums", "condenser-mic"));
    patch(s, "src-drums/out", "mixer/ch1", "xlr");
    s.channels[0].gainDb = 34;
    assert.equal(mix(s).channels[0].inputPeakDb, -Infinity);
    s.channels[0].phantom = true;
    assert.ok(Number.isFinite(mix(s).channels[0].inputPeakDb));
  });
});

// ---------- MixerStore ----------

describe("MixerStore", () => {
  const store = () => new MixerStore(rigState(src("lead-vocal", "dynamic-mic"), src("bass", "di-box")));

  it("connect() rejects invalid patches without bumping rigVersion", () => {
    const st = store();
    const events = [];
    st.subscribe((_, change) => events.push(change.type));
    const bad = st.connect("src-lead-vocal/out", "mixer/ch1", "rca");
    assert.equal(bad.ok, false);
    assert.equal(typeof bad.reason, "string");
    assert.equal(st.rigVersion, 0);
    assert.equal(st.state.rig.cables.length, 0);
    assert.deepEqual(events, []);
  });

  it("connect() adds the cable and bumps rigVersion on success; a second patch to the same port fails", () => {
    const st = store();
    const events = [];
    st.subscribe((_, change) => events.push(change.type));
    const ok = st.connect("src-lead-vocal/out", "mixer/ch7", "xlr");
    assert.equal(ok.ok, true);
    assert.equal(st.rigVersion, 1);
    assert.deepEqual(st.state.rig.cables, [{ id: ok.id, from: "src-lead-vocal/out", to: "mixer/ch7", cable: "xlr" }]);
    assert.equal(st.connect("src-bass/out", "mixer/ch7", "xlr").ok, false);
    assert.equal(st.rigVersion, 1);
    assert.deepEqual(events, ["rig"]);
  });

  it("disconnect() removes the cable and bumps rigVersion; unknown ids do nothing", () => {
    const st = store();
    const { id } = st.connect("src-lead-vocal/out", "mixer/ch7", "xlr");
    st.disconnect("no-such-cable");
    assert.equal(st.rigVersion, 1);
    st.disconnect(id);
    assert.deepEqual(st.state.rig.cables, []);
    assert.equal(st.rigVersion, 2);
    assert.equal(st.connect("src-lead-vocal/out", "mixer/ch7", "xlr").ok, true); // port is free again
  });

  it("setChannel clamps gainDb to 0..60 and snaps to half dB", () => {
    const st = store();
    st.setChannel(0, "gainDb", 100);
    assert.equal(st.state.channels[0].gainDb, 60);
    st.setChannel(0, "gainDb", -12);
    assert.equal(st.state.channels[0].gainDb, 0);
    st.setChannel(0, "gainDb", 12.26);
    assert.equal(st.state.channels[0].gainDb, 12.5);
  });

  it("setChannel / setSend / setBusLevel clamp positions and ignore unknown keys", () => {
    const st = store();
    st.setChannel(0, "level", 3);
    st.setChannel(0, "pan", -5);
    st.setChannel(0, "bogus", 1);
    st.setSend(0, "aux1", -1);
    st.setBusLevel("aux1", 9);
    assert.deepEqual([st.state.channels[0].level, st.state.channels[0].pan], [1, -1]);
    assert.equal(st.state.channels[0].bogus, undefined);
    assert.equal(st.state.channels[0].auxSends.aux1, 0);
    assert.equal(st.state.aux1.level, 1);
  });
});

// ---------- source manifest sanity ----------

describe("source manifest", () => {
  it("every source names a real device type, stem and unique channel order", () => {
    const orders = new Set();
    for (const s of SOURCES) {
      assert.ok(DEVICE_TYPES[s.deviceType]?.source, `${s.id}: ${s.deviceType} is a source device`);
      assert.ok(STEMS[s.stem], `${s.id}: stem ${s.stem}`);
      assert.ok(s.order >= 1 && s.order <= 8);
      orders.add(s.order);
    }
    assert.equal(orders.size, SOURCES.length);
  });
});
