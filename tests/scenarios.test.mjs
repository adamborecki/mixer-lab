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
    for (const id of ["more-vocal", "monitor-quiet"]) {
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

  it("scenarios 2 and 3 start on Main, so the student has to go and listen to the wedge", () => {
    for (const id of ["more-vocal", "monitor-quiet"]) {
      const ctx = start(id);
      assert.equal(state(ctx).listen, "main");
      assert.equal(item(evaluate(ctx), "listen").met, false);
    }
  });
});

// ---------- scenario 1: build the rig ----------

describe("build-rig", () => {
  // Patch a source into its reference channel and gain-stage it the way a student should.
  function patchSource(ctx, sourceId, cable, { gainDb, level = 0.75 } = {}) {
    const src = SOURCES_BY_ID[sourceId];
    connect(ctx, `${sourceDeviceId(sourceId)}/out`, `mixer/ch${src.order}`, cable);
    ctx.store.setChannel(src.order - 1, "gainDb", gainDb ?? nominalGainDb(src));
    ctx.store.setChannel(src.order - 1, "level", level);
  }
  function fixMainWithPoweredSpeakers(ctx) {
    ctx.store.disconnect(cableFrom(ctx, "mixer/main-l").id); // the passive speaker
    connect(ctx, "mixer/main-l", "spk-l/in", "xlr");
    connect(ctx, "mixer/main-r", "spk-r/in", "xlr");
  }

  for (const pair of [[["bass", "xlr"], ["lead-vocal", "xlr"]], [["keys", "ts"], ["bass", "xlr"]]]) {
    it(`solved with ${pair.map(([s, c]) => `${s} (${c})`).join(" + ")} → complete`, () => {
      const ctx = start("build-rig");
      for (const [id, cable] of pair) patchSource(ctx, id, cable);
      fixMainWithPoweredSpeakers(ctx);
      const result = evaluate(ctx);
      assert.deepEqual(met(result), { patched: true, gain: true, chain: true, heard: true, "no-broken": true });
      assert.equal(result.complete, true);
    });
  }

  it("Main L still on the passive speaker → not complete", () => {
    const ctx = start("build-rig");
    patchSource(ctx, "bass", "xlr");
    patchSource(ctx, "lead-vocal", "xlr");
    const result = evaluate(ctx);
    assert.equal(result.complete, false);
    assert.deepEqual(met(result), { patched: true, gain: true, chain: false, heard: false, "no-broken": false });
  });

  it("main-l → amp in-a, amp out-a → passive speaker (speaker cable) satisfies the chain", () => {
    const ctx = start("build-rig");
    ctx.store.disconnect(cableFrom(ctx, "mixer/main-l").id);
    connect(ctx, "mixer/main-l", "amp/in-a", "xlr");
    connect(ctx, "amp/out-a", "pspk-l/in", "speaker");
    assert.equal(item(evaluate(ctx), "chain").met, true);
    patchSource(ctx, "bass", "xlr");
    patchSource(ctx, "lead-vocal", "xlr");
    assert.equal(evaluate(ctx).complete, true);
  });

  it("one working side is not enough while the passive speaker is still hanging off Main L", () => {
    const ctx = start("build-rig");
    patchSource(ctx, "bass", "xlr");
    patchSource(ctx, "lead-vocal", "xlr");
    connect(ctx, "mixer/main-r", "spk-r/in", "xlr");
    const result = evaluate(ctx);
    assert.equal(item(result, "chain").met, true);
    assert.equal(item(result, "heard").met, true);
    assert.equal(item(result, "no-broken").met, false);
    assert.equal(result.complete, false);
    ctx.store.disconnect(cableFrom(ctx, "mixer/main-l").id); // unplug the passive speaker
    assert.equal(evaluate(ctx).complete, true);
  });

  it("an amp with nothing on its input is not a working chain", () => {
    const ctx = start("build-rig");
    ctx.store.disconnect(cableFrom(ctx, "mixer/main-l").id);
    connect(ctx, "amp/out-a", "pspk-l/in", "speaker");
    assert.equal(item(evaluate(ctx), "chain").met, false);
  });

  it("sources on the wrong path don't count: mic on the 1/4\" side, condenser without 48 V", () => {
    const ctx = start("build-rig");
    patchSource(ctx, "bass", "xlr-trs"); // weak line path
    patchSource(ctx, "drums", "xlr"); // condenser, phantom off
    const result = evaluate(ctx);
    assert.equal(item(result, "patched").met, false);
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

  it("every condition type used by a scenario is implemented", () => {
    for (const def of SCENARIOS) for (const c of def.conditions) assert.equal(typeof CONDITIONS[c.type], "function", c.type);
  });
});
