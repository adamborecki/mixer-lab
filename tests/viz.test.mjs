import test from "node:test";
import assert from "node:assert/strict";
import { COMPACT, createState, sanitizeChannel } from "../js/compact.js";
import { biquadDb, channelEqDb, compOutDb } from "../js/ui/viz.js";

const near = (a, b, tol = 0.1) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test("biquadDb follows the Web Audio filters", () => {
  near(biquadDb("peaking", 1000, 6, 1, 1000), 6);
  near(biquadDb("peaking", 1000, -9, 2, 1000), -9);
  near(biquadDb("peaking", 1000, 6, 2, 100), 0, 0.2);
  // Shelves reach their full gain well past the corner.
  near(biquadDb("lowshelf", 160, 8, 0, 20), 8, 0.3);
  near(biquadDb("highshelf", 4000, -6, 0, 18000), -6, 0.4);
  // 12 dB/oct high-pass: about −24 dB two octaves down.
  assert.ok(biquadDb("highpass", 200, 0, 0.6, 50) < -20);
  near(biquadDb("highpass", 200, 0, 0.6, 5000), 0, 0.1);
});

test("the EQ curve is flat when EQ ON is off; the high-pass still shows", () => {
  const def = COMPACT.ui16;
  const ch = createState("ui16").channels[6];
  ch.peq.hiMid.gain = -6;
  ch.peq.hiMid.freq = 3000;
  near(channelEqDb(def.channels[6], ch, 3000), -6, 0.2);
  ch.eqOn = false;
  near(channelEqDb(def.channels[6], ch, 3000), 0, 0.01);
  ch.hpf = 0.5;
  assert.ok(channelEqDb(def.channels[6], ch, 40) < -6);
});

test("the compressor's transfer curve", () => {
  const d = { threshold: -20, ratio: 4, makeup: 3 };
  assert.equal(compOutDb(d, true, -40), -37);
  assert.equal(compOutDb(d, true, -4), -20 + 16 / 4 + 3);
  assert.equal(compOutDb(d, false, -4), -4);
  assert.equal(compOutDb({ threshold: 0, ratio: 4, makeup: 0 }, true, -4), -4);
});

test("EQ ON starts on and COMP ON starts off, on every desk with them", () => {
  for (const id of ["ui16", "x32c", "x32", "yam01v96"]) {
    const ch = createState(id).channels[0];
    assert.equal(ch.eqOn, true, id);
    assert.equal(ch.compOn, false, id);
    assert.equal(sanitizeChannel(COMPACT[id], ch, "compOn", 1), true);
  }
  const mix = createState("mix8").channels[0];
  assert.equal(mix.eqOn, undefined);
  assert.equal(sanitizeChannel(COMPACT.mix8, mix, "eqOn", true), undefined);
});
