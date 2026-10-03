// The signal-flow explainer, drawn with the current skin's words. Makes the
// V1 conventions visible: Aux 1 is pre-fader, PFL is pre-fader, and the
// enable (MUTE/ON) switch only affects the Main path.

import { COMPACT } from "../compact-defs.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function renderFlow(root, skin) {
  if (skin.layout === "cr1604") return renderFlow1604(root, skin);
  if (skin.layout === "compact") return renderFlowCompact(root, skin, COMPACT[skin.hardware]);
  if (skin.layout === "digital") return renderFlowDigital(root, skin, COMPACT[skin.hardware]);
  const t = skin.terms;
  const c = skin.enabledControl;
  const enableWord = c.litWhenEnabled ? `${c.label} (lit = in Main)` : `${c.label} (lit = out of Main)`;
  root.innerHTML = `
    <details class="flow">
      <summary>How the signal flows on ${esc(skin.name)}</summary>
      <div class="flow-body">
        <ol class="flow-trunk" aria-label="Every channel">
          <li class="flow-node">Source</li>
          <li class="flow-node">${esc(t.gain)} <small>preamp</small></li>
          <li class="flow-node">Meter</li>
          <li class="flow-split">splits four ways</li>
        </ol>
        <div class="flow-branches">
          <ol class="flow-branch branch-main" aria-label="Main path">
            <li class="flow-node">${esc(enableWord)}</li>
            <li class="flow-node">${esc(t.levelShort)}</li>
            <li class="flow-node">${esc(t.pan)}</li>
            <li class="flow-node">Main L/R bus → ${esc(t.mainShort)} master</li>
            <li class="flow-node flow-end">House speakers</li>
          </ol>
          <ol class="flow-branch branch-aux" aria-label="Monitor path 1">
            <li class="flow-node">${esc(t.aux1)} send <small>pre-fader</small></li>
            <li class="flow-node">${esc(t.aux1)} bus → ${esc(t.aux1Master)}</li>
            <li class="flow-node flow-end">A wedge (e.g. the singer's)</li>
          </ol>
          <ol class="flow-branch branch-aux" aria-label="Monitor path 2">
            <li class="flow-node">${esc(t.aux2)} send <small>pre-fader</small></li>
            <li class="flow-node">${esc(t.aux2)} bus → ${esc(t.aux2Master)}</li>
            <li class="flow-node flow-end">Another wedge (e.g. the drummer's)</li>
          </ol>
          <ol class="flow-branch branch-pfl" aria-label="Headphone path">
            <li class="flow-node">${esc(t.pfl)} <small>pre-fader</small></li>
            <li class="flow-node">${esc(t.phones)} level</li>
            <li class="flow-node flow-end">Engineer's headphones</li>
          </ol>
        </div>
        <ul class="flow-notes">
          <li><strong>${esc(t.gain)}</strong> changes everything after it: meter, Main, ${esc(t.aux1)}, ${esc(t.aux2)} and PFL.</li>
          <li>The <strong>${esc(t.levelShort)}</strong> and <strong>${esc(c.label)}</strong> only change the Main (audience) path. In this lab the ${esc(t.aux1)} and ${esc(t.aux2)} sends and PFL are taken <em>before</em> them, so a muted channel can still be in the wedges. Real mixers vary — check yours.</li>
          <li>Each monitor bus is its own mix: the same channel can be loud in one wedge and quiet in the other.</li>
          <li>The mixer's outputs are line level. A speaker only makes sound if an amplifier is somewhere in the chain: inside it (powered) or in front of it (passive + power amp).</li>
        </ul>
      </div>
    </details>`;
}

