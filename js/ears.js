// Which mix a scenario wants the student to hear, and whether to nudge them
// toward it. Students who understand sends still miss that the listen control
// ("Your ears") picks what they hear, so a wedge scenario heard from Main
// sounds like nothing is changing. Pure: no DOM, no skin.

// Destinations that are never a wedge or monitor mix.
const NOT_MONITOR = new Set(["main", "pfl", "phones", "rec"]);
// Buses a performer hears on stage (not the FX, matrix or centre buses).
const MONITOR_BUS = /^(aux\d+|mix\d+|mon[AB]|monitor|thru)$/;
// Goals that are about what's inside one monitor mix.
const MONITOR_GOALS = new Set(["monitorRaised", "monitorPresent", "monitorLittle", "monitorAbsent", "masterRaised", "busAudible", "sendRaised"]);

// { dest, ok } or null. `dest` is the monitor mix the scenario is about; `ok`
// every listening spot that counts as hearing it (the scenario's own listen
// goals, e.g. Main as well as MIX 1, or headphones soloing the bus).
// `def.ears` (a dest, or [dest, ...also ok]) overrides; `ears: null` opts out.
export function earsTarget(def) {
  if (!def) return null;
  if (def.ears !== undefined) {
    if (!def.ears) return null;
    const ok = [].concat(def.ears);
    return { dest: ok[0], ok };
  }
  const goals = (def.conditions || []).filter((c) => c.kind === "goal");
  const listens = goals.filter((c) => c.type === "listenedTo").map((c) => c.dest);
  const dest = listens.find((d) => !NOT_MONITOR.has(d)) || goals.find((c) => MONITOR_GOALS.has(c.type) && MONITOR_BUS.test(c.bus))?.bus;
  return dest ? { dest, ok: [...new Set([dest, ...listens])] } : null;
}

// The nudge to show while listening at `listen`, or null when the ears are
// already somewhere that counts (or the scenario isn't about a monitor mix).
export function earsNudge(def, listen) {
  const t = earsTarget(def);
  return t && !t.ok.includes(listen) ? t : null;
}

// The nudge's words. `about`: what the mix feeds ("the singer's wedge"), or
// null when it reaches no speaker yet; `target` / `current`: listen labels.
export function earsNudgeText({ about, target, current }) {
  if (!about) return `This one's about ${target}. It doesn't reach a speaker yet: once it does, switch Your ears to ${target} to hear it.`;
  return `This one's about ${about}. You're hearing ${current}: switch Your ears to ${target} to hear what's in it.`;
}
