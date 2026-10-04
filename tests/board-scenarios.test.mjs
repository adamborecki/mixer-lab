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
  "ui16-mud": (a) => {
    a.set("guitars", "eqOn", true);
    a.set("guitars", "peq.lowMid.gain", -4);
    a.set("guitars", "peq.lowMid.freq", 300);
  },
  "x32c-mud": (a) => {
    a.set("guitars", "eqOn", true);
    a.set("guitars", "peq.lowMid.gain", -4);
    a.set("guitars", "peq.lowMid.freq", 300);
  },
  "x32-mud": (a) => {
    a.set("guitars", "eqOn", true);
    a.set("guitars", "peq.lowMid.gain", -4);
    a.set("guitars", "peq.lowMid.freq", 300);
  },
  "yam01v96-mud": (a) => {
    a.set("guitars", "eqOn", true);
    a.set("guitars", "peq.lowMid.gain", -4);
    a.set("guitars", "peq.lowMid.freq", 300);
  },
  "cl3-mud": (a) => {
    a.set("guitars", "eqOn", true);
    a.set("guitars", "peq.lowMid.gain", -4);
    a.set("guitars", "peq.lowMid.freq", 300);
  },
  "ui16-eq-on": (a) => a.set("lead-vocal", "eqOn", true),
  "ui16-comp-on": (a) => a.set("lead-vocal", "compOn", true),
  "x32c-eq-on": (a) => a.set("lead-vocal", "eqOn", true),
  "x32c-comp-on": (a) => a.set("lead-vocal", "compOn", true),
  "x32-eq-on": (a) => a.set("lead-vocal", "eqOn", true),
  "x32-comp-on": (a) => a.set("lead-vocal", "compOn", true),
  "yam01v96-eq-on": (a) => a.set("lead-vocal", "eqOn", true),
  "yam01v96-comp-on": (a) => a.set("lead-vocal", "compOn", true),
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
  "ui16-mud": [
    ["the cut without EQ ON", (a) => {
      a.set("guitars", "peq.lowMid.gain", -4);
      a.set("guitars", "peq.lowMid.freq", 300);
    }],
    ["EQ ON but a boost", (a) => {
      a.set("guitars", "eqOn", true);
      a.set("guitars", "peq.lowMid.gain", 4);
    }],
  ],
  "x32c-mud": [
    ["the cut without EQ ON", (a) => {
      a.set("guitars", "peq.lowMid.gain", -4);
      a.set("guitars", "peq.lowMid.freq", 300);
    }],
    ["EQ ON but a boost", (a) => {
      a.set("guitars", "eqOn", true);
      a.set("guitars", "peq.lowMid.gain", 4);
    }],
  ],
  "x32-mud": [
    ["the cut without EQ ON", (a) => {
      a.set("guitars", "peq.lowMid.gain", -4);
      a.set("guitars", "peq.lowMid.freq", 300);
    }],
    ["EQ ON but a boost", (a) => {
      a.set("guitars", "eqOn", true);
      a.set("guitars", "peq.lowMid.gain", 4);
    }],
  ],
  "yam01v96-mud": [
    ["the cut without EQ ON", (a) => {
      a.set("guitars", "peq.lowMid.gain", -4);
      a.set("guitars", "peq.lowMid.freq", 300);
    }],
    ["EQ ON but a boost", (a) => {
      a.set("guitars", "eqOn", true);
      a.set("guitars", "peq.lowMid.gain", 4);
    }],
  ],
  "cl3-mud": [
    ["the cut without EQ ON", (a) => {
      a.set("guitars", "peq.lowMid.gain", -4);
      a.set("guitars", "peq.lowMid.freq", 300);
    }],
    ["EQ ON but a boost", (a) => {
      a.set("guitars", "eqOn", true);
      a.set("guitars", "peq.lowMid.gain", 4);
    }],
  ],
  "ui16-eq-on": [
    ["re-dial the bands instead", (a) => {
      a.set("lead-vocal", "peq.low.gain", -12);
      a.set("lead-vocal", "peq.hiMid.gain", -10);
    }],
    ["EQ on, but flattened", (a) => {
      a.set("lead-vocal", "eqOn", true);
      a.set("lead-vocal", "peq.low.gain", 0);
      a.set("lead-vocal", "peq.hiMid.gain", 0);
    }],
  ],
  "ui16-comp-on": [
    ["more ratio instead", (a) => a.set("lead-vocal", "dyn.ratio", 10)],
    ["the vocal's fader down", (a) => a.nudge("lead-vocal", -4)],
  ],
  "x32c-eq-on": [
    ["re-dial the bands instead", (a) => {
      a.set("lead-vocal", "peq.low.gain", -12);
      a.set("lead-vocal", "peq.hiMid.gain", -10);
    }],
    ["EQ on, but flattened", (a) => {
      a.set("lead-vocal", "eqOn", true);
      a.set("lead-vocal", "peq.low.gain", 0);
      a.set("lead-vocal", "peq.hiMid.gain", 0);
    }],
  ],
  "x32c-comp-on": [
    ["more ratio instead", (a) => a.set("lead-vocal", "dyn.ratio", 10)],
    ["the vocal's fader down", (a) => a.nudge("lead-vocal", -4)],
  ],
  "x32-eq-on": [
    ["re-dial the bands instead", (a) => {
      a.set("lead-vocal", "peq.low.gain", -12);
      a.set("lead-vocal", "peq.hiMid.gain", -10);
    }],
    ["EQ on, but flattened", (a) => {
      a.set("lead-vocal", "eqOn", true);
      a.set("lead-vocal", "peq.low.gain", 0);
      a.set("lead-vocal", "peq.hiMid.gain", 0);
    }],
  ],
  "x32-comp-on": [
    ["more ratio instead", (a) => a.set("lead-vocal", "dyn.ratio", 10)],
    ["the vocal's fader down", (a) => a.nudge("lead-vocal", -4)],
  ],
  "yam01v96-eq-on": [
    ["re-dial the bands instead", (a) => {
      a.set("lead-vocal", "peq.low.gain", -12);
      a.set("lead-vocal", "peq.hiMid.gain", -10);
    }],
    ["EQ on, but flattened", (a) => {
      a.set("lead-vocal", "eqOn", true);
      a.set("lead-vocal", "peq.low.gain", 0);
      a.set("lead-vocal", "peq.hiMid.gain", 0);
    }],
  ],
  "yam01v96-comp-on": [
    ["more ratio instead", (a) => a.set("lead-vocal", "dyn.ratio", 10)],
    ["the vocal's fader down", (a) => a.nudge("lead-vocal", -4)],
  ],
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


