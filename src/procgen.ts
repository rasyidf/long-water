/**
 * Entry for `procgen.html` — the ProcGen Designer. Renders a single
 * `ProceduralWhaleView` body with live sliders, and splits its draw into its
 * named sections so you can hover the whale (or a section name) and see which
 * block of `ProceduralWhaleView.ts` drew it.
 *
 *   npm run dev  ->  http://localhost:8080/procgen.html
 */
import { Application, Container, Graphics } from "pixi.js";

import { C } from "./config/constants";
import { Camera } from "./core/Camera";
import { applyUndulation, makeChain, SPINE_JOINTS } from "./core/SpineChain";
import type { Vec2 } from "./core/math";
import { ProceduralWhaleView } from "./render/whale/ProceduralWhaleView";
import type { WhaleSection } from "./render/whale/WhaleView";
import whaleSrc from "./render/whale/ProceduralWhaleView.ts?raw";

// --- sections, in draw order (matches ProceduralWhaleView) -------------------
const SECTIONS: { id: WhaleSection; label: string; marker: RegExp }[] = [
  { id: "farPectoral", label: "far pectoral", marker: /Pectoral flipper/ },
  { id: "farDorsal", label: "far dorsal fin", marker: /-{4,} Dorsal fin/ },
  { id: "fluke", label: "fluke", marker: /-{4,} Fluke/ },
  { id: "hull", label: "hull", marker: /Main body hull/ },
  { id: "belly", label: "belly countershade", marker: /Pale belly counter/ },
  { id: "pleats", label: "ventral pleats", marker: /Ventral pleats/ },
  { id: "mottle", label: "skin mottling", marker: /Dappled skin mottling/ },
  { id: "sheen", label: "light from above", marker: /Light from above/ },
  { id: "shade", label: "form shadow", marker: /Form shadow underneath/ },
  { id: "dorsal", label: "dorsal fin", marker: /-{4,} Dorsal fin/ },
  { id: "nearPectoral", label: "near pectoral", marker: /Pectoral flipper/ },
  { id: "rim", label: "rim light", marker: /-{4,} Rim light/ },
  { id: "face", label: "eye / mouth / blowhole", marker: /Eye, mouth line/ },
];

/** slice `ProceduralWhaleView.ts` into blocks bounded by its `// ----` headers */
function sliceSource(
  src: string,
): Map<WhaleSection, { code: string; line: number }> {
  const lines = src.split("\n");
  const heads: number[] = [];
  lines.forEach((l, i) => {
    if (/^\s*\/\/ -{4,}.*-{4,}\s*$/.test(l)) heads.push(i);
  });
  const out = new Map<WhaleSection, { code: string; line: number }>();
  for (const s of SECTIONS) {
    const h = heads.find((i) => s.marker.test(lines[i]));
    if (h === undefined) continue;
    const next = heads.find((i) => i > h) ?? lines.length;
    out.set(s.id, {
      code: lines.slice(h, next).join("\n").replace(/\s+$/, ""),
      line: h + 1,
    });
  }
  return out;
}
const SOURCE = sliceSource(whaleSrc);

// --- live params -----------------------------------------------------------
type Key =
  | "width"
  | "juv"
  | "rollDeg"
  | "spin"
  | "rollK"
  | "alpha"
  | "seed"
  | "zoom"
  | "bend"
  | "wave";
const params: Record<Key, number> & {
  swim: boolean;
  facing: 1 | -1;
  sheet: boolean;
} = {
  width: 38,
  juv: 0,
  rollDeg: 0,
  spin: 0,
  rollK: 1,
  alpha: 1,
  seed: 3,
  zoom: 1.7,
  bend: 0,
  wave: 7,
  swim: true,
  facing: 1,
  sheet: false,
};
const DEFAULTS = { ...params };

