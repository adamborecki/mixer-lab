// The real mixers' practice scenarios (js/board-scenarios.js): each starts
// unsolved with its keep-conditions holding, the intended fix solves it, and
// the tempting wrong fixes don't. Driven through MixerStore, as the UI does.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALL_BOARD_SCENARIOS, buildScenarioState, captureBaseline, evaluateScenario, scenariosFor, validateScenarios } from "../js/scenarios.js";
import { MixerStore, computeMix } from "../js/mixer-state.js";
import { COMPACT, LAWS, levelLaw } from "../js/compact.js";
import * as CR1604 from "../js/cr1604.js";
import { SOURCES_BY_ID, STEMS } from "../audio/source-manifest.js";
import { numberedScenarios } from "../js/progress.js";
import { SCENARIOS } from "../js/scenarios.js";

// One attempt at a scenario: a store, its baseline, and the listening history.
function attempt(def) {
  const st = new MixerStore(buildScenarioState(def, SOURCES_BY_ID, def.board));
  const baseline = captureBaseline(def, st.state, SOURCES_BY_ID, STEMS);
  const session = { listened: new Set([st.state.listen]) };
  st.subscribe((state, change) => change.type === "listen" && session.listened.add(state.listen));
  const mix = () => computeMix(st.state, SOURCES_BY_ID, STEMS);
  const idx = (src) => mix().channels.findIndex((c) => c.sourceId === src);
  const compact = COMPACT[def.board];
  const fader = def.board === "cr1604" ? CR1604.LAWS.fader : levelLaw(compact);
  const send = (sid) => (def.board === "cr1604" ? CR1604.LAWS.send : LAWS[compact.sends[sid].law]);
  const result = () => evaluateScenario(def, st.state, baseline, SOURCES_BY_ID, STEMS, session);
  const cable = (from) => st.state.rig.cables.find((c) => c.from === from || c.to === from);
  return {
    st,
    idx,
    mix,
    result,
    done: () => result().complete,
    unmet: () => result().items.filter((i) => !i.met).map((i) => i.id),
    set: (src, key, v) => st.setChannel(idx(src), key, v),
    faderDb: (src, db) => st.setChannel(idx(src), "level", fader.toPos(db)),
    nudge: (src, dDb) => st.setChannel(idx(src), "level", fader.toPos(fader.toDb(st.state.channels[idx(src)].level) + dDb)),
    sendDb: (src, sid, db) => (def.board === "cr1604" ? st.setSend(idx(src), sid, send(sid).toPos(db)) : st.setChannel(idx(src), `sends.${sid}`, send(sid).toPos(db))),
    tape: () => st.state.channels.length - 1,
    unplugAt: (ref) => st.disconnect(cable(ref).id),
  };
}

const byId = Object.fromEntries(ALL_BOARD_SCENARIOS.map((s) => [s.id, s]));

