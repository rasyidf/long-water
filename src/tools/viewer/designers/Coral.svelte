<script lang="ts">
  import { onDestroy } from "svelte";

  import { KIND_COUNT, KIND_NAMES } from "../../../render/coral/geometry";
  import {
    cloneCoralParams,
    CORAL_DEFAULTS,
    setCoralParams,
    type CoralParams,
  } from "../../../render/coral/params";
  import { buildCoralLevel } from "../../../world/designerScene";
  import {
    CORAL_SOURCE,
    CoralDesigner,
    SECTIONS,
    SHEET_DEFAULTS,
    type CoralSheetParams,
  } from "../../coralDesigner";
  import Panel from "../../lib/Panel.svelte";
  import PixiStage from "../../lib/PixiStage.svelte";
  import SceneDesigner from "../../lib/SceneDesigner.svelte";
  import Slider from "../../lib/Slider.svelte";
  import Toggle from "../../lib/Toggle.svelte";

  /** `body` — one growth per kind on a flat rock, every dial live;
   *  `scene` — the level-driven scatter over a real shelf */
  let mode = $state<"body" | "scene">("body");

  // ── the live reef dials, shared by both modes ────────────────────────────
  // The renderers read a plain object at a few hundred samples a frame, so
  // push a snapshot rather than the reactive proxy — and restore the defaults
  // on the way out, since the hook is module-level.
  let params = $state<CoralParams>(cloneCoralParams());
  $effect(() => {
    setCoralParams($state.snapshot(params) as CoralParams);
  });
  onDestroy(() => {
    setCoralParams(null);
    delete (window as unknown as Record<string, unknown>).__coral;
  });

  // ── body mode ────────────────────────────────────────────────────────────
  const sheet = $state<CoralSheetParams>({ ...SHEET_DEFAULTS });
  let bump = $state(0); // ticked when the designer mutates hot / pins / kinds
  let designer = $state<CoralDesigner | undefined>();

  function mount(el: HTMLDivElement) {
    const d = new CoralDesigner(el, sheet, () => (bump += 1));
    d.init().then(() => (designer = d));
    return () => {
      d.dispose();
      designer = undefined;
    };
  }

  // Scripting hook for the screenshot harness (`scripts/shot-coral.mjs`), the
  // same shape as `window.__whaleDesigner` / `window.__ocean`.
  (window as unknown as Record<string, unknown>).__coral = {
    get params() {
      return params;
    },
    get sheet() {
      return sheet;
    },
    set: (patch: Partial<CoralParams>) => Object.assign(params, patch),
    setSheet: (patch: Partial<CoralSheetParams>) => Object.assign(sheet, patch),
    only: (kinds: number[]) => designer?.only(kinds),
    mode: (m: "body" | "scene") => (mode = m),
    get ready() {
      return mode === "body" ? !!designer : true;
    },
  };

  const hot = $derived.by(() => {
    void bump;
    return designer?.hot ?? null;
  });
  const pinned = $derived.by(() => {
    void bump;
    return designer?.pinnedOff ?? new Set<string>();
  });
  const hiddenKinds = $derived.by(() => {
    void bump;
    return designer?.hiddenKinds ?? new Set<number>();
  });
  /** the source block to show: a section with its own header, else the one
   * isolated kind's block (or the sea fan's when the whole sheet is up) */
  const src = $derived.by(() => {
    if (!hot) return undefined;
    if (hot === "shadow" || hot === "holdfast") return CORAL_SOURCE.get(hot);
    const shown = Array.from({ length: KIND_COUNT }, (_, k) => k).filter(
      (k) => !hiddenKinds.has(k),
    );
    const k = shown.length === 1 ? shown[0] : 0;
    return CORAL_SOURCE.get(`kind:${k}`);
  });
  const hotLabel = $derived(SECTIONS.find((s) => s.id === hot)?.label);

  function resetAll() {
    Object.assign(params, CORAL_DEFAULTS);
    designer?.reset();
  }

  // ── scene mode ───────────────────────────────────────────────────────────
  let seed = $state(3);
  let patchCount = $state(4);
  let kinds = $state(KIND_COUNT);
  let scaleLo = $state(0.75);
  let scaleHi = $state(1.7);
  let gap = $state(2600);
  let reef = $state(true);

  const level = $derived(
    buildCoralLevel({
      patchCount,
      kinds,
      scale: [scaleLo, Math.max(scaleLo, scaleHi)],
      gap,
      reef,
    }),
  );
