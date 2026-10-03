// Compact mixers from data (js/compact-defs.js, js/compact.js): Mackie Mix8,
// Mackie 1202-VLZ, Yamaha MG10/2, Yamaha STAGEPAS 400BT, Behringer Xenyx
// X1204USB. See docs/COMPACT_MIXERS.md.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMPACT, COMPACT_IDS, LAWS, balanceGains, fxPreset, reverbSetting } from "../js/compact.js";
import { MixerStore, computeMix, createMixerState, listenGroupOf } from "../js/mixer-state.js";
import { DEVICE_TYPES, checkConnection } from "../js/connection-model.js";
import { COMPACT_GIGS, SCENARIOS_BY_ID, buildScenarioState, scenarioFor, scenariosFor } from "../js/scenarios.js";
import { SOURCES_BY_ID, STEMS } from "../audio/source-manifest.js";

const gig = (id) => new MixerStore(buildScenarioState(SCENARIOS_BY_ID["free-play"], SOURCES_BY_ID, id));
const mix = (st) => computeMix(st.state, SOURCES_BY_ID, STEMS);
const ch = (st, sourceId) => mix(st).channels.find((c) => c.sourceId === sourceId);
const near = (a, b, tol = 0.1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);
const portIds = (id) => DEVICE_TYPES[id].ports.map((p) => p.id);

describe("every compact mixer", () => {
  for (const id of COMPACT_IDS) {
    it(`${id}: a fresh state, a rear panel, and Free play only`, () => {
      const s = createMixerState(id);
      assert.equal(s.model, id);
      assert.equal(s.channels.filter((c) => !c.tape).length, COMPACT[id].channels.length);
      assert.ok(DEVICE_TYPES[id].mixer);
      assert.deepEqual(scenariosFor(id).map((x) => x.id), ["free-play"]);
      assert.ok(!scenarioFor(SCENARIOS_BY_ID["free-play"], id).prompt.includes("{"), "the prompt is written for this mixer");
    });

    it(`${id}: the gig patches validly, every patched source is healthy and heard, the laptop stays out`, () => {
      const st = gig(id);
      const rig = { devices: st.state.rig.devices, cables: [] };
      for (const c of st.state.rig.cables) {
        const r = checkConnection(rig, c.from, c.to, c.cable);
        assert.ok(r.ok, `${c.from} → ${c.to} (${c.cable}): ${r.reason}`);
        rig.cables.push(c);
      }
      const m = mix(st);
      for (const e of m.rig.endpoints) assert.equal(e.status, "ok", e.deviceId);
      for (const c of m.channels.filter((c) => c.sourceId)) {
        assert.equal(c.input.status, "ok", c.sourceId);
        assert.equal(c.band, "good", c.sourceId);
        if (c.sourceId === "preshow") assert.equal(c.heardMainDb, -Infinity);
        else assert.ok(c.heardMainDb > -40, `${c.sourceId} in the house`);
      }
      assert.equal(m.channels.filter((c) => c.sourceId).length, Object.keys(COMPACT_GIGS[id].patch).length);
    });
  }
});

describe("rear panels", () => {
  it("one input per channel: the Mix8's LINE jack is busy once its MIC is used", () => {
    const st = gig("mix8");
    const r = checkConnection(st.state.rig, "src-guitars/out", "mixer/ch1-line", "xlr-trs");
    assert.equal(r.ok, false);
  });

  it("the 1202-VLZ has XLR and 1/4\" main outs, ALT 3-4 outs and channel inserts", () => {
    for (const p of ["main-l", "line-l", "alt-l", "alt-r", "aux2", "ch4-insert"]) assert.ok(portIds("vlz1202").includes(p), p);
    assert.equal(DEVICE_TYPES.vlz1202.ports.find((p) => p.id === "main-l").jack, "xlr");
  });

  it("the STAGEPAS speaker jacks carry speaker level and drive passive speakers directly", () => {
    const st = gig("stagepas400bt");
    assert.equal(DEVICE_TYPES.stagepas400bt.ports.find((p) => p.id === "spk-l").level, "speaker");
    assert.equal(mix(st).rig.endpoints.find((e) => e.deviceId === "sp-l").valid, true);
    // …and never a powered speaker: speaker level into a line input.
    st.disconnect(st.state.rig.cables.find((c) => c.to === "wedge/in").id);
    assert.ok(st.connect("mixer/spk-l", "wedge/in", "speaker").ok === false || mix(st).rig.endpoints.find((e) => e.deviceId === "wedge").status === "danger");
  });

  it("STAGEPAS phantom reaches channels 1 and 2 only", () => {
    const st = new MixerStore(createMixerState("stagepas400bt"));
    st.setAllPhantom(true);
    assert.deepEqual(st.state.channels.map((c) => !!c.phantom).slice(0, 6), [true, true, false, false, false, false]);
  });
});