// ----- the scenarios added to cover every control -----
Object.assign(SOLVE, {
  "mix8-phones": (a) => {
    a.st.setBus("cr", "level", 0.5);
    a.st.setListen("phones");
  },
  "mix8-ol": (a) => a.set("keys", "gainDb", 28),
  "mix8-boomy": (a) => a.set("lead-vocal", "eq.low", 0),
  "mix8-pan": (a) => {
    a.set("backing-vocals", "pan", -1);
    a.set("keys", "pan", 1);
  },
  "mix8-wedge-loud": (a) => {
    a.st.setListen("aux1");
    a.st.setBus("aux1", "level", 0.5);
  },
  "mix8-overhead": (a) => {
    a.unplugAt("src-backing-vocals/out");
    assert.ok(a.st.connect("src-drums/out", "mixer/ch2-mic", "xlr").ok);
    a.st.setAllPhantom(true);
    a.set("drums", "gainDb", 34);
  },
  "stagepas400bt-speech": (a) => a.st.setBus("masterEq", "pos", 0.2),
  "stagepas400bt-hall": (a) => a.st.setBus("reverb", "type", 0.24),
  "stagepas400bt-mono": (a) => a.set("preshow", "stMono", true),
  "stagepas400bt-overhead": (a) => {
    a.unplugAt("src-drums/out");
    a.unplugAt("src-backing-vocals/out");
    assert.ok(a.st.connect("src-drums/out", "mixer/ch2-mic", "xlr").ok);
    assert.ok(a.st.connect("src-backing-vocals/out", "mixer/ch3-in", "xlr").ok);
  },
  "stagepas400bt-sub": (a) => assert.ok(a.st.connect("mixer/sub-out", "sub/in", "trs").ok),
  "stagepas400bt-feedback": (a) => a.st.setBus("fbs", "on", true),
  "mg102-peak": (a) => a.set("drums", "gainDb", 34),
  "mg102-thin-bass": (a) => a.set("bass", "eq.low", 3),
  "mg102-reverb-loud": (a) => a.st.setBus("ret1", "level", 0.5),
  "mg102-2tr": (a) => assert.ok(a.st.connect("src-preshow/out", "mixer/tape-in", "mini-rca").ok),
  "vlz1202-trim": (a) => a.set("drums", "gainDb", 34),
  "vlz1202-nasal": (a) => a.set("lead-vocal", "eq.mid", 0),
  "vlz1202-pad": (a) => a.st.setBus("xlrPad", "on", false),
  "vlz1202-wedge-quiet": (a) => {
    a.st.setListen("aux1");
    a.st.setBus("aux1", "level", 0.5);
  },
  "vlz1202-lowcut": (a) => {
    a.set("lead-vocal", "lowCut", true);
    a.set("backing-vocals", "lowCut", true);
    a.set("drums", "lowCut", false);
    a.set("bass", "lowCut", false);
  },
  "vlz1202-efx": (a) => a.st.setBus("ret2", "efx", true),
  "vlz1202-tape": (a) => {
    a.st.setBus("cr", "tape", true);
    a.st.setListen("phones");
  },
  "x1204usb-minus10": (a) => a.set("preshow", "minus10", true),
  "x1204usb-overhead": (a) => {
    assert.ok(a.st.connect("src-drums/out", "mixer/ch2-mic", "xlr").ok);
    a.st.setAllPhantom(true);
    a.set("drums", "gainDb", 34);
  },
  "x1204usb-pfl": (a) => {
    a.st.setBus("soloBus", "mode", "pfl");
    a.set("guitars", "solo", true);
    a.st.setListen("phones");
    a.set("guitars", "gainDb", 36);
  },
  "x1204usb-comp": (a) => a.set("lead-vocal", "comp", 0.4),
  "x1204usb-slapback": (a) => a.st.setBus("fx", "program", 9),
  "x1204usb-ret-mon": (a) => {
    a.st.setBus("ret1", "mon", 0.5);
    a.st.setListen("aux1");
  },
  "x1204usb-cdtape": (a) => {
    assert.ok(a.st.connect("src-preshow/out", "mixer/tape-in", "mini-rca").ok);
    a.st.setChannel(a.tape(), "toMain", true);
  },
  "sd442-hot-vocal": (a) => a.set("lead-vocal", "gainDb", 46),
  "sd442-master": (a) => a.st.setBus("main", "level", LAWS.master6.toPos(0)),
  "sd442-line": (a) => {
    a.set("keys", "micLine", "line");
    a.set("keys", "gainDb", 52);
  },
  "sd442-hpf": (a) => {
    a.set("lead-vocal", "hpf", 0.2);
    a.set("backing-vocals", "hpf", 0.2);
  },
  "ui16-48v": (a) => a.set("drums", "phantom", true),
  "ui16-hpf": (a) => {
    a.set("lead-vocal", "hpf", 0.2);
    a.set("backing-vocals", "hpf", 0.2);
  },
  "ui16-harsh": (a) => a.set("lead-vocal", "peq.hiMid.gain", -4),
  "ui16-comp": (a) => {
    a.set("bass", "compOn", true);
    a.set("bass", "dyn.threshold", -15);
    a.set("bass", "dyn.ratio", 4);
  },
  "ui16-delay": (a) => a.sendDb("lead-vocal", "fx2", -10),
  "ui16-post": (a) => a.set("keys", "pres.aux2", false),
  "cr1604-phantom": (a) => a.st.setAllPhantom(true),
  "cr1604-levelset": (a) => {
    a.st.setBus("soloBus", "mode", "pfl");
    a.set("lead-vocal", "solo", true);
    a.st.setListen("phones");
    a.set("lead-vocal", "gainDb", 46);
  },
  "cr1604-sweep": (a) => a.set("trumpets", "eq.mid", -6),
  "cr1604-lowcut": (a) => {
    a.set("lead-vocal", "lowCut", true);
    a.set("backing-vocals", "lowCut", true);
    a.set("drums", "lowCut", false);
    a.set("bass", "lowCut", false);
  },
  "cr1604-drummer-quiet": (a) => {
    a.st.setBus("aux2", "solo", true);
    a.st.setListen("phones");
    a.st.setBus("aux2", "level", CR1604.LAWS.master.toPos(0));
  },
  "cr1604-efx-mon": (a) => a.st.setBus("ret1", "toAux", 0.5),
  "cr1604-mono": (a) => {
    assert.ok(a.st.connect("mixer/mono", "lobby/in", "trs").ok);
    a.st.setBus("mono", "level", 0.67);
  },
  "cr1604-shift": (a) => {
    a.st.setListen("aux6");
    a.set("trumpets", "shift", true);
    a.sendDb("trumpets", "aux4", 0);
  },
  "cr1604-direct": (a) => {
    assert.ok(a.st.connect("mixer/ch7-direct", "rec/in1", "trs").ok);
    a.st.setDevice("rec", "tracks.0.arm", true);
  },
  "cr1604-room": (a) => {
    assert.ok(a.st.connect("room-pair/out-l", "rec/in3", "xlr").ok);
    assert.ok(a.st.connect("room-pair/out-r", "rec/in4", "xlr").ok);
    for (const t of [2, 3]) {
      a.st.setDevice("rec", `tracks.${t}.phantom`, true);
      a.st.setDevice("rec", `tracks.${t}.arm`, true);
    }
  },
});

