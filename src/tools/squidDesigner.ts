/**
 * The Pixi side of the squid body designer (`tools.html#squid`, body mode).
 * Renders one `ProceduralSquidView` from a hand-driven `Squid` state with live
 * params, and splits its draw into named sections so the UI can hover the
 * animal (or a section name) and show which block of `ProceduralSquidView.ts`
 * drew it. The same shape as `whaleDesigner.ts`.
 *
 * The Svelte component (`viewer/designers/Squid.svelte`) owns the controls and
 * passes reactive `params` / `look` objects in; this class only mutates
 * `params.headingDeg` (when `spin` is running) and reports `hot` / `pinnedOff`
 * back through getters.
 */
import { Application, Container, Graphics } from "pixi.js";

import { C } from "../config/constants";
import { Camera } from "../core/Camera";
import type { Vec2 } from "../core/math";
import { ProceduralSquidView } from "../render/squid/ProceduralSquidView";
import type { SquidSection } from "../render/squid/SquidView";
import {
  limbLength,
  individual,
  type Individual,
} from "../render/squid/geometry";
import type { SquidLook } from "../render/squid/params";
import { makeSquid, type Squid, type SquidState } from "../state/Squid";
import squidSrc from "../render/squid/ProceduralSquidView.ts?raw";

export const SECTIONS: { id: SquidSection; label: string; marker: RegExp }[] = [
  { id: "farArms", label: "far arms", marker: /-{4,} Far arms/ },
  { id: "farFin", label: "far fin", marker: /Paired lateral fins/ },
  { id: "nearFin", label: "near fin", marker: /Paired lateral fins/ },
  { id: "mantle", label: "mantle", marker: /-{4,} Mantle -/ },
  { id: "stripe", label: "ventral stripe", marker: /Pale ventral stripe/ },
  { id: "mottle", label: "chromatophores", marker: /Chromatophore flecks/ },
  { id: "photophores", label: "photophores", marker: /-{4,} Photophores/ },
  { id: "sheen", label: "light from above", marker: /Light from above/ },
  { id: "shade", label: "form shadow", marker: /Form shadow underneath/ },
  { id: "head", label: "head", marker: /-{4,} Head -/ },
  { id: "nearArms", label: "near arms", marker: /-{4,} Near arms/ },
  { id: "rim", label: "rim light", marker: /-{4,} Rim light/ },
  { id: "eye", label: "eye", marker: /-{4,} Eye -/ },
];

export interface SquidSource {
  code: string;
  line: number;
}