describe("gain stages", () => {
  it("MG10/2: GAIN +16…+60 on MIC; the LINE jack is 26 dB lower", () => {
    const st = new MixerStore(createMixerState("mg102"));
    st.setChannel(0, "gainDb", 5);
    assert.equal(st.state.channels[0].gainDb, 16);
    st.state.rig.devices.push({ id: "kb", type: "line-source", sourceId: "keys" });
    assert.ok(st.connect("kb/out", "mixer/ch1-line", "ts").ok);
    st.setChannel(0, "gainDb", 36);
    near(mix(st).channels[0].inputPeakDb, STEMS[SOURCES_BY_ID.keys.stem].monoPeakDb + SOURCES_BY_ID.keys.outputDb + 36 - 26 - 8);
  });

  it("STAGEPAS: no gain knob, a MIC/LINE switch", () => {
    const st = gig("stagepas400bt");
    const v = ch(st, "lead-vocal").inputPeakDb;
    st.setChannel(0, "micLine", "line");
    near(ch(st, "lead-vocal").inputPeakDb, v - 23);
    st.setChannel(0, "gainDb", 50); // nothing to turn
    assert.equal(st.state.channels[0].gainDb, 0);
  });
});

describe("sends", () => {
  it("Mix8: the one AUX is post-fader — the wedge follows the channel LEVEL", () => {
    const st = gig("mix8");
    const before = ch(st, "lead-vocal").aux.aux1.heardDb;
    st.setChannel(0, "level", LAWS.level.toPos(-10));
    near(ch(st, "lead-vocal").aux.aux1.heardDb, before - 10);
  });

  it("1202-VLZ: AUX 1's PRE switch decides; AUX 2 is always post", () => {
    const st = gig("vlz1202");
    const v = 2; // lead vocal on channel 3
    const pre = ch(st, "lead-vocal").aux.aux1.monitorDb;
    st.setChannel(v, "level", LAWS.level.toPos(-10));
    near(ch(st, "lead-vocal").aux.aux1.monitorDb, pre);
    st.setBus("aux1", "pre", false);
    near(ch(st, "lead-vocal").aux.aux1.monitorDb, pre - 10);
    const post2 = ch(st, "lead-vocal").aux.aux2.monitorDb;
    st.setChannel(v, "level", LAWS.level.toPos(0));
    near(ch(st, "lead-vocal").aux.aux2.monitorDb, post2 + 10);
  });

  it("MG10/2: one AUX knob — left feeds AUX1 (pre), right feeds AUX2 (post), never both", () => {
    const st = gig("mg102");
    st.setChannel(0, "sends.auxPan", -0.7);
    let v = ch(st, "lead-vocal");
    assert.ok(v.aux.aux1.monitorDb > -30);
    assert.equal(v.aux.aux2.monitorDb, -Infinity);
    st.setChannel(0, "level", 0);
    near(ch(st, "lead-vocal").aux.aux1.monitorDb, v.aux.aux1.monitorDb); // pre-fader
    st.setChannel(0, "sends.auxPan", 0.7);
    v = ch(st, "lead-vocal");
    assert.equal(v.aux.aux1.monitorDb, -Infinity);
    assert.equal(v.aux.aux2.monitorDb, -Infinity); // post-fader, and the level is down
  });
});

