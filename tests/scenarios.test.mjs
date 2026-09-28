// Scenario tests: every scenario is data, starts unsolved, and completes only
// through real state changes (patching, gain, sends, masters) — never a button.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, SCENARIOS_BY_ID, CONDITIONS, buildScenarioState, captureBaseline, evaluateScenario, validateScenarios, nominalGainDb, sourceDeviceId, fillTerms } from "../js/scenarios.js";
import { MixerStore, levelToDb, dbToLevel, inputBand } from "../js/mixer-state.js";
import { checkConnection } from "../js/connection-model.js";
import { SOURCES_BY_ID, sourcesForScenario } from "../audio/source-manifest.js";

// ---------- helpers ----------

function start(id) {
  const def = SCENARIOS_BY_ID[id];
  const state = buildScenarioState(def);
  // session.listened mirrors what js/app.js records when the student uses the Listen bar.
  return { def, store: new MixerStore(state), baseline: captureBaseline(def, state), session: { listened: new Set([state.listen]) } };
}
const state = (ctx) => ctx.store.state;
const evaluate = (ctx) => evaluateScenario(ctx.def, state(ctx), ctx.baseline, undefined, undefined, ctx.session);
const listen = (ctx, dest) => {
  ctx.store.setListen(dest);
  ctx.session.listened.add(dest);
};
const item = (result, id) => result.items.find((i) => i.id === id);
const met = (result) => Object.fromEntries(result.items.map((i) => [i.id, i.met]));
const chOf = (ctx, sourceId) => state(ctx).channels[SOURCES_BY_ID[sourceId].order - 1]; // reference patch: channel = source.order
const bump = (pos, db) => dbToLevel(levelToDb(pos) + db);
const cableFrom = (ctx, from) => state(ctx).rig.cables.find((c) => c.from === from);
const connect = (ctx, from, to, cable) => {
  const r = ctx.store.connect(from, to, cable);
  assert.ok(r.ok, `${from} → ${to} via ${cable}: ${r.reason}`);
};

// ---------- data integrity ----------

describe("scenario data", () => {
  it("validateScenarios() reports no problems", () => {
    assert.deepEqual(validateScenarios(), []);
  });

  for (const def of SCENARIOS) {
    it(`${def.id}: builds a state with the mixer, its sources and its speakers`, () => {
      const s = buildScenarioState(def);
      const ids = s.rig.devices.map((d) => d.id);
      assert.equal(new Set(ids).size, ids.length, "device ids are unique");
      assert.ok(ids.includes("mixer"));
      for (const src of sourcesForScenario(def.id)) assert.ok(ids.includes(sourceDeviceId(src.id)), src.id);
      for (const d of def.setup.devices) assert.ok(ids.includes(d), d);
    });

    it(`${def.id}: every starting cable is a physically valid patch`, () => {
      const s = buildScenarioState(def);
      const rig = { devices: s.rig.devices, cables: [] };
      for (const c of s.rig.cables) {
        const r = checkConnection(rig, c.from, c.to, c.cable);
        assert.ok(r.ok, `${c.from} → ${c.to} (${c.cable}): ${r.reason}`);
        rig.cables.push(c);
      }
    });
  }

  it("student-facing text only uses placeholders a skin can fill", () => {
    const allowed = new Set(["aux1", "aux2", "aux1Master", "aux2Master", "enabled", "level", "main"]);
    for (const def of SCENARIOS) {
      const texts = [def.prompt, def.goal, def.complete, ...def.hints, ...def.conditions.map((c) => c.label)];
      for (const text of texts.filter(Boolean)) {
        for (const [, key] of text.matchAll(/\{(\w+)\}/g)) assert.ok(allowed.has(key), `${def.id}: {${key}}`);
      }
    }
    assert.equal(fillTerms("Turn up {aux1} {nope}", { aux1: "AUX 1" }), "Turn up AUX 1 {nope}");
  });

  it("the reference patch puts each source on its own channel, gain-staged to 'good'", () => {
    for (const id of ["find-amp", "more-vocal", "drummer-wedge", "more-piano", "monitor-quiet", "foh-vocal", "missing-guitar", "drummer-mix"]) {
      const ctx = start(id);
      const mix = evaluate(ctx).mix;
      for (const src of sourcesForScenario(id)) {
        const ch = mix.channels[src.order - 1];
        assert.equal(ch.sourceId, src.id);
        assert.equal(ch.input.status, "ok", `${id}/${src.id}`);
        assert.equal(inputBand(ch.inputPeakDb), "good", `${id}/${src.id}`);
      }
    }
  });
});

