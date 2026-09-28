// Renders the mixer surface for the current skin. Every control writes
// through MixerStore actions; nothing here knows about audio nodes.

import { RangeControl, LitButton } from "./controls.js";
import { MeterView } from "../meters.js";
import { enabledLit, enabledAfterPress, enabledStatusText, globalPhantomState } from "../mixer-models.js";
import { GAIN_MAX_DB, GAIN_MIN_DB, dbToLevel, formatDb, formatPan, levelToDb } from "../mixer-state.js";

const FADER_MARKS = [10, 5, 0, -5, -10, -20, -30, -50].map((db) => ({ value: dbToLevel(db), label: db === 0 ? "U" : db > 0 ? `+${db}` : `${db}` }));
FADER_MARKS.push({ value: 0, label: "−∞" });

const levelFormat = (v) => formatDb(levelToDb(v), { unity: true });
const sendFormat = (v) => formatDb(levelToDb(v), { unity: true });

export class MixerView {
  constructor(root, { store, skin, manifest, onPatchChannel }) {
    this.root = root;
    this.store = store;
    this.skin = skin;
    this.manifest = manifest;
    this.onPatchChannel = onPatchChannel;
    this.bindings = [];
    this.channelMeters = [];
    this.render();
  }

  setSkin(skin) {
    this.skin = skin;
    this.render();
  }

  // ---------- building ----------

  render() {
    const skin = this.skin;
    this.bindings = [];
    this.channelMeters = [];
    this.root.innerHTML = "";
    this.root.className = `mixer skin-${skin.id}`;
    this.root.dataset.skin = skin.id;

    const surface = document.createElement("div");
    surface.className = "mixer-surface";
    const strips = document.createElement("div");
    strips.className = "mixer-strips";
    strips.setAttribute("role", "group");
    strips.setAttribute("aria-label", "Channels");
    this.store.state.channels.forEach((ch, i) => strips.appendChild(this.buildStrip(i)));
    surface.appendChild(strips);
    surface.appendChild(this.buildMaster());
    this.root.appendChild(surface);
    this.sync();
  }

  bind(control, get, kind = "range") {
    this.bindings.push({ control, get, kind });
    return control;
  }

  knob(opts) {
    return new RangeControl({ kind: "knob", dragAxis: this.skin.dragAxis, ...opts });
  }