Object.assign(WRONG, {
  "mix8-ol": [["the keys' LEVEL down", (a) => a.set("keys", "level", 0.4)]],
  "mix8-boomy": [["the vocal's LEVEL down", (a) => a.nudge("lead-vocal", -6)]],
  "mix8-pan": [["only the backing vocal", (a) => a.set("backing-vocals", "pan", -1)]],
  "mix8-wedge-loud": [["only the vocal's AUX", (a) => {
    a.st.setListen("aux1");
    a.sendDb("lead-vocal", "aux", -10);
  }]],
  "mix8-overhead": [["no phantom", (a) => {
    a.unplugAt("src-backing-vocals/out");
    a.st.connect("src-drums/out", "mixer/ch2-mic", "xlr");
    a.set("drums", "gainDb", 34);
  }]],
  "stagepas400bt-speech": [["MASTER LEVEL down", (a) => a.st.setBus("main", "level", 0.3)]],
  "stagepas400bt-hall": [["the ECHO end", (a) => a.st.setBus("reverb", "type", 0.9)]],
  "stagepas400bt-overhead": [["PHANTOM pressed again", (a) => a.st.setAllPhantom(true)]],
  "stagepas400bt-sub": [["the sub on MONITOR OUT", (a) => a.st.connect("mixer/mon-r", "sub/in", "trs")]],
  "stagepas400bt-feedback": [["the wedge off", (a) => a.st.setBus("monitor", "level", 0)]],
  "mg102-peak": [["the drums' LEVEL down", (a) => a.set("drums", "level", 0.4)]],
  "mg102-reverb-loud": [["the reverb off completely", (a) => a.st.setBus("ret1", "level", 0)]],
  "mg102-2tr": [["back on channel 9/10", (a) => a.st.connect("src-preshow/out", "mixer/ch6-rca", "mini-rca")]],
  "vlz1202-trim": [["the LEVEL down", (a) => a.set("drums", "level", 0.4)]],
  "vlz1202-pad": [["MAIN MIX up", (a) => a.st.setBus("main", "level", 1)]],
  "vlz1202-wedge-quiet": [["only the vocal's AUX 1", (a) => {
    a.st.setListen("aux1");
    a.sendDb("lead-vocal", "aux1", 15);
  }]],
  "vlz1202-efx": [["more vocal in the wedge", (a) => a.sendDb("lead-vocal", "aux1", 8)]],
  "vlz1202-tape": [["only listening", (a) => a.st.setListen("phones")]],
  "x1204usb-minus10": [["the fader up", (a) => a.faderDb("preshow", 6)]],
  "x1204usb-overhead": [["no phantom", (a) => {
    a.st.connect("src-drums/out", "mixer/ch2-mic", "xlr");
    a.set("drums", "gainDb", 34);
  }]],
  "x1204usb-pfl": [["gain without listening", (a) => a.set("guitars", "gainDb", 36)]],
  "x1204usb-comp": [["COMP all the way", (a) => a.set("lead-vocal", "comp", 1)]],
  "x1204usb-slapback": [["a hall", (a) => a.st.setBus("fx", "program", 1)]],
  "x1204usb-ret-mon": [["RET 1 louder in the house", (a) => {
    a.st.setBus("ret1", "level", 0.8);
    a.st.setListen("aux1");
  }]],
  "x1204usb-cdtape": [["patched, not sent to MAIN", (a) => a.st.connect("src-preshow/out", "mixer/tape-in", "mini-rca")]],
  "sd442-hot-vocal": [["the fader down", (a) => a.set("lead-vocal", "level", 0.3)]],
  "sd442-master": [["every fader up", (a) => {
    for (const s of ["room-l", "lead-vocal", "backing-vocals"]) a.nudge(s, 15);
  }]],
  "sd442-line": [["GAIN all the way down", (a) => a.set("keys", "gainDb", 22)]],
  "sd442-hpf": [["the HPF on everything", (a) => {
    for (const s of ["lead-vocal", "backing-vocals", "room-l", "room-r"]) a.set(s, "hpf", 0.2);
  }]],
  "ui16-48v": [["more gain", (a) => a.set("drums", "gainDb", 57)]],
  "ui16-hpf": [["the HPF on the bass too", (a) => {
    for (const s of ["lead-vocal", "backing-vocals", "bass"]) a.set(s, "hpf", 0.2);
  }]],
  "ui16-harsh": [["a cut in the wrong place", (a) => {
    a.set("lead-vocal", "peq.hiMid.gain", -4);
    a.set("lead-vocal", "peq.hiMid.freq", 600);
  }]],
  "ui16-comp": [
    ["RATIO only", (a) => a.set("bass", "dyn.ratio", 4)],
    ["dialled in but not switched on", (a) => {
      a.set("bass", "dyn.threshold", -15);
      a.set("bass", "dyn.ratio", 4);
    }],
  ],
  "ui16-delay": [["into the wedge instead", (a) => a.sendDb("lead-vocal", "aux1", 6)]],
  "ui16-post": [["every channel POST", (a) => {
    for (const c of a.mix().channels.filter((c) => c.sourceId)) a.st.setChannel(c.index, "pres.aux2", false);
  }]],
  "cr1604-phantom": [["the drums' fader up", (a) => a.nudge("drums", 8)]],
  "cr1604-levelset": [["TRIM up in NORMAL mode", (a) => {
    a.set("lead-vocal", "solo", true);
    a.st.setListen("phones");
    a.set("lead-vocal", "gainDb", 46);
  }]],
  "cr1604-sweep": [["cut, but somewhere else", (a) => {
    a.set("trumpets", "eq.mid", -6);
    a.set("trumpets", "eq.freq", 4000);
  }]],
  "cr1604-drummer-quiet": [["every AUX 2 knob up", (a) => {
    a.st.setListen("aux2");
    for (const c of a.mix().channels.filter((c) => c.sourceId && c.aux.aux2.sendDb > -60)) a.st.setSend(c.index, "aux2", CR1604.LAWS.send.toPos(c.aux.aux2.sendDb + 10));
  }]],
  "cr1604-efx-mon": [["RETURN 1 up in the house", (a) => a.st.setBus("ret1", "level", 0.8)]],
  "cr1604-mono": [["patched, MONO LEVEL still down", (a) => a.st.connect("mixer/mono", "lobby/in", "trs")]],
  "cr1604-shift": [["AUX 4 up without SHIFT", (a) => {
    a.st.setListen("aux6");
    a.sendDb("trumpets", "aux4", 0);
  }]],
  "cr1604-direct": [["patched but not armed", (a) => a.st.connect("mixer/ch7-direct", "rec/in1", "trs")]],
  "cr1604-room": [["no 48V on the recorder", (a) => {
    a.st.connect("room-pair/out-l", "rec/in3", "xlr");
    a.st.connect("room-pair/out-r", "rec/in4", "xlr");
    a.st.setDevice("rec", "tracks.2.arm", true);
    a.st.setDevice("rec", "tracks.3.arm", true);
  }]],
});