// The CR1604-VLZ, after its owner's manual. Unlike the generic mixer, AUX 1
// and 2 are post-fader unless PRE is pressed, and SOLO has two modes.
function renderFlow1604(root, skin) {
  root.innerHTML = `
    <details class="flow">
      <summary>How the signal flows on the ${esc(skin.name)}</summary>
      <div class="flow-body">
        <ol class="flow-trunk" aria-label="Every channel">
          <li class="flow-node">MIC or LINE jack</li>
          <li class="flow-node">TRIM <small>preamp</small></li>
          <li class="flow-node">LOW CUT</li>
          <li class="flow-node">EQ <small>HI · MID · LOW</small></li>
          <li class="flow-node">MUTE</li>
          <li class="flow-node">Fader</li>
          <li class="flow-node">PAN</li>
          <li class="flow-split">assign: L-R, 1-2, 3-4</li>
        </ol>
        <div class="flow-branches">
          <ol class="flow-branch branch-main" aria-label="Main path">
            <li class="flow-node">L-R</li>
            <li class="flow-node">MAIN L-R MIX fader</li>
            <li class="flow-node flow-end">MAIN OUTS (and MONO)</li>
          </ol>
          <ol class="flow-branch branch-aux" aria-label="Subgroups">
            <li class="flow-node">1-2 or 3-4 <small>odd = left, even = right</small></li>
            <li class="flow-node">SUB faders</li>
            <li class="flow-node flow-end">SUB OUTS, or back into MAIN with ASSIGN TO MAIN MIX</li>
          </ol>
          <ol class="flow-branch branch-aux" aria-label="Aux sends">
            <li class="flow-node">AUX 1, 2 <small>post, or PRE: after LOW CUT, before EQ, MUTE and fader</small></li>
            <li class="flow-node">AUX 3/4 <small>always post; 5/6 SHIFT moves them to 5/6</small></li>
            <li class="flow-node flow-end">AUX SEND outs (masters on 1 and 2 only)</li>
          </ol>
          <ol class="flow-branch branch-pfl" aria-label="Headphone path">
            <li class="flow-node">SOURCE: MAIN MIX, SUBS, TAPE</li>
            <li class="flow-node">SOLO replaces it <small>LEVEL SET (PFL): before the fader · NORMAL (AFL): after fader and pan</small></li>
            <li class="flow-node flow-end">C-R/PHONES knob → C-R OUTS, PHONES</li>
          </ol>
        </div>
        <ul class="flow-notes">
          <li><strong>TRIM</strong> changes everything after it. Set it with SOLO in LEVEL SET (PFL) mode while watching the meters: soloed, the channel shows on the left meter.</li>
          <li><strong>MUTE</strong> cuts L-R, the subgroups and the post sends. PRE sends and LEVEL SET (PFL) solo keep working, so a muted channel can still be in a wedge.</li>
          <li>For stage monitors use AUX 1 or 2 with <strong>PRE</strong> down: the wedge mix then ignores the fader. Effects sends stay post, so the reverb follows the fader.</li>
          <li>A channel only reaches the house if <strong>L-R</strong> is pressed (or it goes through a subgroup that is assigned to the main mix).</li>
          <li>The outputs are line level. A speaker only makes sound if an amplifier is somewhere in the chain: inside it (powered) or in front of it (passive + power amp).</li>
        </ul>
      </div>
    </details>`;
}

