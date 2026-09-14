<script lang="ts">
  import { onDestroy } from "svelte";

  import {
    cloneSquidLook,
    setSquidLook,
    SQUID_DEFAULTS,
    type SquidLook,
  } from "../../../render/squid/params";
  import type { SquidState } from "../../../state/Squid";
  import { buildSquidLevel } from "../../../world/designerScene";
  import Panel from "../../lib/Panel.svelte";
  import PixiStage from "../../lib/PixiStage.svelte";
  import SceneDesigner from "../../lib/SceneDesigner.svelte";
  import Slider from "../../lib/Slider.svelte";
  import Toggle from "../../lib/Toggle.svelte";
  import {
    SECTIONS,
    SQUID_PARAMS,
    SQUID_SOURCE,
    SquidDesigner,
    STATE_POSES,
    type SquidParams,
  } from "../../squidDesigner";

  /** body: one squid, every dial; scene: a level full of them, as the game
   * places them. The look edited in body mode is pushed live so scene mode
   * shows the same animal. */
  let mode = $state<"body" | "scene">("body");

  // ── body mode ────────────────────────────────────────────────────────────
  const params = $state<SquidParams>({ ...SQUID_PARAMS });
  const look = $state<SquidLook>(cloneSquidLook());
  let bump = $state(0); // ticked when the designer mutates heading / hot / pins
  let designer = $state<SquidDesigner | undefined>();

  // The view reads a plain object many times a frame, so push a snapshot
  // rather than the reactive proxy — and restore the defaults on the way out,
  // since the hook is module-level.
  $effect(() => {
    setSquidLook($state.snapshot(look) as SquidLook);
  });
  onDestroy(() => {
    setSquidLook(null);
    delete (window as unknown as Record<string, unknown>).__squid;
  });

  function mount(el: HTMLDivElement) {
    const d = new SquidDesigner(el, params, look, () => (bump += 1));
    d.init().then(() => {
      designer = d;
    });
    return () => {
      d.dispose();
      if (designer === d) designer = undefined;
    };
  }

  // Scripting hook for `scripts/shot-squid.mjs`, the same shape as
  // `window.__whaleDesigner` — installed for both modes so a script can flip.
  (window as unknown as Record<string, unknown>).__squid = {
    params,
    look,
    get mode() {
      return mode;
    },
    set mode(m: "body" | "scene") {
      mode = m;
    },
    set: (patch: Partial<SquidParams>) => Object.assign(params, patch),
    setLook: (patch: Partial<SquidLook>) => Object.assign(look, patch),
    pose: usePose,
  };

  function usePose(state: SquidState) {
    const pose = STATE_POSES[state];
    params.state = state;
    params.flare = pose.flare;
    params.arousal = pose.arousal;
    params.grip = pose.grip;
  }

  function resetLook() {
    Object.assign(look, SQUID_DEFAULTS);
  }

  const hot = $derived.by(() => {
    void bump;
    return designer?.hot ?? null;
  });
  const pinned = $derived.by(() => {
    void bump;
    return designer?.pinnedOff ?? new Set<string>();
  });
  const src = $derived(hot ? SQUID_SOURCE.get(hot) : undefined);
  const hotLabel = $derived(SECTIONS.find((s) => s.id === hot)?.label);
  const headingLabel = $derived.by(() => {
    void bump;
    return `${params.headingDeg.toFixed(0)}°`;
  });

  // ── scene mode ───────────────────────────────────────────────────────────
  let seed = $state(3);
  let step = $state(2200);
  let sizeLo = $state(0.8);
  let sizeHi = $state(1.3);
  let yLo = $state(2200);
  let yHi = $state(3200);

  const level = $derived(
    buildSquidLevel({
      step,
      size: [sizeLo, Math.max(sizeLo, sizeHi)],
      yBand: [yLo, Math.max(yLo, yHi)],
    }),
  );

  const STATES: SquidState[] = ["lurk", "stalk", "strike", "latched", "flee"];
</script>