const SLIDERS: {
  key: Key;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
}[] = [
  { key: "width", min: 8, max: 72, step: 1 },
  { key: "juv", min: 0, max: 1, step: 0.01 },
  { key: "rollDeg", min: -180, max: 180, step: 1, fmt: (v) => `${v}°` },
  { key: "spin", min: -180, max: 180, step: 5, fmt: (v) => `${v}°/s` },
  { key: "rollK", min: 0, max: 1, step: 0.01 },
  { key: "alpha", min: 0.1, max: 1, step: 0.01 },
  { key: "seed", min: 0, max: 24, step: 1 },
  { key: "zoom", min: 0.3, max: 4, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  { key: "bend", min: -1, max: 1, step: 0.01 },
  { key: "wave", min: 0, max: 20, step: 0.5 },
];

// --- pixi scene ----------------------------------------------------------
const mount = document.getElementById("pixi-container") ?? document.body;
const app = new Application();
await app.init({
  resizeTo: window,
  antialias: true,
  background: C.abyss,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
mount.appendChild(app.canvas);

const cam = new Camera();
cam.x = 0;
cam.y = 0;

const view = new ProceduralWhaleView();
const sink = new Graphics(); // `g` fallback — never drawn into, every section is routed
const stage = new Container();
app.stage.addChild(stage);

const gfx = new Map<WhaleSection, Graphics>();
let hot: WhaleSection | null = null;
let pinnedOff = new Set<WhaleSection>();
let clearTimer = 0;

function setHot(s: WhaleSection | null): void {
  window.clearTimeout(clearTimer);
  if (s === null) {
    clearTimer = window.setTimeout(() => {
      hot = null;
      syncPanels();
    }, 40);
    return;
  }
  hot = s;
  syncPanels();
}

for (const meta of SECTIONS) {
  const g = new Graphics();
  g.eventMode = "static";
  g.cursor = "pointer";
  g.on("pointerover", () => setHot(meta.id));
  g.on("pointerout", () => setHot(null));
  gfx.set(meta.id, g);
  stage.addChild(g);
}

// --- spine ------------------------------------------------------------
const SPACING = 18;
const HALF = ((SPINE_JOINTS - 1) * SPACING) / 2;
const base: Vec2[] = makeChain(HALF, 0, SPACING);
const spine: Vec2[] = base.map((p) => ({ ...p }));
let phase = 0;

function rebuildSpine(dtMs: number): void {
  phase += dtMs * 0.005;
  for (let i = 0; i < base.length; i++) {
    const t = i / (base.length - 1);
    base[i].x = HALF - i * SPACING;
    base[i].y = Math.sin(t * Math.PI) * params.bend * 130;
  }
  if (params.swim) {
    applyUndulation(spine, base, phase, params.wave);
  } else {
    for (let i = 0; i < base.length; i++) {
      spine[i].x = base[i].x;
      spine[i].y = base[i].y;
    }
  }
}

// --- frame -----------------------------------------------------------
/** roll offsets (deg) of the contact-sheet rows, top to bottom */
const SHEET = [0, 30, 60, 90, 120, 150, 180];

app.ticker.add((ticker) => {
  const dt = ticker.deltaMS / 1000;
  rebuildSpine(ticker.deltaMS);

  // `spin` drives the roll continuously, so a barrel roll can be watched
  // rather than scrubbed. It writes back through the roll slider.
  if (params.spin !== 0) {
    let r = params.rollDeg + params.spin * dt;
    r = ((((r + 180) % 360) + 360) % 360) - 180;
    params.rollDeg = Math.round(r);
    syncSlider("rollDeg");
  }

  cam.vw = app.renderer.width / app.renderer.resolution;
  cam.vh = app.renderer.height / app.renderer.resolution;
  const rows = params.sheet ? SHEET.length : 1;
  cam.scale = params.zoom / (params.sheet ? 2.6 : 1);

  for (const g of gfx.values()) g.clear();
  sink.clear();

  // In sheet mode the same body is drawn once per row at a rising roll, so the
  // whole rotation can be judged in one glance.
  const gap = 150 / cam.scale;
  for (let r = 0; r < rows; r++) {
    cam.y = (r - (rows - 1) / 2) * -gap;
    view.draw(
      sink,
      spine,
      {
        scale: 1,
        facing: params.facing,
        skin: C.skin,
        belly: C.belly,
        alpha: params.alpha,
        width: params.width,
        juv: params.juv,
        roll:
          ((params.rollDeg + (params.sheet ? SHEET[r] : 0)) * Math.PI) / 180,
        rollK: params.rollK,
        seed: params.seed,
        layer: (sc) => gfx.get(sc),
      },
      cam,
    );
  }
  cam.y = 0;

  for (const [id, g] of gfx) {
    g.visible = !pinnedOff.has(id);
    g.alpha = hot && hot !== id ? 0.1 : 1;
  }
});

// --- controls UI ------------------------------------------------------
const slidersEl = document.getElementById("sliders")!;
const outputs = new Map<Key, HTMLOutputElement>();
const inputs = new Map<Key, HTMLInputElement>();

/** push a param the code changed (spin, reset) back into its slider + readout */
function syncSlider(key: Key): void {
  const input = inputs.get(key);
  if (input) input.value = String(params[key]);
  const out = outputs.get(key);
  const meta = SLIDERS.find((s) => s.key === key);
  if (out)
    out.textContent = meta?.fmt ? meta.fmt(params[key]) : String(params[key]);
}

for (const s of SLIDERS) {
  const wrap = document.createElement("div");
  wrap.className = "ctl";
  const label = document.createElement("label");
  label.textContent = s.key === "rollDeg" ? "roll" : s.key;
  const out = document.createElement("output");
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(s.min);
  input.max = String(s.max);
  input.step = String(s.step);
  input.value = String(params[s.key]);
  const render = (): void => {
    out.textContent = s.fmt ? s.fmt(params[s.key]) : String(params[s.key]);
  };
  input.addEventListener("input", () => {
    params[s.key] = Number(input.value);
    render();
  });
  render();
  outputs.set(s.key, out);
  inputs.set(s.key, input);
  wrap.append(label, out, input);
  slidersEl.appendChild(wrap);
}

const facingBtn = document.getElementById("facing") as HTMLButtonElement;
const swimBtn = document.getElementById("swim") as HTMLButtonElement;
const resetBtn = document.getElementById("reset") as HTMLButtonElement;

facingBtn.addEventListener("click", () => {
  params.facing = params.facing === 1 ? -1 : 1;
  facingBtn.textContent = params.facing === 1 ? "facing ►" : "facing ◄";
});
swimBtn.addEventListener("click", () => {
  params.swim = !params.swim;
  swimBtn.classList.toggle("on", params.swim);
});
const sheetBtn = document.getElementById("sheet") as HTMLButtonElement;
sheetBtn.addEventListener("click", () => {
  params.sheet = !params.sheet;
  sheetBtn.classList.toggle("on", params.sheet);
});

resetBtn.addEventListener("click", () => {
  Object.assign(params, DEFAULTS);
  pinnedOff = new Set();
  for (const s of SLIDERS) syncSlider(s.key);
  facingBtn.textContent = "facing ►";
  swimBtn.classList.add("on");
  sheetBtn.classList.remove("on");
  syncPanels();
});

// --- section list + code panel --------------------------------------
const listEl = document.getElementById("layerList")!;
const rows = new Map<WhaleSection, HTMLElement>();

for (const meta of SECTIONS) {
  const row = document.createElement("div");
  row.className = "lyr";
  row.innerHTML = `<span class="sw"></span><span>${meta.label}</span>`;
  row.addEventListener("pointerenter", () => setHot(meta.id));
  row.addEventListener("pointerleave", () => setHot(null));
  row.addEventListener("click", () => {
    if (pinnedOff.has(meta.id)) pinnedOff.delete(meta.id);
    else pinnedOff.add(meta.id);
    syncPanels();
  });
  rows.set(meta.id, row);
  listEl.appendChild(row);
}

const codeEl = document.getElementById("code")!;
const codeName = document.getElementById("codeName")!;
const codeLines = document.getElementById("codeLines")!;
const codeBody = document.getElementById("codeBody")!;
const hintEl = document.getElementById("hint")!;

function syncPanels(): void {
  for (const [id, row] of rows) {
    row.classList.toggle("hot", hot === id);
    row.classList.toggle("off", pinnedOff.has(id));
  }
  const meta = SECTIONS.find((s) => s.id === hot);
  const src = hot ? SOURCE.get(hot) : undefined;
  if (meta && src) {
    codeEl.classList.remove("empty");
    hintEl.style.display = "none";
    codeName.textContent = meta.label;
    codeLines.textContent = `ProceduralWhaleView.ts:${src.line}`;
    codeBody.textContent = src.code;
  } else {
    codeEl.classList.add("empty");
    hintEl.style.display = "";
  }
}

syncPanels();

// hook for the screenshot scripts in `scripts/` — set params without hunting
// for slider DOM nodes
Object.assign(window, {
  procgen: {
    params,
    set(patch: Partial<typeof params>): void {
      Object.assign(params, patch);
      for (const s of SLIDERS) syncSlider(s.key);
    },
  },
});
