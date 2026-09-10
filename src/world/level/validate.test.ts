import { describe, expect, it } from "vitest";
import crossing from "../levels/crossing.json";
import { parseLevel } from "./validate";

describe("parseLevel", () => {
  it("accepts the shipped crossing level unchanged", () => {
    const def = parseLevel(crossing, "crossing");
    expect(def.id).toBe("crossing");
    expect(def.zones[0].x).toBe(0);
    expect(def.zones).toHaveLength(crossing.zones.length);
    expect(def.spawns).toHaveLength(crossing.spawns.length);
    // colours are normalised from "0x..." strings to packed ints
    expect(def.zones[0].shelf).toBe(0x17546f);
  });

  it("rejects a level whose id does not match the requested id", () => {
    expect(() => parseLevel(crossing, "other")).toThrow(/expected "other"/);
  });

  it("requires the first zone to start at x = 0", () => {
    const bad = { ...crossing, zones: [{ ...crossing.zones[0], x: 5 }] };
    expect(() => parseLevel(bad, "crossing")).toThrow(
      /zones\[0\]\.x must be 0/,
    );
  });

  it("requires zone x to strictly increase", () => {
    const bad = {
      ...crossing,
      zones: [crossing.zones[0], { ...crossing.zones[1], x: 0 }],
    };
    expect(() => parseLevel(bad, "crossing")).toThrow(/must increase/);
  });

  it("rejects an unknown spawn kind", () => {
    const bad = {
      ...crossing,
      spawns: [{ kind: "dolphin", mode: "place", items: [] }],
    };
    expect(() => parseLevel(bad, "crossing")).toThrow(/kind must be one of/);
  });

  it("rejects a leg that finishes before it starts", () => {
    const bad = { ...crossing, leg: { startX: 100, finishX: 50 } };
    expect(() => parseLevel(bad, "crossing")).toThrow(/finishX must be past/);
  });
});
