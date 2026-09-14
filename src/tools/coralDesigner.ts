/**
 * The Pixi side of the coral designer (`tools.html#coral`, body mode) — the
 * reef counterpart of `whaleDesigner.ts`. Renders a contact sheet of one
 * `ProceduralCoralView` growth per kind, all rooted on one flat seabed line
 * and all swaying in the same current, and splits the draw into named
 * sections so the UI can hover a growth (or a section name) and show which
 * block of `ProceduralCoralView.ts` drew it.
 *
 * The Svelte component (`viewer/designers/Coral.svelte`) owns the controls and
 * the live `CoralParams` (pushed through `setCoralParams`, which this class
 * reads via `coralParams()` like the game does); this class only owns the
 * sheet-level dials in `CoralSheetParams` and reports `hot` / `pinnedOff`.
 */
import { Application, Container, Graphics } from "pixi.js";

import { C } from "../config/constants";
import { Camera } from "../core/Camera";
import type { Coral } from "../state/Fauna";
import {
  CORAL_SECTIONS,
  type CoralDrawOptions,
  type CoralSection,
} from "../render/coral/CoralView";
import { KIND_COUNT, KIND_NAMES } from "../render/coral/geometry";
import { coralParams } from "../render/coral/params";
import { ProceduralCoralView } from "../render/coral/ProceduralCoralView";
import coralSrc from "../render/coral/ProceduralCoralView.ts?raw";

export const SECTIONS: {
  id: CoralSection;
  label: string;
  marker: RegExp;
}[] = [
  { id: "shadow", label: "contact shadow", marker: /Contact shadow/ },
  { id: "holdfast", label: "holdfast", marker: /-{4,} Holdfast/ },
  { id: "body", label: "body", marker: /Sea fan/ },
  { id: "shade", label: "form shadow", marker: /Sea fan/ },
  { id: "detail", label: "detail (veins / grooves / buds)", marker: /Sea fan/ },
  { id: "polyps", label: "polyps / tentacles", marker: /Sea fan/ },
  { id: "rim", label: "rim light", marker: /Sea fan/ },
];

/** per-kind source blocks, for the code panel */
export const KIND_SOURCE_MARKERS: RegExp[] = [
  /-{4,} Sea fan/,
  /-{4,} Staghorn/,
  /-{4,} Brain coral/,
  /-{4,} Tube sponges/,
  /-{4,} Sea whip/,
  /-{4,} Anemone/,
  /-{4,} Table coral/,
];

export interface CoralSource {
  code: string;
  line: number;
}

/** slice `ProceduralCoralView.ts` into blocks bounded by its `// ----` headers */
function sliceSource(src: string): Map<string, CoralSource> {
  const lines = src.split("\n");
  const heads: number[] = [];
  lines.forEach((l, i) => {
    if (/^\s*\/\/ -{4,}.*-{4,}\s*$/.test(l)) heads.push(i);
  });
  const out = new Map<string, CoralSource>();
  const slice = (key: string, marker: RegExp): void => {
    const h = heads.find((i) => marker.test(lines[i]));
    if (h === undefined) return;
    const next = heads.find((i) => i > h) ?? lines.length;
    out.set(key, {
      code: lines.slice(h, next).join("\n").replace(/\s+$/, ""),
      line: h + 1,
    });
  };
  for (const s of SECTIONS) slice(s.id, s.marker);
  KIND_SOURCE_MARKERS.forEach((m, k) => slice(`kind:${k}`, m));
  return out;
}

export const CORAL_SOURCE = sliceSource(coralSrc);

/** the sheet-level dials — everything that is not a `CoralParams` dial */
export interface CoralSheetParams {
  /** 1 = the whole row of kinds just fits the stage width */
  zoom: number;
  /** the `Coral.scale` every sheet item gets */
  scale: number;
  /** re-seeds every item's genome (its x) */
  seed: number;
  /** 0..1 ambient light — sinks the hues toward the water as it drops */
  light: number;
  /** 0..1 fake sonar sweep on the seabed under the sheet */
  sonar: number;
  /** stop the clock, for a stable screenshot */
  freeze: boolean;
}

export const SHEET_DEFAULTS: CoralSheetParams = {
  zoom: 1,
  scale: 1.4,
  seed: 3,
  light: 1,
  sonar: 0,
  freeze: false,
};

/** world-x pitch between sheet items */
const PITCH = 210;

export class CoralDesigner {
  hot: string | null = null;
  readonly pinnedOff = new Set<CoralSection>();
  /** kinds hidden from the sheet (none by default) */
  readonly hiddenKinds = new Set<number>();

