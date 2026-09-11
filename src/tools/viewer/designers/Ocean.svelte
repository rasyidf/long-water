<script lang="ts">
  import { onDestroy } from "svelte";
  import { SvelteSet } from "svelte/reactivity";

  import { UNIT_M } from "../../../config/constants";
  import {
    OCEAN_SECTIONS,
    type OceanSection,
  } from "../../../render/ocean/OceanView";
  import {
    cloneOceanParams,
    setOceanParams,
    setOceanSections,
    type OceanParams,
  } from "../../../render/ocean/params";
  import { OCEAN_PRESETS, oceanPreset } from "../../../render/ocean/presets";
  import { skyLight } from "../../../render/ocean/sky";
  import {
    traceSurface,
    waveEnvelope,
    waveK,
    waveOmega,
  } from "../../../render/ocean/surface";
  import {
    buildOceanLevel,
    type OceanSceneParams,
  } from "../../../world/designerScene";
  import type { SceneHost } from "../../SceneHost";
  import SceneDesigner from "../../lib/SceneDesigner.svelte";
  import Slider from "../../lib/Slider.svelte";
  import Toggle from "../../lib/Toggle.svelte";

  let seed = $state(20260907);
  let preset = $state("default");
  let params = $state<OceanParams>(cloneOceanParams());
  // ships are off by default: their noise footprint is a big translucent disc
  // drawn over the whole waterline, which is exactly what this tab is judging
  const scene = $state<OceanSceneParams>({
    ships: false,
    pod: true,
    fish: true,
    snow: true,
  });

  /** draw blocks the designer has switched off. `SvelteSet`, not a plain one:
   * `$state` does not proxy Set mutations, so a raw Set would never re-run the
   * effect that pushes the hidden list at the renderers. */
  const hidden = new SvelteSet<OceanSection>();
  /** run the clock through a whole day on a loop */
  let dayCycle = $state(false);
  let dayLength = $state(60);

  const level = $derived(buildOceanLevel({ ...scene }));

  // The renderers read plain objects at ~500 samples a frame, so push a
  // snapshot rather than the reactive proxy — and restore the defaults on the
  // way out, since the hook is module-level.
  $effect(() => {
    setOceanParams($state.snapshot(params) as OceanParams);
  });
  $effect(() => {
    const off = new Set(hidden);
    setOceanSections(off.size ? (s) => !off.has(s) : null);
  });
  onDestroy(() => {
    setOceanParams(null);
    setOceanSections(null);
    delete (window as unknown as Record<string, unknown>).__ocean;
  });

  // Scripting hook for the screenshot harness (`scripts/shot-ocean.mjs`), the
  // same shape as `window.__whaleDesigner`. Driving the dials from here beats
  // clicking sliders, and it lets a verification run isolate one draw block.
  (window as unknown as Record<string, unknown>).__ocean = {
    get params() {
      return params;
    },
    get stats() {
      return stats;
    },
    /** the live scene, for a script that needs to poke at layers or stores */
    get context() {
      return host?.context ?? null;
    },
    preset: usePreset,
    patch: (group: "wave" | "sky" | "column", v: Record<string, number>) =>
      Object.assign(params[group], v),
    only: (list: OceanSection[]) => {
      hidden.clear();
      for (const s of OCEAN_SECTIONS) if (!list.includes(s)) hidden.add(s);
    },
    all: () => hidden.clear(),
    camera: (y: number, scale: number) => host && look(host, y, scale),
  };

  $effect(() => {
    if (!dayCycle) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      params.sky.timeOfDay = (params.sky.timeOfDay + dt / dayLength) % 1;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  function usePreset(id: string) {
    preset = id;
    params = oceanPreset(id);
  }

  function addOctave() {
    const last = params.wave.octaves.at(-1);
    params.wave.octaves.push({
      length: last ? Math.max(40, last.length * 0.5) : 400,
      height: last ? Math.max(0.4, last.height * 0.5) : 6,
      speed: 1,
    });
  }

  // ── readouts ─────────────────────────────────────────────────────────────
  // Judged from the field itself rather than from the dials, so they stay
  // honest when the octaves are edited by hand.
  const stats = $derived.by(() => {
    const w = $state.snapshot(params).wave as OceanParams["wave"];
    const env = waveEnvelope(w);
    let foamy = 0;
    let total = 0;
    let peak = 0;
    for (const t of [0, 3.7, 8.3]) {
      for (const s of traceSurface(w, 0, 12000, 900, t)) {
        total++;
        if (s.foam > 0.06) foamy++;
        peak = Math.max(peak, s.steepness);
      }
    }
    const lead = w.octaves.reduce(
      (a, b) => (b.height * w.wind > a.height * w.wind ? b : a),
      w.octaves[0],
    );
    return {
      /** crest-to-trough, in metres */
      height: env * 2 * UNIT_M,
      period: lead ? Math.abs((Math.PI * 2) / waveOmega(lead)) : 0,
      speed: lead ? Math.abs(waveOmega(lead) / waveK(lead)) * UNIT_M : 0,
      foam: (foamy / Math.max(1, total)) * 100,
      peak,
      light: skyLight(params.sky.timeOfDay),
    };
  });

  const clock = $derived.by(() => {
    const h = params.sky.timeOfDay * 24;
    const hh = Math.floor(h) % 24;
    const mm = Math.floor((h - Math.floor(h)) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  });

  // ── the profile strip ────────────────────────────────────────────────────
  // One flat plot of ~8 wavelengths, drawn at a fixed scale. The Pixi view is
  // the look; this is the shape — it stays readable whatever the camera zoom
  // is doing, which is what you want when tuning steepness and foam.
  let strip = $state<HTMLCanvasElement | undefined>();
  $effect(() => {
    const cv = strip;
    const w = $state.snapshot(params).wave as OceanParams["wave"];
    if (!cv) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = cv.getContext("2d");
      if (!c) return;
      const W = (cv.width = cv.clientWidth * devicePixelRatio);
      const H = (cv.height = cv.clientHeight * devicePixelRatio);
      const t = performance.now() / 1000;
      const span = 9000;
      const mid = H * 0.55;
      const k = (H * 0.4) / Math.max(1e-3, waveEnvelope(w));
      c.clearRect(0, 0, W, H);
      c.strokeStyle = "rgba(255,255,255,0.12)";
      c.beginPath();
      c.moveTo(0, mid);
      c.lineTo(W, mid);
      c.stroke();

      const pts = traceSurface(w, 0, span, 600, t);
      const px = (x: number) => (x / span) * W;
      c.beginPath();
      c.moveTo(px(pts[0].x), mid + pts[0].y * k);
      for (const p of pts) c.lineTo(px(p.x), mid + p.y * k);
      c.lineTo(W, H);
      c.lineTo(0, H);
      c.closePath();
      c.fillStyle = "rgba(110,199,220,0.16)";
      c.fill();
      c.strokeStyle = "#6ec7dc";
      c.lineWidth = 1.5 * devicePixelRatio;
      c.beginPath();
      c.moveTo(px(pts[0].x), mid + pts[0].y * k);
      for (const p of pts) c.lineTo(px(p.x), mid + p.y * k);
      c.stroke();

      // foam marks sit on the crests the field says are breaking
      c.fillStyle = "#ffffff";
      for (const p of pts) {
        if (p.foam < 0.06) continue;
        c.globalAlpha = p.foam;
        c.fillRect(px(p.x) - 1, mid + p.y * k - 3 * devicePixelRatio, 2, 3);
      }
      c.globalAlpha = 1;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  });

  function look(host: SceneHost, y: number, scale: number) {
    host.camera.y = y;
    host.camera.scale = scale;
  }
  let host = $state<SceneHost | undefined>();
</script>

<SceneDesigner
  title="Ocean / sky playground"
  {level}
  bind:seed
  light
  loadOpts={{
    focus: { x: 6000, y: 300, scale: 0.42 },
    whale: { x: 6000, y: 620 },
  }}
  onready={(h) => (host = h)}
>
  {#snippet controls()}
    <h3>sea state</h3>
    <div class="presets">
      {#each OCEAN_PRESETS as p (p.id)}
        <button
          type="button"
          class:on={preset === p.id}
          title={p.note}
          onclick={() => usePreset(p.id)}>{p.label}</button
        >
      {/each}
    </div>

    <h3>sky · {clock}</h3>
    <Slider
      label="time of day"
      bind:value={params.sky.timeOfDay}
      min={0}
      max={0.999}
      step={0.001}
      fmt={() => clock}
    />
    <Toggle label="run the day on a loop" bind:value={dayCycle} />
    {#if dayCycle}
      <Slider
        label="day length"
        bind:value={dayLength}
        min={5}
        max={240}
        step={5}
        fmt={(v) => `${v}s`}
      />
    {/if}
    <Slider
      label="cloud cover"
      bind:value={params.sky.cloudCover}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="cloud size"
      bind:value={params.sky.cloudScale}
      min={0.1}
      max={1.6}
      step={0.01}
      fmt={(v) => `${Math.round(v * 100)}% screen`}
    />
    <Slider
      label="puffy ↔ streaky"
      bind:value={params.sky.cloudPuff}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="cloud drift"
      bind:value={params.sky.cloudDrift}
      min={-10}
      max={10}
      step={0.1}
      fmt={(v) => `${v.toFixed(1)} screens/min`}
    />
    <Slider
      label="cloud decks"
      bind:value={params.sky.cloudDecks}
      min={1}
      max={5}
    />
    <Slider
      label="cloud height"
      bind:value={params.sky.cloudBase}
      min={0}
      max={1}
      step={0.01}
      fmt={(v) => `${Math.round(v * 100)}% up the sky`}
    />
    <Slider
      label="stars"
      bind:value={params.sky.stars}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="horizon haze"
      bind:value={params.sky.haze}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="sun glitter"
      bind:value={params.sky.glitter}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="gulls"
      bind:value={params.sky.birds}
      min={0}
      max={8}
      step={0.1}
      fmt={(v) => `${v.toFixed(1)}/screen`}
    />
    <Slider label="sky seed" bind:value={params.sky.seed} min={1} max={400} />

    <h3>waves</h3>
    <Slider
      label="wind"
      bind:value={params.wave.wind}
      min={0}
      max={2.5}
      step={0.01}
      fmt={(v) => `${v.toFixed(2)}×`}
    />
    <Slider
      label="crest sharpness"
      bind:value={params.wave.steep}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="grouping"
      bind:value={params.wave.groupiness}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="group length"
      bind:value={params.wave.groupLength}
      min={400}
      max={8000}
      step={100}
      fmt={(v) => `${Math.round(v * UNIT_M)} m`}
    />
    <Slider
      label="chop"
      bind:value={params.wave.chopHeight}
      min={0}
      max={10}
      step={0.1}
      fmt={(v) => `${(v * UNIT_M).toFixed(2)} m`}
    />
    <Slider
      label="chop scale"
      bind:value={params.wave.chopLength}
      min={20}
      max={600}
      step={5}
      fmt={(v) => `${Math.round(v * UNIT_M)} m`}
    />
    <Slider
      label="chop drift"
      bind:value={params.wave.chopDrift}
      min={-120}
      max={120}
    />
    <Slider
      label="foam threshold"
      bind:value={params.wave.foamStart}
      min={0}
      max={0.9}
      step={0.01}
    />
    <Slider
      label="foam amount"
      bind:value={params.wave.foamAmount}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="foam patchiness"
      bind:value={params.wave.foamPatchiness}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider label="wave seed" bind:value={params.wave.seed} min={1} max={400} />

    <h3>wave trains</h3>
    {#each params.wave.octaves as oct, i (i)}
      <div class="oct">
        <header>
          <b>#{i + 1}</b>
          <span>{Math.round(oct.length * UNIT_M)} m</span>
          <button
            type="button"
            title="remove this train"
            onclick={() => params.wave.octaves.splice(i, 1)}>×</button
          >
        </header>
        <Slider
          label="length"
          bind:value={oct.length}
          min={30}
          max={3000}
          step={10}
          fmt={(v) => `${Math.round(v * UNIT_M)} m`}
        />
        <Slider
          label="height"
          bind:value={oct.height}
          min={0}
          max={40}
          step={0.1}
          fmt={(v) => `${(v * UNIT_M).toFixed(2)} m`}
        />
        <Slider
          label="speed"
          bind:value={oct.speed}
          min={-2}
          max={2}
          step={0.05}
          fmt={(v) => `${v.toFixed(2)}×`}
        />
      </div>
    {/each}
    <button type="button" onclick={addOctave}>+ add wave train</button>

    <h3>light in the column</h3>
    <Slider
      label="sunlit slabs"
      bind:value={params.column.slabs}
      min={0}
      max={6}
    />
    <Slider
      label="slab depth"
      bind:value={params.column.slabDepth}
      min={40}
      max={900}
      step={10}
      fmt={(v) => `${Math.round(v * UNIT_M)} m`}
    />
    <Slider
      label="slab opacity"
      bind:value={params.column.slabAlpha}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="god-ray spacing"
      bind:value={params.column.shaftSpacing}
      min={120}
      max={1600}
      step={20}
      fmt={(v) => `${Math.round(v * UNIT_M)} m`}
    />
    <Slider
      label="god-ray strength"
      bind:value={params.column.shaftStrength}
      min={0}
      max={2}
      step={0.01}
    />
    <Slider
      label="god-ray wisps"
      bind:value={params.column.shaftWisp}
      min={0}
      max={1}
      step={0.01}
    />
    <Slider
      label="caustics"
      bind:value={params.column.causticStrength}
      min={0}
      max={2}
      step={0.01}
    />

    <h3>draw sections</h3>
    <div class="sections">
      {#each OCEAN_SECTIONS as s (s)}
        <button
          type="button"
          class="chip"
          class:off={hidden.has(s)}
          onclick={() => {
            if (hidden.has(s)) hidden.delete(s);
            else hidden.add(s);
          }}>{s}</button
        >
      {/each}
    </div>

    <h3>company</h3>
    <Toggle label="ships" bind:value={scene.ships} />
    <Toggle label="wild whales" bind:value={scene.pod} />
    <Toggle label="fish schools" bind:value={scene.fish} />
    <Toggle label="marine snow" bind:value={scene.snow} />

    <h3>camera</h3>
    <div class="presets">
      <button type="button" onclick={() => host && look(host, 180, 0.6)}
        >at the waterline</button
      >
      <button type="button" onclick={() => host && look(host, 520, 0.3)}
        >under it</button
      >
      <button type="button" onclick={() => host && look(host, 60, 0.14)}
        >wide</button
      >
    </div>
  {/snippet}

  {#snippet overlay()}
    <div class="hud">
      <canvas bind:this={strip}></canvas>
      <dl>
        <dt>wave height</dt>
        <dd>{stats.height.toFixed(1)} m</dd>
        <dt>period</dt>
        <dd>{stats.period.toFixed(1)} s</dd>
        <dt>phase speed</dt>
        <dd>{stats.speed.toFixed(1)} m/s</dd>
        <dt>breaking</dt>
        <dd>{stats.foam.toFixed(1)}%</dd>
        <dt>peak cusp</dt>
        <dd>{stats.peak.toFixed(2)}</dd>
        <dt>daylight</dt>
        <dd>
          {(stats.light.daylight * 100).toFixed(0)}%
          {stats.light.moon ? "· moon" : "· sun"}
        </dd>
      </dl>
    </div>
  {/snippet}
</SceneDesigner>

<style>
  h3 {
    margin: 16px 0 4px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dim);
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .presets button.on {
    background: var(--accent);
    color: #06131a;
  }
  .sections {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    font-size: 10px;
    padding: 2px 6px;
  }
  .chip.off {
    opacity: 0.35;
    text-decoration: line-through;
  }
  .oct {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 4px 8px 8px;
    margin: 6px 0;
  }
  .oct header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--dim);
    font-size: 11px;
  }
  .oct header b {
    color: var(--ink);
  }
  .oct header button {
    margin-left: auto;
    padding: 0 7px;
  }
  .hud {
    position: fixed;
    right: 14px;
    bottom: 14px;
    width: 320px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px;
    pointer-events: none;
  }
  .hud canvas {
    display: block;
    width: 100%;
    height: 74px;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1px 10px;
    margin: 6px 0 0;
    font-size: 11px;
  }
  dt {
    color: var(--dim);
  }
  dd {
    margin: 0;
    text-align: right;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
</style>