  buildStrip(i) {
    const skin = this.skin;
    const t = skin.terms;
    const store = this.store;
    const el = document.createElement("section");
    el.className = "strip";
    el.dataset.channel = String(i + 1);
    el.setAttribute("aria-label", `Channel ${i + 1}`);

    const head = document.createElement("button");
    head.type = "button";
    head.className = "strip-head";
    head.addEventListener("click", () => this.onPatchChannel(i));
    el.appendChild(head);
    this.bindings.push({ kind: "head", el: head, index: i });

    const parts = {
      phantom: () => {
        const b = new LitButton({ label: t.phantom, tone: "phantom", small: true, onPress: () => store.setChannel(i, "phantom", !store.state.channels[i].phantom) });
        this.bindings.push({ kind: "button", control: b, get: (s) => [s.channels[i].phantom, `${t.phantom} phantom power, channel ${i + 1}: ${s.channels[i].phantom ? "on" : "off"}`] });
        return b.el;
      },
      gain: () =>
        this.bind(
          this.knob({
            label: t.gain,
            sheetLabel: `Ch ${i + 1} ${t.gain}`,
            min: GAIN_MIN_DB,
            max: GAIN_MAX_DB,
            step: 0.5,
            keyStepMul: 2,
            defaultValue: GAIN_MIN_DB,
            tone: "gain",
            format: (v) => `+${Math.round(v)} dB`,
            onInput: (v) => store.setChannel(i, "gainDb", v),
          }),
          (s) => s.channels[i].gainDb,
        ).el,
      aux: () =>
        this.bind(
          this.knob({
            label: t.aux,
            sheetLabel: `Ch ${i + 1} ${t.aux} send`,
            min: 0,
            max: 1,
            step: 0.005,
            keyStepMul: 2,
            defaultValue: 0,
            tone: "aux",
            format: sendFormat,
            onInput: (v) => store.setSend(i, "aux1", v),
          }),
          (s) => s.channels[i].auxSends.aux1,
        ).el,
      pan: () =>
        this.bind(
          this.knob({
            label: t.pan,
            sheetLabel: `Ch ${i + 1} ${t.pan}`,
            min: -1,
            max: 1,
            step: 0.02,
            defaultValue: 0,
            bipolar: true,
            tone: "pan",
            format: formatPan,
            onInput: (v) => store.setChannel(i, "pan", v),
          }),
          (s) => s.channels[i].pan,
        ).el,
      pfl: () => {
        const b = new LitButton({ label: t.pfl, tone: "pfl", onPress: () => store.setChannel(i, "pfl", !store.state.channels[i].pfl) });
        this.bindings.push({ kind: "button", control: b, get: (s) => [s.channels[i].pfl, `${t.pfl} channel ${i + 1}: ${s.channels[i].pfl ? "on" : "off"}`] });
        return b.el;
      },
      enabled: () => {
        const c = skin.enabledControl;
        const b = new LitButton({
          label: c.label,
          tone: c.litWhenEnabled ? "on" : "mute",
          onPress: () => store.setChannel(i, "enabled", enabledAfterPress(skin, store.state.channels[i].enabled)),
        });
        this.bindings.push({
          kind: "button",
          control: b,
          get: (s) => {
            const en = s.channels[i].enabled;
            return [enabledLit(skin, en), `${c.label} channel ${i + 1} — channel ${en ? "on in Main" : "muted from Main"}`];
          },
        });
        return b.el;
      },
      meter: () => {
        const m = new MeterView({
          marks: skin.meter.marks,
          orientation: skin.meter.orientation,
          label: `Channel ${i + 1} input`,
          showBand: true,
        });
        m.el.classList.add(`meter-${skin.meter.style}`);
        this.channelMeters[i] = m;
        return m.el;
      },
      level: () => {
        const ctl =
          skin.levelControl === "fader"
            ? new RangeControl({
                kind: "fader",
                label: t.levelShort,
                sheetLabel: `Ch ${i + 1} ${t.levelShort}`,
                min: 0,
                max: 1,
                step: 0.005,
                keyStepMul: 2,
                defaultValue: 0.75,
                marks: FADER_MARKS,
                format: levelFormat,
                onInput: (v) => store.setChannel(i, "level", v),
              })
            : this.knob({
                label: t.levelShort,
                sheetLabel: `Ch ${i + 1} ${t.levelShort}`,
                min: 0,
                max: 1,
                step: 0.005,
                keyStepMul: 2,
                defaultValue: 0.75,
                size: "big",
                tone: "level",
                format: levelFormat,
                onInput: (v) => store.setChannel(i, "level", v),
              });
        return this.bind(ctl, (s) => s.channels[i].level).el;
      },
    };

    // Placement comes from the skin's data: sections of rows of parts.
    const perChannelPhantom = skin.phantomControl === "per-channel";
    for (const section of skin.strip) {
      const block = document.createElement("div");
      block.className = section.className;
      for (const row of section.rows) {
        const spec = Array.isArray(row) ? { parts: row } : row;
        const els = spec.parts.filter((k) => k !== "phantom" || perChannelPhantom).map((k) => parts[k]());
        if (!els.length) continue;
        if (spec.parts.length === 1 && !spec.className) {
          block.appendChild(els[0]);
          continue;
        }
        const wrap = document.createElement("div");
        wrap.className = spec.className || "strip-row";
        wrap.append(...els);
        block.appendChild(wrap);
      }
      el.appendChild(block);
    }
    const status = document.createElement("p");
    status.className = "strip-status";
    status.setAttribute("aria-live", "polite");
    el.appendChild(status);
    this.bindings.push({ kind: "status", el: status, index: i });
    return el;
  }

  buildMaster() {
    const skin = this.skin;
    const t = skin.terms;
    const store = this.store;
    const el = document.createElement("section");
    el.className = "master";
    el.setAttribute("aria-label", "Master section");
    el.innerHTML = `<h3 class="master-title">Master</h3>`;

    const meterBlock = (label, key, orientation) => {
      const m = new MeterView({ marks: skin.meter.marks, orientation, label, showText: true });
      m.el.classList.add(`meter-${skin.meter.style}`);
      this.masterMeters[key] = m;
      const wrap = document.createElement("div");
      wrap.className = "master-meter";
      wrap.innerHTML = `<span class="master-meter-label">${label}</span>`;
      wrap.appendChild(m.el);
      return wrap;
    };
    this.masterMeters = {};

    const masterLevel = (bus, label, kind) => {
      const opts = {
        label,
        sheetLabel: label,
        min: 0,
        max: 1,
        step: 0.005,
        keyStepMul: 2,
        defaultValue: 0.75,
        format: levelFormat,
        onInput: (v) => store.setBusLevel(bus, v),
      };
      const ctl =
        kind === "fader"
          ? new RangeControl({ kind: "fader", marks: FADER_MARKS, ...opts })
          : this.knob({ size: bus === "main" ? "big" : undefined, tone: bus === "aux1" ? "aux" : bus === "main" ? "level" : "phones", ...opts });
      return this.bind(ctl, (s) => s[bus].level).el;
    };

    if (skin.layout === "console") {
      const phones = masterLevel("headphones", t.phones, "knob");
      phones.classList.add("master-phones");
      const cols = document.createElement("div");
      cols.className = "master-cols";
      const auxCol = document.createElement("div");
      auxCol.className = "master-col";
      const auxRow = document.createElement("div");
      auxRow.className = "fader-row";
      auxRow.append(meterBlock(t.aux, "aux1", "vertical"), masterLevel("aux1", `${t.aux} MASTER`, "fader"));
      auxCol.append(auxRow);
      const mainCol = document.createElement("div");
      mainCol.className = "master-col";
      const mainRow = document.createElement("div");
      mainRow.className = "fader-row";
      const lr = document.createElement("div");
      lr.className = "meter-pair";
      lr.append(meterBlock("L", "mainL", "vertical"), meterBlock("R", "mainR", "vertical"));
      mainRow.append(lr, masterLevel("main", "MAIN L/R", "fader"));
      mainCol.append(mainRow);
      cols.append(auxCol, mainCol);
      el.append(phones, meterBlock(t.pfl, "pfl", "vertical"), cols);
    } else {
      if (skin.phantomControl === "global") el.append(this.globalPhantom());
      const knobs = document.createElement("div");
      knobs.className = "tile-row tile-knobs";
      knobs.append(masterLevel("main", t.mainShort, "knob"), masterLevel("aux1", `${t.aux} MASTER`, "knob"), masterLevel("headphones", t.phones, "knob"));
      const meters = document.createElement("div");
      meters.className = "master-meters-h";
      meters.append(meterBlock("MAIN L", "mainL", "horizontal"), meterBlock("MAIN R", "mainR", "horizontal"), meterBlock(t.aux, "aux1", "horizontal"), meterBlock(t.pfl, "pfl", "horizontal"));
      el.append(knobs, meters);
    }
    return el;
  }

