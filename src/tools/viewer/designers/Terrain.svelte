<script lang="ts">
  import { CELL, NCELL } from "../../../config/constants";
  import { RULES, TILES } from "../../../config/tiles";
  import { buildTerrainLevel } from "../../../world/designerScene";
  import type { SceneHost } from "../../SceneHost";
  import SceneDesigner from "../../lib/SceneDesigner.svelte";
  import Slider from "../../lib/Slider.svelte";
  import Toggle from "../../lib/Toggle.svelte";

  let seed = $state(20260907);
  let trenches = $state(true);
  const weights = $state<Record<string, number>>(
    Object.fromEntries(TILES.map((t) => [t.name, 1])),
  );

  const level = $derived(
    buildTerrainLevel({
      trenches,
      tileWeights: { ...weights },
    }),
  );

  // ── on-canvas tile strip ────────────────────────────────────────────────
  type Cell = { name: string; left: number; width: number };
  let cells = $state<Cell[]>([]);
  let fellBack = $state(false);

  const TILE_COLORS: Record<string, string> = {
    shelf: "#2a6f7d",
    slope: "#37566a",
    plain: "#22384a",
    ridge: "#4a5a3a",
    seamount: "#5a4a6a",
    canyon: "#6a4a3a",
    trench: "#20242e",
  };

  function track(host: SceneHost) {
    const tick = () => {
      if (host.dead) return;
      requestAnimationFrame(tick);
      const ctx = host.context;
      if (!ctx) return;
      const rect = host.view.getBoundingClientRect();
      const cam = ctx.camera;
      const out: Cell[] = [];
      for (let c = 0; c < NCELL; c++) {
        const l = rect.left + cam.sx(c * CELL);
        const w = CELL * cam.scale;
        if (l + w < rect.left || l > rect.right) continue;
        out.push({ name: TILES[ctx.world.tiles[c]].name, left: l, width: w });
      }
      cells = out;
      // wfc() falls back to an all-plain array after 60 failed attempts
      fellBack =
        ctx.world.tiles.length > 4 &&
        ctx.world.tiles.every((t) => TILES[t].name === "plain");
    };
    tick();
  }
</script>

<SceneDesigner
  title="Terrain / WFC"
  {level}
  bind:seed
  loadOpts={{ focus: { x: 4000, y: 1400, scale: 0.03 } }}
  onready={track}
>
  {#snippet controls()}
    <Toggle label="carve trenches" bind:value={trenches} />
    <h3>tile weights</h3>
    {#each TILES as t (t.name)}
      <Slider
        label={t.name}
        bind:value={weights[t.name]}
        min={0}
        max={4}
        step={0.1}
        fmt={(v) => `${v.toFixed(1)}×`}
      />
    {/each}
    <h3>adjacency (config/tiles.ts)</h3>
    <ul class="adj">
      {#each Object.entries(RULES) as [tile, next] (tile)}
        <li><b>{tile}</b> → {next.join(", ")}</li>
      {/each}
    </ul>
  {/snippet}

  {#snippet overlay()}
    <div class="tilestrip">
      {#if fellBack}
        <div class="fellback">WFC failed 60× — fell back to all-plain</div>
      {/if}
      {#each cells as cell (cell.left)}
        <div
          class="cell"
          style:left="{cell.left}px"
          style:width="{cell.width}px"
          style:border-top-color={TILE_COLORS[cell.name] ?? "#456"}
        >
          {#if cell.width > 34}<span>{cell.name}</span>{/if}
        </div>
      {/each}
    </div>
  {/snippet}
</SceneDesigner>

<style>
  .tilestrip {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .cell {
    position: absolute;
    top: 0;
    height: 20px;
    border-top: 3px solid;
    box-sizing: border-box;
    border-left: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 9px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    background: rgba(2, 6, 12, 0.35);
  }
  .cell span {
    padding-left: 3px;
  }
  .fellback {
    position: absolute;
    top: 28px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bad);
    color: #180404;
    padding: 3px 10px;
    border-radius: 6px;
  }
  h3 {
    margin: 14px 0 4px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--dim);
  }
  .adj {
    margin: 0;
    padding-left: 14px;
    color: var(--dim);
    font-size: 11px;
  }
  .adj b {
    color: var(--ink);
  }
</style>