describe("starting states", () => {
  for (const def of SCENARIOS.filter((d) => d.id !== "free-play")) {
    it(`${def.id}: not complete at the start; keep-conditions already hold`, () => {
      const s = buildScenarioState(def);
      const result = evaluateScenario(def, s, captureBaseline(def, s));
      assert.equal(result.complete, false);
      assert.ok(result.items.some((i) => i.kind === "goal" && !i.met), "some goal is unmet");
      for (const i of result.items.filter((i) => i.kind === "keep")) assert.ok(i.met, `keep condition '${i.id}' should hold at the start`);
    });
  }

  it("free-play has no objective and never completes", () => {
    const def = SCENARIOS_BY_ID["free-play"];
    const result = evaluateScenario(def, buildScenarioState(def));
    assert.deepEqual(result.items, []);
    assert.equal(result.complete, false);
  });

  it("evaluation is deterministic and takes no skin input", () => {
    const ctx = start("more-vocal");
    chOf(ctx, "lead-vocal").auxSends.aux1 = bump(chOf(ctx, "lead-vocal").auxSends.aux1, 6);
    listen(ctx, "aux1");
    const first = evaluate(ctx);
    assert.deepEqual(evaluate(ctx), first);
    assert.equal(first.complete, true);
    // Having listened counts even after moving on: the student can go back to check the house.
    listen(ctx, "main");
    state(ctx).headphones.level = 1;
    assert.deepEqual(met(evaluate(ctx)), met(first));
  });

  it("wedge scenarios start on Main, so the student has to go and listen to the wedge", () => {
    for (const id of ["more-vocal", "more-piano", "monitor-quiet", "drummer-mix"]) {
      const ctx = start(id);
      assert.equal(state(ctx).listen, "main");
      assert.equal(item(evaluate(ctx), "listen").met, false);
    }
  });
});

// ---------- shared solving helpers ----------

// Patch a source into its reference channel and gain-stage it the way a student should.
function patchSource(ctx, sourceId, cable, { gainDb, level = 0.75 } = {}) {
  const src = SOURCES_BY_ID[sourceId];
  const port = src.stereo ? "mixer/ch9-10" : `mixer/ch${src.order}`;
  connect(ctx, `${sourceDeviceId(sourceId)}/out`, port, cable);
  ctx.store.setChannel(src.order - 1, "gainDb", gainDb ?? nominalGainDb(src));
  ctx.store.setChannel(src.order - 1, "level", level);
}
const setSendDb = (ctx, sourceId, bus, db) => ctx.store.setSend(SOURCES_BY_ID[sourceId].order - 1, bus, dbToLevel(db));

// ---------- scenario 1: preshow music ----------

describe("preshow", () => {
  const solve = (ctx) => patchSource(ctx, "preshow", "mini-dual-ts");

  it("starts with only the laptop on stage and powered house speakers already on Main", () => {
    const ctx = start("preshow");
    const ids = state(ctx).rig.devices.map((d) => d.id);
    assert.deepEqual(sourcesForScenario("preshow").map((s) => s.id), ["preshow"]);
    assert.ok(ids.includes("src-preshow") && ids.includes("spk-l") && ids.includes("spk-r"));
    assert.equal(cableFrom(ctx, "src-preshow/out"), undefined);
    assert.equal(item(evaluate(ctx), "chain").met, true);
  });

  it("breakout cable into 9/10, gain and fader → complete", () => {
    const ctx = start("preshow");
    solve(ctx);
    const result = evaluate(ctx);
    assert.deepEqual(met(result), { patched: true, gain: true, heard: true, chain: true });
    assert.equal(result.complete, true);
  });

  it("patched but the fader still down → not heard, not complete", () => {
    const ctx = start("preshow");
    connect(ctx, "src-preshow/out", "mixer/ch9-10", "mini-dual-ts");
    // A line-level laptop already reads Good at minimum gain.
    assert.deepEqual(met(evaluate(ctx)), { patched: true, gain: true, heard: false, chain: true });
    assert.equal(evaluate(ctx).complete, false);
  });

  it("clipping gain does not count as healthy", () => {
    const ctx = start("preshow");
    patchSource(ctx, "preshow", "mini-dual-ts", { gainDb: 40 });
    assert.equal(item(evaluate(ctx), "gain").met, false);
  });

  it("stereo means both sides: Main R unplugged → not complete", () => {
    const ctx = start("preshow");
    solve(ctx);
    ctx.store.disconnect(cableFrom(ctx, "mixer/main-r").id);
    const result = evaluate(ctx);
    assert.equal(item(result, "heard").met, false);
    assert.equal(result.complete, false);
  });

  it("a muted 9/10 strip is not heard", () => {
    const ctx = start("preshow");
    solve(ctx);
    ctx.store.setChannel(8, "enabled", false);
    assert.equal(item(evaluate(ctx), "heard").met, false);
  });
});

