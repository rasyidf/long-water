<script lang="ts">
  import PixiStage from "../../lib/PixiStage.svelte";
  import Panel from "../../lib/Panel.svelte";
  import Slider from "../../lib/Slider.svelte";
  import Toggle from "../../lib/Toggle.svelte";
  import {
    SECTIONS,
    WHALE_DEFAULTS,
    WHALE_SOURCE,
    WhaleDesigner,
    type WhaleParams,
  } from "../../whaleDesigner";

  const params = $state<WhaleParams>({ ...WHALE_DEFAULTS });
  let bump = $state(0); // ticked when the designer mutates hot / rollDeg / pins
  let designer = $state<WhaleDesigner | undefined>();

  function mount(el: HTMLDivElement) {
    const d = new WhaleDesigner(el, params, () => (bump += 1));
    d.init().then(() => {
      designer = d;
      (window as unknown as Record<string, unknown>).__whaleDesigner = {
        params,
        set: (patch: Partial<WhaleParams>) => Object.assign(params, patch),
      };
    });
    return () => d.dispose();
  }

  const hot = $derived.by(() => {
    void bump;
    return designer?.hot ?? null;
  });
  const pinned = $derived.by(() => {
    void bump;
    return designer?.pinnedOff ?? new Set<string>();
  });
  const src = $derived(hot ? WHALE_SOURCE.get(hot) : undefined);
  const hotLabel = $derived(SECTIONS.find((s) => s.id === hot)?.label);
</script>

<Panel title="Whale — Procedural Whale View">
  <Slider label="width" bind:value={params.width} min={8} max={72} />
  <Slider label="juv" bind:value={params.juv} min={0} max={1} step={0.01} />
  <Slider
    label="roll"
    bind:value={params.rollDeg}
    min={-180}
    max={180}
    fmt={(v) => `${v}°`}
  />
  <Slider
    label="spin"
    bind:value={params.spin}
    min={-180}
    max={180}
    step={5}
    fmt={(v) => `${v}°/s`}
  />
  <Slider label="rollK" bind:value={params.rollK} min={0} max={1} step={0.01} />
  <Slider
    label="alpha"
    bind:value={params.alpha}
    min={0.1}
    max={1}
    step={0.01}
  />
  <Slider label="seed" bind:value={params.seed} min={0} max={24} />
  <Slider
    label="zoom"
    bind:value={params.zoom}
    min={0.3}
    max={4}
    step={0.05}
    fmt={(v) => `${v.toFixed(2)}×`}
  />
  <Slider label="bend" bind:value={params.bend} min={-1} max={1} step={0.01} />
  <Slider label="wave" bind:value={params.wave} min={0} max={20} step={0.5} />

  <div class="row">
    <button
      type="button"
      onclick={() => (params.facing = params.facing === 1 ? -1 : 1)}
      >facing {params.facing === 1 ? "►" : "◄"}</button
    >
    <Toggle label="swim" bind:value={params.swim} />
    <Toggle label="roll sheet" bind:value={params.sheet} />
    <button type="button" onclick={() => designer?.reset()}>reset</button>
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
        onkeydown={(e) => e.key === "Enter" && designer?.togglePinned(meta.id)}
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
      <span><b>{hotLabel}</b> · ProceduralWhaleView.ts:{src.line}</span>
    </header>
    <pre>{src.code}</pre>
  </div>
{/if}

<style>
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 10px 0;
  }
  h3 {
    margin: 14px 0 4px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dim);
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
