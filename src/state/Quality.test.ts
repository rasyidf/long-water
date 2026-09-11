import { describe, expect, it } from "vitest";

import {
  detailK,
  detectPreset,
  presetOf,
  QUALITY_ITEMS,
  QUALITY_PRESETS,
  sanitizeQuality,
} from "./Quality";

describe("quality presets", () => {
  it("every preset sets every dial within its control's bounds", () => {
    for (const p of Object.values(QUALITY_PRESETS)) {
      for (const it of QUALITY_ITEMS) {
        const v = p[it.key];
        if (it.kind === "toggle") expect(typeof v).toBe("boolean");
        else {
          expect(typeof v).toBe("number");
          expect(v as number).toBeGreaterThanOrEqual(it.min);
          expect(v as number).toBeLessThanOrEqual(it.max);
        }
      }
    }
  });

  it("orders low ≤ medium ≤ high on every numeric dial", () => {
    for (const it of QUALITY_ITEMS) {
      if (it.kind !== "range") continue;
      const lo = QUALITY_PRESETS.low[it.key] as number;
      const md = QUALITY_PRESETS.medium[it.key] as number;
      const hi = QUALITY_PRESETS.high[it.key] as number;
      expect(lo).toBeLessThanOrEqual(md);
      expect(md).toBeLessThanOrEqual(hi);
    }
  });

  it("high leaves everything on at full strength", () => {
    for (const it of QUALITY_ITEMS) {
      const v = QUALITY_PRESETS.high[it.key];
      expect(v).toBe(it.kind === "toggle" ? true : it.max);
    }
  });

  it("recognises each preset and calls anything else custom", () => {
    expect(presetOf(QUALITY_PRESETS.low)).toBe("low");
    expect(presetOf(QUALITY_PRESETS.medium)).toBe("medium");
    expect(presetOf(QUALITY_PRESETS.high)).toBe("high");
    expect(presetOf({ ...QUALITY_PRESETS.high, murk: 0.5 })).toBe("custom");
    expect(presetOf({ ...QUALITY_PRESETS.high, bloom: false })).toBe("custom");
  });
});

describe("sanitizeQuality", () => {
  it("clamps ranges, ignores garbage, keeps the base for missing keys", () => {
    const q = sanitizeQuality(
      { renderScale: 5, murk: -1, bloom: "yes" as unknown as boolean },
      QUALITY_PRESETS.medium,
    );
    expect(q.renderScale).toBe(1);
    expect(q.murk).toBe(0);
    expect(q.bloom).toBe(QUALITY_PRESETS.medium.bloom);
    expect(q.snow).toBe(QUALITY_PRESETS.medium.snow);
  });

  it("drops non-finite numbers", () => {
    const q = sanitizeQuality({ godRays: NaN }, QUALITY_PRESETS.high);
    expect(q.godRays).toBe(1);
  });
});

describe("detectPreset", () => {
  it("starts phones and small machines on medium, the rest on high", () => {
    expect(detectPreset({ userAgent: "Mozilla/5.0 (iPhone)" })).toBe("medium");
    expect(detectPreset({ hardwareConcurrency: 4 })).toBe("medium");
    expect(detectPreset({ deviceMemory: 4 })).toBe("medium");
    expect(
      detectPreset({
        userAgent: "Mozilla/5.0 (X11; Linux)",
        hardwareConcurrency: 8,
        deviceMemory: 16,
      }),
    ).toBe("high");
    expect(detectPreset({})).toBe("high");
  });
});

describe("detailK", () => {
  it("never switches the body itself off", () => {
    expect(detailK(0)).toBeGreaterThan(0.3);
    expect(detailK(1)).toBe(1);
  });
});