// ---------- scenario 2: get the band into the house ----------

describe("build-rig", () => {
  it("two sources on proper cables, gain-staged and up → complete", () => {
    for (const pair of [[["bass", "xlr"], ["lead-vocal", "xlr"]], [["keys", "ts"], ["bass", "xlr"]]]) {
      const ctx = start("build-rig");
      for (const [id, cable] of pair) patchSource(ctx, id, cable);
      const result = evaluate(ctx);
      assert.deepEqual(met(result), { patched: true, gain: true, heard: true, chain: true });
      assert.equal(result.complete, true);
    }
  });

  it("the house speakers are already patched and powered", () => {
    const ctx = start("build-rig");
    assert.equal(item(evaluate(ctx), "chain").met, true);
  });

  it("one source is not enough", () => {
    const ctx = start("build-rig");
    patchSource(ctx, "bass", "xlr");
    assert.equal(evaluate(ctx).complete, false);
  });

  it("sources on the wrong path don't count: mic on the 1/4\" side, condenser without 48 V", () => {
    const ctx = start("build-rig");
    patchSource(ctx, "bass", "xlr-trs"); // weak line path
    patchSource(ctx, "drums", "xlr"); // condenser, phantom off
    assert.equal(item(evaluate(ctx), "patched").met, false);
    state(ctx).channels[0].phantom = true;
    assert.equal(item(evaluate(ctx), "patched").met, false); // bass is still on the weak path: only 1 of 2
  });

  it("gain must land in the Good band: too quiet or clipping doesn't count", () => {
    const ctx = start("build-rig");
    patchSource(ctx, "bass", "xlr", { gainDb: 0 });
    patchSource(ctx, "lead-vocal", "xlr", { gainDb: 0 });
    assert.equal(item(evaluate(ctx), "gain").met, false);
    ctx.store.setChannel(1, "gainDb", 50);
    ctx.store.setChannel(6, "gainDb", 60);
    assert.equal(item(evaluate(ctx), "gain").met, false);
  });

  it("faders left down: patched and gain-staged but not heard", () => {
    const ctx = start("build-rig");
    patchSource(ctx, "bass", "xlr", { level: 0 });
    patchSource(ctx, "lead-vocal", "xlr", { level: 0 });
    const result = evaluate(ctx);
    assert.equal(item(result, "gain").met, true);
    assert.equal(item(result, "heard").met, false);
  });
});

// ---------- scenario 3: where is the amplifier? ----------

describe("find-amp", () => {
  const wire = (ctx, side = "l") => {
    const n = side === "l" ? "a" : "b";
    ctx.store.disconnect(cableFrom(ctx, `mixer/main-${side}`).id);
    connect(ctx, `mixer/main-${side}`, `amp/in-${n}`, "xlr");
    connect(ctx, `amp/out-${n}`, `pspk-${side}/in`, "speaker");
  };
  const solved = { left: true, right: true, "no-broken": true, heard: true };

  it("starts with the band mixed and both Mains plugged straight into passive speakers", () => {
    const ctx = start("find-amp");
    const result = evaluate(ctx);
    assert.equal(cableFrom(ctx, "mixer/main-l").to, "pspk-l/in");
    assert.equal(cableFrom(ctx, "mixer/main-r").to, "pspk-r/in");
    assert.deepEqual(met(result), { left: false, right: false, "no-broken": false, heard: false });
  });

  it("mixer out → amp in → amp out → passive speaker, both sides → complete", () => {
    const ctx = start("find-amp");
    wire(ctx, "l");
    wire(ctx, "r");
    const result = evaluate(ctx);
    assert.deepEqual(met(result), solved);
    assert.equal(result.complete, true);
  });

  it("only one side wired → not complete", () => {
    const ctx = start("find-amp");
    wire(ctx, "l");
    const result = evaluate(ctx);
    assert.deepEqual(met(result), { left: true, right: false, "no-broken": false, heard: true });
    assert.equal(result.complete, false);
  });

  it("the direct line-level run to a passive speaker never counts", () => {
    const ctx = start("find-amp");
    assert.equal(evaluate(ctx).complete, false);
    assert.match(evaluate(ctx).mix.rig.endpoints.find((e) => e.deviceId === "pspk-l").status, /no-amp/);
  });

  it("an amp with nothing on its input is not a working chain", () => {
    const ctx = start("find-amp");
    ctx.store.disconnect(cableFrom(ctx, "mixer/main-l").id);
    connect(ctx, "amp/out-a", "pspk-l/in", "speaker");
    assert.equal(item(evaluate(ctx), "left").met, false);
  });
});

