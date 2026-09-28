// Touch-first mixer controls. Knobs and faders are ARIA sliders with a text
// value; they respond to drag, keyboard, and (when focused) the scroll wheel.
// On touch screens a tap without dragging opens a large fine-adjust sheet, so
// no control depends on precise finger work.

const coarse = () => window.matchMedia("(pointer: coarse)").matches;

let sheet = null;

export class RangeControl {
  // opts: kind "knob" | "fader", label, min, max, step, value, defaultValue,
  // format(v) → text, onInput(v), dragAxis "vertical" | "horizontal",
  // bipolar (arc from centre), marks [{ value, label }] (faders), size, tone
  constructor(opts) {
    this.o = { step: 0.01, dragAxis: "vertical", kind: "knob", ...opts };
    const o = this.o;
    this.value = o.value ?? o.defaultValue ?? o.min;
    this.el = document.createElement("div");
    this.el.className = `ctl ctl-${o.kind}${o.size ? ` ctl-${o.size}` : ""}${o.tone ? ` tone-${o.tone}` : ""}`;
    const id = `ctl-${Math.random().toString(36).slice(2, 8)}`;
    const labelHtml = `<span class="ctl-label" id="${id}">${o.label}</span>`;
    const valueHtml = `<span class="ctl-value" aria-hidden="true"></span>`;
    if (o.kind === "knob") {
      this.el.innerHTML = `${labelHtml}
        <div class="knob" role="slider" tabindex="0" aria-labelledby="${id}" aria-valuemin="${o.min}" aria-valuemax="${o.max}">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path class="knob-track" d="${arcPath(0, 1)}" />
            <path class="knob-arc" d="" />
            <circle class="knob-cap" cx="24" cy="24" r="14" />
            <line class="knob-pointer" x1="24" y1="24" x2="24" y2="12" />
          </svg>
        </div>${valueHtml}`;
      this.handle = this.el.querySelector(".knob");
      this.arc = this.el.querySelector(".knob-arc");
      this.pointer = this.el.querySelector(".knob-pointer");
    } else {
      const marks = (o.marks || [])
        .map((m) => `<span class="fader-mark" style="--pos:${this.frac(m.value)}">${m.label}</span>`)
        .join("");
      this.el.innerHTML = `${valueHtml}
        <div class="fader" role="slider" tabindex="0" aria-labelledby="${id}" aria-orientation="vertical" aria-valuemin="${o.min}" aria-valuemax="${o.max}">
          <div class="fader-marks" aria-hidden="true">${marks}</div>
          <div class="fader-slot"></div>
          <div class="fader-cap"><span></span></div>
        </div>${labelHtml}`;
      this.handle = this.el.querySelector(".fader");
      this.cap = this.el.querySelector(".fader-cap");
    }
    this.valueEl = this.el.querySelector(".ctl-value");
    this.handle.style.touchAction = o.kind === "fader" || o.dragAxis === "vertical" ? "pan-x" : "pan-y";
    this.bind();
    this.render();
  }

  frac(v = this.value) {
    return (v - this.o.min) / (this.o.max - this.o.min);
  }

  setValue(v, silent = true) {
    const o = this.o;
    const stepped = Math.round((Math.min(o.max, Math.max(o.min, v)) - o.min) / o.step) * o.step + o.min;
    const next = Number(stepped.toFixed(6));
    if (next === this.value) return;
    this.value = next;
    this.render();
    if (!silent) o.onInput(next);
  }

  render() {
    const f = this.frac();
    const text = this.o.format(this.value);
    this.valueEl.textContent = text;
    this.handle.setAttribute("aria-valuenow", String(this.value));
    this.handle.setAttribute("aria-valuetext", text);
    if (this.o.kind === "knob") {
      const from = this.o.bipolar ? 0.5 : 0;
      this.arc.setAttribute("d", Math.abs(f - from) < 0.005 ? "" : arcPath(Math.min(from, f), Math.max(from, f)));
      this.pointer.setAttribute("transform", `rotate(${-135 + f * 270} 24 24)`);
    } else {
      this.cap.style.setProperty("--pos", f);
    }
  }

