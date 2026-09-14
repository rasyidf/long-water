/**
 * Named sea states for the procgen playground (`tools.html#ocean`). Each one is
 * a patch over {@link OCEAN_DEFAULTS}, so a preset only has to say what makes
 * it itself — and adding a dial to `OceanParams` never means editing all of
 * them. They double as documentation of what the ranges are actually for.
 */
import { cloneOceanParams, type OceanParams } from "./params";

export interface OceanPreset {
  id: string;
  label: string;
  /** one line on what this sea state is demonstrating */
  note: string;
  apply: (p: OceanParams) => void;
}

export const OCEAN_PRESETS: readonly OceanPreset[] = [
  {
    id: "default",
    label: "Long Water",
    note: "the shipped look — moderate swell, early afternoon",
    apply: () => {},
  },
  {
    id: "glassy",
    label: "Glassy calm",
    note: "almost no wind: long low swell, no breaking, hard sun glitter",
    apply: (p) => {
      p.wave.wind = 0.28;
      p.wave.steep = 0.18;
      p.wave.groupiness = 0.2;
      p.wave.chopHeight = 0.5;
      p.wave.foamStart = 0.4;
      p.sky.timeOfDay = 0.5;
      p.sky.cloudCover = 0.18;
      p.sky.glitter = 1;
      p.sky.haze = 0.3;
      p.column.causticStrength = 1.4;
      // clear water: little silt, a crisp thermocline, plankton lighting up
      p.water.murk = 0.12;
      p.water.absorption = 0.15;
      p.water.thermoclineStrength = 0.55;
      p.water.current = 6;
      p.water.sparks = 0.9;
    },
  },
  {
    id: "trades",
    label: "Trade winds",
    note: "steady wind: crests in clear sets, scattered whitecaps",
    apply: (p) => {
      p.wave.wind = 1.25;
      p.wave.steep = 0.66;
      p.wave.groupiness = 0.6;
      p.wave.chopHeight = 3.4;
      p.wave.foamStart = 0.22;
      p.sky.timeOfDay = 0.46;
      p.sky.cloudCover = 0.66;
      p.sky.cloudPuff = 0.85;
      p.sky.cloudDrift = 2.6;
      p.sky.birds = 2.6;
      // a working sea stirs the column up a little
      p.water.murk = 0.45;
      p.water.current = 24;
      p.water.murkDrift = 18;
    },
  },
  {
    id: "gale",
    label: "Gale",
    note: "cusped crests breaking almost everywhere, spray, flat grey light",
    apply: (p) => {
      p.wave.wind = 2.1;
      p.wave.steep = 0.92;
      p.wave.groupiness = 0.75;
      p.wave.groupLength = 1800;
      p.wave.chopHeight = 6;
      p.wave.chopDrift = 60;
      p.wave.foamStart = 0.14;
      p.wave.foamAmount = 1;
      p.wave.foamPatchiness = 0.35;
      p.sky.timeOfDay = 0.4;
      p.sky.cloudCover = 1;
      p.sky.cloudPuff = 0.28;
      p.sky.cloudScale = 0.7;
      p.sky.cloudBase = 0.16;
      p.sky.cloudDrift = 6;
      p.sky.glitter = 0.15;
      p.sky.birds = 0;
      p.column.shaftStrength = 0.35;
      p.column.causticStrength = 0.4;
      // churned: heavy silt, a fast current, the thermocline torn up
      p.water.murk = 0.85;
      p.water.murkScale = 1300;
      p.water.murkDrift = 40;
      p.water.absorption = 0.45;
      p.water.thermoclineStrength = 0.1;
      p.water.current = 60;
      p.water.snowDrift = 14;
      p.water.sparks = 0.3;
    },
  },
  {
    id: "dawn",
    label: "Dawn",
    note: "sun on the horizon: long flare, warm haze, a low glitter path",
    apply: (p) => {
      p.wave.wind = 0.7;
      p.wave.steep = 0.45;
      p.sky.timeOfDay = 0.258;
      p.sky.cloudCover = 0.6;
      p.sky.cloudPuff = 0.35;
      p.sky.haze = 1;
      p.sky.glitter = 1;
      p.sky.birds = 3.5;
      // low light coming in sideways: the column goes blue fast
      p.water.absorption = 0.4;
      p.water.murk = 0.3;
    },
  },
  {
    id: "moonlit",
    label: "Moonlit",
    note: "night: stars out, a crescent, and almost no light in the column",
    apply: (p) => {
      p.wave.wind = 0.85;
      p.wave.steep = 0.6;
      p.sky.timeOfDay = 0.94;
      p.sky.cloudCover = 0.24;
      p.sky.stars = 1;
      p.sky.haze = 0.25;
      p.sky.birds = 0;
      // the dark is where the plankton show
      p.water.sparks = 1;
      p.water.sparkSize = 1.3;
      p.water.murk = 0.2;
      p.water.absorption = 0.35;
    },
  },
];

/** the params for a preset id, built fresh from the defaults each time */
export function oceanPreset(id: string): OceanParams {
  const p = cloneOceanParams();
  OCEAN_PRESETS.find((x) => x.id === id)?.apply(p);
  return p;
}
