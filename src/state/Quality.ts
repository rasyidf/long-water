/**
 * Graphics quality — the one place the player can trade fidelity for frame
 * rate. Three presets (low / medium / high) plus every individual dial, so a
 * low-end machine can switch the expensive blocks off one by one and a
 * high-end one can leave everything on.
 *
 * Renderers read `quality()` every frame, so a change in the options panel
 * lands on the next frame — mid-run, from the pause menu, with no rebuild.
 * The two settings that touch the renderer itself (render scale, bloom) are
 * applied by `Game` / `GlowRenderer` through `onQuality`. Persists to
 * `localStorage["long-water:quality"]`; the first run picks a preset from a
 * coarse device sniff (`detectPreset`).
 *
 * What each dial costs, so the presets make sense:
 *  - `renderScale` — fill rate. The single biggest lever on an integrated GPU.
 *  - `bloom` — a full-screen blur pass on the additive glow layer.
 *  - `godRays`, `caustics`, `slabs`, `murk` — translucent shapes that span the
 *    viewport; each is a screen of overdraw.
 *  - `clouds`, `skyLife`, `surfaceDetail` — cloud polygons, stars, gulls, the
 *    per-facet foam / glitter / spray on the waterline.
 *  - `thermocline`, `snow`, `sparks` — the water-column life; many small fills.
 *  - `creatureDetail`, `reefDetail` — flecks, pleats, polyps, veins, hull
 *    resolution; per-animal / per-coral JS and triangle count.
 *  - `terrainDetail` — the far parallax ridge and the rubble on steep faces.
 */

export interface QualitySettings {
  /** 0.5..1 fraction of the device pixel ratio (itself capped at 2) rendered */
  renderScale: number;
  /** the blurred additive glow pass */
  bloom: boolean;
  /** 0..1 god-ray strength; 0 skips the pass */
  godRays: number;
  /** 0..1 caustic strength; 0 skips the pass */
  caustics: number;
  /** 0..1 fraction of the cloud decks drawn */
  clouds: number;
  /** stars and gulls */
  skyLife: boolean;
  /** 0..1 foam, sun glitter and spray on the waterline */
  surfaceDetail: number;
  /** 0..1 fraction of the sunlit slabs under the waterline */
  slabs: number;
  /** 0..1 drifting silt lenses in the column */
  murk: number;
  /** the thermocline shimmer band */
  thermocline: boolean;
  /** 0..1 marine snow density */
  snow: number;
  /** 0..1 bioluminescent sparks in the dark */
  sparks: number;
  /** 0..1 whale / squid skin detail and hull resolution */
  creatureDetail: number;
  /** 0..1 coral veins, buds, polyps and rim light */
  reefDetail: number;
  /** the far parallax ridge and the seabed rubble */
  terrainDetail: boolean;
}

export type QualityPreset = "low" | "medium" | "high";
export type QualityLevel = QualityPreset | "custom";

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low: {
    renderScale: 0.6,
    bloom: false,
    godRays: 0,
    caustics: 0,
    clouds: 0.34,
    skyLife: false,
    surfaceDetail: 0.4,
    slabs: 0.34,
    murk: 0,
    thermocline: false,
    snow: 0.5,
    sparks: 0.4,
    creatureDetail: 0.4,
    reefDetail: 0.4,
    terrainDetail: false,
  },
  medium: {
    renderScale: 0.8,
    bloom: true,
    godRays: 0.7,
    caustics: 0.7,
    clouds: 0.67,
    skyLife: true,
    surfaceDetail: 0.7,
    slabs: 0.67,
    murk: 0.5,
    thermocline: true,
    snow: 0.75,
    sparks: 0.7,
    creatureDetail: 0.75,
    reefDetail: 0.75,
    terrainDetail: true,
  },
  high: {
    renderScale: 1,
    bloom: true,
    godRays: 1,
    caustics: 1,
    clouds: 1,
    skyLife: true,
    surfaceDetail: 1,
    slabs: 1,
    murk: 1,
    thermocline: true,
    snow: 1,
    sparks: 1,
    creatureDetail: 1,
    reefDetail: 1,
    terrainDetail: true,
  },
};

export type QualityKey = keyof QualitySettings;

/** one options-panel control per dial, in display order */
export interface QualityItem {
  key: QualityKey;
  kind: "range" | "toggle";
  /** range bounds; every range is 0..1 except the render scale */
  min: number;
  max: number;
  step: number;
}