</script>

{#snippet dials()}
  <h3>growth</h3>
  <Slider
    label="height"
    bind:value={params.heightScale}
    min={0.4}
    max={2}
    step={0.01}
    fmt={(v) => `${v.toFixed(2)}×`}
  />
  <Slider
    label="spread"
    bind:value={params.spread}
    min={0.5}
    max={1.8}
    step={0.01}
    fmt={(v) => `${v.toFixed(2)}×`}
  />
  <Slider
    label="branch depth"
    bind:value={params.branchDepth}
    min={1}
    max={4}
  />
  <Slider
    label="branch spread"
    bind:value={params.branchSpread}
    min={0.4}
    max={1.8}
    step={0.01}
    fmt={(v) => `${v.toFixed(2)}×`}
  />

  <h3>current</h3>
  <Slider label="sway" bind:value={params.sway} min={0} max={2} step={0.01} />
  <Slider
    label="current speed"
    bind:value={params.currentSpeed}
    min={0}
    max={3}
    step={0.05}
    fmt={(v) => `${v.toFixed(2)}×`}
  />
  <Slider
    label="surge length"
    bind:value={params.currentScale}
    min={150}
    max={3000}
    step={50}
    fmt={(v) => `${Math.round(v / 10)} m`}
  />
  <Slider label="gust" bind:value={params.gust} min={0} max={1} step={0.01} />
  <Slider
    label="fan flutter"
    bind:value={params.flutter}
    min={0}
    max={2}
    step={0.01}
  />
  <Slider label="current seed" bind:value={params.seed} min={1} max={200} />

  <h3>polyps</h3>
  <Slider
    label="density"
    bind:value={params.polypDensity}
    min={0}
    max={2}
    step={0.01}
  />
  <Slider
    label="pulse"
    bind:value={params.polypPulse}
    min={0}
    max={2}
    step={0.01}
  />

  <h3>colour & light</h3>
  <Slider
    label="hue jitter"
    bind:value={params.hueJitter}
    min={0}
    max={1}
    step={0.01}
  />
  <Slider
    label="sink into water"
    bind:value={params.sink}
    min={0}
    max={1}
    step={0.01}
  />
  <Slider
    label="rim light"
    bind:value={params.rim}
    min={0}
    max={2}
    step={0.01}
  />
{/snippet}

<div class="modes">
  <button
    type="button"
    class:on={mode === "body"}
    onclick={() => (mode = "body")}>body</button
  >
  <button
    type="button"
    class:on={mode === "scene"}
    onclick={() => (mode = "scene")}>scene</button
  >
</div>

{#if mode === "body"}
  <Panel title="Coral — Procedural Coral View">
    <Slider
      label="zoom"
      bind:value={sheet.zoom}
      min={0.5}
      max={6}
      step={0.05}
      fmt={(v) => `${v.toFixed(2)}×`}
    />
    <Slider
      label="item scale"
      bind:value={sheet.scale}
      min={0.3}
      max={2.5}
      step={0.05}
      fmt={(v) => v.toFixed(2)}
    />
    <Slider label="genome seed" bind:value={sheet.seed} min={0} max={60} />
    <Slider
      label="ambient light"
      bind:value={sheet.light}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="sonar lit"
      bind:value={sheet.sonar}
      min={0}
      max={1}
      step={0.01}
    />
    <div class="row">
      <Toggle label="freeze" bind:value={sheet.freeze} />
      <button type="button" onclick={resetAll}>reset</button>
    </div>

    {@render dials()}

    <h3>kinds</h3>
    <div class="chips">
      {#each KIND_NAMES as name, k (name)}
        <button
          type="button"
          class="chip"
          class:off={hiddenKinds.has(k)}
          title="click to hide / show · shift-click to isolate"
          onclick={(e) =>
            e.shiftKey ? designer?.only([k]) : designer?.toggleKind(k)}
          >{name}</button
        >
      {/each}
      <button type="button" class="chip" onclick={() => designer?.only([])}
        >all</button
      >
    </div>

    <h3>draw sections</h3>
    <div class="sections">
      {#each SECTIONS as meta (meta.id)}
        <div
          class="lyr"
          class:hot={hot === meta.id}
          class:off={pinned.has(meta.id)}
          role="button"
          tabindex="0"
          onpointerenter={() => designer?.setHot(meta.id)}
          onpointerleave={() => designer?.setHot(null)}
          onclick={() => designer?.togglePinned(meta.id)}
          onkeydown={(e) =>
            e.key === "Enter" && designer?.togglePinned(meta.id)}
        >
          <span class="sw"></span><span>{meta.label}</span>
        </div>
      {/each}
    </div>
  </Panel>

  <PixiStage {mount} />

  {#if src}
    <div class="code">
      <header>
        <span><b>{hotLabel}</b> · ProceduralCoralView.ts:{src.line}</span>
      </header>
      <pre>{src.code}</pre>
    </div>
  {/if}
{:else}
  <SceneDesigner
    title="Coral / reef"
    {level}
    bind:seed
    loadOpts={{ focus: { x: 2200, y: 750, scale: 0.55 } }}
  >
    {#snippet controls()}
      <Slider label="patch count" bind:value={patchCount} min={1} max={10} />
      <Slider label="coral kinds" bind:value={kinds} min={1} max={KIND_COUNT} />
      <Slider
        label="scale min"
        bind:value={scaleLo}
        min={0.3}
        max={2.5}
        step={0.05}
        fmt={(v) => v.toFixed(2)}
      />
      <Slider
        label="scale max"
        bind:value={scaleHi}
        min={0.3}
        max={2.5}
        step={0.05}
        fmt={(v) => v.toFixed(2)}
      />
      <Slider
        label="gap between patches"
        bind:value={gap}
        min={800}
        max={6000}
        step={100}
      />
      <Toggle label="reef + attached school" bind:value={reef} />

      {@render dials()}
    {/snippet}
  </SceneDesigner>
{/if}

<style>
  .modes {
    position: fixed;
    top: 10px;
    left: 168px;
    z-index: 2;
    display: flex;
    gap: 4px;
    padding: 0 0 0 292px;
  }
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
    margin: 10px 0;
  }
  h3 {
    margin: 14px 0 4px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dim);
  }
  .chips,
  .sections {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .sections {
    flex-direction: column;
    gap: 0;
  }
  .chip {
    font-size: 10px;
    padding: 2px 6px;
  }
  .chip.off {
    opacity: 0.35;
    text-decoration: line-through;
  }
  .lyr {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
    cursor: pointer;
  }
  .lyr:hover,
  .lyr.hot {
    background: rgba(110, 199, 220, 0.16);
  }
  .lyr.off {
    opacity: 0.4;
  }
  .lyr .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--accent);
    flex: none;
  }
  .code {
    position: fixed;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    width: min(720px, 70vw);
    max-height: 42vh;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .code header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    color: var(--dim);
  }
  .code header b {
    color: var(--ink);
  }
  .code pre {
    margin: 0;
    padding: 10px 12px;
    overflow: auto;
    font-size: 11px;
    tab-size: 2;
  }
</style>