// ----- Behringer X32 Compact -----
Object.assign(SOLVE, {
  "x32c-doors": (a) => a.faderDb("preshow", 0),
  "x32c-gain": (a) => a.set("lead-vocal", "gainDb", 46),
  "x32c-48v": (a) => a.set("drums", "phantom", true),
  "x32c-lowcut": (a) => {
    a.set("lead-vocal", "hpf", 0.25);
    a.set("backing-vocals", "hpf", 0.25);
  },
  "x32c-lr": (a) => a.set("guitars", "lr", true),
  "x32c-sof": (a) => {
    a.st.setListen("mix1");
    a.sendDb("lead-vocal", "mix1", 6);
  },
  "x32c-drummer-quiet": (a) => {
    a.st.setListen("mix2");
    a.st.setBus("mix2", "level", LAWS.level.toPos(0));
  },
  "x32c-bus-mute": (a) => {
    a.st.setListen("mix1");
    a.st.setBus("mix1", "mute", false);
  },
  "x32c-reverb": (a) => a.sendDb("lead-vocal", "fx1", -10),
  "x32c-out-of-house": (a) => a.set("bass", "lr", false),
  "x32c-dca": (a) => {
    for (const s of ["drums", "bass", "guitars", "keys", "trumpets"]) a.set(s, "dca.d1", true);
    a.st.setBus("dca1", "level", LAWS.level.toPos(-6));
  },
  "x32c-mute-group": (a) => {
    for (const s of ["drums", "guitars", "trumpets"]) a.set(s, "mgrp.g1", true);
    a.st.setBus("mgrp", "g1", true);
  },
  "x32c-new-mix": (a) => {
    a.st.setListen("mix3");
    for (const s of ["guitars", "lead-vocal", "drums"]) a.set(s, "pres.mix3", true);
    a.sendDb("guitars", "mix3", 0);
    a.sendDb("lead-vocal", "mix3", 0);
    a.sendDb("drums", "mix3", -8);
  },
});