// The intended fix for each scenario.
const SOLVE = {
  "mix8-doors": (a) => a.st.setChannel(a.tape(), "toCr", false),
  "mix8-keys-wedge": (a) => {
    a.st.setListen("aux1");
    a.sendDb("keys", "aux", 0);
  },
  "mix8-speech": (a) => {
    a.st.setChannel(a.tape(), "toCr", true);
    a.st.setListen("phones");
  },
  "mix8-ballad": (a) => a.sendDb("lead-vocal", "aux", 12),
  "mix8-guest": (a) => {
    a.unplugAt("src-backing-vocals/out");
    assert.ok(a.st.connect("src-guitars/out", "mixer/ch2-mic", "xlr").ok);
  },
  "vlz1202-doors": (a) => a.faderDb("preshow", 0),
  "vlz1202-pfl": (a) => {
    a.set("lead-vocal", "solo", true);
    a.st.setListen("phones");
  },
  "vlz1202-reverb": (a) => {
    a.st.setBus("ret1", "level", 0.5);
    a.sendDb("backing-vocals", "aux2", -6);
  },
  "vlz1202-prefader": (a) => a.st.setBus("aux1", "pre", true),
  "vlz1202-alt": (a) => {
    a.set("drums", "enabled", false);
    a.set("bass", "enabled", false);
    a.st.setBus("alt", "toMain", true);
  },
  "mg102-doors": (a) => a.faderDb("preshow", 0),
  "mg102-phantom": (a) => a.st.setAllPhantom(true),
  "mg102-less-drums": (a) => {
    a.st.setListen("aux1");
    a.set("drums", "sends.auxPan", 0);
  },
  "mg102-one-knob": (a) => {
    a.st.setListen("aux1");
    a.set("backing-vocals", "sends.auxPan", -0.7);
  },
  "mg102-rumble": (a) => {
    a.set("lead-vocal", "lowCut", true);
    a.set("backing-vocals", "lowCut", true);
    a.set("drums", "lowCut", false);
    a.set("bass", "lowCut", false);
  },
  "stagepas400bt-doors": (a) => a.faderDb("preshow", 0),
  "stagepas400bt-micline": (a) => a.set("bass", "micLine", "mic"),
  "stagepas400bt-monitor": (a) => {
    a.st.setListen("monitor");
    a.st.setBus("monitor", "level", 0.5);
  },
  "stagepas400bt-speakers": (a) => {
    a.unplugAt("mixer/mon-r");
    assert.ok(a.st.connect("mixer/spk-l", "sp-l/in", "speaker").ok);
    assert.ok(a.st.connect("mixer/spk-r", "sp-r/in", "speaker").ok);
  },
  "stagepas400bt-reverb": (a) => {
    a.set("guitars", "sends.reverb", 0);
    a.set("bass", "sends.reverb", 0);
  },
  "x1204usb-doors": (a) => a.faderDb("preshow", 0),
  "x1204usb-fx": (a) => {
    a.sendDb("lead-vocal", "fx", -6);
    a.st.setBus("ret2", "level", 0.5);
  },
  "x1204usb-wedge": (a) => {
    a.st.setBus("aux1", "solo", true); // hear the wedge in the phones
    a.st.setListen("phones");
    a.sendDb("keys", "aux1", -8);
  },
  "x1204usb-pre": (a) => a.set("guitars", "pre", true),
  "x1204usb-alt": (a) => {
    for (const s of ["guitars", "bass", "keys"]) a.set(s, "enabled", false);
    a.st.setBus("cr", "alt", true);
    a.st.setListen("phones");
  },
  "sd442-camera": (a) => {
    a.st.setDevice("cam-1", "inputLevel", 1);
    a.st.setDevice("cam-2", "inputLevel", 1);
    a.st.setListen("main");
  },
  "sd442-tone": (a) => {
    a.st.setBus("tone", "on", true);
    a.st.setListen("main");
  },
  "sd442-phantom": (a) => {
    a.set("room-l", "phantom", true);
    a.set("room-r", "phantom", true);
  },
  "sd442-mono": (a) => {
    a.st.setBus("cr", "src", "M");
    a.set("room-r", "polarity", false);
  },
  "sd442-iso": (a) => {
    a.st.setBus("link", "mode", "off");
    a.set("room-l", "pan", 1);
    a.set("room-r", "pan", 1);
    a.set("lead-vocal", "pan", -1);
    a.set("backing-vocals", "pan", -1);
    a.st.setBus("lim", "mode", "on");
  },
  "ui16-doors": (a) => a.faderDb("preshow", 0),
  "ui16-gain": (a) => a.set("lead-vocal", "gainDb", 46),
  "ui16-more-keys": (a) => {
    a.st.setListen("aux2");
    a.sendDb("keys", "aux2", -6);
  },
  "ui16-trumpet-reverb": (a) => a.sendDb("trumpets", "fx1", -10),
  "ui16-out-of-house": (a) => a.set("bass", "level", 0),
  "ui16-guitar-mix": (a) => {
    a.st.setListen("aux3");
    a.sendDb("guitars", "aux3", 0);
    a.sendDb("lead-vocal", "aux3", 0);
    a.sendDb("drums", "aux3", -8);
  },
  "cr1604-doors": (a) => a.st.setChannel(CR1604.TAPE, "toMain", true),
  "cr1604-assign": (a) => a.set("lead-vocal", "assign.lr", true),
  "cr1604-mute-pre": (a) => {
    a.set("guitars", "pre", true);
    a.set("guitars", "enabled", false);
  },
  "cr1604-reverb": (a) => {
    a.sendDb("lead-vocal", "aux3", -6);
    a.st.setBus("ret1", "level", 0.5);
  },
  "cr1604-subgroup": (a) => {
    for (const s of ["drums", "bass"]) {
      a.set(s, "assign.lr", false);
      a.set(s, "assign.s12", true);
    }
    a.st.setBus("sub1", "toMainL", true);
    a.st.setBus("sub2", "toMainR", true);
    a.st.setBus("sub1", "level", CR1604.LAWS.fader.toPos(-6));
    a.st.setBus("sub2", "level", CR1604.LAWS.fader.toPos(-6));
  },
};

