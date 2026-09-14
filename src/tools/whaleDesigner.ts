/**
 * The Pixi side of the whale designer (`tools.html#whale`) — lifted out of the
 * old `src/procgen.ts`. Renders one `ProceduralWhaleView` body with live params
 * and splits its draw into named sections so the UI can hover the whale (or a
 * section name) and show which block of `ProceduralWhaleView.ts` drew it.
 *
 * The Svelte component (`viewer/designers/Whale.svelte`) owns the controls and
 * passes a reactive `params` object in; this class only mutates `params.rollDeg`
 * (when `spin` is running) and reports `hot` / `pinnedOff` back through getters.
 */
import { Application, Container, Graphics } from "pixi.js";

import { C } from "../config/constants";
import { Camera } from "../core/Camera";
import { applyUndulation, makeChain, SPINE_JOINTS } from "../core/SpineChain";
import type { Vec2 } from "../core/math";
import { ProceduralWhaleView } from "../render/whale/ProceduralWhaleView";
import type { WhaleSection } from "../render/whale/WhaleView";
import whaleSrc from "../render/whale/ProceduralWhaleView.ts?raw";

export const SECTIONS: { id: WhaleSection; label: string; marker: RegExp }[] = [
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

export interface WhaleSource {
  code: string;
  line: number;
}

/** slice `ProceduralWhaleView.ts` into blocks bounded by its `// ----` headers */
function sliceSource(src: string): Map<WhaleSection, WhaleSource> {
  const lines = src.split("\n");
  const heads: number[] = [];
  lines.forEach((l, i) => {
    if (/^\s*\/\/ -{4,}.*-{4,}\s*$/.test(l)) heads.push(i);
  });
  const out = new Map<WhaleSection, WhaleSource>();
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

export const WHALE_SOURCE = sliceSource(whaleSrc);

export interface WhaleParams {
  width: number;
  juv: number;
  rollDeg: number;
  spin: number;
  rollK: number;
  alpha: number;
  seed: number;
  zoom: number;
  bend: number;
  wave: number;
  swim: boolean;
  facing: 1 | -1;
  sheet: boolean;
}

export const WHALE_DEFAULTS: WhaleParams = {
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

/** roll offsets (deg) of the contact-sheet rows, top to bottom */
const SHEET = [0, 30, 60, 90, 120, 150, 180];
const SPACING = 18;
const HALF = ((SPINE_JOINTS - 1) * SPACING) / 2;

export class WhaleDesigner {
  hot: WhaleSection | null = null;
  readonly pinnedOff = new Set<WhaleSection>();

  private app = new Application();
  private cam = new Camera();
  private view = new ProceduralWhaleView();
  private sink = new Graphics();
  private stage = new Container();
  private gfx = new Map<WhaleSection, Graphics>();
  private base: Vec2[] = makeChain(HALF, 0, SPACING);
  private spine: Vec2[] = this.base.map((p) => ({ ...p }));
  private phase = 0;
  private clearTimer = 0;
  private disposed = false;

  constructor(
    private mount: HTMLElement,
    private params: WhaleParams,
    /** called after the designer mutates a param the UI should re-read */
    private onChange: () => void,
  ) {}

  async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.mount,
      antialias: true,
      background: C.abyss,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.mount.appendChild(this.app.canvas);
    this.app.stage.addChild(this.stage);

    for (const meta of SECTIONS) {
      const g = new Graphics();
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerover", () => this.setHot(meta.id));
      g.on("pointerout", () => this.setHot(null));
      this.gfx.set(meta.id, g);
      this.stage.addChild(g);
    }

    this.app.ticker.add(this.tick);
  }

  dispose(): void {
    this.disposed = true;
    this.app.destroy(true, { children: true });
  }

  setHot(s: WhaleSection | null): void {
    window.clearTimeout(this.clearTimer);
    if (s === null) {
      this.clearTimer = window.setTimeout(() => {
        this.hot = null;
        this.onChange();
      }, 40);
      return;
    }
    this.hot = s;
    this.onChange();
  }

  togglePinned(s: WhaleSection): void {
    if (this.pinnedOff.has(s)) this.pinnedOff.delete(s);
    else this.pinnedOff.add(s);
    this.onChange();
  }

  reset(): void {
    Object.assign(this.params, WHALE_DEFAULTS);
    this.pinnedOff.clear();
    this.onChange();
  }

  private rebuildSpine(dtMs: number): void {
    this.phase += dtMs * 0.005;
    for (let i = 0; i < this.base.length; i++) {
      const t = i / (this.base.length - 1);
      this.base[i].x = HALF - i * SPACING;
      this.base[i].y = Math.sin(t * Math.PI) * this.params.bend * 130;
    }
    if (this.params.swim) {
      applyUndulation(this.spine, this.base, this.phase, this.params.wave);
    } else {
      for (let i = 0; i < this.base.length; i++) {
        this.spine[i].x = this.base[i].x;
        this.spine[i].y = this.base[i].y;
      }
    }
  }

  private tick = (): void => {
    if (this.disposed) return;
    const p = this.params;
    const dtMs = this.app.ticker.deltaMS;
    this.rebuildSpine(dtMs);

    if (p.spin !== 0) {
      let r = p.rollDeg + p.spin * (dtMs / 1000);
      r = ((((r + 180) % 360) + 360) % 360) - 180;
      p.rollDeg = Math.round(r);
      this.onChange();
    }

    this.cam.vw = this.app.renderer.screen.width;
    this.cam.vh = this.app.renderer.screen.height;
    const rows = p.sheet ? SHEET.length : 1;
    this.cam.scale = p.zoom / (p.sheet ? 2.6 : 1);

    for (const g of this.gfx.values()) g.clear();
    this.sink.clear();

    const gap = 150 / this.cam.scale;
    for (let r = 0; r < rows; r++) {
      this.cam.y = (r - (rows - 1) / 2) * -gap;
      this.view.draw(
        this.sink,
        this.spine,
        {
          scale: 1,
          facing: p.facing,
          skin: C.skin,
          belly: C.belly,
          alpha: p.alpha,
          width: p.width,
          juv: p.juv,
          roll: ((p.rollDeg + (p.sheet ? SHEET[r] : 0)) * Math.PI) / 180,
          rollK: p.rollK,
          seed: p.seed,
          layer: (sc) => this.gfx.get(sc),
        },
        this.cam,
      );
    }
    this.cam.y = 0;

    for (const [id, g] of this.gfx) {
      g.visible = !this.pinnedOff.has(id);
      g.alpha = this.hot && this.hot !== id ? 0.1 : 1;
    }
  };
}