Object.assign(WRONG, {
  "x32c-gain": [["the fader up", (a) => a.faderDb("lead-vocal", 10)]],
  "x32c-lr": [["the fader up", (a) => a.nudge("guitars", 6)]],
  "x32c-sof": [["the vocal's house fader up", (a) => {
    a.st.setListen("mix1");
    a.nudge("lead-vocal", 6);
  }]],
  "x32c-drummer-quiet": [["every send up", (a) => {
    a.st.setListen("mix2");
    for (const c of a.mix().channels.filter((c) => c.sourceId && c.aux.mix2.sendDb > -60)) a.st.setChannel(c.index, "sends.mix2", LAWS.level.toPos(c.aux.mix2.sendDb + 10));
  }]],
  "x32c-bus-mute": [["the vocal send up", (a) => {
    a.st.setListen("mix1");
    a.sendDb("lead-vocal", "mix1", 8);
  }]],
  "x32c-reverb": [["the reverb return up", (a) => a.st.setBus("fx1", "level", 1)]],
  "x32c-out-of-house": [["MUTE", (a) => a.set("bass", "enabled", false)]],
  "x32c-dca": [["the channel faders down", (a) => {
    for (const s of ["drums", "bass", "guitars", "keys", "trumpets"]) a.nudge(s, -6);
  }], ["the MAIN LR fader down", (a) => a.st.setBus("main", "level", LAWS.level.toPos(-6))]],
  "x32c-mute-group": [["three channel MUTEs", (a) => {
    for (const s of ["drums", "guitars", "trumpets"]) a.set(s, "enabled", false);
  }]],
  "x32c-new-mix": [["sends left POST", (a) => {
    a.st.setListen("mix3");
    a.sendDb("guitars", "mix3", 0);
    a.sendDb("lead-vocal", "mix3", 0);
    a.sendDb("drums", "mix3", -8);
  }]],
});


// ----- Yamaha 01V96i -----
Object.assign(SOLVE, {
  "yam01v96-doors": (a) => a.st.setChannel(a.tape(), "toMain", true),
  "yam01v96-pad": (a) => {
    a.set("keys", "pad", true);
    a.set("keys", "gainDb", 30);
  },
  "yam01v96-phantom": (a) => {
    for (const i of [0, 1, 2, 3]) a.st.setChannel(i, "phantom", true);
  },
  "yam01v96-on": (a) => a.set("bass", "enabled", true),
  "yam01v96-fader-mode": (a) => {
    a.st.setListen("aux1");
    a.sendDb("lead-vocal", "aux1", 6);
  },
  "yam01v96-master": (a) => {
    a.st.setListen("aux2");
    a.st.setBus("aux2", "level", LAWS.level.toPos(0));
  },
  "yam01v96-eq": (a) => a.set("lead-vocal", "peq.hiMid.gain", -4),
  "yam01v96-to-st": (a) => a.set("guitars", "lr", true),
  "yam01v96-reverb": (a) => {
    a.sendDb("lead-vocal", "aux7", -10);
    a.st.setBus("aux7", "level", LAWS.level.toPos(0));
  },
  "yam01v96-pre-point": (a) => a.st.setBus("auxSetup", "prePoint", "preOn"),
  "yam01v96-comp": (a) => {
    a.set("bass", "compOn", true);
    a.set("bass", "dyn.threshold", -15);
    a.set("bass", "dyn.ratio", 4);
  },
  "yam01v96-new-mix": (a) => {
    a.st.setListen("aux3");
    for (const s of ["guitars", "lead-vocal", "drums"]) a.set(s, "pres.aux3", true);
    a.sendDb("guitars", "aux3", 0);
    a.sendDb("lead-vocal", "aux3", 0);
    a.sendDb("drums", "aux3", -8);
  },
});

