// The signal-flow explainer, drawn with the current skin's words. Makes the
// V1 conventions visible: Aux 1 is pre-fader, PFL is pre-fader, and the
// enable (MUTE/ON) switch only affects the Main path.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function renderFlow(root, skin) {
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
          <li class="flow-split">splits three ways</li>
        </ol>
        <div class="flow-branches">
          <ol class="flow-branch branch-main" aria-label="Main path">
            <li class="flow-node">${esc(enableWord)}</li>
            <li class="flow-node">${esc(t.levelShort)}</li>
            <li class="flow-node">${esc(t.pan)}</li>
            <li class="flow-node">Main L/R bus → ${esc(t.mainShort)} master</li>
            <li class="flow-node flow-end">House speakers</li>
          </ol>
          <ol class="flow-branch branch-aux" aria-label="Monitor path">
            <li class="flow-node">${esc(t.aux)} send <small>pre-fader</small></li>
            <li class="flow-node">${esc(t.aux)} bus → ${esc(t.auxMaster)}</li>
            <li class="flow-node flow-end">Stage wedge</li>
          </ol>
          <ol class="flow-branch branch-pfl" aria-label="Headphone path">
            <li class="flow-node">${esc(t.pfl)} <small>pre-fader</small></li>
            <li class="flow-node">${esc(t.phones)} level</li>
            <li class="flow-node flow-end">Engineer's headphones</li>
          </ol>
        </div>
        <ul class="flow-notes">
          <li><strong>${esc(t.gain)}</strong> changes everything after it: meter, Main, ${esc(t.aux)} and PFL.</li>
          <li>The <strong>${esc(t.levelShort)}</strong> and <strong>${esc(c.label)}</strong> only change the Main (audience) path. In this lab the ${esc(t.aux)} send and PFL are taken <em>before</em> them, so a muted channel can still be in the wedge. Real mixers vary — check yours.</li>
          <li>The mixer's outputs are line level. A speaker only makes sound if an amplifier is somewhere in the chain: inside it (powered) or in front of it (passive + power amp).</li>
        </ul>
      </div>
    </details>`;
}