// ---------- scenario 2: more of my voice in the monitor ----------

describe("more-vocal", () => {
  const solved = { listen: true, send: true, wedge: true, house: true, drummer: true };

  it("listening to Aux 1 and raising the lead vocal's Aux 1 send by 6 dB → complete", () => {
    const ctx = start("more-vocal");
    const vox = chOf(ctx, "lead-vocal");
    vox.auxSends.aux1 = bump(vox.auxSends.aux1, 6);
    assert.equal(evaluate(ctx).complete, false, "not until they've listened to the singer's wedge");
    listen(ctx, "aux1");
    const result = evaluate(ctx);
    assert.deepEqual(met(result), solved);
    assert.equal(result.complete, true);
  });

  it("a 3 dB nudge is not enough (needs ≥ 4 dB)", () => {
    const ctx = start("more-vocal");
    listen(ctx, "aux1");
    const vox = chOf(ctx, "lead-vocal");
    vox.auxSends.aux1 = bump(vox.auxSends.aux1, 3);
    assert.equal(evaluate(ctx).complete, false);
    vox.auxSends.aux1 = bump(vox.auxSends.aux1, 2); // +5 total
    assert.equal(evaluate(ctx).complete, true);
  });

  it("raising the vocal's GAIN instead changes Main and the drummer's wedge → not complete", () => {
    const ctx = start("more-vocal");
    listen(ctx, "aux1");
    chOf(ctx, "lead-vocal").gainDb += 6;
    const result = evaluate(ctx);
    assert.equal(item(result, "house").met, false);
    assert.equal(item(result, "drummer").met, false);
    assert.equal(item(result, "send").met, false);
    assert.equal(result.complete, false);
  });

  it("raising the vocal fader (pre-fader sends don't move) → not complete", () => {
    const ctx = start("more-vocal");
    listen(ctx, "aux1");
    const vox = chOf(ctx, "lead-vocal");
    vox.level = bump(vox.level, 6);
    const result = evaluate(ctx);
    assert.equal(item(result, "send").met, false);
    assert.equal(item(result, "house").met, false);
    assert.equal(result.complete, false);
  });

  it("turning up the vocal in the wrong wedge (Aux 2) → not complete", () => {
    const ctx = start("more-vocal");
    listen(ctx, "aux1");
    const vox = chOf(ctx, "lead-vocal");
    vox.auxSends.aux2 = bump(vox.auxSends.aux2, 6);
    const result = evaluate(ctx);
    assert.equal(item(result, "send").met, false);
    assert.equal(item(result, "drummer").met, false);
    assert.equal(result.complete, false);
  });

  it("muting the vocal breaks the 'house mix stays put' condition even with a bigger send", () => {
    const ctx = start("more-vocal");
    listen(ctx, "aux1");
    const vox = chOf(ctx, "lead-vocal");
    vox.auxSends.aux1 = bump(vox.auxSends.aux1, 6);
    vox.enabled = false;
    const result = evaluate(ctx);
    assert.deepEqual(met(result), { ...solved, house: false }); // monitors are pre-fader/pre-mute
    assert.equal(result.complete, false);
  });

  it("the raised send must actually come out of a working wedge", () => {
    const ctx = start("more-vocal");
    listen(ctx, "aux1");
    const vox = chOf(ctx, "lead-vocal");
    vox.auxSends.aux1 = bump(vox.auxSends.aux1, 6);
    ctx.store.disconnect(cableFrom(ctx, "mixer/aux1").id);
    const result = evaluate(ctx);
    assert.equal(item(result, "send").met, true);
    assert.equal(item(result, "wedge").met, false);
    assert.equal(result.complete, false);
  });
});