export const QUALITY_ITEMS: readonly QualityItem[] = [
  { key: "renderScale", kind: "range", min: 0.5, max: 1, step: 0.05 },
  { key: "bloom", kind: "toggle", min: 0, max: 1, step: 1 },
  { key: "godRays", kind: "range", min: 0, max: 1, step: 0.1 },
  { key: "caustics", kind: "range", min: 0, max: 1, step: 0.1 },
  { key: "clouds", kind: "range", min: 0, max: 1, step: 0.1 },
  { key: "skyLife", kind: "toggle", min: 0, max: 1, step: 1 },
  { key: "surfaceDetail", kind: "range", min: 0, max: 1, step: 0.1 },
  { key: "slabs", kind: "range", min: 0, max: 1, step: 0.1 },
  { key: "murk", kind: "range", min: 0, max: 1, step: 0.1 },
  { key: "thermocline", kind: "toggle", min: 0, max: 1, step: 1 },
  { key: "snow", kind: "range", min: 0, max: 1, step: 0.1 },
  { key: "sparks", kind: "range", min: 0, max: 1, step: 0.1 },
  { key: "creatureDetail", kind: "range", min: 0, max: 1, step: 0.1 },
  { key: "reefDetail", kind: "range", min: 0, max: 1, step: 0.1 },
  { key: "terrainDetail", kind: "toggle", min: 0, max: 1, step: 1 },
];

const KEY = "long-water:quality";
const VERSION = 1;

interface Stored extends Partial<QualitySettings> {
  v?: number;
}

/**
 * A coarse first-run guess: phones / tablets and machines with few cores or
 * little memory start on `medium`, everything else on `high`. Never overrides
 * a choice the player has saved.
 */
export function detectPreset(
  nav: {
    userAgent?: string;
    hardwareConcurrency?: number;
    deviceMemory?: number;
  } = typeof navigator === "undefined" ? {} : navigator,
): QualityPreset {
  const ua = nav.userAgent ?? "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  return mobile || cores <= 4 || mem <= 4 ? "medium" : "high";
}

/** the preset `q` matches exactly, or `custom` */
export function presetOf(q: QualitySettings): QualityLevel {
  for (const name of ["low", "medium", "high"] as const) {
    const p = QUALITY_PRESETS[name];
    if (QUALITY_ITEMS.every((it) => same(q[it.key], p[it.key]))) return name;
  }
  return "custom";
}

const same = (a: number | boolean, b: number | boolean): boolean =>
  typeof a === "number" && typeof b === "number"
    ? Math.abs(a - b) < 1e-6
    : a === b;

/** coerce anything stored / patched into a valid settings object */
export function sanitizeQuality(
  raw: Stored,
  base: QualitySettings = QUALITY_PRESETS.high,
): QualitySettings {
  const out = { ...base };
  for (const it of QUALITY_ITEMS) {
    const v = raw[it.key];
    if (it.kind === "toggle") {
      if (typeof v === "boolean") (out[it.key] as boolean) = v;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      (out[it.key] as number) = Math.min(it.max, Math.max(it.min, v));
    }
  }
  return out;
}

function read(): QualitySettings | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Stored;
    if (d.v !== VERSION) return null;
    return sanitizeQuality(d);
  } catch {
    return null;
  }
}

function write(q: QualitySettings): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...q }));
  } catch {
    /* storage unavailable — the choice just won't persist */
  }
}

type Listener = (q: QualitySettings) => void;

let active: QualitySettings = read() ?? { ...QUALITY_PRESETS[detectPreset()] };
/** dev tools only: a non-persisting override, so the procgen viewer and the
 * level editor always judge art at full quality whatever the player chose */
let override: QualitySettings | null = null;
const listeners = new Set<Listener>();

/** the settings every renderer reads this frame */
export const quality = (): Readonly<QualitySettings> => override ?? active;

/** Dev tools only: pin the live settings without touching the saved choice.
 * Pass `null` to hand control back to the player's settings. */
export function overrideQuality(q: QualitySettings | null): void {
  override = q ? { ...q } : null;
  for (const l of listeners) l(quality());
}

/** the preset the live settings match, or `custom` */
export const qualityLevel = (): QualityLevel => presetOf(active);

/** change some dials; persists and notifies */
export function setQuality(patch: Partial<QualitySettings>): void {
  active = sanitizeQuality(patch, active);
  write(active);
  for (const l of listeners) l(active);
}

/** jump to a preset wholesale */
export function applyQualityPreset(name: QualityPreset): void {
  setQuality({ ...QUALITY_PRESETS[name] });
}

/** subscribe to changes (for the renderer-level settings that can't be read
 * per frame); returns the unsubscribe */
export function onQuality(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Detail multiplier for the creature / reef views: a dial at 0 still draws
 * the whole animal, just without the fine skin work, so the range is 0.35..1
 * rather than 0..1.
 */
export const detailK = (v: number): number => 0.35 + 0.65 * v;