// A digital mixer (Ui16): the same signal flow, reached through pages and SEL.
function renderFlowDigital(root, skin, def) {
  root.innerHTML = `
    <details class="flow">
      <summary>How the signal flows on the ${esc(skin.name)}</summary>
      <div class="flow-body">
        <ol class="flow-trunk" aria-label="Every channel">
          <li class="flow-node">Input jack</li>
          <li class="flow-node">GAIN</li>
          <li class="flow-node">HPF</li>
          <li class="flow-node">COMP</li>
          <li class="flow-node">EQ</li>
          <li class="flow-node">MUTE</li>
          <li class="flow-node">FADER</li>
          <li class="flow-node">PAN</li>
          <li class="flow-node flow-end">MASTER → XLR OUT</li>
        </ol>
        <ul class="flow-notes">
          <li>There are no knobs per channel. <strong>SEL</strong> a channel and its GAIN, HPF, EQ, compressor, pan and sends all show in one panel.</li>
          <li>The bar above the faders picks <strong>what the faders control</strong>: MIX (each channel into the MASTER), GAIN, or a mix such as <strong>AUX 1</strong>, where each fader is that channel's send into AUX 1 ("sends on faders"). The right-hand fader is always that mix's master.</li>
          <li>Aux sends start <strong>PRE</strong> (they ignore the MIX faders, right for wedges). Press PRE to make a send POST, so it follows the fader.</li>
          <li><strong>MUTE</strong> takes a channel out of every mix, wedges included.</li>
          <li>REVERB, DELAY and CHORUS are built in: their pages set the sends, their master is how much comes back into the MASTER mix.</li>
          <li>The outputs are line level on XLR: ${Object.values(def.buses).filter((b) => !b.fx).length} AUX outs and MASTER L/R. A speaker only makes sound if an amplifier is somewhere in the chain.</li>
        </ul>
      </div>
    </details>`;
}