Object.assign(WRONG, {
  "yam01v96-doors": [["the STEREO fader up", (a) => a.st.setBus("main", "level", 1)]],
  "yam01v96-pad": [["GAIN down only", (a) => a.set("keys", "gainDb", 16)]],
  "yam01v96-phantom": [["more GAIN", (a) => a.set("drums", "gainDb", 60)]],
  "yam01v96-on": [["the fader up", (a) => a.nudge("bass", 6)]],
  "yam01v96-fader-mode": [["the vocal's fader in HOME mode", (a) => {
    a.st.setListen("aux1");
    a.nudge("lead-vocal", 6);
  }]],
  "yam01v96-eq": [["a cut in the wrong band", (a) => a.set("lead-vocal", "peq.low.gain", -6)]],
  "yam01v96-to-st": [["the fader up", (a) => a.nudge("guitars", 6)]],
  "yam01v96-reverb": [["only the return", (a) => a.st.setBus("aux7", "level", LAWS.level.toPos(0))]],
  "yam01v96-pre-point": [["the channel back ON", (a) => a.set("backing-vocals", "enabled", true)], ["a bigger AUX 1 send", (a) => a.sendDb("backing-vocals", "aux1", 10)]],
  "yam01v96-comp": [
    ["only OUT GAIN", (a) => a.set("bass", "dyn.makeup", 6)],
    ["dialled in but not switched on", (a) => {
      a.set("bass", "dyn.threshold", -15);
      a.set("bass", "dyn.ratio", 4);
    }],
  ],
  "yam01v96-new-mix": [["sends left POST", (a) => {
    a.st.setListen("aux3");
    a.sendDb("guitars", "aux3", 0);
    a.sendDb("lead-vocal", "aux3", 0);
    a.sendDb("drums", "aux3", -8);
  }]],
});


// ----- Behringer X32 (full size) -----
Object.assign(SOLVE, {
  "x32-doors": (a) => a.faderDb("preshow", 0),
  "x32-room": (a) => {
    a.set("room-l", "phantom", true);
    a.set("room-r", "phantom", true);
  },
  "x32-routing-house": (a) => {
    a.st.setBus("routing", "out15", "main-l");
    a.st.setBus("routing", "out16", "main-r");
  },
  "x32-routing-wedge": (a) => {
    a.st.setBus("routing", "out9", "mix1");
    a.st.setListen("mix1");
  },
  "x32-mc": (a) => {
    a.set("lead-vocal", "mc", LAWS.level.toPos(0));
    a.set("backing-vocals", "mc", LAWS.level.toPos(-3));
    a.st.setBus("routing", "out11", "mc");
  },
  "x32-matrix": (a) => {
    a.st.setBus("mtx1", "main", LAWS.level.toPos(0));
    a.st.setBus("routing", "out12", "mtx1");
  },
  "x32-subgroup": (a) => {
    for (const s of ["drums", "bass"]) {
      a.sendDb(s, "mix9", 0);
      a.set(s, "lr", false);
    }
    a.st.setBus("mix9", "lr", true);
    a.st.setBus("mix9", "level", LAWS.level.toPos(-6));
  },
  "x32-fx": (a) => {
    a.sendDb("keys", "mix16", -6);
    a.st.setBus("mix16", "level", LAWS.level.toPos(0));
  },
  "x32-scene-recall": (a) => a.st.recallScene(1),
  "x32-scene-store": (a) => a.st.storeScene(2, "Encore"),
  "x32-bus9": (a) => {
    a.st.setListen("mix10");
    a.st.setBus("mix10", "level", LAWS.level.toPos(0));
  },
});

Object.assign(WRONG, {
  "x32-room": [["more GAIN", (a) => a.set("room-l", "gainDb", 60)]],
  "x32-routing-house": [["MAIN LR fader up", (a) => a.st.setBus("main", "level", 1)], ["only one side", (a) => a.st.setBus("routing", "out15", "main-l")]],
  "x32-routing-wedge": [["MAIN routed to the wedge", (a) => {
    a.st.setBus("routing", "out9", "main-l");
    a.st.setListen("mix1");
  }]],
  "x32-mc": [["M/C routed but nothing sent to it", (a) => a.st.setBus("routing", "out11", "mc")], ["the house routed to the front fill", (a) => {
    a.st.setBus("routing", "out11", "main-l");
  }]],
  "x32-matrix": [["MAIN L straight to the lobby", (a) => a.st.setBus("routing", "out12", "main-l")]],
  "x32-subgroup": [["subgroup, channels still in LR", (a) => {
    for (const s of ["drums", "bass"]) a.sendDb(s, "mix9", 0);
    a.st.setBus("mix9", "lr", true);
    a.st.setBus("mix9", "level", LAWS.level.toPos(-6));
  }], ["channel faders down", (a) => {
    a.nudge("drums", -6);
    a.nudge("bass", -6);
  }]],
  "x32-fx": [["only the return", (a) => a.st.setBus("mix16", "level", LAWS.level.toPos(0))]],
  "x32-scene-recall": [["three mutes by hand", (a) => {
    for (const s of ["drums", "bass", "trumpets"]) a.set(s, "enabled", false);
  }]],
  "x32-scene-store": [["stored over scene 2", (a) => a.st.storeScene(1, "Encore")]],
});