  bind() {
    const h = this.handle;
    let drag = null;
    // Moves and releases are tracked on window for the life of a drag, so a
    // quick flick that leaves a small knob still lands (pointer capture is
    // requested too, but isn't relied on).
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = drag.y - e.clientY; // up = more
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
      }
      let delta;
      if (drag.type === "mouse") delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      else delta = this.o.kind === "fader" || this.o.dragAxis === "vertical" ? dy : dx;
      const span = this.o.kind === "fader" ? h.clientHeight * 0.86 : 180;
      const fine = e.shiftKey ? 0.2 : 1;
      this.setValue(drag.start + (delta / span) * (this.o.max - this.o.min) * fine, false);
    };
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (e.type === "pointerup") move(e);
      const tapped = !drag.moved && e.type === "pointerup";
      drag = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      this.el.classList.remove("active");
      if (tapped && coarse()) openFineSheet(this);
    };
    h.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || drag) return;
      drag = { x: e.clientX, y: e.clientY, start: this.value, moved: false, type: e.pointerType, id: e.pointerId };
      try {
        h.setPointerCapture(e.pointerId);
      } catch (err) {
        /* window listeners cover it */
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      this.el.classList.add("active");
    });
    h.addEventListener("dblclick", () => {
      if (this.o.defaultValue !== undefined) this.setValue(this.o.defaultValue, false);
    });
    h.addEventListener("keydown", (e) => {
      const o = this.o;
      const big = (o.max - o.min) / 10;
      const map = { ArrowUp: o.step, ArrowRight: o.step, ArrowDown: -o.step, ArrowLeft: -o.step, PageUp: big, PageDown: -big };
      if (e.key in map) {
        e.preventDefault();
        this.setValue(this.value + map[e.key] * (o.keyStepMul || 1), false);
      } else if (e.key === "Home") {
        e.preventDefault();
        this.setValue(o.min, false);
      } else if (e.key === "End") {
        e.preventDefault();
        this.setValue(o.max, false);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFineSheet(this);
      }
    });
    h.addEventListener(
      "wheel",
      (e) => {
        if (document.activeElement !== h) return;
        e.preventDefault();
        const dir = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? -e.deltaY : e.deltaX) > 0 ? 1 : -1;
        this.setValue(this.value + dir * this.o.step * (this.o.keyStepMul || 1), false);
      },
      { passive: false },
    );
  }
}

// 270° arc from 7:30 to 4:30, parameterised 0…1.
function arcPath(a, b) {
  const r = 20;
  const ang = (t) => ((-135 + t * 270 - 90) * Math.PI) / 180;
  const p = (t) => [24 + r * Math.cos(ang(t)), 24 + r * Math.sin(ang(t))];
  const [x1, y1] = p(a);
  const [x2, y2] = p(b);
  const large = (b - a) * 270 > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

// ---------- fine-adjust sheet ----------

function openFineSheet(control) {
  if (!sheet) sheet = createSheet();
  sheet.open(control);
}

function createSheet() {
  const dlg = document.createElement("dialog");
  dlg.className = "fine-sheet";
  dlg.innerHTML = `
    <form method="dialog" class="fine-inner">
      <p class="fine-label"></p>
      <p class="fine-value" aria-live="polite"></p>
      <div class="fine-row">
        <button type="button" class="btn-round" data-dir="-1" aria-label="Down">−</button>
        <input type="range" class="big-slider" min="0" max="1000" step="1" />
        <button type="button" class="btn-round" data-dir="1" aria-label="Up">+</button>
      </div>
      <div class="fine-actions">
        <button type="button" class="chip fine-reset">Reset</button>
        <button type="submit" class="btn btn-start">Done</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const label = dlg.querySelector(".fine-label");
  const value = dlg.querySelector(".fine-value");
  const range = dlg.querySelector("input");
  const resetBtn = dlg.querySelector(".fine-reset");
  let ctl = null;
  const sync = () => {
    value.textContent = ctl.o.format(ctl.value);
    range.value = String(Math.round(ctl.frac() * 1000));
    range.setAttribute("aria-valuetext", ctl.o.format(ctl.value));
  };
  range.addEventListener("input", () => {
    const o = ctl.o;
    ctl.setValue(o.min + (Number(range.value) / 1000) * (o.max - o.min), false);
    sync();
  });
  dlg.querySelectorAll("[data-dir]").forEach((b) =>
    b.addEventListener("click", () => {
      ctl.setValue(ctl.value + Number(b.dataset.dir) * ctl.o.step * (ctl.o.keyStepMul || 1), false);
      sync();
    }),
  );
  resetBtn.addEventListener("click", () => {
    if (ctl.o.defaultValue !== undefined) ctl.setValue(ctl.o.defaultValue, false);
    sync();
  });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener("close", () => ctl && ctl.handle.focus({ preventScroll: true }));
  return {
    open(control) {
      ctl = control;
      label.textContent = control.o.sheetLabel || control.o.label;
      resetBtn.hidden = control.o.defaultValue === undefined;
      sync();
      dlg.showModal();
      range.focus();
    },
  };
}

// ---------- buttons ----------

// A lit/unlit hardware-style button. `lit` is presentation; the caller maps
// it to semantic state (e.g. MUTE lit ⇔ enabled === false).
export class LitButton {
  constructor({ label, tone = "neutral", onPress, title, small = false }) {
    this.el = document.createElement("button");
    this.el.type = "button";
    this.el.className = `lit-btn tone-${tone}${small ? " small" : ""}`;
    this.el.innerHTML = `<span class="lit-led" aria-hidden="true"></span><span class="lit-text">${label}</span>`;
    if (title) this.el.title = title;
    this.el.addEventListener("click", () => onPress());
    this.lit = null;
  }

  setLit(lit, ariaLabel) {
    if (lit === this.lit && !ariaLabel) return;
    this.lit = lit;
    this.el.classList.toggle("lit", lit);
    this.el.setAttribute("aria-pressed", String(lit));
    if (ariaLabel) this.el.setAttribute("aria-label", ariaLabel);
  }
}