// A compact mixer, described from its definition: what each send hears.
function renderFlowCompact(root, skin, def) {
  const tapWord = {
    pre: "before the channel LEVEL (pre-fader)",
    post: "after the channel LEVEL (post-fader)",
    switch: "pre- or post-fader, by the PRE switch beside its master",
    channel: "pre- or post-fader, by the PRE switch on each channel (post-fader, MUTE/ALT 3-4 cuts it too)",
    fader: "after the channel fader, but MUTE/ALT 3-4 doesn't cut it",
  };
  const sends = Object.values(def.sends).map((s) =>
    s.bipolar
      ? `<li><strong>${esc(s.label)}</strong>: one knob. Left of centre feeds ${esc(def.buses[s.bipolar.left.bus].label)} (${tapWord[s.bipolar.left.tap]}); right feeds ${esc(def.buses[s.bipolar.right.bus].label)} (${tapWord[s.bipolar.right.tap]}). A channel can feed one or the other, not both.</li>`
      : `<li><strong>${esc(s.label)}</strong> is taken ${tapWord[s.tap]}.${s.bus === "reverb" ? " It feeds the built-in reverb." : def.fx && s.bus === def.fx.send ? " Through its master (AUX SEND 2) it feeds the built-in effects, which come back on STEREO AUX RETURN 2." : ""}</li>`,
  );
  const notes = [
    def.field ? "" : def.channels.some((c) => c.gain.switch) ? "<li>There is no gain knob: the MIC/LINE switch sets the input gain, and each channel LEVEL does the rest.</li>" : "<li><strong>GAIN/TRIM</strong> sets how hot the signal is; the channel LEVEL sets how much goes to the mix.</li>",
    ...sends,
    def.channels.some((c) => c.comp) ? "<li><strong>COMP</strong> is a one-knob compressor: turn it up and loud peaks are pulled down (the LED lights while it works) and quiet parts come up.</li>" : "",
    def.channels.some((c) => c.gain.minus10) ? "<li>The stereo channels have a <strong>+4 dBu / −10 dBV</strong> switch: −10 is 12 dB more sensitive, for consumer gear such as a laptop or phone.</li>" : "",
    def.returns?.some((r) => r.toMonitor) ? "<li><strong>RETURN 1 MON</strong> puts an effects return into AUX 1, so the singer can have reverb in the wedge.</li>" : "",
    def.alt?.fader
      ? "<li><strong>MUTE/ALT 3-4</strong> takes a channel out of MAIN MIX and puts it on the ALT 3-4 bus, with its own fader and outputs (and the C-R SOURCE ALT 3-4).</li>"
      : def.alt
        ? "<li><strong>MUTE/ALT 3-4</strong> takes a channel out of MAIN and puts it on the ALT 3-4 bus (its own outputs, or back into MAIN with ASSIGN TO MAIN).</li>"
        : "",
    def.solo?.mode === "switch"
      ? "<li><strong>SOLO</strong> puts a channel in the PHONES/CTRL R and the meters: with <strong>MODE</strong> on PFL, before the fader (for setting TRIM); otherwise in place, after the fader and pan. The AUX SEND masters have SOLO switches too, to check a monitor mix.</li>"
      : def.solo
        ? "<li><strong>SOLO</strong> is PFL: the channel before its LEVEL, in the C-R/PHONES and the meters.</li>"
        : "",
    def.monitorOut ? "<li><strong>MONITOR OUT</strong> carries the whole mix (no per-channel monitor sends) and ignores MASTER LEVEL.</li>" : "",
    def.field ? "<li>Two gain stages: <strong>GAIN</strong> (+22…+60 dB, MIC/LINE takes 40 dB off) is set once, then you mix on the <strong>FADER</strong>, whose centre is 0 dB (it goes up to +15).</li>" : "",
    def.channels.some((c) => c.hpf) ? "<li><strong>HPF</strong> sweeps from 80 to 240 Hz (off at the detent): wind, rumble, and a close mic's boom.</li>" : "",
    def.outputLimiter ? "<li><strong>LIM</strong> turns on a safety limiter on every input and on the outputs: ON limits left and right apart, LINK as one stereo pair. The LEDs show it working; if they light a lot, turn the GAIN or faders down.</li>" : "",
    def.link ? "<li><strong>1+2 LINK</strong> makes channels 1 and 2 one stereo pair: channel 1's fader runs both, its PAN becomes a balance, and 1 goes left, 2 right. <strong>Ø</strong> flips channel 2's polarity: listen in <strong>M</strong> (mono) to hear what that does to a pair.</li>" : "",
    def.outLevel ? "<li>The XLR outputs carry <strong>MIC, −10 or LINE</strong> level. The camera's input switch must match: line into a MIC input distorts; mic into a LINE input is 40 dB too quiet.</li>" : "",
    def.tone ? "<li><strong>TONE</strong> puts a 1 kHz sine at 0 dBu on the outputs (instead of the mix) to line up the next device's meters; the headphones get it 20 dB down.</li>" : "",
    def.poweredAmp ? `<li>The amplifier is <strong>inside the mixer</strong>: SPEAKERS L/R carry speaker level, straight into the passive STAGEPAS speakers. Never into a powered speaker or a line input.</li>` : def.outLevel ? "" : "<li>The outputs are line level. A speaker only makes sound if an amplifier is somewhere in the chain: inside it (powered) or in front of it (passive + power amp).</li>",
  ];
  root.innerHTML = `
    <details class="flow">
      <summary>How the signal flows on the ${esc(skin.name)}</summary>
      <div class="flow-body">
        <ol class="flow-trunk" aria-label="Every channel">
          <li class="flow-node">Input jack</li>
          <li class="flow-node">${def.channels.some((c) => c.gain.switch) ? "MIC/LINE" : "GAIN"}</li>
          ${def.channels.some((c) => c.hpf) ? '<li class="flow-node">HPF</li><li class="flow-node">LIMITER</li>' : '<li class="flow-node">EQ</li>'}
          <li class="flow-node">${def.levelLaw || def.layout.level === "fader" ? "FADER" : "LEVEL"}</li>
          <li class="flow-node">${def.channels.some((c) => c.kind === "stereo") ? "PAN / BAL" : "PAN"}</li>
          <li class="flow-node flow-end">${esc(def.main.label)} → ${def.poweredAmp ? "amp → speakers" : def.outLevel ? "XLR OUT (MIC/−10/LINE)" : "MAIN OUT"}</li>
        </ol>
        <ul class="flow-notes">${notes.join("")}</ul>
      </div>
    </details>`;
}