// Tempting wrong fixes: each must leave the scenario unsolved.
const WRONG = {
  "mix8-doors": [["MAIN up", (a) => a.st.setBus("main", "level", 1)]],
  "mix8-keys-wedge": [["the keys' LEVEL instead", (a) => {
    a.st.setListen("aux1");
    a.sendDb("keys", "aux", 0);
    a.nudge("keys", 6);
  }]],
  "mix8-speech": [["MAIN down", (a) => {
    a.st.setBus("main", "level", 0);
    a.st.setListen("phones");
  }]],
  "mix8-ballad": [["the vocal LEVEL back up", (a) => a.nudge("lead-vocal", 12)]],
  "mix8-guest": [["the mic into a line input", (a) => a.st.connect("src-guitars/out", "mixer/ch4-l", "xlr-trs")]],
  "vlz1202-pfl": [["unmute to check it", (a) => {
    a.set("lead-vocal", "enabled", true);
    a.set("lead-vocal", "solo", true);
    a.st.setListen("phones");
  }]],
  "vlz1202-reverb": [["only the return", (a) => a.st.setBus("ret1", "level", 0.5)], ["the wedge send instead", (a) => {
    a.st.setBus("ret1", "level", 0.5);
    a.sendDb("backing-vocals", "aux1", 0);
    a.sendDb("backing-vocals", "aux2", -6);
  }]],
  "vlz1202-prefader": [["more vocal in the wedge instead", (a) => a.sendDb("lead-vocal", "aux1", 6)]],
  "vlz1202-alt": [["MUTE/ALT without ASSIGN TO MAIN", (a) => {
    a.set("drums", "enabled", false);
    a.set("bass", "enabled", false);
  }]],
  "mg102-phantom": [["the drums' LEVEL up", (a) => a.faderDb("drums", 10)]],
  "mg102-less-drums": [["the drums' house LEVEL down", (a) => {
    a.st.setListen("aux1");
    a.set("drums", "level", 0);
  }]],
  "mg102-one-knob": [["the backing vocal's LEVEL up", (a) => {
    a.st.setListen("aux1");
    a.nudge("backing-vocals", 6);
  }]],
  "mg102-rumble": [["the HPF on everything", (a) => {
    for (const s of ["lead-vocal", "backing-vocals", "drums", "bass"]) a.set(s, "lowCut", true);
  }]],
  "stagepas400bt-micline": [["the bass LEVEL all the way up", (a) => a.set("bass", "level", 1)]],
  "stagepas400bt-monitor": [["MASTER LEVEL up", (a) => {
    a.st.setListen("monitor");
    a.st.setBus("main", "level", 0.8);
  }]],
  "stagepas400bt-speakers": [["one speaker, the other still on MONITOR OUT", (a) => assert.ok(a.st.connect("mixer/spk-r", "sp-r/in", "speaker").ok)]],
  "stagepas400bt-reverb": [["the reverb switched off", (a) => a.st.setBus("reverb", "on", false)]],
  "x1204usb-fx": [["only the return", (a) => a.st.setBus("ret2", "level", 0.5)]],
  "x1204usb-wedge": [["the keys' fader down", (a) => {
    a.st.setListen("aux1");
    a.set("keys", "level", 0);
  }]],
  "x1204usb-pre": [["more guitar in the wedge instead", (a) => a.sendDb("guitars", "aux1", 2)]],
  "x1204usb-alt": [["faders down", (a) => {
    for (const s of ["guitars", "bass", "keys"]) a.set(s, "level", 0);
    a.st.setBus("cr", "alt", true);
    a.st.setListen("phones");
  }]],
  "sd442-camera": [["MASTER down", (a) => {
    a.st.setBus("main", "level", 0.4);
    a.st.setListen("main");
  }]],
  "sd442-phantom": [["more GAIN", (a) => {
    a.set("room-l", "gainDb", 60);
    a.set("room-r", "gainDb", 60);
  }]],
  "sd442-mono": [["fix it without listening in mono", (a) => a.set("room-r", "polarity", false)]],
  "sd442-iso": [["pans only, still linked", (a) => {
    a.set("room-l", "pan", 1);
    a.set("room-r", "pan", 1);
    a.set("lead-vocal", "pan", -1);
    a.set("backing-vocals", "pan", -1);
    a.st.setBus("lim", "mode", "on");
  }]],
  "ui16-gain": [["the fader up instead", (a) => a.faderDb("lead-vocal", 10)]],
  "ui16-more-keys": [["the keys' MIX fader up", (a) => {
    a.st.setListen("aux2");
    a.nudge("keys", 6);
  }]],
  "ui16-out-of-house": [["MUTE", (a) => a.set("bass", "enabled", false)]],
  "ui16-guitar-mix": [["drums louder than the guitar", (a) => {
    a.st.setListen("aux3");
    a.sendDb("guitars", "aux3", -6);
    a.sendDb("lead-vocal", "aux3", 0);
    a.sendDb("drums", "aux3", 0);
  }]],
  "cr1604-assign": [["the vocal's fader up", (a) => a.nudge("lead-vocal", 6)]],
  "cr1604-mute-pre": [["MUTE alone", (a) => a.set("guitars", "enabled", false)]],
  "cr1604-reverb": [["only the return", (a) => a.st.setBus("ret1", "level", 0.5)]],
  "cr1604-subgroup": [["SUB 1-2 with L-R still down", (a) => {
    for (const s of ["drums", "bass"]) a.set(s, "assign.s12", true);
    a.st.setBus("sub1", "toMainL", true);
    a.st.setBus("sub2", "toMainR", true);
    a.st.setBus("sub1", "level", CR1604.LAWS.fader.toPos(-6));
    a.st.setBus("sub2", "level", CR1604.LAWS.fader.toPos(-6));
  }]],
};

