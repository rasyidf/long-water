# Roadmap index

Each doc here covers one concern end to end: current state, gaps, concrete next steps. Read
[ANALYSIS.md](../ANALYSIS.md) first for the overall picture these plans are answering.

| Doc | Covers | Depends on |
|---|---|---|
| [engineering-foundations.md](engineering-foundations.md) | Tests, CI, perf profiling, tuning-surface consolidation | none — do this first |
| [gameplay-and-content.md](gameplay-and-content.md) | Level-builder tool, more legs, difficulty, mechanic vetting against the pillars | engineering-foundations (tests before content scales) |
| [rendering-and-visuals.md](rendering-and-visuals.md) | Points at `whale-rendering-roadmap.md` / `reef-and-wfc-notes.md`, plus un-ticketed atmosphere backlog | engineering-foundations (#26 Mesh decision) |
| [audio.md](audio.md) | Ambient/mixing gaps, accessibility captions for audio-driven mechanics | none |
| [ux-accessibility-mobile.md](ux-accessibility-mobile.md) | Input remapping, touch, colorblind/reduced-motion, second locale | engineering-foundations (input changes want test coverage) |
| [release-ops.md](release-ops.md) | Deploy pipeline, save/version migration policy, telemetry | engineering-foundations (CI is the deploy gate) |

## Suggested order

1. **engineering-foundations** — nothing else compounds safely without tests + CI. This is the
   cheapest doc to act on immediately (the `build` script already does `lint → tsc → vite build`;
   CI is close to a copy-paste).
2. **gameplay-and-content** and **rendering-and-visuals** in parallel — content and visual work
   don't block each other, and rendering already has two detailed existing docs to execute against.
3. **audio** and **ux-accessibility-mobile** — pick up once the core loop and rendering are stable;
   remapping/touch/captions are easiest to design after mechanics stop moving.
4. **release-ops** — becomes urgent once the project is actually being pushed to players; the
   splash/branding work already underway (`e8ae9f0`, `1a1c049`) and the in-flight `deploy` script
   in `package.json` suggest this is closer than the others.

Each doc is meant to grow independently — add sections to the relevant doc rather than starting a
new one, unless a genuinely new concern shows up.