describe("routing", () => {
  it("1202-VLZ MUTE/ALT 3-4: out of MAIN, onto ALT; ASSIGN TO MAIN brings it back", () => {
    const st = gig("vlz1202");
    const main = ch(st, "lead-vocal").mainDb.L;
    st.setChannel(2, "enabled", false);
    let v = ch(st, "lead-vocal");
    assert.equal(v.mainDb.L, -Infinity);
    assert.ok(v.altDb.L > -40);
    st.setBus("alt", "toMain", true);
    near(ch(st, "lead-vocal").mainDb.L, main);
  });

  it("1202-VLZ SOLO is PFL and takes over the phones", () => {
    const st = gig("vlz1202");
    st.setChannel(2, "solo", true);
    st.setChannel(2, "level", 0);
    const m = mix(st);
    assert.equal(m.phones.solo, true);
    near(m.channels[2].pflDb, m.channels[2].inputPeakDb);
  });

  it("a stereo channel's BAL leaves both sides at full level in the centre", () => {
    const g = balanceGains(0);
    near(g.L, 1, 1e-9);
    near(g.R, 1, 1e-9);
    assert.ok(balanceGains(-1).R < 1e-9);
  });

  it("Mix8 TAPE IN: TO MAIN, or TO CR/PHONES only", () => {
    const st = gig("mix8");
    const tape = COMPACT.mix8.channels.length;
    assert.equal(mix(st).channels[tape].heardMainDb, -Infinity); // starts on the phones
    assert.ok(mix(st).phones.sources.includes("tape"));
    st.setChannel(tape, "toCr", false);
    assert.ok(mix(st).channels[tape].heardMainDb > -30);
  });

  it("listening groups follow the jacks", () => {
    const s = createMixerState("stagepas400bt");
    assert.equal(listenGroupOf(s, "spk-l"), "main");
    assert.equal(listenGroupOf(s, "mon-r"), "monitor");
    assert.equal(listenGroupOf(s, "sub-out"), "main");
    assert.equal(listenGroupOf(createMixerState("vlz1202"), "alt-l"), "alt");
  });

  it("STAGEPAS reverb TYPE/TIME: four types, each short to long", () => {
    const def = COMPACT.stagepas400bt;
    assert.equal(reverbSetting(def, 0).type, "HALL");
    assert.equal(reverbSetting(def, 0.99).type, "ECHO");
    assert.ok(reverbSetting(def, 0.2).seconds > reverbSetting(def, 0.05).seconds);
  });
});