describe("board scenarios: data", () => {
  it("validate, and every board has at least five, numbered from 1", () => {
    assert.deepEqual(validateScenarios(), []);
    for (const board of ["mix8", "vlz1202", "mg102", "stagepas400bt", "x1204usb", "sd442", "ui16", "cr1604"]) {
      const list = scenariosFor(board).filter((s) => s.number > 0);
      assert.ok(list.length >= 5, `${board}: ${list.length}`);
      assert.deepEqual(list.map((s) => s.number), list.map((_, i) => i + 1), board);
      assert.equal(scenariosFor(board).at(-1).id, "free-play");
    }
  });

  it("ids are unique and never collide with the Canvas scenarios, which stay as they were", () => {
    const ids = ALL_BOARD_SCENARIOS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    const canvas = numberedScenarios(SCENARIOS).map((s) => s.id);
    assert.equal(canvas.length, 10);
    for (const id of ids) assert.ok(!canvas.includes(id), id);
  });

  it("every scenario has a solution and three hints", () => {
    for (const s of ALL_BOARD_SCENARIOS) {
      assert.ok(SOLVE[s.id], `${s.id} has a test solution`);
      assert.equal(s.hints.length, 3, s.id);
      assert.ok(s.complete && s.prompt && s.goal && s.who, s.id);
    }
  });
});

for (const def of ALL_BOARD_SCENARIOS) {
  describe(`${def.board}: ${def.number}. ${def.title}`, () => {
    it("starts unsolved, with every goal unmet and every keep met", () => {
      const a = attempt(def);
      for (const i of a.result().items) assert.equal(i.met, i.kind === "keep", `${i.kind} ${i.id}`);
    });

    it("the intended fix solves it", () => {
      const a = attempt(def);
      SOLVE[def.id](a);
      assert.ok(a.done(), `still unmet: ${a.unmet().join(", ")}`);
    });

    for (const [name, wrong] of WRONG[def.id] || []) {
      it(`a tempting wrong fix doesn't: ${name}`, () => {
        const a = attempt(def);
        wrong(a);
        assert.equal(a.done(), false);
      });
    }
  });
}