// ---------- scenario 3: the drummer's whole monitor mix is too quiet ----------

describe("monitor-quiet", () => {
  const sendChannels = (ctx) => state(ctx).channels.filter((c) => c.auxSends.aux2 > 0);
  const solved = { listen: true, master: true, balance: true, chain: true, singer: true };

  it("listening to Aux 2 and raising the Aux 2 master by 10 dB → complete", () => {
    const ctx = start("monitor-quiet");
    state(ctx).aux2.level = bump(state(ctx).aux2.level, 10);
    assert.equal(evaluate(ctx).complete, false, "not until they've listened to the drummer's wedge");
    listen(ctx, "aux2");
    const result = evaluate(ctx);
    assert.deepEqual(met(result), solved);
    assert.equal(result.complete, true);
  });

  it("raising the singer's master (Aux 1) instead → not complete", () => {
    const ctx = start("monitor-quiet");
    listen(ctx, "aux2");
    state(ctx).aux1.level = bump(state(ctx).aux1.level, 10);
    const result = evaluate(ctx);
    assert.deepEqual(met(result), { ...solved, master: false, singer: false });
  });

  it("raising every Aux 2 send equally with the master untouched → not complete", () => {
    const ctx = start("monitor-quiet");
    listen(ctx, "aux2");
    for (const ch of sendChannels(ctx)) ch.auxSends.aux2 = bump(ch.auxSends.aux2, 8);
    const result = evaluate(ctx);
    assert.deepEqual(met(result), { ...solved, master: false });
    assert.equal(result.complete, false);
  });

  it("raising the master while pushing one send +5 dB breaks the balance", () => {
    const ctx = start("monitor-quiet");
    listen(ctx, "aux2");
    state(ctx).aux2.level = bump(state(ctx).aux2.level, 10);
    const drums = chOf(ctx, "drums");
    drums.auxSends.aux2 = bump(drums.auxSends.aux2, 5); // one send moves on its own
    const result = evaluate(ctx);
    assert.equal(item(result, "master").met, true);
    assert.equal(item(result, "balance").met, false);
    assert.equal(result.complete, false);
  });

  it("dropping a source out of the drummer's mix breaks the balance", () => {
    const ctx = start("monitor-quiet");
    state(ctx).aux2.level = bump(state(ctx).aux2.level, 10);
    chOf(ctx, "keys").auxSends.aux2 = 0;
    assert.equal(item(evaluate(ctx), "balance").met, false);
  });

  it("disconnecting the amp → drummer's wedge cable breaks the chain", () => {
    const ctx = start("monitor-quiet");
    listen(ctx, "aux2");
    state(ctx).aux2.level = bump(state(ctx).aux2.level, 10);
    ctx.store.disconnect(cableFrom(ctx, "amp/out-a").id);
    const result = evaluate(ctx);
    assert.deepEqual(met(result), { ...solved, chain: false });
    assert.equal(result.complete, false);
  });

// ---------- scenario 5: build the drummer's wedge ----------

describe("drummer-wedge", () => {
  const solved = { chain: true, listen: true, heard: true, "no-broken": true, house: true, singer: true };
  const wire = (ctx) => {
    connect(ctx, "mixer/aux2", "amp/in-a", "trs");
    connect(ctx, "amp/out-a", "pwedge/in", "speaker");
  };

  it("starts with the house and the singer's wedge working and Aux 2 unpatched", () => {
    const ctx = start("drummer-wedge");
    const result = evaluate(ctx);
    assert.equal(cableFrom(ctx, "mixer/aux2"), undefined);
    assert.equal(cableFrom(ctx, "mixer/aux1").to, "wedge/in");
    assert.deepEqual(met(result), { chain: false, listen: false, heard: false, "no-broken": true, house: true, singer: true });
  });

  it("Aux 2 → amp → passive wedge, then listening to Aux 2 → complete", () => {
    const ctx = start("drummer-wedge");
    wire(ctx);
    assert.equal(evaluate(ctx).complete, false, "not until they've listened");
    listen(ctx, "aux2");
    const result = evaluate(ctx);
    assert.deepEqual(met(result), solved);
    assert.equal(result.complete, true);
  });

  it("Aux 2 straight into the passive wedge (no amp) does not solve it", () => {
    const ctx = start("drummer-wedge");
    connect(ctx, "mixer/aux2", "pwedge/in", "trs");
    listen(ctx, "aux2");
    const result = evaluate(ctx);
    assert.equal(item(result, "chain").met, false);
    assert.equal(item(result, "no-broken").met, false);
    assert.equal(result.complete, false);
  });

  it("an amp with the wedge cable but nothing on its input is not enough", () => {
    const ctx = start("drummer-wedge");
    connect(ctx, "amp/out-a", "pwedge/in", "speaker");
    listen(ctx, "aux2");
    assert.equal(evaluate(ctx).complete, false);
  });

  it("stealing the singer's powered wedge for Aux 2 breaks the singer's mix", () => {
    const ctx = start("drummer-wedge");
    ctx.store.disconnect(cableFrom(ctx, "mixer/aux1").id);
    connect(ctx, "mixer/aux2", "wedge/in", "trs");
    listen(ctx, "aux2");
    const result = evaluate(ctx);
    assert.equal(item(result, "chain").met, false, "must be the drummer's passive wedge");
    assert.equal(item(result, "singer").met, false);
    assert.equal(result.complete, false);
  });
});

// ---------- scenario 6: more piano ----------

describe("more-piano", () => {
  const solved = { listen: true, send: true, wedge: true, rest: true, house: true, singer: true };
  const keys = (ctx) => chOf(ctx, "keys");

  it("listening to Aux 2 and raising only the keys' Aux 2 send → complete", () => {
    const ctx = start("more-piano");
    keys(ctx).auxSends.aux2 = bump(keys(ctx).auxSends.aux2, 8);
    assert.equal(evaluate(ctx).complete, false, "not until they've listened to the drummer's wedge");
    listen(ctx, "aux2");
    const result = evaluate(ctx);
    assert.deepEqual(met(result), solved);
    assert.equal(result.complete, true);
  });

  it("a small nudge (3 dB) is not enough", () => {
    const ctx = start("more-piano");
    listen(ctx, "aux2");
    keys(ctx).auxSends.aux2 = bump(keys(ctx).auxSends.aux2, 3);
    assert.equal(evaluate(ctx).complete, false);
  });

  it("raising the keys' GAIN changes the house and the singer's mix → not complete", () => {
    const ctx = start("more-piano");
    listen(ctx, "aux2");
    keys(ctx).gainDb += 8;
    const result = evaluate(ctx);
    assert.equal(item(result, "house").met, false);
    assert.equal(item(result, "singer").met, false);
    assert.equal(result.complete, false);
  });

  it("raising the keys' fader only changes the house → not complete", () => {
    const ctx = start("more-piano");
    listen(ctx, "aux2");
    keys(ctx).level = bump(keys(ctx).level, 6);
    const result = evaluate(ctx);
    assert.equal(item(result, "send").met, false);
    assert.equal(result.complete, false);
  });

  it("raising the whole Aux 2 master moves every other channel → not complete", () => {
    const ctx = start("more-piano");
    listen(ctx, "aux2");
    keys(ctx).auxSends.aux2 = bump(keys(ctx).auxSends.aux2, 8);
    state(ctx).aux2.level = bump(state(ctx).aux2.level, 6);
    const result = evaluate(ctx);
    assert.equal(item(result, "rest").met, false);
    assert.equal(result.complete, false);
  });

  it("also turning up another instrument's send → not complete", () => {
    const ctx = start("more-piano");
    listen(ctx, "aux2");
    keys(ctx).auxSends.aux2 = bump(keys(ctx).auxSends.aux2, 8);
    const bass = chOf(ctx, "bass");
    bass.auxSends.aux2 = bump(bass.auxSends.aux2, 5);
    assert.equal(item(evaluate(ctx), "rest").met, false);
  });

  it("raising the keys in the singer's wedge instead → not complete", () => {
    const ctx = start("more-piano");
    listen(ctx, "aux2");
    keys(ctx).auxSends.aux1 = bump(keys(ctx).auxSends.aux1, 8);
    const result = evaluate(ctx);
    assert.equal(item(result, "send").met, false);
    assert.equal(item(result, "singer").met, false);
  });
});

// ---------- scenario 8: the vocal is too loud in the house ----------

describe("foh-vocal", () => {
  const vox = (ctx) => chOf(ctx, "lead-vocal");
  const solved = { lower: true, audible: true, band: true, singer: true, drummer: true };

  it("starts with the vocal pushed up in the house", () => {
    const ctx = start("foh-vocal");
    assert.ok(levelToDb(vox(ctx).level) > 3);
  });

  it("lowering the vocal fader by 8 dB → complete, and the wedges don't move", () => {
    const ctx = start("foh-vocal");
    vox(ctx).level = bump(vox(ctx).level, -8);
    const result = evaluate(ctx);
    assert.deepEqual(met(result), solved);
    assert.equal(result.complete, true);
  });

  it("3 dB is not enough", () => {
    const ctx = start("foh-vocal");
    vox(ctx).level = bump(vox(ctx).level, -3);
    assert.equal(item(evaluate(ctx), "lower").met, false);
  });

  it("lowering the vocal's GAIN changes both wedges (pre-fader sends) → not complete", () => {
    const ctx = start("foh-vocal");
    vox(ctx).gainDb -= 8;
    const result = evaluate(ctx);
    assert.equal(item(result, "lower").met, true);
    assert.equal(item(result, "singer").met, false);
    assert.equal(item(result, "drummer").met, false);
    assert.equal(result.complete, false);
  });

  it("muting the vocal removes it from the house instead of turning it down → not complete", () => {
    const ctx = start("foh-vocal");
    vox(ctx).enabled = false;
    const result = evaluate(ctx);
    assert.equal(item(result, "audible").met, false);
    assert.equal(result.complete, false);
  });

  it("turning the whole Main master down moves the band too → not complete", () => {
    const ctx = start("foh-vocal");
    state(ctx).main.level = bump(state(ctx).main.level, -10);
    const result = evaluate(ctx);
    assert.equal(item(result, "band").met, false);
    assert.equal(result.complete, false);
  });

  it("lowering the vocal's Aux 1 send doesn't help the house and breaks the singer's mix", () => {
    const ctx = start("foh-vocal");
    vox(ctx).auxSends.aux1 = bump(vox(ctx).auxSends.aux1, -10);
    const result = evaluate(ctx);
    assert.equal(item(result, "lower").met, false);
    assert.equal(item(result, "singer").met, false);
  });
});

// ---------- scenario 9: where did the guitar go? ----------

describe("missing-guitar", () => {
  const gtr = (ctx) => chOf(ctx, "guitars");
  const solved = { pfl: true, heard: true, settings: true, band: true };

  it("starts with exactly one fault: the guitar channel is switched off", () => {
    const ctx = start("missing-guitar");
    assert.equal(gtr(ctx).enabled, false);
    for (const c of state(ctx).channels.filter((c) => c.index !== 2 && c.index < 8)) assert.equal(c.enabled, true);
    const mix = evaluate(ctx).mix;
    assert.equal(mix.channels[2].input.status, "ok", "the input itself is fine");
    assert.equal(inputBand(mix.channels[2].inputPeakDb), "good", "and PFL would show a healthy signal");
    assert.equal(item(evaluate(ctx), "heard").met, false);
  });

  it("checking PFL and switching the channel back on → complete", () => {
    const ctx = start("missing-guitar");
    listen(ctx, "pfl");
    gtr(ctx).enabled = true;
    const result = evaluate(ctx);
    assert.deepEqual(met(result), solved);
    assert.equal(result.complete, true);
  });

  it("fixing it without ever checking PFL is not complete", () => {
    const ctx = start("missing-guitar");
    gtr(ctx).enabled = true;
    assert.equal(item(evaluate(ctx), "heard").met, true);
    assert.equal(evaluate(ctx).complete, false);
  });

  it("raising the fader or gain on a muted channel does not bring it back", () => {
    const ctx = start("missing-guitar");
    listen(ctx, "pfl");
    gtr(ctx).level = bump(gtr(ctx).level, 6);
    gtr(ctx).gainDb += 6;
    const result = evaluate(ctx);
    assert.equal(item(result, "heard").met, false);
    assert.equal(item(result, "settings").met, false);
  });

  it("switching it on and also touching the fader or gain is not 'only the fault'", () => {
    const ctx = start("missing-guitar");
    listen(ctx, "pfl");
    gtr(ctx).enabled = true;
    gtr(ctx).level = bump(gtr(ctx).level, 6);
    const result = evaluate(ctx);
    assert.equal(item(result, "settings").met, false);
    assert.equal(result.complete, false);
  });

  it("changing another channel while fixing it is not complete", () => {
    const ctx = start("missing-guitar");
    listen(ctx, "pfl");
    gtr(ctx).enabled = true;
    chOf(ctx, "bass").level = bump(chOf(ctx, "bass").level, -8);
    const result = evaluate(ctx);
    assert.equal(item(result, "band").met, false);
    assert.equal(result.complete, false);
  });
});

// ---------- scenario 10: build the drummer a monitor mix ----------

describe("drummer-mix", () => {
  const solved = { listen: true, core: true, piano: true, others: true, chain: true, house: true, singer: true };
  const build = (ctx, { drums = -3, bass = -3, vocal = -6, keys = -14, guitars = -Infinity } = {}) => {
    setSendDb(ctx, "drums", "aux2", drums);
    setSendDb(ctx, "bass", "aux2", bass);
    setSendDb(ctx, "lead-vocal", "aux2", vocal);
    setSendDb(ctx, "keys", "aux2", keys);
    setSendDb(ctx, "guitars", "aux2", guitars);
  };

  it("starts with an almost empty Aux 2 and a working chain", () => {
    const ctx = start("drummer-mix");
    const sends = state(ctx).channels.filter((c) => c.index < 8 && c.auxSends.aux2 > 0);
    assert.deepEqual(sends.map((c) => c.index), [2], "only a leftover guitar send");
    assert.equal(item(evaluate(ctx), "chain").met, true);
  });

  it("drums, bass, some vocal, a little piano and nothing else → complete", () => {
    const ctx = start("drummer-mix");
    listen(ctx, "aux2");
    build(ctx);
    const result = evaluate(ctx);
    assert.deepEqual(met(result), solved);
    assert.equal(result.complete, true);
  });

  it("the same mix without listening to Aux 2 is not complete", () => {
    const ctx = start("drummer-mix");
    build(ctx);
    assert.equal(evaluate(ctx).complete, false);
  });

  it("leaving the guitar in → not complete", () => {
    const ctx = start("drummer-mix");
    listen(ctx, "aux2");
    build(ctx, { guitars: -12 });
    assert.equal(item(evaluate(ctx), "others").met, false);
  });

  it("a missing requested instrument → not complete", () => {
    for (const miss of [{ drums: -Infinity }, { bass: -Infinity }, { vocal: -Infinity }, { keys: -Infinity }]) {
      const ctx = start("drummer-mix");
      listen(ctx, "aux2");
      build(ctx, miss);
      assert.equal(evaluate(ctx).complete, false, JSON.stringify(miss));
    }
  });

  it("piano as loud as the drums is not 'a little piano'", () => {
    const ctx = start("drummer-mix");
    listen(ctx, "aux2");
    build(ctx, { keys: -3 });
    const result = evaluate(ctx);
    assert.equal(item(result, "piano").met, false);
    assert.equal(result.complete, false);
  });

  it("vocal buried far below the others is not 'some lead vocal'", () => {
    const ctx = start("drummer-mix");
    listen(ctx, "aux2");
    build(ctx, { vocal: -40 });
    assert.equal(item(evaluate(ctx), "core").met, false);
  });

  it("the mix must come out of a working wedge", () => {
    const ctx = start("drummer-mix");
    listen(ctx, "aux2");
    build(ctx);
    ctx.store.disconnect(cableFrom(ctx, "amp/out-a").id);
    const result = evaluate(ctx);
    assert.equal(item(result, "chain").met, false);
    assert.equal(result.complete, false);
  });

  it("changing the singer's mix or the house while building is not complete", () => {
    const ctx = start("drummer-mix");
    listen(ctx, "aux2");
    build(ctx);
    setSendDb(ctx, "lead-vocal", "aux1", -10);
    assert.equal(item(evaluate(ctx), "singer").met, false);
  });
});

  it("every condition type used by a scenario is implemented", () => {
    for (const def of SCENARIOS) for (const c of def.conditions) assert.equal(typeof CONDITIONS[c.type], "function", c.type);
  });
});