{#snippet modeSwitch()}
  <div class="mode">
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
{/snippet}

{#if mode === "body"}
  <Panel title="Squid — Procedural Squid View">
    {@render modeSwitch()}

    <h3>pose</h3>
    <div class="row">
      {#each STATES as s (s)}
        <button
          type="button"
          class:on={params.state === s}
          onclick={() => usePose(s)}>{s}</button
        >
      {/each}
    </div>
    <Slider
      label="flare"
      bind:value={params.flare}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="arousal"
      bind:value={params.arousal}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="heading"
      bind:value={params.headingDeg}
      min={-180}
      max={180}
      fmt={() => headingLabel}
    />
    <Slider
      label="spin"
      bind:value={params.spin}
      min={-180}
      max={180}
      step={5}
      fmt={(v) => `${v}°/s`}
    />
    <Slider
      label="jet rate"
      bind:value={params.jetRate}
      min={0}
      max={10}
      step={0.1}
      fmt={(v) => `${v.toFixed(1)} rad/s`}
    />
    <div class="row">
      <Toggle label="swim" bind:value={params.swim} />
      <Toggle label="grip target" bind:value={params.grip} />
      <Toggle label="flare sheet" bind:value={params.sheet} />
    </div>

    <h3>individual</h3>
    <Slider
      label="size"
      bind:value={params.size}
      min={0.4}
      max={2}
      step={0.05}
      fmt={(v) => `${v.toFixed(2)}×`}
    />
    <Slider
      label="seed (ph)"
      bind:value={params.seed}
      min={0}
      max={6.28}
      step={0.01}
      fmt={(v) => v.toFixed(2)}
    />
    <Slider
      label="alpha"
      bind:value={params.alpha}
      min={0.05}
      max={1}
      step={0.01}
    />
    <Slider
      label="zoom"
      bind:value={params.zoom}
      min={0.2}
      max={6}
      step={0.05}
      fmt={(v) => `${v.toFixed(2)}×`}
    />
    <div class="row">
      <button type="button" onclick={() => designer?.reset()}>reset pose</button
      >
    </div>

    <h3>look</h3>
    <Slider
      label="mantle length"
      bind:value={look.mantleLen}
      min={40}
      max={200}
    />
    <Slider label="mantle girth" bind:value={look.mantleW} min={8} max={48} />
    <Slider label="head radius" bind:value={look.headR} min={6} max={36} />
    <Slider
      label="fin root"
      bind:value={look.finRoot}
      min={0.1}
      max={0.8}
      step={0.01}
    />
    <Slider
      label="fin length"
      bind:value={look.finLen}
      min={0.1}
      max={0.8}
      step={0.01}
    />
    <Slider
      label="fin span"
      bind:value={look.finSpan}
      min={0.3}
      max={4}
      step={0.05}
      fmt={(v) => `${v.toFixed(2)}× girth`}
    />
    <Slider
      label="arm length"
      bind:value={look.armLen}
      min={0.2}
      max={1.6}
      step={0.01}
      fmt={(v) => `${v.toFixed(2)}× mantle`}
    />
    <Slider
      label="tentacle length"
      bind:value={look.tentLen}
      min={0.4}
      max={3}
      step={0.01}
      fmt={(v) => `${v.toFixed(2)}× mantle`}
    />
    <Slider label="arm root width" bind:value={look.armW} min={2} max={18} />
    <Slider
      label="arm wave"
      bind:value={look.armWave}
      min={0}
      max={1.5}
      step={0.01}
    />
    <Slider
      label="jet pulse depth"
      bind:value={look.pulseDepth}
      min={0}
      max={0.3}
      step={0.01}
    />
    <Slider
      label="chromatophores"
      bind:value={look.mottle}
      min={0}
      max={2}
      step={0.05}
    />
    <Slider
      label="variety"
      bind:value={look.variety}
      min={0}
      max={1}
      step={0.01}
    />
    <div class="row">
      <button type="button" onclick={resetLook}>reset look</button>
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
        <span><b>{hotLabel}</b> · ProceduralSquidView.ts:{src.line}</span>
      </header>
      <pre>{src.code}</pre>
    </div>
  {/if}
{:else}
  <SceneDesigner
    title="Squid — scene"
    {level}
    bind:seed
    loadOpts={{ focus: { x: 2400, y: 2500, scale: 0.34 } }}
  >
    {#snippet controls()}
      {@render modeSwitch()}
      <Slider
        label="spacing"
        bind:value={step}
        min={600}
        max={5000}
        step={100}
      />
      <Slider
        label="size min"
        bind:value={sizeLo}
        min={0.4}
        max={2}
        step={0.05}
        fmt={(v) => v.toFixed(2)}
      />
      <Slider
        label="size max"
        bind:value={sizeHi}
        min={0.4}
        max={2}
        step={0.05}
        fmt={(v) => v.toFixed(2)}
      />
      <Slider
        label="depth band top"
        bind:value={yLo}
        min={900}
        max={4600}
        step={50}
      />
      <Slider
        label="depth band bottom"
        bind:value={yHi}
        min={900}
        max={4600}
        step={50}
      />
      <p class="hint">
        the look dialled in on the body tab is what these squid are drawn with
      </p>
    {/snippet}
  </SceneDesigner>
{/if}

<style>
  .mode {
    display: flex;
    gap: 4px;
    margin: 0 0 10px;
  }
  .mode button {
    flex: 1;
  }
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 6px 0;
  }
  h3 {
    margin: 14px 0 4px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dim);
  }
  .hint {
    color: var(--dim);
    font-size: 11px;
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