/** slice `ProceduralSquidView.ts` into blocks bounded by its `// ----` headers */
function sliceSource(src: string): Map<SquidSection, SquidSource> {
  const lines = src.split("\n");
  const heads: number[] = [];
  lines.forEach((l, i) => {
    if (/^\s*\/\/ -{4,}.*-{4,}\s*$/.test(l)) heads.push(i);
  });
  const out = new Map<SquidSection, SquidSource>();
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

export const SQUID_SOURCE = sliceSource(squidSrc);

export interface SquidParams {
  size: number;
  headingDeg: number;
  /** deg/s of continuous turning, 0 = hold `headingDeg` */
  spin: number;
  flare: number;
  arousal: number;
  /** rad/s the jet phase advances while `swim` is on */
  jetRate: number;
  swim: boolean;
  /** the per-squid phase — drives proportions, fleck seed and limb desync */
  seed: number;
  zoom: number;
  alpha: number;
  /** lay out five squid at flare 0 → 1 */
  sheet: boolean;
  /** show a grip target the tentacles wrap onto */
  grip: boolean;
  /** the state whose pose is being previewed (informational + drives grip) */
  state: SquidState;
}

export const SQUID_PARAMS: SquidParams = {
  size: 1,
  headingDeg: 0,
  spin: 0,
  flare: 0.18,
  arousal: 0,
  jetRate: 2.4,
  swim: true,
  seed: 1.3,
  zoom: 2.4,
  alpha: 1,
  sheet: false,
  grip: false,
  state: "lurk",
};

/** the pose each brain state settles into, for the state preset buttons */
export const STATE_POSES: Record<
  SquidState,
  { flare: number; arousal: number; grip: boolean }
> = {
  lurk: { flare: 0.18, arousal: 0, grip: false },
  stalk: { flare: 0.1, arousal: 0.6, grip: false },
  strike: { flare: 1, arousal: 1, grip: false },
  latched: { flare: 1, arousal: 1, grip: true },
  flee: { flare: 0.05, arousal: 0.3, grip: false },
  recover: { flare: 0.18, arousal: 0.1, grip: false },
};

/** flare values of the contact-sheet rows, top to bottom */
const SHEET = [0, 0.25, 0.5, 0.75, 1];

export class SquidDesigner {
  hot: SquidSection | null = null;
  readonly pinnedOff = new Set<SquidSection>();

  private app = new Application();
  private cam = new Camera();
  private view = new ProceduralSquidView();
  private sink = new Graphics();
  private marks = new Graphics();
  private stage = new Container();
  private gfx = new Map<SquidSection, Graphics>();
  private sq: Squid = makeSquid({ x: 0, y: 0 });
  private grip: Vec2 = { x: 0, y: 0 };
  private ind: Individual = {
    mantleK: 1,
    girthK: 1,
    finK: 1,
    armK: 1,
    tentK: 1,
    seed: 0,
  };
  private clearTimer = 0;
  private disposed = false;

  constructor(
    private mount: HTMLElement,
    private params: SquidParams,
    private look: SquidLook,
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
    this.stage.addChild(this.marks);

    this.app.ticker.add(this.tick);
  }

  dispose(): void {
    this.disposed = true;
    this.app.destroy(true, { children: true });
  }

  setHot(s: SquidSection | null): void {
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

  togglePinned(s: SquidSection): void {
    if (this.pinnedOff.has(s)) this.pinnedOff.delete(s);
    else this.pinnedOff.add(s);
    this.onChange();
  }

  reset(): void {
    Object.assign(this.params, SQUID_PARAMS);
    this.pinnedOff.clear();
    this.onChange();
  }

  private tick = (): void => {
    if (this.disposed) return;
    const p = this.params;
    const dt = this.app.ticker.deltaMS / 1000;

    if (p.spin !== 0) {
      let h = p.headingDeg + p.spin * dt;
      h = ((((h + 180) % 360) + 360) % 360) - 180;
      p.headingDeg = Math.round(h * 10) / 10;
      this.onChange();
    }
    if (p.swim) this.sq.jet += dt * p.jetRate;

    const sq = this.sq;
    sq.heading = (p.headingDeg * Math.PI) / 180;
    sq.size = p.size;
    sq.arousal = p.arousal;
    sq.ph = p.seed;
    sq.state = p.state;

    this.cam.vw = this.app.renderer.width / this.app.renderer.resolution;
    this.cam.vh = this.app.renderer.height / this.app.renderer.resolution;
    const rows = p.sheet ? SHEET.length : 1;
    this.cam.scale = p.zoom / (p.sheet ? 2.2 : 1);
    this.cam.x = 0;

    for (const g of this.gfx.values()) g.clear();
    this.sink.clear();
    this.marks.clear();

    // the grip target: a point out past the arm tips, where the whale would be
    const arm = limbLength(
      0,
      this.look,
      individual(sq.ph, this.look.variety, this.ind),
      1,
      this.look.mantleLen,
    );
    const gripDist = (this.look.headR + arm * 1.05) * p.size;
    this.grip.x = -Math.cos(sq.heading) * gripDist;
    this.grip.y = -Math.sin(sq.heading) * gripDist;

    // rows stack vertically, so a squid pointing up or down needs more room
    const gap = (190 + 260 * Math.abs(Math.sin(sq.heading))) / this.cam.scale;
    for (let r = 0; r < rows; r++) {
      this.cam.y = (r - (rows - 1) / 2) * -gap;
      sq.flare = p.sheet ? SHEET[r] : p.flare;
      const grip = p.grip && !p.sheet ? this.grip : null;
      this.view.draw(
        this.sink,
        sq,
        {
          alpha: p.alpha,
          look: this.look,
          gripAt: grip,
          layer: (sc) => this.gfx.get(sc),
        },
        this.cam,
      );
      if (grip) {
        this.marks.circle(this.cam.sx(grip.x), this.cam.sy(grip.y), 5);
        this.marks.stroke({ width: 1.2, color: 0x6ec7dc, alpha: 0.7 });
      }
    }
    this.cam.y = 0;

    for (const [id, g] of this.gfx) {
      g.visible = !this.pinnedOff.has(id);
      g.alpha = this.hot && this.hot !== id ? 0.1 : 1;
    }
  };
}