  private app = new Application();
  private cam = new Camera();
  private view = new ProceduralCoralView();
  private sink = new Graphics();
  private stage = new Container();
  private seabed = new Graphics();
  private gfx = new Map<CoralSection, Graphics>();
  private items: Coral[] = [];
  private t = 0;
  private clearTimer = 0;
  private disposed = false;
  private readonly opts: CoralDrawOptions = {
    alpha: 1,
    light: 1,
    sonar: 0,
    t: 0,
    params: coralParams(),
    layer: (s) => this.gfx.get(s),
  };

  constructor(
    private mount: HTMLElement,
    private params: CoralSheetParams,
    /** called after the designer mutates state the UI should re-read */
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
    this.stage.addChild(this.seabed);

    for (const id of CORAL_SECTIONS) {
      const g = new Graphics();
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerover", () => this.setHot(id));
      g.on("pointerout", () => this.setHot(null));
      this.gfx.set(id, g);
      this.stage.addChild(g);
    }

    this.app.ticker.add(this.tick);
  }

  dispose(): void {
    this.disposed = true;
    this.app.destroy(true, { children: true });
  }

  setHot(s: string | null): void {
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

  togglePinned(s: CoralSection): void {
    if (this.pinnedOff.has(s)) this.pinnedOff.delete(s);
    else this.pinnedOff.add(s);
    this.onChange();
  }

  /** show only these kinds (empty → all) */
  only(kinds: readonly number[]): void {
    this.hiddenKinds.clear();
    if (kinds.length)
      for (let k = 0; k < KIND_COUNT; k++)
        if (!kinds.includes(k)) this.hiddenKinds.add(k);
    this.onChange();
  }

  toggleKind(k: number): void {
    if (this.hiddenKinds.has(k)) this.hiddenKinds.delete(k);
    else this.hiddenKinds.add(k);
    this.onChange();
  }

  reset(): void {
    Object.assign(this.params, SHEET_DEFAULTS);
    this.pinnedOff.clear();
    this.hiddenKinds.clear();
    this.onChange();
  }

  /** the kind names, for the UI's isolate buttons */
  get kinds(): readonly string[] {
    return KIND_NAMES;
  }

  private rebuildItems(): void {
    const p = this.params;
    const n = KIND_COUNT;
    if (this.items.length !== n) {
      this.items = Array.from({ length: n }, (_, k) => ({
        x: 0,
        y: 0,
        kind: k,
        scale: 1,
        ph: 0,
      }));
    }
    for (let k = 0; k < n; k++) {
      const it = this.items[k];
      // the seed shifts every item's x, which is what its genome hashes off
      it.x = (k - (n - 1) / 2) * PITCH + p.seed * 37;
      it.scale = p.scale;
      it.ph = k * 1.9 + p.seed * 0.7;
    }
  }

  private tick = (): void => {
    if (this.disposed) return;
    const p = this.params;
    if (!p.freeze) this.t += this.app.ticker.deltaMS / 1000;
    this.rebuildItems();

    this.cam.vw = this.app.renderer.width / this.app.renderer.resolution;
    this.cam.vh = this.app.renderer.height / this.app.renderer.resolution;
    // 1× fits the whole row; the items keep fixed world x so their genomes
    // (hashed off x) don't reshuffle as the zoom changes
    this.cam.scale = (p.zoom * this.cam.vw) / ((KIND_COUNT + 0.6) * PITCH);
    // centre on whatever is showing, so an isolated kind lands mid-stage
    let cx = 0;
    let shown = 0;
    for (const it of this.items) {
      if (this.hiddenKinds.has(it.kind)) continue;
      cx += it.x;
      shown++;
    }
    this.cam.x = shown ? cx / shown : p.seed * 37;
    // seabed a third of the way up the screen, growths standing above it
    this.cam.y = -(this.cam.vh * 0.18) / p.zoom;

    for (const g of this.gfx.values()) g.clear();
    this.sink.clear();

    // the flat rock the sheet stands on
    const sb = this.seabed;
    sb.clear();
    const y = this.cam.sy(0);
    sb.rect(0, y, this.cam.vw, this.cam.vh - y);
    sb.fill({ color: C.seabedDeep, alpha: 1 });
    sb.moveTo(0, y);
    sb.lineTo(this.cam.vw, y);
    sb.stroke({ width: 1.5, color: C.reefRim, alpha: 0.35 * p.light });

    const o = this.opts;
    o.params = coralParams();
    o.t = this.t;
    o.light = p.light;
    o.sonar = p.sonar;
    o.alpha = Math.min(1, Math.max(p.light * 0.9, p.sonar * 0.95));

    for (const it of this.items) {
      if (this.hiddenKinds.has(it.kind)) continue;
      this.view.draw(this.sink, it, o, this.cam);
    }

    for (const [id, g] of this.gfx) {
      g.visible = !this.pinnedOff.has(id);
      g.alpha = this.hot && this.hot !== id ? 0.12 : 1;
    }
  };
}