describe("Behringer Xenyx X1204USB", () => {
  const X = COMPACT.x1204usb;
  const VOX = 0; // lead vocal on channel 1

  it("rear panel: XLR main outs only, ALT 3-4 and C-R outs, two aux sends, CD/TAPE in and out", () => {
    const ids = portIds("x1204usb");
    for (const p of ["main-l", "main-r", "alt-l", "alt-r", "cr-l", "aux1", "aux2", "tape-in", "tape-out-l", "ret1-l", "ret2-r"]) assert.ok(ids.includes(p), p);
    assert.ok(!ids.includes("line-l"), "no ¼\" main outs");
    assert.equal(DEVICE_TYPES.x1204usb.ports.find((p) => p.id === "main-l").jack, "xlr");
    assert.equal(DEVICE_TYPES.x1204usb.ports.find((p) => p.id === "tape-in").name, "CD/TAPE IN (L/R)");
  });

  it("AUX 1 has a PRE switch on every channel", () => {
    const st = gig("x1204usb");
    assert.equal(st.state.channels[VOX].pre, true);
    const pre = ch(st, "lead-vocal").aux.aux1.monitorDb;
    st.setChannel(VOX, "level", LAWS.level.toPos(-10));
    near(ch(st, "lead-vocal").aux.aux1.monitorDb, pre); // pre-fader: the wedge ignores the fader
    st.setChannel(VOX, "pre", false);
    near(ch(st, "lead-vocal").aux.aux1.monitorDb, pre - 10); // post: follows the fader
    // Only this channel changed.
    assert.equal(st.state.channels[1].pre, true);
  });

  it("MUTE/ALT 3-4 cuts a post-fader AUX 1, not a pre-fader one, and never the FX send", () => {
    const st = gig("x1204usb");
    const fx = ch(st, "lead-vocal").aux.aux2.monitorDb;
    const wedge = ch(st, "lead-vocal").aux.aux1.monitorDb;
    st.setChannel(VOX, "enabled", false);
    let v = ch(st, "lead-vocal");
    assert.equal(v.mainDb.L, -Infinity);
    assert.ok(v.altDb.L > -40, "on the ALT 3-4 bus");
    near(v.aux.aux1.monitorDb, wedge); // PRE pressed
    near(v.aux.aux2.monitorDb, fx); // the FX send is not muted
    st.setChannel(VOX, "pre", false);
    assert.equal(ch(st, "lead-vocal").aux.aux1.monitorDb, -Infinity);
  });

  it("the FX send is post-fader: it follows the channel fader", () => {
    const st = gig("x1204usb");
    const fx = ch(st, "lead-vocal").aux.aux2.monitorDb;
    const fader = LAWS.level.toDb(st.state.channels[VOX].level);
    st.setChannel(VOX, "level", LAWS.level.toPos(fader - 6));
    near(ch(st, "lead-vocal").aux.aux2.monitorDb, fx - 6);
  });

  it("stereo channels: the LEVEL switch at −10 dBV is 12 dB more sensitive", () => {
    const st = gig("x1204usb");
    const laptop = 5;
    assert.equal(st.state.channels[laptop].minus10, true);
    const hot = ch(st, "preshow").inputPeakDb;
    st.setChannel(laptop, "minus10", false);
    near(ch(st, "preshow").inputPeakDb, hot - 12);
    st.setChannel(0, "minus10", true); // a mono channel has no such switch
    assert.equal(st.state.channels[0].minus10, false);
  });

  it("COMP: one knob on the mono channels only", () => {
    const st = gig("x1204usb");
    st.setChannel(1, "comp", 2);
    assert.equal(st.state.channels[1].comp, 1);
    st.setChannel(4, "comp", 0.5);
    assert.equal(st.state.channels[4].comp, 0);
  });

  it("SOLO MODE: PFL hears the channel before its fader, SOLO in place after it", () => {
    const st = gig("x1204usb");
    assert.equal(st.state.soloBus.mode, "sip");
    st.setChannel(VOX, "solo", true);
    let c = mix(st).channels[VOX];
    near(c.pflDb, c.inputPeakDb + c.faderDb);
    st.setBus("soloBus", "mode", "pfl");
    c = mix(st).channels[VOX];
    near(c.pflDb, c.inputPeakDb);
    assert.match(mix(st).phones.modeText, /PFL/);
  });

  it("AUX SEND SOLO puts a monitor mix in the phones", () => {
    const st = gig("x1204usb");
    st.setBus("aux1", "solo", true);
    const p = mix(st).phones;
    assert.equal(p.solo, true);
    assert.deepEqual(p.auxSolo, ["aux1"]);
  });

  it("CD/TAPE TO MAIN puts the 2-track input in the main mix", () => {
    const st = gig("x1204usb");
    const tape = X.channels.length;
    st.state.rig.devices.push({ id: "phone", type: "stereo-laptop", sourceId: "preshow" });
    st.disconnect(st.state.rig.cables.find((c) => c.from === "src-preshow/out").id);
    assert.ok(st.connect("src-preshow/out", "mixer/tape-in", "mini-rca").ok);
    assert.equal(mix(st).channels[tape].heardMainDb, -Infinity);
    st.setChannel(tape, "toMain", true);
    assert.ok(mix(st).channels[tape].heardMainDb > -30);
  });

  it("returns: RET 1 has a MON knob into AUX 1; RET 2 goes to MAIN or ALT 3-4", () => {
    const st = gig("x1204usb");
    st.setBus("ret1", "mon", 0.6);
    st.setBus("ret2", "toAlt", true);
    assert.equal(st.state.ret1.mon, 0.6);
    assert.equal(st.state.ret2.toAlt, true);
    st.setBus("ret2", "mon", 0.5); // RET 2 has no MON knob
    assert.equal(st.state.ret2.mon, undefined);
  });

  it("ALT 3-4 has its own fader", () => {
    const st = gig("x1204usb");
    st.setBus("alt", "level", 0.3);
    assert.equal(st.state.alt.level, 0.3);
  });

  it("the effects PROGRAM picks one of 16 presets", () => {
    assert.equal(X.fx.presets.length, 16);
    assert.equal(fxPreset(X, 0).number, 1);
    assert.equal(fxPreset(X, 99).number, 16);
    const st = gig("x1204usb");
    st.setBus("fx", "program", 7.4);
    assert.equal(st.state.fx.program, 7);
  });
});