// The CL3 reuses the X32's and 01V96's jobs: the same fixes (and the same mistakes) apply.
const CL3_FROM = { doors: "x32-doors", gain: "x32c-gain", "48v": "x32c-48v", on: "yam01v96-on", "eq-on": "x32-eq-on", "comp-on": "x32-comp-on", sof: "x32c-sof", "routing-house": "x32-routing-house", "routing-wedge": "x32-routing-wedge", dca: "x32c-dca", "mute-group": "x32c-mute-group", matrix: "x32-matrix", fx: "x32-fx", "scene-recall": "x32-scene-recall", "scene-store": "x32-scene-store" };
for (const [k, src] of Object.entries(CL3_FROM)) {
  SOLVE[`cl3-${k}`] = SOLVE[src];
  if (WRONG[src]) WRONG[`cl3-${k}`] = WRONG[src];
}

// The DM2000 reuses the 01V96's and X32's jobs where the fix is the same.
const DM_FROM = { doors: "x32-doors", pad: "yam01v96-pad", "48v": "x32c-48v", on: "yam01v96-on", "fader-mode": "yam01v96-fader-mode", "to-st": "yam01v96-to-st", reverb: "yam01v96-reverb", "scene-recall": "x32-scene-recall", "new-mix": "yam01v96-new-mix" };
for (const [k, src] of Object.entries(DM_FROM)) {
  SOLVE[`dm2000-${k}`] = SOLVE[src];
  if (WRONG[src]) WRONG[`dm2000-${k}`] = WRONG[src];
}
for (const k of ["mud", "eq-on", "comp-on"]) {
  SOLVE[`dm2000-${k}`] = SOLVE[`x32-${k}`];
  WRONG[`dm2000-${k}`] = WRONG[`x32-${k}`];
}
Object.assign(SOLVE, {
  "dm2000-encoder": (a) => {
    a.st.setListen("aux2");
    a.sendDb("bass", "aux2", 4);
  },
  "dm2000-subgroup": (a) => {
    for (const s of ["drums", "bass"]) {
      a.set(s, "sends.bus1", 1);
      a.set(s, "lr", false);
    }
    a.st.setBus("bus1", "lr", true);
    a.st.setBus("bus1", "level", LAWS.level.toPos(-6));
  },
  "dm2000-bus-to-st": (a) => a.st.setBus("bus1", "lr", true),
  "dm2000-fader-group": (a) => {
    a.set("trumpets", "fgrp.a", true);
    a.set("backing-vocals", "fgrp.a", true);
    a.nudge("trumpets", -4);
    a.nudge("backing-vocals", -4);
  },
  "dm2000-mute-group": (a) => {
    for (const s of ["drums", "guitars", "trumpets"]) {
      a.set(s, "mgrp.g1", true);
      a.set(s, "enabled", false);
    }
  },
  "dm2000-output-patch": (a) => {
    a.st.setBus("routing", "out7", "aux1");
    a.st.setListen("aux1");
  },
  "dm2000-matrix": (a) => {
    a.st.setBus("mtx1", "main", LAWS.level.toPos(0));
    a.st.setBus("routing", "out8", "mtx1");
  },
});
Object.assign(WRONG, {
  "dm2000-encoder": [["the bass's fader up", (a) => {
    a.st.setListen("aux2");
    a.nudge("bass", 6);
  }]],
  "dm2000-subgroup": [["the channel faders down", (a) => {
    a.nudge("drums", -6);
    a.nudge("bass", -6);
  }], ["routed to BUS 1 but still on STEREO", (a) => {
    for (const s of ["drums", "bass"]) a.set(s, "sends.bus1", 1);
    a.st.setBus("bus1", "lr", true);
    a.st.setBus("bus1", "level", LAWS.level.toPos(-6));
  }]],
  "dm2000-bus-to-st": [["STEREO back on the channels", (a) => {
    a.set("drums", "lr", true);
    a.set("bass", "lr", true);
  }]],
  "dm2000-fader-group": [["both faders down, not grouped", (a) => {
    a.nudge("trumpets", -4);
    a.nudge("backing-vocals", -4);
  }]],
  "dm2000-mute-group": [["three ON keys by hand", (a) => {
    for (const s of ["drums", "guitars", "trumpets"]) a.set(s, "enabled", false);
  }]],
  "dm2000-output-patch": [["STEREO on OMNI 7", (a) => {
    a.st.setBus("routing", "out7", "main-l");
    a.st.setListen("aux1");
  }]],
  "dm2000-matrix": [["ST L straight to the lobby", (a) => a.st.setBus("routing", "out8", "main-l")]],
});

