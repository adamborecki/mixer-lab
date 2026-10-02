// The signal-flow explainer, drawn with the current skin's words. Makes the
// V1 conventions visible: Aux 1 is pre-fader, PFL is pre-fader, and the
// enable (MUTE/ON) switch only affects the Main path.

import { COMPACT } from "../compact-defs.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function renderFlow(root, skin) {
  if (skin.layout === "cr1604") return renderFlow1604(root, skin);
  if (skin.layout === "compact") return renderFlowCompact(root, skin, COMPACT[skin.hardware]);
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

// A compact mixer, described from its definition: what each send hears.
function renderFlowCompact(root, skin, def) {
  const tapWord = { pre: "before the channel LEVEL (pre-fader)", post: "after the channel LEVEL (post-fader)", switch: "pre- or post-fader, by the PRE switch beside its master" };
  const sends = Object.values(def.sends).map((s) =>
    s.bipolar
      ? `<li><strong>${esc(s.label)}</strong>: one knob. Left of centre feeds ${esc(def.buses[s.bipolar.left.bus].label)} (${tapWord[s.bipolar.left.tap]}); right feeds ${esc(def.buses[s.bipolar.right.bus].label)} (${tapWord[s.bipolar.right.tap]}). A channel can feed one or the other, not both.</li>`
      : `<li><strong>${esc(s.label)}</strong> is taken ${tapWord[s.tap]}.${s.bus === "reverb" ? " It feeds the built-in reverb." : ""}</li>`,
  );
  const notes = [
    def.channels.some((c) => c.gain.switch) ? "<li>There is no gain knob: the MIC/LINE switch sets the input gain, and each channel LEVEL does the rest.</li>" : "<li><strong>GAIN/TRIM</strong> sets how hot the signal is; the channel LEVEL sets how much goes to the mix.</li>",
    ...sends,
    def.alt ? "<li><strong>MUTE/ALT 3-4</strong> takes a channel out of MAIN and puts it on the ALT 3-4 bus (its own outputs, or back into MAIN with ASSIGN TO MAIN).</li>" : "",
    def.solo ? "<li><strong>SOLO</strong> is PFL: the channel before its LEVEL, in the C-R/PHONES and the meters.</li>" : "",
    def.monitorOut ? "<li><strong>MONITOR OUT</strong> carries the whole mix (no per-channel monitor sends) and ignores MASTER LEVEL.</li>" : "",
    def.poweredAmp ? `<li>The amplifier is <strong>inside the mixer</strong>: SPEAKERS L/R carry speaker level, straight into the passive STAGEPAS speakers. Never into a powered speaker or a line input.</li>` : "<li>The outputs are line level. A speaker only makes sound if an amplifier is somewhere in the chain: inside it (powered) or in front of it (passive + power amp).</li>",
  ];
  root.innerHTML = `
    <details class="flow">
      <summary>How the signal flows on the ${esc(skin.name)}</summary>
      <div class="flow-body">
        <ol class="flow-trunk" aria-label="Every channel">
          <li class="flow-node">Input jack</li>
          <li class="flow-node">${def.channels.some((c) => c.gain.switch) ? "MIC/LINE" : "GAIN"}</li>
          <li class="flow-node">EQ</li>
          <li class="flow-node">LEVEL</li>
          <li class="flow-node">${def.channels.some((c) => c.kind === "stereo") ? "PAN / BAL" : "PAN"}</li>
          <li class="flow-node flow-end">${esc(def.main.label)} → ${def.poweredAmp ? "amp → speakers" : "MAIN OUT"}</li>
        </ol>
        <ul class="flow-notes">${notes.join("")}</ul>
      </div>
    </details>`;
}