  // One +48V switch for every XLR input (skins with phantomControl "global").
  // It can show a "mixed" state if channels were set individually elsewhere.
  globalPhantom() {
    const t = this.skin.terms;
    const store = this.store;
    const button = new LitButton({
      label: `${t.phantom} (all)`,
      tone: "phantom",
      onPress: () => store.setAllPhantom(globalPhantomState(store.state.channels) !== "on"),
    });
    this.bindings.push({
      kind: "button",
      control: button,
      get: (s) => {
        const g = globalPhantomState(s.channels);
        return [g === "on", `${t.phantom} phantom power for all channels: ${g}`];
      },
    });
    const wrap = document.createElement("div");
    wrap.className = "phantom-all";
    const text = document.createElement("span");
    text.className = "phantom-state";
    wrap.append(button.el, text);
    this.bindings.push({
      kind: "text",
      el: text,
      get: (s) => {
        const on = s.channels.filter((c) => c.phantom).map((c) => c.index + 1);
        if (!on.length) return "Off";
        if (on.length === s.channels.length) return "On — every XLR input";
        return `Only Ch ${on.join(", ")} — press to switch all on`;
      },
    });
    return wrap;
  }

  // ---------- updating ----------

  // Pull every control's value from state (after any change, from any skin).
  sync(mix) {
    const s = this.store.state;
    const { SOURCES_BY_ID } = this.manifest;
    for (const b of this.bindings) {
      if (b.kind === "range") b.control.setValue(b.get(s), true);
      else if (b.kind === "text") {
        const v = b.get(s);
        if (b.el.textContent !== v) b.el.textContent = v;
      }
      else if (b.kind === "button") b.control.setLit(...b.get(s));
      else if (b.kind === "head" && mix) {
        const c = mix.channels[b.index];
        const src = c.sourceId ? SOURCES_BY_ID[c.sourceId] : null;
        const warn = c.input.connected && c.input.status !== "ok";
        b.el.classList.toggle("empty", !c.input.connected);
        b.el.classList.toggle("warn", warn);
        const html = `<span class="strip-num">${b.index + 1}</span><span class="strip-name">${src ? src.shortName : c.input.connected ? "?" : "—"}</span>${warn ? '<span class="strip-warn" aria-hidden="true">!</span>' : ""}`;
        if (html === b.html) continue;
        b.html = html;
        b.el.innerHTML = html;
        b.el.setAttribute(
          "aria-label",
          `Channel ${b.index + 1} input: ${src ? `${src.name}${c.input.path === "line" ? ", on the line input" : ", on the mic input"}` : "nothing patched"}${warn ? ". Problem: " + c.input.messages[0].replace(/[.!]$/, "") : ""}. Tap to patch.`,
        );
        b.el.title = warn ? c.input.messages[0] : src ? `${src.device}` : "Tap to patch a source";
      } else if (b.kind === "status" && mix) {
        const ch = s.channels[b.index];
        const words = [];
        const en = enabledStatusText(this.skin, ch.enabled);
        if (en) words.push(en);
        if (ch.pfl) words.push("PFL");
        b.el.textContent = words.join(" · ");
        b.el.closest(".strip").classList.toggle("is-muted", !ch.enabled);
      }
    }
  }

  updateMeters(readings, now) {
    if (!readings) return;
    this.channelMeters.forEach((m, i) => m && m.update(readings.channels[i], now));
    const mm = this.masterMeters || {};
    if (mm.mainL) mm.mainL.update(readings.mainL, now);
    if (mm.mainR) mm.mainR.update(readings.mainR, now);
    if (mm.aux1) mm.aux1.update(readings.aux1, now);
    if (mm.pfl) mm.pfl.update(readings.pfl, now);
  }
}