Object.assign(SOLVE, {
  "f8n-track": (a) => a.set("lead-vocal", "enabled", true),
  "f8n-trim": (a) => a.set("lead-vocal", "gainDb", 46),
  "f8n-room": (a) => {
    a.set("room-l", "phantom", true);
    a.set("room-r", "phantom", true);
  },
  "f8n-hpf": (a) => {
    a.set("lead-vocal", "hpf", 0.4);
    a.set("backing-vocals", "hpf", 0.4);
  },
  "f8n-pfl": (a) => {
    a.set("guitars", "solo", true);
    a.st.setListen("phones");
  },
  "f8n-balance": (a) => a.nudge("drums", -14),
  "f8n-link": (a) => a.st.setBus("link", "mode", "on"),
  "f8n-camera": (a) => ["cam-1", "cam-2"].forEach((id) => a.st.setDevice(id, "inputLevel", 1)),
  "f8n-dslr": (a) => a.st.setDevice("mixer", "subLevel", 1),
  "f8n-iso-safety": (a) => {
    a.set("lead-vocal", "pres.bus2", true);
    a.set("lead-vocal", "sends.bus2", 1);
    a.st.setBus("routing", "out2", "bus2");
  },
});
Object.assign(WRONG, {
  "f8n-track": [["the knob up", (a) => a.nudge("lead-vocal", 10)]],
  "f8n-trim": [["the track knob up instead", (a) => a.nudge("lead-vocal", 20)]],
  "f8n-room": [["only one mic", (a) => a.set("room-l", "phantom", true)]],
  "f8n-hpf": [["HPF on everything", (a) => {
    for (const s of ["lead-vocal", "backing-vocals", "bass"]) a.set(s, "hpf", 0.4);
  }]],
  "f8n-pfl": [["the other knobs down", (a) => {
    for (const s of ["drums", "bass", "keys", "backing-vocals", "lead-vocal"]) a.set(s, "level", 0);
    a.st.setListen("phones");
  }]],
  "f8n-balance": [["the drum TRIM down", (a) => a.set("drums", "gainDb", a.st.state.channels[a.idx("drums")].gainDb - 14)]],
  "f8n-camera": [["the faders down", (a) => {
    for (const s of ["drums", "bass", "guitars", "keys", "backing-vocals", "lead-vocal"]) a.nudge(s, -20);
  }]],
  "f8n-dslr": [["MAIN OUT to NORMAL", (a) => a.st.setDevice("mixer", "mainLevel", 1)]],
  "f8n-iso-safety": [["the vocal postfader", (a) => {
    a.set("lead-vocal", "pres.bus2", false);
    a.set("lead-vocal", "sends.bus2", 1);
    a.st.setBus("routing", "out2", "bus2");
  }], ["the vocal on MAIN OUT 1 instead", (a) => {
    a.set("lead-vocal", "sends.bus1", 1);
    a.st.setBus("routing", "out1", "bus1");
  }]],
});

Object.assign(SOLVE, {
  "cl3-dante": (a) => {
    for (let t = 0; t < 7; t++) a.st.setDevice("daw", `outs.${t}`, t + 1);
    for (let m = 0; m < 7; m++) a.st.setDevice("mixer", `danteRx.${m}`, m + 1);
    for (let m = 0; m < 7; m++) a.st.setDevice("mixer", `inPatch.${m}`, 1);
  },
  "cl3-dante-back": (a) => {
    for (let m = 0; m < 7; m++) a.st.setDevice("mixer", `inPatch.${m}`, 0);
  },
  "cl3-dante-fix": (a) => {
    for (let m = 0; m < 7; m++) a.st.setDevice("mixer", `danteRx.${m}`, m + 1);
  },
});
Object.assign(WRONG, {
  "cl3-dante": [
    ["the DAW outputs only", (a) => {
      for (let t = 0; t < 7; t++) a.st.setDevice("daw", `outs.${t}`, t + 1);
    }],
    ["Dante Controller one channel off", (a) => {
      for (let t = 0; t < 7; t++) a.st.setDevice("daw", `outs.${t}`, t + 1);
      for (let m = 0; m < 7; m++) a.st.setDevice("mixer", `danteRx.${m}`, m + 2);
      for (let m = 0; m < 7; m++) a.st.setDevice("mixer", `inPatch.${m}`, 1);
    }],
    ["routed but the INPUT PATCH left on Rio", (a) => {
      for (let t = 0; t < 7; t++) a.st.setDevice("daw", `outs.${t}`, t + 1);
      for (let m = 0; m < 7; m++) a.st.setDevice("mixer", `danteRx.${m}`, m + 1);
    }],
  ],
  "cl3-dante-back": [["unsubscribe in Dante Controller instead", (a) => {
    for (let m = 0; m < 7; m++) a.st.setDevice("mixer", `danteRx.${m}`, 0);
  }]],
  "cl3-dante-fix": [["move the DAW outputs instead, half way", (a) => {
    for (let t = 0; t < 6; t++) a.st.setDevice("daw", `outs.${t}`, t + 2);
  }]],
});

describe("board scenarios: data", () => {
  it("validate, and every board has at least nine, numbered from 1", () => {
    assert.deepEqual(validateScenarios(), []);
    for (const board of ["mix8", "vlz1202", "mg102", "stagepas400bt", "x1204usb", "sd442", "ui16", "cr1604", "x32c", "yam01v96", "x32"]) {
      const list = scenariosFor(board).filter((s) => s.number > 0);
      assert.ok(list.length >= 9, `${board}: ${list.length}`);
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
